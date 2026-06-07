import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { MeResponseDto, MeUpdateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import {
  completeGoogleLink,
  getConnection,
  listAvailableCalendars,
  runAllSyncsForUser,
  unlinkGoogle,
} from "../services/googleCalendarSync.service";
import { createRule, deleteRule, listRules, patchRule } from "../services/icsTitleRule.service";

type MeUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  handle: string | null;
  inviteCode: string | null;
  defaultSemesterId: string | null;
  schoolId: string | null;
  departmentId: string | null;
};

async function getMeResponse(user: MeUser) {
  const hasUserTimetable = user.defaultSemesterId
    ? await prisma.userTimetable.count({ where: { userId: user.id, semesterId: user.defaultSemesterId } }).then((count) => count >= 1)
    : false;
  const setupStatus = {
    hasSchool: user.schoolId != null,
    hasDepartment: user.departmentId != null,
    hasSemester: user.defaultSemesterId != null,
    hasUserTimetable,
    isComplete: user.schoolId != null && user.departmentId != null && user.defaultSemesterId != null,
  };
  return MeResponseDto.parse({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      handle: user.handle,
      inviteCode: user.inviteCode,
      defaultSemesterId: user.defaultSemesterId,
      schoolId: user.schoolId,
      departmentId: user.departmentId,
    },
    setupStatus,
  });
}

function departmentSchoolMismatch() {
  return new AppError(400, "VALIDATION_ERROR", "Department does not belong to school", { reason: "DEPARTMENT_SCHOOL_MISMATCH" });
}

const RuleId = z.object({ ruleId: z.string() });
const CreateRuleInput = z.object({
  matchType: z.enum(["EQUALS", "CONTAINS", "REGEX"]),
  pattern: z.string().min(1).max(500),
  replaceWith: z.string().max(120).nullable().optional(),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).optional(),
  priority: z.number().int().min(0).max(9998).optional(),
});
const PatchRuleInput = CreateRuleInput.partial();
const LinkCompleteBody = z.object({}).strict();
const UnlinkQuery = z.object({ deleteEvents: z.enum(["true", "false"]).default("true") });

export function registerMeRoutes(app: Hono) {
  app.get("/api/me", sessionMiddleware, async (c) => {
    const sessionUser = c.get("user");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    return c.json(await getMeResponse(user));
  });

  app.patch("/api/me", sessionMiddleware, async (c) => {
    const sessionUser = c.get("user");
    const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    const body = await c.req.json() as Record<string, unknown>;
    const hasSchoolId = Object.prototype.hasOwnProperty.call(body, "schoolId");
    const hasDepartmentId = Object.prototype.hasOwnProperty.call(body, "departmentId");
    const validationBody = hasDepartmentId && !hasSchoolId && currentUser.schoolId != null
      ? { ...body, schoolId: currentUser.schoolId }
      : body;
    const parsed = MeUpdateInput.safeParse(validationBody);
    if (!parsed.success) throw parsed.error;
    const input = parsed.data;

    if (hasSchoolId && !hasDepartmentId && currentUser.departmentId != null) {
      throw departmentSchoolMismatch();
    }

    const requestedSchoolId = hasSchoolId ? input.schoolId : undefined;
    const requestedDepartmentId = hasDepartmentId ? input.departmentId : undefined;
    const effectiveSchoolId = hasSchoolId ? requestedSchoolId : currentUser.schoolId;

    if (hasSchoolId) {
      if (requestedSchoolId == null) throw new AppError(400, "VALIDATION_ERROR", "schoolId is required");
      const school = await prisma.school.findUnique({ where: { id: requestedSchoolId } });
      if (!school) throw new AppError(404, "NOT_FOUND", "School not found");
    }

    if (hasDepartmentId) {
      if (requestedDepartmentId == null) throw new AppError(400, "VALIDATION_ERROR", "departmentId is required");
      const department = await prisma.department.findUnique({ where: { id: requestedDepartmentId } });
      if (!department) throw new AppError(404, "NOT_FOUND", "Department not found");
      if (effectiveSchoolId == null || department.schoolId !== effectiveSchoolId) {
        throw departmentSchoolMismatch();
      }
    }

    if (input.defaultSemesterId !== undefined && input.defaultSemesterId !== null) {
      const semester = await prisma.semester.findUnique({ where: { id: input.defaultSemesterId } });
      if (!semester || semester.userId !== currentUser.id) {
        throw new AppError(404, "NOT_FOUND", "Semester not found");
      }
    }

    const user = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        ...(hasSchoolId ? { schoolId: requestedSchoolId } : {}),
        ...(hasDepartmentId ? { departmentId: requestedDepartmentId } : {}),
        ...(input.defaultSemesterId !== undefined ? { defaultSemesterId: input.defaultSemesterId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.handle !== undefined ? { handle: input.handle.toLowerCase() } : {}),
      },
    });
    return c.json(await getMeResponse(user));
  });

  app.get("/api/me/ics-title-rules", sessionMiddleware, setupGuard, async (c) => {
    return c.json({ rules: await listRules(c.get("user").id) });
  });

  app.post("/api/me/ics-title-rules", sessionMiddleware, setupGuard, zValidator("json", CreateRuleInput), async (c) => {
    return c.json({ rule: await createRule(c.get("user").id, c.req.valid("json")) }, 201);
  });

  app.patch("/api/me/ics-title-rules/:ruleId", sessionMiddleware, setupGuard, zValidator("param", RuleId), zValidator("json", PatchRuleInput), async (c) => {
    return c.json({ rule: await patchRule(c.get("user").id, c.req.valid("param").ruleId, c.req.valid("json")) });
  });

  app.delete("/api/me/ics-title-rules/:ruleId", sessionMiddleware, setupGuard, zValidator("param", RuleId), async (c) => {
    await deleteRule(c.get("user").id, c.req.valid("param").ruleId);
    return c.json({ ok: true });
  });

  app.get("/api/me/google-calendar/connection", sessionMiddleware, setupGuard, async (c) => {
    const connection = await getConnection(c.get("user").id);
    return c.json({ connection: connection ? dtoConnection(connection) : null });
  });

  app.post("/api/me/google-calendar/link/complete", sessionMiddleware, setupGuard, zValidator("json", LinkCompleteBody), async (c) => {
    const connection = await completeGoogleLink({ userId: c.get("user").id, headers: c.req.raw.headers });
    return c.json({ connection: dtoConnection(connection) }, 201);
  });

  app.delete("/api/me/google-calendar/connection", sessionMiddleware, setupGuard, zValidator("query", UnlinkQuery), async (c) => {
    const result = await unlinkGoogle({
      userId: c.get("user").id,
      deleteEvents: c.req.valid("query").deleteEvents === "true",
    });
    return c.json(result);
  });

  app.get("/api/me/google-calendar/calendars", sessionMiddleware, setupGuard, async (c) => {
    const calendars = await listAvailableCalendars({ userId: c.get("user").id, headers: c.req.raw.headers });
    return c.json({ calendars: calendars.map(dtoListedCalendar) });
  });

  app.post("/api/me/google-calendar/sync-all", sessionMiddleware, setupGuard, async (c) => {
    return c.json(await runAllSyncsForUser(c.get("user").id));
  });
}

function dtoConnection(conn: {
  id: string;
  googleEmail: string;
  scope: string;
  status: string;
  lastError: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: conn.id,
    googleEmail: conn.googleEmail,
    scope: conn.scope,
    status: conn.status,
    lastError: conn.lastError,
    lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
    createdAt: conn.createdAt.toISOString(),
  };
}

function dtoListedCalendar(calendar: {
  id: string;
  summary: string;
  timeZone: string;
  accessRole: string;
  primary?: boolean;
  backgroundColor?: string;
}) {
  return {
    id: calendar.id,
    summary: calendar.summary,
    timeZone: calendar.timeZone,
    accessRole: calendar.accessRole,
    primary: calendar.primary ?? false,
    backgroundColor: calendar.backgroundColor ?? null,
  };
}
