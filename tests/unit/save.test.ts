import { describe, expect, it } from "vitest";

import { createDocumentPayload } from "../../src/document/model.ts";
import { sha256BytesFallback } from "../../src/document/freshness.ts";
import { printStaticHtml } from "../../src/export/print.ts";
import { en } from "../../src/i18n/en.ts";
import { zhCN } from "../../src/i18n/zh-CN.ts";
import { parseYeliArtifact } from "../../src/format/parse.ts";
import {
  createSavedArtifact,
  fingerprintArtifact,
} from "../../src/format/save.ts";
import {
  YELI_AGENT_PREAMBLE,
  serializePayloadBlock,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "../../src/format/serialize.ts";
import { createStaticHtmlExport } from "../../src/format/static-preview.ts";
import {
  writeArtifactToHandle,
  type FileHandleLike,
} from "../../src/storage/file-handles.ts";

function releaseTemplate(payloadBlock: string): string {
  return `<!doctype html>
<html><head><meta name="yeli:format" content="yeli/document"></head><body>
${YELI_AGENT_PREAMBLE}
${payloadBlock}
${STATIC_PREVIEW_OPEN}
<article data-source-hash="stale">stale preview</article>
${STATIC_PREVIEW_CLOSE}
<script>globalThis.__runtime = true</script>
</body></html>
`;
}

describe("YELI save generation", () => {
  it("refreshes payload and static preview without serializing live DOM", async () => {
    const initial = await createDocumentPayload("# Before\n", {
      docId: "doc-save",
      revision: 4,
    });
    Object.defineProperty(initial, "futureSafe", {
      enumerable: true,
      value: { retained: true },
    });
    const template = releaseTemplate(serializePayloadBlock(initial));

    const result = await createSavedArtifact({
      payload: initial,
      releaseTemplate: template,
      revision: 5,
      source: "# After\n\nPortable body.\n",
    });
    const parsed = await parseYeliArtifact(result.artifact);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.markdown).toBe("# After\n\nPortable body.\n");
    expect(parsed.payload.docId).toBe("doc-save");
    expect(parsed.payload.revision).toBe(5);
    expect(
      (parsed.payload as unknown as Record<string, unknown>).futureSafe,
    ).toEqual({ retained: true });
    expect(result.artifact).toContain(
      `data-source-hash="${parsed.payload.manifest.sourceHash}"`,
    );
    expect(result.artifact).not.toContain("stale preview");
    expect(result.artifact.match(/globalThis\.__runtime/gu)).toHaveLength(1);
  });

  it("blocks an external fingerprint mismatch before any handle write", async () => {
    const writes: string[] = [];
    const handle: FileHandleLike = {
      createWritable() {
        return Promise.resolve({
          close() {
            return Promise.resolve();
          },
          write(value: string | Blob) {
            writes.push(typeof value === "string" ? value : "[blob]");
            return Promise.resolve();
          },
        });
      },
      getFile() {
        return Promise.resolve({
          text: () => Promise.resolve("externally changed"),
        });
      },
      name: "document.yeli.html",
    };

    const result = await writeArtifactToHandle(
      handle,
      "next artifact",
      fingerprintArtifact("original artifact"),
    );

    expect(result).toMatchObject({ ok: false, reason: "external-conflict" });
    expect(writes).toEqual([]);
  });

  it("marks a handle write successful only after close completes", async () => {
    const events: string[] = [];
    const current = "current artifact";
    const handle: FileHandleLike = {
      createWritable() {
        return Promise.resolve({
          close() {
            events.push("close");
            return Promise.resolve();
          },
          write(value: string | Blob) {
            events.push(
              `write:${typeof value === "string" ? value : "[blob]"}`,
            );
            return Promise.resolve();
          },
        });
      },
      getFile() {
        return Promise.resolve({ text: () => Promise.resolve(current) });
      },
      name: "document.yeli.html",
    };

    const result = await writeArtifactToHandle(
      handle,
      "next artifact",
      fingerprintArtifact(current),
    );

    expect(events).toEqual(["write:next artifact", "close"]);
    expect(result).toMatchObject({ ok: true });
  });

  it("overwrites an external change only after an explicit confirmation", async () => {
    const events: string[] = [];
    const handle: FileHandleLike = {
      createWritable() {
        return Promise.resolve({
          close() {
            events.push("close");
            return Promise.resolve();
          },
          write(value: string | Blob) {
            events.push(typeof value === "string" ? value : "[blob]");
            return Promise.resolve();
          },
        });
      },
      getFile() {
        return Promise.resolve({
          text: () => Promise.resolve("external change"),
        });
      },
      name: "document.yeli.html",
    };

    const result = await writeArtifactToHandle(
      handle,
      "confirmed content",
      fingerprintArtifact("original content"),
      true,
    );

    expect(result.ok).toBe(true);
    expect(events).toEqual(["confirmed content", "close"]);
  });

  it.each([en, zhCN])(
    "creates an offline read-only export with localized image guidance",
    async (labels) => {
      const source =
        "---\ntitle: Publish\n---\n![remote](https://example.test/x.png)\n\n[site](https://example.test)\n";
      const payload = await createDocumentPayload(source, {
        docId: "doc-export",
      });
      const result = createStaticHtmlExport(payload, source, labels);

      expect(result.html).toContain("Content-Security-Policy");
      expect(result.html).toContain("default-src 'none'");
      expect(result.html).not.toContain("<script");
      expect(result.html).not.toContain('src="https://example.test/x.png"');
      expect(result.html).toContain(labels.imageNotLoaded);
      expect(result.warnings).toEqual([
        labels.exportImageUnavailable.replace(
          "{image}",
          "https://example.test/x.png",
        ),
      ]);
      expect(result.html).toContain("<h1>Publish</h1>");
      expect(result.html).not.toContain("yeli-doc");
    },
  );

  it("keeps hostile embedded SVG inert even when export is called directly", async () => {
    const data =
      "PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnPjxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4=";
    const bytes = Uint8Array.from(atob(data), (value) => value.charCodeAt(0));
    const id = `sha256:${sha256BytesFallback(bytes)}`;
    const source = `# Unsafe\n\n![asset](yeli-asset:${id})\n`;
    const payload = await createDocumentPayload(source, {
      assets: [{ data, id, mimeType: "image/svg+xml" }],
      docId: "doc-unsafe-export",
    });

    const result = createStaticHtmlExport(payload, source);

    expect(result.html).not.toContain("data:image/svg+xml");
    expect(result.html).not.toContain("<script");
    expect(result.html).toContain("Image not loaded");
    expect(result.warnings.join(" ")).toContain(
      "Some images could not be read",
    );
  });

  it("prints only through a sandboxed static-output frame", () => {
    printStaticHtml("<!doctype html><title>Print</title>");

    const frame = document.querySelector<HTMLIFrameElement>(".print-frame");
    expect(frame?.getAttribute("sandbox")).toBe(
      "allow-modals allow-same-origin",
    );
    expect(frame?.srcdoc).not.toContain("<script");
    frame?.remove();
  });
});
