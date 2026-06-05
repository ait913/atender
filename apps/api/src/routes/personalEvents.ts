import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PersonalEventCreateInput, PersonalEventUpdateInput } from "@atender/shared";
import { sessionMiddleware } from "../middleware/session";
import { createPersonalEvent, deletePersonalEvent, listPersonalEvents, updatePersonalEvent } from "../services/personalEvent.service";

const PersonalEventsQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  semesterId: z.string().optional(),
});
const PersonalEventParam = z.object({ id: z.string() });

export function registerPersonalEventRoutes(app: Hono) {
  app.get("/api/personal-events", sessionMiddleware, zValidator("query", PersonalEventsQuery), async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");
    const events = await listPersonalEvents({ userId: user.id, from: query.from, to: query.to, semesterId: query.semesterId });
    return c.json({ events });
  });

  app.post("/api/personal-events", sessionMiddleware, zValidator("json", PersonalEventCreateInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const event = await createPersonalEvent({ userId: user.id, input });
    return c.json({ event }, 201);
  });

  app.patch("/api/personal-events/:id", sessionMiddleware, zValidator("param", PersonalEventParam), zValidator("json", PersonalEventUpdateInput), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const event = await updatePersonalEvent({ userId: user.id, id, input });
    return c.json({ event });
  });

  app.delete("/api/personal-events/:id", sessionMiddleware, zValidator("param", PersonalEventParam), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    await deletePersonalEvent({ userId: user.id, id });
    return c.json({ ok: true });
  });
}
