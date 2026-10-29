import type { CourseStatsDto } from "@atender/shared";

export type ActionTone = "absent" | "accent" | "tertiary";

export function requiredRate(stats: CourseStatsDto, fallback: number): number {
  return stats.requiredAttendanceRate ?? fallback;
}

export function courseActionText(stats: CourseStatsDto): string {
  const lessons = stats.allowedAbsenceLessons;
  if (lessons != null) {
    if (lessons < 0) return stats.limitedBy === "rate" ? "下回る見込み" : "欠席上限を超えています";
    if (lessons >= (stats.remainingLessons ?? 0)) return "残り全休OK";
    return `あと${lessons}回休める`;
  }
  const allowed = stats.allowedAbsences;
  if (allowed == null) return "—";
  if (allowed < 0) return "下回る見込み";
  if (allowed >= stats.remainingCount) return "残り全休OK";
  if (stats.allowedAbsenceDays == null) return `あと${allowed}限休める`;
  return `あと${allowed}限 (${stats.allowedAbsenceDays}日) 休める`;
}

export function courseActionTone(stats: CourseStatsDto): ActionTone {
  const allowed = stats.allowedAbsenceLessons ?? stats.allowedAbsences;
  const remaining = stats.allowedAbsenceLessons == null ? stats.remainingCount : stats.remainingLessons ?? 0;
  if (allowed == null) return "tertiary";
  if (allowed < 0) return "absent";
  if (allowed >= remaining) return "accent";
  return "tertiary";
}
