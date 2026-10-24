import { XMarkIcon } from "@heroicons/react/24/outline";

import type { Labels } from "../i18n/en.ts";
import { useDialogFocus } from "./use-dialog-focus.ts";

export interface ImagePreviewTarget {
  alternative: string;
  source: string;
}

export function ImagePreview({
  image,
  labels,
  onClose,
}: {
  image: ImagePreviewTarget;
  labels: Labels;
  onClose: () => void;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus(onClose);

  return (
    <div
      className="overlay-backdrop image-preview-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="image-preview"
        role="dialog"
        aria-modal="true"
        aria-label={labels.imagePreview}
        onKeyDown={onKeyDown}
      >
        <button
          className="image-preview-close"
          type="button"
          aria-label={labels.close}
          onClick={onClose}
        >
          <XMarkIcon aria-hidden="true" />
        </button>
        <img src={image.source} alt={image.alternative} draggable={false} />
        {image.alternative ? (
          <p className="image-preview-caption">{image.alternative}</p>
        ) : null}
      </section>
    </div>
  );
}
