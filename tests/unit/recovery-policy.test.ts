import { describe, expect, it } from "vitest";

import { persistentRecoveryAllowed } from "../../src/storage/recovery-policy.ts";

function locationLike(protocol: string, origin: string): Location {
  return { protocol, origin } as Location;
}

describe("persistent recovery origin policy", () => {
  it("allows local files when IndexedDB exists", () => {
    expect(
      persistentRecoveryAllowed(
        document,
        locationLike("file:", "null"),
        {} as IDBFactory,
      ),
    ).toBe(true);
  });

  it("requires an exact pinned origin for HTTPS hosting", () => {
    document.head.innerHTML =
      '<meta name="yeli:trusted-recovery-origin" content="https://docs.example">';

    expect(
      persistentRecoveryAllowed(
        document,
        locationLike("https:", "https://docs.example"),
        {} as IDBFactory,
      ),
    ).toBe(true);
    expect(
      persistentRecoveryAllowed(
        document,
        locationLike("https:", "https://shared.example"),
        {} as IDBFactory,
      ),
    ).toBe(false);
  });

  it("rejects HTTP even when metadata names the same origin", () => {
    document.head.innerHTML =
      '<meta name="yeli:trusted-recovery-origin" content="http://docs.example">';

    expect(
      persistentRecoveryAllowed(
        document,
        locationLike("http:", "http://docs.example"),
        {} as IDBFactory,
      ),
    ).toBe(false);
  });

  it("allows HTTP on explicit loopback hosts", () => {
    for (const [hostname, origin] of [
      ["localhost", "http://localhost:8874"],
      ["127.0.0.1", "http://127.0.0.1:8874"],
      ["[::1]", "http://[::1]:8874"],
    ]) {
      expect(
        persistentRecoveryAllowed(
          document,
          { hostname, origin, protocol: "http:" } as Location,
          {} as IDBFactory,
        ),
      ).toBe(true);
    }
  });

  it("rejects lookalike, remote, and malformed HTTP origins", () => {
    for (const [hostname, origin] of [
      ["localhost.example", "http://localhost.example"],
      ["127.0.0.1.example", "http://127.0.0.1.example"],
      ["127.0.0.2", "http://127.0.0.2"],
      ["[::2]", "http://[::2]"],
      ["localhost", "http://remote.example"],
    ]) {
      expect(
        persistentRecoveryAllowed(
          document,
          { hostname, origin, protocol: "http:" } as Location,
          {} as IDBFactory,
        ),
      ).toBe(false);
    }
  });
});
