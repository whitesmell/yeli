# Contributing to yeli

English · [简体中文](CONTRIBUTING.zh-CN.md)

Yeli is experimental and accepts contributions under the [MIT License](LICENSE).
The canonical source repository is [whitesmell/yeli](https://github.com/whitesmell/yeli).
Source publication does not announce an editor release; see
[project status](docs/project-status.md).

## Get oriented

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) and [AGENTS.md](AGENTS.md) first.
For product, format, or lifecycle work, read the relevant
[public references](docs/README.md#development-references-and-brand). Use
[development](docs/development.md) for setup and commands.

Markdown including YAML frontmatter is authoritative. The editor canvas,
manifest, outline, and previews are derived. Preserve unedited source ranges,
unknown safe fields, and existing user changes.

The default product is offline and local-first, with Read and Edit as its two
primary modes. Built-in AI editing, accounts, sync, collaboration, executable
document plugins, and browser-side shell updates are outside V1 scope.

## Report a bug or propose a change

Use the [repository issue forms](https://github.com/whitesmell/yeli/issues/new/choose). Include the
version or commit, browser/OS, transport (`file://` or trusted HTTPS), minimal
synthetic reproduction, and expected versus actual behavior.

Explain proposals in terms of the user problem and the existing scope.
Discuss format changes, new dependencies, and product-scope changes before
implementation. Report vulnerabilities through [SECURITY.md](SECURITY.md).

Do not attach real documents, plaintext recovery data, file handles,
credentials, or private signing material. Build the smallest synthetic example
that demonstrates the problem.

## Prepare a pull request

1. Create a focused branch, normally `codex/<description>` for agent work.
2. Keep the diff narrow and preserve unrelated local work. Keep ignored
   `reference/` research read-only.
3. Use the existing typed operations for UI and helper behavior. Never
   serialize live DOM or promote derived data to content authority.
4. Add or update meaningful tests when behavior changes. For documentation or
   mechanical configuration changes, use relevant format, link, and config checks.
5. Update affected public specifications and tests for product/format changes. Put the
   problem, verification, and limits in the pull request or public docs; do not
   add a private session log or local-path evidence to the repository.
6. Fill in the pull request template with the problem, resulting behavior,
   evidence, and any limits.

User-facing strings must be added to both `src/i18n/en.ts` and
`src/i18n/zh-CN.ts` under the same key. Use synthetic Chinese and English
content when a change can exercise layout, localization, or accessibility.

See [the development checks](docs/development.md#checks) for commands. Build
before running the full test suite: some integration tests inspect the exact
`dist/html/starter.zh-CN.yeli.html` artifact. A successful build or passing unit tests alone
do not satisfy the release checklist.

## Evidence expectations

| Change             | Required evidence                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| File format        | Round-trip, hostile terminators, migration, unknown fields, source fidelity, freshness, shell diffs |
| Editor operations  | Narrow source diffs, undo, focus, and accessibility                                                 |
| Save/recovery      | Overwrite fallback, external conflicts, unavailable storage, static preview, complete-file size     |
| Rendering/security | Sanitizer, URLs, remote resources, budgets, no unapproved network                                   |
| Agent helper       | Expected revision/hash, structured receipts, unchanged shell, stale-data handling                   |
| Release claims     | Exact built file, offline browser/transport evidence, final size gate, remaining manual checks      |

Only synthetic fixtures belong in the repository and CI. Do not replace
unperformed manual checks or real-Agent benchmarks with simulated success.

## Contribution license

Submit contributions under the project's [MIT License](LICENSE). Preserve
applicable third-party copyright and license notices.
