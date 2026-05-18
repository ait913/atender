import type { Hono } from "hono";
import { z } from "zod";
import { zJson, zParam, zQuery } from "../lib/zv";
import { AttendanceRuleUpsertInput } from "@atender/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { getEffectiveRule } from "../services/rules";

const RuleScope = z.object({ schoolId: z.string(), departmentId: z.string() });
const RuleBody = AttendanceRuleUpsertInput.extend({ schoolId: z.string(), departmentId: z.string() });

function ruleDto(rule: NonNullable<Awaited<ReturnType<typeof prisma.attendanceRule.findFirst>>>) {
  return {
    id: rule.id,
    schoolId: rule.schoolId,
    departmentId: rule.departmentId,
    userId: rule.userId,
    excusedStrategy: rule.excusedStrategy,
    tardyStrategy: rule.tardyStrategy,
    earlyLeaveStrategy: rule.earlyLeaveStrategy,
  };
}

async function ensureSchoolDepartment(schoolId: string, departmentId: string) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department || department.schoolId !== schoolId) throw new AppError(404, "NOT_FOUND", "School or department not found");
}

export function registerRuleRoutes(app: Hono) {
  app.get("/api/attendance-rules", sessionMiddleware, setupGuard, zQuery(RuleScope), async (c) => {
    const user = c.get("user");
    const scope = c.req.valid("query");
    await ensureSchoolDepartment(scope.schoolId, scope.departmentId);
    const effective = await getEffectiveRule({ ...scope, userId: user.id });
    return c.json({
      default: effective.default ? ruleDto(effective.default) : null,
      userOverride: effective.userOverride ? ruleDto(effective.userOverride) : null,
      effective: effective.effective,
    });
  });

  app.patch("/api/attendance-rules/default", sessionMiddleware, zJson(RuleBody), async (c) => {
    const input = c.req.valid("json");
    await ensureSchoolDepartment(input.schoolId, input.departmentId);
    const existing = await prisma.attendanceRule.findFirst({ where: { schoolId: input.schoolId, departmentId: input.departmentId, userId: null } });
    const rule = existing
      ? await prisma.attendanceRule.update({ where: { id: existing.id }, data: { excusedStrategy: input.excusedStrategy, tardyStrategy: input.tardyStrategy, earlyLeaveStrategy: input.earlyLeaveStrategy } })
      : await prisma.attendanceRule.create({ data: { schoolId: input.schoolId, departmentId: input.departmentId, userId: null, excusedStrategy: input.excusedStrategy, tardyStrategy: input.tardyStrategy, earlyLeaveStrategy: input.earlyLeaveStrategy } });
    return c.json({ rule: ruleDto(rule) });
  });

  app.patch("/api/attendance-rules/user", sessionMiddleware, zJson(RuleBody), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    await ensureSchoolDepartment(input.schoolId, input.departmentId);
    try {
      const rule = await prisma.attendanceRule.upsert({
        where: { schoolId_departmentId_userId: { schoolId: input.schoolId, departmentId: input.departmentId, userId: user.id } },
        create: { schoolId: input.schoolId, departmentId: input.departmentId, userId: user.id, excusedStrategy: input.excusedStrategy, tardyStrategy: input.tardyStrategy, earlyLeaveStrategy: input.earlyLeaveStrategy },
        update: { excusedStrategy: input.excusedStrategy, tardyStrategy: input.tardyStrategy, earlyLeaveStrategy: input.earlyLeaveStrategy },
      });
      return c.json({ rule: ruleDto(rule) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "CONFLICT", "Attendance rule conflict");
      }
      throw error;
    }
  });

  app.delete("/api/attendance-rules/user", sessionMiddleware, zQuery(RuleScope), async (c) => {
    const user = c.get("user");
    const scope = c.req.valid("query");
    const rule = await prisma.attendanceRule.findUnique({ where: { schoolId_departmentId_userId: { ...scope, userId: user.id } } });
    if (!rule) throw new AppError(404, "NOT_FOUND", "Attendance rule not found");
    await prisma.attendanceRule.delete({ where: { id: rule.id } });
    return c.json({ ok: true });
  });
}
