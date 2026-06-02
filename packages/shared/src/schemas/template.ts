import { z } from "zod";

export const DaySlotDto = z.object({
  periodIndex: z.number().int().min(1).max(20),
  label: z.string().max(20),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  isBreak: z.boolean().default(false),
});

export const CourseDto = z.object({
  id: z.string(),
  name: z.string().max(100),
  teacher: z.string().max(50).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  totalSessions: z.number().int().min(1).max(60),
  note: z.string().max(500).nullable(),
});

export const MeetingDto = z.object({
  id: z.string(),
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startPeriodIndex: z.number().int().min(1).max(20),
  periodCount: z.number().int().min(1).max(8).default(1),
  room: z.string().max(30).nullable(),
});

export const TemplateDto = z.object({
  id: z.string(),
  authorUserId: z.string(),
  schoolId: z.string(),
  departmentId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  year: z.number().int().nullable(),
  term: z.string().nullable(),
  isPublic: z.boolean(),
  copyCount: z.number().int(),
  daySlots: z.array(DaySlotDto),
  courses: z.array(CourseDto),
  meetings: z.array(MeetingDto),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TemplateSearchQuery = z.object({
  schoolId: z.string().optional(),
  departmentId: z.string().optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const TemplateCreateInput = z.object({
  schoolId: z.string(),
  departmentId: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  year: z.number().int().min(1).max(8).optional(),
  term: z.string().max(20).optional(),
  isPublic: z.boolean().default(true),
  daySlots: z.array(DaySlotDto).min(1).max(20),
  courses: z.array(z.object({
    tempId: z.string(),
    name: z.string().min(1).max(100),
    teacher: z.string().max(50).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    totalSessions: z.number().int().min(1).max(60),
    note: z.string().max(500).optional(),
  })).max(50),
  meetings: z.array(z.object({
    courseTempId: z.string(),
    dayOfWeek: z.number().int().min(0).max(6),
    startPeriodIndex: z.number().int().min(1).max(20),
    periodCount: z.number().int().min(1).max(8).default(1),
    room: z.string().max(30).optional(),
  })).max(200),
});

export const TemplateCopyInput = z.object({
  semesterId: z.string(),
  title: z.string().min(1).max(100).optional(),
});

export type DaySlotDto = z.infer<typeof DaySlotDto>;
export type CourseDto = z.infer<typeof CourseDto>;
export type MeetingDto = z.infer<typeof MeetingDto>;
export type TemplateDto = z.infer<typeof TemplateDto>;
export type TemplateSearchQuery = z.infer<typeof TemplateSearchQuery>;
export type TemplateCreateInput = z.infer<typeof TemplateCreateInput>;
export type TemplateCopyInput = z.infer<typeof TemplateCopyInput>;
