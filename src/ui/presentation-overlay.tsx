import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  PlayIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import "./presentation-overlay.css";

import type { PresentationSection } from "../editor/presentation.ts";
import type { Labels } from "../i18n/en.ts";
import { renderDocumentMarkdown } from "../render/markdown.ts";
import { useDialogFocus } from "./use-dialog-focus.ts";

export function PresentationOverlay({
  labels,
  onClose,
  sections,
  source,
}: {
  labels: Labels;
  onClose: () => void;
  sections: PresentationSection[];
  source: string;
}) {
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closePresentation = useCallback(() => {
    if (document.fullscreenElement === backdropRef.current) {
      void document.exitFullscreen();
    }
    onClose();
  }, [onClose]);
  const { dialogRef, onKeyDown: trapDialogFocus } = useDialogFocus(null);
  const section = sections[index]!;
  const html = renderDocumentMarkdown(source.slice(section.from, section.to), {
    imageUnavailableLabel: labels.imageNotLoaded,
    resolveImage: () => null,
  });
  const previousPage = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index]);
  const nextPage = useCallback(() => {
    if (index < sections.length - 1) setIndex(index + 1);
  }, [index, sections.length]);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void backdropRef.current?.requestFullscreen().catch(() => undefined);
  }, []);
  const onDialogKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          closePresentation();
        }
        return;
      }
      trapDialogFocus(event);
    },
    [closePresentation, trapDialogFocus],
  );

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === backdropRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          closePresentation();
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previousPage();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextPage();
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [closePresentation, nextPage, previousPage]);

  return (
    <div
      ref={backdropRef}
      className={`presentation-backdrop${isFullscreen ? " is-fullscreen" : ""}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePresentation();
      }}
    >
      <section
        ref={dialogRef}
        className="presentation-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={labels.presentationTitle}
        onKeyDown={onDialogKeyDown}
      >
        <header>
          <span className="presentation-brand">
            <PlayIcon aria-hidden="true" />
            Yeli
          </span>
          <span aria-live="polite">
            {index + 1} / {sections.length}
          </span>
          <div className="presentation-actions">
            {document.fullscreenEnabled ? (
              <button
                className="icon-button"
                type="button"
                aria-label={
                  isFullscreen
                    ? labels.presentationExitFullscreen
                    : labels.presentationEnterFullscreen
                }
                onClick={toggleFullscreen}
              >
                {isFullscreen ? (
                  <ArrowsPointingInIcon aria-hidden="true" />
                ) : (
                  <ArrowsPointingOutIcon aria-hidden="true" />
                )}
              </button>
            ) : null}
            <button
              className="icon-button"
              type="button"
              aria-label={labels.presentationClose}
              onClick={closePresentation}
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </div>
        </header>
        <article className="presentation-page">
          <div
            className="markdown-document"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
        <footer>
          <button type="button" disabled={index === 0} onClick={previousPage}>
            <ArrowLeftIcon aria-hidden="true" />
            {labels.previousPage}
          </button>
          <strong>{section.title}</strong>
          <button
            type="button"
            disabled={index === sections.length - 1}
            onClick={nextPage}
          >
            {labels.nextPage}
            <ArrowRightIcon aria-hidden="true" />
          </button>
        </footer>
      </section>
    </div>
  );
}
