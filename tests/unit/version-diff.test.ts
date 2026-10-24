import { describe, expect, it } from "vitest";

import type { YeliAsset } from "../../src/document/model.ts";
import type { StoredVersion } from "../../src/storage/recovery.ts";
import { summarizeVersionChange } from "../../src/storage/version-diff.ts";

function asset(id: string, data = id): YeliAsset {
  return { data, id: `sha256:${id.padEnd(64, "a")}`, mimeType: "image/png" };
}

function version(source: string, assets?: YeliAsset[]): StoredVersion {
  return {
    ...(assets ? { assets } : {}),
    id: "version-1",
    reason: "edit",
    revision: 2,
    source,
    sourceHash: "historical-hash",
    updatedAt: 1_700_000_000_000,
  };
}

function current(source: string, assets: YeliAsset[] = []) {
  return {
    assets,
    revision: 7,
    source,
    sourceHash: "current-hash",
  };
}

describe("lightweight local-version summary", () => {
  it("counts only the changed middle without creating line diff hunks", () => {
    const result = summarizeVersionChange(
      current("one\nnew two\nshared\nnew four\nend\n"),
      version("one\nold two\nshared\nold four\nend\n"),
    );

    expect(result).toMatchObject({
      currentChangedLines: 3,
      currentLineCount: 5,
      historicalChangedLines: 3,
      historicalLineCount: 5,
      sourceChanged: true,
    });
    expect(result).not.toHaveProperty("hunks");
  });

  it("summarizes asset additions, removals, replacements, and legacy retention", () => {
    const shared = asset("shared");
    const result = summarizeVersionChange(
      current("same", [shared, asset("current"), asset("changed", "new")]),
      version("same", [shared, asset("history"), asset("changed", "old")]),
    );

    expect(result.assetSummary).toEqual({
      changed: [asset("changed").id],
      currentOnly: [asset("current").id],
      historicalOnly: [asset("history").id],
      legacyAssetsRetained: false,
    });
    expect(
      summarizeVersionChange(current("same", [shared]), version("same"))
        .assetSummary.legacyAssetsRetained,
    ).toBe(true);
  });

  it("keeps hostile historical markup as bounded inert preview text", () => {
    const hostile = `<script>globalThis.pwned = true</script>\n<img src=x onerror=alert(1)>\n`;
    const result = summarizeVersionChange(current("safe\n"), version(hostile), {
      previewCharacters: 48,
    });

    expect(result.historicalPreview).toBe(hostile.slice(0, 48));
    expect(result.historicalPreviewTruncated).toBe(true);
  });
});
