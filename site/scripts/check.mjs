import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { catalog, chapterSource } from "./build-docs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const root = path.resolve(siteRoot, "..");
const outputRoot = path.join(root, "dist/site");

function fail(message) {
  throw new Error(`Site check failed: ${message}`);
}

function requireFile(file) {
  const absolute = path.join(outputRoot, file);
  if (!fs.existsSync(absolute)) fail(`missing ${file}`);
  return fs.readFileSync(absolute);
}

const homepage = requireFile("index.html");
const chineseAlias = requireFile("Yeli_首页.html");
const englishSample = requireFile("sample.en.yeli.html");
const chineseSample = requireFile("sample.zh-CN.yeli.html");
const release = JSON.parse(requireFile("release.json").toString("utf8"));

if (!requireFile("LICENSE").equals(fs.readFileSync(path.join(root, "LICENSE"))))
  fail("project license differs from the root LICENSE");
if (!homepage.equals(chineseAlias))
  fail("index.html and Yeli_首页.html differ");
if (!homepage.includes('heroLine2: "For you. And AI."')) {
  fail("English slogan is not present");
}
if (!homepage.includes("Markdown 编辑器。"))
  fail("Chinese slogan is not present");
if (!homepage.includes('href="sample.zh-CN.yeli.html"')) {
  fail("homepage does not link the Chinese sample");
}
if (homepage.includes('href="sample.en.yeli.html"')) {
  fail("English sample link must be selected at runtime");
}
if (!englishSample.includes('<html lang="en">'))
  fail("English sample has the wrong language");
if (!chineseSample.includes('<html lang="zh-CN">'))
  fail("Chinese sample has the wrong language");
if (release.format !== "yeli-site" || release.version !== 1)
  fail("unknown release manifest");
if (fs.existsSync(path.join(outputRoot, "CNAME")))
  fail("CNAME must be configured by the selected host");
if (
  !release.samples.includes("sample.en.yeli.html") ||
  !release.samples.includes("sample.zh-CN.yeli.html")
) {
  fail("release manifest does not list both samples");
}

const sourceFiles = {
  "sample.en.yeli.html": englishSample,
  "sample.zh-CN.yeli.html": chineseSample,
};
for (const [file, output] of Object.entries(sourceFiles)) {
  const template = path.join(
    root,
    "dist/html",
    file.replace("sample.", "starter."),
  );
  if (!fs.readFileSync(template).equals(output))
    fail(`${file} does not match the current ${path.basename(template)} build`);
}

for (const file of [
  "index.html",
  "Yeli_首页.html",
  "sample.en.yeli.html",
  "sample.zh-CN.yeli.html",
  "404.html",
  ".nojekyll",
  "release.json",
]) {
  requireFile(file);
}

const docs = JSON.parse(requireFile("docs/manifest.json").toString("utf8"));
const hash = (data) => createHash("sha256").update(data).digest("hex");
if (docs.chapters.length !== catalog.chapters.length * catalog.locales.length)
  fail("incomplete bilingual curriculum");
for (const chapter of docs.chapters) {
  const source = catalog.chapters.find((c) => c.id === chapter.id);
  if (
    !source ||
    hash(chapterSource(source, chapter.locale)) !== chapter.sourceHash
  )
    fail(`stale tutorial source: ${chapter.id} ${chapter.locale}`);
  requireFile(`docs/${chapter.locale}/${chapter.id}.html`);
}
for (const book of docs.handbooks) {
  const artifact = requireFile(`docs/downloads/${book.file}`);
  if (artifact.length !== book.bytes || hash(artifact) !== book.sha256)
    fail(`handbook bytes changed: ${book.file}`);
  if (hash(requireFile(`docs/downloads/${book.markdown}`)) !== book.sourceHash)
    fail(`handbook Markdown changed: ${book.markdown}`);
}
if (docs.handbooks.length !== 4) fail("incomplete offline handbooks");
requireFile("docs/index.html");
for (const locale of catalog.locales) requireFile(`docs/${locale}/index.html`);

console.log(
  `Checked ${homepage.length.toLocaleString()} byte homepage, bilingual samples, ${docs.chapters.length} tutorial pages, four handbooks and release manifest.`,
);
