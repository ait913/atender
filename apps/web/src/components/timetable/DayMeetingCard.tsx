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
  const color = course.color ?? "#10B981";
  const cardBg = hexWithAlpha(color, "1f"); // 12% on dark
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (!first || !last) return null;
  const timeRange = `${minutesToTime(first.startMinute)} – ${minutesToTime(last.endMinute)}`;
  const periodLabel = slots.length === 1
    ? String(first.periodIndex)
    : `${first.periodIndex}-${last.periodIndex}`;
  const minHeight = slots.length * 96;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-3xl p-5 text-left shadow-card transition-all duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      style={{ background: cardBg, minHeight }}
      aria-label={`${course.name} ${periodLabel}限 ${timeRange}`}
    >
      <div className="flex h-full items-stretch gap-5">
        <div className="flex flex-shrink-0 flex-col items-center justify-center">
          <span
            className={`font-black leading-none tracking-tight ${
              periodLabel.length > 2 ? "text-4xl" : "text-6xl"
            }`}
            style={{ color }}
          >
            {periodLabel}
          </span>
          <span
            className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-70"
            style={{ color }}
          >
            限
          </span>
        </div>
        <div
          className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 pl-5"
          style={{ borderLeft: `1px solid ${hexWithAlpha(color, "33")}` }}
        >
          <h3 className="line-clamp-2 text-lg font-black leading-tight text-fg-primary">
            {course.name}
          </h3>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {course.room ? (
              <span className="font-bold" style={{ color }}>{course.room}</span>
            ) : null}
            {course.teacher ? (
              <>
                {course.room ? <span aria-hidden className="text-fg-tertiary">·</span> : null}
                <span className="text-fg-secondary">{course.teacher}</span>
              </>
            ) : null}
          </p>
          <p className="text-[11px] font-medium text-fg-tertiary">{timeRange}</p>
        </div>
      </div>
    </button>
  );
}
