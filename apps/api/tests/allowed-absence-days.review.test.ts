import { describe, expect, it } from "vitest";
import { computeCourseStats } from "../src/services/attendanceStats";
import { app, prisma } from "./helpers/app";
import { createOccurrence, setupCompleteUser } from "./helpers/auth";
import { json } from "./helpers/http";

type AttendanceStatus = "PRESENT" | "ABSENT" | null;

const NOW = new Date("2026-06-08T03:00:00.000Z");
const REQUIRED_ATTENDANCE_RATE = 70;

async function createOccurrences(args: {
  meetingId: string;
  courseId: string;
  userId: string;
  statuses: AttendanceStatus[];
}) {
  const db = prisma();
  for (let i = 0; i < args.statuses.length; i += 1) {
    const day = String(i + 1).padStart(2, "0");
    const occurrence = await createOccurrence(db, {
      meetingId: args.meetingId,
      courseId: args.courseId,
      date: new Date(`2026-05-${day}T00:00:00.000Z`),
      periodOffset: i,
      startMinute: 540 + i,
      endMinute: 630 + i,
    });
    const status = args.statuses[i];
    if (status) {
      await db.attendanceRecord.create({
        data: { occurrenceId: occurrence.id, userId: args.userId, status },
      });
    }
  }
}

async function computeFor(complete: Awaited<ReturnType<typeof setupCompleteUser>>) {
  const result = await computeCourseStats({
    semesterId: complete.semester.id,
    userId: complete.user.id,
    requiredAttendanceRate: REQUIRED_ATTENDANCE_RATE,
    now: NOW,
  } as any);
  const courses = Array.isArray(result) ? result : (result as any).courses;
  return courses[0];
}

async function setupWithStatuses(statuses: AttendanceStatus[]) {
  const db = prisma();
  const complete = await setupCompleteUser(db);
  await createOccurrences({
    meetingId: complete.meeting.id,
    courseId: complete.course.id,
    userId: complete.user.id,
    statuses,
  });
  return complete;
}

function present(n: number): AttendanceStatus[] {
  return Array(n).fill("PRESENT");
}

describe("allowed absence days review contract", () => {
  it("単一曜日週1回2限では maxDayPeriods=2、allowedAbsenceDays=floor(4/2)=2", async () => {
    const complete = await setupWithStatuses(present(14));
    const courseStats = await computeFor(complete);

    expect(courseStats.allowedAbsences).toBe(4);
    expect(courseStats.maxDayPeriods).toBe(2);
    expect(courseStats.allowedAbsenceDays).toBe(2);
  });

  it("複数曜日同時限の水4金4では maxDayPeriods=4、allowedAbsenceDays=floor(8/4)=2", async () => {
    const db = prisma();
    const complete = await setupWithStatuses(present(27));
    await db.meeting.update({
      where: { id: complete.meeting.id },
      data: { periodCount: 4 },
    });
    await db.meeting.create({
      data: {
        userTimetableId: complete.userTimetable.id,
        courseId: complete.course.id,
        dayOfWeek: 5,
        startPeriodIndex: 1,
        periodCount: 4,
      },
    });

    const courseStats = await computeFor(complete);

    expect(courseStats.allowedAbsences).toBe(8);
    expect(courseStats.maxDayPeriods).toBe(4);
    expect(courseStats.allowedAbsenceDays).toBe(2);
  });

  it("複数曜日異時限の水2金4では maxDayPeriods が max の 4 になり、min 2 や avg 3 ではない", async () => {
    const db = prisma();
    const complete = await setupWithStatuses(present(27));
    await db.meeting.create({
      data: {
        userTimetableId: complete.userTimetable.id,
        courseId: complete.course.id,
        dayOfWeek: 5,
        startPeriodIndex: 1,
        periodCount: 4,
      },
    });

    const courseStats = await computeFor(complete);

    expect(courseStats.allowedAbsences).toBe(8);
    expect(courseStats.maxDayPeriods).toBe(4);
    expect(courseStats.maxDayPeriods).not.toBe(2);
    expect(courseStats.maxDayPeriods).not.toBe(3);
    expect(courseStats.allowedAbsenceDays).toBe(2);
  });

  it("同曜日に Meeting が複数ある場合は periodCount を合算して maxDayPeriods=3 にする", async () => {
    const db = prisma();
    const complete = await setupWithStatuses(present(8));
    await db.meeting.create({
      data: {
        userTimetableId: complete.userTimetable.id,
        courseId: complete.course.id,
        dayOfWeek: 3,
        startPeriodIndex: 3,
        periodCount: 1,
      },
    });

    const courseStats = await computeFor(complete);

    expect(courseStats.allowedAbsences).toBe(2);
    expect(courseStats.maxDayPeriods).toBe(3);
    expect(courseStats.allowedAbsenceDays).toBe(0);
  });

  it("allowedAbsences=0 の場合は allowedAbsenceDays=0 を返す", async () => {
    const db = prisma();
    const complete = await setupWithStatuses(present(3));
    await db.meeting.update({
      where: { id: complete.meeting.id },
      data: { periodCount: 4 },
    });
    await db.meeting.create({
      data: {
        userTimetableId: complete.userTimetable.id,
        courseId: complete.course.id,
        dayOfWeek: 5,
        startPeriodIndex: 1,
        periodCount: 4,
      },
    });

    const courseStats = await computeFor(complete);

    expect(courseStats.allowedAbsences).toBe(0);
    expect(courseStats.maxDayPeriods).toBe(4);
    expect(courseStats.allowedAbsenceDays).toBe(0);
  });

  it("allowedAbsences が負の場合は allowedAbsenceDays=null を返す", async () => {
    const complete = await setupWithStatuses(Array(8).fill("ABSENT"));
    const courseStats = await computeFor(complete);

    expect(courseStats.allowedAbsences).toBeLessThan(0);
    expect(courseStats.maxDayPeriods).toBe(2);
    expect(courseStats.allowedAbsenceDays).toBeNull();
  });

  it("occurrence 0 件で allowedAbsences=null の場合、Meeting があっても allowedAbsenceDays=null を返す", async () => {
    const complete = await setupCompleteUser(prisma());
    const courseStats = await computeFor(complete);

    expect(courseStats.allowedAbsences).toBeNull();
    expect(courseStats.maxDayPeriods).toBe(2);
    expect(courseStats.allowedAbsenceDays).toBeNull();
  });

  it("Meeting 無しでは maxDayPeriods=0、allowedAbsenceDays=null を返してゼロ除算しない", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.meeting.delete({ where: { id: complete.meeting.id } });

    const courseStats = await computeFor(complete);

    expect(courseStats.allowedAbsences).toBeNull();
    expect(courseStats.maxDayPeriods).toBe(0);
    expect(courseStats.allowedAbsenceDays).toBeNull();
  });

  it("GET /api/stats の course レスポンスに maxDayPeriods と allowedAbsenceDays を含む", async () => {
    const complete = await setupWithStatuses(present(14));

    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, {
      headers: { Cookie: complete.cookie },
    });
    const body = await json(res);
    const course = (body as any).courses[0];

    expect(res.status).toBe(200);
    expect(typeof course.maxDayPeriods).toBe("number");
    expect(typeof course.allowedAbsenceDays === "number" || course.allowedAbsenceDays === null).toBe(true);
    expect(course.maxDayPeriods).toBe(2);
    expect(course.allowedAbsenceDays).toBe(2);
  });

  it("overview は overall に日数フィールドを含めず、courses[] には含める", async () => {
    const complete = await setupWithStatuses(present(14));

    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, {
      headers: { Cookie: complete.cookie },
    });
    const overview = await json(res);
    const overall = (overview as any).overall;
    const course = (overview as any).courses[0];

    expect(res.status).toBe(200);
    expect(overall).toHaveProperty("allowedAbsences");
    expect(overall).not.toHaveProperty("maxDayPeriods");
    expect(overall).not.toHaveProperty("allowedAbsenceDays");
    expect(typeof course.maxDayPeriods).toBe("number");
    expect(typeof course.allowedAbsenceDays === "number" || course.allowedAbsenceDays === null).toBe(true);
    expect(course.maxDayPeriods).toBe(2);
    expect(course.allowedAbsenceDays).toBe(2);
  });
});
