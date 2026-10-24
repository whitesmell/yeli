import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createMarkdownExport } from "../../src/export/markdown.ts";
import { openEmbeddedYeli } from "../../src/format/open.ts";
import { parseYeliArtifact } from "../../src/format/parse.ts";
import { createSavedArtifact } from "../../src/format/save.ts";
import { createStaticHtmlExport } from "../../src/format/static-preview.ts";

const artifactPath = resolve("dist/html/starter.zh-CN.yeli.html");

describe("built artifact import and export", () => {
  it("opens, saves, and reopens the exact single-file release", async () => {
    const artifact = readFileSync(artifactPath, "utf8");
    document.open();
    document.write(artifact);
    document.close();

    const opened = await openEmbeddedYeli(document);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const nextSource = `${opened.document.markdown}\n## Round trip\n\nSaved from the lifecycle test.\n`;
    const saved = await createSavedArtifact({
      payload: opened.document.payload,
      releaseTemplate: opened.document.releaseTemplate,
      revision: opened.document.payload.revision + 1,
      source: nextSource,
    });
    const reopened = await parseYeliArtifact(saved.artifact);

    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.markdown).toBe(nextSource);
    expect(saved.artifact.match(/<script id="yeli-doc"/gu)).toHaveLength(1);
    expect(saved.artifact).not.toContain("<style");
    expect(
      saved.artifact.match(/<!-- YELI_STATIC_PREVIEW_START -->/gu),
    ).toHaveLength(1);
  });

  it("exports canonical LF Markdown and a script-free publication", async () => {
    const artifact = readFileSync(artifactPath, "utf8");
    document.open();
    document.write(artifact);
    document.close();
    const opened = await openEmbeddedYeli(document);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const markdown = createMarkdownExport("# Title\r\n\rBody\r", "Title");
    const html = createStaticHtmlExport(
      opened.document.payload,
      opened.document.markdown,
    );

    expect(markdown).toEqual({
      content: "# Title\n\nBody\n",
      filename: "Title.md",
    });
    expect(html.html).not.toContain("<script");
    expect(html.html).not.toContain('src="https:');
    expect(html.html).toContain("default-src 'none'");
    // Parsing the complete single-file artifact in jsdom can exceed the
    // default 5s limit when the full suite runs concurrently.
  }, 15_000);
});
