import type { DaySlotDto } from "@atender/shared";
import { minutesToTime } from "@/components/ui";

export type DayEmptyRowProps = {
  slot: DaySlotDto;
  onClick: () => void;
};

export function DayEmptyRow({ slot, onClick }: DayEmptyRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center justify-between rounded-2xl bg-fg-primary/4 px-5 text-left transition-all duration-150 hover:bg-fg-primary/8 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      aria-label={`${slot.periodIndex}限 空きコマ - 授業を追加`}
    >
      <span className="flex items-center gap-2 text-xs text-fg-tertiary">
        <span className="font-semibold text-fg-secondary">{slot.periodIndex}限</span>
        <span aria-hidden>·</span>
        <span>
          {minutesToTime(slot.startMinute)} - {minutesToTime(slot.endMinute)}
        </span>
      </span>
      <span className="flex items-center gap-1 text-xs text-fg-tertiary">
        <span>空きコマ</span>
        <span aria-hidden>+</span>
      </span>
    </button>
  );
}
