import { createArtifactFileAdapter, createWebFileAdapter } from "./adapters.ts";
import type { HostOpenResult, YeliHost, YeliHostKind } from "./contracts.ts";
import type { YeliDocumentPayload } from "../document/model.ts";
import { safeDocumentFilename } from "../format/save.ts";
import { markdownDownloadFilename } from "./markdown-files.ts";
import type { WebTemplateCapability } from "./web-template.ts";

export function createArtifactHost(
  initialResult: HostOpenResult,
  releaseTemplate: string,
): YeliHost {
  return {
    fileAdapter: createArtifactFileAdapter(),
    initialResult,
    kind: "artifact",
    releaseTemplate,
  };
}

export function createWebHost(
  initialResult: HostOpenResult,
  webTemplate: WebTemplateCapability = { available: false, reason: "missing" },
): YeliHost {
  return {
    fileAdapter: createWebFileAdapter(),
    initialResult,
    kind: "web",
    releaseTemplate: "",
    webTemplate,
  };
}

export function createHost(
  kind: YeliHostKind,
  initialResult: HostOpenResult,
  releaseTemplate: string,
): YeliHost {
  return kind === "artifact"
    ? createArtifactHost(initialResult, releaseTemplate)
    : createWebHost(initialResult);
}

export function saveKindForHost(
  host: Pick<YeliHost, "kind">,
): "artifact" | "markdown" {
  return host.kind === "web" ? "markdown" : "artifact";
}

export function saveFilenameForHost(
  host: Pick<YeliHost, "kind">,
  payload: YeliDocumentPayload | undefined,
): string {
  return saveKindForHost(host) === "markdown"
    ? markdownDownloadFilename(payload)
    : safeDocumentFilename(payload?.manifest.metadata.title, ".yeli.html");
}
