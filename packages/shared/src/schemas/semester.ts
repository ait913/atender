import { z } from "zod";

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

export type SemesterDto = z.infer<typeof SemesterDto>;
export type SemesterCreateInput = z.infer<typeof SemesterCreateInput>;
export type SemesterUpdateInput = z.infer<typeof SemesterUpdateInput>;
