# Inline code and code blocks

## Inline code

Use paired backticks for a command, filename or syntax, such as `` `npm run build` ``. If the content contains a backtick, use a longer delimiter, for example two backticks around one. Asterisks and underscores inside code remain literal.

## Fenced code

Use at least three backticks or tildes. Close with the same character and at least the opening length. A language label helps readers identify the code. It neither executes the code nor guarantees highlighting.

````markdown
```python
print("hello")
```
````

To demonstrate triple backticks in a tutorial, wrap the example in a four-backtick fence. Leave a blank line before continuing the body. An unclosed fence can consume the rest of a document.

## Indented code and current support

Four leading spaces can also create a code block; lists have additional indentation requirements. When copying commands, inspect smart quotes, prompt characters and placeholder parameters. Understand a command before running it.

Yeli displays fenced code and language information but does not promise highlighting for every language. `mermaid` and `math` labels do not enable diagram or math engines. See [extensions](extensions.html).

Try putting `# This is not a heading` inside code and verify that it does not enter the outline. Use local Markdown editing to change only its code content, save and reopen.
