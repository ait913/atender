import dayjs from "dayjs";
import { Ban, Check, ChevronLeft, ChevronRight, Clock, Minus, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AttendanceDaySummary } from "@atender/shared";
import { usePersonalEvents } from "@/api/hooks";
import { dayBackground, dayGlyphs, dayVisual, type DayMark, type DayVisualIcon } from "@/lib/dayStatusVisual";
import { personalEventDates } from "@/lib/personalEventDays";

type Props = {
  days: AttendanceDaySummary[];
  startDate: string;
  endDate: string;
  today: string;
  semesterId?: string | null;
  onSelectDay: (date: string) => void;
  selectionMode: boolean;
  selectedDates: ReadonlySet<string>;
  onToggleSelectionMode: () => void;
  onToggleDate: (date: string) => void;
};

export function AttendanceCalendar({
  days,
  startDate,
  endDate,
  today,
  semesterId,
  onSelectDay,
  selectionMode,
  selectedDates,
  onToggleSelectionMode,
  onToggleDate,
}: Props) {
  const [anchor, setAnchor] = useState(() => clampMonth(dayjs(today), startDate, endDate));
  const todayMonth = clampMonth(dayjs(today), startDate, endDate);
  const daysByDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const monthStart = anchor.startOf("month");
  const gridStart = monthStart.startOf("week");
  const gridEnd = monthStart.endOf("month").endOf("week");
  const personalEvents = usePersonalEvents({
    from: gridStart.format("YYYY-MM-DD"),
    to: gridEnd.format("YYYY-MM-DD"),
  });
  const eventDates = useMemo(
    () => personalEventDates(personalEvents.data?.events ?? []),
    [personalEvents.data?.events],
  );
  const cells: dayjs.Dayjs[] = [];
  for (let d = gridStart; d.isBefore(gridEnd) || d.isSame(gridEnd); d = d.add(1, "day")) cells.push(d);

  const atStart = anchor.isSame(dayjs(startDate), "month");
  const atEnd = anchor.isSame(dayjs(endDate), "month");

  return (
    <div className="rounded-3xl bg-bg-elevated p-3 shadow-card">
      <header className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setAnchor(anchor.subtract(1, "month"))}
          disabled={atStart}
          aria-label="前の月"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-fg-primary/6 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="text-base font-bold">{anchor.format("YYYY年 M月")}</h3>
        <button
          type="button"
          onClick={() => setAnchor(anchor.add(1, "month"))}
          disabled={atEnd}
          aria-label="次の月"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-fg-primary/6 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </header>
      <div className="mb-2 flex justify-end gap-2">
        {!anchor.isSame(todayMonth, "month") ? (
          <button
            type="button"
            onClick={() => setAnchor(todayMonth)}
            className="rounded-full bg-fg-primary/8 px-3 py-2 text-xs font-bold text-fg-secondary transition hover:text-fg-primary"
          >
            今日
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleSelectionMode}
          aria-pressed={selectionMode}
          className={`rounded-full px-3 py-2 text-xs font-bold transition ${
            selectionMode ? "bg-accent-500 text-fg-on-accent" : "bg-fg-primary/8 text-fg-secondary hover:text-fg-primary"
          }`}
        >
          {selectionMode ? "選択中" : "複数選択"}
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-fg-tertiary">
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {cells.map((cell) => {
          const iso = cell.format("YYYY-MM-DD");
          const summary = daysByDate.get(iso);
          const inMonth = cell.isSame(monthStart, "month");
          const inSemester = iso >= startDate && iso <= endDate;
          const visual = dayVisual(summary, { future: iso > today });
          const glyphs = dayGlyphs(visual.marks);
          const background = dayBackground(visual.marks);
          const hasEvent = eventDates.has(iso);
          const selected = selectedDates.has(iso);
          const disabled = selectionMode && !inSemester;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => {
                if (selectionMode) onToggleDate(iso);
                else onSelectDay(iso);
              }}
              disabled={disabled}
              aria-label={cell.format("M月D日")}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm tabular-nums transition active:scale-95 ${
                inMonth ? "text-fg-primary hover:border-accent-500/40" : "text-fg-tertiary opacity-40"
              } ${visual.dashed ? "border-dashed" : "border-border-subtle"} ${
                iso === today ? "ring-1 ring-accent-500/60" : ""
              } ${selected ? "ring-2 ring-accent-500" : ""} disabled:opacity-25`}
              style={{
                ...(background ? { background } : {}),
                ...(visual.dashed ? { borderColor: "color-mix(in srgb, var(--color-status-tardy) 40%, transparent)" } : {}),
              }}
            >
              {selected ? (
                <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-accent-500 text-fg-on-accent" aria-hidden="true">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              ) : null}
              {hasEvent ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent-500" aria-hidden="true" /> : null}
              <span className="font-bold">{cell.date()}</span>
              {glyphs.length === 0 ? (
                <span className="mt-0.5 h-4 w-4" aria-hidden="true" />
              ) : (
                <span className="mt-0.5 flex items-center justify-center gap-0.5">
                  {glyphs.map((glyph) => (
                    <DayGlyph key={glyph.kind} mark={glyph} small={glyphs.length >= 2} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

export function clampMonth(value: dayjs.Dayjs, startDate: string, endDate: string) {
  const start = dayjs(startDate).startOf("month");
  const end = dayjs(endDate).startOf("month");
  const month = value.startOf("month");
  if (month.isBefore(start)) return start;
  if (month.isAfter(end)) return end;
  return month;
}

function StatusIcon({
  icon,
  color,
  className,
  textClassName,
}: {
  icon: DayVisualIcon;
  color: string;
  className?: string;
  textClassName?: string;
}) {
  const props = { className, style: { color }, strokeWidth: 2.5, "aria-hidden": true };
  if (icon === "check") return <Check {...props} />;
  if (icon === "x") return <X {...props} />;
  if (icon === "clock") return <Clock {...props} />;
  if (icon === "ban") return <Ban {...props} />;
  if (icon === "minus") return <Minus {...props} />;
  return (
    <span className={`font-bold leading-none ${textClassName ?? "text-[12px]"}`} style={{ color }} aria-hidden="true">
      公
    </span>
  );
}

function DayGlyph({ mark, small }: { mark: DayMark; small: boolean }) {
  return (
    <StatusIcon
      icon={mark.icon}
      color={mark.iconColor}
      className={small ? "h-3 w-3" : "h-4 w-4"}
      textClassName={small ? "text-[12px]" : "text-[16px]"}
    />
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-fg-tertiary">
      <LegendItem icon="check" color="var(--color-status-present)" label="出席" />
      <LegendItem icon="x" color="var(--color-status-absent)" label="欠席" />
      <LegendItem icon="excused" color="var(--color-status-excused)" label="公欠" />
      <LegendItem icon="clock" color="var(--color-status-tardy)" label="遅刻・早退" />
      <LegendItem icon="ban" color="var(--color-status-suspended)" label="休講" />
      <span className="inline-flex items-center gap-1"><span className="h-3.5 w-3.5 rounded border border-dashed" style={{ borderColor: "color-mix(in srgb, var(--color-status-tardy) 40%, transparent)" }} />未記録</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-500" />予定</span>
    </div>
  );
}

function LegendItem({ icon, color, label }: { icon: DayVisualIcon; color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StatusIcon icon={icon} color={color} className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
