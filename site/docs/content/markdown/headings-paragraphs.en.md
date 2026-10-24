# Headings, paragraphs, breaks and rules

## Headings express hierarchy

Start a line with one to six `#` characters, then a space and a title. Usually one level-one heading identifies an article, level two introduces sections and level three introduces subsections. Do not skip logical levels just to get a smaller font.

```markdown
# Project handbook

## Installation

### Requirements
```

Setext headings use `===` on the next line for level one or `---` for level two. These can be confused with thematic breaks; hash headings are clearer for tutorials and portable documents. Yeli derives its outline from headings, so avoid maintaining a separate manual outline.

## Paragraphs and line breaks

A blank line starts a new paragraph. A single newline inside a paragraph is a soft break, usually displayed as a space; do not rely on it for a visible break. For poetry or addresses, add two trailing spaces or a backslash before the newline. Trailing spaces are hard to see, so inspect the rendering.

```markdown
This is the first paragraph.
This line continues it.

This is the second paragraph.

Address line one\
Address line two
```

Avoid indenting ordinary paragraphs with four spaces, which can create code blocks. A full-width hash or `#Heading` without a space is not reliable heading syntax.

## Thematic breaks

Use at least three `*`, `-` or `_` characters on their own line. Blank lines help avoid ambiguity; `***` is a useful choice. A `---` immediately below text can make a level-two heading. Paired `---` at the start of a file may be [frontmatter](frontmatter.html).

Try writing two paragraphs and two level-two headings, then navigate them through Yeli's outline.
