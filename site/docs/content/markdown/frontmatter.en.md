# YAML frontmatter and maintainable documents

## Before the body

Frontmatter is a convention used by many documentation tools, not part of basic CommonMark. Start the file with a standalone `---`, write YAML and close with another `---` before the body. Tools may recognize, ignore or display it.

```yaml
---
title: Project guide
description: Local documentation for new members
lang: en
tags: [getting-started, docs]
authors: [Lin]
review_date: "2026-10-24"
---
```

Title, language and tags belong to the content. Changing Yeli's interface language does not rewrite `lang`, and dates do not update automatically.

## Common YAML mistakes

Put a space after colons and indent with spaces, not tabs. Quote text containing `: `, `#` or values that could be read as booleans or numbers. Do not repeat field names. A string list is different from a list of objects; confirm downstream support before using nested objects.

Yeli property forms support root-level text, finite numbers, booleans, date strings and string lists. Complex values remain read-only and ambiguous YAML disables forms. Unknown safe fields are not discarded just because they lack a dedicated interface. See [document properties](../yeli/properties.html).

## A document contract for people and Agents

Write goals, scope, sources, acceptance criteria and next steps in the body. Metadata carries short indexing information; do not hide every requirement in fields. Stable keys and clear sections help tools locate content, but YAML does not secure sensitive information. Keep credentials out of public handbooks.
