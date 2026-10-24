import type { TrustedReleaseKeys } from "./verify.ts";

// A public V1 release is blocked until an offline key ceremony adds at least
// one audited raw Ed25519 public key here. Manifests can name only these keys;
// they cannot supply or select their own verification material.
export const TRUSTED_RELEASE_KEYS: TrustedReleaseKeys = Object.freeze({});
