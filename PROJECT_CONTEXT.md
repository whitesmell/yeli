# Yeli project context

Yeli is an offline, local-first Markdown editor carried by one
editable `.yeli.html` file. Markdown including YAML frontmatter is the authored
authority. Rendered content, outlines, manifests and statistics are derived.

## Product boundaries

- Read and Edit are the primary modes. Default editing uses a source-mapped
  block canvas with bounded Markdown transactions.
- Advanced Source/Split is a separately composed optional build. Its trusted
  code does not come from document payloads.
- External Agents operate through the file format and Node helper. There is
  no built-in AI editing, model API, account, collaboration or cloud sync.
- Local recovery, history and file handles remain outside portable documents.
- Editable HTML requires a trusted sender or origin. Static export is the
  boundary for untrusted publication.
- Old `.aimd.html` files are rejected while preserving their original bytes.
  Do not add silent conversion or compatibility.

## Source layout

- `src/`: runtime, editor, rendering, storage, translations and owned brand code.
- `site/`: website and bilingual user tutorial sources.
- `scripts/`, `packages/cli/`, `skills/yeli/`: file helper, CLI and generic Skill.
- `tests/`: synthetic unit, integration, security and browser evidence.
- `docs/`: essential public development and integration references.

Use [the documentation index](docs/README.md),
[format](docs/format.md), [architecture](docs/architecture.md) and
[development guide](docs/development.md) when changing behavior.

## Language and distribution

The canonical source repository is `https://github.com/whitesmell/yeli`.
GitHub Pages is selected for `yeli.zetury.com`, with DNS managed in Cloudflare.
The website is live over HTTPS after its own build and site checks.
Signed editor distribution remains gated by the release runbook.

Canonical locales are `zh-CN` and `en`; `zh-Hans` is an accepted input alias.
UI translation keys must exist in both locale files. UI language preferences
do not rewrite authored document language.

Generated files share ignored `dist/`. Source does not contain distribution
copies; bilingual editable artifacts are separate Release assets after
validation. The website is deployed from `dist/site/`, not from the workspace.
CLI manifests remain `private: true` until a separate npm publication decision.

The project uses the [MIT License](LICENSE), subject to applicable third-party
terms. See [project status](docs/project-status.md) and
[the release runbook](docs/releasing.md) for remaining release work.

## Public boundary

Publish only essential source, usage/development documentation, synthetic tests
and owned runtime/website assets. Internal product contracts, implementation
plans, design studies, research, private logs and review evidence are excluded.
They are not dependencies of the public build or contribution workflow.
See [public scope](docs/public-scope.md).

Preserve unrelated local changes. Run checks appropriate to the change and
report their limits. Existing private Git history is not sanitized by excluding
files from the current tree; publication requires a separately reviewed clean
source snapshot or history cleanup. No remote or publication is implied by
directory preparation.
