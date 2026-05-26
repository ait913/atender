export function PeriodChips({
  value,
  onChange,
  periodCount,
  disabled,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  periodCount: number;
  disabled?: boolean;
}) {
  const selected = new Set(value);
  function toggle(period: number) {
    const next = new Set(selected);
    if (next.has(period)) next.delete(period);
    else next.add(period);
    onChange([...next].sort((a, b) => a - b));
  }
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: periodCount }, (_, index) => index + 1).map((period) => (
        <button
          key={period}
          type="button"
          aria-label={`${period}限`}
          aria-pressed={selected.has(period)}
          disabled={disabled}
          className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:opacity-50 ${selected.has(period) ? "border-transparent bg-accent-500 text-fg-on-accent" : "border-border-default bg-bg-base text-fg-primary"}`}
          onClick={() => toggle(period)}
        >
          {period}
        </button>
      ))}
    </div>
  );
}
