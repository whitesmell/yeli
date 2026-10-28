import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStore } from "../../src/document/store.ts";
import { en } from "../../src/i18n/en.ts";
import { EditCanvas } from "../../src/ui/edit-canvas.tsx";
import { useDocumentStore } from "../../src/ui/use-document-store.ts";

const source = [
  "---",
  "title: Exact",
  "custom: untouched",
  "---",
  "",
  "Body[^note] and ^[inline **note**].",
  "",
  "[^note]: **Strong** and [link](https://example.test).",
  "    second  line.",
  "",
  "    Another paragraph.",
  "",
].join("\r\n");

async function update(action: () => unknown) {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await update(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(store = new DocumentStore(source, 7)) {
  store.setPrimaryMode("edit");
  function Canvas() {
    const snapshot = useDocumentStore(store);
    return (
      <EditCanvas
        assets={[]}
        displayTitle="Exact"
        handoffTarget={null}
        labels={en}
        locale="en"
        onHandoffResolved={() => undefined}
        onOpenDocumentInspector={() => undefined}
        onOpenImage={() => undefined}
        onSelectBlock={() => undefined}
        selectedBlockId={undefined}
        snapshot={snapshot}
        store={store}
      />
    );
  }
  await update(() => root.render(<Canvas />));
  return store;
}

function editor(index = 0) {
  return host.querySelectorAll<HTMLElement>(
    '.footnote-block[data-footnote-label="note"] .block-paragraph .block-content-editable',
  )[index]!;
}

async function append(editable: HTMLElement, text: string) {
  await update(() => editable.focus());
  editable.append(document.createTextNode(text));
  await update(() =>
    editable.dispatchEvent(new InputEvent("input", { bubbles: true })),
  );
}

describe("visual footnote body transactions", () => {
  it("renders formatted bodies and source-bound atoms without changing CRLF bytes", async () => {
    const store = await mount();
    expect(editor().querySelector("strong")?.textContent).toBe("Strong");
    expect(editor().querySelector("a")?.getAttribute("href")).toBe(
      "https://example.test",
    );
    expect(editor(1).textContent).toBe("Another paragraph.");
    expect(host.querySelectorAll(".footnote-atom")).toHaveLength(2);
    await update(() => editor().focus());
    await update(() => editor().blur());
    expect(store.getSnapshot().source).toBe(source);
  });

  it("commits an actual visual edit as a narrow parent transaction and undoes exact bytes", async () => {
    const store = await mount();
    await append(editor(), " Appended.");
    await update(() => editor().blur());
    expect(store.getSnapshot().source).toBe(
      source.replace("second  line.", "second  line. Appended."),
    );
    await update(() => editor().focus());
    await update(() =>
      editor().dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          key: "z",
        }),
      ),
    );
    expect(store.getSnapshot().source).toBe(source);
    await update(() => store.redo());
    expect(store.getSnapshot().source).toContain("second  line. Appended.");
  });

  it("commits a dirty visual body before parent undo without losing its source prefix", async () => {
    const store = await mount();
    await append(editor(1), " Appended.");
    await update(() =>
      editor(1).dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          key: "z",
        }),
      ),
    );
    expect(store.getSnapshot().source).toBe(source);
    await update(() => store.redo());
    expect(store.getSnapshot().source).toBe(
      source.replace("Another paragraph.", "Another paragraph. Appended."),
    );
  });

  it("undoes and redoes three visual commits from a footnote, committing its dirty body first", async () => {
    const store = await mount();
    const paragraph = host.querySelector<HTMLElement>(
      ".block-canvas > .block-paragraph .block-content-editable",
    )!;
    const first = source.replace(
      "Body[^note] and ^[inline **note**].",
      "Body[^note] and ^[inline **note**]. Body edit.",
    );
    const second = first.replace("second  line.", "second  line. First edit.");
    const third = second.replace(
      "Another paragraph.",
      "Another paragraph. Second edit.",
    );
    await append(paragraph, " Body edit.");
    await update(() => paragraph.blur());
    expect(store.getSnapshot().source).toBe(first);
    await append(editor(), " First edit.");
    await update(() => editor().blur());
    expect(store.getSnapshot().source).toBe(second);
    await append(editor(1), " Second edit.");
    expect(store.getSnapshot().source).toBe(second);

    const shortcut = async (shiftKey = false) => {
      await update(() => editor(1).focus());
      await update(() =>
        editor(1).dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            key: "z",
            shiftKey,
          }),
        ),
      );
    };
    let revision = store.getSnapshot().revision + 1;
    for (const expected of [second, first, source]) {
      await shortcut();
      expect(store.getSnapshot().source).toBe(expected);
      expect(store.getSnapshot().revision).toBe(++revision);
      expect(editor(1).textContent).toBe("Another paragraph.");
    }
    for (const expected of [first, second, third]) {
      await shortcut(true);
      expect(store.getSnapshot().source).toBe(expected);
      expect(store.getSnapshot().revision).toBe(++revision);
    }
    expect(editor(1).textContent).toBe("Another paragraph. Second edit.");
  });

  it("preserves reference syntax when editing the surrounding visual paragraph", async () => {
    const store = await mount();
    const paragraph = host.querySelector<HTMLElement>(
      ".block-canvas > .block-paragraph .block-content-editable",
    )!;
    await append(paragraph, " More.");
    await update(() => paragraph.blur());
    expect(store.getSnapshot().source).toBe(
      source.replace(
        "Body[^note] and ^[inline **note**].",
        "Body[^note] and ^[inline **note**]. More.",
      ),
    );
  });

  it("numbers identical inline-note paragraphs by their source occurrence", async () => {
    const markdown = "Same ^[inline].\n\nSame ^[inline].\n";
    const store = await mount(new DocumentStore(markdown, 7));
    expect(
      [...host.querySelectorAll(".footnote-atom")].map(
        (atom) => atom.textContent,
      ),
    ).toEqual(["1", "2"]);
    expect(store.getSnapshot().source).toBe(markdown);
  });

  it("keeps Bold changes after a footnote through selection-toolbar rerenders", async () => {
    const markdown = "Before[^note] **keep** After.\n\n[^note]: A note.\n";
    const store = await mount(new DocumentStore(markdown, 7));
    const paragraph = host.querySelector<HTMLElement>(
      ".block-canvas > .block-paragraph .block-content-editable",
    )!;
    const rectangle = new DOMRect(100, 100, 80, 20);
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => rectangle,
    });
    vi.spyOn(paragraph.parentElement!, "getBoundingClientRect").mockReturnValue(
      rectangle,
    );
    const originalCommand = Object.getOwnPropertyDescriptor(
      document,
      "execCommand",
    );
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        const selection = window.getSelection()!;
        const range = selection.getRangeAt(0);
        const strong = document.createElement("strong");
        strong.append(range.extractContents());
        range.insertNode(strong);
        range.selectNodeContents(strong);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }),
    });
    try {
      await update(() => paragraph.focus());
      const text = paragraph.lastChild!;
      const range = document.createRange();
      range.setStart(text, 1);
      range.setEnd(text, 6);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      await update(() =>
        paragraph.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })),
      );
      await update(() =>
        paragraph.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            key: "b",
          }),
        ),
      );
      await update(() =>
        paragraph.dispatchEvent(
          new KeyboardEvent("keyup", {
            bubbles: true,
            ctrlKey: true,
            key: "b",
          }),
        ),
      );
      await update(() =>
        paragraph.dispatchEvent(
          new KeyboardEvent("keyup", { bubbles: true, key: "Control" }),
        ),
      );
      expect(
        [...paragraph.querySelectorAll("strong")].map(
          (node) => node.textContent,
        ),
      ).toEqual(["keep", "After"]);
      await update(() => paragraph.blur());
      expect(store.getSnapshot().source).toBe(
        markdown.replace(" After.", " **After**."),
      );
    } finally {
      if (originalCommand)
        Object.defineProperty(document, "execCommand", originalCommand);
      else Reflect.deleteProperty(document, "execCommand");
      Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    }
  });

  it.each(["\n", "\r\n"])(
    "keeps second-note table insertion, focus and typing exact with EOL %j",
    async (eol) => {
      const table = "    | A | B |\n    | --- | --- |\n    | one | two |\n";
      const original = `Body[^first] and [^second].\n\n[^first]:\n${table}\n[^second]:\n${table}`;
      const markdown = original.replaceAll("\n", eol);
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal(
        "requestAnimationFrame",
        (callback: FrameRequestCallback) => {
          frames.push(callback);
          return frames.length;
        },
      );
      const store = await mount(new DocumentStore(markdown, 7));
      const second = () =>
        host.querySelector<HTMLElement>(
          '.footnote-block[data-footnote-label="second"]',
        )!;
      await update(() =>
        second()
          .querySelector<HTMLTextAreaElement>(
            '[data-table-row="0"][data-table-column="0"]',
          )!
          .focus(),
      );
      await update(() =>
        second()
          .querySelector<HTMLButtonElement>(
            '[data-table-command="insert-row-below"]',
          )!
          .click(),
      );
      for (let frame = 0; frame < 2; frame += 1) {
        await update(() => {
          for (const callback of frames.splice(0)) callback(performance.now());
        });
      }
      expect(second().contains(document.activeElement)).toBe(true);
      const inserted = document.activeElement as HTMLTextAreaElement;
      expect(inserted.dataset.tableRow).toBe("1");
      expect(inserted.dataset.tableColumn).toBe("0");
      for (const key of "third") {
        inserted.value += key;
        await update(() =>
          inserted.dispatchEvent(new InputEvent("input", { bubbles: true })),
        );
      }
      let saved: string | undefined;
      const save = document.createElement("button");
      save.addEventListener("focus", () => {
        saved = store.getSnapshot().source;
      });
      host.append(save);
      await update(() => save.focus());
      const expected = original
        .replace(
          `[^second]:\n${table}`,
          `[^second]:\n${table.replace(
            "    | --- | --- |\n",
            "    | --- | --- |\n    |  third|  |\n",
          )}`,
        )
        .replaceAll("\n", eol);
      expect(saved).toBe(expected);
      expect(store.getSnapshot().source).toBe(expected);
    },
  );

  it.each(["\n", "\r\n"])(
    "keeps second-note Enter, typing and immediate save exact with EOL %j",
    async (eol) => {
      const original =
        "Body[^first] and [^second].\n\n[^first]:\n    - one\n    - two\n\n[^second]:\n    - one\n    - two\n";
      const markdown = original.replaceAll("\n", eol);
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal(
        "requestAnimationFrame",
        (callback: FrameRequestCallback) => {
          frames.push(callback);
          return frames.length;
        },
      );
      const store = await mount(new DocumentStore(markdown, 7));
      const second = () =>
        host.querySelector<HTMLElement>(
          '.footnote-block[data-footnote-label="second"]',
        )!;
      const item = second().querySelector<HTMLElement>(
        ".block-list-item .block-content-editable",
      )!;
      await update(() => item.focus());
      const range = document.createRange();
      range.selectNodeContents(item);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      await update(() =>
        item.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        ),
      );
      await update(() => {
        for (const callback of frames.splice(0)) callback(performance.now());
      });
      expect(second().contains(document.activeElement)).toBe(true);
      const inserted = document.activeElement as HTMLElement;
      for (const key of "third") {
        inserted.append(document.createTextNode(key));
        await update(() => {
          inserted.dispatchEvent(new InputEvent("input", { bubbles: true }));
          inserted.dispatchEvent(
            new KeyboardEvent("keyup", { bubbles: true, key }),
          );
        });
      }
      expect(inserted.textContent).toBe("third");
      let saved: string | undefined;
      const save = document.createElement("button");
      save.textContent = "Save";
      save.addEventListener("focus", () => {
        saved = store.getSnapshot().source;
      });
      host.append(save);
      await update(() => save.focus());
      const expected = original
        .replace(
          "[^second]:\n    - one\n    - two\n",
          "[^second]:\n    - one\n    - third\n    - two\n",
        )
        .replaceAll("\n", eol);
      expect(saved).toBe(expected);
      expect(store.getSnapshot().source).toBe(expected);
      await update(() => store.undo());
      expect(store.getSnapshot().source).toBe(
        original
          .replace(
            "[^second]:\n    - one\n    - two\n",
            "[^second]:\n    - one\n    - \n    - two\n",
          )
          .replaceAll("\n", eol),
      );
      await update(() => store.redo());
      expect(store.getSnapshot().source).toBe(expected);
    },
  );
});
