# Third-party notices

Yeli bundles the following direct runtime dependencies into its single-file
release. Their copyright and license terms remain with their respective authors.
CodeMirror is included only in the optional advanced profile.

| Component           |                       Version | License               |
| ------------------- | ----------------------------: | --------------------- |
| React / React DOM   |                        19.2.8 | MIT                   |
| CodeMirror packages | pinned in `package-lock.json` | MIT                   |
| DOMPurify           |                        3.4.14 | Apache-2.0 or MPL-2.0 |
| markdown-it         |                        15.0.1 | MIT                   |
| Heroicons React     |                         2.2.0 | MIT                   |
| YAML                |                         2.9.0 | ISC                   |

Build-only and test dependencies are listed with their exact versions and upstream license metadata in `package-lock.json`. A release must regenerate this notice when direct runtime dependencies change and must not remove upstream notices from source distributions.

The build-only encoder `@gfx/zopfli` 1.0.15 is Apache-2.0 licensed. The generated
artifact carries the local decoder, rather than the build-time encoder package.
The website embeds React-rendered Heroicons and renders documentation through
markdown-it at build time; these packages are not fetched by a visitor.

## Standalone CLI

The separately installed CLI uses DOMPurify and markdown-it as above, plus
`yaml` 2.9.0 (ISC) and `jsdom` 30.0.1 (MIT). It does not install React,
CodeMirror, Heroicons, Vite, TypeScript, or Playwright. Its runtime dependencies
are installed as npm packages with their upstream license files; transitive
dependency terms remain with their respective authors. Yeli's own code uses
the MIT License; the CLI tarball includes the root `LICENSE`. The package
remains private and is not published to npm.

## Project license

The root `LICENSE` contains Yeli's MIT License. Generated editor shells embed
its full text in an inert HTML comment; saved editable copies retain that
shell. Website distributions include `LICENSE` and display the full text in
the offline license dialog. Third-party terms above are separate from Yeli's
license and must be preserved when distributing those components.

The project license does not assign a license to documents or assets created
or imported by users.
