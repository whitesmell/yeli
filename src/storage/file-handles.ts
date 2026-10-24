import { fingerprintArtifact } from "../format/save.ts";

export interface WritableLike {
  close(): Promise<void>;
  write(value: string | Blob): Promise<void>;
}

export interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
  getFile(): Promise<{ text(): Promise<string> }>;
  name: string;
  queryPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
}

export type HandleWriteResult =
  | {
      fingerprint: string;
      ok: true;
    }
  | {
      actualFingerprint?: string;
      error?: string;
      ok: false;
      reason: "external-conflict" | "permission-denied" | "write-failed";
    };

async function ensureWritePermission(handle: FileHandleLike): Promise<boolean> {
  if (!handle.queryPermission) return true;
  const options = { mode: "readwrite" } as const;
  const current = await handle.queryPermission(options);
  if (current === "granted") return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission(options)) === "granted";
}

export async function writeArtifactToHandle(
  handle: FileHandleLike,
  artifact: string,
  expectedFingerprint: string,
  allowExternalOverwrite = false,
): Promise<HandleWriteResult> {
  try {
    if (!(await ensureWritePermission(handle))) {
      return { ok: false, reason: "permission-denied" };
    }
    const current = await handle.getFile();
    const actualFingerprint = fingerprintArtifact(await current.text());
    if (!allowExternalOverwrite && actualFingerprint !== expectedFingerprint) {
      return {
        actualFingerprint,
        ok: false,
        reason: "external-conflict",
      };
    }
    const writable = await handle.createWritable();
    await writable.write(artifact);
    await writable.close();
    return { fingerprint: fingerprintArtifact(artifact), ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      reason: "write-failed",
    };
  }
}
