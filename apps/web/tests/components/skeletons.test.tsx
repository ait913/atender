import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  TimetableGridSkeleton,
} from "@/components/ui/skeletons";

function hiddenSkeletons(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[aria-hidden="true"]'));
}

describe("calendar and timetable skeletons", () => {
  it("TimetableGridSkeleton renders weekday text for a five-day grid", () => {
    render(<TimetableGridSkeleton days={5} rows={5} />);

    expect(screen.getByText("月")).toBeInTheDocument();
    expect(screen.getByText("火")).toBeInTheDocument();
    expect(screen.getByText("水")).toBeInTheDocument();
    expect(screen.getByText("木")).toBeInTheDocument();
    expect(screen.getByText("金")).toBeInTheDocument();
    expect(screen.queryByText("土")).not.toBeInTheDocument();
    expect(screen.queryByText("日")).not.toBeInTheDocument();
  });

  it("TimetableGridSkeleton renders a seven-day grid when requested", () => {
    render(<TimetableGridSkeleton days={7} rows={5} />);
    const grid = screen.getByRole("status").firstElementChild as HTMLElement;

    expect(grid.style.gridTemplateColumns).toContain("44px repeat(7, minmax(0, 1fr))");
    expect(screen.getByText("土")).toBeInTheDocument();
    expect(screen.getByText("日")).toBeInTheDocument();
  });

  it("TimetableGridSkeleton renders sparse placeholders for a five-by-five grid", () => {
    const { container } = render(<TimetableGridSkeleton days={5} rows={5} />);

    // 設計docの規範ルール (dayIndex + rowIndex) % 3 === 0 より、5x5 の本文セルは 8 個。
    // 時限ラベル 5 + 本文 8 = 13 (doc 記載の「9 セル / 計 14」は導出値の誤記)。
    expect(hiddenSkeletons(container)).toHaveLength(13);
  });

  it("TimetableGridSkeleton accepts an explicit height", () => {
    render(<TimetableGridSkeleton days={5} rows={5} height="333px" />);
    const grid = screen.getByRole("status").firstElementChild as HTMLElement;

    expect(grid).toHaveStyle({ height: "333px" });
  });
});
