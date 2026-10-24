import {
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import type { StaticHtmlExport } from "../format/static-preview.ts";
import type { Labels } from "../i18n/en.ts";
import { useDialogFocus } from "./use-dialog-focus.ts";

export function ExportPreview({
  artifact,
  labels,
  onClose,
  onDownload,
}: {
  artifact: StaticHtmlExport;
  labels: Labels;
  onClose: () => void;
  onDownload: () => void;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus(onClose);
  return (
    <div
      className="overlay-backdrop export-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        className="export-preview"
        role="dialog"
        aria-modal="true"
        aria-label={labels.exportPreview}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="overlay-eyebrow">
              <ShieldCheckIcon aria-hidden="true" />
              {labels.noNetworkExport}
            </span>
            <h2>{labels.exportPreview}</h2>
            <p>
              {artifact.filename} ·{" "}
              {new TextEncoder()
                .encode(artifact.html)
                .byteLength.toLocaleString()}{" "}
              {labels.bytes}
            </p>
            <p className="export-read-only-note">
              {labels.readOnlyExportNotice}
            </p>
          </div>
          <div className="overlay-actions">
            <button
              className="export-download"
              type="button"
              onClick={onDownload}
            >
              <ArrowDownTrayIcon aria-hidden="true" />
              {labels.download}
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={labels.close}
              onClick={onClose}
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </div>
        </header>
        {artifact.warnings.length > 0 ? (
          <div className="export-findings" role="note">
            <strong>{labels.exportFindings}</strong>
            <ul>
              {artifact.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <iframe
          title={labels.exportPreviewFrame}
          sandbox=""
          srcDoc={artifact.html}
        />
      </section>
    </div>
  );
}
