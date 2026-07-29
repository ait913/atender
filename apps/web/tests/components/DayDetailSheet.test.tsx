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

  it("[W3] 繰り返し occurrence の削除は RecurrenceEditDialog を出し、選んだ scope を API に渡す", async () => {
    const deleteMutate = vi.fn();
    mockHooks({ ...baseDetail, occurrences: [], personalEvents: [recurringOccurrence] });
    vi.mocked(useDeletePersonalEvent).mockReturnValue({ mutate: deleteMutate, mutateAsync: deleteMutate, isPending: false } as any);

    render(<DayDetailSheet date="2026-05-13" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("削除"));

    // ダイアログが出るまでは API を呼ばない
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(await screen.findByText("この予定のみ")).toBeInTheDocument();
    expect(screen.getByText("これ以降のすべての予定")).toBeInTheDocument();
    expect(screen.getByText("すべての予定")).toBeInTheDocument();

    fireEvent.click(screen.getByText("これ以降のすべての予定"));
    fireEvent.click(screen.getAllByRole("button", { name: "削除" }).at(-1)!);

    await waitFor(() => expect(deleteMutate).toHaveBeenCalled());
    expect(JSON.stringify(deleteMutate.mock.calls[0][0])).toContain("future");
    expect(JSON.stringify(deleteMutate.mock.calls[0][0])).toContain("series-rec");
    expect(JSON.stringify(deleteMutate.mock.calls[0][0])).toContain(recurringOccurrence.occurrenceDate);
  });

  it("[W3] 非繰り返しの削除はダイアログを出さず即実行する", async () => {
    const deleteMutate = vi.fn();
    mockHooks({ ...baseDetail, occurrences: [], personalEvents: [singleOccurrence] });
    vi.mocked(useDeletePersonalEvent).mockReturnValue({ mutate: deleteMutate, mutateAsync: deleteMutate, isPending: false } as any);

    render(<DayDetailSheet date="2026-05-13" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("削除"));

    await waitFor(() => expect(deleteMutate).toHaveBeenCalled());
    expect(screen.queryByText("これ以降のすべての予定")).not.toBeInTheDocument();
    expect(JSON.stringify(deleteMutate.mock.calls[0][0])).toContain("series-single");
  });

  it("[W3] 繰り返し occurrence の編集は保存時に RecurrenceEditDialog を挟み、scope を API に渡す (§6.5)", async () => {
    const updateMutate = vi.fn();
    mockHooks({ ...baseDetail, occurrences: [], personalEvents: [recurringOccurrence] });
    vi.mocked(useUpdatePersonalEvent).mockReturnValue({ mutate: updateMutate, mutateAsync: updateMutate, isPending: false } as any);

    render(<DayDetailSheet date="2026-05-13" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("編集"));
    fireEvent.click(screen.getAllByRole("button", { name: "保存" }).at(-1)!);

    // 3 択が出るまで PATCH しない
    expect(updateMutate).not.toHaveBeenCalled();
    expect(await screen.findByText("この予定のみ")).toBeInTheDocument();
    expect(screen.getByText("これ以降のすべての予定")).toBeInTheDocument();
    expect(screen.getByText("すべての予定")).toBeInTheDocument();

    fireEvent.click(screen.getByText("すべての予定"));
    fireEvent.click(screen.getAllByRole("button", { name: "保存" }).at(-1)!);

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    // seriesId は hook 側に束ねられるため、ここで検証するのは「選んだ scope と originalDate が渡る」こと
    const payload = JSON.stringify(updateMutate.mock.calls[0][0]);
    expect(payload).toContain('"editScope":"all"');
    expect(payload).toContain(recurringOccurrence.occurrenceDate);
  });

  it("[W3] 非繰り返しの編集はダイアログを出さず editScope=all で即 PATCH する", async () => {
    const updateMutate = vi.fn();
    mockHooks({ ...baseDetail, occurrences: [], personalEvents: [singleOccurrence] });
    vi.mocked(useUpdatePersonalEvent).mockReturnValue({ mutate: updateMutate, mutateAsync: updateMutate, isPending: false } as any);

    render(<DayDetailSheet date="2026-05-13" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("編集"));
    fireEvent.click(screen.getAllByRole("button", { name: "保存" }).at(-1)!);

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(screen.queryByText("これ以降のすべての予定")).not.toBeInTheDocument();
    expect(JSON.stringify(updateMutate.mock.calls[0][0])).toContain('"editScope":"all"');
  });

  it("[§7] 予定行は終日/時刻・場所・繰り返しを表示する", () => {
    mockHooks({
      ...baseDetail,
      occurrences: [],
      personalEvents: [{ ...recurringOccurrence, location: "渋谷店" }],
    });

    render(<DayDetailSheet date="2026-05-13" onClose={vi.fn()} />);

    expect(screen.getByText("繰り返し予定")).toBeInTheDocument();
    expect(document.body.textContent).toContain("終日");
    expect(document.body.textContent).toContain("渋谷店");
  });
});
