import type { Hono } from "hono";
import { MeUpdateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { sessionMiddleware } from "../middleware/session";

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
    isComplete: user.schoolId != null && user.departmentId != null && user.defaultSemesterId != null && hasUserTimetable,
  };
  return {
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
  };
}

function departmentSchoolMismatch() {
  return new AppError(400, "VALIDATION_ERROR", "Department does not belong to school", { reason: "DEPARTMENT_SCHOOL_MISMATCH" });
}

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
}
