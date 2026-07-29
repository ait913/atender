import type { PersonalEventOccurrenceDto } from "@atender/shared";
import type { PersonalEvent } from "./meetingExpansion";

/** occurrence を days ごとに 1 CalendarEvent へ割る。クライアントは日付演算をしない */
export function personalEventsToCalendarEvents(occurrences: PersonalEventOccurrenceDto[]): PersonalEvent[] {
  return occurrences.flatMap((occurrence) =>
    occurrence.days.map((day) => ({
      kind: "personal" as const,
      eventId: `${occurrence.seriesId}:${occurrence.occurrenceDate}:${day.date}`,
      seriesId: occurrence.seriesId,
      date: day.date,
      title: occurrence.title,
      startMinute: day.startMinute,
      endMinute: day.endMinute,
      authorName: "自分",
      authorColor: occurrence.color ?? "#8b5cf6",
      occurrenceDate: occurrence.occurrenceDate,
      isAllDay: occurrence.isAllDay,
      isRecurringOccurrence: occurrence.isRecurringOccurrence,
    })),
  );
}

/** 予定ドット用: occurrence が覆う全 JST 日 */
export function personalEventDates(occurrences: PersonalEventOccurrenceDto[]): Set<string> {
  return new Set(occurrences.flatMap((occurrence) => occurrence.days.map((day) => day.date)));
}

/** JST 日付 (YYYY-MM-DD) の 00:00 を ISO8601 instant にする */
export function jstDayStartIso(date: string): string {
  return `${date}T00:00:00.000+09:00`;
}

/** 終日の包含終了日 -> 排他 end の ISO8601 instant */
export function jstNextDayStartIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + 24 * 60 * 60 * 1000);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}T00:00:00.000+09:00`;
}

/** 終日 occurrence の「表示上の終了日 (包含)」= end - 1ms の JST 日 */
export function inclusiveEndDate(endIso: string): string {
  const end = new Date(new Date(endIso).getTime() - 1);
  const jst = new Date(end.getTime() + 9 * 60 * 60 * 1000);
  const yy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** "YYYY-MM-DDTHH:mm" (datetime-local) <-> ISO8601 instant */
export function toDateTimeLocal(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const yy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd}T${hh}:${mi}`;
}

export function fromDateTimeLocal(value: string): string {
  return `${value}:00.000+09:00`;
}

/** 行の時刻表記。終日/単日/複数日で出し分ける */
export function personalEventTimeLabel(occurrence: {
  isAllDay: boolean;
  days: { date: string; startMinute: number; endMinute: number }[];
}): string {
  const first = occurrence.days[0];
  const last = occurrence.days[occurrence.days.length - 1];
  if (!first || !last) return "終日";
  if (occurrence.isAllDay) {
    if (occurrence.days.length <= 1) return "終日";
    return `${shortDate(first.date)} - ${shortDate(last.date)}`;
  }
  if (occurrence.days.length <= 1) {
    return `${minuteLabel(first.startMinute)} - ${minuteLabel(first.endMinute)}`;
  }
  return `${shortDate(first.date)} ${minuteLabel(first.startMinute)} - ${shortDate(last.date)} ${minuteLabel(last.endMinute)}`;
}

function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
