import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, createSemester, createSessionCookie, createTestUser, createUserTimetable, setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

type DayStatusHit = { date?: string; status?: string };

function collectDayStatusHits(value: unknown, hits: DayStatusHit[] = []): DayStatusHit[] {
  if (!value || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    for (const item of value) collectDayStatusHits(item, hits);
    return hits;
  }

  const object = value as Record<string, unknown>;
  if (typeof object.date === "string" && typeof object.status === "string") {
    hits.push({ date: object.date, status: object.status });
  }
  for (const [key, nested] of Object.entries(object)) {
    if (typeof nested === "string" && key.match(/^\d{4}-\d{2}-\d{2}$/) && typeof object[key] === "string") {
      hits.push({ date: key, status: object[key] as string });
    }
    collectDayStatusHits(nested, hits);
  }
  return hits;
}

describe("semesters API", () => {
  it("[§8 #22] POST /api/semesters rejects startDate later than endDate", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/semesters", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { name: "逆転学期", startDate: "2026-10-01", endDate: "2026-04-01" },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expectError(body, "VALIDATION_ERROR");
  });

  it("[§8 #23] DELETE /api/semesters/:id returns 409 when a UserTimetable exists", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const semester = await createSemester(db, user.id);
    await createUserTimetable(db, user.id, semester.id);
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request(`/api/semesters/${semester.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    const body = await json(res);

    expect(res.status).toBe(409);
    expectError(body, "CONFLICT");
  });

  it("[§8 #24] GET/PATCH/DELETE on another user's Semester returns 403", async () => {
    const db = prisma();
    const owner = await createTestUser(db, { email: "owner@example.test" });
    const other = await createTestUser(db, { email: "other@example.test" });
    const semester = await createSemester(db, owner.id);
    const cookie = await createSessionCookie(db, other.id);

    const getRes = await app.request(`/api/semesters/${semester.id}`, { headers: { Cookie: cookie } });
    const patchRes = await requestJson(app, `/api/semesters/${semester.id}`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { name: "変更" },
    });
    const deleteRes = await app.request(`/api/semesters/${semester.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });

    expect(getRes.status).toBe(403);
    expectError(await json(getRes), "FORBIDDEN");
    expect(patchRes.status).toBe(403);
    expectError(await json(patchRes), "FORBIDDEN");
    expect(deleteRes.status).toBe(403);
    expectError(await json(deleteRes), "FORBIDDEN");
  });

  it("[#9] overview contains ALL_SUSPENDED for a date with one occurrence and a timetable suspension", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") });
    await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);
    const hits = collectDayStatusHits(body);

    expect(res.status).toBe(200);
    // 設計不足: overview response の day summary キー名は明記されていないため、配列/マップ双方を再帰走査する。
    expect(hits).toEqual(expect.arrayContaining([{ date: "2026-05-13", status: "ALL_SUSPENDED" }]));
  });

  it("[#12] overview does not show ALL_SUSPENDED for a timetable suspension date with zero occurrences", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);
    const hits = collectDayStatusHits(body).filter((hit) => hit.date === "2026-05-13");

    expect(res.status).toBe(200);
    // 仕様は「status に現れない or NO_CLASS」。少なくとも休講表示 ALL_SUSPENDED は出さない。
    expect(hits.some((hit) => hit.status === "ALL_SUSPENDED")).toBe(false);
  });
});
