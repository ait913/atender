// build 11 の push 済みイベント掃除 — §8 API12-API14 + API16
// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §6.2 / §6.3 / §8 API
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";

function jstIso(literal: string): string {
  return new Date(`${literal}:00.000+09:00`).toISOString();
}

async function createManual(cookie: string, title: string, startLiteral: string) {
  const res = await requestJson(app, "/api/personal-events", {
    method: "POST",
    headers: { Cookie: cookie },
    body: {
      title,
      start: jstIso(startLiteral),
      end: jstIso(startLiteral.replace(/T\d{2}:/, "T23:")),
      isAllDay: false,
    },
  });
  const body = (await json(res)) as any;
  if (res.status >= 300) throw new Error(`create failed ${res.status}: ${JSON.stringify(body)}`);
  return body.event.id as string;
}

async function listLegacy(cookie: string) {
  const res = await app.request("/api/personal-events/eventkit-legacy-pushes", { headers: { Cookie: cookie } });
  return { res, body: (await json(res)) as any };
}

async function clearLegacy(cookie: string, externalIds: string[]) {
  const res = await requestJson(app, "/api/personal-events/eventkit-legacy-pushes/clear", {
    method: "POST",
    headers: { Cookie: cookie },
    body: { externalIds },
  });
  return { res, body: (await json(res)) as any };
}

async function syncEventKitMirror(cookie: string, externalId: string) {
  const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
    method: "POST",
    headers: { Cookie: cookie },
    body: {
      range: { from: "2026-07-20", to: "2026-08-16" },
      events: [
        {
          ekExternalId: externalId,
          ekCalendarId: "cal-a",
          ekOccurrenceStart: "2026-07-24T00:00:00.000Z",
          ekLastModified: "2026-07-20T00:00:00.000Z",
          start: "2026-07-24T00:00:00.000Z",
          end: "2026-07-24T01:00:00.000Z",
          isAllDay: false,
          title: "EK 予定",
          location: null,
        },
      ],
    },
  });
  return { res, body: (await json(res)) as any };
}

describe("§8 API. build 11 legacy EK push の掃除", () => {
  it("[API12] MANUAL かつ ekExternalId 非 null の externalId だけを重複除去して返す", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);

    const a = await createManual(user.cookie, "A", "2026-07-23T10:00");
    const b = await createManual(user.cookie, "B", "2026-07-24T10:00");
    await createManual(user.cookie, "C (push されていない)", "2026-07-25T10:00");
    await db.personalEvent.updateMany({ where: { id: { in: [a, b] } }, data: { ekExternalId: "X", ekCalendarId: "cal-default" } });
    await syncEventKitMirror(user.cookie, "Y");

    const { res, body } = await listLegacy(user.cookie);

    expect(res.status).toBe(200);
    expect(body.externalIds).toEqual(["X"]);
  });

  it("[API13] clear は MANUAL 行だけを null 化し EVENTKIT 行は触らない", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);

    const a = await createManual(user.cookie, "A", "2026-07-23T10:00");
    await db.personalEvent.updateMany({ where: { id: a }, data: { ekExternalId: "X", ekCalendarId: "cal-default" } });
    await syncEventKitMirror(user.cookie, "Y");

    const { res, body } = await clearLegacy(user.cookie, ["X"]);

    expect(res.status).toBe(200);
    expect(body.clearedCount).toBe(1);
    const cleared = await db.personalEvent.findUniqueOrThrow({ where: { id: a } });
    expect(cleared.ekExternalId).toBeNull();
    expect(cleared.ekCalendarId).toBeNull();
    const mirror = await db.personalEvent.findFirstOrThrow({ where: { userId: user.user.id, source: "EVENTKIT" } });
    expect(mirror.ekExternalId).toBe("Y");
    expect((await listLegacy(user.cookie)).body.externalIds).toEqual([]);
  });

  it("[API14] clear は冪等 (2 回目は clearedCount 0)", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);

    const a = await createManual(user.cookie, "A", "2026-07-23T10:00");
    await db.personalEvent.updateMany({ where: { id: a }, data: { ekExternalId: "X", ekCalendarId: "cal-default" } });

    expect((await clearLegacy(user.cookie, ["X"])).body.clearedCount).toBe(1);
    const second = await clearLegacy(user.cookie, ["X"]);
    expect(second.res.status).toBe(200);
    expect(second.body.clearedCount).toBe(0);
  });

  it("[API12/13] 他人の行は見えないし消せない", async () => {
    const db = prisma();
    const mine = await setupCompleteUser(db, { email: `mine_${Date.now()}@example.test` });
    const other = await setupCompleteUser(db, { email: `other_${Date.now()}@example.test` });

    const otherEvent = await createManual(other.cookie, "他人", "2026-07-23T10:00");
    await db.personalEvent.updateMany({ where: { id: otherEvent }, data: { ekExternalId: "Z", ekCalendarId: "cal-default" } });

    expect((await listLegacy(mine.cookie)).body.externalIds).toEqual([]);
    expect((await clearLegacy(mine.cookie, ["Z"])).body.clearedCount).toBe(0);
    const untouched = await db.personalEvent.findUniqueOrThrow({ where: { id: otherEvent } });
    expect(untouched.ekExternalId).toBe("Z");
  });

  it("[API12/13] 未認証は 401", async () => {
    const list = await app.request("/api/personal-events/eventkit-legacy-pushes");
    expect(list.status).toBe(401);
    const clear = await requestJson(app, "/api/personal-events/eventkit-legacy-pushes/clear", {
      method: "POST",
      body: { externalIds: ["X"] },
    });
    expect(clear.status).toBe(401);
  });

  it("[API16] eventkit-sync の返りに manualNeedingPush が無い", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);
    const manual = await createManual(user.cookie, "手動", "2026-07-23T10:00");
    expect(manual).toBeTruthy();

    const { res, body } = await syncEventKitMirror(user.cookie, "Y");

    expect(res.status).toBe(200);
    expect(Object.keys(body)).toEqual(["mirrors"]);
    expect(body).not.toHaveProperty("manualNeedingPush");
    expect(Array.isArray(body.mirrors)).toBe(true);
  });
});
