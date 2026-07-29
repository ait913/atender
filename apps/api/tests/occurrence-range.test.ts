// 授業 occurrence の範囲取得 — §8 API1-API11
// 設計doc: .designs/20260729-eventkit-dedicated-calendar-export.md §6.1 / §8 API
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, createSessionCookie, createTestUser, setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

const THURSDAYS = ["2026-07-23", "2026-07-30", "2026-08-06", "2026-08-13"];

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

async function range(cookie: string | null, query: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const res = await app.request(`/api/occurrences${query}`, { headers });
  return { res, body: (await json(res)) as any };
}

async function seedThursdays(complete: Awaited<ReturnType<typeof setupCompleteUser>>) {
  const db = prisma();
  for (const date of THURSDAYS) {
    await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: utcMidnight(date),
      periodOffset: 0,
      startMinute: 540,
      endMinute: 630,
    });
  }
}

describe("§8 API. GET /api/occurrences", () => {
  it("[API1] 範囲内の occurrence を hasActiveTimetable=true で返す", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await seedThursdays(complete);

    const { res, body } = await range(complete.cookie, "?from=2026-07-20&to=2026-08-16");

    expect(res.status).toBe(200);
    expect(body.from).toBe("2026-07-20");
    expect(body.to).toBe("2026-08-16");
    expect(body.hasActiveTimetable).toBe(true);
    expect(body.occurrences.map((o: any) => o.date)).toEqual(THURSDAYS);
    for (const occurrence of body.occurrences) {
      expect(occurrence.courseName).toBe("オペレーティングシステム");
      expect(occurrence.room).toBe("305");
      expect(occurrence.startMinute).toBe(540);
      expect(occurrence.endMinute).toBe(630);
      expect(typeof occurrence.meetingId).toBe("string");
      expect(typeof occurrence.courseId).toBe("string");
      expect(typeof occurrence.periodIndex).toBe("number");
      expect(typeof occurrence.periodOffset).toBe("number");
    }
  });

  it("[API2] 範囲外の日は含まない", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await seedThursdays(complete);

    const { res, body } = await range(complete.cookie, "?from=2026-07-24&to=2026-07-29");

    expect(res.status).toBe(200);
    expect(body.occurrences).toEqual([]);
  });

  it("[API3] 日境界は JST で切る", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await seedThursdays(complete);
    // 前日 (JST 7/22) の授業 — JST 境界なら 7/23 の照会に出てはいけない
    await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: utcMidnight("2026-07-22"),
      periodOffset: 0,
      startMinute: 540,
      endMinute: 630,
    });
    // JST 7/23 00:00 ちょうど (= UTC 7/22 15:00) の行 — JST 境界なら 7/23 に含まれる
    await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: new Date("2026-07-22T15:00:00.000Z"),
      periodOffset: 1,
      startMinute: 640,
      endMinute: 730,
    });

    const { res, body } = await range(complete.cookie, "?from=2026-07-23&to=2026-07-23");

    expect(res.status).toBe(200);
    expect(body.occurrences.map((o: any) => o.date)).toEqual(["2026-07-23", "2026-07-23"]);
    expect(body.occurrences.map((o: any) => o.periodOffset).sort()).toEqual([0, 1]);
  });

  it("[API4] 時間割が無い user は hasActiveTimetable=false + 空配列 (200)", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const { res, body } = await range(cookie, "?from=2026-07-20&to=2026-08-16");

    expect(res.status).toBe(200);
    expect(body.hasActiveTimetable).toBe(false);
    expect(body.occurrences).toEqual([]);
    expect(body.courseSuspensions).toEqual([]);
    expect(body.timetableSuspensions).toEqual([]);
  });

  it("[API5] 休講は occurrence を消さずに別配列で返す", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await seedThursdays(complete);
    await requestJson(app, "/api/timetable-suspensions", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-07-23" },
    });
    await db.courseSuspension.create({
      data: { courseId: complete.course.id, date: utcMidnight("2026-07-30"), reason: "科目休講" },
    });

    const { res, body } = await range(complete.cookie, "?from=2026-07-20&to=2026-08-16");

    expect(res.status).toBe(200);
    expect(body.occurrences).toHaveLength(4);
    expect(body.timetableSuspensions.map((s: any) => s.date)).toEqual(["2026-07-23"]);
    expect(body.courseSuspensions.map((s: any) => s.date)).toEqual(["2026-07-30"]);
    expect(body.courseSuspensions[0].courseId).toBe(complete.course.id);
  });

  it("[API6] 出欠ステータスが occurrence に載る", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await seedThursdays(complete);
    const target = await db.meetingOccurrence.findFirst({
      where: { date: utcMidnight("2026-07-23") },
    });
    await db.attendanceRecord.create({
      data: { occurrenceId: target!.id, userId: complete.user.id, status: "CANCELLED" },
    });

    const { body } = await range(complete.cookie, "?from=2026-07-20&to=2026-08-16");
    const hit = body.occurrences.find((o: any) => o.id === target!.id);

    expect(hit.status).toBe("CANCELLED");
  });

  it("[API7] 範囲上限 (366 日超は 400 RANGE_TOO_LARGE)", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const tooLarge = await range(complete.cookie, "?from=2026-01-01&to=2027-06-01");
    expect(tooLarge.res.status).toBe(400);
    expectError(tooLarge.body, "RANGE_TOO_LARGE");

    const ok = await range(complete.cookie, "?from=2026-01-01&to=2027-01-01");
    expect(ok.res.status).toBe(200);
  });

  it("[API8] to < from は 400", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const { res } = await range(complete.cookie, "?from=2026-08-01&to=2026-07-01");
    expect(res.status).toBe(400);
  });

  it("[API9] from / to は必須", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    expect((await range(complete.cookie, "?from=2026-07-20")).res.status).toBe(400);
    expect((await range(complete.cookie, "")).res.status).toBe(400);
  });

  it("[API10] 未認証は 401", async () => {
    const { res } = await range(null, "?from=2026-07-20&to=2026-08-16");
    expect(res.status).toBe(401);
  });

  it("[API11] 他人の occurrence は混ざらない", async () => {
    const db = prisma();
    const mine = await setupCompleteUser(db, { email: `mine_${Date.now()}@example.test` });
    const other = await setupCompleteUser(db, { email: `other_${Date.now()}@example.test` });
    await seedThursdays(mine);
    await createOccurrence(db, {
      meetingId: other.meeting.id,
      courseId: other.course.id,
      date: utcMidnight("2026-07-23"),
    });

    const { body } = await range(mine.cookie, "?from=2026-07-20&to=2026-08-16");

    expect(body.occurrences).toHaveLength(4);
    for (const occurrence of body.occurrences) {
      expect(occurrence.meetingId).toBe(mine.meeting.id);
    }
  });
});
