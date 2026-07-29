/**
 * Reviewer blind tests — .designs/20260729-semester-calendar-multi-status.md §5.2〜§5.7
 * ケース ID (D1〜D30 / M1〜M7 / B1〜B8) は設計doc と 1:1。iOS 側 (SemesterMultiStatusReviewTests.swift)
 * と同じ ID・同じ入力・同じ期待値を持つこと (§6.2)。
 */
import { describe, expect, it } from "vitest";
import type { AttendanceDaySummary } from "@atender/shared";
import {
  DAY_MARK_ORDER,
  dayBackground,
  dayGlyphs,
  dayVisual,
  type DayMark,
  type DayMarkKind,
} from "@/lib/dayStatusVisual";

type Counts = {
  present: number;
  absent: number;
  excused: number;
  tardy: number;
  earlyLeave: number;
  suspended: number;
  unrecorded: number;
};

/** (p, a, e, t, el, s, u) — 設計doc §5.2 の表の並び */
function counts(p: number, a: number, e: number, t: number, el: number, s: number, u: number): Counts {
  return { present: p, absent: a, excused: e, tardy: t, earlyLeave: el, suspended: s, unrecorded: u };
}

function summaryWithCounts(c: Counts, status: AttendanceDaySummary["status"] = "ALL_PRESENT"): AttendanceDaySummary {
  const total = c.present + c.absent + c.excused + c.tardy + c.earlyLeave + c.suspended + c.unrecorded;
  return { date: "2026-06-11", status, occurrenceCount: total, counts: c } as AttendanceDaySummary;
}

/** counts を持たない旧 API のレスポンス (§4.4) */
function legacySummary(status: string): AttendanceDaySummary {
  return { date: "2026-06-11", status, occurrenceCount: 1 } as unknown as AttendanceDaySummary;
}

function shape(marks: DayMark[]): Array<[DayMarkKind, number]> {
  return marks.map((m) => [m.kind, m.count]);
}

describe("dayVisual — 過去日 counts あり (§5.2)", () => {
  const cases: Array<[string, Counts, Array<[DayMarkKind, number]>, boolean]> = [
    ["D1", counts(2, 0, 0, 0, 0, 0, 0), [["present", 2]], false],
    ["D2", counts(3, 1, 0, 0, 0, 0, 0), [["absent", 1], ["present", 3]], false],
    ["D3", counts(2, 0, 1, 0, 0, 0, 0), [["excused", 1], ["present", 2]], false],
    ["D4", counts(1, 0, 0, 1, 1, 0, 0), [["tardy", 2], ["present", 1]], false],
    ["D5", counts(0, 0, 0, 0, 0, 2, 0), [["suspended", 2]], false],
    ["D6", counts(0, 0, 0, 0, 0, 0, 3), [["unrecorded", 3]], true],
    ["D7", counts(1, 0, 0, 0, 0, 0, 2), [["present", 1], ["unrecorded", 2]], true],
    ["D8", counts(0, 0, 0, 0, 0, 0, 0), [], false],
    [
      "D9",
      counts(1, 1, 1, 1, 0, 1, 0),
      [["absent", 1], ["excused", 1], ["tardy", 1], ["suspended", 1], ["present", 1]],
      false,
    ],
    ["D10", counts(0, 0, 2, 0, 0, 0, 1), [["excused", 2], ["unrecorded", 1]], true],
  ];

  for (const [id, c, expected, dashed] of cases) {
    it(`[${id}] past counts -> marks/dashed`, () => {
      const v = dayVisual(summaryWithCounts(c), { future: false });
      expect(shape(v.marks)).toEqual(expected);
      expect(v.dashed).toBe(dashed);
    });
  }
});

describe("dayVisual — 未来日 counts あり (§5.3)", () => {
  const cases: Array<[string, Counts, Array<[DayMarkKind, number]>, boolean]> = [
    ["D11", counts(0, 0, 0, 0, 0, 0, 2), [], false],
    ["D12", counts(0, 0, 1, 0, 0, 0, 1), [["excused", 1]], false],
    ["D13", counts(0, 0, 0, 0, 0, 1, 0), [["suspended", 1]], false],
    ["D14", counts(0, 1, 0, 0, 0, 0, 1), [["absent", 1]], false],
    ["D15", counts(2, 0, 0, 0, 0, 0, 0), [["present", 2]], false],
    ["D16", counts(0, 0, 0, 0, 0, 0, 0), [], false],
  ];

  for (const [id, c, expected, dashed] of cases) {
    it(`[${id}] future counts -> marks/dashed`, () => {
      const v = dayVisual(summaryWithCounts(c), { future: true });
      expect(shape(v.marks)).toEqual(expected);
      expect(v.dashed).toBe(dashed);
    });
  }
});

describe("dayVisual — legacy 経路 (counts なし) (§5.4)", () => {
  const cases: Array<[string, string, boolean, Array<[DayMarkKind, number]>, boolean]> = [
    ["D17", "ALL_PRESENT", false, [["present", 1]], false],
    ["D18", "HAS_ABSENT", false, [["absent", 1]], false],
    ["D19", "HAS_TARDY", false, [["tardy", 1]], false],
    ["D20", "ALL_SUSPENDED", false, [["suspended", 1]], false],
    ["D21", "PARTIAL_UNRECORDED", false, [["unrecorded", 1]], true],
    ["D22", "NO_CLASS", false, [], false],
    ["D23", "ALL_PRESENT", true, [], false],
    ["D24", "HAS_ABSENT", true, [], false],
    ["D25", "PARTIAL_UNRECORDED", true, [], false],
    ["D26", "ALL_SUSPENDED", true, [["suspended", 1]], false],
    ["D27", "SOMETHING_UNKNOWN", false, [], false],
  ];

  for (const [id, status, future, expected, dashed] of cases) {
    it(`[${id}] legacy ${status} future=${future}`, () => {
      const v = dayVisual(legacySummary(status), { future });
      expect(shape(v.marks)).toEqual(expected);
      expect(v.dashed).toBe(dashed);
    });
  }
});

describe("dayVisual — 異常系 (§5.5)", () => {
  it("[D28] summary が undefined なら空", () => {
    const v = dayVisual(undefined);
    expect(v.marks).toEqual([]);
    expect(v.dashed).toBe(false);
  });

  it("[D29] counts 全 0 だが occurrenceCount=3 (サーバ不整合) でも空", () => {
    const s = {
      date: "2026-06-11",
      status: "PARTIAL_UNRECORDED",
      occurrenceCount: 3,
      counts: counts(0, 0, 0, 0, 0, 0, 0),
    } as AttendanceDaySummary;
    const v = dayVisual(s, { future: false });
    expect(v.marks).toEqual([]);
    expect(v.dashed).toBe(false);
  });

  it("[D30] 負値の kind は marks に含めない", () => {
    const s = summaryWithCounts(counts(1, -2, 0, 0, 0, 0, -1));
    const v = dayVisual(s, { future: false });
    expect(shape(v.marks)).toEqual([["present", 1]]);
    expect(v.dashed).toBe(false);
  });
});

describe("マークの属性 (§5.6)", () => {
  function markOf(kind: DayMarkKind): DayMark {
    const table: Record<DayMarkKind, Counts> = {
      absent: counts(0, 1, 0, 0, 0, 0, 0),
      excused: counts(0, 0, 1, 0, 0, 0, 0),
      tardy: counts(0, 0, 0, 1, 0, 0, 0),
      suspended: counts(0, 0, 0, 0, 0, 1, 0),
      present: counts(1, 0, 0, 0, 0, 0, 0),
      unrecorded: counts(0, 0, 0, 0, 0, 0, 1),
    };
    const marks = dayVisual(summaryWithCounts(table[kind]), { future: false }).marks;
    expect(marks).toHaveLength(1);
    return marks[0];
  }

  const attrs: Array<[string, DayMarkKind, string, string, string, string]> = [
    // id, kind, icon, iconColor token, tint token, tint 比
    ["M1", "absent", "x", "--color-status-absent", "--color-status-absent", "26%"],
    ["M2", "excused", "excused", "--color-status-excused", "--color-status-excused", "22%"],
    ["M3", "tardy", "clock", "--color-status-tardy", "--color-status-tardy", "24%"],
    ["M4", "suspended", "ban", "--color-status-suspended", "--color-status-suspended", "20%"],
    ["M5", "present", "check", "--color-status-present", "--color-status-present", "20%"],
    ["M6", "unrecorded", "minus", "--color-fg-tertiary", "--color-status-none", "12%"],
  ];

  for (const [id, kind, icon, iconToken, tintToken, ratio] of attrs) {
    it(`[${id}] ${kind} の icon / iconColor / tint / tint 比`, () => {
      const m = markOf(kind);
      expect(m.icon).toBe(icon);
      expect(m.iconColor).toContain(iconToken);
      expect(m.tint).toContain(tintToken);
      expect(m.tint).toContain(ratio);
    });
  }

  it("[M7] DAY_MARK_ORDER が severity 順と完全一致 (iOS Kind.allCases と同一)", () => {
    expect([...DAY_MARK_ORDER]).toEqual(["absent", "excused", "tardy", "suspended", "present", "unrecorded"]);
  });
});

describe("背景 / グリフの導出 (§5.7)", () => {
  const mixed = dayVisual(summaryWithCounts(counts(3, 1, 0, 0, 0, 0, 0)), { future: false }).marks;
  const presentOnly = dayVisual(summaryWithCounts(counts(2, 0, 0, 0, 0, 0, 0)), { future: false }).marks;
  const five = dayVisual(summaryWithCounts(counts(1, 1, 1, 1, 0, 1, 0)), { future: false }).marks;

  it("[B3] marks が空なら dayBackground は空文字", () => {
    expect(dayBackground([])).toBe("");
  });

  it("[B4] absent×1 + present×3 の背景は linear-gradient で両トークンと 25% 境界を含む", () => {
    const bg = dayBackground(mixed);
    expect(bg.startsWith("linear-gradient(90deg, ")).toBe(true);
    expect(bg).toContain("--color-status-absent");
    expect(bg).toContain("--color-status-present");
    expect(bg).toContain("25%");
  });

  it("[B5] present×2 の背景は present トークンのみ", () => {
    const bg = dayBackground(presentOnly);
    expect(bg).toContain("--color-status-present");
    expect(bg).not.toContain("--color-status-absent");
  });

  it("[B6] marks が 3 件以上なら dayGlyphs は先頭 2 件のみ (severity 順)", () => {
    expect(five.length).toBeGreaterThanOrEqual(3);
    const g = dayGlyphs(five);
    expect(g).toHaveLength(2);
    expect(g.map((m) => m.kind)).toEqual(["absent", "excused"]);
  });

  it("[B7] marks が 1 件なら dayGlyphs は 1 件", () => {
    expect(dayGlyphs(presentOnly)).toHaveLength(1);
  });

  it("[B8] marks が 0 件なら dayGlyphs は空", () => {
    expect(dayGlyphs([])).toEqual([]);
  });
});
