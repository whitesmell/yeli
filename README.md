# 页里 / Yeli

**A Markdown editor. For you. And AI.**

English · [简体中文](README.zh-CN.md)

Let your Agent deliver a document you can keep editing. Yeli puts the Markdown,
editor, renderer, and embedded images in one `.yeli.html` file.
Open it in a browser to read, edit, and present offline.

**[Start with an Agent](#start-with-an-agent)** ·
[Try the editor](https://yeli.zetury.com/sample.en.yeli.html) ·
[Website](https://yeli.zetury.com/?lang=en) ·
[User guide](https://yeli.zetury.com/docs/en/index.html) ·
[Agent guide](docs/agent-quickstart.md) ·
[Contribute](CONTRIBUTING.md)

## Start with an Agent

Copy this instruction into your Agent's conversation:

```text
Read https://yeli.zetury.com/skill.md and follow the instructions to create and edit Yeli documents.
```

Then give it a task: **"Turn these meeting notes into a new `meeting.yeli.html`
and return the validated file."** Open the result in your browser and keep writing.

The [Yeli Skill](skills/yeli/SKILL.md) walks the Agent through first-time setup,
creating or editing a document, and validation. It needs an environment with
web access, command execution, and local files. In a trusted source checkout,
`npm run setup:agent` prepares the CLI, Skill, and both language templates in
one step and reports their exact paths. No global installation or Agent
configuration change is needed.

See the [Agent quick start](docs/agent-quickstart.md) for prerequisites and
commands, or [build the tools yourself](#build-from-source).

![Yeli editor example with an outline, document properties, and a Markdown editing canvas](site/assets/editor.en.png)

## Why Yeli?

- **Write on the page.** Edit Markdown in a WYSIWYG block canvas, with headings,
  lists, tasks, tables, links, and embedded images. Find text, organize sections,
  and manage document properties without switching to a source editor.
- **Carry the editor with the document.** Read, edit, and present offline in a
  supported browser, without installing an app, creating an account, or
  starting a server.
- **Keep your source.** Markdown, including YAML frontmatter, remains the
  authored source. Editing preserves untouched source ranges; you can export
  Markdown, script-free read-only HTML, or print/PDF.
- **Let an external Agent continue.** The file format, CLI, and Skill help
  filesystem Agents locate context, make narrow changes, and check that the
  document's executable code stays unchanged.

The interface and starter documents support Simplified Chinese and English.
Changing the interface language leaves your document language and text intact.

## Get started

1. Open the **[English example](https://yeli.zetury.com/sample.en.yeli.html)**
   or **[中文示例](https://yeli.zetury.com/sample.zh-CN.yeli.html)** in your browser.
2. Choose **Edit**, change a paragraph, and give the document a title.
3. Open **More → Save a copy**. Yeli asks for a destination or downloads a new
   `.yeli.html` file, depending on your browser.
4. Open the saved file from disk and confirm your edits are there. You can
   continue working offline. Keep an untouched starter for your next document.

No installation or account is needed to use a Yeli file. To build your own
starter, see [Build from source](#build-from-source).

Direct overwrite is available only when the browser supports it and you grant
permission. Recovery and history are local to that browser when storage is
available; they do not replace saving a file.

Editable HTML contains executable code. Open `.yeli.html` only from trusted
sources. For sharing a reading copy, export read-only HTML, PDF, or Markdown.

The [first-edit tutorial](https://yeli.zetury.com/docs/en/yeli/quickstart.html)
walks through editing and saving. The
[documentation center](https://yeli.zetury.com/docs/en/index.html) includes
Yeli and Markdown tutorials and editable offline handbooks.

## Work with an Agent

Yeli works with external Agents that can read and write local files. The CLI
lets them inspect a document, find its Markdown, and edit selected lines after
checking the revision or source hash. Edit receipts include before-and-after
shell hashes so the Agent can verify that executable code stayed unchanged.
Yeli has no built-in chat or model API.

After preparing the tools, inspect a saved file from your source checkout:

```sh
node dist/cli/bin/yeli.js pre-read notes.yeli.html
node dist/cli/bin/yeli.js extract notes.yeli.html
node dist/cli/bin/yeli.js validate notes.yeli.html
```

Use the absolute `paths.node` and `paths.cli` from `dist/agent/setup.json`
when working in another directory. The [Agent reference](docs/agents.md)
defines operations and validation receipts. For a separately installed CLI,
build a local tarball with `npm run pack:cli` and follow the
[installation guide](docs/agent-quickstart.md#install-the-cli-separately-optional).
No public npm package is announced.

## Build from source

Use the Node.js version pinned in [`.nvmrc`](.nvmrc). With `nvm`:

```sh
git clone https://github.com/whitesmell/yeli.git
cd yeli
nvm use
npm ci
npm run setup:agent
```

If you use another Node version manager, select the same pinned version.
Dependency installation needs network access; the built document works offline.

The command prepares the CLI and Skill, builds and validates both starter
files, and writes `dist/agent/setup.json` with their absolute paths.
Open either starter in a supported browser:

- English: `dist/html/starter.en.yeli.html`
- 简体中文: `dist/html/starter.zh-CN.yeli.html`

Run the development app with `npm run dev`. To validate both starter files:

```sh
npm run validate:single
npm run validate:single -- --locale en
```

The website provides examples and handbooks. A stable editor release has not
been announced, and a successful local build does not certify a public release.
See [project status](docs/project-status.md) for remaining release work.

## Documentation

| Goal                        | Guide                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Learn Yeli and Markdown     | [User tutorials and offline handbooks](https://yeli.zetury.com/docs/en/index.html)                                                 |
| Use an external Agent       | [CLI and Skill setup](docs/agent-quickstart.md) · [Operation reference](docs/agents.md)                                            |
| Check browser behavior      | [Browser support, saving, and recovery](docs/browser-support.md)                                                                   |
| Develop or integrate Yeli   | [Development](docs/development.md) · [File format](docs/format.md) · [Architecture](docs/architecture.md)                          |
| Review release requirements | [Project status](docs/project-status.md) · [Release runbook](docs/releasing.md) · [Compression and file size](docs/compression.md) |

For all developer references, see the [documentation index](docs/README.md).

<details>
<summary>Repository layout and build details</summary>

| Path                            | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `src/`                          | Browser runtime, editor, rendering, storage, translations, and brand |
| `site/`                         | Homepage, bilingual tutorial sources, and website checks             |
| `scripts/`                      | File helper, build tools, and release validation                     |
| `packages/cli/`, `skills/yeli/` | Standalone CLI and document-use Skill                                |
| `tests/`                        | Unit, integration, security, browser, and synthetic fixtures         |
| `docs/`                         | Development, format, architecture, and release references            |
| `.github/`                      | CI, Pages workflow, issue forms, and pull request template           |

The default editor includes block-local raw-text fallback. Whole-document
Source/Split belongs to the separately composed advanced profile. The
[development guide](docs/development.md) covers checks, empty and advanced
builds, and browser setup; the [release runbook](docs/releasing.md) covers
signing and release evidence. The historical 100 KB target is deferred;
[compression](docs/compression.md) records complete-file sizes.

The website and bilingual tutorials are hosted on GitHub Pages, with DNS
managed in Cloudflare. The site builds into ignored `dist/site/`.
See [website development](site/README.md) for local preview and
[tutorial authoring](site/docs/README.md) for course and handbook sources.
Internal plans, design studies, and private working records stay outside the
[public source scope](docs/public-scope.md).

Browser save, storage, and mobile behavior vary; see
[browser support](docs/browser-support.md). Yeli accepts only `.yeli.html`.
Old `.aimd.html` files remain untouched and are not opened or automatically
migrated. To move old content, export standard Markdown with the old helper
and import it into a separate Yeli document.

</details>

## Contributing

Bug reports, focused feature proposals, documentation fixes, and translations
are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and project
boundaries, then open an [issue](https://github.com/whitesmell/yeli/issues)
or pull request with a reproducible example or a clear description of the change.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

Yeli uses the [MIT License](LICENSE). Third-party components retain their own
licenses; see [third-party notices](docs/third-party-notices.md). The project
license covers the software and associated documentation, not documents or
assets you create or import with Yeli.
