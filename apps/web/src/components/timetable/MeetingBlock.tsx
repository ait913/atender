import type { CourseDto, MeetingDto, DaySlotDto } from "@atender/shared";
import { minutesToTime } from "@/lib/dayjs";

export function MeetingBlock({ meeting, course, daySlots, onClick }: { meeting: MeetingDto; course?: CourseDto; daySlots: DaySlotDto[]; onClick: () => void }) {
  const start = daySlots.find((slot) => slot.periodIndex === meeting.startPeriodIndex);
  const end = daySlots.find((slot) => slot.periodIndex === meeting.startPeriodIndex + meeting.periodCount - 1) ?? start;
  return (
    <button
      type="button"
      className="min-h-16 overflow-hidden rounded-md border border-border-subtle bg-emerald-50 p-2 text-left shadow-card"
      style={{ borderLeft: `4px solid ${course?.color ?? "#10B981"}` }}
      onClick={onClick}
    >
      <p className="truncate text-sm font-semibold text-fg-primary">{course?.name ?? "授業"}</p>
      <p className="mt-1 truncate text-xs text-fg-secondary">{course?.teacher ?? "-"} / {course?.room ?? "-"}</p>
      {start && end ? <p className="mt-1 text-[11px] text-fg-tertiary">{minutesToTime(start.startMinute)}-{minutesToTime(end.endMinute)}</p> : null}
    </button>
  );
}
