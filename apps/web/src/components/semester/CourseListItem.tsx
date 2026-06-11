import type { CourseStatsDto } from "@atender/shared";
import { rateColor } from "@/lib/attendanceRateColor";

type Props = { stats: CourseStatsDto; requiredRate: number; onClick: () => void };

export function CourseListItem({ stats, requiredRate, onClick }: Props) {
  const pct = stats.toDate.attendanceRate == null ? null : Math.round(stats.toDate.attendanceRate * 100);
  const color = rateColor(pct, requiredRate);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3 rounded-2xl bg-bg-elevated p-3 text-left shadow-card transition hover:bg-fg-primary/4 active:scale-[0.99]"
    >
      <span className="w-1 flex-shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-bold text-fg-primary">{stats.courseName}</p>
          <span className="text-2xl font-black leading-none tabular-nums" style={{ color }}>
            {pct == null ? "—" : pct}
            {pct == null ? null : <span className="ml-0.5 text-xs font-bold">%</span>}
          </span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-bg-muted">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%`, background: color }}
          />
          <span
            aria-hidden="true"
            className="absolute top-0 h-full w-0.5 bg-fg-tertiary"
            style={{ left: `${requiredRate}%` }}
          />
        </div>
        <p className="text-xs tabular-nums text-fg-tertiary">
          出{stats.counts.present} 欠{stats.counts.absent} 未{stats.counts.unrecorded}
          <span className="mx-1">・</span>
          <span style={{ color: actionColor(stats.allowedAbsences, stats.remainingCount) }}>
            {shortActionText(stats.allowedAbsences, stats.remainingCount)}
          </span>
        </p>
      </div>
    </button>
  );
}

function shortActionText(allowedAbsences: number | null, remainingCount: number) {
  if (allowedAbsences == null) return "—";
  if (allowedAbsences < 0) return "下回る見込み";
  if (allowedAbsences >= remainingCount) return "残り全休OK";
  return `あと${allowedAbsences}限休める`;
}

function actionColor(allowedAbsences: number | null, remainingCount: number) {
  if (allowedAbsences == null) return "var(--color-fg-tertiary)";
  if (allowedAbsences < 0) return "var(--color-status-absent)";
  if (allowedAbsences >= remainingCount) return "var(--color-status-present)";
  return "var(--color-fg-tertiary)";
}
