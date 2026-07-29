import { RecurrenceSpec, type WeekdayCode } from "../schemas/recurrence.js";

/** 日本には DST が無いので固定オフセットで JST 暦を導出できる */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const WEEKDAY_ORDER: WeekdayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const WEEKDAY_BY_UTC_DAY: WeekdayCode[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function jstCivil(date: Date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: WEEKDAY_BY_UTC_DAY[shifted.getUTCDay()],
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toIcsUtc(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

/** JST 日付 (YYYY-MM-DD) のその日 23:59:59 を UTC ICS 表記にする */
function untilFromJstDate(date: string): string | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d] = match;
  const jstEndOfDay = Date.UTC(Number(y), Number(mo) - 1, Number(d), 23, 59, 59);
  return toIcsUtc(new Date(jstEndOfDay - JST_OFFSET_MS));
}

/** UTC ICS 表記の UNTIL を JST 日付 (YYYY-MM-DD) に戻す */
function jstDateFromUntil(value: string): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const jst = new Date(utcMs + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
}

function sortWeekdays(days: WeekdayCode[]): WeekdayCode[] {
  const unique = new Set(days);
  return WEEKDAY_ORDER.filter((code) => unique.has(code));
}

/** spec + DTSTART から RFC5545 の RRULE 本体 (DTSTART 行を含まない) を組む */
export function buildRRule(spec: RecurrenceSpec, dtstart: Date): string {
  const civil = jstCivil(dtstart);
  const parts: string[] = [`FREQ=${spec.freq}`];
  if (spec.interval > 1) parts.push(`INTERVAL=${spec.interval}`);

  if (spec.freq === "WEEKLY") {
    const days = spec.byDay.length > 0 ? sortWeekdays(spec.byDay) : [civil.weekday];
    parts.push(`BYDAY=${days.join(",")}`);
  } else if (spec.freq === "MONTHLY") {
    if (spec.monthlyMode === "BYDAY") {
      const ordinal = Math.floor((civil.day - 1) / 7) + 1;
      parts.push(`BYDAY=${ordinal === 5 ? -1 : ordinal}${civil.weekday}`);
    } else {
      parts.push(`BYMONTHDAY=${civil.day}`);
    }
  } else if (spec.freq === "YEARLY") {
    parts.push(`BYMONTH=${civil.month}`);
    parts.push(`BYMONTHDAY=${civil.day}`);
  }

  if (spec.end.kind === "count") {
    parts.push(`COUNT=${spec.end.count}`);
  } else if (spec.end.kind === "until") {
    const until = untilFromJstDate(spec.end.date);
    if (until) parts.push(`UNTIL=${until}`);
  }
  return parts.join(";");
}

const KNOWN_KEYS = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTH", "BYMONTHDAY", "COUNT", "UNTIL"]);

/** RRULE 本体を spec へ戻す。表現できない RRULE (BYSETPOS/BYWEEKNO/複数 BYMONTHDAY 等) は null */
export function parseRRule(rrule: string, dtstart: Date): RecurrenceSpec | null {
  if (typeof rrule !== "string") return null;
  if (rrule.trim().length === 0) return null;
  const values = new Map<string, string>();
  for (const raw of rrule.split(";")) {
    const part = raw.trim();
    if (part.length === 0) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const key = part.slice(0, eq).toUpperCase();
    const value = part.slice(eq + 1);
    if (!KNOWN_KEYS.has(key)) return null;
    if (values.has(key)) return null;
    values.set(key, value);
  }

  const freq = values.get("FREQ")?.toUpperCase();
  if (freq !== "DAILY") {
    if (freq !== "WEEKLY") {
      if (freq !== "MONTHLY") {
        if (freq !== "YEARLY") return null;
      }
    }
  }

  let interval = 1;
  const rawInterval = values.get("INTERVAL");
  if (rawInterval !== undefined) {
    if (!/^\d+$/.test(rawInterval)) return null;
    interval = Number(rawInterval);
  }

  if (values.has("COUNT")) {
    if (values.has("UNTIL")) return null;
  }
  let end: RecurrenceSpec["end"] = { kind: "never" };
  const rawCount = values.get("COUNT");
  if (rawCount !== undefined) {
    if (!/^\d+$/.test(rawCount)) return null;
    end = { kind: "count", count: Number(rawCount) };
  }
  const rawUntil = values.get("UNTIL");
  if (rawUntil !== undefined) {
    const date = jstDateFromUntil(rawUntil.toUpperCase());
    if (!date) return null;
    end = { kind: "until", date };
  }

  const civil = jstCivil(dtstart);
  let byDay: WeekdayCode[] = [];
  let monthlyMode: RecurrenceSpec["monthlyMode"] = null;

  if (freq === "DAILY") {
    if (values.has("BYDAY")) return null;
    if (values.has("BYMONTH")) return null;
    if (values.has("BYMONTHDAY")) return null;
  } else if (freq === "WEEKLY") {
    if (values.has("BYMONTH")) return null;
    if (values.has("BYMONTHDAY")) return null;
    const rawByDay = values.get("BYDAY");
    if (rawByDay === undefined) {
      byDay = [civil.weekday];
    } else {
      const codes = rawByDay.toUpperCase().split(",").map((code) => code.trim()).filter(Boolean);
      if (codes.length === 0) return null;
      for (const code of codes) {
        if (!WEEKDAY_ORDER.includes(code as WeekdayCode)) return null;
      }
      byDay = sortWeekdays(codes as WeekdayCode[]);
    }
  } else if (freq === "MONTHLY") {
    if (values.has("BYMONTH")) return null;
    const rawByDay = values.get("BYDAY");
    const rawByMonthDay = values.get("BYMONTHDAY");
    if (rawByDay !== undefined) {
      if (rawByMonthDay !== undefined) return null;
      const codes = rawByDay.toUpperCase().split(",").map((code) => code.trim()).filter(Boolean);
      if (codes.length !== 1) return null;
      if (!/^(-?\d)(MO|TU|WE|TH|FR|SA|SU)$/.test(codes[0])) return null;
      monthlyMode = "BYDAY";
    } else {
      if (rawByMonthDay !== undefined) {
        const days = rawByMonthDay.split(",").map((value) => value.trim()).filter(Boolean);
        if (days.length !== 1) return null;
        if (!/^\d{1,2}$/.test(days[0])) return null;
      }
      monthlyMode = "BYMONTHDAY";
    }
  } else {
    if (values.has("BYDAY")) return null;
    const rawByMonth = values.get("BYMONTH");
    if (rawByMonth !== undefined) {
      const months = rawByMonth.split(",").map((value) => value.trim()).filter(Boolean);
      if (months.length !== 1) return null;
      if (!/^\d{1,2}$/.test(months[0])) return null;
    }
    const rawByMonthDay = values.get("BYMONTHDAY");
    if (rawByMonthDay !== undefined) {
      const days = rawByMonthDay.split(",").map((value) => value.trim()).filter(Boolean);
      if (days.length !== 1) return null;
      if (!/^\d{1,2}$/.test(days[0])) return null;
    }
  }

  const parsed = RecurrenceSpec.safeParse({ freq, interval, byDay, monthlyMode, end });
  return parsed.success ? parsed.data : null;
}
