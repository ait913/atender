import type { IcsImport } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { MAX_ICS_BYTES, parseIcsBuffer, type ParsedVEvent } from "../lib/icsParse";
import { toIcsDate, validateRRule } from "../lib/rruleExpand";
import { applyTitleRules, ensureDefaultRule } from "./icsTitleRule.service";

export async function createIcsImport(args: { userId: string; roomId: string; filename: string; buf: Buffer }) {
  await assertRoomMember(args.roomId, args.userId);
  if (args.buf.byteLength > MAX_ICS_BYTES) throw new AppError(413, "FILE_TOO_LARGE", "ICS file exceeds 5MB");
  let parsed: ReturnType<typeof parseIcsBuffer>;
  try {
    parsed = parseIcsBuffer(args.buf);
  } catch (error) {
    throw new AppError(400, "INVALID_ICS", error instanceof Error ? error.message : String(error));
  }
  const existing = await prisma.icsImport.findFirst({
    where: { userId: args.userId, roomId: args.roomId, contentHash: parsed.contentHash },
  });
  if (existing) return { import: dtoIcsImport(existing), parsed: parsed.events, dedup: true };
  const created = await prisma.icsImport.create({
    data: {
      userId: args.userId,
      roomId: args.roomId,
      source: "ICS_FILE",
      filename: args.filename,
      contentHash: parsed.contentHash,
      rawText: parsed.normalizedText,
      status: "PARSED",
      parsedEventCount: parsed.events.length,
    },
  });
  return { import: dtoIcsImport(created), parsed: parsed.events, dedup: false };
}

export async function listIcsImports(userId: string, roomId: string) {
  await assertRoomMember(roomId, userId);
  const imports = await prisma.icsImport.findMany({ where: { userId, roomId }, orderBy: { createdAt: "desc" } });
  return imports.map(dtoIcsImport);
}

export async function previewIcsImport(userId: string, importId: string) {
  const imp = await ownedImport(userId, importId);
  const parsed = parseIcsBuffer(Buffer.from(imp.rawText, "utf8"));
  const rules = await prisma.icsTitleRule.findMany({ where: { userId }, orderBy: { priority: "asc" } });
  return {
    importId,
    events: parsed.events.map((event) => {
      const applied = applyTitleRules(event.summary, rules);
      return {
        uid: event.uid,
        rawTitle: event.summary,
        mappedTitle: applied.title,
        visibilityMode: applied.visibilityMode,
        ruleId: applied.ruleId,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        isRecurring: event.rrule != null,
        rrule: event.rrule,
      };
    }),
  };
}

export async function commitIcsImport(userId: string, importId: string) {
  const imp = await ownedImport(userId, importId);
  if (imp.status === "SUCCESS") throw new AppError(409, "ALREADY_COMMITTED", "Already committed");
  await ensureDefaultRule(userId);
  const rules = await prisma.icsTitleRule.findMany({ where: { userId }, orderBy: { priority: "asc" } });
  const parsed = parseIcsBuffer(Buffer.from(imp.rawText, "utf8"));
  const masters = parsed.events.filter((event) => event.recurrenceId == null);
  const overrides = parsed.events.filter((event) => event.recurrenceId != null);
  let committed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const event of masters) {
    try {
      await upsertMaster({ imp, userId, event, rules });
      committed++;
    } catch (error) {
      skipped++;
      errors.push(`UID ${event.uid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const event of overrides) {
    try {
      await upsertOverride({ imp, event, rules });
      committed++;
    } catch (error) {
      skipped++;
      errors.push(`UID ${event.uid} (override): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await prisma.icsImport.update({
    where: { id: importId },
    data: {
      status: errors.length === 0 ? "SUCCESS" : "PARTIAL_ERROR",
      committedEventCount: committed,
      skippedEventCount: skipped,
      errorMessage: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
      committedAt: new Date(),
    },
  });
  return { committed, skipped, errors: errors.slice(0, 20) };
}

export async function deleteIcsImport(userId: string, importId: string) {
  await ownedImport(userId, importId);
  await prisma.$transaction([
    prisma.roomEvent.deleteMany({ where: { importId } }),
    prisma.icsImport.delete({ where: { id: importId } }),
  ]);
}

async function upsertMaster(args: {
  imp: IcsImport;
  userId: string;
  event: ParsedVEvent;
  rules: Parameters<typeof applyTitleRules>[1];
}) {
  if (args.event.rrule) validateRRule(args.event.rrule, args.event.start);
  const applied = applyTitleRules(args.event.summary, args.rules);
  const existing = await prisma.roomEvent.findUnique({
    where: { roomId_externalUid: { roomId: args.imp.roomId, externalUid: args.event.uid } },
  });
  const data = {
    title: applied.title,
    rawTitle: args.event.summary,
    description: null,
    start: args.event.start,
    end: args.event.end,
    isAllDay: args.event.isAllDay,
    recurrenceRule: args.event.rrule,
    exDates: args.event.exDates.length > 0 ? args.event.exDates.map(toIcsDate).join(",") : null,
    rDates: args.event.rDates.length > 0 ? args.event.rDates.map(toIcsDate).join(",") : null,
    source: "ICS_FILE" as const,
    externalSeq: args.event.sequence,
    externalLastModified: args.event.lastModified,
    importId: args.imp.id,
    visibilityMode: applied.visibilityMode,
  };
  if (!existing) {
    await prisma.roomEvent.create({
      data: {
        ...data,
        roomId: args.imp.roomId,
        authorId: args.userId,
        color: null,
        externalUid: args.event.uid,
      },
    });
    return;
  }
  const incomingSeq = args.event.sequence ?? 0;
  const existingSeq = existing.externalSeq ?? 0;
  if (incomingSeq < existingSeq) return;
  if (incomingSeq === existingSeq && args.event.lastModified && existing.externalLastModified && args.event.lastModified <= existing.externalLastModified) return;
  await prisma.roomEvent.update({ where: { id: existing.id }, data });
}

async function upsertOverride(args: {
  imp: IcsImport;
  event: ParsedVEvent;
  rules: Parameters<typeof applyTitleRules>[1];
}) {
  if (!args.event.recurrenceId) throw new Error("RECURRENCE-ID missing");
  const master = await prisma.roomEvent.findUnique({
    where: { roomId_externalUid: { roomId: args.imp.roomId, externalUid: args.event.uid } },
  });
  if (!master) throw new Error("master not found for RECURRENCE-ID");
  const applied = applyTitleRules(args.event.summary, args.rules);
  await prisma.roomEventOverride.upsert({
    where: { seriesId_originalDate: { seriesId: master.id, originalDate: args.event.recurrenceId } },
    create: { seriesId: master.id, originalDate: args.event.recurrenceId, newStart: args.event.start, newEnd: args.event.end, newTitle: applied.title },
    update: { newStart: args.event.start, newEnd: args.event.end, newTitle: applied.title },
  });
}

async function ownedImport(userId: string, importId: string) {
  const imp = await prisma.icsImport.findUnique({ where: { id: importId } });
  if (!imp || imp.userId !== userId) throw new AppError(404, "NOT_FOUND", "Import not found");
  return imp;
}

async function assertRoomMember(roomId: string, userId: string) {
  const membership = await prisma.roomMembership.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!membership) throw new AppError(403, "NOT_MEMBER", "Room member only");
}

function dtoIcsImport(imp: IcsImport) {
  return {
    id: imp.id,
    filename: imp.filename,
    source: imp.source,
    status: imp.status,
    parsedEventCount: imp.parsedEventCount,
    committedEventCount: imp.committedEventCount,
    skippedEventCount: imp.skippedEventCount,
    errorMessage: imp.errorMessage,
    committedAt: imp.committedAt?.toISOString() ?? null,
    createdAt: imp.createdAt.toISOString(),
  };
}
