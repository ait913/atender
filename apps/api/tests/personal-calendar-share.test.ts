// §9 P. ルーム共有への投影 (projectShare) — P1-P10
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §5.5 / §9 P
//
// ★ projectShare の投影範囲は today().startOfDay 〜 +3ヶ月 なので、
//   日付は必ず「今日」からの相対で作る (リテラル日付は実行日が進むと腐る)。
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";
import { addRoomMember, createRoom, createRoomEvent } from "./helpers/seedRoom";

const JST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function jstDayStart(t: number): Date {
  const shifted = new Date(t + JST);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - JST);
}
function jstDateStr(d: Date): string {
  return new Date(d.getTime() + JST).toISOString().slice(0, 10);
}
function jstDow(d: Date): number {
  return new Date(d.getTime() + JST).getUTCDay();
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}
function atMinutes(dayStart: Date, minutes: number): Date {
  return new Date(dayStart.getTime() + minutes * 60_000);
}

/** 今日 (JST) の 00:00 */
const TODAY = jstDayStart(Date.now());
/** 今日より後で最初の月曜 (JST) */
const MONDAY_1 = (() => {
  let d = addDays(TODAY, 1);
  while (jstDow(d) !== 1) d = addDays(d, 1);
  return d;
})();
const MONDAY_2 = addDays(MONDAY_1, 7);
const MONDAY_3 = addDays(MONDAY_1, 14);
/** 今日から 3 日後 (投影範囲内の安全な単発日) */
const SOON = addDays(TODAY, 3);

async function createEvent(cookie: string, body: Record<string, unknown>) {
  const res = await requestJson(app, "/api/personal-events", { method: "POST", headers: { Cookie: cookie }, body });
  const parsed = (await json(res)) as any;
  expect(res.status).toBe(201);
  return parsed.event as any;
}

async function share(cookie: string, roomId: string, visibilityMode: string) {
  const res = await requestJson(app, `/api/rooms/${roomId}/personal-calendar-share`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: { visibilityMode },
  });
  return { res, body: (await json(res)) as any };
}

function projected(db: ReturnType<typeof prisma>, roomId: string) {
  return db.roomEvent.findMany({ where: { roomId, source: "PERSONAL" }, orderBy: { start: "asc" } });
}

describe("§9 P. room personal-calendar-share projection", () => {
  it("[M1] GET returns null before a room member creates a share", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });

    const res = await app.request(`/api/rooms/${room.id}/personal-calendar-share`, {
      headers: { Cookie: u.cookie },
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ share: null });
  });

  it("[M8] non-members cannot get, create, or delete a room personal-calendar-share", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const outsider = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const getRes = await app.request(`/api/rooms/${room.id}/personal-calendar-share`, {
      headers: { Cookie: outsider.cookie },
    });
    const postRes = await share(outsider.cookie, room.id, "NORMAL");
    const deleteRes = await app.request(`/api/rooms/${room.id}/personal-calendar-share`, {
      method: "DELETE",
      headers: { Cookie: outsider.cookie },
    });

    expect(getRes.status).toBe(403);
    expect(postRes.res.status).toBe(403);
    expect(deleteRes.status).toBe(403);
  });

  it("[P1] 単発予定はそのまま 1 行に投影される", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    const event = await createEvent(u.cookie, {
      title: "デート",
      start: atMinutes(SOON, 18 * 60).toISOString(),
      end: atMinutes(SOON, 21 * 60).toISOString(),
    });

    const res = await share(u.cookie, room.id, "NORMAL");
    const rows = await projected(db, room.id);

    expect(res.res.status).toBe(201);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "デート",
      rawTitle: "デート",
      externalUid: `pe:${event.id}`,
      recurrenceRule: null,
      source: "PERSONAL",
      authorId: u.user.id,
    });
    expect(rows[0].start.toISOString()).toBe(atMinutes(SOON, 18 * 60).toISOString());
    expect(rows[0].end.toISOString()).toBe(atMinutes(SOON, 21 * 60).toISOString());
  });

  it("[P2] 繰り返しは occurrence でなく系列 1 行として投影される (T4)", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    const event = await createEvent(u.cookie, {
      title: "バイト",
      start: atMinutes(MONDAY_1, 10 * 60).toISOString(),
      end: atMinutes(MONDAY_1, 11 * 60).toISOString(),
      recurrence: { spec: { freq: "WEEKLY", byDay: ["MO"] } },
    });

    await share(u.cookie, room.id, "NORMAL");
    const rows = await projected(db, room.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      externalUid: `pe:${event.id}`,
    });

    // 3 週分の週 API でそれぞれ 1 occurrence 出る
    for (const monday of [MONDAY_1, MONDAY_2, MONDAY_3]) {
      const weekRes = await app.request(
        `/api/rooms/${room.id}/week?weekStart=${jstDateStr(monday)}`,
        { headers: { Cookie: u.cookie } },
      );
      const week = (await json(weekRes)) as any;
      const mine = week.roomEvents.filter((e: any) => e.title === "バイト");
      expect(weekRes.status).toBe(200);
      expect(mine).toHaveLength(1);
      expect(mine[0].isRecurringOccurrence).toBe(true);
      expect(jstDateStr(new Date(mine[0].start))).toBe(jstDateStr(monday));
    }
  });

  it("[P3] 終日の繰り返しでも投影先の JST 日付が月曜になる (expandRoomEvents の JST 化)", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await createEvent(u.cookie, {
      title: "終日バイト",
      start: MONDAY_1.toISOString(),
      end: addDays(MONDAY_1, 1).toISOString(),
      isAllDay: true,
      recurrence: { spec: { freq: "WEEKLY", byDay: ["MO"] } },
    });

    await share(u.cookie, room.id, "NORMAL");

    for (const monday of [MONDAY_1, MONDAY_2, MONDAY_3]) {
      const weekRes = await app.request(
        `/api/rooms/${room.id}/week?weekStart=${jstDateStr(monday)}`,
        { headers: { Cookie: u.cookie } },
      );
      const week = (await json(weekRes)) as any;
      const mine = week.roomEvents.filter((e: any) => e.title === "終日バイト");
      expect(mine).toHaveLength(1);
      expect(jstDateStr(new Date(mine[0].start))).toBe(jstDateStr(monday));
      expect(jstDow(new Date(mine[0].start))).toBe(1); // 月曜
    }
  });

  it("[P4] 終日は排他 end から包含 end (-1ms) へ変換して投影される", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await createEvent(u.cookie, {
      title: "終日",
      start: SOON.toISOString(),
      end: addDays(SOON, 1).toISOString(),
      isAllDay: true,
    });

    await share(u.cookie, room.id, "NORMAL");
    const rows = await projected(db, room.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].isAllDay).toBe(true);
    expect(rows[0].start.toISOString()).toBe(SOON.toISOString());
    expect(rows[0].end.toISOString()).toBe(new Date(addDays(SOON, 1).getTime() - 1).toISOString());
  });

  it("[P5] 個人側 override は RoomEventOverride へ投影され、消すと投影側も消える", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    const event = await createEvent(u.cookie, {
      title: "バイト",
      start: atMinutes(MONDAY_1, 10 * 60).toISOString(),
      end: atMinutes(MONDAY_1, 11 * 60).toISOString(),
      recurrence: { spec: { freq: "WEEKLY", byDay: ["MO"] } },
    });
    await share(u.cookie, room.id, "NORMAL");

    const originalDate = atMinutes(MONDAY_2, 10 * 60);
    const patched = await requestJson(app, `/api/personal-events/${event.id}`, {
      method: "PATCH",
      headers: { Cookie: u.cookie },
      body: { editScope: "single", originalDate: originalDate.toISOString(), title: "バイト(代打)" },
    });
    expect(patched.status).toBe(200);

    const roomRow = (await projected(db, room.id))[0];
    const overrides = await db.roomEventOverride.findMany({ where: { seriesId: roomRow.id } });

    expect(overrides).toHaveLength(1);
    expect(overrides[0].originalDate.toISOString()).toBe(originalDate.toISOString());
    expect(overrides[0].newTitle).toBe("バイト(代打)");

    // 個人側の override を消して再投影 → 投影側も消える
    await db.personalEventOverride.deleteMany({ where: { seriesId: event.id } });
    await share(u.cookie, room.id, "NORMAL");
    const after = await db.roomEventOverride.findMany({
      where: { seriesId: (await projected(db, room.id))[0].id },
    });

    expect(after).toHaveLength(0);
  });

  it("[P6] マスク: BUSY_ONLY / TITLE_MAPPED は override の newTitle にも適用される", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    const event = await createEvent(u.cookie, {
      title: "デート",
      start: atMinutes(MONDAY_1, 18 * 60).toISOString(),
      end: atMinutes(MONDAY_1, 20 * 60).toISOString(),
      recurrence: { spec: { freq: "WEEKLY", byDay: ["MO"] } },
    });
    await createEvent(u.cookie, {
      title: "会議",
      start: atMinutes(SOON, 9 * 60).toISOString(),
      end: atMinutes(SOON, 10 * 60).toISOString(),
    });
    await requestJson(app, `/api/personal-events/${event.id}`, {
      method: "PATCH",
      headers: { Cookie: u.cookie },
      body: {
        editScope: "single",
        originalDate: atMinutes(MONDAY_2, 18 * 60).toISOString(),
        title: "デート(延長)",
      },
    });

    // BUSY_ONLY
    await share(u.cookie, room.id, "BUSY_ONLY");
    const busy = await projected(db, room.id);
    const busyDate = busy.find((r) => r.rawTitle === "デート");
    expect(busyDate?.title).toBe("予定");
    expect(busyDate?.rawTitle).toBe("デート");
    for (const row of busy) expect(row.visibilityMode).toBe("BUSY_ONLY");
    const busyOverride = await db.roomEventOverride.findFirst({ where: { seriesId: busyDate!.id } });
    expect(busyOverride?.newTitle).toBe("予定");

    // TITLE_MAPPED (CONTAINS デート → 予定)
    await requestJson(app, "/api/me/ics-title-rules", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { matchType: "CONTAINS", pattern: "デート", replaceWith: "予定" },
    });
    await share(u.cookie, room.id, "TITLE_MAPPED");
    const mapped = await projected(db, room.id);
    const mappedDate = mapped.find((r) => r.rawTitle === "デート");
    const mappedMeeting = mapped.find((r) => r.rawTitle === "会議");

    expect(mappedDate?.title).toBe("予定");
    expect(mappedMeeting?.title).toBe("会議"); // ルール不一致は素通し
    const mappedOverride = await db.roomEventOverride.findFirst({ where: { seriesId: mappedDate!.id } });
    expect(mappedOverride?.newTitle).toBe("予定");
  });

  it("[P7] 再投影しても externalUid upsert で重複しない", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await createEvent(u.cookie, {
      title: "予定A",
      start: atMinutes(SOON, 9 * 60).toISOString(),
      end: atMinutes(SOON, 10 * 60).toISOString(),
    });

    await share(u.cookie, room.id, "NORMAL");
    const first = await projected(db, room.id);
    await share(u.cookie, room.id, "NORMAL");
    const second = await projected(db, room.id);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
  });

  it("[P8] 個人側の削除は再投影で伝播し、他 source は残る", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    const manual = await createRoomEvent(db, {
      roomId: room.id,
      authorId: u.user.id,
      title: "手動イベント",
      start: atMinutes(SOON, 15 * 60),
      end: atMinutes(SOON, 16 * 60),
    });
    const event = await createEvent(u.cookie, {
      title: "消える予定",
      start: atMinutes(SOON, 9 * 60).toISOString(),
      end: atMinutes(SOON, 10 * 60).toISOString(),
    });
    await share(u.cookie, room.id, "NORMAL");
    expect(await projected(db, room.id)).toHaveLength(1);

    const del = await app.request(`/api/personal-events/${event.id}?scope=all`, {
      method: "DELETE",
      headers: { Cookie: u.cookie },
    });

    expect(del.status).toBe(200);
    expect(await projected(db, room.id)).toEqual([]);
    expect(await db.roomEvent.findUnique({ where: { id: manual.id } })).not.toBeNull();
  });

  it("[P9] share を OFF にするとその room+user の PERSONAL 投影が全消えする", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await createEvent(u.cookie, {
      title: "消える",
      start: atMinutes(SOON, 9 * 60).toISOString(),
      end: atMinutes(SOON, 10 * 60).toISOString(),
    });
    await share(u.cookie, room.id, "NORMAL");

    const res = await app.request(`/api/rooms/${room.id}/personal-calendar-share`, {
      method: "DELETE",
      headers: { Cookie: u.cookie },
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
    expect(await projected(db, room.id)).toEqual([]);
  });

  it("[P10] 場所は共有しない (description は note のみ)", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await createEvent(u.cookie, {
      title: "バイト",
      start: atMinutes(SOON, 18 * 60).toISOString(),
      end: atMinutes(SOON, 22 * 60).toISOString(),
      location: "渋谷店",
      note: "制服を持参",
    });

    await share(u.cookie, room.id, "NORMAL");
    const rows = await projected(db, room.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].description ?? "").not.toContain("渋谷店");
    expect(rows[0].description).toBe("制服を持参");
  });

  it("[M9] 各メンバーの share は自分の予定だけを投影する", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const other = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: other.user.id });
    await createEvent(owner.cookie, {
      title: "owner personal",
      start: atMinutes(SOON, 9 * 60).toISOString(),
      end: atMinutes(SOON, 10 * 60).toISOString(),
    });
    await createEvent(other.cookie, {
      title: "member personal",
      start: atMinutes(SOON, 11 * 60).toISOString(),
      end: atMinutes(SOON, 12 * 60).toISOString(),
    });

    await share(other.cookie, room.id, "NORMAL");
    const rows = await projected(db, room.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ authorId: other.user.id, title: "member personal" });
  });
});
