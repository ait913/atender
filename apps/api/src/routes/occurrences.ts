import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { OccurrenceRangeQuery } from "@atender/shared";
import { AppError } from "../lib/appError";
import { sessionMiddleware } from "../middleware/session";
import { listOccurrenceRange } from "../services/occurrence.service";

const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export function registerOccurrenceRoutes(app: Hono) {
  app.get("/api/occurrences", sessionMiddleware, zValidator("query", OccurrenceRangeQuery), async (c) => {
    const user = c.get("user");
    const { from, to } = c.req.valid("query");
    if (to < from) {
      throw new AppError(400, "VALIDATION_ERROR", "to must be >= from");
    }
    const spanDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
    if (spanDays > MAX_RANGE_DAYS) {
      throw new AppError(400, "RANGE_TOO_LARGE", "range must be at most 366 days");
    }
    const range = await listOccurrenceRange({ userId: user.id, from, to });
    return c.json(range);
  });
}
