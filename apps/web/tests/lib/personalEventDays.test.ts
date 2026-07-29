// §9 W1 / W2 — occurrence → 日ごとの描画単位へのマッピング
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §7 / §9 W1, W2
import { describe, expect, it } from "vitest";
import type { PersonalEventOccurrenceDto } from "@atender/shared";
import {
  inclusiveEndDate,
  jstDayStartIso,
  jstNextDayStartIso,
  personalEventDates,
  personalEventsToCalendarEvents,
} from "@/lib/personalEventDays";

function occ(over: Partial<PersonalEventOccurrenceDto>): PersonalEventOccurrenceDto {
  return {
    seriesId: "series-1",
    occurrenceDate: "2026-07-23T00:00:00.000Z",
    start: "2026-07-23T00:00:00.000Z",
    end: "2026-07-23T01:30:00.000Z",
    days: [{ date: "2026-07-23", startMinute: 540, endMinute: 630 }],
    isAllDay: false,
    title: "予定",
    location: null,
    note: null,
    color: null,
    isRecurringOccurrence: false,
    recurrenceRule: null,
    recurrenceSpec: null,
    overrideId: null,
    source: "MANUAL",
    ekExternalId: null,
    ekCalendarId: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  } as PersonalEventOccurrenceDto;
}

const multiDay = occ({
  seriesId: "series-multi",
  occurrenceDate: "2026-07-22T15:00:00.000Z",
  start: "2026-07-22T15:00:00.000Z",
  end: "2026-07-25T15:00:00.000Z",
  isAllDay: true,
  title: "帰省",
  days: [
    { date: "2026-07-23", startMinute: 0, endMinute: 1440 },
    { date: "2026-07-24", startMinute: 0, endMinute: 1440 },
    { date: "2026-07-25", startMinute: 0, endMinute: 1440 },
  ],
});

describe("§9 W1. personalEventsToCalendarEvents", () => {
  it("[W1] 複数日 occurrence は days ごとに 1 イベントへ割れる", () => {
    const events = personalEventsToCalendarEvents([multiDay]);

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.date)).toEqual(["2026-07-23", "2026-07-24", "2026-07-25"]);
    for (const e of events) {
      expect(e.kind).toBe("personal");
      expect(e.seriesId).toBe("series-multi");
      expect(e.occurrenceDate).toBe("2026-07-22T15:00:00.000Z");
      expect(e.title).toBe("帰省");
      expect(e.isAllDay).toBe(true);
      expect(e.startMinute).toBe(0);
      expect(e.endMinute).toBe(1440);
    }
  });

  it("[W1] eventId は seriesId:occurrenceDate:day.date", () => {
    const events = personalEventsToCalendarEvents([multiDay]);

    expect(events.map((e) => e.eventId)).toEqual([
      "series-multi:2026-07-22T15:00:00.000Z:2026-07-23",
      "series-multi:2026-07-22T15:00:00.000Z:2026-07-24",
      "series-multi:2026-07-22T15:00:00.000Z:2026-07-25",
    ]);
    expect(new Set(events.map((e) => e.eventId)).size).toBe(3);
  });

  it("[W1] 時刻ありの単日は days の分をそのまま使う (クライアントは日付演算をしない)", () => {
    const events = personalEventsToCalendarEvents([occ({})]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      date: "2026-07-23",
      startMinute: 540,
      endMinute: 630,
      isAllDay: false,
      isRecurringOccurrence: false,
    });
  });

  it("[W1] 空入力は空配列", () => {
    expect(personalEventsToCalendarEvents([])).toEqual([]);
  });
});

describe("§9 W2. personalEventDates", () => {
  it("[W2] 予定ドットは複数日 occurrence の全日に付く", () => {
    const dates = personalEventDates([multiDay, occ({})]);

    expect([...dates].sort()).toEqual(["2026-07-23", "2026-07-24", "2026-07-25"]);
  });

  it("[W2] 同じ日を覆う複数 occurrence でも Set なので 1 つ", () => {
    const dates = personalEventDates([occ({}), occ({ seriesId: "s2" })]);

    expect(dates.size).toBe(1);
    expect(dates.has("2026-07-23")).toBe(true);
  });
});

describe("§3.3 終日の日付変換 (Web 側)", () => {
  it("JST 00:00 / 翌 00:00 の ISO を作る", () => {
    expect(jstDayStartIso("2026-07-23")).toBe(new Date("2026-07-23T00:00:00.000+09:00").toISOString());
    expect(jstNextDayStartIso("2026-07-23")).toBe(new Date("2026-07-24T00:00:00.000+09:00").toISOString());
  });

  it("排他 end から包含終了日 (end - 1ms の JST 日) へ戻す", () => {
    // 7/23〜7/25 の終日 = end 7/26 00:00 JST → 表示上の終了日は 7/25
    expect(inclusiveEndDate(new Date("2026-07-26T00:00:00.000+09:00").toISOString())).toBe("2026-07-25");
    // 単日の終日
    expect(inclusiveEndDate(new Date("2026-07-24T00:00:00.000+09:00").toISOString())).toBe("2026-07-23");
  });

  it("包含終了日 → 排他 end の往復が閉じる", () => {
    const end = jstNextDayStartIso("2026-07-25");
    expect(inclusiveEndDate(end)).toBe("2026-07-25");
  });
});
