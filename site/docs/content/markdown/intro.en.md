# Markdown: origins, dialects and Agents

## What it is

Markdown is a lightweight markup syntax and was also the name of a tool that converted that text to HTML. Use `#` for a heading or `-` for a list while keeping the source readable. `.md` is a common extension. The text does not carry an editor or guarantee that images are packaged.

It suits notes, project READMEs, handbooks and technical documentation. Version control and moving between tools are straightforward; complex publishing layouts, interactive applications and relational data need other capabilities. A common workflow is to write in a text editor and let a renderer produce a web page.

## A short history

John Gruber released Markdown in 2004, with help from Aaron Swartz on the syntax. Readable source was central, drawing on plain-text email and forum conventions. Implementations later added tables, tasks and other extensions, while sometimes interpreting the same source differently.

CommonMark supplies a more precise syntax and examples for testing. GitHub Flavored Markdown (GFM) builds on it with tables, strikethrough, task lists and extended autolinks. GFM is not every GitHub website feature, and a Markdown editor does not necessarily implement all of it.

Primary sources: [Markdown project](https://daringfireball.net/projects/markdown/), [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) and [GFM specification](https://github.github.com/gfm/). This course reorganizes the requested introduction, cheat sheet, basic and extended coverage with original examples. See [practice](practice.html) for the requested reference entry points.

## Agents benefit from text, but still need constraints

Text is easy to read, address by line, patch and compare. Headings, explicit assumptions, sources and acceptance criteria are more actionable than “let AI handle it”. Markdown does not eliminate hallucinations. External assets, stale summaries, context limits and malicious document instructions remain problems.

This leads to [Yeli's mission](../yeli/mission.html): keep reviewable Markdown while carrying the human reading/editing environment and assets, and give Agents a pre-read, patch and validation path. Learn standard syntax first, then check [extension boundaries](extensions.html).
