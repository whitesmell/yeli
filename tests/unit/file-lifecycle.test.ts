import { describe, expect, it } from "vitest";

import { refreshHistoryPanel } from "../../src/ui/use-file-lifecycle.ts";
import type { StoredVersion } from "../../src/storage/recovery.ts";

describe("file lifecycle history ordering", () => {
  it("does not reopen History when another rail supersedes a pending refresh", async () => {
    let resolveVersions: ((versions: StoredVersion[]) => void) | undefined;
    const versions = new Promise<StoredVersion[]>((resolve) => {
      resolveVersions = resolve;
    });
    let historyOpen = false;

    const pending = refreshHistoryPanel({
      localInstanceId: "local-history",
      listVersions: () => versions,
      onFailure: () => undefined,
      onOpen: () => {
        historyOpen = true;
      },
      onVersions: () => undefined,
    });

    expect(historyOpen).toBe(true);
    historyOpen = false;
    resolveVersions?.([]);
    await pending;

    expect(historyOpen).toBe(false);
  });
});
