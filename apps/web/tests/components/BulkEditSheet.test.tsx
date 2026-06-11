import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";
import { BulkEditSheet } from "@/components/semester/BulkEditSheet";
import { renderWithClient } from "../utils/render";
import {
  useBulkClearAttendance,
  useBulkMarkAttendance,
  useBulkCreateTimetableSuspensions,
  useBulkRemoveTimetableSuspensions,
  useCreatePersonalEvent,
} from "@/api/hooks";

vi.mock("@/api/hooks", () => ({
  useBulkMarkAttendance: vi.fn(),
  useBulkClearAttendance: vi.fn(),
  useBulkCreateTimetableSuspensions: vi.fn(),
  useBulkRemoveTimetableSuspensions: vi.fn(),
  useCreatePersonalEvent: vi.fn(),
}));

const dates = ["2026-06-03", "2026-06-10", "2026-06-17"];

function renderSheet() {
  const mark = vi.fn((_input, options) => options?.onSuccess?.({ upsertedCount: 3, skippedExistingCount: 0, skippedSuspendedCount: 0, noOccurrenceDates: [] }));
  const clear = vi.fn((_input, options) => options?.onSuccess?.({ deletedCount: 3 }));
  const createSuspension = vi.fn((_input, options) => options?.onSuccess?.({ createdCount: 3, skippedCount: 0 }));
  const removeSuspension = vi.fn((_input, options) => options?.onSuccess?.({ removedCount: 3 }));
  const createEventAsync = vi.fn().mockResolvedValue({ event: { id: "event-1" } });
  const createEvent = vi.fn((_input, options) => options?.onSuccess?.({ event: { id: "event-1" } }));

  vi.mocked(useBulkMarkAttendance).mockReturnValue({ mutate: mark, isPending: false } as any);
  vi.mocked(useBulkClearAttendance).mockReturnValue({ mutate: clear, isPending: false } as any);
  vi.mocked(useBulkCreateTimetableSuspensions).mockReturnValue({ mutate: createSuspension, isPending: false } as any);
  vi.mocked(useBulkRemoveTimetableSuspensions).mockReturnValue({ mutate: removeSuspension, isPending: false } as any);
  vi.mocked(useCreatePersonalEvent).mockReturnValue({ mutate: createEvent, mutateAsync: createEventAsync, isPending: false } as any);

  const onDone = vi.fn();
  renderWithClient(<BulkEditSheet open onClose={vi.fn()} dates={dates} semesterId="semester-1" onDone={onDone} />);
  return { mark, clear, createSuspension, removeSuspension, createEvent, createEventAsync, onDone };
}

describe("BulkEditSheet", () => {
  it("submits selected attendance status with FILL and OVERWRITE modes", async () => {
    const { mark } = renderSheet();

    expect(screen.getByRole("button", { name: "この内容で登録" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "欠" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で登録" }));

    // 仕様 #62
    expect(mark).toHaveBeenCalledWith(expect.objectContaining({ dates, status: "ABSENT", mode: "FILL" }), expect.anything());

    fireEvent.click(screen.getByLabelText("記録済みも上書きする"));
    fireEvent.click(screen.getByRole("button", { name: "この内容で登録" }));
    expect(mark).toHaveBeenLastCalledWith(expect.objectContaining({ dates, status: "ABSENT", mode: "OVERWRITE" }), expect.anything());
  });

  it("submits suspension create and remove payloads", () => {
    const { createSuspension, removeSuspension } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "休講にする" }));
    // 仕様 #63
    expect(createSuspension).toHaveBeenCalledWith(expect.objectContaining({ dates, reason: undefined }), expect.anything());

    // 設計doc は「理由:」の label 表記だが label 関連付けまでは規定していないため placeholder で取得
    fireEvent.change(screen.getByPlaceholderText(/理由/), { target: { value: "学校行事" } });
    fireEvent.click(screen.getByRole("button", { name: "休講にする" }));
    expect(createSuspension).toHaveBeenLastCalledWith(expect.objectContaining({ dates, reason: "学校行事" }), expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "休講を解除" }));
    expect(removeSuspension).toHaveBeenCalledWith(expect.objectContaining({ dates }), expect.anything());
  });

  it("submits clear attendance payload", () => {
    const { clear } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "選択日の記録をすべて削除" }));

    // 仕様 #64
    expect(clear).toHaveBeenCalledWith(expect.objectContaining({ dates }), expect.anything());
  });

  it("adds all-day personal events for every selected date", async () => {
    // 実装は既存 POST /api/personal-events をファンアウトする (設計どおり)。msw で実リクエストを捕捉して検証する
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post("*/api/personal-events", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ event: { id: `event-${bodies.length}` } });
      }),
    );
    renderSheet();

    expect(screen.getByRole("button", { name: "選択日すべてに終日予定を追加" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/タイトル/), { target: { value: "バイト" } });
    fireEvent.click(screen.getByRole("button", { name: "選択日すべてに終日予定を追加" }));

    // 仕様 #65
    await waitFor(() => expect(bodies).toHaveLength(3));
    for (const date of dates) {
      expect(bodies).toContainEqual(expect.objectContaining({ date, title: "バイト", isAllDay: true, semesterId: "semester-1" }));
    }
  });

  it("calls onDone after a successful bulk operation", () => {
    const { onDone } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "欠" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で登録" }));

    // 仕様 #66
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
