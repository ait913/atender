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

type CountOverrides = Partial<{
  present: number;
  absent: number;
  excused: number;
  tardy: number;
  earlyLeave: number;
  suspended: number;
  unrecorded: number;
}>;

function summary(date: string, overrides: CountOverrides) {
  const counts = {
    present: 0,
    absent: 0,
    excused: 0,
    tardy: 0,
    earlyLeave: 0,
    suspended: 0,
    unrecorded: 0,
    ...overrides,
  };
  const occurrenceCount = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { date, status: "NO_CLASS" as const, occurrenceCount, counts };
}

function summaries(spec: Record<string, CountOverrides>) {
  return new Map(Object.entries(spec).map(([date, counts]) => [date, summary(date, counts)]));
}

/** ドット = 葉ノードで inline style に status トークンを持つ要素 (親要素の二重計上を避ける) */
function dots(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>("[style]"))
    .filter((element) => element.children.length === 0)
    .filter((element) => /var\(--color-status-/.test(element.getAttribute("style") ?? ""));
}

function dotColors(elements: HTMLElement[]): string[] {
  return elements.map((element) => {
    const match = /var\(--color-status-[a-z-]+\)/.exec(element.getAttribute("style") ?? "");
    return match ? match[0] : "";
  });
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

  it("[P4] does not render chips or status dots for out-of-month cells", () => {
    renderMonth({
      events: [meeting({ date: "2026-05-31", courseName: "前月授業" })] as any,
      daySummaries: summaries({ "2026-05-31": { absent: 1 } }),
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

  // §5.9 P1-P3 / P5-P8 — 設計doc: .designs/20260729-semester-calendar-multi-status.md
  it("[P1] renders one dot per mark in severity order", () => {
    renderMonth({ daySummaries: summaries({ "2026-06-02": { absent: 1, present: 1 } }) });

    const cellDots = dots(dayCell("2"));

    expect(cellDots).toHaveLength(2);
    expect(dotColors(cellDots)).toEqual([
      "var(--color-status-absent)",
      "var(--color-status-present)",
    ]);
  });

  it("[P2] renders no dot when every count is zero (NO_CLASS)", () => {
    renderMonth({ daySummaries: summaries({ "2026-06-02": {} }) });

    expect(dots(dayCell("2"))).toHaveLength(0);
  });

  it("[P3] renders no dot for a date missing from daySummaries", () => {
    renderMonth({ daySummaries: summaries({ "2026-06-02": { absent: 1 } }) });

    expect(dots(dayCell("3"))).toHaveLength(0);
  });

  it("[P5] caps the dots at three even with four or more marks", () => {
    renderMonth({
      daySummaries: summaries({
        "2026-06-02": { absent: 1, excused: 1, tardy: 1, suspended: 1, present: 1 },
      }),
    });

    const cellDots = dots(dayCell("2"));

    expect(cellDots).toHaveLength(3);
    expect(dotColors(cellDots)).toEqual([
      "var(--color-status-absent)",
      "var(--color-status-excused)",
      "var(--color-status-tardy)",
    ]);
  });

  it("[P6] renders the excused colour for an excused-only day", () => {
    renderMonth({ daySummaries: summaries({ "2026-06-02": { excused: 1 } }) });

    const cellDots = dots(dayCell("2"));

    expect(dotColors(cellDots)).toEqual(["var(--color-status-excused)"]);
    expect(dotColors(cellDots)).not.toContain("var(--color-status-present)");
  });

  it("[P7] renders no dot at all when daySummaries is omitted (room detail)", () => {
    renderMonth({ events: [meeting()] as any });

    expect(document.querySelector('[style*="var(--color-status-"]')).not.toBeInTheDocument();
  });

  it("[P8] keeps chips, +N overflow, and cell styling unchanged when daySummaries is supplied", () => {
    const events = [
      meeting({ courseName: "数学" }),
      meeting({ courseId: "c2", courseName: "英語", startMinute: 640 }),
      meeting({ courseId: "c3", courseName: "物理", startMinute: 780 }),
    ] as any;

    const before = renderMonth({ maxChipsPerCell: 2, events });
    const baselineSelected = dayCell("2").className;
    const baselineOther = dayCell("5").className;
    before.unmount();

    renderMonth({
      maxChipsPerCell: 2,
      events,
      daySummaries: summaries({ "2026-06-02": { absent: 1, present: 1 } }),
    });

    expect(screen.getByText("数学")).toBeInTheDocument();
    expect(screen.getByText("英語")).toBeInTheDocument();
    expect(screen.queryByText("物理")).not.toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(dayCell("2").className).toBe(baselineSelected);
    expect(dayCell("5").className).toBe(baselineOther);
  });
});
