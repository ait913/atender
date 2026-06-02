import { dayStatusColor, eventColor, eventTitle } from "@/lib/calendarEventDisplay";

describe("calendarEventDisplay", () => {
  it("uses memberColor for meeting events", () => {
    expect(
      eventColor({
        kind: "meeting",
        memberColor: "#10b981",
        courseName: "数学",
      } as any),
    ).toBe("#10b981");
  });

  it("uses authorColor for personal events", () => {
    expect(eventColor({ kind: "personal", title: "予定", authorColor: "#f59e0b" } as any)).toBe(
      "#f59e0b",
    );
  });

  it("uses source colors for room events", () => {
    expect(eventColor({ kind: "roomEvent", title: "会議", source: "GOOGLE_OAUTH" } as any)).toBe(
      "#38bdf8",
    );
    expect(eventColor({ kind: "roomEvent", title: "購読", source: "ICS_FILE" } as any)).toBe(
      "#94a3b8",
    );
    expect(eventColor({ kind: "roomEvent", title: "購読", source: "ICS_URL" } as any)).toBe(
      "#94a3b8",
    );
  });

  it("uses courseName as the title for meetings and title for other events", () => {
    expect(eventTitle({ kind: "meeting", courseName: "数学" } as any)).toBe("数学");
    expect(eventTitle({ kind: "personal", title: "歯医者" } as any)).toBe("歯医者");
    expect(eventTitle({ kind: "roomEvent", title: "面談" } as any)).toBe("面談");
  });

  it("maps day statuses to status token colors", () => {
    expect(dayStatusColor("ALL_PRESENT" as any)).toBe("var(--color-status-present)");
    expect(dayStatusColor("HAS_ABSENT" as any)).toBe("var(--color-status-absent)");
    expect(dayStatusColor("HAS_TARDY" as any)).toBe("var(--color-status-tardy)");
    expect(dayStatusColor("ALL_SUSPENDED" as any)).toBe("var(--color-status-cancelled)");
    expect(dayStatusColor("NO_CLASS" as any)).toMatch(/none|transparent/);
    expect(dayStatusColor("UNKNOWN" as any)).toMatch(/none|transparent/);
  });
});
