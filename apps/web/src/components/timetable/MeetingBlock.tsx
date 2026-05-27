import type { CourseDto } from "@atender/shared";

function hexWithAlpha(hex: string, alphaHex: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}${alphaHex}`;
  return hex;
}

export function MeetingBlock({ course, onClick }: { course: CourseDto; onClick?: () => void }) {
  const color = course.color ?? "#10EB99";
  const bg = hexWithAlpha(color, "26"); // ~15% on dark
  return (
    <button
      type="button"
      className="h-full w-full p-2 text-left transition hover:brightness-110"
      style={{ background: bg, borderLeft: `4px solid ${color}` }}
      onClick={onClick}
    >
      <p className="line-clamp-2 text-sm font-bold" style={{ color }}>{course.name}</p>
      <p className="mt-1 truncate text-xs font-medium text-fg-secondary">{course.teacher ?? course.room ?? ""}</p>
    </button>
  );
}
