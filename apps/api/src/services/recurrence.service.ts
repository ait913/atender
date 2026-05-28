import type { RoomEvent, RoomEventOverride } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { expandBetween, parseCsvDates, toIcsDate } from "../lib/rruleExpand";

export type ExpandedOccurrence = {
  seriesId: string;
  roomId: string;
  occurrenceDate: Date;
  start: Date;
  end: Date;
  title: string;
  rawTitle: string | null;
  description: string | null;
  color: string | null;
  isAllDay: boolean;
  source: string;
  visibilityMode: string;
  authorId: string;
  isRecurringOccurrence: boolean;
  recurrenceRule: string | null;
  overrideId: string | null;
  googleSyncId: string | null;
  googleEventId: string | null;
  googleRecurringEventId: string | null;
  createdAt: Date;
};

export async function expandRoomEvents(roomId: string, from: Date, to: Date): Promise<ExpandedOccurrence[]> {
  const events = await prisma.roomEvent.findMany({
    where: {
      roomId,
      OR: [
        { recurrenceRule: null, start: { lte: to }, end: { gte: from } },
        { recurrenceRule: { not: null }, start: { lte: to } },
      ],
    },
    include: { overrides: true },
  });

  const result: ExpandedOccurrence[] = [];
  for (const event of events) {
    const durationMs = event.end.getTime() - event.start.getTime();
    if (!event.recurrenceRule) {
      result.push(toOccurrence(event, event.start, durationMs, null, false));
      continue;
    }
    const dates = expandBetween({
      rrule: event.recurrenceRule,
      dtstart: event.start,
      exDates: parseCsvDates(event.exDates),
      rDates: parseCsvDates(event.rDates),
    }, from, to);
    const overrides = new Map(event.overrides.map((override) => [override.originalDate.toISOString(), override]));
    for (const date of dates) {
      const override = overrides.get(date.toISOString()) ?? null;
      if (override?.isCancelled) continue;
      result.push(toOccurrence(event, date, durationMs, override, true));
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function toOccurrence(
  event: RoomEvent,
  occurrenceDate: Date,
  durationMs: number,
  override: RoomEventOverride | null,
  recurring: boolean,
): ExpandedOccurrence {
  const start = override?.newStart ?? occurrenceDate;
  const end = override?.newEnd ?? new Date(start.getTime() + durationMs);
  return {
    seriesId: event.id,
    roomId: event.roomId,
    occurrenceDate,
    start,
    end,
    title: override?.newTitle ?? event.title,
    rawTitle: event.rawTitle,
    description: override?.newDescription ?? event.description,
    color: override?.newColor ?? event.color,
    isAllDay: event.isAllDay,
    source: event.source,
    visibilityMode: event.visibilityMode,
    authorId: event.authorId,
    isRecurringOccurrence: recurring,
    recurrenceRule: event.recurrenceRule,
    overrideId: override?.id ?? null,
    googleSyncId: event.googleSyncId,
    googleEventId: event.googleEventId,
    googleRecurringEventId: event.googleRecurringEventId,
    createdAt: event.createdAt,
  };
}

export async function applyEditScope(args: {
  seriesId: string;
  originalDate: Date;
  scope: "single" | "future" | "all";
  patch: {
    title?: string;
    description?: string | null;
    start?: Date;
    end?: Date;
    color?: string | null;
    isAllDay?: boolean;
    visibilityMode?: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
    recurrence?: { rrule: string; exDates?: string[]; rDates?: string[] };
    isCancelled?: boolean;
  };
}) {
  const series = await prisma.roomEvent.findUniqueOrThrow({ where: { id: args.seriesId } });

  if (args.scope === "single") {
    if (!series.recurrenceRule) throw new AppError(400, "NOT_RECURRING", "Cannot scope=single on non-recurring event");
    await prisma.roomEventOverride.upsert({
      where: { seriesId_originalDate: { seriesId: args.seriesId, originalDate: args.originalDate } },
      create: {
        seriesId: args.seriesId,
        originalDate: args.originalDate,
        isCancelled: args.patch.isCancelled ?? false,
        newStart: args.patch.start ?? null,
        newEnd: args.patch.end ?? null,
        newTitle: args.patch.title ?? null,
        newDescription: args.patch.description ?? null,
        newColor: args.patch.color ?? null,
      },
      update: {
        ...(args.patch.isCancelled !== undefined ? { isCancelled: args.patch.isCancelled } : {}),
        ...(args.patch.start !== undefined ? { newStart: args.patch.start } : {}),
        ...(args.patch.end !== undefined ? { newEnd: args.patch.end } : {}),
        ...(args.patch.title !== undefined ? { newTitle: args.patch.title } : {}),
        ...(args.patch.description !== undefined ? { newDescription: args.patch.description } : {}),
        ...(args.patch.color !== undefined ? { newColor: args.patch.color } : {}),
      },
    });
    return { affectedSeriesIds: [args.seriesId] };
  }

  if (args.scope === "future") {
    if (!series.recurrenceRule) throw new AppError(400, "NOT_RECURRING", "Cannot scope=future on non-recurring event");
    const until = new Date(args.originalDate.getTime() - 1);
    await prisma.roomEvent.update({
      where: { id: series.id },
      data: { recurrenceRule: appendOrReplaceUntil(series.recurrenceRule, until) },
    });
    if (args.patch.isCancelled) return { affectedSeriesIds: [series.id] };
    const durationMs = series.end.getTime() - series.start.getTime();
    const start = args.patch.start ?? args.originalDate;
    const end = args.patch.end ?? new Date(start.getTime() + durationMs);
    const created = await prisma.roomEvent.create({
      data: {
        roomId: series.roomId,
        authorId: series.authorId,
        title: args.patch.title ?? series.title,
        description: args.patch.description ?? series.description,
        start,
        end,
        isAllDay: args.patch.isAllDay ?? series.isAllDay,
        color: args.patch.color ?? series.color,
        rawTitle: series.rawTitle,
        recurrenceRule: stripUntil(series.recurrenceRule),
        exDates: null,
        rDates: null,
        source: series.source,
        externalUid: null,
        externalSeq: null,
        externalLastModified: null,
        importId: series.importId,
        visibilityMode: args.patch.visibilityMode ?? series.visibilityMode,
      },
    });
    return { affectedSeriesIds: [series.id, created.id], newSeriesId: created.id };
  }

  await prisma.roomEvent.update({
    where: { id: series.id },
    data: {
      ...(args.patch.title !== undefined ? { title: args.patch.title } : {}),
      ...(args.patch.description !== undefined ? { description: args.patch.description } : {}),
      ...(args.patch.start !== undefined ? { start: args.patch.start } : {}),
      ...(args.patch.end !== undefined ? { end: args.patch.end } : {}),
      ...(args.patch.color !== undefined ? { color: args.patch.color } : {}),
      ...(args.patch.isAllDay !== undefined ? { isAllDay: args.patch.isAllDay } : {}),
      ...(args.patch.visibilityMode !== undefined ? { visibilityMode: args.patch.visibilityMode } : {}),
      ...(args.patch.recurrence !== undefined ? {
        recurrenceRule: args.patch.recurrence.rrule,
        exDates: datesToCsv(args.patch.recurrence.exDates ?? []),
        rDates: datesToCsv(args.patch.recurrence.rDates ?? []),
      } : {}),
    },
  });
  return { affectedSeriesIds: [series.id] };
}

function appendOrReplaceUntil(rrule: string, until: Date): string {
  const parts = rrule.split(";").filter((part) => !part.startsWith("UNTIL=") && !part.startsWith("COUNT="));
  parts.push(`UNTIL=${toIcsDate(until)}`);
  return parts.join(";");
}

function stripUntil(rrule: string) {
  return rrule.split(";").filter((part) => !part.startsWith("UNTIL=") && !part.startsWith("COUNT=")).join(";");
}

function datesToCsv(values: string[]) {
  return values.length > 0 ? values.map((value) => toIcsDate(new Date(value))).join(",") : null;
}
