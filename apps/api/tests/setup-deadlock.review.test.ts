import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import {
  createSchoolDepartment,
  createSemester,
  createSessionCookie,
  createTestUser,
  setupCompleteUser,
} from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

async function setupCompleteUserWithoutTimetable(db: ReturnType<typeof prisma>) {
  const { school, department } = await createSchoolDepartment(db);
  const user = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
  const semester = await createSemester(db, user.id);
  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: { defaultSemesterId: semester.id },
  });
  const cookie = await createSessionCookie(db, user.id);

  return { user: updatedUser, school, department, semester, cookie };
}

describe("setup deadlock review", () => {
  it("returns SETUP_REQUIRED from GET /api/today when the user has no setup fields", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request("/api/today", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(403);
    expectError(body, "SETUP_REQUIRED");
  });

  it("returns SETUP_REQUIRED from GET /api/today when the user has only a school", async () => {
    const db = prisma();
    const { school } = await createSchoolDepartment(db);
    const user = await createTestUser(db, { schoolId: school.id });
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request("/api/today", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(403);
    expectError(body, "SETUP_REQUIRED");
  });

  it("returns SETUP_REQUIRED from GET /api/today when school and department are set but no default semester is set", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const user = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request("/api/today", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(403);
    expectError(body, "SETUP_REQUIRED");
  });

  it("allows GET /api/today for school department semester complete users without a timetable", async () => {
    const db = prisma();
    const complete = await setupCompleteUserWithoutTimetable(db);

    const res = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(typeof body.date).toBe("string");
    expect(body.occurrences).toEqual([]);
  });

  it("keeps GET /api/today working for complete setup users with a timetable", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await app.request("/api/today?date=2026-05-13", { headers: { Cookie: complete.cookie } });

    expect(res.status).toBe(200);
  });

  it("allows setup-complete users without a timetable to create the first user timetable", async () => {
    const db = prisma();
    const complete = await setupCompleteUserWithoutTimetable(db);

    const res = await requestJson(app, "/api/user-timetables", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: {
        semesterId: complete.semester.id,
        title: "Home初回",
        daySlots: [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }],
        courses: [{ tempId: "c1", name: "OS" }],
        meetings: [{ courseTempId: "c1", dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 }],
      },
    });

    expect(res.status).not.toBe(403);
    expect(res.status).toBe(201);
  });

  it("reports setupStatus complete but hasUserTimetable false for semester-complete users without a timetable", async () => {
    const db = prisma();
    const complete = await setupCompleteUserWithoutTimetable(db);

    const res = await app.request("/api/me", { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.setupStatus).toMatchObject({
      hasSchool: true,
      hasDepartment: true,
      hasSemester: true,
      hasUserTimetable: false,
      isComplete: true,
    });
  });

  it("reports isComplete false from GET /api/me when only school is set", async () => {
    const db = prisma();
    const { school } = await createSchoolDepartment(db);
    const user = await createTestUser(db, { schoolId: school.id });
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request("/api/me", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.setupStatus.isComplete).toBe(false);
  });
});
