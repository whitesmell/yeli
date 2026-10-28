import react from "@vitejs/plugin-react-swc";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

import { createDocumentPayload } from "./src/document/model.ts";
import { starterMarkdown } from "./src/document/starter.ts";
import { starterMarkdown as starterMarkdownEn } from "./src/document/starter-en.ts";
import { normalizeStarterLocale } from "./src/document/starter-locale.ts";
import { compressArtifact } from "./src/format/compress-artifact.ts";
import { finalizeReleaseArtifact } from "./src/format/finalize-artifact.ts";
import {
  YELI_AGENT_PREAMBLE,
  serializePayloadBlock,
} from "./src/format/serialize.ts";
import {
  buildNoscriptNotice,
  buildStaticPreviewHtml,
} from "./src/format/static-shell-preview.ts";
import {
  PREVIEW_REMOVAL_BOOT,
  injectArtifactContentPolicy,
  placeRuntimeBeforePreviewBoot,
} from "./src/integrity/content-policy.ts";

const isSingleFile = process.env.YELI_SINGLE_FILE === "1";
const isEmptyRelease = process.env.YELI_EMPTY_RELEASE === "1";
const isAdvancedProfile = process.env.YELI_ADVANCED_PLUGIN === "1";
const compressSingleFile = process.env.YELI_COMPRESS !== "0";
const requestedStarterLocale = process.env.YELI_STARTER_LOCALE ?? "zh-CN";
const starterLocale = normalizeStarterLocale(requestedStarterLocale);
if (!isEmptyRelease && !starterLocale) {
  throw new Error(
    `Unsupported YELI_STARTER_LOCALE: ${requestedStarterLocale}. Use en or zh-CN.`,
  );
}
const initialStarterMarkdown =
  starterLocale === "en" ? starterMarkdownEn : starterMarkdown;
const outputDirectory = isSingleFile
  ? isAdvancedProfile
    ? "dist/advanced"
    : isEmptyRelease
      ? "dist/empty"
      : "dist/html"
  : "dist/web";
const artifactName = isEmptyRelease
  ? isAdvancedProfile
    ? "advanced-empty.yeli.html"
    : "empty.yeli.html"
  : isAdvancedProfile
    ? `advanced.${starterLocale}.yeli.html`
    : `starter.${starterLocale}.yeli.html`;
const packageVersion = (
  JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
    version: string;
  }
).version;
const DOCUMENT_SLOT = "<!-- YELI_DOCUMENT_DATA_SLOT -->";
const PREVIEW_SLOT = "<!-- YELI_STATIC_PREVIEW_CONTENT_SLOT -->";
const PREVIEW_REMOVAL_BOOT_SLOT = "<!-- YELI_PREVIEW_REMOVAL_BOOT_SLOT -->";

function embeddedDocument() {
  return {
    name: "yeli-embedded-document",
    async transformIndexHtml(html: string) {
      const initialMarkdown = isEmptyRelease ? "" : initialStarterMarkdown;
      const payload = await createDocumentPayload(initialMarkdown, {
        docId: isEmptyRelease ? "yeli-empty" : "yeli-starter",
        revision: isEmptyRelease ? 1 : 12,
        subtle: null,
      });
      return html
        .replace(
          "<!-- YELI_PROJECT_LICENSE_SLOT -->",
          `<!-- YELI_PROJECT_LICENSE\n${readFileSync(resolve("LICENSE"), "utf8")}-->`,
        )
        .replace(
          /<noscript>[\s\S]*?<\/noscript>\s*(?=<!-- YELI_STATIC_PREVIEW_CONTENT_SLOT -->)/u,
          buildNoscriptNotice(starterLocale ?? "zh-CN"),
        )
        .replace(
          '<html lang="zh-CN">',
          `<html lang="${starterLocale ?? "zh-CN"}">`,
        )
        .replace(
          "React, CodeMirror, markdown-it",
          isAdvancedProfile
            ? "React, CodeMirror, markdown-it"
            : "React, markdown-it",
        )
        .replace(
          "markdown-it, DOMPurify",
          `markdown-it, markdown-it-footnote, DOMPurify`,
        )
        .replace(
          DOCUMENT_SLOT,
          `<!-- markdown-it-footnote 4.0.0\n${readFileSync(resolve("node_modules/markdown-it-footnote/LICENSE"), "utf8")}-->\n${DOCUMENT_SLOT}`,
        )
        .replace(
          DOCUMENT_SLOT,
          `${YELI_AGENT_PREAMBLE}\n${serializePayloadBlock(payload)}`,
        )
        .replace(
          PREVIEW_SLOT,
          buildStaticPreviewHtml(
            payload,
            initialMarkdown,
            starterLocale ?? "zh-CN",
          ),
        )
        .replace(
          PREVIEW_REMOVAL_BOOT_SLOT,
          `<script data-yeli-boot="preview-removal">${PREVIEW_REMOVAL_BOOT}</script>`,
        );
    },
  };
}

function renameSingleFile() {
  let completed = false;
  return {
    name: "yeli-rename-single-file",
    async closeBundle() {
      if (completed) return;
      const source = resolve(outputDirectory, "index.html");
      const target = resolve(outputDirectory, artifactName);
      if (!existsSync(source)) {
        throw new Error(
          `Expected ${outputDirectory}/index.html from the single-file build`,
        );
      }
      let artifact = injectArtifactContentPolicy(
        placeRuntimeBeforePreviewBoot(readFileSync(source, "utf8")),
      );
      if (!artifact.includes('data-yeli-boot="preview-removal"')) {
        throw new Error("Expected the preview-removal boot script");
      }
      if (compressSingleFile) {
        artifact = (await compressArtifact(artifact)).artifact;
      }
      artifact = finalizeReleaseArtifact(artifact);
      writeFileSync(source, artifact, "utf8");
      renameSync(source, target);
      completed = true;
    },
  };
}

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      {
        find: "#advanced-mode",
        replacement: resolve(
          isAdvancedProfile
            ? "src/optional/advanced-source/enhanced.ts"
            : "src/optional/advanced-source/none.ts",
        ),
      },
      ...(isEmptyRelease
        ? [
            {
              find: "../document/starter.ts",
              replacement: resolve("src/document/empty-starter.ts"),
            },
          ]
        : []),
    ],
  },
  define: {
    __YELI_VERSION__: JSON.stringify(packageVersion),
  },
  plugins: [
    embeddedDocument(),
    react(),
    ...(isSingleFile ? [viteSingleFile(), renameSingleFile()] : []),
  ],
  build: {
    // Variant builds share a local build root but cannot replace each other's output.
    emptyOutDir: !isSingleFile,
    outDir: outputDirectory,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 8192,
    target: "es2022",
  },
});
