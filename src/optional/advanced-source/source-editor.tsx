import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

import { createSmartWriteState, presentationEffect } from "./smart-write.ts";

type SourceEditorProps = Readonly<{
  initialSource: string;
  label: string;
  onChange: (source: string) => void;
}>;

export function SourceEditor({
  initialSource,
  label,
  onChange,
}: SourceEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>(null);
  const initialSourceRef = useRef(initialSource);
  const labelRef = useRef(label);
  const onChangeRef = useRef(onChange);
  const pendingSourceRef = useRef<string | null>(null);
  const writeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    labelRef.current = label;
    onChangeRef.current = onChange;
    viewRef.current?.contentDOM.setAttribute("aria-label", label);
  }, [label, onChange]);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const flushPendingSource = () => {
      if (writeTimerRef.current !== null) {
        window.clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }
      const pendingSource = pendingSourceRef.current;
      if (pendingSource === null) return;
      pendingSourceRef.current = null;
      onChangeRef.current(pendingSource);
    };
    const schedulePendingSource = (delay = 180) => {
      if (writeTimerRef.current !== null) {
        window.clearTimeout(writeTimerRef.current);
      }
      writeTimerRef.current = window.setTimeout(flushPendingSource, delay);
    };

    const state = createSmartWriteState(initialSourceRef.current, [
      EditorView.contentAttributes.of({ "aria-label": labelRef.current }),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        focus: (_event, currentView) => {
          currentView.dispatch({
            effects: presentationEffect({ mode: "smart", focused: true }),
          });
        },
        blur: (_event, currentView) => {
          currentView.dispatch({
            effects: presentationEffect({ mode: "smart", focused: false }),
          });
        },
        compositionstart: () => {
          if (writeTimerRef.current !== null) {
            window.clearTimeout(writeTimerRef.current);
            writeTimerRef.current = null;
          }
        },
        compositionend: () => {
          schedulePendingSource(0);
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          pendingSourceRef.current = update.state.doc.toString();
          if (update.view.composing) return;
          schedulePendingSource();
        }
      }),
    ]);
    const view = new EditorView({
      state,
      parent,
    });
    viewRef.current = view;

    return () => {
      flushPendingSource();
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  return <div className="source-editor" ref={parentRef} />;
}
