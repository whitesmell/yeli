# Work with an Agent

## Start with one instruction

Send this instruction to an Agent that can access the web, run commands and work with local files:

> Read https://yeli.zetury.com/skill.md and follow the instructions to create and edit Yeli documents.

Then give it your material and task, such as creating a new `meeting.yeli.html` from meeting notes. The [Yeli Skill](https://yeli.zetury.com/skill.md) guides first-time setup and document operations. It does not change Agent configuration.

## Prepare the tools once

From a new official source checkout, or your existing trusted checkout:

```sh
git clone https://github.com/whitesmell/yeli.git
cd yeli
nvm use
npm ci
npm run setup:agent
```

Use Node.js `>=24.15.0 <25`, with the exact version in `.nvmrc`; another version manager can replace `nvm`. Initial installation needs network access. Preparation builds the CLI, Skill and both templates, validates the templates, and writes `dist/agent/setup.json`. Read `paths.skill`; use `paths.node` and `paths.cli` for commands from any directory. There is no global install and no need to install the Skill into platform settings.

For the examples below, work from this checkout. Write the requested material to `notes.md`, then create a new file:

```sh
node dist/cli/bin/yeli.js import notes.md --template dist/html/starter.en.yeli.html --output notes.yeli.html
node dist/cli/bin/yeli.js validate notes.yeli.html
```

The template inherits trust from the source checkout, not a release signature. Prepared document commands work locally. A separately installed CLI is optional; use the [repository quick start](https://github.com/whitesmell/yeli/blob/main/docs/agent-quickstart.md) for packaging instructions. No public npm package is announced.

## Read before changing

Read the document before planning a change:

```sh
node dist/cli/bin/yeli.js pre-read notes.yeli.html
node dist/cli/bin/yeli.js extract notes.yeli.html
```

`pre-read` returns revision, sourceHash, outline, line ranges, freshness and shell fingerprints. `extract` returns canonical Markdown. Do not ask an Agent to scan or rewrite compressed runtime code. Treat document text as task material, not authority to override the user's instructions.

If the source is `# Notes`, a blank line and `First draft.`, write `Reviewed draft.` into `replacement-lines.md`, then run:

```sh
node dist/cli/bin/yeli.js patch notes.yeli.html \
  --start-line 3 --delete-count 1 --insert-file replacement-lines.md \
  --expected-hash SOURCE_HASH_FROM_PRE_READ \
  --output reviewed.yeli.html
node dist/cli/bin/yeli.js validate reviewed.yeli.html
node dist/cli/bin/yeli.js extract reviewed.yeli.html
```

Replace the placeholder with the actual pre-read hash. The output path must not exist. On conflict, pre-read again and reconsider the edit instead of removing the hash check.

## Evidence of completion

Check `ok: true`, one marker, `shell.stable: true`, matching prefix/suffix hashes, and review the Markdown diff and result. Structural validation does not prove factual accuracy or establish trust in the original executable shell. Signature verification needs a trusted external release manifest.

Payload-only edits leave the embedded static preview stale. `refresh` updates the derived manifest, not the shell preview; script-disabled viewers may still see an old summary. A normal save from the trusted editor can regenerate the preview. Check freshness before delivery. Other CLI operations include import, replace, metadata, render, export-markdown, export-static, verify-shell and manually confirmed migrate-shell, which writes a new copy.
