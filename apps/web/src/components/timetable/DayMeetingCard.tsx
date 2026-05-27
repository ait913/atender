import type { CourseDto, DaySlotDto, MeetingDto } from "@atender/shared";
import { minutesToTime } from "@/components/ui";

export type DayMeetingCardProps = {
  course: CourseDto;
  meeting: MeetingDto;
  slots: DaySlotDto[];
  onClick: () => void;
};

export function DayMeetingCard({ course, meeting: _meeting, slots, onClick }: DayMeetingCardProps) {
  const color = course.color ?? "#10EB99";
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (!first || !last) return null;
  const timeRange = `${minutesToTime(first.startMinute)} - ${minutesToTime(last.endMinute)}`;
  const periodRange = slots.length === 1
    ? `${first.periodIndex}限`
    : `${first.periodIndex}-${last.periodIndex}限`;
  const minHeight = slots.length * 96;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-3xl bg-bg-elevated p-5 text-left shadow-card transition-all duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      style={{ borderLeft: `4px solid ${color}`, minHeight }}
      aria-label={`${course.name} ${periodRange} ${timeRange}`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-fg-tertiary">
        <span className="font-semibold text-fg-secondary">{periodRange}</span>
        <span aria-hidden>·</span>
        <span>{timeRange}</span>
      </div>
      <h3 className="line-clamp-2 text-base font-semibold leading-snug text-fg-primary">
        {course.name}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
        {course.room ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
            style={{
              background: `color-mix(in srgb, ${color} 20%, transparent)`,
              color,
            }}
          >
            {course.room}
          </span>
        ) : null}
        {course.teacher ? <span className="truncate">{course.teacher}</span> : null}
      </div>
    </button>
  );
}
