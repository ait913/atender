import { z } from "zod";
import { CourseStatsDto } from "./stats.js";

export const SemesterDto = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

export const SemesterCreateInput = z.object({
  name: z.string().min(1).max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((v) => v.startDate <= v.endDate, { message: "startDate must be <= endDate" });

export const SemesterUpdateInput = z.object({
  name: z.string().min(1).max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).partial().refine((v) => {
  if (v.startDate == null || v.endDate == null) return true;
  return v.startDate <= v.endDate;
}, { message: "startDate must be <= endDate" });

export const AttendanceDayCounts = z.object({
  present: z.number().int(),
  absent: z.number().int(),
  excused: z.number().int(),
  tardy: z.number().int(),
  earlyLeave: z.number().int(),
  suspended: z.number().int(),
  unrecorded: z.number().int(),
});

export const AttendanceDaySummary = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum([              // legacy 互換。値も並びも変更しない (.designs/20260729-semester-calendar-multi-status.md §3.1)
    "ALL_PRESENT",
    "HAS_ABSENT",
    "HAS_TARDY",
    "ALL_SUSPENDED",
    "PARTIAL_UNRECORDED",
    "NO_CLASS",
  ]),
  occurrenceCount: z.number().int(),
  counts: AttendanceDayCounts,
});

export const SemesterOverviewDto = z.object({
  semesterId: z.string(),
  semesterName: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requiredAttendanceRate: z.number().int(),
  overall: z.object({
    effectiveNumerator: z.number(),
    effectiveDenominator: z.number(),
    attendanceRate: z.number().nullable(),
    toDate: z.object({
      effectiveNumerator: z.number(),
      effectiveDenominator: z.number(),
      attendanceRate: z.number().nullable(),
    }),
    unrecordedCount: z.number().int(),
    remainingCount: z.number().int(),
    allowedAbsences: z.number().int().nullable(),
  }),
  days: z.array(AttendanceDaySummary),
  courses: z.array(CourseStatsDto),
});

export type SemesterDto = z.infer<typeof SemesterDto>;
export type SemesterCreateInput = z.infer<typeof SemesterCreateInput>;
export type SemesterUpdateInput = z.infer<typeof SemesterUpdateInput>;
export type AttendanceDayCounts = z.infer<typeof AttendanceDayCounts>;
export type AttendanceDaySummary = z.infer<typeof AttendanceDaySummary>;
export type SemesterOverviewDto = z.infer<typeof SemesterOverviewDto>;
