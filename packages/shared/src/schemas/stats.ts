import { z } from "zod";
import { ATTENDANCE_STATUS } from "../enums";

export const CourseStatsDto = z.object({
  courseId: z.string(),
  courseName: z.string(),
  totalSessions: z.number().int(),
  generatedOccurrences: z.number().int(),
  counts: z.object({
    present: z.number().int(),
    absent: z.number().int(),
    excused: z.number().int(),
    tardy: z.number().int(),
    earlyLeave: z.number().int(),
    cancelled: z.number().int(),
    unrecorded: z.number().int(),
  }),
  effectiveNumerator: z.number(),
  effectiveDenominator: z.number(),
  attendanceRate: z.number().nullable(),
  separateCounts: z.record(z.enum(ATTENDANCE_STATUS), z.number().int()).optional(),
});

export const StatsResponse = z.object({
  semesterId: z.string(),
  courses: z.array(CourseStatsDto),
});

export type CourseStatsDto = z.infer<typeof CourseStatsDto>;
export type StatsResponse = z.infer<typeof StatsResponse>;
