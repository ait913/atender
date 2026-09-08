import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import type { ClassTransferCreateInput, ClassTransferDeleteResponse, ClassTransferDto } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { APP_TZ, dateStringToJstDay } from "../lib/tz";
import { findActiveUserTimetable } from "./activeTimetable";
import { classTransferDto } from "./occurrence.service";
import { generateOccurrencesForMeetings, TRANSFER_PERIOD_OFFSET_BASE } from "./occurrenceGen";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function createClassTransfer(userId: string, input: ClassTransferCreateInput): Promise<ClassTransferDto> {
  const timetable = await findActiveUserTimetable(userId, input.semesterId);
  if (!timetable) throw new AppError(403, "SETUP_REQUIRED", "User must complete setup");

  const dateDay = dateStringToJstDay(input.date);
  if (dateDay.startOfDay < timetable.semester.startDate || dateDay.startOfDay > timetable.semester.endDate) {
    throw new AppError(400, "OUT_OF_SEMESTER", "Date is outside the semester");
  }

  return prisma.$transaction(async (tx) => {
    // 振替先の休講チェック (409 or 解除)
    const targetSuspension = await tx.timetableSuspension.findUnique({
      where: { userTimetableId_date: { userTimetableId: timetable.id, date: dateDay.startOfDay } },
    });
    if (targetSuspension) {
      if (input.liftTargetSuspension) {
        await tx.timetableSuspension.delete({ where: { id: targetSuspension.id } });
      } else {
        throw new AppError(409, "DAY_SUSPENDED", "Target date is suspended");
      }
    }

    const meetings = await tx.meeting.findMany({ where: { userTimetableId: timetable.id } });
    const placed = new Map<number, { meeting: (typeof meetings)[number] }>();

    if (input.kind === "MOVE_DAY") {
      const targetDow = dayjs(input.date).tz(APP_TZ).day();
      if (input.sourceDayOfWeek === targetDow) {
        throw new AppError(400, "SAME_WEEKDAY", "Source day equals target day");
      }
      const sourceMeetings = meetings.filter((m) => m.dayOfWeek === input.sourceDayOfWeek);
      if (sourceMeetings.length === 0) {
        throw new AppError(400, "NO_MEETINGS_ON_SOURCE_DAY", "No meetings on source day");
      }
      for (const meeting of sourceMeetings) {
        for (let offset = 0; offset < meeting.periodCount; offset += 1) {
          placed.set(meeting.startPeriodIndex + offset, { meeting });
        }
      }
    } else {
      const course = await tx.course.findFirst({ where: { id: input.courseId, userTimetableId: timetable.id } });
      if (!course) throw new AppError(404, "NOT_FOUND", "Course not found");
      const courseMeetings = meetings
        .filter((m) => m.courseId === input.courseId)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startPeriodIndex - b.startPeriodIndex || a.id.localeCompare(b.id));
      if (courseMeetings.length === 0) {
        throw new AppError(400, "COURSE_HAS_NO_MEETING", "Course has no meeting");
      }
      const referenceMeeting = courseMeetings[0];
      for (const p of input.periodIndexes) {
        placed.set(p, { meeting: referenceMeeting });
      }
    }

    // suspendSourceDate=true には sourceDate が必須 (transfer 作成より前に判定する)
    if (input.kind === "MOVE_DAY" && input.suspendSourceDate && !input.sourceDate) {
      throw new AppError(400, "SOURCE_DATE_REQUIRED", "sourceDate is required");
    }

    const daySlots = await tx.daySlot.findMany({ where: { userTimetableId: timetable.id } });
    const slotMap = new Map(daySlots.map((slot) => [slot.periodIndex, slot]));
    for (const periodIndex of placed.keys()) {
      if (!slotMap.has(periodIndex)) {
        throw new AppError(400, "DAY_SLOT_NOT_FOUND", "Day slot not found");
      }
    }

    // 日範囲で照合する (attendanceStats.ts / dayDetail.service.ts 等、読み取り側と同じ規約)。
    // `dateDay.startOfDay` の完全一致だと、fixture が UTC 0時で seed する慣行 (attendance.test.ts 等) と
    // 食い違い、通常 occurrence を全く見つけられなくなる
    const existing = await tx.meetingOccurrence.findMany({
      where: { date: { gte: dateDay.startOfDay, lte: dateDay.endOfDay }, meeting: { userTimetableId: timetable.id } },
      include: { meeting: true, attendanceRecord: true },
    });

    for (const occurrence of existing) {
      if (occurrence.transferId != null && occurrence.periodIndex != null && placed.has(occurrence.periodIndex)) {
        throw new AppError(409, "PERIOD_CONFLICT", "Period already has a transfer", { conflictPeriod: occurrence.periodIndex });
      }
    }

    const displacedMeetingIds = new Set<string>();
    for (const occurrence of existing) {
      if (occurrence.transferId != null) continue;
      const periodIndex = occurrence.meeting.startPeriodIndex + occurrence.periodOffset;
      if (placed.has(periodIndex)) {
        displacedMeetingIds.add(occurrence.meetingId);
      }
    }

    // 既に押し出された Meeting も共有し、最後の振替が取り消されるまで復元しない。
    const existingDisplacements = await tx.classTransferDisplacement.findMany({
      where: { date: { gte: dateDay.startOfDay, lte: dateDay.endOfDay }, meeting: { userTimetableId: timetable.id } },
      include: { meeting: true },
    });
    for (const { meeting } of existingDisplacements) {
      for (let offset = 0; offset < meeting.periodCount; offset += 1) {
        if (placed.has(meeting.startPeriodIndex + offset)) {
          displacedMeetingIds.add(meeting.id);
          break;
        }
      }
    }

    if (displacedMeetingIds.size > 0) {
      const courseById = new Map(timetable.courses.map((course) => [course.id, course]));
      for (const occurrence of existing) {
        if (!displacedMeetingIds.has(occurrence.meetingId)) continue;
        if (occurrence.attendanceRecord != null) {
          const courseName = courseById.get(occurrence.meeting.courseId)?.name ?? "";
          throw new AppError(409, "DISPLACED_HAS_RECORD", "Displaced meeting has an attendance record", {
            meetingId: occurrence.meetingId,
            courseName,
          });
        }
      }
    }

    let transfer = await tx.classTransfer.create({
      data: {
        userTimetableId: timetable.id,
        date: dateDay.startOfDay,
        kind: input.kind,
        sourceDayOfWeek: input.kind === "MOVE_DAY" ? input.sourceDayOfWeek : null,
        note: input.note ?? null,
      },
    });

    for (const meetingId of displacedMeetingIds) {
      await tx.classTransferDisplacement.create({
        data: { transferId: transfer.id, meetingId, date: dateDay.startOfDay },
      });
      await tx.meetingOccurrence.deleteMany({
        where: { meetingId, date: { gte: dateDay.startOfDay, lte: dateDay.endOfDay }, transferId: null },
      });
    }

    for (const [periodIndex, { meeting }] of placed) {
      const slot = slotMap.get(periodIndex)!;
      await tx.meetingOccurrence.create({
        data: {
          meetingId: meeting.id,
          courseId: meeting.courseId,
          date: dateDay.startOfDay,
          periodOffset: TRANSFER_PERIOD_OFFSET_BASE + periodIndex,
          periodIndex,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          transferId: transfer.id,
        },
      });
    }

    if (input.kind === "MOVE_DAY" && input.suspendSourceDate && input.sourceDate) {
      const sourceDateDay = dateStringToJstDay(input.sourceDate);
      await tx.timetableSuspension.upsert({
        where: { userTimetableId_date: { userTimetableId: timetable.id, date: sourceDateDay.startOfDay } },
        create: {
          userTimetableId: timetable.id,
          date: sourceDateDay.startOfDay,
          reason: `${dayjs(input.date).tz(APP_TZ).format("M/D")} に授業変更`,
        },
        update: {},
      });
      transfer = await tx.classTransfer.update({
        where: { id: transfer.id },
        data: { sourceDate: sourceDateDay.startOfDay },
      });
    }

    const full = await tx.classTransfer.findUniqueOrThrow({
      where: { id: transfer.id },
      include: {
        occurrences: { select: { id: true } },
        displacements: { include: { meeting: { include: { course: true } } } },
      },
    });
    return classTransferDto(full);
  });
}

export async function deleteClassTransfer(userId: string, id: string): Promise<ClassTransferDeleteResponse> {
  const transfer = await prisma.classTransfer.findFirst({
    where: { id, userTimetable: { userId } },
    include: { occurrences: { include: { attendanceRecord: true } }, displacements: true },
  });
  if (!transfer) throw new AppError(404, "NOT_FOUND", "Transfer not found");

  const removedOccurrences = transfer.occurrences.length;
  const removedAttendanceRecords = transfer.occurrences.filter((o) => o.attendanceRecord != null).length;
  const displacedMeetingIds = transfer.displacements.map((d) => d.meetingId);
  const date = transfer.date;
  const userTimetableId = transfer.userTimetableId;

  const result = await prisma.$transaction(async (tx) => {
    await tx.classTransfer.delete({ where: { id } }); // cascade: occurrences → AttendanceRecord, displacements
    let restoredOccurrences = 0;
    if (displacedMeetingIds.length > 0) {
      const meetings = await tx.meeting.findMany({ where: { id: { in: displacedMeetingIds } } });
      const generated = await generateOccurrencesForMeetings(tx, {
        userTimetableId,
        meetings,
        fromDate: date,
        toDate: date,
      });
      restoredOccurrences = generated.created;
    }
    return { removedOccurrences, removedAttendanceRecords, restoredOccurrences };
  });

  // 元の日の TimetableSuspension は消さない (仕様どおり何もしない)
  return result;
}
