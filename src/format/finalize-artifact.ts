import { JSDOM } from "jsdom";

export function finalizeReleaseArtifact(artifact: string): string {
  const dom = new JSDOM(artifact, { contentType: "text/html" });
  try {
    const canonical = `<!doctype html>\n${dom.window.document.documentElement.outerHTML}`;
    // The final synchronous script captures the DOM before closing tags parse.
    return canonical.replace(
      /<\/script>\s*<\/body>\s*<\/html>\s*$/u,
      "</script></body></html>",
    );
  } finally {
    dom.window.close();
  }
}
