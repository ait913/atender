import type { CSSProperties } from "react";

type Props = {
  periodIndex: number;
  startMinute: number;
  endMinute: number;
  style?: CSSProperties;
};

function formatTime(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function PeriodLabel({ periodIndex, startMinute, endMinute, style }: Props) {
  return (
    <div className="bg-bg-muted border-r border-b border-border-subtle flex flex-col items-center justify-center gap-1 px-0.5 py-2 overflow-hidden" style={style}>
      <span className="text-sm font-bold text-fg-primary leading-none">{periodIndex}限</span>
      <span className="text-[9px] font-normal text-fg-tertiary leading-tight tabular-nums tracking-tight text-center whitespace-nowrap">
        {formatTime(startMinute)}<br />-<br />{formatTime(endMinute)}
      </span>
    </div>
  );
}
