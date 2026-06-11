import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createOccurrence, createSemester, createSessionCookie, createTestUser, createUserTimetable, setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

type DayStatusHit = { date?: string; status?: string };

const generatedThrough0422 = [
  { date: "2026-04-01", periodOffset: 0 },
  { date: "2026-04-01", periodOffset: 1 },
  { date: "2026-04-08", periodOffset: 0 },
  { date: "2026-04-08", periodOffset: 1 },
  { date: "2026-04-15", periodOffset: 0 },
  { date: "2026-04-15", periodOffset: 1 },
  { date: "2026-04-22", periodOffset: 0 },
  { date: "2026-04-22", periodOffset: 1 },
];
const generatedThrough0415 = generatedThrough0422.slice(0, 6);

function collectDayStatusHits(value: unknown, hits: DayStatusHit[] = []): DayStatusHit[] {
  if (!value || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    for (const item of value) collectDayStatusHits(item, hits);
    return hits;
  }

  const object = value as Record<string, unknown>;
  if (typeof object.date === "string" && typeof object.status === "string") {
    hits.push({ date: object.date, status: object.status });
  }
  for (const [key, nested] of Object.entries(object)) {
    if (typeof nested === "string" && key.match(/^\d{4}-\d{2}-\d{2}$/) && typeof object[key] === "string") {
      hits.push({ date: key, status: object[key] as string });
    }
    collectDayStatusHits(nested, hits);
  }
  return hits;
}

async function occurrencesForTimetable(userTimetableId: string) {
  return prisma().meetingOccurrence.findMany({
    where: { meeting: { userTimetableId } },
    orderBy: [{ date: "asc" }, { periodOffset: "asc" }],
  });
}

async function createDatedOccurrences(args: { meetingId: string; courseId: string; dates: string[] }) {
  const db = prisma();
  const occurrences = [];
  for (let i = 0; i < args.dates.length; i += 1) {
    occurrences.push(
      await createOccurrence(db, {
        meetingId: args.meetingId,
        courseId: args.courseId,
        date: new Date(`${args.dates[i]}T00:00:00.000Z`),
        periodOffset: i,
        startMinute: 540 + i,
        endMinute: 630 + i,
      }),
    );
  }
  return occurrences;
}

async function createOccurrenceRows(args: { meetingId: string; courseId: string; rows: { date: string; periodOffset: number }[] }) {
  const db = prisma();
  const occurrences = [];
  for (const row of args.rows) {
    occurrences.push(
      await createOccurrence(db, {
        meetingId: args.meetingId,
        courseId: args.courseId,
        date: new Date(`${row.date}T00:00:00.000Z`),
        periodOffset: row.periodOffset,
        startMinute: 540 + row.periodOffset,
        endMinute: 630 + row.periodOffset,
      }),
    );
  }
  return occurrences;
}

async function patchSemester(semesterId: string, cookie: string, body: Record<string, unknown>) {
  return requestJson(app, `/api/semesters/${semesterId}`, {
    method: "PATCH",
    headers: { Cookie: cookie },
    body,
  });
}

describe("semesters API", () => {
  it("[§8 #22] POST /api/semesters rejects startDate later than endDate", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/semesters", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { name: "逆転学期", startDate: "2026-10-01", endDate: "2026-04-01" },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expectError(body, "VALIDATION_ERROR");
  });

  it("[§8 #23] DELETE /api/semesters/:id returns 409 when a UserTimetable exists", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const semester = await createSemester(db, user.id);
    await createUserTimetable(db, user.id, semester.id);
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request(`/api/semesters/${semester.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    const body = await json(res);

    expect(res.status).toBe(409);
    expectError(body, "CONFLICT");
  });

  it("[§8 #24] GET/PATCH/DELETE on another user's Semester returns 403", async () => {
    const db = prisma();
    const owner = await createTestUser(db, { email: "owner@example.test" });
    const other = await createTestUser(db, { email: "other@example.test" });
    const semester = await createSemester(db, owner.id);
    const cookie = await createSessionCookie(db, other.id);

    const getRes = await app.request(`/api/semesters/${semester.id}`, { headers: { Cookie: cookie } });
    const patchRes = await requestJson(app, `/api/semesters/${semester.id}`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { name: "変更" },
    });
    const deleteRes = await app.request(`/api/semesters/${semester.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });

    expect(getRes.status).toBe(403);
    expectError(await json(getRes), "FORBIDDEN");
    expect(patchRes.status).toBe(403);
    expectError(await json(patchRes), "FORBIDDEN");
    expect(deleteRes.status).toBe(403);
    expectError(await json(deleteRes), "FORBIDDEN");
  });

  it("[#9] overview contains ALL_SUSPENDED for a date with one occurrence and a timetable suspension", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") });
    await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);
    const hits = collectDayStatusHits(body);

    expect(res.status).toBe(200);
    // 設計不足: overview response の day summary キー名は明記されていないため、配列/マップ双方を再帰走査する。
    expect(hits).toEqual(expect.arrayContaining([{ date: "2026-05-13", status: "ALL_SUSPENDED" }]));
  });

  it("[#12] overview does not show ALL_SUSPENDED for a timetable suspension date with zero occurrences", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);
    const hits = collectDayStatusHits(body).filter((hit) => hit.date === "2026-05-13");

    expect(res.status).toBe(200);
    // 仕様は「status に現れない or NO_CLASS」。少なくとも休講表示 ALL_SUSPENDED は出さない。
    expect(hits.some((hit) => hit.status === "ALL_SUSPENDED")).toBe(false);
  });

  it("includes the server JST today and user requiredAttendanceRate in semester overview", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await (db.user.update as any)({ where: { id: complete.user.id }, data: { requiredAttendanceRate: 82 } }).catch(() => undefined);

    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    // 仕様 #13
    expect(res.status).toBe(200);
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.requiredAttendanceRate).toBe(82);
  });
});

describe("PATCH /api/semesters/:id regenerates occurrences incrementally and preserves records", () => {
  it("renames a semester without regenerating occurrences", async () => {
    // 仕様 #1
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createDatedOccurrences({
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      dates: ["2026-04-08", "2026-04-15", "2026-04-22"],
    });
    const before = await occurrencesForTimetable(complete.userTimetable.id);

    const res = await patchSemester(complete.semester.id, complete.cookie, { name: "改名後" });
    const body = await json(res);
    const after = await occurrencesForTimetable(complete.userTimetable.id);
    const semester = await db.semester.findUniqueOrThrow({ where: { id: complete.semester.id } });

    expect(res.status).toBe(200);
    expect((body as any).semester.name).toBe("改名後");
    expect(semester.name).toBe("改名後");
    expect(semester.startDate.toISOString()).toBe(complete.semester.startDate.toISOString());
    expect(semester.endDate.toISOString()).toBe(complete.semester.endDate.toISOString());
    expect(after).toHaveLength(before.length);
  });

  it("extends endDate and keeps existing occurrences and attendance records", async () => {
    // 仕様 #2
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const existing = await createDatedOccurrences({
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      dates: ["2026-09-16", "2026-09-23"],
    });
    await db.attendanceRecord.create({ data: { occurrenceId: existing[0].id, userId: complete.user.id, status: "PRESENT" } });
    const before = await occurrencesForTimetable(complete.userTimetable.id);
    const recordBefore = await db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: existing[0].id } });

    const res = await patchSemester(complete.semester.id, complete.cookie, { endDate: "2026-10-31" });
    const after = await occurrencesForTimetable(complete.userTimetable.id);
    const recordAfter = await db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: existing[0].id } });

    expect(res.status).toBe(200);
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.map((occurrence) => occurrence.id)).toEqual(expect.arrayContaining(existing.map((occurrence) => occurrence.id)));
    expect(recordAfter.id).toBe(recordBefore.id);
    expect(recordAfter.status).toBe("PRESENT");
  });

  it("extends startDate and creates additional occurrences", async () => {
    // 仕様 #3
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createDatedOccurrences({
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      dates: ["2026-04-08", "2026-04-15"],
    });
    const before = await occurrencesForTimetable(complete.userTimetable.id);

    const res = await patchSemester(complete.semester.id, complete.cookie, { startDate: "2026-03-01" });
    const after = await occurrencesForTimetable(complete.userTimetable.id);

    expect(res.status).toBe(200);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("shrinks endDate and deletes only out-of-range occurrences without records", async () => {
    // 仕様 #4
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const existing = await createOccurrenceRows({
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      rows: [...generatedThrough0422, { date: "2026-04-29", periodOffset: 0 }, { date: "2026-05-06", periodOffset: 0 }],
    });
    const before = await occurrencesForTimetable(complete.userTimetable.id);

    const res = await patchSemester(complete.semester.id, complete.cookie, { endDate: "2026-04-22" });
    const deletedEmpty = await db.meetingOccurrence.findMany({ where: { id: { in: [existing[8].id, existing[9].id] } } });

    expect(res.status).toBe(200);
    expect(before).toHaveLength(10);
    expect(deletedEmpty).toHaveLength(0);
    expect(await db.attendanceRecord.count({ where: { userId: complete.user.id } })).toBe(0);
  });

  it("shrinks endDate without deleting out-of-range occurrences that have records", async () => {
    // 仕様 #5
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const existing = await createOccurrenceRows({
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      rows: [...generatedThrough0422, { date: "2026-04-29", periodOffset: 0 }, { date: "2026-05-06", periodOffset: 0 }],
    });
    await db.attendanceRecord.create({ data: { occurrenceId: existing[8].id, userId: complete.user.id, status: "PRESENT" } });
    await db.attendanceRecord.create({ data: { occurrenceId: existing[9].id, userId: complete.user.id, status: "ABSENT" } });
    const before = await occurrencesForTimetable(complete.userTimetable.id);
    const recordsBefore = await db.attendanceRecord.count({ where: { userId: complete.user.id } });

    const res = await patchSemester(complete.semester.id, complete.cookie, { endDate: "2026-04-22" });
    const preserved = await db.meetingOccurrence.findMany({ where: { id: { in: [existing[8].id, existing[9].id] } } });
    const recordsAfter = await db.attendanceRecord.count({ where: { userId: complete.user.id } });

    expect(res.status).toBe(200);
    expect(before).toHaveLength(10);
    expect(preserved.map((occurrence) => occurrence.id)).toEqual(expect.arrayContaining([existing[8].id, existing[9].id]));
    expect(recordsBefore).toBe(2);
    expect(recordsAfter).toBe(recordsBefore);
  });

  it("shrinks endDate and distinguishes recorded out-of-range occurrences from empty ones", async () => {
    // 仕様 #6
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const existing = await createOccurrenceRows({
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      rows: [...generatedThrough0415, { date: "2026-04-22", periodOffset: 0 }, { date: "2026-04-29", periodOffset: 0 }, { date: "2026-05-06", periodOffset: 0 }],
    });
    await db.attendanceRecord.create({ data: { occurrenceId: existing[6].id, userId: complete.user.id, status: "ABSENT" } });
    const before = await occurrencesForTimetable(complete.userTimetable.id);
    const recordsBefore = await db.attendanceRecord.count({ where: { userId: complete.user.id } });

    const res = await patchSemester(complete.semester.id, complete.cookie, { endDate: "2026-04-15" });
    const preservedRecorded = await db.meetingOccurrence.findUnique({ where: { id: existing[6].id } });
    const deletedEmpty = await db.meetingOccurrence.findMany({ where: { id: { in: [existing[7].id, existing[8].id] } } });

    expect(res.status).toBe(200);
    expect(before).toHaveLength(9);
    expect(preservedRecorded?.id).toBe(existing[6].id);
    expect(deletedEmpty).toHaveLength(0);
    expect(await db.attendanceRecord.count({ where: { userId: complete.user.id } })).toBe(recordsBefore);
  });

  it("updates dates for a semester without a UserTimetable without occurrence work", async () => {
    // 仕様 #7
    const db = prisma();
    const user = await createTestUser(db);
    const semester = await createSemester(db, user.id);
    const cookie = await createSessionCookie(db, user.id);

    const res = await patchSemester(semester.id, cookie, { endDate: "2026-10-31" });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect((body as any).semester.endDate).toBeDefined();
    expect(await db.meetingOccurrence.count()).toBe(0);
  });

  it("rejects startDate later than endDate without changing occurrences", async () => {
    // 仕様 #8
    const complete = await setupCompleteUser(prisma());
    await createDatedOccurrences({ meetingId: complete.meeting.id, courseId: complete.course.id, dates: ["2026-04-08", "2026-04-15"] });
    const before = await occurrencesForTimetable(complete.userTimetable.id);

    const res = await patchSemester(complete.semester.id, complete.cookie, { startDate: "2026-10-01" });
    const body = await json(res);
    const after = await occurrencesForTimetable(complete.userTimetable.id);

    expect(res.status).toBe(400);
    expectError(body, "VALIDATION_ERROR");
    expect(after).toHaveLength(before.length);
  });

  it("forbids PATCH to another user's semester", async () => {
    // 仕様 #9
    const db = prisma();
    const owner = await createTestUser(db, { email: "patch-owner@example.test" });
    const other = await createTestUser(db, { email: "patch-other@example.test" });
    const semester = await createSemester(db, owner.id);
    const cookie = await createSessionCookie(db, other.id);

    const res = await patchSemester(semester.id, cookie, { name: "変更不可" });

    expect(res.status).toBe(403);
  });

  it("can shrink and then restore the endDate while preserving recorded occurrences", async () => {
    // 仕様 #10
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const existing = await createOccurrenceRows({
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      rows: [...generatedThrough0422, { date: "2026-04-29", periodOffset: 0 }, { date: "2026-05-06", periodOffset: 0 }],
    });
    await db.attendanceRecord.create({ data: { occurrenceId: existing[8].id, userId: complete.user.id, status: "PRESENT" } });
    await db.attendanceRecord.create({ data: { occurrenceId: existing[9].id, userId: complete.user.id, status: "ABSENT" } });
    const beforeShrink = await occurrencesForTimetable(complete.userTimetable.id);

    const shrinkRes = await patchSemester(complete.semester.id, complete.cookie, { endDate: "2026-04-22" });
    const restoreRes = await patchSemester(complete.semester.id, complete.cookie, { endDate: "2026-09-30" });
    const afterRestore = await occurrencesForTimetable(complete.userTimetable.id);
    const preserved = await db.meetingOccurrence.findMany({ where: { id: { in: [existing[8].id, existing[9].id] } } });

    expect(shrinkRes.status).toBe(200);
    expect(restoreRes.status).toBe(200);
    expect(preserved.map((occurrence) => occurrence.id)).toEqual(expect.arrayContaining([existing[8].id, existing[9].id]));
    expect(await db.attendanceRecord.count({ where: { userId: complete.user.id } })).toBe(2);
    expect(afterRestore.length).toBeGreaterThanOrEqual(beforeShrink.length);
  });
});

describe("GET /api/semesters/:id/overview overall.allowedAbsences", () => {
  it("uses a single course raw allowance minus recorded absences", async () => {
    // 仕様 #29
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.user.update({ where: { id: complete.user.id }, data: { requiredAttendanceRate: 80 } });
    const occurrences = await createDatedOccurrences({
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      dates: Array(15).fill("2026-05-06"),
    });
    for (let i = 0; i < 8; i += 1) {
      await db.attendanceRecord.create({ data: { occurrenceId: occurrences[i].id, userId: complete.user.id, status: "PRESENT" } });
    }
    for (let i = 8; i < 10; i += 1) {
      await db.attendanceRecord.create({ data: { occurrenceId: occurrences[i].id, userId: complete.user.id, status: "ABSENT" } });
    }

    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect((body as any).overall.allowedAbsences).toBe(1);
  });

  it("floors the sum of course raw allowances instead of summing per-course floors", async () => {
    // 仕様 #30
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.user.update({ where: { id: complete.user.id }, data: { requiredAttendanceRate: 88 } });
    await db.course.update({ where: { id: complete.course.id }, data: { totalSessions: 5 } });
    const course2 = await db.course.create({
      data: { userTimetableId: complete.userTimetable.id, name: "線形代数", color: "#fff", totalSessions: 5 },
    });
    const meeting2 = await db.meeting.create({
      data: { userTimetableId: complete.userTimetable.id, courseId: course2.id, dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 },
    });
    await createDatedOccurrences({
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      dates: Array(5).fill("2026-05-06"),
    });
    await createDatedOccurrences({
      meetingId: meeting2.id,
      courseId: course2.id,
      dates: Array(5).fill("2026-05-13"),
    });

    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect((body as any).overall.allowedAbsences).toBe(1);
  });

  it("ignores D=0 courses and returns null when all courses have D=0", async () => {
    // 仕様 #31
    const db = prisma();
    const mixed = await setupCompleteUser(db);
    await db.user.update({ where: { id: mixed.user.id }, data: { requiredAttendanceRate: 88 } });
    await db.course.update({ where: { id: mixed.course.id }, data: { totalSessions: 5 } });
    await db.course.create({
      data: { userTimetableId: mixed.userTimetable.id, name: "ゼロ単位", color: "#fff", totalSessions: 0 },
    });
    await createDatedOccurrences({
      meetingId: mixed.meeting.id,
      courseId: mixed.course.id,
      dates: Array(5).fill("2026-05-06"),
    });

    const mixedRes = await app.request(`/api/semesters/${mixed.semester.id}/overview`, { headers: { Cookie: mixed.cookie } });
    const mixedBody = await json(mixedRes);

    const allZero = await setupCompleteUser(db, { email: "all-zero@example.test" });
    await db.user.update({ where: { id: allZero.user.id }, data: { requiredAttendanceRate: 88 } });
    await db.course.update({ where: { id: allZero.course.id }, data: { totalSessions: 0 } });

    const allZeroRes = await app.request(`/api/semesters/${allZero.semester.id}/overview`, { headers: { Cookie: allZero.cookie } });
    const allZeroBody = await json(allZeroRes);

    expect(mixedRes.status).toBe(200);
    expect((mixedBody as any).overall.allowedAbsences).toBe(0);
    expect(allZeroRes.status).toBe(200);
    expect((allZeroBody as any).overall.allowedAbsences).toBeNull();
  });
});
