import dayjs from "dayjs";
import type { AttendanceDaySummary, RoomWeekDto, UserTimetableDto } from "@atender/shared";
import { memberColor as fallbackMemberColor } from "./memberColor";

export type MeetingEvent = {
  kind: "meeting";
  userId: string;
  memberName: string;
  memberColor: string;
  courseId: string;
  courseName: string;
  courseColor: string | null;
  date: string;
  startMinute: number;
  endMinute: number;
};

export type RoomEventEvent = {
  kind: "roomEvent";
  eventId: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  title: string;
  source: RoomWeekDto["roomEvents"][number]["source"];
  occurrenceDate?: string;
  date: string;
  startMinute: number;
  endMinute: number;
  isAllDay: boolean;
};

export type PersonalEvent = {
  kind: "personal";
  eventId: string;
  seriesId: string;
  date: string;
  title: string;
  startMinute: number;
  endMinute: number;
  authorName: string;
  authorColor: string;
  occurrenceDate: string;
  isAllDay: boolean;
  isRecurringOccurrence: boolean;
};

export type CalendarEvent = MeetingEvent | RoomEventEvent | PersonalEvent;

export type ExpandUserTimetableInput = {
  timetable: Pick<UserTimetableDto, "meetings" | "courses" | "daySlots">;
  /** 展開する日付範囲 (両端含む, "YYYY-MM-DD")。表示中のレンジに絞ってパフォーマンスを守る */
  rangeStart: string;
  rangeEnd: string;
  /** 学期範囲 (両端含む)。この外の日付は学期外として展開しない。省略時は範囲制限なし */
  semesterStart?: string;
  semesterEnd?: string;
  /** 日付 → 出席ステータス (休講/授業なし判定用)。省略可 */
  statusByDate?: Map<string, AttendanceDaySummary["status"]>;
};

/**
 * 自分の時間割を [rangeStart, rangeEnd] に日付展開して実授業イベントを返す。
 * - 各日付 × その曜日に該当する各 meeting を 1 イベント化。
 * - 開始/終了分は daySlots から解決:
 *     startMinute = daySlot(startPeriodIndex).startMinute
 *     endMinute   = daySlot(startPeriodIndex + periodCount - 1).endMinute
 * - statusByDate[date] === "NO_CLASS" の日は展開しない (休校・祝日等で授業が無い日)。
 * - statusByDate[date] === "ALL_SUSPENDED" の日は展開する (休講でも「予定された授業」は存在し、
 *   ユーザーは履歴として見たい)。休講マークは描画側 (CalendarMonth) が statusByDate を使って重ねる。
 * - semesterStart/End の外の日付は展開しない。
 * - daySlot が見つからない (periodIndex 不在) meeting はスキップ (壊れたデータの防御)。
 * 出力は (date asc, startMinute asc) で安定ソート。
 */
export function expandUserTimetable(input: ExpandUserTimetableInput): MeetingEvent[] {
  const courseMap = new Map(input.timetable.courses.map((course) => [course.id, course]));
  const slotMap = new Map(input.timetable.daySlots.map((slot) => [slot.periodIndex, slot]));
  const events: MeetingEvent[] = [];
  const start = dayjs(input.rangeStart);
  const end = dayjs(input.rangeEnd);

  for (let cursor = start; cursor.isBefore(end) || cursor.isSame(end, "day"); cursor = cursor.add(1, "day")) {
    const date = cursor.format("YYYY-MM-DD");
    if (input.semesterStart && date < input.semesterStart) continue;
    if (input.semesterEnd && date > input.semesterEnd) continue;
    if (input.statusByDate?.get(date) === "NO_CLASS") continue;

    const dayOfWeek = cursor.day();
    for (const meeting of input.timetable.meetings) {
      if (meeting.dayOfWeek !== dayOfWeek) continue;
      const course = courseMap.get(meeting.courseId);
      if (!course) continue;
      const startSlot = slotMap.get(meeting.startPeriodIndex);
      if (!startSlot) continue;
      const endSlot = slotMap.get(meeting.startPeriodIndex + meeting.periodCount - 1) ?? startSlot;
      events.push({
        kind: "meeting",
        userId: "",
        memberName: "自分",
        memberColor: course.color ?? fallbackMemberColor(meeting.courseId),
        courseId: meeting.courseId,
        courseName: course.name,
        courseColor: course.color,
        date,
        startMinute: startSlot.startMinute,
        endMinute: endSlot.endMinute,
      });
    }
  }

  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startMinute - b.startMinute;
  });
}

export function buildCalendarEvents(weeks: RoomWeekDto[]): CalendarEvent[] {
  const members = new Map<string, { name: string | null; handle: string | null; color: string }>();
  for (const week of weeks) {
    for (const member of week.members) {
      if (!members.has(member.userId)) {
        members.set(member.userId, { name: member.name, handle: member.handle, color: member.color });
      }
    }
  }

  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  for (const week of weeks) {
    for (const meeting of week.meetings) {
      const key = `m:${meeting.occurrenceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const member = members.get(meeting.userId);
      events.push({
        kind: "meeting",
        userId: meeting.userId,
        memberName: member?.name ?? member?.handle ?? "No name",
        memberColor: member?.color ?? fallbackMemberColor(meeting.userId),
        courseId: meeting.courseId,
        courseName: meeting.courseName,
        courseColor: meeting.courseColor,
        date: meeting.date,
        startMinute: meeting.startMinute,
        endMinute: meeting.endMinute,
      });
    }

    for (const roomEvent of week.roomEvents) {
      const key = `e:${roomEvent.seriesId}:${roomEvent.occurrenceDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const author = members.get(roomEvent.authorId);
      const start = dayjs(roomEvent.start);
      const end = dayjs(roomEvent.end);
      events.push({
        kind: "roomEvent",
        eventId: roomEvent.id,
        authorId: roomEvent.authorId,
        authorName: author?.name ?? author?.handle ?? "No name",
        authorColor: author?.color ?? fallbackMemberColor(roomEvent.authorId),
        title: roomEvent.title,
        source: roomEvent.source,
        occurrenceDate: roomEvent.occurrenceDate,
        date: start.format("YYYY-MM-DD"),
        startMinute: start.hour() * 60 + start.minute(),
        endMinute: end.hour() * 60 + end.minute(),
        isAllDay: roomEvent.isAllDay,
      });
    }
  }

  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startMinute - b.startMinute;
  });
}

export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  }
  return map;
}
