import { render, screen } from "@testing-library/react";
import { CourseListItem } from "@/components/semester/CourseListItem";

type CourseStatsFixture = {
  courseId: string;
  courseName: string;
  teacher: string | null;
  generatedOccurrences: number;
  counts: {
    present: number;
    absent: number;
    excused: number;
    tardy: number;
    earlyLeave: number;
    cancelled: number;
    suspended: number;
    unrecorded: number;
  };
  effectiveNumerator: number;
  effectiveDenominator: number;
  attendanceRate: number | null;
  toDate: {
    effectiveNumerator: number;
    effectiveDenominator: number;
    attendanceRate: number | null;
  };
  remainingCount: number;
  allowedAbsences: number | null;
  maxDayPeriods: number;
  allowedAbsenceDays: number | null;
};

const baseStats: CourseStatsFixture = {
  courseId: "c1",
  courseName: "OS",
  teacher: null,
  generatedOccurrences: 30,
  counts: {
    present: 12,
    absent: 1,
    excused: 0,
    tardy: 0,
    earlyLeave: 0,
    cancelled: 0,
    suspended: 0,
    unrecorded: 0,
  },
  effectiveNumerator: 12,
  effectiveDenominator: 13,
  attendanceRate: 12 / 13,
  toDate: {
    effectiveNumerator: 12,
    effectiveDenominator: 13,
    attendanceRate: 12 / 13,
  },
  remainingCount: 17,
  allowedAbsences: 8,
  maxDayPeriods: 4,
  allowedAbsenceDays: 2,
};

function renderItem(overrides: Partial<CourseStatsFixture> = {}) {
  const stats = { ...baseStats, ...overrides };
  return render(<CourseListItem stats={stats as any} requiredRate={70} onClick={vi.fn()} />);
}

describe("CourseListItem allowed absence days review contract", () => {
  it("allowedAbsences と allowedAbsenceDays が通常値なら日数を括弧併記する", () => {
    renderItem({ allowedAbsences: 8, allowedAbsenceDays: 2, remainingCount: 17 });

    expect(screen.getByText(/あと8限\s*\(2日\)\s*休める/)).toBeInTheDocument();
  });

  it("allowedAbsenceDays=null なら限のみを表示し、日数括弧を表示しない", () => {
    const { container } = renderItem({ allowedAbsences: 8, allowedAbsenceDays: null, remainingCount: 17 });

    expect(screen.getByText(/あと8限\s*休める/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\(\s*\d+日\s*\)/);
  });

  it("allowedAbsences=0 と allowedAbsenceDays=0 を日数付きで表示する", () => {
    renderItem({ allowedAbsences: 0, allowedAbsenceDays: 0, remainingCount: 17 });

    expect(screen.getByText(/あと0限\s*\(0日\)\s*休める/)).toBeInTheDocument();
  });

  it("allowedAbsences が負なら下回る見込みを表示し、日数を併記しない", () => {
    const { container } = renderItem({ allowedAbsences: -3, allowedAbsenceDays: null, remainingCount: 17 });

    expect(screen.getByText(/下回る見込み/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\(\s*\d+日\s*\)/);
  });

  it("allowedAbsences が remainingCount 以上なら残り全休OKを表示し、日数を併記しない", () => {
    const { container } = renderItem({ allowedAbsences: 20, allowedAbsenceDays: 5, remainingCount: 17 });

    expect(screen.getByText(/残り全休OK/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\(\s*\d+日\s*\)/);
  });

  it("allowedAbsences=null なら従来どおりダッシュを表示する", () => {
    renderItem({ allowedAbsences: null, allowedAbsenceDays: null, remainingCount: 17 });

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
