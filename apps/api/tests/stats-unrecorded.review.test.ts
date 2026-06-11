import { describe, expect, it } from "vitest";
import { computeCourseStats } from "../src/services/attendanceStats";
import { prisma } from "./helpers/app";
import { createOccurrence, setupCompleteUser } from "./helpers/auth";

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

const tenPastFiveFutureDates = [
  "2026-06-01",
  "2026-06-02",
  "2026-06-03",
  "2026-06-04",
  "2026-06-05",
  "2026-06-06",
  "2026-06-07",
  "2026-06-08",
  "2026-06-07",
  "2026-06-08",
  "2026-06-09",
  "2026-06-10",
  "2026-06-11",
  "2026-06-12",
  "2026-06-13",
];

describe("stats unrecorded review: design-specified toDate and projection", () => {
  it("basic example treats past unrecorded as absent-equivalent and future unrecorded as remaining", async () => {
    const { courseStats } = await statsScenario({
      statuses: [
        ...Array(6).fill("PRESENT" as const),
        "ABSENT",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
      dates: tenPastFiveFutureDates,
      requiredAttendanceRate: 70,
    });

    expect(courseStats.toDate.effectiveNumerator).toBe(6);
    expect(courseStats.toDate.effectiveDenominator).toBe(10);
    expect(courseStats.toDate.attendanceRate).toBeCloseTo(6 / 10);
    expect(courseStats.counts.unrecorded).toBe(3);
    expect(courseStats.remainingCount).toBe(5);
    // 仕様: allowedAbsences 新式
    expect(courseStats.allowedAbsences).toBe(3);
  });

  it("contrasts with no past unrecorded occurrences", async () => {
    const { courseStats } = await statsScenario({
      statuses: [
        ...Array(9).fill("PRESENT" as const),
        "ABSENT",
        null,
        null,
        null,
        null,
        null,
      ],
      dates: tenPastFiveFutureDates,
      requiredAttendanceRate: 70,
    });

    expect(courseStats.toDate.effectiveNumerator).toBe(9);
    expect(courseStats.toDate.effectiveDenominator).toBe(10);
    expect(courseStats.toDate.attendanceRate).toBeCloseTo(9 / 10);
    expect(courseStats.counts.unrecorded).toBe(0);
    expect(courseStats.remainingCount).toBe(5);
    expect(courseStats.allowedAbsences).toBe(3);
  });

  it("lowers only the toDate rate when an additional past occurrence is unrecorded", async () => {
    const recorded = await statsScenario({
      statuses: Array(4).fill("PRESENT" as const),
      dates: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"],
    });
    const withPastUnrecorded = await statsScenario({
      statuses: [...Array(4).fill("PRESENT" as const), null],
      dates: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"],
    });

    expect(recorded.courseStats.toDate.effectiveNumerator).toBe(4);
    expect(recorded.courseStats.toDate.effectiveDenominator).toBe(4);
    expect(recorded.courseStats.toDate.attendanceRate).toBeCloseTo(1);
    expect(withPastUnrecorded.courseStats.toDate.effectiveNumerator).toBe(4);
    expect(withPastUnrecorded.courseStats.toDate.effectiveDenominator).toBe(5);
    expect(withPastUnrecorded.courseStats.toDate.attendanceRate).toBeCloseTo(0.8);
  });

  it("includes unrecorded occurrences on today in toDate but excludes future unrecorded occurrences from toDate", async () => {
    const { courseStats } = await statsScenario({
      statuses: [null, null],
      dates: ["2026-06-08", "2026-06-09"],
    });

    expect(courseStats.counts.unrecorded).toBe(1);
    expect(courseStats.toDate.effectiveNumerator).toBe(0);
    expect(courseStats.toDate.effectiveDenominator).toBe(1);
    expect(courseStats.toDate.attendanceRate).toBeCloseTo(0);
    expect(courseStats.remainingCount).toBe(1);
  });

  it("uses HALF_PRESENT fractional weight for TARDY in toDate and allowed absences", async () => {
    const { courseStats } = await statsScenario({
      statuses: [
        ...Array(6).fill("PRESENT" as const),
        "TARDY",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
      dates: [
        "2026-06-01",
        "2026-06-02",
        "2026-06-03",
        "2026-06-04",
        "2026-06-05",
        "2026-06-06",
        "2026-06-07",
        "2026-06-08",
        "2026-06-08",
        "2026-06-09",
        "2026-06-10",
        "2026-06-11",
        "2026-06-12",
        "2026-06-13",
        "2026-06-14",
        "2026-06-15",
        "2026-06-16",
      ],
      requiredAttendanceRate: 70,
    });

    expect(courseStats.toDate.effectiveNumerator).toBeCloseTo(6.5);
    expect(courseStats.toDate.effectiveDenominator).toBe(9);
    expect(courseStats.toDate.attendanceRate).toBeCloseTo(6.5 / 9);
    expect(courseStats.remainingCount).toBe(8);
    // 仕様: allowedAbsences 新式
    expect(courseStats.allowedAbsences).toBe(4);
  });

  it("allows negative allowedAbsences when past unrecorded occurrences already put the projection below requirement", async () => {
    const { courseStats } = await statsScenario({
      statuses: [...Array(5).fill("PRESENT" as const), null, null, null, null, null],
      dates: [
        "2026-06-01",
        "2026-06-02",
        "2026-06-03",
        "2026-06-04",
        "2026-06-05",
        "2026-06-06",
        "2026-06-07",
        "2026-06-08",
        "2026-06-07",
        "2026-06-08",
      ],
      requiredAttendanceRate: 70,
    });

    expect(courseStats.toDate.effectiveNumerator).toBe(5);
    expect(courseStats.toDate.effectiveDenominator).toBe(10);
    expect(courseStats.toDate.attendanceRate).toBeCloseTo(0.5);
    expect(courseStats.remainingCount).toBe(0);
    // 仕様: allowedAbsences 新式
    expect(courseStats.allowedAbsences).toBe(3);
  });

  it("returns null toDate rate and null allowedAbsences when there are no occurrences", async () => {
    const { courseStats } = await statsScenario({
      statuses: [],
      requiredAttendanceRate: 70,
    });

    expect(courseStats.toDate.effectiveNumerator).toBe(0);
    expect(courseStats.toDate.effectiveDenominator).toBe(0);
    expect(courseStats.toDate.attendanceRate).toBeNull();
    expect(courseStats.remainingCount).toBe(0);
    expect(courseStats.allowedAbsences).toBeNull();
  });

  it("keeps full-period stats separate from toDate unrecorded-as-absent handling", async () => {
    const { courseStats } = await statsScenario({
      statuses: [
        ...Array(6).fill("PRESENT" as const),
        "ABSENT",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
      dates: tenPastFiveFutureDates,
      requiredAttendanceRate: 70,
    });

    expect(courseStats.counts.unrecorded).toBe(3);
    expect(courseStats.toDate.effectiveNumerator).toBe(6);
    expect(courseStats.toDate.effectiveDenominator).toBe(10);
    expect(courseStats.effectiveNumerator).toBe(6);
    expect(courseStats.effectiveDenominator).toBe(15);
  });
});
