import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const root = path.resolve(siteRoot, "..");
const outputRoot = path.join(root, "dist/site");
const packageRoot = path.join(root, "dist/releases");

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const release = JSON.parse(
  fs.readFileSync(path.join(outputRoot, "release.json"), "utf8"),
);
const stamp = release.generatedAt.replaceAll(/[-:.]/g, "").slice(0, 14);
const archiveName = `yeli-homepage-v${packageJson.version}-${stamp}.tar.gz`;
const archivePath = path.join(packageRoot, archiveName);
const checksumPath = `${archivePath}.sha256`;

fs.mkdirSync(packageRoot, { recursive: true });
run(["tar", "-C", outputRoot, "-czf", archivePath, "."]);

const digest = crypto
  .createHash("sha256")
  .update(fs.readFileSync(archivePath))
  .digest("hex");
fs.writeFileSync(checksumPath, `${digest}  ${archiveName}\n`);

console.log(archivePath);
console.log(checksumPath);

function run(args) {
  const result = spawnSync(args[0], args.slice(1), { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${args[0]} failed`);
  }
}
