import { describe, it, expect } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

function jstDayOfWeek(date: Date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
}

describe("meetings API", () => {
  it("[仕様15] PATCH /api/meetings/:id で room のみ変更すると occurrence の id・行数は不変", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const first = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 0 });
    const second = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 1, startMinute: 640, endMinute: 730 });

    const res = await requestJson(app, `/api/meetings/${complete.meeting.id}`, {
      method: "PATCH",
      headers: cookieHeader(complete.cookie),
      body: { room: "A301" },
    });
    const body = await json(res) as any;

    expect(res.status).toBe(200);
    expect(body.meeting.room).toBe("A301");
    await expect(db.meeting.findUniqueOrThrow({ where: { id: complete.meeting.id } })).resolves.toMatchObject({ room: "A301" });
    const occurrences = await db.meetingOccurrence.findMany({ where: { meetingId: complete.meeting.id }, orderBy: { periodOffset: "asc" } });
    expect(occurrences.map(o => o.id)).toEqual([first.id, second.id]);
  });

  it("[仕様16] PATCH /api/meetings/:id で dayOfWeek を変えると該当 meeting の occurrence が新曜日で再生成される", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const oldOccurrence = await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: new Date("2026-05-13T00:00:00.000Z"),
    });

    const res = await requestJson(app, `/api/meetings/${complete.meeting.id}`, {
      method: "PATCH",
      headers: cookieHeader(complete.cookie),
      body: { dayOfWeek: 4 },
    });

    expect(res.status).toBe(200);
    await expect(db.meetingOccurrence.count({ where: { id: oldOccurrence.id } })).resolves.toBe(0);
    const regenerated = await db.meetingOccurrence.findMany({ where: { meetingId: complete.meeting.id } });
    expect(regenerated.length).toBeGreaterThan(0);
    expect(regenerated.every(o => jstDayOfWeek(o.date) === 4)).toBe(true);
  });

  it("[仕様17] PATCH /api/meetings/:id で他授業と時限が重なると 409 PERIOD_CONFLICT になり Meeting は変更されない", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.meeting.create({
      data: {
        userTimetableId: complete.userTimetable.id,
        courseId: complete.course.id,
        dayOfWeek: 3,
        startPeriodIndex: 4,
        periodCount: 1,
        room: "B202",
      },
    });

    const res = await requestJson(app, `/api/meetings/${complete.meeting.id}`, {
      method: "PATCH",
      headers: cookieHeader(complete.cookie),
      body: { startPeriodIndex: 4, periodCount: 1 },
    });
    const body = await json(res);

    expect(res.status).toBe(409);
    expectError(body, "PERIOD_CONFLICT");
    await expect(db.meeting.findUniqueOrThrow({ where: { id: complete.meeting.id } })).resolves.toMatchObject({
      dayOfWeek: 3,
      startPeriodIndex: 1,
      periodCount: 2,
    });
  });

  it("[仕様18] DELETE /api/meetings/:id は meeting と occurrence/attendance を cascade 削除し同 course の他 meeting は残す", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const otherMeeting = await db.meeting.create({
      data: {
        userTimetableId: complete.userTimetable.id,
        courseId: complete.course.id,
        dayOfWeek: 5,
        startPeriodIndex: 3,
        periodCount: 1,
        room: "C303",
      },
    });
    const deletedOccurrence = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });
    const otherOccurrence = await createOccurrence(db, {
      meetingId: otherMeeting.id,
      courseId: complete.course.id,
      date: new Date("2026-05-15T00:00:00.000Z"),
    });
    await db.attendanceRecord.create({ data: { occurrenceId: deletedOccurrence.id, userId: complete.user.id, status: "PRESENT" } });

    const res = await app.request(`/api/meetings/${complete.meeting.id}`, {
      method: "DELETE",
      headers: cookieHeader(complete.cookie),
    });
    const body = await json(res) as any;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    await expect(db.meeting.count({ where: { id: complete.meeting.id } })).resolves.toBe(0);
    await expect(db.meetingOccurrence.count({ where: { id: deletedOccurrence.id } })).resolves.toBe(0);
    await expect(db.attendanceRecord.count({ where: { occurrenceId: deletedOccurrence.id } })).resolves.toBe(0);
    await expect(db.meeting.count({ where: { id: otherMeeting.id } })).resolves.toBe(1);
    await expect(db.meetingOccurrence.count({ where: { id: otherOccurrence.id } })).resolves.toBe(1);
  });
});
