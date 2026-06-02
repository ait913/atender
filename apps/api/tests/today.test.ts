import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, setupCompleteUser } from "./helpers/auth";
import { json } from "./helpers/http";

describe("today API", () => {
  it("[§8 #39] GET /api/today returns the Asia/Tokyo current date string", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") });

    const res = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.date).toBe("2026-05-13");
  });

  it("[§8 #40] GET /api/today?date=YYYY-MM-DD can fetch past dates", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-04-15T00:00:00.000Z") });

    const res = await app.request("/api/today?date=2026-04-15", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.occurrences).toHaveLength(1);
  });

  it("[§8 #41] GET /api/today returns only the active UserTimetable for User.defaultSemesterId", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") });

    const res = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.occurrences.every((o: { courseId: string }) => o.courseId === complete.course.id)).toBe(true);
  });

  it("[§8 #42] GET /api/today includes status when AttendanceRecord exists and null otherwise", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const recorded = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 0 });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 1, startMinute: 640, endMinute: 730 });
    await db.attendanceRecord.create({ data: { occurrenceId: recorded.id, userId: complete.user.id, status: "PRESENT" } });

    const res = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.occurrences.map((o: { status: string | null }) => o.status).sort()).toEqual(["PRESENT", null].sort());
  });

  it("[§8 #43] GET /api/today sorts occurrences by startMinute ascending", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 1, startMinute: 640, endMinute: 730 });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 0, startMinute: 540, endMinute: 630 });

    const res = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.occurrences.map((o: { startMinute: number }) => o.startMinute)).toEqual([540, 640]);
  });

  it("[§8 #44] periodCount=2 appears as two independent occurrences with periodOffset 0 and 1", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 0 });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 1, startMinute: 640, endMinute: 730 });

    const res = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.occurrences.map((o: { periodOffset: number }) => o.periodOffset)).toEqual([0, 1]);
  });

  it("[§8 #45] consecutive occurrence snapshots use different DaySlot minutes in increasing order", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 0, startMinute: 540, endMinute: 630 });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 1, startMinute: 640, endMinute: 730 });

    const res = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.occurrences[0].startMinute).toBeLessThan(body.occurrences[1].startMinute);
    expect(body.occurrences[0].endMinute).not.toBe(body.occurrences[1].endMinute);
  });

  it("[仕様9] GET /api/today の room は occurrence.meeting.room に追従する", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.meeting.update({ where: { id: complete.meeting.id }, data: { room: "B202" } });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") });

    const first = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const firstBody = await json(first);
    expect(first.status).toBe(200);
    expect(firstBody.occurrences[0].room).toBe("B202");

    await db.meeting.update({ where: { id: complete.meeting.id }, data: { room: "C303" } });
    const second = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const secondBody = await json(second);
    expect(second.status).toBe(200);
    expect(secondBody.occurrences[0].room).toBe("C303");
  });
});
