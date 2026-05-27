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
  const subColor = `color-mix(in srgb, ${color} 70%, white 30%)`;
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (!first || !last) return null;
  const timeRange = `${minutesToTime(first.startMinute)} – ${minutesToTime(last.endMinute)}`;
  const periodLabel = slots.length === 1
    ? String(first.periodIndex)
    : `${first.periodIndex}-${last.periodIndex}`;
  const minHeight = slots.length * 80;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block w-full overflow-hidden rounded-[14px] border border-white/10 text-left transition-all duration-150 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      style={{
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        minHeight,
      }}
      aria-label={`${course.name} ${periodLabel}限 ${timeRange}`}
    >
      <span
        className="absolute left-0 top-1 bottom-1 w-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 12px ${color}, inset 0 0 4px rgba(255,255,255,0.4)` }}
      />
      <div className="flex items-center gap-3 pl-4 pr-3 py-3">
        <div className="flex flex-shrink-0 flex-col items-center justify-center">
          <span
            className={`font-black leading-none ${periodLabel.length > 2 ? "text-xl" : "text-3xl"}`}
            style={{ color }}
          >
            {periodLabel}
          </span>
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-widest opacity-70" style={{ color }}>限</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-fg-primary">
            {course.name}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            {course.room ? <span className="font-semibold" style={{ color: subColor }}>{course.room}</span> : null}
            {course.teacher ? (
              <>
                {course.room ? <span aria-hidden className="text-fg-tertiary">·</span> : null}
                <span className="text-fg-tertiary">{course.teacher}</span>
              </>
            ) : null}
          </p>
          <p className="mt-0.5 text-[10px] text-fg-tertiary">{timeRange}</p>
        </div>
      </div>
    </button>
  );
}
