import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { RoomWeekDto } from "@atender/shared";
import { useRoomMonth } from "@/api/hooks";
import { Panel } from "@/components/ui";
import { weekStartsFor, type CalendarViewMode } from "@/lib/calendarRange";
import { buildCalendarEvents, eventsByDate, type CalendarEvent } from "@/lib/meetingExpansion";
import { AvailabilityBar } from "./calendar/AvailabilityBar";
import { CalendarDay } from "./calendar/CalendarDay";
import { CalendarMonth } from "./calendar/CalendarMonth";
import { CalendarSegmented } from "./calendar/CalendarSegmented";
import { CalendarWeek } from "./calendar/CalendarWeek";
import { PeriodNav } from "./calendar/PeriodNav";
import { RoomEventCreateSheet } from "./RoomEventCreateSheet";

export function RoomCalendar({ roomId }: { roomId: string }) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("day");
  const [anchor, setAnchor] = useState(() => dayjs().startOf("day"));
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [expanded, setExpanded] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const weekStarts = useMemo(() => weekStartsFor(viewMode, anchor), [anchor, viewMode]);
  const weekQueries = useRoomMonth(roomId, weekStarts);

  const data = useMemo(() => {
    const weeks = weekQueries.map((query) => query.data).filter((week): week is RoomWeekDto => week != null);
    return {
      weeks,
      members: weeks[0]?.members ?? [],
      events: buildCalendarEvents(weeks),
      loading: weekQueries.some((query) => query.isLoading),
      error: weekQueries.find((query) => query.isError)?.error ?? null,
    };
  }, [weekQueries]);

  const eventMap = useMemo(() => eventsByDate(data.events), [data.events]);
  const dayEvents = eventMap.get(selectedDate) ?? [];

  function selectDate(date: string) {
    setSelectedDate(date);
    setAnchor(dayjs(date));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PeriodNav viewMode={viewMode} anchor={anchor} onChange={(next) => {
          setAnchor(next);
          if (viewMode === "day") setSelectedDate(next.format("YYYY-MM-DD"));
        }} />
        <CalendarSegmented viewMode={viewMode} onChange={setViewMode} />
      </div>

      <AvailabilityBar
        date={selectedDate}
        members={data.members}
        events={dayEvents}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />

      {data.loading ? <Panel>読み込み中...</Panel> : null}
      {data.error && !data.loading ? <Panel>カレンダーを読み込めませんでした。</Panel> : null}
      {!data.loading && !data.error ? (
        viewMode === "month" ? (
          <>
            <CalendarMonth anchor={anchor} selectedDate={selectedDate} events={data.events} onSelectDate={selectDate} />
            <DayEventList date={selectedDate} events={dayEvents} />
          </>
        ) : viewMode === "week" ? (
          <CalendarWeek weekStart={weekStarts[0] ?? selectedDate} selectedDate={selectedDate} eventsByDateMap={eventMap} onSelectDate={selectDate} />
        ) : (
          <CalendarDay date={selectedDate} events={dayEvents} />
        )
      ) : null}
      {viewMode !== "month" ? (
        <button
          type="button"
          className="fixed bottom-24 right-5 z-20 rounded-full bg-accent-500 px-5 py-3 text-sm font-black text-fg-on-accent shadow-glow-soft transition active:scale-95"
          onClick={() => setEventOpen(true)}
        >
          + 予定を追加
        </button>
      ) : null}
      <RoomEventCreateSheet roomId={roomId} open={eventOpen} onClose={() => setEventOpen(false)} />
    </div>
  );
}

function DayEventList({ date, events }: { date: string; events: CalendarEvent[] }) {
  return (
    <section className="rounded-2xl bg-bg-elevated p-3 shadow-card">
      <h3 className="mb-2 text-xs font-bold text-fg-tertiary">{dayjs(date).format("M/D")} の予定</h3>
      {events.length > 0 ? (
        <ul className="space-y-1.5">
          {events.map((event) => {
            const color = event.kind === "meeting" ? event.memberColor : event.authorColor;
            const subColor = `color-mix(in srgb, ${color} 70%, var(--event-mix-target))`;
            const tint = /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}1f` : "rgba(255,255,255,0.06)";
            return (
              <li
                key={event.kind === "meeting" ? `m:${event.userId}:${event.courseId}:${event.startMinute}` : `e:${event.eventId}`}
                className="relative overflow-hidden rounded-[12px] border border-white/10"
                style={{ background: tint }}
              >
                <span
                  className="absolute left-0 top-1 bottom-1 w-1 rounded-full"
                  style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                />
                <div className="flex items-baseline gap-2 pl-3 pr-2 py-1.5 text-[12px]">
                  <span className="shrink-0 font-bold tabular-nums" style={{ color: subColor }}>{formatMinute(event.startMinute)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-fg-primary">{event.kind === "meeting" ? event.courseName : event.title}</span>
                  <span className="shrink-0 text-[10px]" style={{ color: subColor }}>{event.kind === "meeting" ? event.memberName : event.authorName}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-fg-tertiary">予定なし</p>
      )}
    </section>
  );
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
