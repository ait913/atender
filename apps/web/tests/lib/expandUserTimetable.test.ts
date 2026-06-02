import { expandUserTimetable } from "@/lib/meetingExpansion";

const daySlots = [
  { periodIndex: 1, label: "1", startMinute: 540, endMinute: 630, isBreak: false },
  { periodIndex: 2, label: "2", startMinute: 640, endMinute: 730, isBreak: false },
  { periodIndex: 3, label: "3", startMinute: 780, endMinute: 870, isBreak: false },
];

function timetable(overrides?: {
  meetings?: any[];
  courses?: any[];
  daySlots?: any[];
}) {
  return {
    meetings:
      overrides?.meetings ?? [
        { id: "m1", courseId: "c1", dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1 },
      ],
    courses: overrides?.courses ?? [{ id: "c1", name: "数学", color: "#10b981", room: "101" }],
    daySlots: overrides?.daySlots ?? daySlots,
  };
}

describe("expandUserTimetable", () => {
  it("expands a weekly meeting only onto matching weekdays", () => {
    const result = expandUserTimetable({
      timetable: timetable() as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-07",
      semesterStart: "2026-04-01",
      semesterEnd: "2026-09-30",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "meeting",
      date: "2026-06-01",
      courseId: "c1",
      courseName: "数学",
      startMinute: 540,
      endMinute: 630,
      memberColor: "#10b981",
    });
  });

  it("expands multiple weekday meetings in one range", () => {
    const result = expandUserTimetable({
      timetable: timetable({
        meetings: [
          { id: "mon", courseId: "c1", dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1 },
          { id: "wed", courseId: "c1", dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 },
          { id: "fri", courseId: "c1", dayOfWeek: 5, startPeriodIndex: 1, periodCount: 1 },
        ],
      }) as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-07",
    });

    expect(result.map((event) => event.date)).toEqual([
      "2026-06-01",
      "2026-06-03",
      "2026-06-05",
    ]);
  });

  it("uses the final spanned slot endMinute for periodCount greater than one", () => {
    const result = expandUserTimetable({
      timetable: timetable({
        meetings: [{ id: "m1", courseId: "c1", dayOfWeek: 1, startPeriodIndex: 1, periodCount: 2 }],
      }) as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-01",
    });

    expect(result[0]).toMatchObject({ startMinute: 540, endMinute: 730 });
  });

  it("does not expand NO_CLASS days", () => {
    const result = expandUserTimetable({
      timetable: timetable() as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-01",
      statusByDate: new Map([["2026-06-01", "NO_CLASS"]]),
    });

    expect(result).toHaveLength(0);
  });

  it("expands ALL_SUSPENDED days as scheduled meetings", () => {
    const result = expandUserTimetable({
      timetable: timetable() as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-01",
      statusByDate: new Map([["2026-06-01", "ALL_SUSPENDED"]]),
    });

    expect(result).toHaveLength(1);
  });

  it("excludes dates outside the semester range", () => {
    const result = expandUserTimetable({
      timetable: timetable() as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-01",
      semesterStart: "2026-06-02",
      semesterEnd: "2026-09-30",
    });

    expect(result).toHaveLength(0);
  });

  it("does not expand matching weekdays outside the requested range", () => {
    const result = expandUserTimetable({
      timetable: timetable() as any,
      rangeStart: "2026-06-02",
      rangeEnd: "2026-06-07",
    });

    expect(result).toHaveLength(0);
  });

  it("skips meetings whose course is missing", () => {
    const result = expandUserTimetable({
      timetable: timetable({ courses: [] }) as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-01",
    });

    expect(result).toHaveLength(0);
  });

  it("skips meetings whose start daySlot is missing", () => {
    const result = expandUserTimetable({
      timetable: timetable({ daySlots: daySlots.filter((slot) => slot.periodIndex !== 1) }) as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-01",
    });

    expect(result).toHaveLength(0);
  });

  it("falls back to a non-empty memberColor when course.color is null", () => {
    const result = expandUserTimetable({
      timetable: timetable({ courses: [{ id: "c1", name: "数学", color: null }] }) as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-01",
    });

    expect(result[0].memberColor).not.toBeNull();
    expect(result[0].memberColor).not.toBeUndefined();
    expect(typeof result[0].memberColor).toBe("string");
    expect(result[0].memberColor).not.toBe("");
  });

  it("sorts output by date and startMinute", () => {
    const result = expandUserTimetable({
      timetable: timetable({
        meetings: [
          { id: "fri-2", courseId: "c1", dayOfWeek: 5, startPeriodIndex: 2, periodCount: 1 },
          { id: "mon-2", courseId: "c1", dayOfWeek: 1, startPeriodIndex: 2, periodCount: 1 },
          { id: "mon-1", courseId: "c1", dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1 },
        ],
      }) as any,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-05",
    });

    expect(result.map((event) => `${event.date}:${event.startMinute}`)).toEqual([
      "2026-06-01:540",
      "2026-06-01:640",
      "2026-06-05:640",
    ]);
  });
});
