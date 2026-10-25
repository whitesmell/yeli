import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const receiptPath = resolve(root, "dist/agent/setup.json");

function run(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command failed: ${args.join(" ")}`);
  }
  return result.stdout;
}

try {
  // A failed rebuild must not leave an old receipt that looks ready to use.
  rmSync(receiptPath, { force: true });
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 15) {
    throw new Error(
      "Use Node.js >=24.15.0 <25; the pinned version is in .nvmrc.",
    );
  }
  if (!process.env.npm_execpath) {
    throw new Error("Run this preparation with npm run setup:agent.");
  }
  for (const task of ["build:cli", "build:single:all"]) {
    run([process.env.npm_execpath, "run", task], {
      stdio: ["ignore", 2, 2],
      env: {
        ...process.env,
        YELI_EMPTY_RELEASE: "0",
        YELI_ADVANCED_PLUGIN: "0",
        YELI_COMPRESS: "1",
      },
    });
  }
  const cli = resolve(root, "dist/cli/bin/yeli.js");
  const help = JSON.parse(run([cli, "--help"]));
  const templates = {};
  const evidence = {};
  for (const locale of ["zh-CN", "en"]) {
    const file = resolve(root, `dist/html/starter.${locale}.yeli.html`);
    const validation = JSON.parse(run([cli, "validate", file]));
    if (!validation.ok)
      throw new Error(`Template validation failed: ${locale}`);
    const bytes = readFileSync(file);
    templates[locale] = file;
    evidence[locale] = {
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  const receipt = {
    format: "yeli/agent-setup",
    version: 1,
    ok: true,
    apiVersion: help.apiVersion,
    cliVersion: help.cliVersion,
    paths: {
      node: process.execPath,
      cli,
      ...help.paths,
      templates,
    },
    templates: evidence,
    receipt: receiptPath,
  };
  const json = JSON.stringify(receipt, null, 2) + "\n";
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, json, { mode: 0o600 });
  process.stdout.write(json);
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: {
        code: "AGENT_SETUP_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    }) + "\n",
  );
  process.exitCode = 1;
}
