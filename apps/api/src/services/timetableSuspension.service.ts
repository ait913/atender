import { Prisma } from "@prisma/client";
import type { TimetableSuspensionCreateInput, TimetableSuspensionDto } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { dateStringToJstDay, toIsoDate } from "../lib/tz";
import { findActiveUserTimetable } from "./activeTimetable";

export function timetableSuspensionDto(suspension: {
  id: string;
  userTimetableId: string;
  date: Date;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TimetableSuspensionDto {
  return {
    id: suspension.id,
    userTimetableId: suspension.userTimetableId,
    date: toIsoDate(suspension.date),
    reason: suspension.reason,
    createdAt: suspension.createdAt.toISOString(),
    updatedAt: suspension.updatedAt.toISOString(),
  };
}

export async function listTimetableSuspensions(args: {
  userId: string;
  from?: string;
  to?: string;
}): Promise<TimetableSuspensionDto[]> {
  const timetable = await findActiveUserTimetable(args.userId);
  if (!timetable) return [];
  const from = args.from ? dateStringToJstDay(args.from).startOfDay : undefined;
  const to = args.to ? dateStringToJstDay(args.to).endOfDay : undefined;
  const suspensions = await prisma.timetableSuspension.findMany({
    where: {
      userTimetableId: timetable.id,
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: { date: "asc" },
  });
  return suspensions.map(timetableSuspensionDto);
}

export async function createTimetableSuspension(args: {
  userId: string;
  input: TimetableSuspensionCreateInput;
}): Promise<TimetableSuspensionDto> {
  const timetable = await findActiveUserTimetable(args.userId);
  if (!timetable) throw new AppError(403, "SETUP_REQUIRED", "User must complete setup");
  const { startOfDay } = dateStringToJstDay(args.input.date);
  try {
    const suspension = await prisma.timetableSuspension.create({
      data: {
        userTimetableId: timetable.id,
        date: startOfDay,
        reason: args.input.reason?.trim() || null,
      },
    });
    return timetableSuspensionDto(suspension);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "DUPLICATE", "Suspension already exists for this date");
    }
    throw error;
  }
}

export async function deleteTimetableSuspension(args: { userId: string; id: string }): Promise<void> {
  const existing = await prisma.timetableSuspension.findFirst({
    where: { id: args.id, userTimetable: { userId: args.userId } },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Suspension not found");
  await prisma.timetableSuspension.delete({ where: { id: args.id } });
}
