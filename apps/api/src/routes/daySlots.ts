import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { DaySlotBulkReplaceInput, DaySlotUpdateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { daySlotDto } from "../lib/dto";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";

const IdParam = z.object({ id: z.string() });

async function getOwnedDaySlot(id: string, userId: string) {
  const daySlot = await prisma.daySlot.findUnique({
    where: { id },
    include: { userTimetable: true },
  });
  if (!daySlot) throw new AppError(404, "NOT_FOUND", "DaySlot not found");
  if (daySlot.userTimetable.userId !== userId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  return daySlot;
}

async function getOwnedTimetable(id: string, userId: string) {
  const timetable = await prisma.userTimetable.findUnique({
    where: { id },
    include: { meetings: true },
  });
  if (!timetable) throw new AppError(404, "NOT_FOUND", "UserTimetable not found");
  if (timetable.userId !== userId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  return timetable;
}

export function registerDaySlotRoutes(app: Hono) {
  app.patch("/api/day-slots/:id", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", DaySlotUpdateInput), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    await getOwnedDaySlot(id, user.id);
    const daySlot = await prisma.daySlot.update({
      where: { id },
      data: {
        label: input.label,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        isBreak: input.isBreak,
      },
    });
    return c.json({ daySlot: daySlotDto(daySlot) });
  });

  app.post("/api/user-timetables/:id/day-slots/bulk-replace", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", DaySlotBulkReplaceInput), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const timetable = await getOwnedTimetable(id, user.id);
    const daySlotCount = input.daySlots.length;
    const offendingMeetings = timetable.meetings
      .filter((meeting) => meeting.startPeriodIndex + meeting.periodCount - 1 > daySlotCount)
      .map((meeting) => ({
        id: meeting.id,
        dayOfWeek: meeting.dayOfWeek,
        startPeriodIndex: meeting.startPeriodIndex,
        periodCount: meeting.periodCount,
      }));
    if (offendingMeetings.length > 0) {
      throw new AppError(409, "CONFLICT", "Meeting is out of day slot range", {
        reason: "PERIOD_OUT_OF_RANGE",
        offendingMeetings,
      });
    }

    const daySlots = await prisma.$transaction(async (tx) => {
      await tx.daySlot.deleteMany({ where: { userTimetableId: id } });
      await tx.daySlot.createMany({
        data: input.daySlots.map((slot) => ({
          userTimetableId: id,
          periodIndex: slot.periodIndex,
          label: slot.label,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          isBreak: slot.isBreak,
        })),
      });
      return tx.daySlot.findMany({ where: { userTimetableId: id }, orderBy: { periodIndex: "asc" } });
    });
    return c.json({ daySlots: daySlots.map(daySlotDto) });
  });
}
