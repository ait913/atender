import type { SemesterOverviewDto } from "@atender/shared";

export function OverallRateCard({ overall }: { overall: SemesterOverviewDto["overall"] }) {
  const pct = overall.attendanceRate == null ? null : Math.round(overall.attendanceRate * 100);
  return (
    <div className="rounded-2xl bg-bg-elevated p-3 shadow-card">
      <p className="text-sm font-bold text-fg-secondary">全体の出席率</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="text-5xl font-black tabular-nums" style={{ color: "var(--color-status-present)" }}>
          {pct == null ? "—" : pct}
        </span>
        <span className="text-2xl font-bold" style={{ color: "var(--color-status-present)" }}>%</span>
      </p>
      <p className="mt-1 text-xs text-fg-tertiary tabular-nums">
        {overall.effectiveNumerator} / {overall.effectiveDenominator}
      </p>
    </div>
  );
}
