import { useMemo } from "react";
import { useNotes } from "@/hooks/useNotes";
import { useDiary } from "@/hooks/useDiary";
import { useNow } from "@/hooks/useNow";
import { keyOf } from "@/lib/calendarData";
import { projectWidgetJournal } from "@/lib/widgetJournal";
import type { WidgetConfig } from "@/lib/widgetConfig";
import {
  NotesCard,
  DiaryCard,
} from "../../../../widgets/src/components/JournalCards";

export default function JournalPreview({
  widget,
}: {
  widget: Pick<WidgetConfig, "type" | "theme" | "translucent" | "noteStyle">;
}) {
  const { notes } = useNotes(),
    { entries } = useDiary(),
    now = useNow(),
    date = keyOf(now);
  const journal = useMemo(
    () => projectWidgetJournal(notes, entries, date),
    [notes, entries, date],
  );
  const props = {
    theme: widget.theme,
    translucent: widget.translucent,
    journal,
    disabled: true,
  };
  return (
    <div
      className="widget-preview-stage"
      role="img"
      aria-label={`${widget.type === "notes" ? `Notes ${widget.noteStyle ?? "sticky"}` : "Diary"} widget preview, ${widget.theme}, ${widget.translucent ? "transparent" : "solid"}`}
    >
      <div className="widget-preview-wallpaper" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <fieldset disabled aria-hidden="true" className="widget-journal-preview">
        {widget.type === "notes" ? (
          <NotesCard {...props} style={widget.noteStyle ?? "sticky"} />
        ) : (
          <DiaryCard {...props} />
        )}
      </fieldset>
    </div>
  );
}
