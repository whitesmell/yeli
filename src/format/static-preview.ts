import type { YeliDocumentPayload } from "../document/model.ts";
import { en, type Labels } from "../i18n/en.ts";
import { renderDocumentMarkdown } from "../render/markdown.ts";
import { validateAssets } from "./assets.ts";
import {
  buildStaticPreviewHtml,
  escapePublicationHtml,
} from "./static-shell-preview.ts";

export { buildStaticPreviewHtml };

const SAFE_RENDERED_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function embeddedAssetUrl(
  payload: YeliDocumentPayload,
  destination: string,
  assetsValidated: boolean,
): string | null {
  if (!destination.startsWith("yeli-asset:")) return null;
  if (!assetsValidated) return null;
  const id = destination.slice("yeli-asset:".length);
  const asset = payload.assets.find((candidate) => candidate.id === id);
  if (!asset || !SAFE_RENDERED_IMAGE_TYPES.has(asset.mimeType)) return null;
  return `data:${asset.mimeType};base64,${asset.data}`;
}

export interface StaticHtmlExport {
  filename: string;
  html: string;
  warnings: string[];
}

export function createStaticHtmlExport(
  payload: YeliDocumentPayload,
  source: string,
  labels: Pick<
    Labels,
    "imageNotLoaded" | "exportImageUnavailable" | "exportImagesInvalid"
  > = en,
): StaticHtmlExport {
  const assetFindings = validateAssets(payload);
  const assetsValidated = !assetFindings.some(
    (finding) => finding.severity === "error",
  );
  const rendered = renderDocumentMarkdown(source, {
    imageUnavailableLabel: labels.imageNotLoaded,
    resolveImage(destination) {
      return embeddedAssetUrl(payload, destination, assetsValidated);
    },
  });
  const title = payload.manifest.metadata.title ?? "Yeli document";
  const filename = `${title.replace(/[\\/:*?"<>|]/gu, "-").trim() || "document"}.html`;
  const warnings = payload.manifest.links
    .filter(
      (link) =>
        link.kind === "image" && !link.destination.startsWith("yeli-asset:"),
    )
    .map((link) =>
      labels.exportImageUnavailable.replace("{image}", link.destination),
    );
  if (!assetsValidated) {
    warnings.unshift(labels.exportImagesInvalid);
  }
  return {
    filename,
    warnings,
    html: `<!doctype html>
<html lang="${escapePublicationHtml(payload.manifest.metadata.lang ?? "en")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapePublicationHtml(title)}</title>
  <style>body{max-width:760px;margin:0 auto;padding:64px 28px;color:#101936;background:#fff;font:16px/1.75 system-ui,sans-serif}.document-heading{margin:0 0 38px;padding-bottom:24px;border-bottom:1px solid #e6e9f0}.document-heading h1{margin:0;font-size:2.35rem;letter-spacing:-.035em}.document-heading p{margin:10px 0 0;color:#5e6982}h1,h2,h3{line-height:1.25}img{max-width:100%;height:auto}.blocked-media{display:inline-block;padding:8px 10px;border:1px solid #ead8b8;border-radius:7px;background:#fff8e9}pre{overflow:auto;padding:16px;background:#f5f7fb}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #dde2ec;text-align:left}blockquote{margin-left:0;padding-left:18px;border-left:3px solid #f06452}</style>
</head>
<body><main><header class="document-heading"><h1>${escapePublicationHtml(title)}</h1>${payload.manifest.metadata.description ? `<p>${escapePublicationHtml(payload.manifest.metadata.description)}</p>` : ""}</header>${rendered}</main></body>
</html>
`,
  };
}
