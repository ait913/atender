import type { SemesterOverviewDto } from "@atender/shared";
import { AlertTriangle } from "lucide-react";
import { rateColor } from "@/lib/attendanceRateColor";

type AttendanceRateHeroProps = {
  overall: SemesterOverviewDto["overall"];
  requiredRate: number;
  onJumpToCalendar?: () => void;
};

export function AttendanceRateHero({ overall, requiredRate, onJumpToCalendar }: AttendanceRateHeroProps) {
  const pct = overall.toDate.attendanceRate == null ? null : Math.round(overall.toDate.attendanceRate * 100);
  const color = rateColor(pct, requiredRate);

  return (
    <div className="rounded-3xl bg-bg-elevated p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-fg-secondary">今日までの出席率</p>
      </div>
      <div className="mt-2 gap-4 md:flex md:items-end">
        <div className="flex items-baseline gap-2 md:min-w-[180px]">
          <span className="text-5xl font-black tabular-nums" style={{ color }}>{pct == null ? "—" : pct}</span>
          <span className="text-2xl font-bold" style={{ color }}>%</span>
          <span className="text-xs font-bold tabular-nums text-fg-tertiary">
            {overall.toDate.effectiveNumerator} / {overall.toDate.effectiveDenominator}限
          </span>
        </div>
        <div className="mt-3 min-w-0 flex-1 md:mt-0">
          <div className="relative h-2.5 overflow-hidden rounded-full bg-bg-muted">
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
          <p className="mt-2 text-sm font-bold">
            <span style={{ color: actionColor(overall.allowedAbsences, overall.remainingCount) }}>
              {actionText(overall.allowedAbsences, overall.remainingCount, requiredRate)}
            </span>
            <span className="ml-2 text-xs text-fg-tertiary">残り {overall.remainingCount}限</span>
          </p>
        </div>
      </div>
      {overall.unrecordedCount > 0 ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2"
          style={{
            background: "color-mix(in srgb, var(--color-status-tardy) 15%, transparent)",
            color: "var(--color-status-tardy)",
            borderLeft: "3px solid var(--color-status-tardy)",
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 text-xs font-bold">未記録 {overall.unrecordedCount} 件 — 記録して</p>
          {onJumpToCalendar ? (
            <button
              type="button"
              aria-label="カレンダーへ移動"
              onClick={onJumpToCalendar}
              className="shrink-0 rounded-full px-2 py-1 text-xs font-bold hover:bg-fg-primary/10"
            >
              カレンダーへ
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function actionText(allowedAbsences: number | null, remainingCount: number, requiredRate: number) {
  if (allowedAbsences == null) return "データなし";
  if (allowedAbsences < 0) return `${requiredRate}% を下回る見込み`;
  if (allowedAbsences >= remainingCount) return `残りを全部休んでも ${requiredRate}% を維持`;
  return `あと ${allowedAbsences}限 休める`;
}

function actionColor(allowedAbsences: number | null, remainingCount: number) {
  if (allowedAbsences == null) return "var(--color-fg-tertiary)";
  if (allowedAbsences < 0) return "var(--color-status-absent)";
  if (allowedAbsences >= remainingCount) return "var(--color-accent-500)";
  return "var(--color-fg-primary)";
}
