/**
 * 設計不足: SemesterListSheet の配置パス、input の正確な label、行本体の role は設計docに明記されていない。
 * 既存の sheet/component テストと同じく、公開 props と "@/api/hooks" の contract を best-effort で検証する。
 */
import { fireEvent, render, screen } from "@testing-library/react";

import { SemesterListSheet } from "@/components/sheet/SemesterListSheet";
import {
  useCreateSemester,
  useDeleteSemester,
  useMe,
  usePatchMe,
  useSemesters,
  useUpdateSemester,
} from "@/api/hooks";

vi.mock("@/api/hooks", () => ({
  useSemesters: vi.fn(),
  useMe: vi.fn(),
  useUpdateSemester: vi.fn(),
  useCreateSemester: vi.fn(),
  useDeleteSemester: vi.fn(),
  usePatchMe: vi.fn(),
}));

const semester = {
  id: "s1",
  name: "2026年前期",
  startDate: "2026-04-06",
  endDate: "2026-09-18",
};

function mockHooks(options: Partial<{ defaultSemesterId: string }> = {}) {
  const updateSemester = vi.fn();
  const createSemester = vi.fn();
  const deleteSemester = vi.fn();
  const patchMe = vi.fn();

  vi.mocked(useSemesters).mockReturnValue({ data: { semesters: [semester] } } as any);
  vi.mocked(useMe).mockReturnValue({
    data: { user: { defaultSemesterId: options.defaultSemesterId ?? "s1" } },
  } as any);
  vi.mocked(useUpdateSemester).mockReturnValue({ mutate: updateSemester, isPending: false } as any);
  vi.mocked(useCreateSemester).mockReturnValue({ mutate: createSemester, isPending: false } as any);
  vi.mocked(useDeleteSemester).mockReturnValue({ mutate: deleteSemester, isPending: false } as any);
  vi.mocked(usePatchMe).mockReturnValue({ mutate: patchMe, isPending: false } as any);

  return { updateSemester, createSemester, deleteSemester, patchMe };
}

function renderSheet(options?: Partial<{ defaultSemesterId: string }>) {
  const hooks = mockHooks(options);
  const view = render(<SemesterListSheet open onClose={vi.fn()} />);
  return { ...hooks, ...view };
}

function openEditForm() {
  fireEvent.click(screen.getByRole("button", { name: "編集" }));
}

describe("SemesterListSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an edit button for each semester row", () => {
    renderSheet();

    // 仕様 #39
    expect(screen.getByRole("button", { name: "編集" })).toBeInTheDocument();
  });

  it("prefills name, start date, and end date after clicking edit", () => {
    renderSheet();

    openEditForm();

    // 仕様 #40
    expect(screen.getByDisplayValue("2026年前期")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-04-06")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-09-18")).toBeInTheDocument();
  });

  it("saves only changed fields when the semester name changes", () => {
    const { updateSemester } = renderSheet();

    openEditForm();
    fireEvent.change(screen.getByDisplayValue("2026年前期"), { target: { value: "2026年春学期" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // 仕様 #41
    expect(updateSemester.mock.calls[0]?.[0]).toEqual({ id: "s1", body: { name: "2026年春学期" } });
  });

  it("closes the edit form when cancel is clicked", () => {
    renderSheet();

    openEditForm();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    // 仕様 #42
    expect(screen.queryByDisplayValue("2026年前期")).toBeNull();
    expect(screen.queryByDisplayValue("2026-04-06")).toBeNull();
    expect(screen.queryByDisplayValue("2026-09-18")).toBeNull();
  });

  it("disables save when the name is empty or the start date is after the end date", () => {
    const first = renderSheet();

    openEditForm();
    fireEvent.change(screen.getByDisplayValue("2026年前期"), { target: { value: "" } });

    // 仕様 #43
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    first.unmount();
    renderSheet();
    openEditForm();
    // 設計不足: 日付 input の label が未規定のため、プリフィル値で開始日欄を特定する。
    const startDate = screen.getByDisplayValue("2026-04-06") as HTMLInputElement;
    fireEvent.change(startDate, { target: { value: "2026-10-01" } });

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("keeps default-semester switching and delete actions wired", () => {
    const { patchMe, deleteSemester } = renderSheet({ defaultSemesterId: "s0" });

    fireEvent.click(screen.getByText("2026年前期"));
    fireEvent.click(screen.getByRole("button", { name: /削除/ }));

    // 仕様 #44
    expect(patchMe).toHaveBeenCalled();
    expect(deleteSemester).toHaveBeenCalled();
  });
});
