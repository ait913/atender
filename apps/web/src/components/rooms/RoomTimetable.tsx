import { useMe, useRoomWeek, useUserTimetables } from "@/api/hooks";
import { TimetableView } from "@/components/timetable/TimetableView";
import { EmptyState, Panel, TimetableGridSkeleton } from "@/components/ui";
import * as CalendarDate from "@/lib/CalendarDate";
import * as RoomTimetableLogic from "@/lib/RoomTimetableLogic";
import * as SchoolClock from "@/lib/SchoolClock";
import * as TimetableGridLayout from "@/lib/TimetableGridLayout";
import { useNow } from "@/lib/useNow";

export function RoomTimetable({ roomId, semesterId }: { roomId: string; semesterId: string | null }) {
  const now = useNow(60_000);
  const weekStart = CalendarDate.mondayOf(SchoolClock.todayString(now));
  const week = useRoomWeek(roomId, weekStart, semesterId);
  const me = useMe();
  const timetables = useUserTimetables();
  const daySlots = RoomTimetableLogic.resolveDaySlots({
    preferredSemesterId: semesterId,
    defaultSemesterId: me.data?.user.defaultSemesterId ?? null,
    timetables: timetables.data?.userTimetables ?? [],
  });
  const events = week.data ? RoomTimetableLogic.buildRecurringEvents(week.data) : [];
  const height = "calc(100dvh - var(--room-tt-chrome-top, 168px) - var(--tab-bar-height) - env(safe-area-inset-bottom, 0px))";

  return (
    <div data-testid="room-timetable">
      {week.isLoading ? <TimetableGridSkeleton days={5} rows={daySlots.length} height={height} />
        : week.isError ? <Panel>時間割を読み込めませんでした。</Panel>
        : events.length === 0 ? <EmptyState title={week.data?.members.length ? "メンバーの時間割がまだありません" : "メンバーがいません"} />
        : <TimetableView
            daySlots={daySlots}
            days={RoomTimetableLogic.displayDays(events)}
            events={events}
            height={height}
            todayDisplayDay={SchoolClock.displayDay(now)}
            currentPeriodIndex={TimetableGridLayout.currentPeriodIndex(daySlots, SchoolClock.nowMinute(now))}
          />}
    </div>
  );
}
