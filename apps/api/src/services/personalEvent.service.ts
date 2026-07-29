import type { PersonalEvent } from "@prisma/client";
import type {
  EventKitSyncInput,
  OccurrenceDayDto,
  PersonalEventCreateInput,
  PersonalEventDeleteQuery,
  PersonalEventOccurrenceDto,
  PersonalEventSeriesDto,
  PersonalEventUpdateInput,
} from "@atender/shared";
import { buildRRule, parseRRule } from "@atender/shared";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { parseCsvDates, toIcsDate, validateRRule } from "../lib/rruleExpand";
import { dateStringToJstDay, toIsoDate } from "../lib/tz";
import {
  applyPersonalEditScope,
  deletePersonalOccurrence,
  expandPersonalEvents,
  type PersonalOccurrence,
  type PersonalPatch,
} from "./personalRecurrence.service";
import { projectEnabledSharesForUser } from "./personalCalendarShare.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 366 * DAY_MS;

export function personalEventSeriesDto(event: PersonalEvent): PersonalEventSeriesDto {
  return {
    id: event.id,
    title: event.title,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    isAllDay: event.isAllDay,
    location: event.location,
    note: event.note,
    color: event.color,
    recurrenceRule: event.recurrenceRule,
    recurrenceSpec: event.recurrenceRule ? parseRRule(event.recurrenceRule, event.start) : null,
    exDates: parseCsvDates(event.exDates).map((date) => date.toISOString()),
    rDates: parseCsvDates(event.rDates).map((date) => date.toISOString()),
    source: (event.source ?? "MANUAL") as "MANUAL" | "EVENTKIT",
    ekExternalId: event.ekExternalId,
    ekCalendarId: event.ekCalendarId,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function clampMinute(value: number): number {
  if (value < 0) return 0;
  if (value > 1440) return 1440;
  return Math.round(value);
}

/** occurrence が覆う JST 日を [from,to] でクリップして返す。この関数だけが日付分割を持つ */
export function occurrenceDays(start: Date, end: Date, isAllDay: boolean, from: string, to: string): OccurrenceDayDto[] {
  const lastRef = end.getTime() <= start.getTime() ? start : new Date(end.getTime() - 1);
  const firstDayStart = dateStringToJstDay(toIsoDate(start)).startOfDay.getTime();
  const lastDayStart = dateStringToJstDay(toIsoDate(lastRef)).startOfDay.getTime();

  const days: OccurrenceDayDto[] = [];
  for (let dayStart = firstDayStart; dayStart <= lastDayStart; dayStart += DAY_MS) {
    const dayEnd = dayStart + DAY_MS;
    const date = toIsoDate(new Date(dayStart));
    if (isAllDay) {
      days.push({ date, startMinute: 0, endMinute: 1440 });
      continue;
    }
    const startMinute = clampMinute((Math.max(start.getTime(), dayStart) - dayStart) / 60000);
    const endMinute = clampMinute((Math.min(end.getTime(), dayEnd) - dayStart) / 60000);
    days.push({ date, startMinute, endMinute });
  }
  return days.filter((day) => day.date >= from ? day.date <= to : false);
}

export function personalEventOccurrenceDto(o: PersonalOccurrence, from: string, to: string): PersonalEventOccurrenceDto {
  return {
    seriesId: o.seriesId,
    occurrenceDate: o.occurrenceDate.toISOString(),
    start: o.start.toISOString(),
    end: o.end.toISOString(),
    days: occurrenceDays(o.start, o.end, o.isAllDay, from, to),
    isAllDay: o.isAllDay,
    title: o.title,
    location: o.location,
    note: o.note,
    color: o.color,
    isRecurringOccurrence: o.isRecurringOccurrence,
    recurrenceRule: o.recurrenceRule,
    recurrenceSpec: o.recurrenceRule ? parseRRule(o.recurrenceRule, o.occurrenceDate) : null,
    overrideId: o.overrideId,
    source: (o.source ?? "MANUAL") as "MANUAL" | "EVENTKIT",
    ekExternalId: o.ekExternalId,
    ekCalendarId: o.ekCalendarId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/** 終日の正規化: start を JST 当日 00:00 に切り下げ、end を start より真に後の最初の JST 00:00 に切り上げる */
function normalizeAllDay(start: Date, end: Date): { start: Date; end: Date } {
  const startOfDay = dateStringToJstDay(toIsoDate(start)).startOfDay;
  const endDayStart = dateStringToJstDay(toIsoDate(end)).startOfDay;
  let normalizedEnd = endDayStart.getTime() === end.getTime() ? endDayStart : new Date(endDayStart.getTime() + DAY_MS);
  if (normalizedEnd.getTime() <= startOfDay.getTime()) normalizedEnd = new Date(startOfDay.getTime() + DAY_MS);
  return { start: startOfDay, end: normalizedEnd };
}

function normalizeTiming(startIso: string, endIso: string, isAllDay: boolean): { start: Date; end: Date } {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isAllDay) return normalizeAllDay(start, end);
  if (end.getTime() <= start.getTime()) throw new AppError(400, "INVALID_RANGE", "end must be after start");
  return { start, end };
}

function resolveRecurrence(
  recurrence: { spec?: unknown; rrule?: string; exDates: string[]; rDates: string[] } | undefined,
  dtstart: Date,
): { rrule: string; exDates: string[]; rDates: string[] } | undefined {
  if (!recurrence) return undefined;
  const rrule = recurrence.rrule ?? buildRRule(recurrence.spec as never, dtstart);
  validateRRule(rrule, dtstart);
  return { rrule, exDates: recurrence.exDates ?? [], rDates: recurrence.rDates ?? [] };
}

function csv(values: string[]): string | null {
  return values.length > 0 ? values.map((value) => toIcsDate(new Date(value))).join(",") : null;
}

export async function listPersonalEvents(args: {
  userId: string;
  from: string;
  to: string;
}): Promise<PersonalEventOccurrenceDto[]> {
  const from = dateStringToJstDay(args.from).startOfDay;
  const to = dateStringToJstDay(args.to).endOfDay;
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new AppError(400, "RANGE_TOO_LARGE", "from-to range must be 366 days or less");
  }
  const occurrences = await expandPersonalEvents(args.userId, from, to);
  return occurrences
    .map((occurrence) => personalEventOccurrenceDto(occurrence, args.from, args.to))
    .filter((dto) => dto.days.length > 0);
}

export async function createPersonalEvent(args: {
  userId: string;
  input: PersonalEventCreateInput;
}): Promise<PersonalEventSeriesDto> {
  const timing = normalizeTiming(args.input.start, args.input.end, args.input.isAllDay);
  const recurrence = resolveRecurrence(args.input.recurrence, timing.start);
  const event = await prisma.personalEvent.create({
    data: {
      userId: args.userId,
      title: args.input.title.trim(),
      start: timing.start,
      end: timing.end,
      isAllDay: args.input.isAllDay,
      location: args.input.location?.trim() || null,
      note: args.input.note?.trim() || null,
      color: args.input.color ?? null,
      recurrenceRule: recurrence?.rrule ?? null,
      exDates: recurrence ? csv(recurrence.exDates) : null,
      rDates: recurrence ? csv(recurrence.rDates) : null,
      source: (args.input.source ?? "MANUAL") as never,
      ekExternalId: args.input.ekExternalId ?? null,
      ekCalendarId: args.input.ekCalendarId ?? null,
      ekLastModified: args.input.ekLastModified ? new Date(args.input.ekLastModified) : null,
    },
  });
  await projectEnabledSharesForUser(args.userId);
  return personalEventSeriesDto(event);
}

export async function updatePersonalEvent(args: {
  userId: string;
  id: string;
  input: PersonalEventUpdateInput;
}): Promise<PersonalEventSeriesDto> {
  const series = await prisma.personalEvent.findFirst({ where: { id: args.id, userId: args.userId } });
  if (!series) throw new AppError(404, "NOT_FOUND", "Event not found");

  const isRecurring = series.recurrenceRule != null;
  const scope = args.input.editScope;
  if (isRecurring) {
    if (args.input.originalDate === undefined) {
      throw new AppError(400, "ORIGINAL_DATE_REQUIRED", "originalDate is required for a recurring series");
    }
  }
  const originalDate = args.input.originalDate ? new Date(args.input.originalDate) : series.start;

  const clearRecurrence = args.input.clearRecurrence === true;
  if (clearRecurrence) {
    if (scope !== "all") throw new AppError(400, "SCOPE_NOT_ALLOWED", "clearRecurrence requires editScope=all");
    if (args.input.recurrence !== undefined) {
      throw new AppError(400, "VALIDATION_ERROR", "clearRecurrence cannot be combined with recurrence");
    }
  }
  if (args.input.recurrence !== undefined) {
    if (scope !== "all") {
      throw new AppError(400, "SCOPE_NOT_ALLOWED", "recurrence can only be changed with editScope=all");
    }
  }

  const durationMs = series.end.getTime() - series.start.getTime();
  const nextIsAllDay = args.input.isAllDay ?? series.isAllDay;
  let start: Date | undefined = args.input.start ? new Date(args.input.start) : undefined;
  let end: Date | undefined = args.input.end ? new Date(args.input.end) : undefined;
  if (start !== undefined || end !== undefined) {
    const baseStart = start ?? originalDate;
    const baseEnd = end ?? new Date(baseStart.getTime() + durationMs);
    const timing = normalizeTiming(baseStart.toISOString(), baseEnd.toISOString(), nextIsAllDay);
    start = timing.start;
    end = timing.end;
  }

  // RRULE の DTSTART は scope で決まる: all は移動後の系列 start / future は新系列の start
  const dtstart = scope === "future"
    ? (start ?? originalDate)
    : start !== undefined
      ? new Date(series.start.getTime() + (start.getTime() - originalDate.getTime()))
      : series.start;
  const recurrence = clearRecurrence ? null : resolveRecurrence(args.input.recurrence, dtstart);

  const patch: PersonalPatch = {
    ...(args.input.title !== undefined ? { title: args.input.title.trim() } : {}),
    ...(args.input.location !== undefined ? { location: args.input.location?.trim() || null } : {}),
    ...(args.input.note !== undefined ? { note: args.input.note?.trim() || null } : {}),
    ...(args.input.color !== undefined ? { color: args.input.color ?? null } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    ...(args.input.isAllDay !== undefined ? { isAllDay: args.input.isAllDay } : {}),
    ...(clearRecurrence ? { recurrence: null } : recurrence ? { recurrence } : {}),
  };

  const result = await applyPersonalEditScope({ seriesId: series.id, originalDate, scope, patch });
  const targetId = result.newSeriesId ?? series.id;
  const updated = await prisma.personalEvent.findUniqueOrThrow({ where: { id: targetId } });
  await projectEnabledSharesForUser(args.userId);
  return personalEventSeriesDto(updated);
}

export async function deletePersonalEvent(args: {
  userId: string;
  id: string;
  query: PersonalEventDeleteQuery;
}): Promise<void> {
  const series = await prisma.personalEvent.findFirst({ where: { id: args.id, userId: args.userId } });
  if (!series) throw new AppError(404, "NOT_FOUND", "Event not found");
  if (series.recurrenceRule != null) {
    if (args.query.originalDate === undefined) {
      throw new AppError(400, "ORIGINAL_DATE_REQUIRED", "originalDate is required for a recurring series");
    }
  }
  const originalDate = args.query.originalDate ? new Date(args.query.originalDate) : series.start;
  await deletePersonalOccurrence({ seriesId: series.id, originalDate, scope: args.query.scope });
  await projectEnabledSharesForUser(args.userId);
}

export type EventKitSyncResult = { mirrors: PersonalEventSeriesDto[] };

function eventKitKey(ekExternalId: string, occurrenceStart: Date) {
  return `${ekExternalId}|${occurrenceStart.toISOString()}`;
}

function isNewer(incoming: Date | null, existing: Date | null) {
  if (!incoming) return existing == null;
  if (!existing) return true;
  return incoming.getTime() > existing.getTime();
}

export async function reconcileEventKit(args: { userId: string; input: EventKitSyncInput }): Promise<EventKitSyncResult> {
  const from = dateStringToJstDay(args.input.range.from).startOfDay;
  const to = dateStringToJstDay(args.input.range.to).endOfDay;
  const incomingByKey = new Map(args.input.events.map((event) => [
    eventKitKey(event.ekExternalId, new Date(event.ekOccurrenceStart)),
    event,
  ]));
  const incomingExternalIds = Array.from(new Set(args.input.events.map((event) => event.ekExternalId)));

  const result = await prisma.$transaction(async (tx) => {
    const candidates = await tx.personalEvent.findMany({
      where: {
        userId: args.userId,
        source: "EVENTKIT" as never,
        OR: [
          { start: { gte: from, lte: to } },
          ...(incomingExternalIds.length > 0 ? [{ ekExternalId: { in: incomingExternalIds } }] : []),
        ],
      },
    });
    const existingByKey = new Map(candidates
      .filter((event) => event.ekExternalId != null ? event.ekOccurrenceStart != null : false)
      .map((event) => [eventKitKey(event.ekExternalId!, event.ekOccurrenceStart!), event]));

    for (const incoming of incomingByKey.values()) {
      const occurrenceStart = new Date(incoming.ekOccurrenceStart);
      const key = eventKitKey(incoming.ekExternalId, occurrenceStart);
      const existing = existingByKey.get(key);
      const timing = normalizeTiming(incoming.start, incoming.end, incoming.isAllDay);
      const incomingLastModified = incoming.ekLastModified ? new Date(incoming.ekLastModified) : null;
      if (!existing) {
        await tx.personalEvent.create({
          data: {
            userId: args.userId,
            title: incoming.title.trim(),
            start: timing.start,
            end: timing.end,
            isAllDay: incoming.isAllDay,
            location: incoming.location?.trim() || null,
            recurrenceRule: null,
            source: "EVENTKIT" as never,
            ekExternalId: incoming.ekExternalId,
            ekCalendarId: incoming.ekCalendarId,
            ekOccurrenceStart: occurrenceStart,
            ekLastModified: incomingLastModified,
          },
        });
      } else if (isNewer(incomingLastModified, existing.ekLastModified)) {
        await tx.personalEvent.update({
          where: { id: existing.id },
          data: {
            title: incoming.title.trim(),
            start: timing.start,
            end: timing.end,
            isAllDay: incoming.isAllDay,
            location: incoming.location?.trim() || null,
            ekCalendarId: incoming.ekCalendarId,
            ekLastModified: incomingLastModified,
          },
        });
      }
    }

    const inRange = (event: { start: Date }) => event.start >= from ? event.start <= to : false;
    const staleIds = candidates
      .filter(inRange)
      .filter((event) => {
        if (event.ekExternalId == null) return true;
        if (event.ekOccurrenceStart == null) return true;
        return !incomingByKey.has(eventKitKey(event.ekExternalId, event.ekOccurrenceStart));
      })
      .map((event) => event.id);
    if (staleIds.length > 0) {
      await tx.personalEvent.deleteMany({ where: { id: { in: staleIds } } });
    }

    const mirrors = await tx.personalEvent.findMany({
      where: { userId: args.userId, source: "EVENTKIT" as never, start: { gte: from, lte: to } },
      orderBy: [{ start: "asc" }, { id: "asc" }],
    });
    return { mirrors: mirrors.map(personalEventSeriesDto) };
  });

  await projectEnabledSharesForUser(args.userId);
  return result;
}
