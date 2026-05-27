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
      className="grid overflow-hidden rounded-3xl bg-bg-elevated shadow-card"
      style={{
        gridTemplateColumns: `40px repeat(${days.length}, minmax(0, 1fr))`,
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
  return (
    <div className="relative border-l border-white/8">
      {events.map((event) => {
        const width = 100 / event.laneCount;
        return (
          <div
            key={`${event.userId}:${event.courseId}:${event.dayOfWeek}:${event.startMinute}:${event.lane}`}
            className="absolute overflow-hidden rounded-lg px-1 py-0.5 text-[10px] font-bold leading-tight text-white"
            style={{
              top: `${topPercent(event.startMinute, range)}%`,
              height: `${heightPercent(event.startMinute, event.endMinute, range)}%`,
              left: `${event.lane * width}%`,
              width: `calc(${width}% - 2px)`,
              background: event.memberColor,
            }}
            title={`${event.memberName}: ${event.courseName}`}
          >
            <div className="truncate">{event.memberName}</div>
            <div className="truncate opacity-85">{event.courseName}</div>
          </div>
        );
      })}
    </div>
  );
}
