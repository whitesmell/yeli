import geometry from "./yeli-logo.json" with { type: "json" };

// Contours traced from the owner-approved paired-state artwork.
export const yeliLogo = geometry;
export const yeliAccent = "#ff5b45";

export function yeliMarkTransform(expanded: boolean): string | undefined {
  return expanded
    ? `translate(${geometry.markWidth} 0) scale(-1 1)`
    : undefined;
}

export function renderYeliLogoSvg({
  expanded = false,
  markOnly = false,
}: { expanded?: boolean; markOnly?: boolean } = {}): string {
  const transform = yeliMarkTransform(expanded);
  const mark = `<g data-yeli-monogram=""${transform ? ` transform="${transform}"` : ""}><path fill-rule="evenodd" d="${geometry.monogram}"/><path data-yeli-accent="" fill="${yeliAccent}" fill-rule="evenodd" d="${geometry.monogramAccent}"/></g>`;
  const wordmark = `<g data-yeli-wordmark=""><path fill-rule="evenodd" d="${geometry.wordmark}"/><path data-yeli-accent="" fill="${yeliAccent}" d="${geometry.wordmarkAccent}"/><circle data-yeli-accent="" fill="${yeliAccent}" cx="${geometry.dot.cx}" cy="${geometry.dot.cy}" r="${geometry.dot.r}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markOnly ? geometry.markViewBox : geometry.viewBox}" fill="currentColor" aria-hidden="true" focusable="false">${mark}${markOnly ? "" : wordmark}</svg>`;
}
