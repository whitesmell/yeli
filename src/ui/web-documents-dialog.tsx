import { useEffect, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { Labels } from "../i18n/en.ts";
import type { Locale } from "../i18n/locale.ts";
import type { WebSessionSummary } from "../storage/web-sessions.ts";
import { useDialogFocus } from "./use-dialog-focus.ts";
import "./web-documents.css";

export function WebChoiceDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus(onClose ?? null);
  useEffect(() => {
    if (!dialogRef.current?.querySelector("button")) dialogRef.current?.focus();
  }, [dialogRef]);
  return (
    <div className="overlay-backdrop recovery-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="recovery-dialog web-documents-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
      >
        <h2>{title}</h2>
        <p>{description}</p>
        {children}
      </section>
    </div>
  );
}

export function WebDocumentsDialog({
  documents,
  labels,
  locale,
  description,
  onSelect,
  onClose,
  onNew,
  onOpen,
  newLabel,
}: {
  newLabel?: string;
  documents: WebSessionSummary[];
  labels: Labels;
  locale: Locale;
  description: string;
  onSelect: (session: WebSessionSummary) => void;
  onClose?: () => void;
  onNew: () => void;
  onOpen?: () => void;
}) {
  return (
    <WebChoiceDialog
      title={labels.webLocalDocuments}
      description={description}
      {...(onClose ? { onClose } : {})}
    >
      {onClose ? (
        <button
          className="icon-button web-documents-close"
          aria-label={labels.close}
          onClick={onClose}
        >
          <XMarkIcon aria-hidden="true" />
        </button>
      ) : null}
      {documents.length ? (
        <ul className="web-documents-list">
          {documents.map((session) => (
            <li key={session.localInstanceId}>
              <button type="button" onClick={() => onSelect(session)}>
                <strong>{session.filename}</strong>
                <span>
                  {session.hasDraft
                    ? labels.webHasDraft
                    : labels.webBaselineOnly}
                </span>
                <time dateTime={new Date(session.updatedAt).toISOString()}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(session.updatedAt)}
                </time>
                <small>
                  {session.baseline.source.slice(0, 100) ||
                    labels.unnamedDocument}
                </small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{labels.webEmptyDocuments}</p>
      )}
      <div className="web-document-actions">
        <button type="button" className="primary-action" onClick={onNew}>
          {newLabel ?? labels.webNewDocument}
        </button>
        {onOpen ? (
          <button type="button" className="secondary-action" onClick={onOpen}>
            {labels.openFile}
          </button>
        ) : null}
      </div>
    </WebChoiceDialog>
  );
}
