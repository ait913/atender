import type { Hono } from "hono";
import { z } from "zod";
import { zJson, zParam, zQuery } from "../lib/zv";
import { DepartmentCreateInput, SchoolCreateInput, SchoolSearchQuery } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { departmentDto, schoolDto } from "../lib/dto";
import { sessionMiddleware } from "../middleware/session";

const DepartmentSearchQuery = z.object({
  q: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const SchoolParam = z.object({ schoolId: z.string() });

export function registerSchoolRoutes(app: Hono) {
  app.get("/api/schools", sessionMiddleware, zQuery(SchoolSearchQuery), async (c) => {
    const query = c.req.valid("query");
    const schools = await prisma.school.findMany({
      where: {
        ...(query.prefecture ? { prefecture: query.prefecture } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.q ? {
          OR: [
            { name: { contains: query.q } },
            { nameKana: { contains: query.q } },
          ],
        } : {}),
      },
      orderBy: { name: "asc" },
      take: query.limit,
    });
    return c.json({ schools: schools.map(schoolDto) });
  });

  app.post("/api/schools", sessionMiddleware, zJson(SchoolCreateInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const existing = await prisma.school.findFirst({
      where: {
        name: input.name,
        prefecture: input.prefecture ?? null,
        kind: input.kind,
      },
    });
    if (existing) {
      throw new AppError(409, "CONFLICT", "School already exists", { existingId: existing.id });
    }
    const school = await prisma.school.create({
      data: {
        name: input.name,
        nameKana: input.nameKana ?? null,
        kind: input.kind,
        prefecture: input.prefecture ?? null,
        createdByUserId: user.id,
      },
    });
    return c.json({ school: schoolDto(school) }, 201);
  });

  app.get("/api/schools/:schoolId/departments", sessionMiddleware, zParam(SchoolParam), zQuery(DepartmentSearchQuery), async (c) => {
    const { schoolId } = c.req.valid("param");
    const query = c.req.valid("query");
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppError(404, "NOT_FOUND", "School not found");
    const departments = await prisma.department.findMany({
      where: {
        schoolId,
        ...(query.q ? { name: { contains: query.q } } : {}),
      },
      orderBy: { name: "asc" },
      take: query.limit,
    });
    return c.json({ departments: departments.map(departmentDto) });
  });

  app.post("/api/schools/:schoolId/departments", sessionMiddleware, zParam(SchoolParam), zJson(DepartmentCreateInput), async (c) => {
    const user = c.get("user");
    const { schoolId } = c.req.valid("param");
    const input = c.req.valid("json");
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppError(404, "NOT_FOUND", "School not found");
    const existing = await prisma.department.findUnique({ where: { schoolId_name: { schoolId, name: input.name } } });
    if (existing) {
      throw new AppError(409, "CONFLICT", "Department already exists", { existingId: existing.id });
    }
    const department = await prisma.department.create({
      data: {
        schoolId,
        name: input.name,
        nameKana: input.nameKana ?? null,
        createdByUserId: user.id,
      },
    });
    return c.json({ department: departmentDto(department) }, 201);
  });
}
