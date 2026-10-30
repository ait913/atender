import type { ClassTransferDto, MeetingDto, OccurrenceDto, UserTimetableDto } from "@atender/shared";
import { addDays, formatMonthDay, jsWeekday } from "./CalendarDate";

export type ClassTransferPreviewRow = { periodIndex: number; periodCount: number; courseName: string; replaces: string | null; blockedBy: string | null };
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function groupPeriods(periods: number[]): { start: number; count: number }[] {
  const groups: { start: number; count: number }[] = [];
  for (const period of [...new Set(periods)].sort((a, b) => a - b)) {
    const last = groups.at(-1);
    if (last && last.start + last.count === period) last.count += 1;
    else groups.push({ start: period, count: 1 });
  }
  return groups;
}

export function defaultSourceDay(targetDate: string, meetings: MeetingDto[]): number | null {
  const targetDay = jsWeekday(targetDate);
  return [1, 2, 3, 4, 5, 6, 0].find((day) => day !== targetDay && meetings.some((meeting) => meeting.dayOfWeek === day)) ?? null;
}

export function defaultSourceDate(targetDate: string, sourceDayOfWeek: number, semesterStart: string): string {
  const diff = (jsWeekday(targetDate) - sourceDayOfWeek + 7) % 7 || 7;
  const candidate = addDays(targetDate, -diff);
  return candidate < semesterStart
    ? addDays(semesterStart, (sourceDayOfWeek - jsWeekday(semesterStart) + 7) % 7)
    : candidate;
}

function previewRow(
  start: number,
  count: number,
  courseName: string,
  existing: OccurrenceDto[],
  targetDate?: string,
): ClassTransferPreviewRow {
  const overlapping = existing.filter((occ) => occ.periodIndex >= start && occ.periodIndex < start + count);
  const replaced = overlapping.find((occ) => occ.transferId == null);
  return {
    periodIndex: start,
    periodCount: count,
    courseName,
    replaces: replaced
      ? `${WEEKDAYS[jsWeekday(targetDate ?? replaced.date)]}曜 ${replaced.periodIndex}限 ${replaced.courseName} を置き換え`
      : null,
    blockedBy: overlapping.some((occ) => occ.transferId != null) ? "既に授業変更があります" : null,
  };
}

export function previewMoveDay(targetDate: string, sourceDayOfWeek: number, timetable: UserTimetableDto, existing: OccurrenceDto[]): ClassTransferPreviewRow[] {
  return timetable.meetings.filter((meeting) => meeting.dayOfWeek === sourceDayOfWeek)
    .sort((a, b) => a.startPeriodIndex - b.startPeriodIndex)
    .map((meeting) => previewRow(
      meeting.startPeriodIndex,
      meeting.periodCount,
      timetable.courses.find((course) => course.id === meeting.courseId)?.name ?? "授業",
      existing,
      targetDate,
    ));
}

export function previewSingle(periodIndexes: number[], courseId: string, timetable: UserTimetableDto, existing: OccurrenceDto[]): ClassTransferPreviewRow[] {
  const courseName = timetable.courses.find((course) => course.id === courseId)?.name ?? "授業";
  return groupPeriods(periodIndexes).map(({ start, count }) => previewRow(start, count, courseName, existing));
}

export function canSubmit(rows: ClassTransferPreviewRow[]): boolean {
  return rows.length > 0 && rows.every((row) => row.blockedBy === null);
}

export function summary(transfer: ClassTransferDto, occurrences: OccurrenceDto[]): string {
  if (transfer.kind === "MOVE_DAY") {
    const text = `${WEEKDAYS[transfer.sourceDayOfWeek ?? 0]}曜日の時間割 (${occurrences.length}コマ)`;
    return text + (transfer.sourceDate != null
      ? ` · ${formatMonthDay(transfer.sourceDate)}(${WEEKDAYS[jsWeekday(transfer.sourceDate)]}) を休講`
      : "");
  }
  const periods = groupPeriods(occurrences.map((occ) => occ.periodIndex))
    .map(({ start, count }) => count > 1 ? `${start}-${start + count - 1}限` : `${start}限`).join("・");
  return `${occurrences[0]?.courseName ?? ""} ${periods}`;
}

export function needsDeleteConfirmation(transfer: ClassTransferDto, occurrences: OccurrenceDto[]): number {
  return occurrences.filter((occ) => occ.transferId === transfer.id && occ.status != null).length;
}
