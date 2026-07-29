// §9 A. 編集 3 択 (A11-A22)
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §4.4 / §9 A11-A22
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";

function jstIso(literal: string): string {
  return new Date(`${literal}:00.000+09:00`).toISOString();
}

async function post(cookie: string, body: Record<string, unknown>) {
  const res = await requestJson(app, "/api/personal-events", { method: "POST", headers: { Cookie: cookie }, body });
  return { res, body: (await json(res)) as any };
}

async function patch(cookie: string, id: string, body: Record<string, unknown>) {
  const res = await requestJson(app, `/api/personal-events/${id}`, {
    method: "PATCH",
    headers: { Cookie: cookie },
    body,
  });
  return { res, body: (await json(res)) as any };
}

async function del(cookie: string, id: string, query: string) {
  const res = await app.request(`/api/personal-events/${id}?${query}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  return { res, body: (await json(res)) as any };
}

async function list(cookie: string, from: string, to: string) {
  const res = await app.request(`/api/personal-events?from=${from}&to=${to}`, { headers: { Cookie: cookie } });
  return ((await json(res)) as any).events as any[];
}

/** A3 と同じ「毎週月曜・終日」系列を作る */
async function weeklyMonday(cookie: string, title = "帰省") {
  const created = await post(cookie, {
    title,
    start: jstIso("2026-07-20T00:00"),
    end: jstIso("2026-07-21T00:00"),
    isAllDay: true,
    recurrence: { spec: { freq: "WEEKLY", byDay: ["MO"] } },
  });
  expect(created.res.status).toBe(201);
  return created.body.event.id as string;
}

/** 毎週木曜・09:00-10:30 の系列 */
async function weeklyThursday(cookie: string) {
  const created = await post(cookie, {
    title: "ゼミ",
    start: jstIso("2026-07-23T09:00"),
    end: jstIso("2026-07-23T10:30"),
    recurrence: { spec: { freq: "WEEKLY", byDay: ["TH"] } },
  });
  expect(created.res.status).toBe(201);
  return created.body.event.id as string;
}

const MON_0720 = jstIso("2026-07-20T00:00");
const MON_0727 = jstIso("2026-07-27T00:00");
const MON_0803 = jstIso("2026-08-03T00:00");
const MON_0810 = jstIso("2026-08-10T00:00");

describe("§9 A11-A22. 繰り返しの編集 3 択", () => {
  it("[A11] single 編集は override を作り、その回だけ変わる", async () => {
    const u = await setupCompleteUser(prisma());
    const id = await weeklyMonday(u.cookie);

    const res = await patch(u.cookie, id, {
      editScope: "single",
      originalDate: MON_0727,
      title: "帰省(変更)",
    });
    const events = await list(u.cookie, "2026-07-20", "2026-08-16");

    expect(res.res.status).toBe(200);
    expect(res.body.event.title).toBe("帰省"); // 系列本体は不変
    expect(events).toHaveLength(4);
    const changed = events.find((e) => new Date(e.occurrenceDate).toISOString() === MON_0727);
    expect(changed.title).toBe("帰省(変更)");
    expect(changed.overrideId).not.toBeNull();
    for (const e of events.filter((e) => new Date(e.occurrenceDate).toISOString() !== MON_0727)) {
      expect(e.title).toBe("帰省");
      expect(e.overrideId).toBeNull();
    }
  });

  it("[A12] 非繰り返しへの single 編集は 400 NOT_RECURRING", async () => {
    const u = await setupCompleteUser(prisma());
    const created = await post(u.cookie, {
      title: "面談",
      start: "2026-07-23T00:00:00.000Z",
      end: "2026-07-23T01:30:00.000Z",
    });

    const res = await patch(u.cookie, created.body.event.id, {
      editScope: "single",
      originalDate: "2026-07-23T00:00:00.000Z",
      title: "x",
    });

    expect(res.res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("NOT_RECURRING");
  });

  it("[A13] future 編集は元系列を UNTIL で切り、新系列を返す", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const id = await weeklyMonday(u.cookie);

    const res = await patch(u.cookie, id, { editScope: "future", originalDate: MON_0803, title: "新" });
    const events = await list(u.cookie, "2026-07-20", "2026-08-16");
    const original = await db.personalEvent.findUnique({ where: { id } });

    expect(res.res.status).toBe(200);
    expect(original?.recurrenceRule).toContain("UNTIL=");
    expect(res.body.event.id).not.toBe(id);
    expect(res.body.event.title).toBe("新");
    expect(events).toHaveLength(4);
    expect(
      events.map((e) => [new Date(e.occurrenceDate).toISOString(), e.title, e.seriesId === id]),
    ).toEqual([
      [MON_0720, "帰省", true],
      [MON_0727, "帰省", true],
      [MON_0803, "新", false],
      [MON_0810, "新", false],
    ]);
  });

  it("[A14] future は originalDate 以降の override を掃除し、それ以前は残す", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const id = await weeklyMonday(u.cookie);
    await patch(u.cookie, id, { editScope: "single", originalDate: MON_0720, title: "7/20 だけ" });
    await patch(u.cookie, id, { editScope: "single", originalDate: MON_0727, title: "7/27 だけ" });
    expect(await db.personalEventOverride.count({ where: { seriesId: id } })).toBe(2);

    await patch(u.cookie, id, { editScope: "future", originalDate: MON_0727, title: "新" });
    const events = await list(u.cookie, "2026-07-20", "2026-08-16");
    const remaining = await db.personalEventOverride.findMany({ where: { seriesId: id } });

    expect(remaining).toHaveLength(1);
    expect(remaining[0].originalDate.toISOString()).toBe(MON_0720);
    const at0720 = events.find((e) => new Date(e.occurrenceDate).toISOString() === MON_0720);
    const at0727 = events.find((e) => new Date(e.occurrenceDate).toISOString() === MON_0727);
    expect(at0720.overrideId).not.toBeNull();
    expect(at0720.title).toBe("7/20 だけ");
    expect(at0727.overrideId).toBeNull();
    expect(at0727.title).toBe("新");
  });

  it("[A15] all 編集は originalDate との差分 (delta) を系列全体へ適用する", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const id = await weeklyThursday(u.cookie);

    const res = await patch(u.cookie, id, {
      editScope: "all",
      originalDate: jstIso("2026-08-06T09:00"),
      start: jstIso("2026-08-06T10:00"),
      end: jstIso("2026-08-06T11:30"),
    });
    const series = await db.personalEvent.findUnique({ where: { id } });
    const events = await list(u.cookie, "2026-07-23", "2026-08-16");

    expect(res.res.status).toBe(200);
    expect(series?.start.toISOString()).toBe(jstIso("2026-07-23T10:00")); // +1h
    expect(series?.end.toISOString()).toBe(jstIso("2026-07-23T11:30"));
    expect(series?.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(events).toHaveLength(4);
    for (const e of events) {
      expect(e.days).toEqual([{ date: e.days[0].date, startMinute: 600, endMinute: 690 }]);
    }
  });

  it("[A16] all 編集で繰り返しを差し替えても override は保持される", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const id = await weeklyMonday(u.cookie);
    await patch(u.cookie, id, { editScope: "single", originalDate: MON_0727, title: "個別" });

    const res = await patch(u.cookie, id, {
      editScope: "all",
      originalDate: MON_0720,
      recurrence: { spec: { freq: "WEEKLY", byDay: ["MO", "WE"] } },
    });
    const overrides = await db.personalEventOverride.findMany({ where: { seriesId: id } });

    expect(res.res.status).toBe(200);
    expect(res.body.event.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
    expect(res.body.event.recurrenceSpec).toMatchObject({ freq: "WEEKLY", byDay: ["MO", "WE"] });
    expect(overrides).toHaveLength(1);
  });

  it("[A17] clearRecurrence:true で繰り返しを解除する", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const id = await weeklyMonday(u.cookie);
    await patch(u.cookie, id, { editScope: "single", originalDate: MON_0727, title: "個別" });

    const res = await patch(u.cookie, id, {
      editScope: "all",
      originalDate: MON_0720,
      clearRecurrence: true,
    });
    const series = await db.personalEvent.findUnique({ where: { id } });
    const overrides = await db.personalEventOverride.findMany({ where: { seriesId: id } });
    const events = await list(u.cookie, "2026-07-20", "2026-08-16");

    expect(res.res.status).toBe(200);
    expect(res.body.event.recurrenceRule).toBeNull();
    expect(res.body.event.recurrenceSpec).toBeNull();
    expect(res.body.event.exDates).toEqual([]);
    expect(res.body.event.rDates).toEqual([]);
    expect(series?.recurrenceRule).toBeNull();
    expect(series?.exDates).toBeNull();
    expect(series?.rDates).toBeNull();
    expect(overrides).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0].isRecurringOccurrence).toBe(false);
  });

  it("[A18] single での繰り返し変更 / single・future での解除は 400 SCOPE_NOT_ALLOWED", async () => {
    const u = await setupCompleteUser(prisma());
    const id = await weeklyMonday(u.cookie);

    const specSingle = await patch(u.cookie, id, {
      editScope: "single",
      originalDate: MON_0727,
      recurrence: { spec: { freq: "WEEKLY", byDay: ["TU"] } },
    });
    const clearSingle = await patch(u.cookie, id, {
      editScope: "single",
      originalDate: MON_0727,
      clearRecurrence: true,
    });
    const clearFuture = await patch(u.cookie, id, {
      editScope: "future",
      originalDate: MON_0727,
      clearRecurrence: true,
    });

    for (const r of [specSingle, clearSingle, clearFuture]) {
      expect(r.res.status).toBe(400);
      expect(JSON.stringify(r.body)).toContain("SCOPE_NOT_ALLOWED");
    }
  });

  it("[A19] 繰り返し系列は originalDate 必須 / 単発は省略可", async () => {
    const u = await setupCompleteUser(prisma());
    const recurringId = await weeklyMonday(u.cookie);
    const single = await post(u.cookie, {
      title: "単発",
      start: "2026-07-23T00:00:00.000Z",
      end: "2026-07-23T01:00:00.000Z",
    });

    const missing = await patch(u.cookie, recurringId, { editScope: "all", title: "x" });
    const allowed = await patch(u.cookie, single.body.event.id, { editScope: "all", title: "変更後" });

    expect(missing.res.status).toBe(400);
    expect(JSON.stringify(missing.body)).toContain("ORIGINAL_DATE_REQUIRED");
    expect(allowed.res.status).toBe(200);
    expect(allowed.body.event.title).toBe("変更後");
  });

  it("[A20] 削除 single はその回だけ消し、系列行は残す", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const id = await weeklyMonday(u.cookie);

    const res = await del(u.cookie, id, `scope=single&originalDate=${encodeURIComponent(MON_0727)}`);
    const events = await list(u.cookie, "2026-07-20", "2026-08-16");
    const series = await db.personalEvent.findUnique({ where: { id } });

    expect(res.res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(series).not.toBeNull();
    expect(events.map((e) => new Date(e.occurrenceDate).toISOString())).toEqual([MON_0720, MON_0803, MON_0810]);
  });

  it("[A21] 削除 future は以降を切り、新系列を作らない", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const id = await weeklyMonday(u.cookie);

    const res = await del(u.cookie, id, `scope=future&originalDate=${encodeURIComponent(MON_0803)}`);
    const events = await list(u.cookie, "2026-07-20", "2026-08-16");
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(res.res.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(events.map((e) => new Date(e.occurrenceDate).toISOString())).toEqual([MON_0720, MON_0727]);
  });

  it("[A22] 削除 all は系列と override を消す", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const id = await weeklyMonday(u.cookie);
    await patch(u.cookie, id, { editScope: "single", originalDate: MON_0727, title: "個別" });

    // 注: §9 A22 の例は originalDate 無しだが、§4.4 は「繰り返し系列の PATCH / DELETE で必須」と規定する。
    //     規範は §4.4 (下の [A19/DELETE] で検証) なので originalDate を渡す。
    const res = await del(u.cookie, id, `scope=all&originalDate=${encodeURIComponent(MON_0720)}`);
    const events = await list(u.cookie, "2026-07-20", "2026-08-16");

    expect(res.res.status).toBe(200);
    expect(events).toEqual([]);
    expect(await db.personalEvent.count({ where: { userId: u.user.id } })).toBe(0);
    expect(await db.personalEventOverride.count({ where: { seriesId: id } })).toBe(0);
  });
  it("[A19/DELETE] 繰り返し系列の DELETE も originalDate 必須 (§4.4)", async () => {
    const u = await setupCompleteUser(prisma());
    const id = await weeklyMonday(u.cookie);

    const res = await del(u.cookie, id, "scope=all");

    expect(res.res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("ORIGINAL_DATE_REQUIRED");
  });

  it("[A12/DELETE] 非繰り返しへの scope=single 削除は 400 NOT_RECURRING (§4.4 に整合)", async () => {
    const u = await setupCompleteUser(prisma());
    const created = await post(u.cookie, {
      title: "単発",
      start: "2026-07-23T00:00:00.000Z",
      end: "2026-07-23T01:00:00.000Z",
    });

    const single = await del(
      u.cookie,
      created.body.event.id,
      "scope=single&originalDate=2026-07-23T00:00:00.000Z",
    );
    const future = await del(
      u.cookie,
      created.body.event.id,
      "scope=future&originalDate=2026-07-23T00:00:00.000Z",
    );

    expect(single.res.status).toBe(400);
    expect(JSON.stringify(single.body)).toContain("NOT_RECURRING");
    expect(future.res.status).toBe(400);
    expect(JSON.stringify(future.body)).toContain("NOT_RECURRING");
  });
});
