import { useEffect, useRef, type ReactNode } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";

export default function NotesDialog({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useDialogFocus(ref, true);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, []);
  return (
    <div className="scrim notes-scrim" onMouseDown={onClose}>
      <div
        ref={ref}
        className={`modal notes-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="notes-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="ctl" onClick={onClose}>
            Close <span className="kbd">Esc</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
