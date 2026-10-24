import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type Node,
} from "yaml";

import type { ManifestMetadata, ValidationFinding } from "./model.ts";

export const CORE_METADATA_KEYS = [
  "title",
  "description",
  "lang",
  "tags",
  "authors",
  "aliases",
] as const;

export type CoreMetadataKey = (typeof CORE_METADATA_KEYS)[number];
export type CoreMetadataValue = string | string[];
export type MetadataValue = CoreMetadataValue | number | boolean;

export interface MetadataProperty extends FrontmatterEntry {
  key: string;
  value?: MetadataValue | undefined;
  editable: boolean;
}

export interface FrontmatterEntry {
  keyRange: [number, number];
  valueRange: [number, number];
}

export interface FrontmatterIndex {
  bodyStart: number;
  closingRange?: [number, number];
  entries: Partial<Record<CoreMetadataKey, FrontmatterEntry>>;
  findings: ValidationFinding[];
  frontmatterRange?: [number, number];
  metadata: ManifestMetadata;
  properties: MetadataProperty[];
  status: "absent" | "safe" | "unsafe";
}

export type FrontmatterPatchResult =
  | {
      changedRange: {
        after: [number, number];
        before: [number, number];
      };
      findings: ValidationFinding[];
      ok: true;
      source: string;
    }
  | {
      findings: ValidationFinding[];
      ok: false;
      source: string;
    };

interface FrontmatterBounds {
  bodyEnd: number;
  bodyStart: number;
  closingEnd: number;
  closingStart: number;
}

function finding(
  code: string,
  message: string,
  path = "markdown.frontmatter",
): ValidationFinding {
  return { code, message, path, severity: "error" };
}

function findFrontmatterBounds(source: string): FrontmatterBounds | null {
  if (!source.startsWith("---\n")) return null;
  let lineStart = 4;
  while (lineStart <= source.length) {
    const lineEnd = source.indexOf("\n", lineStart);
    const contentEnd = lineEnd === -1 ? source.length : lineEnd;
    const line = source.slice(lineStart, contentEnd);
    if (line === "---" || line === "...") {
      return {
        bodyStart: 4,
        bodyEnd: lineStart,
        closingStart: lineStart,
        closingEnd: lineEnd === -1 ? contentEnd : lineEnd + 1,
      };
    }
    if (lineEnd === -1) break;
    lineStart = lineEnd + 1;
  }
  return null;
}

function nodeRange(node: Node | null | undefined): [number, number] | null {
  const range = node?.range;
  return range ? [range[0], range[1]] : null;
}

export function isCoreMetadataKey(key: string): key is CoreMetadataKey {
  return CORE_METADATA_KEYS.includes(key as CoreMetadataKey);
}

function metadataValue(
  key: CoreMetadataKey,
  value: unknown,
): CoreMetadataValue | undefined {
  if (key === "tags" || key === "authors" || key === "aliases") {
    return Array.isArray(value) &&
      value.every((item) => typeof item === "string")
      ? value
      : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

export function isMetadataKey(key: string): boolean {
  return (
    key.trim() === key &&
    key.length > 0 &&
    key.length <= 128 &&
    !/[\u0000-\u001f\u007f]/u.test(key) &&
    !["__proto__", "constructor", "prototype", "<<"].includes(key)
  );
}

export function isMetadataNumber(value: number): boolean {
  return (
    Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value))
  );
}

function propertyValue(node: Node | null): MetadataValue | undefined {
  if (isScalar(node)) {
    const value: unknown = node.value;
    if (typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && isMetadataNumber(value)) return value;
    if (typeof value === "bigint" && Number.isSafeInteger(Number(value)))
      return Number(value);
  }
  if (
    isSeq(node) &&
    node.items.every((item) => isScalar(item) && typeof item.value === "string")
  ) {
    return node.items.map((item) => (item as { value: string }).value);
  }
  return undefined;
}

export function indexFrontmatter(source: string): FrontmatterIndex {
  const bounds = findFrontmatterBounds(source);
  if (!bounds) {
    return {
      bodyStart: 0,
      entries: {},
      findings: [],
      metadata: {},
      properties: [],
      status: source.startsWith("---\n") ? "unsafe" : "absent",
      ...(source.startsWith("---\n")
        ? {
            findings: [
              finding(
                "FRONTMATTER_UNTERMINATED",
                "YAML frontmatter has no closing delimiter",
              ),
            ],
          }
        : {}),
    };
  }

  const yamlSource = source.slice(bounds.bodyStart, bounds.bodyEnd);
  const document = parseDocument(yamlSource, {
    intAsBigInt: true,
    keepSourceTokens: true,
    prettyErrors: false,
    schema: "core",
    strict: true,
    uniqueKeys: false,
  });
  const findings: ValidationFinding[] = document.errors.map((error) =>
    finding("YAML_PARSE_ERROR", error.message),
  );
  const entries: Partial<Record<CoreMetadataKey, FrontmatterEntry>> = {};
  const metadata: ManifestMetadata = {};
  const properties: MetadataProperty[] = [];

  visit(document, {
    Alias() {
      findings.push(
        finding("YAML_ALIAS_UNSAFE", "YAML aliases are not safe for GUI edits"),
      );
    },
    Node(_key, node) {
      if ("tag" in node && node.tag?.startsWith("!")) {
        findings.push(
          finding(
            "YAML_TAG_UNSAFE",
            `Custom YAML tag ${node.tag} is not safe for GUI edits`,
          ),
        );
      }
    },
  });

  if (document.contents !== null && !isMap(document.contents)) {
    findings.push(
      finding("FRONTMATTER_NOT_MAPPING", "Frontmatter must be a YAML mapping"),
    );
  } else if (isMap(document.contents)) {
    if (document.contents.flow) {
      findings.push(
        finding(
          "FRONTMATTER_FLOW_MAPPING",
          "A compact root mapping must be edited in its original form",
        ),
      );
    }
    const seen = new Set<string>();
    for (const pair of document.contents.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== "string") continue;
      const key = pair.key.value;
      if (seen.has(key)) {
        findings.push(
          finding(
            isCoreMetadataKey(key)
              ? "DUPLICATE_CORE_KEY"
              : "DUPLICATE_PROPERTY_KEY",
            `Frontmatter key ${key} appears more than once`,
            `markdown.frontmatter.${key}`,
          ),
        );
        continue;
      }
      seen.add(key);
      if (isAlias(pair.value)) continue;
      const keyRange = nodeRange(pair.key);
      const valueRange = nodeRange(pair.value);
      if (!keyRange || !valueRange) {
        if (!isCoreMetadataKey(key)) {
          properties.push({
            key,
            editable: false,
            keyRange: [bounds.bodyStart, bounds.bodyStart],
            valueRange: [bounds.bodyStart, bounds.bodyStart],
          });
          continue;
        }
        findings.push(
          finding(
            "FRONTMATTER_RANGE_MISSING",
            `Core frontmatter key ${key} has no concrete source range`,
            `markdown.frontmatter.${key}`,
          ),
        );
        continue;
      }
      const value = propertyValue(pair.value);
      const entry = {
        keyRange: [
          keyRange[0] + bounds.bodyStart,
          keyRange[1] + bounds.bodyStart,
        ] as [number, number],
        valueRange: [
          valueRange[0] + bounds.bodyStart,
          valueRange[1] + bounds.bodyStart,
        ] as [number, number],
      };
      properties.push({
        ...entry,
        key,
        value,
        editable: isMetadataKey(key) && value !== undefined,
      });
      if (!isCoreMetadataKey(key)) continue;
      const parsed = metadataValue(key, value);
      if (parsed === undefined) {
        findings.push(
          finding(
            "FRONTMATTER_VALUE_UNSUPPORTED",
            `Core frontmatter key ${key} has an unsupported value shape`,
            `markdown.frontmatter.${key}`,
          ),
        );
        continue;
      }
      entries[key] = entry;
      Object.assign(metadata, { [key]: parsed });
    }
  }

  return {
    bodyStart: bounds.closingEnd,
    closingRange: [bounds.closingStart, bounds.closingEnd],
    entries,
    findings,
    frontmatterRange: [0, bounds.closingEnd],
    metadata,
    properties,
    status: findings.length === 0 ? "safe" : "unsafe",
  };
}

function plainString(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9 ./_-]*$/u.test(value)) {
    return JSON.stringify(value);
  }
  const probe = parseDocument(`value: ${value}\n`, {
    prettyErrors: false,
    schema: "core",
  }).get("value");
  return typeof probe === "string" && probe === value
    ? value
    : JSON.stringify(value);
}

function serializeValue(value: MetadataValue, original?: string): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => plainString(item)).join(", ")}]`;
  }
  if (typeof value !== "string") return String(value);
  if (/[\r\n]/u.test(value)) return JSON.stringify(value);
  if (original?.startsWith("'")) return `'${value.replaceAll("'", "''")}'`;
  if (original?.startsWith('"')) return JSON.stringify(value);
  return plainString(value);
}

function createFrontmatterEdit(
  source: string,
  key: string,
  value: MetadataValue | undefined,
): FrontmatterPatchResult {
  const validValue =
    value === undefined ||
    (isCoreMetadataKey(key)
      ? metadataValue(key, value) !== undefined
      : typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && isMetadataNumber(value)) ||
        (Array.isArray(value) &&
          value.every((item) => typeof item === "string")));
  if (!isMetadataKey(key) || !validValue) {
    return {
      ok: false,
      source,
      findings: [
        finding("INVALID_PROPERTY", "Property name or value is not supported"),
      ],
    };
  }
  const index = indexFrontmatter(source);
  if (index.status === "unsafe") {
    return { findings: index.findings, ok: false, source };
  }
  const property = index.properties.find((item) => item.key === key);
  if (property && !property.editable) {
    return {
      ok: false,
      source,
      findings: [
        finding(
          "PROPERTY_READ_ONLY",
          "This property must be edited in its original form",
        ),
      ],
    };
  }
  if (value === undefined) {
    if (!property) {
      return {
        ok: true,
        source,
        changedRange: { before: [0, 0], after: [0, 0] },
        findings: [],
      };
    }
    const start = source.lastIndexOf("\n", property.keyRange[0] - 1) + 1;
    let end = property.valueRange[1];
    const rest = source.slice(
      end,
      source.indexOf("\n", end) === -1
        ? source.length
        : source.indexOf("\n", end),
    );
    if (/^\s*#/u.test(rest)) end += rest.indexOf("#");
    else if (/^[ \t]*$/u.test(rest) && !source.slice(start, end).endsWith("\n"))
      end += rest.length + (source[end + rest.length] === "\n" ? 1 : 0);
    return {
      ok: true,
      source: source.slice(0, start) + source.slice(end),
      changedRange: { before: [start, end], after: [start, start] },
      findings: [],
    };
  }
  if (index.status === "absent") {
    const inserted = `---\n${plainString(key)}: ${serializeValue(value)}\n---\n`;
    return {
      changedRange: {
        before: [0, 0],
        after: [0, inserted.length],
      },
      findings: [],
      ok: true,
      source: `${inserted}${source}`,
    };
  }

  const entry = property;
  if (entry) {
    const [start, end] = entry.valueRange;
    const original = source.slice(start, end);
    const trailingNewlines = original.match(/\n+$/u)?.[0] ?? "";
    const replacement = `${serializeValue(value, original)}${trailingNewlines}`;
    return {
      changedRange: {
        before: [start, end],
        after: [start, start + replacement.length],
      },
      findings: [],
      ok: true,
      source: `${source.slice(0, start)}${replacement}${source.slice(end)}`,
    };
  }

  const closingStart = index.closingRange?.[0];
  if (closingStart === undefined) {
    return {
      findings: [
        finding(
          "FRONTMATTER_RANGE_MISSING",
          "Frontmatter closing delimiter has no concrete source range",
        ),
      ],
      ok: false,
      source,
    };
  }
  const insertion = `${plainString(key)}: ${serializeValue(value)}\n`;
  return {
    changedRange: {
      before: [closingStart, closingStart],
      after: [closingStart, closingStart + insertion.length],
    },
    findings: [],
    ok: true,
    source: `${source.slice(0, closingStart)}${insertion}${source.slice(closingStart)}`,
  };
}

export function patchFrontmatter(
  source: string,
  key: string,
  value: MetadataValue | undefined,
): FrontmatterPatchResult {
  const result = createFrontmatterEdit(source, key, value);
  if (!result.ok) return result;
  const next = indexFrontmatter(result.source);
  const property = next.properties.find((item) => item.key === key);
  if (
    next.status === "unsafe" ||
    (value === undefined
      ? property !== undefined
      : JSON.stringify(property?.value) !== JSON.stringify(value))
  ) {
    return {
      ok: false,
      source,
      findings: [
        finding(
          "PROPERTY_PATCH_INVALID",
          "The property edit could not be represented safely",
        ),
      ],
    };
  }
  return result;
}
