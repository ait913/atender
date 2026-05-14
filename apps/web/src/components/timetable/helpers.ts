import type { DaySlotDto } from "@atender/shared";

export const weekdays = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
];

export const coursePalette = ["#10B981", "#3B82F6", "#F59E0B", "#A855F7", "#E5535B", "#14B8A6", "#6366F1", "#9CA3AF"];

export function defaultDaySlots(count: number): DaySlotDto[] {
  return Array.from({ length: count }, (_, index) => {
    const startMinute = 9 * 60 + index * 100;
    return {
      id: `slot-${index + 1}`,
      periodIndex: index + 1,
      label: `${index + 1}限`,
      startMinute,
      endMinute: startMinute + 90,
      isBreak: false,
    };
  });
}
