import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../types";
import { prisma } from "../db";
import { AppError } from "../lib/appError";

export const setupGuard: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const sessionUser = c.get("user");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { id: true, schoolId: true, departmentId: true, defaultSemesterId: true },
  });
  const hasUserTimetable = user.defaultSemesterId
    ? await prisma.userTimetable.count({ where: { userId: user.id, semesterId: user.defaultSemesterId } }).then((count) => count >= 1)
    : false;
  if (user.schoolId == null || user.departmentId == null || user.defaultSemesterId == null || !hasUserTimetable) {
    throw new AppError(403, "SETUP_REQUIRED", "User must complete setup");
  }
  await next();
};
