import type { CourseStatsDto } from "@atender/shared";

function pct(course: CourseStatsDto) {
  return course.attendanceRate == null ? "—%" : `${(course.attendanceRate * 100).toFixed(1)}%`;
}

export function CourseStatsCard({ course, danger, onClick }: { course: CourseStatsDto; danger?: boolean; onClick: () => void }) {
  const fill = course.attendanceRate == null ? 0 : Math.round(course.attendanceRate * 12);
  const chips = [
    ["出", course.counts.present],
    ["欠", course.counts.absent],
    ["遅", course.counts.tardy],
    ["公", course.counts.excused],
    ["早", course.counts.earlyLeave],
    ["休", course.counts.cancelled],
  ] as const;
  return (
    <button type="button" className={`w-full rounded-md border bg-bg-elevated p-4 text-left shadow-card ${danger ? "border-status-absent" : "border-border-subtle"}`} onClick={onClick}>
      <h3 className="font-semibold">{course.courseName}</h3>
      <p className="mt-1 text-sm font-semibold text-fg-secondary">{course.effectiveNumerator} / {course.effectiveDenominator} = {pct(course)}</p>
      <div className="mt-3 grid grid-cols-12 gap-0.5">
        {Array.from({ length: 12 }, (_, index) => <span key={index} className={`h-2 rounded-full ${index < fill ? "bg-accent-500" : "bg-bg-muted"}`} />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {chips.filter(([, count]) => count > 0).map(([label, count]) => <span key={label} className="rounded-full bg-bg-muted px-2 py-1 text-xs font-semibold text-fg-secondary">{label}{count}</span>)}
      </div>
    </button>
  );
}
