import { describe, expect, it } from "vitest";
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

describe("stats API", () => {
  it("[§8 #55] totalSessions=15 with PRESENT 10 ABSENT 2 unrecorded 3 yields numerator 10 denominator 15 rate 10/15", async () => {
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
    expect(course.effectiveDenominator).toBe(14);
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
    expect(course.effectiveDenominator).toBe(15);
  });

  it("[§8 #58] TARDY with default HALF_PRESENT adds 0.5 numerator per record", async () => {
    const complete = await recordMany(["TARDY", "TARDY"]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveNumerator).toBe(1);
    expect(course.effectiveDenominator).toBe(15);
  });

  it("[§8 #59] CANCELLED always reduces denominator", async () => {
    const complete = await recordMany(["PRESENT", "CANCELLED"]);

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const course = (await json(res)).courses[0];

    expect(res.status).toBe(200);
    expect(course.effectiveDenominator).toBe(14);
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
    expect(course.effectiveDenominator).toBe(14);
  });

  it("[§8 #63] denominator 0 returns attendanceRate null", async () => {
    const db = prisma();
    const complete = await recordMany(["CANCELLED"]);
    await db.course.update({ where: { id: complete.course.id }, data: { totalSessions: 1 } });

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
    expect(course.effectiveDenominator).toBe(14);
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
    expect(course.effectiveDenominator).toBe(14);
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
    expect(suspendedCourse.effectiveDenominator).toBe(14);

    await (db as any).timetableSuspension.delete({ where: { id: suspension.id } });
    const restoredRes = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const restoredCourse = (await json(restoredRes)).courses[0];

    expect(restoredRes.status).toBe(200);
    expect(restoredCourse.effectiveNumerator).toBe(1);
    expect(restoredCourse.effectiveDenominator).toBe(15);
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
    expect(course.effectiveDenominator).toBe(14);
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
    expect(course.effectiveDenominator).toBe(14);
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
    expect(course.effectiveDenominator).toBe(14);
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
    expect(course.effectiveDenominator).toBe(15);
  });
});
