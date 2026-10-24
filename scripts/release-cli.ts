export function parseReleaseCliOptions(
  arguments_: string[],
  usage: string,
): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(usage);
    parsed.set(key.slice(2), value);
  }
  return parsed;
}

export function requireReleaseCliOption(
  options: ReadonlyMap<string, string>,
  key: string,
): string {
  const value = options.get(key);
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}
