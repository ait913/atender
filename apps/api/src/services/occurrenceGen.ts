import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { APP_TZ } from "../lib/tz";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function generateOccurrencesForUserTimetable(args: {
  userTimetableId: string;
  fromDate?: Date;
  toDate?: Date;
}): Promise<{ created: number; skipped: number }> {
  const timetable = await prisma.userTimetable.findUnique({
    where: { id: args.userTimetableId },
    include: { semester: true, daySlots: true, meetings: true },
  });
  if (!timetable) {
    throw new AppError(404, "NOT_FOUND", "UserTimetable not found");
  }

  const slotMap = new Map(timetable.daySlots.map((slot) => [slot.periodIndex, slot]));
  const start = dayjs(args.fromDate ?? timetable.semester.startDate).tz(APP_TZ).startOf("day");
  const end = dayjs(args.toDate ?? timetable.semester.endDate).tz(APP_TZ).startOf("day");
  let created = 0;
  let skipped = 0;

  for (const meeting of timetable.meetings) {
    for (let offset = 0; offset < meeting.periodCount; offset += 1) {
      const slot = slotMap.get(meeting.startPeriodIndex + offset);
      if (!slot) {
        throw new AppError(400, "VALIDATION_ERROR", "Day slot not found", { reason: "DAY_SLOT_NOT_FOUND" });
      }
    }

    for (let cursor = start; cursor.isBefore(end) || cursor.isSame(end); cursor = cursor.add(1, "day")) {
      if (cursor.day() !== meeting.dayOfWeek) continue;
      for (let offset = 0; offset < meeting.periodCount; offset += 1) {
        const slot = slotMap.get(meeting.startPeriodIndex + offset);
        if (!slot) {
          throw new AppError(400, "VALIDATION_ERROR", "Day slot not found", { reason: "DAY_SLOT_NOT_FOUND" });
        }
        try {
          await prisma.meetingOccurrence.create({
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
