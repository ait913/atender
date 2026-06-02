import { render, screen } from "@testing-library/react";
import { EventTile } from "@/components/event-tile/EventTile";

describe("EventTile", () => {
  it("uses the radius prop as an inline borderRadius and omits rounded-md", () => {
    const { container } = render(
      <EventTile
        title="数学"
        color="#10b981"
        radius="var(--radius-timetable-cell)"
      />,
    );

    const tile = container.firstElementChild as HTMLElement;

    expect(tile).toBeInTheDocument();
    expect(screen.getByText("数学")).toBeInTheDocument();
    expect(tile?.style.borderRadius).toBe("var(--radius-timetable-cell)");
    expect(tile?.className).not.toContain("rounded-md");
  });

  it("keeps the previous rounded-md default when radius is omitted", () => {
    const { container } = render(<EventTile title="数学" color="#10b981" />);

    const tile = container.firstElementChild as HTMLElement;

    expect(tile).toBeInTheDocument();
    expect(screen.getByText("数学")).toBeInTheDocument();
    expect(tile?.className).toContain("rounded-md");
    expect(tile?.style.borderRadius).toBe("");
  });
});
