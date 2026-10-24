# Import, export and share

## Import Markdown

More → Open file accepts `.md` and Yeli documents. Imported Markdown keeps its standard text; saving creates a new `.yeli.html`. Relative image paths do not automatically become attachments. Inspect and embed needed images. Save current work before opening another file.

Legacy `.aimd.html` is not automatically opened or converted. Preserve it, export `.md` with the older tool and import that Markdown separately. Renaming the extension is not migration.

## Choose an output

| Goal                   | Choose                | Check                                       |
| ---------------------- | --------------------- | ------------------------------------------- |
| Continue editing       | Save Yeli / Save copy | Trusted origin, complete file, latest edits |
| Keep source            | Export Markdown       | Embedded images are not packaged with `.md` |
| Read-only web delivery | Export read-only HTML | Export preview, missing resources, links    |
| Print or archive       | Print / Save PDF      | Browser dialog, pagination, margins         |

Read-only HTML uses safe rendering and contains no editor or scripts. Export Preview inspects this output before download. Printing opens the browser dialog, where you choose a printer or PDF destination. Pagination can differ between browsers.

## Share and verify

Do not substitute the browser's Save page command for document saving. Reopen the actual output before sharing. Resolve missing-image findings, or explicitly accept the missing content before delivery. Editable HTML is active content for trusted sources; use static exports for public reading. See [safety and compatibility](compatibility.html).
