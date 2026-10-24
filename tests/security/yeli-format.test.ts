import { describe, expect, it } from "vitest";

import { validateYeliPayload } from "../../src/agent/validate";
import { createDocumentPayload } from "../../src/document/model";

describe("YELI payload security", () => {
  it("reports active HTML and dangerous URLs without executing document data", async () => {
    delete (globalThis as { __yeliPayloadExecuted?: boolean })
      .__yeliPayloadExecuted;
    const payload = await createDocumentPayload(
      `<script>globalThis.__yeliPayloadExecuted = true</script>\n\n[x](javascript:alert(1))\n`,
      { docId: "doc-security", revision: 1 },
    );

    const result = await validateYeliPayload(payload);

    expect(result.ok).toBe(true);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["RAW_HTML_UNSAFE", "URL_UNSAFE"]),
    );
    expect(
      (globalThis as { __yeliPayloadExecuted?: boolean }).__yeliPayloadExecuted,
    ).toBeUndefined();
  });
});
