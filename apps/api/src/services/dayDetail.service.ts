import { prisma } from "../db";
import { dateStringToJstDay } from "../lib/tz";
import { findActiveUserTimetable } from "./activeTimetable";
import { suspensionDto } from "./courseSuspension.service";
import { classTransferDto, occurrenceDto } from "./occurrence.service";
import { timetableSuspensionDto } from "./timetableSuspension.service";

export async function getDayDetail(args: { userId: string; date: string }) {
  const day = dateStringToJstDay(args.date);
  const timetable = await findActiveUserTimetable(args.userId);
  if (!timetable) {
    return {
      date: day.isoDate,
      occurrences: [],
      courseSuspensions: [],
      timetableSuspension: null,
      transfers: [],
    };
  }

  const [occurrences, courseSuspensions, timetableSuspension, transfers] = await Promise.all([
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
    prisma.classTransfer.findMany({
      where: { userTimetableId: timetable.id, date: { gte: day.startOfDay, lte: day.endOfDay } },
      include: {
        occurrences: { select: { id: true } },
        displacements: { include: { meeting: { include: { course: true } } } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  return {
    date: day.isoDate,
    occurrences: occurrences.map(occurrenceDto),
    courseSuspensions: courseSuspensions.map(suspensionDto),
    timetableSuspension: timetableSuspension ? timetableSuspensionDto(timetableSuspension) : null,
    transfers: transfers.map(classTransferDto),
  };
}
