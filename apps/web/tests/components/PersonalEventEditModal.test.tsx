/**
 * 設計不足: 個人イベント作成/更新 hook の import パス/名称は設計docに明記されていない。
 * CourseEditModal と同じ hook モック流儀で、既存 hook 集約エントリ "@/api/hooks" を best-effort でモックする。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PersonalEventEditModal } from "@/components/semester/PersonalEventEditModal";
import { useCreatePersonalEvent, useUpdatePersonalEvent } from "@/api/hooks";

vi.mock("@/api/hooks", () => ({
  useCreatePersonalEvent: vi.fn(),
  useUpdatePersonalEvent: vi.fn(),
}));

function controlInLabel(label: string) {
  const labelElement = screen.getByText(label).closest("label");
  const control = labelElement?.querySelector("input, textarea, select");
  if (!control) throw new Error(`No control found for label: ${label}`);
  return control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

function mockMutations() {
  const createMutate = vi.fn((_body, options) => options?.onSuccess?.({ event: { id: "event-1" } }));
  const updateMutate = vi.fn((_body, options) => options?.onSuccess?.({ event: { id: "event-1" } }));
  const createMutateAsync = vi.fn().mockResolvedValue({ event: { id: "event-1" } });
  const updateMutateAsync = vi.fn().mockResolvedValue({ event: { id: "event-1" } });
  vi.mocked(useCreatePersonalEvent).mockReturnValue({ mutate: createMutate, mutateAsync: createMutateAsync, isPending: false } as any);
  vi.mocked(useUpdatePersonalEvent).mockReturnValue({ mutate: updateMutate, mutateAsync: updateMutateAsync, isPending: false } as any);
  return { createMutate, createMutateAsync, updateMutate, updateMutateAsync };
}

describe("PersonalEventEditModal", () => {
  it("[UI] hides time inputs while all-day is on and shows them after all-day is turned off", () => {
    mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-05-13" semesterId="semester-1" />);

    expect(screen.queryByText("開始時刻")).not.toBeInTheDocument();
    expect(screen.queryByText("終了時刻")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("終日"));

    expect(screen.getByText("開始時刻")).toBeInTheDocument();
    expect(screen.getByText("終了時刻")).toBeInTheDocument();
    expect(controlInLabel("開始時刻")).toHaveAttribute("type", "time");
    expect(controlInLabel("終了時刻")).toHaveAttribute("type", "time");
  });

  it("[UI] saves all-day payload without start/end minutes", async () => {
    const { createMutate, createMutateAsync } = mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-05-13" semesterId="semester-1" />);
    fireEvent.change(controlInLabel("タイトル"), { target: { value: "バイト" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(createMutate.mock.calls.length + createMutateAsync.mock.calls.length).toBeGreaterThan(0));
    const calledBody = createMutate.mock.calls[0]?.[0] ?? createMutateAsync.mock.calls[0]?.[0];
    expect(calledBody).toEqual(
      expect.objectContaining({
        date: "2026-05-13",
        title: "バイト",
        isAllDay: true,
      }),
    );
    expect(calledBody.startMinute == null).toBe(true);
    expect(calledBody.endMinute == null).toBe(true);
  });

  it("[UI] converts 09:00-10:30 into startMinute 540 and endMinute 630", async () => {
    const { createMutate, createMutateAsync } = mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-05-13" semesterId="semester-1" />);
    fireEvent.change(controlInLabel("タイトル"), { target: { value: "面談" } });
    fireEvent.click(screen.getByLabelText("終日"));
    fireEvent.change(controlInLabel("開始時刻"), { target: { value: "09:00" } });
    fireEvent.change(controlInLabel("終了時刻"), { target: { value: "10:30" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(createMutate.mock.calls.length + createMutateAsync.mock.calls.length).toBeGreaterThan(0));
    const calledBody = createMutate.mock.calls[0]?.[0] ?? createMutateAsync.mock.calls[0]?.[0];
    expect(calledBody).toEqual(
      expect.objectContaining({
        isAllDay: false,
        startMinute: 540,
        endMinute: 630,
      }),
    );
  });
});
