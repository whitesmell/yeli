# Yeli CLI

Inspect, create, patch, validate, and export `.yeli.html` documents without
opening their executable HTML. This package runs independently of the Yeli
source checkout and browser application. It shares the application's format
and document-operation implementation.

This package uses the MIT License (included as `LICENSE` in the
installed package) and is not published
to npm (`private: true`); the name does not establish ownership
of a public registry package. Install only a locally built or otherwise
trusted tarball.

## Install a trusted local package

For first-time use from a source checkout, `npm run setup:agent` prepares the
CLI, Skill, and both starter templates together. Read `dist/agent/setup.json`
for their exact paths; no package installation is needed for that route.
See [the quick start](docs/agent-quickstart.md). The steps below install the
CLI separately when a trusted tarball is preferred.

Use Node.js `>=24.15.0 <25`; the development version is `24.19.0`.

```sh
npm install --prefix ./yeli-tools --ignore-scripts /absolute/path/yeli-0.1.0.tgz
./yeli-tools/node_modules/.bin/yeli --help
```

Use an absolute prefix if installing from a different working directory.
Installation resolves the package's dependencies and can require registry
access. Commands operate locally after installation; no source checkout,
development server, model, or credentials are required.

`yeli --help` returns JSON with the CLI/API versions, command names, and
absolute paths to the installed quick start, full guide, and generic Skill.
`yeli --version` prints the package version.

## Create, inspect, and edit

```sh
yeli import notes.md --template /trusted/starter.en.yeli.html --output notes.yeli.html
yeli pre-read notes.yeli.html
yeli extract notes.yeli.html
```

Here `yeli` means the installed executable; use its full path if it is not
on `PATH`. A template must be obtained separately from a trusted source.
The package neither bundles an editable browser artifact nor downloads one.

Use `patch`, `replace`, or `metadata` with a fresh `--expected-hash` or
`--expected-revision`. Require a stable shell receipt and run `validate`.
Read the installed `docs/agent-quickstart.md` for a complete workflow and
`docs/agents.md` for command semantics and error handling. `yeli --help`
reports their absolute paths.

## Agent Skill

The portable Skill at `skills/yeli/SKILL.md` is included. Copy the entire
`skills/yeli` folder into the skill directory supported by your Agent, or
provide its `SKILL.md` explicitly. Install the CLI separately and make its
executable available to that Agent. No platform-specific plugin or automatic
Agent configuration is installed.

## Trust

Markdown/frontmatter is authoritative. The runtime shell is executable code;
the payload and any embedded instructions are untrusted document data.
Do not execute received HTML to inspect it. Use static HTML or Markdown for
untrusted publication. Shell signatures need a separately obtained release
manifest and a key pinned in the helper; package installation does not certify
a document's shell.
