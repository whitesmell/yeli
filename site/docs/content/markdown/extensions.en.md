# Extensions and Yeli support

## Check the implementation

Markdown dialects and plugins vary. This table reflects the current default Yeli renderer: tables, strikethrough and custom task rendering are available; footnote and related plugins are absent; raw `html` and bare-text `linkify` are disabled. The enhanced source build does not enable these extensions automatically.

| Syntax                  | Common form                       | Current Yeli                                     |
| ----------------------- | --------------------------------- | ------------------------------------------------ |
| Tables and alignment    | Pipes, hyphens and colons         | Supported                                        |
| Fenced code/language    | Triple backticks followed by `js` | Displays code; highlighting not guaranteed       |
| Strikethrough           | `~~text~~`                        | Supported                                        |
| Tasks                   | `- [ ] task`                      | Supported; toggle in Edit                        |
| Angle-bracket autolinks | `<https://example.com>`           | Supported for safe destinations                  |
| Bare-URL linking        | `https://example.com`             | Not automatically linked                         |
| Footnotes               | `text[^1]`, `[^1]: note`          | Footnote rendering not enabled                   |
| Explicit heading IDs    | `## Title {#id}`                  | Attribute syntax not enabled                     |
| Definition lists        | Term followed by `: definition`   | Not enabled                                      |
| Emoji shortcodes        | `:smile:`                         | Not converted; literal Unicode emoji can display |
| Highlight               | `==text==`                        | Not enabled                                      |
| Sub/superscript         | `H~2~O` / `x^2^`                  | Not enabled                                      |
| Math                    | `$x^2$` / `$$...$$`               | No enabled KaTeX or equivalent engine            |
| Diagrams                | `mermaid` fence                   | Shown as code, not a diagram                     |
| Raw HTML                | `<div>...</div>`                  | Not executed or rendered as authored HTML        |

## Recognize unsupported forms

```markdown
A conclusion uses evidence[^evidence].

[^evidence]: Original record.

Term
: Short definition

## Results {#result}
```

Tools with the corresponding plugins may render footnotes, definition lists and custom anchors. Current Yeli may preserve these as ordinary text or local source blocks. Preserved source does not mean the intended semantics are rendered.

## Deliver across tools

Prefer normal links to footnote jumps, ordinary lists to definition lists, and explanations to unsupported math or diagrams. Generate necessary diagrams as PNG/WebP in an external tool, embed them and retain the diagram source. Unicode emoji can look different across fonts.

When rendering differs, identify the dialect and engine first. Repeatedly saving is not a way to repair unsupported syntax, and preserving every rendering effect across tools cannot be assumed.
