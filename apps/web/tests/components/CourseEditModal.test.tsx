import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { CourseEditModal } from "@/components/semester/CourseEditModal";
import { useCreateCourse, useUpdateCourse } from "@/api/hooks/useUserTimetable";

vi.mock("@/api/hooks/useUserTimetable", () => ({
  useCreateCourse: vi.fn(),
  useUpdateCourse: vi.fn(),
}));

const createdCourse = {
  id: "course-created",
  name: "線形代数",
  teacher: "佐藤",
  color: "#10b981",
  totalSessions: 15,
  note: null,
};

const existingCourse = {
  id: "course-1",
  name: "オペレーティングシステム",
  teacher: "山田",
  color: "#60a5fa",
  totalSessions: 15,
  note: "既存メモ",
};

function controlInLabel(label: string) {
  const labelElement = screen.getByText(label).closest("label");
  const control = labelElement?.querySelector("input, textarea, select");
  if (!control) throw new Error(`No control found for label: ${label}`);
  return control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

function mockMutations() {
  const createMutate = vi.fn((_body, options) => options?.onSuccess?.({ course: createdCourse }));
  const updateMutate = vi.fn((_body, options) => options?.onSuccess?.({ course: { ...existingCourse, name: "OS 更新" } }));
  const createMutateAsync = vi.fn().mockResolvedValue({ course: createdCourse });
  const updateMutateAsync = vi.fn().mockResolvedValue({ course: { ...existingCourse, name: "OS 更新" } });
  vi.mocked(useCreateCourse).mockReturnValue({ mutate: createMutate, mutateAsync: createMutateAsync, isPending: false } as any);
  vi.mocked(useUpdateCourse).mockReturnValue({ mutate: updateMutate, mutateAsync: updateMutateAsync, isPending: false } as any);
  return { createMutate, createMutateAsync, updateMutate, updateMutateAsync };
}

describe("CourseEditModal", () => {
  it("[仕様19] course prop なしで開くと科目追加タイトルになり保存で POST hook が呼ばれる", async () => {
    const { createMutate, createMutateAsync } = mockMutations();

    render(<CourseEditModal open onClose={vi.fn()} timetableId="tt-1" />);
    fireEvent.change(controlInLabel("科目名"), { target: { value: "線形代数" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText(/科目を追加/)).toBeInTheDocument();
    await waitFor(() => expect(createMutate.mock.calls.length + createMutateAsync.mock.calls.length).toBeGreaterThan(0));
    const calledBody = createMutate.mock.calls[0]?.[0] ?? createMutateAsync.mock.calls[0]?.[0];
    expect(calledBody).toEqual(expect.objectContaining({ userTimetableId: "tt-1", name: "線形代数" }));
  });

  it("[仕様20] course prop ありで開くと既存値が入り保存で PATCH hook が呼ばれる", async () => {
    const { updateMutate, updateMutateAsync } = mockMutations();

    render(<CourseEditModal open onClose={vi.fn()} timetableId="tt-1" course={existingCourse as any} />);
    expect(screen.getByDisplayValue("オペレーティングシステム")).toBeInTheDocument();
    expect(screen.getByDisplayValue("山田")).toBeInTheDocument();

    fireEvent.change(controlInLabel("科目名"), { target: { value: "OS 更新" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(useUpdateCourse).toHaveBeenCalledWith("course-1");
    await waitFor(() => expect(updateMutate.mock.calls.length + updateMutateAsync.mock.calls.length).toBeGreaterThan(0));
    const calledBody = updateMutate.mock.calls[0]?.[0] ?? updateMutateAsync.mock.calls[0]?.[0];
    expect(calledBody).toEqual(expect.objectContaining({ name: "OS 更新" }));
  });

  it("[仕様21] 科目名が空のとき保存ボタンが disabled", () => {
    mockMutations();

    render(<CourseEditModal open onClose={vi.fn()} timetableId="tt-1" />);
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    fireEvent.change(controlInLabel("科目名"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("[仕様22] 保存成功時 onSaved が作成後の course で呼ばれる", async () => {
    mockMutations();
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(<CourseEditModal open onClose={onClose} timetableId="tt-1" onSaved={onSaved} />);
    fireEvent.change(controlInLabel("科目名"), { target: { value: "線形代数" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(createdCourse));
    expect(onClose).toHaveBeenCalled();
  });

  it("[仕様23] room 入力欄が存在しない", () => {
    mockMutations();

    render(<CourseEditModal open onClose={vi.fn()} timetableId="tt-1" course={existingCourse as any} />);

    expect(screen.queryByText("教室")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("305")).not.toBeInTheDocument();
  });
});
