import { describe, expect, it } from "vitest";

import {
  YELI_AGENT_API_VERSION,
  AgentApiError,
  exportMarkdownDocument,
  exportStaticDocument,
  getDocument,
  importMarkdownDocument,
  patchDocumentLines,
  patchMetadata,
  renderDocument,
} from "../../src/agent/operations";
import { createDocumentPayload } from "../../src/document/model";
import {
  YELI_AGENT_PREAMBLE,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
  serializePayloadBlock,
} from "../../src/format/serialize";

function shellWith(payloadBlock: string, sourceHash: string): string {
  return `<!doctype html>\n<html><body>\n${YELI_AGENT_PREAMBLE}\n<script>globalThis.runtime = "immutable";</script>\n${payloadBlock}\n${STATIC_PREVIEW_OPEN}\n<article id="yeli-static-preview" data-source-hash="${sourceHash}">preview</article>\n${STATIC_PREVIEW_CLOSE}\n<footer>immutable suffix</footer>\n</body></html>\n`;
}

async function artifactFor(
  source: string,
  revision = 3,
): Promise<{ artifact: string; sourceHash: string }> {
  const payload = await createDocumentPayload(source, {
    docId: "doc-agent-operations",
    revision,
  });
  return {
    artifact: shellWith(
      serializePayloadBlock(payload),
      payload.manifest.sourceHash,
    ),
    sourceHash: payload.manifest.sourceHash,
  };
}

describe("versioned Agent operations", () => {
  it("returns an isolated, freshness-aware document snapshot and shell receipt", async () => {
    const { artifact, sourceHash } = await artifactFor("# Title\n\nBody\n");

    const first = await getDocument(artifact);
    first.payload.markdown.lines[0] = "# Mutated copy";
    const second = await getDocument(artifact);

    expect(first.apiVersion).toBe(YELI_AGENT_API_VERSION);
    expect(second).toMatchObject({
      docId: "doc-agent-operations",
      revision: 3,
      sourceHash,
      freshness: {
        agentSummary: "absent",
        manifest: "fresh",
        staticPreview: "fresh",
      },
      ranges: {
        markdown: { endLine: 3, startLine: 1 },
      },
      shell: {
        markerCount: 1,
      },
    });
    expect(second.ranges.payload.end).toBeGreaterThan(
      second.ranges.payload.start,
    );
    expect(second.shell.prefix).toMatch(/^[a-f0-9]{64}$/u);
    expect(second.shell.suffix).toMatch(/^[a-f0-9]{64}$/u);
    expect(second.markdown).toBe("# Title\n\nBody\n");
    expect(second.payload.markdown.lines[0]).toBe("# Title");
  });

  it("patches only one safe YAML value and returns one immutable event", async () => {
    const source = `---\n# retained\ntitle: "Old"\nunknown: keep\n---\n# Body\n`;
    const { artifact } = await artifactFor(source);

    const result = await patchMetadata(artifact, "title", "New", {
      expectedRevision: 3,
    });

    expect(result.markdown).toBe(source.replace('"Old"', '"New"'));
    expect(result.receipt).toMatchObject({
      revision: 4,
      shell: { stable: true },
      changedCharacters: {
        before: [source.indexOf('"Old"'), source.indexOf('"Old"') + 5],
      },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      apiVersion: YELI_AGENT_API_VERSION,
      operation: "patch-metadata",
      revision: 4,
      sourceHash: result.receipt.sourceHash,
      type: "yeli.document.changed",
    });
    expect(Object.isFrozen(result.events[0])).toBe(true);
    expect(result.document).toMatchObject({
      findings: [],
      freshness: { manifest: "fresh", staticPreview: "stale" },
      ranges: { markdown: { endLine: 6, startLine: 1 } },
      revision: 4,
      sourceHash: result.receipt.sourceHash,
      shell: { markerCount: 1 },
    });
  });

  it("lets an external agent self-report its modifier and change summary", async () => {
    const { artifact } = await artifactFor("---\ntitle: Old\n---\nBody\n");
    const result = await patchMetadata(
      artifact,
      "title",
      "New",
      { expectedRevision: 3 },
      YELI_AGENT_API_VERSION,
      {
        changeSummary: "Renamed the public document title",
        updatedAt: "2026-09-03T12:00:00.000Z",
        updatedBy: "codex/task-42",
      },
    );

    const inspected = await getDocument(result.artifact);
    expect(inspected.payload.agentSummary).toEqual({
      changeSummary: "Renamed the public document title",
      content: "Renamed the public document title",
      sourceHash: result.receipt.sourceHash,
      updatedAt: "2026-09-03T12:00:00.000Z",
      updatedBy: "codex/task-42",
    });
    expect(result.document.freshness.agentSummary).toBe("fresh");
  });

  it.each(["fresh", "stale"] as const)(
    "replaces a prior %s Agent summary instead of reattributing its content",
    async (priorStatus) => {
      const source = `---\ntitle: Old\n---\nBody\n`;
      const initial = await createDocumentPayload(source, {
        docId: `doc-prior-${priorStatus}-summary`,
        revision: 3,
      });
      initial.agentSummary = {
        changeSummary: "Prior change",
        content: `Prior ${priorStatus} summary content`,
        sourceHash:
          priorStatus === "fresh"
            ? initial.manifest.sourceHash
            : "0".repeat(64),
        updatedAt: "2026-09-02T12:00:00.000Z",
        updatedBy: "codex/prior-task",
      };
      const artifact = shellWith(
        serializePayloadBlock(initial),
        initial.manifest.sourceHash,
      );

      const result = await patchMetadata(
        artifact,
        "title",
        "New",
        { expectedRevision: 3 },
        YELI_AGENT_API_VERSION,
        {
          changeSummary: "Current attributed change",
          updatedAt: "2026-09-03T12:00:00.000Z",
          updatedBy: "codex/current-task",
        },
      );

      const inspected = await getDocument(result.artifact);
      expect(inspected.payload.agentSummary).toMatchObject({
        changeSummary: "Current attributed change",
        content: "Current attributed change",
        sourceHash: result.receipt.sourceHash,
        updatedBy: "codex/current-task",
      });
      expect(result.document.freshness.agentSummary).toBe("fresh");
    },
  );

  it.each([
    {
      label: "replaces an existing value",
      source: `---\ntitle: Old\n---\nBody\n`,
      key: "title" as const,
      value: "New",
      expected: { startLine: 2, deleteCount: 1, insertedCount: 1 },
    },
    {
      label: "keeps a length-changing replacement on its source line",
      source: `---\ntitle: x\n---\nBody\n`,
      key: "title" as const,
      value: "A considerably longer title",
      expected: { startLine: 2, deleteCount: 1, insertedCount: 1 },
    },
    {
      label: "inserts a new key before the closing delimiter",
      source: `---\ntitle: Old\n---\nBody\n`,
      key: "description" as const,
      value: "New",
      expected: { startLine: 3, deleteCount: 0, insertedCount: 1 },
    },
    {
      label: "inserts new frontmatter without replacing body lines",
      source: "Body",
      key: "title" as const,
      value: "New",
      expected: { startLine: 1, deleteCount: 0, insertedCount: 3 },
    },
    {
      label: "keeps a final delimiter without a newline outside the receipt",
      source: `---\ntitle: Old\n---`,
      key: "description" as const,
      value: "New",
      expected: { startLine: 3, deleteCount: 0, insertedCount: 1 },
    },
  ])(
    "reports narrow changed lines when metadata $label",
    async ({ expected, key, source, value }) => {
      const { artifact } = await artifactFor(source);

      const result = await patchMetadata(artifact, key, value, {
        expectedRevision: 3,
      });

      expect(result.receipt.changedLines).toEqual(expected);
    },
  );

  it("rejects unsupported API versions before mutation", async () => {
    const { artifact } = await artifactFor("# Before\n");

    await expect(
      patchMetadata(
        artifact,
        "title",
        "Never written",
        { expectedRevision: 3 },
        2,
      ),
    ).rejects.toMatchObject({
      code: "API_VERSION_UNSUPPORTED",
    } satisfies Partial<AgentApiError>);
  });

  it("rejects non-core metadata keys at the operation boundary", async () => {
    const { artifact } = await artifactFor("# Before\n");

    await expect(
      patchMetadata(artifact, "__proto__" as never, "unsafe", {
        expectedRevision: 3,
      }),
    ).rejects.toMatchObject({ code: "METADATA_INPUT_INVALID" });
  });

  it("rejects an invalid line range without producing a result artifact", async () => {
    const { artifact } = await artifactFor("# Before\n");

    await expect(
      patchDocumentLines(
        artifact,
        { deleteCount: 1, insertLines: [], startLine: 99 },
        { expectedRevision: 3 },
      ),
    ).rejects.toMatchObject({ code: "LINE_PATCH_INVALID" });
    expect((await getDocument(artifact)).markdown).toBe("# Before\n");
  });

  it("imports Markdown into a trusted template with canonical save semantics", async () => {
    const { artifact: trustedTemplate } = await artifactFor(
      "# Template content\n",
      9,
    );

    const result = await importMarkdownDocument(
      "---\r\ntitle: Imported\r\n---\r\n# Body\r\n",
      trustedTemplate,
      "doc-imported",
    );
    const imported = await getDocument(result.artifact);

    expect(imported).toMatchObject({
      docId: "doc-imported",
      freshness: { manifest: "fresh", staticPreview: "fresh" },
      markdown: "---\ntitle: Imported\n---\n# Body\n",
      revision: 1,
    });
    expect(result).toMatchObject({
      apiVersion: YELI_AGENT_API_VERSION,
      ok: true,
      receipt: {
        lineEndingsNormalized: true,
        revision: 1,
        shell: { markerCount: 1, shellStable: true },
        sourceHash: imported.sourceHash,
      },
    });
    expect(result.artifact).not.toContain("# Template content");
    expect(trustedTemplate).toContain("# Template content");
  });

  it("rejects an invalid import template with a structured code", async () => {
    await expect(
      importMarkdownDocument("# Body\n", "<!doctype html>", "doc-imported"),
    ).rejects.toMatchObject({ code: "TEMPLATE_INVALID" });
  });

  it("renders and exports safely in direct Node without a browser DOM", async () => {
    const { artifact } = await artifactFor(
      "# Safe\n\n<script>globalThis.pwned = true</script>\n\n[bad](javascript:alert(1))\n",
    );

    const rendered = await renderDocument(artifact);
    const staticExport = await exportStaticDocument(artifact);
    const markdownExport = await exportMarkdownDocument(artifact);

    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain('href="javascript:');
    expect(staticExport.html).toContain("default-src 'none'");
    expect(staticExport.html).not.toContain("<script");
    expect(markdownExport.content).toContain("globalThis.pwned = true");
    expect(staticExport).toMatchObject({
      apiVersion: 1,
      ok: true,
      revision: 3,
    });
    expect(staticExport.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(markdownExport).toMatchObject({
      apiVersion: 1,
      ok: true,
      revision: 3,
      sourceHash: staticExport.sourceHash,
    });
  });
});
