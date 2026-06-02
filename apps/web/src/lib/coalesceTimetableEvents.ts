import type { TimetableEventInput } from "@/components/timetable/TimetableView";

/**
 * 同一 (dayOfWeek, mergeKey) かつ period が隣接する event を 1 ブロックに結合する。
 * mergeKey が未指定の event は結合対象外 (そのまま通す)。
 * 入力順は保持しないが、出力は (dayOfWeek asc, startPeriodIndex asc) で安定ソートする。
 */
export function coalesceTimetableEvents(
  events: TimetableEventInput[],
): TimetableEventInput[] {
  const passThrough: Array<{ event: TimetableEventInput; order: number }> = [];
  const groups = new Map<string, Array<{ event: TimetableEventInput; order: number }>>();

  events.forEach((event, order) => {
    if (event.mergeKey == null) {
      passThrough.push({ event, order });
      return;
    }
    const key = `${event.dayOfWeek}:${event.mergeKey}`;
    const list = groups.get(key) ?? [];
    list.push({ event, order });
    groups.set(key, list);
  });

  const merged: Array<{ event: TimetableEventInput; order: number }> = [...passThrough];

  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => {
      if (a.event.startPeriodIndex !== b.event.startPeriodIndex) {
        return a.event.startPeriodIndex - b.event.startPeriodIndex;
      }
      return a.order - b.order;
    });
    let current: { event: TimetableEventInput; order: number } | null = null;

    for (const item of sorted) {
      if (!current) {
        current = { event: { ...item.event }, order: item.order };
        continue;
      }

      const currentEnd = current.event.startPeriodIndex + current.event.periodCount;
      if (item.event.startPeriodIndex === currentEnd) {
        current.event = {
          ...current.event,
          periodCount: current.event.periodCount + item.event.periodCount,
        };
        continue;
      }

      merged.push(current);
      current = { event: { ...item.event }, order: item.order };
    }

    if (current) merged.push(current);
  }

  return merged
    .sort((a, b) => {
      if (a.event.dayOfWeek !== b.event.dayOfWeek) return a.event.dayOfWeek - b.event.dayOfWeek;
      if (a.event.startPeriodIndex !== b.event.startPeriodIndex) {
        return a.event.startPeriodIndex - b.event.startPeriodIndex;
      }
      return a.order - b.order;
    })
    .map((item) => item.event);
}
