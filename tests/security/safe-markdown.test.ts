import { describe, expect, it } from "vitest";

import { renderSafeMarkdown } from "../../src/render/safe-markdown";

describe("safe Markdown boundary", () => {
  it("keeps raw HTML inert", () => {
    const rendered = renderSafeMarkdown(
      "# Safe\n\n<script>globalThis.pwned = true</script>\n\n<img src=x onerror=alert(1)>",
    );
    document.body.innerHTML = rendered;

    expect(document.querySelector("script, img")).toBeNull();
    expect(rendered).toContain("&lt;script&gt;");
    expect(document.body.textContent).toContain("onerror=alert(1)");
  });

  it("blocks image loading, including remote and data URLs", () => {
    const rendered = renderSafeMarkdown(
      "![remote](https://tracker.invalid/pixel.png) ![data](data:image/png;base64,AAAA)",
    );

    expect(rendered).not.toContain("<img");
    expect(rendered).not.toContain("tracker.invalid");
    expect(rendered).not.toContain("data:image");
    expect(rendered).toContain("Image not loaded");
  });

  it("does not produce executable javascript links", () => {
    const rendered = renderSafeMarkdown("[run](javascript:alert(1))");
    document.body.innerHTML = rendered;

    expect(document.querySelector("a")).toBeNull();
    expect(document.body.textContent).toContain("javascript:alert(1)");
  });
});
