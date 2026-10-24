import { useEffect, useRef, type KeyboardEvent } from "react";

const FOCUSABLE =
  'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(
  onClose: (() => void) | null,
  initialFocusSelector?: string,
) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const initial = initialFocusSelector
      ? dialogRef.current?.querySelector<HTMLElement>(initialFocusSelector)
      : null;
    (
      initial ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    )?.focus();
  }, [initialFocusSelector]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { dialogRef, onKeyDown };
}
