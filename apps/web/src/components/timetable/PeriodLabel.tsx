import type { DaySlotDto } from "@atender/shared";
import { minutesToTime } from "@/components/ui";

export function PeriodLabel({ slot, current = false }: { slot: DaySlotDto; current?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-0.5 text-center">
      <span className="text-[12px] font-bold leading-none">{slot.label}</span>
      <span className={`mt-0.5 text-[8px] leading-none tabular-nums ${current ? "text-fg-on-accent" : "text-fg-tertiary"}`}>
        {minutesToTime(slot.startMinute).slice(0, 5)}
      </span>
    </div>
  );
}
