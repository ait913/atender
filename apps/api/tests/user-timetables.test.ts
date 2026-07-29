import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import {
  createOccurrence,
  createSchoolDepartment,
  createSemester,
  createSessionCookie,
  createTestUser,
  createUserTimetable,
  setupCompleteUser,
} from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

describe("user timetables API", () => {
  it("[§8 #35] POST /api/user-timetables returns 409 for same user same semester", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const semester = await createSemester(db, user.id);
    await createUserTimetable(db, user.id, semester.id);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/user-timetables", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { semesterId: semester.id, title: "重複", daySlots: [], courses: [], meetings: [] },
    });
    const body = await json(res);

    expect(res.status).toBe(409);
    expectError(body, "CONFLICT");
  });

  it("[§8 #36] POST /api/user-timetables inserts courses and meetings in one transaction resolving courseTempId", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const semester = await createSemester(db, user.id);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/user-timetables", {
      method: "POST",
      headers: { Cookie: cookie },
      body: {
        semesterId: semester.id,
        title: "新規時間割",
        daySlots: [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }],
        courses: [{ tempId: "c1", name: "OS" }],
        meetings: [{ courseTempId: "c1", dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 }],
      },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.userTimetable.courses).toHaveLength(1);
    expect(body.userTimetable.meetings[0].courseId).toBe(body.userTimetable.courses[0].id);
  });

  it("[§8 #37] PATCH /api/user-timetables/:id with empty meetings cascades occurrences and attendance records", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });
    await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "PRESENT" } });

    const res = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { meetings: [] },
    });

    expect(res.status).toBe(200);
    await expect(db.meetingOccurrence.count({ where: { id: occurrence.id } })).resolves.toBe(0);
    await expect(db.attendanceRecord.count({ where: { occurrenceId: occurrence.id } })).resolves.toBe(0);
  });

  it("[§8 #38] publish-as-template uses User.schoolId/User.departmentId and does not require sourceTemplateId", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}/publish-as-template`, {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { title: "自作公開", description: "自作から公開", year: 2, term: "前期" },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.template).toMatchObject({
      schoolId: complete.school.id,
      departmentId: complete.department.id,
      copyCount: 0,
      title: "自作公開",
    });
  });

  it("[§8 #38a] publish-as-template returns SCHOOL_OR_DEPT_NOT_SET if user school or department is null", async () => {
    const db = prisma();
    const { school } = await createSchoolDepartment(db);
    const user = await createTestUser(db, { schoolId: school.id, departmentId: null });
    const semester = await createSemester(db, user.id);
    const { userTimetable } = await createUserTimetable(db, user.id, semester.id);
    await db.user.update({ where: { id: user.id }, data: { defaultSemesterId: semester.id } });
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, `/api/user-timetables/${userTimetable.id}/publish-as-template`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: { title: "公開不可" },
    });
    const body = await json(res);

    expect(res.status).toBe(403);
    expectError(body, /SETUP_REQUIRED|SCHOOL_OR_DEPT_NOT_SET/);
  });
});

describe("user timetables daysOfWeek", () => {
  it("POST /api/user-timetables returns default weekday daysOfWeek", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const semester = await createSemester(db, user.id);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/user-timetables", {
      method: "POST",
      headers: { Cookie: cookie },
      body: {
        semesterId: semester.id,
        title: "新規時間割",
        daySlots: [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }],
        courses: [{ tempId: "c1", name: "OS" }],
        meetings: [{ courseTempId: "c1", dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 }],
      },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("PATCH daysOfWeek accepts all weekdays and weekends", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("PATCH daysOfWeek normalizes unordered values ascending", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { daysOfWeek: [6, 1, 3] },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 3, 6]);
  });

  it("PATCH daysOfWeek rejects duplicate values with VALIDATION_ERROR", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { daysOfWeek: [1, 1, 2] },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("daysOfWeek");
  });

  it("PATCH daysOfWeek rejects an empty array with VALIDATION_ERROR", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { daysOfWeek: [] },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("daysOfWeek");
  });

  it.each([[[0]], [[8]]])("PATCH daysOfWeek rejects out-of-range value %j with VALIDATION_ERROR", async (daysOfWeek) => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { daysOfWeek },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("daysOfWeek");
  });

  it("PATCH daysOfWeek does not change existing occurrence count or schedule fields", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });

    const baselineRes = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { title: complete.userTimetable.title },
    });
    expect(baselineRes.status).toBe(200);

    const before = await db.meetingOccurrence.findMany({
      where: { meetingId: complete.meeting.id },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }, { endMinute: "asc" }],
      select: { date: true, startMinute: true, endMinute: true },
    });

    const res = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
    });

    const after = await db.meetingOccurrence.findMany({
      where: { meetingId: complete.meeting.id },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }, { endMinute: "asc" }],
      select: { date: true, startMinute: true, endMinute: true },
    });

    expect(res.status).toBe(200);
    expect(after).toEqual(before);
  });
});
