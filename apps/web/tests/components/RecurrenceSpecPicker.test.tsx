// RecurrenceSpecPicker (Web) — §6.6 の「表示文の正典」と プリセット⇄spec の対応
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §6.6 / §10 (Web と iOS で同一文字列)
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { RecurrenceSpec } from "@atender/shared";
import {
  RecurrenceSpecPicker,
  describeSpec,
  presetForSpec,
  specForPreset,
} from "@/components/recurrence/RecurrenceSpecPicker";

/** 2026-07-23 (木) 09:00 JST */
const START = new Date("2026-07-23T00:00:00.000+09:00");
/** 2026-07-30 (木・第 5 木曜) 09:00 JST */
const START_LAST_THU = new Date("2026-07-30T00:00:00.000+09:00");

function spec(over: Partial<RecurrenceSpec>): RecurrenceSpec {
  return {
    freq: "WEEKLY",
    interval: 1,
    byDay: [],
    monthlyMode: null,
    end: { kind: "never" },
    ...over,
  } as RecurrenceSpec;
}

describe("§6.6 describeSpec — 表示文の正典", () => {
  const cases: Array<[string, RecurrenceSpec | null, Date, string]> = [
    ["nil", null, START, "繰り返しなし"],
    ["DAILY interval 1", spec({ freq: "DAILY" }), START, "毎日"],
    ["DAILY interval 3", spec({ freq: "DAILY", interval: 3 }), START, "3日ごと"],
    [
      "WEEKLY 平日 5 個ちょうど",
      spec({ freq: "WEEKLY", byDay: ["MO", "TU", "WE", "TH", "FR"] }),
      START,
      "毎週 平日",
    ],
    ["WEEKLY その他", spec({ freq: "WEEKLY", byDay: ["MO", "WE"] }), START, "毎週 月, 水"],
    [
      "WEEKLY interval 2",
      spec({ freq: "WEEKLY", interval: 2, byDay: ["MO", "WE"] }),
      START,
      "2週ごと 月, 水",
    ],
    ["MONTHLY BYMONTHDAY", spec({ freq: "MONTHLY", monthlyMode: "BYMONTHDAY" }), START, "毎月 23日"],
    ["MONTHLY BYDAY ord 4", spec({ freq: "MONTHLY", monthlyMode: "BYDAY" }), START, "毎月 第4木曜"],
    [
      "MONTHLY BYDAY ord 5 (最終)",
      spec({ freq: "MONTHLY", monthlyMode: "BYDAY" }),
      START_LAST_THU,
      "毎月 最終木曜",
    ],
    [
      "MONTHLY interval 2",
      spec({ freq: "MONTHLY", interval: 2, monthlyMode: "BYMONTHDAY" }),
      START,
      "2ヶ月ごと 23日",
    ],
    ["YEARLY interval 1", spec({ freq: "YEARLY" }), START, "毎年 7月23日"],
    ["YEARLY interval 3", spec({ freq: "YEARLY", interval: 3 }), START, "3年ごと 7月23日"],
    [
      "末尾 until",
      spec({ freq: "DAILY", end: { kind: "until", date: "2026-12-31" } }),
      START,
      "毎日 ・2026/12/31 まで",
    ],
    ["末尾 count", spec({ freq: "DAILY", end: { kind: "count", count: 10 } }), START, "毎日 ・10回"],
    [
      "U11 の複合例",
      spec({ freq: "WEEKLY", byDay: ["MO", "WE"], end: { kind: "count", count: 10 } }),
      START,
      "毎週 月, 水 ・10回",
    ],
  ];

  for (const [name, value, start, expected] of cases) {
    it(`[${name}] → "${expected}"`, () => {
      expect(describeSpec(value, start)).toBe(expected);
    });
  }
});

describe("§6.6 specForPreset / presetForSpec", () => {
  it("[U9 相当] プリセット → spec", () => {
    expect(specForPreset("none", START)).toBeNull();
    expect(specForPreset("custom", START)).toBeNull();
    expect(specForPreset("daily", START)).toMatchObject({ freq: "DAILY", interval: 1 });
    expect(specForPreset("weekly", START)).toMatchObject({ freq: "WEEKLY", byDay: ["TH"], interval: 1 });
    expect(specForPreset("weekday", START)).toMatchObject({
      freq: "WEEKLY",
      byDay: ["MO", "TU", "WE", "TH", "FR"],
    });
    expect(specForPreset("monthlyByMonthDay", START)).toMatchObject({
      freq: "MONTHLY",
      monthlyMode: "BYMONTHDAY",
    });
    expect(specForPreset("monthlyByDay", START)).toMatchObject({ freq: "MONTHLY", monthlyMode: "BYDAY" });
    expect(specForPreset("yearly", START)).toMatchObject({ freq: "YEARLY" });
  });

  it("[U10 相当] spec → プリセットの逆写像", () => {
    for (const preset of ["daily", "weekly", "weekday", "monthlyByMonthDay", "monthlyByDay", "yearly"] as const) {
      expect(presetForSpec(specForPreset(preset, START), START)).toBe(preset);
    }
    expect(presetForSpec(null, START)).toBe("none");
    expect(presetForSpec(spec({ freq: "WEEKLY", interval: 2, byDay: ["MO"] }), START)).toBe("custom");
  });

  it("[U9] 危険窓 (JST 00:30) でも曜日は JST 暦で決まる", () => {
    const dangerous = new Date("2026-07-23T00:30:00.000+09:00");
    expect(specForPreset("weekly", dangerous)).toMatchObject({ byDay: ["TH"] });
    expect(describeSpec(specForPreset("weekly", dangerous), dangerous)).toBe("毎週 木");
  });
});

describe("§10 prop 契約", () => {
  it("value / onChange / start を受け、選択で onChange が spec を返す", () => {
    const onChange = vi.fn();
    render(<RecurrenceSpecPicker value={null} onChange={onChange} start={START} />);

    const select = screen.getByLabelText("繰り返し") as HTMLSelectElement;
    expect(select.value).toBe("none");

    fireEvent.change(select, { target: { value: "weekly" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ freq: "WEEKLY", byDay: ["TH"] });
  });

  it("なしを選ぶと null を返す", () => {
    const onChange = vi.fn();
    render(
      <RecurrenceSpecPicker value={specForPreset("weekly", START)} onChange={onChange} start={START} />,
    );

    fireEvent.change(screen.getByLabelText("繰り返し"), { target: { value: "none" } });

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
