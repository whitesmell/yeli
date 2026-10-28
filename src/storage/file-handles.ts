import { fingerprintArtifact } from "../format/save.ts";
import { readMarkdownFile } from "../host/markdown-files.ts";

export interface WritableLike {
  close(): Promise<void>;
  write(value: string | Blob): Promise<void>;
}

export interface FileHandleLike {
  isSameEntry?(other: FileHandleLike): Promise<boolean>;
  createWritable(): Promise<WritableLike>;
  getFile(): Promise<{
    arrayBuffer?(): Promise<ArrayBuffer>;
    text(): Promise<string>;
  }>;
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

async function writeTextToHandle(
  handle: FileHandleLike,
  text: string,
  expectedFingerprint: string,
  allowExternalOverwrite = false,
  markdown = false,
): Promise<HandleWriteResult> {
  try {
    if (!(await ensureWritePermission(handle))) {
      return { ok: false, reason: "permission-denied" };
    }
    const current = await handle.getFile();
    const readBytes = markdown ? current.arrayBuffer?.bind(current) : undefined;
    const actualFingerprint = fingerprintArtifact(
      markdown && readBytes
        ? await readMarkdownFile({ arrayBuffer: readBytes })
        : await current.text(),
    );
    if (!allowExternalOverwrite && actualFingerprint !== expectedFingerprint) {
      return {
        actualFingerprint,
        ok: false,
        reason: "external-conflict",
      };
    }
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return { fingerprint: fingerprintArtifact(text), ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      reason: "write-failed",
    };
  }
}

export async function writeArtifactToHandle(
  handle: FileHandleLike,
  artifact: string,
  expectedFingerprint: string,
  allowExternalOverwrite = false,
): Promise<HandleWriteResult> {
  return writeTextToHandle(
    handle,
    artifact,
    expectedFingerprint,
    allowExternalOverwrite,
  );
}

export async function writeMarkdownToHandle(
  handle: FileHandleLike,
  source: string,
  expectedFingerprint: string,
  allowExternalOverwrite = false,
): Promise<HandleWriteResult> {
  return writeTextToHandle(
    handle,
    source,
    expectedFingerprint,
    allowExternalOverwrite,
    true,
  );
}
