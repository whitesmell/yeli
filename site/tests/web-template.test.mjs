import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validateWebTemplate } from "../../src/host/web-template.ts";
import { parseYeliArtifact } from "../../src/format/parse.ts";
import { validateArtifactContentPolicy } from "../../src/integrity/content-policy.ts";
import { projectShell } from "../../src/integrity/shell-projection.ts";

const output = path.resolve("dist/site");

test("site publishes the current empty release and embeds its exact bytes and metadata locally", async () => {
  const release = JSON.parse(
    await readFile(path.join(output, "release.json"), "utf8"),
  );
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const descriptor = release.editor.template;
  assert.equal(descriptor.path, "editor/yeli-template.yeli.html");
  assert.equal(descriptor.version, pkg.version);
  assert.equal(descriptor.profile, "empty");
  const bytes = await readFile(path.join(output, descriptor.path));
  assert.deepEqual(bytes, await readFile("dist/empty/empty.yeli.html"));
  assert.equal(descriptor.bytes, bytes.length);
  assert.equal(
    descriptor.hash,
    createHash("sha256").update(bytes).digest("hex"),
  );
  const artifact = bytes.toString("utf8");
  assert.equal(projectShell(artifact).hash, descriptor.shellHash);
  assert.equal(
    (await validateWebTemplate(artifact, descriptor, pkg.version)).available,
    true,
  );
  const parsed = await parseYeliArtifact(artifact);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.markdown, "");
  assert.ok(Array.isArray(parsed.payload.assets));
  assert.equal(parsed.payload.assets.length, 0);
  assert.equal(
    Object.prototype.toString.call(parsed.payload.settings),
    "[object Object]",
  );
  assert.equal(Object.keys(parsed.payload.settings).length, 0);
  assert.equal(validateArtifactContentPolicy(artifact).ok, true);
  const editor = await readFile(path.join(output, "editor/index.html"), "utf8");
  assert.match(editor, /connect-src 'none'/u);
  const entry = /<script[^>]+src="([^"]+)"/u.exec(editor)?.[1];
  assert.ok(entry);
  assert.doesNotMatch(entry, /^(?:https?:|\/\/)/iu);
  const bundle = await readFile(path.resolve(output, "editor", entry), "utf8");
  assert.ok(bundle.includes(bytes.toString("base64")));
  assert.ok(bundle.includes(descriptor.hash));
  assert.ok(bundle.includes(descriptor.shellHash));
  assert.doesNotMatch(editor, /(?:src|href)="(?:https?:|\/\/)/iu);
  assert.doesNotMatch(
    artifact,
    /<(?:script|link|img|source)[^>]+(?:src|href)=["'](?:https?:|\/\/)/iu,
  );
});
