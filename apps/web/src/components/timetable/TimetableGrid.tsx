import type { UserTimetableDto } from "@atender/shared";
import { Fragment } from "react";
import { EmptyCell } from "./EmptyCell";
import { MeetingBlock } from "./MeetingBlock";
import { PeriodLabel } from "./PeriodLabel";
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
      className="grid grid-cols-[56px_repeat(5,minmax(0,1fr))] gap-0 border-t border-l border-border-subtle rounded-md overflow-hidden bg-bg-base"
      style={{ gridTemplateRows: `32px repeat(${daySlots.length}, minmax(72px, 72px))` }}
    >
      <div className="border-r border-b border-border-subtle bg-bg-muted" style={{ gridColumn: 1, gridRow: 1 }} />
      {weekdays.map((day) => <div key={day.value} className="flex items-center justify-center border-r border-b border-border-subtle bg-bg-muted text-sm font-medium text-fg-secondary" style={{ gridColumn: day.value + 1, gridRow: 1 }}>{day.label}</div>)}
      {daySlots.map((slot) => (
        <Fragment key={slot.periodIndex}>
          <PeriodLabel key={`label-${slot.periodIndex}`} periodIndex={slot.periodIndex} startMinute={slot.startMinute} endMinute={slot.endMinute} style={{ gridColumn: 1, gridRow: slot.periodIndex + 1 }} />
          {weekdays.map((day) => {
            const key = `${day.value}-${slot.periodIndex}`;
            if (occupied.has(key)) return null;
            const meeting = userTimetable.meetings.find((item) => item.dayOfWeek === day.value && item.startPeriodIndex === slot.periodIndex);
            if (meeting) {
              const course = userTimetable.courses.find((item) => item.id === meeting.courseId);
              return <MeetingBlock key={key} meeting={meeting} course={course} daySlots={daySlots} onClick={() => onCellTap(day.value, slot.periodIndex, meeting.id)} style={{ gridColumn: day.value + 1, gridRow: `${meeting.startPeriodIndex + 1} / span ${meeting.periodCount}` }} />;
            }
            return <EmptyCell key={key} day={day.label} periodIndex={slot.periodIndex} onClick={() => onCellTap(day.value, slot.periodIndex)} style={{ gridColumn: day.value + 1, gridRow: slot.periodIndex + 1 }} />;
          })}
        </Fragment>
      ))}
    </div>
  );
}
