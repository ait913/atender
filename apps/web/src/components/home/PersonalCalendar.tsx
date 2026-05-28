import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useSemesterOverview } from "@/api/hooks";
import { Panel } from "@/components/ui";
import { CalendarDay } from "@/components/rooms/calendar/CalendarDay";
import { CalendarMonth } from "@/components/rooms/calendar/CalendarMonth";
import { CalendarSegmented } from "@/components/rooms/calendar/CalendarSegmented";
import { CalendarWeek } from "@/components/rooms/calendar/CalendarWeek";
import { PeriodNav } from "@/components/rooms/calendar/PeriodNav";
import { weekStartsFor, type CalendarViewMode } from "@/lib/calendarRange";
import { eventsByDate, type CalendarEvent } from "@/lib/meetingExpansion";

type Props = { semesterId: string | null };

export function PersonalCalendar({ semesterId }: Props) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [anchor, setAnchor] = useState(() => dayjs().startOf("day"));
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const weekStarts = useMemo(() => weekStartsFor(viewMode, anchor), [anchor, viewMode]);
  const overview = useSemesterOverview(semesterId);
  const events = useMemo<CalendarEvent[]>(() => {
    return (overview.data?.days ?? []).flatMap((day) => {
      if (day.status === "NO_CLASS") return [];
      return [{
        kind: "personal" as const,
        eventId: `personal:${day.date}`,
        date: day.date,
        title: dayStatusLabel(day.status),
        startMinute: 9 * 60,
        endMinute: 10 * 60,
        authorName: "自分",
        authorColor: dayStatusColor(day.status),
        occurrenceDate: day.date,
      }];
    });
  }, [overview.data?.days]);
  const eventMap = useMemo(() => eventsByDate(events), [events]);
  const dayEvents = eventMap.get(selectedDate) ?? [];

  function selectDate(date: string) {
    setSelectedDate(date);
    setAnchor(dayjs(date));
  }

  if (!semesterId) return <Panel>学期を選択してください。</Panel>;
  if (overview.isLoading) return <Panel>読み込み中...</Panel>;
  if (overview.isError) return <Panel>カレンダーを読み込めませんでした。</Panel>;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PeriodNav
          viewMode={viewMode}
          anchor={anchor}
          onChange={(next) => {
            setAnchor(next);
            if (viewMode === "day") setSelectedDate(next.format("YYYY-MM-DD"));
          }}
        />
        <CalendarSegmented viewMode={viewMode} onChange={setViewMode} />
      </div>
      {viewMode === "month" ? (
        <CalendarMonth anchor={anchor} selectedDate={selectedDate} events={events} onSelectDate={selectDate} />
      ) : viewMode === "week" ? (
        <CalendarWeek weekStart={weekStarts[0] ?? selectedDate} selectedDate={selectedDate} eventsByDateMap={eventMap} onSelectDate={selectDate} />
      ) : (
        <CalendarDay date={selectedDate} events={dayEvents} />
      )}
    </div>
  );
}

function dayStatusLabel(status: string) {
  if (status === "ALL_PRESENT") return "出席";
  if (status === "HAS_ABSENT") return "欠席あり";
  if (status === "HAS_TARDY") return "遅刻・早退あり";
  if (status === "ALL_SUSPENDED") return "休講";
  return "未記録あり";
}

function dayStatusColor(status: string) {
  if (status === "ALL_PRESENT") return "var(--color-status-present)";
  if (status === "HAS_ABSENT") return "var(--color-status-absent)";
  if (status === "HAS_TARDY") return "var(--color-status-tardy)";
  if (status === "ALL_SUSPENDED") return "var(--color-status-cancelled)";
  return "var(--color-status-none)";
}
