import { describe, expect, it } from "vitest";

import {
  normalizeLocale,
  resolveInitialLocale,
  resolveLocalePreference,
} from "../../src/i18n/locale.ts";

describe("normalizeLocale", () => {
  it.each([
    ["zh", "zh-CN"],
    ["zh-Hans", "zh-CN"],
    ["zh-CN", "zh-CN"],
    ["en", "en"],
    ["en-US", "en"],
    ["EN-gb", "en"],
  ])("maps %s to a supported UI locale", (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });

  it.each([null, undefined, "", "fr-FR", "  "])(
    "rejects unsupported locale %s",
    (input) => {
      expect(normalizeLocale(input)).toBeNull();
    },
  );
});

describe("resolveLocalePreference", () => {
  it("prefers a stored UI choice over document and browser languages", () => {
    expect(resolveLocalePreference("en", "zh-CN", ["zh-CN", "en-US"])).toBe(
      "en",
    );
  });

  it("then follows the document language", () => {
    expect(resolveLocalePreference(null, "en-GB", ["zh-CN"])).toBe("en");
  });

  it("then follows the first supported browser language", () => {
    expect(resolveLocalePreference(null, null, ["fr-FR", "en-US"])).toBe("en");
    expect(resolveLocalePreference(null, null, ["zh-TW"])).toBe("zh-CN");
  });

  it("falls back to Simplified Chinese when no preference is supported", () => {
    expect(resolveLocalePreference("fr", "ja", ["de-DE"])).toBe("zh-CN");
  });
});

describe("resolveInitialLocale", () => {
  it("uses the same explicit precedence for application startup", () => {
    expect(resolveInitialLocale(null, "en-GB", ["zh-CN"])).toBe("en");
    expect(resolveInitialLocale("zh-CN", "en", ["en-US"])).toBe("zh-CN");
    expect(resolveInitialLocale(null, null, ["en-US", "zh-CN"])).toBe("en");
  });
});
