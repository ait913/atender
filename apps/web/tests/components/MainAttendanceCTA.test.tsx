import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { MainAttendanceCTA } from "@/components/today/MainAttendanceCTA";

type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "TARDY" | "EARLY_LEAVE" | "CANCELLED";

type OccurrenceDto = {
  id: string;
  meetingId: string;
  courseId: string;
  courseName: string;
  teacher: string;
  room: string;
  color: string;
  date: string;
  periodIndex: number;
  periodOffset: number;
  startMinute: number;
  endMinute: number;
  status: AttendanceStatus | null;
};

function occurrence(index: number, status: AttendanceStatus | null = null): OccurrenceDto {
  return {
    id: `occ-${index}`,
    meetingId: `meeting-${index}`,
    courseId: `course-${index}`,
    courseName: `授業${index}`,
    teacher: `先生${index}`,
    room: `教室${index}`,
    color: "#f97316",
    date: "2026-06-11",
    periodIndex: index,
    periodOffset: index - 1,
    startMinute: 540 + index * 100,
    endMinute: 630 + index * 100,
    status,
  };
}

function renderCTA(
  props: Partial<React.ComponentProps<typeof MainAttendanceCTA>> = {},
  occurrences: OccurrenceDto[] = [occurrence(1), occurrence(2), occurrence(3)],
) {
  return render(
    <MainAttendanceCTA
      occurrences={occurrences as never}
      expanded={false}
      onToggle={vi.fn()}
      onMarkAll={vi.fn()}
      onChangeStatus={vi.fn()}
      {...props}
    />,
  );
}

function fixedSection(container: HTMLElement): HTMLElement {
  const sections = Array.from(container.querySelectorAll<HTMLElement>("section.fixed"));
  expect(sections).toHaveLength(1);
  return sections[0];
}

describe("MainAttendanceCTA layout", () => {
  it("renders one fixed section and no sticky section", () => {
    const { container } = renderCTA();

    fixedSection(container);
    expect(container.querySelector(".sticky")).not.toBeInTheDocument();
  });

  it("places the CTA at the bottom on mobile and desktop", () => {
    const { container } = renderCTA();

    expect(fixedSection(container)).toHaveClass(
      "bottom-[var(--tab-bar-height)]",
      "md:bottom-0",
      "md:left-60",
    );
  });

  it("shows ChevronUp on the collapsed individual-edit toggle", () => {
    renderCTA({ expanded: false });
    const toggle = screen.getByRole("button", { name: "個別修正を開く" });

    expect(toggle.querySelector(".lucide-chevron-up")).toBeInTheDocument();
  });

  it("shows ChevronDown on the expanded individual-edit toggle", () => {
    renderCTA({ expanded: true });
    const toggle = screen.getByRole("button", { name: "個別修正を閉じる" });

    expect(toggle.querySelector(".lucide-chevron-down")).toBeInTheDocument();
  });

  it("renders the expanded panel before the CTA buttons", () => {
    renderCTA({ expanded: true });
    const panelContent = screen.getByText("授業1");
    const mainButton = screen.getByRole("button", { name: "今日は全出席 (3)" });

    expect(
      panelContent.compareDocumentPosition(mainButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the unrecorded count in the main button", () => {
    renderCTA();

    expect(screen.getByRole("button", { name: "今日は全出席 (3)" })).toBeInTheDocument();
  });

  it("disables the main button when every occurrence is recorded", () => {
    renderCTA({}, [occurrence(1, "PRESENT"), occurrence(2, "ABSENT"), occurrence(3, "TARDY")]);

    expect(screen.getByRole("button", { name: "本日の記録は完了済" })).toBeDisabled();
  });
});

describe("MainAttendanceCTA bulk status menu", () => {
  it("renders an enabled menu trigger for unrecorded occurrences", () => {
    renderCTA();
    const trigger = screen.getByRole("button", { name: "一括記録のステータスを選ぶ" });

    expect(trigger).toBeEnabled();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the bulk status menu from the trigger", async () => {
    const user = userEvent.setup();
    renderCTA();
    const trigger = screen.getByRole("button", { name: "一括記録のステータスを選ぶ" });

    await user.click(trigger);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the four non-present, non-cancelled menu items in order", async () => {
    const user = userEvent.setup();
    renderCTA();

    await user.click(screen.getByRole("button", { name: "一括記録のステータスを選ぶ" }));

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems).toHaveLength(4);
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "全部 欠席 (3)",
      "全部 公欠 (3)",
      "全部 遅刻 (3)",
      "全部 早退 (3)",
    ]);
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText(/休講/)).not.toBeInTheDocument();
    expect(within(menu).queryByText(/出席/)).not.toBeInTheDocument();
  });

  it("marks all ABSENT and closes the menu when the absent item is clicked", async () => {
    const user = userEvent.setup();
    const onMarkAll = vi.fn();
    renderCTA({ onMarkAll });

    await user.click(screen.getByRole("button", { name: "一括記録のステータスを選ぶ" }));
    await user.click(screen.getByRole("menuitem", { name: "全部 欠席 (3)" }));

    expect(onMarkAll).toHaveBeenCalledTimes(1);
    expect(onMarkAll).toHaveBeenCalledWith("ABSENT");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks all PRESENT from the main button without opening the menu", async () => {
    const user = userEvent.setup();
    const onMarkAll = vi.fn();
    renderCTA({ onMarkAll });

    await user.click(screen.getByRole("button", { name: "今日は全出席 (3)" }));

    expect(onMarkAll).toHaveBeenCalledWith("PRESENT");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu on Escape", async () => {
    const user = userEvent.setup();
    renderCTA();

    await user.click(screen.getByRole("button", { name: "一括記録のステータスを選ぶ" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu on outside pointerdown", async () => {
    const user = userEvent.setup();
    renderCTA();

    await user.click(screen.getByRole("button", { name: "一括記録のステータスを選ぶ" }));
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("disables both bulk controls while pending and does not open the menu", async () => {
    const user = userEvent.setup();
    renderCTA({ pending: true });
    const mainButton = screen.getByRole("button", { name: "今日は全出席 (3)" });
    const trigger = screen.getByRole("button", { name: "一括記録のステータスを選ぶ" });

    expect(mainButton).toBeDisabled();
    expect(trigger).toBeDisabled();

    await user.click(trigger);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("disables the menu trigger when there are no unrecorded occurrences", () => {
    renderCTA({}, [occurrence(1, "PRESENT")]);

    expect(screen.getByRole("button", { name: "一括記録のステータスを選ぶ" })).toBeDisabled();
  });
});
