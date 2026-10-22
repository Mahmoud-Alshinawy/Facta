import { useEffect, useRef } from "react";

export default function InlineConfirm({
  question,
  keep,
  commit,
  onCancel,
  onConfirm,
  busy = false,
}: {
  question: string;
  keep: string;
  commit: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keepRef.current?.focus();
  }, []);
  return (
    <div
      className="inline-confirm"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <span role="alert">{question}</span>
      <button
        ref={keepRef}
        type="button"
        className="b b-quiet"
        disabled={busy}
        onClick={onCancel}
      >
        {keep}
      </button>
      <button
        type="button"
        className="b b-commit b-danger"
        disabled={busy}
        onClick={onConfirm}
      >
        <span>{busy ? "Working…" : commit}</span>
      </button>
    </div>
  );
}
