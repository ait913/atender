import type { EventKitSyncInput, PersonalEventCreateInput, PersonalEventDto, PersonalEventUpdateInput } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { dateStringToJstDay, toIsoDate } from "../lib/tz";
import { projectEnabledSharesForUser } from "./personalCalendarShare.service";

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
  source?: string;
  ekExternalId?: string | null;
  ekCalendarId?: string | null;
  ekLastModified?: Date | null;
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
    source: (event.source ?? "MANUAL") as "MANUAL" | "EVENTKIT",
    ekExternalId: event.ekExternalId ?? null,
    ekCalendarId: event.ekCalendarId ?? null,
    ekLastModified: event.ekLastModified?.toISOString() ?? null,
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
      source: args.input.source ?? "MANUAL",
      ekExternalId: args.input.ekExternalId ?? null,
      ekCalendarId: args.input.ekCalendarId ?? null,
      ekLastModified: args.input.ekLastModified ? new Date(args.input.ekLastModified) : null,
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
      ...(args.input.source !== undefined ? { source: args.input.source } : {}),
      ...(args.input.ekExternalId !== undefined ? { ekExternalId: args.input.ekExternalId } : {}),
      ...(args.input.ekCalendarId !== undefined ? { ekCalendarId: args.input.ekCalendarId } : {}),
      ...(args.input.ekLastModified !== undefined ? { ekLastModified: new Date(args.input.ekLastModified) } : {}),
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

export type EventKitSyncResult = {
  mirrors: PersonalEventDto[];
  manualNeedingPush: PersonalEventDto[];
};

export async function reconcileEventKit(args: { userId: string; input: EventKitSyncInput }): Promise<EventKitSyncResult> {
  const from = dateStringToJstDay(args.input.range.from).startOfDay;
  const to = dateStringToJstDay(args.input.range.to).endOfDay;
  const incomingByKey = new Map(args.input.events.map((event) => [eventKitKey(event.ekExternalId, event.date), event]));

  const result = await prisma.$transaction(async (tx) => {
    const existingMirrors = await tx.personalEvent.findMany({
      where: { userId: args.userId, source: "EVENTKIT" as any, date: { gte: from, lte: to } },
    });
    const existingByKey = new Map(existingMirrors
      .filter((event) => event.ekExternalId != null)
      .map((event) => [eventKitKey(event.ekExternalId!, toIsoDate(event.date)), event]));

    for (const incoming of incomingByKey.values()) {
      const existing = existingByKey.get(eventKitKey(incoming.ekExternalId, incoming.date));
      const incomingLastModified = incoming.ekLastModified ? new Date(incoming.ekLastModified) : null;
      if (!existing) {
        await tx.personalEvent.create({
          data: {
            userId: args.userId,
            date: dateStringToJstDay(incoming.date).startOfDay,
            title: incoming.title.trim(),
            isAllDay: incoming.isAllDay,
            startMinute: incoming.isAllDay ? null : incoming.startMinute,
            endMinute: incoming.isAllDay ? null : incoming.endMinute,
            source: "EVENTKIT" as any,
            ekExternalId: incoming.ekExternalId,
            ekCalendarId: incoming.ekCalendarId,
            ekLastModified: incomingLastModified,
          } as any,
        });
      } else if (isNewer(incomingLastModified, existing.ekLastModified)) {
        await tx.personalEvent.update({
          where: { id: existing.id },
          data: {
            date: dateStringToJstDay(incoming.date).startOfDay,
            title: incoming.title.trim(),
            isAllDay: incoming.isAllDay,
            startMinute: incoming.isAllDay ? null : incoming.startMinute,
            endMinute: incoming.isAllDay ? null : incoming.endMinute,
            ekCalendarId: incoming.ekCalendarId,
            ekLastModified: incomingLastModified,
          } as any,
        });
      }
    }

    const staleIds = existingMirrors
      .filter((event) => event.ekExternalId != null && !incomingByKey.has(eventKitKey(event.ekExternalId!, toIsoDate(event.date))))
      .map((event) => event.id);
    if (staleIds.length > 0) {
      await tx.personalEvent.deleteMany({ where: { id: { in: staleIds } } });
    }

    const mirrors = await tx.personalEvent.findMany({
      where: { userId: args.userId, source: "EVENTKIT" as any, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    });
    const manualNeedingPush = await tx.personalEvent.findMany({
      where: { userId: args.userId, source: "MANUAL" as any, ekExternalId: null, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    });
    return {
      mirrors: mirrors.map(personalEventDto),
      manualNeedingPush: manualNeedingPush.map(personalEventDto),
    };
  });

  await projectEnabledSharesForUser(args.userId);
  return result;
}

function eventKitKey(ekExternalId: string, date: string) {
  return `${ekExternalId}\u0000${date}`;
}

function isNewer(incoming: Date | null, existing: Date | null) {
  if (!incoming) return existing == null;
  if (!existing) return true;
  return incoming.getTime() > existing.getTime();
}
