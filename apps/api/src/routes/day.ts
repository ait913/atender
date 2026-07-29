import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validator";
import { sessionMiddleware } from "../middleware/session";
import { getDayDetail } from "../services/dayDetail.service";

const DayParam = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export function registerDayRoutes(app: Hono) {
  app.get("/api/day/:date", sessionMiddleware, zValidator("param", DayParam), async (c) => {
    const user = c.get("user");
    const { date } = c.req.valid("param");
    const detail = await getDayDetail({ userId: user.id, date });
    return c.json(detail);
  });
}
