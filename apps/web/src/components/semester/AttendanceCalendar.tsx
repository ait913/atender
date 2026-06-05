import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { AttendanceDaySummary } from "@atender/shared";
import { usePersonalEvents } from "@/api/hooks";
import { statusVisual } from "@/lib/dayStatusVisual";

type Props = {
  days: AttendanceDaySummary[];
  startDate: string;
  endDate: string;
  semesterId?: string | null;
  onSelectDay: (date: string) => void;
};

export function AttendanceCalendar({ days, startDate, endDate, semesterId, onSelectDay }: Props) {
  const [anchor, setAnchor] = useState(() => dayjs(startDate).startOf("month"));
  const daysByDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const monthStart = anchor.startOf("month");
  const gridStart = monthStart.startOf("week");
  const gridEnd = monthStart.endOf("month").endOf("week");
  const personalEvents = usePersonalEvents({
    from: gridStart.format("YYYY-MM-DD"),
    to: gridEnd.format("YYYY-MM-DD"),
    semesterId,
  });
  const eventDates = useMemo(
    () => new Set((personalEvents.data?.events ?? []).map((event) => event.date)),
    [personalEvents.data?.events],
  );
  const cells: dayjs.Dayjs[] = [];
  for (let d = gridStart; d.isBefore(gridEnd) || d.isSame(gridEnd); d = d.add(1, "day")) cells.push(d);

  return (
    <div className="rounded-3xl bg-bg-elevated p-2.5 shadow-card">
      <header className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setAnchor(anchor.subtract(1, "month"))}
          disabled={anchor.isSame(dayjs(startDate), "month")}
          aria-label="前の月"
          className="grid h-11 w-11 place-items-center rounded-full text-xl hover:bg-fg-primary/6 disabled:opacity-30"
        >
          ‹
        </button>
        <h3 className="text-sm font-bold">{anchor.format("YYYY年 M月")}</h3>
        <button
          type="button"
          onClick={() => setAnchor(anchor.add(1, "month"))}
          disabled={anchor.isSame(dayjs(endDate), "month")}
          aria-label="次の月"
          className="grid h-11 w-11 place-items-center rounded-full text-xl hover:bg-fg-primary/6 disabled:opacity-30"
        >
          ›
        </button>
      </header>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-fg-tertiary">
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const iso = cell.format("YYYY-MM-DD");
          const summary = daysByDate.get(iso);
          const inMonth = cell.isSame(monthStart, "month");
          const visual = statusVisual(summary?.status);
          const hasEvent = eventDates.has(iso);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDay(iso)}
              aria-label={cell.format("M月D日")}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border border-border-subtle text-[11px] tabular-nums transition active:scale-95 ${inMonth ? "text-fg-primary hover:border-accent-500/40" : "text-fg-tertiary opacity-40"}`}
              style={visual.bg ? { background: visual.bg } : undefined}
            >
              {hasEvent ? (
                <span
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-500"
                  aria-hidden="true"
                />
              ) : null}
              <span className="font-bold">{cell.date()}</span>
              <span className="mt-0.5 text-[12px] leading-none" style={{ color: visual.markerColor }}>{visual.marker}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-fg-tertiary">
        <span>○ 出席</span>
        <span>× 欠席あり</span>
        <span>△ 遅刻・早退</span>
        <span>／ 休講</span>
        <span>· 未記録あり</span>
        <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-500 align-middle" /> 予定</span>
      </div>
    </div>
  );
}
