import { z } from "zod";
import { ATTENDANCE_STATUS } from "../enums.js";
import { CourseSuspensionDto } from "./course.js";
import { TimetableSuspensionDto } from "./timetableSuspension.js";

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
  status: z.enum(ATTENDANCE_STATUS).exclude(["CANCELLED"]).optional(),
});

export const MarkAllPresentResponse = z.object({
  date: z.string(),
  markedCount: z.number().int(),
  skippedCount: z.number().int(),
});

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const BulkMarkAttendanceInput = z.object({
  dates: z.array(IsoDate).min(1).max(62),
  status: z.enum(["PRESENT", "ABSENT", "EXCUSED", "TARDY", "EARLY_LEAVE"]),
  mode: z.enum(["FILL", "OVERWRITE"]).default("FILL"),
});

export const BulkMarkAttendanceResponse = z.object({
  upsertedCount: z.number().int(),
  skippedExistingCount: z.number().int(),
  skippedSuspendedCount: z.number().int(),
  noOccurrenceDates: z.array(IsoDate),
});

export const BulkClearAttendanceInput = z.object({
  dates: z.array(IsoDate).min(1).max(62),
});

export const BulkClearAttendanceResponse = z.object({
  deletedCount: z.number().int(),
});

/** 書き出し用の授業 occurrence 範囲取得 (.designs/20260729-eventkit-dedicated-calendar-export.md §4.4) */
export const OccurrenceRangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const OccurrenceRangeDto = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasActiveTimetable: z.boolean(),
  occurrences: z.array(OccurrenceDto),
  courseSuspensions: z.array(CourseSuspensionDto),
  timetableSuspensions: z.array(TimetableSuspensionDto),
});

export type OccurrenceDto = z.infer<typeof OccurrenceDto>;
export type TodayResponse = z.infer<typeof TodayResponse>;
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceInput>;
export type MarkAllPresentInput = z.infer<typeof MarkAllPresentInput>;
export type MarkAllPresentResponse = z.infer<typeof MarkAllPresentResponse>;
export type BulkMarkAttendanceInput = z.infer<typeof BulkMarkAttendanceInput>;
export type BulkMarkAttendanceResponse = z.infer<typeof BulkMarkAttendanceResponse>;
export type BulkClearAttendanceInput = z.infer<typeof BulkClearAttendanceInput>;
export type BulkClearAttendanceResponse = z.infer<typeof BulkClearAttendanceResponse>;
export type OccurrenceRangeQuery = z.infer<typeof OccurrenceRangeQuery>;
export type OccurrenceRangeDto = z.infer<typeof OccurrenceRangeDto>;
