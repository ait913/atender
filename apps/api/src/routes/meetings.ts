import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { MeetingCreateInput, MeetingUpdateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { meetingDto } from "../lib/dto";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { generateOccurrencesForUserTimetable } from "../services/occurrenceGen";
import { assertNoPeriodConflict } from "../services/periodConflict";

const IdParam = z.object({ id: z.string() });

async function getOwnedTimetable(id: string, userId: string) {
  const timetable = await prisma.userTimetable.findUnique({
    where: { id },
    include: { daySlots: true },
  });
  if (!timetable) throw new AppError(404, "NOT_FOUND", "UserTimetable not found");
  if (timetable.userId !== userId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  return timetable;
}

async function getOwnedMeeting(id: string, userId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: { userTimetable: { include: { daySlots: true } } },
  });
  if (!meeting) throw new AppError(404, "NOT_FOUND", "Meeting not found");
  if (meeting.userTimetable.userId !== userId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  return meeting;
}

async function assertCourseInTimetable(courseId: string, userTimetableId: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, userTimetableId } });
  if (!course) throw new AppError(404, "NOT_FOUND", "Course not found");
}

function assertMeetingInDaySlotRange(daySlotCount: number, startPeriodIndex: number, periodCount: number) {
  if (startPeriodIndex + periodCount - 1 > daySlotCount) {
    throw new AppError(400, "VALIDATION_ERROR", "Meeting is out of day slot range");
  }
}

export function registerMeetingRoutes(app: Hono) {
  app.post("/api/meetings", sessionMiddleware, setupGuard, zValidator("json", MeetingCreateInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const timetable = await getOwnedTimetable(input.userTimetableId, user.id);
    await assertCourseInTimetable(input.courseId, input.userTimetableId);
    assertMeetingInDaySlotRange(timetable.daySlots.length, input.startPeriodIndex, input.periodCount);
    await assertNoPeriodConflict({
      userTimetableId: input.userTimetableId,
      dayOfWeek: input.dayOfWeek,
      startPeriodIndex: input.startPeriodIndex,
      periodCount: input.periodCount,
    });
    const meeting = await prisma.meeting.create({
      data: {
        userTimetableId: input.userTimetableId,
        courseId: input.courseId,
        dayOfWeek: input.dayOfWeek,
        startPeriodIndex: input.startPeriodIndex,
        periodCount: input.periodCount,
      },
    });
    await generateOccurrencesForUserTimetable({ userTimetableId: input.userTimetableId });
    return c.json({ meeting: meetingDto(meeting) }, 201);
  });

  app.patch("/api/meetings/:id", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", MeetingUpdateInput), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const existing = await getOwnedMeeting(id, user.id);
    const userTimetableId = existing.userTimetableId;
    const nextCourseId = input.courseId ?? existing.courseId;
    const nextDayOfWeek = input.dayOfWeek ?? existing.dayOfWeek;
    const nextStartPeriodIndex = input.startPeriodIndex ?? existing.startPeriodIndex;
    const nextPeriodCount = input.periodCount ?? existing.periodCount;

    if (input.courseId != null) {
      await assertCourseInTimetable(input.courseId, userTimetableId);
    }
    assertMeetingInDaySlotRange(existing.userTimetable.daySlots.length, nextStartPeriodIndex, nextPeriodCount);
    if (input.dayOfWeek != null || input.startPeriodIndex != null || input.periodCount != null) {
      await assertNoPeriodConflict({
        userTimetableId,
        dayOfWeek: nextDayOfWeek,
        startPeriodIndex: nextStartPeriodIndex,
        periodCount: nextPeriodCount,
        excludeMeetingId: id,
      });
    }

    const hasChanges = input.courseId != null || input.dayOfWeek != null || input.startPeriodIndex != null || input.periodCount != null;
    const meeting = await prisma.$transaction(async (tx) => {
      const updated = await tx.meeting.update({
        where: { id },
        data: {
          courseId: nextCourseId,
          dayOfWeek: nextDayOfWeek,
          startPeriodIndex: nextStartPeriodIndex,
          periodCount: nextPeriodCount,
        },
      });
      if (hasChanges) {
        await tx.meetingOccurrence.deleteMany({ where: { meetingId: id } });
      }
      return updated;
    });
    if (hasChanges) {
      await generateOccurrencesForUserTimetable({ userTimetableId });
    }
    return c.json({ meeting: meetingDto(meeting) });
  });

  app.delete("/api/meetings/:id", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    await getOwnedMeeting(id, user.id);
    await prisma.meeting.delete({ where: { id } });
    return c.json({ ok: true });
  });
}
