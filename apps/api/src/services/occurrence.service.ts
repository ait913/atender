import type { OccurrenceDto, OccurrenceRangeDto } from "@atender/shared";
import { prisma } from "../db";
import { dateStringToJstDay, toIsoDate } from "../lib/tz";
import { findActiveUserTimetable } from "./activeTimetable";
import { suspensionDto } from "./courseSuspension.service";
import { timetableSuspensionDto } from "./timetableSuspension.service";

export function occurrenceDto(occurrence: {
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

export async function listOccurrenceRange(args: {
  userId: string;
  from: string;
  to: string;
}): Promise<OccurrenceRangeDto> {
  const fromDay = dateStringToJstDay(args.from);
  const toDay = dateStringToJstDay(args.to);
  const timetable = await findActiveUserTimetable(args.userId);
  if (!timetable) {
    return {
      from: fromDay.isoDate,
      to: toDay.isoDate,
      hasActiveTimetable: false,
      occurrences: [],
      courseSuspensions: [],
      timetableSuspensions: [],
    };
  }

  const [occurrences, courseSuspensions, timetableSuspensions] = await Promise.all([
    prisma.meetingOccurrence.findMany({
      where: {
        date: { gte: fromDay.startOfDay, lte: toDay.endOfDay },
        meeting: { userTimetableId: timetable.id },
      },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
      include: { meeting: true, course: true, attendanceRecord: true },
    }),
    prisma.courseSuspension.findMany({
      where: {
        date: { gte: fromDay.startOfDay, lte: toDay.endOfDay },
        course: { userTimetableId: timetable.id },
      },
      orderBy: { date: "asc" },
    }),
    prisma.timetableSuspension.findMany({
      where: {
        userTimetableId: timetable.id,
        date: { gte: fromDay.startOfDay, lte: toDay.endOfDay },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  return {
    from: fromDay.isoDate,
    to: toDay.isoDate,
    hasActiveTimetable: true,
    occurrences: occurrences.map(occurrenceDto),
    courseSuspensions: courseSuspensions.map(suspensionDto),
    timetableSuspensions: timetableSuspensions.map(timetableSuspensionDto),
  };
}
