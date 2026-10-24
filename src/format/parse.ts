import {
  resolveDerivedFreshness,
  type DerivedFreshness,
} from "../document/freshness.ts";
import {
  decodeMarkdown,
  type YeliDocumentPayload,
  type ValidationFinding,
} from "../document/model.ts";
import {
  resolveFormatBudgets,
  validatePayloadSchema,
  type FormatBudgets,
} from "../document/schema.ts";
import { validateAssets } from "./assets.ts";
import { migratePayload } from "./migrate.ts";

export interface PayloadBoundary {
  closingTagEnd: number;
  markerCount: number;
  openingTagStart: number;
  payloadEnd: number;
  payloadStart: number;
  prefix: string;
  suffix: string;
}

export type LocatePayloadResult =
  | { boundary: PayloadBoundary; ok: true }
  | { findings: ValidationFinding[]; markerCount: number; ok: false };

export type ParseArtifactResult =
  | {
      boundary: PayloadBoundary;
      findings: ValidationFinding[];
      freshness: DerivedFreshness;
      markdown: string;
      migrated: boolean;
      ok: true;
      originalBytes: string;
      payload: YeliDocumentPayload;
    }
  | {
      findings: ValidationFinding[];
      ok: false;
      recovery: {
        extractableMarkdown?: string;
        kind: "corrupt" | "future-version" | "unsupported-format";
        originalBytes: string;
      };
    };

function finding(
  code: string,
  message: string,
  path: string,
): ValidationFinding {
  return { code, message, path, severity: "error" };
}

function hasAttribute(tag: string, name: string, value: string): boolean {
  const expression = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "giu",
  );
  const matches = [...tag.matchAll(expression)];
  if (matches.length !== 1) return false;
  return (matches[0]?.[1] ?? matches[0]?.[2]) === value;
}

export function locatePayloadBlock(artifact: string): LocatePayloadResult {
  const matches = [...artifact.matchAll(/<script\b[^>]*>/giu)].filter(
    (match) =>
      hasAttribute(match[0], "id", "yeli-doc") &&
      hasAttribute(match[0], "type", "application/yeli+json"),
  );
  if (matches.length !== 1) {
    return {
      findings: [
        finding(
          "PAYLOAD_MARKER_COUNT",
          `Expected one yeli-doc payload marker; found ${matches.length}`,
          "$artifact",
        ),
      ],
      markerCount: matches.length,
      ok: false,
    };
  }
  const match = matches[0]!;
  const openingTagStart = match.index;
  let payloadStart = openingTagStart + match[0].length;
  if (artifact[payloadStart] === "\n") payloadStart += 1;
  const closingTagStart = artifact.indexOf("</script>", payloadStart);
  if (closingTagStart === -1) {
    return {
      findings: [
        finding(
          "PAYLOAD_CLOSING_MARKER_MISSING",
          "The yeli-doc payload has no closing script marker",
          "$artifact",
        ),
      ],
      markerCount: 1,
      ok: false,
    };
  }
  const payloadEnd =
    artifact[closingTagStart - 1] === "\n"
      ? closingTagStart - 1
      : closingTagStart;
  const closingTagEnd = closingTagStart + "</script>".length;
  return {
    boundary: {
      closingTagEnd,
      markerCount: 1,
      openingTagStart,
      payloadEnd,
      payloadStart,
      prefix: artifact.slice(0, payloadStart),
      suffix: artifact.slice(payloadEnd),
    },
    ok: true,
  };
}

function rawExtractableMarkdown(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const markdown = ownDataProperty(value, "markdown");
  if (
    typeof markdown !== "object" ||
    markdown === null ||
    Array.isArray(markdown)
  ) {
    return undefined;
  }
  const lines = ownDataProperty(markdown, "lines");
  const finalNewline = ownDataProperty(markdown, "finalNewline");
  if (
    !Array.isArray(lines) ||
    !lines.every((line) => typeof line === "string") ||
    typeof finalNewline !== "boolean"
  ) {
    return undefined;
  }
  return `${lines.join("\n")}${finalNewline ? "\n" : ""}`;
}

function ownDataProperty(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor
    ? (descriptor.value as unknown)
    : undefined;
}

function recoveryKind(
  findings: ValidationFinding[],
): "corrupt" | "future-version" | "unsupported-format" {
  if (findings.some((item) => item.code === "FUTURE_VERSION")) {
    return "future-version";
  }
  if (findings.some((item) => item.code === "UNSUPPORTED_FORMAT")) {
    return "unsupported-format";
  }
  return "corrupt";
}

export async function parseYeliArtifact(
  artifact: string,
  budgetOverrides: Partial<FormatBudgets> = {},
  subtle: SubtleCrypto | null | undefined = globalThis.crypto?.subtle,
): Promise<ParseArtifactResult> {
  const budgets = resolveFormatBudgets(budgetOverrides);
  const artifactBytes = new TextEncoder().encode(artifact).byteLength;
  if (artifactBytes > budgets.maxFileBytes) {
    const findings = [
      finding(
        "FILE_SIZE_BUDGET",
        `Artifact exceeds ${budgets.maxFileBytes} bytes`,
        "$artifact",
      ),
    ];
    return {
      findings,
      ok: false,
      recovery: { kind: "corrupt", originalBytes: artifact },
    };
  }
  const located = locatePayloadBlock(artifact);
  if (!located.ok) {
    const isLegacyAimd =
      located.markerCount === 0 &&
      [...artifact.matchAll(/<script\b[^>]*>/giu)].some(
        (match) =>
          hasAttribute(match[0], "id", "aimd-doc") &&
          hasAttribute(match[0], "type", "application/aimd+json"),
      );
    const findings = isLegacyAimd
      ? [
          finding(
            "UNSUPPORTED_FORMAT",
            "This .aimd.html document uses the old AIMD format. Keep the original file; export its Markdown with the old helper before importing it into Yeli.",
            "$artifact",
          ),
        ]
      : located.findings;
    return {
      findings,
      ok: false,
      recovery: {
        kind: isLegacyAimd ? "unsupported-format" : "corrupt",
        originalBytes: artifact,
      },
    };
  }
  const payloadText = artifact.slice(
    located.boundary.payloadStart,
    located.boundary.payloadEnd,
  );
  if (
    new TextEncoder().encode(payloadText).byteLength > budgets.maxPayloadBytes
  ) {
    const findings = [
      finding(
        "PAYLOAD_SIZE_BUDGET",
        `Payload exceeds ${budgets.maxPayloadBytes} bytes`,
        "$payload",
      ),
    ];
    return {
      findings,
      ok: false,
      recovery: { kind: "corrupt", originalBytes: artifact },
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(payloadText) as unknown;
  } catch (error) {
    const findings = [
      finding(
        "PAYLOAD_JSON_INVALID",
        error instanceof Error ? error.message : "Payload is not valid JSON",
        "$payload",
      ),
    ];
    return {
      findings,
      ok: false,
      recovery: { kind: "corrupt", originalBytes: artifact },
    };
  }

  const migration = await migratePayload(raw, budgets);
  if (migration.status === "unsupported") {
    const extracted =
      migration.extractableMarkdown ?? rawExtractableMarkdown(raw);
    return {
      findings: migration.findings,
      ok: false,
      recovery: {
        ...(extracted === undefined ? {} : { extractableMarkdown: extracted }),
        kind: recoveryKind(migration.findings),
        originalBytes: artifact,
      },
    };
  }
  const schema = validatePayloadSchema(migration.payload, budgets);
  if (!schema.ok || !schema.payload) {
    const extractableMarkdown = rawExtractableMarkdown(migration.payload);
    return {
      findings: schema.findings,
      ok: false,
      recovery: {
        ...(extractableMarkdown === undefined ? {} : { extractableMarkdown }),
        kind: "corrupt",
        originalBytes: artifact,
      },
    };
  }
  const freshness = await resolveDerivedFreshness(schema.payload, subtle);
  const assetFindings = validateAssets(
    { ...schema.payload, manifest: freshness.manifest.value },
    budgets,
  );
  if (assetFindings.some((item) => item.severity === "error")) {
    const extractableMarkdown = decodeMarkdown(schema.payload.markdown);
    return {
      findings: [...schema.findings, ...assetFindings],
      ok: false,
      recovery: {
        extractableMarkdown,
        kind: "corrupt",
        originalBytes: artifact,
      },
    };
  }
  return {
    boundary: located.boundary,
    findings: [...schema.findings, ...assetFindings],
    freshness,
    markdown: decodeMarkdown(schema.payload.markdown),
    migrated: migration.status === "migrated",
    ok: true,
    originalBytes: artifact,
    payload: schema.payload,
  };
}
