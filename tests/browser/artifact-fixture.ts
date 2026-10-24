import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

import { createDocumentPayload } from "../../src/document/model.ts";
import { createSavedArtifact } from "../../src/format/save.ts";

const syntheticGif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);

export async function importImageFixture(page: Page, source: string) {
  const id = `sha256:${createHash("sha256").update(syntheticGif).digest("hex")}`;
  const markdown = source.replaceAll(
    "yeli-demo:workspace-photo",
    `yeli-asset:${id}`,
  );
  const payload = await createDocumentPayload(markdown, {
    assets: [
      { id, data: syntheticGif.toString("base64"), mimeType: "image/gif" },
    ],
    docId: "synthetic-browser-image",
    revision: 1,
    subtle: null,
  });
  const result = await createSavedArtifact({
    payload,
    releaseTemplate: readFileSync(
      path.resolve("dist/html/starter.zh-CN.yeli.html"),
      "utf8",
    ),
    revision: 1,
    source: markdown,
  });
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(result.artifact),
    mimeType: "text/html",
    name: "synthetic-image.yeli.html",
  });
  return markdown;
}
