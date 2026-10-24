import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { assertOutsideRepository } from "../../scripts/release-paths.ts";

describe("release signing path boundary", () => {
  it("rejects repository paths regardless of the process working directory", () => {
    expect(() =>
      assertOutsideRepository(
        resolve("private-release.pem"),
        "private key rejected",
      ),
    ).toThrow("private key rejected");
  });

  it("accepts a path whose realized parent is outside the repository", () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-release-key-"));
    expect(() =>
      assertOutsideRepository(
        join(directory, "private-release.pem"),
        "private key rejected",
      ),
    ).not.toThrow();
  });

  it("rejects an outside-looking path through a symlink into the repository", () => {
    const directory = mkdtempSync(join(tmpdir(), "yeli-release-link-"));
    const repositoryDirectory = resolve("src");
    symlinkSync(repositoryDirectory, join(directory, "repository-link"));

    expect(() =>
      assertOutsideRepository(
        join(directory, "repository-link", "private-release.pem"),
        "private key rejected",
      ),
    ).toThrow("private key rejected");
  });
});
