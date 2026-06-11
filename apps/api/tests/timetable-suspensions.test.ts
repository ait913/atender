import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, createSessionCookie, createTestUser, setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

describe("timetable suspensions API", () => {
  it("[#6] POST /api/timetable-suspensions creates a suspension and day detail returns it", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/timetable-suspensions", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13" },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.suspension).toMatchObject({ userTimetableId: complete.userTimetable.id, date: "2026-05-13" });

    const dayRes = await app.request("/api/day/2026-05-13", { headers: { Cookie: complete.cookie } });
    const dayBody = await json(dayRes);
    expect(dayRes.status).toBe(200);
    expect(dayBody.timetableSuspension).toMatchObject({ id: body.suspension.id, date: "2026-05-13" });
  });

  it("[#7] duplicate POST for the same date and timetable returns 409 DUPLICATE", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    await requestJson(app, "/api/timetable-suspensions", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13" },
    });
    const res = await requestJson(app, "/api/timetable-suspensions", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13" },
    });
    const body = await json(res);

    expect(res.status).toBe(409);
    expectError(body, "DUPLICATE");
  });

  it("[#11] DELETE of another user's timetable suspension returns 404", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const other = await setupCompleteUser(db);
    const suspension = await (db as any).timetableSuspension.create({
      data: { userTimetableId: owner.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const res = await app.request(`/api/timetable-suspensions/${suspension.id}`, {
      method: "DELETE",
      headers: { Cookie: other.cookie },
    });
    const body = await json(res);

    expect(res.status).toBe(404);
    expectError(body, "NOT_FOUND");
  });

  it("[API A] GET /api/timetable-suspensions?from&to returns only range matches in date asc order", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    for (const date of ["2026-05-20", "2026-05-10", "2026-06-01"]) {
      await requestJson(app, "/api/timetable-suspensions", {
        method: "POST",
        headers: { Cookie: complete.cookie },
        body: { date },
      });
    }

    const res = await app.request("/api/timetable-suspensions?from=2026-05-11&to=2026-06-01", {
      headers: { Cookie: complete.cookie },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.suspensions.map((s: { date: string }) => s.date)).toEqual(["2026-05-20", "2026-06-01"]);
  });

  it("[API A] POST without an active timetable returns 403 SETUP_REQUIRED", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/timetable-suspensions", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { date: "2026-05-13" },
    });
    const body = await json(res);

    expect(res.status).toBe(403);
    expectError(body, "SETUP_REQUIRED");
  });

  it("[API A] DELETE /api/timetable-suspensions/:id returns ok true", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const suspension = await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const res = await app.request(`/api/timetable-suspensions/${suspension.id}`, {
      method: "DELETE",
      headers: { Cookie: complete.cookie },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

describe("bulk timetable suspensions API", () => {
  it("bulk creates suspensions for all selected dates and exposes them in day detail", async () => {
    const complete = await setupCompleteUser(prisma());

    const res = await requestJson(app, "/api/timetable-suspensions/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03", "2026-06-10", "2026-06-17"], reason: "学校行事" },
    });
    const body = await json(res);
    const day = await json(await app.request("/api/day/2026-06-10", { headers: { Cookie: complete.cookie } }));

    // 仕様 #34
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ createdCount: 3, skippedCount: 0 });
    expect(day.timetableSuspension).toMatchObject({ date: "2026-06-10", reason: "学校行事" });
  });

  it("bulk skips existing dates without returning 409", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await (db as any).timetableSuspension.create({ data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-06-03T00:00:00+09:00") } });

    const res = await requestJson(app, "/api/timetable-suspensions/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03", "2026-06-10", "2026-06-17"] },
    });
    const body = await json(res);

    // 仕様 #35
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ createdCount: 2, skippedCount: 1 });
  });

  it("bulk-remove deletes existing dates and ignores missing ones", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    for (const date of ["2026-06-03", "2026-06-10"]) {
      await (db as any).timetableSuspension.create({ data: { userTimetableId: complete.userTimetable.id, date: new Date(`${date}T00:00:00+09:00`) } });
    }

    const res = await requestJson(app, "/api/timetable-suspensions/bulk-remove", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03", "2026-06-10", "2026-06-17"] },
    });
    const body = await json(res);

    // 仕様 #36
    expect(res.status).toBe(200);
    expect(body.removedCount).toBe(2);
    await expect((db as any).timetableSuspension.count()).resolves.toBe(0);
  });

  it("bulk suspension updates overview status and excludes suspended occurrences from stats", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-06-03T00:00:00+09:00") });

    await requestJson(app, "/api/timetable-suspensions/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03"] },
    });
    const overview = await json(await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } }));
    const stats = await json(await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } }));

    // 仕様 #37
    expect(JSON.stringify(overview)).toContain("ALL_SUSPENDED");
    expect(stats.courses[0].counts.suspended).toBeGreaterThanOrEqual(1);
  });

  it("bulk validates setup and date array bounds", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const noSetup = await requestJson(app, "/api/timetable-suspensions/bulk", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { dates: ["2026-06-03"] },
    });
    const empty = await requestJson(app, "/api/timetable-suspensions/bulk", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { dates: [] },
    });
    const tooMany = await requestJson(app, "/api/timetable-suspensions/bulk-remove", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { dates: Array.from({ length: 63 }, (_, index) => `2026-06-${String((index % 28) + 1).padStart(2, "0")}`) },
    });

    // 仕様 #38
    expect(noSetup.status).toBe(403);
    expect(empty.status).toBe(400);
    expect(tooMany.status).toBe(400);
  });
});
