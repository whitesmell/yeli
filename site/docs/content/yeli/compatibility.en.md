# Compatibility, safety and troubleshooting

## Browser capability is conditional

The current artifacts have automated Chromium and Firefox evidence. That does not certify Safari or every phone. Direct write-back usually depends on a supporting file-access API, the environment and permission; otherwise download a copy. With JavaScript disabled, only a bounded static preview remains. It is not editable and may be stale after Agent edits.

The default build provides page editing and local block Markdown editing. The official enhanced build adds whole-document source and source-plus-preview views. It is a separate composed file, not a way to install arbitrary document plugins, and it does not enable otherwise absent diagram or math rendering.

## Troubleshoot by symptom

| Symptom                       | Next step                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------- |
| HTML attachment will not open | Download locally or ask for a read-only export                                    |
| Only a summary appears        | Check whether an attachment viewer disabled scripts; open the trusted original    |
| Save creates another file     | This is a fallback; confirm the download and reopen the newest copy               |
| History is unavailable        | Check storage status in About and save a file; do not start by clearing site data |
| Image is missing              | Embed the local image instead of relying on a remote/relative path                |
| Property is read-only         | Check complex values or ambiguous/duplicate YAML and preserve the source          |
| Presentation is unavailable   | Check top-level heading rules in Read, focus and present                          |
| Legacy file is rejected       | Preserve `.aimd.html` and export Markdown through the older tool                  |
| File is too large             | Compress images or split content, then check complete-file bytes                  |

## Trust and permissions

Editable HTML contains code. Open it only from trusted senders or hosting origins. A validation message inside a file cannot establish trust in untrusted code. Yeli does not automatically execute document HTML, scripts or remote images; you decide whether to follow external links.

File access, overwrite, recovery deletion and shell migration require human decisions. There is no browser-driven automatic shell update. Prefer [static exports](export.html) for reading-only sharing.
