import type { Dayjs, ManipulateType } from "dayjs";
import type { CalendarViewMode } from "@/lib/calendarRange";

function mondayOf(date: Dayjs) {
  const day = date.day();
  return date.startOf("day").subtract(day === 0 ? 6 : day - 1, "day");
}

export function PeriodNav({
  viewMode,
  anchor,
  onChange,
}: {
  viewMode: CalendarViewMode;
  anchor: Dayjs;
  onChange: (next: Dayjs) => void;
}) {
  const step: ManipulateType = viewMode === "day" ? "day" : viewMode === "week" ? "week" : "month";
  const weekStart = mondayOf(anchor);
  const title =
    viewMode === "day"
      ? anchor.format("YYYY年 M月D日")
      : viewMode === "week"
        ? `${weekStart.format("M/D")} - ${weekStart.add(6, "day").format("M/D")} (週)`
        : anchor.format("YYYY年 M月");

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(anchor.subtract(1, step))}
        aria-label="前へ"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/8 text-fg-primary transition hover:bg-white/12 active:scale-95"
      >
        ＜
      </button>
      <h2 className="min-w-0 flex-1 truncate text-center text-base font-black tracking-tight text-fg-primary">{title}</h2>
      <button
        type="button"
        onClick={() => onChange(anchor.add(1, step))}
        aria-label="次へ"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/8 text-fg-primary transition hover:bg-white/12 active:scale-95"
      >
        ＞
      </button>
    </div>
  );
}
