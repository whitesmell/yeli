import {
  YELI_FORMAT,
  YELI_VERSION,
  type YeliDocumentPayload,
  type JsonValue,
  type ValidationFinding,
} from "./model.ts";

export interface FormatBudgets {
  maxAssetCount: number;
  maxDecodedAssetBytes: number;
  maxFileBytes: number;
  maxJsonKeys: number;
  maxJsonNestingDepth: number;
  maxLineCharacters: number;
  maxMarkdownLines: number;
  maxPayloadBytes: number;
  maxTotalDecodedAssetBytes: number;
}

export const DEFAULT_FORMAT_BUDGETS: FormatBudgets = {
  maxFileBytes: 64 * 1024 * 1024,
  maxPayloadBytes: 48 * 1024 * 1024,
  maxJsonNestingDepth: 32,
  maxJsonKeys: 20_000,
  maxMarkdownLines: 100_000,
  maxLineCharacters: 1024 * 1024,
  maxAssetCount: 256,
  maxDecodedAssetBytes: 8 * 1024 * 1024,
  maxTotalDecodedAssetBytes: 32 * 1024 * 1024,
};

export function resolveFormatBudgets(
  overrides: Partial<FormatBudgets> = {},
): FormatBudgets {
  return { ...DEFAULT_FORMAT_BUDGETS, ...overrides };
}

export const YELI_DOCUMENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://yeli.invalid/schema/document-v1.json",
  title: "YELI document payload version 1",
  type: "object",
  additionalProperties: true,
  required: [
    "format",
    "version",
    "docId",
    "revision",
    "manifest",
    "markdown",
    "settings",
    "assets",
  ],
  properties: {
    format: { const: YELI_FORMAT },
    version: { const: YELI_VERSION },
    docId: { type: "string", minLength: 1, maxLength: 256 },
    revision: { type: "integer", minimum: 0 },
    manifest: {
      type: "object",
      additionalProperties: true,
      required: [
        "sourceHash",
        "docId",
        "revision",
        "metadata",
        "headings",
        "links",
        "tasks",
        "codeLanguages",
        "assetReferences",
        "stats",
      ],
      properties: {
        sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        docId: { type: "string", minLength: 1, maxLength: 256 },
        revision: { type: "integer", minimum: 0 },
        metadata: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            lang: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            authors: { type: "array", items: { type: "string" } },
            aliases: { type: "array", items: { type: "string" } },
          },
        },
        headings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "anchor",
              "level",
              "lineEnd",
              "lineStart",
              "sectionEndLine",
              "text",
            ],
            properties: {
              anchor: { type: "string" },
              level: { type: "integer", minimum: 1, maximum: 6 },
              lineEnd: { type: "integer", minimum: 1 },
              lineStart: { type: "integer", minimum: 1 },
              sectionEndLine: { type: "integer", minimum: 1 },
              text: { type: "string" },
            },
          },
        },
        links: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["destination", "kind", "line", "text"],
            properties: {
              destination: { type: "string" },
              kind: { enum: ["image", "link"] },
              line: { type: "integer", minimum: 1 },
              text: { type: "string" },
            },
          },
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["checked", "line", "text"],
            properties: {
              checked: { type: "boolean" },
              line: { type: "integer", minimum: 1 },
              text: { type: "string" },
            },
          },
        },
        codeLanguages: { type: "array", items: { type: "string" } },
        assetReferences: { type: "array", items: { type: "string" } },
        stats: {
          type: "object",
          additionalProperties: false,
          required: [
            "assets",
            "bytes",
            "characters",
            "headings",
            "lines",
            "links",
            "tasks",
            "words",
          ],
          properties: {
            assets: { type: "integer", minimum: 0 },
            bytes: { type: "integer", minimum: 0 },
            characters: { type: "integer", minimum: 0 },
            headings: { type: "integer", minimum: 0 },
            lines: { type: "integer", minimum: 0 },
            links: { type: "integer", minimum: 0 },
            tasks: { type: "integer", minimum: 0 },
            words: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    markdown: {
      type: "object",
      additionalProperties: false,
      required: ["lines", "finalNewline"],
      properties: {
        lines: { type: "array", items: { type: "string" } },
        finalNewline: { type: "boolean" },
      },
    },
    agentSummary: {
      type: "object",
      additionalProperties: true,
      required: ["sourceHash", "updatedAt", "updatedBy", "content"],
      properties: {
        changeSummary: { type: "string" },
        sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        updatedAt: { type: "string" },
        updatedBy: { type: "string" },
        content: { type: "string" },
      },
    },
    settings: { type: "object", additionalProperties: true },
    assets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["id", "mimeType", "data"],
      },
    },
  },
} as const;

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function finding(
  code: string,
  message: string,
  path: string,
): ValidationFinding {
  return { code, message, path, severity: "error" };
}

interface SanitizeState {
  budgets: FormatBudgets;
  findings: ValidationFinding[];
  keyCount: number;
  seen: WeakSet<object>;
}

function sanitizeValue(
  value: unknown,
  path: string,
  depth: number,
  state: SanitizeState,
): JsonValue | undefined {
  if (depth > state.budgets.maxJsonNestingDepth) {
    state.findings.push(
      finding(
        "JSON_NESTING_BUDGET",
        `JSON nesting exceeds ${state.budgets.maxJsonNestingDepth}`,
        path,
      ),
    );
    return undefined;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    state.findings.push(
      finding("NON_JSON_VALUE", "Numbers must be finite", path),
    );
    return undefined;
  }
  if (typeof value !== "object") {
    state.findings.push(
      finding("NON_JSON_VALUE", "Payload values must be pure JSON data", path),
    );
    return undefined;
  }
  if (state.seen.has(value)) {
    state.findings.push(
      finding("NON_JSON_VALUE", "Payload values must not contain cycles", path),
    );
    return undefined;
  }
  state.seen.add(value);

  if (Array.isArray(value)) {
    const output: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) {
        state.findings.push(
          finding(
            "NON_JSON_VALUE",
            "Sparse arrays and accessors are not pure JSON data",
            `${path}[${index}]`,
          ),
        );
        continue;
      }
      const sanitized = sanitizeValue(
        descriptor.value,
        `${path}[${index}]`,
        depth + 1,
        state,
      );
      if (sanitized !== undefined) output.push(sanitized);
    }
    return output;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== null && prototype !== Object.prototype) {
    state.findings.push(
      finding(
        "NON_JSON_VALUE",
        "Payload objects must have a plain or null prototype",
        path,
      ),
    );
    return undefined;
  }
  const output = Object.create(null) as Record<string, JsonValue>;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) {
    state.keyCount += 1;
    if (state.keyCount > state.budgets.maxJsonKeys) {
      state.findings.push(
        finding(
          "JSON_KEY_BUDGET",
          `JSON key count exceeds ${state.budgets.maxJsonKeys}`,
          path,
        ),
      );
      break;
    }
    if (FORBIDDEN_KEYS.has(key)) {
      state.findings.push(
        finding(
          "PROTOTYPE_KEY_FORBIDDEN",
          `Key ${key} is forbidden in document data`,
          `${path}.${key}`,
        ),
      );
      continue;
    }
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor)) {
      state.findings.push(
        finding(
          "NON_JSON_VALUE",
          "Accessors are not pure JSON data",
          `${path}.${key}`,
        ),
      );
      continue;
    }
    const sanitized = sanitizeValue(
      descriptor.value,
      `${path}.${key}`,
      depth + 1,
      state,
    );
    if (sanitized !== undefined) {
      Object.defineProperty(output, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: sanitized,
      });
    }
  }
  return output;
}

export interface PayloadSchemaResult {
  findings: ValidationFinding[];
  ok: boolean;
  payload?: YeliDocumentPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function requireShape(
  condition: boolean,
  findings: ValidationFinding[],
  code: string,
  message: string,
  path: string,
): void {
  if (!condition) findings.push(finding(code, message, path));
}

export function sanitizeJsonDocument(
  input: unknown,
  budgets: FormatBudgets = DEFAULT_FORMAT_BUDGETS,
): { findings: ValidationFinding[]; value?: JsonValue } {
  const state: SanitizeState = {
    budgets,
    findings: [],
    keyCount: 0,
    seen: new WeakSet(),
  };
  const value = sanitizeValue(input, "$", 0, state);
  return {
    findings: state.findings,
    ...(value === undefined ? {} : { value }),
  };
}

export function validatePayloadSchema(
  input: unknown,
  budgets: FormatBudgets = DEFAULT_FORMAT_BUDGETS,
): PayloadSchemaResult {
  const sanitized = sanitizeJsonDocument(input, budgets);
  const findings = [...sanitized.findings];
  if (!isRecord(sanitized.value)) return { findings, ok: false };
  const value = sanitized.value;

  requireShape(
    value.format === YELI_FORMAT,
    findings,
    "UNSUPPORTED_FORMAT",
    `format must be ${YELI_FORMAT}`,
    "$.format",
  );
  requireShape(
    value.version === YELI_VERSION,
    findings,
    "UNSUPPORTED_VERSION",
    `version must be ${YELI_VERSION}`,
    "$.version",
  );
  requireShape(
    typeof value.docId === "string" &&
      value.docId.length > 0 &&
      value.docId.length <= 256,
    findings,
    "DOC_ID_INVALID",
    "docId must be a non-empty string of at most 256 characters",
    "$.docId",
  );
  requireShape(
    typeof value.revision === "number" &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0,
    findings,
    "REVISION_INVALID",
    "revision must be a non-negative safe integer",
    "$.revision",
  );

  const markdown = value.markdown;
  requireShape(
    isRecord(markdown),
    findings,
    "MARKDOWN_INVALID",
    "markdown must be an object",
    "$.markdown",
  );
  if (isRecord(markdown)) {
    requireShape(
      hasOnlyKeys(markdown, ["lines", "finalNewline"]),
      findings,
      "MARKDOWN_FIELD_UNKNOWN",
      "markdown contains a field outside the version 1 encoding",
      "$.markdown",
    );
    requireShape(
      Array.isArray(markdown.lines),
      findings,
      "MARKDOWN_LINES_INVALID",
      "markdown.lines must be an array",
      "$.markdown.lines",
    );
    requireShape(
      typeof markdown.finalNewline === "boolean",
      findings,
      "MARKDOWN_FINAL_NEWLINE_INVALID",
      "markdown.finalNewline must be boolean",
      "$.markdown.finalNewline",
    );
    if (Array.isArray(markdown.lines)) {
      requireShape(
        markdown.lines.length <= budgets.maxMarkdownLines,
        findings,
        "MARKDOWN_LINE_BUDGET",
        `markdown line count exceeds ${budgets.maxMarkdownLines}`,
        "$.markdown.lines",
      );
      for (let index = 0; index < markdown.lines.length; index += 1) {
        const line = markdown.lines[index];
        requireShape(
          typeof line === "string" && !/[\r\n]/u.test(line),
          findings,
          "MARKDOWN_LINE_INVALID",
          "each Markdown line must be a string without line terminators",
          `$.markdown.lines[${index}]`,
        );
        if (typeof line === "string") {
          requireShape(
            line.length <= budgets.maxLineCharacters,
            findings,
            "MARKDOWN_LINE_WIDTH_BUDGET",
            `Markdown line exceeds ${budgets.maxLineCharacters} characters`,
            `$.markdown.lines[${index}]`,
          );
        }
      }
      if (
        markdown.finalNewline === false &&
        markdown.lines.length > 0 &&
        markdown.lines.at(-1) === ""
      ) {
        findings.push(
          finding(
            "MARKDOWN_ENCODING_NON_CANONICAL",
            "non-final Markdown encoding must not end with an empty line",
            "$.markdown",
          ),
        );
      }
    }
  }

  requireShape(
    isRecord(value.manifest),
    findings,
    "MANIFEST_INVALID",
    "manifest must be an object",
    "$.manifest",
  );
  if (isRecord(value.manifest)) {
    const manifest = value.manifest;
    requireShape(
      typeof manifest.sourceHash === "string" &&
        /^[a-f0-9]{64}$/u.test(manifest.sourceHash),
      findings,
      "SOURCE_HASH_INVALID",
      "manifest.sourceHash must be a lowercase SHA-256 hex digest",
      "$.manifest.sourceHash",
    );
    requireShape(
      typeof manifest.docId === "string" &&
        manifest.docId.length > 0 &&
        manifest.docId.length <= 256,
      findings,
      "MANIFEST_FIELD_INVALID",
      "manifest.docId must be a non-empty string of at most 256 characters",
      "$.manifest.docId",
    );
    requireShape(
      isNonNegativeInteger(manifest.revision),
      findings,
      "MANIFEST_FIELD_INVALID",
      "manifest.revision must be a non-negative safe integer",
      "$.manifest.revision",
    );

    const metadata = manifest.metadata;
    requireShape(
      isRecord(metadata),
      findings,
      "MANIFEST_FIELD_INVALID",
      "manifest.metadata must be an object",
      "$.manifest.metadata",
    );
    if (isRecord(metadata)) {
      requireShape(
        hasOnlyKeys(metadata, [
          "title",
          "description",
          "lang",
          "tags",
          "authors",
          "aliases",
        ]),
        findings,
        "MANIFEST_FIELD_INVALID",
        "manifest.metadata contains an unknown derived field",
        "$.manifest.metadata",
      );
      for (const key of ["title", "description", "lang"] as const) {
        requireShape(
          metadata[key] === undefined || typeof metadata[key] === "string",
          findings,
          "MANIFEST_FIELD_INVALID",
          `manifest.metadata.${key} must be a string when present`,
          `$.manifest.metadata.${key}`,
        );
      }
      for (const key of ["tags", "authors", "aliases"] as const) {
        requireShape(
          metadata[key] === undefined || isStringArray(metadata[key]),
          findings,
          "MANIFEST_FIELD_INVALID",
          `manifest.metadata.${key} must be a string array when present`,
          `$.manifest.metadata.${key}`,
        );
      }
    }

    requireShape(
      Array.isArray(manifest.headings),
      findings,
      "MANIFEST_FIELD_INVALID",
      "manifest.headings must be an array",
      "$.manifest.headings",
    );
    if (Array.isArray(manifest.headings)) {
      for (let index = 0; index < manifest.headings.length; index += 1) {
        const heading = manifest.headings[index];
        requireShape(
          isRecord(heading) &&
            hasOnlyKeys(heading, [
              "anchor",
              "level",
              "lineEnd",
              "lineStart",
              "sectionEndLine",
              "text",
            ]) &&
            typeof heading.anchor === "string" &&
            isPositiveInteger(heading.level) &&
            heading.level <= 6 &&
            isPositiveInteger(heading.lineStart) &&
            isPositiveInteger(heading.lineEnd) &&
            isPositiveInteger(heading.sectionEndLine) &&
            typeof heading.text === "string",
          findings,
          "MANIFEST_HEADING_INVALID",
          "manifest heading has an invalid version 1 shape",
          `$.manifest.headings[${index}]`,
        );
      }
    }

    requireShape(
      Array.isArray(manifest.links),
      findings,
      "MANIFEST_FIELD_INVALID",
      "manifest.links must be an array",
      "$.manifest.links",
    );
    if (Array.isArray(manifest.links)) {
      for (let index = 0; index < manifest.links.length; index += 1) {
        const link = manifest.links[index];
        requireShape(
          isRecord(link) &&
            hasOnlyKeys(link, ["destination", "kind", "line", "text"]) &&
            typeof link.destination === "string" &&
            (link.kind === "image" || link.kind === "link") &&
            isPositiveInteger(link.line) &&
            typeof link.text === "string",
          findings,
          "MANIFEST_LINK_INVALID",
          "manifest link has an invalid version 1 shape",
          `$.manifest.links[${index}]`,
        );
      }
    }

    requireShape(
      Array.isArray(manifest.tasks),
      findings,
      "MANIFEST_FIELD_INVALID",
      "manifest.tasks must be an array",
      "$.manifest.tasks",
    );
    if (Array.isArray(manifest.tasks)) {
      for (let index = 0; index < manifest.tasks.length; index += 1) {
        const task = manifest.tasks[index];
        requireShape(
          isRecord(task) &&
            hasOnlyKeys(task, ["checked", "line", "text"]) &&
            typeof task.checked === "boolean" &&
            isPositiveInteger(task.line) &&
            typeof task.text === "string",
          findings,
          "MANIFEST_TASK_INVALID",
          "manifest task has an invalid version 1 shape",
          `$.manifest.tasks[${index}]`,
        );
      }
    }

    for (const arrayKey of ["codeLanguages", "assetReferences"] as const) {
      requireShape(
        isStringArray(manifest[arrayKey]),
        findings,
        "MANIFEST_FIELD_INVALID",
        `manifest.${arrayKey} must be a string array`,
        `$.manifest.${arrayKey}`,
      );
    }

    const stats = manifest.stats;
    const statKeys = [
      "assets",
      "bytes",
      "characters",
      "headings",
      "lines",
      "links",
      "tasks",
      "words",
    ] as const;
    requireShape(
      isRecord(stats),
      findings,
      "MANIFEST_FIELD_INVALID",
      "manifest.stats must be an object",
      "$.manifest.stats",
    );
    if (isRecord(stats)) {
      requireShape(
        hasOnlyKeys(stats, statKeys),
        findings,
        "MANIFEST_FIELD_INVALID",
        "manifest.stats contains an unknown derived field",
        "$.manifest.stats",
      );
      for (const key of statKeys) {
        requireShape(
          isNonNegativeInteger(stats[key]),
          findings,
          "MANIFEST_FIELD_INVALID",
          `manifest.stats.${key} must be a non-negative safe integer`,
          `$.manifest.stats.${key}`,
        );
      }
    }
  }

  requireShape(
    isRecord(value.settings),
    findings,
    "SETTINGS_INVALID",
    "settings must be an object",
    "$.settings",
  );
  requireShape(
    Array.isArray(value.assets) && value.assets.length <= budgets.maxAssetCount,
    findings,
    "ASSETS_INVALID",
    `assets must be an array with at most ${budgets.maxAssetCount} items`,
    "$.assets",
  );
  if (Array.isArray(value.assets)) {
    for (let index = 0; index < value.assets.length; index += 1) {
      const asset = value.assets[index];
      requireShape(
        isRecord(asset) &&
          typeof asset.id === "string" &&
          typeof asset.mimeType === "string" &&
          typeof asset.data === "string",
        findings,
        "ASSET_SHAPE_INVALID",
        "asset must contain string id, mimeType, and base64 data",
        `$.assets[${index}]`,
      );
    }
  }

  if (value.agentSummary !== undefined) {
    const summary = value.agentSummary;
    requireShape(
      isRecord(summary) &&
        typeof summary.sourceHash === "string" &&
        /^[a-f0-9]{64}$/u.test(summary.sourceHash) &&
        typeof summary.updatedAt === "string" &&
        typeof summary.updatedBy === "string" &&
        typeof summary.content === "string" &&
        (summary.changeSummary === undefined ||
          typeof summary.changeSummary === "string"),
      findings,
      "AGENT_SUMMARY_INVALID",
      "agentSummary must contain sourceHash, updatedAt, updatedBy, and content strings, with an optional changeSummary string",
      "$.agentSummary",
    );
  }

  return findings.some((item) => item.severity === "error")
    ? { findings, ok: false }
    : { findings, ok: true, payload: value as unknown as YeliDocumentPayload };
}
