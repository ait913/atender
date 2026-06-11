import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { MeetingEditModal } from "@/components/timetable/MeetingEditModal";
import { useCreateMeetingsBulk, useUpdateMeeting } from "@/api/hooks/useUserTimetable";

vi.mock("@/api/hooks/useUserTimetable", () => ({
  useCreateMeetingsBulk: vi.fn(),
  useUpdateMeeting: vi.fn(),
}));

vi.mock("@/components/semester/CourseEditModal", () => ({
  CourseEditModal: ({ open, stackLevel, onSaved, onClose }: any) => open ? (
    <div role="dialog" aria-label="科目を追加">
      <div data-testid="course-edit-stack-level">{stackLevel}</div>
      <button
        type="button"
        onClick={() => {
          onSaved({
            id: "course-new",
            name: "新規科目",
            teacher: null,
            color: "#10b981",
            note: null,
          });
          onClose();
        }}
      >
        mock course save
      </button>
    </div>
  ) : null,
}));

const timetable = {
  id: "tt-1",
  courses: [
    { id: "course-1", name: "数学", teacher: "田中", color: "#10b981", note: null },
    { id: "course-2", name: "英語", teacher: "鈴木", color: "#60a5fa", note: null },
  ],
  meetings: [
    { id: "meeting-1", courseId: "course-1", dayOfWeek: 1, startPeriodIndex: 2, periodCount: 2, room: "A301" },
  ],
  daySlots: [
    { periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false },
    { periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false },
    { periodIndex: 3, label: "3限", startMinute: 740, endMinute: 830, isBreak: false },
    { periodIndex: 4, label: "4限", startMinute: 840, endMinute: 930, isBreak: false },
  ],
};

const editMeeting = timetable.meetings[0];

function controlInLabel(label: string) {
  const labelElement = screen.getByText(label).closest("label");
  const control = labelElement?.querySelector("input, textarea, select");
  if (!control) throw new Error(`No control found for label: ${label}`);
  return control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

function mockMutations() {
  const createMutate = vi.fn((_body, options) => options?.onSuccess?.({ meetings: [] }));
  const updateMutate = vi.fn((_body, options) => options?.onSuccess?.({ meeting: editMeeting }));
  const createMutateAsync = vi.fn().mockResolvedValue({ meetings: [] });
  const updateMutateAsync = vi.fn().mockResolvedValue({ meeting: editMeeting });
  vi.mocked(useCreateMeetingsBulk).mockReturnValue({ mutate: createMutate, mutateAsync: createMutateAsync, isPending: false } as any);
  vi.mocked(useUpdateMeeting).mockReturnValue({ mutate: updateMutate, mutateAsync: updateMutateAsync, isPending: false } as any);
  return { createMutate, createMutateAsync, updateMutate, updateMutateAsync };
}

function periodButton(period: number) {
  return screen.getByRole("button", { name: new RegExp(`^${period}(限)?$`) });
}

describe("MeetingEditModal", () => {
  it("[仕様24] mode=create で科目 Select に timetable.courses と「＋ 科目を追加」option が並ぶ", () => {
    mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={timetable as any} mode="create" initialDayOfWeek={1} initialPeriod={1} />);

    expect(screen.getByRole("option", { name: "数学" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "英語" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "＋ 科目を追加" })).toBeInTheDocument();
  });

  it("[仕様25] 「＋ 科目を追加」を選ぶと CourseEditModal が stackLevel=2 で開く", () => {
    mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={timetable as any} mode="create" initialDayOfWeek={1} initialPeriod={1} />);
    fireEvent.change(controlInLabel("科目"), { target: { value: "__add_course__" } });

    expect(screen.getByTestId("course-edit-stack-level")).toBeInTheDocument();
    expect(screen.getByTestId("course-edit-stack-level")).toHaveTextContent("2");
  });

  it("[仕様26] CourseEditModal の onSaved 後、新 course が自動選択され CourseEditModal は閉じる", () => {
    mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={timetable as any} mode="create" initialDayOfWeek={1} initialPeriod={1} />);
    const select = controlInLabel("科目") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "__add_course__" } });
    fireEvent.click(screen.getByText("mock course save"));

    expect(select.value).toBe("course-new");
    expect(screen.queryByTestId("course-edit-stack-level")).not.toBeInTheDocument();
  });

  it("[仕様27] mode=create 時、曜日は initialDayOfWeek で固定表示され Select で変更できない", () => {
    mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={timetable as any} mode="create" initialDayOfWeek={1} initialPeriod={1} />);

    expect(screen.getByText("月曜日")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "曜日" })).not.toBeInTheDocument();
  });

  it("[仕様28] 時限未選択 or 科目未選択のとき保存 disabled", () => {
    mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={{ ...timetable, courses: [] } as any} mode="create" initialDayOfWeek={1} />);

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("[仕様29] mode=create の保存で POST /api/meetings/bulk hook が courseId/dayOfWeek/startPeriodIndexes/room 付きで呼ばれる", async () => {
    const { createMutate, createMutateAsync } = mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={timetable as any} mode="create" initialDayOfWeek={1} initialPeriod={1} />);
    fireEvent.change(controlInLabel("科目"), { target: { value: "course-2" } });
    fireEvent.change(controlInLabel("教室"), { target: { value: "B202" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(createMutate.mock.calls.length + createMutateAsync.mock.calls.length).toBeGreaterThan(0));
    const calledBody = createMutate.mock.calls[0]?.[0] ?? createMutateAsync.mock.calls[0]?.[0];
    expect(calledBody).toEqual(expect.objectContaining({
      userTimetableId: "tt-1",
      courseId: "course-2",
      dayOfWeek: 1,
      startPeriodIndexes: [1],
      room: "B202",
    }));
  });

  it("[仕様30] mode=edit で meeting.room / 時限 / 曜日が初期値に入る", () => {
    mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={timetable as any} mode="edit" meeting={editMeeting as any} />);

    expect(screen.getByDisplayValue("A301")).toBeInTheDocument();
    expect(screen.getByText(/月曜日/)).toBeInTheDocument();
    expect(screen.getByText(/2-3限|2限.*3限/)).toBeInTheDocument();
  });

  it("[仕様31] mode=edit の保存で PATCH /api/meetings/:id hook が呼ばれる", async () => {
    const { updateMutate, updateMutateAsync } = mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={timetable as any} mode="edit" meeting={editMeeting as any} />);
    fireEvent.change(controlInLabel("教室"), { target: { value: "C303" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(useUpdateMeeting).toHaveBeenCalledWith("meeting-1");
    await waitFor(() => expect(updateMutate.mock.calls.length + updateMutateAsync.mock.calls.length).toBeGreaterThan(0));
    const calledBody = updateMutate.mock.calls[0]?.[0] ?? updateMutateAsync.mock.calls[0]?.[0];
    expect(calledBody).toEqual(expect.objectContaining({ room: "C303" }));
  });

  it("[仕様32] mode=edit で PeriodChips は連続範囲のみ選択可", async () => {
    const { updateMutate, updateMutateAsync } = mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={timetable as any} mode="edit" meeting={{ ...editMeeting, startPeriodIndex: 1, periodCount: 1 } as any} />);
    fireEvent.click(periodButton(3));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateMutate.mock.calls.length + updateMutateAsync.mock.calls.length).toBeGreaterThan(0));
    const calledBody = updateMutate.mock.calls[0]?.[0] ?? updateMutateAsync.mock.calls[0]?.[0];
    expect(calledBody).toEqual(expect.objectContaining({ startPeriodIndex: 3, periodCount: 1 }));
  });

  it("[仕様33] room 入力欄が MeetingEditModal に存在する", () => {
    mockMutations();

    render(<MeetingEditModal open onClose={vi.fn()} timetable={timetable as any} mode="create" initialDayOfWeek={1} initialPeriod={1} />);

    expect(controlInLabel("教室")).toBeInTheDocument();
  });
});
