import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validator";
import { prisma } from "../db";
import { dateStringToJstDay, toIsoDate, today } from "../lib/tz";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { findActiveUserTimetable } from "../services/activeTimetable";

const TodayQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export function registerTodayRoutes(app: Hono) {
  app.get("/api/today", sessionMiddleware, setupGuard, zValidator("query", TodayQuery), async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");
    const day = query.date ? dateStringToJstDay(query.date) : today();
    const timetable = await findActiveUserTimetable(user.id);
    if (!timetable) return c.json({ date: day.isoDate, occurrences: [] });
    const occurrences = await prisma.meetingOccurrence.findMany({
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
    });
    return c.json({
      date: day.isoDate,
      occurrences: occurrences.map((occurrence) => ({
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
      })),
    });
  });
}
