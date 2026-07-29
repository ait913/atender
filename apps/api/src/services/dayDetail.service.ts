import type { DayDetailDto, OccurrenceDto } from "@atender/shared";
import { prisma } from "../db";
import { dateStringToJstDay, toIsoDate } from "../lib/tz";
import { findActiveUserTimetable } from "./activeTimetable";
import { suspensionDto } from "./courseSuspension.service";
import { personalEventOccurrenceDto } from "./personalEvent.service";
import { expandPersonalEvents } from "./personalRecurrence.service";
import { timetableSuspensionDto } from "./timetableSuspension.service";

function occurrenceDto(occurrence: {
  id: string;
  meetingId: string;
  courseId: string;
  date: Date;
  periodOffset: number;
  startMinute: number;
  endMinute: number;
  meeting: { room: string | null; startPeriodIndex: number };
  course: { name: string; teacher: string | null; color: string | null };
  attendanceRecord: { status: OccurrenceDto["status"] } | null;
}): OccurrenceDto {
  return {
    id: occurrence.id,
    meetingId: occurrence.meetingId,
    courseId: occurrence.courseId,
    courseName: occurrence.course.name,
    teacher: occurrence.course.teacher,
    room: occurrence.meeting.room,
    color: occurrence.course.color,
    date: toIsoDate(occurrence.date),
    periodIndex: occurrence.meeting.startPeriodIndex + occurrence.periodOffset,
    periodOffset: occurrence.periodOffset,
    startMinute: occurrence.startMinute,
    endMinute: occurrence.endMinute,
    status: occurrence.attendanceRecord?.status ?? null,
  };
}

export async function getDayDetail(args: { userId: string; date: string }): Promise<DayDetailDto> {
  const day = dateStringToJstDay(args.date);
  const personalOccurrences = await expandPersonalEvents(args.userId, day.startOfDay, day.endOfDay);
  const personalEvents = personalOccurrences
    .map((occurrence) => personalEventOccurrenceDto(occurrence, day.isoDate, day.isoDate))
    .filter((dto) => dto.days.length > 0);
  const timetable = await findActiveUserTimetable(args.userId);
  if (!timetable) {
    return {
      date: day.isoDate,
      occurrences: [],
      courseSuspensions: [],
      timetableSuspension: null,
      personalEvents: personalEvents,
    };
  }

  const [occurrences, courseSuspensions, timetableSuspension] = await Promise.all([
    prisma.meetingOccurrence.findMany({
      where: {
        date: { gte: day.startOfDay, lte: day.endOfDay },
        meeting: { userTimetableId: timetable.id },
      },
      orderBy: { startMinute: "asc" },
      include: {
        meeting: true,
        course: true,
        attendanceRecord: true,
      },
    }),
    prisma.courseSuspension.findMany({
      where: {
        date: { gte: day.startOfDay, lte: day.endOfDay },
        course: { userTimetableId: timetable.id },
      },
      orderBy: { date: "asc" },
    }),
    prisma.timetableSuspension.findUnique({
      where: { userTimetableId_date: { userTimetableId: timetable.id, date: day.startOfDay } },
    }),
  ]);

  return {
    date: day.isoDate,
    occurrences: occurrences.map(occurrenceDto),
    courseSuspensions: courseSuspensions.map(suspensionDto),
    timetableSuspension: timetableSuspension ? timetableSuspensionDto(timetableSuspension) : null,
    personalEvents: personalEvents,
  };
}
