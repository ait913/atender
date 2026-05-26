import { z } from "zod";

export const MeUpdateInput = z.object({
  schoolId: z.string().optional(),
  departmentId: z.string().optional(),
  defaultSemesterId: z.string().nullable().optional(),
  name: z.string().min(1).max(50).optional(),
  handle: z.string().min(1).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
}).refine(
  v => v.departmentId == null || v.schoolId != null,
  { message: "departmentId requires schoolId in the same request or already set on User" }
);

export type MeUpdateInput = z.infer<typeof MeUpdateInput>;
