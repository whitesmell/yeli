import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "../../src/i18n/en.ts";
import { AboutDialog } from "../../src/ui/about-dialog.tsx";
import {
  brandContentDigests,
  contentDigest,
  hasBrandContent,
} from "./brand-content.ts";
let cleanup: (() => void) | undefined;

beforeEach(() => {
  vi.stubGlobal("__YELI_VERSION__", "0.1.0");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "performance"],
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (loading = false, locale: "en" | "zh-CN" = "en") =>
    act(() =>
      root.render(
        <AboutDialog
          canDirectSave={false}
          locale={locale}
          labels={en}
          onClose={() => undefined}
          recoveryAvailable={false}
          saveDisclosure={null}
          saveDisclosureLoading={loading}
        />,
      ),
    );
  render();
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  const version = host.querySelector<HTMLButtonElement>(
    ".about-version-control",
  )!;
  const brand = host.querySelector<HTMLButtonElement>(".about-brand-control")!;
  return {
    host,
    brand,
    version,
    render,
    arm: () =>
      act(() => {
        version.click();
        version.click();
      }),
    detail: () => host.querySelector(".about-brand-detail"),
  };
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function pointer(
  target: HTMLElement,
  type: string,
  options: { clientX?: number; clientY?: number; primary?: boolean } = {},
) {
  const nativeType =
    type === "pointerleave"
      ? "pointerout"
      : type === "blur"
        ? "focusout"
        : type;
  const event = new MouseEvent(nativeType, {
    bubbles: true,
    button: 0,
    clientX: options.clientX ?? 10,
    clientY: options.clientY ?? 10,
  });
  Object.defineProperties(event, {
    isPrimary: { value: options.primary ?? true },
    pointerId: { value: 1 },
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe("About brand detail", () => {
  it("starts with no detail markup, text, hints or changed initial focus", () => {
    const { host, detail } = mount();
    expect(detail()).toBeNull();
    expect(hasBrandContent(host.innerHTML)).toBe(false);
    expect(host.querySelector("[title]")).toBeNull();
    expect(document.activeElement).toBe(host.querySelector(".about-close"));
  });

  it("requires the ordered activations and a complete hold across rerenders", () => {
    const panel = mount();
    pointer(panel.brand, "pointerdown");
    tick(2100);
    expect(panel.detail()).toBeNull();
    pointer(panel.brand, "pointerup");
    panel.arm();
    pointer(panel.brand, "pointerdown");
    tick(1000);
    panel.render(true);
    tick(999);
    expect(panel.detail()).toBeNull();
    tick(1);
    expect(
      [...panel.host.querySelectorAll(".about-brand-marks > span")].map(
        (node) => contentDigest(node.textContent ?? ""),
      ),
    ).toEqual(brandContentDigests);
    expect(panel.detail()?.textContent).toContain("For you, with love.");
    pointer(panel.brand, "pointerup");
    panel.render(false, "zh-CN");
    expect(panel.detail()?.textContent).toContain(
      "\u8fd9\u4e00\u9875\uff0c\u7559\u7ed9\u4f60\u4eec\u3002",
    );
  });

  it.each(["pointerup", "pointerleave", "pointercancel", "blur"])(
    "cancels an incomplete hold on %s",
    (type) => {
      const panel = mount();
      panel.arm();
      pointer(panel.brand, "pointerdown");
      tick(1000);
      pointer(panel.brand, type);
      tick(1100);
      expect(panel.detail()).toBeNull();
    },
  );

  it("cancels swipes and non-primary pointers", () => {
    const panel = mount();
    panel.arm();
    pointer(panel.brand, "pointerdown");
    pointer(panel.brand, "pointermove", { clientX: 35 });
    tick(2100);
    expect(panel.detail()).toBeNull();
    pointer(panel.brand, "pointerdown", { primary: false });
    tick(2100);
    expect(panel.detail()).toBeNull();
  });

  it("expires partial sequences and rejects extra activations", () => {
    const panel = mount();
    act(() => panel.version.click());
    tick(2001);
    act(() => panel.version.click());
    pointer(panel.brand, "pointerdown");
    tick(2100);
    expect(panel.detail()).toBeNull();
    panel.arm();
    act(() => panel.version.click());
    pointer(panel.brand, "pointerdown");
    tick(2100);
    expect(panel.detail()).toBeNull();
    panel.arm();
    tick(6001);
    pointer(panel.brand, "pointerdown");
    tick(2100);
    expect(panel.detail()).toBeNull();
  });

  it("does not complete a hold that would overrun the deadline", () => {
    const panel = mount();
    panel.arm();
    tick(4500);
    pointer(panel.brand, "pointerdown");
    tick(2100);
    expect(panel.detail()).toBeNull();
  });

  it("supports a keyboard hold without counting key repeats or scrolling", () => {
    const panel = mount();
    const repeat = new KeyboardEvent("keydown", {
      key: "Enter",
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      panel.version.dispatchEvent(repeat);
    });
    expect(repeat.defaultPrevented).toBe(true);
    panel.arm();
    panel.brand.focus();
    const hold = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      panel.brand.dispatchEvent(hold);
    });
    expect(hold.defaultPrevented).toBe(true);
    tick(1000);
    act(() => {
      panel.brand.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: " ",
          bubbles: true,
        }),
      );
    });
    tick(1100);
    expect(panel.detail()).toBeNull();
    act(() => {
      panel.brand.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    tick(2000);
    expect(panel.detail()).not.toBeNull();
  });

  it("clears both pending and revealed details when the window loses focus", () => {
    const panel = mount();
    panel.arm();
    pointer(panel.brand, "pointerdown");
    tick(1000);
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    tick(1100);
    expect(panel.detail()).toBeNull();
    panel.arm();
    pointer(panel.brand, "pointerdown");
    tick(2000);
    expect(panel.detail()).not.toBeNull();
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(panel.detail()).toBeNull();
    expect(hasBrandContent(panel.host.innerHTML)).toBe(false);
  });

  it("cleans up timers on unmount and never carries progress into a new dialog", () => {
    const first = mount();
    const timers = vi.spyOn(window, "setTimeout");
    const clears = vi.spyOn(window, "clearTimeout");
    first.arm();
    pointer(first.brand, "pointerdown");
    const pending = timers.mock.results.map((result) => result.value as number);
    cleanup?.();
    for (const timer of pending) expect(clears).toHaveBeenCalledWith(timer);
    const second = mount();
    pointer(second.brand, "pointerdown");
    tick(2100);
    expect(second.detail()).toBeNull();
  });

  it("discards pending progress when the page becomes hidden", () => {
    const panel = mount();
    panel.arm();
    pointer(panel.brand, "pointerdown");
    tick(1000);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    hidden.mockReturnValue(false);
    tick(1100);
    expect(panel.detail()).toBeNull();
  });
});
