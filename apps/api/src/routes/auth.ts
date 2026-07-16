import type { Hono } from "hono";
import { getAuth } from "../auth";
import { getPrisma } from "../db";
import { trustedOrigins } from "../env";
import { AppError } from "../lib/appError";

function readCookie(headers: Headers, name: string) {
  const cookie = headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function readBearerToken(headers: Headers) {
  const authorization = headers.get("Authorization");
  if (!authorization || authorization.slice(0, 7).toLowerCase() !== "bearer ") return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}

async function resolveSessionToken(headers: Headers) {
  const session = await getAuth().api.getSession({ headers });
  if (session?.session.token) return session.session.token;

  const token = readBearerToken(headers) ?? readCookie(headers, "better-auth.session_token");
  if (!token) return null;

  const dbSession = await getPrisma().session.findUnique({ where: { token } });
  if (!dbSession || dbSession.expiresAt < new Date()) {
    if (dbSession) await getPrisma().session.delete({ where: { id: dbSession.id } });
    return null;
  }
  return dbSession.token;
}

export function registerAuthRoutes(app: Hono) {
  app.get("/api/auth/native/callback", async (c) => {
    const next = c.req.query("next") ?? "atender://auth";
    if (!trustedOrigins.includes(next)) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid native callback next");
    }

    const token = await resolveSessionToken(c.req.raw.headers);
    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
    }

    const location = new URL(next);
    location.hash = `token=${encodeURIComponent(token)}`;
    return c.redirect(location.toString(), 302);
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));
}
