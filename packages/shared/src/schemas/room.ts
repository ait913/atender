import { z } from "zod";
import { ROOM_ROLE } from "../enums.js";

export const RoomRoleEnum = z.enum(ROOM_ROLE);

export const RoomSummaryDto = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  showMemberTimetables: z.boolean(),
  memberCount: z.number().int(),
  myRole: RoomRoleEnum,
  createdAt: z.string(),
});

export const RoomDto = RoomSummaryDto.extend({
  inviteCode: z.string(),
  inviteExpiresAt: z.string().nullable(),
});

export const RoomMemberDto = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  handle: z.string().nullable(),
  image: z.string().nullable(),
  role: RoomRoleEnum,
  joinedAt: z.string(),
});

export const CreateRoomInput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  showMemberTimetables: z.boolean().optional().default(true),
});

export const UpdateRoomInput = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(500).nullable().optional(),
  showMemberTimetables: z.boolean().optional(),
});

export const RoomWeekDto = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  members: z.array(z.object({
    userId: z.string(),
    name: z.string().nullable(),
    handle: z.string().nullable(),
    image: z.string().nullable(),
    color: z.string(),
  })),
  meetings: z.array(z.object({
    userId: z.string(),
    occurrenceId: z.string(),
    courseId: z.string(),
    courseName: z.string(),
    courseColor: z.string().nullable(),
    date: z.string(),
    startMinute: z.number(),
    endMinute: z.number(),
  })),
  recurringMeetings: z.array(z.object({
    userId: z.string(),
    timetableId: z.string(),
    courseId: z.string(),
    courseName: z.string(),
    courseColor: z.string().nullable(),
    dayOfWeek: z.number(),
    startPeriodIndex: z.number(),
    periodCount: z.number(),
  })),
});

export type RoomSummaryDto = z.infer<typeof RoomSummaryDto>;
export type RoomDto = z.infer<typeof RoomDto>;
export type RoomMemberDto = z.infer<typeof RoomMemberDto>;
export type CreateRoomInput = z.input<typeof CreateRoomInput>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomInput>;
export type RoomWeekDto = z.infer<typeof RoomWeekDto>;
