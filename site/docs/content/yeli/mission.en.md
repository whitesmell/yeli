# Why Yeli

## Start with Markdown

Markdown uses a small set of symbols to organize plain text. You can read, search, compare and move a document without keeping its original editor. Read about its [origins and dialects](../markdown/intro.html), then consider the delivery problem Yeli addresses.

A `.md` file usually needs an editor, a renderer and a folder of images. An exported HTML file is easy to read but often cannot be edited further. Changing tools, missing attachments and forgotten re-exports can separate the source from the delivered document.

## What Agents gain, and what they still need

Agents can read Markdown, locate context by headings, change one paragraph and produce a diff for review. Text does not guarantee understanding: missing assumptions, stale summaries, false claims, broken external images and malicious instructions in a document still matter. Give an Agent a clear task, sources and acceptance criteria, then review its changes.

Asking an Agent to rewrite an entire executable HTML file also risks changing runtime code. Yeli provides a unique content boundary, a pre-read manifest, source hashes and mutation receipts so external tools can work on the source. Manifests and summaries assist navigation; Markdown and YAML frontmatter remain the authored content.

## Yeli's mission

Make a document easy for people to continue writing and for Agents to locate and verify, while keeping it portable. A `.yeli.html` file carries Markdown, its reading and editing environment, and embedded images. Open it offline or export standard Markdown.

This describes the direction of the current version. Everyday use starts with Edit on the page. Use the external CLI and Skill when you need an Agent. There is no built-in model service or shared cloud workspace.

## Choose a delivery format

Use a `.yeli.html` from a trusted source for further editing. Offer read-only HTML, Markdown or PDF to readers. Editable HTML contains executable code and cannot prove its own origin is safe. Next, complete your [first edit and save](quickstart.html).
