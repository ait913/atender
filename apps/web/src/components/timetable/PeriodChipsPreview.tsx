export function groupPeriods(periods: number[]) {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  const groups: Array<{ start: number; count: number }> = [];
  for (const period of sorted) {
    const last = groups.at(-1);
    if (last && last.start + last.count === period) last.count += 1;
    else groups.push({ start: period, count: 1 });
  }
  return groups;
}

export function renderPeriodPreview(periods: number[]) {
  return groupPeriods(periods).map((group) => group.count === 1 ? `${group.start}限 (単独)` : `${group.start}-${group.start + group.count - 1}限 (${group.count}連続)`).join(" + ");
}

export function PeriodChipsPreview({ periods }: { periods: number[] }) {
  if (periods.length === 0) return <p className="text-sm text-fg-tertiary">時限を選択してください</p>;
  return <p className="text-sm font-medium text-fg-secondary">選択: {periods.join("限・")}限<br />→ {renderPeriodPreview(periods)}</p>;
}
