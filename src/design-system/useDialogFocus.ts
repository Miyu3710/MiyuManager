import { useEffect, useRef } from "react";

interface DialogFocusOptions {
  open?: boolean;
  onEscape?: () => void;
  initialFocusSelector?: string;
}

const focusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function useDialogFocus<T extends HTMLElement>({
  open = true,
  onEscape,
  initialFocusSelector = focusableSelector,
}: DialogFocusOptions = {}) {
  const dialogRef = useRef<T>(null);
  const escapeRef = useRef(onEscape);

  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialog = dialogRef.current;
    const root = document.getElementById("root");
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousInert = root?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (root) {
      root.inert = true;
    }
    document.body.style.overflow = "hidden";

    const focusInitial = () => {
      const preferred = dialog?.querySelector<HTMLElement>(initialFocusSelector);
      (preferred ?? dialog)?.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusInitial);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialog) {
        return;
      }
      if (event.key === "Escape") {
        escapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      if (root) {
        root.inert = previousInert;
      }
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [initialFocusSelector, open]);

  return dialogRef;
}
