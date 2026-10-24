import { describe, expect, it } from "vitest";

import { deriveDisplayTitle } from "../../src/document/title.ts";

describe("display title", () => {
  it("uses frontmatter, first H1, filename, then the localized fallback", () => {
    expect(
      deriveDisplayTitle("---\ntitle: Frontmatter title\n---\n# Heading", {
        filename: "file.yeli.html",
        unnamed: "Untitled",
      }),
    ).toBe("Frontmatter title");
    expect(
      deriveDisplayTitle("## Intro\n\n# First H1\n", {
        filename: "file.yeli.html",
        unnamed: "Untitled",
      }),
    ).toBe("First H1");
    expect(
      deriveDisplayTitle("Plain text", {
        filename: "project-notes.yeli.html",
        unnamed: "Untitled",
      }),
    ).toBe("project-notes");
    expect(
      deriveDisplayTitle("Plain text", {
        filename: "document.yeli.html",
        unnamed: "Untitled",
      }),
    ).toBe("Untitled");
  });

  it("ignores H1-looking text inside fenced code", () => {
    expect(
      deriveDisplayTitle("```md\n# Not a title\n```\n", {
        filename: "fallback.md",
        unnamed: "Untitled",
      }),
    ).toBe("fallback");
  });
});
