#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseArtifact, replaceMarkdown } from "./agent-format-lib.mjs";

const [command, artifactArgument, markdownArgument] = process.argv.slice(2);
if (!command || !artifactArgument || !markdownArgument) {
  console.error(
    "Usage: node helper.mjs <extract|replace> <document.yeli.html> <markdown.md>",
  );
  process.exit(2);
}

const artifactPath = resolve(artifactArgument);
const markdownPath = resolve(markdownArgument);

if (command === "extract") {
  const parsed = parseArtifact(readFileSync(artifactPath, "utf8"));
  writeFileSync(markdownPath, parsed.markdown, "utf8");
  console.log(`Extracted ${Buffer.byteLength(parsed.markdown)} Markdown bytes`);
} else if (command === "replace") {
  const artifact = readFileSync(artifactPath, "utf8");
  const markdown = readFileSync(markdownPath, "utf8");
  const updated = replaceMarkdown(artifact, markdown);
  writeFileSync(artifactPath, updated, "utf8");
  console.log(
    `Replaced payload with ${Buffer.byteLength(markdown)} Markdown bytes`,
  );
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}
