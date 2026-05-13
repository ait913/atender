import type { Hono } from "hono";
import { expect } from "vitest";

type Json = Record<string, unknown> | unknown[] | null;

export async function json(res: Response) {
  const text = await res.text();
  return text.length > 0 ? JSON.parse(text) : null;
}

export function expectError(body: unknown, code: string | RegExp) {
  const actual = (body as { error?: { code?: string } })?.error?.code;
  if (code instanceof RegExp) {
    expect(actual).toMatch(code);
  } else {
    expect(actual).toBe(code);
  }
}

export function requestJson(app: Hono, path: string, init: RequestInit & { body?: Json } = {}) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return app.request(path, {
    ...init,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
