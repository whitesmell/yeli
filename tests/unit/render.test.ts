import { describe, expect, it } from "vitest";

import {
  renderDocumentMarkdown,
  renderDocumentMarkdownSegments,
  renderSafeInlineMarkdown,
} from "../../src/render/markdown.ts";

describe("U3 Markdown rendering boundary", () => {
  it("omits frontmatter and adds stable duplicate heading anchors", () => {
    const html = renderDocumentMarkdown(`---
title: Example
---
# Same

# Same
`);
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.textContent).not.toContain("title: Example");
    expect(container.querySelectorAll("h1")[0]?.id).toBe("same");
    expect(container.querySelectorAll("h1")[1]?.id).toBe("same-2");
  });

  it("allows only an explicitly resolved embedded image", () => {
    const html = renderDocumentMarkdown(
      "![local](yeli-demo:workspace-photo)\n\n![remote](https://example.test/x.png)\n",
      {
        resolveImage(destination) {
          return destination === "yeli-demo:workspace-photo"
            ? "data:image/webp;base64,UklGRg=="
            : null;
        },
      },
    );
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")?.alt).toBe("local");
    expect(container.textContent).toContain("remote: Image not loaded");
    expect(container.innerHTML).not.toContain("example.test");
  });

  it("keeps hostile HTML and unsafe URLs inert", () => {
    const html = renderDocumentMarkdown(
      "<script>window.pwned=true</script>\n\n[bad](javascript:alert(1))",
    );
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(
      container.querySelector("script, img, iframe, object, svg"),
    ).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("escapes localized image notices while keeping remote images blocked", () => {
    const container = document.createElement("div");
    container.innerHTML = renderDocumentMarkdown(
      "![remote](https://example.test/image.png)",
      { imageUnavailableLabel: '图片未加载 <img src=x onerror="alert(1)">' },
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain(
      '图片未加载 <img src=x onerror="alert(1)">',
    );
    expect(
      container.querySelector(".blocked-media")?.getAttribute("role"),
    ).toBe("note");
  });

  it("renders inline Markdown without a paragraph wrapper", () => {
    expect(
      renderSafeInlineMarkdown("**Portable** and [local](./guide.md)"),
    ).toContain("<strong>Portable</strong>");
  });

  it("uses callout treatment only when the source opts in", () => {
    expect(
      renderDocumentMarkdownSegments("> ordinary quote\n").callout,
    ).toBeNull();
    expect(
      renderDocumentMarkdownSegments(`---
title: Example
yeli-callout: first-quote
---
> highlighted quote
`).callout,
    ).toContain("highlighted quote");
  });

  it("makes external links explicit and blocks unapproved protocols", () => {
    const container = document.createElement("div");
    container.innerHTML = renderDocumentMarkdown(
      "[web](https://example.test) [local](./guide.md) [file](file:///tmp/x) [protocol](//example.test)",
    );
    const web = container.querySelector<HTMLAnchorElement>(
      'a[href="https://example.test"]',
    );
    expect(web?.target).toBe("_blank");
    expect(web?.rel).toBe("noopener noreferrer");
    expect(container.querySelector('a[href="./guide.md"]')).not.toBeNull();
    expect(container.querySelector('a[href^="file:"]')).toBeNull();
    expect(container.querySelector('a[href^="//"]')).toBeNull();
    expect(container.querySelectorAll("a.blocked-link")).toHaveLength(1);
  });

  it("renders task state as an inert native control", () => {
    const container = document.createElement("div");
    container.innerHTML = renderDocumentMarkdown(
      "- [x] Complete\n- [ ] Open\n",
    );
    const tasks = container.querySelectorAll<HTMLInputElement>(
      "input.task-checkbox",
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.checked).toBe(true);
    expect(tasks[1]?.checked).toBe(false);
    expect(
      [...tasks].every(
        (task) =>
          task.disabled &&
          task.tabIndex === -1 &&
          task.getAttribute("aria-disabled") === "true",
      ),
    ).toBe(true);
  });

  it("binds sanitized Read elements to projection-owned source ranges", () => {
    const source = `---
title: Mapped
---
## Section

Plain paragraph

- [ ] Task

> Quote

| Name | Value |
| --- | --- |
| A | B |
`;
    const container = document.createElement("div");
    container.innerHTML = renderDocumentMarkdown(source, { revision: 9 });
    const mapped = [
      ...container.querySelectorAll<HTMLElement>("[data-read-block-id]"),
    ];

    expect(mapped.map((element) => element.dataset.sourceKind)).toEqual([
      "heading",
      "paragraph",
      "task",
      "quote",
      "table",
    ]);
    expect(
      mapped.every(
        (element) =>
          element.dataset.sourceRevision === "9" &&
          Number.isSafeInteger(Number(element.dataset.sourceFrom)) &&
          Number(element.dataset.sourceTo) > Number(element.dataset.sourceFrom),
      ),
    ).toBe(true);
  });

  it("maps many Read blocks to ordered, unique source ranges", () => {
    const source = Array.from(
      { length: 1_200 },
      (_, index) => `Paragraph ${index}`,
    ).join("\n\n");
    const container = document.createElement("div");
    container.innerHTML = renderDocumentMarkdown(source, { revision: 12 });
    const mapped = [
      ...container.querySelectorAll<HTMLElement>("[data-read-block-id]"),
    ];
    const starts = mapped.map((element) => Number(element.dataset.sourceFrom));

    expect(mapped).toHaveLength(1_200);
    expect(
      new Set(mapped.map((element) => element.dataset.readBlockId)).size,
    ).toBe(1_200);
    expect(starts).toEqual([...starts].sort((left, right) => left - right));
  });

  it("does not accept document-provided mapping attributes as authority", () => {
    const container = document.createElement("div");
    container.innerHTML = renderDocumentMarkdown(
      '<div data-read-block-id="forged" data-source-from="999">hostile</div>\n',
      { revision: 3 },
    );

    expect(container.querySelector('[data-read-block-id="forged"]')).toBeNull();
    expect(
      container.querySelector("[data-read-block-id]")?.textContent,
    ).toContain("hostile");
  });
});
