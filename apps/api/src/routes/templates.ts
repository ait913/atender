import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { TemplateCopyInput, TemplateCreateInput, TemplateSearchQuery } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { templateDto, userTimetableDto } from "../lib/dto";
import { sessionMiddleware } from "../middleware/session";
import { copyTemplateToUser } from "../services/templateCopy";
import { generateOccurrencesForUserTimetable } from "../services/occurrenceGen";

const IdParam = z.object({ id: z.string() });
const TemplatePatchInput = TemplateCreateInput.partial();

const templateInclude = {
  daySlots: { orderBy: { periodIndex: "asc" as const } },
  courses: { orderBy: { id: "asc" as const } },
  meetings: { orderBy: [{ dayOfWeek: "asc" as const }, { startPeriodIndex: "asc" as const }] },
};

export function registerTemplateRoutes(app: Hono) {
  app.get("/api/timetable-templates", sessionMiddleware, zValidator("query", TemplateSearchQuery), async (c) => {
    const query = c.req.valid("query");
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await prisma.timetableTemplate.findMany({
      where: {
        isPublic: true,
        ...(query.schoolId ? { schoolId: query.schoolId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.q ? { title: { contains: query.q } } : {}),
        ...(cursor ? {
          OR: [
            { updatedAt: { lt: new Date(cursor.updatedAt) } },
            { updatedAt: new Date(cursor.updatedAt), id: { lt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: templateInclude,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return c.json({
      templates: page.map(templateDto),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) : null,
    });
  });

  app.get("/api/timetable-templates/:id", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    const template = await prisma.timetableTemplate.findFirst({
      where: { id: c.req.valid("param").id, isPublic: true },
      include: templateInclude,
    });
    if (!template) throw new AppError(404, "NOT_FOUND", "Template not found");
    return c.json({ template: templateDto(template) });
  });

  app.post("/api/timetable-templates", sessionMiddleware, zValidator("json", TemplateCreateInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [school, department] = await Promise.all([
      prisma.school.findUnique({ where: { id: input.schoolId } }),
      prisma.department.findUnique({ where: { id: input.departmentId } }),
    ]);
    if (!school || !department || department.schoolId !== input.schoolId) {
      throw new AppError(404, "NOT_FOUND", "School or department not found");
    }
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.timetableTemplate.create({
        data: {
          authorUserId: user.id,
          schoolId: input.schoolId,
          departmentId: input.departmentId,
          title: input.title,
          description: input.description ?? null,
          year: input.year ?? null,
          term: input.term ?? null,
          isPublic: input.isPublic,
        },
      });
      await tx.templateDaySlot.createMany({ data: input.daySlots.map((slot) => ({ ...slot, templateId: created.id })) });
      const courseMap = new Map<string, string>();
      for (const course of input.courses) {
        const createdCourse = await tx.templateCourse.create({
          data: {
            templateId: created.id,
            name: course.name,
            teacher: course.teacher ?? null,
            color: course.color ?? null,
            totalSessions: course.totalSessions,
            note: course.note ?? null,
          },
        });
        courseMap.set(course.tempId, createdCourse.id);
      }
      for (const meeting of input.meetings) {
        const courseId = courseMap.get(meeting.courseTempId);
        if (!courseId) throw new AppError(400, "VALIDATION_ERROR", "Meeting references missing course");
        await tx.templateMeeting.create({ data: { templateId: created.id, courseId, dayOfWeek: meeting.dayOfWeek, startPeriodIndex: meeting.startPeriodIndex, periodCount: meeting.periodCount, room: meeting.room ?? null } });
      }
      return tx.timetableTemplate.findUniqueOrThrow({ where: { id: created.id }, include: templateInclude });
    });
    return c.json({ template: templateDto(template) }, 201);
  });

  app.post("/api/timetable-templates/:id/copy", sessionMiddleware, zValidator("param", IdParam), zValidator("json", TemplateCopyInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const semester = await prisma.semester.findUnique({ where: { id: input.semesterId } });
    if (!semester) throw new AppError(404, "NOT_FOUND", "Semester not found");
    if (semester.userId !== user.id) throw new AppError(403, "FORBIDDEN", "Forbidden");
    const copied = await copyTemplateToUser({ templateId: c.req.valid("param").id, userId: user.id, semesterId: input.semesterId, title: input.title });
    await generateOccurrencesForUserTimetable({ userTimetableId: copied.id });
    const full = await prisma.userTimetable.findUniqueOrThrow({ where: { id: copied.id }, include: { daySlots: true, courses: true, meetings: true } });
    return c.json({ userTimetable: userTimetableDto(full) }, 201);
  });

  app.patch("/api/timetable-templates/:id", sessionMiddleware, zValidator("param", IdParam), zValidator("json", TemplatePatchInput), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const existing = await prisma.timetableTemplate.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "NOT_FOUND", "Template not found");
    if (existing.authorUserId !== user.id) throw new AppError(403, "FORBIDDEN", "Forbidden");
    const template = await prisma.$transaction(async (tx) => {
      await tx.timetableTemplate.update({
        where: { id },
        data: {
          ...(input.schoolId ? { schoolId: input.schoolId } : {}),
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(input.title ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.year !== undefined ? { year: input.year ?? null } : {}),
          ...(input.term !== undefined ? { term: input.term ?? null } : {}),
          ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
        },
      });
      if (input.daySlots) {
        await tx.templateDaySlot.deleteMany({ where: { templateId: id } });
        await tx.templateDaySlot.createMany({ data: input.daySlots.map((slot) => ({ ...slot, templateId: id })) });
      }
      if (input.courses || input.meetings) {
        await tx.templateMeeting.deleteMany({ where: { templateId: id } });
        await tx.templateCourse.deleteMany({ where: { templateId: id } });
        const courseMap = new Map<string, string>();
        for (const course of input.courses ?? []) {
          const created = await tx.templateCourse.create({ data: { templateId: id, name: course.name, teacher: course.teacher ?? null, color: course.color ?? null, totalSessions: course.totalSessions, note: course.note ?? null } });
          courseMap.set(course.tempId, created.id);
        }
        for (const meeting of input.meetings ?? []) {
          const courseId = courseMap.get(meeting.courseTempId);
          if (!courseId) throw new AppError(400, "VALIDATION_ERROR", "Meeting references missing course");
          await tx.templateMeeting.create({ data: { templateId: id, courseId, dayOfWeek: meeting.dayOfWeek, startPeriodIndex: meeting.startPeriodIndex, periodCount: meeting.periodCount, room: meeting.room ?? null } });
        }
      }
      return tx.timetableTemplate.findUniqueOrThrow({ where: { id }, include: templateInclude });
    });
    return c.json({ template: templateDto(template) });
  });

  app.delete("/api/timetable-templates/:id", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const template = await prisma.timetableTemplate.findUnique({ where: { id } });
    if (!template) throw new AppError(404, "NOT_FOUND", "Template not found");
    if (template.authorUserId !== user.id) throw new AppError(403, "FORBIDDEN", "Forbidden");
    await prisma.timetableTemplate.delete({ where: { id } });
    return c.json({ ok: true });
  });
}
