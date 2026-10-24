# Use Yeli with an Agent

English · [简体中文](agent-quickstart.zh-CN.md)

Use Yeli to create, inspect, modify, validate, and export `.yeli.html`
documents through local files. This is the document-use entry point.
The repository's `AGENTS.md` instead governs development of Yeli itself.
There is no built-in model, account, or Agent service.

## Install the CLI

The CLI needs Node.js `>=24.15.0 <25`; development uses `24.19.0`.
No public npm package or official download is announced. Do not assume a
similarly named registry package is this project.

From a trusted source checkout, build the installable tarball:

```sh
nvm use
npm ci
npm run pack:cli
```

This produces `dist/packages/yeli-0.1.0.tgz` for the current version. It contains
compiled JavaScript, a small CLI launcher, usage docs, and the generic Skill.
It does not contain the browser application, a document template, or private
development material.

Install that trusted tarball into a tool directory:

```sh
npm install --prefix ./yeli-tools --ignore-scripts /absolute/path/yeli-0.1.0.tgz
./yeli-tools/node_modules/.bin/yeli --help
./yeli-tools/node_modules/.bin/yeli --version
```

The installed CLI runs outside the source checkout. Initial dependency
installation may need registry access; installed commands need no network,
development server, or browser. Configure your Agent to use the absolute
executable path, or add the tool directory's `node_modules/.bin` to its `PATH`.
On Windows use the npm-generated `yeli.cmd` launcher.

The examples below use `yeli` for that installed executable. `--help` returns
JSON with the supported API version, command names, and installed guide,
quick-start, and Skill paths. Ordinary JSON commands report `apiVersion: 1`;
`extract` returns raw Markdown and `--version` returns the package version.

For source-checkout use, substitute `npm run --silent yeli --` for `yeli`
in document commands. The standalone launcher's `--help` and `--version`
belong to the built package.

## Create from Markdown

Obtain a trusted `.yeli.html` template separately. For a local experiment,
the source checkout can build one with `npm run build:single`, producing
`dist/html/starter.en.yeli.html` or `dist/html/starter.zh-CN.yeli.html`. A successful
development build does not certify a
public release or satisfy the final artifact size gate.

Write `notes.md`, then create a new portable document:

```sh
yeli import notes.md --template /trusted/starter.en.yeli.html --output notes.yeli.html
yeli validate notes.yeli.html
```

`import` preserves the inputs, normalizes Markdown line endings to LF, and
requires a new output path. The template is executable release code; parsing
it proves structure, not trust. The CLI never downloads a template or opens
received HTML to execute it.

## Read and make a narrow edit

```sh
yeli pre-read notes.yeli.html
yeli extract notes.yeli.html
```

`pre-read` returns a bounded snapshot with revision, `sourceHash`, a recomputed
manifest and line ranges, freshness, and shell hashes. It omits the Markdown
body and payload. `extract` returns the canonical Markdown. Use `get` only
when the full payload is needed.

For a concrete example, if `notes.md` was:

```markdown
# Notes

First draft.
```

Write `replacement-lines.md` containing `Reviewed draft.` and replace line 3.
Replace `SOURCE_HASH_FROM_PRE_READ` with the exact snapshot value:

```sh
yeli patch notes.yeli.html \
  --start-line 3 --delete-count 1 --insert-file replacement-lines.md \
  --expected-hash SOURCE_HASH_FROM_PRE_READ \
  --updated-by "agent/session" --change-summary "Review the draft"
yeli validate notes.yeli.html
yeli extract notes.yeli.html
```

Require `ok: true`, `shell.markerCount: 1`, `shell.stable: true`, matching before
and after prefix hashes, and matching before and after suffix hashes.
Check the changed ranges and the resulting Markdown. Attribution is optional,
self-reported, and supplied as the two options together.

To keep the input intact, add `--output reviewed.yeli.html` to the mutation.
That output path must not already exist. On a revision/hash conflict, pre-read
the current file and re-plan; do not discard the expectation. On `OUTPUT_EXISTS`,
choose a new output path instead of deleting the old file.

Payload-only edits normally leave the embedded static preview stale.
`refresh` rebuilds the manifest but does not refresh the shell preview.
The full [Agent guide](agents.md) documents freshness and all operations,
receipts, error codes, and signature/manual-migration boundaries.

## Give an Agent the Skill

The source Skill is `skills/yeli/SKILL.md`. The installed CLI's `--help`
returns its absolute path as `paths.skill`. Copy the containing `yeli` folder
to a skill directory supported by your Agent, or provide `SKILL.md` explicitly.
The CLI must be available separately in the Agent's execution environment.
No platform-specific plugin or automatic configuration is installed.

Example task:

> Use the Yeli Skill to update the installation section in notes.yeli.html.
> Preserve the other Markdown and executable shell, validate the result, and
> report the output path and any freshness warnings.

Whether a particular Agent auto-discovers this Skill needs platform-specific
verification; providing the file explicitly is the fallback.

## Export and trust

```sh
yeli export-markdown notes.yeli.html --output exported-notes.md
yeli export-static notes.yeli.html --output notes.html
```

Use a new path if an output already exists. Inspect exports before handing
them off. Editable `.yeli.html` remains active HTML for trusted senders/origins;
use static HTML, Markdown, or browser-produced PDF for untrusted publication.
The CLI does not supply a PDF/browser automation service.

Legacy `.aimd.html` stays unsupported and unchanged. File permissions,
destructive overwrite, remote media approval, recovery deletion, and manual
shell migration retain their human approval boundaries.
