import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import type { Meeting } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { APP_TZ } from "../lib/tz";

dayjs.extend(utc);
dayjs.extend(timezone);

type OccurrenceClient = typeof prisma | Prisma.TransactionClient;

export async function generateOccurrencesForMeetings(
  client: OccurrenceClient,
  args: {
    userTimetableId: string;
    meetings: Meeting[];
    fromDate?: Date;
    toDate?: Date;
  },
): Promise<{ created: number; skipped: number }> {
  const timetable = await client.userTimetable.findUnique({
    where: { id: args.userTimetableId },
    include: { semester: true, daySlots: true },
  });
  if (!timetable) {
    throw new AppError(404, "NOT_FOUND", "UserTimetable not found");
  }

  const slotMap = new Map(timetable.daySlots.map((slot) => [slot.periodIndex, slot]));
  const displacements = await client.classTransferDisplacement.findMany({
    where: { meeting: { userTimetableId: args.userTimetableId } },
    select: { meetingId: true, date: true },
  });
  const displacedKeys = new Set(
    displacements.map((d) => `${d.meetingId}|${dayjs(d.date).tz(APP_TZ).format("YYYY-MM-DD")}`),
  );
  const start = dayjs(args.fromDate ?? timetable.semester.startDate).tz(APP_TZ).startOf("day");
  const end = dayjs(args.toDate ?? timetable.semester.endDate).tz(APP_TZ).startOf("day");
  let created = 0;
  let skipped = 0;

  for (const meeting of args.meetings) {
    for (let offset = 0; offset < meeting.periodCount; offset += 1) {
      const slot = slotMap.get(meeting.startPeriodIndex + offset);
      if (!slot) {
        throw new AppError(400, "VALIDATION_ERROR", "Day slot not found", { reason: "DAY_SLOT_NOT_FOUND" });
      }
    }

    for (let cursor = start; cursor.isBefore(end) || cursor.isSame(end); cursor = cursor.add(1, "day")) {
      if (cursor.day() !== meeting.dayOfWeek) continue;
      const cursorKey = `${meeting.id}|${cursor.format("YYYY-MM-DD")}`;
      if (displacedKeys.has(cursorKey)) continue;
      for (let offset = 0; offset < meeting.periodCount; offset += 1) {
        const slot = slotMap.get(meeting.startPeriodIndex + offset);
        if (!slot) {
          throw new AppError(400, "VALIDATION_ERROR", "Day slot not found", { reason: "DAY_SLOT_NOT_FOUND" });
        }
        try {
          await client.meetingOccurrence.create({
            data: {
              meetingId: meeting.id,
              courseId: meeting.courseId,
              date: cursor.startOf("day").toDate(),
              periodOffset: offset,
              startMinute: slot.startMinute,
              endMinute: slot.endMinute,
            },
          });
          created += 1;
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
            throw error;
          }
          skipped += 1;
        }
      }
    }
  }

  return { created, skipped };
}

export async function generateOccurrencesForUserTimetable(args: {
  userTimetableId: string;
  fromDate?: Date;
  toDate?: Date;
}): Promise<{ created: number; skipped: number }> {
  const timetable = await prisma.userTimetable.findUnique({
    where: { id: args.userTimetableId },
    include: { meetings: true },
  });
  if (!timetable) {
    throw new AppError(404, "NOT_FOUND", "UserTimetable not found");
  }

  return generateOccurrencesForMeetings(prisma, { ...args, meetings: timetable.meetings });
}

export async function generateOccurrencesForMeeting(tx: Prisma.TransactionClient, meeting: Meeting) {
  return generateOccurrencesForMeetings(tx, {
    userTimetableId: meeting.userTimetableId,
    meetings: [meeting],
  });
}

export async function reconcileOccurrencesForSemesterDateChange(args: {
  semesterId: string;
  userId: string;
  newStart: Date;
  newEnd: Date;
}): Promise<{ created: number; deletedEmpty: number; preservedWithRecord: number }> {
  return prisma.$transaction(async (tx) => {
    const timetable = await tx.userTimetable.findUnique({
      where: { userId_semesterId: { userId: args.userId, semesterId: args.semesterId } },
      include: { meetings: true },
    });
    if (!timetable) return { created: 0, deletedEmpty: 0, preservedWithRecord: 0 };

    const { created } = await generateOccurrencesForMeetings(tx, {
      userTimetableId: timetable.id,
      meetings: timetable.meetings,
      fromDate: args.newStart,
      toDate: args.newEnd,
    });

    const outOfRange = await tx.meetingOccurrence.findMany({
      where: {
        meeting: { userTimetableId: timetable.id },
        transferId: null,
        OR: [{ date: { lt: args.newStart } }, { date: { gt: args.newEnd } }],
      },
      select: { id: true, attendanceRecord: { select: { id: true } } },
    });
    const deletableIds = outOfRange.filter((occurrence) => occurrence.attendanceRecord == null).map((occurrence) => occurrence.id);
    const preservedWithRecord = outOfRange.length - deletableIds.length;
    let deletedEmpty = 0;
    if (deletableIds.length > 0) {
      const result = await tx.meetingOccurrence.deleteMany({ where: { id: { in: deletableIds } } });
      deletedEmpty = result.count;
    }

    return { created, deletedEmpty, preservedWithRecord };
  });
}

// 振替 occurrence の periodOffset = TRANSFER_PERIOD_OFFSET_BASE + periodIndex。
// 通常行の offset (0..11) と衝突しない領域分離
export const TRANSFER_PERIOD_OFFSET_BASE = 1000;
