import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validator";
import { CreateRoomEventInput, CreateRoomInput, UpdateRoomEventInput, UpdateRoomInput } from "@atender/shared";
import { AppError } from "../lib/appError";
import { dateStringToJstDay } from "../lib/tz";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import {
  createRoom,
  createRoomEvent,
  deleteRoom,
  deleteRoomEvent,
  getRoom,
  getRoomWeek,
  joinRoomByInviteCode,
  leaveRoom,
  listRoomEvents,
  listRoomMembers,
  listRooms,
  regenerateInvite,
  removeRoomMember,
  updateRoom,
  updateRoomEvent,
} from "../services/room.service";
import { commitIcsImport, createIcsImport, deleteIcsImport, listIcsImports, previewIcsImport } from "../services/icsImport.service";
import { createSync, deleteSync, listSyncs, runSync, updateSync } from "../services/googleCalendarSync.service";
import { disableShare, getShare, patchShare, upsertShare } from "../services/personalCalendarShare.service";

const IdParam = z.object({ id: z.string() });
const SyncParam = z.object({ id: z.string(), syncId: z.string() });
const IcsImportParam = z.object({ id: z.string(), importId: z.string() });
const MemberParam = z.object({ id: z.string(), userId: z.string() });
const EventParam = z.object({ id: z.string(), eventId: z.string() });
const JoinInput = z.object({ inviteCode: z.string().min(1) });
const WeekQuery = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const EventsQuery = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() });
const CreateSyncBody = z.object({
  googleCalendarId: z.string().min(1).max(500),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).default("TITLE_MAPPED"),
});
const PatchSyncBody = z.object({
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).optional(),
  enabled: z.boolean().optional(),
});
const SharePutBody = z.object({
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).default("TITLE_MAPPED"),
});
const SharePatchBody = z.object({
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).optional(),
  enabled: z.boolean().optional(),
});
const DeleteSyncQuery = z.object({ deleteEvents: z.enum(["true", "false"]).default("true") });
const DeleteEventQuery = z.object({
  scope: z.enum(["single", "future", "all"]).default("all"),
  originalDate: z.string().datetime().optional(),
}).refine((value) => value.scope === "all" || value.originalDate != null, { message: "originalDate required for scope=single|future" });

type UploadedFile = { name?: string; arrayBuffer: () => Promise<ArrayBuffer> };

export function registerRoomRoutes(app: Hono) {
  app.get("/api/rooms", sessionMiddleware, setupGuard, async (c) => {
    return c.json({ rooms: await listRooms(c.get("user").id) });
  });

  app.post("/api/rooms", sessionMiddleware, setupGuard, zValidator("json", CreateRoomInput), async (c) => {
    const room = await createRoom(c.get("user").id, c.req.valid("json"));
    return c.json({ room }, 201);
  });

  app.post("/api/rooms/join", sessionMiddleware, setupGuard, zValidator("json", JoinInput), async (c) => {
    const room = await joinRoomByInviteCode(c.get("user").id, c.req.valid("json").inviteCode);
    return c.json({ room });
  });

  app.get("/api/rooms/:id", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    return c.json({ room: await getRoom(c.get("user").id, c.req.valid("param").id) });
  });

  app.patch("/api/rooms/:id", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", UpdateRoomInput), async (c) => {
    return c.json({ room: await updateRoom(c.get("user").id, c.req.valid("param").id, c.req.valid("json")) });
  });

  app.delete("/api/rooms/:id", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    await deleteRoom(c.get("user").id, c.req.valid("param").id);
    return c.json({ ok: true });
  });

  app.post("/api/rooms/:id/leave", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    await leaveRoom(c.get("user").id, c.req.valid("param").id);
    return c.json({ ok: true });
  });

  app.get("/api/rooms/:id/members", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    return c.json({ members: await listRoomMembers(c.get("user").id, c.req.valid("param").id) });
  });

  app.delete("/api/rooms/:id/members/:userId", sessionMiddleware, setupGuard, zValidator("param", MemberParam), async (c) => {
    const param = c.req.valid("param");
    await removeRoomMember(c.get("user").id, param.id, param.userId);
    return c.json({ ok: true });
  });

  app.post("/api/rooms/:id/invite", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    return c.json(await regenerateInvite(c.get("user").id, c.req.valid("param").id));
  });

  app.get("/api/rooms/:id/week", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("query", WeekQuery), async (c) => {
    const day = dateStringToJstDay(c.req.valid("query").weekStart);
    return c.json(await getRoomWeek(c.get("user").id, c.req.valid("param").id, day.startOfDay));
  });

  app.get("/api/rooms/:id/events", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("query", EventsQuery), async (c) => {
    return c.json({ events: await listRoomEvents(c.get("user").id, c.req.valid("param").id, c.req.valid("query")) });
  });

  app.post("/api/rooms/:id/ics-imports", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    const body = await c.req.parseBody();
    const file = body.file as UploadedFile | string | undefined;
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      throw new AppError(400, "FILE_REQUIRED", "file field required");
    }
    const result = await createIcsImport({
      userId: c.get("user").id,
      roomId: c.req.valid("param").id,
      filename: file.name ?? "calendar.ics",
      buf: Buffer.from(await file.arrayBuffer()),
    });
    return c.json({ import: result.import, parsedCount: result.parsed.length, dedup: result.dedup }, 201);
  });

  app.get("/api/rooms/:id/ics-imports", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    return c.json({ imports: await listIcsImports(c.get("user").id, c.req.valid("param").id) });
  });

  app.get("/api/rooms/:id/ics-imports/:importId/preview", sessionMiddleware, setupGuard, zValidator("param", IcsImportParam), async (c) => {
    return c.json(await previewIcsImport(c.get("user").id, c.req.valid("param").importId));
  });

  app.post("/api/rooms/:id/ics-imports/:importId/commit", sessionMiddleware, setupGuard, zValidator("param", IcsImportParam), async (c) => {
    return c.json(await commitIcsImport(c.get("user").id, c.req.valid("param").importId));
  });

  app.delete("/api/rooms/:id/ics-imports/:importId", sessionMiddleware, setupGuard, zValidator("param", IcsImportParam), async (c) => {
    await deleteIcsImport(c.get("user").id, c.req.valid("param").importId);
    return c.json({ ok: true });
  });

  app.get("/api/rooms/:id/google-calendar-syncs", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    const syncs = await listSyncs(c.get("user").id, c.req.valid("param").id);
    return c.json({ syncs: syncs.map(dtoSync) });
  });

  app.post("/api/rooms/:id/google-calendar-syncs", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", CreateSyncBody), async (c) => {
    const body = c.req.valid("json");
    const sync = await createSync({
      userId: c.get("user").id,
      roomId: c.req.valid("param").id,
      googleCalendarId: body.googleCalendarId,
      visibilityMode: body.visibilityMode,
      headers: c.req.raw.headers,
    });
    return c.json({ sync: dtoSync(sync) }, 201);
  });

  app.patch("/api/rooms/:id/google-calendar-syncs/:syncId", sessionMiddleware, setupGuard, zValidator("param", SyncParam), zValidator("json", PatchSyncBody), async (c) => {
    const param = c.req.valid("param");
    const sync = await updateSync({
      userId: c.get("user").id,
      roomId: param.id,
      syncId: param.syncId,
      patch: c.req.valid("json"),
    });
    return c.json({ sync: dtoSync(sync) });
  });

  app.delete("/api/rooms/:id/google-calendar-syncs/:syncId", sessionMiddleware, setupGuard, zValidator("param", SyncParam), zValidator("query", DeleteSyncQuery), async (c) => {
    const param = c.req.valid("param");
    const result = await deleteSync({
      userId: c.get("user").id,
      roomId: param.id,
      syncId: param.syncId,
      deleteEvents: c.req.valid("query").deleteEvents === "true",
    });
    return c.json(result);
  });

  app.post("/api/rooms/:id/google-calendar-syncs/:syncId/run", sessionMiddleware, setupGuard, zValidator("param", SyncParam), async (c) => {
    const param = c.req.valid("param");
    return c.json(await runSync({ syncId: param.syncId, userId: c.get("user").id, headers: c.req.raw.headers }));
  });

  app.get("/api/rooms/:id/personal-calendar-share", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    return c.json({ share: await getShare({ roomId: c.req.valid("param").id, userId: c.get("user").id }) });
  });

  app.post("/api/rooms/:id/personal-calendar-share", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", SharePutBody), async (c) => {
    const share = await upsertShare({
      roomId: c.req.valid("param").id,
      userId: c.get("user").id,
      visibilityMode: c.req.valid("json").visibilityMode,
    });
    return c.json({ share }, 201);
  });

  app.patch("/api/rooms/:id/personal-calendar-share", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", SharePatchBody), async (c) => {
    const share = await patchShare({
      roomId: c.req.valid("param").id,
      userId: c.get("user").id,
      patch: c.req.valid("json"),
    });
    return c.json({ share });
  });

  app.delete("/api/rooms/:id/personal-calendar-share", sessionMiddleware, setupGuard, zValidator("param", IdParam), async (c) => {
    await disableShare({ roomId: c.req.valid("param").id, userId: c.get("user").id });
    return c.json({ ok: true });
  });

  app.post("/api/rooms/:id/events", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", CreateRoomEventInput), async (c) => {
    const event = await createRoomEvent(c.get("user").id, c.req.valid("param").id, c.req.valid("json"));
    return c.json({ event }, 201);
  });

  app.patch("/api/rooms/:id/events/:eventId", sessionMiddleware, setupGuard, zValidator("param", EventParam), zValidator("json", UpdateRoomEventInput), async (c) => {
    const param = c.req.valid("param");
    return c.json({ event: await updateRoomEvent(c.get("user").id, param.id, param.eventId, c.req.valid("json")) });
  });

  app.delete("/api/rooms/:id/events/:eventId", sessionMiddleware, setupGuard, zValidator("param", EventParam), zValidator("query", DeleteEventQuery), async (c) => {
    const param = c.req.valid("param");
    await deleteRoomEvent(c.get("user").id, param.id, param.eventId, c.req.valid("query"));
    return c.json({ ok: true });
  });
}

function dtoSync(sync: {
  id: string;
  googleCalendarId: string;
  calendarSummary: string;
  calendarTimeZone: string;
  visibilityMode: string;
  syncToken: string | null;
  status: string;
  lastError: string | null;
  lastSyncedAt: Date | null;
  enabled: boolean;
  createdAt: Date;
}) {
  return {
    id: sync.id,
    googleCalendarId: sync.googleCalendarId,
    calendarSummary: sync.calendarSummary,
    calendarTimeZone: sync.calendarTimeZone,
    visibilityMode: sync.visibilityMode,
    status: sync.status,
    lastError: sync.lastError,
    lastSyncedAt: sync.lastSyncedAt?.toISOString() ?? null,
    enabled: sync.enabled,
    createdAt: sync.createdAt.toISOString(),
    hasSyncToken: sync.syncToken != null,
  };
}
