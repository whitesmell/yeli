# Workflows and best practices

Connect individual features into a task with these workflows. Each explains preparation, steps and a completion check. Complete the [quick start](quickstart.html) first if you are new; use the [feature overview](overview.html) to find a control.

## Meeting notes: separate decisions from actions

For live notes and post-meeting cleanup, copy a trusted starter.

1. Enter Edit and title it “Project weekly meeting — 2026-10-24”. Insert Meeting notes from the Templates section of Insert.
2. Fill the date and participants. Record agreed decisions under Decisions and individual actions under Next steps.
3. Include an owner and due date in each task, such as `- [ ] Lin: add the budget by October 28`. This records a commitment; it does not send reminders.
4. Add description and tags such as “Project A” and “Meeting”. Search body text for an owner or jump to Decisions through the outline.
5. Save when finished. If Yeli downloads a copy, move the latest file to the agreed directory and reopen it.

**Done when:** the recipient can find decisions, owners and next steps, and the saved file includes post-meeting edits. Agree on a handoff rather than accumulating ambiguous filenames.

Details: [templates](blocks.html), [properties](properties.html), [saving](save.html).

## Long documents: structure before formatting

For proposals, project handbooks and research notes:

1. Outline Background, Goals, Approach, Validation and Next steps. An ordinary article can use one H1 for its title, H2 for main sections and H3 for subtopics.
2. Check hierarchy in the outline. A bold paragraph is not a heading. The outline filter searches headings; full-text search finds words in the body.
3. Write first, then format selections and add links. Use block menus for structural changes and local source for complex syntax.
4. Use tables for simple comparisons. If one is too wide, reduce columns or choose Page width → Wide before reducing font size throughout the document.
5. Save independent milestone copies. Inspect the scope before broad replacement, check the result and undo immediately if needed.

**Done when:** the outline communicates the structure, and text, tables and links work after reopening. An article's headings may not qualify for presentation; check that workflow separately.

Details: [writing](writing.html), [tables](tables.html), [find and replace](search.html).

## Import Markdown: check text, images and properties

For turning an existing `.md` into a portable editing file:

1. Back up the `.md` and its image directory. Save current work in a trusted Yeli, then import through More → Open file.
2. Check headings, lists, tasks and tables. Consult the [support table](../markdown/extensions.html); preserve unsupported source or adapt to supported syntax as needed.
3. Relative image paths do not automatically become attachments. Embed images that must travel offline and check their descriptions.
4. Inspect YAML in Properties. Preserve complex or read-only fields rather than deleting unfamiliar metadata to make a form editable.
5. Save a new `.yeli.html`, reopen without network access and inspect text and images before delivery.

**Done when:** originals are preserved and the new file contains needed text and images offline. Exporting `.md` alone does not export an image package.

Details: [images](media.html), [properties](properties.html), [import/export](export.html).

## Delivery: choose for the recipient's next task

| Recipient's next task     | Recommended output          | Check before sending                                                  |
| ------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Continue editing          | A trusted `.yeli.html` copy | Reopened file contains latest edits; channel permits HTML attachments |
| Read in a browser         | Read-only HTML              | Headings, images and links in export preview and the actual download  |
| Print or archive          | PDF                         | Pagination, margins, tables and images in browser print preview       |
| Use Git or another editor | `.md`                       | Readable frontmatter and text; arrange images separately              |

Save the working document before generating reading outputs. Browser Save page is not Yeli Save, and browser history is not the version you sent. Agree on filenames, revision notes and a person to merge changes when exchanging copies; Yeli does not automatically merge them.

**Done when:** opening the actual delivery as the recipient would confirms the content, assets and editability match the agreement.

Details: [output choices](export.html), [transport limits](compatibility.html).

## Presentation: prepare eligible headings

For a short presentation from an existing document:

1. Save a working copy. Present needs at least two H1 headings, or two H2 headings with no H1. One H1 plus several H2 headings does not qualify.
2. Start each section with a point, then a table or image. Shorten or split long sections before repeatedly shrinking text.
3. Choose More → Present and inspect every section. Left/Right navigate; Escape leaves fullscreen or closes.
4. For PDF, use Print and check its pagination separately; it need not match presentation.

**Done when:** all sections can be navigated, text and images are readable and editing resumes after closing.

Details: [reading and presentation](reading.html), [shortcuts](shortcuts.html).

## Agent handoff: one writer at a time

For an external filesystem Agent organizing sections, checking structure or making a specific text change:

1. Commit the paragraph being edited in the browser, then save a working copy. Give the Agent its path, task scope and content to preserve.
2. Ask it to pre-read and extract Markdown with the CLI, patch against the current revision / sourceHash and validate. The [Agent tutorial](agent.html) gives concrete commands.
3. Inspect its receipt, Markdown diff and validation result. Do not ask it to scan and rewrite compressed runtime code.
4. Open the Agent's new output in the browser and check text and images. An old tab may hold earlier content; saving it could overwrite the new file.
5. On conflict, preserve both copies before comparing. A browser save after inspection can refresh the static preview to match Markdown.

**Done when:** the scope is reviewable, validation passes and the new file reopens correctly. The task does not automatically authorize overwrites, network access or document-embedded instructions.

Details: [Agent and CLI](agent.html), [conflicts](save.html), [history](history.html).

## Before finishing

- Check whether Save wrote back or downloaded a copy, and locate the file.
- Reopen the saved or exported file; inspect recent changes, images and key links.
- Keep milestone copies; browser recovery does not replace backups.
- Tell the next person its purpose, revision notes and whether to edit or only read.
