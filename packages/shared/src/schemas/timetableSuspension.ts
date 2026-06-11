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

export const BulkTimetableSuspensionInput = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(62),
  reason: z.string().max(100).optional(),
});

export const BulkTimetableSuspensionResponse = z.object({
  createdCount: z.number().int(),
  skippedCount: z.number().int(),
});

export const BulkTimetableSuspensionRemoveInput = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(62),
});

export const BulkTimetableSuspensionRemoveResponse = z.object({
  removedCount: z.number().int(),
});

export type TimetableSuspensionDto = z.infer<typeof TimetableSuspensionDto>;
export type TimetableSuspensionCreateInput = z.infer<typeof TimetableSuspensionCreateInput>;
export type BulkTimetableSuspensionInput = z.infer<typeof BulkTimetableSuspensionInput>;
export type BulkTimetableSuspensionResponse = z.infer<typeof BulkTimetableSuspensionResponse>;
export type BulkTimetableSuspensionRemoveInput = z.infer<typeof BulkTimetableSuspensionRemoveInput>;
export type BulkTimetableSuspensionRemoveResponse = z.infer<typeof BulkTimetableSuspensionRemoveResponse>;
