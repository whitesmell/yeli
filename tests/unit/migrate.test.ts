import { describe, expect, it } from "vitest";

import { migratePayload } from "../../src/format/migrate";

describe("payload migration", () => {
  it("migrates the supported v0 shape once without changing Markdown", async () => {
    const result = await migratePayload({
      format: "yeli/document",
      version: 0,
      id: "legacy-doc",
      revision: 8,
      source: "# Legacy\r\n\r\nBody\r\n",
      settings: { theme: "paper" },
      assets: [],
      futureSafe: { retained: true },
    });

    expect(result.status).toBe("migrated");
    if (result.status !== "migrated") return;
    expect(result.payload).toMatchObject({
      format: "yeli/document",
      version: 1,
      docId: "legacy-doc",
      revision: 8,
      markdown: {
        lines: ["# Legacy", "", "Body"],
        finalNewline: true,
      },
      futureSafe: { retained: true },
    });

    const second = await migratePayload(result.payload);
    expect(second.status).toBe("current");
  });

  it.each([
    [
      "unknown format",
      { format: "other/document", version: 1 },
      "UNSUPPORTED_FORMAT",
    ],
    [
      "future version",
      { format: "yeli/document", version: 99 },
      "FUTURE_VERSION",
    ],
    [
      "corrupt legacy",
      { format: "yeli/document", version: 0 },
      "CORRUPT_PAYLOAD",
    ],
  ])(
    "routes %s to recovery without mutating input",
    async (_label, input, code) => {
      const original = JSON.stringify(input);
      const result = await migratePayload(input);

      expect(result.status).toBe("unsupported");
      if (result.status !== "unsupported") return;
      expect(result.findings.map((finding) => finding.code)).toContain(code);
      expect(JSON.stringify(input)).toBe(original);
    },
  );
});
