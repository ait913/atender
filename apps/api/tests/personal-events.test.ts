// §9 A. CRUD (A1-A10, A23-A26)
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §5.1/§5.2 / §9 A
// 繰り返し編集 3 択 (A11-A22) は tests/personal-events-recurrence.test.ts
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";

/** JST の "YYYY-MM-DDTHH:mm" を ISO8601 instant にする */
function jstIso(literal: string): string {
  return new Date(`${literal}:00.000+09:00`).toISOString();
}

async function createEvent(cookie: string, body: Record<string, unknown>) {
  const res = await requestJson(app, "/api/personal-events", {
    method: "POST",
    headers: { Cookie: cookie },
    body,
  });
  return { res, body: (await json(res)) as any };
}

async function listEvents(cookie: string, from: string, to: string) {
  const res = await app.request(`/api/personal-events?from=${from}&to=${to}`, {
    headers: { Cookie: cookie },
  });
  return { res, body: (await json(res)) as any };
}

describe("§9 A. personal events CRUD", () => {
  it("[A1] 作成・単発 → 201 / recurrenceRule=null / recurrenceSpec=null", async () => {
    const u = await setupCompleteUser(prisma());

    const { res, body } = await createEvent(u.cookie, {
      title: "面談",
      start: "2026-07-23T00:00:00.000Z",
      end: "2026-07-23T01:30:00.000Z",
      isAllDay: false,
    });

    expect(res.status).toBe(201);
    expect(body.event).toMatchObject({
      title: "面談",
      isAllDay: false,
      recurrenceRule: null,
      recurrenceSpec: null,
      source: "MANUAL",
    });
    expect(new Date(body.event.start).toISOString()).toBe("2026-07-23T00:00:00.000Z");
    expect(new Date(body.event.end).toISOString()).toBe("2026-07-23T01:30:00.000Z");
    expect(body.event.exDates).toEqual([]);
    expect(body.event.rDates).toEqual([]);
  });

  it("[A2] 作成・終日は JST 00:00 起点 / 翌 00:00 排他へ正規化される", async () => {
    const u = await setupCompleteUser(prisma());

    const { res, body } = await createEvent(u.cookie, {
      title: "帰省",
      start: "2026-07-23T05:00:00.000Z", // JST 7/23 14:00
      end: "2026-07-25T05:00:00.000Z", // JST 7/25 14:00
      isAllDay: true,
    });

    expect(res.status).toBe(201);
    expect(body.event.isAllDay).toBe(true);
    expect(new Date(body.event.start).toISOString()).toBe(jstIso("2026-07-23T00:00"));
    expect(new Date(body.event.end).toISOString()).toBe(jstIso("2026-07-26T00:00"));
  });

  it("[A3] 作成・繰り返し (spec) → サーバが RRULE を組み spec も返す", async () => {
    const u = await setupCompleteUser(prisma());

    const { res, body } = await createEvent(u.cookie, {
      title: "定例",
      start: jstIso("2026-07-20T00:00"),
      end: jstIso("2026-07-21T00:00"),
      isAllDay: true,
      recurrence: { spec: { freq: "WEEKLY", byDay: ["MO"] } },
    });

    expect(res.status).toBe(201);
    expect(body.event.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(body.event.recurrenceSpec).toEqual({
      freq: "WEEKLY",
      interval: 1,
      byDay: ["MO"],
      monthlyMode: null,
      end: { kind: "never" },
    });
  });

  it("[A4] 作成・rrule 直指定はそのまま保存され spec に戻せる", async () => {
    const u = await setupCompleteUser(prisma());

    const { res, body } = await createEvent(u.cookie, {
      title: "隔日",
      start: "2026-07-23T00:00:00.000Z",
      end: "2026-07-23T01:00:00.000Z",
      recurrence: { rrule: "FREQ=DAILY;INTERVAL=2" },
    });

    expect(res.status).toBe(201);
    expect(body.event.recurrenceRule).toBe("FREQ=DAILY;INTERVAL=2");
    expect(body.event.recurrenceSpec).toMatchObject({ freq: "DAILY", interval: 2 });
  });

  it("[A5] 作成・spec と rrule の両方 / どちらも無しは 400", async () => {
    const u = await setupCompleteUser(prisma());
    const base = { title: "x", start: "2026-07-23T00:00:00.000Z", end: "2026-07-23T01:00:00.000Z" };

    const both = await createEvent(u.cookie, {
      ...base,
      recurrence: { spec: { freq: "DAILY" }, rrule: "FREQ=DAILY" },
    });
    const neither = await createEvent(u.cookie, { ...base, recurrence: {} });

    expect(both.res.status).toBe(400);
    expect(neither.res.status).toBe(400);
  });

  it("[A6] 作成・end <= start (時刻あり) は 400", async () => {
    const u = await setupCompleteUser(prisma());

    const equal = await createEvent(u.cookie, {
      title: "x",
      start: "2026-07-23T00:00:00.000Z",
      end: "2026-07-23T00:00:00.000Z",
      isAllDay: false,
    });
    const inverted = await createEvent(u.cookie, {
      title: "x",
      start: "2026-07-23T02:00:00.000Z",
      end: "2026-07-23T01:00:00.000Z",
      isAllDay: false,
    });

    expect(equal.res.status).toBe(400);
    expect(inverted.res.status).toBe(400);
  });

  it("[A7] 取得・繰り返しが展開される (occurrenceDate は JST 00:00)", async () => {
    const u = await setupCompleteUser(prisma());
    const created = await createEvent(u.cookie, {
      title: "定例",
      start: jstIso("2026-07-20T00:00"),
      end: jstIso("2026-07-21T00:00"),
      isAllDay: true,
      recurrence: { spec: { freq: "WEEKLY", byDay: ["MO"] } },
    });
    const seriesId = created.body.event.id;

    const { res, body } = await listEvents(u.cookie, "2026-07-20", "2026-08-16");

    expect(res.status).toBe(200);
    expect(body.events).toHaveLength(4);
    expect(body.events.map((e: any) => new Date(e.occurrenceDate).toISOString())).toEqual([
      jstIso("2026-07-20T00:00"),
      jstIso("2026-07-27T00:00"),
      jstIso("2026-08-03T00:00"),
      jstIso("2026-08-10T00:00"),
    ]);
    for (const e of body.events) {
      expect(e.seriesId).toBe(seriesId);
      expect(e.isRecurringOccurrence).toBe(true);
      expect(e.days).toHaveLength(1);
      expect(e).not.toHaveProperty("id");
    }
    expect(body.events[0].days[0]).toEqual({
      date: "2026-07-20",
      startMinute: 0,
      endMinute: 1440,
    });
  });

  it("[A8] 取得・from/to は必須", async () => {
    const u = await setupCompleteUser(prisma());

    const none = await app.request("/api/personal-events", { headers: { Cookie: u.cookie } });
    const fromOnly = await app.request("/api/personal-events?from=2026-07-20", { headers: { Cookie: u.cookie } });

    expect(none.status).toBe(400);
    expect(fromOnly.status).toBe(400);
  });

  it("[A9] 取得・366 日を超える範囲は 400 RANGE_TOO_LARGE", async () => {
    const u = await setupCompleteUser(prisma());

    const { res, body } = await listEvents(u.cookie, "2026-01-01", "2027-06-01");

    expect(res.status).toBe(400);
    expect(JSON.stringify(body)).toContain("RANGE_TOO_LARGE");
  });

  it("[A10] 取得・学期非依存 (semesterId で絞られない)", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const a = await createEvent(u.cookie, {
      title: "学期内",
      start: jstIso("2026-07-23T09:00"),
      end: jstIso("2026-07-23T10:00"),
    });
    const b = await createEvent(u.cookie, {
      title: "学期外",
      start: jstIso("2026-07-24T09:00"),
      end: jstIso("2026-07-24T10:00"),
    });
    expect(a.res.status).toBe(201);
    expect(b.res.status).toBe(201);
    // 旧モデルの semesterId 相当の列は存在しない (T3)
    const stored = await db.personalEvent.findMany({ where: { userId: u.user.id } });
    expect(stored).toHaveLength(2);
    expect(stored[0]).not.toHaveProperty("semesterId");

    const plain = await listEvents(u.cookie, "2026-07-20", "2026-07-31");
    const withSemester = await app.request(
      `/api/personal-events?from=2026-07-20&to=2026-07-31&semesterId=${u.semester.id}`,
      { headers: { Cookie: u.cookie } },
    );
    const withSemesterBody = (await json(withSemester)) as any;

    expect(plain.body.events.map((e: any) => e.title)).toEqual(["学期内", "学期外"]);
    expect(withSemester.status).toBe(200);
    expect(withSemesterBody.events.map((e: any) => e.title)).toEqual(["学期内", "学期外"]);
  });

  it("[A23] 他ユーザーの予定への PATCH / DELETE は 404", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const stranger = await setupCompleteUser(db);
    const created = await createEvent(owner.cookie, {
      title: "自分の予定",
      start: "2026-07-23T00:00:00.000Z",
      end: "2026-07-23T01:00:00.000Z",
    });
    const id = created.body.event.id;

    const patch = await requestJson(app, `/api/personal-events/${id}`, {
      method: "PATCH",
      headers: { Cookie: stranger.cookie },
      body: { title: "乗っ取り" },
    });
    const del = await app.request(`/api/personal-events/${id}?scope=all`, {
      method: "DELETE",
      headers: { Cookie: stranger.cookie },
    });

    expect(patch.status).toBe(404);
    expect(JSON.stringify(await json(patch))).toContain("NOT_FOUND");
    expect(del.status).toBe(404);
    expect(JSON.stringify(await json(del))).toContain("NOT_FOUND");
  });

  it("[A24] 未認証は全 endpoint 401", async () => {
    const u = await setupCompleteUser(prisma());
    const created = await createEvent(u.cookie, {
      title: "x",
      start: "2026-07-23T00:00:00.000Z",
      end: "2026-07-23T01:00:00.000Z",
    });
    const id = created.body.event.id;

    const get = await app.request("/api/personal-events?from=2026-07-01&to=2026-07-31");
    const post = await requestJson(app, "/api/personal-events", {
      method: "POST",
      body: { title: "x", start: "2026-07-23T00:00:00.000Z", end: "2026-07-23T01:00:00.000Z" },
    });
    const patch = await requestJson(app, `/api/personal-events/${id}`, {
      method: "PATCH",
      body: { title: "y" },
    });
    const del = await app.request(`/api/personal-events/${id}?scope=all`, { method: "DELETE" });
    const sync = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      body: { range: { from: "2026-07-20", to: "2026-07-31" }, events: [] },
    });

    expect([get.status, post.status, patch.status, del.status, sync.status]).toEqual([401, 401, 401, 401, 401]);
  });

  it("[A25] バリデーション (title/color/location/note) は 400", async () => {
    const u = await setupCompleteUser(prisma());
    const base = { start: "2026-07-23T00:00:00.000Z", end: "2026-07-23T01:00:00.000Z" };

    const emptyTitle = await createEvent(u.cookie, { ...base, title: "" });
    const longTitle = await createEvent(u.cookie, { ...base, title: "あ".repeat(101) });
    const badColor = await createEvent(u.cookie, { ...base, title: "x", color: "red" });
    const longLocation = await createEvent(u.cookie, { ...base, title: "x", location: "あ".repeat(201) });
    const longNote = await createEvent(u.cookie, { ...base, title: "x", note: "あ".repeat(501) });
    const okColor = await createEvent(u.cookie, { ...base, title: "x", color: "#1E96E6" });

    expect(emptyTitle.res.status).toBe(400);
    expect(longTitle.res.status).toBe(400);
    expect(badColor.res.status).toBe(400);
    expect(longLocation.res.status).toBe(400);
    expect(longNote.res.status).toBe(400);
    expect(okColor.res.status).toBe(201);
  });

  it("[A26] 取得・start 昇順で安定ソート (終日 → 08:00 → 13:00)", async () => {
    const u = await setupCompleteUser(prisma());
    await createEvent(u.cookie, {
      title: "13時",
      start: jstIso("2026-07-23T13:00"),
      end: jstIso("2026-07-23T14:00"),
    });
    await createEvent(u.cookie, {
      title: "終日",
      start: jstIso("2026-07-23T00:00"),
      end: jstIso("2026-07-24T00:00"),
      isAllDay: true,
    });
    await createEvent(u.cookie, {
      title: "8時",
      start: jstIso("2026-07-23T08:00"),
      end: jstIso("2026-07-23T09:00"),
    });

    const { body } = await listEvents(u.cookie, "2026-07-23", "2026-07-23");

    expect(body.events.map((e: any) => e.title)).toEqual(["終日", "8時", "13時"]);
  });
});
