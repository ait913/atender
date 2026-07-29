import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validator";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { computeCourseStats } from "../services/attendanceStats";

const StatsQuery = z.object({ semesterId: z.string() });

export function registerStatsRoutes(app: Hono) {
  app.get("/api/stats", sessionMiddleware, setupGuard, zValidator("query", StatsQuery), async (c) => {
    const user = c.get("user");
    const { semesterId } = c.req.valid("query");
    const semester = await prisma.semester.findUnique({ where: { id: semesterId } });
    if (!semester) throw new AppError(404, "NOT_FOUND", "Semester not found");
    if (semester.userId !== user.id) throw new AppError(403, "FORBIDDEN", "Forbidden");
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { requiredAttendanceRate: true },
    });
    const courses = await computeCourseStats({ semesterId, userId: user.id, requiredAttendanceRate: currentUser.requiredAttendanceRate });
    return c.json({ semesterId, requiredAttendanceRate: currentUser.requiredAttendanceRate, courses });
  });
}
