import type { OccurrenceDto } from "@atender/shared";
import { todayString } from "./SchoolClock";

export type TodayState =
  | { kind: "noClass" }
  | { kind: "upcoming"; next: OccurrenceDto }
  | { kind: "inClass"; current: OccurrenceDto; next: OccurrenceDto | null }
  | { kind: "finished"; last: OccurrenceDto };

export function state(occurrences: OccurrenceDto[], nowMinute: number): TodayState {
  if (occurrences.length === 0) return { kind: "noClass" };
  const sorted = [...occurrences].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const current = sorted.find((occ) => occ.startMinute <= nowMinute && nowMinute < occ.endMinute);
  const next = sorted.find((occ) => occ.startMinute > nowMinute) ?? null;
  if (current) return { kind: "inClass", current, next };
  if (next) return { kind: "upcoming", next };
  const last = sorted.sort((a, b) => b.endMinute - a.endMinute || b.startMinute - a.startMinute ||
    (a.id > b.id ? -1 : a.id < b.id ? 1 : 0))[0];
  return { kind: "finished", last };
}

export function isStale(loadedDate: string | null | undefined, now: Date): boolean {
  return !loadedDate || todayString(now) !== loadedDate;
}

function timeText(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export const NowNextText = {
  statusLabel(s: TodayState): string | null {
    switch (s.kind) {
      case "noClass": return null;
      case "upcoming": return "次の授業";
      case "inClass": return "授業中";
      case "finished": return "本日終了";
    }
  },
  title(s: TodayState): string | null {
    if (s.kind === "noClass") return null;
    if (s.kind === "finished") return "今日の授業は終わりました";
    const occ = s.kind === "upcoming" ? s.next : s.current;
    return `${occ.periodIndex}限 ${occ.courseName}`;
  },
  detail(s: TodayState): string | null {
    if (s.kind === "noClass" || s.kind === "finished") return null;
    const occ = s.kind === "upcoming" ? s.next : s.current;
    const time = s.kind === "upcoming" ? timeText(occ.startMinute) : `${timeText(occ.startMinute)}–${timeText(occ.endMinute)}`;
    return time + (occ.room ? ` · ${occ.room}` : "");
  },
};

export function unrecordedCount(occurrences: OccurrenceDto[]): number {
  return occurrences.filter((occ) => occ.status == null).length;
}

export const HomeAttendance = {
  DRAG_THRESHOLD: 40 as const,
  isActive(occ: OccurrenceDto[]): boolean {
    return occ.length > 0;
  },
  defaultExpanded(occ: OccurrenceDto[]): boolean {
    return occ.length > 0 && unrecordedCount(occ) > 0;
  },
  shouldCollapse(dy: number, dx: number): boolean {
    return Math.abs(dy) > Math.abs(dx) && dy > 40;
  },
  shouldExpand(dy: number, dx: number): boolean {
    return Math.abs(dy) > Math.abs(dx) && dy < -40;
  },
};
