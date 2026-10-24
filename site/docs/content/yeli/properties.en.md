# Document properties and frontmatter

## Start with common metadata

Edit common author and tag information near the title. In Edit, open the right-hand Document panel to add a description. Expand organization and authorship to maintain those fields. Everything remains in YAML frontmatter at the top of Markdown, without a separate hidden property database.

## Add custom properties

Enter a unique field name and choose text, number, boolean, date or text list. Filter large collections, change values or remove a property. Removal can be undone.

```yaml
---
title: Project handbook
tags: [guide, internal]
budget: 1200
approved: false
review_date: "2026-10-24"
owners: [Lin, Sam]
---
```

`review_date` is a date-shaped string. It does not run a clock or trigger a workflow. Numbers must be finite; integers too large to represent safely remain read-only. Enter text lists as items rather than treating commas as a way to serialize arbitrary objects.

## Commit safely

For ordinary single-line inputs, Enter or blur commits and Escape cancels the draft. Multiline and list fields use `⌘/Ctrl + Enter` to commit. A concurrent change to the same value may reject your update; inspect the current value before editing again.

Nested objects, null and complex values are preserved read-only. Duplicate keys or ambiguous YAML disable forms to avoid changing the wrong value. Keep a backup when correcting source with local editing or external tools. See the [frontmatter tutorial](../markdown/frontmatter.html).
