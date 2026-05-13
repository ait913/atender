import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import {
  createSchoolDepartment,
  createSemester,
  createSessionCookie,
  createTestUser,
  createUserTimetable,
  setupCompleteUser,
} from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

describe("setup guard and /api/me", () => {
  it("[§8 #13] setup-incomplete users get SETUP_REQUIRED on GET /api/today", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request("/api/today", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(403);
    expectError(body, "SETUP_REQUIRED");
  });

  it("[§8 #14] setup-incomplete users get SETUP_REQUIRED on GET /api/user-timetables/:id", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const semester = await createSemester(db, user.id);
    const { userTimetable } = await createUserTimetable(db, user.id, semester.id);
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request(`/api/user-timetables/${userTimetable.id}`, { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(403);
    expectError(body, "SETUP_REQUIRED");
  });

  it("[§8 #15] setup-incomplete users may call setup-building endpoints", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const me = await app.request("/api/me", { headers: { Cookie: cookie } });
    const school = await requestJson(app, "/api/schools", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { name: "未完了ユーザー学校", kind: "UNIVERSITY", prefecture: "千葉県" },
    });
    const schoolBody = await json(school);
    const department = await requestJson(app, `/api/schools/${schoolBody.school.id}/departments`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: { name: "情報処理科" },
    });
    const semester = await requestJson(app, "/api/semesters", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { name: "2026 前期", startDate: "2026-04-01", endDate: "2026-09-30" },
    });

    expect(me.status).toBe(200);
    expect(school.status).toBe(201);
    expect(department.status).toBe(201);
    expect(semester.status).toBe(201);
  });

  it("[§8 #16] GET /api/me returns setupStatus booleans as the AND of school department semester timetable", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await app.request("/api/me", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.setupStatus).toMatchObject({
      hasSchool: true,
      hasDepartment: true,
      hasSemester: true,
      hasUserTimetable: true,
      isComplete: true,
    });
  });

  it("[§8 #16a] PATCH /api/me { schoolId } updates schoolId only when no department is already set", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const { school } = await createSchoolDepartment(db);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/me", {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { schoolId: school.id },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.user.schoolId).toBe(school.id);
  });

  it("[§8 #16b] PATCH /api/me rejects departmentId whose schoolId differs from supplied schoolId", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const a = await createSchoolDepartment(db, { schoolName: "A大学" });
    const b = await createSchoolDepartment(db, { schoolName: "B大学" });
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/me", {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { schoolId: a.school.id, departmentId: b.department.id },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expectError(body, "VALIDATION_ERROR");
    expect(body.error.details.reason).toBe("DEPARTMENT_SCHOOL_MISMATCH");
  });

  it("[§8 #16c] PATCH /api/me { departmentId } rejects a department outside current User.schoolId", async () => {
    const db = prisma();
    const a = await createSchoolDepartment(db, { schoolName: "A大学" });
    const b = await createSchoolDepartment(db, { schoolName: "B大学" });
    const user = await createTestUser(db, { schoolId: a.school.id });
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/me", {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { departmentId: b.department.id },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expectError(body, "VALIDATION_ERROR");
  });

  it("[§8 #16d] PATCH /api/me rejects another user's defaultSemesterId with 404", async () => {
    const db = prisma();
    const user = await createTestUser(db, { email: "user@example.test" });
    const other = await createTestUser(db, { email: "other@example.test" });
    const otherSemester = await createSemester(db, other.id);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/me", {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { defaultSemesterId: otherSemester.id },
    });
    const body = await json(res);

    expect(res.status).toBe(404);
    expectError(body, "NOT_FOUND");
  });
});
