import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, createSchoolDepartment, createSemester, createSessionCookie, createTestUser, createUserTimetable, setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

describe("attendance API", () => {
  it("[§8 #46] mark-all-present creates PRESENT records only for unrecorded occurrences", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 0 });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 1, startMinute: 640, endMinute: 730 });

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13" },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.markedCount).toBe(2);
    await expect(db.attendanceRecord.count({ where: { userId: complete.user.id, status: "PRESENT" } })).resolves.toBe(2);
  });

  it("[§8 #47] mark-all-present skips existing AttendanceRecord rows and reports skippedCount", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const existing = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 0 });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 1, startMinute: 640, endMinute: 730 });
    await db.attendanceRecord.create({ data: { occurrenceId: existing.id, userId: complete.user.id, status: "ABSENT" } });

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13" },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ markedCount: 1, skippedCount: 1 });
    await expect(db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: existing.id } })).resolves.toMatchObject({ status: "ABSENT" });
  });

  it("[§8 #48] mark-all-present accepts an explicit past date", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-04-15T00:00:00.000Z") });

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-04-15" },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.date).toBe("2026-04-15");
    expect(body.markedCount).toBe(1);
  });

  it("[§8 #49] mark-all-present is atomic on failure and does not return markedCount=0 as success", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "not-a-date" },
    });

    expect(res.status).toBe(400);
    await expect(db.attendanceRecord.count()).resolves.toBe(0);
  });

  it("[§8 #50] POST /api/attendance/:occurrenceId upserts by overwriting existing status and updatedAt", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });
    await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "ABSENT" } });

    const res = await requestJson(app, `/api/attendance/${occurrence.id}`, {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { status: "PRESENT", note: "修正" },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.record).toMatchObject({ occurrenceId: occurrence.id, status: "PRESENT", note: "修正" });
  });

  it("[§8 #51] POST /api/attendance/:occurrenceId returns 404 for another user's occurrence", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const otherSchoolDept = await createSchoolDepartment(db);
    const other = await createTestUser(db, { email: "other@example.test", schoolId: otherSchoolDept.school.id, departmentId: otherSchoolDept.department.id });
    const otherSemester = await createSemester(db, other.id);
    await createUserTimetable(db, other.id, otherSemester.id);
    await db.user.update({ where: { id: other.id }, data: { defaultSemesterId: otherSemester.id } });
    const otherCookie = await createSessionCookie(db, other.id);
    const occurrence = await createOccurrence(db, { meetingId: owner.meeting.id, courseId: owner.course.id });

    const res = await requestJson(app, `/api/attendance/${occurrence.id}`, {
      method: "POST",
      headers: { Cookie: otherCookie },
      body: { status: "PRESENT" },
    });
    const body = await json(res);

    expect(res.status).toBe(404);
    expectError(body, "NOT_FOUND");
  });

  it("[§8 #52] POST /api/attendance/:occurrenceId returns 404 for a missing occurrence", async () => {
    const complete = await setupCompleteUser(prisma());

    const res = await requestJson(app, "/api/attendance/missing", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { status: "PRESENT" },
    });
    const body = await json(res);

    expect(res.status).toBe(404);
    expectError(body, "NOT_FOUND");
  });

  it("[§8 #53] DELETE /api/attendance/:occurrenceId removes a record so today returns status null", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });
    await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "PRESENT" } });

    const res = await app.request(`/api/attendance/${occurrence.id}`, {
      method: "DELETE",
      headers: { Cookie: complete.cookie },
    });
    const today = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const body = await json(today);

    expect(res.status).toBe(200);
    expect(body.occurrences[0].status).toBeNull();
  });

  it("[§8 #54] AttendanceRecord.userId is filled from session user, not request body", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });

    const res = await requestJson(app, `/api/attendance/${occurrence.id}`, {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { status: "PRESENT", userId: "attacker" },
    });
    const record = await db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: occurrence.id } });

    expect(res.status).toBe(200);
    expect(record.userId).toBe(complete.user.id);
  });
});
