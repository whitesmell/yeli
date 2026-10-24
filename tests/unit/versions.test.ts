import { describe, expect, it } from "vitest";

import { en } from "../../src/i18n/en.ts";
import { zhCN } from "../../src/i18n/zh-CN.ts";
import type { StoredVersion } from "../../src/storage/recovery.ts";
import {
  versionCategory,
  versionDescription,
  versionKindLabels,
} from "../../src/storage/versions.ts";

function version(
  change: StoredVersion["change"],
  reason: StoredVersion["reason"] = "edit",
): StoredVersion {
  return {
    ...(change ? { change } : {}),
    id: "version-1",
    reason,
    revision: 9,
    source: "- List item\n",
    sourceHash: "hash-1",
    updatedAt: 1_700_000_000_000,
  };
}

describe("history version presentation", () => {
  it("groups editor and system records as local while keeping Agent edits distinct", () => {
    expect(versionCategory(version({ origin: "yeli-editor" }))).toBe("local");
    expect(versionCategory(version({ origin: "system" }, "open"))).toBe(
      "local",
    );
    expect(versionCategory(version({ origin: "external-agent" }))).toBe(
      "agent",
    );
  });

  it("turns implementation operations and block kinds into reader-facing summaries", () => {
    const editedList = version({
      blockKinds: ["list-item"],
      operation: "wysiwyg:inline",
      origin: "yeli-editor",
    });

    expect(versionDescription(editedList, zhCN)).toBe("编辑了列表内容");
    expect(versionDescription(editedList, en)).toBe("Edited list content");
    expect(versionKindLabels(editedList, zhCN)).toEqual(["列表"]);
  });

  it("prefers an Agent-authored change summary and explains local system events", () => {
    expect(
      versionDescription(
        version({
          actorLabel: "codex/current-task",
          origin: "external-agent",
          summary: "更新了进度总览",
        }),
        zhCN,
      ),
    ).toBe("更新了进度总览");
    expect(
      versionDescription(version({ origin: "system" }, "restore"), zhCN),
    ).toBe("恢复了一个历史版本");
  });
});
