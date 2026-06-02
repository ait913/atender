import { z } from "zod";

export const MeetingBulkCreateInput = z.object({
  userTimetableId: z.string(),
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startPeriodIndexes: z.array(z.number().int().min(1).max(12)).min(1).max(12),
  room: z.string().max(30).optional(),
});

export const MeetingUpdateInput = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startPeriodIndex: z.number().int().min(1).max(20).optional(),
  periodCount: z.number().int().min(1).max(8).optional(),
  room: z.string().max(30).nullable().optional(),
});

export type MeetingBulkCreateInput = z.infer<typeof MeetingBulkCreateInput>;
export type MeetingUpdateInput = z.infer<typeof MeetingUpdateInput>;
