import { Fragment, useMemo } from "react";
import type { MeetingDto, UserTimetableDto } from "@atender/shared";
import { EmptyCell } from "./EmptyCell";
import { MeetingBlock } from "./MeetingBlock";
import { PeriodLabel } from "./PeriodLabel";

const days = ["月", "火", "水", "木", "金"];

export function TimetableGrid({
  timetable,
  onEmptyCellClick,
  onMeetingClick,
}: {
  timetable: UserTimetableDto;
  onEmptyCellClick: (dayOfWeek: number, periodIndex: number) => void;
  onMeetingClick?: (meeting: MeetingDto) => void;
}) {
  const courseById = useMemo(() => new Map(timetable.courses.map((course) => [course.id, course])), [timetable.courses]);
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-[56px_repeat(5,minmax(110px,1fr))] overflow-hidden rounded-md border-l border-t border-border-subtle text-sm">
        <div className="border-b border-r border-border-subtle bg-bg-muted" />
        {days.map((day) => <div key={day} className="border-b border-r border-border-subtle bg-bg-muted p-3 text-center font-semibold">{day}</div>)}
        {timetable.daySlots.map((slot) => (
          <Fragment key={slot.periodIndex}>
            <div className="min-h-[72px] border-b border-r border-border-subtle bg-bg-muted"><PeriodLabel slot={slot} /></div>
            {days.map((day, index) => {
              const dayOfWeek = index + 1;
              const meeting = timetable.meetings.find((item) => item.dayOfWeek === dayOfWeek && item.startPeriodIndex <= slot.periodIndex && item.startPeriodIndex + item.periodCount > slot.periodIndex);
              const course = meeting ? courseById.get(meeting.courseId) : null;
              return (
                <div key={`${day}-${slot.periodIndex}`} className="min-h-[72px] border-b border-r border-border-subtle">
                  {course && meeting ? <MeetingBlock course={course} onClick={() => onMeetingClick?.(meeting)} /> : <EmptyCell onClick={() => onEmptyCellClick(dayOfWeek, slot.periodIndex)} />}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
