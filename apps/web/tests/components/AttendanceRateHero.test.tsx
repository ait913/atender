import { render, screen } from "@testing-library/react";
import { AttendanceRateHero } from "@/components/semester/AttendanceRateHero";

function renderHero(overrides: Partial<any> = {}) {
  const overall = {
    effectiveNumerator: 0,
    effectiveDenominator: 0,
    attendanceRate: null,
    toDate: { effectiveNumerator: 41.5, effectiveDenominator: 48, attendanceRate: 41.5 / 48 },
    unrecordedCount: 3,
    remainingCount: 52,
    allowedAbsences: 11,
    ...overrides,
  };
  return render(<AttendanceRateHero overall={overall as any} requiredRate={70} />);
}

describe("AttendanceRateHero", () => {
  it("renders rounded today-to-date percentage and fraction", () => {
    renderHero();

    // 仕様 #39
    expect(screen.getByText("今日までの出席率")).toBeInTheDocument();
    expect(screen.getByText("86")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
    expect(screen.getByText(/41\.5\s*\/\s*48限/)).toBeInTheDocument();
  });

  it("renders allowed absences action text", () => {
    renderHero({ allowedAbsences: 11, remainingCount: 52 });

    // 仕様 #40
    expect(screen.getByText(/あと\s*11限\s*休める/)).toBeInTheDocument();
  });

  it("renders below-required warning when allowedAbsences is negative", () => {
    renderHero({ allowedAbsences: -2 });

    // 仕様 #41
    expect(screen.getByText("残り全部出席しても 70% に届きません")).toBeInTheDocument();
  });

  it("renders all-remaining-can-be-absent text when allowedAbsences covers remainingCount", () => {
    renderHero({ allowedAbsences: 60, remainingCount: 52 });

    // 仕様 #42
    expect(screen.getByText("残りを全部休んでも 70% を維持")).toBeInTheDocument();
  });

  it("shows and hides the unrecorded chip", () => {
    const { rerender } = renderHero({ unrecordedCount: 3 });

    // 仕様 #43
    expect(screen.getByText("未記録 3")).toBeInTheDocument();

    rerender(
      <AttendanceRateHero
        requiredRate={70}
        overall={
          {
            toDate: { effectiveNumerator: 1, effectiveDenominator: 1, attendanceRate: 1 },
            unrecordedCount: 0,
            remainingCount: 0,
            allowedAbsences: 0,
          } as any
        }
      />,
    );
    expect(screen.queryByText(/未記録/)).not.toBeInTheDocument();
  });

  it("writes progress and required marker positions as inline styles", () => {
    const { container } = renderHero();

    // 仕様 #44
    expect(container.querySelector('[style*="width: 86%"]')).toBeInTheDocument();
    expect(container.querySelector('[style*="left: 70%"]')).toBeInTheDocument();
  });

  it("renders dash when toDate attendanceRate is null", () => {
    renderHero({
      toDate: { effectiveNumerator: 0, effectiveDenominator: 0, attendanceRate: null },
      allowedAbsences: null,
    });

    // 仕様 #45
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("データなし")).toBeInTheDocument();
  });
});
