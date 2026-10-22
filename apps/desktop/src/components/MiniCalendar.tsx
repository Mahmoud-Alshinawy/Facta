import { useEvents } from "@/hooks/useEvents";
import { format } from "date-fns";
import DatePickerGrid from "./dialogs/DatePickerGrid";

interface MiniCalendarProps {
  currentMonth: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onMonthChange: (date: Date) => void;
}

export default function MiniCalendar({
  currentMonth,
  selectedDate,
  onSelectDate,
  onMonthChange,
}: MiniCalendarProps) {
  const { getEventsForDate } = useEvents();
  return (
    <div className="mini-calendar select-none">
      <DatePickerGrid
        mini
        id="mini-month"
        selected={selectedDate}
        month={currentMonth}
        onSelect={onSelectDate}
        onMonth={onMonthChange}
        hasEvent={(date) =>
          getEventsForDate(format(date, "yyyy-MM-dd")).length > 0
        }
      />
      <p className="mini-calendar-hint">
        Arrows move · Enter selects · PgUp/PgDn change month
      </p>
    </div>
  );
}
