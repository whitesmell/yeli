# yeli documentation

Yeli is a local-first Markdown workspace carried by one `.yeli.html` file.
Start with the [project README](../README.md) and
[current status](project-status.md).
The [public scope](public-scope.md) lists the candidate source tree and exclusions.

English · [简体中文](README.zh-CN.md)

The website's author-facing Yeli and Markdown tutorials are maintained in
[the tutorial source directory](../site/docs/README.md). Building the site
creates bilingual reading pages and editable offline handbooks from those
Markdown sources. The references below cover development and integration.

## Use and develop

| Goal                                              | Start here                                    |
| ------------------------------------------------- | --------------------------------------------- |
| Run from source, build, or test                   | [Development](development.md)                 |
| Understand browser capabilities and save fallback | [Browser support](browser-support.md)         |
| Install the CLI and use an external Agent         | [Agent quick start](agent-quickstart.md)      |
| Look up Agent operation semantics                 | [Agent guide](agents.md)                      |
| Inspect the portable format                       | [File format](format.md)                      |
| Understand runtime boundaries                     | [Architecture](architecture.md)               |
| Review artifact size and compression evidence     | [Compression](compression.md)                 |
| Contribute a fix or proposal                      | [Contributing](../CONTRIBUTING.md)            |
| Report a vulnerability                            | [Security policy](../SECURITY.md)             |
| Prepare a release                                 | [Release runbook](releasing.md)               |
| Review dependency terms                           | [Third-party notices](third-party-notices.md) |

## Development references and brand

Before changing format, editing or persistence, read [the format](format.md),
[architecture](architecture.md), [development guide](development.md) and relevant
tests. The [brand source guide](../src/brand/README.md) describes the owned logo
shared by the runtime and website. Internal product contracts, implementation
plans, design studies and provenance evidence are not public build or
contribution dependencies.

The application, tutorials and public entry documents support English and
Simplified Chinese. Legacy `.aimd.html` inputs remain unsupported; synthetic
rejection tests preserve their original bytes. Public tests and fixtures under
`tests/` do not use real user documents.

## Local workspace material

`dist/`, `node_modules/`, coverage, browser reports, and `output/` are generated
local artifacts, not source entry points. Private working issues live in
`.local-archive/issues/`; the former AIMD document is preserved under its
`legacy/` subdirectory. Neither is the public issue tracker. Do not recreate
root-level `issues*.html` copies. `reference/` is ignored, read-only third-party
research.

Internal commercialization notes (`.local-archive/reports/`), UI captures
(`.local-archive/ideation/`),
generation prompts, iterative reviews, current-screen galleries, research
notes, release audits, and workspace prototypes are excluded by default. They
may contain third-party screenshots, commercial strategy, local paths, or
unreviewed material. Do not publish them without a provenance/privacy review.
The owner keeps private working issues, `design-qa.md`, and the development
session log in `.local-archive/` outside version control.
