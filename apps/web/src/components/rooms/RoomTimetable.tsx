import dayjs from "dayjs";
import { useMemo } from "react";
import { useRoomWeek } from "@/api/hooks";
import { EmptyState, Panel } from "@/components/ui";
import { clusterByDay, type LaneEvent } from "@/lib/timetableCluster";
import {
  computeViewRange,
  dynamicDays,
  heightPercent,
  normalizeToTimetableEvents,
  topPercent,
  type ViewRange,
} from "@/lib/timetableNormalize";

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

export function RoomTimetable({ roomId }: { roomId: string }) {
  const weekStart = useMemo(() => {
    const now = dayjs();
    const day = now.day();
    return now.subtract(day === 0 ? 6 : day - 1, "day").format("YYYY-MM-DD");
  }, []);
  const week = useRoomWeek(roomId, weekStart);
  const events = useMemo(() => (week.data ? normalizeToTimetableEvents(week.data) : []), [week.data]);
  const days = useMemo(() => dynamicDays(events), [events]);
  const range = useMemo(() => computeViewRange(events), [events]);
  const byDay = useMemo(() => clusterByDay(events), [events]);
  const hourLabels = useMemo(() => {
    const start = Math.floor(range.minMinute / 60);
    const end = Math.ceil(range.maxMinute / 60);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [range]);

  if (week.isLoading) return <Panel>読み込み中...</Panel>;
  if (week.isError) return <Panel>時間割を読み込めませんでした。</Panel>;
  if (events.length === 0) {
    return <EmptyState title={week.data?.members.length ? "メンバーの時間割がまだありません" : "メンバーがいません"} />;
  }

  return (
    <div
      className="grid overflow-hidden rounded-2xl bg-bg-elevated shadow-card"
      style={{
        gridTemplateColumns: `40px repeat(${days.length}, minmax(0, 1fr))`,
        gridTemplateRows: "auto 1fr",
        height: "calc(100dvh - var(--room-tt-chrome-top) - var(--room-tt-chrome-bottom) - env(safe-area-inset-bottom, 0px))",
        minHeight: "320px",
      }}
    >
      <div className="border-b border-white/8" />
      {days.map((day) => (
        <div key={day} className="border-b border-l border-white/8 py-2 text-center text-xs font-black text-fg-secondary">
          {DAY_LABELS[day - 1]}
        </div>
      ))}
      <div className="relative">
        {hourLabels.map((hour) => (
          <span
            key={hour}
            className="absolute left-0 right-1 text-right text-[10px] font-bold text-fg-tertiary tabular-nums"
            style={{ top: `${topPercent(hour * 60, range)}%`, transform: "translateY(-50%)" }}
          >
            {String(hour).padStart(2, "0")}
          </span>
        ))}
      </div>
      {days.map((day) => (
        <DayColumn key={day} events={byDay.get(day) ?? []} range={range} />
      ))}
    </div>
  );
}

function DayColumn({ events, range }: { events: LaneEvent[]; range: ViewRange }) {
  const hourLines = useMemo(() => {
    const start = Math.floor(range.minMinute / 60);
    const end = Math.ceil(range.maxMinute / 60);
    return Array.from({ length: end - start + 1 }, (_, index) => (start + index) * 60);
  }, [range]);
  return (
    <div className="relative border-l border-white/8">
      {hourLines.map((minute) => (
        <div
          key={`grid-${minute}`}
          className="pointer-events-none absolute left-0 right-0 h-px bg-white/5"
          style={{ top: `${topPercent(minute, range)}%` }}
        />
      ))}
      {events.map((event) => {
        const width = 100 / event.laneCount;
        const color = event.memberColor;
        const subColor = `color-mix(in srgb, ${color} 70%, var(--event-mix-target))`;
        const tint = /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}1f` : "rgba(255,255,255,0.06)";
        return (
          <div
            key={`${event.userId}:${event.courseId}:${event.dayOfWeek}:${event.startMinute}:${event.lane}`}
            className="absolute overflow-hidden rounded-[12px]"
            style={{
              top: `${topPercent(event.startMinute, range)}%`,
              height: `${heightPercent(event.startMinute, event.endMinute, range)}%`,
              left: `${event.lane * width}%`,
              width: `calc(${width}% - 2px)`,
              background: tint,
            }}
            title={`${event.memberName}: ${event.courseName}`}
          >
            <span
              className="absolute left-0 top-1 bottom-1 w-1.5 rounded-full"
              style={{ background: color, boxShadow: `0 0 8px ${color}, inset 0 0 3px rgba(255,255,255,0.4)` }}
            />
            <div className="flex h-full flex-col gap-0.5 pl-2.5 pr-1 py-1">
              <p className="truncate text-[11px] font-semibold leading-snug text-fg-primary">{event.courseName}</p>
              <p className="truncate text-[10px] leading-tight" style={{ color: subColor }}>{event.memberName}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
