import dayjs from "dayjs";
import { eventColor, eventTitle } from "@/lib/calendarEventDisplay";
import type { CalendarEvent } from "@/lib/meetingExpansion";

export function DayAgendaPanel({
  date,
  events,
}: {
  date: string;
  events: CalendarEvent[];
}) {
  const sortedEvents = [...events].sort((a, b) => a.startMinute - b.startMinute);

  return (
    <section className="space-y-2 rounded-2xl bg-bg-elevated p-3 shadow-card">
      <h3 className="text-sm font-bold text-fg-primary">{dayjs(date).format("M/D")} の予定</h3>
      {sortedEvents.length > 0 ? (
        <ul className="space-y-2">
          {sortedEvents.map((event) => {
            const color = eventColor(event);
            return (
              <li
                key={event.kind === "meeting" ? `m:${event.userId}:${event.courseId}:${event.date}:${event.startMinute}` : `e:${event.eventId}`}
                className="flex min-w-0 items-center gap-2"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-primary">{eventTitle(event)}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-fg-tertiary">
                  {formatMinute(event.startMinute)}-{formatMinute(event.endMinute)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-fg-tertiary">予定はありません</p>
      )}
    </section>
  );
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
