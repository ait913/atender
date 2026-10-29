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

// 回数の側 (course.maxAbsences) の欠席重み a と分母 d。d が 0 なら数えない。
function lessonWeight(
  status: AttendanceStatus,
  rule: EffectiveRule["effective"],
  tardiesPerAbsence: number | null,
): { a: number; d: number } {
  const byStrategy = (strategy: RuleStrategy) => {
    switch (strategy) {
      case "COUNT_AS_PRESENT":
        return { a: 0, d: 1 };
      case "COUNT_AS_ABSENT":
        return { a: 1, d: 1 };
      case "HALF_PRESENT":
        return { a: 0.5, d: 1 };
      case "REDUCE_DENOMINATOR":
      case "SEPARATE_COUNT":
        return { a: 0, d: 0 };
    }
  };
  if (status === "PRESENT") return { a: 0, d: 1 };
  if (status === "ABSENT") return { a: 1, d: 1 };
  if (status === "CANCELLED") return { a: 0, d: 0 };
  if (status === "EXCUSED") return byStrategy(rule.excusedStrategy);
  if (tardiesPerAbsence != null) return { a: 0, d: 1 };
  return byStrategy(status === "TARDY" ? rule.tardyStrategy : rule.earlyLeaveStrategy);
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
          meetings: true,
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

  let overallProjectionNum = 0;
  let overallProjectionDen = 0;
  let overallAllowanceSum = 0;
  let overallHasDenominator = false;

  const courses = timetable.courses.map((course) => {
    const courseRule = {
      requiredAttendanceRate: course.requiredAttendanceRate ?? null,
      maxAbsences: course.maxAbsences ?? null,
      tardiesPerAbsence: course.tardiesPerAbsence ?? null,
    };
    const tardiesPerAbsence = courseRule.tardiesPerAbsence;
    const usedRate = courseRule.requiredAttendanceRate ?? args.requiredAttendanceRate;
    const requiredRate = usedRate / 100;
    let tardyAll = 0;
    let tardyToDate = 0;
    const lessons = new Map<string, { a: number; d: number; tardy: boolean }>();
    const futureUnrecordedDates = new Set<string>();
    const perDay = new Map<number, number>();
    for (const meeting of course.meetings) {
      perDay.set(meeting.dayOfWeek, (perDay.get(meeting.dayOfWeek) ?? 0) + meeting.periodCount);
    }
    const maxDayPeriods = perDay.size === 0 ? 0 : Math.max(...perDay.values());
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
      const lesson = lessons.get(occurrenceDate) ?? { a: 0, d: 0, tardy: false };
      lessons.set(occurrenceDate, lesson);
      if (!record) {
        lesson.d += 1;
        if (occurrenceDate <= todayIso) {
          counts.unrecorded += 1;
          floatingPast += 1;
        } else {
          floatingFuture += 1;
          futureUnrecordedDates.add(occurrenceDate);
        }
        continue;
      }
      const lw = lessonWeight(record.status, effective, tardiesPerAbsence);
      lesson.a += lw.a;
      lesson.d += lw.d;
      const isTardyLike = record.status === "TARDY" || record.status === "EARLY_LEAVE";
      if (tardiesPerAbsence != null && isTardyLike) {
        lesson.tardy = true;
        tardyAll += 1;
        if (occurrenceDate <= todayIso) tardyToDate += 1;
      }
      if (record.status === "PRESENT") counts.present += 1;
      if (record.status === "ABSENT") counts.absent += 1;
      if (record.status === "EXCUSED") counts.excused += 1;
      if (record.status === "TARDY") counts.tardy += 1;
      if (record.status === "EARLY_LEAVE") counts.earlyLeave += 1;
      if (record.status === "CANCELLED") counts.cancelled += 1;

      const weight =
        tardiesPerAbsence != null && isTardyLike
          ? { num: 1, den: 1, separate: false }
          : statusWeight(record.status, effective);
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

    if (tardiesPerAbsence != null) {
      const penaltyAll = Math.floor(tardyAll / tardiesPerAbsence);
      const penaltyToDate = Math.floor(tardyToDate / tardiesPerAbsence);
      numerator -= penaltyAll;
      fixedNumAll -= penaltyAll;
      toDateNum -= penaltyToDate;
    }
    const denominator = Math.max(0, course.occurrences.length - denominatorReduction);
    const projectedNum = fixedNumAll + floatingFuture;
    const projectedDen = fixedDenAll + floatingPast + floatingFuture;
    const toDateDenWithUnrecorded = toDateDen + floatingPast;
    const consumedAbsence = fixedDenAll - fixedNumAll;
    const allowanceRaw = (1 - requiredRate) * denominator - consumedAbsence;
    const allowedAbsences = denominator === 0 ? null : Math.floor(allowanceRaw + 1e-9);
    const allowedAbsenceDays =
      allowedAbsences == null
        ? null
        : maxDayPeriods === 0
          ? null
          : allowedAbsences < 0
            ? null
            : Math.floor(allowedAbsences / maxDayPeriods);
    let absenceLessons: number | null = null;
    let allowedAbsenceLessons: number | null = null;
    let limitedBy: "rate" | "count" | null = null;
    if (courseRule.maxAbsences != null) {
      let sum = 0;
      let tardyLessons = 0;
      for (const lesson of lessons.values()) {
        if (lesson.d > 0) sum += lesson.a / lesson.d;
        if (lesson.tardy) tardyLessons += 1;
      }
      absenceLessons = sum + (tardiesPerAbsence != null ? Math.floor(tardyLessons / tardiesPerAbsence) : 0);
      const countAllowed = Math.floor(courseRule.maxAbsences - absenceLessons + 1e-9);
      const rateLessons =
        courseRule.requiredAttendanceRate != null && allowedAbsences != null && maxDayPeriods > 0
          ? Math.floor(allowedAbsences / maxDayPeriods)
          : null;
      allowedAbsenceLessons = rateLessons == null ? countAllowed : Math.min(countAllowed, rateLessons);
      limitedBy = rateLessons != null && rateLessons < countAllowed ? "rate" : "count";
    }
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
      allowedAbsences,
      maxDayPeriods,
      allowedAbsenceDays,
      requiredAttendanceRate: usedRate,
      rule: courseRule,
      remainingLessons: futureUnrecordedDates.size,
      absenceLessons,
      allowedAbsenceLessons,
      limitedBy,
    };
  });

  return {
    courses,
    overallProjection: { num: overallProjectionNum, den: overallProjectionDen },
    overallAllowance: { allowanceSum: overallAllowanceSum, hasDenominator: overallHasDenominator },
  };
}
