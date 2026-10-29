// build 21 レーン B — 科目別の出席基準 (設計 §4 / §7.B / §4.2.4)。設計 doc だけを根拠に生成。
import { describe, expect, it } from "vitest";
import { computeCourseStats } from "../src/services/attendanceStats";
import { app, prisma } from "./helpers/app";
import {
  createOccurrence,
  createSchoolDepartment,
  createSemester,
  createSessionCookie,
  createTestUser,
  setupCompleteUser,
} from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

type Complete = Awaited<ReturnType<typeof setupCompleteUser>>;
type Rec = "A" | "T" | "P" | "E" | "L" | null; // 欠 / 遅 / 出 / 公欠 / 早退 / 未記録
const STATUS: Record<string, string> = { A: "ABSENT", T: "TARDY", P: "PRESENT", E: "EXCUSED", L: "EARLY_LEAVE" };

const U = 70;
const LESSONS = 15;

function lessonDate(i: number): string {
  const d = new Date(Date.UTC(2026, 3, 8)); // 2026-04-08 を 1 回目に週 1
  d.setUTCDate(d.getUTCDate() + 7 * i);
  return d.toISOString().slice(0, 10);
}
const utc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

type Scenario = {
  rule?: { Rc?: number | null; M?: number | null; N?: number | null };
  /** 授業回ごとの記録。要素は 1 コマ分 (periods=1) か、コマ配列 (periods=2) */
  records: (Rec | Rec[])[];
  periods?: 1 | 2;
  todayLesson: number; // 1 始まり
  courseSuspensionLesson?: number; // 1 始まり
};

async function build(s: Scenario) {
  const db = prisma();
  const complete = await setupCompleteUser(db);
  const periods = s.periods ?? 1;
  await db.meeting.update({ where: { id: complete.meeting.id }, data: { periodCount: periods } });
  if (s.rule) {
    await db.course.update({
      where: { id: complete.course.id },
      data: {
        requiredAttendanceRate: s.rule.Rc ?? null,
        maxAbsences: s.rule.M ?? null,
        tardiesPerAbsence: s.rule.N ?? null,
      },
    });
  }
  for (let i = 0; i < LESSONS; i += 1) {
    const suspended = s.courseSuspensionLesson === i + 1;
    for (let p = 0; p < periods; p += 1) {
      const occ = await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: utc(lessonDate(i)),
        periodOffset: p,
        startMinute: 540 + p * 100,
        endMinute: 630 + p * 100,
      });
      const rec = s.records[i];
      const status = Array.isArray(rec) ? rec[p] : p === 0 ? rec : null;
      if (status && !suspended) {
        await db.attendanceRecord.create({
          data: { occurrenceId: occ.id, userId: complete.user.id, status: STATUS[status] as any },
        });
      }
    }
    if (suspended) {
      await db.courseSuspension.create({ data: { courseId: complete.course.id, date: utc(lessonDate(i)), reason: "休講" } });
    }
  }
  return complete;
}

async function statsAt(complete: Complete, now: Date) {
  const result = await computeCourseStats({
    semesterId: complete.semester.id,
    userId: complete.user.id,
    requiredAttendanceRate: U,
    now,
  });
  return (Array.isArray(result) ? result : (result as any).courses)[0] as any;
}

/** 授業日の当日 0:00 JST と 23:59 JST の 2 標本 */
function twoSamples(lesson: number): Date[] {
  const ymd = lessonDate(lesson - 1);
  return [new Date(`${ymd}T00:00:00+09:00`), new Date(`${ymd}T23:59:00+09:00`)];
}

type Expect = {
  allowedAbsences: number;
  absenceLessons: number | null;
  allowedAbsenceLessons: number | null;
  limitedBy: "rate" | "count" | null;
  remainingLessons: number;
};

async function expectRow(s: Scenario, e: Expect) {
  const complete = await build(s);
  for (const now of twoSamples(s.todayLesson)) {
    const c = await statsAt(complete, now);
    const tag = now.toISOString();
    expect(c.allowedAbsences, `allowedAbsences @${tag}`).toBe(e.allowedAbsences);
    if (e.absenceLessons === null) expect(c.absenceLessons ?? null, `absenceLessons @${tag}`).toBeNull();
    else expect(c.absenceLessons, `absenceLessons @${tag}`).toBeCloseTo(e.absenceLessons, 6);
    expect(c.allowedAbsenceLessons ?? null, `allowedAbsenceLessons @${tag}`).toBe(e.allowedAbsenceLessons);
    expect(c.limitedBy ?? null, `limitedBy @${tag}`).toBe(e.limitedBy);
    expect(c.remainingLessons, `remainingLessons @${tag}`).toBe(e.remainingLessons);
  }
}

const rep = <T,>(v: T, n: number): T[] => Array.from({ length: n }, () => v);

describe("[B21 §4.2.4] 回数の側 / 合成 (API 統合、2 標本)", () => {
  it("[B8 E1] M=5 欠×5 today=5 → allowed 0 / count / remaining 10", async () => {
    await expectRow(
      { rule: { M: 5 }, records: rep("A", 5), todayLesson: 5 },
      { allowedAbsences: -1, absenceLessons: 5, allowedAbsenceLessons: 0, limitedBy: "count", remainingLessons: 10 },
    );
  });

  it("[B9 E2] M=5 欠×6 today=6 → allowed -1 / count / remaining 9", async () => {
    await expectRow(
      { rule: { M: 5 }, records: rep("A", 6), todayLesson: 6 },
      { allowedAbsences: -2, absenceLessons: 6, allowedAbsenceLessons: -1, limitedBy: "count", remainingLessons: 9 },
    );
  });

  it("[B10 E3] M=5 N=3 欠×2 遅×4 today=6 → absenceLessons 3 / allowed 2", async () => {
    await expectRow(
      { rule: { M: 5, N: 3 }, records: [...rep("A" as Rec, 2), ...rep("T" as Rec, 4)], todayLesson: 6 },
      { allowedAbsences: 1, absenceLessons: 3, allowedAbsenceLessons: 2, limitedBy: "count", remainingLessons: 9 },
    );
  });

  it("[B11 E5a] M=0 出×1 today=1 → allowed 0 (上限 0 でもまだ失格でない)", async () => {
    await expectRow(
      { rule: { M: 0 }, records: ["P"], todayLesson: 1 },
      { allowedAbsences: 4, absenceLessons: 0, allowedAbsenceLessons: 0, limitedBy: "count", remainingLessons: 14 },
    );
  });

  it("[B12 E5b] M=0 欠×1 today=1 → allowed -1", async () => {
    await expectRow(
      { rule: { M: 0 }, records: ["A"], todayLesson: 1 },
      { allowedAbsences: 3, absenceLessons: 1, allowedAbsenceLessons: -1, limitedBy: "count", remainingLessons: 14 },
    );
  });

  it("[B13 E6] M=5 欠×5 + 6 回目科目休講 → 休講は数えない (D=14)", async () => {
    await expectRow(
      { rule: { M: 5 }, records: rep("A", 5), todayLesson: 6, courseSuspensionLesson: 6 },
      { allowedAbsences: -1, absenceLessons: 5, allowedAbsenceLessons: 0, limitedBy: "count", remainingLessons: 9 },
    );
  });

  it("[B14 E7] M=5 欠×5 公欠×1 (REDUCE) → 公欠は数えない (D=14)", async () => {
    await expectRow(
      { rule: { M: 5 }, records: [...rep("A" as Rec, 5), "E"], todayLesson: 6 },
      { allowedAbsences: -1, absenceLessons: 5, allowedAbsenceLessons: 0, limitedBy: "count", remainingLessons: 9 },
    );
  });

  it("[B15 E8] Rc=60 欠×3 today=3 → allowedAbsences 3、回数側は null", async () => {
    await expectRow(
      { rule: { Rc: 60 }, records: rep("A", 3), todayLesson: 3 },
      { allowedAbsences: 3, absenceLessons: null, allowedAbsenceLessons: null, limitedBy: null, remainingLessons: 12 },
    );
  });

  it("[B16 E9] N=3 のみ 遅×3 today=3 → 出席扱い (allowedAbsences 3)、回数側 null", async () => {
    await expectRow(
      { rule: { N: 3 }, records: rep("T", 3), todayLesson: 3 },
      { allowedAbsences: 3, absenceLessons: null, allowedAbsenceLessons: null, limitedBy: null, remainingLessons: 12 },
    );
  });

  it("[B17 E10] Rc=60 M=3 欠×1 today=1 → allowed 2 / count", async () => {
    await expectRow(
      { rule: { Rc: 60, M: 3 }, records: ["A"], todayLesson: 1 },
      { allowedAbsences: 5, absenceLessons: 1, allowedAbsenceLessons: 2, limitedBy: "count", remainingLessons: 14 },
    );
  });

  it("[B18 E11] M=5 (N なし) 欠×2 遅×4 → 遅刻は strategy の 0.5 重み、absenceLessons 4 / allowed 1", async () => {
    await expectRow(
      { rule: { M: 5 }, records: [...rep("A" as Rec, 2), ...rep("T" as Rec, 4)], todayLesson: 6 },
      { allowedAbsences: 0, absenceLessons: 4, allowedAbsenceLessons: 1, limitedBy: "count", remainingLessons: 9 },
    );
  });

  it("[B19 E12] M=5 出×12 today=12 → allowed 5 / remaining 3", async () => {
    await expectRow(
      { rule: { M: 5 }, records: rep("P", 12), todayLesson: 12 },
      { allowedAbsences: 4, absenceLessons: 0, allowedAbsenceLessons: 5, limitedBy: "count", remainingLessons: 3 },
    );
  });

  it("[B20 E4] 2 コマ連続 Rc=80 M=4: 欠欠/欠出/遅出 → rate 側が厳しく allowed 1 / rate / absenceLessons 1.75", async () => {
    await expectRow(
      {
        rule: { Rc: 80, M: 4 },
        periods: 2,
        records: [
          ["A", "A"],
          ["A", "P"],
          ["T", "P"],
        ],
        todayLesson: 3,
      },
      { allowedAbsences: 2, absenceLessons: 1.75, allowedAbsenceLessons: 1, limitedBy: "rate", remainingLessons: 12 },
    );
  });
});

describe("[B21 §4.3] CRUD / バリデーション", () => {
  const ruleKeys = ["requiredAttendanceRate", "maxAbsences", "tardiesPerAbsence"] as const;

  async function post(complete: Complete, extra: Record<string, unknown> = {}) {
    const res = await requestJson(app, "/api/courses", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { userTimetableId: complete.userTimetable.id, name: "新科目", ...extra },
    });
    return { res, body: (await json(res)) as any };
  }
  async function patch(complete: Complete, id: string, body: Record<string, unknown>) {
    const res = await requestJson(app, `/api/courses/${id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body,
    });
    return { res, body: (await json(res)) as any };
  }

  it("[B1] POST に 3 フィールドなし → 3 列 null、レスポンスに 3 キーが null で出る", async () => {
    const complete = await setupCompleteUser(prisma());
    const { res, body } = await post(complete);
    expect(res.status).toBe(201);
    for (const k of ruleKeys) {
      expect(body.course).toHaveProperty(k);
      expect(body.course[k]).toBeNull();
    }
    const row: any = await prisma().course.findUniqueOrThrow({ where: { id: body.course.id } });
    for (const k of ruleKeys) expect(row[k]).toBeNull();
  });

  it("[B2] POST に 3 フィールドあり → 保存され同値が返る", async () => {
    const complete = await setupCompleteUser(prisma());
    const { res, body } = await post(complete, { requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: 3 });
    expect(res.status).toBe(201);
    expect(body.course).toMatchObject({ requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: 3 });
    await expect(prisma().course.findUniqueOrThrow({ where: { id: body.course.id } })).resolves.toMatchObject({
      requiredAttendanceRate: 80,
      maxAbsences: 4,
      tardiesPerAbsence: 3,
    });
  });

  it("[B2b] POST に境界値 (1 / 0 / 1 と 100 / 99 / 10) は通る", async () => {
    const complete = await setupCompleteUser(prisma());
    const lo = await post(complete, { requiredAttendanceRate: 1, maxAbsences: 0, tardiesPerAbsence: 1 });
    const hi = await post(complete, { requiredAttendanceRate: 100, maxAbsences: 99, tardiesPerAbsence: 10 });
    expect(lo.res.status).toBe(201);
    expect(lo.body.course).toMatchObject({ requiredAttendanceRate: 1, maxAbsences: 0, tardiesPerAbsence: 1 });
    expect(hi.res.status).toBe(201);
    expect(hi.body.course).toMatchObject({ requiredAttendanceRate: 100, maxAbsences: 99, tardiesPerAbsence: 10 });
  });

  it("[B3] PATCH {maxAbsences:null} → その列だけ null。他は不変", async () => {
    const complete = await setupCompleteUser(prisma());
    const created = await post(complete, {
      teacher: "先生",
      requiredAttendanceRate: 80,
      maxAbsences: 4,
      tardiesPerAbsence: 3,
    });
    const id = created.body.course.id;
    const { res, body } = await patch(complete, id, { maxAbsences: null });
    expect(res.status).toBe(200);
    expect(body.course).toMatchObject({
      name: "新科目",
      teacher: "先生",
      requiredAttendanceRate: 80,
      maxAbsences: null,
      tardiesPerAbsence: 3,
    });
    await expect(prisma().course.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
      requiredAttendanceRate: 80,
      maxAbsences: null,
      tardiesPerAbsence: 3,
    });
  });

  it("[B3b] PATCH で 3 キーとも null → 全部消せる", async () => {
    const complete = await setupCompleteUser(prisma());
    const created = await post(complete, { requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: 3 });
    const { res, body } = await patch(complete, created.body.course.id, {
      requiredAttendanceRate: null,
      maxAbsences: null,
      tardiesPerAbsence: null,
    });
    expect(res.status).toBe(200);
    for (const k of ruleKeys) expect(body.course[k]).toBeNull();
  });

  it("[B3c] PATCH で数値を設定できる", async () => {
    const complete = await setupCompleteUser(prisma());
    const { res, body } = await patch(complete, complete.course.id, { requiredAttendanceRate: 85, maxAbsences: 2, tardiesPerAbsence: 4 });
    expect(res.status).toBe(200);
    expect(body.course).toMatchObject({ requiredAttendanceRate: 85, maxAbsences: 2, tardiesPerAbsence: 4 });
  });

  it("[B4] PATCH でキー省略 → 3 列とも不変", async () => {
    const complete = await setupCompleteUser(prisma());
    const created = await post(complete, { requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: 3 });
    const { res, body } = await patch(complete, created.body.course.id, { name: "改名" });
    expect(res.status).toBe(200);
    expect(body.course).toMatchObject({ name: "改名", requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: 3 });
  });

  const invalid: [string, Record<string, unknown>][] = [
    ["率 0", { requiredAttendanceRate: 0 }],
    ["率 101", { requiredAttendanceRate: 101 }],
    ["率 小数", { requiredAttendanceRate: 70.5 }],
    ["上限 -1", { maxAbsences: -1 }],
    ["上限 100", { maxAbsences: 100 }],
    ["上限 小数", { maxAbsences: 2.5 }],
    ["換算 0", { tardiesPerAbsence: 0 }],
    ["換算 11", { tardiesPerAbsence: 11 }],
    ["換算 小数", { tardiesPerAbsence: 2.5 }],
  ];
  for (const [label, payload] of invalid) {
    it(`[B5] 範囲外 (${label}) は POST / PATCH とも 400 VALIDATION_ERROR`, async () => {
      const complete = await setupCompleteUser(prisma());
      const p = await post(complete, payload);
      expect(p.res.status).toBe(400);
      expectError(p.body, "VALIDATION_ERROR");
      const q = await patch(complete, complete.course.id, payload);
      expect(q.res.status).toBe(400);
      expectError(q.body, "VALIDATION_ERROR");
      const row: any = await prisma().course.findUniqueOrThrow({ where: { id: complete.course.id } });
      for (const k of ruleKeys) expect(row[k]).toBeNull();
    });
  }

  it("[B6] 他人の科目への PATCH → 404 NOT_FOUND、列は不変", async () => {
    const owner = await setupCompleteUser(prisma());
    const other = await setupCompleteUser(prisma());
    const { res, body } = await patch(other, owner.course.id, { maxAbsences: 3 });
    expect(res.status).toBe(404);
    expectError(body, "NOT_FOUND");
    const row: any = await prisma().course.findUniqueOrThrow({ where: { id: owner.course.id } });
    expect(row.maxAbsences).toBeNull();
  });

  it("[B22] テンプレから取り込んだ科目は 3 列とも null", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db);
    const copier = await createTestUser(db);
    const semester = await createSemester(db, copier.id);
    const template = await db.timetableTemplate.create({
      data: { authorUserId: author.id, schoolId: school.id, departmentId: department.id, title: "T", isPublic: true },
    });
    await db.templateDaySlot.create({ data: { templateId: template.id, periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 } });
    const tc = await db.templateCourse.create({ data: { templateId: template.id, name: "OS", color: "#ffffff" } });
    await db.templateMeeting.create({ data: { templateId: template.id, courseId: tc.id, dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 } });
    const cookie = await createSessionCookie(db, copier.id);
    const res = await requestJson(app, `/api/timetable-templates/${template.id}/copy`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: { semesterId: semester.id },
    });
    const body = (await json(res)) as any;
    expect(res.status).toBe(201);
    const courses = body.userTimetable.courses;
    expect(courses.length).toBeGreaterThan(0);
    for (const c of courses) for (const k of ruleKeys) expect(c[k]).toBeNull();
    const rows: any[] = await db.course.findMany({ where: { userTimetableId: body.userTimetable.id } });
    for (const r of rows) for (const k of ruleKeys) expect(r[k]).toBeNull();
  });

  it("[B23] PATCH /api/user-timetables/:id に courses を送ると作り直された科目の 3 列は null", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.course.update({
      where: { id: complete.course.id },
      data: { requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: 3 },
    });
    const res = await requestJson(app, `/api/user-timetables/${complete.userTimetable.id}`, {
      method: "PATCH",
      headers: { Cookie: complete.cookie },
      body: {
        courses: [{ tempId: "c1", name: "作り直し" }],
        meetings: [{ courseTempId: "c1", dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 }],
      },
    });
    const body = (await json(res)) as any;
    expect(res.status).toBe(200);
    expect(body.userTimetable.courses).toHaveLength(1);
    for (const k of ruleKeys) expect(body.userTimetable.courses[0][k]).toBeNull();
    const rows: any[] = await db.course.findMany({ where: { userTimetableId: complete.userTimetable.id } });
    for (const r of rows) for (const k of ruleKeys) expect(r[k]).toBeNull();
  });

  it("[B24] GET /api/timetable-templates の courses に 3 キーが null で出る", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const author = await createTestUser(db);
    const viewer = await createTestUser(db);
    const template = await db.timetableTemplate.create({
      data: { authorUserId: author.id, schoolId: school.id, departmentId: department.id, title: "B24", isPublic: true },
    });
    await db.templateCourse.create({ data: { templateId: template.id, name: "OS", color: "#ffffff" } });
    const cookie = await createSessionCookie(db, viewer.id);
    const res = await app.request(`/api/timetable-templates?schoolId=${school.id}&departmentId=${department.id}`, {
      headers: { Cookie: cookie },
    });
    const body = (await json(res)) as any;
    expect(res.status).toBe(200);
    const t = body.templates.find((x: any) => x.id === template.id);
    expect(t.courses).toHaveLength(1);
    for (const k of ruleKeys) {
      expect(t.courses[0]).toHaveProperty(k);
      expect(t.courses[0][k]).toBeNull();
    }
  });
});

describe("[B21 §4.3.2] stats / overview の DTO", () => {
  async function seedRecords(complete: Complete, statuses: Rec[]) {
    const db = prisma();
    for (let i = 0; i < statuses.length; i += 1) {
      const occ = await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: utc(lessonDate(i)),
        periodOffset: 0,
      });
      const st = statuses[i];
      if (st) await db.attendanceRecord.create({ data: { occurrenceId: occ.id, userId: complete.user.id, status: STATUS[st] as any } });
    }
  }

  it("[B7] 3 列とも null の科目: 既存値は従来どおり、新フィールドは null/既定", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.meeting.update({ where: { id: complete.meeting.id }, data: { periodCount: 1 } });
    await seedRecords(complete, [...rep("P" as Rec, 10), "A", "A", null, null, null]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const body = (await json(res)) as any;
    const c = body.courses[0];
    expect(res.status).toBe(200);
    expect(c.effectiveNumerator).toBe(10);
    expect(c.effectiveDenominator).toBe(15);
    expect(c.allowedAbsences).toBe(2); // floor(0.3 * 15 - 2)
    expect(c.requiredAttendanceRate).toBe(U);
    expect(c.rule).toEqual({ requiredAttendanceRate: null, maxAbsences: null, tardiesPerAbsence: null });
    expect(c).toHaveProperty("absenceLessons");
    expect(c.absenceLessons).toBeNull();
    expect(c.allowedAbsenceLessons).toBeNull();
    expect(c.limitedBy).toBeNull();
    expect(Number.isInteger(c.remainingLessons)).toBe(true);
  });

  it("[B7b] ユーザーの共通率が 80 なら requiredAttendanceRate=80、科目の Rc があればそれ", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.user.update({ where: { id: complete.user.id }, data: { requiredAttendanceRate: 80 } });
    const get = async () =>
      ((await json(await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } }))) as any)
        .courses[0];
    expect((await get()).requiredAttendanceRate).toBe(80);
    await db.course.update({ where: { id: complete.course.id }, data: { requiredAttendanceRate: 60, maxAbsences: 3, tardiesPerAbsence: 2 } });
    const c = await get();
    expect(c.requiredAttendanceRate).toBe(60);
    expect(c.rule).toEqual({ requiredAttendanceRate: 60, maxAbsences: 3, tardiesPerAbsence: 2 });
    expect(c.absenceLessons).not.toBeNull();
    expect(c.allowedAbsenceLessons).not.toBeNull();
    expect(["rate", "count"]).toContain(c.limitedBy);
  });

  it("[B7c] overview の各 course にも新フィールドが出る (M 設定あり)", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.meeting.update({ where: { id: complete.meeting.id }, data: { periodCount: 1 } });
    await db.course.update({ where: { id: complete.course.id }, data: { maxAbsences: 5 } });
    await seedRecords(complete, rep("P" as Rec, 3));
    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const body = (await json(res)) as any;
    const c = body.courses[0];
    expect(res.status).toBe(200);
    expect(c.rule).toEqual({ requiredAttendanceRate: null, maxAbsences: 5, tardiesPerAbsence: null });
    expect(c.limitedBy).toBe("count");
    expect(c.allowedAbsenceLessons).toBe(5);
    expect(c.absenceLessons).toBe(0);
  });

  it("[B21] Rc を設定した科目の overall.allowedAbsences = 科目ごとの生値を合算してから floor", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    // 科目 1: Rc=62 → (1-0.62)*15 = 5.7、科目 2: Rc=75 → 3.75。合算 9.45 → 9 (個別 floor の和は 5+3=8)
    const second = await db.course.create({
      data: { userTimetableId: complete.userTimetable.id, name: "第二科目", color: "#ffffff" },
    });
    const meeting2 = await db.meeting.create({
      data: { userTimetableId: complete.userTimetable.id, courseId: second.id, dayOfWeek: 4, startPeriodIndex: 1, periodCount: 1 },
    });
    await db.meeting.update({ where: { id: complete.meeting.id }, data: { periodCount: 1 } });
    await db.course.update({ where: { id: complete.course.id }, data: { requiredAttendanceRate: 62 } });
    await db.course.update({ where: { id: second.id }, data: { requiredAttendanceRate: 75 } });
    for (let i = 0; i < LESSONS; i += 1) {
      await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: utc(lessonDate(i)), periodOffset: 0 });
      await createOccurrence(db, { meetingId: meeting2.id, courseId: second.id, date: utc(lessonDate(i)), periodOffset: 0 });
    }
    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const body = (await json(res)) as any;
    expect(res.status).toBe(200);
    expect(body.overall.allowedAbsences).toBe(9);
    const per = body.courses.map((c: any) => c.allowedAbsences).sort();
    expect(per).toEqual([3, 5]);
  });
});
