import dayjs from "dayjs";
import type { CalendarEvent } from "@/lib/meetingExpansion";

export function CalendarWeek({
  weekStart,
  selectedDate,
  eventsByDateMap,
  onSelectDate,
}: {
  weekStart: string;
  selectedDate: string;
  eventsByDateMap: Map<string, CalendarEvent[]>;
  onSelectDate: (date: string) => void;
}) {
  const dates = Array.from({ length: 7 }, (_, index) => dayjs(weekStart).add(index, "day").format("YYYY-MM-DD"));

  return (
    <div className="space-y-3">
      {dates.map((dateString) => {
        const events = eventsByDateMap.get(dateString) ?? [];
        const selected = dateString === selectedDate;
        return (
          <section
            key={dateString}
            className={`rounded-3xl bg-bg-elevated p-4 shadow-card transition ${selected ? "ring-2 ring-accent-500" : ""}`}
          >
            <header className="mb-2 flex items-center justify-between gap-3">
              <button type="button" onClick={() => onSelectDate(dateString)} className="text-sm font-black text-fg-primary">
                {dayjs(dateString).format("M/D")}
              </button>
              <span className="text-xs font-bold text-fg-tertiary">{events.length} 件</span>
            </header>
            {events.length > 0 ? (
              <ul className="space-y-2">
                {events.map((event) => (
                  <li key={eventKey(event)} className="flex min-w-0 items-center gap-2 text-sm">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: event.kind === "meeting" ? event.memberColor : event.authorColor }}
                    />
                    <span className="shrink-0 font-bold tabular-nums text-fg-secondary">{formatMinute(event.startMinute)}</span>
                    <span className="truncate text-fg-primary">
                      {event.kind === "meeting" ? `${event.courseName} (${event.memberName})` : `${event.title} (RoomEvent)`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-tertiary">予定なし</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function eventKey(event: CalendarEvent) {
  return event.kind === "meeting" ? `m:${event.userId}:${event.courseId}:${event.date}:${event.startMinute}` : `e:${event.eventId}`;
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
