import { describe, expect, it } from "vitest";
import { computeCourseStats } from "../src/services/attendanceStats";
import { app, prisma } from "./helpers/app";
import {
  createOccurrence,
  createSchoolDepartment,
  createSemester,
  createTestUser,
  createUserTimetable,
  setupCompleteUser,
} from "./helpers/auth";
import { json } from "./helpers/http";

type AttendanceStatus = "EXCUSED" | "TARDY" | "EARLY_LEAVE";
type Strategy =
  | "COUNT_AS_PRESENT"
  | "COUNT_AS_ABSENT"
  | "HALF_PRESENT"
  | "REDUCE_DENOMINATOR"
  | "SEPARATE_COUNT";

const defaultStrategies = {
  excusedStrategy: "REDUCE_DENOMINATOR" as const,
  tardyStrategy: "HALF_PRESENT" as const,
  earlyLeaveStrategy: "HALF_PRESENT" as const,
};

async function recordOne(args: {
  userId: string;
  meetingId: string;
  courseId: string;
  status: AttendanceStatus;
}) {
  const db = prisma();
  const occurrence = await createOccurrence(db, {
    meetingId: args.meetingId,
    courseId: args.courseId,
    date: new Date("2026-05-13T00:00:00.000Z"),
  });
  await db.attendanceRecord.create({
    data: { occurrenceId: occurrence.id, userId: args.userId, status: args.status },
  });
}

async function fetchFirstCourse(semesterId: string, cookie: string) {
  const res = await app.request(`/api/stats?semesterId=${semesterId}`, { headers: { Cookie: cookie } });
  const body = (await json(res)) as any;

  expect(res.status).toBe(200);
  return body.courses[0];
}

async function computeFirstCourse(semesterId: string, userId: string) {
  const result = await computeCourseStats({
    semesterId,
    userId,
    requiredAttendanceRate: 70,
    now: new Date("2026-06-08T03:00:00.000Z"),
  } as any);
  return (Array.isArray(result) ? result : (result as any).courses)[0];
}

async function manualUserWithExcusedRecord() {
  const db = prisma();
  const complete = await setupCompleteUser(db);
  await recordOne({
    userId: complete.user.id,
    meetingId: complete.meeting.id,
    courseId: complete.course.id,
    status: "EXCUSED",
  });
  return complete;
}

describe("AttendanceRule scope resolution", () => {
  it("case A: manual timetable uses User school/dept so user override wins", async () => {
    const db = prisma();
    const complete = await manualUserWithExcusedRecord();
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        userId: complete.user.id,
        ...defaultStrategies,
        excusedStrategy: "COUNT_AS_PRESENT",
      },
    });

    const course = await fetchFirstCourse(complete.semester.id, complete.cookie);

    expect(course.effectiveNumerator).toBe(1);
    expect(course.effectiveDenominator).toBe(1);
  });

  it("case B: manual timetable uses school+department default when no user override exists", async () => {
    const db = prisma();
    const complete = await manualUserWithExcusedRecord();
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        ...defaultStrategies,
        excusedStrategy: "COUNT_AS_PRESENT",
      },
    });

    const course = await fetchFirstCourse(complete.semester.id, complete.cookie);

    expect(course.effectiveNumerator).toBe(1);
    expect(course.effectiveDenominator).toBe(1);
  });

  it("case B': user override has priority over school+department default on manual timetable", async () => {
    const db = prisma();
    const complete = await manualUserWithExcusedRecord();
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        ...defaultStrategies,
        excusedStrategy: "COUNT_AS_ABSENT",
      },
    });
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        userId: complete.user.id,
        ...defaultStrategies,
        excusedStrategy: "COUNT_AS_PRESENT",
      },
    });

    const course = await fetchFirstCourse(complete.semester.id, complete.cookie);

    expect(course.effectiveNumerator).toBe(1);
    expect(course.effectiveDenominator).toBe(1);
  });

  it("case C: manual timetable with no rule rows falls back to system default", async () => {
    const complete = await manualUserWithExcusedRecord();

    const course = await fetchFirstCourse(complete.semester.id, complete.cookie);

    expect(course.effectiveNumerator).toBe(0);
    expect(course.effectiveDenominator).toBe(0);
  });

  it("case D: template-derived timetable still uses school+department default", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const user = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
    const semester = await createSemester(db, user.id);
    const template = await db.timetableTemplate.create({
      data: {
        authorUserId: user.id,
        schoolId: school.id,
        departmentId: department.id,
        title: "テンプレート時間割",
      },
    });
    const { course, meeting } = await createUserTimetable(db, user.id, semester.id, {
      sourceTemplateId: template.id,
    });
    await recordOne({ userId: user.id, meetingId: meeting.id, courseId: course.id, status: "EXCUSED" });
    await db.attendanceRule.create({
      data: {
        schoolId: school.id,
        departmentId: department.id,
        ...defaultStrategies,
        excusedStrategy: "COUNT_AS_PRESENT",
      },
    });

    const statsCourse = await computeFirstCourse(semester.id, user.id);

    expect(statsCourse.effectiveNumerator).toBe(1);
    expect(statsCourse.effectiveDenominator).toBe(1);
  });

  it("case E: missing User.schoolId ignores matching rule rows and uses system default", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const user = await createTestUser(db, { schoolId: null, departmentId: department.id });
    const semester = await createSemester(db, user.id);
    const { course, meeting } = await createUserTimetable(db, user.id, semester.id, { sourceTemplateId: null });
    await recordOne({ userId: user.id, meetingId: meeting.id, courseId: course.id, status: "EXCUSED" });
    await db.attendanceRule.create({
      data: {
        schoolId: school.id,
        departmentId: department.id,
        ...defaultStrategies,
        excusedStrategy: "COUNT_AS_PRESENT",
      },
    });

    const statsCourse = await computeFirstCourse(semester.id, user.id);

    expect(statsCourse.effectiveNumerator).toBe(0);
    expect(statsCourse.effectiveDenominator).toBe(0);
  });

  it("case E': missing User.departmentId ignores matching rule rows and uses system default", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db);
    const user = await createTestUser(db, { schoolId: school.id, departmentId: null });
    const semester = await createSemester(db, user.id);
    const { course, meeting } = await createUserTimetable(db, user.id, semester.id, { sourceTemplateId: null });
    await recordOne({ userId: user.id, meetingId: meeting.id, courseId: course.id, status: "EXCUSED" });
    await db.attendanceRule.create({
      data: {
        schoolId: school.id,
        departmentId: department.id,
        ...defaultStrategies,
        excusedStrategy: "COUNT_AS_PRESENT",
      },
    });

    const statsCourse = await computeFirstCourse(semester.id, user.id);

    expect(statsCourse.effectiveNumerator).toBe(0);
    expect(statsCourse.effectiveDenominator).toBe(0);
  });

  it.each([
    ["COUNT_AS_PRESENT", 1, 1, undefined],
    ["COUNT_AS_ABSENT", 0, 1, undefined],
    ["HALF_PRESENT", 0.5, 1, undefined],
    ["REDUCE_DENOMINATOR", 0, 0, undefined],
    ["SEPARATE_COUNT", 0, 0, 1],
  ] as const)(
    "EXCUSED strategy %s maps to numerator/denominator/separateCounts",
    async (strategy: Strategy, expectedNumerator, expectedDenominator, expectedSeparateCount) => {
      const db = prisma();
      const complete = await manualUserWithExcusedRecord();
      await db.attendanceRule.create({
        data: {
          schoolId: complete.school.id,
          departmentId: complete.department.id,
          ...defaultStrategies,
          excusedStrategy: strategy,
        },
      });

      const course = await fetchFirstCourse(complete.semester.id, complete.cookie);

      expect(course.effectiveNumerator).toBe(expectedNumerator);
      expect(course.effectiveDenominator).toBe(expectedDenominator);
      if (expectedSeparateCount !== undefined) {
        expect(course.separateCounts.EXCUSED).toBe(expectedSeparateCount);
      }
    },
  );

  it("TARDY uses the effective tardyStrategy", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await recordOne({
      userId: complete.user.id,
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      status: "TARDY",
    });
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        ...defaultStrategies,
        tardyStrategy: "COUNT_AS_PRESENT",
      },
    });

    const course = await fetchFirstCourse(complete.semester.id, complete.cookie);

    expect(course.effectiveNumerator).toBe(1);
    expect(course.effectiveDenominator).toBe(1);
  });

  it("EARLY_LEAVE uses the effective earlyLeaveStrategy", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await recordOne({
      userId: complete.user.id,
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      status: "EARLY_LEAVE",
    });
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        ...defaultStrategies,
        earlyLeaveStrategy: "HALF_PRESENT",
      },
    });

    const course = await fetchFirstCourse(complete.semester.id, complete.cookie);

    expect(course.effectiveNumerator).toBe(0.5);
    expect(course.effectiveDenominator).toBe(1);
  });
});
