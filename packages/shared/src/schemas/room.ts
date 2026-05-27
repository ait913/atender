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
  upcomingEvent: z.object({
    id: z.string(),
    title: z.string(),
    start: z.string(),
  }).nullable(),
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

export const RoomEventDto = z.object({
  id: z.string(),
  roomId: z.string(),
  authorId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  isAllDay: z.boolean(),
  color: z.string().nullable(),
  createdAt: z.string(),
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

const RoomEventInputBase = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  isAllDay: z.boolean().default(false),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const CreateRoomEventInput = RoomEventInputBase.refine(
  (value) => new Date(value.end) > new Date(value.start),
  { message: "end must be after start" },
);

export const UpdateRoomEventInput = RoomEventInputBase.partial().refine(
  (value) => value.start == null || value.end == null || new Date(value.end) > new Date(value.start),
  { message: "end must be after start" },
);

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
  roomEvents: z.array(RoomEventDto),
});

export type RoomSummaryDto = z.infer<typeof RoomSummaryDto>;
export type RoomDto = z.infer<typeof RoomDto>;
export type RoomMemberDto = z.infer<typeof RoomMemberDto>;
export type RoomEventDto = z.infer<typeof RoomEventDto>;
export type CreateRoomInput = z.infer<typeof CreateRoomInput>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomInput>;
export type CreateRoomEventInput = z.infer<typeof CreateRoomEventInput>;
export type UpdateRoomEventInput = z.infer<typeof UpdateRoomEventInput>;
export type RoomWeekDto = z.infer<typeof RoomWeekDto>;
