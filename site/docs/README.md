# Yeli tutorial sources

中文说明：本目录是网站用户教程的唯一内容源。两套课程各自提供完整的简体中文与
英文版本；站点阅读页、全文搜索索引和可编辑离线手册均由同一正文生成。
`docs/` 中的开发、格式与发行说明仍负责贡献者参考资料。

This directory is the source of truth for the public author tutorials.
`catalog.json` defines stable chapter IDs, order, localized titles/descriptions
and the feature/topic coverage map. The `sections` list groups the 19 Yeli
chapters into five sections and the 12 Markdown chapters into three sections;
each chapter names its owning section. Each has a complete `.zh-CN.md`
and `.en.md` source under `content/`.

## Authoring

1. Read the current product contracts and implementation before describing a feature.
2. Update both languages together. Keep IDs stable; write a goal, an example or
   steps, the expected result, relevant limits and a link to the next useful topic.
3. Link to chapter `.html` paths relative to the current chapter. The build checks
   these paths and rewrites chapter links for the offline handbooks. Do not
   introduce executable HTML, remote images, manual heading IDs or extra content stores.
4. The command and shortcut chapters contain `{{command-reference}}` and
   `{{shortcut-reference}}`. The build replaces them
   with the actual command catalog and localized application labels. Change
   explanatory prose here, not a duplicate table.
5. Update the support table when an actual renderer feature changes. Keeping
   unknown source intact does not imply rendering support.
6. Keep the feature overview linked to every Yeli chapter. The four direct
   entries are feature overview, quick start, keyboard shortcuts and best
   practices. Best practices connect operations into workflows with completion
   checks; the complete command reference is a separate lookup page.

## Build and check

Use the repository Node version (`24.19.0`; see `.nvmrc`).

```sh
npm run build:single:all
npm run build:site
npm run check:site
npx playwright install chromium firefox
npm run test:site
```

The outputs under ignored `dist/site/docs/` include:

- `zh-CN/index.html` and `en/index.html`, plus 62 chapter pages.
- `index.html`, an explicit language selection entry.
- `downloads/{yeli,markdown}.{zh-CN,en}.md`.
- `downloads/{yeli,markdown}.{zh-CN,en}.yeli.html`, using current
  `dist/html/starter.<locale>.yeli.html` templates and the existing import API.
- `manifest.json`, containing canonical source hashes and complete handbook
  byte counts, hashes and template provenance.

There is no fetch-based search or runtime translation. Each page embeds its own
language's search index so `file://` works. Without JavaScript, all article text,
chapter navigation, language links and downloads remain available.

The editable downloads contain trusted executable runtime code, just like any
Yeli file. Publish only after reviewing the template and release requirements.
An automatic build is not public-release certification.

## Review responsibilities

The versioned `catalog.json` records the chapter order and coverage.
Planning freezes scope and coverage; production authors source and outputs;
acceptance checks rendered outputs against the scope, product behavior and
fixtures. This repository's sequential main-thread execution convention applies.
Do not describe a self-review as independent human or model review.

Browser evidence is generated under ignored `output/documentation-20261024/`.
Set `YELI_SITE_EVIDENCE_DIR` to a different output directory when preserving
an earlier run's screenshots and saved handbooks.
The browser test checks both locales, HTTP/file navigation, desktop/narrow
layouts, local search, language peers, downloads, script-disabled reading and
offline editable handbooks. It makes no Safari or physical-device claim.
