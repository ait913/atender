import type { Dayjs } from "dayjs";

export type CalendarViewMode = "day" | "week" | "month";

function mondayOf(date: Dayjs) {
  const day = date.day();
  return date.startOf("day").subtract(day === 0 ? 6 : day - 1, "day");
}

export type CalendarDateRange = {
  start: string;
  end: string;
};

export function monthGridRange(anchor: Dayjs): CalendarDateRange {
  const gridStart = mondayOf(anchor.startOf("month"));
  const gridEnd = gridStart.add(41, "day");
  return {
    start: gridStart.format("YYYY-MM-DD"),
    end: gridEnd.format("YYYY-MM-DD"),
  };
}

export function weekStartsFor(viewMode: CalendarViewMode, anchor: Dayjs): string[] {
  if (viewMode === "day" || viewMode === "week") {
    return [mondayOf(anchor).format("YYYY-MM-DD")];
  }

  const firstWeekStart = mondayOf(anchor.startOf("month"));
  const lastWeekStart = firstWeekStart.add(5, "week");
  const results: string[] = [];
  let cursor = firstWeekStart;
  while (cursor.isBefore(lastWeekStart) || cursor.isSame(lastWeekStart, "day")) {
    results.push(cursor.format("YYYY-MM-DD"));
    cursor = cursor.add(1, "week");
  }
  return results;
}
