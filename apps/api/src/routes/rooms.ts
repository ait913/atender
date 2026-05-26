import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CreateRoomEventInput, CreateRoomInput, UpdateRoomEventInput, UpdateRoomInput } from "@atender/shared";
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

const IdParam = z.object({ id: z.string() });
const MemberParam = z.object({ id: z.string(), userId: z.string() });
const EventParam = z.object({ id: z.string(), eventId: z.string() });
const JoinInput = z.object({ inviteCode: z.string().min(1) });
const WeekQuery = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const EventsQuery = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() });

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

  app.post("/api/rooms/:id/events", sessionMiddleware, setupGuard, zValidator("param", IdParam), zValidator("json", CreateRoomEventInput), async (c) => {
    const event = await createRoomEvent(c.get("user").id, c.req.valid("param").id, c.req.valid("json"));
    return c.json({ event }, 201);
  });

  app.patch("/api/rooms/:id/events/:eventId", sessionMiddleware, setupGuard, zValidator("param", EventParam), zValidator("json", UpdateRoomEventInput), async (c) => {
    const param = c.req.valid("param");
    return c.json({ event: await updateRoomEvent(c.get("user").id, param.id, param.eventId, c.req.valid("json")) });
  });

  app.delete("/api/rooms/:id/events/:eventId", sessionMiddleware, setupGuard, zValidator("param", EventParam), async (c) => {
    const param = c.req.valid("param");
    await deleteRoomEvent(c.get("user").id, param.id, param.eventId);
    return c.json({ ok: true });
  });
}
