# Yeli release runbook

Default releases exclude Advanced View and CodeMirror; the separately composed
official enhanced profile owns them and requires its own evidence. See
[development](development.md) for build commands and [architecture](architecture.md)
for the trusted module boundary.

On 2026-10-23 the owner deferred the 100,000-byte goal introduced on 2026-09-09
and directed work to improve compression. This supersedes the earlier size-only
release blocker for this phase. `validate:single` reports complete disk bytes,
the deferred target and decoded runtime/CSS statistics, while continuing to
reject format, carrier, source, policy and integrity errors. To explicitly
check the historical goal, add `--enforce-size-target`; this is not the default
CI acceptance criterion. Document-data, decoded-source and transport budgets
still apply, and other release evidence is not waived.

Count the complete self-extracting HTML, including encoded carriers, loader,
payload, notices and examples. HTTP gzip/Brotli is a separate transfer metric.
See `docs/compression.md` for same-source baselines, chosen compression
parameters, startup costs and compatibility limits.

Market demand is unvalidated, so public V1/stable
positioning is prohibited. No public release may be tagged until a production
public key is pinned and every remaining manual evidence row in this document is
complete.

## Trust model

An editable `.yeli.html` is active HTML. The file cannot prove that its own executable shell is honest. A recipient obtains the release manifest from a trusted out-of-band channel and runs the repository helper without opening the artifact.

The selected publication channel is an attachment on the project's official GitHub Release page over HTTPS, accompanied by the exact `.yeli.html`, canonical JSON manifest, SHA-256, release notes, and source tag. The canonical source repository is `https://github.com/whitesmell/yeli`; its Release channel is `https://github.com/whitesmell/yeli/releases`. No signed editor release is announced. The remaining gates below still apply.

The helper pins raw 32-byte Ed25519 public keys in `src/integrity/trusted-keys.ts`. A manifest can name a `keyId`, but cannot provide a key, select an algorithm, select an encoding, or alter the signed-byte domain. Version 1 always signs:

```text
YELI_RELEASE_MANIFEST_V1\n
<canonical unsigned manifest JSON ending in LF>
```

The signed manifest carries the exact clean release artifact hash and the version 1 shell-projection hash. Projection replaces only the unique payload body and static-preview body with fixed ASCII tokens, then hashes every remaining UTF-8 byte without normalization. Payload or preview edits keep shell verification valid; any other byte change fails.

## Offline key ceremony

Perform this on an offline machine. Never put a private key, passphrase, real document, or unredacted terminal transcript in the repository, CI, logs, or release assets.

1. Set a strong passphrase through the process environment without shell history or command-line arguments.
2. Run `npm run keygen:release -- --key-id <id> --private-key <absolute path outside this repository> --public-key <review path>`.
3. Verify the private output is encrypted PKCS#8, mode `0600`, backed up offline, and outside every synchronized/project directory.
4. Review the public record through a second channel. Add only its raw Base64 public key and `keyId` to `src/integrity/trusted-keys.ts` through code review.
5. Delete the temporary public review file if it is not the selected publication record. Never delete the only private-key backup as part of repository automation.

Signing refuses an unencrypted key, an in-repository private-key path, an unpinned key identifier, a private/public mismatch, a noncanonical timestamp, or an existing output path.

## Build and sign

The project uses the MIT License in root `LICENSE`. Keep its complete text in
every generated editor shell and in CLI and website distributions. Retain
applicable third-party notices as described in `docs/third-party-notices.md`.
License selection does not authorize npm publication or waive release gates.

Single-file builds apply Zopfli raw DEFLATE and Base86 by default. The encoder
is pinned as a development dependency and must never silently fall back to zlib.
Each build independently inflates both streams and verifies the original
runtime/CSS bytes. The selected profile uses 15 iterations and unlimited block
splitting (`blocksplittingmax: 0`). Invalid profile values fail rather than
silently clamping. `YELI_COMPRESS=0` produces an uncompressed comparison build.
An already compressed input is validated and retained byte-for-byte.

From a clean tagged checkout under the pinned Node 24 runtime:

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run build:single:all
npm test
npm run test:integration
npm run test:security
npm run test:agent
npm run test:fidelity
npm run test:wysiwyg
npm run test:browser
npm run test:quality
npm run test:advanced
npm run build:single:all
npm run validate:single
npm run validate:single -- --locale en
YELI_EMPTY_RELEASE=1 npm run build:single
npm run validate:single -- --empty
```

To compare startup on an already-built exact artifact:

```sh
node scripts/measure-artifact.mjs dist/html/starter.zh-CN.yeli.html 7 chromium,firefox
```

The script records artifact bytes/hash, browser versions, every fresh-page
sample, Base86/decompression timings, workspace-mount time, page errors, and
attempted HTTP(S) requests. It uses one offline context per engine and includes
the first run. Responses are associated with their own decompressor so concurrent
CSS/runtime timings remain attributable. Instrumentation adds overhead; report medians and raw samples,
and compare the same runtime/CSS bytes. Browser `load` alone does not mean the
asynchronously decompressed workspace is ready.

To reproduce the compression-parameter comparison without changing a build:

```sh
npm run benchmark:compression -- dist/html/starter.zh-CN.yeli.html output/compression-profiles.json
```

Record the exact artifact hash returned for each artifact by `validate:single`.
The source repository does not contain `dist/`; it is local and CI evidence
only. Upload each validated `.yeli.html` file, its own manifest, the SHA-256
checksum, and the release notes as separate assets on the same signed source
tag. Do not upload the directory itself or reuse one manifest across
languages.

The official bilingual release assets are:

| Artifact                   | Variant                  |
| -------------------------- | ------------------------ |
| `starter.en.yeli.html`     | English starter          |
| `starter.zh-CN.yeli.html`  | Chinese starter          |
| `empty.yeli.html`          | Empty starter            |
| `advanced.en.yeli.html`    | Optional English profile |
| `advanced.zh-CN.yeli.html` | Optional Chinese profile |
| `advanced-empty.yeli.html` | Optional empty profile   |

The default public release contains both starter languages and the empty
artifact. Advanced artifacts are uploaded only when their separate evidence
and size gates pass. On the offline signing machine, set the passphrase and
run once per artifact:

```sh
npm run sign:release -- \
  --artifact dist/html/starter.en.yeli.html \
  --private-key /absolute/offline/path/yeli-release.pem \
  --key-id <pinned-key-id> \
  --release-version <version> \
  --created-at <canonical-UTC-ISO-time> \
  --output <new-manifest-path>
```

Repeat with each additional artifact and a distinct manifest output path. The
manifest records the input basename as `artifactName`; never rename the file
after signing. Copy only each artifact and its matching manifest to the
publication machine. Verify them again before upload. CI never receives the
signing passphrase or private key.

## Verify a received file

Obtain the manifest separately from the trusted release channel, then run:

```sh
npm run yeli -- verify-shell received.yeli.html --manifest Yeli.release.json
```

The structured result distinguishes verified shell, exact clean release artifact, unknown key, invalid/noncanonical/unsupported manifest, invalid signature, invalid shell projection, hash mismatch, and unavailable manifest. Before masking the mutable static-preview bytes, verification requires that region to match Yeli's narrow inert generated grammar; non-generated active markup fails closed. A verified edited document with a stale but generated preview normally reports `shellVerified: true` and `exactReleaseArtifact: false`.

Verification does not make an untrusted document's content safe to publish. The runtime still treats payload data as untrusted and static export remains the untrusted-publication boundary.

## Rollback-safe manual migration

Manual migration is a human-only action. It requires the exact signed clean release artifact, the out-of-band manifest, a source Yeli file, an unused destination, and an explicit confirmation token:

```sh
npm run yeli -- migrate-shell old.yeli.html \
  --release clean-new-release.yeli.html \
  --manifest Yeli.release.json \
  --output migrated-new-copy.yeli.html \
  --confirm-manual-migration yes
```

The helper verifies that the clean shell is both shell-valid and byte-identical to the signed release, parses the old payload without executing either file, regenerates current derived data/static preview in the clean shell, validates the result, and atomically publishes a new mode-`0600` file without clobbering. The source and clean release files remain untouched.

## Rotation and incident response

- Add a new public key through an audited helper release while retaining the old key for an overlap period. A manifest cannot authorize a new key.
- Publish the new key record and helper source through the official release channel before signing with it.
- Revoke a compromised key by removing it from the trusted registry in a reviewed helper release and publishing an incident notice out of band. Previously distributed helpers cannot be remotely changed; recipients must update their verification checkout.
- Never add browser update polling, runtime replacement, remote key fetching, or a self-verification badge. V1 exposes no update button.

## Automated candidate evidence

Run the commands above for the exact candidate under review and attach their
outputs to the release record. Do not reuse hashes or browser counts from an
earlier AIMD-named artifact: a repository check is not a certification of the
current Yeli build. CI on a committed clean checkout is the release authority.

Automated checks do not establish branded-Safari, physical-device,
assistive-technology, real-Agent, or transport compatibility. Those remain
manual gates below.

## Manual release gates

These records must reference the final artifact hash. A blank or pending row blocks a public tag.

| Gate                                   | Required evidence                                              | Status                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Production public key                  | key id, reviewed public record, offline custody owner          | Pending                                                                                                          |
| Canonical GitHub release channel       | repository URL, release URL, permissions owner                 | Pending                                                                                                          |
| WebKit                                 | exact production flow on supported desktop/mobile runner       | Pending for the current Yeli artifact                                                                            |
| Physical mobile and real IME/dead keys | device/OS/browser/input method, dated result                   | Pending                                                                                                          |
| Assistive technology                   | browser + screen reader/key-only result                        | Pending                                                                                                          |
| Editable attachment                    | named path or explicit static-export UI/documentation fallback | Static-export fallback documented; no attachment profile claimed                                                 |
| Static host/download                   | named HTTPS host, no-network/static trust result               | Pending                                                                                                          |
| Five-person first use                  | at least 4/5 participants complete the defined first-use task  | Pending                                                                                                          |
| Target-author demand note              | five observed workflows or a note that demand is unvalidated   | Demand is unvalidated; no demand claim                                                                           |
| Real three-Agent evaluation            | frozen AE13 threshold and archived receipts                    | Pending; no-credential packet export and independent scorer are ready, but no authorized external run is claimed |
