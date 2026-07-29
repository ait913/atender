// day detail API — §9 DD1-DD4 + 既存 #29/#30/#31
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §5.4 / §9 DD
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, createSessionCookie, createTestUser, setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";

function jstIso(literal: string): string {
  return new Date(`${literal}:00.000+09:00`).toISOString();
}

async function createEvent(cookie: string, body: Record<string, unknown>) {
  const res = await requestJson(app, "/api/personal-events", { method: "POST", headers: { Cookie: cookie }, body });
  return (await json(res)) as any;
}

async function dayDetail(cookie: string, date: string) {
  const res = await app.request(`/api/day/${date}`, { headers: { Cookie: cookie } });
  return { res, body: (await json(res)) as any };
}

describe("day detail API", () => {
  it("[#29] GET /api/day/:date returns occurrences, same-day courseSuspensions, timetableSuspension, and personalEvents", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });
    const courseSuspension = await db.courseSuspension.create({
      data: { courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z"), reason: "科目休講" },
    });
    await db.courseSuspension.create({
      data: { courseId: complete.course.id, date: new Date("2026-05-14T00:00:00.000Z"), reason: "別日" },
    });
    const timetableSuspensionRes = await requestJson(app, "/api/timetable-suspensions", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13" },
    });
    const timetableSuspension = ((await json(timetableSuspensionRes)) as any).suspension;
    const created = await createEvent(complete.cookie, {
      title: "予定",
      start: jstIso("2026-05-13T00:00"),
      end: jstIso("2026-05-14T00:00"),
      isAllDay: true,
    });

    const { res, body } = await dayDetail(complete.cookie, "2026-05-13");

    expect(res.status).toBe(200);
    expect(body.date).toBe("2026-05-13");
    expect(Array.isArray(body.occurrences)).toBe(true);
    expect(Array.isArray(body.courseSuspensions)).toBe(true);
    expect(Array.isArray(body.personalEvents)).toBe(true);
    expect(body.occurrences.map((o: { id: string }) => o.id)).toContain(occurrence.id);
    expect(body.courseSuspensions.map((s: { id: string }) => s.id)).toEqual([courseSuspension.id]);
    expect(body.timetableSuspension).toMatchObject({ id: timetableSuspension.id, date: "2026-05-13" });
    // 新 DTO: occurrence は seriesId で識別する (id フィールドは持たない)
    expect(body.personalEvents.map((e: { seriesId: string }) => e.seriesId)).toContain(created.event.id);
    expect(body.personalEvents[0]).not.toHaveProperty("id");
    expect(body.personalEvents[0].days).toEqual([{ date: "2026-05-13", startMinute: 0, endMinute: 1440 }]);
  });

  it("[#30 / DD2] 学期・時間割が無くても personalEvents は返る (T3)", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);
    const created = await createEvent(cookie, {
      title: "予定",
      start: jstIso("2026-05-13T00:00"),
      end: jstIso("2026-05-14T00:00"),
      isAllDay: true,
    });

    const { res, body } = await dayDetail(cookie, "2026-05-13");

    expect(res.status).toBe(200);
    expect(body.occurrences).toEqual([]);
    expect(body.courseSuspensions).toEqual([]);
    expect(body.timetableSuspension).toBeNull();
    expect(body.personalEvents.map((e: { seriesId: string }) => e.seriesId)).toEqual([created.event.id]);
  });

  it("[#31] GET /api/day/not-a-date returns 400", async () => {
    const complete = await setupCompleteUser(prisma());

    const res = await app.request("/api/day/not-a-date", { headers: { Cookie: complete.cookie } });

    expect(res.status).toBe(400);
  });

  it("[DD1] 繰り返しの回が日詳細に出る", async () => {
    const u = await setupCompleteUser(prisma());
    const created = await createEvent(u.cookie, {
      title: "定例",
      start: jstIso("2026-07-20T00:00"),
      end: jstIso("2026-07-21T00:00"),
      isAllDay: true,
      recurrence: { spec: { freq: "WEEKLY", byDay: ["MO"] } },
    });

    const { res, body } = await dayDetail(u.cookie, "2026-08-03");

    expect(res.status).toBe(200);
    expect(body.personalEvents).toHaveLength(1);
    expect(body.personalEvents[0].seriesId).toBe(created.event.id);
    expect(new Date(body.personalEvents[0].occurrenceDate).toISOString()).toBe(jstIso("2026-08-03T00:00"));
    expect(body.personalEvents[0].isRecurringOccurrence).toBe(true);
  });

  it("[DD3] 複数日予定は途中の日でも 1 件返り days がその日だけになる", async () => {
    const u = await setupCompleteUser(prisma());
    await createEvent(u.cookie, {
      title: "帰省",
      start: "2026-07-23T05:00:00.000Z",
      end: "2026-07-25T05:00:00.000Z",
      isAllDay: true,
    });

    const { body } = await dayDetail(u.cookie, "2026-07-24");

    expect(body.personalEvents).toHaveLength(1);
    expect(body.personalEvents[0].days).toEqual([{ date: "2026-07-24", startMinute: 0, endMinute: 1440 }]);
  });

  it("[DD4] single 削除した回は日詳細に出ない", async () => {
    const u = await setupCompleteUser(prisma());
    const created = await createEvent(u.cookie, {
      title: "定例",
      start: jstIso("2026-07-20T00:00"),
      end: jstIso("2026-07-21T00:00"),
      isAllDay: true,
      recurrence: { spec: { freq: "WEEKLY", byDay: ["MO"] } },
    });
    const originalDate = jstIso("2026-07-27T00:00");
    const del = await app.request(
      `/api/personal-events/${created.event.id}?scope=single&originalDate=${encodeURIComponent(originalDate)}`,
      { method: "DELETE", headers: { Cookie: u.cookie } },
    );
    expect(del.status).toBe(200);

    const cancelled = await dayDetail(u.cookie, "2026-07-27");
    const alive = await dayDetail(u.cookie, "2026-08-03");

    expect(cancelled.body.personalEvents).toEqual([]);
    expect(alive.body.personalEvents).toHaveLength(1);
  });
});
