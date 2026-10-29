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

// Reviewer 生成: build 21 設計 §5.1-5.2 / §7.C (C1-C19) のみを根拠。
// 実装は読んでいない。

type Db = ReturnType<typeof prisma>;

async function seedTemplate(
  db: Db,
  opts: {
    authorUserId: string | null;
    schoolId: string;
    departmentId: string;
    title?: string;
    isPublic?: boolean;
    copyCount?: number;
    daysOfWeek?: string | null;
    meetingDays?: number[];
    sourceUserTimetableId?: string | null;
  },
) {
  const t = await db.timetableTemplate.create({
    data: {
      authorUserId: opts.authorUserId,
      schoolId: opts.schoolId,
      departmentId: opts.departmentId,
      title: opts.title ?? "テンプレ",
      isPublic: opts.isPublic ?? true,
      copyCount: opts.copyCount ?? 0,
      daysOfWeek: opts.daysOfWeek ?? null,
      sourceUserTimetableId: opts.sourceUserTimetableId ?? null,
    },
  });
  await db.templateDaySlot.createMany({
    data: [
      { templateId: t.id, periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 },
      { templateId: t.id, periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730 },
    ],
  });
  const course = await db.templateCourse.create({ data: { templateId: t.id, name: "OS", teacher: "山田", color: "#ffffff" } });
  for (const d of opts.meetingDays ?? [3]) {
    await db.templateMeeting.create({
      data: { templateId: t.id, courseId: course.id, dayOfWeek: d, startPeriodIndex: 1, periodCount: 1, room: "305" },
    });
  }
  return t;
}

async function publish(c: { cookie: string; userTimetable: { id: string } }, body: Record<string, unknown> = { title: "公開" }) {
  const res = await requestJson(app, `/api/user-timetables/${c.userTimetable.id}/publish-as-template`, {
    method: "POST",
    headers: { Cookie: c.cookie },
    body,
  });
  return { res, body: await json(res) };
}

async function copy(cookie: string, templateId: string, body: Record<string, unknown>) {
  const res = await requestJson(app, `/api/timetable-templates/${templateId}/copy`, {
    method: "POST",
    headers: { Cookie: cookie },
    body,
  });
  return { res, body: await json(res) };
}

describe("[b21 C1-C6] publish-as-template upsert", () => {
  it("[C1] first publish: 201, sourceUserTimetableId and daysOfWeek recorded", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    await db.userTimetable.update({ where: { id: c.userTimetable.id }, data: { daysOfWeek: "1,2,3,4,5,6" } });

    const { res, body } = await publish(c);

    expect(res.status).toBe(201);
    const row = await db.timetableTemplate.findUniqueOrThrow({ where: { id: body.template.id } });
    expect(row.sourceUserTimetableId).toBe(c.userTimetable.id);
    expect(row.daysOfWeek).toBe("1,2,3,4,5,6");
    expect(body.template.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("[C2] second publish: 200, same template, title updated, copyCount kept, content rebuilt from the UT", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const first = await publish(c, { title: "初回" });
    expect(first.res.status).toBe(201);
    await db.timetableTemplate.update({ where: { id: first.body.template.id }, data: { copyCount: 5 } });
    // UT に科目 + コマを足す
    const extra = await db.course.create({ data: { userTimetableId: c.userTimetable.id, name: "追加科目", color: "#112233" } });
    await db.meeting.create({
      data: { userTimetableId: c.userTimetable.id, courseId: extra.id, dayOfWeek: 5, startPeriodIndex: 3, periodCount: 1 },
    });

    const second = await publish(c, { title: "更新後" });

    expect(second.res.status).toBe(200);
    expect(second.body.template.id).toBe(first.body.template.id);
    expect(second.body.template.title).toBe("更新後");
    expect(second.body.template.isPublic).toBe(true);
    await expect(db.timetableTemplate.count({ where: { sourceUserTimetableId: c.userTimetable.id } })).resolves.toBe(1);
    await expect(db.timetableTemplate.count({ where: { authorUserId: c.user.id } })).resolves.toBe(1);
    const row = await db.timetableTemplate.findUniqueOrThrow({ where: { id: first.body.template.id } });
    expect(row.copyCount).toBe(5);
    await expect(db.templateCourse.count({ where: { templateId: row.id } })).resolves.toBe(
      await db.course.count({ where: { userTimetableId: c.userTimetable.id } }),
    );
    await expect(db.templateMeeting.count({ where: { templateId: row.id } })).resolves.toBe(
      await db.meeting.count({ where: { userTimetableId: c.userTimetable.id } }),
    );
    await expect(db.templateDaySlot.count({ where: { templateId: row.id } })).resolves.toBe(
      await db.daySlot.count({ where: { userTimetableId: c.userTimetable.id } }),
    );
  });

  it("[C2b] third publish is still 200 and still one template", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    await publish(c, { title: "a" });
    await publish(c, { title: "b" });
    const third = await publish(c, { title: "c" });
    expect(third.res.status).toBe(200);
    await expect(db.timetableTemplate.count({ where: { sourceUserTimetableId: c.userTimetable.id } })).resolves.toBe(1);
  });

  it("[C3] second publish after the user's department changed moves the template", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const first = await publish(c);
    const other = await createSchoolDepartment(db, { schoolName: "別の学校", departmentName: "別の学科" });
    await db.user.update({ where: { id: c.user.id }, data: { schoolId: other.school.id, departmentId: other.department.id } });

    const second = await publish(c);

    expect(second.res.status).toBe(200);
    expect(second.body.template.id).toBe(first.body.template.id);
    const row = await db.timetableTemplate.findUniqueOrThrow({ where: { id: first.body.template.id } });
    expect(row.schoolId).toBe(other.school.id);
    expect(row.departmentId).toBe(other.department.id);
  });

  it("[C4] publishing a UT whose template was made private flips the same template back to public (200)", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const first = await publish(c);
    await db.timetableTemplate.update({ where: { id: first.body.template.id }, data: { isPublic: false } });

    const second = await publish(c);

    expect(second.res.status).toBe(200);
    expect(second.body.template.id).toBe(first.body.template.id);
    await expect(db.timetableTemplate.findUniqueOrThrow({ where: { id: first.body.template.id } })).resolves.toMatchObject({ isPublic: true });
  });

  it("[C5] different UTs publish to different templates (201 each)", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const sem2 = await createSemester(db, c.user.id, { name: "2026 後期", startDate: new Date("2026-10-01T00:00:00.000Z"), endDate: new Date("2027-03-31T00:00:00.000Z") });
    const second = await createUserTimetable(db, c.user.id, sem2.id, { title: "後期" });

    const a = await publish(c, { title: "前期" });
    const b2 = await publish({ cookie: c.cookie, userTimetable: second.userTimetable }, { title: "後期" });

    expect(a.res.status).toBe(201);
    expect(b2.res.status).toBe(201);
    expect(b2.body.template.id).not.toBe(a.body.template.id);
    const rows = await db.timetableTemplate.findMany({ where: { authorUserId: c.user.id, sourceUserTimetableId: { not: null } } });
    expect(new Set(rows.map((r) => r.sourceUserTimetableId))).toEqual(new Set([c.userTimetable.id, second.userTimetable.id]));
  });

  it("[C6] school/department not set: 403 SCHOOL_OR_DEPT_NOT_SET and no template", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    await db.user.update({ where: { id: c.user.id }, data: { departmentId: null } });
    const { res, body } = await publish(c);
    expect(res.status).toBe(403);
    expectError(body, /SETUP_REQUIRED|SCHOOL_OR_DEPT_NOT_SET/); // 既存 §8 #38a と同じ許容 (setup guard が先に当たる)
    await expect(db.timetableTemplate.count()).resolves.toBe(0);
  });

  it("[§5.2.1-4] an existing linked template owned by someone else is detached (source -> null) and a new one is created (201)", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const stranger = await createTestUser(db, { email: "stranger@example.test" });
    const stale = await seedTemplate(db, {
      authorUserId: stranger.id,
      schoolId: c.school.id,
      departmentId: c.department.id,
      sourceUserTimetableId: c.userTimetable.id,
    });

    const { res, body } = await publish(c);

    expect(res.status).toBe(201);
    expect(body.template.id).not.toBe(stale.id);
    await expect(db.timetableTemplate.findUniqueOrThrow({ where: { id: stale.id } })).resolves.toMatchObject({ sourceUserTimetableId: null });
    await expect(db.timetableTemplate.findUniqueOrThrow({ where: { id: body.template.id } })).resolves.toMatchObject({
      sourceUserTimetableId: c.userTimetable.id,
      authorUserId: c.user.id,
    });
  });

  it("[§5.2.1-4] an anonymised (author null) linked template is also detached and replaced by a new one", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const orphan = await seedTemplate(db, {
      authorUserId: null,
      schoolId: c.school.id,
      departmentId: c.department.id,
      sourceUserTimetableId: c.userTimetable.id,
    });
    const { res, body } = await publish(c);
    expect(res.status).toBe(201);
    expect(body.template.id).not.toBe(orphan.id);
    await expect(db.timetableTemplate.findUniqueOrThrow({ where: { id: orphan.id } })).resolves.toMatchObject({ sourceUserTimetableId: null });
  });

  it("[§2/§5.2.1] publishing a UT with zero courses/meetings is still accepted by the API (iOS skips it client-side)", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const user = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
    const sem = await createSemester(db, user.id);
    const cookie = await createSessionCookie(db, user.id);
    const create = await requestJson(app, "/api/user-timetables", {
      method: "POST",
      headers: { Cookie: cookie },
      body: {
        semesterId: sem.id,
        title: "空",
        daySlots: [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }],
        courses: [],
        meetings: [],
      },
    });
    const ut = (await json(create)).userTimetable;

    const { res, body } = await publish({ cookie, userTimetable: ut }, { title: "空公開" });

    expect(res.status).toBe(201);
    expect(body.template.meetings).toEqual([]);
    expect(body.template.sourceUserTimetableId ?? ut.id).toBe(ut.id);
  });
});

describe("[b21 unpublish] PATCH /api/timetable-templates/:id { isPublic:false }", () => {
  it("author can unpublish; the template disappears from the public list; re-publish revives it", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const viewer = await createTestUser(db, { email: "viewer@example.test" });
    const viewerCookie = await createSessionCookie(db, viewer.id);
    const pub = await publish(c);
    const listUrl = `/api/timetable-templates?schoolId=${c.school.id}&departmentId=${c.department.id}`;
    const ids = async () => (await json(await app.request(listUrl, { headers: { Cookie: viewerCookie } }))).templates.map((t: { id: string }) => t.id);
    expect(await ids()).toContain(pub.body.template.id);

    const patch = await requestJson(app, `/api/timetable-templates/${pub.body.template.id}`, {
      method: "PATCH",
      headers: { Cookie: c.cookie },
      body: { isPublic: false },
    });
    expect(patch.status).toBe(200);
    expect(await ids()).not.toContain(pub.body.template.id);

    const again = await publish(c);
    expect(again.res.status).toBe(200);
    expect(await ids()).toContain(pub.body.template.id);
  });

  it("non-author unpublish is 403 FORBIDDEN (unchanged)", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const other = await createTestUser(db, { email: "other@example.test" });
    const otherCookie = await createSessionCookie(db, other.id);
    const pub = await publish(c);
    const res = await requestJson(app, `/api/timetable-templates/${pub.body.template.id}`, {
      method: "PATCH",
      headers: { Cookie: otherCookie },
      body: { isPublic: false },
    });
    expect(res.status).toBe(403);
    expectError(await json(res), "FORBIDDEN");
  });
});

describe("[b21 §5.2.3] GET /api/timetable-templates DTO", () => {
  it("daysOfWeek is an int array for new templates and null for legacy rows; schoolName / departmentName present", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db, { schoolName: "テスト大学", departmentName: "情報科学科" });
    const author = await createTestUser(db);
    const viewer = await createTestUser(db, { email: "viewer@example.test" });
    const cookie = await createSessionCookie(db, viewer.id);
    const withDays = await seedTemplate(db, { authorUserId: author.id, schoolId: school.id, departmentId: department.id, daysOfWeek: "1,2,3,4,5,6", title: "new" });
    const legacy = await seedTemplate(db, { authorUserId: author.id, schoolId: school.id, departmentId: department.id, daysOfWeek: null, title: "old" });

    const res = await app.request(`/api/timetable-templates?schoolId=${school.id}&departmentId=${department.id}`, { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    const a = body.templates.find((t: { id: string }) => t.id === withDays.id);
    const b = body.templates.find((t: { id: string }) => t.id === legacy.id);
    expect(a.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);
    expect(b.daysOfWeek).toBeNull();
    expect(a.schoolName).toBe("テスト大学");
    expect(a.departmentName).toBe("情報科学科");
    expect(a).toHaveProperty("copyCount");
    expect(Array.isArray(a.meetings)).toBe(true);
  });
});

describe("[b21 C7-C14] copy with replaceExisting", () => {
  async function setup(opts: { templateDays?: string | null; meetingDays?: number[]; suffix?: string } = {}) {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db, { email: `author${opts.suffix ?? ""}@example.test` });
    const me = await createTestUser(db, { email: `me${opts.suffix ?? ""}@example.test`, schoolId: school.id, departmentId: department.id });
    const semester = await createSemester(db, me.id);
    const cookie = await createSessionCookie(db, me.id);
    const template = await seedTemplate(db, {
      authorUserId: author.id,
      schoolId: school.id,
      departmentId: department.id,
      daysOfWeek: opts.templateDays === undefined ? null : opts.templateDays,
      meetingDays: opts.meetingDays,
    });
    return { db, school, department, author, me, semester, cookie, template };
  }

  it("[C7] no UT in the semester: 201, daysOfWeek inherited from the template", async () => {
    const s = await setup({ templateDays: "1,2,3,4,5,6" });
    const { res, body } = await copy(s.cookie, s.template.id, { semesterId: s.semester.id });
    expect(res.status).toBe(201);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.userTimetable.sourceTemplateId).toBe(s.template.id);
  });

  it("[C7b] template daysOfWeek wins over meeting derivation", async () => {
    const s = await setup({ templateDays: "1,2,3", meetingDays: [6] });
    const { res, body } = await copy(s.cookie, s.template.id, { semesterId: s.semester.id });
    expect(res.status).toBe(201);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 2, 3]);
  });

  it("[C8] template daysOfWeek null + Saturday meeting: [1,2,3,4,5,6]", async () => {
    const s = await setup({ templateDays: null, meetingDays: [3, 6] });
    const { res, body } = await copy(s.cookie, s.template.id, { semesterId: s.semester.id });
    expect(res.status).toBe(201);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("[C9] template daysOfWeek null + Sunday meeting (0): [1,2,3,4,5,7]", async () => {
    const s = await setup({ templateDays: null, meetingDays: [0] });
    const { res, body } = await copy(s.cookie, s.template.id, { semesterId: s.semester.id });
    expect(res.status).toBe(201);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 2, 3, 4, 5, 7]);
  });

  it("[C9b] Saturday + Sunday: [1,2,3,4,5,6,7]; weekday-only meetings: [1,2,3,4,5]", async () => {
    const s1 = await setup({ templateDays: null, meetingDays: [6, 0] });
    const r1 = await copy(s1.cookie, s1.template.id, { semesterId: s1.semester.id });
    expect(r1.body.userTimetable.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const s2 = await setup({ templateDays: null, meetingDays: [1, 2], suffix: "2" });
    const r2 = await copy(s2.cookie, s2.template.id, { semesterId: s2.semester.id });
    expect(r2.body.userTimetable.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("[C10] UT exists, replaceExisting omitted / false: 409 CONFLICT, existing UT and attendance untouched", async () => {
    const s = await setup();
    const existing = await createUserTimetable(s.db, s.me.id, s.semester.id, { title: "既存" });
    const occ = await createOccurrence(s.db, { meetingId: existing.meeting.id, courseId: existing.course.id });
    await s.db.attendanceRecord.create({ data: { occurrenceId: occ.id, userId: s.me.id, status: "PRESENT" } });

    for (const body of [{ semesterId: s.semester.id }, { semesterId: s.semester.id, replaceExisting: false }]) {
      const r = await copy(s.cookie, s.template.id, body);
      expect(r.res.status).toBe(409);
      expectError(r.body, "CONFLICT");
    }
    await expect(s.db.userTimetable.findUniqueOrThrow({ where: { id: existing.userTimetable.id } })).resolves.toMatchObject({ title: "既存" });
    await expect(s.db.attendanceRecord.count({ where: { occurrenceId: occ.id } })).resolves.toBe(1);
    await expect(s.db.timetableTemplate.findUniqueOrThrow({ where: { id: s.template.id } })).resolves.toMatchObject({ copyCount: 0 });
  });

  it("[C11] replaceExisting:true replaces everything (meetings, occurrences, attendance, suspensions, transfers) and regenerates occurrences", async () => {
    const s = await setup();
    const existing = await createUserTimetable(s.db, s.me.id, s.semester.id, { title: "既存" });
    const meeting2 = await s.db.meeting.create({
      data: { userTimetableId: existing.userTimetable.id, courseId: existing.course.id, dayOfWeek: 4, startPeriodIndex: 3, periodCount: 1 },
    });
    const occs = [
      await createOccurrence(s.db, { meetingId: existing.meeting.id, courseId: existing.course.id, date: new Date("2026-05-13T00:00:00.000Z") }),
      await createOccurrence(s.db, { meetingId: existing.meeting.id, courseId: existing.course.id, date: new Date("2026-05-20T00:00:00.000Z") }),
      await createOccurrence(s.db, { meetingId: meeting2.id, courseId: existing.course.id, date: new Date("2026-05-14T00:00:00.000Z") }),
    ];
    for (const o of occs) {
      await s.db.attendanceRecord.create({ data: { occurrenceId: o.id, userId: s.me.id, status: "ABSENT" } });
    }
    const susp = await s.db.courseSuspension.create({ data: { courseId: existing.course.id, date: new Date("2026-06-03T00:00:00.000Z") } });
    const tsusp = await s.db.timetableSuspension.create({ data: { userTimetableId: existing.userTimetable.id, date: new Date("2026-06-10T00:00:00.000Z") } });
    const transfer = await s.db.classTransfer.create({
      data: { userTimetableId: existing.userTimetable.id, date: new Date("2026-06-17T00:00:00.000Z"), kind: "MOVE_DAY", sourceDayOfWeek: 3 },
    });

    const { res, body } = await copy(s.cookie, s.template.id, { semesterId: s.semester.id, replaceExisting: true });

    expect(res.status).toBe(201);
    expect(body.userTimetable.id).not.toBe(existing.userTimetable.id);
    expect(body.userTimetable.sourceTemplateId).toBe(s.template.id);
    await expect(s.db.userTimetable.count({ where: { id: existing.userTimetable.id } })).resolves.toBe(0);
    await expect(s.db.meetingOccurrence.count({ where: { id: { in: occs.map((o) => o.id) } } })).resolves.toBe(0);
    await expect(s.db.attendanceRecord.count({ where: { userId: s.me.id } })).resolves.toBe(0);
    await expect(s.db.courseSuspension.count({ where: { id: susp.id } })).resolves.toBe(0);
    await expect(s.db.timetableSuspension.count({ where: { id: tsusp.id } })).resolves.toBe(0);
    await expect(s.db.classTransfer.count({ where: { id: transfer.id } })).resolves.toBe(0);
    await expect(s.db.userTimetable.count({ where: { userId: s.me.id, semesterId: s.semester.id } })).resolves.toBe(1);
    // 新しい時間割は template の内容 (科目 "OS"、meeting 1 件) で、occurrences が生成済み
    expect(body.userTimetable.courses.map((c: { name: string }) => c.name)).toEqual(["OS"]);
    expect(body.userTimetable.meetings).toHaveLength(1);
    const newMeetingIds = body.userTimetable.meetings.map((m: { id: string }) => m.id);
    expect(await s.db.meetingOccurrence.count({ where: { meetingId: { in: newMeetingIds } } })).toBeGreaterThan(0);
    // 新しい時間割には旧い出欠が残っていない
    const newOccIds = (await s.db.meetingOccurrence.findMany({ where: { meetingId: { in: newMeetingIds } } })).map((o) => o.id);
    await expect(s.db.attendanceRecord.count({ where: { occurrenceId: { in: newOccIds } } })).resolves.toBe(0);
  });

  it("[C11b] replaceExisting:true on a semester with no UT behaves like a plain copy (201)", async () => {
    const s = await setup();
    const { res } = await copy(s.cookie, s.template.id, { semesterId: s.semester.id, replaceExisting: true });
    expect(res.status).toBe(201);
  });

  it("[C12] replaceExisting:true with a non-existent template: 404 and the old UT + attendance are intact (single transaction)", async () => {
    const s = await setup();
    const existing = await createUserTimetable(s.db, s.me.id, s.semester.id, { title: "既存" });
    const occ = await createOccurrence(s.db, { meetingId: existing.meeting.id, courseId: existing.course.id });
    await s.db.attendanceRecord.create({ data: { occurrenceId: occ.id, userId: s.me.id, status: "PRESENT" } });

    const { res, body } = await copy(s.cookie, "no-such-template-id", { semesterId: s.semester.id, replaceExisting: true });

    expect(res.status).toBe(404);
    expectError(body, "NOT_FOUND");
    await expect(s.db.userTimetable.findUniqueOrThrow({ where: { id: existing.userTimetable.id } })).resolves.toMatchObject({ title: "既存" });
    await expect(s.db.meeting.count({ where: { userTimetableId: existing.userTimetable.id } })).resolves.toBe(1);
    await expect(s.db.meetingOccurrence.count({ where: { id: occ.id } })).resolves.toBe(1);
    await expect(s.db.attendanceRecord.count({ where: { occurrenceId: occ.id } })).resolves.toBe(1);
  });

  it("[C12b] replaceExisting:true with a private template: 404 and the old UT + attendance are intact", async () => {
    const s = await setup();
    const priv = await seedTemplate(s.db, { authorUserId: s.author.id, schoolId: s.school.id, departmentId: s.department.id, isPublic: false });
    const existing = await createUserTimetable(s.db, s.me.id, s.semester.id, { title: "既存" });
    const occ = await createOccurrence(s.db, { meetingId: existing.meeting.id, courseId: existing.course.id });
    await s.db.attendanceRecord.create({ data: { occurrenceId: occ.id, userId: s.me.id, status: "TARDY" } });

    const { res } = await copy(s.cookie, priv.id, { semesterId: s.semester.id, replaceExisting: true });

    expect(res.status).toBe(404);
    await expect(s.db.userTimetable.count({ where: { id: existing.userTimetable.id } })).resolves.toBe(1);
    await expect(s.db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: occ.id } })).resolves.toMatchObject({ status: "TARDY" });
  });

  it("[C13] copy into another user's semester: 403 FORBIDDEN, nothing replaced", async () => {
    const s = await setup();
    const stranger = await createTestUser(s.db, { email: "stranger@example.test" });
    const strangerSem = await createSemester(s.db, stranger.id, { name: "他人の学期" });
    const theirs = await createUserTimetable(s.db, stranger.id, strangerSem.id, { title: "他人の時間割" });

    const { res, body } = await copy(s.cookie, s.template.id, { semesterId: strangerSem.id, replaceExisting: true });

    expect(res.status).toBe(403);
    expectError(body, "FORBIDDEN");
    await expect(s.db.userTimetable.count({ where: { id: theirs.userTimetable.id } })).resolves.toBe(1);
  });

  it("[C14] copyCount +1 on plain copy and on replace", async () => {
    const s = await setup();
    await copy(s.cookie, s.template.id, { semesterId: s.semester.id });
    await expect(s.db.timetableTemplate.findUniqueOrThrow({ where: { id: s.template.id } })).resolves.toMatchObject({ copyCount: 1 });
    const r = await copy(s.cookie, s.template.id, { semesterId: s.semester.id, replaceExisting: true });
    expect(r.res.status).toBe(201);
    await expect(s.db.timetableTemplate.findUniqueOrThrow({ where: { id: s.template.id } })).resolves.toMatchObject({ copyCount: 2 });
  });

  it("[C17] copy leaves GET /api/me defaultSemesterId unchanged", async () => {
    const s = await setup();
    const other = await createSemester(s.db, s.me.id, { name: "既定の学期" });
    await s.db.user.update({ where: { id: s.me.id }, data: { defaultSemesterId: other.id } });

    const r1 = await copy(s.cookie, s.template.id, { semesterId: s.semester.id });
    expect(r1.res.status).toBe(201);
    const me = await json(await app.request("/api/me", { headers: { Cookie: s.cookie } }));
    expect(me.user.defaultSemesterId).toBe(other.id);

    const r2 = await copy(s.cookie, s.template.id, { semesterId: s.semester.id, replaceExisting: true });
    expect(r2.res.status).toBe(201);
    const me2 = await json(await app.request("/api/me", { headers: { Cookie: s.cookie } }));
    expect(me2.user.defaultSemesterId).toBe(other.id);
  });

  it("[C7c] title override still works with replaceExisting", async () => {
    const s = await setup();
    const r = await copy(s.cookie, s.template.id, { semesterId: s.semester.id, title: "自分の名前" });
    expect(r.res.status).toBe(201);
    expect(r.body.userTimetable.title).toBe("自分の名前");
  });
});

describe("[b21 C15-C16] UserTimetable.publishedTemplate", () => {
  it("[C15] list carries publishedTemplate {id,title,isPublic,updatedAt} for linked own templates, null otherwise", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const sem2 = await createSemester(db, c.user.id, { name: "後期", startDate: new Date("2026-10-01T00:00:00.000Z"), endDate: new Date("2027-03-31T00:00:00.000Z") });
    const ut2 = await createUserTimetable(db, c.user.id, sem2.id, { title: "未公開" });
    const pub = await publish(c, { title: "公開済" });

    const res = await app.request("/api/user-timetables", { headers: { Cookie: c.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    const a = body.userTimetables.find((t: { id: string }) => t.id === c.userTimetable.id);
    const b = body.userTimetables.find((t: { id: string }) => t.id === ut2.userTimetable.id);
    expect(a.publishedTemplate).toMatchObject({ id: pub.body.template.id, title: "公開済", isPublic: true });
    expect(typeof a.publishedTemplate.updatedAt).toBe("string");
    expect(a.publishedTemplate.updatedAt).toMatch(/Z$/);
    expect(Object.keys(a.publishedTemplate).sort()).toEqual(["id", "isPublic", "title", "updatedAt"]);
    expect(b).toHaveProperty("publishedTemplate");
    expect(b.publishedTemplate).toBeNull();
  });

  it("[C15b] after unpublish the list shows isPublic:false (still linked)", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const pub = await publish(c);
    await requestJson(app, `/api/timetable-templates/${pub.body.template.id}`, { method: "PATCH", headers: { Cookie: c.cookie }, body: { isPublic: false } });
    const body = await json(await app.request("/api/user-timetables", { headers: { Cookie: c.cookie } }));
    const a = body.userTimetables.find((t: { id: string }) => t.id === c.userTimetable.id);
    expect(a.publishedTemplate).toMatchObject({ id: pub.body.template.id, isPublic: false });
  });

  it("[C15c] a linked template authored by someone else is not reported as publishedTemplate", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const stranger = await createTestUser(db, { email: "stranger@example.test" });
    await seedTemplate(db, { authorUserId: stranger.id, schoolId: c.school.id, departmentId: c.department.id, sourceUserTimetableId: c.userTimetable.id });
    const body = await json(await app.request("/api/user-timetables", { headers: { Cookie: c.cookie } }));
    const a = body.userTimetables.find((t: { id: string }) => t.id === c.userTimetable.id);
    expect(a.publishedTemplate).toBeNull();
  });

  it("[C16] GET :id / POST / PATCH / copy responses do not contain a publishedTemplate key", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    await publish(c);

    const get = await json(await app.request(`/api/user-timetables/${c.userTimetable.id}`, { headers: { Cookie: c.cookie } }));
    expect(get.userTimetable).not.toHaveProperty("publishedTemplate");

    const sem = await createSemester(db, c.user.id, { name: "新", startDate: new Date("2026-10-01T00:00:00.000Z"), endDate: new Date("2027-03-31T00:00:00.000Z") });
    const post = await json(
      await requestJson(app, "/api/user-timetables", {
        method: "POST",
        headers: { Cookie: c.cookie },
        body: { semesterId: sem.id, title: "n", daySlots: [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }], courses: [], meetings: [] },
      }),
    );
    expect(post.userTimetable).not.toHaveProperty("publishedTemplate");

    const patch = await json(
      await requestJson(app, `/api/user-timetables/${c.userTimetable.id}`, { method: "PATCH", headers: { Cookie: c.cookie }, body: { title: "改名" } }),
    );
    expect(patch.userTimetable).not.toHaveProperty("publishedTemplate");

    const author = await createTestUser(db, { email: "author@example.test" });
    const sem3 = await createSemester(db, c.user.id, { name: "さらに新", startDate: new Date("2027-04-01T00:00:00.000Z"), endDate: new Date("2027-09-30T00:00:00.000Z") });
    const tpl = await seedTemplate(db, { authorUserId: author.id, schoolId: c.school.id, departmentId: c.department.id });
    const cp = await copy(c.cookie, tpl.id, { semesterId: sem3.id });
    expect(cp.res.status).toBe(201);
    expect(cp.body.userTimetable).not.toHaveProperty("publishedTemplate");
  });
});

describe("[b21 C19] account deletion keeps the link id", () => {
  it("anonymised template keeps sourceUserTimetableId pointing at the (deleted) UT", async () => {
    const db = prisma();
    const c = await setupCompleteUser(db);
    const pub = await publish(c);
    const res = await app.request("/api/me", { method: "DELETE", headers: { Cookie: c.cookie } });
    expect(res.status).toBe(204);
    const row = await db.timetableTemplate.findUniqueOrThrow({ where: { id: pub.body.template.id } });
    expect(row.authorUserId).toBeNull();
    expect(row.sourceUserTimetableId).toBe(c.userTimetable.id);
    await expect(db.userTimetable.count({ where: { id: c.userTimetable.id } })).resolves.toBe(0);
  });
});

describe("[b21 C12c] copy of a template whose meeting references a period without a daySlot", () => {
  async function setupBroken() {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db, { email: "author-c12c@example.test" });
    const me = await createTestUser(db, { email: "me-c12c@example.test", schoolId: school.id, departmentId: department.id });
    const semester = await createSemester(db, me.id);
    const cookie = await createSessionCookie(db, me.id);
    const template = await seedTemplate(db, { authorUserId: author.id, schoolId: school.id, departmentId: department.id });
    // daySlots を 1 限のみにし、meeting は 2 限を参照させる
    await db.templateDaySlot.deleteMany({ where: { templateId: template.id, periodIndex: 2 } });
    await db.templateMeeting.updateMany({ where: { templateId: template.id }, data: { startPeriodIndex: 2 } });
    return { db, me, semester, cookie, template };
  }

  function expectDaySlotNotFound(body: unknown) {
    const err = (body as { error?: { code?: string; details?: { reason?: string } } }).error;
    const direct = err?.code === "DAY_SLOT_NOT_FOUND";
    const viaReason = err?.code === "VALIDATION_ERROR" ? err?.details?.reason === "DAY_SLOT_NOT_FOUND" : false;
    expect(direct || viaReason, JSON.stringify(err)).toBe(true);
  }

  it("[C12c-a] replaceExisting:true: 400 DAY_SLOT_NOT_FOUND, old UT / courses / attendance intact, copyCount unchanged", async () => {
    const s = await setupBroken();
    const existing = await createUserTimetable(s.db, s.me.id, s.semester.id, { title: "既存" });
    const occ = await createOccurrence(s.db, { meetingId: existing.meeting.id, courseId: existing.course.id });
    await s.db.attendanceRecord.create({ data: { occurrenceId: occ.id, userId: s.me.id, status: "PRESENT" } });

    const { res, body } = await copy(s.cookie, s.template.id, { semesterId: s.semester.id, replaceExisting: true });

    expect(res.status).toBe(400);
    expectDaySlotNotFound(body);
    await expect(s.db.userTimetable.findUniqueOrThrow({ where: { id: existing.userTimetable.id } })).resolves.toMatchObject({ title: "既存" });
    await expect(s.db.userTimetable.count({ where: { userId: s.me.id, semesterId: s.semester.id } })).resolves.toBe(1);
    await expect(s.db.meeting.count({ where: { userTimetableId: existing.userTimetable.id } })).resolves.toBe(1);
    await expect(s.db.course.count({ where: { id: existing.course.id } })).resolves.toBe(1);
    await expect(s.db.meetingOccurrence.count({ where: { id: occ.id } })).resolves.toBe(1);
    await expect(s.db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: occ.id } })).resolves.toMatchObject({ status: "PRESENT" });
    await expect(s.db.timetableTemplate.findUniqueOrThrow({ where: { id: s.template.id } })).resolves.toMatchObject({ copyCount: 0 });
  });

  it("[C12c-b] no UT in the semester, plain copy: 400, no UserTimetable created, copyCount unchanged", async () => {
    const s = await setupBroken();

    const { res, body } = await copy(s.cookie, s.template.id, { semesterId: s.semester.id });

    expect(res.status).toBe(400);
    expectDaySlotNotFound(body);
    await expect(s.db.userTimetable.count({ where: { userId: s.me.id } })).resolves.toBe(0);
    const list = await json(await app.request("/api/user-timetables", { headers: { Cookie: s.cookie } }));
    const items = Array.isArray(list) ? list : (list.userTimetables ?? list.items ?? []);
    expect(items).toHaveLength(0);
    await expect(s.db.timetableTemplate.findUniqueOrThrow({ where: { id: s.template.id } })).resolves.toMatchObject({ copyCount: 0 });
  });
});
