# Images and offline resources

## Carry images inside the file

In Edit, insert an image and select a local PNG, JPEG, GIF or WebP file. The image is embedded in `.yeli.html` and saved together with its Markdown reference. SVG is not an admitted import format. Images exceeding size, count or total resource limits are rejected; compress them before trying again.

## Inspect and change an image

Select an image to inspect its description, title and source in the right rail. Replace, duplicate or delete it there. Replacement selects another local image. Deletion handles attachments according to their references; do not edit internal asset IDs by hand. Open an image preview for details, close with Escape, then save a copy and check it.

Alternative text should describe the information conveyed, such as “First-quarter cost comparison for three options”, rather than “Image 1”. It helps readers who cannot see the image understand the document.

## A URL is not an embedded asset

Remote image URLs and relative file paths in Markdown are not automatically downloaded when you open a document. The current renderer displays an unavailable notice. Embed images through local file selection for offline delivery. If the interface offers no loading action, clicking the document will not fetch them.

Review missing-image notices during export. A plain `.md` export does not package embedded binary images. Keep Yeli or inspect a read-only HTML export when images must travel in one file. See [import and export](export.html).
