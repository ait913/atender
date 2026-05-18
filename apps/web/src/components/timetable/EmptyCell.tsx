import type { CSSProperties } from "react";
import { Plus } from "lucide-react";

export function EmptyCell({ onClick, day, periodIndex, style }: { onClick: () => void; day: string; periodIndex: number; style?: CSSProperties }) {
  return (
    <button
      type="button"
      className="group bg-bg-base hover:bg-bg-muted border-r border-b border-border-subtle p-2 transition flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-500"
      style={style}
      onClick={onClick}
      aria-label={`${day}曜 ${periodIndex}限 に授業を追加`}
    >
      <Plus className="w-4 h-4 text-fg-tertiary opacity-0 group-hover:opacity-60 transition-opacity" aria-hidden />
    </button>
  );
}
