export type SetextHeadingLevel = 1 | 2;

const THEMATIC_BREAK =
  /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/u;

function isSetextParagraphLine(line: string): boolean {
  if (line.trim().length === 0 || /^(?: {4}|\t)/u.test(line)) return false;
  if (THEMATIC_BREAK.test(line)) return false;
  return !/^ {0,3}(?:#{1,6}(?:[ \t]+|$)|>|(?:[-+*]|\d+[.)])(?:[ \t]+|$)|`{3,}|~{3,}|\[\^[^\]]+\]:|\[[^\]]+\]:|<!--|<\/?[A-Za-z!]|\$\$(?:[ \t]|$)|:::(?:[ \t]|$))/u.test(
    line,
  );
}

export function setextHeadingLevel(
  paragraphLine: string,
  underlineLine: string | undefined,
): SetextHeadingLevel | null {
  if (underlineLine === undefined || !isSetextParagraphLine(paragraphLine)) {
    return null;
  }
  const underline = /^ {0,3}(=+|-+)[ \t]*$/u.exec(underlineLine);
  if (!underline) return null;
  return underline[1]!.startsWith("=") ? 1 : 2;
}
