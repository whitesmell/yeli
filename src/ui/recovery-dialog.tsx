import { ClockIcon } from "@heroicons/react/24/outline";

import type { Labels } from "../i18n/en.ts";
import type { RecoverySnapshot } from "../storage/recovery.ts";
import { useDialogFocus } from "./use-dialog-focus.ts";

export function RecoveryDialog({
  labels,
  onDiscard,
  onRestore,
  recovery,
}: {
  labels: Labels;
  onDiscard: () => void;
  onRestore: () => void;
  recovery: RecoverySnapshot;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus(null);
  return (
    <div className="overlay-backdrop recovery-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="recovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={labels.recoveryTitle}
        onKeyDown={onKeyDown}
      >
        <ClockIcon aria-hidden="true" />
        <h2>{labels.recoveryTitle}</h2>
        <p>{labels.recoveryDescription}</p>
        <pre>{recovery.source.slice(0, 420)}</pre>
        <div>
          <button
            type="button"
            className="secondary-action"
            onClick={onDiscard}
          >
            {labels.recoveryDiscard}
          </button>
          <button type="button" className="primary-action" onClick={onRestore}>
            {labels.recoveryRestore}
          </button>
        </div>
      </section>
    </div>
  );
}
