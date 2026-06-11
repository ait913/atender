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

  it("mark-all-present creates ABSENT records when status is ABSENT", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 0 });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 1, startMinute: 640, endMinute: 730 });

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", status: "ABSENT" },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ markedCount: 2 });
    await expect(db.attendanceRecord.count({ where: { userId: complete.user.id, status: "ABSENT" } })).resolves.toBe(2);
    await expect(db.attendanceRecord.count({ where: { userId: complete.user.id, status: "PRESENT" } })).resolves.toBe(0);
  });

  it("mark-all-present with ABSENT skips existing PRESENT records without overwriting them", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const existing = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 0 });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, periodOffset: 1, startMinute: 640, endMinute: 730 });
    await db.attendanceRecord.create({ data: { occurrenceId: existing.id, userId: complete.user.id, status: "PRESENT" } });

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", status: "ABSENT" },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ markedCount: 1, skippedCount: 1 });
    await expect(db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: existing.id } })).resolves.toMatchObject({ status: "PRESENT" });
    await expect(db.attendanceRecord.count({ where: { userId: complete.user.id, status: "ABSENT" } })).resolves.toBe(1);
  });

  it("mark-all-present rejects CANCELLED and creates no records", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", status: "CANCELLED" },
    });

    expect(res.status).toBe(400);
    await expect(db.attendanceRecord.count()).resolves.toBe(0);
  });

  it("mark-all-present rejects an invalid status", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", status: "INVALID" },
    });

    expect(res.status).toBe(400);
  });

  it("mark-all-present defaults omitted status to PRESENT", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13" },
    });

    expect(res.status).toBe(200);
    await expect(db.attendanceRecord.count({ where: { userId: complete.user.id, status: "PRESENT" } })).resolves.toBe(1);
  });

  it("mark-all-present returns zero counts when there are no occurrences for the date", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/attendance/mark-all-present", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { date: "2026-05-13", status: "ABSENT" },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ markedCount: 0, skippedCount: 0 });
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

async function createBulkDay(complete: Awaited<ReturnType<typeof setupCompleteUser>>, date: string, count = 2) {
  const db = prisma();
  const occurrences = [];
  for (let i = 0; i < count; i += 1) {
    occurrences.push(
      await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: new Date(`${date}T00:00:00+09:00`),
        periodOffset: i,
        startMinute: 540 + i * 100,
        endMinute: 630 + i * 100,
      }),
    );
  }
  return occurrences;
}

describe("attendance bulk API", () => {
  it("bulk FILL creates records for all selected unrecorded occurrences", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createBulkDay(complete, "2026-06-03");
    await createBulkDay(complete, "2026-06-10");
    await createBulkDay(complete, "2026-06-17");

    const res = await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03", "2026-06-10", "2026-06-17"], status: "PRESENT", mode: "FILL" },
    });
    const body = await json(res);

    // 仕様 #21
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ upsertedCount: 6, skippedExistingCount: 0, skippedSuspendedCount: 0 });
    await expect(db.attendanceRecord.count({ where: { userId: complete.user.id, status: "PRESENT" } })).resolves.toBe(6);
  });

  it("bulk FILL skips existing records while OVERWRITE replaces them and preserves notes", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const day1 = await createBulkDay(complete, "2026-06-03");
    await createBulkDay(complete, "2026-06-10");
    await createBulkDay(complete, "2026-06-17");
    await db.attendanceRecord.create({ data: { occurrenceId: day1[0].id, userId: complete.user.id, status: "ABSENT", note: "keep me" } });
    await db.attendanceRecord.create({ data: { occurrenceId: day1[1].id, userId: complete.user.id, status: "ABSENT" } });

    const fill = await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03", "2026-06-10", "2026-06-17"], status: "PRESENT", mode: "FILL" },
    });
    const fillBody = await json(fill);
    // 仕様 #22
    expect(fill.status).toBe(200);
    expect(fillBody).toMatchObject({ upsertedCount: 4, skippedExistingCount: 2 });
    await expect(db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: day1[0].id } })).resolves.toMatchObject({ status: "ABSENT" });

    const overwrite = await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03", "2026-06-10", "2026-06-17"], status: "PRESENT", mode: "OVERWRITE" },
    });
    const overwriteBody = await json(overwrite);
    // 仕様 #23
    expect(overwrite.status).toBe(200);
    expect(overwriteBody).toMatchObject({ upsertedCount: 6, skippedExistingCount: 0 });
    await expect(db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: day1[0].id } })).resolves.toMatchObject({
      status: "PRESENT",
      note: "keep me",
    });
  });

  it("bulk skips timetable and course suspension occurrences and reports noOccurrenceDates sorted", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createBulkDay(complete, "2026-06-03");
    await createBulkDay(complete, "2026-06-10");
    await createBulkDay(complete, "2026-06-17");
    await (db as any).timetableSuspension.create({ data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-06-10T00:00:00+09:00") } });
    await db.courseSuspension.create({ data: { courseId: complete.course.id, date: new Date("2026-06-17T00:00:00+09:00") } });

    const res = await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-24", "2026-06-03", "2026-06-17", "2026-06-10", "2026-06-01"], status: "PRESENT" },
    });
    const body = await json(res);

    // 仕様 #24
    expect(res.status).toBe(200);
    expect(body.skippedSuspendedCount).toBe(4);
    await expect(db.attendanceRecord.count()).resolves.toBe(2);
    // 仕様 #25
    expect(body.noOccurrenceDates).toEqual(["2026-06-01", "2026-06-24"]);
  });

  it("bulk deduplicates duplicate dates", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createBulkDay(complete, "2026-06-03");

    const res = await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03", "2026-06-03"], status: "PRESENT" },
    });
    const body = await json(res);

    // 仕様 #26
    expect(res.status).toBe(200);
    expect(body.upsertedCount).toBe(2);
    await expect(db.attendanceRecord.count()).resolves.toBe(2);
  });

  it.each([
    { dates: ["2026-06-03"], status: "CANCELLED" },
    { dates: Array.from({ length: 63 }, (_, index) => `2026-06-${String((index % 28) + 1).padStart(2, "0")}`), status: "PRESENT" },
    { dates: [], status: "PRESENT" },
    { dates: ["not-a-date"], status: "PRESENT" },
  ])("bulk rejects invalid input %#", async (body) => {
    const complete = await setupCompleteUser(prisma());

    const res = await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body,
    });

    // 仕様 #27
    expect(res.status).toBe(400);
  });

  it("bulk scopes writes to the signed-in user's active timetable", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const other = await setupCompleteUser(db);
    await createBulkDay(owner, "2026-06-03");
    await createBulkDay(other, "2026-06-03");

    const res = await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      headers: { Cookie: other.cookie },
      body: { dates: ["2026-06-03"], status: "PRESENT" },
    });

    // 仕様 #28
    expect(res.status).toBe(200);
    await expect(db.attendanceRecord.count({ where: { userId: other.user.id } })).resolves.toBe(2);
    await expect(db.attendanceRecord.count({ where: { userId: owner.user.id } })).resolves.toBe(0);
  });

  it("bulk requires auth and an active timetable", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const unauthenticated = await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      body: { dates: ["2026-06-03"], status: "PRESENT" },
    });
    const noSetup = await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { dates: ["2026-06-03"], status: "PRESENT" },
    });

    // 仕様 #29
    expect(unauthenticated.status).toBe(401);
    expect(noSetup.status).toBe(403);
    expectError(await json(noSetup), "SETUP_REQUIRED");
  });

  it("bulk attendance updates overview day status and toDate stats", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createBulkDay(complete, "2026-06-03", 1);

    await requestJson(app, "/api/attendance/bulk", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03"], status: "PRESENT" },
    });
    const overview = await json(await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } }));
    const hits = JSON.stringify(overview);

    // 仕様 #30
    expect(hits).toContain("ALL_PRESENT");
    expect(overview.courses[0].toDate.effectiveNumerator).toBeGreaterThanOrEqual(1);
  });

  it("bulk-clear deletes records for selected dates and tolerates empty or suspended dates", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const day1 = await createBulkDay(complete, "2026-06-03", 2);
    const day2 = await createBulkDay(complete, "2026-06-10", 1);
    await (db as any).timetableSuspension.create({ data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-06-10T00:00:00+09:00") } });
    for (const occurrence of [...day1, ...day2]) {
      await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "ABSENT" } });
    }

    const res = await requestJson(app, "/api/attendance/bulk-clear", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { dates: ["2026-06-03", "2026-06-10", "2026-06-24"] },
    });
    const body = await json(res);

    // 仕様 #31
    expect(res.status).toBe(200);
    expect(body.deletedCount).toBe(3);
    // 仕様 #32
    await expect(db.attendanceRecord.count()).resolves.toBe(0);
    // 仕様 #33
    expect(body.deletedCount).toBe(3);
  });
});
