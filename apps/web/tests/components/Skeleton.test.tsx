import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  it("renders one pulsing muted div by default", () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstElementChild;

    expect(skeleton).toBeInstanceOf(HTMLDivElement);
    expect(skeleton).toHaveClass("animate-pulse");
    expect(skeleton).toHaveClass("bg-bg-muted");
  });

  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("applies explicit width and height styles", () => {
    const { container } = render(<Skeleton width="44px" height="28px" />);
    const skeleton = container.firstElementChild as HTMLElement;

    expect(skeleton.style.width).toBe("44px");
    expect(skeleton.style.height).toBe("28px");
  });

  it("renders a circle with matching width and height", () => {
    const { container } = render(<Skeleton circle width="28px" />);
    const skeleton = container.firstElementChild as HTMLElement;

    expect(skeleton.style.borderRadius).toBe("9999px");
    expect(skeleton.style.width).toBe("28px");
    expect(skeleton.style.height).toBe("28px");
  });
});
