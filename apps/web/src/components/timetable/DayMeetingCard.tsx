import type { CourseDto, DaySlotDto, MeetingDto } from "@atender/shared";
import { minutesToTime } from "@/components/ui";

export type DayMeetingCardProps = {
  course: CourseDto;
  meeting: MeetingDto;
  slots: DaySlotDto[];
  onClick: () => void;
};

function hexWithAlpha(hex: string, alphaHex: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}${alphaHex}`;
  return hex;
}

export function DayMeetingCard({ course, meeting: _meeting, slots, onClick }: DayMeetingCardProps) {
  const color = course.color ?? "#10EB99";
  const cardBg = hexWithAlpha(color, "1f"); // ~12% on dark
  const chipBg = hexWithAlpha(color, "40"); // ~25%
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
      className="block w-full rounded-3xl p-5 text-left shadow-card transition-all duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      style={{ background: cardBg, borderLeft: `5px solid ${color}`, minHeight }}
      aria-label={`${course.name} ${periodRange} ${timeRange}`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="font-bold" style={{ color }}>{periodRange}</span>
        <span aria-hidden className="text-fg-tertiary">·</span>
        <span className="text-fg-tertiary">{timeRange}</span>
      </div>
      <h3 className="line-clamp-2 text-lg font-bold leading-snug" style={{ color }}>
        {course.name}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {course.room ? (
          <span
            className="inline-flex items-center rounded-full px-3 py-1 font-bold"
            style={{ background: chipBg, color }}
          >
            {course.room}
          </span>
        ) : null}
        {course.teacher ? (
          <span className="truncate text-fg-secondary">{course.teacher}</span>
        ) : null}
      </div>
    </button>
  );
}
