import { z } from "zod";

export const MeetingCreateInput = z.object({
  userTimetableId: z.string(),
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startPeriodIndex: z.number().int().min(1).max(20),
  periodCount: z.number().int().min(1).max(8).default(1),
});

export const MeetingUpdateInput = z.object({
  courseId: z.string().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startPeriodIndex: z.number().int().min(1).max(20).optional(),
  periodCount: z.number().int().min(1).max(8).optional(),
});

export const MeetingDto = z.object({
  id: z.string(),
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startPeriodIndex: z.number().int().min(1).max(20),
  periodCount: z.number().int().min(1).max(8).default(1),
});

export type MeetingCreateInput = z.infer<typeof MeetingCreateInput>;
export type MeetingUpdateInput = z.infer<typeof MeetingUpdateInput>;
export type MeetingDto = z.infer<typeof MeetingDto>;
