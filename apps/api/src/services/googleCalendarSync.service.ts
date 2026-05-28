import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { GoogleAuthError, GoogleSyncTokenInvalidError } from "../lib/googleApi";
import { mapGoogleEvent } from "../lib/googleCalendarMapping";
import { getGoogleAccessTokenByUserId, getGoogleAccessTokenWithHeaders } from "./googleAccessToken.service";
import { fetchGoogleUserInfo, listGoogleCalendars, listGoogleEvents } from "./googleCalendar.service";

const DEFAULT_INITIAL_RANGE_MONTHS = 6;
const SYNC_MAX_DURATION_MS = 10 * 60 * 1000;

type VisibilityMode = "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";

export async function completeGoogleLink(args: { userId: string; headers: Headers }) {
  const accessToken = await getGoogleAccessTokenWithHeaders(args.headers);
  const userInfo = await fetchGoogleUserInfo(accessToken);
  const account = await prisma.account.findFirst({ where: { userId: args.userId, providerId: "google" } });
  if (!account) throw new AppError(409, "GOOGLE_ACCOUNT_NOT_FOUND", "Google account not linked");
  const scope = account.scope ?? "";
  if (!scope.includes("https://www.googleapis.com/auth/calendar.readonly")) {
    throw new AppError(409, "CALENDAR_SCOPE_MISSING", "Calendar scope not granted");
  }
  return prisma.googleCalendarConnection.upsert({
    where: { userId: args.userId },
    create: {
      userId: args.userId,
      accountId: account.id,
      googleEmail: userInfo.email,
      scope,
      status: "ACTIVE",
    },
    update: {
      accountId: account.id,
      googleEmail: userInfo.email,
      scope,
      status: "ACTIVE",
      lastError: null,
    },
  });
}

export function getConnection(userId: string) {
  return prisma.googleCalendarConnection.findUnique({ where: { userId } });
}

export async function unlinkGoogle(args: { userId: string; deleteEvents: boolean }) {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: args.userId }, include: { syncs: true } });
  if (!conn) return { ok: true, deletedEvents: 0 };
  let deletedEvents = 0;
  if (args.deleteEvents) {
    const syncIds = conn.syncs.map((sync) => sync.id);
    if (syncIds.length > 0) {
      const result = await prisma.roomEvent.deleteMany({ where: { googleSyncId: { in: syncIds } } });
      deletedEvents = result.count;
    }
  }
  await prisma.googleCalendarSync.deleteMany({ where: { connectionId: conn.id } });
  await prisma.googleCalendarConnection.delete({ where: { id: conn.id } });
  return { ok: true, deletedEvents };
}

export async function listAvailableCalendars(args: { userId: string; headers?: Headers }) {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: args.userId } });
  if (!conn) throw new AppError(404, "NOT_CONNECTED", "Google not connected");
  if (conn.status !== "ACTIVE") throw new AppError(409, "CONNECTION_INACTIVE", `Connection status: ${conn.status}`);
  const token = args.headers ? await getGoogleAccessTokenWithHeaders(args.headers) : await getGoogleAccessTokenByUserId(args.userId);
  return listGoogleCalendars(token);
}

export async function createSync(args: {
  userId: string;
  roomId: string;
  googleCalendarId: string;
  visibilityMode: VisibilityMode;
  headers?: Headers;
}) {
  await assertRoomMember(args.roomId, args.userId);
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: args.userId } });
  if (!conn) throw new AppError(404, "NOT_CONNECTED", "Google not connected");

  const existing = await prisma.googleCalendarSync.findUnique({
    where: {
      roomId_connectionId_googleCalendarId: {
        roomId: args.roomId,
        connectionId: conn.id,
        googleCalendarId: args.googleCalendarId,
      },
    },
  });
  if (existing) throw new AppError(409, "ALREADY_SYNCED", "This calendar is already synced to this room");

  const token = args.headers ? await getGoogleAccessTokenWithHeaders(args.headers) : await getGoogleAccessTokenByUserId(args.userId);
  const calendars = await listGoogleCalendars(token);
  const calendar = calendars.find((item) => item.id === args.googleCalendarId);
  if (!calendar) throw new AppError(404, "CALENDAR_NOT_FOUND", "Google calendar not found on account");

  const sync = await prisma.googleCalendarSync.create({
    data: {
      connectionId: conn.id,
      roomId: args.roomId,
      googleCalendarId: calendar.id,
      calendarSummary: calendar.summary,
      calendarTimeZone: calendar.timeZone,
      visibilityMode: args.visibilityMode,
      status: "IDLE",
      enabled: true,
    },
  });
  await runSync({ syncId: sync.id, userId: args.userId, headers: args.headers });
  return prisma.googleCalendarSync.findUniqueOrThrow({ where: { id: sync.id } });
}

export async function updateSync(args: {
  userId: string;
  roomId: string;
  syncId: string;
  patch: { visibilityMode?: VisibilityMode; enabled?: boolean };
}) {
  const sync = await prisma.googleCalendarSync.findUnique({ where: { id: args.syncId }, include: { connection: true } });
  if (!sync || sync.roomId !== args.roomId) throw new AppError(404, "NOT_FOUND", "Sync not found");
  if (sync.connection.userId !== args.userId) throw new AppError(403, "FORBIDDEN", "Not owner of sync");
  return prisma.googleCalendarSync.update({
    where: { id: args.syncId },
    data: {
      ...(args.patch.visibilityMode !== undefined ? { visibilityMode: args.patch.visibilityMode } : {}),
      ...(args.patch.enabled !== undefined ? { enabled: args.patch.enabled } : {}),
    },
  });
}

export async function deleteSync(args: { userId: string; roomId: string; syncId: string; deleteEvents: boolean }) {
  const sync = await prisma.googleCalendarSync.findUnique({ where: { id: args.syncId }, include: { connection: true } });
  if (!sync || sync.roomId !== args.roomId) throw new AppError(404, "NOT_FOUND", "Sync not found");
  if (sync.connection.userId !== args.userId) throw new AppError(403, "FORBIDDEN", "Not owner of sync");
  if (args.deleteEvents) await prisma.roomEvent.deleteMany({ where: { googleSyncId: args.syncId } });
  await prisma.googleCalendarSync.delete({ where: { id: args.syncId } });
  return { ok: true };
}

export async function listSyncs(userId: string, roomId: string) {
  await assertRoomMember(roomId, userId);
  return prisma.googleCalendarSync.findMany({
    where: { roomId, connection: { userId } },
    orderBy: { createdAt: "desc" },
  });
}

export async function runSync(args: { syncId: string; userId?: string; headers?: Headers }) {
  const sync0 = await prisma.googleCalendarSync.findUnique({ where: { id: args.syncId } });
  if (!sync0) throw new AppError(404, "NOT_FOUND", "Sync not found");
  if (!sync0.enabled) return { ok: true, skipped: "DISABLED" as const };
  if (sync0.status === "SYNCING") return { ok: true, skipped: "ALREADY_SYNCING" as const };

  const connection = await prisma.googleCalendarConnection.findUniqueOrThrow({ where: { id: sync0.connectionId } });
  if (connection.status !== "ACTIVE") return { ok: false, skipped: "CONN_INACTIVE" as const };
  const userId = args.userId ?? connection.userId;

  await prisma.googleCalendarSync.update({ where: { id: args.syncId }, data: { status: "SYNCING", lastError: null } });
  const startedAt = Date.now();

  try {
    const token = args.headers ? await getGoogleAccessTokenWithHeaders(args.headers) : await getGoogleAccessTokenByUserId(userId);
    let useSyncToken = sync0.syncToken;
    let result;
    try {
      result = await listGoogleEvents({
        accessToken: token,
        calendarId: sync0.googleCalendarId,
        syncToken: useSyncToken,
        timeMin: useSyncToken ? undefined : new Date(),
        timeMax: useSyncToken ? undefined : addMonths(new Date(), DEFAULT_INITIAL_RANGE_MONTHS),
      });
    } catch (error) {
      if (!(error instanceof GoogleSyncTokenInvalidError)) throw error;
      await prisma.roomEvent.deleteMany({ where: { googleSyncId: args.syncId } });
      await prisma.googleCalendarSync.update({ where: { id: args.syncId }, data: { syncToken: null } });
      useSyncToken = null;
      result = await listGoogleEvents({
        accessToken: token,
        calendarId: sync0.googleCalendarId,
        timeMin: new Date(),
        timeMax: addMonths(new Date(), DEFAULT_INITIAL_RANGE_MONTHS),
      });
    }

    let upserted = 0;
    let deleted = 0;
    for (const event of result.events) {
      if (Date.now() - startedAt > SYNC_MAX_DURATION_MS) throw new Error("Sync exceeded max duration (10 min)");
      const mapped = await mapGoogleEvent({
        event,
        userId,
        syncDefaultVisibility: sync0.visibilityMode,
        calendarTimeZone: sync0.calendarTimeZone,
      });
      if (!mapped) continue;
      if (mapped.status === "cancelled") {
        const r = await prisma.roomEvent.deleteMany({ where: { googleSyncId: args.syncId, googleEventId: mapped.googleEventId } });
        deleted += r.count;
        continue;
      }
      await prisma.roomEvent.upsert({
        where: { googleSyncId_googleEventId: { googleSyncId: args.syncId, googleEventId: mapped.googleEventId } },
        create: {
          roomId: sync0.roomId,
          authorId: userId,
          title: mapped.mappedTitle,
          rawTitle: mapped.rawTitle,
          description: null,
          start: mapped.startUtc,
          end: mapped.endUtc,
          isAllDay: mapped.isAllDay,
          color: null,
          source: "GOOGLE_OAUTH",
          visibilityMode: mapped.visibilityMode,
          googleSyncId: args.syncId,
          googleEventId: mapped.googleEventId,
          googleRecurringEventId: mapped.googleRecurringEventId,
        },
        update: {
          title: mapped.mappedTitle,
          rawTitle: mapped.rawTitle,
          start: mapped.startUtc,
          end: mapped.endUtc,
          isAllDay: mapped.isAllDay,
          visibilityMode: mapped.visibilityMode,
          googleRecurringEventId: mapped.googleRecurringEventId,
        },
      });
      upserted++;
    }

    const now = new Date();
    await prisma.googleCalendarSync.update({
      where: { id: args.syncId },
      data: {
        syncToken: result.nextSyncToken ?? useSyncToken,
        lastSyncedAt: now,
        status: "OK",
        lastError: null,
      },
    });
    await prisma.googleCalendarConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: now } });
    return { ok: true, upserted, deleted };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const status = error instanceof GoogleAuthError ? "REVOKED" : "FAILED";
    await prisma.googleCalendarSync.update({
      where: { id: args.syncId },
      data: { status, lastError: reason.slice(0, 1000) },
    });
    if (error instanceof GoogleAuthError) {
      await prisma.googleCalendarConnection.update({
        where: { id: connection.id },
        data: { status: "REVOKED", lastError: reason.slice(0, 500) },
      });
      await prisma.googleCalendarSync.updateMany({ where: { connectionId: connection.id }, data: { status: "REVOKED" } });
    }
    return { ok: false, error: reason };
  }
}

export async function runAllSyncsForUser(userId: string) {
  const syncs = await prisma.googleCalendarSync.findMany({
    where: { connection: { userId }, enabled: true, status: { not: "SYNCING" } },
    orderBy: { lastSyncedAt: "asc" },
  });
  const results: Array<{ syncId: string; ok: boolean; error?: string }> = [];
  for (const sync of syncs) {
    const result = await runSync({ syncId: sync.id, userId });
    results.push({ syncId: sync.id, ok: result.ok, ...("error" in result ? { error: result.error } : {}) });
  }
  return { results, count: syncs.length };
}

export async function runAllSyncsGlobal() {
  const connections = await prisma.googleCalendarConnection.findMany({ where: { status: "ACTIVE" }, select: { userId: true } });
  let total = 0;
  for (const connection of connections) {
    const result = await runAllSyncsForUser(connection.userId);
    total += result.count;
  }
  return { totalSyncs: total, userCount: connections.length };
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
