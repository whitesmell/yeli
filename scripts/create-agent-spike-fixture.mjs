#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createPrototype } from "./agent-format-lib.mjs";

const [route, targetArgument] = process.argv.slice(2);
if (!new Set(["direct", "helper"]).has(route) || !targetArgument) {
  console.error(
    "Usage: node create-agent-spike-fixture.mjs <direct|helper> <target-directory>",
  );
  process.exit(2);
}

const target = resolve(targetArgument);
mkdirSync(target, { recursive: true });
const source = readFileSync(resolve("tests/fixtures/agent/source.md"), "utf8");
const artifact = createPrototype(source);
writeFileSync(resolve(target, "baseline.yeli.html"), artifact, "utf8");
writeFileSync(resolve(target, "document.yeli.html"), artifact, "utf8");
cpSync(
  resolve("tests/fixtures/agent/expected.md"),
  resolve(target, "expected.md"),
);
cpSync(
  resolve(`tests/fixtures/agent/task-${route}.md`),
  resolve(target, "TASK.md"),
);
cpSync(
  resolve("scripts/agent-format-lib.mjs"),
  resolve(target, "agent-format-lib.mjs"),
);
cpSync(
  resolve("scripts/validate-agent-result.mjs"),
  resolve(target, "validate.mjs"),
);
if (route === "helper") {
  cpSync(
    resolve("scripts/yeli-prototype-helper.mjs"),
    resolve(target, "helper.mjs"),
  );
}
console.log(JSON.stringify({ route, target }, null, 2));
