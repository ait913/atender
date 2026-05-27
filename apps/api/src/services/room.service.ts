import dayjs from "dayjs";
import { randomUUID } from "node:crypto";
import type { CreateRoomEventInput, CreateRoomInput, UpdateRoomEventInput, UpdateRoomInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { cuidToHsl } from "../lib/cuidToHsl";
import { toIsoDate } from "../lib/tz";

const roomInclude = {
  memberships: true,
  events: { where: { start: { gte: new Date() } }, orderBy: { start: "asc" as const }, take: 1 },
} as const;

function eventDto(event: {
  id: string;
  roomId: string;
  authorId: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  isAllDay: boolean;
  color: string | null;
  createdAt: Date;
}) {
  return {
    id: event.id,
    roomId: event.roomId,
    authorId: event.authorId,
    title: event.title,
    description: event.description,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    isAllDay: event.isAllDay,
    color: event.color,
    createdAt: event.createdAt.toISOString(),
  };
}

function roomDto(room: {
  id: string;
  name: string;
  description: string | null;
  showMemberTimetables: boolean;
  inviteCode: string;
  inviteExpiresAt: Date | null;
  createdAt: Date;
  memberships: Array<{ userId: string; role: "OWNER" | "MEMBER" }>;
  events?: Array<{ id: string; title: string; start: Date }>;
}, userId: string) {
  const myRole = room.memberships.find((membership) => membership.userId === userId)?.role ?? "MEMBER";
  const upcoming = room.events?.[0] ?? null;
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    showMemberTimetables: room.showMemberTimetables,
    memberCount: room.memberships.length,
    myRole,
    upcomingEvent: upcoming ? { id: upcoming.id, title: upcoming.title, start: upcoming.start.toISOString() } : null,
    createdAt: room.createdAt.toISOString(),
    inviteCode: room.inviteCode,
    inviteExpiresAt: room.inviteExpiresAt?.toISOString() ?? null,
  };
}

async function assertMember(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, showMemberTimetables: true } });
  if (!room) throw new AppError(404, "NOT_FOUND", "Room not found");
  const membership = await prisma.roomMembership.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!membership) throw new AppError(403, "NOT_MEMBER", "Room member only");
  return { membership, room };
}

async function assertOwner(roomId: string, userId: string) {
  const { membership } = await assertMember(roomId, userId);
  if (membership.role !== "OWNER") throw new AppError(403, "NOT_OWNER", "Room owner only");
  return membership;
}

export async function listRooms(userId: string) {
  const rooms = await prisma.room.findMany({
    where: { memberships: { some: { userId } } },
    include: roomInclude,
    orderBy: { updatedAt: "desc" },
  });
  return rooms.map((room) => roomDto(room, userId));
}

export async function createRoom(userId: string, input: CreateRoomInput, now = new Date()) {
  const room = await prisma.$transaction(async (tx) => {
    const created = await tx.room.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        showMemberTimetables: input.showMemberTimetables ?? true,
        createdByUserId: userId,
        inviteExpiresAt: dayjs(now).add(7, "day").toDate(),
      },
    });
    await tx.roomMembership.create({ data: { roomId: created.id, userId, role: "OWNER" } });
    return tx.room.findUniqueOrThrow({ where: { id: created.id }, include: roomInclude });
  });
  return roomDto(room, userId);
}

export async function getRoom(userId: string, roomId: string) {
  await assertMember(roomId, userId);
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: roomInclude });
  if (!room) throw new AppError(404, "NOT_FOUND", "Room not found");
  return roomDto(room, userId);
}

export async function updateRoom(userId: string, roomId: string, input: UpdateRoomInput) {
  await assertOwner(roomId, userId);
  const room = await prisma.room.update({
    where: { id: roomId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.showMemberTimetables !== undefined ? { showMemberTimetables: input.showMemberTimetables } : {}),
    },
    include: roomInclude,
  });
  return roomDto(room, userId);
}

export async function deleteRoom(userId: string, roomId: string) {
  await assertOwner(roomId, userId);
  await prisma.room.delete({ where: { id: roomId } });
}

export async function leaveRoom(userId: string, roomId: string) {
  const { membership } = await assertMember(roomId, userId);
  if (membership.role === "OWNER") throw new AppError(409, "OWNER_CANNOT_LEAVE", "Owner cannot leave the room");
  await prisma.roomMembership.delete({ where: { roomId_userId: { roomId, userId } } });
}

export async function listRoomMembers(userId: string, roomId: string) {
  await assertMember(roomId, userId);
  const members = await prisma.roomMembership.findMany({
    where: { roomId },
    include: { user: { select: { id: true, name: true, handle: true, image: true } } },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
  return members.map((member) => ({
    userId: member.userId,
    name: member.user.name,
    handle: member.user.handle,
    image: member.user.image,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  }));
}

export async function removeRoomMember(ownerId: string, roomId: string, userId: string) {
  await assertOwner(roomId, ownerId);
  const membership = await prisma.roomMembership.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!membership) throw new AppError(404, "NOT_FOUND", "Member not found");
  if (membership.role === "OWNER") throw new AppError(409, "CANNOT_REMOVE_OWNER", "Cannot remove owner");
  await prisma.roomMembership.delete({ where: { roomId_userId: { roomId, userId } } });
}

export async function regenerateInvite(userId: string, roomId: string, now = new Date()) {
  await assertOwner(roomId, userId);
  const room = await prisma.room.update({
    where: { id: roomId },
    data: { inviteCode: randomUUID().replaceAll("-", ""), inviteExpiresAt: dayjs(now).add(7, "day").toDate() },
  });
  return { inviteCode: room.inviteCode, inviteExpiresAt: room.inviteExpiresAt?.toISOString() ?? null };
}

export async function joinRoomByInviteCode(userId: string, inviteCode: string, now = new Date()) {
  const room = await prisma.room.findUnique({ where: { inviteCode }, include: roomInclude });
  if (!room) throw new AppError(404, "INVITE_NOT_FOUND", "Invite not found");
  if (room.inviteExpiresAt && room.inviteExpiresAt < now) throw new AppError(410, "INVITE_EXPIRED", "Invite expired");
  const existing = await prisma.roomMembership.findUnique({ where: { roomId_userId: { roomId: room.id, userId } } });
  if (existing) throw new AppError(409, "ALREADY_MEMBER", "Already joined", { roomId: room.id });
  await prisma.roomMembership.create({ data: { roomId: room.id, userId, role: "MEMBER" } });
  const updated = await prisma.room.findUniqueOrThrow({ where: { id: room.id }, include: roomInclude });
  return roomDto(updated, userId);
}

export async function listRoomEvents(userId: string, roomId: string, range: { from?: string; to?: string }) {
  await assertMember(roomId, userId);
  const events = await prisma.roomEvent.findMany({
    where: {
      roomId,
      ...(range.from || range.to ? { start: { ...(range.from ? { gte: new Date(range.from) } : {}), ...(range.to ? { lte: new Date(range.to) } : {}) } } : {}),
    },
    orderBy: { start: "asc" },
  });
  return events.map(eventDto);
}

export async function createRoomEvent(userId: string, roomId: string, input: CreateRoomEventInput) {
  await assertMember(roomId, userId);
  const event = await prisma.roomEvent.create({
    data: {
      roomId,
      authorId: userId,
      title: input.title,
      description: input.description ?? null,
      start: new Date(input.start),
      end: new Date(input.end),
      isAllDay: input.isAllDay,
      color: input.color ?? null,
    },
  });
  return eventDto(event);
}

export async function updateRoomEvent(userId: string, roomId: string, eventId: string, input: UpdateRoomEventInput) {
  const exists = await prisma.roomEvent.findUnique({ where: { id: eventId } });
  if (!exists || exists.roomId !== roomId) throw new AppError(404, "NOT_FOUND", "Room event not found");
  await assertMember(roomId, userId);
  const event = await prisma.roomEvent.update({
    where: { id: eventId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.start !== undefined ? { start: new Date(input.start) } : {}),
      ...(input.end !== undefined ? { end: new Date(input.end) } : {}),
      ...(input.isAllDay !== undefined ? { isAllDay: input.isAllDay } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
  return eventDto(event);
}

export async function deleteRoomEvent(userId: string, roomId: string, eventId: string) {
  const event = await prisma.roomEvent.findUnique({ where: { id: eventId } });
  if (!event || event.roomId !== roomId) throw new AppError(404, "NOT_FOUND", "Room event not found");
  await assertMember(roomId, userId);
  await prisma.roomEvent.delete({ where: { id: eventId } });
}

export async function getRoomWeek(userId: string, roomId: string, weekStart: Date) {
  const { room } = await assertMember(roomId, userId);
  const weekEnd = dayjs(weekStart).add(7, "day").subtract(1, "millisecond").toDate();
  const members = await prisma.roomMembership.findMany({
    where: { roomId },
    include: { user: { select: { id: true, name: true, handle: true, image: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const memberIds = members.map((member) => member.userId);
  const occurrences = await prisma.meetingOccurrence.findMany({
    where: {
      date: { gte: weekStart, lte: weekEnd },
      meeting: { userTimetable: { userId: room.showMemberTimetables ? { in: memberIds } : userId } },
    },
    include: { meeting: { include: { userTimetable: true } }, course: true },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });
  const roomEvents = await prisma.roomEvent.findMany({
    where: {
      roomId,
      OR: [
        { start: { gte: weekStart, lte: weekEnd } },
        { end: { gte: weekStart, lte: weekEnd } },
        { AND: [{ start: { lte: weekStart } }, { end: { gte: weekEnd } }] },
      ],
    },
    orderBy: { start: "asc" },
  });
  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    members: members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      handle: member.user.handle,
      image: member.user.image,
      color: cuidToHsl(member.userId),
    })),
    meetings: occurrences.map((occurrence) => ({
      userId: occurrence.meeting.userTimetable.userId,
      occurrenceId: occurrence.id,
      courseId: occurrence.courseId,
      courseName: occurrence.course.name,
      courseColor: occurrence.course.color,
      date: toIsoDate(occurrence.date),
      startMinute: occurrence.startMinute,
      endMinute: occurrence.endMinute,
    })),
    roomEvents: roomEvents.map(eventDto),
  };
}
