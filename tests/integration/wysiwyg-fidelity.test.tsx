import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  applySourcePatch,
  sourceDiffRange,
} from "../../src/editor/source-ranges.ts";
import {
  createBlockReplacementPatch,
  createConstructPatch,
  projectMarkdown,
} from "../../src/editor/block-projection.ts";
import { renderSafeMarkdown } from "../../src/render/safe-markdown.ts";

const fixture = readFileSync(
  resolve("tests/fixtures/fidelity/wysiwyg-combinations.md"),
  "utf8",
);

function generatedCombinations(): string[] {
  const prefixes = ["", "---\ntitle: T\n---\n\n"];
  const lists = ["- parent\n  - child\n", "1. parent\n   - [ ] child\n"];
  const tails = [
    "\n[ref]: ./x.md\n\nParagraph [x][ref].\n",
    "\n```txt\n---\n```\n\n> adjacent quote\n",
  ];
  return prefixes.flatMap((prefix) =>
    lists.flatMap((list) => tails.map((tail) => `${prefix}${list}${tail}`)),
  );
}

function generatedPropertyCases(count = 32): string[] {
  let state = 0x5eed1234;
  const next = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  return Array.from({ length: count }, (_, index) => {
    const marker = next() % 2 === 0 ? "-" : `${(next() % 4) + 1}.`;
    const frontmatter =
      next() % 2 === 0
        ? `---\ntitle: Case ${index}\ncustom-${index}: keep\n---\n\n`
        : "";
    const fence =
      next() % 2 === 0 ? "```txt\n---\n```" : "~~~txt\n| raw |\n~~~";
    return `${frontmatter}# Case ${index} 🧭\n\n${marker} parent ${index}\n   - [ ] 子項 ${index}\n\nParagraph &amp; \\*literal\\*  two  spaces.\n\n${fence}\n\n[ref-${index}]: ./x-${index}.md\n`;
  });
}

describe("WYSIWYG fidelity differential", () => {
  it("preserves no-edit identity for deterministic grammar combinations", () => {
    for (const [index, source] of [
      ...generatedCombinations(),
      ...generatedPropertyCases(),
    ].entries()) {
      const projection = projectMarkdown(source, index + 1);
      expect(projection.source).toBe(source);
      expect(
        projection.blocks.map((block) => block.expectedText).join(""),
      ).toBe(source);
    }
  });

  it("keeps generated target diffs within one construct and source-safe tails exact", () => {
    for (const [index, source] of generatedPropertyCases().entries()) {
      const revision = index + 101;
      const projection = projectMarkdown(source, revision);
      const heading = projection.blocks.find(
        (block) => block.kind === "heading",
      )!;
      const reference = projection.blocks.find(
        (block) => block.kind === "reference-definition",
      )!;
      const patch = createConstructPatch(
        heading,
        { kind: "block-content" },
        `Changed ${index} 🧭`,
      );
      const result = applySourcePatch(source, { revision }, patch);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const diff = sourceDiffRange(source, result.source)!;
      expect(diff.before.from).toBeGreaterThanOrEqual(patch.range.from);
      expect(diff.before.to).toBeLessThanOrEqual(patch.range.to);
      expect(result.source).toContain(reference.expectedText);
      expect(result.source.slice(patch.range.from + patch.insert.length)).toBe(
        source.slice(patch.range.to),
      );
    }
  });

  it("changes only the asserted construct range", () => {
    const projection = projectMarkdown(fixture, 9);
    for (const kind of [
      "heading",
      "paragraph",
      "list-item",
      "task",
      "quote",
    ] as const) {
      const block = projection.blocks.find(
        (candidate) => candidate.kind === kind,
      )!;
      const replacement = `${block.expectedText.slice(0, -1)} [changed]\n`;
      const patch = createBlockReplacementPatch(block, replacement);
      const result = applySourcePatch(fixture, { revision: 9 }, patch);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const diff = sourceDiffRange(fixture, result.source)!;
      expect(diff.before.from).toBeGreaterThanOrEqual(block.range.from);
      expect(diff.before.to).toBeLessThanOrEqual(block.range.to);
      expect(diff.after.from).toBeGreaterThanOrEqual(block.range.from);
      expect(diff.after.to).toBeLessThanOrEqual(
        block.range.from + replacement.length,
      );
      expect(result.source.slice(0, block.range.from)).toBe(
        fixture.slice(0, block.range.from),
      );
      expect(result.source.slice(block.range.from + replacement.length)).toBe(
        fixture.slice(block.range.to),
      );
    }
  });

  it("keeps hostile projection pure-data and rendering inert", () => {
    const hostile = [
      "<script>window.pwned = true</script>",
      "![remote](https://example.test/tracker.png)",
      "[bad](javascript:alert(1))",
      "<img src=x onerror=alert(1)>",
    ].join("\n\n");
    const projection = projectMarkdown(hostile, 1);
    expect(projection.source).toBe(hostile);
    expect(projection.blocks[0]).toMatchObject({
      editable: false,
      kind: "raw-html",
    });

    const container = document.createElement("div");
    container.innerHTML = renderSafeMarkdown(hostile);
    expect(
      container.querySelector("script, img, iframe, object, svg"),
    ).toBeNull();
    expect(container.querySelector("[onerror], [onclick]")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.textContent).toContain("javascript:alert(1)");
    expect(container.innerHTML).not.toContain("tracker.png");
  });

  it("projects a 1 MiB source within the U8 performance signal", () => {
    const unit = "# Heading 🧭\n\n- parent\n  - [ ] child\n\nParagraph.\n\n";
    const large = unit.repeat(Math.ceil((1024 * 1024) / unit.length));
    const started = performance.now();
    const projection = projectMarkdown(large, 1);
    const elapsed = performance.now() - started;
    expect(projection.source.length).toBeGreaterThanOrEqual(1024 * 1024);
    expect(projection.blocks.length).toBeGreaterThan(1_000);
    expect(elapsed).toBeLessThan(2_000);
  });
});
