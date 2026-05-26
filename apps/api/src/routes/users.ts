import type { Hono } from "hono";
import { AppError } from "../lib/appError";
import { sessionMiddleware } from "../middleware/session";
import { searchUsers } from "../services/friendship.service";

export function registerUsersRoutes(app: Hono) {
  app.get("/api/users/search", sessionMiddleware, async (c) => {
    const handle = c.req.query("handle");
    if (!handle || handle.length > 30) throw new AppError(400, "BAD_REQUEST", "Invalid handle");
    const users = await searchUsers(c.get("user").id, handle);
    return c.json({ users });
  });
}
