import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validator";
import { SemesterCreateInput, SemesterUpdateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { semesterDto } from "../lib/dto";
import { semesterDateEnd, semesterDateStart } from "../lib/tz";
import { sessionMiddleware } from "../middleware/session";
import { reconcileOccurrencesForSemesterDateChange } from "../services/occurrenceGen";
import { getSemesterOverview } from "../services/semesterOverview.service";

const IdParam = z.object({ id: z.string() });

async function findSemesterOrThrow(id: string) {
  const semester = await prisma.semester.findUnique({ where: { id } });
  if (!semester) throw new AppError(404, "NOT_FOUND", "Semester not found");
  return semester;
}

export function registerSemesterRoutes(app: Hono) {
  app.get("/api/semesters", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const semesters = await prisma.semester.findMany({ where: { userId: user.id }, orderBy: { startDate: "desc" } });
    return c.json({ semesters: semesters.map(semesterDto) });
  });

  app.post("/api/semesters", sessionMiddleware, zValidator("json", SemesterCreateInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const startDate = semesterDateStart(input.startDate);
    const endDate = semesterDateEnd(input.endDate);
    if (startDate > endDate) throw new AppError(400, "VALIDATION_ERROR", "startDate must be <= endDate");
    const semester = await prisma.semester.create({
      data: {
        userId: user.id,
        name: input.name,
        startDate,
        endDate,
      },
    });
    const timetableCount = await prisma.userTimetable.count({ where: { userId: user.id } });
    if (timetableCount === 0) {
      await prisma.user.update({ where: { id: user.id }, data: { defaultSemesterId: semester.id } });
    }
    return c.json({ semester: semesterDto(semester) }, 201);
  });

  app.get("/api/semesters/:id", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    const user = c.get("user");
    const semester = await findSemesterOrThrow(c.req.valid("param").id);
    if (semester.userId !== user.id) throw new AppError(403, "FORBIDDEN", "Forbidden");
    return c.json({ semester: semesterDto(semester) });
  });

  app.get("/api/semesters/:id/overview", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    return c.json(await getSemesterOverview({ semesterId: id, userId: user.id }));
  });

  app.patch("/api/semesters/:id", sessionMiddleware, zValidator("param", IdParam), zValidator("json", SemesterUpdateInput), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const semester = await findSemesterOrThrow(id);
    if (semester.userId !== user.id) throw new AppError(403, "FORBIDDEN", "Forbidden");
    const nextStart = input.startDate ? semesterDateStart(input.startDate) : semester.startDate;
    const nextEnd = input.endDate ? semesterDateEnd(input.endDate) : semester.endDate;
    if (nextStart > nextEnd) throw new AppError(400, "VALIDATION_ERROR", "startDate must be <= endDate");
    const dateChanged = nextStart.getTime() !== semester.startDate.getTime() || nextEnd.getTime() !== semester.endDate.getTime();
    const updated = await prisma.semester.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.startDate ? { startDate: nextStart } : {}),
        ...(input.endDate ? { endDate: nextEnd } : {}),
      },
    });
    if (dateChanged) {
      await reconcileOccurrencesForSemesterDateChange({
        semesterId: id,
        userId: user.id,
        newStart: nextStart,
        newEnd: nextEnd,
      });
    }
    return c.json({ semester: semesterDto(updated) });
  });

  app.delete("/api/semesters/:id", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const semester = await findSemesterOrThrow(id);
    if (semester.userId !== user.id) throw new AppError(403, "FORBIDDEN", "Forbidden");
    const count = await prisma.userTimetable.count({ where: { semesterId: id } });
    if (count > 0) throw new AppError(409, "CONFLICT", "Semester has user timetables");
    await prisma.semester.delete({ where: { id } });
    return c.json({ ok: true });
  });
}
