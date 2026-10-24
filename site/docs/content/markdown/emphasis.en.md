# Emphasis, strikethrough and nesting

## Basic emphasis

```markdown
_Needs attention_
**Must finish**
_**Bold and italic together**_
~~Superseded conclusion~~
```

One asterisk marks italic emphasis, two mark bold and three can combine them. Double tildes create strikethrough, an extension currently supported by Yeli. Underscores can also mark emphasis, but rules around words and nesting can be confusing; asterisks are a useful consistent choice.

## Nesting and whitespace

Keep markers next to the text: `**important**` is more reliable than `** important **`. You can nest as `**The *unconfirmed* part of the budget**`, but excessive nesting makes source harder to read. Punctuation and complex boundaries can affect delimiter rules; inspect the actual result.

To display markers literally, write `\*\*literal symbols\*\*` or use inline code. A `**` inside code does not become bold.

## Practice in Yeli

Write a paragraph, select one word and apply bold with the floating toolbar. Strike through another word. Export Markdown and verify that markers were added only around those ranges. Undo and check that other text remains unchanged. See [text editing](../yeli/writing.html) for shortcuts.
