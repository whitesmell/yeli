# Import, export and share

## Online editor and local `.yeli.html`

The online editor processes Markdown locally and does not upload files. When it opens `.md`, saving downloads Markdown; for one complete file you can keep editing offline, choose “Export editable .yeli.html”. After downloading, open that file from your computer to continue editing. Whether the web entry is available depends on the current published site; this does not claim a fixed deployment address or cloud storage.

A local `.yeli.html` is an editable working file: open it offline in a browser, and saving or saving a copy stays on your computer. Do not substitute the browser's Save page command for Yeli saving, and do not treat a web draft as a saved file.

## Import Markdown

More → Open file accepts `.md` and Yeli documents. Imported Markdown keeps its standard text; saving creates a new `.yeli.html`. Relative image paths do not automatically become attachments. Inspect and embed needed images. Save current work before opening another file.

Legacy `.aimd.html` is not automatically opened or converted. Preserve it, export `.md` with the older tool and import that Markdown separately. Renaming the extension is not migration.

## Choose an output

| Goal                       | Choose                              | Check                                                      |
| -------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| Take Markdown from the web | Download Markdown / Export Markdown | Embedded images are not packaged with `.md`                |
| Continue editing offline   | Export editable .yeli.html          | Reopen the actual downloaded `.yeli.html`                  |
| Continue editing locally   | Save Yeli / Save copy               | Trusted origin, complete file, latest edits                |
| Read-only web delivery     | Export read-only HTML               | Export preview, missing resources, links                   |
| Print through the browser  | PDF via browser print…              | Browser dialog, pagination, margins; no automatic PDF file |

Read-only HTML uses safe rendering and contains no editor or scripts. Export Preview inspects this output before download. Editable `.yeli.html` is offered only when the trusted template passes the build checks. If it is missing or fails validation, only that export is disabled; Markdown, read-only HTML and printing remain available. Reopen the actual downloaded file to confirm that text and settings can be edited offline.

“PDF via browser print” describes the browser printing flow; it is not a promise that a PDF file is saved automatically. Yeli opens the print dialog, where you choose a printer or the system's Save as PDF destination. Pagination can differ between browsers, so inspect its preview.

## Share and verify

Do not substitute the browser's Save page command for document saving. Reopen the actual output before sharing. Resolve missing-image findings, or explicitly accept the missing content before delivery. Editable HTML is active content for trusted sources; use static exports for public reading. See [safety and compatibility](compatibility.html).
