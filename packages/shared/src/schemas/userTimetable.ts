import { z } from "zod";
import { DaySlotDto, MeetingDto, CourseDto, TemplateCreateInput } from "./template.js";

const DaysOfWeek = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .refine((a) => new Set(a).size === a.length, { message: "曜日が重複しています" });

export const UserTimetableDto = z.object({
  id: z.string(),
  userId: z.string(),
  semesterId: z.string(),
  title: z.string(),
  sourceTemplateId: z.string().nullable(),
  daysOfWeek: z.array(z.number().int().min(1).max(7)),
  daySlots: z.array(DaySlotDto),
  courses: z.array(CourseDto),
  meetings: z.array(MeetingDto),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const UserTimetableCreateInput = TemplateCreateInput.omit({
  schoolId: true,
  departmentId: true,
  isPublic: true,
}).extend({
  semesterId: z.string(),
});

export const UserTimetablePatchInput = z.object({
  title: z.string().min(1).max(120).optional(),
  daysOfWeek: DaysOfWeek.optional(),
  daySlots: z.array(DaySlotDto).optional(),
  courses: z.array(z.object({
    id: z.string().optional(),
    tempId: z.string().optional(),
    name: z.string().min(1).max(100),
    teacher: z.string().max(50).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    note: z.string().max(500).optional(),
  })).optional(),
  meetings: z.array(z.object({
    id: z.string().optional(),
    courseId: z.string().optional(),
    courseTempId: z.string().optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    startPeriodIndex: z.number().int().min(1).max(20),
    periodCount: z.number().int().min(1).max(8).default(1),
    room: z.string().max(30).optional(),
  })).optional(),
});

export type UserTimetableDto = z.infer<typeof UserTimetableDto>;
export type UserTimetableCreateInput = z.infer<typeof UserTimetableCreateInput>;
export type UserTimetablePatchInput = z.infer<typeof UserTimetablePatchInput>;
