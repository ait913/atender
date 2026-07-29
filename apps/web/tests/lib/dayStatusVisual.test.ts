import type { AttendanceDaySummary } from "@atender/shared";
import { DAY_MARK_ORDER, dayBackground, dayGlyphs, dayVisual } from "@/lib/dayStatusVisual";

type Counts = AttendanceDaySummary["counts"];

function counts(over: Partial<Counts> = {}): Counts {
  return { present: 0, absent: 0, excused: 0, tardy: 0, earlyLeave: 0, suspended: 0, unrecorded: 0, ...over };
}

function summary(over: Partial<AttendanceDaySummary> = {}): AttendanceDaySummary {
  return {
    date: "2026-06-03",
    status: "ALL_PRESENT",
    occurrenceCount: 0,
    counts: counts(),
    ...over,
  } as AttendanceDaySummary;
}

function kinds(visual: ReturnType<typeof dayVisual>) {
  return visual.marks.map((mark) => [mark.kind, mark.count]);
}

describe("dayVisual", () => {
  it("[M7] declares the severity order shared with iOS", () => {
    expect([...DAY_MARK_ORDER]).toEqual(["absent", "excused", "tardy", "suspended", "present", "unrecorded"]);
  });

  it("[D1] keeps a single-status day as one mark", () => {
    const visual = dayVisual(summary({ occurrenceCount: 2, counts: counts({ present: 2 }) }));

    expect(kinds(visual)).toEqual([["present", 2]]);
    expect(visual.dashed).toBe(false);
  });

  it("[D2] orders absent before present on a mixed day", () => {
    const visual = dayVisual(summary({ occurrenceCount: 4, counts: counts({ present: 3, absent: 1 }) }));

    expect(kinds(visual)).toEqual([["absent", 1], ["present", 3]]);
    expect(visual.dashed).toBe(false);
  });

  it("[D3] keeps excused separate from present", () => {
    const visual = dayVisual(summary({ occurrenceCount: 3, counts: counts({ present: 2, excused: 1 }) }));

    expect(kinds(visual)).toEqual([["excused", 1], ["present", 2]]);
    expect(visual.marks[0].iconColor).toContain("--color-status-excused");
    expect(visual.marks[0].icon).toBe("excused");
  });

  it("[D4] merges tardy and early leave", () => {
    const visual = dayVisual(summary({ occurrenceCount: 3, counts: counts({ present: 1, tardy: 1, earlyLeave: 1 }) }));

    expect(kinds(visual)).toEqual([["tardy", 2], ["present", 1]]);
  });

  it("[D6] dashes an unrecorded past day", () => {
    const visual = dayVisual(summary({ occurrenceCount: 3, counts: counts({ unrecorded: 3 }) }));

    expect(kinds(visual)).toEqual([["unrecorded", 3]]);
    expect(visual.dashed).toBe(true);
  });

  it("[D9] does not truncate marks", () => {
    const visual = dayVisual(
      summary({ occurrenceCount: 5, counts: counts({ present: 1, absent: 1, excused: 1, tardy: 1, suspended: 1 }) }),
    );

    expect(kinds(visual)).toEqual([["absent", 1], ["excused", 1], ["tardy", 1], ["suspended", 1], ["present", 1]]);
  });

  it("[D11] hides a future day that only has unrecorded occurrences", () => {
    const visual = dayVisual(summary({ occurrenceCount: 2, counts: counts({ unrecorded: 2 }) }), { future: true });

    expect(visual).toEqual({ marks: [], dashed: false });
  });

  it("[D12] keeps a future excused occurrence visible", () => {
    const visual = dayVisual(
      summary({ occurrenceCount: 2, counts: counts({ excused: 1, unrecorded: 1 }) }),
      { future: true },
    );

    expect(kinds(visual)).toEqual([["excused", 1]]);
    expect(visual.dashed).toBe(false);
  });

  it("[D15] keeps future pre-recorded attendance visible", () => {
    const visual = dayVisual(summary({ occurrenceCount: 2, counts: counts({ present: 2 }) }), { future: true });

    expect(kinds(visual)).toEqual([["present", 2]]);
  });

  it("[D29] ignores occurrenceCount when counts are all zero", () => {
    const visual = dayVisual(summary({ occurrenceCount: 3, counts: counts() }));

    expect(visual).toEqual({ marks: [], dashed: false });
  });

  it("[D30] skips negative counts", () => {
    const visual = dayVisual(summary({ occurrenceCount: 0, counts: counts({ absent: -1, present: 1 }) }));

    expect(kinds(visual)).toEqual([["present", 1]]);
  });

  it("[D28] returns an empty visual for a missing summary", () => {
    expect(dayVisual(undefined)).toEqual({ marks: [], dashed: false });
  });
});

describe("dayVisual legacy path (counts missing)", () => {
  function legacy(status: AttendanceDaySummary["status"]) {
    return { date: "2026-06-03", status, occurrenceCount: 1 } as unknown as AttendanceDaySummary;
  }

  it.each([
    ["ALL_PRESENT", "present", false],
    ["HAS_ABSENT", "absent", false],
    ["HAS_TARDY", "tardy", false],
    ["ALL_SUSPENDED", "suspended", false],
    ["PARTIAL_UNRECORDED", "unrecorded", true],
  ] as const)("[D17-D21] maps %s to a single mark", (status, kind, dashed) => {
    const visual = dayVisual(legacy(status));

    expect(kinds(visual)).toEqual([[kind, 1]]);
    expect(visual.dashed).toBe(dashed);
  });

  it("[D22] maps NO_CLASS to nothing", () => {
    expect(dayVisual(legacy("NO_CLASS"))).toEqual({ marks: [], dashed: false });
  });

  it.each(["ALL_PRESENT", "HAS_ABSENT", "PARTIAL_UNRECORDED"] as const)(
    "[D23-D25] suppresses future %s",
    (status) => {
      expect(dayVisual(legacy(status), { future: true })).toEqual({ marks: [], dashed: false });
    },
  );

  it("[D26] keeps future ALL_SUSPENDED", () => {
    expect(kinds(dayVisual(legacy("ALL_SUSPENDED"), { future: true }))).toEqual([["suspended", 1]]);
  });
});

describe("dayBackground / dayGlyphs", () => {
  const mixed = dayVisual(summary({ occurrenceCount: 4, counts: counts({ present: 3, absent: 1 }) })).marks;

  it("[B3] returns an empty background for no marks", () => {
    expect(dayBackground([])).toBe("");
    expect(dayGlyphs([])).toEqual([]);
  });

  it("[B4] splits the background by occurrence share", () => {
    const background = dayBackground(mixed);

    expect(background.startsWith("linear-gradient(90deg, ")).toBe(true);
    expect(background).toContain("--color-status-absent");
    expect(background).toContain("--color-status-present");
    expect(background).toContain("25%");
  });

  it("[B5] paints a single-status day with one token", () => {
    const background = dayBackground(dayVisual(summary({ occurrenceCount: 2, counts: counts({ present: 2 }) })).marks);

    expect(background).toContain("--color-status-present");
    expect(background).not.toContain("--color-status-absent");
  });

  it("[B6] renders at most two glyphs", () => {
    const marks = dayVisual(
      summary({ occurrenceCount: 5, counts: counts({ present: 1, absent: 1, excused: 1, tardy: 1, suspended: 1 }) }),
    ).marks;

    expect(dayGlyphs(marks).map((mark) => mark.kind)).toEqual(["absent", "excused"]);
  });

  it("[B7] renders one glyph for a single mark", () => {
    expect(dayGlyphs(dayVisual(summary({ counts: counts({ present: 1 }) })).marks)).toHaveLength(1);
  });
});
