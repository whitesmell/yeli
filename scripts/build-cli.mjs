import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = resolve(root, "dist/cli");
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const project = readJson("package.json");
const cli = readJson("packages/cli/package.json");

if (
  cli.version !== project.version ||
  cli.engines.node !== project.engines.node ||
  cli.private !== project.private ||
  cli.license !== project.license
) {
  throw new Error(
    "CLI version, Node range, private flag and license must match the project",
  );
}
for (const [name, version] of Object.entries(cli.dependencies)) {
  if (
    version !== (project.dependencies[name] ?? project.devDependencies[name])
  ) {
    throw new Error(`CLI dependency ${name} must match the project pin`);
  }
}

rmSync(destination, { recursive: true, force: true });
const compiled = spawnSync(
  process.execPath,
  [resolve(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.cli.json"],
  { cwd: root, stdio: "inherit" },
);
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

for (const [source, target] of [
  ["packages/cli/package.json", "package.json"],
  ["packages/cli/README.md", "README.md"],
  ["LICENSE", "LICENSE"],
  ["packages/cli/bin/yeli.js", "bin/yeli.js"],
  ["docs/agents.md", "docs/agents.md"],
  ["docs/agent-quickstart.md", "docs/agent-quickstart.md"],
  ["docs/agent-quickstart.zh-CN.md", "docs/agent-quickstart.zh-CN.md"],
  ["docs/third-party-notices.md", "THIRD_PARTY_NOTICES.md"],
  ["skills/yeli", "skills/yeli"],
]) {
  const output = resolve(destination, target);
  mkdirSync(dirname(output), { recursive: true });
  cpSync(resolve(root, source), output, { recursive: true });
}
chmodSync(resolve(destination, "bin/yeli.js"), 0o755);
console.log("Built independent CLI package in dist/cli/");
