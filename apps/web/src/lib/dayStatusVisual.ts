import type { AttendanceDaySummary } from "@atender/shared";

export function statusVisual(status: AttendanceDaySummary["status"] | undefined): {
  bg: string;
  marker: string;
  markerColor: string;
} {
  if (status === "ALL_PRESENT") {
    return {
      bg: "color-mix(in srgb, var(--color-status-present) 12%, var(--color-bg-elevated))",
      marker: "○",
      markerColor: "var(--color-status-present)",
    };
  }
  if (status === "HAS_ABSENT") {
    return {
      bg: "color-mix(in srgb, var(--color-status-absent) 16%, var(--color-bg-elevated))",
      marker: "×",
      markerColor: "var(--color-status-absent)",
    };
  }
  if (status === "HAS_TARDY") {
    return {
      bg: "color-mix(in srgb, var(--color-status-tardy) 16%, var(--color-bg-elevated))",
      marker: "△",
      markerColor: "var(--color-status-tardy)",
    };
  }
  if (status === "ALL_SUSPENDED") {
    return {
      bg: "color-mix(in srgb, var(--color-status-cancelled) 14%, var(--color-bg-elevated))",
      marker: "／",
      markerColor: "var(--color-status-cancelled)",
    };
  }
  if (status === "PARTIAL_UNRECORDED") {
    return {
      bg: "color-mix(in srgb, var(--color-status-none) 10%, var(--color-bg-elevated))",
      marker: "·",
      markerColor: "var(--color-status-none)",
    };
  }
  return { bg: "", marker: "", markerColor: "var(--color-status-none)" };
}
