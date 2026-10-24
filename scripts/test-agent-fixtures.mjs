import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createPrototype,
  parseArtifact,
  replaceMarkdown,
  serializePayload,
  validateResult,
} from "./agent-format-lib.mjs";

const source = readFileSync(resolve("tests/fixtures/agent/source.md"), "utf8");
const expected = readFileSync(
  resolve("tests/fixtures/agent/expected.md"),
  "utf8",
);
const baseline = createPrototype(source);

const directParsed = parseArtifact(baseline);
const directPayload = {
  ...directParsed.payload,
  revision: directParsed.payload.revision + 1,
  manifest: { ...directParsed.payload.manifest, freshness: "stale" },
  markdown: {
    lines: expected.endsWith("\n")
      ? expected.slice(0, -1).split("\n")
      : expected.split("\n"),
    finalNewline: expected.endsWith("\n"),
  },
};
const direct = `${directParsed.prefix}${serializePayload(directPayload)}${directParsed.suffix}`;
const helper = replaceMarkdown(baseline, expected);
const collateralParsed = parseArtifact(helper);
const collateralPayload = {
  ...collateralParsed.payload,
  id: "unexpected-collateral-change",
};
const collateral = `${collateralParsed.prefix}${serializePayload(collateralPayload)}${collateralParsed.suffix}`;
const results = {
  direct: validateResult(baseline, direct, expected),
  helper: validateResult(baseline, helper, expected),
  serializedOutcomeParity: direct === helper,
  collateralMutationRejected: !validateResult(baseline, collateral, expected)
    .valid,
};

console.log(JSON.stringify(results, null, 2));
if (
  !results.direct.valid ||
  !results.helper.valid ||
  !results.serializedOutcomeParity ||
  !results.collateralMutationRejected
) {
  process.exitCode = 1;
}
