import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CourseCreateInput, CourseSuspensionCreateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { courseDto } from "../lib/dto";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { createCourseSuspension, deleteCourseSuspension, listCourseSuspensions } from "../services/courseSuspension.service";

const CourseParam = z.object({ courseId: z.string() });
const CourseSuspensionParam = z.object({ courseId: z.string(), id: z.string() });

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

  app.get("/api/courses/:courseId/suspensions", sessionMiddleware, setupGuard, zValidator("param", CourseParam), async (c) => {
    const user = c.get("user");
    const { courseId } = c.req.valid("param");
    const suspensions = await listCourseSuspensions({ courseId, userId: user.id });
    return c.json({ suspensions });
  });

  app.post(
    "/api/courses/:courseId/suspensions",
    sessionMiddleware,
    setupGuard,
    zValidator("param", CourseParam),
    zValidator("json", CourseSuspensionCreateInput),
    async (c) => {
      const user = c.get("user");
      const { courseId } = c.req.valid("param");
      const input = c.req.valid("json");
      const suspension = await createCourseSuspension({ courseId, userId: user.id, input });
      return c.json({ suspension }, 201);
    },
  );

  app.delete("/api/courses/:courseId/suspensions/:id", sessionMiddleware, setupGuard, zValidator("param", CourseSuspensionParam), async (c) => {
    const user = c.get("user");
    const { courseId, id } = c.req.valid("param");
    await deleteCourseSuspension({ courseId, suspensionId: id, userId: user.id });
    return c.json({ ok: true });
  });
}
