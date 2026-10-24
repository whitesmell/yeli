import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateArtifactContentPolicy } from "../../src/integrity/content-policy.ts";
import { projectShell } from "../../src/integrity/shell-projection.ts";
import { decodeMarkdown } from "../../src/document/model.ts";
import { parseYeliArtifact } from "../../src/format/parse.ts";
import {
  YELI_AGENT_PREAMBLE,
  PAYLOAD_OPENING_TAG,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "../../src/format/serialize.ts";

const distributionDirectory = resolve("dist/html");
const artifactPath = resolve(distributionDirectory, "starter.zh-CN.yeli.html");
const englishArtifactPath = resolve(
  distributionDirectory,
  "starter.en.yeli.html",
);

describe("single-file production contract", () => {
  it("produces one self-contained Yeli artifact for each starter language", () => {
    const files = readdirSync(distributionDirectory);
    const artifact = readFileSync(artifactPath, "utf8");

    expect(files.sort()).toEqual([
      "starter.en.yeli.html",
      "starter.zh-CN.yeli.html",
    ]);
    expect(artifact).toContain(
      '<meta name="yeli:format" content="yeli/document"',
    );
    expect(artifact).toContain("让知识成为可以携带的文件");
    expect(artifact).toContain('<html lang="zh-CN">');
    expect(artifact).not.toMatch(
      /<(?:script|link|img|source)[^>]+(?:src|href)=["']https?:/i,
    );
    const license = readFileSync(resolve("LICENSE"), "utf8");
    for (const file of [artifactPath, englishArtifactPath]) {
      expect(readFileSync(file, "utf8")).toContain(
        `<!-- YELI_PROJECT_LICENSE\n${license}-->`,
      );
    }
  });

  it("keeps the current default-profile milestone within 1,000,000 raw bytes", () => {
    expect(statSync(artifactPath).size).toBeLessThanOrEqual(1_000_000);
    expect(statSync(englishArtifactPath).size).toBeLessThanOrEqual(1_000_000);
  });

  it("builds a separate English starter document", async () => {
    const artifact = readFileSync(englishArtifactPath, "utf8");
    const parsed = await parseYeliArtifact(artifact);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const markdown = decodeMarkdown(parsed.payload.markdown);
    const preview = artifact.slice(
      artifact.indexOf(STATIC_PREVIEW_OPEN),
      artifact.indexOf(STATIC_PREVIEW_CLOSE),
    );

    expect(markdown).toContain("title: Make knowledge a file you can carry");
    expect(markdown).toContain("lang: en");
    expect(artifact).toContain('<html lang="en">');
    expect(markdown).not.toContain("让知识成为可以携带的文件");
    expect(preview).toContain("<p>Yeli · portable Markdown</p>");
    expect(preview).not.toContain("页里 · 可携带的 Markdown");
  });

  it("excludes the optional Advanced Source plugin from the default artifact", () => {
    const artifact = readFileSync(artifactPath, "utf8");

    expect(artifact).not.toContain("@codemirror");
    expect(artifact).not.toContain("cm-editor");
    expect(artifact).not.toContain("view.advanced");
    expect(artifact).not.toContain("高级视图");
  });

  it("places one readable Agent boundary before runtime and validates its fixed shell projection", () => {
    const artifact = readFileSync(artifactPath, "utf8");
    const preamble = artifact.indexOf(YELI_AGENT_PREAMBLE);
    const payload = artifact.indexOf(PAYLOAD_OPENING_TAG);
    const previewClose = artifact.indexOf(STATIC_PREVIEW_CLOSE);
    const previewRemoval = artifact.indexOf('data-yeli-boot="preview-removal"');
    const runtime = artifact.search(/<script\b[^>]*type="module"[^>]*>/u);

    expect(preamble).toBeGreaterThan(0);
    expect(payload).toBeGreaterThan(preamble);
    expect(previewRemoval).toBeGreaterThan(previewClose);
    expect(previewRemoval).toBeGreaterThan(runtime);
    expect(runtime).toBeGreaterThan(payload);
    expect(artifact.split(YELI_AGENT_PREAMBLE)).toHaveLength(2);
    expect(artifact.split(PAYLOAD_OPENING_TAG)).toHaveLength(2);
    expect(artifact.split(STATIC_PREVIEW_OPEN)).toHaveLength(2);
    expect(artifact.split(STATIC_PREVIEW_CLOSE)).toHaveLength(2);
    expect(artifact.split('data-yeli-boot="preview-removal"')).toHaveLength(2);
    expect(artifact).not.toContain('id="yeli-release-template"');
    expect(projectShell(artifact)).toMatchObject({
      payloadMarkerCount: 1,
      staticPreviewMarkerCount: 1,
      version: 1,
    });
  });

  it("ships a hash-authorized no-network policy for the exact inlined runtime", () => {
    const artifact = readFileSync(artifactPath, "utf8");
    const policy = validateArtifactContentPolicy(artifact);

    expect(policy.ok).toBe(true);
    expect(policy.executableScriptCount).toBe(2);
    expect(policy.scriptHashes).toHaveLength(2);
    expect(policy.findings).toEqual([]);
    expect(policy.policy).toContain("default-src 'none'");
    expect(policy.policy).toContain("connect-src 'none'");
    expect(policy.policy).toContain("object-src 'none'");
    expect(policy.policy).not.toContain("'unsafe-eval'");

    const extraRuntime = artifact.replace(
      "</body>",
      "<script>globalThis.unexpected = true;</script></body>",
    );
    expect(validateArtifactContentPolicy(extraRuntime)).toMatchObject({
      ok: false,
      executableScriptCount: 0,
    });
    expect(validateArtifactContentPolicy(extraRuntime).findings).toContain(
      "YELI release contains 1 unauthorized script element(s)",
    );

    const alteredBoot = artifact.replace(
      'document.getElementById("yeli-static-preview")?.remove()',
      'document.getElementById("yeli-static-preview")?.remove();alert(1)',
    );
    expect(validateArtifactContentPolicy(alteredBoot)).toMatchObject({
      ok: false,
      executableScriptCount: 0,
    });
  });
});
