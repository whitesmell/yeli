import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const root = resolve(import.meta.dirname, "../..");
const npm = process.env.npm_execpath;
const metadata = JSON.parse(
  readFileSync(join(root, "packages/cli/package.json"), "utf8"),
);
const directory = mkdtempSync(join(tmpdir(), "yeli-installed-cli-"));
const prefix = join(directory, "tools");
const installed = join(prefix, "node_modules/yeli");
const executable = join(installed, "bin/yeli.js");
const guard = join(directory, "no-network.mjs");
let packed;

function invokeNpm(args, cwd) {
  assert.ok(npm, "Run this suite with npm run test:cli");
  const result = spawnSync(process.execPath, [npm, ...args], {
    cwd,
    env: {
      ...process.env,
      npm_config_cache: join(directory, "npm-cache"),
    },
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function extractPackage(tarball, target) {
  mkdirSync(target, { recursive: true });
  const result = spawnSync(
    "tar",
    ["-xzf", tarball, "-C", target, "--strip-components=1"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
}

function run(args) {
  const env = { ...process.env };
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  const result = spawnSync(
    process.execPath,
    ["--import", guard, executable, ...args],
    {
      cwd: directory,
      env,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.ifError(result.error);
  return result;
}

function json(args) {
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function error(args, code) {
  const result = run(args);
  assert.equal(result.status, 1, result.stdout || result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).error.code, code);
}

before(() => {
  const records = JSON.parse(
    invokeNpm(
      ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
      join(root, "dist/cli"),
    ),
  );
  [packed] = records;
  mkdirSync(join(prefix, "node_modules"), { recursive: true });
  extractPackage(
    join(directory, packed.filename),
    join(prefix, "node_modules/yeli"),
  );
  mkdirSync(join(prefix, "node_modules/.bin"), { recursive: true });
  symlinkSync("../yeli/bin/yeli.js", join(prefix, "node_modules/.bin/yeli"));
  for (const dependency of Object.keys(metadata.dependencies)) {
    symlinkSync(
      join(root, "node_modules", dependency),
      join(prefix, "node_modules", dependency),
      "dir",
    );
  }
  // Installed commands must work while outgoing Node network entry points fail.
  writeFileSync(
    guard,
    `import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
const deny = () => { throw new Error("NETWORK_FORBIDDEN"); };
http.request = http.get = https.request = https.get = deny;
net.connect = net.createConnection = tls.connect = deny;
net.Socket.prototype.connect = deny;
globalThis.fetch = deny;
globalThis.WebSocket = class { constructor() { deny(); } };
syncBuiltinESMExports();
`,
  );
});

after(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("independently installed CLI tarball", () => {
  it("ships only CLI runtime, docs and a portable skill, with no frontend toolchain", () => {
    for (const file of packed.files) {
      assert.match(
        file.path,
        /^(?:package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md|bin\/yeli\.js|lib\/(?:src|scripts)\/.*\.js|docs\/.*\.md|skills\/yeli\/SKILL\.md)$/,
      );
    }
    const installedMetadata = JSON.parse(
      readFileSync(join(installed, "package.json"), "utf8"),
    );
    assert.equal(installedMetadata.license, "MIT");
    assert.equal(installedMetadata.private, true);
    assert.equal(
      readFileSync(join(installed, "LICENSE"), "utf8"),
      readFileSync(join(root, "LICENSE"), "utf8"),
    );
    for (const name of ["react", "vite", "typescript", "@playwright/test"]) {
      assert.equal(existsSync(join(prefix, "node_modules", name)), false);
    }
    assert.equal(
      readFileSync(executable, "utf8").startsWith("#!/usr/bin/env node"),
      true,
    );
    assert.equal(run(["--version"]).stdout, `${metadata.version}\n`);

    const help = json(["--help"]);
    assert.equal(help.apiVersion, 1);
    assert.equal(help.cliVersion, metadata.version);
    for (const path of Object.values(help.paths)) {
      assert.ok(path.startsWith(`${realpathSync(installed)}/`));
      assert.ok(existsSync(path));
    }
    assert.equal(
      readFileSync(help.paths.guide, "utf8"),
      readFileSync(join(root, "docs/agents.md"), "utf8"),
    );
    assert.equal(
      readFileSync(help.paths.skill, "utf8"),
      readFileSync(join(root, "skills/yeli/SKILL.md"), "utf8"),
    );
    assert.ok(existsSync(join(dirname(executable), "../../.bin/yeli")));
  });

  it("imports the exact built shell, patches narrowly, rejects stale writes and exports offline", () => {
    const artifact = join(directory, "notes.yeli.html");
    const markdown = join(directory, "notes.md");
    const insertion = join(directory, "insertion.md");
    const source = [
      "---",
      'title: "CLI notes" # preserve this',
      "custom: keep-me",
      "---",
      "# Notes",
      "",
      "First draft.",
      "",
      "```html",
      "</script><script>throw new Error('document-code-ran')</script>",
      "```",
      "",
    ].join("\n");
    writeFileSync(markdown, source.replace(/\n/g, "\r\n"));
    writeFileSync(insertion, "Reviewed draft.\n");
    const template = join(root, "dist/html/starter.zh-CN.yeli.html");
    const templateBytes = readFileSync(template);
    const imported = json([
      "import",
      markdown,
      "--template",
      template,
      "--output",
      artifact,
    ]);
    assert.equal(imported.receipt.lineEndingsNormalized, true);
    assert.equal(imported.document.revision, 1);
    assert.deepEqual(readFileSync(template), templateBytes);
    assert.equal(readFileSync(markdown, "utf8"), source.replace(/\n/g, "\r\n"));
    assert.equal(run(["extract", artifact]).stdout, source);
    const initial = json(["pre-read", artifact]);
    assert.equal(initial.apiVersion, 1);
    assert.equal(initial.shell.markerCount, 1);
    assert.equal(initial.markdown, undefined);
    assert.equal(initial.payload, undefined);

    const patched = json([
      "patch",
      artifact,
      "--start-line",
      "7",
      "--delete-count",
      "1",
      "--insert-file",
      insertion,
      "--expected-hash",
      initial.sourceHash,
      "--updated-by",
      "agent/installed-cli",
      "--change-summary",
      "Review draft",
    ]);
    assert.equal(patched.revision, 2);
    assert.equal(patched.shell.markerCount, 1);
    assert.equal(patched.shell.stable, true);
    assert.equal(patched.shell.prefixBefore, patched.shell.prefixAfter);
    assert.equal(patched.shell.suffixBefore, patched.shell.suffixAfter);
    assert.deepEqual(patched.changedLines, {
      startLine: 7,
      deleteCount: 1,
      insertedCount: 1,
    });
    const revised = source.replace("First draft.", "Reviewed draft.");
    assert.equal(run(["extract", artifact]).stdout, revised);
    assert.equal(json(["validate", artifact]).ok, true);
    assert.equal(json(["pre-read", artifact]).freshness.staticPreview, "stale");

    const bytes = readFileSync(artifact);
    error(
      [
        "patch",
        artifact,
        "--start-line",
        "7",
        "--delete-count",
        "1",
        "--insert-file",
        insertion,
        "--expected-hash",
        initial.sourceHash,
      ],
      "SOURCE_HASH_MISMATCH",
    );
    assert.deepEqual(readFileSync(artifact), bytes);
    error(["replace", artifact, markdown], "EXPECTATION_REQUIRED");
    assert.deepEqual(readFileSync(artifact), bytes);

    const exported = join(directory, "exported.md");
    json(["export-markdown", artifact, "--output", exported]);
    assert.equal(readFileSync(exported, "utf8"), revised);
    error(["export-markdown", artifact, "--output", exported], "OUTPUT_EXISTS");
    assert.equal(readFileSync(exported, "utf8"), revised);
    const rendered = json(["render", artifact]);
    assert.ok(rendered.html.includes("Reviewed draft."));
    assert.equal(/<script\b/i.test(rendered.html), false);
    const publication = join(directory, "publication.html");
    json(["export-static", artifact, "--output", publication]);
    const html = readFileSync(publication, "utf8");
    assert.equal(/<script\b/i.test(html), false);
    assert.ok(html.includes("default-src 'none'"));
    assert.ok(html.includes("Reviewed draft."));
  });

  it("supports inspect, metadata, refresh and replacement copies through the installed helper", () => {
    const artifact = join(directory, "metadata.yeli.html");
    const markdown = join(directory, "metadata.md");
    const copied = join(directory, "replaced-copy.yeli.html");
    const extracted = join(directory, "extracted-copy.md");
    const source =
      '---\ntitle: "Before" # keep\ncustom: keep-me\n---\n# Notes\n';
    writeFileSync(markdown, source);
    json([
      "import",
      markdown,
      "--template",
      join(root, "dist/html/starter.zh-CN.yeli.html"),
      "--output",
      artifact,
    ]);
    const inspected = json(["inspect", artifact]);
    assert.equal(inspected.markdown, source);
    assert.equal(json(["get", artifact]).sourceHash, inspected.sourceHash);
    const changed = json([
      "metadata",
      artifact,
      "--key",
      "title",
      "--value-json",
      '"After"',
      "--expected-revision",
      "1",
    ]);
    const updated = run(["extract", artifact]).stdout;
    assert.ok(updated.includes('title: "After" # keep'));
    assert.ok(updated.includes("custom: keep-me"));
    const refreshed = json([
      "refresh",
      artifact,
      "--expected-hash",
      changed.sourceHash,
    ]);
    assert.equal(refreshed.revision, changed.revision);
    assert.equal(refreshed.sourceHash, changed.sourceHash);
    const original = readFileSync(artifact);
    const replacement = "# A new copy\n";
    writeFileSync(markdown, replacement);
    const replaced = json([
      "replace",
      artifact,
      markdown,
      "--expected-hash",
      changed.sourceHash,
      "--output",
      copied,
    ]);
    assert.equal(replaced.shell.stable, true);
    assert.deepEqual(readFileSync(artifact), original);
    const result = run(["extract", copied, extracted]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(readFileSync(extracted, "utf8"), replacement);
    error(["migrate-shell", artifact], "HUMAN_CONFIRMATION_REQUIRED");
    assert.deepEqual(readFileSync(artifact), original);
  });

  it("preserves malformed and legacy inputs, and rejects unsupported API versions", () => {
    const malformed = join(directory, "malformed.yeli.html");
    const legacy = join(directory, "legacy.aimd.html");
    writeFileSync(malformed, "not an artifact");
    writeFileSync(
      legacy,
      '<!doctype html><script id="aimd-doc" type="application/aimd+json">{}</script>',
    );
    for (const path of [malformed, legacy]) {
      const original = readFileSync(path);
      error(["pre-read", path], "ARTIFACT_INVALID");
      assert.deepEqual(readFileSync(path), original);
    }
    error(
      ["pre-read", malformed, "--api-version", "2"],
      "API_VERSION_UNSUPPORTED",
    );
    const missing = run(["verify-shell", malformed]);
    assert.equal(missing.status, 1);
    assert.equal(JSON.parse(missing.stdout).status, "manifest-unavailable");
  });
});
