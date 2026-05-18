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
    <div className="bg-bg-muted border-r border-b border-border-subtle grid place-items-center gap-0.5 px-1" style={style}>
      <span className="text-base font-semibold text-fg-primary leading-none">{periodIndex}限</span>
      <span className="text-[10px] font-normal text-fg-tertiary leading-none tabular-nums">
        {formatTime(startMinute)}-{formatTime(endMinute)}
      </span>
    </div>
  );
}
