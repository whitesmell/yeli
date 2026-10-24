import { describe, expect, it } from "vitest";

import {
  deriveOutline,
  filterOutlineTree,
  nestOutline,
} from "../../src/editor/outline.ts";

describe("document outline", () => {
  it("derives ATX and Setext headings while ignoring frontmatter and fenced code", () => {
    const source = `---
title: Metadata title
---
# First

Second
------

\`\`\`md
# Not a heading
\`\`\`

### Third

# First
`;

    expect(deriveOutline(source)).toEqual([
      { anchor: "first", level: 1, text: "First" },
      { anchor: "second", level: 2, text: "Second" },
      { anchor: "third", level: 3, text: "Third" },
      { anchor: "first-2", level: 1, text: "First" },
    ]);
  });

  it("does not promote block constructs followed by dividers to Setext headings", () => {
    const source = [
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
    ].join("\n");

    expect(deriveOutline(source)).toEqual([
      { anchor: "valid", level: 1, text: "Valid" },
      { anchor: "valid-two", level: 2, text: "Valid two" },
    ]);
  });

  it("nests headings under the nearest shallower ancestor without inventing levels", () => {
    const tree = nestOutline([
      { anchor: "a", level: 2, text: "A" },
      { anchor: "b", level: 4, text: "B" },
      { anchor: "c", level: 3, text: "C" },
      { anchor: "d", level: 2, text: "D" },
    ]);

    expect(tree).toEqual([
      {
        anchor: "a",
        children: [
          { anchor: "b", children: [], level: 4, text: "B" },
          { anchor: "c", children: [], level: 3, text: "C" },
        ],
        level: 2,
        text: "A",
      },
      { anchor: "d", children: [], level: 2, text: "D" },
    ]);
  });

  it("keeps matching descendants and their ancestors when filtering", () => {
    const tree = nestOutline([
      { anchor: "parent", level: 1, text: "Parent" },
      { anchor: "target", level: 2, text: "Target child" },
      { anchor: "other", level: 1, text: "Other" },
    ]);

    expect(filterOutlineTree(tree, "target")).toEqual([
      {
        anchor: "parent",
        children: [
          {
            anchor: "target",
            children: [],
            level: 2,
            text: "Target child",
          },
        ],
        level: 1,
        text: "Parent",
      },
    ]);
  });
});
