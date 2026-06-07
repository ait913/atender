import { describe, expect, it } from "vitest";
import {
  displayDowToJs,
  jsDowToDisplay,
  resolveDisplayDays,
} from "@/components/timetable/dayConvention";

describe("dayConvention", () => {
  it("converts JS day-of-week values to display day-of-week values", () => {
    expect(jsDowToDisplay(0)).toBe(7);
    expect(jsDowToDisplay(1)).toBe(1);
    expect(jsDowToDisplay(2)).toBe(2);
    expect(jsDowToDisplay(3)).toBe(3);
    expect(jsDowToDisplay(4)).toBe(4);
    expect(jsDowToDisplay(5)).toBe(5);
    expect(jsDowToDisplay(6)).toBe(6);
  });

  it("converts display day-of-week values to JS day-of-week values", () => {
    expect(displayDowToJs(7)).toBe(0);
    expect(displayDowToJs(1)).toBe(1);
    expect(displayDowToJs(2)).toBe(2);
    expect(displayDowToJs(3)).toBe(3);
    expect(displayDowToJs(4)).toBe(4);
    expect(displayDowToJs(5)).toBe(5);
    expect(displayDowToJs(6)).toBe(6);
  });

  it("round-trips JS day-of-week values through display convention", () => {
    for (const jsDow of [0, 1, 2, 3, 4, 5, 6]) {
      expect(displayDowToJs(jsDowToDisplay(jsDow))).toBe(jsDow);
    }
  });

  it("resolves default weekdays when there are no meetings", () => {
    expect(resolveDisplayDays({ daysOfWeek: [1, 2, 3, 4, 5], meetings: [] })).toEqual([1, 2, 3, 4, 5]);
  });

  it("adds Saturday when a JS Saturday meeting exists", () => {
    expect(resolveDisplayDays({ daysOfWeek: [1, 2, 3, 4, 5], meetings: [{ dayOfWeek: 6 }] })).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("adds Sunday as display day 7 when a JS Sunday meeting exists", () => {
    expect(resolveDisplayDays({ daysOfWeek: [1, 2, 3, 4, 5], meetings: [{ dayOfWeek: 0 }] })).toEqual([
      1, 2, 3, 4, 5, 7,
    ]);
  });

  it("deduplicates meeting days already present in settings", () => {
    expect(resolveDisplayDays({ daysOfWeek: [1, 3], meetings: [{ dayOfWeek: 1 }] })).toEqual([1, 3]);
  });

  it("falls back to weekdays when settings and meetings are empty", () => {
    expect(resolveDisplayDays({ daysOfWeek: [], meetings: [] })).toEqual([1, 2, 3, 4, 5]);
  });
});
