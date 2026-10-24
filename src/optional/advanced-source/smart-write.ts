import { markdown } from "@codemirror/lang-markdown";
import {
  EditorState,
  StateEffect,
  StateField,
  type Extension,
  type Text,
} from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export type EditorPresentation = Readonly<{
  mode: "smart" | "source" | "read";
  focused: boolean;
}>;

const setPresentation = StateEffect.define<EditorPresentation>();

type SmartWriteState = Readonly<{
  presentation: EditorPresentation;
  decorations: DecorationSet;
}>;

const syntaxToken = /(^#{1,6}\s+)|(`{1,3})|(\*{1,2}|_{1,2})(?=\S)/gm;

function buildDecorations(
  document: Text,
  presentation: EditorPresentation,
): DecorationSet {
  if (presentation.mode !== "smart" || presentation.focused) {
    return Decoration.none;
  }

  const ranges: ReturnType<Decoration["range"]>[] = [];
  const source = document.toString();
  for (const match of source.matchAll(syntaxToken)) {
    if (match.index === undefined) continue;
    ranges.push(
      Decoration.mark({ class: "cm-yeli-syntax" }).range(
        match.index,
        match.index + match[0].length,
      ),
    );
  }

  return Decoration.set(ranges, true);
}

const smartWriteField = StateField.define<SmartWriteState>({
  create(state) {
    const presentation = { mode: "smart", focused: false } as const;
    return {
      presentation,
      decorations: buildDecorations(state.doc, presentation),
    };
  },
  update(value, transaction) {
    let presentation = value.presentation;
    for (const effect of transaction.effects) {
      if (effect.is(setPresentation)) presentation = effect.value;
    }

    if (!transaction.docChanged && presentation === value.presentation) {
      return value;
    }

    return {
      presentation,
      decorations: buildDecorations(transaction.newDoc, presentation),
    };
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => value.decorations),
});

export function presentationEffect(presentation: EditorPresentation) {
  return setPresentation.of(presentation);
}

export function createSmartWriteState(
  source: string,
  extensions: readonly Extension[] = [],
): EditorState {
  return EditorState.create({
    doc: source,
    extensions: [markdown(), smartWriteField, ...extensions],
  });
}

export function setSmartWritePresentation(
  state: EditorState,
  presentation: EditorPresentation,
): EditorState {
  return state.update({ effects: presentationEffect(presentation) }).state;
}
