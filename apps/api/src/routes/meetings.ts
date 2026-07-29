import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validator";
import { MeetingBulkCreateInput, MeetingUpdateInput } from "@atender/shared";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { createMeetingsBulk, deleteMeeting, updateMeeting } from "../services/meeting.service";

const MeetingParam = z.object({ meetingId: z.string() });

export function registerMeetingRoutes(app: Hono) {
  app.post("/api/meetings/bulk", sessionMiddleware, setupGuard, zValidator("json", MeetingBulkCreateInput), async (c) => {
    const meetings = await createMeetingsBulk(c.get("user").id, c.req.valid("json"));
    return c.json({ meetings }, 201);
  });

  app.patch("/api/meetings/:meetingId", sessionMiddleware, setupGuard, zValidator("param", MeetingParam), zValidator("json", MeetingUpdateInput), async (c) => {
    const meeting = await updateMeeting(c.get("user").id, c.req.valid("param").meetingId, c.req.valid("json"));
    return c.json({ meeting });
  });

  app.delete("/api/meetings/:meetingId", sessionMiddleware, setupGuard, zValidator("param", MeetingParam), async (c) => {
    await deleteMeeting(c.get("user").id, c.req.valid("param").meetingId);
    return c.json({ ok: true });
  });
}
