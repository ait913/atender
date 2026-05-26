import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { MeetingBulkCreateInput } from "@atender/shared";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { createMeetingsBulk } from "../services/meeting.service";

export function registerMeetingRoutes(app: Hono) {
  app.post("/api/meetings/bulk", sessionMiddleware, setupGuard, zValidator("json", MeetingBulkCreateInput), async (c) => {
    const meetings = await createMeetingsBulk(c.get("user").id, c.req.valid("json"));
    return c.json({ meetings }, 201);
  });
}
