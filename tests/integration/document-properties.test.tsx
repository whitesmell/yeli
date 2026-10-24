import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { DocumentStore } from "../../src/document/store.ts";
import { en } from "../../src/i18n/en.ts";
import { DocumentProperties } from "../../src/ui/document-properties.tsx";
import { MetadataInline } from "../../src/ui/metadata-inline.tsx";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function mount(source: string) {
  const store = new DocumentStore(source, 1);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Panel() {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    return (
      <>
        <MetadataInline
          displayTitle="Fixture"
          labels={en}
          onOpenInspector={() => undefined}
          snapshot={snapshot}
          store={store}
        />
        <DocumentProperties
          source={snapshot.source}
          store={store}
          labels={en}
        />
      </>
    );
  }
  act(() => root.render(<Panel />));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, store };
}

describe("document property drafts", () => {
  it("waits for IME confirmation before committing a tag", () => {
    const source = "---\ntags: []\n---\nBody";
    const { host, store } = mount(source);
    const input = host.querySelector<HTMLInputElement>(
      '[aria-label="Add tag"]',
    )!;
    act(() => {
      input.focus();
      input.value = "中文";
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          isComposing: true,
        }),
      );
    });
    expect(store.getSnapshot().source).toBe(source);
    expect(input.value).toBe("中文");
    act(() => input.blur());
    expect(store.getSnapshot().source).toBe('---\ntags: ["中文"]\n---\nBody');
    expect(store.getSnapshot().revision).toBe(2);
  });
  it("discloses large property sets in batches and finds names without editing the source", () => {
    const source = `---\n${Array.from({ length: 45 }, (_, index) => `field-${index}: value`).join("\n")}\n---\nBody`;
    const { host, store } = mount(source);
    expect(host.querySelectorAll(".custom-property")).toHaveLength(30);
    const more = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === en.moreProperties,
    )!;
    act(() => more.click());
    expect(host.querySelectorAll(".custom-property")).toHaveLength(45);
    const search = host.querySelector<HTMLInputElement>('[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(search, "field-44");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelectorAll(".custom-property")).toHaveLength(1);
    expect(host.querySelector(".custom-property")?.textContent).toContain(
      "field-44",
    );
    expect(store.getSnapshot().source).toBe(source);
    expect(store.getSnapshot().revision).toBe(1);
  });
  it("keeps no-edit focus/blur byte-neutral, including whitespace in lists", () => {
    const source =
      '---\ntitle: " Keep "\nauthors: ["Lovelace, Ada"]\ntags: [" padded ", "one, two", ""]\n---\nBody\n';
    const { host, store } = mount(source);
    for (const input of host.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >("input, textarea")) {
      act(() => input.focus());
      act(() => input.blur());
    }
    expect(store.getSnapshot().source).toBe(source);
    expect(store.getSnapshot().revision).toBe(1);
    expect(store.getSnapshot().canUndo).toBe(false);
  });

  it("retains an active draft across unrelated updates and rejects a conflicting property update", () => {
    const { host, store } = mount("---\nproject: Original\n---\nBody\n");
    const input = host.querySelector<HTMLInputElement>(
      '[aria-label="project"]',
    )!;
    act(() => input.focus());
    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!;
      descriptor.set!.call(input, "My draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      store.patchMetadata("priority", 2);
    });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("My draft");
    act(() => {
      store.patchMetadata("project", "External");
    });
    expect(input.value).toBe("My draft");
    act(() => input.blur());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "changed while you were editing",
    );
    expect(store.getSnapshot().source).toContain("project: External");
    expect(input.value).toBe("My draft");
    act(() => input.focus());
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(input.value).toBe("External");
  });
});
