import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createDocumentPayload } from "../../src/document/model.ts";
import {
  serializePayloadBlock,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "../../src/format/serialize.ts";
import { buildStaticPreviewHtml } from "../../src/format/static-shell-preview.ts";
import { projectShell } from "../../src/integrity/shell-projection.ts";
import {
  validateWebTemplate,
  type WebTemplateMetadata,
} from "../../src/host/web-template.ts";

async function fixture(source = "") {
  const payload = await createDocumentPayload(source, {
    docId: "yeli-empty",
    revision: 1,
    subtle: null,
  });
  return `<!doctype html><html><body>${serializePayloadBlock(payload)}${STATIC_PREVIEW_OPEN}\n${buildStaticPreviewHtml(payload, source)}\n${STATIC_PREVIEW_CLOSE}</body></html>`;
}

function metadata(artifact: string): WebTemplateMetadata {
  return {
    version: "0.1.0",
    profile: "empty",
    bytes: Buffer.byteLength(artifact),
    format: "yeli/document",
    formatVersion: 1,
    hash: createHash("sha256").update(artifact).digest("hex"),
    shellHash: projectShell(artifact).hash,
    shellProjectionVersion: 1,
  };
}

describe("build-owned web export template", () => {
  it("enables only the exact empty artifact and pins its shell", async () => {
    const artifact = await fixture();
    const result = await validateWebTemplate(
      artifact,
      metadata(artifact),
      "0.1.0",
    );
    expect(result).toMatchObject({
      available: true,
      artifact,
      shellHash: projectShell(artifact).hash,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("fails closed when absent or when any exact byte changes", async () => {
    const artifact = await fixture();
    expect(await validateWebTemplate("", null, "0.1.0")).toEqual({
      available: false,
      reason: "missing",
    });
    expect(
      await validateWebTemplate(`${artifact}\n`, metadata(artifact), "0.1.0"),
    ).toEqual({ available: false, reason: "hash" });
  });

  it.each([
    [
      "nonempty",
      (text: string) => text.replace('"lines": []', '"lines": ["sample"]'),
    ],
    [
      "format",
      (text: string) =>
        text.replace('"format": "yeli/document"', '"format": "other/document"'),
    ],
    [
      "version",
      (text: string) => text.replace('"version": 1', '"version": 999'),
    ],
    [
      "nonempty",
      (text: string) =>
        text.replace(
          '"settings": {}',
          '"settings": {"draft": "must not travel"}',
        ),
    ],
    [
      "nonempty",
      (text: string) =>
        text.replace('"assets": []', '"futureSafe": true,\n  "assets": []'),
    ],
  ] as const)(
    "rejects %s even with matching exact hash",
    async (reason, change) => {
      const artifact = change(await fixture());
      expect(
        await validateWebTemplate(artifact, metadata(artifact), "0.1.0"),
      ).toEqual({
        available: false,
        reason,
      });
    },
  );

  it("rejects another app release and mismatched or unsafe shell projection", async () => {
    const artifact = await fixture();
    expect(
      await validateWebTemplate(artifact, metadata(artifact), "0.2.0"),
    ).toEqual({
      available: false,
      reason: "version",
    });
    expect(
      await validateWebTemplate(
        artifact,
        { ...metadata(artifact), shellHash: "0".repeat(64) },
        "0.1.0",
      ),
    ).toEqual({ available: false, reason: "shell" });
    const unsafe = artifact.replace(
      "</article>",
      '<img src="https://bad.test/x"></article>',
    );
    expect(
      await validateWebTemplate(
        unsafe,
        {
          ...metadata(artifact),
          hash: createHash("sha256").update(unsafe).digest("hex"),
          bytes: Buffer.byteLength(unsafe),
        },
        "0.1.0",
      ),
    ).toEqual({ available: false, reason: "shell" });
  });
});
