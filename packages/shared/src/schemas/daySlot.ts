import { z } from "zod";

export const DaySlotDto = z.object({
  id: z.string(),
  periodIndex: z.number().int().min(1).max(20),
  label: z.string().max(20),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  isBreak: z.boolean().default(false),
});

export const DaySlotUpdateInput = z.object({
  label: z.string().max(20).optional(),
  startMinute: z.number().int().min(0).max(1440).optional(),
  endMinute: z.number().int().min(0).max(1440).optional(),
  isBreak: z.boolean().optional(),
}).refine(v => v.startMinute == null || v.endMinute == null || v.startMinute < v.endMinute, {
  message: "startMinute must be < endMinute",
});

export const DaySlotBulkReplaceInput = z.object({
  daySlots: z.array(DaySlotDto).min(1).max(12),  // periodIndex 1..N の連番、N = daySlots.length
}).refine(v => {
  // periodIndex は 1..N の連番
  const idxs = v.daySlots.map(s => s.periodIndex).sort((a, b) => a - b);
  return idxs.every((idx, i) => idx === i + 1);
}, { message: "periodIndex must be 1..N continuous" });

export type DaySlotDto = z.infer<typeof DaySlotDto>;
export type DaySlotUpdateInput = z.infer<typeof DaySlotUpdateInput>;
export type DaySlotBulkReplaceInput = z.infer<typeof DaySlotBulkReplaceInput>;
