import { renderDocumentMarkdown } from "./markdown.ts";

export function renderSafeMarkdown(source: string): string {
  return renderDocumentMarkdown(source);
}
