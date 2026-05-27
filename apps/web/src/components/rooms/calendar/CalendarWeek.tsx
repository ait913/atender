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
    <div className="space-y-2">
      {dates.map((dateString) => {
        const events = eventsByDateMap.get(dateString) ?? [];
        const selected = dateString === selectedDate;
        return (
          <section
            key={dateString}
            className={`rounded-2xl bg-bg-elevated p-3 shadow-card transition ${selected ? "ring-2 ring-accent-500" : ""}`}
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
                  const color = event.kind === "meeting" ? event.memberColor : event.authorColor;
                  const subColor = `color-mix(in srgb, ${color} 70%, white 30%)`;
                  return (
                    <li
                      key={eventKey(event)}
                      className="relative overflow-hidden rounded-xl border border-white/10"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        backdropFilter: "blur(20px) saturate(140%)",
                        WebkitBackdropFilter: "blur(20px) saturate(140%)",
                      }}
                    >
                      <span
                        className="absolute left-0 top-1 bottom-1 w-1.5 rounded-full"
                        style={{ background: color, boxShadow: `0 0 12px ${color}, inset 0 0 4px rgba(255,255,255,0.4)` }}
                      />
                      <div className="flex items-baseline gap-2 pl-3.5 pr-2 py-2">
                        <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ color: subColor }}>
                          {formatMinute(event.startMinute)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg-primary">
                          {event.kind === "meeting" ? event.courseName : event.title}
                        </span>
                        <span className="shrink-0 text-[11px]" style={{ color: subColor }}>
                          {event.kind === "meeting" ? event.memberName : event.authorName}
                        </span>
                      </div>
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

function eventKey(event: CalendarEvent) {
  return event.kind === "meeting" ? `m:${event.userId}:${event.courseId}:${event.date}:${event.startMinute}` : `e:${event.eventId}`;
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
