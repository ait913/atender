import { describe, expect, it } from "vitest";
import { computeCourseStats } from "../src/services/attendanceStats";
import { app, prisma } from "./helpers/app";
import { createOccurrence, setupCompleteUser } from "./helpers/auth";
import { json } from "./helpers/http";

async function recordMany(statuses: Array<"PRESENT" | "ABSENT" | "EXCUSED" | "TARDY" | "EARLY_LEAVE" | "CANCELLED" | null>) {
  const db = prisma();
  const complete = await setupCompleteUser(db);
  for (let i = 0; i < statuses.length; i += 1) {
    const day = String(i + 1).padStart(2, "0");
    const occurrence = await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: new Date(`2026-05-${day}T00:00:00.000Z`),
      periodOffset: 0,
    });
    const status = statuses[i];
    if (status) {
      await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status } });
    }
  }
  return complete;
}

type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "TARDY" | "EARLY_LEAVE" | "CANCELLED" | null;

async function statsScenario(args: {
  statuses: AttendanceStatus[];
  dates?: string[];
  requiredAttendanceRate?: number;
  now?: Date;
}) {
  const db = prisma();
  const complete = await setupCompleteUser(db);
  await (db.user.update as any)({
    where: { id: complete.user.id },
    data: { requiredAttendanceRate: args.requiredAttendanceRate ?? 70 },
  }).catch(() => undefined);

  const occurrences = [];
  for (let i = 0; i < args.statuses.length; i += 1) {
    const date = args.dates?.[i] ?? `2026-06-${String(i + 1).padStart(2, "0")}`;
    const occurrence = await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: new Date(`${date}T00:00:00.000Z`),
      periodOffset: i,
      startMinute: 540 + i,
      endMinute: 630 + i,
    });
    occurrences.push(occurrence);
    const status = args.statuses[i];
    if (status) {
      await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status } });
    }
  }

  const result = await computeCourseStats({
    semesterId: complete.semester.id,
    userId: complete.user.id,
    requiredAttendanceRate: args.requiredAttendanceRate ?? 70,
    now: args.now ?? new Date("2026-06-08T03:00:00.000Z"),
  } as any);
  const courses = Array.isArray(result) ? result : (result as any).courses;
  return { ...complete, occurrences, courseStats: courses[0], statsResult: result as any };
}

describe("stats API", () => {
  it("[§8 #55] occurrence count 15 with PRESENT 10 ABSENT 2 unrecorded 3 yields numerator 10 denominator 15 rate 10/15", async () => {
    const complete = await recordMany([
      ...Array(10).fill("PRESENT" as const),
      "ABSENT",
      "ABSENT",
      null,
      null,
      null,
    ]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);
    const course = body.courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveNumerator).toBe(10);
    expect(course.effectiveDenominator).toBe(15);
    expect(course.attendanceRate).toBeCloseTo(10 / 15);
  });

  it("[§8 #56] EXCUSED with default REDUCE_DENOMINATOR reduces denominator by 1", async () => {
    const complete = await recordMany(["PRESENT", "EXCUSED"]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveDenominator).toBe(1);
  });

  it("[§8 #57] EXCUSED with COUNT_AS_PRESENT contributes like PRESENT", async () => {
    const db = prisma();
    const complete = await recordMany(["EXCUSED"]);
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        excusedStrategy: "COUNT_AS_PRESENT",
        tardyStrategy: "HALF_PRESENT",
        earlyLeaveStrategy: "HALF_PRESENT",
      },
    });

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveNumerator).toBe(1);
    expect(course.effectiveDenominator).toBe(1);
  });

  it("[§8 #58] TARDY with default HALF_PRESENT adds 0.5 numerator per record", async () => {
    const complete = await recordMany(["TARDY", "TARDY"]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveNumerator).toBe(1);
    expect(course.effectiveDenominator).toBe(2);
  });

  it("[§8 #59] CANCELLED always reduces denominator", async () => {
    const complete = await recordMany(["PRESENT", "CANCELLED"]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveDenominator).toBe(1);
  });

  it("[§8 #60] user AttendanceRule override wins over school+department default", async () => {
    const db = prisma();
    const complete = await recordMany(["EXCUSED"]);
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        excusedStrategy: "COUNT_AS_ABSENT",
        tardyStrategy: "HALF_PRESENT",
        earlyLeaveStrategy: "HALF_PRESENT",
      },
    });
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        userId: complete.user.id,
        excusedStrategy: "COUNT_AS_PRESENT",
        tardyStrategy: "HALF_PRESENT",
        earlyLeaveStrategy: "HALF_PRESENT",
      },
    });

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveNumerator).toBe(1);
  });

  it("[§8 #61] school+department default is used when no user override exists", async () => {
    const db = prisma();
    const complete = await recordMany(["EXCUSED"]);
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        excusedStrategy: "COUNT_AS_PRESENT",
        tardyStrategy: "HALF_PRESENT",
        earlyLeaveStrategy: "HALF_PRESENT",
      },
    });

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveNumerator).toBe(1);
  });

  it("[§8 #62] system default is used when no AttendanceRule rows exist", async () => {
    const complete = await recordMany(["EXCUSED", "TARDY", "EARLY_LEAVE"]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveNumerator).toBe(1);
    expect(course.effectiveDenominator).toBe(2);
  });

  it("[§8 #63] denominator 0 returns attendanceRate null", async () => {
    const db = prisma();
    const complete = await recordMany(["CANCELLED"]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveDenominator).toBe(0);
    expect(course.attendanceRate).toBeNull();
  });

  it("[§8 #64] SEPARATE_COUNT excludes status from numerator denominator and reports separateCounts", async () => {
    const db = prisma();
    const complete = await recordMany(["EXCUSED"]);
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        userId: complete.user.id,
        excusedStrategy: "SEPARATE_COUNT",
        tardyStrategy: "HALF_PRESENT",
        earlyLeaveStrategy: "HALF_PRESENT",
      },
    });

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveNumerator).toBe(0);
    expect(course.effectiveDenominator).toBe(0);
    expect(course.separateCounts.EXCUSED).toBe(1);
  });

  it("[§8 #65] GET /api/stats returns courses only for the requested semester", async () => {
    const complete = await recordMany(["PRESENT"]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.semesterId).toBe(complete.semester.id);
    expect(body.courses.map((c: { courseId: string }) => c.courseId)).toEqual([complete.course.id]);
  });

  it("[#8] timetable suspension counts an unrecorded occurrence as suspended and reduces denominator", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") });
    await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.counts.suspended).toBe(1);
    expect(course.effectiveDenominator).toBe(0);
  });

  it("[#10] deleting timetable suspension restores normal PRESENT evaluation", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: new Date("2026-05-13T00:00:00.000Z"),
    });
    await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "PRESENT" } });
    const suspension = await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const suspendedRes = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const suspendedCourse = (await json(suspendedRes)).courses[0];
    expect(suspendedCourse.counts.suspended).toBe(1);
    expect(suspendedCourse.effectiveDenominator).toBe(0);

    await (db as any).timetableSuspension.delete({ where: { id: suspension.id } });
    const restoredRes = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const restoredCourse = (await json(restoredRes)).courses[0];

    expect(restoredRes.status).toBe(200);
    expect(restoredCourse.effectiveNumerator).toBe(1);
    expect(restoredCourse.effectiveDenominator).toBe(1);
  });

  it("[#13] timetable suspension and course suspension on the same occurrence do not double-count", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") });
    await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });
    await db.courseSuspension.create({
      data: { courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.counts.suspended).toBe(1);
    expect(course.effectiveDenominator).toBe(0);
  });

  it("[#14] removing only timetable suspension keeps the course suspension denominator reduction", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") });
    const suspension = await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });
    await db.courseSuspension.create({
      data: { courseId: complete.course.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    await (db as any).timetableSuspension.delete({ where: { id: suspension.id } });
    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.counts.suspended).toBe(1);
    expect(course.effectiveDenominator).toBe(0);
  });

  it("[#26] adding timetable suspension after PRESENT keeps AttendanceRecord but stats prefer suspended", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: new Date("2026-05-13T00:00:00.000Z"),
    });
    const record = await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "PRESENT" } });
    await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    await expect(db.attendanceRecord.findFirst({ where: { id: record.id } })).resolves.not.toBeNull();
    expect(res.status).toBe(200);
    expect(course.counts.suspended).toBe(1);
    expect(course.effectiveNumerator).toBe(0);
    expect(course.effectiveDenominator).toBe(0);
  });

  it("[#27] deleting timetable suspension reactivates the preserved PRESENT record", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: new Date("2026-05-13T00:00:00.000Z"),
    });
    await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "PRESENT" } });
    const suspension = await (db as any).timetableSuspension.create({
      data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-05-13T00:00:00.000Z") },
    });

    await (db as any).timetableSuspension.delete({ where: { id: suspension.id } });
    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveNumerator).toBe(1);
    expect(course.effectiveDenominator).toBe(1);
  });

  it("computes toDate with past unrecorded occurrences as absent-equivalent and projects allowed absences", async () => {
    const { courseStats } = await statsScenario({
      // 仕様 #1
      // 仕様 #2
      statuses: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT", null, null, null, null, null, null, null, null],
      now: new Date("2026-06-08T03:00:00.000Z"),
    });

    expect(courseStats.toDate).toMatchObject({ effectiveNumerator: 6, effectiveDenominator: 8 });
    expect(courseStats.toDate.attendanceRate).toBeCloseTo(6 / 8);
    expect(courseStats.counts.unrecorded).toBe(1);
    expect(courseStats.remainingCount).toBe(7);
    expect(courseStats.allowedAbsences).toBe(3);
  });

  it("includes today in toDate when recorded and counts an unrecorded today in the denominator", async () => {
    const recorded = await statsScenario({
      // 仕様 #3
      statuses: ["PRESENT"],
      dates: ["2026-06-08"],
      now: new Date("2026-06-08T03:00:00.000Z"),
    });
    expect(recorded.courseStats.toDate).toMatchObject({ effectiveNumerator: 1, effectiveDenominator: 1 });

    const unrecorded = await statsScenario({
      // 仕様 #3
      statuses: [null],
      dates: ["2026-06-08"],
      now: new Date("2026-06-08T03:00:00.000Z"),
    });
    expect(unrecorded.courseStats.toDate).toMatchObject({ effectiveNumerator: 0, effectiveDenominator: 1, attendanceRate: 0 });
    expect(unrecorded.courseStats.counts.unrecorded).toBe(1);
  });

  it("excludes future pre-recorded attendance from toDate and remainingCount but fixes it in the projection", async () => {
    const { courseStats } = await statsScenario({
      // 仕様 #4
      statuses: ["PRESENT", "PRESENT"],
      dates: ["2026-06-01", "2026-06-20"],
      now: new Date("2026-06-08T03:00:00.000Z"),
    });

    expect(courseStats.toDate).toMatchObject({ effectiveNumerator: 1, effectiveDenominator: 1 });
    expect(courseStats.remainingCount).toBe(0);
    expect(courseStats.allowedAbsences).toBe(0);
  });

  it("uses fractional HALF_PRESENT weights in toDate and allowedAbsences", async () => {
    const { courseStats } = await statsScenario({
      // 仕様 #5
      statuses: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "TARDY", null, null, null, null, null, null, null, null],
      now: new Date("2026-06-07T03:00:00.000Z"),
    });

    expect(courseStats.toDate).toMatchObject({ effectiveNumerator: 6.5, effectiveDenominator: 7 });
    expect(courseStats.toDate.attendanceRate).toBeCloseTo(6.5 / 7);
    expect(courseStats.allowedAbsences).toBe(4);
  });

  it("keeps REDUCE_DENOMINATOR/CANCELLED out of toDate and projection denominators", async () => {
    const { courseStats } = await statsScenario({
      // 仕様 #6
      statuses: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "EXCUSED"],
      now: new Date("2026-06-07T03:00:00.000Z"),
    });
    expect(courseStats.toDate).toMatchObject({ effectiveNumerator: 6, effectiveDenominator: 6, attendanceRate: 1 });

    const cancelled = await statsScenario({
      // 仕様 #6
      statuses: ["PRESENT", "CANCELLED"],
      now: new Date("2026-06-02T03:00:00.000Z"),
    });
    expect(cancelled.courseStats.toDate).toMatchObject({ effectiveNumerator: 1, effectiveDenominator: 1, attendanceRate: 1 });
  });

  it("excludes SEPARATE_COUNT records from toDate and projection while preserving separateCounts", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        userId: complete.user.id,
        excusedStrategy: "SEPARATE_COUNT",
        tardyStrategy: "HALF_PRESENT",
        earlyLeaveStrategy: "HALF_PRESENT",
      },
    });
    const occurrence = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-06-01T00:00:00.000Z") });
    await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "EXCUSED" } });

    const result = await computeCourseStats({
      // 仕様 #7
      semesterId: complete.semester.id,
      userId: complete.user.id,
      requiredAttendanceRate: 70,
      now: new Date("2026-06-02T03:00:00.000Z"),
    } as any);
    const courseStats = (Array.isArray(result) ? result : (result as any).courses)[0];
    expect(courseStats.toDate).toMatchObject({ effectiveNumerator: 0, effectiveDenominator: 0, attendanceRate: null });
    expect(courseStats.separateCounts.EXCUSED).toBe(1);
    expect(courseStats.allowedAbsences).toBeNull();
  });

  it("excludes timetable and course suspensions from toDate remainingCount and projection", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const dates = ["2026-06-01", "2026-06-10", "2026-06-20"];
    for (const [index, date] of dates.entries()) {
      await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: new Date(`${date}T00:00:00.000Z`),
        periodOffset: index,
      });
    }
    await (db as any).timetableSuspension.create({ data: { userTimetableId: complete.userTimetable.id, date: new Date("2026-06-01T00:00:00.000Z") } });
    await db.courseSuspension.create({ data: { courseId: complete.course.id, date: new Date("2026-06-20T00:00:00.000Z") } });

    const result = await computeCourseStats({
      // 仕様 #8
      semesterId: complete.semester.id,
      userId: complete.user.id,
      requiredAttendanceRate: 70,
      now: new Date("2026-06-08T03:00:00.000Z"),
    } as any);
    const courseStats = (Array.isArray(result) ? result : (result as any).courses)[0];

    expect(courseStats.toDate).toMatchObject({ effectiveNumerator: 0, effectiveDenominator: 0, attendanceRate: null });
    expect(courseStats.remainingCount).toBe(1);
    expect(courseStats.allowedAbsences).toBe(0);
  });

  it("returns zero at the exact required-rate boundary and negative values when already below it", async () => {
    const boundary = await statsScenario({
      // 仕様 #9
      statuses: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT", "ABSENT", "ABSENT"],
      now: new Date("2026-06-10T03:00:00.000Z"),
    });
    expect(boundary.courseStats.allowedAbsences).toBe(0);

    const below = await statsScenario({
      // 仕様 #10
      statuses: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT", "ABSENT", "ABSENT", "ABSENT"],
      now: new Date("2026-06-10T03:00:00.000Z"),
    });
    expect(below.courseStats.allowedAbsences).toBe(-1);
    expect(below.courseStats.toDate.attendanceRate).toBe(0.6);
  });

  it("returns null rates and allowedAbsences for a course with zero occurrences", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.meetingOccurrence.deleteMany({ where: { meetingId: complete.meeting.id } });

    const result = await computeCourseStats({
      // 仕様 #11
      semesterId: complete.semester.id,
      userId: complete.user.id,
      requiredAttendanceRate: 70,
      now: new Date("2026-06-10T03:00:00.000Z"),
    } as any);
    const courseStats = (Array.isArray(result) ? result : (result as any).courses)[0];

    expect(courseStats.toDate).toMatchObject({ effectiveNumerator: 0, effectiveDenominator: 0, attendanceRate: null });
    expect(courseStats.remainingCount).toBe(0);
    expect(courseStats.allowedAbsences).toBeNull();
  });

  it("preserves existing occurrence-based stats fields while adding toDate fields", async () => {
    const { courseStats } = await statsScenario({
      // 仕様 #12
      statuses: ["PRESENT", "ABSENT", null],
      now: new Date("2026-06-03T03:00:00.000Z"),
    });

    expect(courseStats.effectiveNumerator).toBe(1);
    expect(courseStats.effectiveDenominator).toBe(3);
    expect(courseStats.attendanceRate).toBeCloseTo(1 / 3);
    expect(courseStats.counts).toMatchObject({ present: 1, absent: 1, unrecorded: 1 });
    expect(courseStats.toDate).toMatchObject({ effectiveNumerator: 1, effectiveDenominator: 3 });
  });

  it("aggregates overview toDate counts, remaining counts, required rate, and stats root required rate", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await (db.user.update as any)({ where: { id: complete.user.id }, data: { requiredAttendanceRate: 80 } }).catch(() => undefined);
    const first = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-06-01T00:00:00.000Z") });
    await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-12-01T00:00:00.000Z"), periodOffset: 1 });
    await db.attendanceRecord.create({ data: { occurrenceId: first.id, userId: complete.user.id, status: "PRESENT" } });

    const overviewRes = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const overview = await json(overviewRes);
    const statsRes = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const stats = await json(statsRes);

    // 仕様 #14
    expect(overview.overall.toDate).toMatchObject({ effectiveNumerator: 1, effectiveDenominator: 1, attendanceRate: 1 });
    expect(overview.overall.unrecordedCount).toBe(0);
    expect(overview.overall.remainingCount).toBe(1);
    // 仕様 #15
    expect(typeof overview.overall.allowedAbsences === "number" || overview.overall.allowedAbsences === null).toBe(true);
    // 仕様 #16
    expect(stats.requiredAttendanceRate).toBe(80);
  });
});
