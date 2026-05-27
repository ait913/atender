import { createHash } from "node:crypto";
import iconv from "iconv-lite";
import jschardet from "jschardet";
import * as ical from "node-ical";

export const MAX_ICS_BYTES = 5 * 1024 * 1024;

export type ParsedVEvent = {
  uid: string;
  sequence: number | null;
  lastModified: Date | null;
  summary: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  rrule: string | null;
  exDates: Date[];
  rDates: Date[];
  recurrenceId: Date | null;
};

export type ParseResult = {
  events: ParsedVEvent[];
  contentHash: string;
  normalizedText: string;
};

type IcalVEvent = {
  type?: string;
  uid?: string;
  sequence?: number | string;
  lastmodified?: Date | { toJSDate?: () => Date };
  summary?: string;
  start?: (Date & { tz?: string }) | { toJSDate?: () => Date; tz?: string };
  end?: (Date & { tz?: string }) | { toJSDate?: () => Date; tz?: string };
  datetype?: "date" | "date-time";
  rrule?: { toString?: () => string };
  recurrenceid?: Date | { toJSDate?: () => Date };
  exdate?: Record<string, Date | { toJSDate?: () => Date }>;
  rdate?: Record<string, Date | { toJSDate?: () => Date }>;
};

export function parseIcsBuffer(buf: Buffer): ParseResult {
  if (buf.byteLength === 0) throw new Error("Empty file");
  if (buf.byteLength > MAX_ICS_BYTES) throw new Error("File too large");

  const normalizedText = normalizeEncoding(buf);
  const raw = ical.parseICS(normalizedText) as Record<string, unknown>;
  const events: ParsedVEvent[] = [];
  for (const value of Object.values(raw)) {
    const event = value as IcalVEvent;
    if (event?.type !== "VEVENT") continue;
    events.push(extractVEvent(event));
  }
  if (events.length === 0) throw new Error("No VEVENT found");
  return {
    events,
    normalizedText,
    contentHash: createHash("sha256").update(buf).digest("hex"),
  };
}

function normalizeEncoding(buf: Buffer): string {
  const detected = jschardet.detect(buf);
  const encoding = (detected.encoding ?? "utf-8").toLowerCase();
  const decoded = encoding === "utf-8" || encoding === "utf8" || encoding === "ascii"
    ? buf.toString("utf8")
    : iconv.decode(buf, encoding);
  return decoded.replace(/^\uFEFF/, "");
}

function extractVEvent(event: IcalVEvent): ParsedVEvent {
  if (!event.uid) throw new Error("VEVENT missing UID");
  if (!event.start) throw new Error("VEVENT missing DTSTART");
  const start = toUtc(event.start);
  const end = event.end ? toUtc(event.end) : new Date(start.getTime() + 60 * 60 * 1000);
  const fullRRule = event.rrule?.toString?.() ?? "";
  const recurrenceId = event.recurrenceid ? toUtc(event.recurrenceid) : null;
  return {
    uid: event.uid,
    sequence: event.sequence == null ? null : Number(event.sequence) || 0,
    lastModified: event.lastmodified ? toUtc(event.lastmodified) : null,
    summary: (event.summary ?? "").toString().trim(),
    start,
    end,
    isAllDay: event.datetype === "date",
    rrule: fullRRule ? fullRRule.replace(/^RRULE:/i, "").trim() || null : null,
    exDates: event.exdate ? Object.values(event.exdate).map(toUtc) : [],
    rDates: event.rdate ? Object.values(event.rdate).map(toUtc) : [],
    recurrenceId,
  };
}

function toUtc(value: Date | { toJSDate?: () => Date; tz?: string }): Date {
  const date = value instanceof Date ? value : value.toJSDate?.();
  if (!date) throw new Error("Invalid ICS date");
  if ("tz" in value && !value.tz) {
    return new Date(date.getTime() - 9 * 60 * 60 * 1000);
  }
  return date;
}
