import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./helpers/app";
import { aisMailCalls, aisMailOk, aisMailResponse, lastAisMailCall } from "./helpers/mail";
import { signInViaMagicLink } from "./helpers/auth";
import { sendMail, MailSendError } from "../src/lib/mail";
import { MAGIC_LINK_SEND_FAILED_MESSAGE } from "../src/auth";
import { EnvSchema } from "../src/env";

const TOKEN = process.env.AIS_MAIL_TOKEN!;
const MAIL_URL = process.env.AIS_MAIL_URL!;
const SEND_URL = `${MAIL_URL}/api/v1/send`;
const API_ROOT = path.resolve(__dirname, "..");

const MSG = { to: "a@example.test", subject: "s", text: "t", html: "<p>h</p>" };
const mock = () => globalThis.__aisMailFetchMock;

afterEach(() => {
  vi.restoreAllMocks();
});

async function rejection(p: Promise<unknown>): Promise<MailSendError> {
  try {
    await p;
  } catch (e) {
    return e as MailSendError;
  }
  throw new Error("expected sendMail to reject");
}

describe("sendMail (MS)", () => {
  it("[MS1] resolves {id,status} with one call", async () => {
    await expect(sendMail(MSG)).resolves.toEqual({ id: "test-mail-id", status: "sent" });
    expect(mock()).toHaveBeenCalledTimes(1);
  });

  it("[MS2] url and method", async () => {
    await sendMail(MSG);
    const c = lastAisMailCall()!;
    expect(c.url).toBe(SEND_URL);
    expect(c.init.method).toBe("POST");
  });

  it("[MS3] headers", async () => {
    await sendMail(MSG);
    const h = lastAisMailCall()!.headers;
    expect(h.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(h.get("Content-Type")).toBe("application/json");
  });

  it("[MS4] body key set is exactly to/subject/text/html", async () => {
    await sendMail(MSG);
    const b = lastAisMailCall()!.body;
    expect(Object.keys(b).sort()).toEqual(["html", "subject", "text", "to"]);
    expect(b).toEqual(MSG);
    expect(b).not.toHaveProperty("from");
    expect(b).not.toHaveProperty("reply_to");
    expect(b).not.toHaveProperty("idempotency_key");
  });

  it("[MS5] idempotencyKey goes into idempotency_key", async () => {
    await sendMail({ ...MSG, idempotencyKey: "k-1" });
    const b = lastAisMailCall()!.body;
    expect(Object.keys(b).sort()).toEqual(["html", "idempotency_key", "subject", "text", "to"]);
    expect(b.idempotency_key).toBe("k-1");
  });

  it("[MS6] to is not normalized", async () => {
    const to = "Mail.User+tag@Example.Test ";
    await sendMail({ ...MSG, to });
    expect(lastAisMailCall()!.body.to).toBe(to);
  });

  // The setup mock only intercepts AIS_MAIL_URL-prefixed requests, so a different baseUrl needs its own stub.
  it("[MS7] baseUrl trailing slash removed, custom token used", async () => {
    const f = vi.fn(async () => aisMailOk());
    const setupFetch = globalThis.fetch;
    vi.stubGlobal("fetch", f);
    try {
      const token = `aism_svc_other00000.${"B".repeat(43)}`;
      await sendMail(MSG, { baseUrl: "https://m.example.test/", token });
      const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://m.example.test/api/v1/send");
      expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${token}`);
    } finally {
      vi.stubGlobal("fetch", setupFetch);
    }
  });

  it("[MS8] multiple trailing slashes removed", async () => {
    const f = vi.fn(async () => aisMailOk());
    const setupFetch = globalThis.fetch;
    vi.stubGlobal("fetch", f);
    try {
      await sendMail(MSG, { baseUrl: "https://m.example.test///" });
      expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://m.example.test/api/v1/send");
    } finally {
      vi.stubGlobal("fetch", setupFetch);
    }
  });

  it("[MS9] queued", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(202, { id: "x", status: "queued" }));
    await expect(sendMail(MSG)).resolves.toEqual({ id: "x", status: "queued" });
  });

  it("[MS10] sending", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(202, { id: "x", status: "sending" }));
    await expect(sendMail(MSG)).resolves.toEqual({ id: "x", status: "sending" });
  });

  it("[MS11] duplicate key dropped", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(200, { id: "x", status: "sent", duplicate: true }));
    const r = await sendMail(MSG);
    expect(r).toEqual({ id: "x", status: "sent" });
    expect(r).not.toHaveProperty("duplicate");
  });

  it("[MS12] failed status -> send_failed", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(202, { id: "x", status: "failed" }));
    const e = await rejection(sendMail(MSG));
    expect(e).toBeInstanceOf(MailSendError);
    expect(e.code).toBe("send_failed");
    expect(e.status).toBe(202);
  });

  it.each([
    ["not json"],
    ["{}"],
    [JSON.stringify({ id: "", status: "sent" })],
    [JSON.stringify({ id: "x", status: "done" })],
  ])("[MS13] invalid 202 body %s -> invalid_response", async (body) => {
    mock().mockResolvedValueOnce(aisMailResponse(202, body));
    const e = await rejection(sendMail(MSG));
    expect(e.code).toBe("invalid_response");
    expect(e.status).toBe(202);
  });

  it("[MS14] 201 -> invalid_response", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(201, { id: "x", status: "sent" }));
    const e = await rejection(sendMail(MSG));
    expect(e.code).toBe("invalid_response");
    expect(e.status).toBe(201);
  });

  it("[MS15] 401 unauthorized", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(401, { error: { code: "unauthorized", message: "no" } }));
    const e = await rejection(sendMail(MSG));
    expect(e.code).toBe("unauthorized");
    expect(e.status).toBe(401);
  });

  it("[MS16] 403 service_disabled", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(403, { error: { code: "service_disabled" } }));
    const e = await rejection(sendMail(MSG));
    expect(e.code).toBe("service_disabled");
    expect(e.status).toBe(403);
  });

  it("[MS17] 429 rate_limited, no retry", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(429, { error: { code: "rate_limited" } }, { "Retry-After": "30" }));
    const e = await rejection(sendMail(MSG));
    expect(e.code).toBe("rate_limited");
    expect(e.status).toBe(429);
    expect(mock()).toHaveBeenCalledTimes(1);
  });

  it("[MS18] invalid_address message does not leak details", async () => {
    mock().mockResolvedValueOnce(
      aisMailResponse(400, {
        error: { code: "invalid_address", message: "bad a@example.test", details: { to: ["a@example.test"] } },
      }),
    );
    const e = await rejection(sendMail(MSG));
    expect(e.code).toBe("invalid_address");
    expect(e.status).toBe(400);
    expect(e.message).not.toContain("a@example.test");
  });

  it("[MS19] 500 non-JSON -> http_error", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(500, "oops"));
    const e = await rejection(sendMail(MSG));
    expect(e.code).toBe("http_error");
    expect(e.status).toBe(500);
  });

  it("[MS20] 502 with non-matching code -> http_error", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(502, { error: { code: "Bad Code!" } }));
    const e = await rejection(sendMail(MSG));
    expect(e.code).toBe("http_error");
    expect(e.status).toBe(502);
  });

  it("[MS21] fetch reject -> network_error", async () => {
    mock().mockRejectedValueOnce(new TypeError("fetch failed"));
    const e = await rejection(sendMail(MSG));
    expect(e.code).toBe("network_error");
    expect(e.status).toBeNull();
  });

  it("[MS22] timeout", async () => {
    mock().mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const started = Date.now();
    const e = await rejection(sendMail(MSG, { timeoutMs: 50 }));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(e.code).toBe("timeout");
    expect(e.status).toBeNull();
  });

  it("[MS23] init.signal is an AbortSignal", async () => {
    await sendMail(MSG);
    expect(lastAisMailCall()!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("[MS24] errors are MailSendError and leak nothing", async () => {
    const msg = { to: "secret.person@example.test", subject: "SUBJ-UNIQUE-123", text: "t", html: "<p>HTML-UNIQUE-456</p>" };
    const setups: Array<() => void> = [
      () => mock().mockResolvedValueOnce(aisMailResponse(202, { id: "x", status: "failed" })),
      () => mock().mockResolvedValueOnce(aisMailResponse(202, "not json")),
      () => mock().mockResolvedValueOnce(aisMailResponse(201, { id: "x", status: "sent" })),
      () => mock().mockResolvedValueOnce(aisMailResponse(401, { error: { code: "unauthorized", message: `x ${TOKEN} ${msg.to}` } })),
      () => mock().mockResolvedValueOnce(aisMailResponse(403, { error: { code: "service_disabled" } })),
      () => mock().mockResolvedValueOnce(aisMailResponse(429, { error: { code: "rate_limited" } }, { "Retry-After": "30" })),
      () =>
        mock().mockResolvedValueOnce(
          aisMailResponse(400, { error: { code: "invalid_address", message: msg.to, details: { to: [msg.to] } } }),
        ),
      () => mock().mockResolvedValueOnce(aisMailResponse(500, "oops")),
      () => mock().mockResolvedValueOnce(aisMailResponse(502, { error: { code: "Bad Code!" } })),
      () => mock().mockRejectedValueOnce(new TypeError("fetch failed")),
    ];
    for (const setup of setups) {
      setup();
      const e = await rejection(sendMail(msg));
      expect(e).toBeInstanceOf(MailSendError);
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe("MailSendError");
      for (const secret of [TOKEN, msg.to, msg.subject, msg.html]) expect(e.message).not.toContain(secret);
    }
    // timeout
    mock().mockImplementationOnce(
      (_u, init) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(init.signal!.reason))),
    );
    const t = await rejection(sendMail(msg, { timeoutMs: 20 }));
    expect(t).toBeInstanceOf(MailSendError);
    for (const secret of [TOKEN, msg.to, msg.subject, msg.html]) expect(t.message).not.toContain(secret);
  });

  it("[MS25] defaults from env", async () => {
    await sendMail(MSG);
    const c = lastAisMailCall()!;
    expect(c.url.startsWith(MAIL_URL)).toBe(true);
    expect(c.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });
});

async function signIn(email: string) {
  return app.request("/api/auth/sign-in/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, callbackURL: "https://atender.appily.run/verify" }),
  });
}

const FAIL_BODY = { error: { code: "MAIL_SEND_FAILED", message: MAGIC_LINK_SEND_FAILED_MESSAGE } };

async function expectMailFailed(res: Response) {
  expect(res.status).toBe(500);
  expect(res.headers.get("Content-Type") ?? "").toMatch(/^application\/json/);
  expect(await res.json()).toEqual(FAIL_BODY);
}

function hrefOf(html: string) {
  return /href="([^"]*\/api\/auth\/magic-link\/verify\?token=[^"]+)"/.exec(html)?.[1];
}

describe("Magic Link sign-in (ML)", () => {
  it("[ML1] 200 {status:true}, one call to SEND_URL", async () => {
    const res = await signIn("mail@example.test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: true });
    expect(aisMailCalls()).toHaveLength(1);
    expect(aisMailCalls()[0].url).toBe(SEND_URL);
  });

  it("[ML2] headers", async () => {
    await signIn("mail@example.test");
    const h = lastAisMailCall()!.headers;
    expect(h.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(h.get("Content-Type")).toBe("application/json");
  });

  it("[ML3] body", async () => {
    await signIn("mail@example.test");
    const b = lastAisMailCall()!.body;
    expect(b.to).toBe("mail@example.test");
    expect(b.subject).toBe("Atender にログインする");
    expect(Object.keys(b).sort()).toEqual(["html", "subject", "text", "to"]);
  });

  it("[ML4] to preserved verbatim", async () => {
    await signIn("Mixed.Case+tag@Example.Test");
    expect(lastAisMailCall()!.body.to).toBe("Mixed.Case+tag@Example.Test");
  });

  it("[ML5] html has verify link", async () => {
    await signIn("mail@example.test");
    const href = hrefOf(lastAisMailCall()!.body.html as string);
    expect(href).toBeTruthy();
    expect(href!.startsWith(`${process.env.BETTER_AUTH_URL}/api/auth/magic-link/verify?token=`)).toBe(true);
    expect(href).toContain("callbackURL=");
  });

  it("[ML6] html/text wording", async () => {
    await signIn("mail@example.test");
    const { html, text } = lastAisMailCall()!.body as { html: string; text: string };
    expect(html).toContain("ログインリンクが届いています");
    expect(html).toContain("15 分");
    expect(html).toContain("ログインする");
    expect(text.startsWith("Atender にログインする\n\n下記のリンクを開くとログインできます (有効期限 15 分):\n")).toBe(true);
    const url = hrefOf(html)!.replace(/&amp;/g, "&");
    expect(text).toContain(url);
  });

  it("[ML7] extracted URL logs in", async () => {
    const r = await signInViaMagicLink(app, "ml7@example.test");
    expect(r.setCookie).toContain("session_token=");
  });

  it("[ML8] two requests -> two calls, distinct tokens, no idempotency_key", async () => {
    await signIn("twice@example.test");
    await signIn("twice@example.test");
    const calls = aisMailCalls();
    expect(calls).toHaveLength(2);
    const tokens = calls.map((c) => new URL(hrefOf(c.body.html as string)!.replace(/&amp;/g, "&")).searchParams.get("token"));
    expect(tokens[0]).toBeTruthy();
    expect(tokens[0]).not.toBe(tokens[1]);
    for (const c of calls) expect(c.body).not.toHaveProperty("idempotency_key");
  });

  it("[ML9] queued is success", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(202, { id: "x", status: "queued" }));
    const res = await signIn("q@example.test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: true });
  });

  it("[ML10] sending is success", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(202, { id: "x", status: "sending" }));
    const res = await signIn("s@example.test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: true });
  });

  it("[ML11] 401 -> 500 MAIL_SEND_FAILED envelope", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(401, { error: { code: "unauthorized" } }));
    await expectMailFailed(await signIn("f@example.test"));
  });

  it("[ML12] 429 -> 500, one call", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(429, { error: { code: "rate_limited" } }, { "Retry-After": "30" }));
    await expectMailFailed(await signIn("f@example.test"));
    expect(aisMailCalls()).toHaveLength(1);
  });

  it.each([
    [403, { error: { code: "service_disabled" } }],
    [400, { error: { code: "invalid_address" } }],
    [500, { error: { code: "internal" } }],
    [502, "bad gateway"],
  ])("[ML13] status %s -> same envelope", async (status, body) => {
    mock().mockResolvedValueOnce(aisMailResponse(status as number, body));
    await expectMailFailed(await signIn("f@example.test"));
  });

  it("[ML14] 202 failed -> same envelope", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(202, { id: "x", status: "failed" }));
    await expectMailFailed(await signIn("f@example.test"));
  });

  it("[ML15] network error -> same envelope", async () => {
    mock().mockRejectedValueOnce(new TypeError("fetch failed"));
    await expectMailFailed(await signIn("f@example.test"));
  });

  it.each([
    ["ML11", () => mock().mockResolvedValueOnce(aisMailResponse(401, { error: { code: "unauthorized" } })), { code: "unauthorized", status: 401 }],
    ["ML15", () => mock().mockRejectedValueOnce(new TypeError("fetch failed")), { code: "network_error", status: null }],
  ])("[ML16] logs for %s contain no PII/secrets", async (_n, setup, expected) => {
    const email = "pii.person@example.test";
    const spies = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
    for (const s of spies) s.mockImplementation(() => {});
    setup();
    await signIn(email);
    const all = spies.flatMap((s) => s.mock.calls);
    for (const args of all) {
      for (const a of args) {
        for (const text of [safeJson(a), String(a)]) {
          expect(text).not.toContain(email);
          expect(text).not.toContain(TOKEN);
          expect(text).not.toContain("token=");
        }
      }
    }
    const hit = spies[0].mock.calls.find((a) => a[0] === "[mail] magic link send failed");
    expect(hit).toBeTruthy();
    expect(hit![1]).toEqual(expected);
  });

  it("[ML17] failure does not persist into the next request", async () => {
    mock().mockResolvedValueOnce(aisMailResponse(401, { error: { code: "unauthorized" } }));
    await expectMailFailed(await signIn("again@example.test"));
    mock().mockImplementation(async () => aisMailOk());
    const res = await signIn("again@example.test");
    expect(res.status).toBe(200);
  });
});

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
}

describe("env (EV)", () => {
  const base = (): Record<string, unknown> => {
    const o: Record<string, unknown> = { ...process.env, AIS_MAIL_TOKEN: TOKEN };
    delete o.AIS_MAIL_URL;
    delete o.RESEND_API_KEY;
    delete o.RESEND_FROM;
    return o;
  };

  it("[EV1] defaults", () => {
    const r = EnvSchema.safeParse(base());
    expect(r.success).toBe(true);
    expect(r.success && r.data.AIS_MAIL_URL).toBe("https://mail.aisaba.net");
  });
  it("[EV2] empty URL -> default", () => {
    const r = EnvSchema.safeParse({ ...base(), AIS_MAIL_URL: "" });
    expect(r.success && r.data.AIS_MAIL_URL).toBe("https://mail.aisaba.net");
  });
  it("[EV3] custom URL", () => {
    const r = EnvSchema.safeParse({ ...base(), AIS_MAIL_URL: "https://mail.example.test" });
    expect(r.success && r.data.AIS_MAIL_URL).toBe("https://mail.example.test");
  });
  it("[EV4] bad URL", () => {
    expect(EnvSchema.safeParse({ ...base(), AIS_MAIL_URL: "not a url" }).success).toBe(false);
  });
  it("[EV5] missing / empty token", () => {
    const b = base();
    delete b.AIS_MAIL_TOKEN;
    expect(EnvSchema.safeParse(b).success).toBe(false);
    expect(EnvSchema.safeParse({ ...base(), AIS_MAIL_TOKEN: "" }).success).toBe(false);
  });
  it.each([
    ["re_xxx", "re_xxx"],
    ["quoted", `"${TOKEN}"`],
    ["tail 42", TOKEN.slice(0, -1)],
    ["head 9", `aism_svc_test00000.${TOKEN.split(".")[1]}`],
  ])("[EV6] malformed token (%s)", (_n, tok) => {
    expect(EnvSchema.safeParse({ ...base(), AIS_MAIL_TOKEN: tok }).success).toBe(false);
  });
  it("[EV7] trimmed", () => {
    const r = EnvSchema.safeParse({ ...base(), AIS_MAIL_TOKEN: ` ${TOKEN}\n` });
    expect(r.success).toBe(true);
    expect(r.success && r.data.AIS_MAIL_TOKEN).toBe(TOKEN);
  });
  it("[EV8] legacy RESEND_* tolerated and stripped", () => {
    const r = EnvSchema.safeParse({ ...base(), RESEND_API_KEY: "re_x", RESEND_FROM: "A <a@b.test>" });
    expect(r.success).toBe(true);
    expect(r.success && Object.keys(r.data)).not.toContain("RESEND_API_KEY");
  });
});

describe("removal (RM)", () => {
  it("[RM1] resend not in package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(API_ROOT, "package.json"), "utf8"));
    expect(pkg.dependencies ?? {}).not.toHaveProperty("resend");
    expect(pkg.devDependencies ?? {}).not.toHaveProperty("resend");
  });
  it("[RM2] no resend / RESEND_ in src", () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
      });
    const files = walk(path.join(API_ROOT, "src"));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const t = fs.readFileSync(f, "utf8");
      expect(/resend/i.test(t), f).toBe(false);
      expect(t.includes("RESEND_"), f).toBe(false);
    }
  });
  it("[RM3] env files", () => {
    for (const f of [".env.example", ".env.test"]) {
      const t = fs.readFileSync(path.join(API_ROOT, f), "utf8");
      expect(t, f).not.toContain("RESEND_");
      expect(t, f).toContain("AIS_MAIL_TOKEN=");
    }
  });
});
