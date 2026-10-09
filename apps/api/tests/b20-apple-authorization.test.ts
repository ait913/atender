import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPLE_HTTP_TIMEOUT_MS,
  decodeJwtSubject,
  readAppleCredentialsConfig,
} from "../src/services/appleAuthorization.service";
import { REVOKE_TIMEOUT_MS, collectRevocableTokens, revokeTokens } from "../src/services/tokenRevocation.service";
import { app, prisma } from "./helpers/app";
import { createSessionCookie, createTestUser } from "./helpers/auth";
import { expectError, json } from "./helpers/http";

const APPLE_ENV_KEYS = [
  "APPLE_CLIENT_ID",
  "APPLE_APP_BUNDLE_ID",
  "APPLE_CLIENT_SECRET",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
] as const;
const savedEnv: Partial<Record<(typeof APPLE_ENV_KEYS)[number], string>> = {};
for (const k of APPLE_ENV_KEYS) {
  const v = process.env[k];
  if (v !== undefined) savedEnv[k] = v;
}

function p256Pem(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function setAppleEnv() {
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_KEY_ID = "KEY1234567";
  process.env.APPLE_PRIVATE_KEY = p256Pem();
  process.env.APPLE_APP_BUNDLE_ID = "net.appily.atender";
  process.env.APPLE_CLIENT_ID = "net.appily.atender.web";
}

function b64url(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}
function jwt(payload: unknown) {
  return `${b64url({ alg: "none" })}.${b64url(payload)}.sig`;
}
function jwtPayload(token: string): Record<string, unknown> {
  const segs = token.split(".");
  expect(segs).toHaveLength(3);
  return JSON.parse(Buffer.from(segs[1], "base64url").toString("utf8"));
}

function okResponse(over: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: 3600,
      id_token: jwt({ sub: "apple-sub-u" }),
      token_type: "Bearer",
      ...over,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of APPLE_ENV_KEYS) delete process.env[k];
  setAppleEnv();
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => okResponse());
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of APPLE_ENV_KEYS) delete process.env[k];
  for (const k of APPLE_ENV_KEYS) {
    const v = savedEnv[k];
    if (v !== undefined) process.env[k] = v;
  }
});

function calls() {
  return fetchSpy.mock.calls.map((c: any[]) => {
    const init = (c[1] ?? {}) as RequestInit;
    return {
      url: String(c[0]),
      init,
      form: new URLSearchParams(typeof init.body === "string" ? init.body : String(init.body ?? "")),
    };
  });
}

async function seedApple(opts: { setup?: boolean; withAccount?: boolean } = {}) {
  const db = prisma();
  const user = await createTestUser(db);
  if (opts.withAccount !== false) {
    await db.account.create({ data: { id: "acc-apple-u", accountId: "apple-sub-u", providerId: "apple", userId: user.id } });
  }
  const cookie = await createSessionCookie(db, user.id);
  return { db, user, cookie };
}

function exchange(cookie: string | null, body: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (cookie) headers.Cookie = cookie;
  return app.request("/api/auth-apple/exchange", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("[B20 #X] POST /api/auth-apple/exchange", () => {
  it("#X1 exchanges the code, stores refresh/access token + expiry, never idToken", async () => {
    const { db, user, cookie } = await seedApple();
    const before = Date.now();
    const res = await exchange(cookie, { authorizationCode: "code-1" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ stored: true });

    const cs = calls();
    expect(cs).toHaveLength(1);
    expect(cs[0].url).toBe("https://appleid.apple.com/auth/token");
    expect(cs[0].init.method).toBe("POST");
    expect(new Headers(cs[0].init.headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
    expect(cs[0].form.get("client_id")).toBe("net.appily.atender");
    expect(cs[0].form.get("grant_type")).toBe("authorization_code");
    expect(cs[0].form.get("code")).toBe("code-1");
    expect(cs[0].form.has("redirect_uri")).toBe(false);
    expect(jwtPayload(cs[0].form.get("client_secret")!).sub).toBe("net.appily.atender");
    expect(cs[0].init.signal).toBeDefined();

    const acc = await db.account.findFirstOrThrow({ where: { userId: user.id, providerId: "apple" } });
    expect(acc.refreshToken).toBe("rt-1");
    expect(acc.accessToken).toBe("at-1");
    expect(acc.idToken).toBeNull();
    const exp = acc.accessTokenExpiresAt!.getTime();
    expect(Math.abs(exp - (before + 3600 * 1000))).toBeLessThan(60 * 1000);
  });

  it("#X2 Bearer works like cookie", async () => {
    const { db, user, cookie } = await seedApple();
    const token = cookie.slice(cookie.indexOf("=") + 1);
    const res = await exchange(null, { authorizationCode: "code-1" }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ stored: true });
    const acc = await db.account.findFirstOrThrow({ where: { userId: user.id, providerId: "apple" } });
    expect(acc.refreshToken).toBe("rt-1");
  });

  it("#X3 subject mismatch -> SUBJECT_MISMATCH, nothing stored", async () => {
    const { db, user, cookie } = await seedApple();
    fetchSpy.mockImplementation(async () => okResponse({ id_token: jwt({ sub: "someone-else" }) }));
    const res = await exchange(cookie, { authorizationCode: "code-1" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ stored: false, reason: "SUBJECT_MISMATCH" });
    const acc = await db.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(acc.refreshToken).toBeNull();
    expect(acc.accessToken).toBeNull();
  });

  it.each([
    ["Apple 400", () => fetchSpy.mockImplementation(async () => new Response('{"error":"invalid_grant"}', { status: 400 }))],
    ["fetch rejects", () => fetchSpy.mockRejectedValue(new Error("network"))],
    ["200 with non-JSON body", () => fetchSpy.mockImplementation(async () => new Response("not json", { status: 200 }))],
  ])("#X4 %s -> EXCHANGE_FAILED (HTTP 200)", async (_l, arm) => {
    const { cookie } = await seedApple();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    arm();
    const res = await exchange(cookie, { authorizationCode: "code-1" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ stored: false, reason: "EXCHANGE_FAILED" });
  });

  it("#X5 no refresh_token in response -> NO_REFRESH_TOKEN, Account unchanged", async () => {
    const { db, user, cookie } = await seedApple();
    fetchSpy.mockImplementation(async () => okResponse({ refresh_token: undefined }));
    const res = await exchange(cookie, { authorizationCode: "code-1" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ stored: false, reason: "NO_REFRESH_TOKEN" });
    const acc = await db.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(acc.refreshToken).toBeNull();
    expect(acc.accessToken).toBeNull();
  });

  it("#X6 user without an Apple Account -> NO_APPLE_ACCOUNT, no fetch", async () => {
    const { db, user, cookie } = await seedApple({ withAccount: false });
    await db.account.create({ data: { id: "acc-g", accountId: "g-sub", providerId: "google", userId: user.id } });
    const res = await exchange(cookie, { authorizationCode: "code-1" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ stored: false, reason: "NO_APPLE_ACCOUNT" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("#X7 APPLE_PRIVATE_KEY missing -> NOT_CONFIGURED, no fetch", async () => {
    const { cookie } = await seedApple();
    delete process.env.APPLE_PRIVATE_KEY;
    const res = await exchange(cookie, { authorizationCode: "code-1" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ stored: false, reason: "NOT_CONFIGURED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("#X8 invalid body ({} / empty code) -> 400 VALIDATION_ERROR (no fetch); unauthenticated -> 401", async () => {
    const { cookie } = await seedApple();
    for (const body of [{}, { authorizationCode: "" }]) {
      const res = await exchange(cookie, body);
      expect(res.status, `body=${JSON.stringify(body)}`).toBe(400);
      expectError(await json(res), "VALIDATION_ERROR");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    const unauth = await exchange(null, { authorizationCode: "code-1" });
    expect(unauth.status).toBe(401);
  });

  it("#X9 works before setup is complete", async () => {
    // seedApple's user has no school / department / default semester
    const { db, user, cookie } = await seedApple();
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.schoolId).toBeNull();
    const res = await exchange(cookie, { authorizationCode: "code-1" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ stored: true });
  });

  it("#X10 a second exchange overwrites the stored refresh token", async () => {
    const { db, user, cookie } = await seedApple();
    expect(await json(await exchange(cookie, { authorizationCode: "code-1" }))).toEqual({ stored: true });
    fetchSpy.mockImplementation(async () => okResponse({ refresh_token: "rt-2" }));
    expect(await json(await exchange(cookie, { authorizationCode: "code-2" }))).toEqual({ stored: true });
    const acc = await db.account.findFirstOrThrow({ where: { userId: user.id, providerId: "apple" } });
    expect(acc.refreshToken).toBe("rt-2");
  });

  it("#X12 failure logs never contain the code or client_secret", async () => {
    const { cookie } = await seedApple();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchSpy.mockImplementation(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    await exchange(cookie, { authorizationCode: "code-1" });
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("code-1");
    for (const c of calls()) {
      const secret = c.form.get("client_secret");
      expect(secret).toBeTruthy();
      expect(logged).not.toContain(secret!);
    }
  });

  it("#X13 routed to the dedicated handler, not the better-auth catch-all", async () => {
    const { cookie } = await seedApple();
    const res = await exchange(cookie, { authorizationCode: "code-1" });
    const body = (await json(res)) as Record<string, unknown>;
    expect(body).toHaveProperty("stored");
  });
});

describe("[B20 #U] pure functions", () => {
  it("#U1 decodeJwtSubject", () => {
    expect(decodeJwtSubject(jwt({ sub: "abc" }))).toBe("abc");
    expect(decodeJwtSubject("a.b")).toBeNull();
    expect(decodeJwtSubject(`${b64url({})}.${Buffer.from("not json").toString("base64url")}.sig`)).toBeNull();
    expect(decodeJwtSubject(jwt({ sub: 123 }))).toBeNull();
    expect(decodeJwtSubject(undefined)).toBeNull();
    expect(decodeJwtSubject(123)).toBeNull();
  });

  it("#U2 readAppleCredentialsConfig", () => {
    const base = { APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "P", APPLE_APP_BUNDLE_ID: "B" };
    expect(readAppleCredentialsConfig(base as NodeJS.ProcessEnv)).toEqual({
      teamId: "T",
      keyId: "K",
      privateKeyPem: "P",
      bundleId: "B",
      servicesId: null,
    });
    expect(readAppleCredentialsConfig({ ...base, APPLE_CLIENT_ID: "S" } as NodeJS.ProcessEnv)?.servicesId).toBe("S");
    for (const key of Object.keys(base)) {
      const missing = { ...base } as Record<string, string | undefined>;
      delete missing[key];
      expect(readAppleCredentialsConfig(missing as NodeJS.ProcessEnv)).toBeNull();
      expect(readAppleCredentialsConfig({ ...base, [key]: "" } as NodeJS.ProcessEnv)).toBeNull();
    }
  });

  it("#U3 collectRevocableTokens picks at most one token per row", async () => {
    const db = prisma();
    const mk = async (id: string, providerId: string, extra: Record<string, unknown>) => {
      const u = await createTestUser(db);
      await db.account.create({ data: { id, accountId: `sub-${id}`, providerId, userId: u.id, ...extra } });
      return u.id;
    };
    const g1 = await mk("a1", "google", { refreshToken: "r", accessToken: "a" });
    expect(await collectRevocableTokens(g1)).toEqual([{ provider: "google", token: "r", tokenTypeHint: "refresh_token" }]);
    const g2 = await mk("a2", "google", { refreshToken: null, accessToken: "a" });
    expect(await collectRevocableTokens(g2)).toEqual([{ provider: "google", token: "a", tokenTypeHint: "access_token" }]);
    const ap = await mk("a3", "apple", {});
    expect(await collectRevocableTokens(ap)).toEqual([]);
    const ml = await mk("a4", "magic-link", { refreshToken: "r", accessToken: "a" });
    expect(await collectRevocableTokens(ml)).toEqual([]);
    const g3 = await mk("a5", "google", { refreshToken: "", accessToken: "a" });
    expect(await collectRevocableTokens(g3)).toEqual([{ provider: "google", token: "a", tokenTypeHint: "access_token" }]);
  });

  it("#U4 revokeTokens: Apple with no config is skipped (no fetch), outcome ok=false clientId=null", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await revokeTokens([{ provider: "apple", token: "a-refresh", tokenTypeHint: "refresh_token" }], { apple: null });
    expect(out).toEqual([{ provider: "apple", clientId: null, ok: false, status: null }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("a-refresh");
  });

  it("#U5 revokeTokens never throws and reports status", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchSpy.mockImplementation(async () => new Response("", { status: 400 }));
    let out = await revokeTokens([{ provider: "google", token: "t", tokenTypeHint: "refresh_token" }]);
    expect(out).toEqual([expect.objectContaining({ provider: "google", ok: false, status: 400 })]);
    fetchSpy.mockRejectedValue(new Error("boom"));
    out = await revokeTokens([{ provider: "google", token: "t", tokenTypeHint: "refresh_token" }]);
    expect(out).toEqual([expect.objectContaining({ provider: "google", ok: false, status: null })]);
    fetchSpy.mockImplementation(async () => new Response("", { status: 200 }));
    out = await revokeTokens([{ provider: "google", token: "t", tokenTypeHint: "refresh_token" }]);
    expect(out).toEqual([expect.objectContaining({ provider: "google", ok: true, status: 200 })]);
  });

  it("timeouts are the documented 5000 ms", () => {
    expect(APPLE_HTTP_TIMEOUT_MS).toBe(5000);
    expect(REVOKE_TIMEOUT_MS).toBe(5000);
  });
});
