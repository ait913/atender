import { render, screen } from "@testing-library/react";
import { SemesterOverviewSkeleton } from "@/components/ui/skeletons";

describe("SemesterOverviewSkeleton", () => {
  it("exposes loading status and mirrors hero calendar and course-list structure", () => {
    const { container } = render(<SemesterOverviewSkeleton />);

    // 仕様 #67
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-label", "読み込み中");
    expect(container.querySelector(".grid-cols-7")).toBeInTheDocument();
    expect(container.querySelectorAll(".aspect-square").length).toBeGreaterThanOrEqual(42);
  });
});
