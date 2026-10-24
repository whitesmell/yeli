import { describe, expect, it } from "vitest";

import {
  AgentApiError,
  preReadDocument,
  refreshDocument,
} from "../../src/agent/operations";
import {
  createDocumentPayload,
  encodeMarkdown,
} from "../../src/document/model";
import {
  YELI_AGENT_PREAMBLE,
  serializePayloadBlock,
} from "../../src/format/serialize";

const missingAsset = `sha256:${"a".repeat(64)}`;

function artifactWith(payloadBlock: string): string {
  return `<!doctype html>\n<html><body>\n${YELI_AGENT_PREAMBLE}\n${payloadBlock}\n</body></html>\n`;
}

describe("artifact freshness and asset references", () => {
  it("uses current Markdown references when a stale manifest names a missing asset", async () => {
    const payload = await createDocumentPayload(
      `![old](yeli-asset:${missingAsset})\n`,
      { docId: "doc-stale-asset-reference", revision: 4 },
    );
    payload.markdown = encodeMarkdown("# Current\n");
    const artifact = artifactWith(serializePayloadBlock(payload));

    const before = await preReadDocument(artifact);
    expect(before.freshness.manifest).toBe("stale");
    expect(before.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MANIFEST_STALE" }),
      ]),
    );
    expect(before.findings.map((finding) => finding.code)).not.toContain(
      "ASSET_MISSING",
    );

    const refreshed = await refreshDocument(artifact, {
      expectedRevision: 4,
    });
    expect(refreshed.document.freshness.manifest).toBe("fresh");
    expect(refreshed.document.findings).toEqual([]);
  });

  it("still rejects a current manifest reference whose asset is missing", async () => {
    const payload = await createDocumentPayload(
      `![missing](yeli-asset:${missingAsset})\n`,
      { docId: "doc-current-missing-asset", revision: 1 },
    );
    const artifact = artifactWith(serializePayloadBlock(payload));

    try {
      await preReadDocument(artifact);
      expect.fail("A current missing asset reference must fail closed");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      if (!(error instanceof AgentApiError)) return;
      expect(error.code).toBe("ARTIFACT_INVALID");
      expect(error.findings?.map((finding) => finding.code)).toContain(
        "ASSET_MISSING",
      );
    }
  });
});
