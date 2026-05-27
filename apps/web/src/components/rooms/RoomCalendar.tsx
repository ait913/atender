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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
    <section className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <h3 className="mb-3 text-sm font-black text-fg-primary">{dayjs(date).format("M/D")} の予定</h3>
      {events.length > 0 ? (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.kind === "meeting" ? `m:${event.userId}:${event.courseId}:${event.startMinute}` : `e:${event.eventId}`} className="flex min-w-0 items-center gap-2 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: event.kind === "meeting" ? event.memberColor : event.authorColor }} />
              <span className="shrink-0 font-bold tabular-nums text-fg-secondary">{formatMinute(event.startMinute)}</span>
              <span className="truncate text-fg-primary">{event.kind === "meeting" ? `${event.courseName} (${event.memberName})` : event.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-tertiary">予定なし</p>
      )}
    </section>
  );
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
