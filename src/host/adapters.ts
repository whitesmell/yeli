import { openYeliArtifact } from "../format/open.ts";
import type { FileHandleLike } from "../storage/file-handles.ts";
import type { HostFileAdapter, HostOpenResult } from "./contracts.ts";
import {
  isMarkdownFilename,
  openMarkdownFile,
  readMarkdownFile,
} from "./markdown-files.ts";

interface PickerWindow extends Window {
  showOpenFilePicker?: (options?: unknown) => Promise<FileHandleLike[]>;
}

function rejectFile(message: string): HostOpenResult {
  return { error: message, ok: false };
}

async function openArtifactFile(file: File): Promise<HostOpenResult> {
  const content = await file.text();
  if (isMarkdownFilename(file.name)) {
    return {
      document: await openMarkdownFile(content),
      ok: true,
    };
  }
  return openYeliArtifact(content, content);
}

async function openWebMarkdownFile(file: File): Promise<HostOpenResult> {
  if (!isMarkdownFilename(file.name)) {
    return rejectFile("Web host accepts Markdown files only");
  }
  const source = await readMarkdownFile(file);
  return {
    document: await openMarkdownFile(source),
    ok: true,
  };
}

async function chooseMarkdownFile(
  fallback: () => void,
  open: (file: File, handle: FileHandleLike | null) => Promise<void>,
): Promise<void> {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) {
    fallback();
    return;
  }
  try {
    const [handle] = await picker.call(window, {
      excludeAcceptAllOption: true,
      multiple: false,
      types: [
        {
          accept: { "text/markdown": [".md"] },
          description: "Markdown",
        },
      ],
    });
    if (!handle) return;
    await open((await handle.getFile()) as File, handle);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    throw error;
  }
}

export function createArtifactFileAdapter(): HostFileAdapter {
  return {
    accept: ".yeli.html,.html,.md,text/html,text/markdown",
    async chooseFile(fallback, open) {
      const picker = (window as PickerWindow).showOpenFilePicker;
      if (!picker) {
        fallback();
        return;
      }
      try {
        const [handle] = await picker({
          excludeAcceptAllOption: false,
          multiple: false,
          types: [
            {
              accept: {
                "text/html": [".yeli.html", ".html"],
                "text/markdown": [".md"],
              },
              description: "Yeli / Markdown",
            },
          ],
        });
        if (!handle) return;
        await open((await handle.getFile()) as File, handle);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        throw error;
      }
    },
    openFile(file) {
      return openArtifactFile(file);
    },
    retainHandleOnOpen(file, handle) {
      return isMarkdownFilename(file.name) ? null : handle;
    },
  };
}

export function createWebFileAdapter(): HostFileAdapter {
  return {
    accept: ".md,text/markdown",
    chooseFile: chooseMarkdownFile,
    openFile(file) {
      return openWebMarkdownFile(file);
    },
    retainHandleOnOpen(_file, handle) {
      return handle;
    },
  };
}
