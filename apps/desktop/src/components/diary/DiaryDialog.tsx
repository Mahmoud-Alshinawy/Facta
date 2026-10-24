import { useEffect, useRef, type ReactNode } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";

export default function DiaryDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useDialogFocus(ref, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="scrim diary-scrim" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="modal diary-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="diary-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="ctl" onClick={onClose}>
            Close <span className="kbd">Esc</span>
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
