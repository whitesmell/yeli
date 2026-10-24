import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectCompressedArtifact } from "../../src/format/compress-artifact.ts";

const describeAdvanced =
  process.env.YELI_TEST_ADVANCED === "1" ? describe : describe.skip;

describeAdvanced("official Advanced Source profile", () => {
  const artifactPath = resolve("dist/advanced/advanced.zh-CN.yeli.html");

  it("builds an isolated artifact containing the optional CodeMirror plugin", () => {
    expect(existsSync(artifactPath)).toBe(true);
    const artifact = readFileSync(artifactPath, "utf8");

    const compressed = inspectCompressedArtifact(artifact);
    expect(compressed).not.toBeNull();
    expect(compressed!.runtime.source).toContain("cm-editor");
    expect(compressed!.runtime.source).toContain("高级视图");
    expect(artifact).not.toContain('id="yeli-release-template"');
  });
});
