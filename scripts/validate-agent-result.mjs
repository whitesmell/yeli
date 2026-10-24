#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateResult } from "./agent-format-lib.mjs";

const [baselineArgument, resultArgument, expectedArgument] =
  process.argv.slice(2);
if (!baselineArgument || !resultArgument || !expectedArgument) {
  console.error(
    "Usage: node validate.mjs <baseline.yeli.html> <result.yeli.html> <expected.md>",
  );
  process.exit(2);
}

const validation = validateResult(
  readFileSync(resolve(baselineArgument), "utf8"),
  readFileSync(resolve(resultArgument), "utf8"),
  readFileSync(resolve(expectedArgument), "utf8"),
);
console.log(JSON.stringify(validation, null, 2));
if (!validation.valid) process.exitCode = 1;
