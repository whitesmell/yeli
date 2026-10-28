import { describe, expect, it } from "vitest";

import { renderDocumentMarkdown } from "../../src/render/markdown.ts";

function render(source: string) {
  const root = document.createElement("div");
  root.innerHTML = renderDocumentMarkdown(source);
  return root;
}

describe("footnote rendering boundary", () => {
  it("keeps hostile labels out of IDs and sanitizes active content in used and unused bodies", () => {
    const root = render(
      [
        "# yeli fn 1",
        "",
        'Body[^"><img/src=x/onerror=alert(1)>] and ^[<script>alert(1)</script>].',
        "",
        '[^"><img/src=x/onerror=alert(1)>]: [bad](javascript:alert(1)) ![remote](https://example.test/tracker.png)',
        "",
        "[^unused]: <iframe src=//example.test> ![remote](https://example.test/unused.png)",
      ].join("\n"),
    );
    expect(root.querySelector("script,img,iframe,svg,object")).toBeNull();
    expect(root.querySelector("[onerror],[onclick]")).toBeNull();
    expect(root.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(root.querySelector(".footnote-extra")).not.toBeNull();
    const ids = [...root.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids).toContain("yeli:fn:1");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => !id.includes("<"))).toBe(true);
  });

  it("leaves escaped references and code literals intact", () => {
    const root = render(
      [
        "\\[^n] and `[^n]` and real[^n].",
        "",
        "```md",
        "[^literal]: code",
        "```",
        "",
        "[^n]: Safe **body**.",
      ].join("\n"),
    );
    expect(root.querySelectorAll(".footnote-ref")).toHaveLength(1);
    expect(root.querySelectorAll(".footnote-item")).toHaveLength(1);
    expect(root.querySelector("pre code")?.textContent).toContain(
      "[^literal]: code",
    );
  });
});
