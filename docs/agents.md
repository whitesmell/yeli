# Yeli Agent Guide (API v1)

This is the normative guide for filesystem Agents working on `.yeli.html`
documents. API version 1 describes the operation contract,
not a stable product release. It is Agent-friendly at the file boundary and does not contain
an AI editor, model API, prompt workflow, credential, or chat surface.

## Start safely

Treat the received HTML as active code from a trusted sender, but never execute
it just to inspect or edit the document. The runtime shell is release code and
the unique `#yeli-doc[type="application/yeli+json"]` block is untrusted pure
data. Markdown, including YAML frontmatter, is the only authored authority.

Use the independently installed `yeli` CLI with Node.js `>=24.15.0 <25`.
Installation and the generic Skill are covered in the quick start shipped
beside this guide. `yeli --help` reports its absolute location and API version.
Within a source checkout, substitute `npm run --silent yeli --` for `yeli`
in document commands, using the pinned project Node version. Both paths share
the same operation implementation. The CLI does not bundle or download a
browser template, install a model, or configure a platform plugin.

```sh
yeli pre-read document.yeli.html
yeli get document.yeli.html
yeli extract document.yeli.html extracted.md
yeli import notes.md --template trusted-release.yeli.html \
  --output notes.yeli.html
```

`pre-read` is the bounded path. It returns Agent API version `1`, format and
payload versions, document identity/revision, the recomputed manifest,
freshness, findings, ranges, and separate immutable prefix/suffix hashes. It
does not return Markdown or the payload. `inspect` and `get` return an isolated
payload snapshot plus materialized Markdown. `extract` emits Markdown bytes to
stdout or the optional positional output path.

The persisted manifest is current only when its complete deterministic value
and `sourceHash` match canonical Markdown. `freshness.manifest` and
`freshness.agentSummary` report this independently. Static preview is shell
derived: a payload-only Agent mutation normally makes it stale until the next
human/runtime full save. Never use stale derived data as document truth.

`import` accepts UTF-8 Markdown, normalizes CRLF or lone CR to LF once, assigns
a new document identity (or the explicit `--doc-id`), starts at revision `1`,
and creates a new `.yeli.html` through the same canonical payload/full-save path
as the UI. `--template` must be a trusted release shell obtained out of band;
the helper validates its Yeli structure but cannot decide whether executable
HTML is trustworthy. Markdown is never interpreted as a shell, and neither the
Markdown input nor template is overwritten. The required `--output` path must
not exist. Success returns the versioned pre-read snapshot plus output bytes,
normalization, revision/hash, and trusted-template splice receipt; the complete
artifact is written only to the new file rather than echoed into JSON.

## Mutate with an expectation

Every mutation requires `--expected-revision` or `--expected-hash`. Prefer the
hash from the same `pre-read` used to plan the change. A stale expectation fails
without writing any bytes.

```sh
yeli replace document.yeli.html replacement.md \
  --expected-revision 7 \
  --updated-by "codex/session-123" \
  --change-summary "Updated the installation steps"

yeli patch document.yeli.html \
  --start-line 4 --delete-count 1 --insert-file replacement-lines.md \
  --expected-hash 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

yeli metadata document.yeli.html \
  --key title --value-json '"Portable notes"' --expected-revision 8

yeli refresh document.yeli.html --expected-revision 9
```

`replace` normalizes CRLF/CR to LF and increments revision. `patch` addresses
one-based canonical Markdown lines; the insertion file is also normalized to
LF. `metadata` accepts only `title`, `description`, `lang`, `tags`, `authors`,
or `aliases`. The first three take a JSON string and the list keys take a JSON
string array. The shared range patcher preserves untouched comments, quoting,
ordering, and unknown safe keys; ambiguous YAML fails closed.

For `replace`, `patch`, or `metadata`, an external Agent may provide
`--updated-by` and `--change-summary`. The two options are required together.
They are self-reported provenance, not authenticated identity: the helper stores
them in a fresh `agentSummary`, stamps `updatedAt`, and binds the summary to the
resulting `sourceHash`. Yeli history displays this modifier and summary when the
fresh file is opened; direct/manual edits without the pair remain unattributed.

`refresh` rebuilds the manifest without changing Markdown or incrementing the
revision. It does not rewrite an external Agent summary or shell static
preview. On POSIX, all writes first create a same-directory mode-`0600`
temporary file, flush and close it, and clean it on failure. In-place mutations validate the
temporary artifact, preserve the input file's permission bits, then compare the
current input bytes with the exact bytes originally read. A mismatch returns
`INPUT_CHANGED` without touching the input. The final rename is atomic, although
portable Node filesystem APIs leave a narrow check-to-rename race that callers
must treat as best-effort conflict protection rather than filesystem CAS.

`--output new.yeli.html` publishes the validated result through an atomic
same-directory no-clobber link. Import, extract, and export use the same
primitive. On POSIX, new files remain mode `0600` by default; callers can
deliberately broaden them after inspection. Every new-output path must not exist;
the helper returns `OUTPUT_EXISTS` instead of making a destructive overwrite
choice. Mutating the input document itself remains the explicit,
expectation-guarded atomic replacement.

Successful mutation output includes:

- `revision`, `sourceHash`, exact changed line and character ranges;
- one immutable `yeli.document.changed` event for the logical mutation;
- one payload marker count;
- separate before/after SHA-256 hashes for the immutable prefix and suffix;
- `shell.stable`, which must be `true`.

The nested postcondition `document` repeats the current freshness, findings,
ranges, revision/hash, manifest, and immutable shell hashes after the mutation.
Render and export envelopes likewise carry API version, revision, source hash,
and findings; `extract` stays raw for pipe compatibility.

Character and payload ranges are zero-based JavaScript string offsets; line
ranges are one-based. Benchmark `touchedByteRegions` are zero-based UTF-8 byte
offsets. Never replace the whole HTML file from a live DOM or treat one aggregate
file hash as shell proof.

`changedCharacters.before` and `.after` are half-open spans in the respective
Markdown versions. `changedLines.startLine` is the one-based line containing the
start of the before span; `deleteCount` and `insertedCount` count only the
materialized lines covered by each non-empty span. A zero-width side counts as
zero, and a trailing newline belongs to the preceding covered line. Therefore a
new metadata key or new frontmatter reports inserted lines without claiming the
unchanged delimiter or body line, including when the source has no final newline.

## Validate, render, and export

```sh
yeli validate document.yeli.html
yeli render document.yeli.html
yeli export-markdown document.yeli.html --output document.md
yeli export-static document.yeli.html --output document.html
yeli verify-shell document.yeli.html --manifest Yeli.release.json
```

Validation applies file, payload, schema, line, nesting, asset, URL, HTML,
anchor, and freshness checks before expensive work. Findings contain `code`,
`message`, `path`, and `severity`. `render` returns sanitized HTML through the
same Markdown/DOMPurify boundary as the product. Node supplies an isolated DOM
only for sanitization; no script or document-directed network request runs.
Static export is script-free, has a no-network CSP, embeds only validated assets,
and derives from current Markdown rather than a stale persisted manifest.

All JSON commands report `apiVersion: 1`. Unsupported versions, malformed
numeric arguments, non-UTF-8 input, invalid documents/templates/ranges/YAML,
concurrent input changes, and stale expectations return a structured error on
stderr and exit nonzero:

```json
{
  "apiVersion": 1,
  "ok": false,
  "error": { "code": "REVISION_MISMATCH", "message": "..." }
}
```

`extract` is intentionally raw Markdown rather than a JSON envelope.

`verify-shell` never executes the artifact. It accepts only a separately
obtained canonical release manifest and only keys pinned in the helper. A
manifest cannot select its algorithm, key encoding, signed-byte domain, or
public key. Payload/static-preview changes may leave shell verification valid,
while any other byte mutation fails. The result separately reports whether the
file is the exact clean release artifact.

Rollback-safe shell migration is deliberately human-gated:

```sh
yeli migrate-shell old.yeli.html \
  --release clean-release.yeli.html \
  --manifest Yeli.release.json \
  --output migrated-copy.yeli.html \
  --confirm-manual-migration yes
```

The clean release must match both the signed shell and exact signed artifact
hash. Migration preserves canonical payload data, refreshes derived data/static
preview, writes only a new file, and leaves both inputs untouched. A production
release remains unverifiable until its public key is audited and added to
`src/integrity/trusted-keys.ts`.

## Boundaries Agents cannot cross

The helper exposes no browser file permission, confirmed destructive overwrite,
remote-resource approval, recovery/history deletion, or retained-handle
reconnect. Manual shell migration exists only behind explicit human
confirmation and a separately obtained signed manifest; payload data cannot
authorize it.

No `window.yeli` facade ships in v1. U6 found no concrete browser-automation
consumer that justified the added attack surface and parity cost. Filesystem
interoperability remains complete through this helper and the JSON Schema.

## Pre-finish self-audit

Before returning an edited artifact:

1. Run `pre-read` and confirm the intended revision/hash and freshness state.
2. Use one bounded operation with an expected revision or hash.
3. Require `shell.stable: true`, marker count `1`, and equal prefix/suffix hash
   pairs.
4. Run `validate`; resolve every error and explain relevant warnings.
5. Extract Markdown and verify the intended narrow range plus untouched context.
6. If publication is requested, generate and inspect a static export; do not
   send active Yeli to an untrusted recipient as though it were safe static HTML.

The in-file `YELI_AGENT v1` preamble is sufficient for a bounded payload edit.
This guide governs advanced metadata, rendering, exports, receipts, and error
handling.
