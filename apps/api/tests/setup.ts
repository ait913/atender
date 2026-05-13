import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import { createTestDb, disposeTestDb, enableForeignKeys, ensureTemplateDb } from "./helpers/db";

declare global {
  // eslint-disable-next-line no-var
  var __resendSendMock: ReturnType<typeof vi.fn>;
}

const envTestPath = path.resolve(process.cwd(), ".env.test");
if (fs.existsSync(envTestPath)) {
  for (const line of fs.readFileSync(envTestPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-32-bytes-minimum-value";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= "http://localhost:5173,https://atender.appily.run";
process.env.BETTER_AUTH_COOKIE_DOMAIN ??= ".appily.run";
process.env.PUBLIC_WEB_URL ??= "http://localhost:5173";
process.env.RESEND_API_KEY ??= "re_test";
process.env.RESEND_FROM ??= "Atender <noreply@atender.appily.run>";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
process.env.PORT ??= "3000";

globalThis.__resendSendMock = vi.fn().mockResolvedValue({
  data: { id: "test-email-id" },
  error: null,
});

vi.mock("resend", () => {
  class Resend {
    emails = {
      send: globalThis.__resendSendMock,
    };
  }

  return { Resend };
});

beforeAll(() => {
  ensureTemplateDb();
});

beforeEach(async () => {
  globalThis.__resendSendMock.mockClear();
  const db = createTestDb();
  await enableForeignKeys(db.prisma);
});

afterEach(async () => {
  await disposeTestDb();
});
