import type { CourseStatsDto } from "@atender/shared";

type Props = { stats: CourseStatsDto; onClick: () => void };

export function CourseListItem({ stats, onClick }: Props) {
  const pct = stats.attendanceRate == null ? null : Math.round(stats.attendanceRate * 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-bg-elevated p-4 text-left shadow-card transition hover:bg-fg-primary/4 active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold text-fg-primary">{stats.courseName}</p>
        <p className="mt-0.5 truncate text-xs text-fg-tertiary">{stats.teacher ?? ""}</p>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[10px] font-bold text-fg-tertiary">出席率</span>
        <span className="text-3xl font-black tabular-nums" style={{ color: pctColor(pct) }}>
          {pct == null ? "—" : pct}
          <span className="ml-0.5 text-base font-bold">%</span>
        </span>
      </div>
    </button>
  );
}

function pctColor(pct: number | null): string {
  if (pct == null) return "var(--color-text-tertiary)";
  if (pct >= 80) return "var(--color-status-present)";
  if (pct >= 60) return "var(--color-status-tardy)";
  return "var(--color-status-absent)";
}
