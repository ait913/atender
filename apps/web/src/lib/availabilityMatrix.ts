import dayjs from "dayjs";
import type { RoomEventDto, RoomWeekDto } from "@atender/shared";

export type AvailabilityCell = {
  freeCount: number;
  freeMembers: string[];
  busyMembers: string[];
};

function eventOverlapsPeriod(event: RoomEventDto, date: string, startMinute: number, endMinute: number) {
  const start = dayjs(event.start);
  const end = dayjs(event.end);
  const cellStart = dayjs(date).startOf("day").add(startMinute, "minute");
  const cellEnd = dayjs(date).startOf("day").add(endMinute, "minute");
  return start.isBefore(cellEnd) && end.isAfter(cellStart);
}

export function computeAvailabilityMatrix(week: RoomWeekDto, periods: Array<{ periodIndex: number; startMinute: number; endMinute: number }>) {
  const days = Array.from({ length: 7 }, (_, offset) => dayjs(week.weekStart).add(offset, "day").format("YYYY-MM-DD"));
  const matrix: AvailabilityCell[][] = days.map((date) =>
    periods.map((period) => {
      const freeMembers: string[] = [];
      const busyMembers: string[] = [];
      for (const member of week.members) {
        const busyByMeeting = week.meetings.some(
          (meeting) =>
            meeting.userId === member.userId &&
            meeting.date === date &&
            meeting.startMinute < period.endMinute &&
            meeting.endMinute > period.startMinute,
        );
        const busyByRoomEvent = week.roomEvents.some((event) => eventOverlapsPeriod(event, date, period.startMinute, period.endMinute));
        (busyByMeeting || busyByRoomEvent ? busyMembers : freeMembers).push(member.name ?? member.handle ?? "No name");
      }
      return { freeCount: freeMembers.length, freeMembers, busyMembers };
    }),
  );
  return { days, matrix };
}
