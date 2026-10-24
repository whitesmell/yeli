# Yeli Format v1

This document is the normative file-format guide for `.yeli.html`. Runtime
types and the JSON Schema value live in `src/document/model.ts` and
`src/document/schema.ts`; the parser, helper, tests, and this guide must agree.

The former `.aimd.html` / `aimd/document` format is not accepted by the Yeli
runtime or helper. Old files are left intact. A one-time manual project-data
transfer can export Markdown with the old helper and import it with a trusted
Yeli template; this is not an in-product compatibility or migration path.

## Trust and authority

The owner deferred the historical 100,000-byte distribution goal on 2026-10-23
to focus on compression quality. Complete-file bytes still include format
overhead, runtime, styles, notices and bundled content. This is not a change to
payload version 1 or a cap that truncates user-authored documents.
The production artifact stores its runtime and styles once, compressed with
Zopfli raw DEFLATE and Base86. On 2026-10-23, complete Chinese starter, English
starter, and empty builds measure 301,743, 301,022, and 293,242 bytes.
These are the initial compression baseline; later compression measurements
are in `docs/compression.md`. The deferred size target is reported separately
from source-fidelity, integrity, compatibility and other release checks.

An editable Yeli file is active HTML from a trusted sender or origin. The
runtime shell is trusted release code; the payload is untrusted pure data.
Markdown, including YAML frontmatter, is the only authored content and metadata
authority. Manifest, outline, statistics, Agent summary freshness, and static
preview are derived and cannot overwrite Markdown.

The 2026-10-24 properties UI also edits custom top-level YAML text, finite
numbers within safe integer precision, booleans and string lists. Larger
integers are preserved as read-only source values. Dates remain ordinary ISO date strings,
recognized by their value, without a portable UI type registry. Structured or
ambiguous values are preserved; root-level compact flow mappings are not GUI
editable. This adds no payload fields or format-version change. The manifest
continues to project only the documented core metadata. The Agent metadata
command retains its core-key input contract; custom YAML remains available
through freshness-bound Markdown edits.

Official starter documents use `lang: zh-CN` or `lang: en`, matching their HTML
language and static preview. The UI accepts `zh-Hans` as a Simplified Chinese
input alias. UI normalization is a display preference and never rewrites an
existing document's authored language metadata.

Opening or validating a payload never evaluates it as JavaScript, renders raw
HTML, or authorizes a network request. Use a sanitized static export rather than
an editable Yeli file for untrusted publication.

## Unique document block

Each artifact contains exactly one block with both attributes:

```html
<script id="yeli-doc" type="application/yeli+json">
  { ... }
</script>
```

A `YELI_AGENT v1` comment immediately identifies the editable boundary and
minimum validation rules. An Agent mutation replaces only the JSON body. Every
byte in the prefix through the opening-tag newline and every byte in the suffix
from the closing-tag newline are immutable shell.

Serialization uses UTF-8, LF, two-space JSON indentation, stable key order, and
escapes every literal `<` as `\u003c`. This makes payload text such as
`</script>` unable to terminate the block. Parsers reject missing or duplicate
markers before reading JSON.

The inert static-preview region is bounded by
`YELI_STATIC_PREVIEW_START` and `YELI_STATIC_PREVIEW_END` comments. Payload-only
Agent edits do not update it. A human/runtime full save replaces, never appends,
that escaped, bounded HTML preview and binds it to the refreshed `sourceHash`.
Shell verification permits preview staleness but accepts only the fixed generated
article grammar; injected tags, attributes, URLs, styles, frames, forms, or event
handlers make the shell projection invalid before its preview bytes are masked.
Normal JavaScript boot removes the preview with the root mount; a script-disabled
browser sees only the preview and no editing surface.

The production artifact stores the runtime and styles only once. After the full
document has parsed and before React mounts, the fixed boot script captures the
canonical pre-mount document string, then removes the inert preview from the live
root. Runtime save replaces only the authoritative payload body and generated
static-preview content in that pristine string. It never serializes mounted React
or editor nodes, and repeated saves cannot accumulate runtime DOM.

## Compressed release shell

The payload schema and Markdown encoding are unchanged by compression.
`#yeli-doc` remains unique, plaintext, and the only Agent-editable block.
The release contains exactly two additional inert script carriers:

```html
<script id="yeli-runtime-css" type="application/yeli+deflate-b86">
  ...
</script>
<script id="yeli-runtime" type="application/yeli+deflate-b86">
  ...
</script>
```

They contain trusted release CSS and JavaScript, never authored document data.
Base86 encodes four bytes as five ASCII characters, with bounded partial tails.
Its alphabet excludes whitespace, quotes, backslash, `<`, `>`, and `&`, so it
cannot form HTML terminators or entities. Build checks decode and independently
inflate both streams with Node zlib and compare every original byte.

One exact hash-authorized module with `data-yeli-runtime="deflate-b86"`
uses native raw-DEFLATE decompression and a local Blob module. Runtime and CSS
inflate concurrently, and both decoded lengths and UTF-8 must pass before
stylesheet insertion or module import. The CSP grants
script Blob loading only to the compressed profile and keeps connections and
`unsafe-eval` blocked. The synchronous final boot captures the pristine artifact
before removing the static preview; the canonical tail is
`</script></body></html>` with no trailing whitespace. Browser saves retain
both original carriers and the exact shell projection. The injected stylesheet
is marked transient and is excluded from fallback shell reconstruction.
The standalone compression script applies the same final canonicalization, so
identical source and parameters reproduce the build artifact byte-for-byte.

An unavailable decompressor produces an explicit startup alert. The original
plaintext payload remains recoverable by external tools; older browsers are
not promised an editable fallback. See `docs/browser-support.md`.

## Version 1 payload

Top-level key order is fixed, with safe additive fields serialized afterward:

```json
{
  "format": "yeli/document",
  "version": 1,
  "docId": "stable-logical-identity",
  "revision": 1,
  "manifest": {},
  "markdown": { "lines": [], "finalNewline": false },
  "agentSummary": {},
  "settings": {},
  "assets": []
}
```

`agentSummary` is optional. `docId` is stable logical identity; it is never a
browser-local recovery authorization key. `revision` is a non-negative safe
integer incremented by authored mutations. Settings are portable pure data and
must not duplicate authored Markdown semantics.

Unknown safe fields are preserved for additive compatibility. Keys named
`__proto__`, `prototype`, or `constructor`, accessors, functions, symbols,
non-finite numbers, cycles, class instances, and other non-JSON values are
rejected before they can enter live objects. Implementations copy properties;
they never prototype-merge payload objects.

## Canonical Markdown encoding

Import first normalizes CRLF and lone CR to LF. Encoding then:

1. records whether the normalized source ends in LF;
2. removes exactly that one LF when present;
3. splits the remainder on LF;
4. uses `lines: []` for an empty remainder.

Examples:

| Markdown bytes | `lines`     | `finalNewline` |
| -------------- | ----------- | -------------- |
| empty          | `[]`        | `false`        |
| `LF`           | `[]`        | `true`         |
| `a`            | `["a"]`     | `false`        |
| `a LF`         | `["a"]`     | `true`         |
| `a LF LF`      | `["a", ""]` | `true`         |

Materialization joins `lines` with LF and restores one LF when
`finalNewline` is true. A non-final encoding may not end in an empty line, and a
stored line may not contain CR or LF. Those rules give empty input, trailing
newlines, and internal blank lines one canonical representation.

## Frontmatter

Frontmatter is a leading YAML mapping bounded by `---` lines. Core keys are
`title`, `description`, `lang`, `tags`, `authors`, and `aliases`. The parser
retains concrete key and value spans. A GUI metadata edit replaces only the
target value span or inserts one documented key before the closing delimiter;
it does not stringify the mapping.

Untouched comments, whitespace, ordering, scalar quoting, multiline values, and
unknown safe keys remain byte-identical. Duplicate core keys, aliases, custom
tags, a non-mapping root, missing ranges, or unsupported core value shapes are
findings and disable structured GUI patching. The original source stays available
for explicit block-local raw-text editing when its range is safe, or unchanged
export when it is not. This does not depend on the optional Advanced Source plugin.

The planned official advanced plugin adds no payload field, installation URL,
executable asset, or required-extension marker. Plugin code is trusted release
shell code only; default and enhanced releases share the same pure-data document
format. Profile-specific builds use the same save and explicit shell-migration
boundaries described here. Module extraction alone does not change payload version 1.

## Manifest and freshness

The deterministic manifest precedes Markdown and assets and contains:

- `sourceHash`: lowercase SHA-256 of materialized canonical Markdown bytes;
- `docId` and `revision`;
- core frontmatter metadata;
- headings with unique anchors, heading line ranges, and section end lines;
- links, tasks, fenced-code languages, and `yeli-asset:` references;
- UTF-8 bytes, Unicode characters, lines, words, and structural counts.

The browser and helper recompute the manifest. A source-hash or deterministic
field mismatch makes the persisted manifest stale and non-authoritative. SHA-256
uses Web Crypto when available and a bundled, tested deterministic fallback
otherwise.

An external `agentSummary` contains `sourceHash`, `updatedAt`, `updatedBy`, and
`content`, plus an optional `changeSummary` string for concise local-history
display. `changeSummary` belongs only to `agentSummary`; it is not a manifest
field. Yeli v1 never generates this attribution itself. A mismatch retains the
old value for inspection but labels it stale; it is never silently returned as
current.

## Embedded assets

Assets use this pure-data shape:

```json
{
  "id": "sha256:<64 lowercase hex characters>",
  "mimeType": "image/png",
  "data": "canonical base64"
}
```

Markdown refers to an asset as `yeli-asset:sha256:<hex>`. Validation checks
canonical Base64, decoded byte budgets, total decoded bytes, duplicate IDs,
content hashes, safe MIME types, basic image signatures, and missing references.
Any asset validation error fails artifact opening into exact-byte recovery; static
publication independently keeps invalid assets inert. User SVG is rejected.
Complete-artifact bytes, including Base64 expansion, are
the transport truth; a file may remain locally saveable even when it exceeds a
claimed transport profile.

## Budgets and recovery

Default pre-parse ceilings are 64 MiB per artifact, 48 MiB per payload, JSON
depth 32, 20,000 JSON keys, 100,000 Markdown lines, 1 MiB characters per line,
256 assets, 8 MiB decoded per asset, and 32 MiB decoded assets total. Products
may tighten these limits but must not skip the early checks before expensive
parsing or rendering.

Version 0 (`id`, `revision`, and raw `source`) is the only supported migration
input and migrates once to version 1 while preserving source and safe additive
fields. An unknown `format`, future/unsupported version, corrupt JSON, unsafe
object, or invalid version-1 shape enters recovery. Recovery retains the exact
original artifact and exposes Markdown only when it can be safely materialized;
parsing never overwrites the input.

Browser recovery, local versions, retained file handles, and conflict fingerprints
are deliberately outside the portable payload. They are addressed by an
origin-generated opaque `localInstanceId`; two physical files with the same
payload `docId` do not share these records, and an exact fingerprint only offers
a human-confirmed reconnect. Save Copy forks that identity and disconnects any
original writable handle. A
download fallback keeps the current session dirty and retains recovery because a
browser download does not prove that the user stored or replaced a particular
file.

Hosted persistence is disabled unless either the page uses the exact loopback
hostname `localhost`, `127.0.0.1`, or `[::1]` over HTTP, or a trusted HTTPS shell
pins its exact origin through `yeli:trusted-recovery-origin`. Other HTTP,
lookalike loopback names, unmatched, and multi-tenant origins receive no recovery
claim. Local `file:` persistence remains best-effort. When storage is unavailable
or disallowed, recovery and History report that edits are not being recorded
locally rather than promising a snapshot.

## Repository helper

Run with the pinned project Node version:

```sh
npm run yeli -- pre-read document.yeli.html
npm run yeli -- inspect document.yeli.html
npm run yeli -- get document.yeli.html
npm run yeli -- extract document.yeli.html extracted.md
npm run yeli -- import notes.md --template trusted-release.yeli.html --output notes.yeli.html
npm run yeli -- replace document.yeli.html replacement.md --expected-revision 7
npm run yeli -- patch document.yeli.html --start-line 4 --delete-count 1 --insert-file line.md --expected-hash <sha256>
npm run yeli -- metadata document.yeli.html --key title --value-json '"Title"' --expected-revision 8
npm run yeli -- refresh document.yeli.html --expected-revision 8
npm run yeli -- validate document.yeli.html
npm run yeli -- render document.yeli.html
npm run yeli -- export-markdown document.yeli.html --output document.md
npm run yeli -- export-static document.yeli.html --output document.html
```

Import accepts UTF-8 Markdown and a separately trusted Yeli release shell,
normalizes line endings to LF, creates a new revision-`1` canonical payload, and
requires a new output path. It does not treat Markdown as a shell, migrate shell
bytes from an untrusted document, or overwrite either input. The helper can
validate template structure but trust in its executable HTML must come from the
caller/out-of-band release process.

Mutations require an expected revision or actual source hash. On POSIX, the
helper builds a same-directory mode-`0600` temporary result, flushes and closes
it, preserves original input permissions for in-place replacement, and compares
the current bytes with the originally read bytes immediately before rename.
`INPUT_CHANGED` leaves an externally changed input untouched. This is
best-effort conflict detection: portable Node APIs retain a narrow
check-to-rename race rather than atomic compare-and-swap. New import,
mutation-output, extract, and export files use the same atomic no-clobber
publication primitive, remain mode `0600` by default on POSIX, and return
`OUTPUT_EXISTS` if the destination exists. Receipts include the new revision/source hash, exact
changed-line range, marker count, and separate before/after SHA-256 values for
immutable prefix and suffix. Both pairs must match; one aggregate file hash is
not shell-integrity proof.

The repository Agent API is version `1`; commands accept an optional exact
`--api-version 1` and reject every other or malformed value before mutation.
JSON results carry `apiVersion`. Structured failures use
`{ apiVersion, ok: false, error: { code, message, findings? } }` on stderr and
leave the input file unchanged. `extract` alone emits raw Markdown.
Mutation receipts include a nested postcondition document snapshot. Direct
render/export envelopes include revision, current source hash, and findings.
Any distinct extract/export/mutation output path must be new; the helper returns
`OUTPUT_EXISTS` instead of choosing destructive overwrite on an Agent's behalf.

`pre-read` is the bounded, low-token path: it returns the recomputed manifest,
freshness status, revision, and findings without returning `markdown.lines`.
`inspect` additionally returns the canonical line encoding, while `extract`
materializes raw Markdown bytes.

`refresh` rebuilds derived manifest data without changing authored Markdown or
incrementing revision. It marks no stale Agent summary current. Release-shell
verification uses the Node helper's pinned Ed25519 keys, fixed signed-byte
domain, canonical manifest, and versioned projection over every byte except the
unique payload/static-preview bodies. Human-confirmed manual migration accepts
only an exact signed clean release and writes a new validated copy. Neither
operation is delegated to payload data or browser code.

`metadata` uses the same concrete-range frontmatter patcher as the UI. `render`
and static export use the same restricted Markdown renderer and DOMPurify
allowlist in a Node-provided isolated DOM, without executing the artifact or
loading document resources. Static export and Markdown export derive from
recomputed current manifest data.

No public `window.yeli` facade is present in v1 because U6 found no concrete
browser-automation consumer whose value justified its security and parity cost.
File-format Agent interoperability is provided by the JSON Schema, embedded
preamble, and repository helper. Browser permissions, destructive overwrite,
remote-resource approval, and recovery deletion remain human-only. Shell
migration additionally requires an explicit human confirmation token and an
out-of-band signed manifest. See `docs/agents.md` for the complete operation and
self-audit contract.
