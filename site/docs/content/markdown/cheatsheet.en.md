# Markdown cheat sheet

## Everyday syntax

| Goal                   | Source example                     | Note                                            |
| ---------------------- | ---------------------------------- | ----------------------------------------------- |
| Heading levels one/two | `# Title` / `## Section`           | Space after the marker                          |
| Paragraph              | Blank line between paragraphs      | One newline usually stays in the same paragraph |
| Hard line break        | Two trailing spaces or a backslash | Prefer paragraphs unless a break is needed      |
| Bold/italic            | `**important**` / `*emphasis*`     | Pair the markers                                |
| Strikethrough          | `~~old text~~`                     | Extension supported by Yeli                     |
| Quote                  | `> Quoted text`                    | May be nested                                   |
| Bullet/ordered list    | `- Item` / `1. Step`               | Indent nested items                             |
| Task                   | `- [ ] Check` / `- [x] Done`       | Extension; toggle in Edit                       |
| Inline code            | `` `value` ``                      | Protects enclosed markers                       |
| Thematic break         | `***`                              | Put on its own line                             |
| Link                   | `[name](https://example.com)`      | Separate label and destination                  |
| Footnote               | `text[^1]`, `[^1]: note`           | Editing, reading and export supported           |
| Image                  | `![description](image.png)`        | Embed for offline Yeli use                      |
| Escape                 | `\*literal stars\*`                | Display marker characters                       |

## Multiline structures

````markdown
```js
const ready = true;
```

| Option | Status |
| :----- | :----: |
| A      | Ready  |
````

A language after a code fence is a label, not a guarantee of highlighting. Tables need a delimiter row below the header.

## Check before using extensions

Heading IDs `{#id}`, definition lists, `==highlight==`, sub/superscripts, math and Mermaid depend on the implementation. They are not enabled rendering extensions in current Yeli. Bare URLs are not automatically linked either; use explicit link syntax. See the [extension table](extensions.html) for footnote references and continuation lines.

For a guided path, start with [headings and paragraphs](headings-paragraphs.html). Bookmark this page for reference.
