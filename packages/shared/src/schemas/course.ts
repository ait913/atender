import { z } from "zod";

export const CourseCreateInput = z.object({
  userTimetableId: z.string(),
  name: z.string().min(1).max(100),
  teacher: z.string().max(50).optional(),
  room: z.string().max(30).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  totalSessions: z.number().int().min(1).max(60).default(15),
  note: z.string().max(500).optional(),
});

export const CourseSuspensionDto = z.object({
  id: z.string(),
  courseId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CourseSuspensionCreateInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(100).optional(),
});

export type CourseCreateInput = z.infer<typeof CourseCreateInput>;
export type CourseSuspensionDto = z.infer<typeof CourseSuspensionDto>;
export type CourseSuspensionCreateInput = z.infer<typeof CourseSuspensionCreateInput>;
