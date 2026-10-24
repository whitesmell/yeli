# Yeli Single-file Compression

Measured 2026-10-23 on macOS 14 (Darwin 23.5.0, arm64) with Node 24.19.0.
This records one exact local candidate; it is not a release certification or a
claim about other hardware, storage, or browser profiles.

## Current compression profile and scope

The owner deferred the earlier 100 KB goal on 2026-10-23 and asked to improve
the compression pipeline. It is reported as deferred, not met. Default
`validate:single` continues to check carrier decoding, runtime/CSS source,
payload, boundaries and CSP; `--enforce-size-target` optionally checks the
historical target. Other safety, transport and release evidence still applies.

The selected Zopfli profile is 15 iterations with `blocksplittingmax: 0`
(unlimited blocks), encoded as Base86. No runtime dependencies or authored
content were removed. Runtime/CSS source hashes match the initial baseline.
The loader now starts the two inflations concurrently and checks decoded byte
lengths and fatal UTF-8 decoding before inserting styles or importing code.
The standalone compression script shares the build's final HTML
canonicalization, so the same uncompressed source and profile reproduce the
same Chinese artifact hash.

| Current artifact | Complete bytes | SHA-256                                                            |
| ---------------- | -------------: | ------------------------------------------------------------------ |
| Chinese starter  |        300,872 | `fa6fd320d86bda8d469f89fc18d937b473ca2124572269d26c1addd45d8b78b9` |
| English starter  |        300,151 | `2c79a84acda4a1265e964c6cba4708682da061062d6c7f8cf5e0d6ae88a8e37e` |
| Empty            |        292,766 | `819b42d38b2d6d89057aa143284af5050d1e62ef4c966556a548e6a5005729a3` |

The Chinese/English files each shrink another 871 bytes; the empty file saves
476 bytes. The Chinese runtime stream is 217,886 bytes, Base86 is 272,358
characters, and CSS remains 12,557 packed bytes / 15,697 characters. The
compressed carrier improvement is 1,149 bytes. Loader validation, concurrent
startup and clearer failure reporting consume part of that gain, so complete
files shrink by the measured 871/476 bytes. Compared with the same-source
794,705-byte uncompressed file, the current Chinese artifact is 62.1% smaller.

### Parameter measurement

Six profiles were measured serially on identical source. Build times cover
compression only, not TypeScript/Vite startup. Every candidate was independently
inflated and Base86 round-tripped. Results are not monotonic with iteration
count, so the choice follows measured encoded bytes rather than the largest
iteration number.

| Iterations | Maximum blocks | Runtime + CSS carrier bytes | Approx. compression time |
| ---------: | -------------: | --------------------------: | -----------------------: |
|          5 |             15 |                     289,342 |                    1.1 s |
|         15 |             15 |                     289,204 |                    1.9 s |
|         30 |             15 |                     289,332 |                    3.3 s |
|         60 |             15 |                     289,515 |                    6.0 s |
|     **15** |  **Unlimited** |                 **288,055** |                **3.1 s** |
|         30 |      Unlimited |                     288,046 |                    4.9 s |

Unlimited blocks at 30 iterations save only 9 further characters at about
1.8 seconds extra compression cost; 15 is the chosen balance.

### Controlled startup recheck

The initial compressed artifact and current artifact were each measured in
two orders, 9 fresh pages per browser per order (72 page starts total).
Ready means the workspace mounted; all samples had one stylesheet, zero
page errors and zero attempted HTTP(S) requests.

| Run order        | Chromium old ready | Chromium current ready | Firefox old ready | Firefox current ready |
| ---------------- | -----------------: | ---------------------: | ----------------: | --------------------: |
| Old then current |            92.0 ms |                85.6 ms |            223 ms |                209 ms |
| Current then old |            91.2 ms |                84.8 ms |            222 ms |                207 ms |

These are medians, not a cold machine or physical-device guarantee. The
measurement script maps each Response to its own decompressor so concurrent
inflations are attributed correctly. Timings include scheduling, allocation
and instrumentation; they are not isolated codec CPU times. Raw samples,
same-source hashes and profile results live under
`output/compression-followup-20261023/`. The repeatable comparison command is:

```sh
npm run benchmark:compression -- dist/html/starter.zh-CN.yeli.html output/compression-profiles.json
```

### Validation

Compressed inputs are decoded without executing them. Validation rejects
illegal symbols, overflowing 5-character groups, noncanonical encodings,
invalid DEFLATE, invalid UTF-8 and declared-length mismatches. Decoding is
bounded to 8 MiB runtime / 2 MiB CSS; these are trusted-shell inspection budgets,
not author-content limits. An already compressed input remains byte-identical
but is inspected and reports actual statistics instead of zeroes.

The browser reports damaged or unsupported compressed startup explicitly and
keeps the original plaintext payload recoverable. Desktop Chromium/Firefox
passed 86 regression tests, and Chromium's mobile profile passed 8 focused
tests, including both damage cases. Neither a content hash nor these checks
establishes the safety of an attacker-replaced active shell.

## Initial baseline

The default release keeps the document payload plaintext and compresses only
trusted runtime code and CSS. Zopfli raw DEFLATE (`numiterations: 15`) produces
the packed streams; a fixed HTML-safe Base86 alphabet maps four bytes to five
characters. The loader uses native `DecompressionStream("deflate-raw")` and
imports the recovered module from a local Blob URL.

| Artifact                  | Complete bytes | SHA-256                                                            |      gzip -9 |   Brotli -11 |
| ------------------------- | -------------: | ------------------------------------------------------------------ | -----------: | -----------: |
| `starter.zh-CN.yeli.html` |        301,743 | `6d4febe01ec71a311788c6af88d71b99625a701da993e208c8ceb7b945b850f9` |      241,120 |      239,238 |
| `starter.en.yeli.html`    |        301,022 | `700bf2a64bc863a5d6d7d16d37227a3478d279548ca697f5f5827940222aeb38` |      240,308 |      238,893 |
| `empty.yeli.html`         |        293,242 | `57137582e365cda56e609ab03f15a47404712ffe2d8d3c1b0747573ba5a4e6fc` | not recorded | not recorded |

These initial artifacts exceeded the then-active 100,000-byte target, which the
owner subsequently deferred. HTTP gzip/Brotli sizes remain transfer metrics,
separate from complete disk bytes.

The same-source Chinese uncompressed build is 794,705 bytes. Compression
removes 492,962 bytes, or **62.0%**, from the complete file.

### Chinese starter composition

| Region                     |   Bytes | Share |
| -------------------------- | ------: | ----: |
| Runtime carrier            | 273,578 | 90.7% |
| Stylesheet carrier         |  15,772 |  5.2% |
| Payload and Agent preamble |   5,451 |  1.8% |
| Static preview             |   2,167 |  0.7% |
| Loader                     |   2,584 |  0.9% |
| Head / remaining shell     |   2,191 |  0.7% |

The runtime source is 719,847 bytes. Zopfli packs it to 218,805 bytes; Base86
expands that to a 273,507-character carrier, plus its tag. The CSS source is
64,965 bytes, Zopfli packs it to 12,557, and Base86 produces 15,697 characters.
For the runtime, raw zlib level 9 is 229,197 bytes and Base64 would be 291,740
bytes: Zopfli saves 10,392 packed bytes, while Base86 saves 18,233 encoded bytes
against Base64. Both streams inflate to byte-identical runtime/CSS source.

## Initial startup measurement

`scripts/measure-artifact.mjs` creates fresh pages in one offline context per
browser. Ready means `.workspace-shell` mounted. Each sample instruments the
native decompressor; medians include the first-page run and instrumentation
overhead. Seven samples per engine, Chromium 151.0.7922.34 and Firefox 153.0:

| Build           | Chromium load median | Chromium ready median | Firefox load median | Firefox ready median |
| --------------- | -------------------: | --------------------: | ------------------: | -------------------: |
| Uncompressed    |                76 ms |                100 ms |              177 ms |               253 ms |
| Zopfli + Base86 |                11 ms |                103 ms |              104 ms |               228 ms |

The compressed Chromium shell reaches `load` much earlier but then spends
roughly 5–6 ms per carrier decoding Base86 and 10 ms inflating the runtime
in steady-state samples; module execution and mounting dominate. Firefox's
compressed result was 25 ms faster to ready in this sample series, but its
variance is large and this is not a universal speed claim. Compare same-byte
runtime behavior before drawing engine conclusions.

The raw measurements are under `output/compression-20261023/` in this local
workspace. They include every page sample, errors, CSS-sheet counts, and
HTTP(S) request counts. All Chromium/Firefox compressed samples had one
stylesheet and zero attempted remote requests.

## Bento comparison

The comparison target is Bento's actual shipped
`https://bento.page/releases/slides/Bento_Slides.bento.html`, not the marketing
homepage. The inspected release is 713,636 bytes (SHA-256
`c7da70eaa8d3f457b2458f1685769bf2c488724ac075954f216c70c60f310af0`), version
1.2.9. Its decoded runtime and CSS are 1,533,552 and 109,492 bytes.

The current package manifest declares three runtime dependencies:

- `moveable` 0.53.0 for drag, resize, and rotate controls.
- `reveal.js` 5.2.1 for presentation mode.
- `selecto` 1.26.3 for marquee selection.

Moveable's resolved dependency graph also contains React adapter packages such
as `react-moveable`, but the shipped Bento application is direct DOM code and
contains no React application runtime. The inflated bundle has no Markdown
editor/parser or YAML parser. A Temml-like TeX-to-MathML engine is present in
the bundle, but Temml is not declared in the current package manifest. Fraunces
and Instrument Sans are optional embedded document assets, not base-shell
libraries.

Yeli's default release contains none of Moveable, Reveal.js, Selecto, or Temml.
The size difference therefore cannot be explained by Bento shipping fewer
application libraries in every category. The dominant Yeli cost remains its
own runtime and the dependencies used by its Markdown editor surface.

## Compatibility and failure behavior

- Chromium and Firefox desktop open the exact artifact offline, save a copy,
  reopen it offline, retain both carriers and the original shell projection,
  apply CSS, and make zero HTTP(S) requests.
- A test that removes `DecompressionStream` gets an explicit startup alert.
  `#yeli-doc` remains plaintext and parseable, but no editable fallback is
  promised for that browser.
- The local macOS WebKit runner still fails before creating a page with
  `Page.overrideSetting: Unknown setting: PushAPIEnabled`. Current compressed
  WebKit/Safari behavior is therefore **unverified**, not passed. The pinned
  Linux WebKit runner must be rerun before claiming that cell.
- JavaScript-disabled viewing retains the bounded inert preview. Normal boot
  synchronously captures the pristine artifact and removes the preview before
  the first animation frame.

## Integrity rules

Build fails unless both Zopfli streams inflate to the exact original bytes.
Base86 rejects invalid symbols, whitespace, a trailing one-character group, and
forbidden HTML terminators. The content policy authorizes the two exact
executable bodies, allows Blob module loading only for the compressed profile,
and keeps `connect-src` and `unsafe-eval` blocked. The final shell must contain
exactly two fixed carriers and one loader. Saving must not serialize the
decompressed stylesheet or live application DOM.

## Deferred alternatives

The current scope improves the compression path without cutting features or
rewriting React/YAML to pursue the deferred size target. Larger architectural
changes require a separate decision and measured behavior coverage. Any future
codec or text-encoding change must account for loader size, startup cost,
HTML-safe boundaries, offline compatibility and saved-copy integrity.

React is not required by Bento's single-file platform: Bento's applications use
direct DOM code. Bento's resolved Moveable graph does include React-based
adapter packages, but no React application runtime is shipped. Yeli currently
relies on React for a substantial, tested UI surface, so this is an
implementation tradeoff rather than a file-format rule. The next decision
should follow a measured dependency/feature subtraction, not a framework
rewrite undertaken solely for compression.
