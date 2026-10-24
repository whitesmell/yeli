import { describe, expect, it } from "vitest";

import { applyDocumentTransaction } from "../../src/document/transactions.ts";
import { projectMarkdown } from "../../src/editor/block-projection.ts";
import {
  buildSearchIndex,
  buildSearchIndexCooperative,
  buildSearchReplacement,
  SEARCH_MAX_MATCHES,
  searchIndex,
  searchIndexCooperative,
} from "../../src/editor/search-index.ts";

function index(source: string, revision = 1) {
  return buildSearchIndex(projectMarkdown(source, revision));
}

describe("visible-text search index", () => {
  it("finds supported block families in canonical source order", () => {
    const source = `# Needle heading

Needle paragraph

- Needle list
- [ ] Needle task

> Needle quote

| Name | Value |
| --- | --- |
| Needle cell | Other |

\`\`\`text
Needle code
\`\`\`
`;
    const result = searchIndex(index(source, 7), "needle");

    expect(result.matches.map((match) => match.block.kind)).toEqual([
      "heading",
      "paragraph",
      "list-item",
      "task",
      "quote",
      "table",
      "code-fence",
    ]);
    expect(result.matches.every((match) => match.replaceable)).toBe(true);
    expect(
      result.matches
        .map((match) => match.sourceRange!.from)
        .every(
          (from, offset, values) => offset === 0 || from > values[offset - 1]!,
        ),
    ).toBe(true);
  });

  it("normalizes case and composed Unicode without inventing replacement ranges", () => {
    const source = "Café\n\nCAFE\u0301\n\nNo match\n";
    const result = searchIndex(index(source), "CAFÉ");

    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((match) => match.text)).toEqual([
      "Café",
      "CAFE\u0301",
    ]);
    expect(result.matches[0]?.replaceable).toBe(true);
    expect(result.matches[1]?.replaceable).toBe(true);
  });

  it("keeps inline-rich and source-safe matches navigable but view-only", () => {
    const source = `Plain **needle** and [needle](https://example.test)

<div>needle source-safe</div>
`;
    const result = searchIndex(index(source), "needle");

    expect(result.matches).toHaveLength(3);
    expect(result.matches.map((match) => match.replaceable)).toEqual([
      false,
      false,
      false,
    ]);
    expect(result.matches[0]?.viewOnlyReason).toBe("inline-mapping-ambiguous");
    expect(result.matches[2]?.viewOnlyReason).toBe("source-safe-block");
  });

  it("indexes a source-safe fence at EOF without a trailing newline", () => {
    const source = "```mermaid\ngraph TD\nNeedle --> Result\n```";
    const result = searchIndex(index(source), "needle");

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      replaceable: false,
      text: "Needle",
      viewOnlyReason: "source-safe-block",
    });
  });

  it("keeps a match spanning projected blocks navigable but view-only", () => {
    const result = searchIndex(
      index("Ends here\n\nStarts there\n"),
      "here starts",
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      replaceable: false,
      sourceRange: null,
      viewOnlyReason: "cross-block",
    });
  });

  it("builds replace-one and replace-all as one revision-bound transaction", () => {
    const source = "needle one needle\n\nAfter\n";
    const search = index(source, 4);
    const matches = searchIndex(search, "needle").matches;
    const one = buildSearchReplacement(
      search,
      [matches[0]!],
      "found",
      "search.replace-one",
    );
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const oneResult = applyDocumentTransaction(
      {
        assets: [],
        revision: 4,
        source,
        sourceHash: search.sourceHash,
      },
      one.transaction,
    );
    expect(oneResult).toMatchObject({ ok: true, undoEntries: 1, revision: 5 });
    if (!oneResult.ok) return;
    expect(oneResult.source).toBe("found one needle\n\nAfter\n");

    const all = buildSearchReplacement(
      search,
      matches,
      "found",
      "search.replace-all",
    );
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    const allResult = applyDocumentTransaction(
      {
        assets: [],
        revision: 4,
        source,
        sourceHash: search.sourceHash,
      },
      all.transaction,
    );
    expect(allResult).toMatchObject({ ok: true, undoEntries: 1, revision: 5 });
    if (allResult.ok)
      expect(allResult.source).toBe("found one found\n\nAfter\n");
  });

  it("escapes table replacements and rejects stale or unsafe writes", () => {
    const source = `| Name | Value |
| --- | --- |
| Needle | One |
`;
    const search = index(source, 2);
    const match = searchIndex(search, "needle").matches[0]!;
    const replacement = buildSearchReplacement(
      search,
      [match],
      "A|B",
      "search.replace-one",
    );
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;
    const result = applyDocumentTransaction(
      {
        assets: [],
        revision: 2,
        source,
        sourceHash: search.sourceHash,
      },
      replacement.transaction,
    );
    expect(result.ok && result.source).toContain("| A\\|B | One |");

    expect(
      applyDocumentTransaction(
        {
          assets: [],
          revision: 3,
          source: `${source}\nchanged`,
          sourceHash: projectMarkdown(`${source}\nchanged`, 3).sourceHash,
        },
        replacement.transaction,
      ),
    ).toMatchObject({ ok: false, code: "STALE_REVISION" });
    expect(
      buildSearchReplacement(
        search,
        [match],
        "line\nbreak",
        "search.replace-one",
      ),
    ).toEqual({ code: "UNSAFE_REPLACEMENT", ok: false });
  });

  it("bounds retained results and rejects oversized queries deterministically", () => {
    const source = `${"needle ".repeat(SEARCH_MAX_MATCHES + 50)}\n`;
    const result = searchIndex(index(source), "needle");
    expect(result.matches).toHaveLength(SEARCH_MAX_MATCHES);
    expect(result).toMatchObject({
      limitedReason: "result-budget",
      truncated: true,
    });
    expect(searchIndex(index(source), "x".repeat(257))).toMatchObject({
      limitedReason: "query-too-long",
      matches: [],
      truncated: true,
    });
    expect(searchIndex(index(source), "")).toMatchObject({
      matches: [],
      truncated: false,
    });
    expect(searchIndex(index(source), "absent")).toMatchObject({
      matches: [],
      truncated: false,
    });
  });

  it("omits a large rich block rather than indexing hidden raw-source text", () => {
    const source = `${"x".repeat(64 * 1024)} [label](https://hidden-needle.test)\n`;
    const search = index(source);
    const result = searchIndex(search, "hidden-needle");

    expect(search.limitedReasons).toContain("large-block");
    expect(result.matches).toHaveLength(0);
    expect(
      buildSearchReplacement(
        search,
        result.matches,
        "changed",
        "search.replace-all",
      ),
    ).toEqual({ code: "NO_SAFE_MATCHES", ok: false });
  });

  it("cancels cooperative indexing before publishing stale work", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      buildSearchIndexCooperative(projectMarkdown("Needle\n", 1), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels a cooperative large-document query without retaining stale matches", async () => {
    const controller = new AbortController();
    const pending = searchIndexCooperative(
      index(`${"界".repeat(1024 * 1024)} needle\n`),
      "needle",
      { signal: controller.signal, sliceMs: 1 },
    );
    globalThis.setTimeout(() => controller.abort(), 0);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("takes a bounded fallback when cooperative Unicode search exhausts its budget", async () => {
    const result = await searchIndexCooperative(
      index(`${"界".repeat(128 * 1024)} needle\n`),
      "needle",
      { sliceMs: 1, timeBudgetMs: 1 },
    );

    expect(result).toMatchObject({
      limitedReason: "time-budget",
      truncated: true,
    });
    expect(result.matches.length).toBeLessThanOrEqual(SEARCH_MAX_MATCHES);
  });
});
