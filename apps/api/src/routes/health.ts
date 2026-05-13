import type { Hono } from "hono";
import { prisma } from "../db";

export function registerHealthRoutes(app: Hono) {
  app.get("/healthz", async (c) => {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ ok: true, db: true });
  });
}
