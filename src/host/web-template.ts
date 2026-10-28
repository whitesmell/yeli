import { sha256Fallback } from "../document/freshness.ts";
import {
  createDocumentPayload,
  YELI_FORMAT,
  YELI_VERSION,
} from "../document/model.ts";
import { locatePayloadBlock, parseYeliArtifact } from "../format/parse.ts";
import { serializePayload } from "../format/serialize.ts";
import {
  projectShell,
  SHELL_PROJECTION_VERSION,
} from "../integrity/shell-projection.ts";

export interface WebTemplateMetadata {
  version: string;
  profile: "empty";
  bytes: number;
  hash: string;
  format: typeof YELI_FORMAT;
  formatVersion: typeof YELI_VERSION;
  shellHash: string;
  shellProjectionVersion: typeof SHELL_PROJECTION_VERSION;
}

export type WebTemplateFailure =
  "missing" | "hash" | "format" | "version" | "nonempty" | "shell";

export type WebTemplateCapability =
  | Readonly<{ available: false; reason: WebTemplateFailure }>
  | Readonly<{
      available: true;
      artifact: string;
      hash: string;
      shellHash: string;
    }>;

export function describeWebTemplate(
  artifact: string,
  version: string,
): WebTemplateMetadata {
  return {
    version,
    profile: "empty",
    bytes: new TextEncoder().encode(artifact).byteLength,
    hash: sha256Fallback(artifact),
    format: YELI_FORMAT,
    formatVersion: YELI_VERSION,
    shellHash: projectShell(artifact).hash,
    shellProjectionVersion: SHELL_PROJECTION_VERSION,
  };
}

// Call only with release-builder data embedded in the trusted web bundle.
// Document payloads, local storage, uploaded files and URLs never select a shell.
export async function validateWebTemplate(
  artifact: string,
  metadata: WebTemplateMetadata | null,
  version: string,
): Promise<WebTemplateCapability> {
  const unavailable = (reason: WebTemplateFailure): WebTemplateCapability =>
    Object.freeze({ available: false, reason });
  if (!artifact || !metadata) return unavailable("missing");
  if (
    !/^[a-f0-9]{64}$/u.test(metadata.hash) ||
    sha256Fallback(artifact) !== metadata.hash ||
    new TextEncoder().encode(artifact).byteLength !== metadata.bytes
  )
    return unavailable("hash");
  if (metadata.version !== version || metadata.profile !== "empty")
    return unavailable("version");
  if (metadata.format !== YELI_FORMAT) return unavailable("format");
  if (metadata.formatVersion !== YELI_VERSION) return unavailable("version");

  const located = locatePayloadBlock(artifact);
  if (!located.ok) return unavailable("format");
  try {
    const raw: unknown = JSON.parse(
      artifact.slice(
        located.boundary.payloadStart,
        located.boundary.payloadEnd,
      ),
    );
    if (
      typeof raw !== "object" ||
      raw === null ||
      !("format" in raw) ||
      raw.format !== YELI_FORMAT
    )
      return unavailable("format");
    if (!("version" in raw) || raw.version !== YELI_VERSION)
      return unavailable("version");
    const parsed = await parseYeliArtifact(artifact, {}, null);
    if (!parsed.ok || parsed.migrated) return unavailable("format");
    const empty = await createDocumentPayload("", {
      docId: "yeli-empty",
      revision: 1,
      subtle: null,
    });
    if (
      parsed.markdown !== "" ||
      serializePayload(parsed.payload) !== serializePayload(empty)
    )
      return unavailable("nonempty");
    const shell = projectShell(artifact);
    if (
      metadata.shellProjectionVersion !== shell.version ||
      metadata.shellHash !== shell.hash
    )
      return unavailable("shell");
    return Object.freeze({
      available: true,
      artifact,
      hash: metadata.hash,
      shellHash: shell.hash,
    });
  } catch {
    return unavailable("shell");
  }
}
