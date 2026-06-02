import { coalesceTimetableEvents } from "@/lib/coalesceTimetableEvents";

type Event = {
  id: string;
  title: string;
  dayOfWeek: number;
  startPeriodIndex: number;
  periodCount: number;
  color?: string;
  subtitle?: string;
  mergeKey?: string;
};

function event(overrides: Partial<Event>): Event {
  return {
    id: overrides.id ?? `${overrides.dayOfWeek ?? 1}-${overrides.startPeriodIndex ?? 1}`,
    title: overrides.title ?? "数学",
    dayOfWeek: overrides.dayOfWeek ?? 1,
    startPeriodIndex: overrides.startPeriodIndex ?? 1,
    periodCount: overrides.periodCount ?? 1,
    color: overrides.color ?? "#10b981",
    subtitle: overrides.subtitle,
    mergeKey: overrides.mergeKey,
  };
}

describe("coalesceTimetableEvents", () => {
  it("returns an empty array for an empty input", () => {
    expect(coalesceTimetableEvents([] as any)).toEqual([]);
  });

  it("keeps a single mergeable event unchanged", () => {
    const input = event({ id: "m1", mergeKey: "c1" });

    expect(coalesceTimetableEvents([input] as any)).toEqual([input]);
  });

  it("merges adjacent periods with the same day and mergeKey", () => {
    const result = coalesceTimetableEvents([
      event({ id: "m1", dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1, mergeKey: "c1" }),
      event({ id: "m2", dayOfWeek: 1, startPeriodIndex: 2, periodCount: 1, mergeKey: "c1" }),
    ] as any);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "m1",
      dayOfWeek: 1,
      startPeriodIndex: 1,
      periodCount: 2,
      mergeKey: "c1",
    });
  });

  it("does not merge non-adjacent periods", () => {
    const result = coalesceTimetableEvents([
      event({ id: "m1", startPeriodIndex: 1, mergeKey: "c1" }),
      event({ id: "m3", startPeriodIndex: 3, mergeKey: "c1" }),
    ] as any);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(["m1", "m3"]);
  });

  it("merges when the next period starts at the previous block end", () => {
    const result = coalesceTimetableEvents([
      event({ id: "m1", startPeriodIndex: 1, periodCount: 2, mergeKey: "c1" }),
      event({ id: "m3", startPeriodIndex: 3, periodCount: 1, mergeKey: "c1" }),
    ] as any);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "m1",
      startPeriodIndex: 1,
      periodCount: 3,
    });
  });

  it("does not merge across different days", () => {
    const result = coalesceTimetableEvents([
      event({ id: "mon", dayOfWeek: 1, startPeriodIndex: 1, mergeKey: "c1" }),
      event({ id: "tue", dayOfWeek: 2, startPeriodIndex: 2, mergeKey: "c1" }),
    ] as any);

    expect(result).toHaveLength(2);
  });

  it("does not merge different mergeKeys", () => {
    const result = coalesceTimetableEvents([
      event({ id: "c1", startPeriodIndex: 1, mergeKey: "c1" }),
      event({ id: "c2", startPeriodIndex: 2, mergeKey: "c2" }),
    ] as any);

    expect(result).toHaveLength(2);
  });

  it("passes through events without mergeKey without merging them", () => {
    const result = coalesceTimetableEvents([
      event({ id: "a", startPeriodIndex: 1 }),
      event({ id: "b", startPeriodIndex: 2 }),
    ] as any);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("keeps the first event id after merging", () => {
    const result = coalesceTimetableEvents([
      event({ id: "second", startPeriodIndex: 2, mergeKey: "c1" }),
      event({ id: "first", startPeriodIndex: 1, mergeKey: "c1" }),
    ] as any);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("first");
  });

  it("sorts output by dayOfWeek and startPeriodIndex", () => {
    const result = coalesceTimetableEvents([
      event({ id: "fri-3", dayOfWeek: 5, startPeriodIndex: 3, mergeKey: "c5" }),
      event({ id: "mon-2", dayOfWeek: 1, startPeriodIndex: 2, mergeKey: "c1" }),
      event({ id: "mon-1", dayOfWeek: 1, startPeriodIndex: 1, mergeKey: "c0" }),
      event({ id: "wed-1", dayOfWeek: 3, startPeriodIndex: 1 }),
    ] as any);

    expect(result.map((e) => e.id)).toEqual(["mon-1", "mon-2", "wed-1", "fri-3"]);
  });
});
