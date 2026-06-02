import type { AttendanceDaySummary } from "@atender/shared";
import type { CalendarEvent } from "./meetingExpansion";

export function eventColor(event: CalendarEvent): string {
  if (event.kind === "meeting") return event.memberColor;
  if (event.kind === "personal") return event.authorColor;
  if (event.source === "GOOGLE_OAUTH") return "#38bdf8";
  if (event.source === "ICS_FILE" || event.source === "ICS_URL") return "#94a3b8";
  return event.authorColor;
}

export function eventTitle(event: CalendarEvent): string {
  if (event.kind === "meeting") return event.courseName;
  return event.title;
}

export function dayStatusColor(status: AttendanceDaySummary["status"]): string {
  if (status === "ALL_PRESENT") return "var(--color-status-present)";
  if (status === "HAS_ABSENT") return "var(--color-status-absent)";
  if (status === "HAS_TARDY") return "var(--color-status-tardy)";
  if (status === "ALL_SUSPENDED") return "var(--color-status-cancelled)";
  return "var(--color-status-none)";
}

export function dayStatusLabel(status: AttendanceDaySummary["status"]): string {
  if (status === "ALL_PRESENT") return "出席";
  if (status === "HAS_ABSENT") return "欠席あり";
  if (status === "HAS_TARDY") return "遅刻・早退あり";
  if (status === "ALL_SUSPENDED") return "休講";
  return "未記録あり";
}
