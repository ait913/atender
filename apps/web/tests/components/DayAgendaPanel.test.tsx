import { render, screen } from "@testing-library/react";
import { DayAgendaPanel } from "@/components/rooms/calendar/DayAgendaPanel";

function meeting(overrides: Partial<any> = {}) {
  return {
    kind: "meeting",
    userId: "",
    memberName: "自分",
    memberColor: "#10b981",
    courseId: "c1",
    courseName: overrides.courseName ?? "数学",
    courseColor: "#10b981",
    date: overrides.date ?? "2026-06-02",
    startMinute: overrides.startMinute ?? 540,
    endMinute: overrides.endMinute ?? 630,
  };
}

describe("DayAgendaPanel", () => {
  it("shows an empty message when there are no events", () => {
    render(<DayAgendaPanel date="2026-06-02" events={[]} />);

    expect(screen.getByText("6/2 の予定")).toBeInTheDocument();
    expect(screen.getByText("予定はありません")).toBeInTheDocument();
  });

  it("shows each event title and HH:MM time range", () => {
    render(
      <DayAgendaPanel
        date="2026-06-02"
        events={[
          meeting({ courseName: "数学", startMinute: 540, endMinute: 630 }),
          meeting({ courseName: "英語", startMinute: 640, endMinute: 730 }),
        ] as any}
      />,
    );

    expect(screen.getByText("数学")).toBeInTheDocument();
    expect(screen.getByText(/09:00[-–]10:30/)).toBeInTheDocument();
    expect(screen.getByText("英語")).toBeInTheDocument();
    expect(screen.getByText(/10:40[-–]12:10/)).toBeInTheDocument();
  });
});
