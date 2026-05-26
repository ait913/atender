import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CreateFriendshipInput, FriendshipStatusEnum } from "@atender/shared";
import { sessionMiddleware } from "../middleware/session";
import {
  acceptFriendship,
  blockFriendship,
  cancelFriendship,
  createFriendship,
  declineFriendship,
  deleteFriendship,
  friendshipDto,
  listFriendships,
} from "../services/friendship.service";

const IdParam = z.object({ id: z.string() });
const Query = z.object({
  status: FriendshipStatusEnum.optional(),
  direction: z.enum(["sent", "received", "all"]).default("all"),
});

export function registerFriendshipRoutes(app: Hono) {
  app.get("/api/friendships", sessionMiddleware, zValidator("query", Query), async (c) => {
    const rows = await listFriendships(c.get("user").id, c.req.valid("query"));
    return c.json({ friendships: rows.map(friendshipDto) });
  });

  app.post("/api/friendships", sessionMiddleware, zValidator("json", CreateFriendshipInput), async (c) => {
    const friendship = await createFriendship(c.get("user").id, c.req.valid("json"));
    return c.json({ friendship: friendshipDto(friendship) }, 201);
  });

  app.post("/api/friendships/:id/accept", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    const friendship = await acceptFriendship(c.get("user").id, c.req.valid("param").id);
    return c.json({ friendship: friendshipDto(friendship) });
  });

  app.post("/api/friendships/:id/decline", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    const friendship = await declineFriendship(c.get("user").id, c.req.valid("param").id);
    return c.json({ friendship: friendshipDto(friendship) });
  });

  app.post("/api/friendships/:id/cancel", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    await cancelFriendship(c.get("user").id, c.req.valid("param").id);
    return c.json({ ok: true });
  });

  app.post("/api/friendships/:id/block", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    const friendship = await blockFriendship(c.get("user").id, c.req.valid("param").id);
    return c.json({ friendship: friendshipDto(friendship) });
  });

  app.delete("/api/friendships/:id", sessionMiddleware, zValidator("param", IdParam), async (c) => {
    await deleteFriendship(c.get("user").id, c.req.valid("param").id);
    return c.json({ ok: true });
  });
}
