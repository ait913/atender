import type { CourseDto } from "@atender/shared";

export function MeetingBlock({ course, onClick }: { course: CourseDto; onClick?: () => void }) {
  const color = course.color ?? "#F97316";
  const subColor = `color-mix(in srgb, ${color} 70%, var(--event-mix-target))`;
  const tint = `color-mix(in srgb, ${color} 15%, var(--color-bg-elevated))`;
  return (
    <button
      type="button"
      className="relative h-full w-full overflow-hidden rounded-[12px] text-left transition active:scale-[0.99]"
      style={{ background: tint }}
      onClick={onClick}
    >
      <span
        className="absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full"
        style={{ background: color }}
      />
      <div className="flex h-full flex-col gap-0.5 pl-4 pr-2 py-1.5">
        <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-fg-primary">{course.name}</p>
        <p className="truncate text-[10px] leading-tight" style={{ color: subColor }}>
          {course.room ?? course.teacher ?? ""}
        </p>
      </div>
    </button>
  );
}
