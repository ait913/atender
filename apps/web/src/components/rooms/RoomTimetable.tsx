import dayjs from "dayjs";
import { useMemo } from "react";
import type { DaySlotDto } from "@atender/shared";
import { useMe, useRoomWeek, useUserTimetables } from "@/api/hooks";
import { TimetableView, type TimetableEventInput } from "@/components/timetable/TimetableView";
import { EmptyState, Panel } from "@/components/ui";

const DEFAULT_SLOTS: DaySlotDto[] = [
  { periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false },
  { periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false },
  { periodIndex: 3, label: "3限", startMinute: 780, endMinute: 870, isBreak: false },
  { periodIndex: 4, label: "4限", startMinute: 880, endMinute: 970, isBreak: false },
  { periodIndex: 5, label: "5限", startMinute: 980, endMinute: 1070, isBreak: false },
];

export function RoomTimetable({ roomId }: { roomId: string }) {
  const weekStart = useMemo(() => {
    const now = dayjs();
    const day = now.day();
    return now.subtract(day === 0 ? 6 : day - 1, "day").format("YYYY-MM-DD");
  }, []);
  const week = useRoomWeek(roomId, weekStart);
  const me = useMe();
  const timetables = useUserTimetables();

  // daySlots: 自分の defaultSemester の時間割があればそれを採用、無ければデフォルト
  const daySlots = useMemo<DaySlotDto[]>(() => {
    const defaultSemesterId = me.data?.user.defaultSemesterId ?? null;
    const myTimetable = timetables.data?.userTimetables.find((t) => t.semesterId === defaultSemesterId)
      ?? timetables.data?.userTimetables[0];
    return myTimetable?.daySlots ?? DEFAULT_SLOTS;
  }, [me.data?.user.defaultSemesterId, timetables.data?.userTimetables]);

  // RoomWeekDto.meetings は date + startMinute/endMinute なので、daySlots に照合して periodIndex/dayOfWeek を割り出す
  const events = useMemo<TimetableEventInput[]>(() => {
    if (!week.data) return [];
    const memberById = new Map(week.data.members.map((m) => [m.userId, m]));
    const slots = [...daySlots].sort((a, b) => a.startMinute - b.startMinute);

    type Acc = { event: TimetableEventInput; key: string };
    const seen = new Map<string, Acc>();

    for (const meeting of week.data.meetings) {
      // date → dayOfWeek (1=Mon..7=Sun)
      const d = dayjs(meeting.date);
      const dow = ((d.day() + 6) % 7) + 1; // Sun(0)→7, Mon(1)→1, ...
      // startMinute が含まれる slot を起点とし、endMinute まで何 slot 跨ぐかを数える
      const startSlot = slots.find((s) => meeting.startMinute >= s.startMinute && meeting.startMinute < s.endMinute)
        ?? slots.find((s) => meeting.startMinute < s.endMinute);
      if (!startSlot) continue;
      let span = 1;
      const startIdx = slots.findIndex((s) => s.periodIndex === startSlot.periodIndex);
      for (let i = startIdx + 1; i < slots.length; i++) {
        if (slots[i].startMinute < meeting.endMinute) span += 1;
        else break;
      }
      const member = memberById.get(meeting.userId);
      const color = meeting.courseColor ?? member?.color ?? "#F97316";
      const memberName = member?.name ?? member?.handle ?? "";
      // 同一 (member, courseId, dayOfWeek, periodIndex) は週内で重複しがちなので集約
      const key = `${meeting.userId}:${meeting.courseId}:${dow}:${startSlot.periodIndex}`;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          event: {
            id: key,
            dayOfWeek: dow,
            startPeriodIndex: startSlot.periodIndex,
            periodCount: span,
            color,
            title: meeting.courseName,
            subtitle: memberName || undefined,
            mergeKey: `${meeting.userId}:${meeting.courseId}`,
          },
        });
      }
    }
    return Array.from(seen.values()).map((acc) => acc.event);
  }, [week.data, daySlots]);

  if (week.isLoading) return <Panel>読み込み中...</Panel>;
  if (week.isError) return <Panel>時間割を読み込めませんでした。</Panel>;
  if (events.length === 0) {
    return <EmptyState title={week.data?.members.length ? "メンバーの時間割がまだありません" : "メンバーがいません"} />;
  }

  return (
    <TimetableView
      daySlots={daySlots}
      events={events}
      height="calc(100dvh - var(--room-tt-chrome-top, 168px) - var(--tab-bar-height) - env(safe-area-inset-bottom, 0px))"
    />
  );
}
