import type { TemplateDto } from "@atender/shared";
import { todayString } from "./SchoolClock";

export const FOUND_TITLE = "同じ学科の時間割が見つかりました";
export type TemplatePreviewRow = { id: string; weekday: string; periodText: string; courseName: string; detail: string | null };

function timestamp(t: TemplateDto): number {
  const value = Date.parse(t.updatedAt);
  return Number.isNaN(value) ? -Infinity : value;
}

function newestFirst(a: TemplateDto, b: TemplateDto): number {
  const aTime = timestamp(a);
  const bTime = timestamp(b);
  if (aTime !== bTime) return aTime > bTime ? -1 : 1;
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
}

export function visible(templates: TemplateDto[]): TemplateDto[] {
  const grouped = new Map<string, TemplateDto>();
  const result: TemplateDto[] = [];
  for (const template of templates) {
    if (template.meetings.length === 0) continue;
    if (template.authorUserId === "") {
      result.push(template);
      continue;
    }
    const key = JSON.stringify([template.authorUserId, template.title]);
    const previous = grouped.get(key);
    if (!previous || newestFirst(template, previous) < 0) grouped.set(key, template);
  }
  return [...result, ...grouped.values()].sort((a, b) => b.copyCount - a.copyCount || newestFirst(a, b));
}

export function sizeText(t: TemplateDto): string {
  return `${t.courses.length}科目・週${t.meetings.reduce((sum, meeting) => sum + meeting.periodCount, 0)}コマ`;
}

export function metaText(t: TemplateDto, meId: string | null): string {
  const parts: string[] = [];
  if (meId != null && meId === t.authorUserId) parts.push("あなたが公開");
  if (t.copyCount > 0) parts.push(`${t.copyCount}人が使用`);
  const time = Date.parse(t.updatedAt);
  if (!Number.isNaN(time)) {
    const [year, month, day] = todayString(new Date(time)).split("-").map(Number);
    parts.push(`${year}/${month}/${day} 更新`);
  }
  return parts.join("・");
}

export function previewRows(t: TemplateDto): TemplatePreviewRow[] {
  return [...t.meetings].sort((a, b) =>
    (a.dayOfWeek || 7) - (b.dayOfWeek || 7) || a.startPeriodIndex - b.startPeriodIndex ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  ).map((meeting) => {
    const course = t.courses.find((item) => item.id === meeting.courseId);
    const detail = [course?.teacher, meeting.room].filter((part) => part != null).join(" · ");
    return {
      id: meeting.id,
      weekday: ["日", "月", "火", "水", "木", "金", "土"][meeting.dayOfWeek],
      periodText: meeting.periodCount > 1
        ? `${meeting.startPeriodIndex}–${meeting.startPeriodIndex + meeting.periodCount - 1}限`
        : `${meeting.startPeriodIndex}限`,
      courseName: course?.name ?? "授業",
      detail: detail || null,
    };
  });
}
