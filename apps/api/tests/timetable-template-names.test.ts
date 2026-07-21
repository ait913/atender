import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSchoolDepartment, createSessionCookie, createTestUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";

async function createPublicTemplate(
  db = prisma(),
  authorUserId: string,
  schoolId: string,
  departmentId: string,
  title = "2026 前期 情報処理科 2年",
) {
  const template = await db.timetableTemplate.create({
    data: {
      authorUserId,
      schoolId,
      departmentId,
      title,
      description: "共有テンプレ",
      year: 2,
      term: "前期",
      isPublic: true,
    },
  });

  await db.templateDaySlot.createMany({
    data: [
      { templateId: template.id, periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 },
      { templateId: template.id, periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730 },
    ],
  });

  const course = await db.templateCourse.create({
    data: { templateId: template.id, name: "OS", teacher: "山田", color: "#ffffff" },
  });

  await db.templateMeeting.create({
    data: {
      templateId: template.id,
      courseId: course.id,
      dayOfWeek: 3,
      startPeriodIndex: 1,
      periodCount: 2,
      room: "305",
    },
  });

  return template;
}

function expectTemplateNames(
  template: { schoolName?: unknown; departmentName?: unknown; schoolId?: unknown; departmentId?: unknown },
  school: { id: string; name: string },
  department: { id: string; name: string },
) {
  expect(template.schoolName).toBe(school.name);
  expect(template.departmentName).toBe(department.name);
  expect(template.schoolName).not.toBe(school.id);
  expect(template.departmentName).not.toBe(department.id);
}

function expectExistingFields(
  template: {
    schoolId?: unknown;
    departmentId?: unknown;
    title?: unknown;
    copyCount?: unknown;
    daySlots?: unknown;
    courses?: unknown;
    meetings?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  },
  expected: { schoolId: string; departmentId: string; title: string },
) {
  expect(template.schoolId).toBe(expected.schoolId);
  expect(template.departmentId).toBe(expected.departmentId);
  expect(template.title).toBe(expected.title);
  expect(template.copyCount).toBe(0);
  expect(template.createdAt).toEqual(expect.any(String));
  expect(template.updatedAt).toEqual(expect.any(String));
  expect(template.daySlots).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 }),
      expect.objectContaining({ periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730 }),
    ]),
  );
  expect(template.courses).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "OS", teacher: "山田", color: "#ffffff" })]),
  );
  expect(template.meetings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ dayOfWeek: 3, startPeriodIndex: 1, periodCount: 2, room: "305" }),
    ]),
  );
}

describe("timetable template schoolName and departmentName contract", () => {
  it("[A1/A5] GET /api/timetable-templates returns schoolName departmentName and preserves existing fields", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db, {
      schoolName: "○○大学",
      departmentName: "情報処理科",
    });
    const author = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
    const viewer = await createTestUser(db, { email: "viewer-a1@example.test" });
    const created = await createPublicTemplate(db, author.id, school.id, department.id, "2026 前期 情報処理科 2年");
    const cookie = await createSessionCookie(db, viewer.id);

    const res = await app.request(
      `/api/timetable-templates?schoolId=${encodeURIComponent(school.id)}&departmentId=${encodeURIComponent(department.id)}`,
      { headers: { Cookie: cookie } },
    );
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.templates).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
    const template = body.templates.find((item: { id: string }) => item.id === created.id);
    expectTemplateNames(template, school, department);
    expectExistingFields(template, {
      schoolId: school.id,
      departmentId: department.id,
      title: "2026 前期 情報処理科 2年",
    });
  });

  it("[A2] GET /api/timetable-templates/:id returns schoolName and departmentName for a public template", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db, {
      schoolName: "□□専門学校",
      departmentName: "ネットワーク科",
    });
    const author = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
    const viewer = await createTestUser(db, { email: "viewer-a2@example.test" });
    const created = await createPublicTemplate(db, author.id, school.id, department.id, "ネットワーク特講");
    const cookie = await createSessionCookie(db, viewer.id);

    const res = await app.request(`/api/timetable-templates/${created.id}`, { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.template.id).toBe(created.id);
    expectTemplateNames(body.template, school, department);
  });

  it("[A3] POST /api/timetable-templates returns schoolName and departmentName in the created template", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db, {
      schoolName: "△△大学",
      departmentName: "ゲーム制作科",
    });
    const author = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
    const cookie = await createSessionCookie(db, author.id);

    const res = await requestJson(app, "/api/timetable-templates", {
      method: "POST",
      headers: { Cookie: cookie },
      body: {
        schoolId: school.id,
        departmentId: department.id,
        title: "2026 前期 ゲーム制作科 1年",
        daySlots: [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }],
        courses: [],
        meetings: [],
      },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.template.title).toBe("2026 前期 ゲーム制作科 1年");
    expectTemplateNames(body.template, school, department);
  });

  it("[A4] PATCH /api/timetable-templates/:id returns schoolName and departmentName for the author's template", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db, {
      schoolName: "◇◇大学",
      departmentName: "データサイエンス科",
    });
    const author = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
    const created = await createPublicTemplate(db, author.id, school.id, department.id, "更新前の時間割");
    const cookie = await createSessionCookie(db, author.id);

    const res = await requestJson(app, `/api/timetable-templates/${created.id}`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { title: "更新後の時間割" },
    });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.template.id).toBe(created.id);
    expect(body.template.title).toBe("更新後の時間割");
    expectTemplateNames(body.template, school, department);
  });

  it("[A6] GET /api/timetable-templates keeps schoolId departmentId q filters and updatedAt desc ordering", async () => {
    const db = prisma();
    const first = await createSchoolDepartment(db, {
      schoolName: "○○大学",
      departmentName: "情報処理科",
    });
    const second = await createSchoolDepartment(db, {
      schoolName: "□□専門学校",
      departmentName: "ネットワーク科",
    });
    const firstAuthor = await createTestUser(db, {
      email: "author-a6-first@example.test",
      schoolId: first.school.id,
      departmentId: first.department.id,
    });
    const secondAuthor = await createTestUser(db, {
      email: "author-a6-second@example.test",
      schoolId: second.school.id,
      departmentId: second.department.id,
    });
    const viewer = await createTestUser(db, { email: "viewer-a6@example.test" });

    const oldTarget = await createPublicTemplate(db, firstAuthor.id, first.school.id, first.department.id, "OS 基礎");
    const newTarget = await createPublicTemplate(db, firstAuthor.id, first.school.id, first.department.id, "OS 応用");
    const titleMiss = await createPublicTemplate(db, firstAuthor.id, first.school.id, first.department.id, "データベース論");
    const departmentMiss = await createPublicTemplate(db, secondAuthor.id, second.school.id, second.department.id, "OS 基礎");

    await db.timetableTemplate.update({
      where: { id: oldTarget.id },
      data: { updatedAt: new Date("2026-05-01T00:00:00.000Z") },
    });
    await db.timetableTemplate.update({
      where: { id: newTarget.id },
      data: { updatedAt: new Date("2026-06-01T00:00:00.000Z") },
    });
    await db.timetableTemplate.update({
      where: { id: titleMiss.id },
      data: { updatedAt: new Date("2026-07-01T00:00:00.000Z") },
    });
    await db.timetableTemplate.update({
      where: { id: departmentMiss.id },
      data: { updatedAt: new Date("2026-08-01T00:00:00.000Z") },
    });

    const cookie = await createSessionCookie(db, viewer.id);
    const res = await app.request(
      `/api/timetable-templates?schoolId=${encodeURIComponent(first.school.id)}&departmentId=${encodeURIComponent(first.department.id)}&q=${encodeURIComponent("OS")}`,
      { headers: { Cookie: cookie } },
    );
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.templates.map((template: { id: string }) => template.id)).toEqual([newTarget.id, oldTarget.id]);
    expect(body.templates.map((template: { id: string }) => template.id)).not.toContain(titleMiss.id);
    expect(body.templates.map((template: { id: string }) => template.id)).not.toContain(departmentMiss.id);
    for (const template of body.templates) {
      expectTemplateNames(template, first.school, first.department);
      expect(template.schoolId).toBe(first.school.id);
      expect(template.departmentId).toBe(first.department.id);
      expect(template.title).toContain("OS");
    }
  });
});
