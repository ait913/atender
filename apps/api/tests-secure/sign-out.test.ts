import { describe, expect, it } from "vitest";
import { app, prisma } from "../tests/helpers/app";
import { signInViaMagicLink } from "../tests/helpers/auth";
import { json } from "../tests/helpers/http";

/**
 * Production-shaped sign-out regression tests.
 *
 * These run under vitest.secure-cookie.config.ts, which boots the app with an https
 * BETTER_AUTH_URL. That is the only difference from the default suite, and it is the
 * difference that matters: with an https baseURL better-auth prefixes its cookies with
 * `__Secure-`, exactly as production does (observed live on atender-api.appily.run:
 * `__Secure-better-auth.state=...; Domain=.appily.run`).
 *
 * The default suite runs with an http baseURL, so cookies are unprefixed there. A
 * sign-out implementation that hardcodes the unprefixed name passes the default suite
 * and still fails in production. That blindness shipped a bug where logging out did
 * nothing: the browser cookie was never cleared and the Session row was never deleted.
 */
describe("sign-out under production-like secure cookies", () => {
  it("[guard] login issues a __Secure- prefixed, domain-scoped session cookie (as production does)", async () => {
    const { setCookie } = await signInViaMagicLink(app);

    // If this guard fails the rest of this file proves nothing, because the whole point
    // is to exercise the production cookie shape rather than the dev one.
    expect(setCookie).toContain("__Secure-better-auth.session_token=");
    expect(setCookie).toContain("Domain=.appily.run");
  });

  it("[regression] sign-out deletes the Session row for a production-shaped session cookie", async () => {
    const db = prisma();
    const { cookie } = await signInViaMagicLink(app);
    expect(await db.session.count()).toBe(1);

    const res = await app.request("/api/auth/sign-out", { method: "POST", headers: { Cookie: cookie } });

    // Asserted before the status code on purpose: this is the security-critical fact,
    // and checking it first keeps a status-code mismatch from masking a surviving session.
    // If the session survives, "logout" leaves a credential valid for 30 days for
    // anyone holding the cookie.
    expect(await db.session.count()).toBe(0);
    expect(res.status).toBe(200);
  });

  it("[regression] sign-out expires the same cookie name and Domain that login set", async () => {
    const { cookie } = await signInViaMagicLink(app);

    const res = await app.request("/api/auth/sign-out", { method: "POST", headers: { Cookie: cookie } });
    const setCookie = res.headers.get("Set-Cookie") ?? "";

    // RFC 6265 identifies a cookie by (name, domain, path). An expiry that differs in
    // name or domain from the cookie that was set deletes nothing.
    expect(setCookie).toContain("__Secure-better-auth.session_token=;");
    expect(setCookie).toContain("Domain=.appily.run");
    expect(setCookie).toMatch(/Max-Age=0|expires=/i);
  });

  it("[regression] the session cookie is rejected after sign-out (no redirect back into the app)", async () => {
    const { cookie } = await signInViaMagicLink(app);
    expect((await app.request("/api/me", { headers: { Cookie: cookie } })).status).toBe(200);

    await app.request("/api/auth/sign-out", { method: "POST", headers: { Cookie: cookie } });

    // This is the user-visible symptom: while /api/me still answered 200, the web app's
    // /signin beforeLoad guard bounced the user straight back to /.
    const me = await app.request("/api/me", { headers: { Cookie: cookie } });
    expect(me.status).toBe(401);
  });
});
