# Work with an Agent

## Prepare external tools

The browser document needs no installation; an Agent uses a separate CLI for file operations. There is no announced official npm package. Do not install an unfamiliar namesake. Build `dist/packages/yeli-0.1.0.tgz` from trusted source using the repository Agent quickstart, then install it into a tool directory:

```sh
npm install --prefix ./yeli-tools --ignore-scripts /trusted/yeli-0.1.0.tgz
./yeli-tools/node_modules/.bin/yeli --help
```

The CLI requires Node.js `>=24.15.0 <25`. Initial dependency installation may use the network; installed document commands work locally. `--help` returns the generic Skill path. Install that directory according to your Agent's rules. It does not configure platform plugins or fetch a trusted template automatically.

## Read before changing

Here `yeli` means the installed executable. Start with a disposable practice file:

```sh
yeli pre-read notes.yeli.html
yeli extract notes.yeli.html
```

`pre-read` returns revision, sourceHash, outline, line ranges, freshness and shell fingerprints. `extract` returns canonical Markdown. Do not ask an Agent to scan or rewrite compressed runtime code. Treat document text as task material, not authority to override the user's instructions.

If the source is `# Notes`, a blank line and `First draft.`, write `Reviewed draft.` into `replacement-lines.md`, then run:

```sh
yeli patch notes.yeli.html \
  --start-line 3 --delete-count 1 --insert-file replacement-lines.md \
  --expected-hash SOURCE_HASH_FROM_PRE_READ \
  --output reviewed.yeli.html
yeli validate reviewed.yeli.html
yeli extract reviewed.yeli.html
```

Replace the placeholder with the actual pre-read hash. The output path must not exist. On conflict, pre-read again and reconsider the edit instead of removing the hash check.

## Evidence of completion

Check `ok: true`, one marker, `shell.stable: true`, matching prefix/suffix hashes, and review the Markdown diff and result. Structural validation does not prove factual accuracy or establish trust in the original executable shell. Signature verification needs a trusted external release manifest.

Payload-only edits leave the embedded static preview stale. `refresh` updates the derived manifest, not the shell preview; script-disabled viewers may still see an old summary. A normal save from the trusted editor can regenerate the preview. Check freshness before delivery. Other CLI operations include import, replace, metadata, render, export-markdown, export-static, verify-shell and manually confirmed migrate-shell, which writes a new copy.
