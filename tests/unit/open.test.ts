import { describe, expect, it } from "vitest";

import { createDocumentPayload } from "../../src/document/model.ts";
import { sha256BytesFallback } from "../../src/document/freshness.ts";
import {
  openYeliArtifact,
  reconstructReleaseTemplate,
} from "../../src/format/open.ts";
import {
  YELI_AGENT_PREAMBLE,
  serializePayloadBlock,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "../../src/format/serialize.ts";
import { versionSnapshotForOpenedDocument } from "../../src/ui/use-file-lifecycle.ts";

describe("YELI opening", () => {
  it("rejects an old AIMD artifact without parsing or changing its payload", async () => {
    const legacy =
      '<!doctype html><script id="aimd-doc" type="application/aimd+json">{"format":"aimd/document","markdown":{"lines":["# Original"],"finalNewline":true}}</script>';
    const result = await openYeliArtifact(legacy);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.recovery?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNSUPPORTED_FORMAT" }),
      ]),
    );
    expect(result.recovery?.recovery).toEqual({
      kind: "unsupported-format",
      originalBytes: legacy,
    });
  });

  it("captures one pristine artifact from the pre-mount document", () => {
    document.open();
    document.write(
      '<!doctype html><html lang="en"><head><title>YELI</title></head><body><div id="root"><!-- YELI_STATIC_PREVIEW_START --><div id="yeli-static-preview"><p>Preview</p></div><!-- YELI_STATIC_PREVIEW_END --></div><script type="module">runtime()</script></body></html>',
    );
    document.close();

    const template = reconstructReleaseTemplate(document);

    expect(template).toContain("<!doctype html>");
    expect(template).toContain('<div id="yeli-static-preview">');
    expect(template).toContain('<script type="module">runtime()</script>');
    expect(template).not.toContain("yeli-release-template");
  });

  it("opens a payload-bearing artifact without trusting the static preview", async () => {
    const payload = await createDocumentPayload("# Current\n", {
      docId: "open-doc",
      revision: 9,
    });
    const artifact = `<!doctype html><body>${YELI_AGENT_PREAMBLE}\n${serializePayloadBlock(payload)}${STATIC_PREVIEW_OPEN}<p>stale</p>${STATIC_PREVIEW_CLOSE}</body>`;

    const result = await openYeliArtifact(artifact);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.markdown).toBe("# Current\n");
    expect(result.document.payload.revision).toBe(9);
  });

  it("materializes an externally edited payload instead of the stale template copy", async () => {
    const edited = await createDocumentPayload("# Agent edit\n", {
      docId: "external-edit",
      revision: 2,
    });
    document.open();
    document.write(
      `<!doctype html><html><body>${YELI_AGENT_PREAMBLE}\n${serializePayloadBlock(edited)}${STATIC_PREVIEW_OPEN}<div id="yeli-static-preview"><p>old</p></div>${STATIC_PREVIEW_CLOSE}<div id="root"></div><script type="module">runtime()</script></body></html>`,
    );
    document.close();

    const { openEmbeddedYeli } = await import("../../src/format/open.ts");
    const result = await openEmbeddedYeli();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.markdown).toBe("# Agent edit\n");
    expect(result.document.payload.revision).toBe(2);
  });

  it("parses the mounted release shell without trusting runtime state", async () => {
    const payload = await createDocumentPayload("# Pristine artifact\n", {
      docId: "pristine-artifact",
      revision: 3,
    });
    const source = `<!doctype html><html><body>${YELI_AGENT_PREAMBLE}\n${serializePayloadBlock(payload)}${STATIC_PREVIEW_OPEN}<div id="yeli-static-preview"><p>preview</p></div>${STATIC_PREVIEW_CLOSE}<div id="root"></div></body></html>`;
    const exactMeta =
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">';
    const artifact = source.replace(
      "<body>",
      `<head>${exactMeta}</head><body>`,
    );
    document.open();
    document.write(artifact);
    document.close();

    const { openEmbeddedYeli } = await import("../../src/format/open.ts");
    const result = await openEmbeddedYeli();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.markdown).toBe("# Pristine artifact\n");
    expect(result.document.payload.revision).toBe(3);
    expect(result.document.releaseTemplate).toContain(exactMeta);
    expect(result.document.releaseTemplate).not.toContain(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></meta>',
    );
  });

  it("carries recomputed freshness into history instead of trusting stale persisted hashes", async () => {
    const payload = await createDocumentPayload("# Before\n", {
      docId: "stale-history-provenance",
      revision: 4,
    });
    payload.agentSummary = {
      changeSummary: "Old attributed change",
      content: "Old attributed change",
      sourceHash: payload.manifest.sourceHash,
      updatedAt: "2026-09-02T12:00:00.000Z",
      updatedBy: "codex/old-task",
    };
    payload.markdown = { lines: ["# After"], finalNewline: true };
    const artifact = `<!doctype html><body>${YELI_AGENT_PREAMBLE}\n${serializePayloadBlock(payload)}${STATIC_PREVIEW_OPEN}<p>stale</p>${STATIC_PREVIEW_CLOSE}</body>`;

    const result = await openYeliArtifact(artifact);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.freshness).toMatchObject({
      agentSummary: { status: "stale" },
      manifest: { status: "stale" },
    });
    expect(result.document.freshness.sourceHash).not.toBe(
      result.document.payload.manifest.sourceHash,
    );
    expect(versionSnapshotForOpenedDocument(result.document, "open")).toEqual(
      expect.objectContaining({
        change: { origin: "system" },
        sourceHash: result.document.freshness.sourceHash,
      }),
    );
  });

  it("uses a fresh Agent summary as opened-document history provenance", async () => {
    const payload = await createDocumentPayload("# Current\n", {
      docId: "fresh-history-provenance",
      revision: 5,
    });
    payload.agentSummary = {
      changeSummary: "Updated the current section",
      content: "Updated the current section",
      sourceHash: payload.manifest.sourceHash,
      updatedAt: "2026-09-03T12:00:00.000Z",
      updatedBy: "codex/current-task",
    };
    const artifact = `<!doctype html><body>${YELI_AGENT_PREAMBLE}\n${serializePayloadBlock(payload)}${STATIC_PREVIEW_OPEN}<p>preview</p>${STATIC_PREVIEW_CLOSE}</body>`;

    const result = await openYeliArtifact(artifact);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(versionSnapshotForOpenedDocument(result.document, "open")).toEqual(
      expect.objectContaining({
        change: {
          actorLabel: "codex/current-task",
          origin: "external-agent",
          summary: "Updated the current section",
        },
        sourceHash: result.document.freshness.sourceHash,
      }),
    );
  });

  it.each([
    {
      data: "PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnPjwvc3ZnPg==",
      mimeType: "image/svg+xml",
      expectedCode: "ASSET_MIME_UNSAFE",
    },
    {
      data: "AA==",
      mimeType: "image/png",
      expectedCode: "ASSET_MIME_MISMATCH",
    },
  ])(
    "fails closed when an embedded asset reports $expectedCode",
    async ({ data, expectedCode, mimeType }) => {
      const bytes = Uint8Array.from(atob(data), (value) => value.charCodeAt(0));
      const id = `sha256:${sha256BytesFallback(bytes)}`;
      const payload = await createDocumentPayload(
        `# Unsafe asset\n\n![asset](yeli-asset:${id})\n`,
        {
          assets: [{ data, id, mimeType }],
          docId: "unsafe-asset",
          revision: 1,
        },
      );
      const artifact = `<!doctype html><body>${YELI_AGENT_PREAMBLE}\n${serializePayloadBlock(payload)}${STATIC_PREVIEW_OPEN}<p>preview</p>${STATIC_PREVIEW_CLOSE}</body>`;

      const result = await openYeliArtifact(artifact);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.recovery?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: expectedCode }),
        ]),
      );
      expect(result.recovery?.recovery.originalBytes).toBe(artifact);
    },
  );
});
