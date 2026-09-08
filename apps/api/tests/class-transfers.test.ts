// ─────────────────────────────────────────────────────────────────────────────
// build 18 設計 §4 / §8.3 (#T1-#T26) — POST /api/class-transfers, DELETE /api/class-transfers/:id
// Reviewer 生成 (設計docのみを根拠、実装は未読)。
// 標本 (§8.3): 学期 2026-04-06〜2026-09-30 (setupCompleteUser の既定学期 2026-04-01〜09-30 で代用。
//   全テスト日付がこの範囲に収まるので挙動は等価)。
// 金曜 M_F1=1限(1コマ)、M_F2=3-4限(2コマ)。月曜 M_M1=1限(1コマ)、M_M2=5限(1コマ)。
// 振替先 = 2026-09-14 (月)、元の日 = 2026-09-11 (金)。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
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

type AnyDb = ReturnType<typeof prisma>;

function D(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * `dateStringToJstDay` (apps/api/src/lib/tz.ts) が実際に書き込む occurrence.date は
 * JST 0時の instant (= `D(iso)` の 9 時間前)。fixture の `D(iso)` (UTC 0時) はこの
 * JST 日範囲の中に収まるので読み取り側 (gte/lte) の照合には使えるが、API 経由で
 * 生成された行を DB から**完全一致**で引く用途には使えない (常に空になる)。
 * 生 DB クエリで API 生成行を探す時はこちらを使う (設計 §4.2 は書式を規定していない —
 * 既存コード全体の慣習 `dateStringToJstDay` に合わせるのが筋。テスト側の assert 誤りとして修正)。
 */
function jstDayRange(iso: string): { gte: Date; lte: Date } {
  const start = D(iso);
  start.setUTCHours(start.getUTCHours() - 9);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { gte: start, lte: end };
}

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

/** helper (`createUserTimetable`) が seed する periodIndex 1〜12 の DaySlot minutes (設計doc §12 前提) */
const DAY_SLOT_MINUTES: Record<number, [number, number]> = {
  1: [540, 630],
  2: [640, 730],
  3: [780, 870],
  4: [880, 970],
  5: [980, 1070],
  6: [1080, 1125],
  7: [1130, 1175],
  8: [1180, 1225],
  9: [1230, 1275],
  10: [1280, 1325],
  11: [1330, 1375],
  12: [1380, 1425],
};

async function makeMeetingCourse(
  db: AnyDb,
  timetableId: string,
  name: string,
  dayOfWeek: number,
  startPeriodIndex: number,
  periodCount = 1,
) {
  const course = await db.course.create({ data: { userTimetableId: timetableId, name } });
  const meeting = await db.meeting.create({
    data: { userTimetableId: timetableId, courseId: course.id, dayOfWeek, startPeriodIndex, periodCount },
  });
  return { course, meeting };
}

/** §8.3 標本の共通フィクスチャ。M_M1/M_M2 の 9/14 通常 occurrence は「振替を置く前提条件」として事前 seed する。 */
async function seedTransferFixture(db: AnyDb, opts: { email?: string } = {}) {
  const complete = await setupCompleteUser(db, { email: opts.email });
  const timetableId = complete.userTimetable.id;
  const F1 = await makeMeetingCourse(db, timetableId, "F1科目", 5, 1, 1);
  const F2 = await makeMeetingCourse(db, timetableId, "F2科目", 5, 3, 2);
  const M1 = await makeMeetingCourse(db, timetableId, "M1科目", 1, 1, 1);
  const M2 = await makeMeetingCourse(db, timetableId, "M2科目", 1, 5, 1);
  const occM1 = await createOccurrence(db, {
    meetingId: M1.meeting.id,
    courseId: M1.course.id,
    date: D("2026-09-14"),
    periodOffset: 0,
    startMinute: DAY_SLOT_MINUTES[1][0],
    endMinute: DAY_SLOT_MINUTES[1][1],
  });
  const occM2 = await createOccurrence(db, {
    meetingId: M2.meeting.id,
    courseId: M2.course.id,
    date: D("2026-09-14"),
    periodOffset: 0,
    startMinute: DAY_SLOT_MINUTES[5][0],
    endMinute: DAY_SLOT_MINUTES[5][1],
  });
  return { complete, timetableId, F1, F2, M1, M2, occM1, occM2 };
}

/** #T15 (DAY_SLOT_NOT_FOUND) 用: DaySlot を 1〜5 だけ持つ独立ユーザー・時間割 */
async function makeLimitedFixture(db: AnyDb) {
  const { school, department } = await createSchoolDepartment(db);
  const user = await createTestUser(db, { schoolId: school.id, departmentId: department.id, email: "limited-t15@example.test" });
  const semester = await createSemester(db, user.id, { startDate: D("2026-04-01"), endDate: D("2026-09-30") });
  const tt = await db.userTimetable.create({ data: { userId: user.id, semesterId: semester.id, title: "限定時間割" } });
  await db.daySlot.createMany({
    data: [1, 2, 3, 4, 5].map((p) => ({
      userTimetableId: tt.id,
      periodIndex: p,
      label: `${p}限`,
      startMinute: DAY_SLOT_MINUTES[p][0],
      endMinute: DAY_SLOT_MINUTES[p][1],
    })),
  });
  const course = await db.course.create({ data: { userTimetableId: tt.id, name: "限定科目" } });
  const meeting = await db.meeting.create({
    data: { userTimetableId: tt.id, courseId: course.id, dayOfWeek: 5, startPeriodIndex: 1, periodCount: 1 },
  });
  await db.user.update({ where: { id: user.id }, data: { defaultSemesterId: semester.id } });
  const cookie = await createSessionCookie(db, user.id);
  return { user, semester, tt, course, meeting, cookie };
}

async function createTransfer(cookie: string, body: Record<string, unknown>) {
  const res = await requestJson(app, "/api/class-transfers", { method: "POST", headers: cookieHeader(cookie), body });
  return { res, body: (await json(res)) as any };
}

async function deleteTransfer(cookie: string, id: string) {
  const res = await app.request(`/api/class-transfers/${id}`, { method: "DELETE", headers: cookieHeader(cookie) });
  return { res, body: (await json(res)) as any };
}

async function dayDetail(cookie: string, date: string) {
  const res = await app.request(`/api/day/${date}`, { headers: cookieHeader(cookie) });
  return { res, body: (await json(res)) as any };
}

describe("[build18 §4/§8.3] POST/DELETE /api/class-transfers", () => {
  it("[#T1] MOVE_DAY: 金曜(1限+3-4限)を月曜9/14に写す。1限で重なるM_M1をMeeting単位で置き換え、5限のM_M2は残る", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);

    const { res, body } = await createTransfer(fx.complete.cookie, {
      kind: "MOVE_DAY",
      date: "2026-09-14",
      sourceDayOfWeek: 5,
    });

    expect(res.status).toBe(201);
    expect(body.transfer.kind).toBe("MOVE_DAY");
    expect(body.transfer.occurrenceIds.length).toBe(3);
    expect(body.transfer.displaced.map((d: any) => d.meetingId)).toEqual([fx.M1.meeting.id]);

    const rows = await db.meetingOccurrence.findMany({
      where: { date: jstDayRange("2026-09-14"), meeting: { userTimetableId: fx.timetableId } },
    });
    expect(rows.length).toBe(4);
    expect(rows.some((r: any) => r.meetingId === fx.M1.meeting.id)).toBe(false);

    const m2Row = rows.find((r: any) => r.meetingId === fx.M2.meeting.id);
    expect(m2Row?.transferId).toBeNull();

    const transferRows = rows.filter((r: any) => r.transferId != null);
    expect(transferRows.length).toBe(3);
    for (const r of transferRows as any[]) {
      expect(r.transferId).toBe(body.transfer.id);
      expect(r.periodOffset).toBe(1000 + r.periodIndex);
      const [start, end] = DAY_SLOT_MINUTES[r.periodIndex as number];
      expect(r.startMinute).toBe(start);
      expect(r.endMinute).toBe(end);
    }
    const f1Row = transferRows.find((r: any) => r.meetingId === fx.F1.meeting.id);
    expect(f1Row?.periodIndex).toBe(1);
    const f2Periods = transferRows
      .filter((r: any) => r.meetingId === fx.F2.meeting.id)
      .map((r: any) => r.periodIndex)
      .sort((a: number, b: number) => a - b);
    expect(f2Periods).toEqual([3, 4]);
  });

  it("[#T2] GET /api/day/2026-09-14 は写し先の periodIndex を返す (occurrence.service.ts の置換)", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    const { res, body } = await dayDetail(fx.complete.cookie, "2026-09-14");

    expect(res.status).toBe(200);
    expect(body.occurrences.length).toBe(4);
    expect(body.occurrences.map((o: any) => o.periodIndex).sort((a: number, b: number) => a - b)).toEqual([1, 3, 4, 5]);
    expect(body.occurrences.filter((o: any) => o.transferId != null).length).toBe(3);
    expect(body.transfers.length).toBe(1);
  });

  it("[#T3] GET /api/today?date=2026-09-14 の periodIndex も写し先の値 (today.ts の置換)", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    const res = await app.request("/api/today?date=2026-09-14", { headers: cookieHeader(fx.complete.cookie) });
    const body = (await json(res)) as any;

    expect(res.status).toBe(200);
    expect(body.occurrences.map((o: any) => o.periodIndex).sort((a: number, b: number) => a - b)).toEqual([1, 3, 4, 5]);
  });

  it("[#T4] GET /api/occurrences?from=2026-09-14&to=2026-09-14 は4件返し displaced[0].meetingId==M_M1", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    const res = await app.request("/api/occurrences?from=2026-09-14&to=2026-09-14", { headers: cookieHeader(fx.complete.cookie) });
    const body = (await json(res)) as any;

    expect(res.status).toBe(200);
    expect(body.occurrences.length).toBe(4);
    expect(body.transfers[0].displaced[0].meetingId).toBe(fx.M1.meeting.id);
  });

  it("[#T5] overview: 9/14 の occurrenceCount==4 / transferCount==3 / counts.unrecorded==4。他の日は transferCount==0", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    const res = await app.request(`/api/semesters/${fx.complete.semester.id}/overview`, { headers: cookieHeader(fx.complete.cookie) });
    const body = (await json(res)) as any;

    expect(res.status).toBe(200);
    const day914 = (body.days as any[]).find((d) => d.date === "2026-09-14");
    expect(day914, "day 2026-09-14 missing from overview.days").toBeTruthy();
    expect(day914.occurrenceCount).toBe(4);
    expect(day914.transferCount).toBe(3);
    expect(day914.counts.unrecorded).toBe(4);

    const others = (body.days as any[]).filter((d) => d.date !== "2026-09-14");
    expect(others.every((d) => (d.transferCount ?? 0) === 0)).toBe(true);
  });

  it("[#T6] stats: F1科目の generatedOccurrences が+1、M1科目が-1。振替occurrenceへの出欠でpresentが+1", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);

    const beforeBody = (await json(
      await app.request(`/api/stats?semesterId=${fx.complete.semester.id}`, { headers: cookieHeader(fx.complete.cookie) }),
    )) as any;
    const f1Before = beforeBody.courses.find((c: any) => c.courseId === fx.F1.course.id)?.generatedOccurrences ?? 0;
    const m1Before = beforeBody.courses.find((c: any) => c.courseId === fx.M1.course.id)?.generatedOccurrences ?? 0;

    const { body: t } = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    const afterBody = (await json(
      await app.request(`/api/stats?semesterId=${fx.complete.semester.id}`, { headers: cookieHeader(fx.complete.cookie) }),
    )) as any;
    const f1After = afterBody.courses.find((c: any) => c.courseId === fx.F1.course.id).generatedOccurrences;
    const m1After = afterBody.courses.find((c: any) => c.courseId === fx.M1.course.id).generatedOccurrences;
    expect(f1After).toBe(f1Before + 1);
    expect(m1After).toBe(m1Before - 1);

    // 振替 occurrence への出欠登録 (既存の attendance エンドポイント。design §8.3 #T6 は
    // `PATCH /api/occurrences/:id/attendance` と書くが、これは §4.4 のルート表に無く、他の全 API テストが
    // 使う実際の慣習 (POST /api/attendance/:occurrenceId) と食い違う。README の矛盾一覧を参照)
    const transferOccId = t.transfer.occurrenceIds[0];
    const patchRes = await requestJson(app, `/api/attendance/${transferOccId}`, {
      method: "POST",
      headers: cookieHeader(fx.complete.cookie),
      body: { status: "PRESENT" },
    });
    expect(patchRes.status).toBe(200);

    const withAttendance = (await json(
      await app.request(`/api/stats?semesterId=${fx.complete.semester.id}`, { headers: cookieHeader(fx.complete.cookie) }),
    )) as any;
    const f1Course = withAttendance.courses.find((c: any) => c.courseId === fx.F1.course.id);
    expect(f1Course.counts.present).toBe(1);
  });

  it("[#T7] suspendSourceDate: 休講作成 + reason=『9/14 に授業変更』。既存休講は upsert で reason 不変。sourceDate 省略は 400", async () => {
    const db = prisma();

    const fx1 = await seedTransferFixture(db, { email: "t7a@example.test" });
    const created = await createTransfer(fx1.complete.cookie, {
      kind: "MOVE_DAY",
      date: "2026-09-14",
      sourceDayOfWeek: 5,
      suspendSourceDate: true,
      sourceDate: "2026-09-11",
    });
    expect(created.res.status).toBe(201);
    const day1 = await dayDetail(fx1.complete.cookie, "2026-09-11");
    expect(day1.body.timetableSuspension).not.toBeNull();
    expect(day1.body.timetableSuspension.reason).toBe("9/14 に授業変更");

    const fx2 = await seedTransferFixture(db, { email: "t7b@example.test" });
    await requestJson(app, "/api/timetable-suspensions/bulk", {
      method: "POST",
      headers: cookieHeader(fx2.complete.cookie),
      body: { dates: ["2026-09-11"], reason: "台風" },
    });
    const upserted = await createTransfer(fx2.complete.cookie, {
      kind: "MOVE_DAY",
      date: "2026-09-14",
      sourceDayOfWeek: 5,
      suspendSourceDate: true,
      sourceDate: "2026-09-11",
    });
    expect(upserted.res.status).toBe(201);
    const day2 = await dayDetail(fx2.complete.cookie, "2026-09-11");
    expect(day2.body.timetableSuspension.reason).toBe("台風");

    const fx3 = await seedTransferFixture(db, { email: "t7c@example.test" });
    const missingSourceDate = await createTransfer(fx3.complete.cookie, {
      kind: "MOVE_DAY",
      date: "2026-09-14",
      sourceDayOfWeek: 5,
      suspendSourceDate: true,
    });
    expect(missingSourceDate.res.status).toBe(400);
    expectError(missingSourceDate.body, "SOURCE_DATE_REQUIRED");
  });

  it("[#T8] sourceDayOfWeek が振替先と同じ曜日は400 SAME_WEEKDAY。授業の無い曜日は400 NO_MEETINGS_ON_SOURCE_DAY", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);

    const same = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 1 });
    expect(same.res.status).toBe(400);
    expectError(same.body, "SAME_WEEKDAY");

    const noMeetings = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 0 });
    expect(noMeetings.res.status).toBe(400);
    expectError(noMeetings.body, "NO_MEETINGS_ON_SOURCE_DAY");
  });

  it("[#T9] 学期外の日付は400 OUT_OF_SEMESTER", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);

    const { res, body } = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-10-01", sourceDayOfWeek: 5 });
    expect(res.status).toBe(400);
    expectError(body, "OUT_OF_SEMESTER");
  });

  it("[#T10] 振替先が休講日は409 DAY_SUSPENDED。liftTargetSuspension:trueで201+休講解除", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    await requestJson(app, "/api/timetable-suspensions", {
      method: "POST",
      headers: cookieHeader(fx.complete.cookie),
      body: { date: "2026-09-14" },
    });

    const blocked = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });
    expect(blocked.res.status).toBe(409);
    expectError(blocked.body, "DAY_SUSPENDED");

    const lifted = await createTransfer(fx.complete.cookie, {
      kind: "MOVE_DAY",
      date: "2026-09-14",
      sourceDayOfWeek: 5,
      liftTargetSuspension: true,
    });
    expect(lifted.res.status).toBe(201);
    const day = await dayDetail(fx.complete.cookie, "2026-09-14");
    expect(day.body.timetableSuspension).toBeNull();
  });

  it("[#T11] 置き換え対象に出欠記録があると409 DISPLACED_HAS_RECORDでトランザクションが巻き戻る", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    await db.attendanceRecord.create({ data: { occurrenceId: fx.occM1.id, userId: fx.complete.user.id, status: "PRESENT" } });

    const { res, body } = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    expect(res.status).toBe(409);
    expectError(body, "DISPLACED_HAS_RECORD");
    expect(body.error.details.meetingId).toBe(fx.M1.meeting.id);
    await expect(db.classTransfer.count()).resolves.toBe(0);
  });

  it("[#T12] SINGLE: 5限に1コマ追加。5限で重なるM_M2をMeeting単位で置き換え", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);

    const { res, body } = await createTransfer(fx.complete.cookie, {
      kind: "SINGLE",
      date: "2026-09-14",
      courseId: fx.F1.course.id,
      periodIndexes: [5],
    });

    expect(res.status).toBe(201);
    expect(body.transfer.occurrenceIds.length).toBe(1);
    const row = await db.meetingOccurrence.findUnique({ where: { id: body.transfer.occurrenceIds[0] } });
    expect(row?.meetingId).toBe(fx.F1.meeting.id);
    expect(row?.periodIndex).toBe(5);
    expect(row?.periodOffset).toBe(1005);
    expect(body.transfer.displaced.map((d: any) => d.meetingId)).toEqual([fx.M2.meeting.id]);
  });

  it("[#T13] SINGLE: 空いている複数コマ (2限・6限) は displaced が空", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);

    const { res, body } = await createTransfer(fx.complete.cookie, {
      kind: "SINGLE",
      date: "2026-09-14",
      courseId: fx.F1.course.id,
      periodIndexes: [2, 6],
    });

    expect(res.status).toBe(201);
    expect(body.transfer.displaced).toEqual([]);
    expect(body.transfer.occurrenceIds.length).toBe(2);
  });

  it("[#T14] MOVE_DAY で1限が埋まった後、SINGLEで同じ1限を狙うと409 PERIOD_CONFLICT { conflictPeriod: 1 }", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    const { res, body } = await createTransfer(fx.complete.cookie, {
      kind: "SINGLE",
      date: "2026-09-14",
      courseId: fx.F1.course.id,
      periodIndexes: [1],
    });

    expect(res.status).toBe(409);
    expectError(body, "PERIOD_CONFLICT");
    expect(body.error.details.conflictPeriod).toBe(1);
  });

  it("[#T15] SINGLE: meetingsを持たない科目は400 COURSE_HAS_NO_MEETING、他人の科目は404 NOT_FOUND、DaySlot不足は400 DAY_SLOT_NOT_FOUND", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);

    const emptyCourse = await db.course.create({ data: { userTimetableId: fx.timetableId, name: "空科目" } });
    const noMeeting = await createTransfer(fx.complete.cookie, {
      kind: "SINGLE",
      date: "2026-09-14",
      courseId: emptyCourse.id,
      periodIndexes: [2],
    });
    expect(noMeeting.res.status).toBe(400);
    expectError(noMeeting.body, "COURSE_HAS_NO_MEETING");

    const other = await setupCompleteUser(db, { email: "other-t15@example.test" });
    const notFound = await createTransfer(fx.complete.cookie, {
      kind: "SINGLE",
      date: "2026-09-14",
      courseId: other.course.id,
      periodIndexes: [2],
    });
    expect(notFound.res.status).toBe(404);
    expectError(notFound.body, "NOT_FOUND");

    const limited = await makeLimitedFixture(db);
    const slotMissing = await createTransfer(limited.cookie, {
      kind: "SINGLE",
      date: "2026-09-14",
      courseId: limited.course.id,
      periodIndexes: [12],
    });
    expect(slotMissing.res.status).toBe(400);
    expectError(slotMissing.body, "DAY_SLOT_NOT_FOUND");
  });

  it("[#T16] 同じMeeting・同じ日に通常+振替: 金曜9/18の既存通常M_F1(1限)がある状態でSINGLEを追加しても衝突しない", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    await createOccurrence(db, {
      meetingId: fx.F1.meeting.id,
      courseId: fx.F1.course.id,
      date: D("2026-09-18"),
      periodOffset: 0,
      startMinute: DAY_SLOT_MINUTES[1][0],
      endMinute: DAY_SLOT_MINUTES[1][1],
    });

    const { res } = await createTransfer(fx.complete.cookie, {
      kind: "SINGLE",
      date: "2026-09-18",
      courseId: fx.F1.course.id,
      periodIndexes: [5],
    });

    expect(res.status).toBe(201);
    const rows = await db.meetingOccurrence.findMany({ where: { date: jstDayRange("2026-09-18"), meetingId: fx.F1.meeting.id } });
    expect(rows.length).toBe(2);
    expect(rows.map((r: any) => r.periodOffset).sort((a: number, b: number) => a - b)).toEqual([0, 1005]);
  });

  it("[#T17] DELETE: occurrence/displacement/transferが消え通常occurrenceが復元。休講は残す (#T7 と組み合わせ)", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    const { body: t } = await createTransfer(fx.complete.cookie, {
      kind: "MOVE_DAY",
      date: "2026-09-14",
      sourceDayOfWeek: 5,
      suspendSourceDate: true,
      sourceDate: "2026-09-11",
    });

    const del = await deleteTransfer(fx.complete.cookie, t.transfer.id);
    expect(del.res.status).toBe(200);
    expect(del.body).toEqual({ removedOccurrences: 3, removedAttendanceRecords: 0, restoredOccurrences: 1 });

    const rows = await db.meetingOccurrence.findMany({
      where: { date: jstDayRange("2026-09-14"), meeting: { userTimetableId: fx.timetableId } },
    });
    expect(rows.map((r: any) => r.meetingId).sort()).toEqual([fx.M1.meeting.id, fx.M2.meeting.id].sort());
    await expect(db.classTransfer.count({ where: { id: t.transfer.id } })).resolves.toBe(0);
    await expect(db.classTransferDisplacement.count()).resolves.toBe(0);

    const day = await dayDetail(fx.complete.cookie, "2026-09-11");
    expect(day.body.timetableSuspension).not.toBeNull();
  });

  it("[#T18] 出欠記録付き振替のDELETEは removedAttendanceRecords を数え記録も消す", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    const { body: t } = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });
    const transferOccId = t.transfer.occurrenceIds[0];
    await db.attendanceRecord.create({ data: { occurrenceId: transferOccId, userId: fx.complete.user.id, status: "PRESENT" } });

    const del = await deleteTransfer(fx.complete.cookie, t.transfer.id);

    expect(del.res.status).toBe(200);
    expect(del.body.removedAttendanceRecords).toBe(1);
    await expect(db.attendanceRecord.count({ where: { occurrenceId: transferOccId } })).resolves.toBe(0);
  });

  it("[#T19] 他人の transfer を DELETE すると404で行は残る", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    const { body: t } = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });
    // #T15 の「他人の科目 → 404」と同じ理由で setupCompleteUser を使う: setupGuard (routes/classTransfers.ts、
    // 設計 §4.4「既存 meetings.ts と同じ並び」) はセットアップ未完了ユーザーを 403 SETUP_REQUIRED で弾くため、
    // セットアップ未完了の stranger では NOT_FOUND (404) に到達する前に 403 で止まってしまう (テストの誤り)
    const stranger = await setupCompleteUser(db, { email: "stranger-t19@example.test" });

    const del = await deleteTransfer(stranger.cookie, t.transfer.id);

    expect(del.res.status).toBe(404);
    expectError(del.body, "NOT_FOUND");
    await expect(db.classTransfer.count({ where: { id: t.transfer.id } })).resolves.toBe(1);
  });

  it("[#T20] updateMeeting: 非スケジュール変更は振替を巻き添えにせず、スケジュール変更でもperiodIndexはsnapshotのまま残る", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    const { body: t } = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    const roomOnly = await requestJson(app, `/api/meetings/${fx.F1.meeting.id}`, {
      method: "PATCH",
      headers: cookieHeader(fx.complete.cookie),
      body: { room: "302" },
    });
    expect(roomOnly.status).toBe(200);
    let transferRow = await db.meetingOccurrence.findFirst({
      where: { meetingId: fx.F1.meeting.id, date: jstDayRange("2026-09-14"), transferId: t.transfer.id },
    });
    expect(transferRow).toBeTruthy();

    const scheduleChange = await requestJson(app, `/api/meetings/${fx.F1.meeting.id}`, {
      method: "PATCH",
      headers: cookieHeader(fx.complete.cookie),
      body: { startPeriodIndex: 2 },
    });
    expect(scheduleChange.status).toBe(200);
    transferRow = await db.meetingOccurrence.findFirst({
      where: { meetingId: fx.F1.meeting.id, date: jstDayRange("2026-09-14"), transferId: t.transfer.id },
    });
    expect((transferRow as any)?.periodIndex).toBe(1);
  });

  it("[#T21] 置き換えの安定: displacement 対象 Meeting を再生成しても9/14の行は作られない", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    const noScheduleChange = await requestJson(app, `/api/meetings/${fx.M1.meeting.id}`, {
      method: "PATCH",
      headers: cookieHeader(fx.complete.cookie),
      body: { room: "x", startPeriodIndex: 1 },
    });
    expect(noScheduleChange.status).toBe(200);
    let m1Row = await db.meetingOccurrence.findFirst({ where: { meetingId: fx.M1.meeting.id, date: jstDayRange("2026-09-14") } });
    expect(m1Row).toBeNull();

    const scheduleChange = await requestJson(app, `/api/meetings/${fx.M1.meeting.id}`, {
      method: "PATCH",
      headers: cookieHeader(fx.complete.cookie),
      body: { startPeriodIndex: 2 },
    });
    expect(scheduleChange.status).toBe(200);
    m1Row = await db.meetingOccurrence.findFirst({ where: { meetingId: fx.M1.meeting.id, date: jstDayRange("2026-09-14") } });
    expect(m1Row).toBeNull();
  });

  it("[#T22] reconcile: 学期日付短縮で振替行(transferId!=null)は残るが通常のM2 9/14行(記録なし)は消える", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    const { body: t } = await createTransfer(fx.complete.cookie, { kind: "MOVE_DAY", date: "2026-09-14", sourceDayOfWeek: 5 });

    const patch = await requestJson(app, `/api/semesters/${fx.complete.semester.id}`, {
      method: "PATCH",
      headers: cookieHeader(fx.complete.cookie),
      body: { endDate: "2026-09-10" },
    });
    expect(patch.status).toBe(200);

    await expect(db.meetingOccurrence.count({ where: { transferId: t.transfer.id } })).resolves.toBe(3);
    const m2Row = await db.meetingOccurrence.findFirst({ where: { meetingId: fx.M2.meeting.id, date: D("2026-09-14") } });
    expect(m2Row).toBeNull();
  });

  it("[#T23] deleteMeeting の掃除: displacementが残る間はClassTransferが残り、両方消えるとpruneされる", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    const { body: t } = await createTransfer(fx.complete.cookie, {
      kind: "SINGLE",
      date: "2026-09-14",
      courseId: fx.F1.course.id,
      periodIndexes: [5],
    });
    expect(t.transfer.displaced.map((d: any) => d.meetingId)).toEqual([fx.M2.meeting.id]);

    const delF1 = await app.request(`/api/meetings/${fx.F1.meeting.id}`, { method: "DELETE", headers: cookieHeader(fx.complete.cookie) });
    expect(delF1.status).toBe(200);
    await expect(db.meetingOccurrence.count({ where: { transferId: t.transfer.id } })).resolves.toBe(0);
    await expect(db.classTransferDisplacement.count({ where: { transferId: t.transfer.id } })).resolves.toBe(1);
    await expect(db.classTransfer.count({ where: { id: t.transfer.id } })).resolves.toBe(1);

    const delM2 = await app.request(`/api/meetings/${fx.M2.meeting.id}`, { method: "DELETE", headers: cookieHeader(fx.complete.cookie) });
    expect(delM2.status).toBe(200);
    await expect(db.classTransferDisplacement.count({ where: { transferId: t.transfer.id } })).resolves.toBe(0);
    await expect(db.classTransfer.count({ where: { id: t.transfer.id } })).resolves.toBe(0);
  });

  it("[#T24] DELETE /api/courses/:id でも同じ掃除が走る", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);
    const { body: t } = await createTransfer(fx.complete.cookie, {
      kind: "SINGLE",
      date: "2026-09-14",
      courseId: fx.F1.course.id,
      periodIndexes: [5],
    });

    const delCourse1 = await app.request(`/api/courses/${fx.F1.course.id}`, { method: "DELETE", headers: cookieHeader(fx.complete.cookie) });
    expect(delCourse1.status).toBe(200);
    await expect(db.classTransfer.count({ where: { id: t.transfer.id } })).resolves.toBe(1);

    const delCourse2 = await app.request(`/api/courses/${fx.M2.course.id}`, { method: "DELETE", headers: cookieHeader(fx.complete.cookie) });
    expect(delCourse2.status).toBe(200);
    await expect(db.classTransfer.count({ where: { id: t.transfer.id } })).resolves.toBe(0);
  });

  it("[#T25] 互換性: 振替0件の日は transfers==[] / transferCount==0、既存フィールドは不変", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occ = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: D("2026-05-13") });

    const day = await dayDetail(complete.cookie, "2026-05-13");
    expect(day.body.transfers).toEqual([]);
    expect(Array.isArray(day.body.occurrences)).toBe(true);
    expect(day.body.occurrences.map((o: any) => o.id)).toContain(occ.id);

    const overview = (await json(
      await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: cookieHeader(complete.cookie) }),
    )) as any;
    const d = (overview.days as any[]).find((x) => x.date === "2026-05-13");
    expect(d.transferCount).toBe(0);
  });

  it("[#T26] 未知のkindは400 VALIDATION_ERROR。periodIndexes 空配列も400", async () => {
    const db = prisma();
    const fx = await seedTransferFixture(db);

    const badKind = await createTransfer(fx.complete.cookie, { kind: "FOO", date: "2026-09-14" });
    expect(badKind.res.status).toBe(400);
    expectError(badKind.body, "VALIDATION_ERROR");

    const emptyPeriods = await createTransfer(fx.complete.cookie, {
      kind: "SINGLE",
      date: "2026-09-14",
      courseId: fx.F1.course.id,
      periodIndexes: [],
    });
    expect(emptyPeriods.res.status).toBe(400);
  });
});
