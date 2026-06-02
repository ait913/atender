import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  TimetableView,
  type TimetableEventInput,
} from "@/components/timetable/TimetableView";

const daySlots = [
  { periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false },
  { periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false },
  { periodIndex: 3, label: "3限", startMinute: 740, endMinute: 830, isBreak: false },
  { periodIndex: 4, label: "4限", startMinute: 840, endMinute: 930, isBreak: false },
  { periodIndex: 5, label: "5限", startMinute: 940, endMinute: 1030, isBreak: false },
];

function renderTimetable({
  events = [],
  days = [1],
  onEmptyCellClick,
}: {
  events?: TimetableEventInput[];
  days?: number[];
  onEmptyCellClick?: (dayOfWeek: number, periodIndex: number) => void;
} = {}) {
  return render(
    <TimetableView
      daySlots={daySlots as any}
      days={days}
      events={events}
      onEmptyCellClick={onEmptyCellClick}
    />,
  );
}

function eventGridItemByTitle(title: string): HTMLElement {
  let element = screen.getByText(title) as HTMLElement | null;

  while (element && !element.getAttribute("style")?.includes("grid-row")) {
    element = element.parentElement;
  }

  if (!element) {
    throw new Error(`No event grid item found for title: ${title}`);
  }

  return element;
}

describe("TimetableView", () => {
  it("renders a multi-period event with a grid-row span style", () => {
    renderTimetable({
      events: [
        {
          id: "event-1",
          dayOfWeek: 1,
          startPeriodIndex: 1,
          periodCount: 2,
          color: "#10b981",
          title: "数学",
          mergeKey: "c1",
        },
      ],
    });

    expect(eventGridItemByTitle("数学").getAttribute("style")).toContain("span 2");
  });

  it("coalesces adjacent meetings with the same day and mergeKey into one tile", () => {
    renderTimetable({
      events: [
        {
          id: "event-1",
          dayOfWeek: 1,
          startPeriodIndex: 1,
          periodCount: 1,
          color: "#10b981",
          title: "数学",
          mergeKey: "c1",
        },
        {
          id: "event-2",
          dayOfWeek: 1,
          startPeriodIndex: 2,
          periodCount: 1,
          color: "#10b981",
          title: "数学",
          mergeKey: "c1",
        },
      ],
    });

    expect(screen.getAllByText("数学")).toHaveLength(1);
  });

  it("keeps events with different mergeKeys side-by-side in the same cell", () => {
    renderTimetable({
      events: [
        {
          id: "event-1",
          dayOfWeek: 1,
          startPeriodIndex: 1,
          periodCount: 1,
          color: "#10b981",
          title: "英語",
          mergeKey: "c1",
        },
        {
          id: "event-2",
          dayOfWeek: 1,
          startPeriodIndex: 1,
          periodCount: 1,
          color: "#38bdf8",
          title: "国語",
          mergeKey: "c2",
        },
      ],
    });

    const wrapper = eventGridItemByTitle("英語");

    expect(within(wrapper).getByText("英語")).toBeInTheDocument();
    expect(within(wrapper).getByText("国語")).toBeInTheDocument();
  });

  it("does not render an empty-cell button for the continuation period of a spanning event", () => {
    const onEmptyCellClick = vi.fn();

    renderTimetable({
      events: [
        {
          id: "event-1",
          dayOfWeek: 1,
          startPeriodIndex: 1,
          periodCount: 2,
          color: "#10b981",
          title: "数学",
          mergeKey: "c1",
        },
      ],
      onEmptyCellClick,
    });

    for (const button of screen.queryAllByRole("button", { name: "+" })) {
      fireEvent.click(button);
    }

    expect(onEmptyCellClick).not.toHaveBeenCalledWith(1, 2);
  });

  it("calls onEmptyCellClick with dayOfWeek and periodIndex number arguments", () => {
    const onEmptyCellClick = vi.fn();

    renderTimetable({ onEmptyCellClick });

    fireEvent.click(screen.getAllByRole("button", { name: "+" })[0]);

    expect(onEmptyCellClick).toHaveBeenCalledWith(1, 1);
  });

  it("does not place the spanning event block under an overflow-hidden parent", () => {
    renderTimetable({
      events: [
        {
          id: "event-1",
          dayOfWeek: 1,
          startPeriodIndex: 1,
          periodCount: 2,
          color: "#10b981",
          title: "数学",
          mergeKey: "c1",
        },
      ],
    });

    const eventBlock = eventGridItemByTitle("数学");

    expect(eventBlock.parentElement?.className).toContain("grid");
    expect(eventBlock.parentElement).toContainElement(eventBlock);
  });
});
