# HTML, escaping and safety

## Display marker characters

Prefix meaningful punctuation with a backslash, for example `\# Not a heading`, `\*Not italic\*` or `\[Not a link\]`. Put larger syntax examples in code fences instead of manually escaping every character. A backslash before a letter does not necessarily escape it.

HTML entities such as `&amp;` and `&lt;` represent `&` and `<`. Inside code you usually want the literal entity rather than decoding. Inspect the visible result after editing, not just the source characters.

## Markdown and raw HTML

Original Markdown and CommonMark describe embedded HTML, but applications can disable or filter it. A syntax specification is not execution permission. Current Yeli disables authored raw HTML rendering and cleans rendered output at a final boundary.

```html
<script>
  alert("example");
</script>
```

This is displayed code and must not execute. HTML, SVG, iframes, event attributes and `javascript:` links are not portable formatting solutions. Yeli does not allow document-provided executable plugins.

## Trust in the file itself

Yeli protects the Markdown-rendering boundary, but `.yeli.html` carries runtime code. Open editable files only from trusted sources. A safety message inside a file cannot prove that file safe. Use [read-only exports](../yeli/export.html) for public reading.

Try displaying literal `**important**` and an HTML tag in code. Verify that preview neither executes it nor formats it incorrectly.
