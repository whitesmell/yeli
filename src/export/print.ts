export function printStaticHtml(
  html: string,
  ownerDocument: Document = document,
): void {
  const frame = ownerDocument.createElement("iframe");
  frame.className = "print-frame";
  frame.title = "Printable YELI export";
  frame.setAttribute("sandbox", "allow-modals allow-same-origin");
  frame.srcdoc = html;
  frame.addEventListener(
    "load",
    () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 500);
    },
    { once: true },
  );
  ownerDocument.body.append(frame);
}
