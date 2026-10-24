# Developing yeli

English · [简体中文](development.zh-CN.md)

## Prerequisites

Use the Node.js version pinned in [`.nvmrc`](../.nvmrc), currently `24.19.0`.
The supported range is declared in [package.json](../package.json).

From a source checkout:

```sh
nvm use
npm ci
npm run dev
```

Another Node version manager may select the same version. Dependency installation
and initial browser downloads require access to their registries; the built
document's core runtime works offline.

## Build profiles

| Profile          | Command                                              | Output                                   |
| ---------------- | ---------------------------------------------------- | ---------------------------------------- |
| English starter  | `npm run build:single:en`                            | `dist/html/starter.en.yeli.html`         |
| Chinese starter  | `npm run build:single:zh-CN`                         | `dist/html/starter.zh-CN.yeli.html`      |
| Both starters    | `npm run build:single:all`                           | Both files above                         |
| Empty            | `YELI_EMPTY_RELEASE=1 npm run build:single`          | `dist/empty/empty.yeli.html`             |
| English advanced | `npm run build:single:advanced:en`                   | `dist/advanced/advanced.en.yeli.html`    |
| Chinese advanced | `npm run build:single:advanced:zh-CN`                | `dist/advanced/advanced.zh-CN.yeli.html` |
| Empty advanced   | `YELI_EMPTY_RELEASE=1 npm run build:single:advanced` | `dist/advanced/advanced-empty.yeli.html` |

`npm run build` is the development web build. Use `build:single` for the
canonical portable file. The advanced profile is composed at build time and
has separate size and evidence requirements.

Generated files share the ignored `dist/` root. Portable files use `html/`,
`empty/` and `advanced/`; the web build uses `web/`, the CLI uses `cli/` and
`packages/`, and website outputs use `site/` and `releases/`.
See [public scope](public-scope.md) for the directory boundary.

The website and author tutorials are source under `site/`. After building both
starters, run `npm run build:site` and `npm run check:site`.
The site uses those exact starter bytes for its bilingual examples and handbook
templates. See [website development](../site/README.md).

`npm run validate:single` validates the Chinese starter by default.
`npm run validate:single -- --locale en` validates the English starter.
`npm run validate:single -- --empty` validates the empty artifact.
The owner deferred the historical 100,000-byte goal on 2026-10-23. The validator
reports the target as deferred and checks the actual decoded runtime/CSS,
payload, source boundaries and CSP. `--enforce-size-target` explicitly checks
the historical goal; the default command no longer fails solely for it.
Successful validation still does not certify all release evidence.

`npm run benchmark:compression -- <artifact> <report.json>` compares six Zopfli
iteration/block-splitting profiles with independent round-trip checks and build
timings. It reads an existing artifact without modifying it. See
[compression evidence](compression.md) for the selected profile and startup
measurement procedure.

## CLI and Skill distribution

```sh
npm run build:cli
npm run pack:cli
npm run build:single
npm run test:cli
```

`build:cli` compiles the helper's TypeScript dependency graph to plain
JavaScript in ignored `dist/cli/`, then adds the launcher, guides and generic
Skill. The CLI manifest is in `packages/cli/package.json`; its version, Node
range, private flag, license and dependency pins must match the root project.
The package has no lifecycle install script or browser build dependency.
`pack:cli` rebuilds it and writes a tarball into `dist/packages/`.

`test:cli` packs that exact package and installs it in a temporary directory
outside this checkout. For repeatable offline CI, the harness links only the
declared runtime dependency packages from the already installed lockfile tree,
without development dependencies or lifecycle scripts. It checks payload edits
and exports against `dist/html/starter.zh-CN.yeli.html`, conflict handling,
packaging boundaries, and runtime operation with Node networking disabled.
This is a separate deterministic command suite, not a real-model benchmark.

Keep `docs/agents.md` authoritative for operation semantics. `build:cli`
copies it into the package alongside the bilingual quick start and
`skills/yeli/SKILL.md`. The Skill discovers detailed installed docs through
`yeli --help`; it carries no second implementation. Platform plugins are
deferred. See the [quick start](agent-quickstart.md) for user installation.

## Checks

Build both starter artifacts before the full suite: some integration tests
read the exact production files. `npm test` includes unit, integration, and
security test files; it does not build first.

```sh
npm run typecheck
npm run lint
npm run format:check
npm run build:single:all
npm test
npm run test:security
npm run test:agent
npm run test:fidelity
```

| Concern                           | Command                       |
| --------------------------------- | ----------------------------- |
| Rebuild and run integration tests | `npm run test:integration`    |
| Browser matrix                    | `npm run test:browser`        |
| Supported WebKit runner           | `npm run test:browser:webkit` |
| WYSIWYG behavior                  | `npm run test:wysiwyg`        |
| Narrow-screen quality             | `npm run test:quality`        |
| Optional enhanced profile         | `npm run test:advanced`       |
| Complete-file size evidence       | `npm run spike:size`          |
| Final default artifact gate       | `npm run validate:single`     |

Install browsers before the first browser run:

```sh
npx playwright install chromium firefox webkit
```

See [browser support](browser-support.md) and the [release runbook](releasing.md)
for platform-specific constraints and dated WebKit evidence. Emulation does not
establish physical-device or branded-Safari coverage.

Formatting generated artifacts or historical fixtures can invalidate evidence.
For a focused documentation change, check only the edited paths with
`npx prettier --check <paths>` and inspect local links. Do not run a repository-wide
write formatter over unrelated work.

## Work in the repository

Read [the contribution guide](../CONTRIBUTING.md) and follow
[AGENTS.md](../AGENTS.md). Keep Markdown/frontmatter canonical, preserve unrelated
changes, and use synthetic documents for tests.

The repository and npm package identifier is `yeli`. The display name is
页里 / Yeli; the portable extension is `.yeli.html`. The npm package is private
and the project uses the [MIT License](../LICENSE). Renaming the project does not
migrate old documents or change the canonical extension.

The [.github workflow](../.github/workflows/ci.yml) uses `.nvmrc`, builds both
starter languages before the full test suite, and retains the generated
artifacts and browser evidence. Its final release validator remains a blocking
check. `dist/` is local/CI evidence only and is not committed. Signing keys and
real documents never belong in source, CI, logs, or reports.

## Localization

The application supports complete Simplified Chinese and English interfaces.
`zh-CN` is the canonical language tag; input such as `zh`, `zh-Hans`, or other
`zh-*` tags normalizes to `zh-CN`. Initial language resolution uses the saved
browser preference first, then the document's `lang` frontmatter, then the
first supported browser language, and finally Simplified Chinese. A manual
switch is stored only in browser-local preferences; it does not mutate the
document. Every new UI string must be added to both `src/i18n/en.ts` and
`src/i18n/zh-CN.ts` under the same key.

Public README, contribution, development, status, and documentation-index pages
have English and Simplified Chinese entry points. Product contracts retain
their original authoritative language rather than parallel translations.
