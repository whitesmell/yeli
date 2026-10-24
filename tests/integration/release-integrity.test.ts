import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { replaceDocument } from "../../src/agent/operations.ts";
import {
  createReleaseManifest,
  serializeReleaseManifest,
  signReleaseManifest,
} from "../../src/integrity/manifest.ts";
import {
  exportRawEd25519PublicKey,
  migrateArtifactToRelease,
  verifyArtifactShell,
} from "../../src/integrity/verify.ts";
import { parseYeliArtifact } from "../../src/format/parse.ts";
import { splicePayload } from "../../src/format/serialize.ts";

const artifactPath = resolve("dist/html/starter.zh-CN.yeli.html");

describe("manual verified-shell migration", () => {
  it("copies canonical document data into an exact signed clean shell and leaves both inputs unchanged", async () => {
    const cleanRelease = readFileSync(artifactPath, "utf8");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const keyId = "integration-release-key";
    const manifestText = serializeReleaseManifest(
      signReleaseManifest(
        createReleaseManifest(cleanRelease, {
          createdAt: "2026-08-31T12:00:00.000Z",
          keyId,
          releaseVersion: "0.1.0-integration.1",
        }),
        privateKey,
      ),
    );
    const trustedKeys = {
      [keyId]: exportRawEd25519PublicKey(publicKey),
    };
    const hostileSource =
      '---\ntitle: "迁移文档"\nx-future: 保留\n---\n# 用户内容\n\nLiteral </script> stays Markdown.\n';
    const edited = await replaceDocument(cleanRelease, hostileSource, {
      expectedRevision: 12,
    });
    const editedPayload = await parseYeliArtifact(edited.artifact);
    expect(editedPayload.ok).toBe(true);
    if (!editedPayload.ok) throw new Error("Expected edited fixture to parse");
    const payloadWithUnknown =
      editedPayload.payload as typeof editedPayload.payload & {
        futureSafe?: { retained: boolean };
      };
    payloadWithUnknown.futureSafe = { retained: true };
    const sourceArtifact = splicePayload(
      edited.artifact,
      payloadWithUnknown,
    ).artifact;

    const migrated = await migrateArtifactToRelease(
      sourceArtifact,
      cleanRelease,
      manifestText,
      trustedKeys,
    );

    expect(cleanRelease).toBe(readFileSync(artifactPath, "utf8"));
    expect(sourceArtifact).toContain("\\u003c/script>");
    expect(migrated.verification).toMatchObject({
      exactReleaseArtifact: false,
      ok: true,
      shellVerified: true,
      status: "verified",
    });
    const parsed = await parseYeliArtifact(migrated.artifact);
    expect(parsed.ok && parsed.markdown).toBe(hostileSource);
    expect(parsed.ok && parsed.payload.docId).toBe("yeli-starter");
    expect(parsed.ok && parsed.payload.revision).toBe(13);
    expect(
      parsed.ok &&
        (
          parsed.payload as typeof parsed.payload & {
            futureSafe?: { retained: boolean };
          }
        ).futureSafe,
    ).toEqual({ retained: true });
  });

  it("rejects a release candidate that is shell-valid but not the exact signed clean artifact", async () => {
    const cleanRelease = readFileSync(artifactPath, "utf8");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const keyId = "integration-release-key";
    const manifestText = serializeReleaseManifest(
      signReleaseManifest(
        createReleaseManifest(cleanRelease, {
          createdAt: "2026-08-31T12:00:00.000Z",
          keyId,
          releaseVersion: "0.1.0-integration.1",
        }),
        privateKey,
      ),
    );
    const trustedKeys = {
      [keyId]: exportRawEd25519PublicKey(publicKey),
    };
    const notClean = (
      await replaceDocument(cleanRelease, "# Not the release payload\n", {
        expectedRevision: 12,
      })
    ).artifact;

    expect(
      verifyArtifactShell(notClean, manifestText, trustedKeys),
    ).toMatchObject({
      exactReleaseArtifact: false,
      ok: true,
      shellVerified: true,
    });
    await expect(
      migrateArtifactToRelease(
        cleanRelease,
        notClean,
        manifestText,
        trustedKeys,
      ),
    ).rejects.toMatchObject({ code: "RELEASE_ARTIFACT_NOT_EXACT" });
  });

  it("reports manual migration verification failures with a stable structured code", () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-migration-cli-"));
    const manifestPath = join(directory, "invalid-manifest.json");
    const outputPath = join(directory, "migrated.yeli.html");
    writeFileSync(manifestPath, "{}\n", "utf8");

    const result = spawnSync(
      process.execPath,
      [
        resolve("scripts/yeli.ts"),
        "migrate-shell",
        artifactPath,
        "--release",
        artifactPath,
        "--manifest",
        manifestPath,
        "--output",
        outputPath,
        "--confirm-manual-migration",
        "yes",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: "RELEASE_SHELL_UNVERIFIED" },
      ok: false,
    });
  });

  it("rejects an invalid source artifact before publishing migration output", async () => {
    const cleanRelease = readFileSync(artifactPath, "utf8");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const keyId = "integration-release-key";
    const manifestText = serializeReleaseManifest(
      signReleaseManifest(
        createReleaseManifest(cleanRelease, {
          createdAt: "2026-08-31T12:00:00.000Z",
          keyId,
          releaseVersion: "0.1.0-integration.1",
        }),
        privateKey,
      ),
    );

    await expect(
      migrateArtifactToRelease(
        "<!doctype html><p>not YELI</p>",
        cleanRelease,
        manifestText,
        {
          [keyId]: exportRawEd25519PublicKey(publicKey),
        },
      ),
    ).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_INVALID" });
  });
});
