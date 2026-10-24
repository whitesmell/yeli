import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import {
  createSmartWriteState,
  setSmartWritePresentation,
} from "../../src/optional/advanced-source/smart-write.ts";

const fixturePath = resolve("tests/fixtures/fidelity/representative.md");

describe("Smart Write source fidelity", () => {
  it("keeps every source byte stable through presentation transitions", () => {
    const source = readFileSync(fixturePath, "utf8");
    let state = createSmartWriteState(source);

    for (const presentation of [
      { mode: "smart", focused: true },
      { mode: "smart", focused: false },
      { mode: "source", focused: true },
      { mode: "read", focused: false },
      { mode: "smart", focused: true },
    ] as const) {
      state = setSmartWritePresentation(state, presentation);
      expect(state.doc.toString()).toBe(source);
    }
  });

  it("changes only the explicitly selected source range", () => {
    const source = readFileSync(fixturePath, "utf8");
    const state = createSmartWriteState(source);
    const target = "**Markdown**";
    const from = source.indexOf(target);
    const updated = state.update({
      changes: { from, to: from + target.length, insert: "_Markdown_" },
    }).state;

    expect(updated.doc.toString()).toBe(
      `${source.slice(0, from)}_Markdown_${source.slice(from + target.length)}`,
    );
  });

  it("installs plugin extensions into the state used by CodeMirror", () => {
    let observedSource = "";
    const state = createSmartWriteState("# Before\n", [
      EditorView.updateListener.of((update) => {
        if (update.docChanged) observedSource = update.state.doc.toString();
      }),
    ]);
    const view = new EditorView({ state });

    view.dispatch({
      changes: { from: 2, to: 8, insert: "After" },
    });

    expect(observedSource).toBe("# After\n");
    view.destroy();
  });
});
