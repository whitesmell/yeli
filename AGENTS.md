# AGENTS.md

## How Agents Should Work In This Repo

Read `PROJECT_CONTEXT.md` first, then the relevant public format, architecture,
and development documentation. Preserve the documented product boundaries.

Lead with evidence. High-risk format, save, security, and browser claims require fixtures or production-artifact tests. Preserve existing/user changes and keep third-party source under ignored `reference/` read-only.

## Product Constraints

- Current name: 页里 / Yeli. The current editable format is `.yeli.html`; do not add `.aimd.html` compatibility or silently convert old user files.
- Canonical artifact: `.yeli.html`; canonical authored content: Markdown including YAML frontmatter.
- V1 AI-friendly means external file-format interoperability, not built-in AI editing.
- V1 has no collaboration, accounts, cloud canonical storage, or executable document plugins.
- Core use is offline, local-first, single-file, zero-setup, source-faithful, and progressively disclosed.
- Default human editing is a source-mapped WYSIWYG block canvas; CodeMirror source/split is Advanced View only. Edit and Read are the only primary modes; Export Preview belongs to export.
- Left navigation is document outline only. Common metadata is title-adjacent, advanced metadata is in the right inspector, and local history opens from the top toolbar.
- Editable Yeli is active content for trusted senders/origins; untrusted publication uses static exports.

## Codebase Boundaries

- Payload is untrusted pure data; runtime shell is trusted release code.
- Derived manifest, outline, preview, stats, and optional summary never become content authority.
- UI/helper operations share typed semantics; public `window.yeli` is conditional on a concrete consumer.
- Local recovery/history/file handles stay outside the portable document.
- Local recovery/history/file handles use an origin-generated opaque instance identity; payload `docId` alone never selects browser-local records.
- Browser/runtime code must not depend on Node, server, CDN, model API, or network credentials.
- V1 has no browser-driven shell update path. Release verification/manual migration belongs to the Node helper and always writes a new copy.

## Testing Expectations

- Format changes: round-trip, hostile terminator, migration, unknown-field, source-fidelity, freshness, and shell-diff fixtures.
- Legacy `.aimd.html` input must fail closed while preserving the original bytes; same-format Yeli version migration remains a separate contract.
- UI transforms: asserted narrow source diffs plus undo/focus/accessibility behavior.
- Save/recovery: overwrite fallback, external conflict, unavailable storage, static preview, and complete-artifact size.
- Rendering: sanitizer, URL, remote-resource, budget, and zero-unapproved-network tests.
- Release: test the exact built `.yeli.html` offline across supported browser/transport profiles.
- Agent surface: file-only preamble/helper tasks, expected revision/hash, structured receipts, zero shell drift, and stale-data handling.

## Security Rules

- Never render unsanitized output or execute document-provided code.
- Never put private signing keys, model credentials, real user documents, or plaintext recovery data in repo/CI/logs/benchmarks.
- Never claim active HTML from an untrusted source can securely attest itself.
- Human-gate file permission, overwrite, remote media, recovery deletion, and manual shell migration.
- Fail closed on signature verification; hashing may use only a deterministic tested fallback.

## Files To Read First

1. `PROJECT_CONTEXT.md`
2. `docs/README.md`
3. `docs/format.md`
4. `docs/architecture.md`
5. `docs/development.md`
6. `docs/public-scope.md`

## Do Not

- Replace Markdown with block JSON or a rich-text canonical model.
- Present the source editor as the default human editing surface or put version history in the left outline.
- Add an AI/chat/model surface, collaboration, sync, account, plugin, or server feature to V1.
- Import unrelated application models that conflict with the single-file boundaries.
- Add Mermaid/KaTeX/large highlighters/fonts before their evidence gate.
- Reformat untouched Markdown/frontmatter or discard unknown safe fields.
- Serialize live DOM as the document or let runtime nodes accumulate across saves.
- Hide browser/save/recovery/transport degradation behind generic success messages.

## Session Checklist

- Start: inspect status, read relevant documentation and tests, state assumptions.
- During: keep mutations narrow, update tests and documentation, preserve trust boundaries.
- End: run checks, inspect status/diff, and report residual risks. Keep private
  working records outside the public source set.
