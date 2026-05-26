import type { CourseDto } from "@atender/shared";

export function MeetingBlock({ course, onClick }: { course: CourseDto; onClick?: () => void }) {
  const color = course.color ?? "#10B981";
  return (
    <button
      type="button"
      className="h-full w-full p-2 text-left transition hover:brightness-95"
      style={{ background: `color-mix(in srgb, ${color} 12%, white)`, borderLeft: `4px solid ${color}` }}
      onClick={onClick}
    >
      <p className="line-clamp-2 text-sm font-semibold text-fg-primary">{course.name}</p>
      <p className="mt-1 truncate text-xs font-normal text-fg-secondary">{course.teacher ?? course.room ?? ""}</p>
    </button>
  );
}
