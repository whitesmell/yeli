#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { YELI_AGENT_API_VERSION } from "../lib/src/agent/events.js";

const metadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--version") {
  process.stdout.write(`${metadata.version}\n`);
} else if (
  args.length === 0 ||
  (args.length === 1 && ["--help", "-h", "help"].includes(args[0]))
) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        apiVersion: YELI_AGENT_API_VERSION,
        cliVersion: metadata.version,
        node: metadata.engines.node,
        usage: "yeli <command> <input> [arguments]",
        commands: [
          "pre-read",
          "inspect",
          "get",
          "extract",
          "import",
          "replace",
          "patch",
          "metadata",
          "refresh",
          "validate",
          "render",
          "export-markdown",
          "export-static",
          "verify-shell",
          "migrate-shell",
        ],
        paths: {
          guide: fileURLToPath(new URL("../docs/agents.md", import.meta.url)),
          quickstart: fileURLToPath(
            new URL("../docs/agent-quickstart.md", import.meta.url),
          ),
          skill: fileURLToPath(
            new URL("../skills/yeli/SKILL.md", import.meta.url),
          ),
        },
        mutations:
          "Require --expected-hash or --expected-revision from a fresh pre-read; verify shell.stable and shell.markerCount in the receipt.",
        creation:
          "import requires a separately obtained trusted --template and a new --output path; no template is bundled or downloaded.",
      },
      null,
      2,
    )}\n`,
  );
} else {
  await import("../lib/scripts/yeli.js");
}
