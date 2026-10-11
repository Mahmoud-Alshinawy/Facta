import { useState, useEffect, useRef, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Search, X, Calendar, Target, Clock } from "lucide-react";
import { CalendarEvent, COLOR_MAP } from "@/hooks/useEvents";
import { Goal, CATEGORY_META } from "@/hooks/useGoals";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  goals: Goal[];
  onSelectEvent: (event: CalendarEvent) => void;
  onGoToDate: (date: Date, view: "day") => void;
}

type Result =
  | { kind: "event"; event: CalendarEvent }
  | { kind: "goal"; goal: Goal };

export default function SearchModal({ open, onClose, events, goals, onSelectEvent, onGoToDate }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const matchedEvents: Result[] = events
      .filter((e) => e.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((event) => ({ kind: "event", event }));

    const matchedGoals: Result[] = goals
      .filter((g) => g.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((goal) => ({ kind: "goal", goal }));

    return [...matchedEvents, ...matchedGoals];
  }, [query, events, goals]);

  useEffect(() => {
    setCursor(0);
  }, [results.length]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === "Enter" && results[cursor]) {
        handleSelect(results[cursor]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, cursor, results]);

  function handleSelect(result: Result) {
    if (result.kind === "event") {
      onSelectEvent(result.event);
      onGoToDate(parseISO(result.event.date), "day");
    } else {
      onGoToDate(parseISO(result.goal.date), "day");
    }
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg mx-4 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search events and goals…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={15} />
            </button>
          )}
          <kbd className="hidden sm:flex items-center text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </div>
          )}

          {!query && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              <Search size={24} className="mx-auto mb-2 opacity-30" />
              Type to search events and goals
            </div>
          )}

          {results.map((result, i) => (
            <button
              key={result.kind === "event" ? result.event.id : result.goal.id}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setCursor(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === cursor ? "bg-primary/8 text-foreground" : "text-foreground hover:bg-muted/60"
              }`}
            >
              {result.kind === "event" ? (
                <>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLOR_MAP[result.event.color].bg}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{result.event.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Calendar size={10} />
                      {format(parseISO(result.event.date), "EEE, MMM d")}
                      {!result.event.allDay && (
                        <>
                          <Clock size={10} />
                          {result.event.startTime}
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">
                    Event
                  </span>
                </>
              ) : (
                <>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${CATEGORY_META[result.goal.category].bg}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{result.goal.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Target size={10} />
                      {CATEGORY_META[result.goal.category].label}
                      <Calendar size={10} />
                      {format(parseISO(result.goal.date), "EEE, MMM d")}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">
                    Goal
                  </span>
                </>
              )}
            </button>
          ))}
        </div>

        {results.length > 0 && (
          <div className="border-t border-border px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span><kbd className="font-mono border border-border rounded px-1">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono border border-border rounded px-1">↵</kbd> open</span>
            <span><kbd className="font-mono border border-border rounded px-1">esc</kbd> close</span>
          </div>
        )}
      </div>
    </div>
  );
}
