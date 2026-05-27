export type WithLane<T> = T & { lane: number; laneCount: number };

export function assignLanes<E extends { startMinute: number; endMinute: number }>(
  events: E[],
): Array<WithLane<E>> {
  const sorted = [...events]
    .filter((event) => event.endMinute > event.startMinute)
    .sort((a, b) => (a.startMinute === b.startMinute ? a.endMinute - b.endMinute : a.startMinute - b.startMinute));

  const clusters: E[][] = [];
  let cluster: E[] = [];
  let clusterEnd = -Infinity;

  for (const event of sorted) {
    if (event.startMinute >= clusterEnd) {
      if (cluster.length > 0) clusters.push(cluster);
      cluster = [event];
      clusterEnd = event.endMinute;
    } else {
      cluster.push(event);
      clusterEnd = Math.max(clusterEnd, event.endMinute);
    }
  }
  if (cluster.length > 0) clusters.push(cluster);

  const out: Array<WithLane<E>> = [];
  for (const current of clusters) {
    const lanes: number[] = [];
    const eventLane = new Map<E, number>();
    for (const event of current) {
      let placed = -1;
      for (let i = 0; i < lanes.length; i += 1) {
        if (lanes[i] <= event.startMinute) {
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        placed = lanes.length;
        lanes.push(event.endMinute);
      } else {
        lanes[placed] = event.endMinute;
      }
      eventLane.set(event, placed);
    }
    const laneCount = lanes.length;
    for (const event of current) {
      out.push({ ...event, lane: eventLane.get(event) ?? 0, laneCount });
    }
  }
  return out;
}
