import { act, fireEvent, render, screen, within } from "@testing-library/react";

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

const secondOccurrence = {
  ...occurrence,
  id: "occ-2",
  meetingId: "meeting-2",
  courseId: "course-2",
  courseName: "DB",
  periodOffset: 1,
  startMinute: 640,
  endMinute: 730,
};

const timetableSuspension = {
  id: "ts-1",
  userTimetableId: "tt-1",
  date: "2026-05-13",
  reason: null,
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
};

const baseDetail = {
  date: "2026-05-13",
  occurrences: [occurrence, secondOccurrence],
  courseSuspensions: [],
  timetableSuspension: null,
  personalEvents: [],
};

function mockHooks(detail: any = baseDetail, options: Partial<{ pending: boolean; bulkPending: boolean }> = {}) {
  const patchAttendance = vi.fn();
  const bulk = vi.fn();
  const markAll = vi.fn();
  const createTimetableSuspension = vi.fn().mockResolvedValue(undefined);
  const deleteTimetableSuspension = vi.fn().mockResolvedValue(undefined);
  const pending = options.pending ?? false;

  vi.mocked(useDayDetail).mockReturnValue({ data: detail, isLoading: false, isError: false } as any);
  vi.mocked(usePatchAttendance).mockReturnValue({ mutate: patchAttendance, isPending: false } as any);
  vi.mocked(useDeleteAttendance).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useCreateTimetableSuspension).mockReturnValue({
    mutate: createTimetableSuspension,
    mutateAsync: createTimetableSuspension,
    isPending: pending,
  } as any);
  vi.mocked(useDeleteTimetableSuspension).mockReturnValue({
    mutate: deleteTimetableSuspension,
    mutateAsync: deleteTimetableSuspension,
    isPending: pending,
  } as any);
  vi.mocked(useBulkMarkAttendance).mockReturnValue({
    mutate: bulk,
    isPending: options.bulkPending ?? false,
  } as any);
  vi.mocked(useMarkAllPresent).mockReturnValue({ mutate: markAll, isPending: pending } as any);
  vi.mocked(useCreateCourseSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useDeleteCourseSuspension).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useDeletePersonalEvent).mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  vi.mocked(useCreatePersonalEvent).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as any);
  vi.mocked(useUpdatePersonalEvent).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as any);

  return { patchAttendance, bulk, markAll, createTimetableSuspension, deleteTimetableSuspension };
}

function renderSheet() {
  return render(<DayDetailSheet date="2026-05-13" semesterId="semester-1" onClose={vi.fn()} />);
}

describe("DayDetailSheet review contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders mark-all-present for two unrecorded occurrences and calls bulk FILL with PRESENT", () => {
    const { bulk } = mockHooks();
    renderSheet();

    // 仕様 #12
    fireEvent.click(screen.getByRole("button", { name: /全部出席にする \(2\)/ }));

    expect(bulk).toHaveBeenCalledWith({ dates: ["2026-05-13"], status: "PRESENT", mode: "FILL" });
  });

  it("opens the bulk status menu and can mark all unrecorded absent", () => {
    const { bulk } = mockHooks();
    renderSheet();

    fireEvent.click(screen.getByLabelText("一括記録のステータスを選ぶ"));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "全部 欠席 (2)" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "全部 公欠 (2)" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "全部 遅刻 (2)" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "全部 早退 (2)" })).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "全部 欠席 (2)" }));

    // 仕様 #13
    expect(bulk).toHaveBeenCalledWith({ dates: ["2026-05-13"], status: "ABSENT", mode: "FILL" });
  });

  it("enables overwrite bulk controls when all occurrences are recorded", () => {
    const { bulk } = mockHooks({
      ...baseDetail,
      occurrences: [
        { ...occurrence, status: "PRESENT" },
        { ...secondOccurrence, status: "ABSENT" },
      ],
    });
    renderSheet();

    // 仕様 #12
    const main = screen.getByRole("button", { name: "全部 出席に上書き" });
    expect(main).toBeEnabled();
    expect(screen.getByLabelText("一括記録のステータスを選ぶ")).toBeEnabled();

    fireEvent.click(main);

    expect(bulk).toHaveBeenCalledWith({ dates: ["2026-05-13"], status: "PRESENT", mode: "OVERWRITE" });
  });

  it("hides or disables bulk controls while the whole day is suspended", () => {
    mockHooks({ ...baseDetail, timetableSuspension });
    renderSheet();

    const main = screen.queryByRole("button", { name: /全部出席にする/ });
    const trigger = screen.queryByLabelText("一括記録のステータスを選ぶ");
    expect(main == null || main.hasAttribute("disabled")).toBe(true);
    expect(trigger == null || trigger.hasAttribute("disabled")).toBe(true);
  });

  it("hides bulk controls when there are no occurrences", () => {
    mockHooks({ ...baseDetail, occurrences: [] });
    renderSheet();

    expect(screen.queryByText(/全部出席にする/)).toBeNull();
  });

  it("shows explanatory text when the bulk menu is open", () => {
    mockHooks();
    renderSheet();

    fireEvent.click(screen.getByLabelText("一括記録のステータスを選ぶ"));

    // 仕様 #13
    expect(screen.getByText("未記録の 2 件のみ。記録済みは変わりません")).toBeInTheDocument();
  });

  it("opens overwrite status menu for recorded occurrences and explains overwrite scope", () => {
    const { bulk } = mockHooks({
      ...baseDetail,
      occurrences: [
        { ...occurrence, status: "PRESENT" },
        { ...secondOccurrence, status: "ABSENT" },
      ],
    });
    renderSheet();

    fireEvent.click(screen.getByLabelText("一括記録のステータスを選ぶ"));

    const menu = screen.getByRole("menu");
    // 仕様 #14 #15
    expect(within(menu).getByRole("menuitem", { name: "全部 欠席 に上書き" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "全部 公欠 に上書き" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "全部 遅刻 に上書き" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "全部 早退 に上書き" })).toBeInTheDocument();
    expect(screen.getByText("記録済み 2 件をすべて上書きします")).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "全部 欠席 に上書き" }));

    expect(bulk).toHaveBeenCalledWith({ dates: ["2026-05-13"], status: "ABSENT", mode: "OVERWRITE" });
  });

  it("disables bulk controls while bulk attendance mutation is pending", () => {
    mockHooks(baseDetail, { bulkPending: true });
    renderSheet();

    // 仕様 #18
    expect(screen.getByRole("button", { name: /全部出席にする \(2\)/ })).toBeDisabled();
    expect(screen.getByLabelText("一括記録のステータスを選ぶ")).toBeDisabled();
  });

  it("renders create-suspension button without checkbox and creates with undefined reason when empty", async () => {
    const { createTimetableSuspension } = mockHooks();
    const { container } = renderSheet();

    expect(screen.getByRole("button", { name: "この日を休講にする" })).toBeInTheDocument();
    expect(container.querySelector("input[type=checkbox]")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "この日を休講にする" }));
    });

    expect(createTimetableSuspension).toHaveBeenCalledWith({ date: "2026-05-13", reason: undefined });
  });

  it("creates a timetable suspension with the typed reason", async () => {
    const { createTimetableSuspension } = mockHooks();
    renderSheet();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "健康診断" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "この日を休講にする" }));
    });

    expect(createTimetableSuspension).toHaveBeenCalledWith({ date: "2026-05-13", reason: "健康診断" });
  });

  it("renders active suspension state and deletes by timetableSuspension id", async () => {
    const { deleteTimetableSuspension } = mockHooks({ ...baseDetail, timetableSuspension });
    renderSheet();

    expect(screen.getAllByText(/休講中/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "この日を休講にする" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "休講を解除" }));
    });

    expect(deleteTimetableSuspension).toHaveBeenCalledWith("ts-1");
  });

  it("disables suspension action buttons while pending", () => {
    mockHooks(baseDetail, { pending: true });
    const { rerender } = renderSheet();

    expect(screen.getByRole("button", { name: "この日を休講にする" })).toBeDisabled();

    mockHooks({ ...baseDetail, timetableSuspension }, { pending: true });
    rerender(<DayDetailSheet date="2026-05-13" semesterId="semester-1" onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "休講を解除" })).toBeDisabled();
  });
});
