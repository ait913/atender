import type { Dayjs } from "dayjs";

export type CalendarViewMode = "day" | "week" | "month";

function mondayOf(date: Dayjs) {
  const day = date.day();
  return date.startOf("day").subtract(day === 0 ? 6 : day - 1, "day");
}

export function weekStartsFor(viewMode: CalendarViewMode, anchor: Dayjs): string[] {
  if (viewMode === "day" || viewMode === "week") {
    return [mondayOf(anchor).format("YYYY-MM-DD")];
  }

  const firstWeekStart = mondayOf(anchor.startOf("month"));
  const monthEnd = anchor.endOf("month");
  const lastWeekStart = monthEnd.day() === 0 ? mondayOf(monthEnd.add(1, "day")) : mondayOf(monthEnd);
  const results: string[] = [];
  let cursor = firstWeekStart;
  while (cursor.isBefore(lastWeekStart) || cursor.isSame(lastWeekStart, "day")) {
    results.push(cursor.format("YYYY-MM-DD"));
    cursor = cursor.add(1, "week");
  }
  return results;
}
