import { indexFrontmatter } from "./frontmatter.ts";
import { sha256Text } from "./freshness.ts";
import { setextHeadingLevel } from "../editor/markdown-lines.ts";
import type {
  YeliManifest,
  ManifestHeading,
  ManifestLink,
  ManifestTask,
} from "./model.ts";

export interface ManifestIdentity {
  docId: string;
  revision: number;
}

function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/gu, "-");
  return slug || "section";
}

function lineCount(source: string): number {
  if (source.length === 0) return 0;
  const newlines = source.match(/\n/gu)?.length ?? 0;
  return source.endsWith("\n") ? newlines : newlines + 1;
}

function wordCount(source: string): number {
  return source.match(/[\p{Letter}\p{Number}_]+/gu)?.length ?? 0;
}

function addHeadingAnchors(
  headings: Omit<ManifestHeading, "anchor" | "sectionEndLine">[],
  totalLines: number,
): ManifestHeading[] {
  const seen = new Map<string, number>();
  return headings.map((heading, index) => {
    const base = slugify(heading.text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    let sectionEndLine = totalLines;
    for (let next = index + 1; next < headings.length; next += 1) {
      const candidate = headings[next]!;
      if (candidate.level <= heading.level) {
        sectionEndLine = candidate.lineStart - 1;
        break;
      }
    }
    return {
      ...heading,
      anchor: count === 1 ? base : `${base}-${count}`,
      sectionEndLine,
    };
  });
}

function scanMarkdownStructure(source: string): {
  assetReferences: string[];
  codeLanguages: string[];
  headings: ManifestHeading[];
  links: ManifestLink[];
  tasks: ManifestTask[];
} {
  const lines = source.length === 0 ? [] : source.split("\n");
  if (source.endsWith("\n")) lines.pop();
  const frontmatter = indexFrontmatter(source);
  const frontmatterPrefix = source.slice(0, frontmatter.bodyStart);
  const contentStartsAt =
    frontmatter.status === "absent"
      ? 1
      : frontmatterPrefix.split("\n").length +
        (frontmatterPrefix.endsWith("\n") ? 0 : 1);
  const rawHeadings: Omit<ManifestHeading, "anchor" | "sectionEndLine">[] = [];
  const links: ManifestLink[] = [];
  const tasks: ManifestTask[] = [];
  const languages = new Set<string>();
  const assets = new Set<string>();
  let fence: { marker: string; width: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    if (lineNumber < contentStartsAt) continue;
    const line = lines[index]!;
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fenceMatch) {
      const token = fenceMatch[1]!;
      if (!fence) {
        fence = { marker: token[0]!, width: token.length };
        const language = fenceMatch[2]?.trim().split(/\s+/u)[0];
        if (language) languages.add(language);
      } else if (
        token[0] === fence.marker &&
        token.length >= fence.width &&
        fenceMatch[2]?.trim() === ""
      ) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;

    const atx = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/u.exec(line);
    if (atx) {
      rawHeadings.push({
        level: atx[1]!.length,
        lineStart: lineNumber,
        lineEnd: lineNumber,
        text: atx[2]!.trim(),
      });
    } else if (index > 0) {
      const setextLevel = setextHeadingLevel(lines[index - 1]!, line);
      if (setextLevel !== null) {
        rawHeadings.push({
          level: setextLevel,
          lineStart: lineNumber - 1,
          lineEnd: lineNumber,
          text: lines[index - 1]!.trim(),
        });
      }
    }

    const task = /^\s*[-+*]\s+\[([ xX])\]\s+(.*)$/u.exec(line);
    if (task) {
      tasks.push({
        checked: task[1]!.toLocaleLowerCase("en-US") === "x",
        line: lineNumber,
        text: task[2]!,
      });
    }

    const inlineLink =
      /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/gu;
    for (const match of line.matchAll(inlineLink)) {
      const kind = match[1] === "!" ? "image" : "link";
      const destination = match[3]!;
      links.push({
        destination,
        kind,
        line: lineNumber,
        text: match[2]!,
      });
      if (destination.startsWith("yeli-asset:")) {
        assets.add(destination.slice("yeli-asset:".length));
      }
    }

    const reference = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)/u.exec(line);
    if (reference) {
      const destination = reference[2]!.replace(/^<(.+)>$/u, "$1");
      links.push({
        destination,
        kind: "link",
        line: lineNumber,
        text: reference[1]!,
      });
      if (destination.startsWith("yeli-asset:")) {
        assets.add(destination.slice("yeli-asset:".length));
      }
    }
  }

  return {
    assetReferences: [...assets].sort(),
    codeLanguages: [...languages].sort(),
    headings: addHeadingAnchors(rawHeadings, lines.length),
    links,
    tasks,
  };
}

export function assetReferencesFromMarkdown(source: string): string[] {
  return scanMarkdownStructure(source).assetReferences;
}

export async function deriveManifest(
  source: string,
  identity: ManifestIdentity,
  subtle: SubtleCrypto | null | undefined = globalThis.crypto?.subtle,
): Promise<YeliManifest> {
  const frontmatter = indexFrontmatter(source);
  const scanned = scanMarkdownStructure(source);
  return {
    sourceHash: await sha256Text(source, subtle),
    docId: identity.docId,
    revision: identity.revision,
    metadata: frontmatter.metadata,
    headings: scanned.headings,
    links: scanned.links,
    tasks: scanned.tasks,
    codeLanguages: scanned.codeLanguages,
    assetReferences: scanned.assetReferences,
    stats: {
      bytes: new TextEncoder().encode(source).byteLength,
      characters: [...source].length,
      lines: lineCount(source),
      words: wordCount(source),
      headings: scanned.headings.length,
      links: scanned.links.length,
      tasks: scanned.tasks.length,
      assets: scanned.assetReferences.length,
    },
  };
}
