import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { finalizeReleaseArtifact } from "../../src/format/finalize-artifact.ts";
import { inspectCompressedArtifact } from "../../src/format/compress-artifact.ts";

describe("compression release validation", () => {
  it("validates both starter carriers while reporting the deferred size goal", () => {
    for (const locale of ["zh-CN", "en"]) {
      const result = spawnSync(
        process.execPath,
        [resolve("scripts/validate-single.ts"), "--locale", locale],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(result.stdout) as {
        rawBytes: number;
        sizeTarget: Record<string, unknown>;
        compression: {
          runtime: { sourceBytes: number; packedBytes: number };
          style: { sourceBytes: number };
        };
      };
      expect(report.sizeTarget).toEqual({
        bytes: 100_000,
        enforced: false,
        status: "deferred-by-owner",
        met: report.rawBytes <= 100_000,
      });
      expect(report.compression.runtime.sourceBytes).toBeGreaterThan(0);
      expect(report.compression.runtime.packedBytes).toBeLessThan(
        report.compression.runtime.sourceBytes,
      );
      expect(report.compression.style.sourceBytes).toBeGreaterThan(0);
    }
  });

  it("can explicitly check the historical target without disabling other checks", () => {
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/validate-single.ts"), "--enforce-size-target"],
      { encoding: "utf8" },
    );
    const exceedsTarget =
      statSync(resolve("dist/html/starter.zh-CN.yeli.html")).size > 100_000;
    expect(result.status).toBe(exceedsTarget ? 1 : 0);
    if (exceedsTarget)
      expect(result.stderr).toContain("100,000-byte raw limit");
  });

  it("finalizes standalone compression and validates a byte-identical second pass", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "yeli-compress-"));
    try {
      const original = readFileSync(
        resolve("dist/html/starter.zh-CN.yeli.html"),
        "utf8",
      );
      const input = resolve(directory, "input.html");
      const output = resolve(directory, "output.yeli.html");
      const repeated = resolve(directory, "repeated.yeli.html");
      const sources = inspectCompressedArtifact(original)!;
      const plain = original
        .replace(
          /<script id="yeli-runtime-css"[^>]*>[^<]*<\/script>/u,
          () => `<style rel="stylesheet">${sources.style.source}</style>`,
        )
        .replace(
          /<script id="yeli-runtime"[^>]*>[^<]*<\/script>/u,
          () => `<script type="module">${sources.runtime.source}</script>`,
        )
        .replace(
          /<script\b[^>]*data-yeli-runtime="deflate-b86"[^>]*>[\s\S]*?<\/script>/u,
          "",
        );
      writeFileSync(input, `${plain}\n`, "utf8");
      for (const [from, to] of [
        [input, output],
        [output, repeated],
      ]) {
        const result = spawnSync(
          process.execPath,
          [resolve("scripts/compress-single.mjs"), from!, to!],
          {
            encoding: "utf8",
            env: { ...process.env, ZOPFLI_ITERS: "1" },
          },
        );
        expect(result.status, result.stderr).toBe(0);
        const receipt = JSON.parse(result.stdout) as {
          runtimeCompressedBytes: number;
        };
        expect(receipt.runtimeCompressedBytes).toBeGreaterThan(0);
      }
      const packed = readFileSync(output, "utf8");
      expect(packed).toMatch(/<\/script><\/body><\/html>$/u);
      expect(finalizeReleaseArtifact(packed)).toBe(packed);
      expect(inspectCompressedArtifact(packed)).toMatchObject({
        runtime: { source: sources.runtime.source },
        style: { source: sources.style.source },
      });
      expect(readFileSync(repeated, "utf8")).toBe(packed);
      const second = spawnSync(
        process.execPath,
        [resolve("scripts/compress-single.mjs"), output, repeated],
        {
          encoding: "utf8",
          env: { ...process.env, ZOPFLI_ITERS: "1" },
        },
      );
      expect(second.status, second.stderr).toBe(0);
      const secondReceipt = JSON.parse(second.stdout) as {
        runtimeCompressedBytes: number;
      };
      expect(secondReceipt.runtimeCompressedBytes).toBeGreaterThan(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
