import type { Labels } from "../i18n/en.ts";
import type { DocumentMutationBlockKind } from "../document/store.ts";
import type { StoredVersion } from "./recovery.ts";

export type VersionCategory = "agent" | "local";

export function formatHistoryText(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (output, [key, value]) => output.replace(`{${key}}`, String(value)),
    template,
  );
}

function versionKindLabel(
  kind: DocumentMutationBlockKind,
  labels: Labels,
): string {
  if (kind === "blank") return labels.historyKindBlank;
  if (kind === "code-fence") return labels.insertCodeBlock;
  if (kind === "heading") return labels.historyKindHeading;
  if (kind === "image") return labels.image;
  if (kind === "list-item") return labels.historyKindList;
  if (kind === "paragraph") return labels.insertParagraph;
  if (kind === "quote") return labels.insertQuote;
  if (kind === "table") return labels.insertTable;
  if (kind === "task") return labels.insertTask;
  return labels.historyKindOther;
}

export function versionCategory(version: StoredVersion): VersionCategory {
  return version.change?.origin === "external-agent" ? "agent" : "local";
}

export function versionKindLabels(
  version: StoredVersion,
  labels: Labels,
): string[] {
  return Array.from(
    new Set(
      (version.change?.blockKinds ?? []).map((kind) =>
        versionKindLabel(kind, labels),
      ),
    ),
  );
}

export function versionLabel(
  version: StoredVersion,
  locale: "en" | "zh-CN",
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return formatter.format(version.updatedAt);
}

export function versionDescription(
  version: StoredVersion,
  labels: Labels,
): string {
  if (version.change?.summary?.trim()) return version.change.summary.trim();
  const operation = version.change?.operation;
  const kinds = versionKindLabels(version, labels);
  const kind = kinds[0] ?? labels.historyKindOther;
  if (operation === "wysiwyg:inline") {
    return formatHistoryText(labels.historySummaryEdited, { kind });
  }
  if (operation?.startsWith("block.convert.")) {
    return formatHistoryText(labels.historySummaryConverted, { kind });
  }
  if (operation === "block.delete") return labels.historySummaryDeleted;
  if (operation === "block.duplicate") return labels.historySummaryDuplicated;
  if (operation === "block.insert-below" || operation?.startsWith("insert.")) {
    return formatHistoryText(labels.historySummaryInserted, { kind });
  }
  if (operation?.startsWith("selection.")) {
    return labels.historySummaryFormatted;
  }
  if (operation?.startsWith("table.")) return labels.historySummaryTable;
  if (operation?.startsWith("search.replace")) {
    return labels.historySummaryReplaced;
  }
  if (operation?.startsWith("image:")) return labels.historySummaryImage;
  if (operation?.startsWith("markdown.frontmatter")) {
    return labels.historySummaryMetadata;
  }
  if (operation === "advanced-source") return labels.historySummarySource;
  if (operation === "history:restore") return labels.historySummaryRestored;
  if (operation === "recovery:restore") return labels.historySummaryRecovered;
  if (version.reason === "restore") return labels.historySummaryRestored;
  if (version.reason === "edit") {
    return kinds.length > 0
      ? formatHistoryText(labels.historySummaryEdited, { kind })
      : labels.historySummaryEditedDocument;
  }
  return labels[`historyReason_${version.reason}`];
}
