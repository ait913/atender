import type { MiddlewareHandler } from "hono";
import { env } from "../env";

const methods = "GET,POST,PATCH,DELETE,OPTIONS";
const headers = "Content-Type";

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("Origin");
  const isAllowed = origin === env.PUBLIC_WEB_URL;

  if (c.req.method === "OPTIONS") {
    if (isAllowed) {
      c.header("Access-Control-Allow-Origin", env.PUBLIC_WEB_URL);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Methods", methods);
      c.header("Access-Control-Allow-Headers", headers);
      c.header("Vary", "Origin");
    }
    return c.body(null, 204);
  }

  await next();

  // c.res.headers を直接いじる: better-auth.handler 等の raw Response にも CORS を後付け
  if (isAllowed) {
    c.res.headers.set("Access-Control-Allow-Origin", env.PUBLIC_WEB_URL);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.append("Vary", "Origin");
  }
};
