import { normalizeMarkdownLineEndings } from "../document/model.ts";
import { safeDocumentFilename } from "../format/save.ts";

export interface MarkdownExport {
  content: string;
  filename: string;
}

export function createMarkdownExport(
  source: string,
  title?: string,
): MarkdownExport {
  return {
    content: normalizeMarkdownLineEndings(source),
    filename: safeDocumentFilename(title, ".md"),
  };
}
