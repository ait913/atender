import type { MiddlewareHandler } from "hono";
import { env } from "../env";

const methods = "GET,POST,PATCH,DELETE,OPTIONS";
const headers = "Content-Type";

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin === env.PUBLIC_WEB_URL) {
    c.header("Access-Control-Allow-Origin", env.PUBLIC_WEB_URL);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Methods", methods);
    c.header("Access-Control-Allow-Headers", headers);
    c.header("Vary", "Origin");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
};
