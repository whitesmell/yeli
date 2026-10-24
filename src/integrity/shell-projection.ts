import { sha256Fallback } from "../document/freshness.ts";
import { locatePayloadBlock } from "../format/parse.ts";
import {
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "../format/serialize.ts";
import { isGeneratedStaticPreviewHtml } from "../format/static-shell-preview.ts";

export const SHELL_PROJECTION_VERSION = 1 as const;

const PAYLOAD_TOKEN = "YELI_PAYLOAD_PROJECTION_V1";
const STATIC_PREVIEW_TOKEN = "YELI_STATIC_PREVIEW_PROJECTION_V1";

export class ShellProjectionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ShellProjectionError";
  }
}

function staticPreviewRange(artifact: string): {
  contentEnd: number;
  contentStart: number;
  markerCount: number;
} {
  const openCount = artifact.split(STATIC_PREVIEW_OPEN).length - 1;
  const closeCount = artifact.split(STATIC_PREVIEW_CLOSE).length - 1;
  if (openCount !== 1 || closeCount !== 1) {
    throw new ShellProjectionError(
      "STATIC_PREVIEW_MARKER_COUNT",
      `Expected one static preview boundary; found opening=${openCount}, closing=${closeCount}`,
    );
  }
  const contentStart =
    artifact.indexOf(STATIC_PREVIEW_OPEN) + STATIC_PREVIEW_OPEN.length;
  const contentEnd = artifact.indexOf(STATIC_PREVIEW_CLOSE, contentStart);
  if (contentEnd < contentStart) {
    throw new ShellProjectionError(
      "STATIC_PREVIEW_BOUNDARY_INVALID",
      "Static preview closing marker precedes its opening marker",
    );
  }
  if (!isGeneratedStaticPreviewHtml(artifact.slice(contentStart, contentEnd))) {
    throw new ShellProjectionError(
      "STATIC_PREVIEW_UNSAFE",
      "Static preview does not match the inert generated grammar",
    );
  }
  return { contentEnd, contentStart, markerCount: 1 };
}

export interface ShellProjection {
  hash: string;
  payloadMarkerCount: number;
  projected: string;
  staticPreviewMarkerCount: number;
  version: typeof SHELL_PROJECTION_VERSION;
}

export function projectShell(artifact: string): ShellProjection {
  const located = locatePayloadBlock(artifact);
  if (!located.ok) {
    throw new ShellProjectionError(
      "PAYLOAD_BOUNDARY_INVALID",
      located.findings.map((item) => item.message).join("; "),
    );
  }

  const withoutPayload = `${artifact.slice(0, located.boundary.payloadStart)}${PAYLOAD_TOKEN}${artifact.slice(located.boundary.payloadEnd)}`;
  const preview = staticPreviewRange(withoutPayload);
  const projected = `${withoutPayload.slice(0, preview.contentStart)}${STATIC_PREVIEW_TOKEN}${withoutPayload.slice(preview.contentEnd)}`;

  return {
    hash: sha256Fallback(projected),
    payloadMarkerCount: located.boundary.markerCount,
    projected,
    staticPreviewMarkerCount: preview.markerCount,
    version: SHELL_PROJECTION_VERSION,
  };
}
