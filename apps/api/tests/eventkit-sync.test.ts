// §9 K. EventKit sync (reconcileEventKit) — K1-K8, K11-K13 (K9/K10 は欠番)
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §5.6 / §9 K
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";
import { createRoom } from "./helpers/seedRoom";

const JST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function jstIso(literal: string): string {
  return new Date(`${literal}:00.000+09:00`).toISOString();
}
function jstDayStart(t: number): Date {
  const shifted = new Date(t + JST);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - JST);
}
function jstDateStr(d: Date): string {
  return new Date(d.getTime() + JST).toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}

const RANGE = { from: "2026-07-20", to: "2026-08-16" };

type Incoming = {
  ekExternalId: string;
  ekCalendarId: string;
  ekOccurrenceStart: string;
  ekLastModified: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  title: string;
  location: string | null;
};

function ev(over: Partial<Incoming> & { ekExternalId: string; ekOccurrenceStart: string }): Incoming {
  return {
    ekCalendarId: "cal-a",
    ekLastModified: "2026-07-20T00:00:00.000Z",
    start: over.ekOccurrenceStart,
    end: new Date(new Date(over.ekOccurrenceStart).getTime() + 3600_000).toISOString(),
    isAllDay: false,
    title: "EK イベント",
    location: null,
    ...over,
  };
}

async function sync(
  cookie: string,
  events: Incoming[],
  range: { from: string; to: string } = RANGE,
) {
  const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
    method: "POST",
    headers: { Cookie: cookie },
    body: { range, events },
  });
  return { res, body: (await json(res)) as any };
}

describe("§9 K. POST /api/personal-events/eventkit-sync", () => {
  it("[K1] 新規ミラーを非繰り返しで作る (manualNeedingPush は廃止)", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const { res, body } = await sync(u.cookie, [
      ev({ ekExternalId: "X", ekOccurrenceStart: "2026-07-23T00:00:00.000Z", title: "EK 予定" }),
    ]);
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(res.status).toBe(200);
    expect(body.manualNeedingPush).toBeUndefined();
    expect(Array.isArray(body.mirrors)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "EVENTKIT",
      recurrenceRule: null,
      ekExternalId: "X",
      ekCalendarId: "cal-a",
      title: "EK 予定",
    });
    expect(rows[0].ekOccurrenceStart?.toISOString()).toBe("2026-07-23T00:00:00.000Z");
    expect(body.mirrors.map((m: any) => m.ekExternalId)).toContain("X");
  });

  it("[K2] 複数日 EK イベントを分解しない (1 行 / days 3 件)", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    await sync(u.cookie, [
      ev({
        ekExternalId: "MULTI",
        ekOccurrenceStart: jstIso("2026-07-23T00:00"),
        start: jstIso("2026-07-23T00:00"),
        end: jstIso("2026-07-26T00:00"),
        isAllDay: true,
        title: "旅行",
      }),
    ]);
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });
    const listRes = await app.request("/api/personal-events?from=2026-07-20&to=2026-08-16", {
      headers: { Cookie: u.cookie },
    });
    const list = (await json(listRes)) as any;

    expect(rows).toHaveLength(1);
    expect(list.events).toHaveLength(1);
    expect(list.events[0].days).toEqual([
      { date: "2026-07-23", startMinute: 0, endMinute: 1440 },
      { date: "2026-07-24", startMinute: 0, endMinute: 1440 },
      { date: "2026-07-25", startMinute: 0, endMinute: 1440 },
    ]);
  });

  it("[K3] ekLastModified が新しい incoming はミラーを更新する", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    await sync(u.cookie, [
      ev({
        ekExternalId: "U",
        ekOccurrenceStart: jstIso("2026-07-23T09:00"),
        ekLastModified: "2026-07-20T00:00:00.000Z",
        title: "旧タイトル",
        location: "旧場所",
      }),
    ]);

    await sync(u.cookie, [
      ev({
        ekExternalId: "U",
        ekOccurrenceStart: jstIso("2026-07-23T09:00"),
        ekLastModified: "2026-07-21T00:00:00.000Z",
        start: jstIso("2026-07-23T13:00"),
        end: jstIso("2026-07-23T14:00"),
        title: "新タイトル",
        location: "新場所",
      }),
    ]);
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "新タイトル", location: "新場所" });
    expect(rows[0].start.toISOString()).toBe(jstIso("2026-07-23T13:00"));
    expect(rows[0].end.toISOString()).toBe(jstIso("2026-07-23T14:00"));
  });

  it("[K4] ekLastModified が同じ / 古い incoming は更新しない", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const base = {
      ekExternalId: "U",
      ekOccurrenceStart: jstIso("2026-07-23T09:00"),
      ekLastModified: "2026-07-21T00:00:00.000Z",
      title: "元タイトル",
    };
    await sync(u.cookie, [ev(base)]);

    await sync(u.cookie, [ev({ ...base, ekLastModified: "2026-07-21T00:00:00.000Z", title: "同時刻" })]);
    const sameRows = await db.personalEvent.findMany({ where: { userId: u.user.id } });
    await sync(u.cookie, [ev({ ...base, ekLastModified: "2026-07-19T00:00:00.000Z", title: "古い" })]);
    const olderRows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(sameRows).toHaveLength(1);
    expect(sameRows[0].title).toBe("元タイトル");
    expect(olderRows[0].title).toBe("元タイトル");
  });

  it("[K5] 範囲内で incoming に無いミラーは削除される", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    await sync(u.cookie, [
      ev({ ekExternalId: "Y", ekOccurrenceStart: jstIso("2026-07-25T10:00"), title: "消える" }),
      ev({ ekExternalId: "Z", ekOccurrenceStart: jstIso("2026-07-26T10:00"), title: "残る" }),
    ]);
    expect(await db.personalEvent.count({ where: { userId: u.user.id } })).toBe(2);

    await sync(u.cookie, [ev({ ekExternalId: "Z", ekOccurrenceStart: jstIso("2026-07-26T10:00"), title: "残る" })]);
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0].ekExternalId).toBe("Z");
  });

  it("[K6] 範囲外のミラーは incoming に無くても削除されない", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    await sync(
      u.cookie,
      [ev({ ekExternalId: "OUT", ekOccurrenceStart: jstIso("2026-07-19T23:00"), title: "範囲外" })],
      { from: "2026-07-19", to: "2026-08-16" },
    );
    expect(await db.personalEvent.count({ where: { userId: u.user.id } })).toBe(1);

    await sync(u.cookie, []);
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0].ekExternalId).toBe("OUT");
  });

  it("[K7] 範囲に食い込む先頭の occurrence は upsert され削除対象にならない", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const straddling = ev({
      ekExternalId: "STRADDLE",
      ekOccurrenceStart: jstIso("2026-07-19T23:00"),
      start: jstIso("2026-07-19T23:00"),
      end: jstIso("2026-07-20T02:00"),
      title: "跨ぎ",
    });

    await sync(u.cookie, [straddling]);
    const first = await db.personalEvent.findMany({ where: { userId: u.user.id } });
    await sync(u.cookie, [straddling]);
    const second = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
  });

  it("[K8] source=MANUAL の行は削除も更新もされない", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const created = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        title: "手動の予定",
        start: jstIso("2026-07-25T09:00"),
        end: jstIso("2026-07-25T10:00"),
      },
    });
    const manual = ((await json(created)) as any).event;

    await sync(u.cookie, [ev({ ekExternalId: "X", ekOccurrenceStart: jstIso("2026-07-23T09:00") })]);
    const after = await db.personalEvent.findUnique({ where: { id: manual.id } });

    expect(after).not.toBeNull();
    expect(after?.title).toBe("手動の予定");
    expect(after?.source).toBe("MANUAL");
    expect(after?.start.toISOString()).toBe(jstIso("2026-07-25T09:00"));
  });

  it("[K11] 同じ ekExternalId でも ekOccurrenceStart が違えば別行になる", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    await sync(u.cookie, [
      ev({ ekExternalId: "SAME", ekOccurrenceStart: jstIso("2026-07-23T09:00"), title: "1 回目" }),
      ev({ ekExternalId: "SAME", ekOccurrenceStart: jstIso("2026-07-30T09:00"), title: "2 回目" }),
    ]);
    const rows = await db.personalEvent.findMany({
      where: { userId: u.user.id },
      orderBy: { start: "asc" },
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ekOccurrenceStart?.toISOString())).toEqual([
      jstIso("2026-07-23T09:00"),
      jstIso("2026-07-30T09:00"),
    ]);
    expect(rows.map((r) => r.title)).toEqual(["1 回目", "2 回目"]);
  });

  it("[K12] sync 後に enabled な share の再投影が走る", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await requestJson(app, `/api/rooms/${room.id}/personal-calendar-share`, {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { visibilityMode: "NORMAL" },
    });
    expect(await db.roomEvent.count({ where: { roomId: room.id, source: "PERSONAL" } })).toBe(0);

    // 投影範囲は today..+3ヶ月 なので相対日付で作る
    const target = addDays(jstDayStart(Date.now()), 3);
    const start = new Date(target.getTime() + 10 * 60 * 60_000);
    await sync(
      u.cookie,
      [
        ev({
          ekExternalId: "PROJ",
          ekOccurrenceStart: start.toISOString(),
          start: start.toISOString(),
          end: new Date(start.getTime() + 3600_000).toISOString(),
          title: "EK 由来",
        }),
      ],
      { from: jstDateStr(target), to: jstDateStr(addDays(target, 1)) },
    );
    const rows = await db.roomEvent.findMany({ where: { roomId: room.id, source: "PERSONAL" } });

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("EK 由来");
  });

  it("[K13] 同じ input で 2 回連続 sync すると 2 回目は何も変えない (収束)", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const incoming = [
      ev({ ekExternalId: "A", ekOccurrenceStart: jstIso("2026-07-23T09:00"), title: "A" }),
      ev({
        ekExternalId: "B",
        ekOccurrenceStart: jstIso("2026-07-24T00:00"),
        start: jstIso("2026-07-24T00:00"),
        end: jstIso("2026-07-26T00:00"),
        isAllDay: true,
        title: "B",
      }),
    ];

    await sync(u.cookie, incoming);
    const first = await db.personalEvent.findMany({ where: { userId: u.user.id }, orderBy: { start: "asc" } });
    await sync(u.cookie, incoming);
    const second = await db.personalEvent.findMany({ where: { userId: u.user.id }, orderBy: { start: "asc" } });

    expect(first).toHaveLength(2);
    expect(second).toEqual(first); // create/update/delete が全て 0
  });

  it("[K-auth] 他ユーザーのミラーには触らない", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const other = await setupCompleteUser(db);
    await sync(other.cookie, [
      ev({ ekExternalId: "OTHER", ekOccurrenceStart: jstIso("2026-07-23T09:00"), title: "他人の EK" }),
    ]);

    await sync(u.cookie, []);
    const rows = await db.personalEvent.findMany({ where: { userId: other.user.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("他人の EK");
  });
});
