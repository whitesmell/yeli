#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  YELI_AGENT_API_VERSION,
  AgentApiError,
  exportMarkdownDocument,
  exportStaticDocument,
  extractDocument,
  importMarkdownDocument,
  inspectDocument,
  patchDocumentLines,
  patchMetadata,
  preReadDocument,
  refreshDocument,
  renderDocument,
  replaceDocument,
  requireAgentApiVersion,
  validateDocument,
  type CoreMetadataKey,
  type CoreMetadataValue,
  type MutationExpectation,
  type AgentMutationResult,
} from "../src/agent/operations.ts";
import { YeliOperationError } from "../src/agent/validate.ts";
import type { AgentChangeAttribution } from "../src/agent/validate.ts";
import { CORE_METADATA_KEYS } from "../src/document/frontmatter.ts";
import { normalizeMarkdownLineEndings } from "../src/document/model.ts";
import { TRUSTED_RELEASE_KEYS } from "../src/integrity/trusted-keys.ts";
import {
  migrateArtifactToRelease,
  ShellMigrationError,
  verifyArtifactShell,
} from "../src/integrity/verify.ts";
import { publishNewFile, replaceFileIfUnchanged } from "./yeli-files.ts";

interface ParsedArguments {
  command: string | undefined;
  options: Map<string, string>;
  positionals: string[];
}

function parseArguments(arguments_: string[]): ParsedArguments {
  const [command, ...rest] = arguments_;
  const options = new Map<string, string>();
  const positionals: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    if (argument.startsWith("--")) {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        throw new YeliOperationError(
          "ARGUMENT_INVALID",
          `Option ${argument} requires a value`,
        );
      }
      options.set(argument.slice(2), value);
      index += 1;
    } else {
      positionals.push(argument);
    }
  }
  return { command, options, positionals };
}

function expectation(options: Map<string, string>): MutationExpectation {
  const revision = options.get("expected-revision");
  const hash = options.get("expected-hash");
  return {
    ...(revision === undefined
      ? {}
      : {
          expectedRevision: parseInteger(revision, "--expected-revision", 0),
        }),
    ...(hash === undefined ? {} : { expectedSourceHash: hash }),
  };
}

function attribution(
  options: Map<string, string>,
): AgentChangeAttribution | undefined {
  const updatedBy = options.get("updated-by")?.trim();
  const changeSummary = options.get("change-summary")?.trim();
  if (!updatedBy && !changeSummary) return undefined;
  if (!updatedBy || !changeSummary) {
    throw new AgentApiError(
      "ARGUMENT_INVALID",
      "--updated-by and --change-summary must be supplied together",
    );
  }
  if (updatedBy.length > 256 || changeSummary.length > 1_000) {
    throw new AgentApiError(
      "ARGUMENT_INVALID",
      "--updated-by must be at most 256 characters and --change-summary at most 1000",
    );
  }
  return { changeSummary, updatedBy };
}

function parseInteger(value: string, label: string, minimum: number): number {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new AgentApiError(
      "ARGUMENT_INVALID",
      `${label} must be a base-10 integer`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new AgentApiError(
      "ARGUMENT_INVALID",
      `${label} must be a safe integer of at least ${minimum}`,
    );
  }
  return parsed;
}

async function writeValidated(
  inputPath: string,
  originalInput: Uint8Array,
  result: AgentMutationResult,
  outputArgument?: string,
): Promise<void> {
  const outputPath = resolve(outputArgument ?? inputPath);
  const validateTemporary = async (temporaryPath: string): Promise<void> => {
    const validation = await validateDocument(readUtf8File(temporaryPath));
    if (!validation.ok) {
      throw new YeliOperationError(
        "TEMPORARY_RESULT_INVALID",
        validation.findings.map((item) => item.code).join(", "),
      );
    }
  };
  if (outputArgument && outputPath !== resolve(inputPath)) {
    await publishNewFile(outputPath, result.artifact, { validateTemporary });
    return;
  }
  await replaceFileIfUnchanged(inputPath, result.artifact, originalInput, {
    validateTemporary,
  });
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new AgentApiError("INPUT_NOT_UTF8", `Input is not UTF-8: ${path}`);
  }
}

function readUtf8File(path: string): string {
  return decodeUtf8(readFileSync(path), path);
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): never {
  throw new YeliOperationError(
    "USAGE",
    "Usage: yeli <pre-read|inspect|get|extract|import|replace|patch|metadata|refresh|validate|render|export-markdown|export-static|verify-shell|migrate-shell> <input> [arguments]",
  );
}

function apiVersion(options: Map<string, string>): number {
  const value = options.get("api-version");
  if (value === undefined) return YELI_AGENT_API_VERSION;
  const parsed = parseInteger(value, "--api-version", 1);
  return requireAgentApiVersion(parsed);
}

function metadataInput(options: Map<string, string>): {
  key: CoreMetadataKey;
  value: CoreMetadataValue;
} {
  const key = options.get("key");
  const valueJson = options.get("value-json");
  if (
    !key ||
    !CORE_METADATA_KEYS.includes(key as CoreMetadataKey) ||
    !valueJson
  ) {
    throw new AgentApiError(
      "ARGUMENT_INVALID",
      "metadata requires a core --key and --value-json",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(valueJson) as unknown;
  } catch {
    throw new AgentApiError(
      "ARGUMENT_INVALID",
      "--value-json must be valid JSON",
    );
  }
  const listKey = key === "tags" || key === "authors" || key === "aliases";
  const valid = listKey
    ? Array.isArray(value) && value.every((item) => typeof item === "string")
    : typeof value === "string";
  if (!valid) {
    throw new AgentApiError(
      "ARGUMENT_INVALID",
      listKey
        ? `${key} requires a JSON string array`
        : `${key} requires a JSON string`,
    );
  }
  return { key: key as CoreMetadataKey, value: value as CoreMetadataValue };
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const artifactArgument = arguments_.positionals[0];
  if (!arguments_.command || !artifactArgument) usage();
  const version = apiVersion(arguments_.options);

  if (arguments_.command === "import") {
    const templateArgument = arguments_.options.get("template");
    const outputArgument = arguments_.options.get("output");
    if (!templateArgument || !outputArgument) {
      throw new AgentApiError(
        "ARGUMENT_INVALID",
        "import requires --template trusted.yeli.html and --output new.yeli.html",
      );
    }
    const imported = await importMarkdownDocument(
      readUtf8File(resolve(artifactArgument)),
      readUtf8File(resolve(templateArgument)),
      arguments_.options.get("doc-id") ?? randomUUID(),
      version,
    );
    await publishNewFile(resolve(outputArgument), imported.artifact, {
      validateTemporary: async (temporaryPath) => {
        const validation = await validateDocument(
          readUtf8File(temporaryPath),
          version,
        );
        if (!validation.ok) {
          throw new AgentApiError(
            "TEMPORARY_RESULT_INVALID",
            validation.findings.map((item) => item.code).join(", "),
            validation.findings,
          );
        }
      },
    });
    output({
      apiVersion: imported.apiVersion,
      document: imported.document,
      ok: imported.ok,
      receipt: imported.receipt,
    });
    return;
  }

  if (arguments_.command === "verify-shell") {
    const manifestArgument = arguments_.options.get("manifest");
    if (!manifestArgument) {
      output({
        apiVersion: version,
        exactReleaseArtifact: false,
        message: "No out-of-band release manifest was supplied",
        ok: false,
        shellVerified: false,
        status: "manifest-unavailable",
      });
      process.exitCode = 1;
      return;
    }
    const result = verifyArtifactShell(
      readUtf8File(resolve(artifactArgument)),
      readUtf8File(resolve(manifestArgument)),
      TRUSTED_RELEASE_KEYS,
    );
    output({ apiVersion: version, ...result });
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (arguments_.command === "migrate-shell") {
    const cleanReleaseArgument = arguments_.options.get("release");
    const manifestArgument = arguments_.options.get("manifest");
    const outputArgument = arguments_.options.get("output");
    if (
      !cleanReleaseArgument ||
      !manifestArgument ||
      !outputArgument ||
      arguments_.options.get("confirm-manual-migration") !== "yes"
    ) {
      throw new AgentApiError(
        "HUMAN_CONFIRMATION_REQUIRED",
        "migrate-shell requires --release, --manifest, --output, and --confirm-manual-migration yes",
      );
    }
    const migrated = await migrateArtifactToRelease(
      readUtf8File(resolve(artifactArgument)),
      readUtf8File(resolve(cleanReleaseArgument)),
      readUtf8File(resolve(manifestArgument)),
      TRUSTED_RELEASE_KEYS,
    );
    await publishNewFile(resolve(outputArgument), migrated.artifact, {
      validateTemporary: async (temporaryPath) => {
        const validation = await validateDocument(readUtf8File(temporaryPath));
        if (!validation.ok) {
          throw new AgentApiError(
            "TEMPORARY_RESULT_INVALID",
            validation.findings.map((item) => item.code).join(", "),
            validation.findings,
          );
        }
      },
    });
    output({
      apiVersion: version,
      bytes: migrated.bytes,
      fingerprint: migrated.fingerprint,
      ok: true,
      output: resolve(outputArgument),
      verification: migrated.verification,
    });
    return;
  }

  const artifactPath = resolve(artifactArgument);
  const originalInput = readFileSync(artifactPath);
  const artifact = decodeUtf8(originalInput, artifactPath);

  if (arguments_.command === "pre-read") {
    output(await preReadDocument(artifact, version));
    return;
  }
  if (arguments_.command === "inspect" || arguments_.command === "get") {
    output(await inspectDocument(artifact, version));
    return;
  }
  if (arguments_.command === "validate") {
    const result = await validateDocument(artifact, version);
    output(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (arguments_.command === "extract") {
    const markdown = await extractDocument(artifact, version);
    const outputPath = arguments_.positionals[1];
    if (outputPath) await publishNewFile(outputPath, markdown);
    else process.stdout.write(markdown);
    return;
  }
  if (arguments_.command === "render") {
    output(await renderDocument(artifact, version));
    return;
  }
  if (arguments_.command === "export-markdown") {
    const exported = await exportMarkdownDocument(artifact, version);
    const outputPath = arguments_.options.get("output");
    if (outputPath) await publishNewFile(outputPath, exported.content);
    output(exported);
    return;
  }
  if (arguments_.command === "export-static") {
    const exported = await exportStaticDocument(artifact, version);
    const outputPath = arguments_.options.get("output");
    if (outputPath) await publishNewFile(outputPath, exported.html);
    output(exported);
    return;
  }

  let result: AgentMutationResult;
  if (arguments_.command === "replace") {
    const markdownArgument = arguments_.positionals[1];
    if (!markdownArgument) usage();
    result = await replaceDocument(
      artifact,
      readFileSync(resolve(markdownArgument), "utf8"),
      expectation(arguments_.options),
      version,
      attribution(arguments_.options),
    );
  } else if (arguments_.command === "patch") {
    const insertArgument = arguments_.options.get("insert-file");
    const startLine = parseInteger(
      arguments_.options.get("start-line") ?? "",
      "--start-line",
      1,
    );
    const deleteCount = parseInteger(
      arguments_.options.get("delete-count") ?? "",
      "--delete-count",
      0,
    );
    const insertSource = normalizeMarkdownLineEndings(
      insertArgument ? readFileSync(resolve(insertArgument), "utf8") : "",
    );
    const insertLines =
      insertSource.length === 0
        ? []
        : insertSource.replace(/\n$/u, "").split("\n");
    result = await patchDocumentLines(
      artifact,
      { deleteCount, insertLines, startLine },
      expectation(arguments_.options),
      version,
      attribution(arguments_.options),
    );
  } else if (arguments_.command === "metadata") {
    const metadata = metadataInput(arguments_.options);
    result = await patchMetadata(
      artifact,
      metadata.key,
      metadata.value,
      expectation(arguments_.options),
      version,
      attribution(arguments_.options),
    );
  } else if (arguments_.command === "refresh") {
    result = await refreshDocument(
      artifact,
      expectation(arguments_.options),
      version,
    );
  } else {
    usage();
  }

  await writeValidated(
    artifactPath,
    originalInput,
    result,
    arguments_.options.get("output"),
  );
  output({
    apiVersion: version,
    ...result.receipt,
    document: result.document,
    events: result.events,
  });
}

main().catch((error: unknown) => {
  const detail =
    error instanceof YeliOperationError
      ? {
          code: error.code,
          message: error.message,
          ...(error instanceof AgentApiError && error.findings
            ? { findings: error.findings }
            : {}),
        }
      : error instanceof ShellMigrationError
        ? {
            code: error.code,
            message: error.message,
          }
        : {
            code: "UNEXPECTED_ERROR",
            message: error instanceof Error ? error.message : String(error),
          };
  process.stderr.write(
    `${JSON.stringify(
      {
        apiVersion: YELI_AGENT_API_VERSION,
        ok: false,
        error: detail,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
