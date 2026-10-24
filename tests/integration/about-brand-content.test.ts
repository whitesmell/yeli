import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { inspectCompressedArtifact } from "../../src/format/compress-artifact.ts";
import { hasBrandContent } from "./brand-content.ts";

describe("About brand content packaging", () => {
  it("keeps fixed detail labels out of source literals", () => {
    for (const file of [
      "src/ui/about-brand-detail.tsx",
      "src/ui/use-brand-detail.ts",
      "src/ui/about-dialog.tsx",
      "src/ui/about-dialog.css",
    ]) {
      const source = readFileSync(resolve(file), "utf8").toLowerCase();
      expect(hasBrandContent(source)).toBe(false);
    }
  });

  it.each(["zh-CN", "en"])(
    "keeps %s labels encoded even after decompressing the production runtime",
    (locale) => {
      const artifact = readFileSync(
        resolve(`dist/html/starter.${locale}.yeli.html`),
        "utf8",
      );
      const sources = inspectCompressedArtifact(artifact)!;
      expect(sources.style.source).toContain(".about-brand-detail");
      for (const source of [
        artifact,
        sources.runtime.source,
        sources.style.source,
      ]) {
        expect(hasBrandContent(source)).toBe(false);
      }
      expect(sources.runtime.source).not.toMatch(/sourceMappingURL=/u);
    },
  );
});
