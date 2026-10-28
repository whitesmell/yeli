import { describe, expect, it } from "vitest";
import { createDocumentPayload } from "../../src/document/model.ts";
import { DocumentStore } from "../../src/document/store.ts";
import {
  createFootnoteBodyPatch,
  indexFootnotes,
} from "../../src/editor/footnotes.ts";
import { projectMarkdown } from "../../src/editor/block-projection.ts";
import {
  serializeInlineDom,
  plainTextFromInlineDom,
} from "../../src/editor/commands.ts";
import { deriveOutline } from "../../src/editor/outline.ts";
import { createStaticHtmlExport } from "../../src/format/static-preview.ts";
import {
  createInlineFootnoteContext,
  renderDocumentMarkdown,
  renderSafeInlineMarkdown,
} from "../../src/render/markdown.ts";
import { captureReadEditTarget } from "../../src/ui/read-handoff.ts";

const source = [
  "---",
  "title: Exact",
  "custom: keep",
  "---",
  "",
  "Body[^note] and again[^note]. Inline ^[**inline**]. Missing[^missing].",
  "",
  "[^note]: **Strong** and [safe](https://example.test).",
  "    second  line.",
  "",
  "    Another paragraph.",
  "",
  "    ```text",
  "    [^literal]: not a note",
  "    ```",
  "",
  "[^unused]: Unused **visible**.",
  "",
].join("\r\n");

function html(source: string) {
  const root = document.createElement("div");
  root.innerHTML = renderDocumentMarkdown(source);
  return root;
}

describe("source-bound footnotes", () => {
  it("uses markdown-it 15 with footnote 4 for multiline, inline and repeated references", () => {
    const root = html(source);
    expect(root.querySelectorAll(".footnote-ref")).toHaveLength(3);
    expect(root.querySelectorAll(".footnote-item")).toHaveLength(2);
    expect(root.querySelectorAll(".footnote-backref")).toHaveLength(3);
    expect(root.querySelector(".footnote-item strong")?.textContent).toBe(
      "Strong",
    );
    expect(root.querySelector(".footnote-item")?.textContent).toContain(
      "Another paragraph.",
    );
    expect(root.textContent).toContain("Missing[^missing]");
    expect(root.textContent).not.toContain("custom: keep");
    expect(root.querySelector(".footnote-extra strong")?.textContent).toBe(
      "visible",
    );
    const ids = [...root.querySelectorAll("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const anchor of root.querySelectorAll("a[href^='#']")) {
      expect(ids).toContain(anchor.getAttribute("href")!.slice(1));
    }
    expect(ids).toContain("yeli:fnref:1:2");
  });

  it("keeps exact definitions, internal blank paragraphs and CRLF mapped", () => {
    const notes = indexFootnotes(source);
    expect(notes.map((note) => note.label)).toEqual(["note", "unused"]);
    expect(notes[0]?.body).toBe(
      "**Strong** and [safe](https://example.test).\nsecond  line.\n\nAnother paragraph.\n\n```text\n[^literal]: not a note\n```",
    );
    expect(notes[0]?.prefix).toBe("[^note]: ");
    expect(source.slice(notes[0]!.from, notes[0]!.to)).toContain(
      "\r\n\r\n    Another",
    );
    const blocks = projectMarkdown(source, 3).blocks;
    expect(blocks.filter((block) => block.kind === "footnote")).toHaveLength(2);
    expect(blocks.map((block) => block.expectedText).join("")).toBe(source);
  });

  it("changes only body bytes, preserves indentation/EOL, supports undo and rejects stale edits", () => {
    const store = new DocumentStore(source, 4);
    const note = indexFootnotes(source)[0]!;
    expect(
      createFootnoteBodyPatch(source, note, note.body, store.getSnapshot()),
    ).toBeNull();
    const patch = createFootnoteBodyPatch(
      source,
      note,
      note.body.replace("Another paragraph.", "Changed paragraph."),
      store.getSnapshot(),
    )!;
    expect(patch.expectedText).toBe("Another");
    expect(store.applyPatch(patch).ok).toBe(true);
    expect(store.getSnapshot().source).toBe(
      source.replace("Another paragraph.", "Changed paragraph."),
    );
    expect(store.applyPatch(patch).ok).toBe(false);
    store.undo();
    expect(store.getSnapshot().source).toBe(source);
    const multiline = createFootnoteBodyPatch(
      source,
      note,
      note.body.replace("second  line.", "second  line.\nInserted."),
      store.getSnapshot(),
    )!;
    expect(store.applyPatch(multiline).ok).toBe(true);
    expect(store.getSnapshot().source).toContain(
      "second  line.\r\n    Inserted.\r\n\r\n",
    );
  });

  it("keeps unused and shadowed duplicate definitions visible and resolves case-sensitively", () => {
    const root = html(
      "Body[^A] and [^a].\n\n[^A]: shadowed\n\n[^A]: winner\n\n[^a]: lower\n\n[^unused]: keep\n",
    );
    expect(root.querySelectorAll(".footnote-item")).toHaveLength(2);
    expect(root.querySelectorAll(".footnote-extra")).toHaveLength(2);
    expect(root.querySelector(".footnote-item")?.textContent).toContain(
      "winner",
    );
    expect(root.querySelector(".footnotes-supplement")?.textContent).toContain(
      "shadowed",
    );
    expect(root.querySelector(".footnotes-supplement")?.textContent).toContain(
      "keep",
    );
  });

  it("keeps unused definitions inside containers visible in Read", () => {
    const root = html(
      "> [^quoted]: Quoted **body**.\n\n- [^listed]: Listed body.\n",
    );
    expect(root.querySelectorAll(".footnote-extra")).toHaveLength(2);
    expect(root.textContent).toContain("Quoted body.");
    expect(root.textContent).toContain("Listed body.");
  });

  it.each([
    "# Main\n\n[^unused]: # Main",
    "# Main\n\n# Main\n\nBody[^note].\n\n[^note]: # Main\n\n[^note]: # Main\n\n[^unused]: # Main\n",
  ])(
    "isolates supplementary heading IDs from the document outline: %j",
    async (markdown) => {
      const root = html(markdown);
      const outline = deriveOutline(markdown);
      const payload = await createDocumentPayload(markdown, {
        docId: "heading-notes",
        revision: 1,
      });
      expect(root.querySelector(":scope > h1")?.id).toBe("main");
      expect(
        [...root.querySelectorAll(":scope > h1")].map((heading) => heading.id),
      ).toEqual(outline.map((heading) => heading.anchor));
      expect(
        payload.manifest.headings.map((heading) => heading.anchor),
      ).toEqual(outline.map((heading) => heading.anchor));
      expect(
        [...root.querySelectorAll(".footnotes-supplement h1")].map(
          (heading) => heading.id,
        ),
      ).toEqual(
        [...root.querySelectorAll(".footnote-extra")].map(
          (_, index) => `yeli:fnextra:${index + 1}:heading:1`,
        ),
      );
      const ids = [...root.querySelectorAll("[id]")].map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      const exported = document.createElement("div");
      exported.innerHTML = createStaticHtmlExport(payload, markdown).html;
      expect(exported.querySelector("h1[id]")?.id).toBe("main");
      const exportedIds = [...exported.querySelectorAll("[id]")].map(
        (node) => node.id,
      );
      expect(new Set(exportedIds).size).toBe(exportedIds.length);
    },
  );

  it("binds rich multi-paragraph Read endnotes to the complete original definition", () => {
    const markdown =
      "Body[^n].\n\n[^n]: ## Heading\n\n    **Formatted** paragraph.\n\n    Another paragraph.\n";
    const projection = projectMarkdown(markdown, 9);
    const root = document.createElement("div");
    root.className = "read-surface";
    root.innerHTML = renderDocumentMarkdown(markdown, { revision: 9 });
    document.body.append(root);
    try {
      const note = root.querySelector<HTMLElement>(
        ".footnote-item[data-read-block-id]",
      )!;
      const definition = projection.blocks.find(
        (block) => block.kind === "footnote",
      )!;
      expect(note.dataset.readBlockId).toBe(definition.id);
      expect(Number(note.dataset.sourceFrom)).toBe(definition.range.from);
      expect(Number(note.dataset.sourceTo)).toBe(definition.range.to);
      const range = document.createRange();
      range.selectNodeContents(note.querySelector("strong")!);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      expect(captureReadEditTarget(projection)?.block).toEqual(definition);
    } finally {
      window.getSelection()?.removeAllRanges();
      root.remove();
    }
  });

  it("keeps reference atoms bound to their exact Markdown through inline serialization", () => {
    const root = document.createElement("div");
    const content =
      "Body[^note] and again[^note]. Inline ^[**inline**]. Missing[^missing].";
    root.innerHTML = renderSafeInlineMarkdown(content, {
      editorFootnotes: true,
      footnoteContext: createInlineFootnoteContext(source)!,
    });
    expect(root.querySelectorAll(".footnote-atom")).toHaveLength(3);
    expect(
      root.querySelector(".footnote-atom")?.getAttribute("contenteditable"),
    ).toBe("false");
    expect(serializeInlineDom(root)).toContain(
      "Body[^note] and again[^note]. Inline ^[**inline**]",
    );
    expect(plainTextFromInlineDom(root)).toBe(content);
    expect(root.querySelector("a[href^='#yeli:fn']")).toBeNull();
  });

  it("does not index footnote definitions as links or their headings as outline entries", async () => {
    const markdown =
      "# Main\n\nBody[^n].\n\n[^n]: ## Note heading\n\n    ### Subheading\n\n    [real](https://example.test)\n";
    const payload = await createDocumentPayload(markdown, {
      docId: "notes",
      revision: 1,
    });
    expect(payload.manifest.links.map((link) => link.destination)).toEqual([
      "https://example.test",
    ]);
    expect(payload.manifest.headings.map((heading) => heading.text)).toEqual([
      "Main",
    ]);
    expect(deriveOutline(markdown).map((heading) => heading.text)).toEqual([
      "Main",
    ]);
    const exported = createStaticHtmlExport(payload, markdown);
    expect(exported.html).toContain('class="footnote-item"');
    expect(exported.html).toContain("@media print");
  });
});
