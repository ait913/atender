import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { BulkTimetableSuspensionInput, BulkTimetableSuspensionRemoveInput, TimetableSuspensionCreateInput } from "@atender/shared";
import { sessionMiddleware } from "../middleware/session";
import {
  bulkCreateTimetableSuspensions,
  bulkRemoveTimetableSuspensions,
  createTimetableSuspension,
  deleteTimetableSuspension,
  listTimetableSuspensions,
} from "../services/timetableSuspension.service";

const DateRangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const TimetableSuspensionParam = z.object({ id: z.string() });

export function registerTimetableSuspensionRoutes(app: Hono) {
  app.get("/api/timetable-suspensions", sessionMiddleware, zValidator("query", DateRangeQuery), async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");
    const suspensions = await listTimetableSuspensions({ userId: user.id, from: query.from, to: query.to });
    return c.json({ suspensions });
  });

  app.post("/api/timetable-suspensions", sessionMiddleware, zValidator("json", TimetableSuspensionCreateInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const suspension = await createTimetableSuspension({ userId: user.id, input });
    return c.json({ suspension }, 201);
  });

  app.post("/api/timetable-suspensions/bulk", sessionMiddleware, zValidator("json", BulkTimetableSuspensionInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    return c.json(await bulkCreateTimetableSuspensions({ userId: user.id, input }));
  });

  app.post("/api/timetable-suspensions/bulk-remove", sessionMiddleware, zValidator("json", BulkTimetableSuspensionRemoveInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    return c.json(await bulkRemoveTimetableSuspensions({ userId: user.id, input }));
  });

  app.delete("/api/timetable-suspensions/:id", sessionMiddleware, zValidator("param", TimetableSuspensionParam), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    await deleteTimetableSuspension({ userId: user.id, id });
    return c.json({ ok: true });
  });
}
