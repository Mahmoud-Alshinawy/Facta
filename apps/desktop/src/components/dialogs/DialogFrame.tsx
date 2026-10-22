import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { Commit } from "../calendar/common";
import { IconArrow, IconTrash } from "../shell/Icons";

export default function DialogFrame({ labelledBy, className, children, error, onSave, onClose, onDelete, noun, editing, summary }: {
  labelledBy: string; className: string; children: ReactNode; error: string; onSave: () => void;
  onClose: () => void; onDelete?: () => void; noun: "goal" | "event"; editing: boolean; summary?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [blocked, setBlocked] = useState({ text: "", attempt: 0 });
  useDialogFocus(ref, true);
  useEffect(() => { setBlocked((old) => ({ ...old, text: "" })); }, [error]);
  const save = () => {
    if (confirming) return;
    if (error) { setBlocked((old) => ({ text: error, attempt: old.attempt + 1 })); return; }
    onSave();
  };
  const confirm = (next: boolean) => {
    setConfirming(next);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(next ? "[data-keep]" : "[data-delete]")?.focus());
  };
  return <div className="dialog-scrim dlg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <form ref={ref} className={`sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} noValidate
      onSubmit={(e) => { e.preventDefault(); save(); }}
      onKeyDown={(e) => {
        if (e.defaultPrevented || e.nativeEvent.isComposing) return;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (confirming) confirm(false); else onClose(); }
        else if (e.key === "Enter" && !e.shiftKey && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); save(); }
      }}>
      {children}
      <div className="dialog-validation" aria-live="assertive" aria-atomic="true"><span key={blocked.attempt}>{blocked.text}</span></div>
      <div className="dialog-footer">
        {onDelete && !confirming && <button type="button" className="b b-del" data-delete onClick={() => confirm(true)}><IconTrash />Delete {noun}</button>}
        {!onDelete && summary && <span className="dialog-note">{summary}</span>}
        <span className="flex-1" />
        {confirming ? <><span role="alert">Delete {noun === "goal" ? "for good" : "this event"}?</span>
          <button type="button" className="b b-quiet" data-keep onClick={() => confirm(false)}>Keep it</button>
          <Commit danger onClick={onDelete}><IconTrash />Delete</Commit></>
          : <><button type="button" className="b b-quiet" onClick={onClose}>Cancel <span className="hint">Esc</span></button>
            <Commit type="submit" disabled={!!error} keyHint="Enter">{editing ? "Save changes" : `Create ${noun}`}<IconArrow className="arrow" /></Commit></>}
      </div>
    </form>
  </div>;
}
