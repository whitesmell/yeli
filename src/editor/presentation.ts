import { indexFrontmatter } from "../document/frontmatter.ts";

export interface PresentationSection {
  from: number;
  title: string;
  to: number;
}

export type PresentationResult =
  | {
      eligible: true;
      level: 1 | 2;
      sections: PresentationSection[];
    }
  | {
      eligible: false;
      reason: "mixed-levels" | "not-enough-sections";
    };

interface LocatedHeading {
  index: number;
  level: number;
  title: string;
}

interface PresentationOptions {
  bodyStart?: number;
}

function headingTitle(markdown: string): string {
  return markdown
    .replace(/^ {0,3}#{1,6}\s+/u, "")
    .replace(/\s+#+\s*$/u, "")
    .replace(/[*_`~]/gu, "")
    .trim();
}

function scanPresentationHeadings(
  source: string,
  bodyStart: number,
): LocatedHeading[] {
  const headings: LocatedHeading[] = [];
  const lines = source.slice(bodyStart).split("\n");
  let cursor = bodyStart;
  let fence: { marker: string; width: number } | null = null;
  let setextCandidate: { index: number; title: string } | null = null;

  for (const line of lines) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fenceMatch) {
      const token = fenceMatch[1]!;
      if (!fence) {
        fence = { marker: token[0]!, width: token.length };
      } else if (
        token[0] === fence.marker &&
        token.length >= fence.width &&
        fenceMatch[2]?.trim() === ""
      ) {
        fence = null;
      }
      setextCandidate = null;
      cursor += line.length + 1;
      continue;
    }
    if (fence) {
      cursor += line.length + 1;
      continue;
    }

    const atx = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/u.exec(line);
    const setext = /^\s{0,3}(=+|-+)\s*$/u.exec(line);
    if (atx) {
      headings.push({
        index: cursor,
        level: atx[1]!.length,
        title: headingTitle(atx[2]!),
      });
      setextCandidate = null;
    } else if (setext && setextCandidate) {
      headings.push({
        index: setextCandidate.index,
        level: setext[1]!.startsWith("=") ? 1 : 2,
        title: headingTitle(setextCandidate.title),
      });
      setextCandidate = null;
    } else {
      setextCandidate =
        line.trim().length > 0 && !/^\s{0,3}(?:>|[-+*]\s|\d+[.)]\s)/u.test(line)
          ? { index: cursor, title: line }
          : null;
    }
    cursor += line.length + 1;
  }
  return headings;
}

export function derivePresentation(
  source: string,
  options: PresentationOptions = {},
): PresentationResult {
  const frontmatter =
    options.bodyStart === undefined ? indexFrontmatter(source) : null;
  const bodyStart =
    options.bodyStart ??
    (frontmatter?.status === "safe" ? frontmatter.bodyStart : 0);
  const headings = scanPresentationHeadings(source, bodyStart);
  const h1 = headings.filter((heading) => heading.level === 1);
  const h2 = headings.filter((heading) => heading.level === 2);
  const level =
    h1.length >= 2 ? 1 : h1.length === 0 && h2.length >= 2 ? 2 : null;
  if (level === null) {
    return {
      eligible: false,
      reason:
        h1.length > 0 && h2.length >= 2
          ? "mixed-levels"
          : "not-enough-sections",
    };
  }
  const selected = level === 1 ? h1 : h2;
  return {
    eligible: true,
    level,
    sections: selected.map((heading, index) => ({
      from: heading.index,
      title: heading.title,
      to: selected[index + 1]?.index ?? source.length,
    })),
  };
}
