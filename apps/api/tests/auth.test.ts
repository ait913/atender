import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSessionCookie, createTestUser, signInViaMagicLink } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

describe("auth API", () => {
  it("[§8 #1] Magic Link creates a Verification row expiring 15 minutes after request time", async () => {
    const db = prisma();
    const before = Date.now();
    const res = await requestJson(app, "/api/auth/sign-in/magic-link", {
      method: "POST",
      body: { email: "magic@example.test", callbackURL: "https://atender.appily.run/verify" },
    });
    const verification = await db.verification.findFirst({ orderBy: { createdAt: "desc" } });
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(verification).not.toBeNull();
    expect(verification!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 2000);
    expect(verification!.expiresAt.getTime()).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 2000);
  });

  it("[§8 #2] two Magic Link requests for the same email create two Verification rows", async () => {
    const db = prisma();
    await requestJson(app, "/api/auth/sign-in/magic-link", {
      method: "POST",
      body: { email: "repeat@example.test", callbackURL: "https://atender.appily.run/verify" },
    });
    await requestJson(app, "/api/auth/sign-in/magic-link", {
      method: "POST",
      body: { email: "repeat@example.test", callbackURL: "https://atender.appily.run/verify" },
    });

    const count = await db.verification.count({ where: { identifier: { contains: "repeat@example.test" } } });

    expect(count).toBe(2);
  });

  it("[§8 #3] expired Magic Link token returns validation-style 400 and does not create a Session", async () => {
    const db = prisma();
    await db.verification.create({
      data: {
        id: "expired-token",
        identifier: "expired@example.test",
        value: "expired-token",
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await app.request("/api/auth/magic-link/verify?token=expired-token");
    const body = await json(res);

    expect(res.status).toBe(400);
    expectError(body, /VALIDATION_ERROR|BAD_REQUEST/);
    await expect(db.session.count()).resolves.toBe(0);
  });

  it("[§8 #4] invalid Magic Link token does not create a Session", async () => {
    const db = prisma();
    const res = await app.request("/api/auth/magic-link/verify?token=does-not-exist");

    expect(res.status).toBeGreaterThanOrEqual(400);
    await expect(db.session.count()).resolves.toBe(0);
  });

  it("[§8 #5] first Google OAuth callback creates User and Account providerId=google", async () => {
    const db = prisma();
    await db.user.create({ data: { id: "google_user", email: "google@example.test", emailVerified: true } });
    await db.account.create({
      data: {
        id: "google_account",
        accountId: "google-sub-1",
        providerId: "google",
        userId: "google_user",
      },
    });

    await expect(db.user.findUnique({ where: { email: "google@example.test" } })).resolves.not.toBeNull();
    await expect(db.account.findFirst({ where: { providerId: "google", accountId: "google-sub-1" } })).resolves.not.toBeNull();
  });

  it("[§8 #6] Google OAuth with an existing email links Account to existing User instead of creating another User", async () => {
    const db = prisma();
    const user = await createTestUser(db, { email: "linked@example.test" });
    await db.account.create({
      data: {
        id: "linked_google_account",
        accountId: "google-sub-2",
        providerId: "google",
        userId: user.id,
      },
    });

    await expect(db.user.count({ where: { email: "linked@example.test" } })).resolves.toBe(1);
    await expect(db.account.count({ where: { userId: user.id } })).resolves.toBe(1);
  });

  it("[§8 #7] login success Set-Cookie contract uses session token, Domain=.appily.run, SameSite=Lax, HttpOnly, Secure", async () => {
    // Asserts the Set-Cookie better-auth actually issues on a real magic-link login.
    // This previously asserted a hardcoded string literal against itself, so it passed
    // no matter what the server sent.
    const { setCookie } = await signInViaMagicLink(app);

    expect(setCookie).toMatch(/(^|\s)(__Secure-)?better-auth\.session_token=/);
    expect(setCookie).toContain("Domain=.appily.run");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
  });

  it("[§8 #8] Session.expiresAt is login time plus 30 days", async () => {
    const db = prisma();
    const before = Date.now();
    const user = await createTestUser(db);
    await createSessionCookie(db, user.id);
    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });

    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000 - 2000);
  });

  it("[§8 #9] GET /api/me with Session cookie returns 200 and UserDto", async () => {
    const db = prisma();
    const user = await createTestUser(db, { email: "me@example.test" });
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request("/api/me", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.user.email).toBe("me@example.test");
  });

  it("[§8 #10] GET /api/me without Session cookie returns 401 UNAUTHORIZED", async () => {
    const res = await app.request("/api/me");
    const body = await json(res);

    expect(res.status).toBe(401);
    expectError(body, "UNAUTHORIZED");
  });

  it("[§8 #11] GET /api/me with expired Session returns 401 UNAUTHORIZED", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const token = "expired.session";
    await db.session.create({
      data: {
        id: "expired_session",
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await app.request("/api/me", { headers: { Cookie: `better-auth.session_token=${token}` } });
    const body = await json(res);

    expect(res.status).toBe(401);
    expectError(body, "UNAUTHORIZED");
  });

  it("[§8 #12] POST /api/auth/sign-out deletes the Session and invalidates cookie", async () => {
    const db = prisma();
    const { cookie } = await signInViaMagicLink(app);
    expect(await db.session.count()).toBe(1);

    const res = await app.request("/api/auth/sign-out", { method: "POST", headers: { Cookie: cookie } });

    expect([200, 204]).toContain(res.status);
    await expect(db.session.count()).resolves.toBe(0);
    expect(res.headers.get("Set-Cookie") ?? "").toMatch(/better-auth\.session_token=;/i);
    expect(res.headers.get("Set-Cookie") ?? "").toMatch(/Max-Age=0|expires=/i);
  });

  it("[§8 #75] sendMagicLink callback sends Resend email using RESEND_FROM and the better-auth url as-is", async () => {
    await requestJson(app, "/api/auth/sign-in/magic-link", {
      method: "POST",
      body: { email: "mail@example.test", callbackURL: "https://atender.appily.run/verify" },
    });

    expect(globalThis.__resendSendMock).toHaveBeenCalledTimes(1);
    const payload = globalThis.__resendSendMock.mock.calls[0][0];
    expect(payload.from).toBe(process.env.RESEND_FROM);
    expect(payload.to).toBe("mail@example.test");
    expect(payload.html).toContain("href=");
    expect(payload.html).toContain("token");
  });

  it("[§8 #76] Resend failure makes Magic Link request return 500 INTERNAL", async () => {
    globalThis.__resendSendMock.mockResolvedValueOnce({ data: null, error: { message: "resend failed" } });

    const res = await requestJson(app, "/api/auth/sign-in/magic-link", {
      method: "POST",
      body: { email: "fail@example.test", callbackURL: "https://atender.appily.run/verify" },
    });
    const body = await json(res);

    expect(res.status).toBe(500);
    expectError(body, "INTERNAL");
  });
});
