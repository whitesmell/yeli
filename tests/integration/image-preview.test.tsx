import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { en } from "../../src/i18n/en.ts";
import { ImagePreview } from "../../src/ui/image-preview.tsx";
import { ReadSurface } from "../../src/ui/read-surface.tsx";

const mounts: Array<{ element: HTMLElement; unmount: () => void }> = [];

function mount(element: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  mounts.push({ element: host, unmount: () => act(() => root.unmount()) });
  return host;
}

afterEach(() => {
  for (const mounted of mounts.splice(0)) {
    mounted.unmount();
    mounted.element.remove();
  }
});

describe("embedded image preview", () => {
  it("preserves keyboard image controls across parent rerenders", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mounts.push({ element: host, unmount: () => act(() => root.unmount()) });
    const props = {
      assets: [{ id: "safe", mimeType: "image/png", data: "aGVsbG8=" }],
      displayTitle: "Images",
      labels: en,
      revision: 1,
      source: "![local](yeli-asset:safe)\n",
    };
    act(() => root.render(<ReadSurface {...props} onOpenImage={vi.fn()} />));
    const original = host.querySelector<HTMLImageElement>(".document-image");
    original?.focus();
    act(() => root.render(<ReadSurface {...props} onOpenImage={vi.fn()} />));
    const image = host.querySelector<HTMLImageElement>(".document-image");
    expect(image).toBe(original);
    expect(document.activeElement).toBe(image);
    expect(image?.getAttribute("role")).toBe("button");
    expect(image?.tabIndex).toBe(0);
  });

  it("opens only resolved document images by double-click or keyboard", () => {
    const open = vi.fn();
    const host = mount(
      <ReadSurface
        assets={[{ id: "safe", mimeType: "image/png", data: "aGVsbG8=" }]}
        displayTitle="Images"
        labels={en}
        onOpenImage={open}
        revision={1}
        source={
          "![local](yeli-asset:safe)\n\n![remote](https://example.test/x.png)\n"
        }
      />,
    );
    const image = host.querySelector<HTMLImageElement>(".document-image");
    expect(image?.getAttribute("src")).toBe("data:image/png;base64,aGVsbG8=");
    expect(image?.tabIndex).toBe(0);
    expect(image?.getAttribute("role")).toBe("button");
    expect(host.querySelectorAll("img")).toHaveLength(1);
    expect(host.textContent).toContain("remote: Image not loaded");

    act(() => {
      image?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(open).toHaveBeenCalledWith(
      { alternative: "local", source: "data:image/png;base64,aGVsbG8=" },
      image,
    );
    act(() => {
      if (image) {
        image?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      }
    });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("keeps the enlarged image contained and closes on Escape", () => {
    const close = vi.fn();
    const host = mount(
      <ImagePreview
        image={{
          alternative: "local",
          source: "data:image/png;base64,aGVsbG8=",
        }}
        labels={en}
        onClose={close}
      />,
    );
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,aGVsbG8=",
    );
    act(() => {
      if (dialog) {
        dialog?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      }
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
