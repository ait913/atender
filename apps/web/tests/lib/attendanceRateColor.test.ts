import { rateColor } from "@/lib/attendanceRateColor";

describe("rateColor", () => {
  it("maps null and required-rate thresholds to semantic color tokens", () => {
    // 仕様 #49
    expect(rateColor(null, 70)).toBe("var(--color-fg-tertiary)");
    expect(rateColor(70, 70)).toBe("var(--color-accent-500)");
    expect(rateColor(69.9, 70)).toBe("var(--color-status-absent)");
    expect(rateColor(59, 70)).toBe("var(--color-status-absent)");
    expect(rateColor(95, 90)).toBe("var(--color-accent-500)");
  });
});
