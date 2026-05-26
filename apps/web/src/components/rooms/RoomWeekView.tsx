import type { RoomWeekDto } from "@atender/shared";

const dayLabels = ["月", "火", "水", "木", "金", "土", "日"];
const periods = [1, 2, 3, 4, 5];

export function RoomWeekView({ week }: { week: RoomWeekDto }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-[56px_repeat(7,minmax(84px,1fr))] overflow-hidden rounded-md border-l border-t border-border-subtle text-xs">
        <div className="border-b border-r border-border-subtle bg-bg-muted" />
        {dayLabels.map((day) => <div key={day} className="border-b border-r border-border-subtle bg-bg-muted p-2 text-center font-semibold">{day}</div>)}
        {periods.map((period) => (
          <>
            <div key={`p-${period}`} className="border-b border-r border-border-subtle bg-bg-muted p-2 text-center font-semibold">{period}</div>
            {dayLabels.map((_, day) => {
              const date = new Date(new Date(week.weekStart).getTime() + day * 86400000).toISOString().slice(0, 10);
              const meetings = week.meetings.filter((m) => m.date === date && m.startMinute < 540 + period * 100 && m.endMinute > 440 + period * 100);
              const events = week.roomEvents.filter((event) => event.start.slice(0, 10) === date);
              return (
                <div key={`${day}-${period}`} className="min-h-16 border-b border-r border-border-subtle p-1">
                  {events[0] ? <div className="rounded-sm bg-room-event px-1 py-0.5 font-semibold text-white">{events[0].title}</div> : null}
                  {meetings[0] ? <div className="mt-1 rounded-sm bg-accent-50 px-1 py-0.5 text-accent-700">{meetings.length === 1 ? meetings[0].courseName : `${meetings.length} 人`}</div> : null}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
