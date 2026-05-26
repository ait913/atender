import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSessionCookie, createTestUser, setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

function bulkBody(userTimetableId: string, courseId: string, startPeriodIndexes: number[], dayOfWeek = 1) {
  return { userTimetableId, courseId, dayOfWeek, startPeriodIndexes };
}

describe("meeting bulk create endpoint", () => {
  it("splits mixed continuous and single periods into meeting groups", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/meetings/bulk", {
      method: "POST",
      headers: cookieHeader(user.cookie),
      body: bulkBody(user.userTimetable.id, user.course.id, [1, 2, 4]),
    });
    expect(res.status).toBe(201);
    const meetings = (await json(res) as any).meetings;
    expect(meetings.map((meeting: any) => ({
      startPeriodIndex: meeting.startPeriodIndex,
      periodCount: meeting.periodCount,
    }))).toEqual([
      { startPeriodIndex: 1, periodCount: 2 },
      { startPeriodIndex: 4, periodCount: 1 },
    ]);
  });

  it("creates one meeting for a fully continuous selection", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/meetings/bulk", {
      method: "POST",
      headers: cookieHeader(user.cookie),
      body: bulkBody(user.userTimetable.id, user.course.id, [1, 2, 3]),
    });
    expect(res.status).toBe(201);
    const meetings = (await json(res) as any).meetings;
    expect(meetings).toHaveLength(1);
    expect(meetings[0]).toMatchObject({ startPeriodIndex: 1, periodCount: 3 });
  });

  it("creates one-period meetings for non-contiguous selections", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/meetings/bulk", {
      method: "POST",
      headers: cookieHeader(user.cookie),
      body: bulkBody(user.userTimetable.id, user.course.id, [2, 5, 7]),
    });
    expect(res.status).toBe(201);
    const meetings = (await json(res) as any).meetings;
    expect(meetings.map((meeting: any) => ({
      startPeriodIndex: meeting.startPeriodIndex,
      periodCount: meeting.periodCount,
    }))).toEqual([
      { startPeriodIndex: 2, periodCount: 1 },
      { startPeriodIndex: 5, periodCount: 1 },
      { startPeriodIndex: 7, periodCount: 1 },
    ]);
  });

  it("returns PERIOD_CONFLICT and rolls back all groups on any conflict", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);
    await db.meeting.create({
      data: {
        userTimetableId: user.userTimetable.id,
        courseId: user.course.id,
        dayOfWeek: 1,
        startPeriodIndex: 2,
        periodCount: 1,
      },
    });

    const before = await db.meeting.count({ where: { userTimetableId: user.userTimetable.id, dayOfWeek: 1 } });
    const res = await requestJson(app, "/api/meetings/bulk", {
      method: "POST",
      headers: cookieHeader(user.cookie),
      body: bulkBody(user.userTimetable.id, user.course.id, [1, 2, 4]),
    });
    expect(res.status).toBe(409);
    const body = await json(res) as any;
    expectError(body, "PERIOD_CONFLICT");
    expect(body.error.details.conflictPeriod).toBe(2);
    expect(await db.meeting.count({ where: { userTimetableId: user.userTimetable.id, dayOfWeek: 1 } })).toBe(before);
  });

  it("validates non-empty period arrays and max period indexes", async () => {
    const db = prisma();
    const user = await setupCompleteUser(db);

    for (const startPeriodIndexes of [[], [13]]) {
      const res = await requestJson(app, "/api/meetings/bulk", {
        method: "POST",
        headers: cookieHeader(user.cookie),
        body: bulkBody(user.userTimetable.id, user.course.id, startPeriodIndexes),
      });
      expect(res.status).toBe(400);
    }
  });

  it("requires auth and setup completion", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const incomplete = await createTestUser(db);
    const incompleteCookie = await createSessionCookie(db, incomplete.id);

    const unauthenticated = await requestJson(app, "/api/meetings/bulk", {
      method: "POST",
      body: bulkBody(complete.userTimetable.id, complete.course.id, [1]),
    });
    expect(unauthenticated.status).toBe(401);
    expectError(await json(unauthenticated), "UNAUTHORIZED");

    const setupRequired = await requestJson(app, "/api/meetings/bulk", {
      method: "POST",
      headers: cookieHeader(incompleteCookie),
      body: bulkBody(complete.userTimetable.id, complete.course.id, [1]),
    });
    expect(setupRequired.status).toBe(403);
    expectError(await json(setupRequired), "SETUP_REQUIRED");
  });
});
