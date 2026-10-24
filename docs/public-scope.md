# Public repository scope

Reviewed scope: 2026-10-25. English · [简体中文](public-scope.zh-CN.md).

Publish only necessary source, essential documentation, synthetic tests and
owned runtime/website assets under the [MIT License](../LICENSE), subject to
third-party terms. The owner approved this scope for a clean source snapshot at
[whitesmell/yeli](https://github.com/whitesmell/yeli). Source publication does not
announce a website deployment or executable editor release.

## Included source

```text
yeli/
  .github/                 CI, website workflow, issue forms, PR template
  src/                     Runtime, editor, model, storage, security, locales
    brand/                 Owned shared logo geometry and renderer
  site/                    Website and bilingual tutorial sources
    assets/                Reviewed owned website artwork and screenshots
    docs/                  User-facing Markdown tutorial sources
    scripts/               Website and handbook builds
    tests/                 Website and documentation checks
  scripts/                 Helper, CLI packaging, builds and validation
  packages/cli/            CLI source, launcher and package configuration
  skills/yeli/SKILL.md     Generic document-use Skill
  tests/                   Synthetic unit, integration, security, browser tests
  docs/                    Essential public development and integration docs
  README*, CONTRIBUTING*, SECURITY*
  LICENSE                  MIT License
  AGENTS.md, CLAUDE.md      Concise contributor instructions
  PROJECT_CONTEXT.md       Public product boundaries, without internal logs
  package*.json            Dependencies, lockfile and commands
  index.html               Build entry template
  *.config.*, tsconfig*    Build, type, format, lint and test settings
  .nvmrc, .editorconfig, .gitattributes, .gitignore, .prettierignore
```

`docs/` uses an essential-file allowlist; review the purpose of new documents
before adding them. It serves contributors and `site/docs/` serves authors. Start with the
[documentation index](README.md). Necessary owned brand code remains in
`src/brand/` and reviewed website assets; internal design evidence is excluded.

## Excluded by default

| Path / material                                                                  | Handling                                                                                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `intent/`, `spec/`                                                               | Internal product intent, specifications and planning; private archive                                |
| `docs/plans/`                                                                    | Internal implementation, documentation and publication plans; private archive                        |
| `docs/design/`                                                                   | All design contracts, proofs and provenance evidence; previous allowlist removed                     |
| `reference/`                                                                     | Read-only third-party research, never copied into public source                                      |
| `.local-archive/`                                                                | Private sessions, QA, working issues, research and original evidence                                 |
| `output/`                                                                        | Local deliveries, reviewed snapshots and verification records; never publish the directory wholesale |
| `reports/`, `ideation/`, internal research/review directories                    | Retain necessary material privately                                                                  |
| `node_modules/`, coverage, browser reports and caches                            | Rebuildable local output                                                                             |
| `session-log.md`, `design-qa.md`, `issues*.html`                                 | Private working records                                                                              |
| Local configuration, credentials, private keys, real documents and recovery data | Excluded from source, CI and public reports                                                          |

Exclusion does not mean deletion. Preserve original contracts and necessary
private evidence. Public documentation must not depend on internal directories
or describe the editor through comparisons with third-party products. Any
future disclosure requires an explicit review of necessity, provenance and
privacy, rather than enabling an entire directory.

## Language and distribution

Canonical locales are `zh-CN` and `en`; `zh-Hans` is an input alias. UI language
preferences do not rewrite authored document language. Legacy `.aimd.html`
rejection logic and synthetic preservation tests remain public.

Source excludes all of `dist/`. After release validation, distribute
`starter.zh-CN.yeli.html` and `starter.en.yeli.html` as separate Release assets
with individual manifests and checksums. Empty and optional advanced variants
follow [the release runbook](releasing.md).

```text
dist/
  html/         Bilingual starter files
  empty/        Empty starter
  advanced/     Optional advanced profiles
  cli/          Compiled CLI tree
  packages/     CLI installation tarballs
  web/          Development web build
  site/         Website, tutorials and editable handbooks
  releases/     Website upload archives and checksums
```

The website uses current starter builds and generates tutorials from `site/docs/`.
Do not maintain compiled copies in source. CLI and generic Skill sources are
included; npm remains `private: true` pending a separate publication decision.

## Submission and history boundary

Run `npm run check:public` before preparing a commit. It checks tracked paths
and unignored new files, including force-added internal contracts, design files
or third-party reference files. Deleted tracked files are absent from the
working-tree candidate; record those removals in the future cleanup commit.

Ignore rules do not untrack files or sanitize old commits. Existing development
history includes private records and must not be pushed as public history.
Use a separately reviewed clean source snapshot or history-cleanup procedure.
Path checks do not replace content, asset provenance or history review. Older
review snapshots do not automatically satisfy this narrower public boundary.
