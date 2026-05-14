import { z } from "zod";

export const CourseCreateInput = z.object({
  userTimetableId: z.string(),
  name: z.string().min(1).max(100),
  teacher: z.string().max(50).optional(),
  room: z.string().max(30).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  totalSessions: z.number().int().min(1).max(60),
  note: z.string().max(500).optional(),
});

export const CourseUpdateInput = CourseCreateInput.omit({ userTimetableId: true }).partial();

export const CourseDto = z.object({
  id: z.string(),
  name: z.string().max(100),
  teacher: z.string().max(50).nullable(),
  room: z.string().max(30).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  totalSessions: z.number().int().min(1).max(60),
  note: z.string().max(500).nullable(),
});

export type CourseCreateInput = z.infer<typeof CourseCreateInput>;
export type CourseUpdateInput = z.infer<typeof CourseUpdateInput>;
export type CourseDto = z.infer<typeof CourseDto>;
