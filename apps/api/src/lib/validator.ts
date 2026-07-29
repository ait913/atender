import { zValidator as baseZValidator } from "@hono/zod-validator";
import type { Hook } from "@hono/zod-validator";
import type { ZodError } from "zod";

const MAX_SUMMARY_ISSUES = 5;

/** ZodError を 1 行の人が読める要約にする (実機のエラー表示から原因に辿り着けるように) */
export function summarizeZodError(error: ZodError): string {
  const issues = error.issues;
  if (issues.length === 0) return "Invalid request";
  const shown = issues.slice(0, MAX_SUMMARY_ISSUES).map((issue) => {
    const path = issue.path.join(".");
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
  const rest = issues.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} (+${rest} more)` : shown.join(", ");
}

/** ErrorResponse (packages/shared/src/schemas/api.ts) と同じ封筒に揃える */
export function validationErrorBody(error: ZodError) {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message: summarizeZodError(error),
      details: {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message,
        })),
      },
    },
  };
}

const validationErrorHook: Hook<unknown, never, string> = (result, c) => {
  if (result.success) return;
  return c.json(validationErrorBody(result.error), 400);
};

/**
 * `@hono/zod-validator` の zValidator ラッパー。
 *
 * 素の zValidator は validation 失敗時に raw ZodError
 * (`{"success":false,"error":{"issues":[...],"name":"ZodError"}}`) をそのまま返すため、
 * `ErrorResponse` (`{error:{code,message}}`) を期待する iOS / web クライアントが decode に失敗し、
 * 実メッセージが「サーバーエラー (HTTP 400)」/ generic `HTTP_ERROR` に潰れる
 * (.knowledge/known-failures.md A6 / A7)。
 *
 * ここを通せば validation 失敗も AppError 経路 (middleware/error.ts) と同じ封筒になる。
 * ★ route 側は必ずこのラッパーを import すること (`@hono/zod-validator` から直 import しない)。
 */
export const zValidator = ((target: never, schema: never, hook?: never, options?: never) =>
  baseZValidator(target, schema, hook ?? (validationErrorHook as never), options)) as typeof baseZValidator;
