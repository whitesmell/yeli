export function printStaticHtml(
  html: string,
  ownerDocument: Document = document,
  isCurrent: () => boolean = () => true,
): Promise<"requested" | "stale"> {
  return new Promise((resolve, reject) => {
    const frame = ownerDocument.createElement("iframe");
    const timerWindow = ownerDocument.defaultView;
    frame.className = "print-frame";
    frame.title = "Printable YELI export";
    frame.setAttribute("sandbox", "allow-modals allow-same-origin");
    frame.srcdoc = html;
    let settled = false;
    let timerArmed = false;
    const loadTimeout = timerWindow?.setTimeout(
      () => fail(new Error("Print frame loading timed out")),
      30_000,
    );
    timerArmed = loadTimeout !== undefined;
    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      if (timerWindow && timerArmed) timerWindow.clearTimeout(loadTimeout);
      frame.remove();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
    if (!timerWindow) {
      fail(new Error("Print frame owner window is unavailable"));
      return;
    }
    frame.addEventListener(
      "error",
      () => fail(new Error("Print frame failed to load")),
      { once: true },
    );
    frame.addEventListener(
      "load",
      () => {
        if (settled) return;
        timerWindow.clearTimeout(loadTimeout);
        try {
          if (!isCurrent()) {
            settled = true;
            frame.remove();
            resolve("stale");
            return;
          }
          const target = frame.contentWindow;
          if (!target) throw new Error("Print frame window is unavailable");
          target.focus();
          target.print();
          settled = true;
          timerWindow.setTimeout(() => frame.remove(), 500);
          // This confirms a browser print request, never a saved PDF.
          resolve("requested");
        } catch (error) {
          fail(error);
        }
      },
      { once: true },
    );
    try {
      ownerDocument.body.append(frame);
    } catch (error) {
      fail(error);
    }
  });
}
