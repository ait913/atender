import { z } from "zod";
import { DaySlotDto, MeetingDto, CourseDto, TemplateCreateInput } from "./template";

export const UserTimetableDto = z.object({
  id: z.string(),
  userId: z.string(),
  semesterId: z.string(),
  title: z.string(),
  sourceTemplateId: z.string().nullable(),
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
  title: z.string().min(1).max(100).optional(),
  daySlots: z.array(DaySlotDto).optional(),
  courses: z.array(z.object({
    id: z.string().optional(),
    tempId: z.string().optional(),
    name: z.string().min(1).max(100),
    teacher: z.string().max(50).optional(),
    room: z.string().max(30).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    totalSessions: z.number().int().min(1).max(60),
    note: z.string().max(500).optional(),
  })).optional(),
  meetings: z.array(z.object({
    id: z.string().optional(),
    courseId: z.string().optional(),
    courseTempId: z.string().optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    startPeriodIndex: z.number().int().min(1).max(20),
    periodCount: z.number().int().min(1).max(8).default(1),
  })).optional(),
});

export type UserTimetableDto = z.infer<typeof UserTimetableDto>;
export type UserTimetableCreateInput = z.infer<typeof UserTimetableCreateInput>;
export type UserTimetablePatchInput = z.infer<typeof UserTimetablePatchInput>;
