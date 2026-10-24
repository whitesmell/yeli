export interface InputCommit {
  data: string;
  inputType: "drop" | "insertCompositionText" | "paste";
  undoEntries: 1;
}

/**
 * Disposable U8 evidence for collapsing browser input streams into one source
 * transaction. DOM-to-source selection mapping remains a U3 adapter concern.
 */
export class MinimalInputBuffer {
  #composing = false;
  #draft = "";

  get composing(): boolean {
    return this.#composing;
  }

  beginComposition(): void {
    this.#composing = true;
    this.#draft = "";
  }

  updateComposition(data: string): null {
    if (!this.#composing) throw new Error("Composition has not started");
    this.#draft = data;
    return null;
  }

  endComposition(data = this.#draft): InputCommit {
    if (!this.#composing) throw new Error("Composition has not started");
    this.#composing = false;
    this.#draft = "";
    return { data, inputType: "insertCompositionText", undoEntries: 1 };
  }

  paste(plainText: string): InputCommit {
    return { data: plainText, inputType: "paste", undoEntries: 1 };
  }

  dropAsset(assetId: string, alt: string): InputCommit {
    if (!/^sha256:[a-f0-9]{64}$/u.test(assetId)) {
      throw new Error("Dropped assets require a validated content id");
    }
    const safeAlt = alt.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
    return {
      data: `![${safeAlt}](asset:${assetId})`,
      inputType: "drop",
      undoEntries: 1,
    };
  }
}
