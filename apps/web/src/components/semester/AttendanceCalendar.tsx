import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { AttendanceDaySummary } from "@atender/shared";

type Props = {
  days: AttendanceDaySummary[];
  startDate: string;
  endDate: string;
};

export function AttendanceCalendar({ days, startDate, endDate }: Props) {
  const [anchor, setAnchor] = useState(() => dayjs(startDate).startOf("month"));
  const daysByDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const monthStart = anchor.startOf("month");
  const gridStart = monthStart.startOf("week");
  const gridEnd = monthStart.endOf("month").endOf("week");
  const cells: dayjs.Dayjs[] = [];
  for (let d = gridStart; d.isBefore(gridEnd) || d.isSame(gridEnd); d = d.add(1, "day")) cells.push(d);

  return (
    <div className="rounded-3xl bg-bg-elevated p-4 shadow-card">
      <header className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setAnchor(anchor.subtract(1, "month"))}
          disabled={anchor.isSame(dayjs(startDate), "month")}
          className="grid h-8 w-8 place-items-center rounded-full hover:bg-fg-primary/6 disabled:opacity-30"
        >
          ‹
        </button>
        <h3 className="text-base font-bold">{anchor.format("YYYY年 M月")}</h3>
        <button
          type="button"
          onClick={() => setAnchor(anchor.add(1, "month"))}
          disabled={anchor.isSame(dayjs(endDate), "month")}
          className="grid h-8 w-8 place-items-center rounded-full hover:bg-fg-primary/6 disabled:opacity-30"
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
          return (
            <div
              key={iso}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl border border-border-subtle text-xs tabular-nums ${inMonth ? "text-fg-primary" : "text-fg-tertiary opacity-30"}`}
            >
              <span className="font-bold">{cell.date()}</span>
              <span className="mt-0.5 text-sm leading-none" style={{ color: markerColor(summary?.status) }}>{marker(summary?.status)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-fg-tertiary">
        <span>○ 出席</span>
        <span>× 欠席</span>
        <span>△ 遅刻/早退</span>
        <span>／ 休講</span>
      </div>
    </div>
  );
}

function marker(status: AttendanceDaySummary["status"] | undefined) {
  if (status === "ALL_PRESENT") return "○";
  if (status === "HAS_ABSENT") return "×";
  if (status === "HAS_TARDY") return "△";
  if (status === "ALL_SUSPENDED") return "／";
  if (status === "PARTIAL_UNRECORDED") return "·";
  return "";
}

function markerColor(status: AttendanceDaySummary["status"] | undefined) {
  if (status === "ALL_PRESENT") return "var(--color-status-present)";
  if (status === "HAS_ABSENT") return "var(--color-status-absent)";
  if (status === "HAS_TARDY") return "var(--color-status-tardy)";
  if (status === "ALL_SUSPENDED") return "var(--color-status-cancelled)";
  return "var(--color-status-none)";
}
