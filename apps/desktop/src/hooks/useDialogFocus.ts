import { useEffect, type RefObject } from "react";
import { FOCUSABLE, trapTab } from "@/lib/focusTrap";

/**
 * While `open`: focuses the element marked data-autofocus (else the dialog),
 * keeps Tab inside the dialog, and on close puts focus back where it was.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;
    const auto = root.querySelector<HTMLElement>("[data-autofocus]");
    // After paint, so the browser doesn't scroll to an element still moving in.
    const raf = requestAnimationFrame(() => (auto ?? root).focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      const to = trapTab(list.indexOf(document.activeElement as HTMLElement), list.length, e.shiftKey);
      if (to === null) return;
      e.preventDefault();
      (to === -1 ? root : list[to]).focus();
    };
    root.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("keydown", onKey);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref, open]);
}
