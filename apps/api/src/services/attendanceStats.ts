import type { AttendanceStatus, RuleStrategy } from "@prisma/client";
import type { CourseStatsDto } from "@atender/shared";
import { prisma } from "../db";
import { toIsoDate } from "../lib/tz";
import { resolveUserRuleScope } from "./activeTimetable";
import { getEffectiveRule, systemDefaultRule, type EffectiveRule } from "./rules";

function strategyWeight(strategy: RuleStrategy): { num: number; den: number; separate: boolean } {
  switch (strategy) {
    case "COUNT_AS_PRESENT":
      return { num: 1, den: 1, separate: false };
    case "COUNT_AS_ABSENT":
      return { num: 0, den: 1, separate: false };
    case "HALF_PRESENT":
      return { num: 0.5, den: 1, separate: false };
    case "REDUCE_DENOMINATOR":
      return { num: 0, den: 0, separate: false };
    case "SEPARATE_COUNT":
      return { num: 0, den: 0, separate: true };
  }
}

function statusWeight(status: AttendanceStatus, rule: EffectiveRule["effective"]) {
  if (status === "PRESENT") return strategyWeight("COUNT_AS_PRESENT");
  if (status === "ABSENT") return strategyWeight("COUNT_AS_ABSENT");
  if (status === "CANCELLED") return strategyWeight("REDUCE_DENOMINATOR");
  if (status === "EXCUSED") return strategyWeight(rule.excusedStrategy);
  if (status === "TARDY") return strategyWeight(rule.tardyStrategy);
  return strategyWeight(rule.earlyLeaveStrategy);
}

export async function computeCourseStats(args: {
  semesterId: string;
  userId: string;
  requiredAttendanceRate: number;
  now?: Date;
}): Promise<CourseStatsDto[]> {
  const result = await computeCourseStatsWithProjection(args);
  return result.courses;
}

export async function computeCourseStatsWithProjection(args: {
  semesterId: string;
  userId: string;
  requiredAttendanceRate: number;
  now?: Date;
}): Promise<{
  courses: CourseStatsDto[];
  overallProjection: { num: number; den: number };
  overallAllowance: { allowanceSum: number; hasDenominator: boolean };
}> {
  const timetable = await prisma.userTimetable.findUnique({
    where: { userId_semesterId: { userId: args.userId, semesterId: args.semesterId } },
    include: {
      timetableSuspensions: true,
      courses: {
        include: {
          occurrences: {
            include: { attendanceRecord: true },
          },
          suspensions: true,
        },
      },
    },
  });
  if (!timetable) {
    return {
      courses: [],
      overallProjection: { num: 0, den: 0 },
      overallAllowance: { allowanceSum: 0, hasDenominator: false },
    };
  }

  const scope = await resolveUserRuleScope(args.userId);
  const effective = scope.schoolId && scope.departmentId
    ? (await getEffectiveRule({ schoolId: scope.schoolId, departmentId: scope.departmentId, userId: args.userId })).effective
    : systemDefaultRule;
  const todayIso = toIsoDate(args.now ?? new Date());
  const timetableSuspendedDates = new Set(timetable.timetableSuspensions.map((suspension) => toIsoDate(suspension.date)));

  const requiredRate = args.requiredAttendanceRate / 100;
  let overallProjectionNum = 0;
  let overallProjectionDen = 0;
  let overallAllowanceSum = 0;
  let overallHasDenominator = false;

  const courses = timetable.courses.map((course) => {
    const counts = { present: 0, absent: 0, excused: 0, tardy: 0, earlyLeave: 0, cancelled: 0, suspended: 0, unrecorded: 0 };
    const separateCounts: Partial<Record<AttendanceStatus, number>> = {};
    let numerator = 0;
    let denominatorReduction = 0;
    let toDateNum = 0;
    let toDateDen = 0;
    let floatingPast = 0;
    let floatingFuture = 0;
    let fixedNumAll = 0;
    let fixedDenAll = 0;
    const suspendedDates = new Set(course.suspensions.map((suspension) => toIsoDate(suspension.date)));

    for (const occurrence of course.occurrences) {
      const occurrenceDate = toIsoDate(occurrence.date);
      if (timetableSuspendedDates.has(occurrenceDate)) {
        counts.suspended += 1;
        denominatorReduction += 1;
        continue;
      }
      if (suspendedDates.has(occurrenceDate)) {
        counts.suspended += 1;
        denominatorReduction += 1;
        continue;
      }
      const record = occurrence.attendanceRecord;
      if (!record) {
        if (occurrenceDate <= todayIso) {
          counts.unrecorded += 1;
          floatingPast += 1;
        } else {
          floatingFuture += 1;
        }
        continue;
      }
      if (record.status === "PRESENT") counts.present += 1;
      if (record.status === "ABSENT") counts.absent += 1;
      if (record.status === "EXCUSED") counts.excused += 1;
      if (record.status === "TARDY") counts.tardy += 1;
      if (record.status === "EARLY_LEAVE") counts.earlyLeave += 1;
      if (record.status === "CANCELLED") counts.cancelled += 1;

      const weight = statusWeight(record.status, effective);
      if (weight.separate) {
        separateCounts[record.status] = (separateCounts[record.status] ?? 0) + 1;
        denominatorReduction += 1;
      } else {
        numerator += weight.num;
        if (weight.den === 0) denominatorReduction += 1;
        if (occurrenceDate <= todayIso) {
          toDateNum += weight.num;
          toDateDen += weight.den;
        }
        fixedNumAll += weight.num;
        fixedDenAll += weight.den;
      }
    }

    const denominator = Math.max(0, course.totalSessions - denominatorReduction);
    const projectedNum = fixedNumAll + floatingFuture;
    const projectedDen = fixedDenAll + floatingPast + floatingFuture;
    const toDateDenWithUnrecorded = toDateDen + floatingPast;
    const consumedAbsence = fixedDenAll - fixedNumAll;
    const allowanceRaw = (1 - requiredRate) * denominator - consumedAbsence;
    overallProjectionNum += projectedNum;
    overallProjectionDen += projectedDen;
    if (denominator > 0) {
      overallHasDenominator = true;
      overallAllowanceSum += allowanceRaw;
    }
    return {
      courseId: course.id,
      courseName: course.name,
      teacher: course.teacher,
      totalSessions: course.totalSessions,
      generatedOccurrences: course.occurrences.length,
      counts,
      effectiveNumerator: numerator,
      effectiveDenominator: denominator,
      attendanceRate: denominator === 0 ? null : numerator / denominator,
      ...(Object.keys(separateCounts).length > 0 ? { separateCounts } : {}),
      toDate: {
        effectiveNumerator: toDateNum,
        effectiveDenominator: toDateDenWithUnrecorded,
        attendanceRate: toDateDenWithUnrecorded === 0 ? null : toDateNum / toDateDenWithUnrecorded,
      },
      remainingCount: floatingFuture,
      allowedAbsences: denominator === 0 ? null : Math.floor(allowanceRaw + 1e-9),
    };
  });

  return {
    courses,
    overallProjection: { num: overallProjectionNum, den: overallProjectionDen },
    overallAllowance: { allowanceSum: overallAllowanceSum, hasDenominator: overallHasDenominator },
  };
}
