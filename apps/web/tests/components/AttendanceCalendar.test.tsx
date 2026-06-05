/**
 * 設計不足: AttendanceCalendar の既存 props 形（status データの渡し方、month 指定）は設計docに明記されていない。
 * 新 prop onSelectDay と UI 契約を、設計された AttendanceDaySummary 相当の最小 days 配列で best-effort 検証する。
 */
import { fireEvent, render, screen, within } from "@testing-library/react";

import { AttendanceCalendar } from "@/components/semester/AttendanceCalendar";
import { usePersonalEvents } from "@/api/hooks";

vi.mock("@/api/hooks", () => ({
  usePersonalEvents: vi.fn(),
}));

const days = [
  { date: "2026-05-13", status: "HAS_ABSENT" },
  { date: "2026-05-14", status: "ALL_PRESENT" },
];

function renderCalendar(overrides: Partial<any> = {}) {
  vi.mocked(usePersonalEvents).mockReturnValue({ data: { events: [] }, isLoading: false } as any);
  const onSelectDay = vi.fn();
  const result = render(
    <AttendanceCalendar
      days={days as any}
      startDate="2026-05-01"
      endDate="2026-05-31"
      semesterId="semester-1"
      onSelectDay={onSelectDay}
      {...(overrides as any)}
    />,
  );
  return { ...result, onSelectDay };
}

function dayCell(dayText: string): HTMLElement {
  const candidates = screen.getAllByRole("button").filter((button) => within(button).queryByText(dayText));
  if (candidates.length === 0) throw new Error(`No day cell for ${dayText}`);
  return candidates[0];
}

describe("AttendanceCalendar", () => {
  it("[UI] month navigation buttons have aria labels and 44px target classes", () => {
    renderCalendar();

    expect(screen.getByLabelText("前の月")).toHaveClass("h-11", "w-11");
    expect(screen.getByLabelText("次の月")).toHaveClass("h-11", "w-11");
  });

  it("[UI] renders day cells as buttons and calls onSelectDay with an ISO date", () => {
    const { onSelectDay } = renderCalendar();

    fireEvent.click(dayCell("13"));

    expect(onSelectDay).toHaveBeenCalledWith("2026-05-13");
  });

  it("[UI] applies the designed status background token to status cells", () => {
    const { container } = renderCalendar();

    expect(container.querySelector('[style*="--color-status-absent"][style*="16%"]')).toBeInTheDocument();
    expect(container.querySelector('[style*="--color-status-present"][style*="12%"]')).toBeInTheDocument();
  });
});
