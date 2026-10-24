import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";

import { AgentApiError } from "../src/agent/operations.ts";

export type FileContent = string | Uint8Array;

export interface FilePublicationOptions {
  validateTemporary?: (temporaryPath: string) => Promise<void> | void;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}

function temporaryPathFor(targetPath: string): string {
  return resolve(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.yeli-tmp`,
  );
}

function writeDurableTemporary(
  targetPath: string,
  content: FileContent,
): string {
  const temporaryPath = temporaryPathFor(targetPath);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    return temporaryPath;
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original write/fsync failure; cleanup still runs below.
      }
    }
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function outputExists(path: string): AgentApiError {
  return new AgentApiError(
    "OUTPUT_EXISTS",
    `Refusing to overwrite existing output ${path}`,
  );
}

function inputChanged(path: string): AgentApiError {
  return new AgentApiError(
    "INPUT_CHANGED",
    `The input changed after it was read; refusing to replace ${path}`,
  );
}

export async function publishNewFile(
  path: string,
  content: FileContent,
  options: FilePublicationOptions = {},
): Promise<void> {
  const targetPath = resolve(path);
  const temporaryPath = writeDurableTemporary(targetPath, content);
  try {
    await options.validateTemporary?.(temporaryPath);
    try {
      // A same-directory hard link publishes the already-fsynced inode in one
      // no-clobber filesystem operation. Removing the temporary name leaves the
      // complete target inode in place.
      linkSync(temporaryPath, targetPath);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        throw outputExists(targetPath);
      }
      throw error;
    }
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export async function replaceFileIfUnchanged(
  path: string,
  content: FileContent,
  expectedInput: Uint8Array,
  options: FilePublicationOptions = {},
): Promise<void> {
  const targetPath = resolve(path);
  const temporaryPath = writeDurableTemporary(targetPath, content);
  try {
    await options.validateTemporary?.(temporaryPath);
    let originalMode: number;
    try {
      originalMode = statSync(targetPath).mode & 0o777;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw inputChanged(targetPath);
      }
      throw error;
    }
    chmodSync(temporaryPath, originalMode);

    // This exact-byte comparison deliberately happens after validation and
    // permission preparation, immediately before the atomic rename.
    let currentInput: Uint8Array;
    try {
      currentInput = readFileSync(targetPath);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw inputChanged(targetPath);
      }
      throw error;
    }
    if (!sameBytes(currentInput, expectedInput)) {
      throw inputChanged(targetPath);
    }
    renameSync(temporaryPath, targetPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}
