import { DocumentDuplicateIcon, LinkIcon } from "@heroicons/react/24/outline";

import type { Labels } from "../i18n/en.ts";
import { useDialogFocus } from "./use-dialog-focus.ts";

export function ReconnectDialog({
  candidateCount,
  labels,
  onReconnect,
  onSeparate,
}: {
  candidateCount: number;
  labels: Labels;
  onReconnect: () => void;
  onSeparate: () => void;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus(null);
  return (
    <div className="overlay-backdrop recovery-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="conflict-dialog reconnect-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={labels.reconnectTitle}
        onKeyDown={onKeyDown}
      >
        <LinkIcon aria-hidden="true" />
        <h2>{labels.reconnectTitle}</h2>
        <p>{labels.reconnectDescription}</p>
        <div className="reconnect-receipt">
          <span>
            {labels.reconnectMatches.replace("{count}", String(candidateCount))}
          </span>
        </div>
        <div className="conflict-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={onSeparate}
          >
            <DocumentDuplicateIcon aria-hidden="true" />
            {labels.reconnectSeparate}
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={onReconnect}
          >
            <LinkIcon aria-hidden="true" />
            {labels.reconnectPrevious}
          </button>
        </div>
      </section>
    </div>
  );
}
