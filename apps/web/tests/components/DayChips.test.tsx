import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayChips } from "@/components/timetable/DayChips";

describe("DayChips", () => {
  it("renders seven buttons in Monday-first order", () => {
    render(<DayChips value={[]} onChange={vi.fn()} />);

    const buttons = screen.getAllByRole("button");

    expect(buttons).toHaveLength(7);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "月曜日",
      "火曜日",
      "水曜日",
      "木曜日",
      "金曜日",
      "土曜日",
      "日曜日",
    ]);
  });

  it("marks selected weekdays with aria-pressed", () => {
    render(<DayChips value={[1, 2, 3, 4, 5]} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "月曜日" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "火曜日" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "水曜日" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "木曜日" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "金曜日" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "土曜日" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "日曜日" })).toHaveAttribute("aria-pressed", "false");
  });

  it("adds Saturday and returns a sorted value", () => {
    const onChange = vi.fn();
    render(<DayChips value={[1, 2, 3, 4, 5]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "土曜日" }));

    expect(onChange).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6]);
  });

  it("removes a selected Friday", () => {
    const onChange = vi.fn();
    render(<DayChips value={[1, 2, 3, 4, 5]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "金曜日" }));

    expect(onChange).toHaveBeenCalledWith([1, 2, 3, 4]);
  });

  it("disables every button when disabled", () => {
    render(<DayChips value={[1, 2, 3, 4, 5]} onChange={vi.fn()} disabled />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
