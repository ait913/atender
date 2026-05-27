import type { CourseDto } from "@atender/shared";

export function MeetingBlock({ course, onClick }: { course: CourseDto; onClick?: () => void }) {
  const color = course.color ?? "#10EB99";
  const subColor = `color-mix(in srgb, ${color} 70%, var(--event-mix-target))`;
  const tint = /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}26` : "rgba(255,255,255,0.08)";
  return (
    <button
      type="button"
      className="relative h-full w-full overflow-hidden rounded-xl text-left transition active:scale-[0.99]"
      style={{ background: tint, borderLeft: `3px solid ${color}` }}
      onClick={onClick}
    >
      <div className="flex h-full flex-col gap-0.5 pl-2 pr-2 py-1.5">
        <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-fg-primary">{course.name}</p>
        <p className="truncate text-[10px] leading-tight" style={{ color: subColor }}>
          {course.room ?? course.teacher ?? ""}
        </p>
      </div>
    </button>
  );
}
