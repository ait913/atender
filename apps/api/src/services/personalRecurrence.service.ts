import type { PersonalEvent, PersonalEventOverride } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { appendOrReplaceUntil, datesToCsv, expandBetweenJst, parseCsvDates, stripUntil } from "../lib/rruleExpand";

export type PersonalOccurrence = {
  seriesId: string;
  occurrenceDate: Date;
  start: Date;
  end: Date;
  isAllDay: boolean;
  title: string;
  location: string | null;
  note: string | null;
  color: string | null;
  isRecurringOccurrence: boolean;
  recurrenceRule: string | null;
  overrideId: string | null;
  source: string;
  ekExternalId: string | null;
  ekCalendarId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PersonalEventWithOverrides = PersonalEvent & { overrides: PersonalEventOverride[] };

function toOccurrence(
  event: PersonalEvent,
  occurrenceDate: Date,
  durationMs: number,
  override: PersonalEventOverride | null,
  recurring: boolean,
): PersonalOccurrence {
  const start = override?.newStart ?? occurrenceDate;
  const end = override?.newEnd ?? new Date(start.getTime() + durationMs);
  return {
    seriesId: event.id,
    occurrenceDate,
    start,
    end,
    isAllDay: override?.newIsAllDay ?? event.isAllDay,
    title: override?.newTitle ?? event.title,
    location: override?.newLocation ?? event.location,
    note: override?.newNote ?? event.note,
    color: override?.newColor ?? event.color,
    isRecurringOccurrence: recurring,
    recurrenceRule: event.recurrenceRule,
    overrideId: override?.id ?? null,
    source: event.source,
    ekExternalId: event.ekExternalId,
    ekCalendarId: event.ekCalendarId,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function expandPersonalSeries(events: PersonalEventWithOverrides[], from: Date, to: Date): PersonalOccurrence[] {
  const result: PersonalOccurrence[] = [];
  for (const event of events) {
    const durationMs = event.end.getTime() - event.start.getTime();
    if (!event.recurrenceRule) {
      result.push(toOccurrence(event, event.start, durationMs, null, false));
      continue;
    }
    const dates = expandBetweenJst({
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
  return result.sort((a, b) => {
    if (a.start.getTime() !== b.start.getTime()) return a.start.getTime() - b.start.getTime();
    return a.seriesId < b.seriesId ? -1 : a.seriesId > b.seriesId ? 1 : 0;
  });
}

export async function expandPersonalEvents(userId: string, from: Date, to: Date): Promise<PersonalOccurrence[]> {
  const events = await prisma.personalEvent.findMany({
    where: {
      userId,
      OR: [
        { recurrenceRule: null, start: { lte: to }, end: { gte: from } },
        { recurrenceRule: { not: null }, start: { lte: to } },
      ],
    },
    include: { overrides: true },
  });
  return expandPersonalSeries(events, from, to);
}

export type PersonalPatch = {
  title?: string;
  location?: string | null;
  note?: string | null;
  color?: string | null;
  start?: Date;
  end?: Date;
  isAllDay?: boolean;
  recurrence?: { rrule: string; exDates?: string[]; rDates?: string[] } | null;
};

export async function applyPersonalEditScope(args: {
  seriesId: string;
  originalDate: Date;
  scope: "single" | "future" | "all";
  patch: PersonalPatch;
}): Promise<{ affectedSeriesIds: string[]; newSeriesId?: string }> {
  const series = await prisma.personalEvent.findUniqueOrThrow({ where: { id: args.seriesId } });

  if (args.scope === "single") {
    if (!series.recurrenceRule) throw new AppError(400, "NOT_RECURRING", "Cannot scope=single on non-recurring event");
    if (args.patch.recurrence !== undefined) {
      throw new AppError(400, "SCOPE_NOT_ALLOWED", "Cannot change recurrence with scope=single");
    }
    await prisma.personalEventOverride.upsert({
      where: { seriesId_originalDate: { seriesId: args.seriesId, originalDate: args.originalDate } },
      create: {
        seriesId: args.seriesId,
        originalDate: args.originalDate,
        isCancelled: false,
        newStart: args.patch.start ?? null,
        newEnd: args.patch.end ?? null,
        newTitle: args.patch.title ?? null,
        newLocation: args.patch.location ?? null,
        newNote: args.patch.note ?? null,
        newColor: args.patch.color ?? null,
        newIsAllDay: args.patch.isAllDay ?? null,
      },
      update: {
        ...(args.patch.start !== undefined ? { newStart: args.patch.start } : {}),
        ...(args.patch.end !== undefined ? { newEnd: args.patch.end } : {}),
        ...(args.patch.title !== undefined ? { newTitle: args.patch.title } : {}),
        ...(args.patch.location !== undefined ? { newLocation: args.patch.location } : {}),
        ...(args.patch.note !== undefined ? { newNote: args.patch.note } : {}),
        ...(args.patch.color !== undefined ? { newColor: args.patch.color } : {}),
        ...(args.patch.isAllDay !== undefined ? { newIsAllDay: args.patch.isAllDay } : {}),
      },
    });
    return { affectedSeriesIds: [args.seriesId] };
  }

  if (args.scope === "future") {
    if (!series.recurrenceRule) throw new AppError(400, "NOT_RECURRING", "Cannot scope=future on non-recurring event");
    if (args.patch.recurrence === null) {
      throw new AppError(400, "SCOPE_NOT_ALLOWED", "Cannot clear recurrence with scope=future");
    }
    const until = new Date(args.originalDate.getTime() - 1);
    await prisma.personalEvent.update({
      where: { id: series.id },
      data: { recurrenceRule: appendOrReplaceUntil(series.recurrenceRule, until) },
    });
    await prisma.personalEventOverride.deleteMany({
      where: { seriesId: series.id, originalDate: { gte: args.originalDate } },
    });
    const durationMs = series.end.getTime() - series.start.getTime();
    const start = args.patch.start ?? args.originalDate;
    const end = args.patch.end ?? new Date(start.getTime() + durationMs);
    const created = await prisma.personalEvent.create({
      data: {
        userId: series.userId,
        title: args.patch.title ?? series.title,
        start,
        end,
        isAllDay: args.patch.isAllDay ?? series.isAllDay,
        location: args.patch.location !== undefined ? args.patch.location : series.location,
        note: args.patch.note !== undefined ? args.patch.note : series.note,
        color: args.patch.color !== undefined ? args.patch.color : series.color,
        recurrenceRule: args.patch.recurrence ? args.patch.recurrence.rrule : stripUntil(series.recurrenceRule),
        exDates: args.patch.recurrence ? datesToCsv(args.patch.recurrence.exDates ?? []) : null,
        rDates: args.patch.recurrence ? datesToCsv(args.patch.recurrence.rDates ?? []) : null,
        source: series.source,
        ekExternalId: null,
        ekCalendarId: null,
        ekOccurrenceStart: null,
        ekLastModified: null,
      },
    });
    return { affectedSeriesIds: [series.id, created.id], newSeriesId: created.id };
  }

  // scope === "all": patch.start は「編集中の occurrence の新しい開始」。差分を系列に適用する
  const durationMs = series.end.getTime() - series.start.getTime();
  const effectiveStart = args.patch.start ?? args.originalDate;
  const deltaMs = effectiveStart.getTime() - args.originalDate.getTime();
  const nextStart = args.patch.start !== undefined ? new Date(series.start.getTime() + deltaMs) : series.start;
  const nextDurationMs = args.patch.end !== undefined
    ? args.patch.end.getTime() - effectiveStart.getTime()
    : durationMs;
  const nextEnd = new Date(nextStart.getTime() + nextDurationMs);
  const movedOrResized = args.patch.start !== undefined || args.patch.end !== undefined;

  await prisma.personalEvent.update({
    where: { id: series.id },
    data: {
      ...(args.patch.title !== undefined ? { title: args.patch.title } : {}),
      ...(args.patch.location !== undefined ? { location: args.patch.location } : {}),
      ...(args.patch.note !== undefined ? { note: args.patch.note } : {}),
      ...(args.patch.color !== undefined ? { color: args.patch.color } : {}),
      ...(args.patch.isAllDay !== undefined ? { isAllDay: args.patch.isAllDay } : {}),
      ...(movedOrResized ? { start: nextStart, end: nextEnd } : {}),
      ...(args.patch.recurrence === null
        ? { recurrenceRule: null, exDates: null, rDates: null }
        : args.patch.recurrence !== undefined
          ? {
            recurrenceRule: args.patch.recurrence.rrule,
            exDates: datesToCsv(args.patch.recurrence.exDates ?? []),
            rDates: datesToCsv(args.patch.recurrence.rDates ?? []),
          }
          : {}),
    },
  });
  if (args.patch.recurrence === null) {
    await prisma.personalEventOverride.deleteMany({ where: { seriesId: series.id } });
  }
  return { affectedSeriesIds: [series.id] };
}

export async function deletePersonalOccurrence(args: {
  seriesId: string;
  originalDate: Date;
  scope: "single" | "future" | "all";
}): Promise<void> {
  const series = await prisma.personalEvent.findUniqueOrThrow({ where: { id: args.seriesId } });

  if (args.scope === "single") {
    if (!series.recurrenceRule) throw new AppError(400, "NOT_RECURRING", "Cannot scope=single on non-recurring event");
    await prisma.personalEventOverride.upsert({
      where: { seriesId_originalDate: { seriesId: args.seriesId, originalDate: args.originalDate } },
      create: { seriesId: args.seriesId, originalDate: args.originalDate, isCancelled: true },
      update: { isCancelled: true },
    });
    return;
  }

  if (args.scope === "future") {
    if (!series.recurrenceRule) throw new AppError(400, "NOT_RECURRING", "Cannot scope=future on non-recurring event");
    const until = new Date(args.originalDate.getTime() - 1);
    await prisma.personalEvent.update({
      where: { id: series.id },
      data: { recurrenceRule: appendOrReplaceUntil(series.recurrenceRule, until) },
    });
    await prisma.personalEventOverride.deleteMany({
      where: { seriesId: series.id, originalDate: { gte: args.originalDate } },
    });
    return;
  }

  await prisma.personalEvent.delete({ where: { id: series.id } });
}
