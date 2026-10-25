# yeli project status

Updated: 2026-10-25.

English · [简体中文](project-status.zh-CN.md)

The owner confirmed `yeli` as the open-source project name. The display name
remains 页里 / Yeli and the editable extension remains `.yeli.html`.
The owner approved a clean source snapshot for public contribution.
The [public scope](public-scope.md) records the approved
source boundary.

## Publication readiness

| Item                           | Current state                                                                 | Required next step                                       |
| ------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Project name                   | `yeli`                                                                        | Use it in repository/package and community entry points  |
| Canonical repository           | [whitesmell/yeli](https://github.com/whitesmell/yeli)                         | Maintain the separate clean public history               |
| Project license                | MIT; owner approved on 2026-10-24; full text in root `LICENSE`                | Retain project and third-party notices in distributions  |
| Community entry points         | README, documentation, contribution/security guides, issue forms, PR template | Verify their behavior on the published repository        |
| Languages                      | `zh-CN` / `en` UI, bilingual starter files and public entry documentation     | Keep dictionaries and public usage documentation in sync |
| Private security reporting     | GitHub private vulnerability reporting enabled and verified on 2026-10-25     | Use the channel linked in `SECURITY.md`                  |
| Homepage and tutorials         | Live at `https://yeli.zetury.com` on GitHub Pages; HTTPS enforced             | Keep site checks and deployed-file verification passing  |
| Public download/stable release | Not announced                                                                 | Satisfy release gates and verify exact public assets     |

There is no npm publication configuration; `private: true` stays in place.
Dependency licenses do not select the project's license.

Generated distributions share the ignored `dist/` root. The website consumes
the current bilingual starter builds, with no compiled editor copies in source.
Private records and frozen review snapshots remain local. The existing Git
history contains private logs; public-source preparation must use a reviewed
clean snapshot or an explicitly reviewed history-cleanup procedure.

The Agent-use docs, standalone CLI packaging and generic Skill are maintained
in this repository. Local tarballs are installable without the frontend source
checkout; platform plugins are deferred. This does not announce a public npm
package, certify a browser release or complete the real three-Agent benchmark.
See the [Agent quick start](agent-quickstart.md).

## Product and release work

The implementation supports a default single-file profile and a separately
composed advanced profile. Public behavior and trust boundaries are described
in [architecture](architecture.md) and [the format](format.md). Internal product
contracts, plans and design studies remain private.

Remaining release work includes:

- Improve the Zopfli + Base86 pipeline while preserving offline editing,
  source fidelity, rendering safety and Agent interoperability. The owner
  deferred the historical **100,000-byte** goal on 2026-10-23. Validation now
  reports the deferred target and verifies decoded carriers; the explicit
  `--enforce-size-target` option retains the old check. See
  [compression evidence](compression.md) for complete-byte/startup measurements.
- Revalidate the exact renamed Yeli artifacts. Earlier AIMD measurements remain
  dated evidence.
- Pin production signing keys and establish the canonical release channel.
- Complete the physical/assistive-technology, named transport/static-host,
  five-person first-use, and authorized real three-Agent evidence.
- Complete the demand study and scope review before making public V1/stable
  claims.

The [release runbook](releasing.md) owns the full checklist and manual evidence.
This page does not waive those gates or certify current test results.

## Deliberate boundaries

V1 has no built-in AI editing, account, cloud canonical storage, sync,
collaboration, or executable document plugins. The optional official advanced
profile is trusted release composition. Old `.aimd.html` files remain
unsupported and untouched; content transfer uses explicit Markdown export/import.
