import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

describe("personal events API", () => {
  it("[#15] POST all-day personal event stores null startMinute and endMinute", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", title: "バイト", isAllDay: true },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.event).toMatchObject({ date: "2026-05-13", title: "バイト", isAllDay: true });
    expect(body.event.startMinute).toBeNull();
    expect(body.event.endMinute).toBeNull();
  });

  it("[#16] POST timed personal event stores startMinute and endMinute", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", title: "面談", isAllDay: false, startMinute: 540, endMinute: 630 },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.event).toMatchObject({ isAllDay: false, startMinute: 540, endMinute: 630 });
  });

  it("[#17] POST timed personal event without start/end returns 400 VALIDATION_ERROR", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", title: "面談", isAllDay: false },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(JSON.stringify(body)).toContain("time range required when not all-day");
  });

  it("[#18] POST timed personal event with startMinute after endMinute returns 400", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", title: "面談", isAllDay: false, startMinute: 700, endMinute: 600 },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(JSON.stringify(body)).toContain("ZodError");
  });

  it("[#19] GET /api/personal-events?from&to returns only range matches in date asc order", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    for (const [date, title] of [
      ["2026-05-20", "範囲内2"],
      ["2026-05-10", "範囲外"],
      ["2026-05-13", "範囲内1"],
    ]) {
      await requestJson(app, "/api/personal-events", {
        method: "POST",
        headers: { Cookie: complete.cookie },
        body: { date, title, isAllDay: true },
      });
    }

    const res = await app.request("/api/personal-events?from=2026-05-11&to=2026-05-31", {
      headers: { Cookie: complete.cookie },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.events.map((e: { date: string; title: string }) => [e.date, e.title])).toEqual([
      ["2026-05-13", "範囲内1"],
      ["2026-05-20", "範囲内2"],
    ]);
  });

  it("[#20] GET /api/personal-events?semesterId filters by semesterId", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", title: "学期あり", semesterId: complete.semester.id, isAllDay: true },
    });
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-14", title: "学期なし", isAllDay: true },
    });

    const res = await app.request(`/api/personal-events?from=2026-05-01&to=2026-05-31&semesterId=${complete.semester.id}`, {
      headers: { Cookie: complete.cookie },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.events.map((e: { title: string }) => e.title)).toEqual(["学期あり"]);
  });

  it("[#21] PATCH supports partial updates and clears time when isAllDay becomes true", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const createRes = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", title: "old", isAllDay: true },
    });
    const created = (await json(createRes)).event;

    const patchRes = await requestJson(app, `/api/personal-events/${created.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { title: "new" },
    });
    const patched = await json(patchRes);

    expect(patchRes.status).toBe(200);
    expect(patched.event).toMatchObject({ id: created.id, title: "new", date: "2026-05-13" });

    const timedRes = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-14", title: "timed", isAllDay: false, startMinute: 540, endMinute: 630 },
    });
    const timed = (await json(timedRes)).event;
    const allDayRes = await requestJson(app, `/api/personal-events/${timed.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { isAllDay: true },
    });
    const allDay = await json(allDayRes);

    expect(allDayRes.status).toBe(200);
    expect(allDay.event.isAllDay).toBe(true);
    expect(allDay.event.startMinute).toBeNull();
    expect(allDay.event.endMinute).toBeNull();
  });

  it("[#22] PATCH and DELETE another user's event return 404", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const other = await setupCompleteUser(db);
    const createRes = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: owner.cookie },
      body: { date: "2026-05-13", title: "owner", isAllDay: true },
    });
    const event = (await json(createRes)).event;

    const patchRes = await requestJson(app, `/api/personal-events/${event.id}`, {
      method: "PATCH",
      headers: { Cookie: other.cookie },
      body: { title: "hijack" },
    });
    const deleteRes = await app.request(`/api/personal-events/${event.id}`, {
      method: "DELETE",
      headers: { Cookie: other.cookie },
    });

    expect(patchRes.status).toBe(404);
    expectError(await json(patchRes), "NOT_FOUND");
    expect(deleteRes.status).toBe(404);
    expectError(await json(deleteRes), "NOT_FOUND");
  });

  it("[#23] DELETE removes the personal event from subsequent GET results", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const createRes = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", title: "削除対象", isAllDay: true },
    });
    const event = (await json(createRes)).event;

    const deleteRes = await app.request(`/api/personal-events/${event.id}`, {
      method: "DELETE",
      headers: { Cookie: complete.cookie },
    });
    const deleteBody = await json(deleteRes);
    const getRes = await app.request("/api/personal-events?from=2026-05-01&to=2026-05-31", {
      headers: { Cookie: complete.cookie },
    });
    const getBody = await json(getRes);

    expect(deleteRes.status).toBe(200);
    expect(deleteBody).toEqual({ ok: true });
    expect(getBody.events.map((e: { id: string }) => e.id)).not.toContain(event.id);
  });

  it("[schema] title is required/max 100 and color must be #RRGGBB", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    for (const body of [
      { date: "2026-05-13", isAllDay: true },
      { date: "2026-05-13", title: "x".repeat(101), isAllDay: true },
      { date: "2026-05-13", title: "色不正", isAllDay: true, color: "red" },
    ]) {
      const res = await requestJson(app, "/api/personal-events", {
        method: "POST",
        headers: { Cookie: complete.cookie },
        body,
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(await json(res))).toContain("ZodError");
    }
  });
});
