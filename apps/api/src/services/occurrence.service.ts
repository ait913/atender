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
  transferId: string | null;
  periodIndex: number | null;
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
    periodIndex: occurrence.periodIndex ?? occurrence.meeting.startPeriodIndex + occurrence.periodOffset,
    periodOffset: occurrence.periodOffset,
    startMinute: occurrence.startMinute,
    endMinute: occurrence.endMinute,
    status: occurrence.attendanceRecord?.status ?? null,
    transferId: occurrence.transferId,
  };
}

export async function listOccurrenceRange(args: {
  userId: string;
  semesterId?: string;
  from: string;
  to: string;
}): Promise<OccurrenceRangeDto> {
  const fromDay = dateStringToJstDay(args.from);
  const toDay = dateStringToJstDay(args.to);
  const timetable = await findActiveUserTimetable(args.userId, args.semesterId);
  if (!timetable) {
    return {
      from: fromDay.isoDate,
      to: toDay.isoDate,
      hasActiveTimetable: false,
      occurrences: [],
      courseSuspensions: [],
      timetableSuspensions: [],
      transfers: [],
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

  const transfers = await prisma.classTransfer.findMany({
    where: {
      userTimetableId: timetable.id,
      date: { gte: fromDay.startOfDay, lte: toDay.endOfDay },
    },
    include: {
      occurrences: { select: { id: true } },
      displacements: {
        include: { meeting: { include: { course: true } } },
      },
    },
    orderBy: { date: "asc" },
  });

  return {
    from: fromDay.isoDate,
    to: toDay.isoDate,
    hasActiveTimetable: true,
    occurrences: occurrences.map(occurrenceDto),
    courseSuspensions: courseSuspensions.map(suspensionDto),
    timetableSuspensions: timetableSuspensions.map(timetableSuspensionDto),
    transfers: transfers.map(classTransferDto),
  };
}

export function classTransferDto(transfer: {
  id: string;
  userTimetableId: string;
  date: Date;
  kind: "MOVE_DAY" | "SINGLE";
  sourceDayOfWeek: number | null;
  sourceDate: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  occurrences: { id: string }[];
  displacements: Array<{
    meetingId: string;
    meeting: { courseId: string; startPeriodIndex: number; periodCount: number; course: { name: string } };
  }>;
}) {
  return {
    id: transfer.id,
    userTimetableId: transfer.userTimetableId,
    date: toIsoDate(transfer.date),
    kind: transfer.kind,
    sourceDayOfWeek: transfer.sourceDayOfWeek,
    sourceDate: transfer.sourceDate ? toIsoDate(transfer.sourceDate) : null,
    note: transfer.note,
    occurrenceIds: transfer.occurrences.map((o) => o.id),
    displaced: transfer.displacements.map((d) => ({
      meetingId: d.meetingId,
      courseId: d.meeting.courseId,
      courseName: d.meeting.course.name,
      startPeriodIndex: d.meeting.startPeriodIndex,
      periodCount: d.meeting.periodCount,
    })),
    createdAt: transfer.createdAt.toISOString(),
    updatedAt: transfer.updatedAt.toISOString(),
  };
}
