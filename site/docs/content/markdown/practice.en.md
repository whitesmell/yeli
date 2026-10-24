# Practice and references

## Task: a project brief someone can continue

Start a `.md` file with this skeleton and add real, non-sensitive content:

````markdown
---
title: Local document experiment
lang: en
tags: [practice]
---

# Background

Describe the reader, problem and sources.

# Decision

**Acceptance:** Reopen the saved file with text and images intact.

- [ ] Complete the draft
- [ ] Check sources

| Option   | Limitation                           |
| -------- | ------------------------------------ |
| Markdown | Images travel separately             |
| Yeli     | Editable HTML needs a trusted source |

```text
This is displayed content, not executed code.
```
````

## Human acceptance

1. Inspect heading levels, paragraphs, lists, links and tables; import `.md` into Yeli.
2. Embed one local image with a description. Save a practice `.yeli.html`, close it and reopen it.
3. Try undo and preview a historical version. Restore only a different version and confirm before doing so.
4. Export `.md` and read-only HTML. Compare their text and check image limitations in Markdown and resources in the read-only output.

## Give an Agent a bounded task

Ask: “Pre-read and extract first. Change one sentence only in Decision. Use the original hash to reject stale edits, write a new copy and validate it. Report the diff and whether the shell changed.” Follow the [Agent tutorial](../yeli/agent.html). Verify facts and formatting as well as `ok: true`.

## References and further reading

This course uses original structure and examples to cover the user-requested scope. These references do not declare Yeli feature support:

- [Markdown introduction](https://markdown.com.cn/intro.html): uses, workflow and dialects.
- [Cheat sheet](https://markdown.com.cn/cheat-sheet.html): basic and extended syntax at a glance.
- [Basic syntax](https://markdown.com.cn/basic-syntax/): headings, paragraphs, emphasis, quotes, lists, code, links, images, escaping and HTML.
- [Extended syntax](https://markdown.com.cn/extended-syntax/): tables, fenced code, footnotes, heading IDs, definition lists, strikethrough, tasks, emoji, highlighting, sub/superscripts and autolinks.

Primary sources for history and semantics are [Gruber's project](https://daringfireball.net/projects/markdown/), [CommonMark](https://spec.commonmark.org/0.31.2/) and [GFM](https://github.github.com/gfm/). Return to the [cheat sheet](cheatsheet.html) or read [Yeli's mission](../yeli/mission.html) to understand the single-file choice.
