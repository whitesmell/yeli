import {
  YELI_FORMAT,
  YELI_VERSION,
  createDocumentPayload,
  type YeliDocumentPayload,
  type JsonValue,
  type ValidationFinding,
} from "../document/model.ts";
import {
  DEFAULT_FORMAT_BUDGETS,
  sanitizeJsonDocument,
  type FormatBudgets,
} from "../document/schema.ts";

export type MigrationResult =
  | { payload: YeliDocumentPayload; status: "current" }
  | { fromVersion: 0; payload: YeliDocumentPayload; status: "migrated" }
  | {
      extractableMarkdown?: string;
      findings: ValidationFinding[];
      status: "unsupported";
    };

function finding(
  code: string,
  message: string,
  path: string,
): ValidationFinding {
  return { code, message, path, severity: "error" };
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeJsonValue(value: JsonValue | undefined): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return String(value);
  return Array.isArray(value) ? "array" : "object";
}

const V0_REPLACED_KEYS = new Set([
  "format",
  "version",
  "id",
  "revision",
  "source",
  "manifest",
  "markdown",
  "settings",
  "assets",
  "agentSummary",
]);

export async function migratePayload(
  input: unknown,
  budgets: FormatBudgets = DEFAULT_FORMAT_BUDGETS,
): Promise<MigrationResult> {
  const sanitized = sanitizeJsonDocument(input, budgets);
  if (!isRecord(sanitized.value) || sanitized.findings.length > 0) {
    return {
      findings: [
        ...sanitized.findings,
        finding("CORRUPT_PAYLOAD", "Payload is not safe pure JSON data", "$"),
      ],
      status: "unsupported",
    };
  }
  const value = sanitized.value;
  if (value.format !== YELI_FORMAT) {
    return {
      findings: [
        finding(
          "UNSUPPORTED_FORMAT",
          `Unsupported payload format ${describeJsonValue(value.format)}`,
          "$.format",
        ),
      ],
      status: "unsupported",
    };
  }
  if (value.version === YELI_VERSION) {
    return {
      payload: value as unknown as YeliDocumentPayload,
      status: "current",
    };
  }
  if (typeof value.version === "number" && value.version > YELI_VERSION) {
    return {
      findings: [
        finding(
          "FUTURE_VERSION",
          `Payload version ${value.version} is newer than supported version ${YELI_VERSION}`,
          "$.version",
        ),
      ],
      status: "unsupported",
    };
  }
  if (value.version !== 0) {
    return {
      findings: [
        finding(
          "UNSUPPORTED_VERSION",
          `Payload version ${describeJsonValue(value.version)} is unsupported`,
          "$.version",
        ),
      ],
      status: "unsupported",
    };
  }
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.source !== "string"
  ) {
    return {
      ...(typeof value.source === "string"
        ? { extractableMarkdown: value.source }
        : {}),
      findings: [
        finding(
          "CORRUPT_PAYLOAD",
          "Version 0 requires id, revision, and source",
          "$",
        ),
      ],
      status: "unsupported",
    };
  }

  const payload = await createDocumentPayload(value.source, {
    docId: value.id,
    revision: value.revision,
    ...(isRecord(value.settings)
      ? { settings: value.settings }
      : { settings: {} }),
    ...(Array.isArray(value.assets)
      ? {
          assets: value.assets as unknown as YeliDocumentPayload["assets"],
        }
      : { assets: [] }),
    ...(isRecord(value.agentSummary)
      ? {
          agentSummary: value.agentSummary as unknown as NonNullable<
            YeliDocumentPayload["agentSummary"]
          >,
        }
      : {}),
    subtle: null,
  });
  for (const key of Object.keys(value).sort()) {
    if (V0_REPLACED_KEYS.has(key)) continue;
    Object.defineProperty(payload, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: value[key],
    });
  }
  return { fromVersion: 0, payload, status: "migrated" };
}
