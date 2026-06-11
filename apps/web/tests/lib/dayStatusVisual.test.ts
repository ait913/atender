import { statusVisual } from "@/lib/dayStatusVisual";

describe("statusVisual v2", () => {
  it.each([
    ["ALL_PRESENT", false, "--color-status-present", "20%", "check", "--color-status-present", false],
    ["HAS_ABSENT", false, "--color-status-absent", "26%", "x", "--color-status-absent", false],
    ["HAS_TARDY", false, "--color-status-tardy", "24%", "clock", "--color-status-tardy", false],
    ["ALL_SUSPENDED", false, "--color-status-suspended", "20%", "ban", "--color-status-suspended", false],
    ["ALL_SUSPENDED", true, "--color-status-suspended", "20%", "ban", "--color-status-suspended", false],
    ["PARTIAL_UNRECORDED", false, "--color-status-none", "12%", "minus", "--color-fg-tertiary", true],
  ] as const)("maps %s future=%s to v2 visual tokens", (status, future, token, percent, icon, iconColor, dashed) => {
    const visual = statusVisual(status, { future });

    // 仕様 #60
    expect(visual.bg).toContain(token);
    expect(visual.bg).toContain(percent);
    expect(visual.icon).toBe(icon);
    expect(visual.iconColor).toContain(iconColor);
    expect(visual.dashed).toBe(dashed);
  });

  it.each(["ALL_PRESENT", "HAS_ABSENT", "HAS_TARDY", "PARTIAL_UNRECORDED"] as const)(
    "suppresses non-suspended future %s",
    (status) => {
      const visual = statusVisual(status, { future: true });

      // 仕様 #60
      expect(visual).toMatchObject({ bg: "", icon: null, dashed: false });
    },
  );

  it.each(["NO_CLASS", undefined] as const)("maps %s to neutral empty visual", (status) => {
    const visual = statusVisual(status as any);

    // 仕様 #60
    expect(visual).toMatchObject({ bg: "", icon: null, dashed: false });
    expect(visual.iconColor).toContain("--color-status-none");
  });
});
