import type {
  BulkClearAttendanceInput,
  BulkClearAttendanceResponse,
  BulkMarkAttendanceInput,
  BulkMarkAttendanceResponse,
} from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { dateStringToJstDay, toIsoDate } from "../lib/tz";
import { findActiveUserTimetable } from "./activeTimetable";

function normalizeDates(dates: string[]) {
  const byIso = new Map<string, Date>();
  for (const date of dates) {
    const day = dateStringToJstDay(date);
    byIso.set(day.isoDate, day.startOfDay);
  }
  return [...byIso.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, date]) => ({ iso, date }));
}

export async function bulkMarkAttendance(args: {
  userId: string;
  input: BulkMarkAttendanceInput;
}): Promise<BulkMarkAttendanceResponse> {
  const timetable = await findActiveUserTimetable(args.userId);
  if (!timetable) throw new AppError(403, "SETUP_REQUIRED", "User must complete setup");

  const normalizedDates = normalizeDates(args.input.dates);
  const dateValues = normalizedDates.map((item) => item.date);
  const dateIsoSet = new Set(normalizedDates.map((item) => item.iso));

  return prisma.$transaction(async (tx) => {
    const [occurrences, timetableSuspensions, courseSuspensions] = await Promise.all([
      tx.meetingOccurrence.findMany({
        where: { date: { in: dateValues }, meeting: { userTimetableId: timetable.id } },
        include: { attendanceRecord: true },
      }),
      tx.timetableSuspension.findMany({
        where: { userTimetableId: timetable.id, date: { in: dateValues } },
      }),
      tx.courseSuspension.findMany({
        where: { date: { in: dateValues }, course: { userTimetableId: timetable.id } },
      }),
    ]);

    const occurrenceDates = new Set<string>();
    const timetableSuspendedDates = new Set(timetableSuspensions.map((suspension) => toIsoDate(suspension.date)));
    const courseSuspendedKeys = new Set(courseSuspensions.map((suspension) => `${suspension.courseId}:${toIsoDate(suspension.date)}`));

    let upsertedCount = 0;
    let skippedExistingCount = 0;
    let skippedSuspendedCount = 0;

    for (const occurrence of occurrences) {
      const iso = toIsoDate(occurrence.date);
      occurrenceDates.add(iso);
      if (timetableSuspendedDates.has(iso) || courseSuspendedKeys.has(`${occurrence.courseId}:${iso}`)) {
        skippedSuspendedCount += 1;
        continue;
      }
      if (args.input.mode === "FILL" && occurrence.attendanceRecord) {
        skippedExistingCount += 1;
        continue;
      }
      await tx.attendanceRecord.upsert({
        where: { occurrenceId: occurrence.id },
        create: { occurrenceId: occurrence.id, userId: args.userId, status: args.input.status },
        update: { status: args.input.status },
      });
      upsertedCount += 1;
    }

    return {
      upsertedCount,
      skippedExistingCount,
      skippedSuspendedCount,
      noOccurrenceDates: [...dateIsoSet].filter((date) => !occurrenceDates.has(date)).sort(),
    };
  });
}

export async function bulkClearAttendance(args: {
  userId: string;
  input: BulkClearAttendanceInput;
}): Promise<BulkClearAttendanceResponse> {
  const timetable = await findActiveUserTimetable(args.userId);
  if (!timetable) throw new AppError(403, "SETUP_REQUIRED", "User must complete setup");

  const normalizedDates = normalizeDates(args.input.dates);
  const result = await prisma.attendanceRecord.deleteMany({
    where: {
      userId: args.userId,
      occurrence: {
        date: { in: normalizedDates.map((item) => item.date) },
        meeting: { userTimetableId: timetable.id },
      },
    },
  });
  return { deletedCount: result.count };
}
