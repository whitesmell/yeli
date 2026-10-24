#!/usr/bin/env node
/* global document, Document, MutationObserver, window */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";

const args = process.argv.slice(2);
const artifactPath = resolve(args[0] ?? "dist/html/starter.zh-CN.yeli.html");
const runs = Number(args[1] ?? "5");
const browserNames = (args[2] ?? "chromium,firefox")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const browserTypes = { chromium, firefox, webkit };

if (!Number.isSafeInteger(runs) || runs < 1 || runs > 30) {
  throw new Error("runs must be an integer from 1 to 30");
}
for (const name of browserNames) {
  if (!(name in browserTypes)) {
    throw new Error(`unsupported browser: ${name}`);
  }
}

const artifactBytes = readFileSync(artifactPath);
const artifactUrl = pathToFileURL(artifactPath).href;
const outputPath = args[3] ? resolve(args[3]) : null;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function measure(name) {
  const browser = await browserTypes[name].launch({
    headless: true,
    timeout: 15_000,
  });
  const context = await browser.newContext();
  if (name === "webkit") {
    await context.route(/^https?:/u, (route) => route.abort());
  } else {
    await context.setOffline(true);
  }
  await context.addInitScript(() => {
    const measurement = { inflations: [], interactiveAt: null };
    const streamInflations = new WeakMap();
    const responseInflations = new WeakMap();
    Object.assign(window, { __yeliCompressionMeasurement: measurement });
    let carrierReadAt;
    let carrierId;
    const getElementById = Document.prototype.getElementById;
    Document.prototype.getElementById = function (id) {
      if (id === "yeli-runtime" || id === "yeli-runtime-css") {
        carrierReadAt = performance.now();
        carrierId = id;
      }
      return getElementById.call(this, id);
    };
    const NativeDecompressionStream = window.DecompressionStream;
    if (NativeDecompressionStream) {
      window.DecompressionStream = class extends NativeDecompressionStream {
        constructor(format) {
          const startedAt = performance.now();
          super(format);
          const entry = {
            carrierId,
            decodeMs:
              carrierReadAt === undefined ? null : startedAt - carrierReadAt,
            startedAt,
          };
          measurement.inflations.push(entry);
          streamInflations.set(this.readable, entry);
        }
      };
    }
    const NativeResponse = window.Response;
    window.Response = class extends NativeResponse {
      constructor(body, init) {
        super(body, init);
        const entry = streamInflations.get(body);
        if (entry) responseInflations.set(this, entry);
      }
    };
    const arrayBuffer = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function () {
      const inflation = responseInflations.get(this);
      const result = await arrayBuffer.call(this);
      if (inflation && inflation.finishedAt === undefined) {
        inflation.finishedAt = performance.now();
      }
      return result;
    };
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      if (blob.type === "text/javascript") {
        measurement.moduleCreatedAt = performance.now();
      }
      return createObjectURL.call(this, blob);
    };
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".workspace-shell")) return;
      measurement.interactiveAt = performance.now();
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  const samples = [];
  try {
    for (let run = 0; run < runs; run += 1) {
      const page = await context.newPage();
      const remoteRequests = [];
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (/^https?:/u.test(request.url())) remoteRequests.push(request.url());
      });
      const startedAt = performance.now();
      await page.goto(artifactUrl, { waitUntil: "load" });
      const shellLoadedAt = performance.now();
      await page.getByRole("button", { name: /^(编辑|Edit)$/u }).waitFor({
        state: "visible",
      });
      const interactiveAt = performance.now();
      const diagnostics = await page.evaluate(() => {
        const measurement = window.__yeliCompressionMeasurement;
        const navigation = performance.getEntriesByType("navigation")[0];
        return {
          inflations: measurement.inflations.map((entry) => ({
            carrierId: entry.carrierId,
            decodeMs: entry.decodeMs,
            decompressMs: entry.finishedAt - entry.startedAt,
          })),
          base86DecodeMs: measurement.inflations.map((entry) => entry.decodeMs),
          cssSheets: document.styleSheets.length,
          decompressMs: measurement.inflations.map(
            (entry) => entry.finishedAt - entry.startedAt,
          ),
          domContentLoaded: navigation?.domContentLoadedEventEnd ?? null,
          loadEvent: navigation?.loadEventEnd ?? null,
          moduleAndMountMs:
            measurement.moduleCreatedAt === undefined
              ? null
              : measurement.interactiveAt - measurement.moduleCreatedAt,
          readyMs: measurement.interactiveAt,
          bootstrapMs: measurement.moduleCreatedAt ?? null,
          supportsDeflateRaw:
            typeof DecompressionStream === "function" &&
            (() => {
              try {
                new DecompressionStream("deflate-raw");
                return true;
              } catch {
                return false;
              }
            })(),
        };
      });
      samples.push({
        inflations: diagnostics.inflations,
        bootstrapMs: diagnostics.bootstrapMs,
        base86DecodeMs: diagnostics.base86DecodeMs,
        cssSheets: diagnostics.cssSheets,
        decompressMs: diagnostics.decompressMs,
        domContentLoadedMs: diagnostics.domContentLoaded,
        loadEventMs: diagnostics.loadEvent,
        moduleAndMountMs: diagnostics.moduleAndMountMs,
        pageErrors: errors,
        readyMs: diagnostics.readyMs,
        remoteRequests: remoteRequests.length,
        shellLoadMs: shellLoadedAt - startedAt,
        supportsDeflateRaw: diagnostics.supportsDeflateRaw,
        timeToInteractiveMs: interactiveAt - startedAt,
      });
      if (
        errors.length ||
        remoteRequests.length ||
        diagnostics.cssSheets !== 1
      ) {
        throw new Error(
          `Artifact startup regression: ${JSON.stringify(samples.at(-1))}`,
        );
      }
      await page.close();
    }
    return {
      browser: name,
      browserVersion: browser.version(),
      interactiveMedianMs: median(samples.map((sample) => sample.readyMs)),
      firstReadyMs: samples[0].readyMs,
      warmReadyMedianMs:
        runs > 1
          ? median(samples.slice(1).map((sample) => sample.readyMs))
          : null,
      loadMedianMs: median(samples.map((sample) => sample.shellLoadMs)),
      remoteRequests: samples.reduce(
        (total, sample) => total + sample.remoteRequests,
        0,
      ),
      runs: samples,
    };
  } finally {
    await browser.close();
  }
}

const report = {
  artifact: artifactPath,
  artifactBytes: artifactBytes.length,
  artifactSha256: createHash("sha256").update(artifactBytes).digest("hex"),
  measuredAt: new Date().toISOString(),
  environment: `${platform()} ${release()} ${arch()}, Node ${process.version}`,
  method:
    "Fresh page per sample in one offline context; instrumented native decompression; ready = workspace mounted. Includes first run; no hard latency gate.",
  browsers: [],
};
for (const name of browserNames) {
  try {
    report.browsers.push(await measure(name));
  } catch (error) {
    report.browsers.push({ browser: name, error: String(error) });
    process.exitCode = 1;
  }
}
const json = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) writeFileSync(outputPath, json, "utf8");
process.stdout.write(json);
