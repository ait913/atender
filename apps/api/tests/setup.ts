import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, vi, type Mock } from "vitest";
import { createTestDb, disposeTestDb, enableForeignKeys, ensureTemplateDb, installTestPrisma } from "./helpers/db";
import { aisMailOk } from "./helpers/mail";

declare global {
  // eslint-disable-next-line no-var
  var __aisMailFetchMock: Mock<(url: string, init: RequestInit) => Promise<Response>>;
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
process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= "http://localhost:5173,https://atender.appily.run,atender://auth";
process.env.BETTER_AUTH_COOKIE_DOMAIN ??= ".appily.run";
process.env.PUBLIC_WEB_URL ??= "http://localhost:5173";
process.env.AIS_MAIL_TOKEN ??= "aism_svc_test000000.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
process.env.AIS_MAIL_URL ??= "https://mail.ais-test.invalid";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
process.env.PORT ??= "3000";

installTestPrisma();

const realFetch = globalThis.fetch;
globalThis.__aisMailFetchMock = vi.fn(async () => aisMailOk());
vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(process.env.AIS_MAIL_URL!)) return globalThis.__aisMailFetchMock(url, init ?? {});
  return realFetch(input, init);
});

beforeAll(() => {
  ensureTemplateDb();
});

beforeEach(async () => {
  globalThis.__aisMailFetchMock.mockReset();
  globalThis.__aisMailFetchMock.mockImplementation(async () => aisMailOk());
  const db = await createTestDb();
  await enableForeignKeys(db.prisma);
});

afterEach(async () => {
  await disposeTestDb();
});
