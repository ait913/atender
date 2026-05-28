import { CalendarDays, Link2 } from "lucide-react";
import { EventTile } from "@/components/event-tile";
import type { CalendarEvent } from "@/lib/meetingExpansion";
import { assignLanes } from "@/lib/calendarLane";

export function CalendarDay({ events }: { date: string; events: CalendarEvent[] }) {
  const startHour = 9;
  const endHour = 21;
  const totalMinute = (endHour - startHour) * 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  const laneEvents = assignLanes(events);

  return (
    <div className="relative rounded-2xl bg-bg-elevated p-2 shadow-card">
      <div className="relative" style={{ height: `${(endHour - startHour) * 60}px` }}>
        {hours.map((hour) => (
          <div key={hour} className="absolute left-0 right-0 border-t border-fg-primary/8" style={{ top: `${((hour - startHour) / (endHour - startHour)) * 100}%` }}>
            <span className="absolute -top-2 left-0 w-10 text-[10px] font-bold text-fg-tertiary tabular-nums">{String(hour).padStart(2, "0")}</span>
          </div>
        ))}
        {laneEvents.map((event) => {
          const visibleStart = Math.max(event.startMinute, startHour * 60);
          const visibleEnd = Math.min(event.endMinute, endHour * 60);
          if (visibleEnd <= visibleStart) return null;
          const top = ((visibleStart - startHour * 60) / totalMinute) * 100;
          const height = ((visibleEnd - visibleStart) / totalMinute) * 100;
          const laneWidth = 88 / event.laneCount;
          const color = event.kind === "meeting" ? event.memberColor : roomEventColor(event);
          return (
            <EventTile
              key={event.kind === "meeting" ? `m:${event.userId}:${event.courseId}:${event.startMinute}` : `e:${event.eventId}`}
              density="compact"
              color={color}
              title={event.kind === "meeting" ? event.courseName : event.title}
              subtitle={`${event.kind === "meeting" ? event.memberName : event.authorName} · ${formatMinute(event.startMinute)}`}
              leadingIcon={<RoomEventIcon event={event} />}
              className="absolute"
              style={{
                top: `${top}%`,
                height: `${height}%`,
                left: `${12 + event.lane * laneWidth}%`,
                width: `calc(${laneWidth}% - 2px)`,
              }}
              ariaLabel={event.kind === "meeting" ? `${event.courseName} (${event.memberName})` : event.title}
            />
          );
        })}
      </div>
    </div>
  );
}

function roomEventColor(event: CalendarEvent) {
  if (event.kind === "meeting") return event.memberColor;
  if (event.kind === "personal") return event.authorColor;
  if (event.source === "GOOGLE_OAUTH") return "#38bdf8";
  if (event.source === "ICS_FILE" || event.source === "ICS_URL") return "#94a3b8";
  return event.authorColor;
}

function RoomEventIcon({ event }: { event: CalendarEvent }) {
  if (event.kind === "meeting" || event.kind === "personal") return null;
  if (event.source === "GOOGLE_OAUTH") return <CalendarDays className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />;
  if (event.source === "ICS_FILE" || event.source === "ICS_URL") return <Link2 className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />;
  return null;
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
