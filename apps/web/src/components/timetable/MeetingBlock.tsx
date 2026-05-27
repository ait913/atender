import type { CourseDto } from "@atender/shared";

export function MeetingBlock({ course, onClick }: { course: CourseDto; onClick?: () => void }) {
  const color = course.color ?? "#10EB99";
  const subColor = `color-mix(in srgb, ${color} 70%, white 30%)`;
  const tint = /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}1f` : "rgba(255,255,255,0.06)";
  return (
    <button
      type="button"
      className="relative h-full w-full overflow-hidden rounded-[12px] border border-white/10 text-left transition active:scale-[0.99]"
      style={{ background: tint }}
      onClick={onClick}
    >
      <span
        className="absolute left-0 top-1 bottom-1 w-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}, inset 0 0 3px rgba(255,255,255,0.4)` }}
      />
      <div className="flex h-full flex-col gap-0.5 pl-3 pr-2 py-1.5">
        <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-fg-primary">{course.name}</p>
        <p className="truncate text-[10px] leading-tight" style={{ color: subColor }}>
          {course.room ?? course.teacher ?? ""}
        </p>
      </div>
    </button>
  );
}
