// §9 X. JST 展開 (expandBetweenJst / shiftRRuleUntil)
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §4.3 / §9 X1-X8
import { describe, expect, it } from "vitest";
import {
  JST_OFFSET_MS,
  expandBetween,
  expandBetweenJst,
  shiftRRuleUntil,
  type RRuleParts,
} from "../src/lib/rruleExpand";

const JST = 9 * 60 * 60 * 1000;

/** UTC instant を JST 暦の "YYYY-MM-DD HH:mm" にする (アサート表示用) */
function jstLabel(d: Date): string {
  return new Date(d.getTime() + JST).toISOString().slice(0, 16).replace("T", " ");
}

function parts(over: Partial<RRuleParts> & { rrule: string; dtstart: Date }): RRuleParts {
  return { exDates: [], rDates: [], ...over };
}

describe("§9 X. JST 展開", () => {
  it("[X1] 終日 + 週次 (JST 00:00 起点) は JST 月曜に展開される", () => {
    const p = parts({
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      dtstart: new Date("2026-07-19T15:00:00.000Z"), // JST 2026-07-20 (月) 00:00
    });
    const from = new Date("2026-07-19T15:00:00.000Z"); // JST 07-20 00:00
    const to = new Date("2026-08-16T14:59:59.999Z"); // JST 08-16 23:59:59.999

    const got = expandBetweenJst(p, from, to);

    expect(got.map(jstLabel)).toEqual([
      "2026-07-20 00:00",
      "2026-07-27 00:00",
      "2026-08-03 00:00",
      "2026-08-10 00:00",
    ]);
  });

  it("[X1 負の対照] expandBetween (UTC 版) は同じ入力で JST 火曜を返す", () => {
    const p = parts({
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      dtstart: new Date("2026-07-19T15:00:00.000Z"),
    });
    const from = new Date("2026-07-19T15:00:00.000Z");
    const to = new Date("2026-08-16T14:59:59.999Z");

    const utc = expandBetween(p, from, to).map(jstLabel);
    const jst = expandBetweenJst(p, from, to).map(jstLabel);

    // UTC 版は 1 日ずれる (B6) — 修正が効いていることの証拠
    expect(utc).not.toEqual(jst);
    expect(utc.every((label) => label.endsWith("00:00"))).toBe(true);
    for (const label of utc) {
      const day = new Date(`${label.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
      expect(day).toBe(2); // 火曜
    }
  });

  it("[X2] 危険窓 (JST 07:00) + 週次", () => {
    const p = parts({
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      dtstart: new Date("2026-07-19T22:00:00.000Z"), // JST 2026-07-20 (月) 07:00
    });
    const got = expandBetweenJst(p, new Date("2026-07-19T15:00:00.000Z"), new Date("2026-08-16T14:59:59.999Z"));

    expect(got.map(jstLabel)).toEqual([
      "2026-07-20 07:00",
      "2026-07-27 07:00",
      "2026-08-03 07:00",
      "2026-08-10 07:00",
    ]);
  });

  it("[X3] 安全帯 (JST 13:00) は UTC 版と同じ結果 = 回帰していない", () => {
    const p = parts({
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      dtstart: new Date("2026-07-20T04:00:00.000Z"), // JST 2026-07-20 (月) 13:00
    });
    const from = new Date("2026-07-19T15:00:00.000Z");
    const to = new Date("2026-08-16T14:59:59.999Z");

    const jst = expandBetweenJst(p, from, to).map(jstLabel);
    const utc = expandBetween(p, from, to).map(jstLabel);

    expect(jst).toEqual([
      "2026-07-20 13:00",
      "2026-07-27 13:00",
      "2026-08-03 13:00",
      "2026-08-10 13:00",
    ]);
    expect(jst).toEqual(utc);
  });

  it("[X4] UNTIL は JST の当日 23:59:59 まで含む", () => {
    const p = parts({
      rrule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260803T145959Z", // JST 2026-08-03 23:59:59
      dtstart: new Date("2026-07-19T15:00:00.000Z"),
    });
    const got = expandBetweenJst(p, new Date("2026-07-19T15:00:00.000Z"), new Date("2026-08-16T14:59:59.999Z"));

    expect(got.map(jstLabel)).toEqual(["2026-07-20 00:00", "2026-07-27 00:00", "2026-08-03 00:00"]);
  });

  it("[X5] shiftRRuleUntil は UNTIL だけをずらす", () => {
    expect(shiftRRuleUntil("FREQ=WEEKLY;UNTIL=20261231T145959Z", 9 * 3600_000)).toBe(
      "FREQ=WEEKLY;UNTIL=20261231T235959Z",
    );
    expect(shiftRRuleUntil("FREQ=WEEKLY;BYDAY=MO", 9 * 3600_000)).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(JST_OFFSET_MS).toBe(9 * 3600_000);
  });

  it("[X6] 月次 (BYMONTHDAY=1, 終日) は各月 1 日の JST 00:00", () => {
    const p = parts({
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      dtstart: new Date("2026-06-30T15:00:00.000Z"), // JST 2026-07-01 00:00
    });
    const got = expandBetweenJst(p, new Date("2026-06-30T15:00:00.000Z"), new Date("2026-09-30T14:59:59.999Z"));

    expect(got.map(jstLabel)).toEqual(["2026-07-01 00:00", "2026-08-01 00:00", "2026-09-01 00:00"]);
  });

  it("[X7] EXDATE は保存されている実 UTC instant で一致し、その回が落ちる", () => {
    const p = parts({
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      dtstart: new Date("2026-07-19T15:00:00.000Z"),
      exDates: [new Date("2026-07-26T15:00:00.000Z")], // JST 2026-07-27 00:00
    });
    const got = expandBetweenJst(p, new Date("2026-07-19T15:00:00.000Z"), new Date("2026-08-16T14:59:59.999Z"));

    expect(got.map(jstLabel)).toEqual(["2026-07-20 00:00", "2026-08-03 00:00", "2026-08-10 00:00"]);
  });

  it("[X8] 366 日を超える範囲は RANGE_TOO_LARGE で throw", () => {
    const p = parts({
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      dtstart: new Date("2026-07-19T15:00:00.000Z"),
    });
    let thrown: unknown;
    try {
      expandBetweenJst(p, new Date("2026-01-01T00:00:00.000Z"), new Date("2027-06-01T00:00:00.000Z"));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as { code?: string }).code ?? String(thrown)).toContain("RANGE_TOO_LARGE");
  });
});
