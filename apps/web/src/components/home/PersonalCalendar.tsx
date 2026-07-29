import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { AttendanceDaySummary } from "@atender/shared";
import { usePersonalEvents, useSemesterOverview, useSemesters, useUserTimetables } from "@/api/hooks";
import { CalendarDaySkeleton, CalendarMonthSkeleton, CalendarWeekSkeleton, DayAgendaPanelSkeleton, Panel } from "@/components/ui";
import { CalendarDay } from "@/components/rooms/calendar/CalendarDay";
import { CalendarMonth } from "@/components/rooms/calendar/CalendarMonth";
import { CalendarSegmented } from "@/components/rooms/calendar/CalendarSegmented";
import { CalendarWeek } from "@/components/rooms/calendar/CalendarWeek";
import { DayAgendaPanel } from "@/components/rooms/calendar/DayAgendaPanel";
import { PeriodNav } from "@/components/rooms/calendar/PeriodNav";
import { monthGridRange, weekStartsFor, type CalendarViewMode } from "@/lib/calendarRange";
import { eventsByDate, expandUserTimetable, type CalendarEvent } from "@/lib/meetingExpansion";
import { personalEventsToCalendarEvents } from "@/lib/personalEventDays";

type Props = { semesterId: string | null };

export function PersonalCalendar({ semesterId }: Props) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [anchor, setAnchor] = useState(() => dayjs().startOf("day"));
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const weekStarts = useMemo(() => weekStartsFor(viewMode, anchor), [anchor, viewMode]);
  const timetables = useUserTimetables();
  const semesters = useSemesters();
  const overview = useSemesterOverview(semesterId);
  const timetable = timetables.data?.userTimetables.find((t) => t.semesterId === semesterId) ?? null;
  const semester = semesters.data?.semesters.find((s) => s.id === semesterId) ?? null;

  const statusByDate = useMemo(() => {
    const map = new Map<string, AttendanceDaySummary["status"]>();
    for (const day of overview.data?.days ?? []) map.set(day.date, day.status);
    return map;
  }, [overview.data?.days]);

  const range = useMemo(() => {
    if (viewMode === "month") {
      return monthGridRange(anchor);
    }
    if (viewMode === "week") {
      const start = weekStarts[0] ?? selectedDate;
      return { start, end: dayjs(start).add(6, "day").format("YYYY-MM-DD") };
    }
    return { start: selectedDate, end: selectedDate };
  }, [anchor, selectedDate, viewMode, weekStarts]);
  const personalEvents = usePersonalEvents({ from: range.start, to: range.end });

  const events = useMemo<CalendarEvent[]>(() => {
    if (!timetable || !semester) return [];
    const meetingEvents = expandUserTimetable({
      timetable,
      rangeStart: range.start,
      rangeEnd: range.end,
      semesterStart: semester.startDate,
      semesterEnd: semester.endDate,
      statusByDate,
    });
    const ownEvents: CalendarEvent[] = personalEventsToCalendarEvents(personalEvents.data?.events ?? []);
    return [...meetingEvents, ...ownEvents].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startMinute - b.startMinute;
    });
  }, [personalEvents.data?.events, range.end, range.start, semester, statusByDate, timetable]);
  const eventMap = useMemo(() => eventsByDate(events), [events]);
  const dayEvents = eventMap.get(selectedDate) ?? [];

  function selectDate(date: string) {
    setSelectedDate(date);
    setAnchor(dayjs(date));
  }

  if (!semesterId) return <Panel>学期を選択してください。</Panel>;
  if (timetables.isLoading || semesters.isLoading || overview.isLoading || personalEvents.isLoading) {
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
          <>
            <CalendarMonthSkeleton />
            <DayAgendaPanelSkeleton />
          </>
        ) : viewMode === "week" ? (
          <CalendarWeekSkeleton />
        ) : (
          <CalendarDaySkeleton />
        )}
      </div>
    );
  }
  if (timetables.isError || semesters.isError || overview.isError || personalEvents.isError) return <Panel>カレンダーを読み込めませんでした。</Panel>;
  if (!timetable) return <Panel>この学期の時間割がありません</Panel>;
  if (!semester) return <Panel>学期を読み込めませんでした。</Panel>;

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
        <>
          <CalendarMonth anchor={anchor} selectedDate={selectedDate} events={events} statusByDate={statusByDate} onSelectDate={selectDate} />
          <DayAgendaPanel date={selectedDate} events={dayEvents} />
        </>
      ) : viewMode === "week" ? (
        <CalendarWeek weekStart={weekStarts[0] ?? selectedDate} selectedDate={selectedDate} eventsByDateMap={eventMap} onSelectDate={selectDate} />
      ) : (
        <CalendarDay date={selectedDate} events={dayEvents} />
      )}
    </div>
  );
}
