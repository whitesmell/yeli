import { describe, expect, it } from "vitest";

import { createDocumentPayload } from "../../src/document/model";
import {
  assetReferencesFromMarkdown,
  deriveManifest,
} from "../../src/document/manifest";
import {
  resolveDerivedFreshness,
  sha256Fallback,
  sha256Text,
} from "../../src/document/freshness";

const source = `---
title: Manifest fixture
description: Derived facts
lang: en
tags: [format, test]
authors: [YELI]
aliases: [Fixture]
---

# Same

- [ ] Pending [guide](./guide.md)

## Same

![asset](yeli-asset:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)

\`\`\`ts
const answer = 42;
\`\`\`
`;

describe("manifest and freshness", () => {
  it("derives deterministic metadata, ranges, links, tasks, languages, assets, and stats", async () => {
    const first = await deriveManifest(source, {
      docId: "doc-manifest",
      revision: 3,
    });
    const second = await deriveManifest(source, {
      docId: "doc-manifest",
      revision: 3,
    });

    expect(second).toEqual(first);
    expect(first.metadata).toMatchObject({
      title: "Manifest fixture",
      lang: "en",
      tags: ["format", "test"],
    });
    expect(first.headings).toEqual([
      {
        level: 1,
        text: "Same",
        anchor: "same",
        lineStart: 10,
        lineEnd: 10,
        sectionEndLine: 20,
      },
      {
        level: 2,
        text: "Same",
        anchor: "same-2",
        lineStart: 14,
        lineEnd: 14,
        sectionEndLine: 20,
      },
    ]);
    expect(first.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destination: "./guide.md", line: 12 }),
        expect.objectContaining({ kind: "image", line: 16 }),
      ]),
    );
    expect(first.tasks).toEqual([
      { checked: false, line: 12, text: "Pending [guide](./guide.md)" },
    ]);
    expect(first.codeLanguages).toEqual(["ts"]);
    expect(first.assetReferences).toEqual([
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
    expect(first.stats).toMatchObject({ headings: 2, tasks: 1, assets: 1 });
  });

  it("changes sourceHash for every source-byte change", async () => {
    const initial = await deriveManifest("# Byte\n", {
      docId: "doc-byte",
      revision: 1,
    });
    const changed = await deriveManifest("# Byte", {
      docId: "doc-byte",
      revision: 1,
    });

    expect(changed.sourceHash).not.toBe(initial.sourceHash);
  });

  it("never treats a frontmatter closing delimiter at EOF as a heading", async () => {
    const manifest = await deriveManifest("---\ntitle: Only metadata\n---", {
      docId: "doc-frontmatter-only",
      revision: 1,
    });

    expect(manifest.headings).toEqual([]);
  });

  it("uses paragraph eligibility consistently for Setext headings", async () => {
    const manifest = await deriveManifest(
      [
        "- list",
        "---",
        "- [ ] task",
        "---",
        "1. ordered",
        "---",
        "> quote",
        "---",
        "---",
        "---",
        "```md",
        "inside",
        "```",
        "---",
        "[guide]: ./guide.md",
        "---",
        "<!-- source-safe -->",
        "---",
        "Valid",
        "===",
        "Valid two",
        "---",
      ].join("\n"),
      { docId: "doc-setext-eligibility", revision: 1 },
    );

    expect(
      manifest.headings.map(({ level, text }) => ({ level, text })),
    ).toEqual([
      { level: 1, text: "Valid" },
      { level: 2, text: "Valid two" },
    ]);
  });

  it("retains embedded assets declared by reference definitions", () => {
    const id = `sha256:${"b".repeat(64)}`;
    expect(
      assetReferencesFromMarkdown(
        `![shared][asset]\n\n[asset]: <yeli-asset:${id}> "Shared"\n`,
      ),
    ).toEqual([id]);
  });

  it("matches Web Crypto and the deterministic bundled fallback", async () => {
    const subtle = globalThis.crypto?.subtle;
    expect(subtle).toBeDefined();
    if (!subtle) return;

    await expect(sha256Text(source, subtle)).resolves.toBe(
      sha256Fallback(source),
    );
    await expect(sha256Text(source, null)).resolves.toBe(
      sha256Fallback(source),
    );
  });

  it("recomputes stale manifest data and keeps a stale summary inspectable", async () => {
    const payload = await createDocumentPayload("# Current\n", {
      docId: "doc-stale",
      revision: 2,
      agentSummary: {
        sourceHash: "0".repeat(64),
        updatedAt: "2026-08-31T00:00:00.000Z",
        updatedBy: "external-agent",
        content: "Old summary",
      },
    });
    payload.manifest.sourceHash = "0".repeat(64);

    const freshness = await resolveDerivedFreshness(payload, null);

    expect(freshness.manifest.status).toBe("stale");
    expect(freshness.manifest.value.sourceHash).toBe(
      sha256Fallback("# Current\n"),
    );
    expect(freshness.agentSummary).toMatchObject({
      status: "stale",
      value: { content: "Old summary" },
    });
  });
});
