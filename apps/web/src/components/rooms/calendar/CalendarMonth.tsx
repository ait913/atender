import dayjs, { type Dayjs } from "dayjs";
import type { AttendanceDaySummary } from "@atender/shared";
import { dayStatusColor, eventColor, eventTitle } from "@/lib/calendarEventDisplay";
import { monthGridRange } from "@/lib/calendarRange";
import type { CalendarEvent } from "@/lib/meetingExpansion";

export function CalendarMonth({
  anchor,
  selectedDate,
  events,
  statusByDate,
  onSelectDate,
  maxChipsPerCell = 3,
}: {
  anchor: Dayjs;
  selectedDate: string;
  events: CalendarEvent[];
  statusByDate?: Map<string, AttendanceDaySummary["status"]>;
  onSelectDate: (date: string) => void;
  maxChipsPerCell?: number;
}) {
  const range = monthGridRange(anchor);
  const gridStart = dayjs(range.start);
  const gridEnd = dayjs(range.end);
  const dates = Array.from({ length: gridEnd.diff(gridStart, "day") + 1 }, (_, index) => gridStart.add(index, "day").format("YYYY-MM-DD"));
  const eventsByDate = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const list = eventsByDate.get(event.date) ?? [];
    list.push(event);
    eventsByDate.set(event.date, list);
  }

  return (
    <div className="rounded-2xl bg-bg-elevated p-2 shadow-card">
      <div className="grid grid-cols-7 gap-px">
        {["月", "火", "水", "木", "金", "土", "日"].map((day) => (
          <div key={day} className="py-2 text-center text-xs font-bold text-fg-tertiary">{day}</div>
        ))}
        {dates.map((dateString) => {
          const date = dayjs(dateString);
          const inMonth = date.month() === anchor.month();
          const isSelected = dateString === selectedDate;
          const isToday = dateString === dayjs().format("YYYY-MM-DD");
          const dayEvents = (eventsByDate.get(dateString) ?? []).sort((a, b) => a.startMinute - b.startMinute);
          const visibleEvents = inMonth ? dayEvents.slice(0, maxChipsPerCell) : [];
          const extraCount = inMonth ? dayEvents.length - visibleEvents.length : 0;
          const status = statusByDate?.get(dateString);
          const showStatusDot = inMonth && status != null && status !== "NO_CLASS";

          return (
            <button
              key={dateString}
              type="button"
              onClick={() => onSelectDate(dateString)}
              className={`min-h-24 min-w-0 rounded-sm p-0.5 text-left transition active:scale-95 ${
                isSelected
                  ? "text-fg-primary"
                  : inMonth
                    ? "text-fg-primary hover:bg-fg-primary/6"
                    : "text-fg-tertiary"
              }`}
              aria-label={date.format("M月D日")}
              aria-pressed={isSelected}
            >
              <span className="mb-1 flex min-w-0 items-center gap-1">
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none ${
                    isSelected
                      ? "bg-accent-500 text-fg-on-accent"
                      : isToday && inMonth
                        ? "text-accent-500"
                        : ""
                  }`}
                >
                  {date.date()}
                </span>
                {showStatusDot && status ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dayStatusColor(status) }} />
                ) : null}
              </span>
              {visibleEvents.length > 0 ? (
                <span className="block space-y-0.5">
                  {visibleEvents.map((event) => {
                    const color = eventColor(event);
                    return (
                      <span
                        key={event.kind === "meeting" ? `m:${event.userId}:${event.courseId}:${event.date}:${event.startMinute}` : `${event.kind}:${event.eventId}:${event.date}`}
                        className="block truncate rounded-[4px] px-1 py-0.5 text-[10px] font-semibold leading-tight text-fg-primary"
                        style={{ background: `color-mix(in srgb, ${color} 18%, var(--color-bg-elevated))` }}
                      >
                        {eventTitle(event)}
                      </span>
                    );
                  })}
                  {extraCount > 0 ? (
                    <span className="block truncate text-[10px] font-semibold leading-tight text-fg-tertiary">+{extraCount}</span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
