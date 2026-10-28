import type { YeliDocumentPayload } from "../document/model.ts";
import type { DerivedFreshness } from "../document/freshness.ts";
import type { ParseArtifactResult } from "../format/parse.ts";
import type { FileHandleLike } from "../storage/file-handles.ts";
import type { WebSessionRepository } from "../storage/web-sessions.ts";
import type { WebTemplateCapability } from "./web-template.ts";

export type YeliHostKind = "artifact" | "web";

export interface OpenedYeliDocument {
  artifact: string;
  artifactKind: "yeli" | "markdown";
  fingerprint: string;
  freshness: DerivedFreshness;
  markdown: string;
  payload: YeliDocumentPayload;
  releaseTemplate: string;
}

export type HostOpenResult =
  | { document: OpenedYeliDocument; ok: true }
  | {
      error: string;
      ok: false;
      recovery?: Extract<ParseArtifactResult, { ok: false }>;
      releaseTemplate?: string;
    };

export interface YeliHost {
  fileAdapter: HostFileAdapter;
  initialResult: HostOpenResult;
  kind: YeliHostKind;
  releaseTemplate: string;
  webSessions?: WebSessionRepository;
  webTemplate?: WebTemplateCapability;
}

export interface HostFileAdapter {
  chooseFile(
    fallback: () => void,
    open: (file: File, handle: FileHandleLike | null) => Promise<void>,
  ): Promise<void>;
  retainHandleOnOpen(
    file: File,
    handle: FileHandleLike | null,
  ): FileHandleLike | null;
  openFile(file: File, handle: FileHandleLike | null): Promise<HostOpenResult>;
  accept: string;
}
