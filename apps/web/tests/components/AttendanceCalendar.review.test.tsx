/**
 * Reviewer blind tests — .designs/20260729-semester-calendar-multi-status.md §5.8 (C1〜C10)
 * 設計docのみを根拠に生成。実装コードは参照していない。
 */
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AttendanceDaySummary } from "@atender/shared";
import { AttendanceCalendar } from "@/components/semester/AttendanceCalendar";
import { renderWithClient } from "../utils/render";

type Counts = AttendanceDaySummary["counts"];

const ZERO = {
  present: 0,
  absent: 0,
  excused: 0,
  tardy: 0,
  earlyLeave: 0,
  suspended: 0,
  unrecorded: 0,
};

function summary(
  date: string,
  partial: Partial<typeof ZERO>,
  status: AttendanceDaySummary["status"] = "ALL_PRESENT",
): AttendanceDaySummary {
  const counts = { ...ZERO, ...partial } as Counts;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { date, status, occurrenceCount: total, counts } as AttendanceDaySummary;
}

const TODAY = "2026-06-11";

const days: AttendanceDaySummary[] = [
  summary("2026-06-03", { absent: 1, present: 3 }, "HAS_ABSENT"), // C1 / C7
  summary("2026-06-04", { excused: 1 }), // C2
  summary("2026-06-05", { present: 1, unrecorded: 2 }, "PARTIAL_UNRECORDED"), // C6
  summary("2026-06-08", { absent: 1, excused: 1, tardy: 1, suspended: 1, present: 1 }, "HAS_ABSENT"), // C10
  summary("2026-06-13", { suspended: 1 }, "ALL_SUSPENDED"), // C5 (未来)
  summary("2026-06-20", { unrecorded: 2 }, "PARTIAL_UNRECORDED"), // C4 (未来)
  summary("2026-06-21", { excused: 1, unrecorded: 1 }, "PARTIAL_UNRECORDED"), // C3 (未来)
];

function renderCalendar(overrides: Partial<Parameters<typeof AttendanceCalendar>[0]> = {}) {
  const onSelectDay = vi.fn();
  const onToggleDate = vi.fn();
  const onToggleSelectionMode = vi.fn();
  const utils = renderWithClient(
    <AttendanceCalendar
      days={days}
      startDate="2026-06-01"
      endDate="2026-06-30"
      today={TODAY}
      semesterId={null}
      onSelectDay={onSelectDay}
      selectionMode={false}
      selectedDates={new Set<string>()}
      onToggleSelectionMode={onToggleSelectionMode}
      onToggleDate={onToggleDate}
      {...overrides}
    />,
  );
  return { ...utils, onSelectDay, onToggleDate, onToggleSelectionMode };
}

/** aria-label ("M月D日") でセルを引く */
function cell(label: string): HTMLElement {
  return screen.getByLabelText(label);
}

function html(el: HTMLElement) {
  return el.outerHTML;
}

/** グリフ = lucide svg または 文字グリフ「公」 */
function glyphCount(el: HTMLElement) {
  const svgs = el.querySelectorAll("svg").length;
  const kanji = Array.from(el.querySelectorAll("span"))
    .filter((s) => s.children.length === 0)
    .filter((s) => s.textContent?.trim() === "公").length;
  return svgs + kanji;
}

describe("[§5.8] AttendanceCalendar のセル描画", () => {
  it("[C1] 過去日 absent=1 / present=3 のセルは absent と present の両トークンを持つ", () => {
    renderCalendar();
    const h = html(cell("6月3日"));
    expect(h).toContain("--color-status-absent");
    expect(h).toContain("--color-status-present");
  });

  it("[C2] 過去日 excused のみのセルは excused トークンを持ち present トークンを持たない", () => {
    renderCalendar();
    const h = html(cell("6月4日"));
    expect(h).toContain("--color-status-excused");
    expect(h).not.toContain("--color-status-present");
  });

  it("[C3] 未来日 (6/21) excused=1 + unrecorded=1 は excused トークンが出る", () => {
    renderCalendar();
    const h = html(cell("6月21日"));
    expect(h).toContain("--color-status-excused");
  });

  it("[C4] 未来日 (6/20) unrecorded のみは status トークンも border-dashed も出ない", () => {
    renderCalendar();
    const el = cell("6月20日");
    expect(html(el)).not.toMatch(/--color-status-/);
    expect(el.className).not.toContain("border-dashed");
  });

  it("[C5] 未来日 (6/13) suspended=1 は suspended トークンが出る (回帰防止)", () => {
    renderCalendar();
    expect(html(cell("6月13日"))).toContain("--color-status-suspended");
  });

  it("[C6] 過去日 unrecorded>0 のセルは border-dashed", () => {
    renderCalendar();
    expect(cell("6月5日").className).toContain("border-dashed");
  });

  it("[C7] aria-label は M月D日 のまま", () => {
    renderCalendar();
    expect(screen.getByLabelText("6月3日")).toBeInTheDocument();
    expect(screen.getByLabelText("6月30日")).toBeInTheDocument();
  });

  it("[C8-a] 通常モードのタップは onSelectDay を呼ぶ", async () => {
    const user = userEvent.setup();
    const { onSelectDay, onToggleDate } = renderCalendar();
    await user.click(cell("6月3日"));
    expect(onSelectDay).toHaveBeenCalledWith("2026-06-03");
    expect(onToggleDate).not.toHaveBeenCalled();
  });

  it("[C8-b] 選択モードのタップは onToggleDate を呼ぶ", async () => {
    const user = userEvent.setup();
    const { onSelectDay, onToggleDate } = renderCalendar({ selectionMode: true });
    await user.click(cell("6月3日"));
    expect(onToggleDate).toHaveBeenCalledWith("2026-06-03");
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  // C8 = 「すべて現行と同一挙動 (回帰なし)」。学期範囲外セルの disabled 化は
  // merge-base (66b893a) でも実装されていない (Reviewer が negative control で実測) ので、
  // ここでは「範囲外セルにマークを描かない」= 現行踏襲 だけを固定する。
  // disabled 属性の欠落は本レーン由来でない pre-existing gap として報告する。
  it("[C8-c] 学期範囲外の日の扱いは merge-base と同一 (disabled 化されず、data があれば描画される)", () => {
    renderCalendar({ startDate: "2026-06-05", endDate: "2026-06-25" });
    const outOfRange = cell("6月3日");
    expect(outOfRange.hasAttribute("disabled")).toBe(false);
    expect(html(outOfRange)).toContain("--color-status-absent");
  });

  it("[C9] 凡例に 出席 / 欠席 / 公欠 / 遅刻・早退 / 休講 の 5 語が出る", () => {
    const { container } = renderCalendar();
    const text = container.textContent ?? "";
    for (const word of ["出席", "欠席", "公欠", "遅刻・早退", "休講"]) {
      expect(text, `legend word missing: ${word}`).toContain(word);
    }
  });

  it("[C10] 3 種類以上のマークがある日のグリフは 2 個だけ", () => {
    renderCalendar();
    const el = cell("6月8日");
    expect(glyphCount(el)).toBe(2);
    // severity 順の上位 2 種 = absent (svg) + excused (文字「公」)
    expect(within(el).getByText("公")).toBeInTheDocument();
  });
});
