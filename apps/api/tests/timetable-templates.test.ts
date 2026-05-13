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

async function createTemplate(db = prisma(), authorUserId: string, schoolId: string, departmentId: string, title = "2026 前期 情報処理科 2年") {
  const template = await db.timetableTemplate.create({
    data: { authorUserId, schoolId, departmentId, title, description: "共有テンプレ", year: 2, term: "前期", isPublic: true },
  });
  await db.templateDaySlot.createMany({
    data: [
      { templateId: template.id, periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 },
      { templateId: template.id, periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730 },
    ],
  });
  const course = await db.templateCourse.create({
    data: { templateId: template.id, name: "OS", teacher: "山田", room: "305", color: "#ffffff", totalSessions: 15 },
  });
  await db.templateMeeting.create({
    data: { templateId: template.id, courseId: course.id, dayOfWeek: 3, startPeriodIndex: 1, periodCount: 2 },
  });
  return template;
}

describe("timetable templates API", () => {
  it("[§8 #25] GET /api/timetable-templates filters public templates by schoolId departmentId and updatedAt desc", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
    const viewer = await createTestUser(db, { email: "viewer@example.test" });
    await createTemplate(db, author.id, school.id, department.id, "古いテンプレ");
    const newer = await createTemplate(db, author.id, school.id, department.id, "新しいテンプレ");
    await db.timetableTemplate.update({ where: { id: newer.id }, data: { updatedAt: new Date("2026-05-13T00:00:00.000Z") } });
    const cookie = await createSessionCookie(db, viewer.id);

    const res = await app.request(`/api/timetable-templates?schoolId=${school.id}&departmentId=${department.id}`, { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.templates.map((t: { title: string }) => t.title)).toContain("新しいテンプレ");
    expect(body.templates.every((t: { schoolId: string; departmentId: string; isPublic: boolean }) => t.schoolId === school.id && t.departmentId === department.id && t.isPublic)).toBe(true);
  });

  it("[§8 #26] GET /api/timetable-templates supports q title search without schoolId", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db);
    const viewer = await createTestUser(db, { email: "viewer@example.test" });
    await createTemplate(db, author.id, school.id, department.id, "ネットワーク特講");
    await createTemplate(db, author.id, school.id, department.id, "データベース論");
    const cookie = await createSessionCookie(db, viewer.id);

    const res = await app.request("/api/timetable-templates?q=ネットワーク", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0].title).toBe("ネットワーク特講");
  });

  it("[§8 #27] POST /api/timetable-templates returns 404 for missing school or department", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/timetable-templates", {
      method: "POST",
      headers: { Cookie: cookie },
      body: {
        schoolId: "missing",
        departmentId: "missing",
        title: "存在しない所属",
        daySlots: [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }],
        courses: [],
        meetings: [],
      },
    });
    const body = await json(res);

    expect(res.status).toBe(404);
    expectError(body, "NOT_FOUND");
  });

  it("[§8 #28] POST /api/timetable-templates/:id/copy returns 409 when user semester already has a timetable", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const template = await createTemplate(db, complete.user.id, complete.school.id, complete.department.id);

    const res = await requestJson(app, `/api/timetable-templates/${template.id}/copy`, {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { semesterId: complete.semester.id },
    });
    const body = await json(res);

    expect(res.status).toBe(409);
    expectError(body, "CONFLICT");
  });

  it("[§8 #29] template copy increments copyCount", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db);
    const copier = await createTestUser(db, { email: "copy@example.test" });
    const semester = await createSemester(db, copier.id);
    const template = await createTemplate(db, author.id, school.id, department.id);
    const cookie = await createSessionCookie(db, copier.id);

    const res = await requestJson(app, `/api/timetable-templates/${template.id}/copy`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: { semesterId: semester.id },
    });

    expect(res.status).toBe(201);
    await expect(db.timetableTemplate.findUniqueOrThrow({ where: { id: template.id } })).resolves.toMatchObject({ copyCount: 1 });
  });

  it("[§8 #30] template copy deep-copies DaySlot Course Meeting with new ids", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db);
    const copier = await createTestUser(db, { email: "copy@example.test" });
    const semester = await createSemester(db, copier.id);
    const template = await createTemplate(db, author.id, school.id, department.id);
    const originalCourse = await db.templateCourse.findFirstOrThrow({ where: { templateId: template.id } });
    const cookie = await createSessionCookie(db, copier.id);

    const res = await requestJson(app, `/api/timetable-templates/${template.id}/copy`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: { semesterId: semester.id },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.userTimetable.courses[0].name).toBe(originalCourse.name);
    expect(body.userTimetable.courses[0].id).not.toBe(originalCourse.id);
    expect(body.userTimetable.daySlots).toHaveLength(2);
    expect(body.userTimetable.meetings).toHaveLength(1);
  });

  it("[§8 #31] copied UserTimetable keeps sourceTemplateId lineage", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db);
    const copier = await createTestUser(db, { email: "copy@example.test" });
    const semester = await createSemester(db, copier.id);
    const template = await createTemplate(db, author.id, school.id, department.id);
    const cookie = await createSessionCookie(db, copier.id);

    const res = await requestJson(app, `/api/timetable-templates/${template.id}/copy`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: { semesterId: semester.id },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.userTimetable.sourceTemplateId).toBe(template.id);
  });

  it("[§8 #32] deleting a source Template nulls UserTimetable.sourceTemplateId but leaves timetable", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db);
    const copier = await createTestUser(db, { email: "copy@example.test" });
    const semester = await createSemester(db, copier.id);
    const template = await createTemplate(db, author.id, school.id, department.id);
    const cookie = await createSessionCookie(db, copier.id);
    const copyRes = await requestJson(app, `/api/timetable-templates/${template.id}/copy`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: { semesterId: semester.id },
    });
    const copied = await json(copyRes);

    await db.timetableTemplate.delete({ where: { id: template.id } });
    const userTimetable = await db.userTimetable.findUniqueOrThrow({ where: { id: copied.userTimetable.id } });

    expect(userTimetable.sourceTemplateId).toBeNull();
  });

  it("[§8 #33] PATCH /api/timetable-templates/:id by non-author returns 403", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db, { email: "author@example.test" });
    const other = await createTestUser(db, { email: "other@example.test" });
    const template = await createTemplate(db, author.id, school.id, department.id);
    const cookie = await createSessionCookie(db, other.id);

    const res = await requestJson(app, `/api/timetable-templates/${template.id}`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { title: "乗っ取り" },
    });
    const body = await json(res);

    expect(res.status).toBe(403);
    expectError(body, "FORBIDDEN");
  });

  it("[§8 #34] DELETE /api/timetable-templates/:id by non-author returns 403", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db, { email: "author@example.test" });
    const other = await createTestUser(db, { email: "other@example.test" });
    const template = await createTemplate(db, author.id, school.id, department.id);
    const cookie = await createSessionCookie(db, other.id);

    const res = await app.request(`/api/timetable-templates/${template.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    const body = await json(res);

    expect(res.status).toBe(403);
    expectError(body, "FORBIDDEN");
  });
});
