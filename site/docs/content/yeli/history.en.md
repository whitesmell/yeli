# History, recovery and undo

## Open version history

In Edit, choose More → History. The right rail lists versions in this browser. Summaries describe the kind of change; select a version to inspect its content and image changes before restoring. You can filter records. Committed edits appear in the open list after a short delay without reopening the panel.

## Confirm a restoration

Select a different version, review the summary and confirm restoration. Restoring replaces current content and the images recoverable from that version. Older records without image history explain how current images are retained. You can undo a restore and must still save the file afterward.

If the selected version matches the current content, Yeli explains that restoration is unnecessary and offers Choose another version. There is no restore action to perform; this is not a restore failure.

## Recover after reopening

On supported origins with available storage, Yeli may offer an unsaved draft. Check its time and content before choosing whether to recover or discard it. Deleting recovery requires a deliberate human action and should not be the first troubleshooting step.

Records belong to a local document instance in this browser and origin. They do not travel inside `.yeli.html`. Copying a file, changing browsers, clearing site data or using private browsing can make history unavailable. Matching document IDs do not imply shared history.

## When recovery is unavailable

Persistent recovery is admitted for `file://`, exact loopback HTTP hosts and HTTPS origins explicitly allowed by the release shell, and still requires working IndexedDB. Ordinary HTTPS hosting does not automatically enable it. Check About for actual status and download copies promptly.
