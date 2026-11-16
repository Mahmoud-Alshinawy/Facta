import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  DEFAULT_NOTE_COLUMN_WIDTH,
  NOTE_COLUMN_GUTTER,
  clampNoteColumnWidth,
  noteColumnWidthBounds,
  noteColumnWidthForKey,
  readNoteColumnWidth,
  saveNoteColumnWidth,
} from "@/lib/noteColumnWidth";

export default function ResizableNoteColumn({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  const article = useRef<HTMLElement>(null);
  const [preferredWidth, setPreferredWidth] = useState(readNoteColumnWidth);
  const [availableWidth, setAvailableWidth] = useState(
    DEFAULT_NOTE_COLUMN_WIDTH + NOTE_COLUMN_GUTTER,
  );
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    latestWidth: number;
  } | null>(null);
  const width = clampNoteColumnWidth(preferredWidth, availableWidth);
  const { min, max } = noteColumnWidthBounds(availableWidth);

  useEffect(() => {
    const pane = article.current?.parentElement;
    if (!pane) return;
    const measure = () => setAvailableWidth(pane.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  const rememberWidth = (next: number) => {
    setPreferredWidth(next);
    saveNoteColumnWidth(next);
  };
  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    saveNoteColumnWidth(active.latestWidth);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <article ref={article} className="ndoc" style={{ ...style, width }}>
      <div
        className="note-column-resize"
        role="separator"
        tabIndex={0}
        aria-label="Writing area width"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${width} pixels`}
        title="Drag to resize. Double-click or press Home to reset."
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: width,
            latestWidth: width,
          };
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.pointerId !== event.pointerId) return;
          const next = clampNoteColumnWidth(
            active.startWidth + 2 * (event.clientX - active.startX),
            availableWidth,
          );
          active.latestWidth = next;
          setPreferredWidth(next);
        }}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onLostPointerCapture={finishResize}
        onDoubleClick={() => rememberWidth(DEFAULT_NOTE_COLUMN_WIDTH)}
        onKeyDown={(event) => {
          const next = noteColumnWidthForKey(width, event.key, availableWidth);
          if (next === null) return;
          event.preventDefault();
          rememberWidth(next);
        }}
      />
      {children}
    </article>
  );
}
