import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CourseCreateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { courseDto } from "../lib/dto";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";

export function registerCourseRoutes(app: Hono) {
  app.post("/api/courses", sessionMiddleware, setupGuard, zValidator("json", CourseCreateInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const timetable = await prisma.userTimetable.findFirst({ where: { id: input.userTimetableId, userId: user.id } });
    if (!timetable) throw new AppError(404, "NOT_FOUND", "UserTimetable not found");

    const course = await prisma.course.create({
      data: {
        userTimetableId: input.userTimetableId,
        name: input.name,
        teacher: input.teacher ?? null,
        room: input.room ?? null,
        color: input.color ?? null,
        totalSessions: input.totalSessions,
        note: input.note ?? null,
      },
    });
    return c.json({ course: courseDto(course) }, 201);
  });
}
