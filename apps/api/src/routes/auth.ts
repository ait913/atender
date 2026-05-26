import type { Hono } from "hono";
import { getAuth } from "../auth";
import { getPrisma } from "../db";

function readCookie(headers: Headers, name: string) {
  const cookie = headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

export function registerAuthRoutes(app: Hono) {
  app.post("/api/auth/sign-out", async (c) => {
    const token = readCookie(c.req.raw.headers, "better-auth.session_token");
    if (token) await getPrisma().session.deleteMany({ where: { token } });
    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie": "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      },
    });
  });
  app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));
}
