import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";
import { createRoom, addRoomMember } from "./helpers/seedRoom";

describe("POST /api/personal-events/eventkit-sync", () => {
  // R1
  it("[R1] creates EventKit mirrors from uploaded events and returns the wire shape", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        range: { from: "2026-07-25", to: "2026-07-31" },
        events: [
          {
            ekExternalId: "ek-r1",
            ekCalendarId: "cal-a",
            ekLastModified: "2026-07-20T00:00:00.000Z",
            date: "2026-07-25",
            title: "EventKit mirror",
            isAllDay: false,
            startMinute: 540,
            endMinute: 630,
          },
        ],
      },
    });
    const body = (await json(res)) as any;

    expect(res.status).toBe(200);
    expect(body.manualNeedingPush).toEqual([]);
    expect(body.mirrors).toHaveLength(1);
    expect(body.mirrors[0]).toMatchObject({
      date: "2026-07-25",
      title: "EventKit mirror",
      source: "EVENTKIT",
      ekExternalId: "ek-r1",
      ekCalendarId: "cal-a",
      ekLastModified: "2026-07-20T00:00:00.000Z",
    });

    const stored = await db.personalEvent.findMany({
      where: { userId: u.user.id },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      source: "EVENTKIT",
      ekExternalId: "ek-r1",
      ekCalendarId: "cal-a",
    });
  });

  // R2
  it("[R2] preserves all-day null minutes and timed minutes in mirrors", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        range: { from: "2026-07-25", to: "2026-07-26" },
        events: [
          {
            ekExternalId: "ek-r2-all-day",
            ekCalendarId: "cal-a",
            ekLastModified: null,
            date: "2026-07-25",
            title: "終日",
            isAllDay: true,
            startMinute: null,
            endMinute: null,
          },
          {
            ekExternalId: "ek-r2-timed",
            ekCalendarId: "cal-a",
            ekLastModified: null,
            date: "2026-07-26",
            title: "早朝",
            isAllDay: false,
            startMinute: 30,
            endMinute: 60,
          },
        ],
      },
    });
    const body = (await json(res)) as any;

    expect(res.status).toBe(200);
    expect(
      body.mirrors.map((e: any) => [
        e.title,
        e.isAllDay,
        e.startMinute,
        e.endMinute,
      ]),
    ).toEqual([
      ["終日", true, null, null],
      ["早朝", false, 30, 60],
    ]);
  });

  // R3
  it("[R3] reconciles an existing mirror by external id and calendar id without duplicating it", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        date: "2026-07-25",
        title: "before",
        isAllDay: false,
        startMinute: 540,
        endMinute: 600,
        source: "EVENTKIT",
        ekExternalId: "ek-r3",
        ekCalendarId: "cal-a",
        ekLastModified: "2026-07-20T00:00:00.000Z",
      },
    });

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        range: { from: "2026-07-25", to: "2026-07-25" },
        events: [
          {
            ekExternalId: "ek-r3",
            ekCalendarId: "cal-a",
            ekLastModified: "2026-07-21T00:00:00.000Z",
            date: "2026-07-25",
            title: "after",
            isAllDay: false,
            startMinute: 600,
            endMinute: 660,
          },
        ],
      },
    });
    const body = (await json(res)) as any;

    expect(res.status).toBe(200);
    expect(body.mirrors).toHaveLength(1);
    expect(body.mirrors[0]).toMatchObject({
      title: "after",
      startMinute: 600,
      endMinute: 660,
    });

    const stored = await db.personalEvent.findMany({
      where: { userId: u.user.id, ekExternalId: "ek-r3" },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("after");
  });

  // R4
  it("[R4] deletes EventKit mirrors in the sync range when they are absent from the upload", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        date: "2026-07-25",
        title: "deleted",
        isAllDay: true,
        source: "EVENTKIT",
        ekExternalId: "ek-r4",
        ekCalendarId: "cal-a",
      },
    });

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { range: { from: "2026-07-25", to: "2026-07-25" }, events: [] },
    });

    expect(res.status).toBe(200);
    expect(
      await db.personalEvent.findMany({
        where: { userId: u.user.id, ekExternalId: "ek-r4" },
      }),
    ).toEqual([]);
  });

  // R5
  it("[R5] does not delete EventKit mirrors outside the sync range", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        date: "2026-09-20",
        title: "outside",
        isAllDay: true,
        source: "EVENTKIT",
        ekExternalId: "ek-r5",
        ekCalendarId: "cal-a",
      },
    });

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { range: { from: "2026-07-25", to: "2026-07-31" }, events: [] },
    });

    expect(res.status).toBe(200);
    const stored = await db.personalEvent.findMany({
      where: { userId: u.user.id, ekExternalId: "ek-r5" },
    });
    expect(stored).toHaveLength(1);
  });

  // R6
  it("[R6] returns manual personal events in range as manualNeedingPush", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const createRes = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { date: "2026-07-25", title: "manual", isAllDay: true },
    });
    const created = ((await json(createRes)) as any).event;

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { range: { from: "2026-07-25", to: "2026-07-25" }, events: [] },
    });
    const body = (await json(res)) as any;

    expect(res.status).toBe(200);
    expect(body.manualNeedingPush.map((e: any) => e.id)).toContain(created.id);
    expect(body.manualNeedingPush[0]).toMatchObject({
      source: "MANUAL",
      title: "manual",
    });
  });

  // R7
  it("[R7] keeps EventKit mirrors out of manualNeedingPush", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        range: { from: "2026-07-25", to: "2026-07-25" },
        events: [
          {
            ekExternalId: "ek-r7",
            ekCalendarId: "cal-a",
            ekLastModified: null,
            date: "2026-07-25",
            title: "mirror only",
            isAllDay: true,
            startMinute: null,
            endMinute: null,
          },
        ],
      },
    });
    const body = (await json(res)) as any;

    expect(res.status).toBe(200);
    expect(body.mirrors).toHaveLength(1);
    expect(body.manualNeedingPush).toEqual([]);
  });

  // R8
  it("[R8] reconciles only the authenticated user's EventKit mirrors", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const other = await setupCompleteUser(db);
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: owner.cookie },
      body: {
        date: "2026-07-25",
        title: "owner mirror",
        isAllDay: true,
        source: "EVENTKIT",
        ekExternalId: "ek-r8-owner",
        ekCalendarId: "cal-a",
      },
    });

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: other.cookie },
      body: {
        range: { from: "2026-07-25", to: "2026-07-25" },
        events: [],
      },
    });
    const body = (await json(res)) as any;
    const ownerEvents = await db.personalEvent.findMany({
      where: { userId: owner.user.id, ekExternalId: "ek-r8-owner" },
    });
    const otherEvents = await db.personalEvent.findMany({
      where: { userId: other.user.id },
    });

    expect(res.status).toBe(200);
    expect(body.mirrors).toEqual([]);
    expect(ownerEvents).toHaveLength(1);
    expect(otherEvents).toEqual([]);
  });

  // R3 (design): incoming ekLastModified <= existing → no-op (ping-pong 防止)
  it("[R3-design] does not update a mirror when incoming ekLastModified is older or equal", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        date: "2026-07-25",
        title: "keep",
        isAllDay: true,
        source: "EVENTKIT",
        ekExternalId: "ek-r3d",
        ekCalendarId: "cal-a",
        ekLastModified: "2026-07-21T00:00:00.000Z",
      },
    });

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        range: { from: "2026-07-25", to: "2026-07-25" },
        events: [
          {
            ekExternalId: "ek-r3d",
            ekCalendarId: "cal-a",
            ekLastModified: "2026-07-20T00:00:00.000Z", // 古い
            date: "2026-07-25",
            title: "stale-overwrite-attempt",
            isAllDay: true,
            startMinute: null,
            endMinute: null,
          },
        ],
      },
    });
    expect(res.status).toBe(200);

    const stored = await db.personalEvent.findMany({
      where: { userId: u.user.id, ekExternalId: "ek-r3d" },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("keep"); // 古い incoming で上書きされない
  });

  // R5 (design): source=MANUAL は incoming に無くても削除・更新しない
  it("[R5-design] never deletes or mutates MANUAL events during reconcile", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const createRes = await requestJson(app, "/api/personal-events", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { date: "2026-07-25", title: "手動予定", isAllDay: true },
    });
    const manual = (await json(createRes)).event;
    expect(manual.source).toBe("MANUAL");

    // incoming events が空 = MANUAL は「incoming に無い」状態
    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: { range: { from: "2026-07-25", to: "2026-07-25" }, events: [] },
    });
    expect(res.status).toBe(200);

    const stored = await db.personalEvent.findUnique({ where: { id: manual.id } });
    expect(stored).not.toBeNull();
    expect(stored?.title).toBe("手動予定");
    expect(stored?.source).toBe("MANUAL");
  });

  // R7 (design): 同 ekExternalId で date 違い 2 件 (複数日イベント) → 別行として両方保持
  it("[R7-design] keeps rows with the same ekExternalId but different dates", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
      method: "POST",
      headers: { Cookie: u.cookie },
      body: {
        range: { from: "2026-07-25", to: "2026-07-27" },
        events: [
          {
            ekExternalId: "ek-multiday",
            ekCalendarId: "cal-a",
            ekLastModified: null,
            date: "2026-07-25",
            title: "合宿",
            isAllDay: true,
            startMinute: null,
            endMinute: null,
          },
          {
            ekExternalId: "ek-multiday",
            ekCalendarId: "cal-a",
            ekLastModified: null,
            date: "2026-07-26",
            title: "合宿",
            isAllDay: true,
            startMinute: null,
            endMinute: null,
          },
        ],
      },
    });
    const body = (await json(res)) as any;
    expect(res.status).toBe(200);

    // DB 上は同 ekExternalId で 2 行 (unique 制約に頼らない・複合キー照合)
    const stored = await db.personalEvent.findMany({
      where: { userId: u.user.id, ekExternalId: "ek-multiday" },
    });
    expect(stored).toHaveLength(2);

    // wire の date 文字列で日付境界を検証 (TZ 非依存)
    const dates = body.mirrors
      .filter((e: any) => e.ekExternalId === "ek-multiday")
      .map((e: any) => e.date)
      .sort();
    expect(dates).toEqual(["2026-07-25", "2026-07-26"]);
  });
});
