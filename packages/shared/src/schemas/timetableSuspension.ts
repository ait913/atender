import { z } from "zod";

export const TimetableSuspensionDto = z.object({
  id: z.string(),
  userTimetableId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TimetableSuspensionCreateInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(100).optional(),
});

export type TimetableSuspensionDto = z.infer<typeof TimetableSuspensionDto>;
export type TimetableSuspensionCreateInput = z.infer<typeof TimetableSuspensionCreateInput>;
