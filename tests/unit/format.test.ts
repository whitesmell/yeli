import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createDocumentPayload,
  decodeMarkdown,
  encodeMarkdown,
} from "../../src/document/model";
import {
  YELI_DOCUMENT_SCHEMA,
  validatePayloadSchema,
} from "../../src/document/schema";
import { parseYeliArtifact } from "../../src/format/parse";
import {
  YELI_AGENT_PREAMBLE,
  PAYLOAD_OPENING_TAG,
  serializePayloadBlock,
  splicePayload,
} from "../../src/format/serialize";

const hostileMarkdown = readFileSync(
  resolve("tests/fixtures/security/hostile-payload.md"),
  "utf8",
);

function shellWith(payloadBlock: string): string {
  return `<!doctype html>\n<html><head><meta name="yeli:format" content="yeli/document"></head><body>\n${YELI_AGENT_PREAMBLE}\n<main>immutable runtime shell</main>\n${payloadBlock}\n</body></html>\n`;
}

describe("YELI format", () => {
  it("declares and validates changeSummary only under agentSummary", async () => {
    expect(
      Object.hasOwn(
        YELI_DOCUMENT_SCHEMA.properties.manifest.properties,
        "changeSummary",
      ),
    ).toBe(false);
    expect(
      YELI_DOCUMENT_SCHEMA.properties.agentSummary.properties.changeSummary,
    ).toEqual({ type: "string" });

    const payload = await createDocumentPayload("# Summary\n", {
      docId: "doc-summary-schema",
      revision: 1,
    });
    payload.agentSummary = {
      changeSummary: "Changed the title",
      content: "Changed the title",
      sourceHash: payload.manifest.sourceHash,
      updatedAt: "2026-09-03T12:00:00.000Z",
      updatedBy: "codex/schema-test",
    };
    expect(validatePayloadSchema(payload).ok).toBe(true);

    const invalid = structuredClone(payload) as unknown as {
      agentSummary: { changeSummary: unknown };
    };
    invalid.agentSummary.changeSummary = 42;
    expect(validatePayloadSchema(invalid).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "AGENT_SUMMARY_INVALID" }),
      ]),
    );
  });

  it.each([
    ["", { lines: [], finalNewline: false }],
    ["\n", { lines: [], finalNewline: true }],
    ["alpha", { lines: ["alpha"], finalNewline: false }],
    ["alpha\n", { lines: ["alpha"], finalNewline: true }],
    ["alpha\n\n", { lines: ["alpha", ""], finalNewline: true }],
    ["alpha\n\nbeta", { lines: ["alpha", "", "beta"], finalNewline: false }],
  ])("canonically encodes and decodes %j", (source, encoded) => {
    expect(encodeMarkdown(source)).toEqual(encoded);
    expect(decodeMarkdown(encoded)).toBe(source);
  });

  it("round-trips a valid payload without changing identity or source bytes", async () => {
    const payload = await createDocumentPayload("# Hello\n\nWorld\n", {
      docId: "doc-round-trip",
      revision: 4,
    });
    const artifact = shellWith(serializePayloadBlock(payload));

    const parsed = await parseYeliArtifact(artifact);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.docId).toBe("doc-round-trip");
    expect(parsed.payload.revision).toBe(4);
    expect(parsed.markdown).toBe("# Hello\n\nWorld\n");
    expect(parsed.payload.markdown).toEqual(payload.markdown);
  });

  it("splices only the payload and proves immutable prefix and suffix bytes", async () => {
    const initial = await createDocumentPayload("# Before\n", {
      docId: "doc-shell-proof",
      revision: 1,
    });
    const artifact = shellWith(serializePayloadBlock(initial));
    const edited = await createDocumentPayload("# After\n", {
      docId: initial.docId,
      revision: 2,
    });

    const result = splicePayload(artifact, edited);

    expect(result.receipt.markerCount).toBe(1);
    expect(result.receipt.prefix.before).toBe(result.receipt.prefix.after);
    expect(result.receipt.suffix.before).toBe(result.receipt.suffix.after);
    expect(result.receipt.shellStable).toBe(true);
    expect(result.artifact).not.toBe(artifact);
  });

  it("escapes hostile block terminators so document data cannot close or execute the payload", async () => {
    const source = `${hostileMarkdown}\0`; // Include a decoded NUL in addition to the fixture text.
    const payload = await createDocumentPayload(source, {
      docId: "doc-hostile-terminator",
      revision: 1,
    });
    const payloadBlock = serializePayloadBlock(payload);
    const artifact = shellWith(payloadBlock);

    expect(payloadBlock.match(/<\/script>/giu)).toHaveLength(1);
    expect(payloadBlock).not.toContain("</script><script>");
    expect(payloadBlock).toContain("\\u003c/script>");

    const parsed = await parseYeliArtifact(artifact);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.markdown).toBe(source);
  });

  it("preserves safe additive fields across parse and save", async () => {
    const payload = await createDocumentPayload("# Additive\n", {
      docId: "doc-additive",
      revision: 1,
    });
    Object.defineProperty(payload, "futureSafe", {
      enumerable: true,
      value: { nested: [true, "retained"] },
    });
    const artifact = shellWith(serializePayloadBlock(payload));

    const parsed = await parseYeliArtifact(artifact);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(
      (parsed.payload as unknown as Record<string, unknown>).futureSafe,
    ).toEqual({ nested: [true, "retained"] });
    expect(serializePayloadBlock(parsed.payload)).toContain('"futureSafe"');
  });

  it("requires one unique payload marker", async () => {
    const payload = await createDocumentPayload("# Duplicate\n", {
      docId: "doc-duplicate",
      revision: 1,
    });
    const block = serializePayloadBlock(payload);

    const parsed = await parseYeliArtifact(shellWith(`${block}\n${block}`));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.recovery.kind).toBe("corrupt");
    expect(parsed.findings.map((finding) => finding.code)).toContain(
      "PAYLOAD_MARKER_COUNT",
    );
  });

  it("does not treat data-* attributes as the canonical payload marker", async () => {
    const payload = await createDocumentPayload("# Marker\n", {
      docId: "doc-marker-attribute",
      revision: 1,
    });
    const decoy =
      '<script data-id="yeli-doc" data-type="application/yeli+json">ignored</script>';
    const artifact = shellWith(`${decoy}\n${serializePayloadBlock(payload)}`);

    const parsed = await parseYeliArtifact(artifact);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.markdown).toBe("# Marker\n");
  });

  it.each([
    [
      "future version",
      {
        format: "yeli/document",
        version: 42,
        markdown: { lines: ["# Recoverable"], finalNewline: true },
      },
      "future-version",
      "# Recoverable\n",
    ],
    [
      "unknown format",
      {
        format: "other/document",
        version: 1,
        markdown: { lines: ["# Recoverable"], finalNewline: false },
      },
      "unsupported-format",
      "# Recoverable",
    ],
  ])(
    "routes %s to recovery while retaining original and extractable bytes",
    async (_label, raw, kind, extractable) => {
      const block = `${PAYLOAD_OPENING_TAG}\n${JSON.stringify(raw, null, 2)}\n</script>`;
      const artifact = shellWith(block);

      const parsed = await parseYeliArtifact(artifact);

      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.recovery).toMatchObject({
        kind,
        originalBytes: artifact,
        extractableMarkdown: extractable,
      });
    },
  );

  it("routes corrupt JSON to recovery without altering original bytes", async () => {
    const artifact = shellWith(`${PAYLOAD_OPENING_TAG}\n{"broken":\n</script>`);

    const parsed = await parseYeliArtifact(artifact);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.recovery).toEqual({
      kind: "corrupt",
      originalBytes: artifact,
    });
    expect(parsed.findings.map((finding) => finding.code)).toContain(
      "PAYLOAD_JSON_INVALID",
    );
  });

  it("routes an invalid v1 shape to recovery without throwing", async () => {
    const raw = { format: "yeli/document", version: 1 };
    const artifact = shellWith(
      `${PAYLOAD_OPENING_TAG}\n${JSON.stringify(raw, null, 2)}\n</script>`,
    );

    const parsed = await parseYeliArtifact(artifact);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.recovery).toEqual({
      kind: "corrupt",
      originalBytes: artifact,
    });
    expect(parsed.findings.map((finding) => finding.code)).toContain(
      "MARKDOWN_INVALID",
    );
  });
});
