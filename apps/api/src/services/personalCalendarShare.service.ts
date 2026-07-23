import type { PersonalCalendarShareDto } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { dateStringToJstDay, toIsoDate, today } from "../lib/tz";
import { applyTitleRules, listRules } from "./icsTitleRule.service";

type VisibilityMode = "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";

const DEFAULT_PROJECTION_MONTHS = 3;

export function personalCalendarShareDto(share: {
  id: string;
  roomId: string;
  userId: string;
  visibilityMode: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PersonalCalendarShareDto {
  return {
    id: share.id,
    roomId: share.roomId,
    userId: share.userId,
    visibilityMode: share.visibilityMode as VisibilityMode,
    enabled: share.enabled,
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
  };
}

export async function getShare(args: { roomId: string; userId: string }): Promise<PersonalCalendarShareDto | null> {
  await assertRoomMember(args.roomId, args.userId);
  const share = await (prisma as any).personalCalendarShare.findUnique({
    where: { roomId_userId: { roomId: args.roomId, userId: args.userId } },
  });
  return share ? personalCalendarShareDto(share) : null;
}

export async function upsertShare(args: { roomId: string; userId: string; visibilityMode: VisibilityMode }): Promise<PersonalCalendarShareDto> {
  await assertRoomMember(args.roomId, args.userId);
  const share = await (prisma as any).personalCalendarShare.upsert({
    where: { roomId_userId: { roomId: args.roomId, userId: args.userId } },
    create: {
      roomId: args.roomId,
      userId: args.userId,
      visibilityMode: args.visibilityMode,
      enabled: true,
    },
    update: {
      visibilityMode: args.visibilityMode,
      enabled: true,
    },
  });
  await projectShare(share.id);
  return personalCalendarShareDto(share);
}

export async function patchShare(args: {
  roomId: string;
  userId: string;
  patch: { visibilityMode?: VisibilityMode; enabled?: boolean };
}): Promise<PersonalCalendarShareDto> {
  await assertRoomMember(args.roomId, args.userId);
  const existing = await (prisma as any).personalCalendarShare.findUnique({
    where: { roomId_userId: { roomId: args.roomId, userId: args.userId } },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Share not found");
  const share = await (prisma as any).personalCalendarShare.update({
    where: { id: existing.id },
    data: {
      ...(args.patch.visibilityMode !== undefined ? { visibilityMode: args.patch.visibilityMode } : {}),
      ...(args.patch.enabled !== undefined ? { enabled: args.patch.enabled } : {}),
    },
  });
  await projectShare(share.id);
  return personalCalendarShareDto(share);
}

export async function disableShare(args: { roomId: string; userId: string }): Promise<void> {
  await assertRoomMember(args.roomId, args.userId);
  const share = await (prisma as any).personalCalendarShare.findUnique({
    where: { roomId_userId: { roomId: args.roomId, userId: args.userId } },
  });
  if (!share) return;
  await (prisma as any).personalCalendarShare.update({ where: { id: share.id }, data: { enabled: false } });
  await projectShare(share.id);
}

export async function projectShare(shareId: string): Promise<{ upserted: number; deleted: number }> {
  const share = await (prisma as any).personalCalendarShare.findUnique({ where: { id: shareId } });
  if (!share) throw new AppError(404, "NOT_FOUND", "Share not found");

  if (!share.enabled) {
    const result = await prisma.roomEvent.deleteMany({
      where: { roomId: share.roomId, authorId: share.userId, source: "PERSONAL" as any },
    });
    return { upserted: 0, deleted: result.count };
  }

  const start = today().startOfDay;
  const end = addMonths(start, DEFAULT_PROJECTION_MONTHS);
  const personalEvents = await prisma.personalEvent.findMany({
    where: { userId: share.userId, date: { gte: start, lte: end } },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });
  const rules = share.visibilityMode === "TITLE_MAPPED"
    ? (await listRules(share.userId)).filter((rule) => !rule.isDefault)
    : [];

  let upserted = 0;
  const aliveUids = new Set<string>();
  for (const pe of personalEvents) {
    const externalUid = `pe:${pe.id}`;
    aliveUids.add(externalUid);
    const mappedTitle = mapTitle(pe.title, share.visibilityMode as VisibilityMode, rules);
    const timing = personalEventTiming(toIsoDate(pe.date), pe.isAllDay, pe.startMinute, pe.endMinute);
    await prisma.roomEvent.upsert({
      where: { roomId_externalUid: { roomId: share.roomId, externalUid } },
      create: {
        roomId: share.roomId,
        authorId: share.userId,
        title: mappedTitle,
        rawTitle: pe.title,
        description: pe.note,
        start: timing.start,
        end: timing.end,
        isAllDay: pe.isAllDay,
        color: pe.color,
        source: "PERSONAL" as any,
        externalUid,
        visibilityMode: share.visibilityMode as any,
      } as any,
      update: {
        title: mappedTitle,
        rawTitle: pe.title,
        start: timing.start,
        end: timing.end,
        isAllDay: pe.isAllDay,
        color: pe.color,
        visibilityMode: share.visibilityMode as any,
      } as any,
    });
    upserted++;
  }

  const existingProjected = await prisma.roomEvent.findMany({
    where: { roomId: share.roomId, authorId: share.userId, source: "PERSONAL" as any, externalUid: { startsWith: "pe:" } },
    select: { id: true, externalUid: true },
  });
  const staleIds = existingProjected.filter((event) => event.externalUid && !aliveUids.has(event.externalUid)).map((event) => event.id);
  const deleted = staleIds.length > 0
    ? (await prisma.roomEvent.deleteMany({ where: { id: { in: staleIds } } })).count
    : 0;

  await (prisma as any).personalCalendarShare.update({ where: { id: share.id }, data: { lastProjectedAt: new Date() } });
  return { upserted, deleted };
}

export async function projectEnabledSharesForUser(userId: string): Promise<void> {
  const shares = await (prisma as any).personalCalendarShare.findMany({ where: { userId, enabled: true }, select: { id: true } });
  for (const share of shares) {
    await projectShare(share.id);
  }
}

function mapTitle(rawTitle: string, visibilityMode: VisibilityMode, rules: Awaited<ReturnType<typeof listRules>>) {
  if (visibilityMode === "NORMAL") return rawTitle;
  if (visibilityMode === "BUSY_ONLY") return "予定";
  return applyTitleRules(rawTitle, rules).title;
}

function personalEventTiming(date: string, isAllDay: boolean, startMinute: number | null, endMinute: number | null) {
  const startOfDay = dateStringToJstDay(date).startOfDay;
  if (isAllDay) {
    return { start: startOfDay, end: dateStringToJstDay(date).endOfDay };
  }
  return {
    start: new Date(startOfDay.getTime() + (startMinute ?? 0) * 60_000),
    end: new Date(startOfDay.getTime() + (endMinute ?? startMinute ?? 0) * 60_000),
  };
}

async function assertRoomMember(roomId: string, userId: string) {
  const membership = await prisma.roomMembership.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!membership) throw new AppError(403, "NOT_MEMBER", "Room member only");
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}
