import { fireEvent, render, screen } from "@testing-library/react";
import { AttendanceCalendar } from "@/components/semester/AttendanceCalendar";
import { usePersonalEvents } from "@/api/hooks";

vi.mock("@/api/hooks", () => ({
  usePersonalEvents: vi.fn(),
}));

function counts(over: Partial<Record<"present" | "absent" | "excused" | "tardy" | "earlyLeave" | "suspended" | "unrecorded", number>> = {}) {
  return { present: 0, absent: 0, excused: 0, tardy: 0, earlyLeave: 0, suspended: 0, unrecorded: 0, ...over };
}

const days = [
  { date: "2026-06-03", status: "HAS_ABSENT", occurrenceCount: 4, counts: counts({ absent: 1, present: 3 }) },
  { date: "2026-06-04", status: "ALL_PRESENT", occurrenceCount: 2, counts: counts({ present: 2 }) },
  { date: "2026-06-05", status: "PARTIAL_UNRECORDED", occurrenceCount: 2, counts: counts({ unrecorded: 2 }) },
  { date: "2026-06-08", status: "ALL_PRESENT", occurrenceCount: 1, counts: counts({ excused: 1 }) },
  { date: "2026-06-12", status: "ALL_PRESENT", occurrenceCount: 2, counts: counts({ present: 2 }) },
  { date: "2026-06-13", status: "ALL_SUSPENDED", occurrenceCount: 1, counts: counts({ suspended: 1 }) },
  { date: "2026-06-20", status: "PARTIAL_UNRECORDED", occurrenceCount: 2, counts: counts({ unrecorded: 2 }) },
  { date: "2026-06-21", status: "ALL_PRESENT", occurrenceCount: 2, counts: counts({ excused: 1, unrecorded: 1 }) },
];

function renderCalendar(overrides: Partial<any> = {}) {
  vi.mocked(usePersonalEvents).mockReturnValue({ data: { events: [] }, isLoading: false } as any);
  const onSelectDay = vi.fn();
  const onToggleSelectionMode = vi.fn();
  const onToggleDate = vi.fn();
  const result = render(
    <AttendanceCalendar
      days={days as any}
      startDate="2026-04-06"
      endDate="2026-09-18"
      today="2026-06-11"
      semesterId="semester-1"
      onSelectDay={onSelectDay}
      selectionMode={false}
      selectedDates={new Set()}
      onToggleSelectionMode={onToggleSelectionMode}
      onToggleDate={onToggleDate}
      {...(overrides as any)}
    />,
  );
  return { ...result, onSelectDay, onToggleSelectionMode, onToggleDate };
}

function dayButton(label: string) {
  return screen.getByRole("button", { name: label });
}

describe("AttendanceCalendar v2", () => {
  it("opens the month containing today when today is inside the semester", () => {
    renderCalendar();

    // 仕様 #50
    expect(screen.getByText("2026年 6月")).toBeInTheDocument();
  });

  it.each([
    ["2026-10-01", "2026年 9月"],
    ["2026-03-01", "2026年 4月"],
  ] as const)("clamps initial month for today=%s", (today, expectedHeader) => {
    renderCalendar({ today });

    // 仕様 #51
    expect(screen.getByText(expectedHeader)).toBeInTheDocument();
  });

  it("renders accessible 44px month nav buttons and disables boundaries", () => {
    renderCalendar({ today: "2026-04-10" });

    const prev = screen.getByLabelText("前の月");
    const next = screen.getByLabelText("次の月");

    // 仕様 #52
    expect(prev).toHaveClass("h-11", "w-11");
    expect(next).toHaveClass("h-11", "w-11");
    expect(prev).toBeDisabled();
  });

  it("shows today button off the current month and returns to today's month", () => {
    renderCalendar();
    fireEvent.click(screen.getByLabelText("前の月"));

    // 仕様 #53
    const today = screen.getByRole("button", { name: "今日" });
    expect(today).toBeInTheDocument();
    fireEvent.click(today);
    expect(screen.getByText("2026年 6月")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "今日" })).not.toBeInTheDocument();
  });

  it("calls selection-mode toggle and reflects pressed state", () => {
    const { onToggleSelectionMode, rerender } = renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "複数選択" }));
    // 仕様 #54
    expect(onToggleSelectionMode).toHaveBeenCalledTimes(1);

    rerender(
      <AttendanceCalendar
        days={days as any}
        startDate="2026-04-06"
        endDate="2026-09-18"
        today="2026-06-11"
        onSelectDay={vi.fn()}
        selectionMode
        selectedDates={new Set()}
        onToggleSelectionMode={vi.fn()}
        onToggleDate={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "選択中" })).toHaveAttribute("aria-pressed", "true");
  });

  it("selects a day in normal mode", () => {
    const { onSelectDay } = renderCalendar();

    fireEvent.click(dayButton("6月3日"));

    // 仕様 #55
    expect(onSelectDay).toHaveBeenCalledWith("2026-06-03");
  });

  it("toggles a day in selection mode instead of opening the day detail", () => {
    const { onSelectDay, onToggleDate } = renderCalendar({ selectionMode: true });

    fireEvent.click(dayButton("6月3日"));

    // 仕様 #56
    expect(onToggleDate).toHaveBeenCalledWith("2026-06-03");
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("marks selected dates with ring and check badge", () => {
    renderCalendar({ selectionMode: true, selectedDates: new Set(["2026-06-03"]) });

    const cell = dayButton("6月3日");

    // 仕様 #57
    expect(cell.className).toContain("ring");
    expect(cell.querySelector("svg")).toBeInTheDocument();
  });

  // 旧「仕様 #58: 範囲外セルを disabled にする」は
  // 設計 .designs/20260730-calendar-ui-defects.md §2.2 で廃止され、
  // 「複数選択モードでは学期範囲外を完全な空セルにする」に置換された (§9-E W5/W7/W9)。
  // → 陳腐化テストとして Reviewer が置換 (置換前は "4月5日" が見つからず fail していた)。
  it("[W5/W7] blanks out-of-semester cells in selection mode instead of disabling them", () => {
    renderCalendar({ today: "2026-04-10", selectionMode: true });

    // 設計 §9-E W5 / W7: 範囲外 (startDate=2026-04-06 より前) は DOM から消える
    expect(screen.queryByLabelText("4月5日")).toBeNull();
    expect(screen.queryByRole("button", { name: "4月5日" })).toBeNull();
    // 学期内の日は押せるまま
    expect(dayButton("4月6日")).toBeInTheDocument();
    expect(dayButton("4月6日")).not.toBeDisabled();
  });

  it("[W9] leaves no disabled day-cell button in selection mode", () => {
    const { container } = renderCalendar({ today: "2026-04-10", selectionMode: true });

    // 設計 §9-E W9: 「無効ボタン」という表現自体を廃止した
    const dayCells = Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-label]")).filter((b) =>
      /^\d+月\d+日$/.test(b.getAttribute("aria-label") ?? ""),
    );
    expect(dayCells.length).toBeGreaterThan(20);
    expect(dayCells.filter((b) => b.hasAttribute("disabled"))).toHaveLength(0);
  });

  it("[C1] paints both statuses of a mixed past day", () => {
    renderCalendar();
    const style = dayButton("6月3日").getAttribute("style") ?? "";

    // 設計 §5.8 C1
    expect(style).toContain("--color-status-absent");
    expect(style).toContain("--color-status-present");
  });

  it("[C2] paints an excused-only past day with the excused token", () => {
    renderCalendar();
    const style = dayButton("6月8日").getAttribute("style") ?? "";

    // 設計 §5.8 C2
    expect(style).toContain("--color-status-excused");
    expect(style).not.toContain("--color-status-present");
  });

  it("[C3] keeps future excused visible", () => {
    renderCalendar();
    const style = dayButton("6月21日").getAttribute("style") ?? "";

    // 設計 §5.8 C3
    expect(style).toContain("--color-status-excused");
  });

  it("[C4] shows nothing for a future day that only has unrecorded occurrences", () => {
    renderCalendar();
    const cell = dayButton("6月20日");

    // 設計 §5.8 C4
    expect(cell.getAttribute("style") ?? "").not.toContain("--color-status-");
    expect(cell.className).not.toContain("border-dashed");
  });

  it("[C5] still shows future suspension status", () => {
    const { container } = renderCalendar();
    const futureSuspended = dayButton("6月13日");

    // 設計 §5.8 C5
    expect(futureSuspended.getAttribute("style") ?? container.innerHTML).toContain("--color-status-suspended");
  });

  it("[C6] dashes a past day that has unrecorded occurrences", () => {
    renderCalendar();

    // 設計 §5.8 C6
    expect(dayButton("6月5日").className).toContain("border-dashed");
  });

  it("[C9] renders the five status labels in the legend", () => {
    renderCalendar();

    // 設計 §5.8 C9
    for (const label of ["出席", "欠席", "公欠", "遅刻・早退", "休講"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
