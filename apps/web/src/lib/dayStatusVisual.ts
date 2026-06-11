import type { AttendanceDaySummary } from "@atender/shared";

export type DayVisualIcon = "check" | "x" | "clock" | "ban" | "minus" | null;

export type DayVisual = {
  bg: string;
  icon: DayVisualIcon;
  iconColor: string;
  dashed: boolean;
};

export function statusVisual(
  status: AttendanceDaySummary["status"] | undefined,
  opts: { future?: boolean } = {},
): DayVisual {
  if (opts.future && status !== "ALL_SUSPENDED") {
    return { bg: "", icon: null, iconColor: "var(--color-status-none)", dashed: false };
  }
  if (status === "ALL_PRESENT") {
    return {
      bg: "color-mix(in srgb, var(--color-status-present) 20%, var(--color-bg-elevated))",
      icon: "check",
      iconColor: "var(--color-status-present)",
      dashed: false,
    };
  }
  if (status === "HAS_ABSENT") {
    return {
      bg: "color-mix(in srgb, var(--color-status-absent) 26%, var(--color-bg-elevated))",
      icon: "x",
      iconColor: "var(--color-status-absent)",
      dashed: false,
    };
  }
  if (status === "HAS_TARDY") {
    return {
      bg: "color-mix(in srgb, var(--color-status-tardy) 24%, var(--color-bg-elevated))",
      icon: "clock",
      iconColor: "var(--color-status-tardy)",
      dashed: false,
    };
  }
  if (status === "ALL_SUSPENDED") {
    return {
      bg: "color-mix(in srgb, var(--color-status-suspended) 20%, var(--color-bg-elevated))",
      icon: "ban",
      iconColor: "var(--color-status-suspended)",
      dashed: false,
    };
  }
  if (status === "PARTIAL_UNRECORDED") {
    return {
      bg: "color-mix(in srgb, var(--color-status-none) 12%, var(--color-bg-elevated))",
      icon: "minus",
      iconColor: "var(--color-fg-tertiary)",
      dashed: true,
    };
  }
  return { bg: "", icon: null, iconColor: "var(--color-status-none)", dashed: false };
}
