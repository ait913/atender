import { rateColor } from "@/lib/attendanceRateColor";

describe("rateColor review contract", () => {
  it("uses tertiary for null, accent for achieved, absent for below required, and never uses present green", () => {
    const cases = [
      [null, 70, "var(--color-fg-tertiary)"],
      [70, 70, "var(--color-accent-500)"],
      [92, 70, "var(--color-accent-500)"],
      [69, 70, "var(--color-status-absent)"],
      [65, 70, "var(--color-status-absent)"],
      [50, 70, "var(--color-status-absent)"],
      [90, 90, "var(--color-accent-500)"],
      [89, 90, "var(--color-status-absent)"],
    ] as const;

    const actual = cases.map(([pct, requiredRate, expected]) => {
      const color = rateColor(pct, requiredRate);
      expect(color).toBe(expected);
      return color;
    });

    expect(actual.every((color) => color !== "var(--color-status-present)")).toBe(true);
  });
});
