import { describe, expect, it } from "vitest";

import { derivePresentation } from "../../src/editor/presentation.ts";

describe("Read-derived presentation", () => {
  it("uses H1 sections when at least two exist and keeps nested content in its page", () => {
    const source =
      "---\ntitle: Deck\n---\n# One\nIntro\n## Detail\nMore\n# Two\nEnd\n";
    const result = derivePresentation(source);

    expect(result).toMatchObject({ eligible: true, level: 1 });
    if (!result.eligible) throw new Error("expected eligible presentation");
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({ title: "One" });
    expect(
      result.sections[0] ? sourceSlice(source, result.sections[0]) : "",
    ).toContain("## Detail\nMore");
    expect(
      result.sections[1] ? sourceSlice(source, result.sections[1]) : "",
    ).toBe("# Two\nEnd\n");
  });

  it("falls back to H2 only when the document has no H1", () => {
    const result = derivePresentation("# Lone title\n## One\nA\n## Two\nB\n");
    expect(result).toMatchObject({ eligible: false, reason: "mixed-levels" });

    const h2 = derivePresentation("## One\nA\n### Detail\n## Two\nB\n");
    expect(h2).toMatchObject({ eligible: true, level: 2 });
  });

  it("explains why a document with fewer than two eligible sections cannot present", () => {
    expect(derivePresentation("# Only section\nBody\n")).toEqual({
      eligible: false,
      reason: "not-enough-sections",
    });
  });

  it("ignores heading-looking code and admits source-faithful Setext sections", () => {
    const fenced = derivePresentation(
      "```markdown\n# Not a section\n# Still code\n```\n",
    );
    expect(fenced).toEqual({
      eligible: false,
      reason: "not-enough-sections",
    });

    const setext = derivePresentation("One\n===\nA\nTwo\n===\nB\n");
    expect(setext).toMatchObject({ eligible: true, level: 1 });
    if (!setext.eligible) throw new Error("expected eligible presentation");
    expect(setext.sections.map((section) => section.title)).toEqual([
      "One",
      "Two",
    ]);
    expect(
      setext.sections[0]
        ? sourceSlice("One\n===\nA\nTwo\n===\nB\n", setext.sections[0])
        : "",
    ).toBe("One\n===\nA\n");
  });
});

function sourceSlice(
  source: string,
  section: { from: number; to: number },
): string {
  return source.slice(section.from, section.to);
}
