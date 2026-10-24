import { describe, expect, it } from "vitest";

import {
  escapeMarkdownText,
  insertPlainTextAtSelection,
  mergeInlineTextEdit,
  plainTextFromInlineDom,
  serializeInlineDom,
  splitInlineDomAtSelection,
} from "../../src/editor/commands.ts";

describe("WYSIWYG block commands", () => {
  it("serializes only the controlled inline element vocabulary", () => {
    const root = document.createElement("div");
    root.innerHTML =
      'Plain <strong>bold</strong>, <em>italic</em>, <del>gone</del>, <code>a`b</code>, and <a href="./guide.md">guide</a>.';

    expect(serializeInlineDom(root)).toBe(
      "Plain **bold**, *italic*, ~~gone~~, ``a`b``, and [guide](./guide.md).",
    );
  });

  it("drops executable or layout-bearing DOM while retaining its text", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<script>alert(1)</script><span style="color:red" onclick="x()">safe * text</span><img src="https://example.test/x">';

    expect(serializeInlineDom(root)).toBe(String.raw`alert\(1\)safe \* text`);
  });

  it("escapes Markdown punctuation from plain browser input", () => {
    expect(escapeMarkdownText(String.raw`one * [two] \ three`)).toBe(
      String.raw`one \* \[two\] \\ three`,
    );
  });

  it("preserves untouched inline Markdown while applying a plain-text edit", () => {
    const original = '_em_ and [guide](https://x.test "Docs") with (notes)';
    expect(
      mergeInlineTextEdit(
        original,
        "em and guide with (notes)",
        "em and manual with (notes)",
      ),
    ).toBe('_em_ and [manual](https://x.test "Docs") with (notes)');
    expect(
      mergeInlineTextEdit(
        original,
        "em and guide with (notes)",
        "em and guide with (notes)!",
      ),
    ).toBe(`${original}!`);
  });

  it("reads line breaks from the editable DOM without serializing formatting", () => {
    const root = document.createElement("div");
    root.innerHTML = "one<br><strong>two</strong>";
    expect(plainTextFromInlineDom(root)).toBe("one\ntwo");
  });

  it("splits inline Markdown at a collapsed DOM selection", () => {
    const root = document.createElement("div");
    root.innerHTML = "<strong>before after</strong>";
    document.body.append(root);
    const text = root.querySelector("strong")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 6);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(splitInlineDomAtSelection(root)).toEqual({
      after: "** after**",
      before: "**before**",
    });
    root.remove();
  });

  it("falls back to the focused editable when WebKit clears the paste selection", () => {
    const root = document.createElement("div");
    root.textContent = "before";
    document.body.append(root);
    window.getSelection()?.removeAllRanges();

    expect(insertPlainTextAtSelection("\nafter", root)).toBe(true);
    expect(root.textContent).toBe("before\nafter");

    root.remove();
  });

  it("does not paste into a selection outside the receiving editable", () => {
    const outside = document.createElement("div");
    outside.textContent = "outside";
    const root = document.createElement("div");
    root.textContent = "inside";
    document.body.append(outside, root);
    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(insertPlainTextAtSelection(" paste", root)).toBe(true);
    expect(outside.textContent).toBe("outside");
    expect(root.textContent).toBe("inside paste");

    outside.remove();
    root.remove();
  });
});
