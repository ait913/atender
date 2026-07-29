// §9 R. buildRRule / parseRRule (packages/shared・純関数)
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §4.1 / §9 R1-R17
import { describe, expect, it } from "vitest";
import { RecurrenceSpec, buildRRule, parseRRule } from "@atender/shared";

type Spec = RecurrenceSpec;

/** 部分 spec を RecurrenceSpec の既定値で埋める (zod の default を通す) */
function spec(partial: Record<string, unknown>): Spec {
  return RecurrenceSpec.parse(partial);
}

// 特記なき DTSTART = 2026-07-23 (木) 09:00 JST
const DTSTART = new Date("2026-07-23T00:00:00.000Z");

describe("§9 R. buildRRule / parseRRule", () => {
  it("[R1] DAILY interval=1 → FREQ=DAILY", () => {
    expect(buildRRule(spec({ freq: "DAILY", interval: 1, end: { kind: "never" } }), DTSTART)).toBe("FREQ=DAILY");
  });

  it("[R2] DAILY interval=3 → FREQ=DAILY;INTERVAL=3", () => {
    expect(buildRRule(spec({ freq: "DAILY", interval: 3 }), DTSTART)).toBe("FREQ=DAILY;INTERVAL=3");
  });

  it("[R3] WEEKLY byDay=[] → DTSTART の JST 曜日 1 個 (BYDAY=TH)", () => {
    expect(buildRRule(spec({ freq: "WEEKLY", interval: 1, byDay: [] }), DTSTART)).toBe("FREQ=WEEKLY;BYDAY=TH");
  });

  it("[R4] 危険窓 (JST 00:30 = 前日 15:30Z) でも JST 曜日で BYDAY=TH", () => {
    const dangerous = new Date("2026-07-22T15:30:00.000Z"); // JST 2026-07-23 (木) 00:30
    expect(buildRRule(spec({ freq: "WEEKLY", byDay: [] }), dangerous)).toBe("FREQ=WEEKLY;BYDAY=TH");
  });

  it("[R5] byDay は MO..SU 順に正規化される", () => {
    expect(buildRRule(spec({ freq: "WEEKLY", byDay: ["FR", "MO", "WE"] }), DTSTART)).toBe(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    );
  });

  it("[R6] WEEKLY interval=2 + 平日 5 個", () => {
    expect(
      buildRRule(spec({ freq: "WEEKLY", interval: 2, byDay: ["MO", "TU", "WE", "TH", "FR"] }), DTSTART),
    ).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR");
  });

  it("[R7] MONTHLY + BYMONTHDAY", () => {
    expect(buildRRule(spec({ freq: "MONTHLY", monthlyMode: "BYMONTHDAY" }), DTSTART)).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=23",
    );
  });

  it("[R8] MONTHLY + BYDAY → 第 4 木曜", () => {
    expect(buildRRule(spec({ freq: "MONTHLY", monthlyMode: "BYDAY" }), DTSTART)).toBe("FREQ=MONTHLY;BYDAY=4TH");
  });

  it("[R9] MONTHLY + BYDAY の第 5 週は -1 (最終)", () => {
    const fifthThursday = new Date("2026-07-30T00:00:00.000Z"); // JST 2026-07-30 (木) 09:00
    expect(buildRRule(spec({ freq: "MONTHLY", monthlyMode: "BYDAY" }), fifthThursday)).toBe(
      "FREQ=MONTHLY;BYDAY=-1TH",
    );
  });

  it("[R10] MONTHLY + monthlyMode=null は BYMONTHDAY 扱い", () => {
    expect(buildRRule(spec({ freq: "MONTHLY", monthlyMode: null }), DTSTART)).toBe("FREQ=MONTHLY;BYMONTHDAY=23");
  });

  it("[R11] YEARLY → BYMONTH + BYMONTHDAY", () => {
    expect(buildRRule(spec({ freq: "YEARLY" }), DTSTART)).toBe("FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=23");
  });

  it("[R12] end.kind=count → COUNT", () => {
    expect(
      buildRRule(spec({ freq: "WEEKLY", interval: 1, byDay: [], end: { kind: "count", count: 10 } }), DTSTART),
    ).toBe("FREQ=WEEKLY;BYDAY=TH;COUNT=10");
  });

  it("[R13] end.kind=until → JST 23:59:59 を UTC ICS 化", () => {
    expect(
      buildRRule(
        spec({ freq: "WEEKLY", interval: 1, byDay: [], end: { kind: "until", date: "2026-12-31" } }),
        DTSTART,
      ),
    ).toBe("FREQ=WEEKLY;BYDAY=TH;UNTIL=20261231T145959Z");
  });

  it("[R14] COUNT と UNTIL は同時に構築できない (discriminated union が date を strip)", () => {
    const parsed = RecurrenceSpec.parse({
      freq: "WEEKLY",
      end: { kind: "count", count: 10, date: "2026-12-31" },
    });
    expect(parsed.end).toEqual({ kind: "count", count: 10 });
    expect(Object.keys(parsed.end)).not.toContain("date");
    const out = buildRRule(parsed, DTSTART);
    expect(out).toContain("COUNT=10");
    expect(out).not.toContain("UNTIL=");
  });

  describe("[R15] 往復 (parseRRule(buildRRule(spec)) == 正規化後の spec)", () => {
    // 注: buildRRule 自身が正規化する (R3 の byDay 補完 / R5 の並べ替え / R10 の null→BYMONTHDAY)
    //     ため「正規化後の spec に戻る」読みで検証する。
    const cases: Array<{ id: string; dtstart: Date; input: Spec; normalized: Spec }> = [
      { id: "R1", dtstart: DTSTART, input: spec({ freq: "DAILY", interval: 1 }), normalized: spec({ freq: "DAILY", interval: 1 }) },
      { id: "R2", dtstart: DTSTART, input: spec({ freq: "DAILY", interval: 3 }), normalized: spec({ freq: "DAILY", interval: 3 }) },
      { id: "R3", dtstart: DTSTART, input: spec({ freq: "WEEKLY", byDay: [] }), normalized: spec({ freq: "WEEKLY", byDay: ["TH"] }) },
      { id: "R4", dtstart: new Date("2026-07-22T15:30:00.000Z"), input: spec({ freq: "WEEKLY", byDay: [] }), normalized: spec({ freq: "WEEKLY", byDay: ["TH"] }) },
      { id: "R5", dtstart: DTSTART, input: spec({ freq: "WEEKLY", byDay: ["FR", "MO", "WE"] }), normalized: spec({ freq: "WEEKLY", byDay: ["MO", "WE", "FR"] }) },
      { id: "R6", dtstart: DTSTART, input: spec({ freq: "WEEKLY", interval: 2, byDay: ["MO", "TU", "WE", "TH", "FR"] }), normalized: spec({ freq: "WEEKLY", interval: 2, byDay: ["MO", "TU", "WE", "TH", "FR"] }) },
      { id: "R7", dtstart: DTSTART, input: spec({ freq: "MONTHLY", monthlyMode: "BYMONTHDAY" }), normalized: spec({ freq: "MONTHLY", monthlyMode: "BYMONTHDAY" }) },
      { id: "R10", dtstart: DTSTART, input: spec({ freq: "MONTHLY", monthlyMode: null }), normalized: spec({ freq: "MONTHLY", monthlyMode: "BYMONTHDAY" }) },
      { id: "R11", dtstart: DTSTART, input: spec({ freq: "YEARLY" }), normalized: spec({ freq: "YEARLY" }) },
      { id: "R12", dtstart: DTSTART, input: spec({ freq: "WEEKLY", byDay: [], end: { kind: "count", count: 10 } }), normalized: spec({ freq: "WEEKLY", byDay: ["TH"], end: { kind: "count", count: 10 } }) },
      { id: "R13", dtstart: DTSTART, input: spec({ freq: "WEEKLY", byDay: [], end: { kind: "until", date: "2026-12-31" } }), normalized: spec({ freq: "WEEKLY", byDay: ["TH"], end: { kind: "until", date: "2026-12-31" } }) },
    ];

    for (const c of cases) {
      it(`[R15/${c.id}] 正規化後の spec に戻る`, () => {
        const out = buildRRule(c.input, c.dtstart);
        const back = parseRRule(out, c.dtstart);
        expect(back).toEqual(c.normalized);
      });

      it(`[R15/${c.id}] 再構築が同じ RRULE を返す (冪等)`, () => {
        const out = buildRRule(c.input, c.dtstart);
        const back = parseRRule(out, c.dtstart);
        expect(back).not.toBeNull();
        expect(buildRRule(back as Spec, c.dtstart)).toBe(out);
      });
    }

    // MONTHLY BYDAY (R8/R9) は byDay の扱いが設計上一意でないため、
    // freq/monthlyMode/interval/end と冪等性で検証する。
    for (const c of [
      { id: "R8", dtstart: DTSTART, out: "FREQ=MONTHLY;BYDAY=4TH" },
      { id: "R9", dtstart: new Date("2026-07-30T00:00:00.000Z"), out: "FREQ=MONTHLY;BYDAY=-1TH" },
    ]) {
      it(`[R15/${c.id}] MONTHLY BYDAY が monthlyMode=BYDAY へ戻り冪等`, () => {
        const back = parseRRule(c.out, c.dtstart);
        expect(back).not.toBeNull();
        expect(back?.freq).toBe("MONTHLY");
        expect(back?.monthlyMode).toBe("BYDAY");
        expect(back?.interval).toBe(1);
        expect(back?.end).toEqual({ kind: "never" });
        expect(buildRRule(back as Spec, c.dtstart)).toBe(c.out);
      });
    }
  });

  it("[R16] 表現できない RRULE は null", () => {
    expect(parseRRule("FREQ=MONTHLY;BYSETPOS=2;BYDAY=MO,TU", DTSTART)).toBeNull();
    expect(parseRRule("FREQ=WEEKLY;BYDAY=MO;WKST=SU", DTSTART)).toBeNull();
    expect(parseRRule("FREQ=MONTHLY;BYMONTHDAY=1,15", DTSTART)).toBeNull();
  });

  it("[R17] 上限: interval 100 / count 731 は safeParse が失敗する", () => {
    expect(RecurrenceSpec.safeParse({ freq: "DAILY", interval: 100 }).success).toBe(false);
    expect(RecurrenceSpec.safeParse({ freq: "DAILY", interval: 99 }).success).toBe(true);
    expect(RecurrenceSpec.safeParse({ freq: "WEEKLY", end: { kind: "count", count: 731 } }).success).toBe(false);
    expect(RecurrenceSpec.safeParse({ freq: "WEEKLY", end: { kind: "count", count: 730 } }).success).toBe(true);
  });
});
