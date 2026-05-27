export type DayChipNavProps = {
  activeDay: number;
  today: number;
  viewMode: "day" | "week";
  onChangeDay: (day: number) => void;
  onToggleViewMode: () => void;
};

const days = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
];

export function DayChipNav({ activeDay, today, viewMode, onChangeDay, onToggleViewMode }: DayChipNavProps) {
  return (
    <nav
      aria-label="曜日切替"
      className="sticky top-14 z-30 -mx-5 flex items-center gap-3 bg-bg-base/85 px-5 py-3 backdrop-blur-xl"
    >
      <div role="tablist" aria-label="曜日" className="flex flex-1 gap-2">
        {days.map((d) => {
          const active = activeDay === d.value && viewMode === "day";
          const isToday = d.value === today;
          return (
            <button
              key={d.value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={isToday ? `${d.label}曜日 (今日)` : `${d.label}曜日`}
              onClick={() => {
                if (viewMode === "week") onToggleViewMode();
                onChangeDay(d.value);
              }}
              className={`relative flex h-10 flex-1 items-center justify-center rounded-full text-sm font-semibold transition-all duration-150 active:scale-[0.97] ${
                active
                  ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
                  : "bg-fg-primary/8 text-fg-secondary hover:bg-fg-primary/12"
              }`}
            >
              {d.label}
              {isToday ? (
                <span
                  aria-hidden
                  className={`absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full ${
                    active ? "bg-fg-on-accent" : "bg-accent-500"
                  }`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label={viewMode === "week" ? "日別表示に切替" : "週表示に切替"}
        aria-pressed={viewMode === "week"}
        onClick={onToggleViewMode}
        className={`flex h-10 items-center justify-center rounded-full px-4 text-xs font-semibold transition-all duration-150 active:scale-[0.97] ${
          viewMode === "week"
            ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
            : "bg-fg-primary/8 text-fg-secondary hover:bg-fg-primary/12"
        }`}
      >
        週
      </button>
    </nav>
  );
}
