/**
 * 設計 .designs/20260730-calendar-ui-defects.md §9-E (W1〜W11)
 * Reviewer が設計docのみを根拠に生成 (実装非参照)。
 * ★ この file は `@/api/hooks` を **mock しない** (W10: コンポーネントが hook を呼ばなくなったことの検証)。
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AttendanceCalendar } from "@/components/semester/AttendanceCalendar";

function counts(
  over: Partial<Record<"present" | "absent" | "excused" | "tardy" | "earlyLeave" | "suspended" | "unrecorded", number>> = {},
) {
  return { present: 0, absent: 0, excused: 0, tardy: 0, earlyLeave: 0, suspended: 0, unrecorded: 0, ...over };
}

const days = [
  { date: "2026-06-08", status: "ALL_PRESENT", occurrenceCount: 2, counts: counts({ present: 2 }) },
  { date: "2026-06-09", status: "HAS_ABSENT", occurrenceCount: 2, counts: counts({ absent: 1, present: 1 }) },
  { date: "2026-06-10", status: "PARTIAL_UNRECORDED", occurrenceCount: 2, counts: counts({ unrecorded: 2 }) },
];

// 学期 = 2026-06-05 〜 2026-06-25 (6月の中に閉じる = 範囲外セルが同じ月グリッドに同居する)
function renderCalendar(overrides: Record<string, unknown> = {}) {
  const onSelectDay = vi.fn();
  const onToggleSelectionMode = vi.fn();
  const onToggleDate = vi.fn();
  const result = render(
    <AttendanceCalendar
      days={days as never}
      startDate="2026-06-05"
      endDate="2026-06-25"
      today="2026-06-11"
      onSelectDay={onSelectDay}
      selectionMode={false}
      selectedDates={new Set()}
      onToggleSelectionMode={onToggleSelectionMode}
      onToggleDate={onToggleDate}
      {...(overrides as never)}
    />,
  );
  return { ...result, onSelectDay, onToggleSelectionMode, onToggleDate };
}

/** 日セルの grid (曜日ヘッダー grid とは別) */
function gridChildCounts(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll('[class*="grid-cols-7"]')).map((g) => g.children.length);
}

function dayCellButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-label]")).filter((b) =>
    /^\d+月\d+日$/.test(b.getAttribute("aria-label") ?? ""),
  );
}

describe("[calendar-defects §9-E] AttendanceCalendar", () => {
  it("[W1] 青点 (h-2 w-2 rounded-full bg-accent-500) が DOM に 1 つも無い", () => {
    const { container } = renderCalendar();

    expect(container.querySelectorAll(".h-2.w-2.rounded-full.bg-accent-500")).toHaveLength(0);
    // 右上スロットの絶対配置マーカーも存在しない (チェックマークは left-1 top-1 なので別物)
    expect(container.querySelectorAll('[class*="right-1"][class*="top-1"]')).toHaveLength(0);
  });

  it("[W2] 凡例から「予定」が消え、「未記録」と 5 status ラベルは残る", () => {
    const { container } = renderCalendar();

    expect(container.textContent ?? "").not.toContain("予定");
    expect(container.textContent ?? "").toContain("未記録");
    for (const label of ["出席", "欠席", "公欠", "遅刻・早退", "休講"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("[W3] 選択済みの日にチェックマークが残る (青点削除で壊していない)", () => {
    const { container } = renderCalendar({ selectionMode: true, selectedDates: new Set(["2026-06-15"]) });

    const cell = container.querySelector<HTMLButtonElement>('button[aria-label="6月15日"]');
    expect(cell).not.toBeNull();
    const badge = cell!.querySelector('[class*="left-1"][class*="top-1"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain("bg-accent-500");
    expect(badge!.querySelector("svg")).not.toBeNull();
  });

  it("[W4] 通常モードでは学期範囲外の日も押せる <button> (非退行)", () => {
    const { container, onSelectDay } = renderCalendar();

    const cell = container.querySelector<HTMLButtonElement>('button[aria-label="6月3日"]');
    expect(cell).not.toBeNull();
    expect(cell!.tagName).toBe("BUTTON");
    expect(cell!.hasAttribute("disabled")).toBe(false);
    fireEvent.click(cell!);
    expect(onSelectDay).toHaveBeenCalledWith("2026-06-03");
  });

  it("[W5] 複数選択モードでは学期範囲外の日が DOM から消え、grid の子要素数は不変", () => {
    const { container: normal } = renderCalendar();
    const normalCounts = gridChildCounts(normal);
    cleanup(); // 同一 document に 2 レンダリングを重ねない (screen.* は document.body 全体を見る)

    const { container } = renderCalendar({ selectionMode: true });

    expect(screen.queryByLabelText("6月3日")).toBeNull();
    expect(container.querySelector('[aria-label="6月3日"]')).toBeNull();
    expect(gridChildCounts(container)).toEqual(normalCounts);
  });

  it("[W6] 複数選択モードの学期内の日はクリックで onToggleDate", () => {
    const { container, onToggleDate, onSelectDay } = renderCalendar({ selectionMode: true });

    const cell = container.querySelector<HTMLButtonElement>('button[aria-label="6月15日"]');
    expect(cell).not.toBeNull();
    fireEvent.click(cell!);
    expect(onToggleDate).toHaveBeenCalledWith("2026-06-15");
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("[W7] endDate の翌日 (6月26日) は複数選択モードで存在しない", () => {
    renderCalendar({ selectionMode: true });

    expect(screen.queryByLabelText("6月26日")).toBeNull();
  });

  it("[W8] endDate ちょうど (6月25日) は複数選択モードで存在し押せる", () => {
    const { container, onToggleDate } = renderCalendar({ selectionMode: true });

    const cell = container.querySelector<HTMLButtonElement>('button[aria-label="6月25日"]');
    expect(cell).not.toBeNull();
    expect(cell!.hasAttribute("disabled")).toBe(false);
    fireEvent.click(cell!);
    expect(onToggleDate).toHaveBeenCalledWith("2026-06-25");
  });

  it("[W8-b] startDate ちょうど (6月5日) は複数選択モードで存在し押せる", () => {
    const { container, onToggleDate } = renderCalendar({ selectionMode: true });

    const cell = container.querySelector<HTMLButtonElement>('button[aria-label="6月5日"]');
    expect(cell).not.toBeNull();
    fireEvent.click(cell!);
    expect(onToggleDate).toHaveBeenCalledWith("2026-06-05");
  });

  it("[W9] 複数選択モードで disabled な日セル <button> が 1 つも無い", () => {
    const { container } = renderCalendar({ selectionMode: true });

    const cells = dayCellButtons(container);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.filter((b) => b.hasAttribute("disabled"))).toHaveLength(0);

    // container 全体で disabled なのは月ナビ (境界) のみ = 「無効ボタン」という表現が日セルから消えた
    const disabledLabels = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .filter((b) => b.hasAttribute("disabled"))
      .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
    for (const label of disabledLabels) {
      expect(["前の月", "次の月"]).toContain(label);
    }
  });

  it("[W10] usePersonalEvents を mock せず・QueryClientProvider 無しでレンダリングできる", () => {
    expect(() => renderCalendar()).not.toThrow();
    expect(screen.getByText("2026年 6月")).toBeInTheDocument();
  });

  it("[W11] semesterId を渡さなくても正常に描画される (prop 契約から消えた)", () => {
    const { container } = renderCalendar();

    expect(dayCellButtons(container).length).toBeGreaterThan(20);
  });
});
