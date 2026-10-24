import { createHash } from "node:crypto";

export const CONTENT_POLICY_META_NAME = "Content-Security-Policy";

const CONTENT_POLICY_SLOT = "<!-- YELI_CONTENT_SECURITY_POLICY_SLOT -->";
export const PREVIEW_REMOVAL_BOOT =
  'Object.defineProperty(globalThis,"__YELI_PRISTINE_ARTIFACT__",{value:"<!doctype html>\\n"+document.documentElement.outerHTML});document.getElementById("yeli-static-preview")?.remove()';
export const COMPRESSED_RUNTIME_SCRIPT_ID = "yeli-runtime";
export const COMPRESSED_STYLE_SCRIPT_ID = "yeli-runtime-css";
export const COMPRESSED_RUNTIME_TYPE = "application/yeli+deflate-b86";
export const COMPRESSED_RUNTIME_MARKER = "deflate-b86";

interface InlineScript {
  body: string;
  hasSource: boolean;
  id: string;
  openingTagStart: number;
  scriptEnd: number;
  type: string;
  previewRemoval: boolean;
  runtimeLoader: boolean;
}

const DATA_SCRIPT_TYPES = new Set([
  "application/yeli+json",
  COMPRESSED_RUNTIME_TYPE,
]);

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "iu",
  ).exec(attributes);
  return match?.[1] ?? match?.[2];
}

function scriptElements(artifact: string): InlineScript[] {
  const scripts: InlineScript[] = [];
  const openingPattern = /<script\b([^>]*)>/giu;
  let cursor = 0;
  let opening: RegExpExecArray | null;
  while ((opening = openingPattern.exec(artifact.slice(cursor))) !== null) {
    const openingStart = cursor + opening.index;
    const bodyStart = openingStart + opening[0].length;
    const closingStart = artifact.indexOf("</script>", bodyStart);
    if (closingStart === -1) {
      throw new Error("YELI script element has no closing tag");
    }
    const attributes = opening[1] ?? "";
    scripts.push({
      body: artifact.slice(bodyStart, closingStart),
      hasSource: attribute(attributes, "src") !== undefined,
      id: attribute(attributes, "id") ?? "",
      openingTagStart: openingStart,
      scriptEnd: closingStart + "</script>".length,
      type: (attribute(attributes, "type") ?? "").trim().toLowerCase(),
      previewRemoval:
        attribute(attributes, "data-yeli-boot") === "preview-removal",
      runtimeLoader:
        attribute(attributes, "data-yeli-runtime") ===
        COMPRESSED_RUNTIME_MARKER,
    });
    cursor = closingStart + "</script>".length;
    openingPattern.lastIndex = 0;
  }
  return scripts;
}

function executableScripts(artifact: string): {
  carriers: InlineScript[];
  executable: InlineScript[];
  previewRemoval: InlineScript;
  runtimeLoader: InlineScript | null;
  runtime: InlineScript;
} {
  const scripts = scriptElements(artifact);
  if (scripts.some((script) => script.hasSource)) {
    throw new Error("A single-file release cannot contain script src URLs");
  }
  const carriers = scripts.filter(
    (script) => script.type === COMPRESSED_RUNTIME_TYPE,
  );
  const carrierIds = new Set(
    carriers.map((script) => script.id).filter((id) => id.length > 0),
  );
  const expectedCarrierIds = new Set([
    COMPRESSED_RUNTIME_SCRIPT_ID,
    COMPRESSED_STYLE_SCRIPT_ID,
  ]);
  const validCarriers =
    carriers.length === 0 ||
    (carriers.length === 2 &&
      carrierIds.size === 2 &&
      [...carrierIds].every((id) => expectedCarrierIds.has(id)) &&
      carriers.every(
        (script) =>
          expectedCarrierIds.has(script.id) &&
          script.body.length > 0 &&
          !script.body.includes("<"),
      ));
  if (!validCarriers) {
    throw new Error(
      "YELI compressed runtime must contain exactly the fixed runtime and style carriers",
    );
  }
  const runtimeLoaders = scripts.filter(
    (script) => script.type === "module" && script.runtimeLoader,
  );
  const plainModules = scripts.filter(
    (script) => script.type === "module" && !script.runtimeLoader,
  );
  if (
    carriers.length === 2
      ? runtimeLoaders.length !== 1 || plainModules.length !== 0
      : runtimeLoaders.length !== 0
  ) {
    throw new Error(
      "YELI release must contain exactly one authorized runtime entry point",
    );
  }
  const leakedCarrierMarkers = scripts.filter(
    (script) =>
      script.type !== COMPRESSED_RUNTIME_TYPE &&
      (script.body.includes(`id="${COMPRESSED_RUNTIME_SCRIPT_ID}"`) ||
        script.body.includes(`id="${COMPRESSED_STYLE_SCRIPT_ID}"`)),
  );
  if (leakedCarrierMarkers.length > 0) {
    throw new Error("A YELI carrier marker appears outside its data block");
  }
  const unauthorized = scripts.filter(
    (script) =>
      script.type !== "module" &&
      !DATA_SCRIPT_TYPES.has(script.type) &&
      !(
        script.type === "" &&
        script.previewRemoval &&
        script.body === PREVIEW_REMOVAL_BOOT
      ),
  );
  if (unauthorized.length > 0) {
    throw new Error(
      `YELI release contains ${unauthorized.length} unauthorized script element(s)`,
    );
  }
  const runtimes = scripts.filter((script) => script.type === "module");
  if (runtimes.length !== 1) {
    throw new Error(
      `YELI release must contain one inlined module runtime; found ${runtimes.length}`,
    );
  }
  const previewRemoval = scripts.filter(
    (script) =>
      script.type === "" &&
      script.previewRemoval &&
      script.body === PREVIEW_REMOVAL_BOOT,
  );
  if (previewRemoval.length !== 1) {
    throw new Error(
      `YELI release must contain one preview-removal boot script; found ${previewRemoval.length}`,
    );
  }
  return {
    carriers,
    executable: [
      previewRemoval[0]!,
      ...(carriers.length === 2 ? runtimeLoaders : runtimes),
    ],
    previewRemoval: previewRemoval[0]!,
    runtimeLoader: carriers.length === 2 ? runtimeLoaders[0]! : null,
    runtime: runtimes[0]!,
  };
}

function scriptHash(body: string): string {
  return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
}

export function createArtifactContentPolicy(artifact: string): {
  executableScriptCount: number;
  policy: string;
  scriptHashes: string[];
} {
  const { executable, runtimeLoader } = executableScripts(artifact);
  const scriptHashes = executable.map((script) => scriptHash(script.body));
  const policy = [
    "default-src 'none'",
    `script-src ${scriptHashes.join(" ")}${runtimeLoader ? " blob:" : ""}`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "media-src data: blob:",
    "frame-src 'self'",
    "connect-src 'none'",
    "font-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "manifest-src 'none'",
    "worker-src 'none'",
  ].join("; ");
  return { executableScriptCount: executable.length, policy, scriptHashes };
}

export function rewriteArtifactContentPolicy(
  artifact: string,
  policy: string,
): string {
  const metaPattern =
    /<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/giu;
  const matches = [...artifact.matchAll(metaPattern)];
  if (matches.length !== 1) {
    throw new Error(`Expected one content policy; found ${matches.length}`);
  }
  const meta = matches[0]!;
  return `${artifact.slice(0, meta.index)}<meta http-equiv="${CONTENT_POLICY_META_NAME}" content="${policy}" />${artifact.slice(meta.index + meta[0].length)}`;
}

export function placeRuntimeBeforePreviewBoot(artifact: string): string {
  const { previewRemoval, runtime } = executableScripts(artifact);
  const runtimeBlock = artifact.slice(
    runtime.openingTagStart,
    runtime.scriptEnd,
  );
  const withoutRuntime = `${artifact.slice(0, runtime.openingTagStart)}${artifact.slice(runtime.scriptEnd)}`;
  const bootIndex =
    previewRemoval.openingTagStart -
    (runtime.openingTagStart < previewRemoval.openingTagStart
      ? runtime.scriptEnd - runtime.openingTagStart
      : 0);
  return `${withoutRuntime.slice(0, bootIndex)}${runtimeBlock}\n${withoutRuntime.slice(bootIndex)}`;
}

export function injectArtifactContentPolicy(artifact: string): string {
  const slotStart = artifact.indexOf(CONTENT_POLICY_SLOT);
  if (slotStart === -1) {
    throw new Error("Missing YELI content-policy slot");
  }
  if (
    artifact.indexOf(
      CONTENT_POLICY_SLOT,
      slotStart + CONTENT_POLICY_SLOT.length,
    ) !== -1
  ) {
    throw new Error("Expected exactly one YELI content-policy slot");
  }
  const { policy } = createArtifactContentPolicy(artifact);
  return artifact.replace(
    CONTENT_POLICY_SLOT,
    `<meta http-equiv="${CONTENT_POLICY_META_NAME}" content="${policy}" />`,
  );
}

export interface ContentPolicyValidation {
  executableScriptCount: number;
  findings: string[];
  ok: boolean;
  policy: string;
  scriptHashes: string[];
}

export function validateArtifactContentPolicy(
  artifact: string,
): ContentPolicyValidation {
  const findings: string[] = [];
  let runtime;
  try {
    runtime = executableScripts(artifact).runtime;
  } catch (error) {
    return {
      executableScriptCount: 0,
      findings: [error instanceof Error ? error.message : String(error)],
      ok: false,
      policy: "",
      scriptHashes: [],
    };
  }
  const beforeRuntime = artifact.slice(0, runtime.openingTagStart);
  const metaMatches = [
    ...beforeRuntime.matchAll(
      /<meta\b([^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*)>/giu,
    ),
  ];
  if (metaMatches.length !== 1) {
    return {
      executableScriptCount: 0,
      findings: [`Expected one content policy; found ${metaMatches.length}`],
      ok: false,
      policy: "",
      scriptHashes: [],
    };
  }
  const actualPolicy = attribute(metaMatches[0]?.[1] ?? "", "content") ?? "";
  let expected;
  try {
    expected = createArtifactContentPolicy(artifact);
  } catch (error) {
    findings.push(error instanceof Error ? error.message : String(error));
    return {
      executableScriptCount: 0,
      findings,
      ok: false,
      policy: actualPolicy,
      scriptHashes: [],
    };
  }
  if (actualPolicy !== expected.policy) {
    findings.push("Content policy does not match the exact inlined runtime");
  }
  if (actualPolicy.includes("'unsafe-eval'")) {
    findings.push("Content policy must not allow unsafe-eval");
  }
  if (!actualPolicy.includes("connect-src 'none'")) {
    findings.push("Content policy must block runtime connections");
  }
  return {
    executableScriptCount: expected.executableScriptCount,
    findings,
    ok: findings.length === 0,
    policy: actualPolicy,
    scriptHashes: expected.scriptHashes,
  };
}
