#!/usr/bin/env node

import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  RELEASE_ARTIFACT_NAMES,
  type ReleaseArtifactName,
  createReleaseManifest,
  serializeReleaseManifest,
  signReleaseManifest,
} from "../src/integrity/manifest.ts";
import { TRUSTED_RELEASE_KEYS } from "../src/integrity/trusted-keys.ts";
import { exportRawEd25519PublicKey } from "../src/integrity/verify.ts";
import { publishNewFile } from "./yeli-files.ts";
import {
  parseReleaseCliOptions,
  requireReleaseCliOption,
} from "./release-cli.ts";
import { assertOutsideRepository } from "./release-paths.ts";

const USAGE = `Usage: sign-release --artifact <${RELEASE_ARTIFACT_NAMES.join("|")}> --private-key <outside-repo.pem> --key-id <id> --release-version <version> --created-at <ISO> --output <manifest.json>`;

function readUtf8File(path: string): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    readFileSync(path),
  );
}

async function main(): Promise<void> {
  const parsed = parseReleaseCliOptions(process.argv.slice(2), USAGE);
  const artifactPath = resolve(requireReleaseCliOption(parsed, "artifact"));
  const artifactName = artifactPath.split(/[\\/]/u).at(-1) as
    ReleaseArtifactName | undefined;
  if (!artifactName || !RELEASE_ARTIFACT_NAMES.includes(artifactName)) {
    throw new Error(
      `Release artifact name must be one of: ${RELEASE_ARTIFACT_NAMES.join(", ")}`,
    );
  }
  const privatePath = assertOutsideRepository(
    resolve(requireReleaseCliOption(parsed, "private-key")),
    "The private signing key must stay outside the repository",
  );
  const outputPath = resolve(requireReleaseCliOption(parsed, "output"));
  const keyId = requireReleaseCliOption(parsed, "key-id");
  const passphrase = process.env.YELI_SIGNING_PASSPHRASE;
  if (!passphrase) throw new Error("YELI_SIGNING_PASSPHRASE is required");
  const privatePem = readFileSync(privatePath, "utf8");
  if (!privatePem.includes("BEGIN ENCRYPTED PRIVATE KEY")) {
    throw new Error("Release signing requires an encrypted PKCS#8 private key");
  }
  const privateKey = createPrivateKey({
    format: "pem",
    key: privatePem,
    passphrase,
  });
  const pinned = TRUSTED_RELEASE_KEYS[keyId];
  if (!pinned) {
    throw new Error(`Signing key ${keyId} is not pinned by the helper`);
  }
  if (exportRawEd25519PublicKey(createPublicKey(privateKey)) !== pinned) {
    throw new Error(`Private key does not match pinned key ${keyId}`);
  }
  const artifact = readUtf8File(artifactPath);
  const unsigned = createReleaseManifest(artifact, {
    artifactName,
    createdAt: requireReleaseCliOption(parsed, "created-at"),
    keyId,
    releaseVersion: requireReleaseCliOption(parsed, "release-version"),
  });
  const manifest = signReleaseManifest(unsigned, privateKey);
  await publishNewFile(outputPath, serializeReleaseManifest(manifest));
  process.stdout.write(
    `${JSON.stringify(
      {
        artifact: artifactPath,
        keyId,
        ok: true,
        output: outputPath,
        releaseArtifactHash: manifest.releaseArtifactHash,
        releaseVersion: manifest.releaseVersion,
        shellHash: manifest.shellHash,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
