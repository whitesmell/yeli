# Save, copies and conflicts

## Choose a save path

Use `⌘/Ctrl + S`, or open More and choose the current save action: Save or Download updated copy. A browser with direct-write support and granted permission can save the original file. Other environments download an updated copy. Save a copy keeps an independent version. Check the write or download result and locate the newest file in your file manager.

You grant file-selection and write permissions. Downloading a copy does not establish permanent write-back access. The browser's native Save page command is not Yeli's document-save operation.

## Handle external changes

If an Agent or another tool changed the file on disk, saving from an older page may cause a conflict. Preserve a copy of your current edits, then inspect the newer disk file. Do not overwrite changes you do not recognize. Fingerprint checks provide best-effort detection, not a transactional lock across editors.

After reopening, losing permission or losing a file handle, follow the reconnection prompt and verify the selected target. Save a new copy if reconnection is unavailable; do not delete someone else's changes to continue.

## Read the actual status

About Yeli shows the complete file size and save/recovery status. Recovery exists only in the browser and does not replace a file. If saving fails, export Markdown to preserve the text before resolving permission or disk-space issues.

Size includes runtime code and embedded images. KB / MB use decimal units, with exact bytes available for checking. Resource and transport limits are separate. Read [compatibility](compatibility.html) before sharing.
