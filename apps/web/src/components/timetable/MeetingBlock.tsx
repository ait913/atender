import type { CSSProperties } from "react";
import type { CourseDto, MeetingDto, DaySlotDto } from "@atender/shared";
import { minutesToTime } from "@/lib/dayjs";

export function MeetingBlock({
  meeting,
  course,
  daySlots,
  onClick,
  style,
}: {
  meeting: MeetingDto;
  course?: CourseDto;
  daySlots: DaySlotDto[];
  onClick: () => void;
  style?: CSSProperties;
}) {
  const start = daySlots.find((slot) => slot.periodIndex === meeting.startPeriodIndex);
  const end = daySlots.find((slot) => slot.periodIndex === meeting.startPeriodIndex + meeting.periodCount - 1) ?? start;
  const courseColor = course?.color ?? "#10B981";
  return (
    <button
      type="button"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-b border-border-subtle p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-500 hover:brightness-95 transition"
      style={{
        ...style,
        background: `color-mix(in srgb, ${courseColor} 12%, white)`,
        borderLeft: `4px solid ${courseColor}`,
        ["--course-color" as string]: courseColor,
      }}
      onClick={onClick}
    >
      <p className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-tight text-fg-primary">{course?.name ?? "授業"}</p>
      {course?.teacher ? <p className="mt-0.5 line-clamp-1 min-w-0 break-words text-xs font-normal leading-tight text-fg-secondary">{course.teacher}</p> : null}
      {course?.room ? <p className="line-clamp-1 min-w-0 break-words text-xs font-normal leading-tight text-fg-secondary">{course.room}</p> : null}
      {start && end ? <p className="mt-auto truncate pt-1 text-[11px] text-fg-tertiary">{minutesToTime(start.startMinute)}-{minutesToTime(end.endMinute)}</p> : null}
    </button>
  );
}
