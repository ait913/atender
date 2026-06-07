import type { JSX } from "react";

const DAYS = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 7, label: "日" },
];

export function DayChips({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}): JSX.Element {
  const selected = new Set(value);
  function toggle(day: number) {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange([...next].sort((a, b) => a - b));
  }
  return (
    <div className="flex flex-wrap gap-2">
      {DAYS.map((day) => (
        <button
          key={day.value}
          type="button"
          aria-label={`${day.label}曜日`}
          aria-pressed={selected.has(day.value)}
          disabled={disabled}
          className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:opacity-50 ${selected.has(day.value) ? "border-transparent bg-accent-500 text-fg-on-accent" : "border-border-default bg-bg-base text-fg-primary"}`}
          onClick={() => toggle(day.value)}
        >
          {day.label}
        </button>
      ))}
    </div>
  );
}
