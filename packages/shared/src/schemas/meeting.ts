import { z } from "zod";

export const MeetingBulkCreateInput = z.object({
  userTimetableId: z.string(),
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startPeriodIndexes: z.array(z.number().int().min(1).max(12)).min(1).max(12),
});

export type MeetingBulkCreateInput = z.infer<typeof MeetingBulkCreateInput>;
