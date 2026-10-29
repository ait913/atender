// day detail API — 既存 #29/#31
// A2: personalEvents は削除済み (AD5)
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";

async function dayDetail(cookie: string, date: string) {
  const res = await app.request(`/api/day/${date}`, { headers: { Cookie: cookie } });
  return { res, body: (await json(res)) as any };
}

describe("day detail API", () => {
  it("[#29] GET /api/day/:date returns occurrences, same-day courseSuspensions, timetableSuspension and no personalEvents key (AD5)", async () => {
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
    const { res, body } = await dayDetail(complete.cookie, "2026-05-13");

    expect(res.status).toBe(200);
    expect(body.date).toBe("2026-05-13");
    expect(Array.isArray(body.occurrences)).toBe(true);
    expect(Array.isArray(body.courseSuspensions)).toBe(true);
    expect(body).not.toHaveProperty("personalEvents");
    expect(body.occurrences.map((o: { id: string }) => o.id)).toContain(occurrence.id);
    expect(body.courseSuspensions.map((s: { id: string }) => s.id)).toEqual([courseSuspension.id]);
    expect(body.timetableSuspension).toMatchObject({ id: timetableSuspension.id, date: "2026-05-13" });
  });

  it("[#31] GET /api/day/not-a-date returns 400", async () => {
    const complete = await setupCompleteUser(prisma());

    const res = await app.request("/api/day/not-a-date", { headers: { Cookie: complete.cookie } });

    expect(res.status).toBe(400);
  });
});
