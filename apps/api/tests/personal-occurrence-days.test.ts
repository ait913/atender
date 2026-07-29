// §9 D. occurrenceDays (日分割・純関数)
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §5.3 / §9 D1-D9
import { describe, expect, it } from "vitest";
import { occurrenceDays } from "../src/services/personalEvent.service";

/** JST の "YYYY-MM-DDTHH:mm" を実 UTC instant にする */
function jst(literal: string): Date {
  return new Date(`${literal}:00.000+09:00`);
}

describe("§9 D. occurrenceDays", () => {
  it("[D1] 単日・時刻あり", () => {
    expect(
      occurrenceDays(jst("2026-07-23T09:00"), jst("2026-07-23T10:30"), false, "2026-07-23", "2026-07-23"),
    ).toEqual([{ date: "2026-07-23", startMinute: 540, endMinute: 630 }]);
  });

  it("[D2] 危険窓 (JST 00:30) でも JST 暦の日に割る", () => {
    expect(
      occurrenceDays(jst("2026-07-23T00:30"), jst("2026-07-23T01:00"), false, "2026-07-23", "2026-07-23"),
    ).toEqual([{ date: "2026-07-23", startMinute: 30, endMinute: 60 }]);
  });

  it("[D3] 単日・終日 (排他 end の翌日は含まない)", () => {
    expect(
      occurrenceDays(jst("2026-07-23T00:00"), jst("2026-07-24T00:00"), true, "2026-07-01", "2026-07-31"),
    ).toEqual([{ date: "2026-07-23", startMinute: 0, endMinute: 1440 }]);
  });

  it("[D4] 複数日・終日 → 3 日ぶん、全て 0-1440", () => {
    expect(
      occurrenceDays(jst("2026-07-23T00:00"), jst("2026-07-26T00:00"), true, "2026-07-01", "2026-07-31"),
    ).toEqual([
      { date: "2026-07-23", startMinute: 0, endMinute: 1440 },
      { date: "2026-07-24", startMinute: 0, endMinute: 1440 },
      { date: "2026-07-25", startMinute: 0, endMinute: 1440 },
    ]);
  });

  it("[D5] 複数日・時刻あり", () => {
    expect(
      occurrenceDays(jst("2026-07-23T22:00"), jst("2026-07-25T03:00"), false, "2026-07-01", "2026-07-31"),
    ).toEqual([
      { date: "2026-07-23", startMinute: 1320, endMinute: 1440 },
      { date: "2026-07-24", startMinute: 0, endMinute: 1440 },
      { date: "2026-07-25", startMinute: 0, endMinute: 180 },
    ]);
  });

  it("[D6] 深夜跨ぎで翌 00:00 ちょうどに終わる場合、翌日は含まない", () => {
    expect(
      occurrenceDays(jst("2026-07-23T22:00"), jst("2026-07-24T00:00"), false, "2026-07-01", "2026-07-31"),
    ).toEqual([{ date: "2026-07-23", startMinute: 1320, endMinute: 1440 }]);
  });

  it("[D7] 範囲クリップ (D4 を 7/24 だけで見る)", () => {
    expect(
      occurrenceDays(jst("2026-07-23T00:00"), jst("2026-07-26T00:00"), true, "2026-07-24", "2026-07-24"),
    ).toEqual([{ date: "2026-07-24", startMinute: 0, endMinute: 1440 }]);
  });

  it("[D8] クリップで空になる", () => {
    expect(
      occurrenceDays(jst("2026-07-23T00:00"), jst("2026-07-24T00:00"), true, "2026-07-25", "2026-07-25"),
    ).toEqual([]);
  });

  it("[D9] 異常 (end <= start) でもクラッシュせず 1 件返す", () => {
    expect(
      occurrenceDays(jst("2026-07-23T09:00"), jst("2026-07-23T09:00"), false, "2026-07-23", "2026-07-23"),
    ).toEqual([{ date: "2026-07-23", startMinute: 540, endMinute: 540 }]);
  });
});
