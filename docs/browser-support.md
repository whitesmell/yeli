# Browser and File Lifecycle Support

Status: experimental compressed candidate, 2026-10-23. The `.yeli.html`
artifact is active HTML and should be opened only from a trusted sender or
origin. Use the script-free static HTML export for untrusted publication.
The current Chinese starter has SHA-256
`fa6fd320d86bda8d469f89fc18d937b473ca2124572269d26c1addd45d8b78b9`.
Historical browser results below do not certify this changed shell.

## Capability Matrix

| Environment                                       | Read and Edit                         | Open                                                  | Save                                                                                  | Recovery and history                                                                        | Notes                                                                                                         |
| ------------------------------------------------- | ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Chromium on a dedicated trusted HTTPS origin      | Offline after the artifact is present | Native file picker when exposed                       | Direct overwrite after permission and fingerprint checks; download fallback otherwise | IndexedDB only when the shell pins that exact origin through `yeli:trusted-recovery-origin` | A direct overwrite is never attempted after an external fingerprint mismatch without a human confirmation.    |
| Chromium opened with `file:`                      | Offline                               | File input; picker availability varies by host policy | Downloads a new `.yeli.html` copy                                                     | Best effort; opaque-origin storage may be unavailable                                       | The UI keeps the session dirty and retains recovery after download only when persistent storage is available. |
| Loopback HTTP (`localhost`, `127.0.0.1`, `[::1]`) | Offline after the artifact is present | Page or local file input                              | Download fallback                                                                     | IndexedDB when available; the loopback origin is treated as a development-only exception    | Host must be one of the three exact loopback names; lookalike and LAN/public HTTP hosts remain disabled.      |
| Firefox desktop                                   | Offline                               | File input                                            | Downloads a new copy                                                                  | Best effort per origin                                                                      | No direct-write promise is shown.                                                                             |
| Playwright WebKit on Ubuntu 24.04 ARM64           | Current compressed artifact pending   | Current artifact pending                              | Current artifact pending                                                              | Current artifact pending                                                                    | Historical uncompressed-runner results do not certify the compressed loader.                                  |
| Branded Safari desktop                            | Expected offline; not yet claimed     | Not yet manually verified                             | Not yet manually verified                                                             | Not yet manually verified                                                                   | Do not infer branded-Safari support from the WebKitGTK automation result.                                     |
| Mobile browsers                                   | Read and WYSIWYG Edit                 | System file chooser where supported                   | Share/download behavior is browser and OS dependent                                   | Best effort per origin                                                                      | The compact UI keeps File and History in the top toolbar; no source editor is shown by default.               |
| JavaScript disabled                               | Bounded inert static preview only     | Not available                                         | Not available                                                                         | Not available                                                                               | The preview is escaped, contains no document script, and is refreshed by an Yeli save.                        |

## Truthful Degradation

- The compressed release requires native `DecompressionStream("deflate-raw")`
  and local Blob module imports. Chromium 151 and Firefox 153 pass the local
  offline production-artifact checks, including saving/reopening the original
  carriers, stylesheet application, and unchanged shell hash. Missing
  decompression produces an explicit alert while leaving `#yeli-doc` readable.
- The current loader inflates runtime and CSS concurrently and validates their
  decoded byte lengths and UTF-8 before use. Invalid encoding or a decoded-length
  mismatch produces an alert before mounting; no decoded stylesheet is inserted.
  The exact desktop regression matrix passed 86 tests on 2026-10-23.
- JavaScript-disabled viewers retain the bounded static preview. Normal boot
  captures the pristine shell and removes that preview before the first frame.
- `Save` means direct overwrite only when Yeli holds a writable file handle. Success is reported only after the writable stream closes.
- Before Save or Save Copy is enabled, the File menu serializes the current complete artifact, reports its exact byte count, active-content trust, secure-context state, and whether it fits the documented 64 MiB local Yeli format profile. Named email/IM attachment profiles are not claimed; the menu labels editable attachment sharing experimental and recommends a static export until dated transport evidence exists.
- Without a handle, the same menu action is labeled `Download updated copy`. It does not clear the dirty state or delete recovery data.
- `Save a copy` always creates a new browser-local instance identity. `docId` never selects history, recovery data, or a retained handle.
- When the connected file fingerprint changed, Yeli writes nothing and offers three explicit human choices: reload the external file, download an Yeli copy, or confirm overwrite.
- IndexedDB denial, quota failure, and opaque-origin failure never block editing. Yeli reports degraded recovery and keeps manual exports available.
- Hosted recovery is disabled by default. A dedicated HTTPS deployment must add `<meta name="yeli:trusted-recovery-origin" content="https://exact.example">` whose value exactly matches `location.origin`. Loopback HTTP is the sole non-HTTPS hosted exception and accepts only the exact `localhost`, `127.0.0.1`, or `[::1]` hostname. Other plain HTTP, lookalike loopback names, LAN addresses, multi-tenant, and unmatched hosts receive no persistent-recovery claim. When storage is unavailable or disallowed, both the startup notice and History panel say that edits are not being recorded locally instead of promising an automatic snapshot.

## Export Profiles

- Markdown export is canonical LF Markdown with YAML frontmatter intact.
- Static HTML is generated before Export Preview, contains no editor, recovery, or history data, includes a no-network CSP, contains no script, and resolves only validated embedded image assets.
- External images become inert placeholders. External links remain user-activated links; they do not load during rendering.
- Print / Save PDF uses the same generated static HTML rather than the editable Read surface.

## Release Evidence Still Required

Before any public release, record a dated manual run for at least one named static-host/download path, including screenshots, trust labeling, browser/OS versions, and the resulting artifact hash. Attachment support may be promoted only after a named email/IM path additionally records filename preservation, MIME behavior, trust labeling, and open/edit/save results; until then the exact artifact and this document label editable attachment sharing experimental. Branded Safari, mobile share sheets, real OS IME/dead keys, and assistive technology remain manual evidence rather than inferred support.

The historical 2026-09-03 candidate (SHA-256
`bd40b3f0fcdfc654dd509465bb6a5f9c2e882fe2119fa7074016b3206734bd19`)
had automated offline, source-fidelity, scoped
command, full-text search/replace, source-mapped Read-to-Edit, atomic history
compare/restore, presentation, about/trust, structural-accessibility,
reduced-motion, compact touch-target, and 1 MiB editor/search/history checks
across the local Chromium desktop, Chromium mobile, and Firefox desktop
profiles. That matrix passed 160 tests with 5 configured non-applicable skips;
the focused quality matrix passed 16 tests with the same 5 skips. The pinned
official Playwright 1.62.1 Ubuntu 24.04 ARM64 WebKit runner additionally passed
103 desktop/mobile tests with 7 configured non-applicable performance or
desktop-touch skips. These tests do not substitute for physical devices, a real
input method, branded Safari, screen-reader testing, the required named static
host, or any attachment profile a future release chooses to claim.

The 2026-09-03 local WebKit attempt on macOS 14 did not reach Yeli: Playwright
reported that its Sonoma WebKit build is frozen and then failed while creating
each page with `Page.overrideSetting: Unknown setting: PushAPIEnabled`. The same
package and exact artifact were therefore run through the official
`mcr.microsoft.com/playwright:v1.62.1-noble-arm64` image (digest
`sha256:941cc91e5022880ac1d14ae90b476b624deb6399dbbc28d612d5d5bd7928fcbd`),
where the complete WebKit desktop/mobile matrix passed. The WebKit cell is
automated-pass evidence; it is not a branded-Safari or physical-device claim.
