export function rateColor(pct: number | null, requiredRate: number): string {
  if (pct == null) return "var(--color-fg-tertiary)";
  if (pct >= requiredRate) return "var(--color-status-present)";
  if (pct >= requiredRate - 10) return "var(--color-status-tardy)";
  return "var(--color-status-absent)";
}
