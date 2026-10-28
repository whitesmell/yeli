import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DocumentStore } from "../../src/document/store.ts";
import { en } from "../../src/i18n/en.ts";
import { zhCN } from "../../src/i18n/zh-CN.ts";
import { Inspector } from "../../src/ui/inspector.tsx";

describe.each([en, zhCN])("Inspector image embedding ($image)", (labels) => {
  function render(
    canEmbedImages?: boolean,
    source = "![Example](./example.gif)\n",
  ) {
    const store = new DocumentStore(source);
    const snapshot = store.getSnapshot();
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <Inspector
        {...(canEmbedImages === undefined ? {} : { canEmbedImages })}
        labels={labels}
        onClearSelection={() => undefined}
        onClose={() => undefined}
        onEmbedImage={vi.fn(() => Promise.resolve(false))}
        selectedBlock={snapshot.projection.blocks[0]}
        snapshot={snapshot}
        store={store}
      />,
    );
    return { host, store };
  }

  it("disables replacement and explains the Markdown format boundary", () => {
    const { host } = render(false);

    expect(
      host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled,
    ).toBe(true);
    expect(host.textContent).toContain(
      labels.imageEmbeddingUnavailableMarkdown,
    );
  });

  it.each([undefined, true])(
    "preserves artifact replacement availability (%s)",
    (enabled) => {
      const { host } = render(enabled);

      expect(
        host.querySelector<HTMLInputElement>('input[type="file"]')?.disabled,
      ).toBe(false);
      expect(host.textContent).not.toContain(
        labels.imageEmbeddingUnavailableMarkdown,
      );
    },
  );

  it("discloses unavailable structured editing for BOM+CRLF frontmatter", () => {
    const source =
      "\ufeff---\r\ntitle: Windows\r\ncustom: keep\r\n---\r\nBody\r\n";
    const { host, store } = render(false, source);

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      labels.metadataUnsafe,
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      labels.metadataUnsafeDescription,
    );
    expect(host.querySelector("input, textarea")).toBeNull();
    expect(store.getSnapshot().source).toBe(source);
  });
});
