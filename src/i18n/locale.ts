export type Locale = "en" | "zh-CN";

export const LOCALE_STORAGE_KEY = "yeli:locale";

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return null;
}

export function resolveLocalePreference(
  stored: unknown,
  documentLanguage: unknown,
  browserLanguages: readonly string[],
): Locale {
  return (
    normalizeLocale(stored) ??
    normalizeLocale(documentLanguage) ??
    browserLanguages.map(normalizeLocale).find((locale) => locale !== null) ??
    "zh-CN"
  );
}

export function resolveInitialLocale(
  stored: unknown,
  documentLanguage: unknown,
  browserLanguages: readonly string[],
): Locale {
  return resolveLocalePreference(stored, documentLanguage, browserLanguages);
}
