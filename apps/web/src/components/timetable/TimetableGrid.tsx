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
  const rendered = new Set<string>();

  return (
    <div
      className="grid gap-1 overflow-x-auto"
      style={{ gridTemplateColumns: "48px repeat(5, minmax(88px, 1fr))", gridTemplateRows: `32px repeat(${daySlots.length}, minmax(64px, auto))` }}
    >
      <div />
      {weekdays.map((day) => <div key={day.value} className="flex items-center justify-center text-sm font-semibold text-fg-secondary">{day.label}</div>)}
      {daySlots.map((slot) => (
        <Fragment key={slot.periodIndex}>
          <div key={`label-${slot.periodIndex}`} className="flex min-h-16 items-center justify-center rounded-md bg-bg-muted text-sm font-semibold text-fg-secondary">{slot.label}</div>
          {weekdays.map((day) => {
            const key = `${day.value}-${slot.periodIndex}`;
            if (rendered.has(key)) return null;
            const meeting = userTimetable.meetings.find((item) => item.dayOfWeek === day.value && item.startPeriodIndex === slot.periodIndex);
            if (meeting) {
              for (let index = 1; index < meeting.periodCount; index += 1) rendered.add(`${day.value}-${slot.periodIndex + index}`);
              const course = userTimetable.courses.find((item) => item.id === meeting.courseId);
              return (
                <div key={key} style={{ gridRow: `span ${meeting.periodCount}` }}>
                  <MeetingBlock meeting={meeting} course={course} daySlots={daySlots} onClick={() => onCellTap(day.value, slot.periodIndex, meeting.id)} />
                </div>
              );
            }
            return <EmptyCell key={key} onClick={() => onCellTap(day.value, slot.periodIndex)} />;
          })}
        </Fragment>
      ))}
    </div>
  );
}
