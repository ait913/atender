import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { UserTimetableCreateInput, UserTimetablePatchInput } from "@atender/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { templateDto, userTimetableDto } from "../lib/dto";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { generateOccurrencesForUserTimetable } from "../services/occurrenceGen";

const IdParam = z.object({ id: z.string() });
const PublishInput = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  year: z.number().int().min(1).max(8).optional(),
  term: z.string().max(20).optional(),
});

async function getOwnedTimetable(id: string, userId: string) {
  const timetable = await prisma.userTimetable.findUnique({ where: { id }, include: { daySlots: true, courses: true, meetings: true } });
  if (!timetable) throw new AppError(404, "NOT_FOUND", "UserTimetable not found");
  if (timetable.userId !== userId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  return timetable;
}

async function createTimetableFromInput(userId: string, input: z.infer<typeof UserTimetableCreateInput>) {
  const semester = await prisma.semester.findUnique({ where: { id: input.semesterId } });
  if (!semester) throw new AppError(404, "NOT_FOUND", "Semester not found");
  if (semester.userId !== userId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  try {
    return await prisma.$transaction(async (tx) => {
      const timetable = await tx.userTimetable.create({ data: { userId, semesterId: input.semesterId, title: input.title } });
      await tx.daySlot.createMany({ data: input.daySlots.map((slot) => ({ ...slot, userTimetableId: timetable.id })) });
      const courseMap = new Map<string, string>();
      for (const course of input.courses) {
        const created = await tx.course.create({ data: { userTimetableId: timetable.id, name: course.name, teacher: course.teacher ?? null, color: course.color ?? null, totalSessions: course.totalSessions, note: course.note ?? null } });
        courseMap.set(course.tempId, created.id);
      }
      for (const meeting of input.meetings) {
        const courseId = courseMap.get(meeting.courseTempId);
        if (!courseId) throw new AppError(400, "VALIDATION_ERROR", "Meeting references missing course");
        await tx.meeting.create({ data: { userTimetableId: timetable.id, courseId, dayOfWeek: meeting.dayOfWeek, startPeriodIndex: meeting.startPeriodIndex, periodCount: meeting.periodCount, room: meeting.room ?? null } });
      }
      return tx.userTimetable.findUniqueOrThrow({ where: { id: timetable.id }, include: { daySlots: true, courses: true, meetings: true } });
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "CONFLICT", "UserTimetable already exists for semester");
    }
    throw error;
  }
}

export function registerUserTimetableRoutes(app: Hono) {
  app.get("/api/user-timetables", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const rows = await prisma.userTimetable.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { daySlots: true, courses: true, meetings: true } });
    return c.json({ userTimetables: rows.map(userTimetableDto) });
  });

  app.get("/api/user-timetables/:id", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    const timetable = await getOwnedTimetable(c.req.valid("param").id, c.get("user").id);
    return c.json({ userTimetable: userTimetableDto(timetable) });
  });

  app.post("/api/user-timetables", sessionMiddleware, zValidator("json", UserTimetableCreateInput), async (c) => {
    const user = c.get("user");
    const timetable = await createTimetableFromInput(user.id, c.req.valid("json"));
    await prisma.user.update({ where: { id: user.id }, data: { defaultSemesterId: timetable.semesterId } });
    await generateOccurrencesForUserTimetable({ userTimetableId: timetable.id });
    const full = await prisma.userTimetable.findUniqueOrThrow({ where: { id: timetable.id }, include: { daySlots: true, courses: true, meetings: true } });
    return c.json({ userTimetable: userTimetableDto(full) }, 201);
  });

  app.patch("/api/user-timetables/:id", sessionMiddleware, zValidator("param", IdParam), zValidator("json", UserTimetablePatchInput), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    await getOwnedTimetable(id, user.id);
    const timetable = await prisma.$transaction(async (tx) => {
      if (input.title) await tx.userTimetable.update({ where: { id }, data: { title: input.title } });
      if (input.daysOfWeek) {
        const csv = [...new Set(input.daysOfWeek)].sort((a, b) => a - b).join(",");
        await tx.userTimetable.update({ where: { id }, data: { daysOfWeek: csv } });
      }
      if (input.daySlots) {
        await tx.daySlot.deleteMany({ where: { userTimetableId: id } });
        await tx.daySlot.createMany({ data: input.daySlots.map((slot) => ({ ...slot, userTimetableId: id })) });
      }
      if (input.courses || input.meetings) {
        await tx.meeting.deleteMany({ where: { userTimetableId: id } });
        await tx.course.deleteMany({ where: { userTimetableId: id } });
        const courseMap = new Map<string, string>();
        for (const course of input.courses ?? []) {
          const created = await tx.course.create({ data: { userTimetableId: id, name: course.name, teacher: course.teacher ?? null, color: course.color ?? null, totalSessions: course.totalSessions, note: course.note ?? null } });
          if (course.id) courseMap.set(course.id, created.id);
          if (course.tempId) courseMap.set(course.tempId, created.id);
        }
        for (const meeting of input.meetings ?? []) {
          const courseId = meeting.courseId ? courseMap.get(meeting.courseId) ?? meeting.courseId : meeting.courseTempId ? courseMap.get(meeting.courseTempId) : undefined;
          if (!courseId) throw new AppError(400, "VALIDATION_ERROR", "Meeting references missing course");
          await tx.meeting.create({ data: { userTimetableId: id, courseId, dayOfWeek: meeting.dayOfWeek, startPeriodIndex: meeting.startPeriodIndex, periodCount: meeting.periodCount, room: meeting.room ?? null } });
        }
      }
      return tx.userTimetable.findUniqueOrThrow({ where: { id }, include: { daySlots: true, courses: true, meetings: true } });
    });
    await generateOccurrencesForUserTimetable({ userTimetableId: id });
    return c.json({ userTimetable: userTimetableDto(timetable) });
  });

  app.delete("/api/user-timetables/:id", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    await getOwnedTimetable(id, user.id);
    await prisma.userTimetable.delete({ where: { id } });
    return c.json({ ok: true });
  });

  app.post("/api/user-timetables/:id/publish-as-template", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", PublishInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const timetable = await getOwnedTimetable(c.req.valid("param").id, user.id);
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { schoolId: true, departmentId: true },
    });
    if (currentUser.schoolId == null || currentUser.departmentId == null) {
      throw new AppError(403, "SCHOOL_OR_DEPT_NOT_SET", "School or department is not set");
    }
    const schoolId = currentUser.schoolId;
    const departmentId = currentUser.departmentId;
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.timetableTemplate.create({ data: { authorUserId: user.id, schoolId, departmentId, title: input.title, description: input.description ?? undefined, year: input.year ?? undefined, term: input.term ?? undefined, isPublic: true, copyCount: 0 } });
      await tx.templateDaySlot.createMany({ data: timetable.daySlots.map((slot) => ({ templateId: created.id, periodIndex: slot.periodIndex, label: slot.label, startMinute: slot.startMinute, endMinute: slot.endMinute, isBreak: slot.isBreak })) });
      const courseMap = new Map<string, string>();
      for (const course of timetable.courses) {
        const createdCourse = await tx.templateCourse.create({ data: { templateId: created.id, name: course.name, teacher: course.teacher ?? undefined, color: course.color ?? undefined, totalSessions: course.totalSessions, note: course.note ?? undefined } });
        courseMap.set(course.id, createdCourse.id);
      }
      for (const meeting of timetable.meetings) {
        const courseId = courseMap.get(meeting.courseId);
        if (!courseId) throw new AppError(400, "VALIDATION_ERROR", "Meeting references missing course");
        await tx.templateMeeting.create({ data: { templateId: created.id, courseId, dayOfWeek: meeting.dayOfWeek, startPeriodIndex: meeting.startPeriodIndex, periodCount: meeting.periodCount, room: meeting.room ?? undefined } });
      }
      return tx.timetableTemplate.findUniqueOrThrow({ where: { id: created.id }, include: { daySlots: true, courses: true, meetings: true } });
    });
    return c.json({ template: templateDto(template) }, 201);
  });
}
