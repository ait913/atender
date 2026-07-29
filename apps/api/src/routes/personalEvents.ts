import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validator";
import {
  EventKitSyncInput,
  LegacyEkPushClearInput,
  PersonalEventCreateInput,
  PersonalEventDeleteQuery,
  PersonalEventUpdateInput,
} from "@atender/shared";
import { sessionMiddleware } from "../middleware/session";
import {
  clearLegacyEkPushes,
  createPersonalEvent,
  deletePersonalEvent,
  listLegacyEkPushes,
  listPersonalEvents,
  reconcileEventKit,
  updatePersonalEvent,
} from "../services/personalEvent.service";

const PersonalEventsQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const PersonalEventParam = z.object({ id: z.string() });

export function registerPersonalEventRoutes(app: Hono) {
  app.get("/api/personal-events", sessionMiddleware, zValidator("query", PersonalEventsQuery), async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");
    const events = await listPersonalEvents({ userId: user.id, from: query.from, to: query.to });
    return c.json({ events });
  });

  app.post("/api/personal-events", sessionMiddleware, zValidator("json", PersonalEventCreateInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const event = await createPersonalEvent({ userId: user.id, input });
    return c.json({ event }, 201);
  });

  app.post("/api/personal-events/eventkit-sync", sessionMiddleware, zValidator("json", EventKitSyncInput), async (c) => {
    const user = c.get("user");
    return c.json(await reconcileEventKit({ userId: user.id, input: c.req.valid("json") }));
  });

  app.get("/api/personal-events/eventkit-legacy-pushes", sessionMiddleware, async (c) => {
    const user = c.get("user");
    return c.json(await listLegacyEkPushes({ userId: user.id }));
  });

  app.post("/api/personal-events/eventkit-legacy-pushes/clear", sessionMiddleware, zValidator("json", LegacyEkPushClearInput), async (c) => {
    const user = c.get("user");
    return c.json(await clearLegacyEkPushes({ userId: user.id, externalIds: c.req.valid("json").externalIds }));
  });

  app.patch("/api/personal-events/:id", sessionMiddleware, zValidator("param", PersonalEventParam), zValidator("json", PersonalEventUpdateInput), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const event = await updatePersonalEvent({ userId: user.id, id, input });
    return c.json({ event });
  });

  app.delete("/api/personal-events/:id", sessionMiddleware, zValidator("param", PersonalEventParam), zValidator("query", PersonalEventDeleteQuery), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const query = c.req.valid("query");
    await deletePersonalEvent({ userId: user.id, id, query });
    return c.json({ ok: true });
  });
}
