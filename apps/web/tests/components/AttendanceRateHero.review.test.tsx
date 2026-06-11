import { fireEvent, render, screen } from "@testing-library/react";
import { AttendanceRateHero } from "@/components/semester/AttendanceRateHero";

function renderHero(overrides: Partial<any> = {}, requiredRate = 70, onJumpToCalendar?: () => void) {
  const overall = {
    toDate: { effectiveNumerator: 41.5, effectiveDenominator: 48, attendanceRate: 41.5 / 48 },
    unrecordedCount: 3,
    remainingCount: 52,
    allowedAbsences: 11,
    ...overrides,
  };
  return render(
    <AttendanceRateHero overall={overall as any} requiredRate={requiredRate} onJumpToCalendar={onJumpToCalendar} />,
  );
}

function expectStyledWith(container: HTMLElement, text: string | RegExp, token: string) {
  const textNode = screen.getByText(text);
  const styled = textNode.closest(`[style*="${token}"]`) ?? container.querySelector(`[style*="${token}"]`);
  expect(styled).toBeInTheDocument();
}

describe("AttendanceRateHero review contract", () => {
  it("renders below-required 60% with fraction and absent color", () => {
    const { container } = renderHero({
      toDate: { effectiveNumerator: 6, effectiveDenominator: 10, attendanceRate: 0.6 },
      unrecordedCount: 0,
    });

    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
    expect(screen.getByText(/6\s*\/\s*10限/)).toBeInTheDocument();
    expectStyledWith(container, "60", "var(--color-status-absent)");
    expect(screen.getByText("60").closest(`[style*="var(--color-accent-500)"]`)).not.toBeInTheDocument();
  });

  it("renders achieved 86% with accent color", () => {
    const { container } = renderHero({
      toDate: { effectiveNumerator: 41.5, effectiveDenominator: 48, attendanceRate: 0.864 },
    });

    expect(screen.getByText("86")).toBeInTheDocument();
    expectStyledWith(container, "86", "var(--color-accent-500)");
  });

  it("shows unrecorded banner with alert icon", () => {
    const { container } = renderHero({ unrecordedCount: 3 });

    expect(screen.getByText("未記録 3 件 — 記録して")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("hides unrecorded banner when there are no unrecorded items", () => {
    renderHero({ unrecordedCount: 0 });

    expect(screen.queryByText(/未記録/)).toBeNull();
  });

  it("calls onJumpToCalendar from the unrecorded banner button when provided", () => {
    const onJumpToCalendar = vi.fn();
    renderHero({ unrecordedCount: 3 }, 70, onJumpToCalendar);

    fireEvent.click(screen.getByRole("button", { name: /カレンダーへ/ }));

    expect(onJumpToCalendar).toHaveBeenCalledTimes(1);
  });

  it("shows the unrecorded banner without calendar button when callback is omitted", () => {
    renderHero({ unrecordedCount: 3 });

    expect(screen.getByText("未記録 3 件 — 記録して")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /カレンダーへ/ })).toBeNull();
  });

  it("renders ordinary allowed-absences action text without accent color", () => {
    const { container } = renderHero({ allowedAbsences: 11, remainingCount: 52 });
    const action = screen.getByText(/あと\s*11限\s*休める/);

    expect(action).toBeInTheDocument();
    expect(action.closest(`[style*="var(--color-accent-500)"]`)).not.toBeInTheDocument();
    expect(container.innerHTML).toContain("あと");
  });

  it("renders all-remaining-can-be-absent action text with accent color", () => {
    const { container } = renderHero({ allowedAbsences: 60, remainingCount: 52 });

    expect(screen.getByText(/残りを全部休んでも/)).toBeInTheDocument();
    expectStyledWith(container, /残りを全部休んでも/, "var(--color-accent-500)");
  });

  it("renders impossible-to-reach action text with absent color", () => {
    const { container } = renderHero({ allowedAbsences: -2 });

    expect(screen.getByText(/届きません/)).toBeInTheDocument();
    expectStyledWith(container, /届きません/, "var(--color-status-absent)");
  });

  it("writes progress and required marker positions as inline styles", () => {
    const { container } = renderHero({
      toDate: { effectiveNumerator: 6, effectiveDenominator: 10, attendanceRate: 0.6 },
      unrecordedCount: 0,
    });

    expect(container.innerHTML).toContain("60%");
    expect(container.innerHTML).toContain("70%");
  });

  it("renders dash when rate is null without throwing", () => {
    expect(() =>
      renderHero({
        toDate: { effectiveNumerator: 0, effectiveDenominator: 0, attendanceRate: null },
        allowedAbsences: null,
      }),
    ).not.toThrow();

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
