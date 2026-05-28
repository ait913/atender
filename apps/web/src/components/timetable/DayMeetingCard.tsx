import type { CourseDto, DaySlotDto, MeetingDto } from "@atender/shared";
import { EventTile } from "@/components/event-tile";
import { minutesToTime } from "@/components/ui";

export type DayMeetingCardProps = {
  course: CourseDto;
  meeting: MeetingDto;
  slots: DaySlotDto[];
  onClick: () => void;
};

export function DayMeetingCard({ course, meeting: _meeting, slots, onClick }: DayMeetingCardProps) {
  const color = course.color ?? "#F97316";
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (!first || !last) return null;
  const timeRange = `${minutesToTime(first.startMinute)} – ${minutesToTime(last.endMinute)}`;
  const periodLabel = slots.length === 1
    ? String(first.periodIndex)
    : `${first.periodIndex}-${last.periodIndex}`;
  const minHeight = slots.length * 80;
  const subtitleText = [course.room, course.teacher].filter(Boolean).join(" · ");

  return (
    <EventTile
      density="comfortable"
      color={color}
      title={course.name}
      subtitle={subtitleText}
      meta={timeRange}
      onClick={onClick}
      aria-label={`${course.name} ${periodLabel}限 ${timeRange}`}
      style={{ minHeight }}
      badge={
        <div className="flex flex-shrink-0 flex-col items-center justify-center pr-2">
          <span
            className={`font-black leading-none ${periodLabel.length > 2 ? "text-base" : "text-2xl"}`}
            style={{ color }}
          >
            {periodLabel}
          </span>
          <span className="mt-0.5 text-[8px] font-bold uppercase tracking-widest opacity-70" style={{ color }}>限</span>
        </div>
      }
    />
  );
}
