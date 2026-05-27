import type { RoomWeekDto } from "@atender/shared";
import { memberColor as fallbackMemberColor } from "./memberColor";

export type TimetableEvent = {
  userId: string;
  memberName: string;
  memberColor: string;
  courseId: string;
  courseName: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export type ViewRange = { minMinute: number; maxMinute: number };

export function dateToDayOfWeek(date: string): number {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

export function normalizeToTimetableEvents(week: RoomWeekDto): TimetableEvent[] {
  const members = new Map(week.members.map((member) => [member.userId, member]));
  const seen = new Set<string>();
  const out: TimetableEvent[] = [];
  for (const meeting of week.meetings) {
    if (meeting.endMinute <= meeting.startMinute) continue;
    const key = `${meeting.userId}:${meeting.courseId}:${meeting.date}:${meeting.startMinute}:${meeting.endMinute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const member = members.get(meeting.userId);
    out.push({
      userId: meeting.userId,
      memberName: member?.name ?? member?.handle ?? "No name",
      memberColor: member?.color ?? fallbackMemberColor(meeting.userId),
      courseId: meeting.courseId,
      courseName: meeting.courseName,
      dayOfWeek: dateToDayOfWeek(meeting.date),
      startMinute: meeting.startMinute,
      endMinute: meeting.endMinute,
    });
  }
  return out;
}

export function dynamicDays(events: TimetableEvent[]): number[] {
  const days = new Set(events.map((event) => event.dayOfWeek));
  return days.has(6) || days.has(7) ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
}

export function computeViewRange(events: TimetableEvent[]): ViewRange {
  if (events.length === 0) return { minMinute: 9 * 60, maxMinute: 18 * 60 };
  const min = Math.min(...events.map((event) => event.startMinute));
  const max = Math.max(...events.map((event) => event.endMinute));
  return {
    minMinute: Math.floor(min / 30) * 30,
    maxMinute: Math.ceil(max / 30) * 30,
  };
}

export function topPercent(minute: number, range: ViewRange): number {
  return ((minute - range.minMinute) / (range.maxMinute - range.minMinute)) * 100;
}

export function heightPercent(startMin: number, endMin: number, range: ViewRange): number {
  return ((endMin - startMin) / (range.maxMinute - range.minMinute)) * 100;
}
