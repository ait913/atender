import { fireEvent, render, screen } from "@testing-library/react";
import { CourseListItem } from "@/components/semester/CourseListItem";

function stats(rate: number | null, overrides: Partial<any> = {}) {
  return {
    courseId: "course-1",
    courseName: "データベース",
    teacher: "山田",
    generatedOccurrences: 15,
    counts: {
      present: 7,
      absent: 4,
      excused: 0,
      tardy: 0,
      earlyLeave: 0,
      cancelled: 0,
      unrecorded: 1,
    },
    effectiveNumerator: 0,
    effectiveDenominator: 0,
    attendanceRate: null,
    toDate: {
      effectiveNumerator: rate == null ? 0 : rate * 10,
      effectiveDenominator: rate == null ? 0 : 10,
      attendanceRate: rate,
    },
    remainingCount: 5,
    allowedAbsences: 2,
    ...overrides,
  };
}

describe("CourseListItem", () => {
  it.each([
    [0.92, "92", "--color-accent-500"],
    [0.59, "59", "--color-status-absent"],
    [0.66, "66", "--color-status-absent"],
  ] as const)("renders %s with required-rate-aware color", (rate, text, token) => {
    const { container } = render(<CourseListItem stats={stats(rate) as any} requiredRate={70} onClick={vi.fn()} />);

    // 仕様 #46
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.querySelector(`[style*="${token}"]`)).toBeInTheDocument();
  });

  it("renders count summary from stats.counts", () => {
    render(<CourseListItem stats={stats(0.7) as any} requiredRate={70} onClick={vi.fn()} />);

    // 仕様 #47
    expect(screen.getByText(/出7\s*欠4/)).toBeInTheDocument();
    expect(screen.queryByText(/未1/)).not.toBeInTheDocument();
  });

  it("calls onClick when the row is clicked", () => {
    const onClick = vi.fn();
    render(<CourseListItem stats={stats(0.7) as any} requiredRate={70} onClick={onClick} />);

    fireEvent.click(screen.getByText("データベース"));

    // 仕様 #48
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
