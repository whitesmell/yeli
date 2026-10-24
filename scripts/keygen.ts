#!/usr/bin/env node

import { generateKeyPairSync } from "node:crypto";
import { resolve } from "node:path";

import { exportRawEd25519PublicKey } from "../src/integrity/verify.ts";
import { publishNewFile } from "./yeli-files.ts";
import {
  parseReleaseCliOptions,
  requireReleaseCliOption,
} from "./release-cli.ts";
import { assertOutsideRepository } from "./release-paths.ts";

const USAGE =
  "Usage: keygen --key-id <id> --private-key <outside-repo.pem> --public-key <record.json>";

async function main(): Promise<void> {
  const parsed = parseReleaseCliOptions(process.argv.slice(2), USAGE);
  const keyId = requireReleaseCliOption(parsed, "key-id");
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(keyId)) {
    throw new Error("--key-id has an invalid shape");
  }
  const privatePath = assertOutsideRepository(
    resolve(requireReleaseCliOption(parsed, "private-key")),
    "The private signing key must be written outside the repository",
  );
  const publicPath = resolve(requireReleaseCliOption(parsed, "public-key"));
  const passphrase = process.env.YELI_SIGNING_PASSPHRASE;
  if (!passphrase || passphrase.length < 16) {
    throw new Error(
      "YELI_SIGNING_PASSPHRASE must contain at least 16 characters",
    );
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const encryptedPrivateKey = privateKey.export({
    cipher: "aes-256-cbc",
    format: "pem",
    passphrase,
    type: "pkcs8",
  });
  const publicRecord = `${JSON.stringify(
    {
      format: "yeli/trusted-release-key",
      version: 1,
      keyId,
      encoding: "raw-ed25519-base64",
      publicKey: exportRawEd25519PublicKey(publicKey),
    },
    null,
    2,
  )}\n`;
  await publishNewFile(publicPath, publicRecord);
  await publishNewFile(privatePath, encryptedPrivateKey);
  process.stdout.write(
    `${JSON.stringify(
      { keyId, ok: true, privateKey: privatePath, publicKey: publicPath },
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
