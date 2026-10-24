# Edit text and selections

## Write on the page

Enter Edit and click a paragraph or heading to type directly. Enter in a heading moves into a following paragraph; insertion controls in empty blocks create new structure. Finish an input-method composition before issuing a formatting command.

## Format a selection

Select text to reveal bold, italic, strikethrough, inline code, link and clear-formatting tools. Use `⌘/Ctrl + B` for bold, `⌘/Ctrl + I` for italic, `⌘/Ctrl + K` for a link and `⌘/Ctrl + Shift + C` for inline code.

Selecting “Confirm budget” and applying bold should produce `**Confirm budget**` in the source. Tools change the selected range instead of serializing the entire document. Clear formatting handles recognized formatting in the selection; it is not a document-wide style reset.

## Undo and local Markdown editing

Use undo and redo for text and supported structural changes. If a menu or selection tool is unavailable, first check that you selected editable content.

For complex Markdown that cannot be edited directly, choose the block's Edit Markdown action. Change the necessary text and commit it. Preserving source does not mean the extension can render. Whole-document source and split views belong to the official enhanced build and have no entry in the default file.

## Try it

Write two sentences, make only the first bold, then undo once. The second sentence should remain unchanged. Continue with [blocks and templates](blocks.html) to change structure without rewriting the whole document.
