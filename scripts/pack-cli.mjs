import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = resolve(root, "dist/packages");
mkdirSync(destination, { recursive: true });
const result = spawnSync(
  process.execPath,
  [
    process.env.npm_execpath,
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    destination,
  ],
  { cwd: resolve(root, "dist/cli"), stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
