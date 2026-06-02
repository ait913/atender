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
    <div
      className="grid w-full overflow-hidden rounded-md border-l border-t border-border-subtle"
      style={{
        gridTemplateColumns: "44px repeat(5, minmax(0, 1fr))",
        gridTemplateRows: "28px repeat(5, minmax(0, 1fr))",
        height: "calc(100dvh - var(--self-tt-chrome, 352px) - env(safe-area-inset-bottom, 0px))",
        minHeight: "320px",
      }}
    >
      <div className="border-b border-r border-border-subtle bg-bg-muted" />
      {days.map((day) => (
        <div key={day} className="border-b border-r border-border-subtle bg-bg-muted text-center text-[11px] font-semibold leading-[28px]">
          {day}
        </div>
      ))}
      {timetable.daySlots.map((slot) => (
        <Fragment key={slot.periodIndex}>
          <div className="border-b border-r border-border-subtle bg-bg-muted"><PeriodLabel slot={slot} /></div>
          {days.map((day, index) => {
            const dayOfWeek = index + 1;
            const meeting = timetable.meetings.find((item) => item.dayOfWeek === dayOfWeek && item.startPeriodIndex <= slot.periodIndex && item.startPeriodIndex + item.periodCount > slot.periodIndex);
            const course = meeting ? courseById.get(meeting.courseId) : null;
            return (
              <div key={`${day}-${slot.periodIndex}`} className="overflow-hidden border-b border-r border-border-subtle p-0.5">
                {course && meeting ? <MeetingBlock course={course} meeting={meeting} onClick={() => onMeetingClick?.(meeting)} /> : <EmptyCell onClick={() => onEmptyCellClick(dayOfWeek, slot.periodIndex)} />}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
