import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { MarkAllPresentInput, MarkAttendanceInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { dateStringToJstDay, today } from "../lib/tz";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { findActiveUserTimetable } from "../services/activeTimetable";

const OccurrenceParam = z.object({ occurrenceId: z.string() });

async function findOwnedOccurrence(occurrenceId: string, userId: string) {
  const occurrence = await prisma.meetingOccurrence.findFirst({
    where: {
      id: occurrenceId,
      meeting: { userTimetable: { userId } },
    },
  });
  if (!occurrence) throw new AppError(404, "NOT_FOUND", "Occurrence not found");
  return occurrence;
}

export function registerAttendanceRoutes(app: Hono) {
  app.post("/api/attendance/mark-all-present", sessionMiddleware, setupGuard, zValidator("json", MarkAllPresentInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const day = input.date ? dateStringToJstDay(input.date) : today();
    const timetable = await findActiveUserTimetable(user.id);
    if (!timetable) throw new AppError(403, "SETUP_REQUIRED", "User must complete setup");
    const result = await prisma.$transaction(async (tx) => {
      const occurrences = await tx.meetingOccurrence.findMany({
        where: { date: day.startOfDay, meeting: { userTimetableId: timetable.id } },
        include: { attendanceRecord: true },
      });
      let markedCount = 0;
      let skippedCount = 0;
      for (const occurrence of occurrences) {
        if (occurrence.attendanceRecord) {
          skippedCount += 1;
          continue;
        }
        await tx.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: user.id, status: "PRESENT" } });
        markedCount += 1;
      }
      return { markedCount, skippedCount };
    });
    return c.json({ date: day.isoDate, markedCount: result.markedCount, skippedCount: result.skippedCount });
  });

  app.post("/api/attendance/:occurrenceId", sessionMiddleware, setupGuard, zValidator("param", OccurrenceParam), zValidator("json", MarkAttendanceInput), async (c) => {
    const user = c.get("user");
    const { occurrenceId } = c.req.valid("param");
    const input = c.req.valid("json");
    await findOwnedOccurrence(occurrenceId, user.id);
    const record = await prisma.attendanceRecord.upsert({
      where: { occurrenceId },
      create: { occurrenceId, userId: user.id, status: input.status, note: input.note ?? null },
      update: { status: input.status, note: input.note ?? null },
    });
    return c.json({ record: { occurrenceId: record.occurrenceId, status: record.status, note: record.note, updatedAt: record.updatedAt.toISOString() } });
  });

  app.delete("/api/attendance/:occurrenceId", sessionMiddleware, setupGuard, zValidator("param", OccurrenceParam), async (c) => {
    const user = c.get("user");
    const { occurrenceId } = c.req.valid("param");
    await findOwnedOccurrence(occurrenceId, user.id);
    await prisma.attendanceRecord.deleteMany({ where: { occurrenceId, userId: user.id } });
    return c.json({ ok: true });
  });
}
