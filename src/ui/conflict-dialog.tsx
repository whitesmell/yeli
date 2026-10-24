import {
  ArrowPathIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import type { Labels } from "../i18n/en.ts";
import { useDialogFocus } from "./use-dialog-focus.ts";

export function ConflictDialog({
  labels,
  onOverwrite,
  onReload,
  onSaveCopy,
}: {
  labels: Labels;
  onOverwrite: () => void;
  onReload: () => void;
  onSaveCopy: () => void;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus(null);
  return (
    <div className="overlay-backdrop recovery-backdrop" role="presentation">
      <section
        aria-label={labels.conflictTitle}
        aria-modal="true"
        className="conflict-dialog"
        ref={dialogRef}
        role="alertdialog"
        onKeyDown={onKeyDown}
      >
        <ExclamationTriangleIcon aria-hidden="true" />
        <h2>{labels.conflictTitle}</h2>
        <p>{labels.conflictDescription}</p>
        <div className="conflict-actions">
          <button type="button" className="secondary-action" onClick={onReload}>
            <ArrowPathIcon aria-hidden="true" />
            {labels.conflictReload}
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={onSaveCopy}
          >
            <DocumentDuplicateIcon aria-hidden="true" />
            {labels.saveCopy}
          </button>
          <button type="button" className="danger-action" onClick={onOverwrite}>
            {labels.conflictOverwrite}
          </button>
        </div>
      </section>
    </div>
  );
}
