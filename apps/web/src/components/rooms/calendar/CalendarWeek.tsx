import dayjs from "dayjs";
import { CalendarDays, Link2 } from "lucide-react";
import { EventTile } from "@/components/event-tile";
import { eventColor, eventTitle } from "@/lib/calendarEventDisplay";
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
    <div className="space-y-2">
      {dates.map((dateString) => {
        const events = eventsByDateMap.get(dateString) ?? [];
        const selected = dateString === selectedDate;
        return (
          <section
            key={dateString}
            className={`rounded-2xl bg-bg-elevated p-2 shadow-card transition ${selected ? "ring-2 ring-accent-500" : ""}`}
          >
            <header className="mb-2 flex items-center justify-between gap-2">
              <button type="button" onClick={() => onSelectDate(dateString)} className="text-sm font-black text-fg-primary">
                {dayjs(dateString).format("M/D")}
              </button>
              <span className="text-xs font-bold text-fg-tertiary">{events.length} 件</span>
            </header>
            {events.length > 0 ? (
              <ul className="space-y-2">
                {events.map((event) => {
                  const color = eventColor(event);
                  return (
                    <li
                      key={eventKey(event)}
                    >
                      <EventTile
                        density="compact"
                        color={color}
                        title={eventTitle(event)}
                        subtitle={event.kind === "meeting" ? event.memberName : event.authorName}
                        leadingIcon={<RoomEventIcon event={event} />}
                        badge={
                          <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color }}>
                            {formatMinute(event.startMinute)}
                          </span>
                        }
                      />
                    </li>
                  );
                })}
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

function RoomEventIcon({ event }: { event: CalendarEvent }) {
  if (event.kind === "meeting" || event.kind === "personal") return null;
  if (event.source === "GOOGLE_OAUTH") return <CalendarDays className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />;
  if (event.source === "ICS_FILE" || event.source === "ICS_URL") return <Link2 className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />;
  return null;
}

function eventKey(event: CalendarEvent) {
  return event.kind === "meeting" ? `m:${event.userId}:${event.courseId}:${event.date}:${event.startMinute}` : `e:${event.eventId}`;
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
