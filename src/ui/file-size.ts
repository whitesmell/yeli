export function formatArtifactSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(2)} KB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}
