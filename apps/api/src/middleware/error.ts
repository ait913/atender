import type { Hono } from "hono";
import { ZodError } from "zod";
import { AppError } from "../lib/appError";

export function registerErrorHandler(app: Hono) {
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
    }
    if (err instanceof ZodError) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() } }, 400);
    }
    console.error(err);
    return c.json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
  });
}
