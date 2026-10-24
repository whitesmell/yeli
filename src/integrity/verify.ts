import {
  createPublicKey,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";

import { sha256Fallback } from "../document/freshness.ts";
import { parseYeliArtifact } from "../format/parse.ts";
import { createSavedArtifact } from "../format/save.ts";
import {
  parseReleaseManifest,
  releaseManifestSigningBytes,
  type ReleaseManifestError,
} from "./manifest.ts";
import { projectShell, type ShellProjectionError } from "./shell-projection.ts";

export type TrustedReleaseKeys = Readonly<Record<string, string>>;

export type ShellVerificationStatus =
  | "verified"
  | "manifest-invalid"
  | "manifest-not-canonical"
  | "manifest-version-unsupported"
  | "unknown-key"
  | "invalid-signature"
  | "shell-projection-invalid"
  | "shell-hash-mismatch";

export interface ShellVerificationResult {
  exactReleaseArtifact: boolean;
  keyId?: string;
  message: string;
  ok: boolean;
  releaseVersion?: string;
  shellVerified: boolean;
  status: ShellVerificationStatus;
}

export class ShellMigrationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ShellMigrationError";
  }
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

function manifestFailure(error: unknown): ShellVerificationResult {
  const code = (error as Partial<ReleaseManifestError>).code;
  const status: ShellVerificationStatus =
    code === "MANIFEST_NOT_CANONICAL"
      ? "manifest-not-canonical"
      : code === "MANIFEST_VERSION_UNSUPPORTED" ||
          code === "SHELL_PROJECTION_VERSION_UNSUPPORTED"
        ? "manifest-version-unsupported"
        : "manifest-invalid";
  return {
    exactReleaseArtifact: false,
    message: error instanceof Error ? error.message : "Invalid manifest",
    ok: false,
    shellVerified: false,
    status,
  };
}

function publicKeyFromRawBase64(value: string): KeyObject {
  if (!CANONICAL_BASE64.test(value)) {
    throw new Error("Trusted Ed25519 public key is not canonical Base64");
  }
  const raw = Buffer.from(value, "base64");
  if (raw.byteLength !== 32 || raw.toString("base64") !== value) {
    throw new Error("Trusted Ed25519 public key must contain exactly 32 bytes");
  }
  return createPublicKey({
    format: "der",
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    type: "spki",
  });
}

export function exportRawEd25519PublicKey(publicKey: KeyObject): string {
  const der = publicKey.export({ format: "der", type: "spki" });
  if (
    der.byteLength !== ED25519_SPKI_PREFIX.byteLength + 32 ||
    !der.subarray(0, ED25519_SPKI_PREFIX.byteLength).equals(ED25519_SPKI_PREFIX)
  ) {
    throw new Error("Public key is not a raw-compatible Ed25519 SPKI key");
  }
  return der.subarray(ED25519_SPKI_PREFIX.byteLength).toString("base64");
}

export function verifyArtifactShell(
  artifact: string,
  manifestText: string,
  trustedKeys: TrustedReleaseKeys,
): ShellVerificationResult {
  let manifest;
  try {
    manifest = parseReleaseManifest(manifestText);
  } catch (error) {
    return manifestFailure(error);
  }

  const rawPublicKey = trustedKeys[manifest.keyId];
  if (!rawPublicKey) {
    return {
      exactReleaseArtifact: false,
      keyId: manifest.keyId,
      message: `Release key ${manifest.keyId} is not pinned by this helper`,
      ok: false,
      releaseVersion: manifest.releaseVersion,
      shellVerified: false,
      status: "unknown-key",
    };
  }

  let signatureValid = false;
  try {
    signatureValid = cryptoVerify(
      null,
      releaseManifestSigningBytes(manifest),
      publicKeyFromRawBase64(rawPublicKey),
      Buffer.from(manifest.signature, "base64"),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return {
      exactReleaseArtifact: false,
      keyId: manifest.keyId,
      message: "Release manifest signature is invalid",
      ok: false,
      releaseVersion: manifest.releaseVersion,
      shellVerified: false,
      status: "invalid-signature",
    };
  }

  let shellHash: string;
  try {
    shellHash = projectShell(artifact).hash;
  } catch (error) {
    return {
      exactReleaseArtifact: false,
      keyId: manifest.keyId,
      message:
        error instanceof Error
          ? error.message
          : ((error as Partial<ShellProjectionError>).code ??
            "Shell projection failed"),
      ok: false,
      releaseVersion: manifest.releaseVersion,
      shellVerified: false,
      status: "shell-projection-invalid",
    };
  }
  if (shellHash !== manifest.shellHash) {
    return {
      exactReleaseArtifact: false,
      keyId: manifest.keyId,
      message: "Artifact shell hash does not match the signed release",
      ok: false,
      releaseVersion: manifest.releaseVersion,
      shellVerified: false,
      status: "shell-hash-mismatch",
    };
  }
  return {
    exactReleaseArtifact:
      sha256Fallback(artifact) === manifest.releaseArtifactHash,
    keyId: manifest.keyId,
    message: "Artifact shell matches the signed release manifest",
    ok: true,
    releaseVersion: manifest.releaseVersion,
    shellVerified: true,
    status: "verified",
  };
}

export async function migrateArtifactToRelease(
  sourceArtifact: string,
  cleanReleaseArtifact: string,
  manifestText: string,
  trustedKeys: TrustedReleaseKeys,
): Promise<{
  artifact: string;
  bytes: number;
  fingerprint: string;
  verification: ShellVerificationResult;
}> {
  const cleanVerification = verifyArtifactShell(
    cleanReleaseArtifact,
    manifestText,
    trustedKeys,
  );
  if (!cleanVerification.ok) {
    throw new ShellMigrationError(
      "RELEASE_SHELL_UNVERIFIED",
      cleanVerification.message,
    );
  }
  if (!cleanVerification.exactReleaseArtifact) {
    throw new ShellMigrationError(
      "RELEASE_ARTIFACT_NOT_EXACT",
      "Manual migration requires the exact signed clean release artifact",
    );
  }

  const source = await parseYeliArtifact(sourceArtifact);
  if (!source.ok) {
    throw new ShellMigrationError(
      "SOURCE_ARTIFACT_INVALID",
      source.findings.map((item) => item.message).join("; "),
    );
  }
  const migrated = await createSavedArtifact({
    payload: source.payload,
    releaseTemplate: cleanReleaseArtifact,
    revision: source.payload.revision,
    source: source.markdown,
  });
  const verification = verifyArtifactShell(
    migrated.artifact,
    manifestText,
    trustedKeys,
  );
  if (!verification.ok) {
    throw new ShellMigrationError(
      "MIGRATED_ARTIFACT_UNVERIFIED",
      verification.message,
    );
  }
  return {
    artifact: migrated.artifact,
    bytes: migrated.bytes,
    fingerprint: migrated.fingerprint,
    verification,
  };
}
