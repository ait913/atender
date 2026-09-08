import type { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validator";
import { ClassTransferCreateInput } from "@atender/shared";
import { sessionMiddleware } from "../middleware/session";
import { setupGuard } from "../middleware/setupGuard";
import { createClassTransfer, deleteClassTransfer } from "../services/classTransfer.service";

const ClassTransferParam = z.object({ id: z.string() });

export function registerClassTransferRoutes(app: Hono) {
  app.post("/api/class-transfers", sessionMiddleware, setupGuard, zValidator("json", ClassTransferCreateInput), async (c) => {
    const transfer = await createClassTransfer(c.get("user").id, c.req.valid("json"));
    return c.json({ transfer }, 201);
  });

  app.delete("/api/class-transfers/:id", sessionMiddleware, setupGuard, zValidator("param", ClassTransferParam), async (c) => {
    const result = await deleteClassTransfer(c.get("user").id, c.req.valid("param").id);
    return c.json(result);
  });
}
