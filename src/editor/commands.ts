const escapableMarkdown = /([\\`*_[\]()])/gu;

export function escapeMarkdownText(text: string): string {
  return text.replace(escapableMarkdown, "\\$1");
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/`+/gu)) {
    longest = Math.max(longest, match[0].length);
  }
  return longest;
}

function safeLinkTarget(target: string): string | null {
  const trimmed = target.trim();
  if (
    trimmed.length === 0 ||
    /^(?:javascript|data|vbscript):/iu.test(trimmed) ||
    /[\r\n<>]/u.test(trimmed)
  ) {
    return null;
  }
  if (/\s/u.test(trimmed)) return `<${trimmed}>`;
  return trimmed
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function serializeChildren(node: Node): string {
  return [...node.childNodes].map((child) => serializeNode(child)).join("");
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(node.textContent ?? "");
  }
  if (!(node instanceof HTMLElement)) return "";
  if (node.matches(".footnote-atom[data-footnote-source]")) {
    return node.getAttribute("data-footnote-source") ?? "";
  }

  const children = serializeChildren(node);
  switch (node.tagName) {
    case "B":
    case "STRONG":
      return children.length === 0 ? "" : `**${children}**`;
    case "EM":
    case "I":
      return children.length === 0 ? "" : `*${children}*`;
    case "DEL":
    case "S":
    case "STRIKE":
      return children.length === 0 ? "" : `~~${children}~~`;
    case "CODE": {
      const content = node.textContent ?? "";
      const delimiter = "`".repeat(longestBacktickRun(content) + 1);
      return `${delimiter}${content}${delimiter}`;
    }
    case "A": {
      const target = safeLinkTarget(node.getAttribute("href") ?? "");
      const title = node.getAttribute("title");
      const serializedTitle = title
        ? ` "${title.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
        : "";
      return target ? `[${children}](${target}${serializedTitle})` : children;
    }
    case "BR":
      return "\n";
    case "IMG":
      return "";
    case "DIV":
    case "P":
      return children;
    default:
      return children;
  }
}

export function serializeInlineDom(root: HTMLElement): string {
  return serializeChildren(root);
}

function plainTextNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.matches(".footnote-atom[data-footnote-source]")) {
    return node.getAttribute("data-footnote-source") ?? "";
  }
  if (node.tagName === "BR") return "\n";
  if (node.tagName === "IMG") return "";
  return [...node.childNodes].map((child) => plainTextNode(child)).join("");
}

export function plainTextFromInlineDom(root: HTMLElement): string {
  return [...root.childNodes].map((child) => plainTextNode(child)).join("");
}

export function splitInlineDomAtSelection(
  root: HTMLElement,
): { after: string; before: string } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const caret = selection.getRangeAt(0);
  if (!caret.collapsed || !root.contains(caret.commonAncestorContainer)) {
    return null;
  }

  const serializeFragment = (range: Range) => {
    const fragmentRoot = document.createElement("div");
    fragmentRoot.append(range.cloneContents());
    return serializeInlineDom(fragmentRoot);
  };
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(caret.startContainer, caret.startOffset);
  const after = document.createRange();
  after.selectNodeContents(root);
  after.setStart(caret.startContainer, caret.startOffset);
  return {
    after: serializeFragment(after),
    before: serializeFragment(before),
  };
}

function uniqueIndex(haystack: string, needle: string): number | null {
  const first = haystack.indexOf(needle);
  if (first === -1 || haystack.indexOf(needle, first + 1) !== -1) return null;
  return first;
}

export function mergeInlineTextEdit(
  originalMarkdown: string,
  beforeText: string,
  afterText: string,
): string | null {
  if (beforeText === afterText) return originalMarkdown;
  let prefix = 0;
  while (
    prefix < beforeText.length &&
    prefix < afterText.length &&
    beforeText[prefix] === afterText[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeText.length - prefix &&
    suffix < afterText.length - prefix &&
    beforeText[beforeText.length - suffix - 1] ===
      afterText[afterText.length - suffix - 1]
  ) {
    suffix += 1;
  }
  const removed = beforeText.slice(prefix, beforeText.length - suffix);
  const inserted = escapeMarkdownText(
    afterText.slice(prefix, afterText.length - suffix),
  );

  if (prefix === beforeText.length) return `${originalMarkdown}${inserted}`;
  if (suffix === beforeText.length) return `${inserted}${originalMarkdown}`;

  if (removed.length > 0) {
    const index = uniqueIndex(originalMarkdown, removed);
    if (index === null) return null;
    return `${originalMarkdown.slice(0, index)}${inserted}${originalMarkdown.slice(index + removed.length)}`;
  }

  const left = beforeText.slice(Math.max(0, prefix - 24), prefix);
  const right = beforeText.slice(prefix, prefix + 24);
  const leftIndex = left.length > 0 ? uniqueIndex(originalMarkdown, left) : 0;
  const rightIndex =
    right.length > 0
      ? uniqueIndex(originalMarkdown, right)
      : originalMarkdown.length;
  if (leftIndex === null || rightIndex === null) return null;
  const boundary = leftIndex + left.length;
  if (boundary !== rightIndex) return null;
  return `${originalMarkdown.slice(0, boundary)}${inserted}${originalMarkdown.slice(boundary)}`;
}

export function insertPlainTextAtSelection(
  text: string,
  fallbackRoot?: HTMLElement,
): boolean {
  const selection = window.getSelection();
  if (!selection) return false;
  let range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (
    fallbackRoot &&
    (!range || !fallbackRoot.contains(range.commonAncestorContainer))
  ) {
    range = document.createRange();
    range.selectNodeContents(fallbackRoot);
    range.collapse(false);
  }
  if (!range) return false;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
