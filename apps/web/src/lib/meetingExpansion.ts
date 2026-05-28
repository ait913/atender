import dayjs from "dayjs";
import type { RoomWeekDto } from "@atender/shared";
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

export type CalendarEvent = MeetingEvent | RoomEventEvent;

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
