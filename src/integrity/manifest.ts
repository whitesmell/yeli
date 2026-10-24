import { sign as cryptoSign, type KeyLike } from "node:crypto";

import { sha256Fallback } from "../document/freshness.ts";
import { projectShell, SHELL_PROJECTION_VERSION } from "./shell-projection.ts";

export const RELEASE_MANIFEST_FORMAT = "yeli/release-manifest" as const;
export const RELEASE_MANIFEST_VERSION = 1 as const;
export const RELEASE_SIGNATURE_DOMAIN = "YELI_RELEASE_MANIFEST_V1\n";
export const RELEASE_ARTIFACT_NAMES = [
  "starter.en.yeli.html",
  "starter.zh-CN.yeli.html",
  "empty.yeli.html",
  "advanced.en.yeli.html",
  "advanced.zh-CN.yeli.html",
  "advanced-empty.yeli.html",
] as const;
export type ReleaseArtifactName = (typeof RELEASE_ARTIFACT_NAMES)[number];
export const RELEASE_ARTIFACT_NAME: ReleaseArtifactName =
  "starter.zh-CN.yeli.html";

export interface UnsignedReleaseManifest {
  artifactName: ReleaseArtifactName;
  createdAt: string;
  format: typeof RELEASE_MANIFEST_FORMAT;
  keyId: string;
  releaseArtifactHash: string;
  releaseVersion: string;
  shellHash: string;
  shellProjectionVersion: typeof SHELL_PROJECTION_VERSION;
  version: typeof RELEASE_MANIFEST_VERSION;
}

export interface ReleaseManifest extends UnsignedReleaseManifest {
  signature: string;
}

export class ReleaseManifestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ReleaseManifestError";
  }
}

const UNSIGNED_KEYS = [
  "format",
  "version",
  "releaseVersion",
  "artifactName",
  "createdAt",
  "keyId",
  "shellProjectionVersion",
  "shellHash",
  "releaseArtifactHash",
] as const;
const SIGNED_KEYS = [...UNSIGNED_KEYS, "signature"] as const;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const RELEASE_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/u;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

function orderedUnsigned(
  manifest: UnsignedReleaseManifest,
): UnsignedReleaseManifest {
  return {
    format: manifest.format,
    version: manifest.version,
    releaseVersion: manifest.releaseVersion,
    artifactName: manifest.artifactName,
    createdAt: manifest.createdAt,
    keyId: manifest.keyId,
    shellProjectionVersion: manifest.shellProjectionVersion,
    shellHash: manifest.shellHash,
    releaseArtifactHash: manifest.releaseArtifactHash,
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReleaseManifestError(
      "MANIFEST_SHAPE_INVALID",
      "Release manifest must be one JSON object",
    );
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
): void {
  const keys = Object.keys(record);
  if (
    keys.length !== expected.length ||
    keys.some((key) => !expected.includes(key))
  ) {
    throw new ReleaseManifestError(
      "MANIFEST_SHAPE_INVALID",
      `Release manifest must contain exactly: ${expected.join(", ")}`,
    );
  }
}

function validateUnsignedRecord(
  record: Record<string, unknown>,
): UnsignedReleaseManifest {
  if (record.format !== RELEASE_MANIFEST_FORMAT) {
    throw new ReleaseManifestError(
      "MANIFEST_FORMAT_UNSUPPORTED",
      `Expected ${RELEASE_MANIFEST_FORMAT}`,
    );
  }
  if (record.version !== RELEASE_MANIFEST_VERSION) {
    throw new ReleaseManifestError(
      "MANIFEST_VERSION_UNSUPPORTED",
      `Expected release manifest version ${RELEASE_MANIFEST_VERSION}`,
    );
  }
  if (
    typeof record.artifactName !== "string" ||
    !RELEASE_ARTIFACT_NAMES.includes(record.artifactName as ReleaseArtifactName)
  ) {
    throw new ReleaseManifestError(
      "MANIFEST_ARTIFACT_INVALID",
      `Expected one of: ${RELEASE_ARTIFACT_NAMES.join(", ")}`,
    );
  }
  if (
    typeof record.releaseVersion !== "string" ||
    !RELEASE_VERSION_PATTERN.test(record.releaseVersion)
  ) {
    throw new ReleaseManifestError(
      "MANIFEST_RELEASE_VERSION_INVALID",
      "Release version has an invalid shape",
    );
  }
  if (
    typeof record.createdAt !== "string" ||
    Number.isNaN(Date.parse(record.createdAt)) ||
    new Date(record.createdAt).toISOString() !== record.createdAt
  ) {
    throw new ReleaseManifestError(
      "MANIFEST_CREATED_AT_INVALID",
      "createdAt must be a canonical UTC ISO timestamp",
    );
  }
  if (typeof record.keyId !== "string" || !KEY_ID_PATTERN.test(record.keyId)) {
    throw new ReleaseManifestError(
      "MANIFEST_KEY_ID_INVALID",
      "keyId has an invalid shape",
    );
  }
  if (record.shellProjectionVersion !== SHELL_PROJECTION_VERSION) {
    throw new ReleaseManifestError(
      "SHELL_PROJECTION_VERSION_UNSUPPORTED",
      `Expected shell projection version ${SHELL_PROJECTION_VERSION}`,
    );
  }
  for (const key of ["shellHash", "releaseArtifactHash"] as const) {
    if (typeof record[key] !== "string" || !HASH_PATTERN.test(record[key])) {
      throw new ReleaseManifestError(
        "MANIFEST_HASH_INVALID",
        `${key} must be a lowercase SHA-256 hex digest`,
      );
    }
  }
  return orderedUnsigned(record as unknown as UnsignedReleaseManifest);
}

export function createReleaseManifest(
  artifact: string,
  options: {
    artifactName?: ReleaseArtifactName;
    createdAt: string;
    keyId: string;
    releaseVersion: string;
  },
): UnsignedReleaseManifest {
  const projection = projectShell(artifact);
  return validateUnsignedRecord({
    artifactName: options.artifactName ?? RELEASE_ARTIFACT_NAME,
    createdAt: options.createdAt,
    format: RELEASE_MANIFEST_FORMAT,
    keyId: options.keyId,
    releaseArtifactHash: sha256Fallback(artifact),
    releaseVersion: options.releaseVersion,
    shellHash: projection.hash,
    shellProjectionVersion: projection.version,
    version: RELEASE_MANIFEST_VERSION,
  });
}

export function canonicalUnsignedManifest(
  manifest: UnsignedReleaseManifest,
): string {
  return `${JSON.stringify(orderedUnsigned(manifest), null, 2)}\n`;
}

export function releaseManifestSigningBytes(
  manifest: UnsignedReleaseManifest,
): Uint8Array {
  return new TextEncoder().encode(
    `${RELEASE_SIGNATURE_DOMAIN}${canonicalUnsignedManifest(manifest)}`,
  );
}

export function signReleaseManifest(
  manifest: UnsignedReleaseManifest,
  privateKey: KeyLike,
): ReleaseManifest {
  const signature = cryptoSign(
    null,
    releaseManifestSigningBytes(manifest),
    privateKey,
  ).toString("base64");
  return { ...orderedUnsigned(manifest), signature };
}

export function serializeReleaseManifest(manifest: ReleaseManifest): string {
  return `${JSON.stringify(
    { ...orderedUnsigned(manifest), signature: manifest.signature },
    null,
    2,
  )}\n`;
}

export function parseReleaseManifest(text: string): ReleaseManifest {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ReleaseManifestError(
      "MANIFEST_JSON_INVALID",
      "Release manifest is not valid JSON",
    );
  }
  const record = requireRecord(value);
  requireExactKeys(record, SIGNED_KEYS);
  const unsignedRecord = Object.fromEntries(
    UNSIGNED_KEYS.map((key) => [key, record[key]]),
  );
  const unsigned = validateUnsignedRecord(unsignedRecord);
  if (
    typeof record.signature !== "string" ||
    !BASE64_PATTERN.test(record.signature) ||
    Buffer.from(record.signature, "base64").byteLength !== 64 ||
    Buffer.from(record.signature, "base64").toString("base64") !==
      record.signature
  ) {
    throw new ReleaseManifestError(
      "MANIFEST_SIGNATURE_INVALID",
      "signature must be canonical Base64 for a 64-byte Ed25519 signature",
    );
  }
  const manifest = { ...unsigned, signature: record.signature };
  if (serializeReleaseManifest(manifest) !== text) {
    throw new ReleaseManifestError(
      "MANIFEST_NOT_CANONICAL",
      "Release manifest bytes are not canonical",
    );
  }
  return manifest;
}
