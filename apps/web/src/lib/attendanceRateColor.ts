export function rateColor(pct: number | null, requiredRate: number): string {
  if (pct == null) return "var(--color-fg-tertiary)";
  if (pct >= requiredRate) return "var(--color-accent-500)";
  if (pct >= requiredRate - 10) return "var(--color-status-absent)";
  return "var(--color-status-absent)";
}
