import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { prisma } from "../db";
import type { GoogleEvent } from "../services/googleCalendar.service";
import { applyTitleRules, ensureDefaultRule } from "../services/icsTitleRule.service";

dayjs.extend(utc);
dayjs.extend(timezone);

const FALLBACK_TZ = "Asia/Tokyo";

type VisibilityMode = "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";

export type MappedGoogleEvent = {
  googleEventId: string;
  googleRecurringEventId: string | null;
  rawTitle: string;
  mappedTitle: string;
  visibilityMode: VisibilityMode;
  startUtc: Date;
  endUtc: Date;
  isAllDay: boolean;
  status: "confirmed" | "tentative" | "cancelled";
};

export async function mapGoogleEvent(args: {
  event: GoogleEvent;
  userId: string;
  syncDefaultVisibility: VisibilityMode;
  calendarTimeZone: string;
}): Promise<MappedGoogleEvent | null> {
  const ev = args.event;
  if (!ev.id) return null;
  const status = ev.status ?? "confirmed";
  const rawTitle = ev.summary ?? "(タイトルなし)";

  await ensureDefaultRule(args.userId);
  const rules = await prisma.icsTitleRule.findMany({ where: { userId: args.userId }, orderBy: { priority: "asc" } });
  const customApplied = applyTitleRules(rawTitle, rules.filter((rule) => !rule.isDefault));
  const defaultRule = rules.find((rule) => rule.isDefault);
  const applied = customApplied.ruleId != null
    ? customApplied
    : args.syncDefaultVisibility === "TITLE_MAPPED" && defaultRule
      ? { title: defaultRule.replaceWith ?? "予定", visibilityMode: defaultRule.visibilityMode as VisibilityMode, ruleId: defaultRule.id, rawTitle }
      : { title: rawTitle, visibilityMode: args.syncDefaultVisibility, ruleId: null, rawTitle };
  const visibilityMode = applied.visibilityMode;
  const { startUtc, endUtc, isAllDay } = resolveDates(ev, args.calendarTimeZone);

  return {
    googleEventId: ev.id,
    googleRecurringEventId: ev.recurringEventId ?? null,
    rawTitle,
    mappedTitle: applied.title,
    visibilityMode,
    startUtc,
    endUtc,
    isAllDay,
    status,
  };
}

function resolveDates(ev: GoogleEvent, calendarTz: string): { startUtc: Date; endUtc: Date; isAllDay: boolean } {
  const tz = calendarTz || FALLBACK_TZ;
  if (ev.start?.date) {
    const start = dayjs.tz(`${ev.start.date} 00:00:00`, tz).utc().toDate();
    const endStr = ev.end?.date ?? ev.start.date;
    const end = dayjs.tz(`${endStr} 00:00:00`, tz).subtract(1, "millisecond").utc().toDate();
    return { startUtc: start, endUtc: end, isAllDay: true };
  }
  if (ev.start?.dateTime) {
    const start = parseDateTime(ev.start.dateTime, ev.start.timeZone ?? tz);
    const end = ev.end?.dateTime ? parseDateTime(ev.end.dateTime, ev.end.timeZone ?? tz) : new Date(start.getTime() + 60 * 60 * 1000);
    return { startUtc: start, endUtc: end, isAllDay: false };
  }
  const fallback = dayjs.tz(new Date(), tz).utc().toDate();
  return { startUtc: fallback, endUtc: new Date(fallback.getTime() + 60 * 60 * 1000), isAllDay: false };
}

function parseDateTime(value: string, tz: string) {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) return new Date(value);
  return dayjs.tz(value, tz || FALLBACK_TZ).utc().toDate();
}
