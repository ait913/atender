import type { PersonalEventCreateInput, PersonalEventDto, PersonalEventUpdateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { dateStringToJstDay, toIsoDate } from "../lib/tz";

export function personalEventDto(event: {
  id: string;
  semesterId: string | null;
  date: Date;
  title: string;
  isAllDay: boolean;
  startMinute: number | null;
  endMinute: number | null;
  color: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PersonalEventDto {
  return {
    id: event.id,
    semesterId: event.semesterId,
    date: toIsoDate(event.date),
    title: event.title,
    isAllDay: event.isAllDay,
    startMinute: event.startMinute,
    endMinute: event.endMinute,
    color: event.color,
    note: event.note,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function validateTime(input: { isAllDay?: boolean; startMinute?: number | null; endMinute?: number | null }) {
  if (input.isAllDay !== false) return;
  if (input.startMinute == null || input.endMinute == null || input.startMinute > input.endMinute) {
    throw new AppError(400, "VALIDATION_ERROR", "time range required when not all-day");
  }
}

async function assertOwnSemester(userId: string, semesterId?: string | null) {
  if (!semesterId) return;
  const semester = await prisma.semester.findFirst({ where: { id: semesterId, userId }, select: { id: true } });
  if (!semester) throw new AppError(404, "NOT_FOUND", "Semester not found");
}

export async function listPersonalEvents(args: {
  userId: string;
  from?: string;
  to?: string;
  semesterId?: string;
}): Promise<PersonalEventDto[]> {
  const from = args.from ? dateStringToJstDay(args.from).startOfDay : undefined;
  const to = args.to ? dateStringToJstDay(args.to).endOfDay : undefined;
  const events = await prisma.personalEvent.findMany({
    where: {
      userId: args.userId,
      ...(args.semesterId ? { semesterId: args.semesterId } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });
  return events.map(personalEventDto);
}

export async function createPersonalEvent(args: {
  userId: string;
  input: PersonalEventCreateInput;
}): Promise<PersonalEventDto> {
  validateTime(args.input);
  await assertOwnSemester(args.userId, args.input.semesterId);
  const { startOfDay } = dateStringToJstDay(args.input.date);
  const isAllDay = args.input.isAllDay ?? true;
  const event = await prisma.personalEvent.create({
    data: {
      userId: args.userId,
      semesterId: args.input.semesterId ?? null,
      date: startOfDay,
      title: args.input.title.trim(),
      isAllDay,
      startMinute: isAllDay ? null : args.input.startMinute,
      endMinute: isAllDay ? null : args.input.endMinute,
      color: args.input.color ?? null,
      note: args.input.note?.trim() || null,
    },
  });
  return personalEventDto(event);
}

export async function updatePersonalEvent(args: {
  userId: string;
  id: string;
  input: PersonalEventUpdateInput;
}): Promise<PersonalEventDto> {
  const existing = await prisma.personalEvent.findFirst({ where: { id: args.id, userId: args.userId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Event not found");
  if (args.input.semesterId !== undefined) await assertOwnSemester(args.userId, args.input.semesterId);

  const nextIsAllDay = args.input.isAllDay ?? existing.isAllDay;
  const nextStartMinute = args.input.startMinute !== undefined ? args.input.startMinute : existing.startMinute;
  const nextEndMinute = args.input.endMinute !== undefined ? args.input.endMinute : existing.endMinute;
  validateTime({ isAllDay: nextIsAllDay, startMinute: nextStartMinute, endMinute: nextEndMinute });

  const event = await prisma.personalEvent.update({
    where: { id: args.id },
    data: {
      ...(args.input.semesterId !== undefined ? { semesterId: args.input.semesterId } : {}),
      ...(args.input.date !== undefined ? { date: dateStringToJstDay(args.input.date).startOfDay } : {}),
      ...(args.input.title !== undefined ? { title: args.input.title.trim() } : {}),
      ...(args.input.isAllDay !== undefined ? { isAllDay: args.input.isAllDay } : {}),
      startMinute: nextIsAllDay ? null : nextStartMinute,
      endMinute: nextIsAllDay ? null : nextEndMinute,
      ...(args.input.color !== undefined ? { color: args.input.color } : {}),
      ...(args.input.note !== undefined ? { note: args.input.note?.trim() || null } : {}),
    },
  });
  return personalEventDto(event);
}

export async function deletePersonalEvent(args: { userId: string; id: string }): Promise<void> {
  const existing = await prisma.personalEvent.findFirst({
    where: { id: args.id, userId: args.userId },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Event not found");
  await prisma.personalEvent.delete({ where: { id: args.id } });
}
