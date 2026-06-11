import { z } from "zod";

export const MeResponseDto = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    handle: z.string().nullable(),
    inviteCode: z.string().nullable(),
    defaultSemesterId: z.string().nullable(),
    schoolId: z.string().nullable(),
    departmentId: z.string().nullable(),
    requiredAttendanceRate: z.number().int(),
  }),
  setupStatus: z.object({
    hasSchool: z.boolean(),
    hasDepartment: z.boolean(),
    hasSemester: z.boolean(),
    hasUserTimetable: z.boolean(),
    isComplete: z.boolean(),
  }),
});

export type MeResponseDto = z.infer<typeof MeResponseDto>;

export const MeUpdateInput = z.object({
  schoolId: z.string().optional(),
  departmentId: z.string().optional(),
  defaultSemesterId: z.string().nullable().optional(),
  name: z.string().min(1).max(50).optional(),
  handle: z.string().min(1).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  requiredAttendanceRate: z.number().int().min(1).max(100).optional(),
}).refine(
  v => v.departmentId == null || v.schoolId != null,
  { message: "departmentId requires schoolId in the same request or already set on User" }
);

export type MeUpdateInput = z.infer<typeof MeUpdateInput>;
