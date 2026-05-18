import type { UserTimetableDto } from "@atender/shared";
import { Fragment } from "react";
import { EmptyCell } from "./EmptyCell";
import { MeetingBlock } from "./MeetingBlock";
import { weekdays } from "./helpers";

export function TimetableGrid({
  userTimetable,
  onCellTap,
}: {
  userTimetable: UserTimetableDto;
  onCellTap: (day: number, periodIndex: number, meetingId?: string) => void;
}) {
  const daySlots = [...userTimetable.daySlots].sort((a, b) => a.periodIndex - b.periodIndex);
  const occupied = new Set<string>();
  for (const meeting of userTimetable.meetings) {
    for (let index = 1; index < meeting.periodCount; index += 1) occupied.add(`${meeting.dayOfWeek}-${meeting.startPeriodIndex + index}`);
  }

  return (
    <div
      className="grid gap-1 overflow-x-auto"
      style={{ gridTemplateColumns: "48px repeat(5, minmax(88px, 1fr))", gridTemplateRows: `32px repeat(${daySlots.length}, minmax(64px, 64px))` }}
    >
      <div style={{ gridColumn: 1, gridRow: 1 }} />
      {weekdays.map((day) => <div key={day.value} className="flex items-center justify-center text-sm font-semibold text-fg-secondary" style={{ gridColumn: day.value + 1, gridRow: 1 }}>{day.label}</div>)}
      {daySlots.map((slot) => (
        <Fragment key={slot.periodIndex}>
          <div key={`label-${slot.periodIndex}`} className="flex min-h-0 items-center justify-center rounded-md bg-bg-muted text-sm font-semibold text-fg-secondary" style={{ gridColumn: 1, gridRow: slot.periodIndex + 1 }}>{slot.label}</div>
          {weekdays.map((day) => {
            const key = `${day.value}-${slot.periodIndex}`;
            if (occupied.has(key)) return null;
            const meeting = userTimetable.meetings.find((item) => item.dayOfWeek === day.value && item.startPeriodIndex === slot.periodIndex);
            if (meeting) {
              const course = userTimetable.courses.find((item) => item.id === meeting.courseId);
              return (
                <div key={key} className="min-h-0" style={{ gridColumn: day.value + 1, gridRow: `${meeting.startPeriodIndex + 1} / span ${meeting.periodCount}` }}>
                  <MeetingBlock meeting={meeting} course={course} daySlots={daySlots} onClick={() => onCellTap(day.value, slot.periodIndex, meeting.id)} />
                </div>
              );
            }
            return <div key={key} className="min-h-0" style={{ gridColumn: day.value + 1, gridRow: slot.periodIndex + 1 }}><EmptyCell onClick={() => onCellTap(day.value, slot.periodIndex)} /></div>;
          })}
        </Fragment>
      ))}
    </div>
  );
}
