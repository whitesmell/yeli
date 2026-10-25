import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

test(
  "one setup prepares tools that create, edit and validate files from another directory",
  { timeout: 180_000 },
  () => {
    assert.ok(process.env.npm_execpath, "Run with npm run test:agent-setup");
    const prepared = spawnSync(
      process.execPath,
      [process.env.npm_execpath, "run", "--silent", "setup:agent"],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    assert.ifError(prepared.error);
    assert.equal(prepared.status, 0, prepared.stderr);
    const receipt = JSON.parse(prepared.stdout);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.apiVersion, 1);
    assert.deepEqual(
      JSON.parse(readFileSync(receipt.receipt, "utf8")),
      receipt,
    );
    for (const value of [
      receipt.paths.node,
      receipt.paths.cli,
      receipt.paths.skill,
      receipt.paths.guide,
      receipt.paths.quickstart,
      ...Object.values(receipt.paths.templates),
    ]) {
      assert.ok(path.isAbsolute(value));
      assert.ok(existsSync(value), value);
    }
    assert.equal(
      readFileSync(receipt.paths.skill, "utf8"),
      readFileSync(path.join(root, "skills/yeli/SKILL.md"), "utf8"),
    );

    const directory = mkdtempSync(path.join(tmpdir(), "yeli first task "));
    const guard = path.join(directory, "no-network.mjs");
    writeFileSync(
      guard,
      `import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
const deny = () => { throw new Error("NETWORK_FORBIDDEN"); };
net.connect = net.createConnection = tls.connect = deny;
net.Socket.prototype.connect = deny;
globalThis.fetch = deny;
syncBuiltinESMExports();
`,
    );
    const invoke = (args, status = 0) => {
      const result = spawnSync(
        receipt.paths.node,
        ["--import", guard, receipt.paths.cli, ...args],
        {
          cwd: directory,
          env: { ...process.env, PATH: "" },
          encoding: "utf8",
          timeout: 30_000,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, status, result.stderr || result.stdout);
      return result;
    };
    const json = (args) => JSON.parse(invoke(args).stdout);
    try {
      for (const locale of ["en", "zh-CN"]) {
        const source =
          '---\ntitle: "Notes" # retain\ncustom: keep\n---\n# Notes\n\nFirst draft.\n';
        const markdown = path.join(directory, `notes.${locale}.md`);
        const artifact = path.join(directory, `notes.${locale}.yeli.html`);
        const edited = path.join(directory, `reviewed.${locale}.yeli.html`);
        const insertion = path.join(directory, "insertion.md");
        writeFileSync(markdown, source);
        writeFileSync(insertion, "Reviewed draft.\n");
        json([
          "import",
          markdown,
          "--template",
          receipt.paths.templates[locale],
          "--output",
          artifact,
        ]);
        assert.equal(json(["validate", artifact]).ok, true);
        assert.equal(invoke(["extract", artifact]).stdout, source);
        const before = readFileSync(artifact);
        const pre = json(["pre-read", artifact]);
        const edit = json([
          "patch",
          artifact,
          "--start-line",
          "7",
          "--delete-count",
          "1",
          "--insert-file",
          insertion,
          "--expected-hash",
          pre.sourceHash,
          "--output",
          edited,
        ]);
        assert.equal(edit.shell.stable, true);
        assert.equal(edit.shell.markerCount, 1);
        assert.equal(edit.shell.prefixBefore, edit.shell.prefixAfter);
        assert.equal(edit.shell.suffixBefore, edit.shell.suffixAfter);
        assert.equal(json(["validate", edited]).ok, true);
        assert.equal(
          invoke(["extract", edited]).stdout,
          source.replace("First draft.", "Reviewed draft."),
        );
        assert.deepEqual(readFileSync(artifact), before);
        const duplicate = invoke(
          [
            "import",
            markdown,
            "--template",
            receipt.paths.templates[locale],
            "--output",
            artifact,
          ],
          1,
        );
        assert.equal(JSON.parse(duplicate.stderr).error.code, "OUTPUT_EXISTS");
        assert.deepEqual(readFileSync(artifact), before);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
