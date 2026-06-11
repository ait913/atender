/**
 * 設計不足: DayDetailSheet が使う mutation hook の import パス/名称は設計docに明記されていない。
 * useDayDetail(date) の存在だけが明記されているため、既存 hook 集約エントリ "@/api/hooks" を best-effort でモックする。
 */
import { fireEvent, render, screen } from "@testing-library/react";

import { DayDetailSheet } from "@/components/semester/DayDetailSheet";
import {
  useCreateCourseSuspension,
  useCreatePersonalEvent,
  useCreateTimetableSuspension,
  useDayDetail,
  useDeleteAttendance,
  useDeleteCourseSuspension,
  useDeletePersonalEvent,
  useDeleteTimetableSuspension,
  useMarkAllPresent,
  usePatchAttendance,
  useUpdatePersonalEvent,
} from "@/api/hooks";

vi.mock("@/api/hooks", () => ({
  useDayDetail: vi.fn(),
  usePatchAttendance: vi.fn(),
  useDeleteAttendance: vi.fn(),
  useCreateTimetableSuspension: vi.fn(),
  useDeleteTimetableSuspension: vi.fn(),
  useMarkAllPresent: vi.fn(),
  useCreateCourseSuspension: vi.fn(),
  useDeleteCourseSuspension: vi.fn(),
  useDeletePersonalEvent: vi.fn(),
  useCreatePersonalEvent: vi.fn(),
  useUpdatePersonalEvent: vi.fn(),
}));

const occurrence = {
  id: "occ-1",
  meetingId: "meeting-1",
  courseId: "course-1",
  courseName: "OS",
  courseColor: "#60a5fa",
  date: "2026-05-13",
  periodOffset: 0,
  startMinute: 540,
  endMinute: 630,
  room: "305",
  status: null,
};

const baseDetail = {
  date: "2026-05-13",
  occurrences: [occurrence],
  courseSuspensions: [],
  timetableSuspension: null,
  personalEvents: [],
};

function mockHooks(detail = baseDetail) {
  const patchAttendance = vi.fn();
  vi.mocked(useDayDetail).mockReturnValue({ data: detail, isLoading: false, isError: false } as any);
  vi.mocked(usePatchAttendance).mockReturnValue({ mutate: patchAttendance, isPending: false } as any);
  vi.mocked(useDeleteAttendance).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useCreateTimetableSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useDeleteTimetableSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useMarkAllPresent).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useCreateCourseSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useDeleteCourseSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useDeletePersonalEvent).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useCreatePersonalEvent).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as any);
  vi.mocked(useUpdatePersonalEvent).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as any);
  return { patchAttendance };
}

describe("DayDetailSheet", () => {
  it("[#28] disables occurrence status controls and shows a suspension badge while timetable suspension is active", () => {
    mockHooks({
      ...baseDetail,
      timetableSuspension: {
        id: "ts-1",
        userTimetableId: "tt-1",
        date: "2026-05-13",
        reason: null,
        createdAt: "2026-05-13T00:00:00.000Z",
        updatedAt: "2026-05-13T00:00:00.000Z",
      },
    });

    render(<DayDetailSheet date="2026-05-13" onClose={vi.fn()} />);

    expect(screen.getAllByText(/休講中/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "欠" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "出" })).toBeDisabled();
  });

  it("[#28] choosing an attendance status calls the attendance mutation when not suspended", () => {
    const { patchAttendance } = mockHooks();

    render(<DayDetailSheet date="2026-05-13" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /欠/ }));

    expect(patchAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrenceId: "occ-1",
        input: expect.objectContaining({ status: "ABSENT" }),
      }),
    );
  });
});
