import { describe, expect, it } from "vitest";

import {
  MARKDOWN_SYNTAX_GUIDE,
  markdownSyntaxForQuery,
} from "../../src/editor/markdown-guide.ts";

describe("Markdown guide", () => {
  it("covers the supported CommonMark and GFM block and inline families", () => {
    expect(MARKDOWN_SYNTAX_GUIDE.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "heading",
        "bold",
        "italic",
        "strike",
        "link",
        "image",
        "quote",
        "bullet-list",
        "ordered-list",
        "task",
        "inline-code",
        "code-fence",
        "table",
        "divider",
      ]),
    );
  });

  it("searches localized names, examples, and syntax keywords", () => {
    expect(
      markdownSyntaxForQuery("zh-CN", "表格").map((item) => item.id),
    ).toEqual(["table"]);
    expect(markdownSyntaxForQuery("en", "```").map((item) => item.id)).toEqual([
      "code-fence",
    ]);
  });
});
