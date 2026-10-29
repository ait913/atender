import type { DaySlotDto, RoomWeekDto, UserTimetableDto } from "@atender/shared";
import type { TimetableEventInput } from "@/components/timetable/TimetableView";

export const DEFAULT_SLOTS: DaySlotDto[] = [540, 640, 780, 880, 980].map((startMinute, index) => ({
  periodIndex: index + 1,
  label: `${index + 1}限`,
  startMinute,
  endMinute: startMinute + 90,
  isBreak: false,
}));

export function resolveDaySlots(a: { preferredSemesterId: string | null; defaultSemesterId: string | null; timetables: UserTimetableDto[] }): DaySlotDto[] {
  const timetable = a.timetables.find((item) => item.semesterId === a.preferredSemesterId)
    ?? a.timetables.find((item) => item.semesterId === a.defaultSemesterId)
    ?? a.timetables[0];
  return timetable && timetable.daySlots.length > 0 ? timetable.daySlots : DEFAULT_SLOTS;
}

export function buildRecurringEvents(week: RoomWeekDto): TimetableEventInput[] {
  const seen = new Set<string>();
  const events: TimetableEventInput[] = [];
  for (const meeting of week.recurringMeetings) {
    const dayOfWeek = meeting.dayOfWeek || 7;
    const key = `${meeting.userId}:${meeting.courseId}:${dayOfWeek}:${meeting.startPeriodIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const member = week.members.find((item) => item.userId === meeting.userId);
    events.push({
      id: key,
      dayOfWeek,
      startPeriodIndex: meeting.startPeriodIndex,
      periodCount: Math.max(1, meeting.periodCount),
      color: meeting.courseColor ?? member?.color ?? "#F97316",
      title: meeting.courseName,
      subtitle: member?.name || member?.handle || "No name",
      mergeKey: `${meeting.userId}:${meeting.courseId}`,
    });
  }
  return events.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startPeriodIndex - b.startPeriodIndex);
}

export function displayDays(events: TimetableEventInput[]): number[] {
  return [...new Set([1, 2, 3, 4, 5, ...events.map((event) => event.dayOfWeek)])].sort((a, b) => a - b);
}

export function parseInviteCode(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.split("/").filter((part) => part !== "").at(-1) ?? trimmed;
}
