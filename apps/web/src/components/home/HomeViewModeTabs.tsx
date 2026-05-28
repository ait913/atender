export type HomeViewMode = "timetable" | "calendar";

type Props = { mode: HomeViewMode; onChange: (mode: HomeViewMode) => void };

export function HomeViewModeTabs({ mode, onChange }: Props) {
  return (
    <div className="flex rounded-full bg-bg-muted p-1" role="tablist">
      {(["timetable", "calendar"] as const).map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={mode === item}
          onClick={() => onChange(item)}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition ${
            mode === item ? "bg-accent-500 text-fg-on-accent shadow-glow-soft" : "text-fg-secondary hover:bg-fg-primary/6"
          }`}
        >
          {item === "timetable" ? "時間割" : "カレンダー"}
        </button>
      ))}
    </div>
  );
}
