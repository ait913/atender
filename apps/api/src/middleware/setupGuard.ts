import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../types";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { isSetupComplete } from "../lib/setupStatus";

export const setupGuard: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const sessionUser = c.get("user");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { id: true, schoolId: true, departmentId: true, defaultSemesterId: true },
  });
  if (!isSetupComplete(user)) {
    throw new AppError(403, "SETUP_REQUIRED", "User must complete setup");
  }
  await next();
};
