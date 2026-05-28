import dayjs from "dayjs";
import { useMemo } from "react";
import { useRoomWeek } from "@/api/hooks";
import { EventTile } from "@/components/event-tile";
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
        gridTemplateColumns: `32px repeat(${days.length}, minmax(0, 1fr))`,
        gridTemplateRows: "auto 1fr",
        height: "calc(100dvh - var(--room-tt-chrome-top, 168px) - var(--tab-bar-height) - env(safe-area-inset-bottom, 0px))",
        minHeight: "320px",
      }}
    >
      <div className="border-b border-fg-primary/8" />
      {days.map((day) => (
        <div key={day} className="border-b border-l border-fg-primary/8 py-1.5 text-center text-[11px] font-black text-fg-secondary">
          {DAY_LABELS[day - 1]}
        </div>
      ))}
      <div className="relative">
        {hourLabels.map((hour) => (
          <span
            key={hour}
            className="absolute left-0 right-1 text-right text-[9px] font-semibold text-fg-tertiary tabular-nums"
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
    <div className="relative border-l border-fg-primary/8">
      {hourLines.map((minute) => (
        <div
          key={`grid-${minute}`}
          className="pointer-events-none absolute left-0 right-0 h-px bg-fg-primary/5"
          style={{ top: `${topPercent(minute, range)}%` }}
        />
      ))}
      {events.map((event) => {
        const width = 100 / event.laneCount;
        const color = event.memberColor;
        return (
          <EventTile
            key={`${event.userId}:${event.courseId}:${event.dayOfWeek}:${event.startMinute}:${event.lane}`}
            density="compact"
            color={color}
            title={event.courseName}
            subtitle={event.memberName}
            className="absolute"
            style={{
              top: `${topPercent(event.startMinute, range)}%`,
              height: `${heightPercent(event.startMinute, event.endMinute, range)}%`,
              left: `${event.lane * width}%`,
              width: `calc(${width}% - 2px)`,
            }}
            ariaLabel={`${event.memberName}: ${event.courseName}`}
          />
        );
      })}
    </div>
  );
}
