import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import type { Labels } from "../i18n/en.ts";
import { useDialogFocus } from "./use-dialog-focus.ts";

export function InvalidFileDialog({
  canRecoverMarkdown,
  problem,
  filename,
  labels,
  onClose,
  onDownloadOriginal,
  onRecoverMarkdown,
}: {
  canRecoverMarkdown: boolean;
  problem: string;
  filename: string;
  labels: Labels;
  onClose: () => void;
  onDownloadOriginal: () => void;
  onRecoverMarkdown: () => void;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus(onClose);
  return (
    <div
      className="overlay-backdrop recovery-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="conflict-dialog invalid-file-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={labels.recoveryFileTitle}
        onKeyDown={onKeyDown}
      >
        <ExclamationTriangleIcon aria-hidden="true" />
        <div className="dialog-heading-row">
          <div>
            <h2>{labels.recoveryFileTitle}</h2>
            <p>{labels.recoveryFileDescription}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={labels.close}
            onClick={onClose}
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        </div>
        <div className="recovery-file-detail">
          <strong>{filename}</strong>
          <span>{problem}</span>
        </div>
        <div className="conflict-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={onDownloadOriginal}
          >
            <ArrowDownTrayIcon aria-hidden="true" />
            {labels.recoveryDownloadOriginal}
          </button>
          {canRecoverMarkdown ? (
            <button
              type="button"
              className="primary-action"
              onClick={onRecoverMarkdown}
            >
              <DocumentTextIcon aria-hidden="true" />
              {labels.recoveryOpenMarkdown}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
