import type { TimetableEvent } from "./timetableNormalize";
import { assignLanes } from "./calendarLane";

export type LaneEvent = TimetableEvent & { lane: number; laneCount: number };

export function clusterByDay(events: TimetableEvent[]): Map<number, LaneEvent[]> {
  const byDay = new Map<number, TimetableEvent[]>();
  for (const event of events) {
    const list = byDay.get(event.dayOfWeek) ?? [];
    list.push(event);
    byDay.set(event.dayOfWeek, list);
  }

  const result = new Map<number, LaneEvent[]>();
  for (const [day, list] of byDay) {
    result.set(day, assignLanes(list));
  }
  return result;
}
