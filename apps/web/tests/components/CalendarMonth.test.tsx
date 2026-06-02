import dayjs from "dayjs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { CalendarMonth } from "@/components/rooms/calendar/CalendarMonth";

function meeting(overrides: Partial<any> = {}) {
  return {
    kind: "meeting",
    userId: "",
    memberName: "自分",
    memberColor: overrides.memberColor ?? "#10b981",
    courseId: overrides.courseId ?? "c1",
    courseName: overrides.courseName ?? "数学",
    courseColor: overrides.courseColor ?? "#10b981",
    date: overrides.date ?? "2026-06-02",
    startMinute: overrides.startMinute ?? 540,
    endMinute: overrides.endMinute ?? 630,
  };
}

function renderMonth(props: Partial<React.ComponentProps<typeof CalendarMonth>> = {}) {
  return render(
    <CalendarMonth
      anchor={dayjs("2026-06-01") as any}
      selectedDate="2026-06-02"
      events={[]}
      onSelectDate={vi.fn()}
      {...(props as any)}
    />,
  );
}

function dayCell(dayText: string): HTMLElement {
  const candidates = screen.getAllByRole("button").filter((button) => {
    return within(button).queryByText(dayText) !== null;
  });
  if (candidates.length === 0) throw new Error(`No day cell for ${dayText}`);
  return candidates[0];
}

describe("CalendarMonth", () => {
  it("renders date numbers without event chips or overflow counters when there are no events", () => {
    renderMonth();

    expect(screen.queryByText("数学")).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("shows up to maxChipsPerCell event chips and a +N overflow counter", () => {
    renderMonth({
      maxChipsPerCell: 2,
      events: [
        meeting({ courseName: "数学" }),
        meeting({ courseId: "c2", courseName: "英語", startMinute: 640 }),
        meeting({ courseId: "c3", courseName: "物理", startMinute: 780 }),
      ] as any,
    });

    expect(screen.getByText("数学")).toBeInTheDocument();
    expect(screen.getByText("英語")).toBeInTheDocument();
    expect(screen.queryByText("物理")).not.toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("does not show an overflow counter for a single event", () => {
    renderMonth({ events: [meeting()] as any });

    expect(screen.getByText("数学")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("calls onSelectDate with the clicked date", () => {
    const onSelectDate = vi.fn();
    renderMonth({ onSelectDate });

    fireEvent.click(dayCell("2"));

    expect(onSelectDate).toHaveBeenCalledWith("2026-06-02");
  });

  it("does not render chips or status dots for out-of-month cells", () => {
    renderMonth({
      events: [meeting({ date: "2026-05-31", courseName: "前月授業" })] as any,
      statusByDate: new Map([["2026-05-31", "HAS_ABSENT"]]),
    });

    expect(screen.queryByText("前月授業")).not.toBeInTheDocument();
    expect(
      document.querySelector('[style*="var(--color-status-absent)"]'),
    ).not.toBeInTheDocument();
  });

  it("renders the month grid as an elevated card", () => {
    const { container } = renderMonth();

    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain("bg-bg-elevated");
    expect(root.className).toContain("shadow-card");
  });

  it("adds truncate to event chip elements", () => {
    renderMonth({ events: [meeting({ courseName: "とても長い授業名" })] as any });

    expect(screen.getByText("とても長い授業名").className).toContain("truncate");
  });

  it("renders a status dot for HAS_ABSENT and no dot for NO_CLASS or missing status", () => {
    renderMonth({
      statusByDate: new Map([
        ["2026-06-02", "HAS_ABSENT"],
        ["2026-06-03", "NO_CLASS"],
      ]),
    });

    expect(document.querySelector('[style*="var(--color-status-absent)"]')).toBeInTheDocument();
    expect(
      document.querySelector('[style*="var(--color-status-none)"]'),
    ).not.toBeInTheDocument();
  });
});
