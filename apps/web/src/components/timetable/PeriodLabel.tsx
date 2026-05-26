import type { DaySlotDto } from "@atender/shared";
import { minutesToTime } from "@/components/ui";

export function PeriodLabel({ slot }: { slot: DaySlotDto }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <span className="text-base font-semibold">{slot.periodIndex}</span>
      <span className="text-[10px] text-fg-tertiary">{minutesToTime(slot.startMinute)}-{minutesToTime(slot.endMinute)}</span>
    </div>
  );
}
