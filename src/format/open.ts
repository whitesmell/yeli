import type { YeliDocumentPayload } from "../document/model.ts";
import type { DerivedFreshness } from "../document/freshness.ts";
import { parseYeliArtifact, type ParseArtifactResult } from "./parse.ts";
import { fingerprintArtifact } from "./save.ts";

export interface OpenedYeliDocument {
  artifact: string;
  artifactKind: "yeli" | "markdown";
  fingerprint: string;
  freshness: DerivedFreshness;
  markdown: string;
  payload: YeliDocumentPayload;
  releaseTemplate: string;
}

export function createFreshOpenedDocument(
  opened: Omit<OpenedYeliDocument, "freshness">,
): OpenedYeliDocument {
  const { agentSummary, manifest } = opened.payload;
  return {
    ...opened,
    freshness: {
      agentSummary: agentSummary
        ? {
            status:
              agentSummary.sourceHash === manifest.sourceHash
                ? "fresh"
                : "stale",
            value: agentSummary,
          }
        : { status: "absent" },
      manifest: { status: "fresh", value: manifest },
      sourceHash: manifest.sourceHash,
    },
  };
}

export type OpenEmbeddedResult =
  | { document: OpenedYeliDocument; ok: true }
  | {
      error: string;
      ok: false;
      recovery?: Extract<ParseArtifactResult, { ok: false }>;
      releaseTemplate?: string;
    };

function serializeDoctype(ownerDocument: Document): string {
  const doctype = ownerDocument.doctype;
  if (!doctype) return "<!doctype html>";
  if (doctype.publicId || doctype.systemId) {
    throw new Error("YELI release does not support a non-canonical doctype");
  }
  return `<!doctype ${doctype.name.toLowerCase()}>`;
}

export function reconstructReleaseTemplate(
  ownerDocument: Document = document,
): string {
  const captured = (
    ownerDocument.defaultView as
      (Window & { __YELI_PRISTINE_ARTIFACT__?: string }) | null
  )?.__YELI_PRISTINE_ARTIFACT__;
  if (typeof captured === "string") return captured;
  const liveRoot = ownerDocument.documentElement;
  if (!liveRoot) throw new Error("This YELI file has no document element");
  const root = liveRoot.cloneNode(true) as HTMLElement;
  root.querySelector("#yeli-runtime-style")?.remove();
  return `${serializeDoctype(ownerDocument)}\n${root.outerHTML}`;
}

export async function openYeliArtifact(
  artifact: string,
  releaseTemplate = artifact,
): Promise<OpenEmbeddedResult> {
  const parsed = await parseYeliArtifact(artifact);
  if (!parsed.ok) {
    return {
      error: parsed.findings.map((finding) => finding.message).join("; "),
      ok: false,
      recovery: parsed,
      releaseTemplate,
    };
  }
  return {
    document: {
      artifact,
      artifactKind: "yeli",
      fingerprint: fingerprintArtifact(artifact),
      freshness: parsed.freshness,
      markdown: parsed.markdown,
      payload: parsed.payload,
      releaseTemplate,
    },
    ok: true,
  };
}

export async function openEmbeddedYeli(
  ownerDocument: Document = document,
): Promise<OpenEmbeddedResult> {
  try {
    const releaseTemplate = reconstructReleaseTemplate(ownerDocument);
    return openYeliArtifact(releaseTemplate, releaseTemplate);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}
