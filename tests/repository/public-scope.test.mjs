import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  checkPublicScope,
  publicPathProblem,
} from "../../scripts/check-public-scope.mjs";

test("admits essential public sources, documentation and synthetic fixtures", () => {
  for (const file of [
    "LICENSE",
    "src/ui/workspace.tsx",
    "packages/cli/README.md",
    "skills/yeli/SKILL.md",
    "site/docs/content/yeli/save.en.md",
    "docs/format.md",
    "docs/README.zh-CN.md",
    "src/brand/yeli-logo.json",
    "tests/fixtures/legacy.aimd.html",
  ]) {
    assert.equal(publicPathProblem(file), null, file);
  }
});

test("rejects third-party, private and generated trees at any depth", () => {
  for (const file of [
    "reference/vendor/source.js",
    "src/reference/copied.js",
    ".local-archive/session-log.md",
    "output/open-source/yeli/README.md",
    "dist/html/starter.en.yeli.html",
    "dist-empty/empty.yeli.html",
    "playwright-report/index.html",
    "test-results/saved.yeli.html",
    "node_modules/react/index.js",
    "docs/research/notes.md",
    "docs/ideation/private.html",
    "docs/notes.md",
    "docs/design/unreviewed.svg",
    "docs/design/yeli-interface-direction.md",
    "docs/design/assets/yeli-mark-source-proof-2026-10-11.svg",
    "docs/plans/implementation.md",
    "intent/yeli-editor.md",
    "spec/yeli-editor.md",
    "spec/advanced-mode-plugin.md",
    ".codex/config.toml",
  ]) {
    assert.ok(publicPathProblem(file), file);
  }
});

test("detects force-added internal contracts without changing the real index", () => {
  const root = mkdtempSync(path.join(tmpdir(), "yeli-private-contracts-"));
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git(["init", "--quiet"]);
    writeFileSync(
      path.join(root, ".gitignore"),
      "/intent/\n/spec/\n/docs/plans/\n/docs/design/\n",
    );
    writeFileSync(path.join(root, "README.md"), "# Synthetic project\n");
    const contracts = [
      "intent/yeli-editor.md",
      "spec/yeli-editor.md",
      "docs/plans/implementation.md",
      "docs/design/yeli-interface-direction.md",
    ];
    for (const file of contracts) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), "# Synthetic private contract\n");
    }
    assert.deepEqual(checkPublicScope(root).findings, []);
    git(["add", "--force", ...contracts]);
    assert.deepEqual(
      checkPublicScope(root).findings,
      [...contracts].sort().map((file) => ({
        file,
        reason: "internal product contract, plan or design evidence",
      })),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects local records, archives, signing material and unexpected roots", () => {
  for (const file of [
    ".env",
    "src/.env.local",
    "src/release.pem",
    "site/assets/sample.en.yeli.html",
    "site/assets/.DS_Store",
    "session-log.md",
    "design-qa.md",
    "issues.yeli.html",
    "yeli.tgz",
    "notes.md",
    "../outside.md",
    "/absolute.md",
  ]) {
    assert.ok(publicPathProblem(file), file);
  }
});

test("detects a force-added ignored reference file without changing the real index", () => {
  const root = mkdtempSync(path.join(tmpdir(), "yeli-public-scope-"));
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git(["init", "--quiet"]);
    writeFileSync(path.join(root, ".gitignore"), "reference/\n");
    writeFileSync(path.join(root, "README.md"), "# Synthetic project\n");
    mkdirSync(path.join(root, "reference"));
    writeFileSync(path.join(root, "reference/vendor.js"), "// Synthetic\n");
    assert.deepEqual(checkPublicScope(root).findings, []);
    git(["add", "--force", "reference/vendor.js"]);
    assert.deepEqual(checkPublicScope(root).findings, [
      {
        file: "reference/vendor.js",
        reason: "private, third-party or generated directory",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
