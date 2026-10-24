import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

export function useBrandDetail() {
  const [visible, setVisible] = useState(false);
  const progress = useRef({
    taps: 0,
    deadline: 0,
    expiry: 0,
    hold: 0,
    pointer: null as { id: number; x: number; y: number } | null,
  });

  const cancelHold = useCallback(() => {
    window.clearTimeout(progress.current.hold);
    progress.current.hold = 0;
    progress.current.pointer = null;
  }, []);

  const reset = useCallback(() => {
    cancelHold();
    window.clearTimeout(progress.current.expiry);
    progress.current.taps = 0;
    progress.current.deadline = 0;
    progress.current.expiry = 0;
  }, [cancelHold]);

  useEffect(() => {
    const suspend = () => {
      reset();
      setVisible(false);
    };
    const onVisibility = () => {
      if (document.hidden) suspend();
    };
    window.addEventListener("blur", suspend);
    window.addEventListener("pointerup", cancelHold);
    window.addEventListener("pointercancel", cancelHold);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      reset();
      window.removeEventListener("blur", suspend);
      window.removeEventListener("pointerup", cancelHold);
      window.removeEventListener("pointercancel", cancelHold);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cancelHold, reset]);

  const markVersion = () => {
    if (visible) return;
    if (progress.current.deadline) {
      reset();
      return;
    }
    progress.current.taps += 1;
    window.clearTimeout(progress.current.expiry);
    if (progress.current.taps === 2) {
      progress.current.deadline = performance.now() + 6000;
    }
    progress.current.expiry = window.setTimeout(
      reset,
      progress.current.taps === 2 ? 6000 : 2000,
    );
  };

  const beginHold = () => {
    const state = progress.current;
    if (visible || state.hold || performance.now() + 2000 > state.deadline) {
      return;
    }
    state.hold = window.setTimeout(() => {
      if (performance.now() <= state.deadline) {
        reset();
        setVisible(true);
      } else {
        reset();
      }
    }, 2000);
  };

  return {
    visible,
    versionProps: {
      onClick: markVersion,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.repeat && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
        }
      },
    },
    brandProps: {
      onBlur: cancelHold,
      onContextMenu: (event: MouseEvent<HTMLButtonElement>) =>
        event.preventDefault(),
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (!event.isPrimary || event.button !== 0) {
          cancelHold();
          return;
        }
        beginHold();
        if (progress.current.hold) {
          progress.current.pointer = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const pointer = progress.current.pointer;
        if (
          pointer &&
          (event.pointerId !== pointer.id ||
            Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >
              12)
        ) {
          cancelHold();
        }
      },
      onPointerLeave: cancelHold,
      onPointerUp: cancelHold,
      onPointerCancel: cancelHold,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (
          event.key === " " &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          event.preventDefault();
          if (!event.repeat) beginHold();
        }
      },
      onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === " ") cancelHold();
      },
    },
  };
}
