import type { DaySlotDto } from "@atender/shared";

export function currentPeriodIndex(daySlots: DaySlotDto[], nowMinute: number): number | null {
  return [...daySlots].sort((a, b) => a.periodIndex - b.periodIndex)
    .find((slot) => slot.startMinute <= nowMinute && nowMinute < slot.endMinute)?.periodIndex ?? null;
}
