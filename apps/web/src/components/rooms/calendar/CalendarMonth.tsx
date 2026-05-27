import dayjs, { type Dayjs } from "dayjs";
import type { CalendarEvent } from "@/lib/meetingExpansion";

function mondayOf(date: Dayjs) {
  const day = date.day();
  return date.startOf("day").subtract(day === 0 ? 6 : day - 1, "day");
}

export function CalendarMonth({
  anchor,
  selectedDate,
  events,
  onSelectDate,
}: {
  anchor: Dayjs;
  selectedDate: string;
  events: CalendarEvent[];
  onSelectDate: (date: string) => void;
}) {
  const gridStart = mondayOf(anchor.startOf("month"));
  const monthEnd = anchor.endOf("month");
  const gridEnd = (monthEnd.day() === 0 ? mondayOf(monthEnd.add(1, "day")) : mondayOf(monthEnd)).add(6, "day");
  const dates = Array.from({ length: gridEnd.diff(gridStart, "day") + 1 }, (_, index) => gridStart.add(index, "day").format("YYYY-MM-DD"));
  const dotsByDate = new Map<string, string[]>();

  for (const event of events) {
    const dots = dotsByDate.get(event.date) ?? [];
    const color = event.kind === "meeting" ? event.memberColor : event.authorColor;
    if (!dots.includes(color)) dots.push(color);
    dotsByDate.set(event.date, dots);
  }

  return (
    <div className="grid grid-cols-7 gap-1">
      {["月", "火", "水", "木", "金", "土", "日"].map((day) => (
        <div key={day} className="py-2 text-center text-xs font-bold text-fg-tertiary">{day}</div>
      ))}
      {dates.map((dateString) => {
        const date = dayjs(dateString);
        const inMonth = date.month() === anchor.month();
        const isSelected = dateString === selectedDate;
        const isToday = dateString === dayjs().format("YYYY-MM-DD");
        const dots = (dotsByDate.get(dateString) ?? []).slice(0, 3);

        return (
          <button
            key={dateString}
            type="button"
            onClick={() => onSelectDate(dateString)}
            className={`flex h-12 flex-col items-center justify-center rounded-2xl transition active:scale-95 ${
              isSelected
                ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
                : inMonth
                  ? "text-fg-primary hover:bg-fg-primary/6"
                  : "text-fg-tertiary"
            } ${isToday && !isSelected ? "ring-2 ring-accent-500/40" : ""}`}
            aria-label={date.format("M月D日")}
            aria-pressed={isSelected}
          >
            <span className="text-sm font-black leading-none">{date.date()}</span>
            <span className="mt-1 flex h-1 items-center gap-0.5">
              {dots.map((color, index) => (
                <span key={`${color}:${index}`} className="h-1 w-1 rounded-full" style={{ background: color }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
