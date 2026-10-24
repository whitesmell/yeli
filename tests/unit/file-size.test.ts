import { describe, expect, it } from "vitest";

import { formatArtifactSize } from "../../src/ui/file-size.ts";

describe("artifact size formatting", () => {
  it.each([
    [0, "0 B"],
    [999, "999 B"],
    [1_000, "1.00 KB"],
    [1_024, "1.02 KB"],
    [305_292, "305.29 KB"],
    [1_000_000, "1.00 MB"],
    [2_649_947, "2.65 MB"],
    [67_108_864, "67.11 MB"],
  ])("formats %i bytes for a compact About summary", (bytes, expected) => {
    expect(formatArtifactSize(bytes)).toBe(expected);
  });
});
