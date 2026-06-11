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
    maxDayPeriods: 2,
    allowedAbsenceDays: 1,
    ...overrides,
  };
}

function expectTextStyled(container: HTMLElement, text: string | RegExp, token: string) {
  const textNode = screen.getByText(text);
  const styled = textNode.closest(`[style*="${token}"]`) ?? container.querySelector(`[style*="${token}"]`);
  expect(styled).toBeInTheDocument();
}

describe("CourseListItem review contract", () => {
  it("renders an unrecorded badge next to the course name and keeps unrecorded out of the summary row", () => {
    const { container } = render(<CourseListItem stats={stats(0.7) as any} requiredRate={70} onClick={vi.fn()} />);

    expect(screen.getByLabelText("未記録 1 件")).toBeInTheDocument();
    expect(screen.getByLabelText("未記録 1 件").querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText(/未1/)).toBeNull();
    expect(container.textContent).not.toContain("未1");
  });

  it("hides the unrecorded badge and renders present/absent counts when unrecorded is zero", () => {
    render(
      <CourseListItem
        stats={stats(0.7, { counts: { ...stats(0.7).counts, unrecorded: 0 } }) as any}
        requiredRate={70}
        onClick={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/未記録/)).toBeNull();
    expect(screen.getByText(/出7\s*欠4/)).toBeInTheDocument();
  });

  it("colors achieved rate with accent and below-required rate with absent", () => {
    const { container, unmount } = render(
      <CourseListItem stats={stats(0.92) as any} requiredRate={70} onClick={vi.fn()} />,
    );

    expect(screen.getByText("92")).toBeInTheDocument();
    expectTextStyled(container, "92", "var(--color-accent-500)");

    unmount();
    const second = render(<CourseListItem stats={stats(0.64) as any} requiredRate={70} onClick={vi.fn()} />);

    expect(screen.getByText("64")).toBeInTheDocument();
    expectTextStyled(second.container, "64", "var(--color-status-absent)");
  });

  it("renders count summary from stats.counts without unrecorded count in the summary", () => {
    const { container } = render(<CourseListItem stats={stats(0.7) as any} requiredRate={70} onClick={vi.fn()} />);

    expect(screen.getByText(/出7\s*欠4/)).toBeInTheDocument();
    expect(container.textContent).not.toContain("未1");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<CourseListItem stats={stats(0.7) as any} requiredRate={70} onClick={onClick} />);

    fireEvent.click(screen.getByText("データベース"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("colors all-absent-ok action text with accent and below-projection text with absent", () => {
    const { container, unmount } = render(
      <CourseListItem
        stats={stats(0.92, { allowedAbsences: 5, remainingCount: 5 }) as any}
        requiredRate={70}
        onClick={vi.fn()}
      />,
    );

    expectTextStyled(container, /全休|全部|休んでも|OK/, "var(--color-accent-500)");

    unmount();
    const second = render(
      <CourseListItem stats={stats(0.64, { allowedAbsences: -1 }) as any} requiredRate={70} onClick={vi.fn()} />,
    );

    expectTextStyled(second.container, /下回る見込み|届きません|下回る/, "var(--color-status-absent)");
  });
});
