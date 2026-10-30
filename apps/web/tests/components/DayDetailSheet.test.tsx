/**
 * 設計不足: DayDetailSheet が使う mutation hook の import パス/名称は設計docに明記されていない。
 * useDayDetail(date) の存在だけが明記されているため、既存 hook 集約エントリ "@/api/hooks" を best-effort でモックする。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DayDetailSheet } from "@/components/semester/DayDetailSheet";
import {
  useCreateCourseSuspension,
  useCreatePersonalEvent,
  useCreateTimetableSuspension,
  useBulkMarkAttendance,
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
  // 授業変更 (web-parity §5.7) の hook。既存テストの対象外なので何もしない mutation を返す
  useDeleteClassTransfer: () => ({ mutate: () => {}, reset: () => {}, isPending: false }),
  useCreateClassTransfer: () => ({ mutate: () => {}, reset: () => {}, mutateAsync: async () => ({}), isPending: false }),
  useDayDetail: vi.fn(),
  usePatchAttendance: vi.fn(),
  useDeleteAttendance: vi.fn(),
  useCreateTimetableSuspension: vi.fn(),
  useDeleteTimetableSuspension: vi.fn(),
  useBulkMarkAttendance: vi.fn(),
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
  const bulk = vi.fn();
  vi.mocked(useDayDetail).mockReturnValue({ data: detail, isLoading: false, isError: false } as any);
  vi.mocked(usePatchAttendance).mockReturnValue({ mutate: patchAttendance, isPending: false } as any);
  vi.mocked(useDeleteAttendance).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useCreateTimetableSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useDeleteTimetableSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useBulkMarkAttendance).mockReturnValue({ mutate: bulk, isPending: false } as any);
  vi.mocked(useMarkAllPresent).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useCreateCourseSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useDeleteCourseSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useDeletePersonalEvent).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useCreatePersonalEvent).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as any);
  vi.mocked(useUpdatePersonalEvent).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as any);
  return { patchAttendance, bulk };
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
  // ---- §9 W3: 繰り返し occurrence の編集/削除は RecurrenceEditDialog を挟む ----

  const recurringOccurrence = {
    seriesId: "series-rec",
    occurrenceDate: "2026-05-12T15:00:00.000Z",
    start: "2026-05-12T15:00:00.000Z",
    end: "2026-05-13T15:00:00.000Z",
    days: [{ date: "2026-05-13", startMinute: 0, endMinute: 1440 }],
    isAllDay: true,
    title: "繰り返し予定",
    location: null,
    note: null,
    color: "#8b5cf6",
    isRecurringOccurrence: true,
    recurrenceRule: "FREQ=WEEKLY;BYDAY=WE",
    recurrenceSpec: { freq: "WEEKLY", interval: 1, byDay: ["WE"], monthlyMode: null, end: { kind: "never" } },
    overrideId: null,
    source: "MANUAL",
    ekExternalId: null,
    ekCalendarId: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  } as any;

  const singleOccurrence = {
    ...recurringOccurrence,
    seriesId: "series-single",
    title: "単発予定",
    isRecurringOccurrence: false,
    recurrenceRule: null,
    recurrenceSpec: null,
  } as any;


  it("[AW6] 日別シートに「予定」節が無く、授業の節は従来どおり出る", () => {
    mockHooks();

    render(<DayDetailSheet date="2026-05-13" onClose={vi.fn()} />);

    expect(screen.getByText(/^授業 \(1\)$/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /予定/ })).not.toBeInTheDocument();
    expect(screen.queryByText("予定はありません")).not.toBeInTheDocument();
  });

});
