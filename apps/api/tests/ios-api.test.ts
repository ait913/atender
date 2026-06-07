import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSessionCookie, setupCompleteUser } from "./helpers/auth";
import { json } from "./helpers/http";

// Tests derived solely from design doc 20260608-ios-foundation.md section 8 (API premise).
// No implementation source read. status-centric assertions; error.code not strict-asserted.

async function createSessionWithToken(userId: string) {
  const db = prisma();
  const token = randomBytes(24).toString("hex") + "." + randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: "session_" + randomUUID(),
      userId,
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: "127.0.0.1",
      userAgent: "vitest-bearer",
    },
  });
  return { token, cookie: "better-auth.session_token=" + token };
}

describe("8.1 better-auth bearer plugin", () => {
  it("[8.1] GET /api/me with Authorization Bearer valid session token returns 200", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const { token } = await createSessionWithToken(complete.user.id);

    const res = await app.request("/api/me", {
      headers: { Authorization: "Bearer " + token },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body as any)?.user?.id).toBe(complete.user.id);
  });

  it("[8.1] GET /api/me with a bogus Bearer token returns 401", async () => {
    const res = await app.request("/api/me", {
      headers: { Authorization: "Bearer not-a-real-token-deadbeef" },
    });
    expect(res.status).toBe(401);
  });

  it("[8.1] GET /api/me with a malformed Bearer token returns 401", async () => {
    const res = await app.request("/api/me", {
      headers: { Authorization: "Bearer ......" },
    });
    expect(res.status).toBe(401);
  });

  it("[8.1] Cookie session auth still returns 200 on GET /api/me (no regression)", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const res = await app.request("/api/me", {
      headers: { Cookie: complete.cookie },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body as any)?.user?.id).toBe(complete.user.id);
  });

  it("[8.1] sign-in response path does not 5xx (set-auth-token plugin path)", async () => {
    const res = await app.request("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://atender.appily.run" },
      body: JSON.stringify({
        email: "bearer-header@example.test",
        callbackURL: "https://atender.appily.run/verify",
      }),
    });
    expect(res.status).toBeLessThan(500);
  });
});

describe("8.4 Google native token relay GET /api/auth/native/callback", () => {
  it("[8.4] valid session cookie returns 302 to atender://auth#token matching DB Session.token", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);
    const { token, cookie } = await createSessionWithToken(user.user.id);

    const res = await app.request("/api/auth/native/callback?next=atender://auth", {
      headers: { Cookie: cookie },
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toMatch(/^atender:\/\/auth#token=/);
    const relayedToken = location.split("#token=")[1] ?? "";
    expect(decodeURIComponent(relayedToken)).toBe(token);

    const session = await db.session.findFirst({ where: { token } });
    expect(session).not.toBeNull();
  });

  it("[8.4] no session returns 401", async () => {
    const res = await app.request("/api/auth/native/callback?next=atender://auth", {
      redirect: "manual",
    });
    expect(res.status).toBe(401);
  });

  it("[8.4] next outside trustedOrigins returns 400", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);
    const { cookie } = await createSessionWithToken(user.user.id);

    const res = await app.request("/api/auth/native/callback?next=https://evil.com", {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(res.status).toBe(400);
  });

  it("[8.4] next omitted defaults to atender://auth", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);
    const { token, cookie } = await createSessionWithToken(user.user.id);

    const res = await app.request("/api/auth/native/callback", {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toMatch(/^atender:\/\/auth#token=/);
    const relayedToken = decodeURIComponent(location.split("#token=")[1] ?? "");
    expect(relayedToken).toBe(token);
  });
});

describe("8.5 MeResponseDto shape", () => {
  it("[8.5] GET /api/me (cookie) returns user + setupStatus, parseable", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const res = await app.request("/api/me", { headers: { Cookie: complete.cookie } });
    expect(res.status).toBe(200);
    const body = (await json(res)) as any;
    expect(body).toBeTypeOf("object");
    expect(body.user).toBeTypeOf("object");
    expect(typeof body.user.id).toBe("string");
    expect(body.setupStatus).toBeTypeOf("object");
    for (const key of ["hasSchool", "hasDepartment", "hasSemester", "hasUserTimetable", "isComplete"]) {
      expect(typeof body.setupStatus[key]).toBe("boolean");
    }
  });
});

describe("8.3 trustedOrigins includes native scheme", () => {
  it("[8.3] sign-in/social callbackURL atender://auth not rejected as untrusted", async () => {
    const res = await app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://atender.appily.run" },
      body: JSON.stringify({ provider: "google", callbackURL: "atender://auth" }),
    });
    const body = await json(res).catch(() => null);
    const msg = JSON.stringify(body ?? "").toLowerCase();
    const looksLikeOriginError = /(trusted|origin|callback|redirect)/.test(msg);
    const untrusted = res.status === 403 ? true : (res.status === 400 ? looksLikeOriginError : false);
    expect(untrusted).toBe(false);
  });
});

describe("8.2 Apple social provider configuration", () => {
  it("[8.2] app boots and /api/me works without Apple env set (no crash)", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const cookie = await createSessionCookie(db, complete.user.id);
    const res = await app.request("/api/me", { headers: { Cookie: cookie } });
    expect(res.status).toBeLessThan(500);
  });
});
