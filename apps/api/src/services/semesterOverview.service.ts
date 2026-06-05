import type { AttendanceDaySummary, SemesterOverviewDto } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { toIsoDate } from "../lib/tz";
import { computeCourseStats } from "./attendanceStats";

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

  const courses = await computeCourseStats({ semesterId: args.semesterId, userId: args.userId });
  const overallNum = courses.reduce((sum, course) => sum + course.effectiveNumerator, 0);
  const overallDen = courses.reduce((sum, course) => sum + course.effectiveDenominator, 0);
  const days = await buildDaySummaries({ semesterId: args.semesterId, userId: args.userId, startDate: semester.startDate, endDate: semester.endDate });

  return {
    semesterId: semester.id,
    semesterName: semester.name,
    startDate: toIsoDate(semester.startDate),
    endDate: toIsoDate(semester.endDate),
    overall: {
      effectiveNumerator: overallNum,
      effectiveDenominator: overallDen,
      attendanceRate: overallDen === 0 ? null : overallNum / overallDen,
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
      status: classifyDay(items),
      occurrenceCount: items.length,
    });
  }
  return days;
}

function classifyDay(items: Array<{ status: DayStatus }>): AttendanceDaySummary["status"] {
  if (items.length === 0) return "NO_CLASS";
  if (items.every((item) => item.status === "SUSPENDED" || item.status === "CANCELLED")) return "ALL_SUSPENDED";
  if (items.some((item) => item.status === "ABSENT")) return "HAS_ABSENT";
  if (items.some((item) => item.status === "TARDY" || item.status === "EARLY_LEAVE")) return "HAS_TARDY";
  if (items.some((item) => item.status === "UNRECORDED")) return "PARTIAL_UNRECORDED";
  return "ALL_PRESENT";
}
