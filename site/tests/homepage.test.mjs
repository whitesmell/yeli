import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.join(here, "..");
const outputRoot = path.join(siteRoot, "..", "dist", "site");

test("homepage source contains both localized slogans", async () => {
  const [template, app] = await Promise.all([
    readFile(path.join(siteRoot, "index.template.html"), "utf8"),
    readFile(path.join(siteRoot, "app.js"), "utf8"),
  ]);
  assert.match(template, /人和 AI，都好用的/);
  assert.match(app, /For you\. And AI\./);
  assert.match(app, /A Markdown editor for you and AI/);
});

test("generated publication contains the public entry points", async () => {
  const [homepage, release, noJekyll] = await Promise.all([
    readFile(path.join(outputRoot, "index.html"), "utf8"),
    readFile(path.join(outputRoot, "release.json"), "utf8"),
    readFile(path.join(outputRoot, ".nojekyll"), "utf8"),
  ]);
  assert.match(homepage, /href="sample\.zh-CN\.yeli\.html"/);
  assert.match(homepage, /For you\. And AI\./);
  assert.match(release, /"format": "yeli-site"/);
  assert.equal(noJekyll, "");
  const license = await readFile(path.join(siteRoot, "..", "LICENSE"), "utf8");
  assert.equal(
    await readFile(path.join(outputRoot, "LICENSE"), "utf8"),
    license,
  );
  assert.ok(homepage.includes("MIT License"));
  assert.ok(homepage.includes("Copyright (c) 2026 Yeli contributors"));
  assert.ok(
    (await readFile(path.join(outputRoot, "404.html"), "utf8")).includes(
      "For you. And AI.",
    ),
  );
});
