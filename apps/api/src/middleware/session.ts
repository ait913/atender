import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../types";
import { auth } from "../auth";
import { AppError } from "../lib/appError";

export const sessionMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || !session.session) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
};
