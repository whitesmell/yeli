import { indexFrontmatter } from "./frontmatter.ts";
import { deriveOutline } from "../editor/outline.ts";

interface DisplayTitleOptions {
  filename?: string | null;
  unnamed: string;
}

function titleFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(filename);
    } catch {
      return filename;
    }
  })();
  const leaf = decoded.split(/[\\/]/u).at(-1) ?? "";
  const title = leaf
    .replace(/\.yeli\.html$/iu, "")
    .replace(/\.(?:html?|md|markdown)$/iu, "")
    .trim();
  return title && !/^(?:document|yeli)$/iu.test(title) ? title : null;
}

export function deriveDisplayTitle(
  source: string,
  options: DisplayTitleOptions,
): string {
  const metadataTitle = indexFrontmatter(source).metadata.title?.trim();
  if (metadataTitle) return metadataTitle;
  const firstH1 = deriveOutline(source).find((heading) => heading.level === 1);
  if (firstH1?.text) return firstH1.text;
  return titleFromFilename(options.filename) ?? options.unnamed;
}
