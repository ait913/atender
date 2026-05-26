import { zValidator as base } from "@hono/zod-validator";
import type { Context } from "hono";
import type { ZodSchema } from "zod";

type Target = "json" | "query" | "param" | "header" | "cookie" | "form";

function makeHook(target: Target) {
  return (result: { success: boolean; data?: unknown; error?: { flatten: () => unknown } }, c: Context) => {
    if (!result.success && result.error) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid ${target}`,
            details: result.error.flatten(),
          },
        },
        400,
      );
    }
  };
}

export const zJson = <S extends ZodSchema>(schema: S) => base("json", schema, makeHook("json"));
export const zQuery = <S extends ZodSchema>(schema: S) => base("query", schema, makeHook("query"));
export const zParam = <S extends ZodSchema>(schema: S) => base("param", schema, makeHook("param"));
export const zForm = <S extends ZodSchema>(schema: S) => base("form", schema, makeHook("form"));
