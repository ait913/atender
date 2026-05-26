import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../types";
import { getAuth } from "../auth";
import { getPrisma } from "../db";
import { AppError } from "../lib/appError";

function readCookie(headers: Headers, name: string) {
  const cookie = headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

export const sessionMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user && session.session) {
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
    return;
  }

  const token = readCookie(c.req.raw.headers, "better-auth.session_token");
  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const dbSession = await getPrisma().session.findUnique({ where: { token }, include: { user: true } });
  if (!dbSession || dbSession.expiresAt < new Date()) {
    if (dbSession) await getPrisma().session.delete({ where: { id: dbSession.id } });
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const { user, ...rawSession } = dbSession;
  c.set("user", { ...user, name: user.name ?? "" });
  c.set("session", rawSession);
  await next();
};
