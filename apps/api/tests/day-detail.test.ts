import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, createSessionCookie, createTestUser, setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";

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
    const timetableSuspension = (await json(timetableSuspensionRes)).suspension;
    const personalEvent = await (db as any).personalEvent.create({
      data: {
        userId: complete.user.id,
        semesterId: complete.semester.id,
        date: new Date("2026-05-13T00:00:00.000Z"),
        title: "予定",
        isAllDay: true,
      },
    });

    const res = await app.request("/api/day/2026-05-13", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.date).toBe("2026-05-13");
    expect(Array.isArray(body.occurrences)).toBe(true);
    expect(Array.isArray(body.courseSuspensions)).toBe(true);
    expect(Array.isArray(body.personalEvents)).toBe(true);
    expect(body.occurrences.map((o: { id: string }) => o.id)).toContain(occurrence.id);
    expect(body.courseSuspensions.map((s: { id: string }) => s.id)).toEqual([courseSuspension.id]);
    expect(body.timetableSuspension).toMatchObject({ id: timetableSuspension.id, date: "2026-05-13" });
    expect(body.personalEvents.map((e: { id: string }) => e.id)).toContain(personalEvent.id);
  });

  it("[#30] active timetableなしでも personalEvents are returned with empty occurrences and null timetableSuspension", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);
    const personalEvent = await (db as any).personalEvent.create({
      data: { userId: user.id, date: new Date("2026-05-13T00:00:00.000Z"), title: "予定", isAllDay: true },
    });

    const res = await app.request("/api/day/2026-05-13", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.occurrences).toEqual([]);
    expect(body.courseSuspensions).toEqual([]);
    expect(body.timetableSuspension).toBeNull();
    expect(body.personalEvents.map((e: { id: string }) => e.id)).toEqual([personalEvent.id]);
  });

  it("[#31] GET /api/day/not-a-date returns 400", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await app.request("/api/day/not-a-date", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(JSON.stringify(body)).toContain("ZodError");
  });
});
