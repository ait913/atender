import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validator";
import { sessionMiddleware } from "../middleware/session";
import { exchangeAppleAuthorizationCode } from "../services/appleAuthorization.service";

const ExchangeBody = z.object({ authorizationCode: z.string().min(1).max(4096) });

export function registerAuthAppleRoutes(app: Hono) {
  app.post("/api/auth-apple/exchange", sessionMiddleware, zValidator("json", ExchangeBody), async (c) => {
    const result = await exchangeAppleAuthorizationCode({
      userId: c.get("user").id,
      authorizationCode: c.req.valid("json").authorizationCode,
    });
    return c.json(result);
  });
}
