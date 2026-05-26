import { useMemo } from "react";
import type { CourseDto, DaySlotDto, MeetingDto, UserTimetableDto } from "@atender/shared";
import { DayChipNav } from "./DayChipNav";
import { DayEmptyRow } from "./DayEmptyRow";
import { DayMeetingCard } from "./DayMeetingCard";
import { TimetableGrid } from "./TimetableGrid";

export type DayListProps = {
  timetable: UserTimetableDto;
  activeDay: number;
  today: number;
  viewMode: "day" | "week";
  onChangeDay: (day: number) => void;
  onToggleViewMode: () => void;
  onMeetingClick: (meeting: MeetingDto) => void;
  onEmptyCellClick: (dayOfWeek: number, periodIndex: number) => void;
};

type Row =
  | { type: "meeting"; meeting: MeetingDto; course: CourseDto; slots: DaySlotDto[] }
  | { type: "empty"; slot: DaySlotDto };

export function DayList({
  timetable,
  activeDay,
  today,
  viewMode,
  onChangeDay,
  onToggleViewMode,
  onMeetingClick,
  onEmptyCellClick,
}: DayListProps) {
  const courseById = useMemo(
    () => new Map(timetable.courses.map((c) => [c.id, c])),
    [timetable.courses],
  );
  const slots = timetable.daySlots;

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    const consumed = new Set<number>();
    for (const slot of slots) {
      if (consumed.has(slot.periodIndex)) continue;
      const meeting = timetable.meetings.find(
        (m) => m.dayOfWeek === activeDay && m.startPeriodIndex === slot.periodIndex,
      );
      if (meeting) {
        const course = courseById.get(meeting.courseId);
        if (!course) {
          result.push({ type: "empty", slot });
          continue;
        }
        const span = meeting.periodCount;
        const included = slots.filter(
          (s) => s.periodIndex >= slot.periodIndex && s.periodIndex < slot.periodIndex + span,
        );
        result.push({ type: "meeting", meeting, course, slots: included });
        for (let i = 0; i < span; i++) consumed.add(slot.periodIndex + i);
      } else {
        result.push({ type: "empty", slot });
      }
    }
    return result;
  }, [activeDay, courseById, slots, timetable.meetings]);

  return (
    <div className="space-y-3">
      <DayChipNav
        activeDay={activeDay}
        today={today}
        viewMode={viewMode}
        onChangeDay={onChangeDay}
        onToggleViewMode={onToggleViewMode}
      />
      {viewMode === "week" ? (
        <div data-testid="day-list-week-fallback">
          <TimetableGrid
            timetable={timetable}
            onMeetingClick={onMeetingClick}
            onEmptyCellClick={onEmptyCellClick}
          />
        </div>
      ) : (
        <ul className="space-y-3" data-testid="day-list-items">
          {rows.map((row, idx) =>
            row.type === "meeting" ? (
              <li key={`m-${row.meeting.id}`}>
                <DayMeetingCard
                  course={row.course}
                  meeting={row.meeting}
                  slots={row.slots}
                  onClick={() => onMeetingClick(row.meeting)}
                />
              </li>
            ) : (
              <li key={`e-${row.slot.periodIndex}-${idx}`}>
                <DayEmptyRow
                  slot={row.slot}
                  onClick={() => onEmptyCellClick(activeDay, row.slot.periodIndex)}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
