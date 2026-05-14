import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CourseCreateInput, CourseUpdateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { courseDto } from "../lib/dto";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";

const IdParam = z.object({ id: z.string() });
const DeleteCourseQuery = z.object({ cascade: z.enum(["true"]).optional() });

async function getOwnedTimetable(id: string, userId: string) {
  const timetable = await prisma.userTimetable.findUnique({ where: { id } });
  if (!timetable) throw new AppError(404, "NOT_FOUND", "UserTimetable not found");
  if (timetable.userId !== userId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  return timetable;
}

async function getOwnedCourse(id: string, userId: string) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: { userTimetable: true },
  });
  if (!course) throw new AppError(404, "NOT_FOUND", "Course not found");
  if (course.userTimetable.userId !== userId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  return course;
}

export function registerCourseRoutes(app: Hono) {
  app.post("/api/courses", sessionMiddleware, setupGuard, zValidator("json", CourseCreateInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    await getOwnedTimetable(input.userTimetableId, user.id);
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

  app.patch("/api/courses/:id", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", CourseUpdateInput), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    await getOwnedCourse(id, user.id);
    const course = await prisma.course.update({
      where: { id },
      data: {
        name: input.name,
        teacher: input.teacher,
        room: input.room,
        color: input.color,
        totalSessions: input.totalSessions,
        note: input.note,
      },
    });
    return c.json({ course: courseDto(course) });
  });

  app.delete("/api/courses/:id", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("query", DeleteCourseQuery), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const { cascade } = c.req.valid("query");
    await getOwnedCourse(id, user.id);
    const meetingCount = await prisma.meeting.count({ where: { courseId: id } });
    if (meetingCount > 0 && cascade !== "true") {
      throw new AppError(409, "CONFLICT", "Course is used by meeting", { reason: "USED_BY_MEETING", meetingCount });
    }
    await prisma.course.delete({ where: { id } });
    return c.json({ ok: true });
  });
}
