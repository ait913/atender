import { z } from "zod";
import { ATTENDANCE_STATUS } from "../enums";

export const OccurrenceDto = z.object({
  id: z.string(),
  meetingId: z.string(),
  courseId: z.string(),
  courseName: z.string(),
  teacher: z.string().nullable(),
  room: z.string().nullable(),
  color: z.string().nullable(),
  date: z.string(),
  periodIndex: z.number().int(),
  periodOffset: z.number().int(),
  startMinute: z.number().int(),
  endMinute: z.number().int(),
  status: z.enum(ATTENDANCE_STATUS).nullable(),
});

export const TodayResponse = z.object({
  date: z.string(),
  occurrences: z.array(OccurrenceDto),
});

export const MarkAttendanceInput = z.object({
  status: z.enum(ATTENDANCE_STATUS),
  note: z.string().max(200).optional(),
});

export const MarkAllPresentInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const MarkAllPresentResponse = z.object({
  date: z.string(),
  markedCount: z.number().int(),
  skippedCount: z.number().int(),
});

export type OccurrenceDto = z.infer<typeof OccurrenceDto>;
export type TodayResponse = z.infer<typeof TodayResponse>;
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceInput>;
export type MarkAllPresentInput = z.infer<typeof MarkAllPresentInput>;
export type MarkAllPresentResponse = z.infer<typeof MarkAllPresentResponse>;
