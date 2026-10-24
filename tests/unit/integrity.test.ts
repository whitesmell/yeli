import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createDocumentPayload } from "../../src/document/model.ts";
import {
  createReleaseManifest,
  serializeReleaseManifest,
  signReleaseManifest,
} from "../../src/integrity/manifest.ts";
import {
  projectShell,
  SHELL_PROJECTION_VERSION,
} from "../../src/integrity/shell-projection.ts";
import {
  exportRawEd25519PublicKey,
  verifyArtifactShell,
} from "../../src/integrity/verify.ts";
import {
  YELI_AGENT_PREAMBLE,
  serializePayloadBlock,
  splicePayload,
  STATIC_PREVIEW_CLOSE,
  STATIC_PREVIEW_OPEN,
} from "../../src/format/serialize.ts";
import { buildStaticPreviewHtml } from "../../src/format/static-shell-preview.ts";

async function fixtureArtifact(
  source = "# Integrity fixture\n",
): Promise<string> {
  const payload = await createDocumentPayload(source, {
    docId: "integrity-fixture",
    revision: 1,
    subtle: null,
  });
  return `<!doctype html>
<html><head><meta name="yeli:format" content="yeli/document"></head><body>
${YELI_AGENT_PREAMBLE}
${serializePayloadBlock(payload)}
<main>${STATIC_PREVIEW_OPEN}${buildStaticPreviewHtml(payload, source)}${STATIC_PREVIEW_CLOSE}</main>
<script type="module">globalThis.__yeliFixture = true;</script>
</body></html>`;
}

describe("versioned shell integrity", () => {
  it("projects payload and static preview to fixed tokens without normalizing shell bytes", async () => {
    const artifact = await fixtureArtifact();
    const changedPayload = await createDocumentPayload("# Changed payload\n", {
      docId: "integrity-fixture",
      revision: 2,
      subtle: null,
    });
    const payloadEdit = splicePayload(artifact, changedPayload).artifact;
    const previewEdit = payloadEdit.replace(
      "<p>Integrity fixture</p></header>",
      "<p>Changed but still inert</p></header>",
    );

    const original = projectShell(artifact);
    const edited = projectShell(previewEdit);
    expect(original.version).toBe(SHELL_PROJECTION_VERSION);
    expect(edited.hash).toBe(original.hash);
    expect(edited.projected).toBe(original.projected);

    const runtimeEdit = previewEdit.replace(
      "globalThis.__yeliFixture = true",
      "globalThis.__yeliFixture = false",
    );
    expect(projectShell(runtimeEdit).hash).not.toBe(original.hash);
  });

  it("rejects active markup inside the masked static preview", async () => {
    const artifact = await fixtureArtifact();
    const hostilePreview = artifact.replace(
      "<p>Integrity fixture</p></header>",
      '<p>Integrity fixture</p><img src="data:,x" onerror="alert(1)"></header>',
    );

    expect(() => projectShell(hostilePreview)).toThrowError(
      "Static preview does not match the inert generated grammar",
    );
  });

  it("verifies only canonical manifests against helper-pinned raw Ed25519 keys", async () => {
    const artifact = await fixtureArtifact();
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const keyId = "test-release-2026";
    const unsigned = createReleaseManifest(artifact, {
      createdAt: "2026-08-31T12:00:00.000Z",
      keyId,
      releaseVersion: "0.1.0-test.1",
    });
    const signed = signReleaseManifest(unsigned, privateKey);
    const manifestText = serializeReleaseManifest(signed);
    const trustedKeys = {
      [keyId]: exportRawEd25519PublicKey(publicKey),
    };

    expect(
      verifyArtifactShell(artifact, manifestText, trustedKeys),
    ).toMatchObject({
      exactReleaseArtifact: true,
      ok: true,
      shellVerified: true,
      status: "verified",
    });

    const editedPayload = await createDocumentPayload("# User edit\n", {
      docId: "integrity-fixture",
      revision: 2,
      subtle: null,
    });
    const received = splicePayload(artifact, editedPayload).artifact;
    expect(
      verifyArtifactShell(received, manifestText, trustedKeys),
    ).toMatchObject({
      exactReleaseArtifact: false,
      ok: true,
      shellVerified: true,
      status: "verified",
    });

    expect(
      verifyArtifactShell(artifact, `${manifestText} `, trustedKeys),
    ).toMatchObject({ ok: false, status: "manifest-not-canonical" });
    expect(verifyArtifactShell(artifact, manifestText, {})).toMatchObject({
      ok: false,
      status: "unknown-key",
    });

    const invalidSignature = manifestText.replace(
      /"signature": "([A-Za-z0-9+/])/u,
      (_match, character: string) =>
        `"signature": "${character === "A" ? "B" : "A"}`,
    );
    expect(
      verifyArtifactShell(artifact, invalidSignature, trustedKeys),
    ).toMatchObject({ ok: false, status: "invalid-signature" });

    const parsedManifest = JSON.parse(manifestText) as { signature: string };
    const finalDataIndex = parsedManifest.signature.length - 3;
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const canonicalIndex = alphabet.indexOf(
      parsedManifest.signature[finalDataIndex]!,
    );
    parsedManifest.signature = `${parsedManifest.signature.slice(0, finalDataIndex)}${alphabet[canonicalIndex + 1]}==`;
    expect(
      verifyArtifactShell(
        artifact,
        `${JSON.stringify(parsedManifest, null, 2)}\n`,
        trustedKeys,
      ),
    ).toMatchObject({ ok: false, status: "manifest-invalid" });

    const runtimeEdit = artifact.replace(
      "globalThis.__yeliFixture = true",
      "globalThis.__yeliFixture = false",
    );
    expect(
      verifyArtifactShell(runtimeEdit, manifestText, trustedKeys),
    ).toMatchObject({ ok: false, status: "shell-hash-mismatch" });

    const invalidProjection = artifact.replace(STATIC_PREVIEW_CLOSE, "");
    expect(
      verifyArtifactShell(invalidProjection, manifestText, trustedKeys),
    ).toMatchObject({ ok: false, status: "shell-projection-invalid" });
  });
});
