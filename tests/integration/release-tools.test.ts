import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const passphrase = "yeli-test-only-passphrase";

function runScript(script: string, arguments_: string[], cwd = resolve(".")) {
  return spawnSync(process.execPath, [resolve(script), ...arguments_], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, YELI_SIGNING_PASSPHRASE: passphrase },
  });
}

describe("release key and signing tools", () => {
  it("creates only an encrypted outside-repository key and refuses an unpinned signer", () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-release-tools-"));
    const privatePath = join(directory, "release-private.pem");
    const publicPath = join(directory, "release-public.json");
    const keyId = "integration-release-key";

    const keygen = runScript(
      "scripts/keygen.ts",
      [
        "--key-id",
        keyId,
        "--private-key",
        privatePath,
        "--public-key",
        publicPath,
      ],
      resolve("src"),
    );
    expect(keygen.status, keygen.stderr).toBe(0);
    expect(readFileSync(privatePath, "utf8")).toContain(
      "BEGIN ENCRYPTED PRIVATE KEY",
    );
    expect(statSync(privatePath).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(publicPath, "utf8"))).toMatchObject({
      encoding: "raw-ed25519-base64",
      format: "yeli/trusted-release-key",
      keyId,
      version: 1,
    });

    const manifestPath = join(directory, "release-manifest.json");
    const sign = runScript("scripts/sign-release.ts", [
      "--artifact",
      resolve("dist/html/starter.zh-CN.yeli.html"),
      "--private-key",
      privatePath,
      "--key-id",
      keyId,
      "--release-version",
      "0.1.0-integration.1",
      "--created-at",
      "2026-08-31T12:00:00.000Z",
      "--output",
      manifestPath,
    ]);
    expect(sign.status).toBe(1);
    expect(JSON.parse(sign.stderr)).toMatchObject({
      ok: false,
      error: `Signing key ${keyId} is not pinned by the helper`,
    });
    expect(existsSync(manifestPath)).toBe(false);
  });

  it("rejects an in-repository private-key destination from a nested cwd", () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-release-public-"));
    const privatePath = resolve("private-release-key.pem");
    const result = runScript(
      "scripts/keygen.ts",
      [
        "--key-id",
        "integration-repository-key",
        "--private-key",
        privatePath,
        "--public-key",
        join(directory, "public.json"),
      ],
      resolve("src"),
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: "The private signing key must be written outside the repository",
    });
    expect(existsSync(privatePath)).toBe(false);
  });

  it("does not publish a private key when the public record cannot be created", () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-release-collision-"));
    const privatePath = join(directory, "release-private.pem");
    const publicPath = join(directory, "release-public.json");
    writeFileSync(publicPath, "already exists\n", "utf8");

    const result = runScript("scripts/keygen.ts", [
      "--key-id",
      "integration-collision-key",
      "--private-key",
      privatePath,
      "--public-key",
      publicPath,
    ]);

    expect(result.status).toBe(1);
    const failure = JSON.parse(result.stderr) as Record<string, unknown>;
    expect(failure.ok).toBe(false);
    expect(failure.error).toEqual(
      expect.stringContaining("Refusing to overwrite existing output"),
    );
    expect(readFileSync(publicPath, "utf8")).toBe("already exists\n");
    expect(existsSync(privatePath)).toBe(false);
  });
});
