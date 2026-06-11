import dayjs from "dayjs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PeriodNav } from "@/components/rooms/calendar/PeriodNav";

describe("PeriodNav", () => {
  it("renders the previous button with a ChevronLeft icon and no full-width arrow text", () => {
    render(<PeriodNav viewMode="month" anchor={dayjs("2026-06-11")} onChange={vi.fn()} />);
    const previous = screen.getByRole("button", { name: "前へ" });

    expect(previous.querySelector(".lucide-chevron-left")).toBeInTheDocument();
    expect(previous).not.toHaveTextContent("＜");
  });

  it("renders the next button with a ChevronRight icon and no full-width arrow text", () => {
    render(<PeriodNav viewMode="month" anchor={dayjs("2026-06-11")} onChange={vi.fn()} />);
    const next = screen.getByRole("button", { name: "次へ" });

    expect(next.querySelector(".lucide-chevron-right")).toBeInTheDocument();
    expect(next).not.toHaveTextContent("＞");
  });

  it("moves one month back from the anchor in month view", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PeriodNav viewMode="month" anchor={dayjs("2026-06-11")} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "前へ" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].format("YYYY-MM-DD")).toBe("2026-05-11");
  });
});
