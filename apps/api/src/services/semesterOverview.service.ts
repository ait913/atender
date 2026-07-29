import type { AttendanceDayCounts, AttendanceDaySummary, SemesterOverviewDto } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { toIsoDate } from "../lib/tz";
import { computeCourseStatsWithProjection } from "./attendanceStats";

type DayStatus =
  | "PRESENT"
  | "ABSENT"
  | "EXCUSED"
  | "TARDY"
  | "EARLY_LEAVE"
  | "CANCELLED"
  | "SUSPENDED"
  | "UNRECORDED";

export async function getSemesterOverview(args: {
  semesterId: string;
  userId: string;
}): Promise<SemesterOverviewDto> {
  const semester = await prisma.semester.findUnique({ where: { id: args.semesterId } });
  if (!semester || semester.userId !== args.userId) {
    throw new AppError(404, "NOT_FOUND", "Semester not found");
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: args.userId },
    select: { requiredAttendanceRate: true },
  });
  const { courses, overallAllowance } = await computeCourseStatsWithProjection({
    semesterId: args.semesterId,
    userId: args.userId,
    requiredAttendanceRate: user.requiredAttendanceRate,
  });
  const overallNum = courses.reduce((sum, course) => sum + course.effectiveNumerator, 0);
  const overallDen = courses.reduce((sum, course) => sum + course.effectiveDenominator, 0);
  const overallToDateNum = courses.reduce((sum, course) => sum + course.toDate.effectiveNumerator, 0);
  const overallToDateDen = courses.reduce((sum, course) => sum + course.toDate.effectiveDenominator, 0);
  const days = await buildDaySummaries({ semesterId: args.semesterId, userId: args.userId, startDate: semester.startDate, endDate: semester.endDate });

  return {
    semesterId: semester.id,
    semesterName: semester.name,
    startDate: toIsoDate(semester.startDate),
    endDate: toIsoDate(semester.endDate),
    today: toIsoDate(new Date()),
    requiredAttendanceRate: user.requiredAttendanceRate,
    overall: {
      effectiveNumerator: overallNum,
      effectiveDenominator: overallDen,
      attendanceRate: overallDen === 0 ? null : overallNum / overallDen,
      toDate: {
        effectiveNumerator: overallToDateNum,
        effectiveDenominator: overallToDateDen,
        attendanceRate: overallToDateDen === 0 ? null : overallToDateNum / overallToDateDen,
      },
      unrecordedCount: courses.reduce((sum, course) => sum + course.counts.unrecorded, 0),
      remainingCount: courses.reduce((sum, course) => sum + course.remainingCount, 0),
      allowedAbsences: overallAllowance.hasDenominator ? Math.floor(overallAllowance.allowanceSum + 1e-9) : null,
    },
    days,
    courses,
  };
}

async function buildDaySummaries(args: {
  semesterId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
}): Promise<AttendanceDaySummary[]> {
  const timetable = await prisma.userTimetable.findUnique({
    where: { userId_semesterId: { userId: args.userId, semesterId: args.semesterId } },
    include: {
      timetableSuspensions: true,
      courses: {
        include: {
          occurrences: { include: { attendanceRecord: true } },
          suspensions: true,
        },
      },
    },
  });

  const byDate = new Map<string, Array<{ status: DayStatus }>>();
  if (timetable) {
    const timetableSuspendedDates = new Set(timetable.timetableSuspensions.map((suspension) => toIsoDate(suspension.date)));
    for (const course of timetable.courses) {
      const suspendedDates = new Set(course.suspensions.map((suspension) => toIsoDate(suspension.date)));
      for (const occurrence of course.occurrences) {
        const dateIso = toIsoDate(occurrence.date);
        const list = byDate.get(dateIso) ?? [];
        if (timetableSuspendedDates.has(dateIso)) {
          list.push({ status: "SUSPENDED" });
        } else if (suspendedDates.has(dateIso)) {
          list.push({ status: "SUSPENDED" });
        } else if (!occurrence.attendanceRecord) {
          list.push({ status: "UNRECORDED" });
        } else {
          list.push({ status: occurrence.attendanceRecord.status });
        }
        byDate.set(dateIso, list);
      }
    }
  }

  const days: AttendanceDaySummary[] = [];
  const start = new Date(`${toIsoDate(args.startDate)}T00:00:00Z`);
  const end = new Date(`${toIsoDate(args.endDate)}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    const iso = toIsoDate(d);
    const items = byDate.get(iso) ?? [];
    days.push({
      date: iso,
      status: classifyDay(items),   // legacy 互換 (.designs/20260729-semester-calendar-multi-status.md §3.1)
      occurrenceCount: items.length,
      counts: countDay(items),
    });
  }
  return days;
}

function countDay(items: Array<{ status: DayStatus }>): AttendanceDayCounts {
  const counts: AttendanceDayCounts = {
    present: 0, absent: 0, excused: 0, tardy: 0,
    earlyLeave: 0, suspended: 0, unrecorded: 0,
  };
  for (const item of items) {
    switch (item.status) {
      case "PRESENT": counts.present += 1; break;
      case "ABSENT": counts.absent += 1; break;
      case "EXCUSED": counts.excused += 1; break;
      case "TARDY": counts.tardy += 1; break;
      case "EARLY_LEAVE": counts.earlyLeave += 1; break;
      case "CANCELLED":
      case "SUSPENDED": counts.suspended += 1; break;
      case "UNRECORDED": counts.unrecorded += 1; break;
    }
  }
  return counts;
}

// legacy 互換フィールド。表示は counts を使う (.designs/20260729-semester-calendar-multi-status.md §3.1)
function classifyDay(items: Array<{ status: DayStatus }>): AttendanceDaySummary["status"] {
  if (items.length === 0) return "NO_CLASS";
  if (items.every((item) => item.status === "SUSPENDED" || item.status === "CANCELLED")) return "ALL_SUSPENDED";
  if (items.some((item) => item.status === "ABSENT")) return "HAS_ABSENT";
  if (items.some((item) => item.status === "TARDY" || item.status === "EARLY_LEAVE")) return "HAS_TARDY";
  if (items.some((item) => item.status === "UNRECORDED")) return "PARTIAL_UNRECORDED";
  return "ALL_PRESENT";
}
