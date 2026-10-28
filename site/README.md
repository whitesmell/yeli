# Yeli homepage

This directory is the versioned source for the public Yeli homepage. The
homepage resources use relative links, so the same build can be deployed
to any HTTPS static host and domain. The copyable Agent instruction points
to the public Skill URL.

The homepage build uses the repository's product documentation as embedded
offline content. It requires the Yeli logo source in `src/brand/` and the
dependencies pinned by the root `package-lock.json`.

## Preview

From the repository root:

```sh
npm run build:single:all
npm run build:site
npm run check:site
npm run preview:site
```

Open <http://127.0.0.1:8874/?lang=zh-CN> or
<http://127.0.0.1:8874/?lang=en>.

`dist/site/` is generated and is not committed. It contains the self-contained
homepage, both sample documents, a safe home fallback for unknown paths,
`.nojekyll`, the project's MIT `LICENSE`, and a small release manifest.
It also contains the bilingual tutorial center at `docs/zh-CN/index.html`
and `docs/en/index.html`, with separate Yeli and Markdown learning paths.
See [tutorial authoring](docs/README.md) for the single-source content and
editable handbook workflow.

The hero presents a selectable, read-only Agent instruction as a subtitle,
with Edit online as the primary action and Copy instruction as the secondary
action. Supporting text explains local Markdown editing and includes the
Open example link. The field label and copy announcements are available to screen readers.
Selecting the field selects the whole instruction. The copy button confirms
success; if clipboard access fails,
the instruction is selected for manual copying. Language changes update the
instruction and clear copy feedback. The instruction uses the public Skill
URL so it can be shared with an Agent from a local preview as well.
`skill.md` is copied byte-for-byte from `skills/yeli/SKILL.md`; it describes
first-time tool preparation and document workflows.

To build a verified, host-neutral release archive:

```sh
npm run package:site
```

The command writes a versioned `.tar.gz` archive and SHA-256 checksum under
`dist/releases/`. The archive contains only the contents of `dist/site/`, so a
host cannot receive source files, private documents, or editor work in progress.

## Iteration

Edit these source files:

| Path                  | Purpose                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `app.js`              | English copy, locale switching, dialogs, navigation, and sample links |
| `index.template.html` | Chinese-first page structure and default metadata                     |
| `styles.css`          | Layout, typography, responsive behavior, and visual system            |
| `site-config.json`    | Canonical HTTPS repository and license destinations                   |
| `assets/`             | Original hero artwork and bilingual editor captures                   |
| `scripts/build.mjs`   | Embeds CSS, JavaScript, imagery, documentation, and generated logo    |
| `scripts/check.mjs`   | Checks generated page aliases, slogans, samples, and manifest         |

The build copies the current `dist/html/starter.*.yeli.html` files to
`dist/site/sample.*.yeli.html` and checks that their bytes match. Build both
starter languages first. Compiled samples are not source files and are not
committed. The logo is rendered directly from `src/brand/yeli-logo.json`;
building the site does not write generated SVGs into the source tree.
Rebuilding replaces `dist/site/` completely so removed pages and obsolete host
configuration cannot linger in the upload directory. Other `dist/` profiles
remain available.

## Release

For each release:

1. Run `npm run verify:site` and `npm run test:site`.
2. Run `npm run package:site` to create and checksum the release archive.
3. Review `dist/site/` locally in Chinese and English.
4. Upload the complete contents of `dist/site/` to the selected static host.
5. Configure the domain and HTTPS in that host.
6. Verify the production homepage, both language states, both sample downloads,
   and the unknown-path fallback on the deployed origin.

The `publish-site` workflow under `.github/workflows/pages.yml` is manually
triggered on `main`. It builds, checks and tests the site before deploying
`dist/site/` to GitHub Pages; it does not call the full CI workflow.
Before dispatch, require a successful `deterministic-ci` run for the exact
candidate commit and confirm that `main` still points to that commit.
After dispatch, verify that the Pages run uses the same commit.
Source pushes do not deploy the website. Dispatch it only after the editor distribution gates
in `docs/releasing.md` are satisfied: the website includes executable samples
and handbooks. The selected custom domain is `yeli.zetury.com`; configure it in
GitHub Pages settings, with Cloudflare managing DNS. Do not add `CNAME` to the
build output.

The workflow establishes reproducible deployment. It does not by itself
certify the editor release gates in `docs/releasing.md`.
