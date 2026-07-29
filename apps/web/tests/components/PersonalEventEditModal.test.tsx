// PersonalEventEditModal (Web) — 新 DTO 形 (§5.1 / §3.3 / §7)
// 設計doc: .designs/20260729-personal-calendar-rebuild.md §7 / §3.3 / §6.5 (UI 側の終日変換)
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PersonalEventOccurrenceDto } from "@atender/shared";

import { PersonalEventEditModal } from "@/components/semester/PersonalEventEditModal";
import { useCreatePersonalEvent, useDeletePersonalEvent, useUpdatePersonalEvent } from "@/api/hooks";

vi.mock("@/api/hooks", () => ({
  useCreatePersonalEvent: vi.fn(),
  useUpdatePersonalEvent: vi.fn(),
  useDeletePersonalEvent: vi.fn(),
}));

function jstIso(literal: string): string {
  return new Date(`${literal}:00.000+09:00`).toISOString();
}

/** label のテキストは "タイトル*" のように必須マークが別要素に割れるので textContent の前方一致で引く */
function controlInLabel(label: string) {
  const labelElement = Array.from(document.querySelectorAll("label")).find((el) =>
    (el.textContent ?? "").replace(/\s+/g, "").startsWith(label.replace(/\s+/g, "")),
  );
  const control = labelElement?.querySelector("input, textarea, select");
  if (!control) throw new Error(`No control found for label: ${label}`);
  return control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

function mockMutations() {
  const createMutate = vi.fn((_body, options) => options?.onSuccess?.({ event: { id: "event-1" } }));
  const updateMutate = vi.fn((_body, options) => options?.onSuccess?.({ event: { id: "event-1" } }));
  const deleteMutate = vi.fn((_body, options) => options?.onSuccess?.({ ok: true }));
  const createMutateAsync = vi.fn().mockResolvedValue({ event: { id: "event-1" } });
  const updateMutateAsync = vi.fn().mockResolvedValue({ event: { id: "event-1" } });
  const deleteMutateAsync = vi.fn().mockResolvedValue({ ok: true });
  vi.mocked(useCreatePersonalEvent).mockReturnValue({ mutate: createMutate, mutateAsync: createMutateAsync, isPending: false } as any);
  vi.mocked(useUpdatePersonalEvent).mockReturnValue({ mutate: updateMutate, mutateAsync: updateMutateAsync, isPending: false } as any);
  vi.mocked(useDeletePersonalEvent).mockReturnValue({ mutate: deleteMutate, mutateAsync: deleteMutateAsync, isPending: false } as any);
  return { createMutate, createMutateAsync, updateMutate, updateMutateAsync, deleteMutate, deleteMutateAsync };
}

function sentBody(mutate: ReturnType<typeof vi.fn>, mutateAsync: ReturnType<typeof vi.fn>) {
  const call = mutate.mock.calls[0] ?? mutateAsync.mock.calls[0];
  return call?.[0] as Record<string, any>;
}

const occurrence: PersonalEventOccurrenceDto = {
  seriesId: "series-1",
  occurrenceDate: jstIso("2026-07-23T00:00"),
  start: jstIso("2026-07-23T00:00"),
  end: jstIso("2026-07-26T00:00"), // 7/23〜7/25 の終日 (排他 end)
  days: [
    { date: "2026-07-23", startMinute: 0, endMinute: 1440 },
    { date: "2026-07-24", startMinute: 0, endMinute: 1440 },
    { date: "2026-07-25", startMinute: 0, endMinute: 1440 },
  ],
  isAllDay: true,
  title: "帰省",
  location: "実家",
  note: "お土産",
  color: "#8b5cf6",
  isRecurringOccurrence: false,
  recurrenceRule: null,
  recurrenceSpec: null,
  overrideId: null,
  source: "MANUAL",
  ekExternalId: null,
  ekCalendarId: null,
  createdAt: jstIso("2026-07-01T00:00"),
  updatedAt: jstIso("2026-07-01T00:00"),
} as PersonalEventOccurrenceDto;

describe("PersonalEventEditModal", () => {
  it("[UI] 終日 ON では日付のみ、OFF にすると日時入力になる", () => {
    mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-07-23" />);

    expect((controlInLabel("終日") as HTMLInputElement).checked).toBe(true);
    expect(controlInLabel("開始日*")).toHaveAttribute("type", "date");
    expect(controlInLabel("終了日*")).toHaveAttribute("type", "date");

    fireEvent.click(controlInLabel("終日"));

    expect(controlInLabel("開始*")).toHaveAttribute("type", "datetime-local");
    expect(controlInLabel("終了*")).toHaveAttribute("type", "datetime-local");
  });

  it("[W4/§3.3] 終日は start=JST 00:00 / end=翌 00:00 (排他) の UTC ISO で送る", async () => {
    const { createMutate, createMutateAsync } = mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-07-23" />);
    fireEvent.change(controlInLabel("タイトル*"), { target: { value: "バイト" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(createMutate.mock.calls.length + createMutateAsync.mock.calls.length).toBeGreaterThan(0),
    );
    const body = sentBody(createMutate, createMutateAsync);

    expect(body).toEqual(
      expect.objectContaining({
        title: "バイト",
        isAllDay: true,
        start: jstIso("2026-07-23T00:00"),
        end: jstIso("2026-07-24T00:00"),
      }),
    );
    // サーバ zod は z.string().datetime() = UTC "Z" のみ受理する
    expect(String(body.start)).toMatch(/Z$/);
    expect(String(body.end)).toMatch(/Z$/);
    // 旧モデルのフィールドは送らない
    expect(body).not.toHaveProperty("date");
    expect(body).not.toHaveProperty("startMinute");
    expect(body).not.toHaveProperty("endMinute");
    expect(body).not.toHaveProperty("semesterId");
  });

  it("[§3.3] 終日で終了日を 7/25 にすると排他 end は 7/26 00:00 になる", async () => {
    const { createMutate, createMutateAsync } = mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-07-23" />);
    fireEvent.change(controlInLabel("タイトル*"), { target: { value: "帰省" } });
    fireEvent.change(controlInLabel("終了日*"), { target: { value: "2026-07-25" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(createMutate.mock.calls.length + createMutateAsync.mock.calls.length).toBeGreaterThan(0),
    );
    const body = sentBody(createMutate, createMutateAsync);

    expect(body.start).toBe(jstIso("2026-07-23T00:00"));
    expect(body.end).toBe(jstIso("2026-07-26T00:00"));
  });

  it("[§6.5] 時刻ありは datetime-local の値を instant としてそのまま送る", async () => {
    const { createMutate, createMutateAsync } = mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-07-23" />);
    fireEvent.change(controlInLabel("タイトル*"), { target: { value: "面談" } });
    fireEvent.click(controlInLabel("終日"));
    fireEvent.change(controlInLabel("開始*"), { target: { value: "2026-07-23T09:00" } });
    fireEvent.change(controlInLabel("終了*"), { target: { value: "2026-07-23T10:30" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(createMutate.mock.calls.length + createMutateAsync.mock.calls.length).toBeGreaterThan(0),
    );
    const body = sentBody(createMutate, createMutateAsync);

    expect(body.isAllDay).toBe(false);
    expect(new Date(body.start).getTime()).toBe(new Date("2026-07-23T09:00").getTime());
    expect(new Date(body.end).getTime()).toBe(new Date("2026-07-23T10:30").getTime());
    expect(String(body.start)).toMatch(/Z$/);
  });

  it("[U12 相当] 編集時、終日の終了日フィールドは包含最終日 (end - 1ms の日) になる", () => {
    mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-07-23" event={occurrence} />);

    expect((controlInLabel("タイトル*") as HTMLInputElement).value).toBe("帰省");
    expect((controlInLabel("開始日*") as HTMLInputElement).value).toBe("2026-07-23");
    expect((controlInLabel("終了日*") as HTMLInputElement).value).toBe("2026-07-25");
    expect((controlInLabel("場所") as HTMLInputElement).value).toBe("実家");
    expect((controlInLabel("メモ") as HTMLTextAreaElement).value).toBe("お土産");
  });

  it("[U12 相当] 編集をそのまま保存すると排他 end に戻る", async () => {
    const { updateMutate, updateMutateAsync } = mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-07-23" event={occurrence} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateMutate.mock.calls.length + updateMutateAsync.mock.calls.length).toBeGreaterThan(0),
    );
    const call = sentBody(updateMutate, updateMutateAsync);
    const body = (call?.input ?? call) as Record<string, any>;

    expect(body.start).toBe(jstIso("2026-07-23T00:00"));
    expect(body.end).toBe(jstIso("2026-07-26T00:00"));
  });

  it("[§7] 場所・メモ・色が body に載る", async () => {
    const { createMutate, createMutateAsync } = mockMutations();

    render(<PersonalEventEditModal open onClose={vi.fn()} date="2026-07-23" />);
    fireEvent.change(controlInLabel("タイトル*"), { target: { value: "バイト" } });
    fireEvent.change(controlInLabel("場所"), { target: { value: "渋谷店" } });
    fireEvent.change(controlInLabel("メモ"), { target: { value: "制服" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(createMutate.mock.calls.length + createMutateAsync.mock.calls.length).toBeGreaterThan(0),
    );
    const body = sentBody(createMutate, createMutateAsync);

    expect(body.location).toBe("渋谷店");
    expect(body.note).toBe("制服");
    expect(String(body.color)).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
