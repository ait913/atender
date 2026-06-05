import { statusVisual } from "@/lib/dayStatusVisual";

describe("statusVisual", () => {
  it.each([
    ["ALL_PRESENT", "○", "--color-status-present", "12%"],
    ["HAS_ABSENT", "×", "--color-status-absent", "16%"],
    ["HAS_TARDY", "△", "--color-status-tardy", "16%"],
    ["ALL_SUSPENDED", "／", "--color-status-cancelled", "14%"],
    ["PARTIAL_UNRECORDED", "·", "--color-status-none", "10%"],
  ] as const)("maps %s to the designed marker and color-mix background", (status, marker, token, percent) => {
    const visual = statusVisual(status);

    expect(visual.marker).toBe(marker);
    expect(visual.bg).toContain(token);
    expect(visual.bg).toContain(percent);
    expect(visual.markerColor).toContain(token);
  });

  it("maps NO_CLASS to no background and no marker", () => {
    const visual = statusVisual("NO_CLASS");

    expect(visual.bg == null || visual.bg === "").toBe(true);
    expect(visual.marker == null || visual.marker === "").toBe(true);
  });
});
