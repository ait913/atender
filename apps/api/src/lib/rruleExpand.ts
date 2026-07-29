import pkg from "rrule";

type RRuleSet = InstanceType<typeof pkg.RRuleSet>;
const rrulestr = pkg.rrulestr.bind(pkg);

export type RRuleParts = {
  rrule: string;
  dtstart: Date;
  exDates: Date[];
  rDates: Date[];
};

export function buildRRuleSet(parts: RRuleParts): RRuleSet {
  const lines = [`DTSTART:${toIcsDate(parts.dtstart)}`, `RRULE:${parts.rrule}`];
  for (const date of parts.exDates) lines.push(`EXDATE:${toIcsDate(date)}`);
  for (const date of parts.rDates) lines.push(`RDATE:${toIcsDate(date)}`);
  return rrulestr(lines.join("\n"), { forceset: true }) as RRuleSet;
}

export function expandBetween(parts: RRuleParts, from: Date, to: Date): Date[] {
  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxRangeMs) throw new Error("RANGE_TOO_LARGE");
  return buildRRuleSet(parts).between(from, to, true);
}

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** RRULE 内の UNTIL= を offsetMs だけずらす (擬似空間へ入れる/戻すため) */
export function shiftRRuleUntil(rrule: string, offsetMs: number): string {
  return rrule
    .split(";")
    .map((part) => {
      const match = part.match(/^UNTIL=(.+)$/i);
      if (!match) return part;
      return `UNTIL=${toIcsDate(new Date(parseIcsDate(match[1]).getTime() + offsetMs))}`;
    })
    .join(";");
}

/** JST 暦で正しく展開する。dtstart / exDates / rDates / UNTIL / from / to を全て +9h して展開し、結果を -9h */
export function expandBetweenJst(parts: RRuleParts, from: Date, to: Date): Date[] {
  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxRangeMs) throw new Error("RANGE_TOO_LARGE");
  const forward = (date: Date) => new Date(date.getTime() + JST_OFFSET_MS);
  const shifted: RRuleParts = {
    rrule: shiftRRuleUntil(parts.rrule, JST_OFFSET_MS),
    dtstart: forward(parts.dtstart),
    exDates: parts.exDates.map(forward),
    rDates: parts.rDates.map(forward),
  };
  return expandBetween(shifted, forward(from), forward(to)).map((date) => new Date(date.getTime() - JST_OFFSET_MS));
}

export function appendOrReplaceUntil(rrule: string, until: Date): string {
  const parts = rrule.split(";").filter((part) => !part.startsWith("UNTIL=") && !part.startsWith("COUNT="));
  parts.push(`UNTIL=${toIcsDate(until)}`);
  return parts.join(";");
}

export function stripUntil(rrule: string) {
  return rrule.split(";").filter((part) => !part.startsWith("UNTIL=") && !part.startsWith("COUNT=")).join(";");
}

export function datesToCsv(values: string[]) {
  return values.length > 0 ? values.map((value) => toIcsDate(new Date(value))).join(",") : null;
}

export function validateRRule(rrule: string, dtstart: Date): void {
  if (rrule.length > 720) throw new Error("RRULE > 720 chars");
  rrulestr(`DTSTART:${toIcsDate(dtstart)}\nRRULE:${rrule}`);
}

export function parseCsvDates(csv: string | null | undefined): Date[] {
  if (!csv) return [];
  return csv.split(",").map((value) => value.trim()).filter(Boolean).map(parseIcsDate);
}

export function toIcsDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

export function parseIcsDate(value: string): Date {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) throw new Error(`Invalid ICS date: ${value}`);
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
}
