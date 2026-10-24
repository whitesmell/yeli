import { describe, expect, it } from "vitest";

import { validateYeliPayload } from "../../src/agent/validate";
import { sha256BytesFallback } from "../../src/document/freshness";
import { createDocumentPayload } from "../../src/document/model";

describe("YELI validation", () => {
  it("preserves additive safe fields without allowing prototype-polluting keys", async () => {
    const payload = await createDocumentPayload("# Safe\n", {
      docId: "doc-unknown",
      revision: 1,
    });
    const parsed = JSON.parse(
      JSON.stringify({
        ...payload,
        futureSafe: { enabled: true },
      }).replace(
        '"futureSafe":{',
        '"__proto__":{"polluted":true},"futureSafe":{',
      ),
    ) as unknown;

    const result = await validateYeliPayload(parsed);

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "PROTOTYPE_KEY_FORBIDDEN",
    );
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("rejects function-like live values before serialization", async () => {
    const payload = await createDocumentPayload("# Safe\n", {
      docId: "doc-function",
      revision: 1,
    });
    const unsafe = { ...payload, extension: () => "not pure data" };

    const result = await validateYeliPayload(unsafe);

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "NON_JSON_VALUE",
    );
  });

  it("reports broken, duplicate, missing, and oversized embedded assets with stable codes", async () => {
    const referenced = "sha256:" + "a".repeat(64);
    const duplicate = "sha256:" + "b".repeat(64);
    const payload = await createDocumentPayload(
      `![missing](yeli-asset:${referenced})\n`,
      {
        docId: "doc-assets",
        revision: 1,
        assets: [
          { id: duplicate, mimeType: "image/png", data: "not-base64!" },
          { id: duplicate, mimeType: "image/png", data: "AA==" },
          {
            id: "sha256:" + "d".repeat(64),
            mimeType: "application/octet-stream",
            data: "AB==",
          },
          {
            id: "sha256:" + "c".repeat(64),
            mimeType: "application/octet-stream",
            data: "AAAA",
          },
        ],
      },
    );

    const result = await validateYeliPayload(payload, {
      maxDecodedAssetBytes: 1,
      maxTotalDecodedAssetBytes: 2,
    });
    const codes = result.findings.map((finding) => finding.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "ASSET_BASE64_INVALID",
        "ASSET_DUPLICATE_ID",
        "ASSET_MISSING",
        "ASSET_TOO_LARGE",
      ]),
    );
  });

  it("accepts a content-addressed embedded binary within decoded budgets", async () => {
    const bytes = new Uint8Array([0]);
    const id = `sha256:${sha256BytesFallback(bytes)}`;
    const payload = await createDocumentPayload(
      `![embedded](yeli-asset:${id})\n`,
      {
        docId: "doc-valid-asset",
        revision: 1,
        assets: [{ id, mimeType: "application/octet-stream", data: "AA==" }],
      },
    );

    const result = await validateYeliPayload(payload);

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("enforces nesting and Markdown line budgets before downstream work", async () => {
    const payload = await createDocumentPayload("one\ntwo\n", {
      docId: "doc-budget",
      revision: 1,
      settings: { one: { two: { three: { four: { five: { six: true } } } } } },
    });

    const result = await validateYeliPayload(payload, {
      maxJsonNestingDepth: 5,
      maxMarkdownLines: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["JSON_NESTING_BUDGET", "MARKDOWN_LINE_BUDGET"]),
    );
  });

  it("rejects malformed manifest members instead of accepting them as stale", async () => {
    const payload = await createDocumentPayload("# Shape\n", {
      docId: "doc-manifest-shape",
      revision: 1,
    });
    const malformed = JSON.parse(JSON.stringify(payload)) as unknown as {
      manifest: { headings: unknown[] };
    };
    malformed.manifest.headings = [42];

    const result = await validateYeliPayload(malformed);

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "MANIFEST_HEADING_INVALID",
    );
  });

  it("keeps inert source constructs editable while reporting render warnings", async () => {
    const payload = await createDocumentPayload(
      "---\ntitle: &name one\ndescription: *name\n---\n<script>x</script>\n[x](javascript:alert(1))\n",
      { docId: "doc-source-safe", revision: 1 },
    );

    const result = await validateYeliPayload(payload);

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "YAML_ALIAS_UNSAFE",
          severity: "warning",
        }),
        expect.objectContaining({
          code: "RAW_HTML_UNSAFE",
          severity: "warning",
        }),
        expect.objectContaining({ code: "URL_UNSAFE", severity: "warning" }),
      ]),
    );
  });

  it("ignores stale manifest semantics and validates the recomputed projection", async () => {
    const payload = await createDocumentPayload("# Current\n", {
      docId: "doc-stale-manifest-validation",
      revision: 1,
    });
    payload.manifest.assetReferences = ["sha256:" + "f".repeat(64)];
    payload.manifest.headings = [
      { ...payload.manifest.headings[0]!, anchor: "duplicate" },
      { ...payload.manifest.headings[0]!, anchor: "duplicate" },
    ];

    const result = await validateYeliPayload(payload);

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([
      expect.objectContaining({ code: "MANIFEST_STALE", severity: "warning" }),
    ]);
    expect(result.freshness?.manifest.value.assetReferences).toEqual([]);
  });
});
