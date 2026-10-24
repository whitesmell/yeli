import type { YeliAsset } from "../document/model.ts";

const RENDERED_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function resolveWorkspaceImage(
  destination: string,
  assets: readonly YeliAsset[],
): string | null {
  if (!destination.startsWith("yeli-asset:")) return null;
  const id = destination.slice("yeli-asset:".length);
  const asset = assets.find((candidate) => candidate.id === id);
  if (!asset || !RENDERED_IMAGE_TYPES.has(asset.mimeType)) return null;
  return `data:${asset.mimeType};base64,${asset.data}`;
}
