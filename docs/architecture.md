# Yeli Architecture

Advanced Source/Split is an official optional module excluded from the default
release. The default keeps WYSIWYG and block-local raw-text fallback; only an explicitly composed
enhanced build includes CodeMirror and the full source/split surface. The plugin
uses an internal revision-bound host adapter, cannot be selected by payload data,
and does not introduce a public browser facade or dynamic loader. Build and
validation commands are documented in [development](development.md).

Status: U1–U6 plus U7 automated release machinery as of 2026-08-31. Manual release evidence, production-key pinning, and the authorized real-Agent run remain explicit public-tag gates.

## One Artifact, Two Trust Domains

An Yeli document is one HTML file with two sharply separated domains:

1. The release shell is trusted executable code built from this repository.
2. The document payload is untrusted pure data whose authored authority is Markdown including YAML frontmatter.

The shell may parse, validate, render, and save the payload. The payload must never contribute JavaScript, raw executable HTML, SVG, plugins, renderer configuration, network endpoints, or credentials. Receiving an editable Yeli file from an untrusted party is equivalent to receiving active HTML; static exports are the publication boundary.

## Current Runtime

```text
index.html
  -> early Agent preamble + unique pure-data payload
  -> inert static preview for script-disabled reading
  -> React app shell parses current payload against a pristine pre-mount shell snapshot
     -> Read surface
        -> markdown-it (raw HTML off)
        -> explicit embedded-image resolver; remote media inert
        -> DOMPurify final boundary
     -> Edit surface
        -> source-mapped WYSIWYG block projection
        -> range/hash/revision-bound Markdown transactions
        -> optional enhanced profile: CodeMirror Advanced Source / Split
     -> File lifecycle
        -> direct handle write only after permission + fingerprint checks
        -> download-copy fallback retains dirty/recovery state
        -> IndexedDB recovery/history keyed by opaque localInstanceId
     -> Export
        -> canonical Markdown
        -> script-free no-network static HTML
        -> generated-artifact Export Preview and print/PDF path
```

Vite and `vite-plugin-singlefile` emit one self-contained
`dist/html/starter.en.yeli.html` or `dist/html/starter.zh-CN.yeli.html` per language
build. Build-time injection places the readable payload and static preview
before runtime bytes. The final build packs the runtime and CSS with Zopfli
raw DEFLATE (15 iterations) and HTML-safe Base86. Two inert carriers hold the
bytes; a hash-authorized module decodes them with native
`DecompressionStream("deflate-raw")`, injects transient CSS, and imports a local
Blob module. Only this compressed profile adds `blob:` to `script-src`;
connections and `unsafe-eval` remain blocked. Zopfli is a build dependency,
not shipped executable code.

A synchronous boot script captures the complete canonical pre-mount document
string before removing the inert preview, ahead of the first animation frame.
The build canonicalizes the tail after that script so the snapshot and on-disk
shell agree byte-for-byte. A full save splices refreshed payload/preview into
that pristine string. The artifact does not embed a second runtime/template
copy, and React/editor DOM and decompressed CSS never enter the saved artifact.
See `docs/compression.md` for measurements and the owner's deferred size target.

## Accepted V1 Interface Runtime

```text
canonical Markdown + YAML frontmatter
  -> revisioned store and source-range index
     -> WYSIWYG block projection (default Edit; transient only)
     -> restricted renderer (immersive Read)
     -> optional build-time plugin -> CodeMirror (Advanced Source / Split)
     -> collapsible outline tree + inline/common metadata
     -> one right utility rail for inspector, history, or shortcuts/Markdown guide
     -> export flow -> exact static Export Preview
```

Edit and Read are the only primary modes. The toolbar clock opens local history in the right utility rail; history records actual operations, origin/modifier, affected Markdown kinds, changed-line counts, and asset deltas, then requires explicit confirmation before atomic restore. It intentionally omits a line-by-line diff workbench. Opening or closing Advanced Source, history, guide, inspector, presentation, focus, or export surfaces is byte-neutral.

Focus is a chrome preference that preserves block, selection, scroll, and source state. Present is eligible only when the document yields at least two H1 sections, or two H2 sections when no H1 exists. Projection/render jobs are revision-bound and expose pending, ready, degraded, or blocked state; stale results never replace a current view.

## Source Fidelity

The U1 Smart Write proof remains a CodeMirror fidelity baseline rather than the default editor. U8's selected projection meets that baseline through no-edit zero diff, supported-block narrow diffs, exact source-safe fallback for ambiguous syntax, revision-bound stale-range rejection, and synthetic browser IME/paste/undo/focus coverage. CodeMirror is retained only for explicit Advanced Source work.

All later UI commands must enter through typed, range-aware operations. Unknown Markdown and frontmatter syntax survives because no renderer AST, live DOM, or GUI block tree becomes content authority or is serialized into the portable payload.

## Rendering Boundary

Yeli uses `markdown-it` with raw HTML and linkification disabled. Every result passes through DOMPurify. Image tokens resolve only through explicit trusted asset maps; unapproved remote and unknown schemes become inert placeholders, and external links follow the documented user-activation policy. Static export repeats the same boundary with a no-network CSP and no script.

## Browser Lifecycle

The File menu distinguishes a connected direct-write handle from a download fallback before the user saves. It generates the current complete artifact first and discloses active-content trust, secure-context state, exact bytes, and local 64 MiB eligibility before enabling Save or Save Copy. Direct save requests permission, compares the exact previously opened fingerprint, and reports success only after the writable stream closes. A mismatch writes nothing and requires an explicit choice among reload, Save Copy, or confirmed overwrite. Without a handle, Yeli downloads a new copy, keeps the session dirty, and retains recovery when persistence is available.

Local recovery, history, and retained handles are addressed by an origin-generated opaque `localInstanceId`, not by payload-controlled `docId`. Retained handles reconnect directly; exact prior fingerprints require human confirmation; Save Copy forks local history. Corrupt or future-version files retain original bytes and enter a bounded recovery sheet rather than partially loading.

Persistent recovery is best-effort for local `file:` artifacts. Loopback HTTP is accepted only for the exact `localhost`, `127.0.0.1`, or `[::1]` hostname as a development exception. Other hosted copies require a trusted release shell that pins an exact HTTPS origin in `yeli:trusted-recovery-origin`. Other HTTP, lookalike loopback names, unmatched, and multi-tenant hosts receive no persistence claim; editing and manual export continue, with explicit degraded-storage messaging.

Static publication is a separate no-network artifact: validated embedded assets may be inlined, remote subresources become inert links/placeholders, and session approvals never serialize. V1 has no browser update path. A Node helper may verify a pinned Ed25519 manifest over a shell projection that masks only the unique payload/static-preview contents; it first rejects any preview outside the inert generated grammar. The helper can then perform an explicit rollback-safe manual migration into a clean shell.

## Agent and Release Boundaries

The U6 file helper publishes bounded read, import, expected-revision/hash
mutation, validation, safe render/export, freshness refresh, atomic no-clobber
output, and exact shell-region receipts. Mutation commands may pair
`--updated-by` with `--change-summary` to refresh self-reported external-Agent
attribution against the resulting source hash. No browser facade or model
surface ships.

U7 adds a versioned shell projection, canonical Ed25519 release manifest,
helper-pinned raw public-key registry, non-executing verification, and
human-confirmed rollback-safe migration. Signing keys and passphrases are
forbidden from repository and CI. The browser has no update polling, key
retrieval, self-verification badge, or shell replacement path.

The original U1 proof established four mechanics later frozen by U2/U6:

- one unique inert JSON block;
- LF-normalized `markdown.lines` plus `finalNewline` materialization;
- an in-file preamble that requires revision/freshness handling;
- separate SHA-256 receipts for immutable prefix and suffix.

Both direct JSON editing and helper-mediated raw Markdown editing passed the
early feasibility fixtures with zero shell drift. U6's deterministic semantic
matrix is CI evidence only. U7's adapter-neutral packet/scorer keeps model
execution and credentials outside the repository, but the frozen three-Agent
release score remains an authorized manual gate. Dated feasibility and benchmark
records remain local evidence outside the public tree.

## Dependency Gates

Core dependencies must be local, pinned, offline-capable, and tree-shakeable. Mermaid, KaTeX, broad highlighting, fonts, and any public browser Agent API remain evidence-gated. U1 measured their isolated bundle cost but did not admit them into the product shell.
