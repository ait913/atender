import type { AttendanceStatus } from "@atender/shared";
import { cx } from "@/components/ui/cx";

export const statusLabels: Record<AttendanceStatus, string> = {
  PRESENT: "出席",
  ABSENT: "欠席",
  EXCUSED: "公欠",
  TARDY: "遅刻",
  EARLY_LEAVE: "早退",
  CANCELLED: "休講",
};

const styles: Record<AttendanceStatus | "NONE", string> = {
  PRESENT: "bg-emerald-50 text-status-present",
  ABSENT: "bg-red-50 text-status-absent",
  EXCUSED: "bg-blue-50 text-status-excused",
  TARDY: "bg-amber-50 text-status-tardy",
  EARLY_LEAVE: "bg-purple-50 text-status-early",
  CANCELLED: "bg-gray-100 text-fg-secondary",
  NONE: "bg-gray-100 text-fg-secondary",
};

export function StatusChip({
  status,
  label,
  onTap,
  size = "md",
}: {
  status: AttendanceStatus | null;
  label?: string;
  onTap?: () => void;
  size?: "sm" | "md";
}) {
  const body = `${label ? `${label}: ` : ""}${status ? statusLabels[status] : "未記録"}`;
  const className = cx(
    "inline-flex items-center justify-center rounded-full font-semibold",
    size === "sm" ? "min-h-7 px-2 text-xs" : "min-h-9 px-3 text-sm",
    styles[status ?? "NONE"],
    onTap && "cursor-pointer",
  );
  if (!onTap) return <span className={className}>{body}</span>;
  return (
    <button type="button" className={className} onClick={onTap}>
      {body}
    </button>
  );
}
