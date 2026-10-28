# Extensions and Yeli support

## Check the implementation

Markdown dialects and plugins vary. This table reflects the current default Yeli renderer: tables, strikethrough, tasks and footnotes are available; raw `html` and bare-text `linkify` are disabled. The enhanced source build does not automatically enable the unsupported extensions below.

| Syntax                  | Common form                       | Current Yeli                                     |
| ----------------------- | --------------------------------- | ------------------------------------------------ |
| Tables and alignment    | Pipes, hyphens and colons         | Supported                                        |
| Fenced code/language    | Triple backticks followed by `js` | Displays code; highlighting not guaranteed       |
| Strikethrough           | `~~text~~`                        | Supported                                        |
| Tasks                   | `- [ ] task`                      | Supported; toggle in Edit                        |
| Angle-bracket autolinks | `<https://example.com>`           | Supported for safe destinations                  |
| Bare-URL linking        | `https://example.com`             | Not automatically linked                         |
| Footnotes               | `text[^1]`, `[^1]: note`          | Editing, reading and HTML/PDF export supported   |
| Explicit heading IDs    | `## Title {#id}`                  | Attribute syntax not enabled                     |
| Definition lists        | Term followed by `: definition`   | Not enabled                                      |
| Emoji shortcodes        | `:smile:`                         | Not converted; literal Unicode emoji can display |
| Highlight               | `==text==`                        | Not enabled                                      |
| Sub/superscript         | `H~2~O` / `x^2^`                  | Not enabled                                      |
| Math                    | `$x^2$` / `$$...$$`               | No enabled KaTeX or equivalent engine            |
| Diagrams                | `mermaid` fence                   | Shown as code, not a diagram                     |
| Raw HTML                | `<div>...</div>`                  | Not executed or rendered as authored HTML        |

## Footnotes

```markdown
A conclusion uses evidence[^evidence].

[^evidence]:
    Original record.
    Indent continuation lines four spaces; use **emphasis** and [sources](https://example.com).
```

In Read, activate a superscript number to reach its note and a backlink to return.
Repeated references share a number, assigned by first reference order.
In Edit, change the corresponding note body while retaining its original label.
Read and HTML/PDF exports share the same footnote rendering.

Missing definitions leave their references literal. Unused and duplicate definitions
also stay visible for inspection; check labels and references before delivery.
Footnote dialects can differ across other tools.

## Recognize unsupported forms

```markdown
Term
: Short definition

## Results {#result}
```

Tools with the corresponding plugins may render definition lists and custom anchors. Current Yeli may preserve these as ordinary text or local source blocks. Preserved source does not mean the intended semantics are rendered.

## Deliver across tools

Use normal links when the receiving tool lacks footnotes, ordinary lists for unsupported definition lists, and explanations for unsupported math or diagrams. Generate necessary diagrams as PNG/WebP in an external tool, embed them and retain the diagram source. Unicode emoji can look different across fonts.

When rendering differs, identify the dialect and engine first. Repeatedly saving is not a way to repair unsupported syntax, and preserving every rendering effect across tools cannot be assumed.
