import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AttendanceCalendarSkeleton,
  CalendarMonthSkeleton,
  ListSkeleton,
  TextLineSkeleton,
  TimetableGridSkeleton,
} from "@/components/ui/skeletons";

function hiddenSkeletons(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[aria-hidden="true"]'));
}

describe("skeleton composites", () => {
  it("TimetableGridSkeleton exposes loading status and a seven-day grid style", () => {
    const { container } = render(<TimetableGridSkeleton days={7} />);
    const status = screen.getByRole("status");

    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-label", "読み込み中");
    const gridTemplateColumns = Array.from(container.querySelectorAll<HTMLElement>("*"))
      .map((element) => element.style.gridTemplateColumns)
      .find((value) => value.includes("44px repeat(7"));
    expect(gridTemplateColumns).toContain("44px repeat(7");
    expect(hiddenSkeletons(container).length).toBeGreaterThan(1);
  });

  it("CalendarMonthSkeleton exposes busy state and enough cells for a month grid", () => {
    const { container } = render(<CalendarMonthSkeleton />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(hiddenSkeletons(container).length).toBeGreaterThanOrEqual(35);
  });

  it("AttendanceCalendarSkeleton exposes loading status", () => {
    const { container } = render(<AttendanceCalendarSkeleton />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(hiddenSkeletons(container).length).toBeGreaterThan(1);
  });

  it("ListSkeleton renders the requested number of rows", () => {
    const { container } = render(<ListSkeleton rows={3} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(hiddenSkeletons(container)).toHaveLength(3);
  });

  it("TextLineSkeleton renders one loading line", () => {
    const { container } = render(<TextLineSkeleton />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(hiddenSkeletons(container)).toHaveLength(1);
  });
});
