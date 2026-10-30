/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity §5.7 / §7.D (D1-D12)
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";
import { course, findCalls, meeting, occ, recordCalls, stopRecording, timetable, useTimetables, settle } from "../utils/parity-fixtures";

afterEach(() => {
  stopRecording();
  vi.useRealTimers();
});

const DATE = "2026-09-14"; // Monday
const tt = timetable({
  courses: [course("cF1", "F1科目"), course("cF2", "F2科目"), course("cM1", "M1科目"), course("cM2", "M2科目")],
  meetings: [meeting("mF1", "cF1", 5, 1), meeting("mF2", "cF2", 5, 3, 2), meeting("mM1", "cM1", 1, 1), meeting("mM2", "cM2", 1, 5)],
});
const o = (id: string, name: string, p: number, status: any = null, transferId: string | null = null) =>
  ({ ...occ(id, name, p, 540 + p * 60, 590 + p * 60, status, DATE), transferId });

const transferMove = {
  id: "t1", userTimetableId: "ut-1", date: DATE, kind: "MOVE_DAY", sourceDayOfWeek: 5, sourceDate: "2026-09-11",
  note: null, occurrenceIds: ["a", "b", "c"], displaced: [], createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
};

function useDay(detail: any) {
  server.use(
    http.get(`${API_URL}/api/day/${DATE}`, () =>
      HttpResponse.json({ date: DATE, occurrences: [], courseSuspensions: [], timetableSuspension: null, transfers: [], ...detail }),
    ),
    http.get(`${API_URL}/api/semesters/:id/overview`, ({ params }) =>
      HttpResponse.json({
        semesterId: params.id, semesterName: "前期", startDate: "2026-04-01", endDate: "2099-03-31", today: DATE, requiredAttendanceRate: 70,
        overall: { effectiveNumerator: 0, effectiveDenominator: 0, attendanceRate: null, toDate: { effectiveNumerator: 0, effectiveDenominator: 0, attendanceRate: null }, unrecordedCount: 0, remainingCount: 0, allowedAbsences: null },
        days: [], courses: [],
      }),
    ),
  );
}

async function openDay(detail: any = {}) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-14T01:00:00Z"));
  useTimetables([tt]);
  useDay(detail);
  const v = await renderApp({ initialPath: "/semester" });
  await v.user.click(await screen.findByRole("button", { name: "9月14日" }));
  await screen.findByRole("heading", { name: /2026年9月14日/ });
  return v;
}

async function openTransferSheet(v: Awaited<ReturnType<typeof renderApp>>) {
  const section = (await screen.findByRole("heading", { name: "授業変更" })).parentElement!;
  await v.user.click(within(section).getByRole("button", { name: "授業変更" }));
  return await screen.findByTestId("class-transfer-sheet");
}

describe("[D] class transfer in day detail", () => {
  it("[D1] section sits between 休講 and 授業 (N), has 授業変更 button", async () => {
    await openDay({ occurrences: [o("a", "M1科目", 1)] });
    const h = await screen.findByRole("heading", { name: "授業変更" });
    const susp = screen.getByText("この日を休講にする (時間割全体)");
    const lessons = screen.getByRole("heading", { name: /^授業 \(\d+\)$/ });
    expect(susp.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(h.compareDocumentPosition(lessons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(h.parentElement!).getByRole("button", { name: "授業変更" })).toBeInTheDocument();
  });

  const withTransfer = (occs: any[]) => ({ transfers: [transferMove], occurrences: occs });
  const three = (status: any) => [o("a", "M1科目", 1, status, "t1"), o("b", "M2科目", 2, status, "t1"), o("c", "F1科目", 3, null, "t1")];

  it("[D2] transfer summary and 取り消す", async () => {
    await openDay(withTransfer(three(null)));
    expect(await screen.findByText("金曜日の時間割 (3コマ) · 9/11(金) を休講")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取り消す" })).toBeInTheDocument();
  });

  it("[D3] 取り消す with no records -> DELETE without confirm", async () => {
    const calls = recordCalls();
    const v = await openDay(withTransfer(three(null)));
    await v.user.click(await screen.findByRole("button", { name: "取り消す" }));
    await waitFor(() => expect(findCalls(calls, "DELETE", /class-transfers\/t1$/)).toHaveLength(1));
    expect(screen.queryByText(/出欠記録 \d+ 件も削除されます/)).toBeNull();
  });

  it("[D4] 取り消す with 2 records -> confirm; キャンセル sends nothing; 取り消す sends DELETE", async () => {
    const calls = recordCalls();
    const v = await openDay(withTransfer(three("PRESENT")));
    await v.user.click(await screen.findByRole("button", { name: "取り消す" }));
    const title = await screen.findByText("出欠記録 2 件も削除されます");
    const dlg = title.closest('[role="dialog"]') as HTMLElement;
    expect(dlg.querySelectorAll("p").length).toBe(0);
    await v.user.click(within(dlg).getByRole("button", { name: "キャンセル" }));
    await settle(200);
    expect(findCalls(calls, "DELETE", /class-transfers/)).toHaveLength(0);
    await v.user.click(screen.getAllByRole("button", { name: "取り消す" })[0]!);
    const dlg2 = (await screen.findByText("出欠記録 2 件も削除されます")).closest('[role="dialog"]') as HTMLElement;
    await v.user.click(within(dlg2).getByRole("button", { name: "取り消す" }));
    await waitFor(() => expect(findCalls(calls, "DELETE", /class-transfers\/t1$/)).toHaveLength(1));
  });

  const existing = [o("oM1", "M1科目", 1), o("oM2", "M2科目", 5)];

  it("[D5] defaults: 曜日ごと, 金 selected, 2 preview rows, suspension ON, date 2026-09-11", async () => {
    const v = await openDay({ occurrences: existing });
    const sheet = await openTransferSheet(v);
    expect(within(sheet).getByRole("button", { name: "曜日ごと" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("button", { name: "コマごと" })).toHaveAttribute("aria-pressed", "false");
    expect(within(sheet).getByRole("button", { name: "金" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByText("この日に置く授業")).toBeInTheDocument();
    // 行は「{N}限」+ 科目名 + 右に「→ {replaces}」。要素の分割に依存しないよう textContent で見る
    expect(sheet.textContent).toContain("1限");
    expect(sheet.textContent).toContain("F1科目");
    expect(sheet.textContent).toContain("3-4限");
    expect(sheet.textContent).toContain("F2科目");
    expect(sheet.textContent).toContain("月曜 1限 M1科目 を置き換え");
    expect((within(sheet).getByLabelText("元の日を休講にする") as HTMLInputElement).checked).toBe(true);
    const date = sheet.querySelector('input[type="date"]') as HTMLInputElement;
    expect(date.value).toBe("2026-09-11");
    expect(within(sheet).getByTestId("class-transfer-submit")).toHaveTextContent("この日に反映");
  });

  it("[D6] choosing the same weekday -> message, submit disabled", async () => {
    const v = await openDay({ occurrences: existing });
    const sheet = await openTransferSheet(v);
    await v.user.click(within(sheet).getByRole("button", { name: "月" }));
    expect(within(sheet).getByText("この日と同じ曜日です")).toBeInTheDocument();
    expect(within(sheet).getByTestId("class-transfer-submit")).toBeDisabled();
  });

  it("[D6b] weekday without lessons", async () => {
    const v = await openDay({ occurrences: existing });
    const sheet = await openTransferSheet(v);
    await v.user.click(within(sheet).getByRole("button", { name: "水" }));
    expect(within(sheet).getByText("この曜日に授業はありません")).toBeInTheDocument();
    expect(within(sheet).getByTestId("class-transfer-submit")).toBeDisabled();
  });

  it("[D7] submit MOVE_DAY body", async () => {
    const calls = recordCalls();
    const v = await openDay({ occurrences: existing });
    const sheet = await openTransferSheet(v);
    await v.user.click(within(sheet).getByTestId("class-transfer-submit"));
    await waitFor(() => expect(findCalls(calls, "POST", /^\/api\/class-transfers$/)).toHaveLength(1));
    const body = findCalls(calls, "POST", /^\/api\/class-transfers$/)[0]!.body;
    expect(body).toMatchObject({ kind: "MOVE_DAY", date: DATE, sourceDayOfWeek: 5, suspendSourceDate: true, sourceDate: "2026-09-11", liftTargetSuspension: false });
    expect("courseId" in body).toBe(false);
  });

  it("[D8] suspension OFF -> no sourceDate, suspendSourceDate false", async () => {
    const calls = recordCalls();
    const v = await openDay({ occurrences: existing });
    const sheet = await openTransferSheet(v);
    await v.user.click(within(sheet).getByLabelText("元の日を休講にする"));
    await v.user.click(within(sheet).getByTestId("class-transfer-submit"));
    await waitFor(() => expect(findCalls(calls, "POST", /^\/api\/class-transfers$/)).toHaveLength(1));
    const body = findCalls(calls, "POST", /^\/api\/class-transfers$/)[0]!.body;
    expect(body.suspendSourceDate).toBe(false);
    expect("sourceDate" in body).toBe(false);
  });

  it("[D9] per-lesson: preview row, 追加, SINGLE body", async () => {
    const calls = recordCalls();
    const v = await openDay({ occurrences: existing });
    const sheet = await openTransferSheet(v);
    await v.user.click(within(sheet).getByRole("button", { name: "コマごと" }));
    const select = within(sheet).getByRole("combobox") as HTMLSelectElement;
    expect(within(select).getByRole("option", { name: "科目を選択" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "cF1" } });
    await v.user.click(within(sheet).getByRole("button", { name: "3限" }));
    await v.user.click(within(sheet).getByRole("button", { name: "4限" }));
    const submit = within(sheet).getByTestId("class-transfer-submit");
    expect(submit).toHaveTextContent("追加");
    expect(sheet.textContent).toContain("3-4限");
    await v.user.click(submit);
    await waitFor(() => expect(findCalls(calls, "POST", /^\/api\/class-transfers$/)).toHaveLength(1));
    const body = findCalls(calls, "POST", /^\/api\/class-transfers$/)[0]!.body;
    expect(body).toMatchObject({ kind: "SINGLE", date: DATE, courseId: "cF1", periodIndexes: [3, 4], liftTargetSuspension: false });
  });

  it.each([
    ["PERIOD_CONFLICT", "その時限には既に授業変更があります"],
    ["DISPLACED_HAS_RECORD", "出欠記録がある授業を置き換えることはできません。先に記録を消してください"],
    ["DAY_SUSPENDED", "この日は休講です"],
  ])("[D10] 409 %s -> message", async (code, text) => {
    server.use(http.post(`${API_URL}/api/class-transfers`, () => HttpResponse.json({ error: { code, message: "server says" } }, { status: 409 })));
    const v = await openDay({ occurrences: existing });
    const sheet = await openTransferSheet(v);
    await v.user.click(within(sheet).getByTestId("class-transfer-submit"));
    expect(await within(sheet).findByText(text)).toBeInTheDocument();
    expect(screen.getByTestId("class-transfer-sheet")).toBeInTheDocument();
  });

  it("[D10b] other error shows server message", async () => {
    server.use(http.post(`${API_URL}/api/class-transfers`, () => HttpResponse.json({ error: { code: "WHATEVER", message: "サーバーの文言" } }, { status: 400 })));
    const v = await openDay({ occurrences: existing });
    const sheet = await openTransferSheet(v);
    await v.user.click(within(sheet).getByTestId("class-transfer-submit"));
    expect(await within(sheet).findByText("サーバーの文言")).toBeInTheDocument();
  });

  it("[D11] suspended target day -> notice and liftTargetSuspension:true", async () => {
    const calls = recordCalls();
    const v = await openDay({
      occurrences: existing,
      timetableSuspension: { id: "ts", userTimetableId: "ut-1", date: DATE, reason: null, createdAt: "2026-09-01T00:00:00Z" },
    });
    const sheet = await openTransferSheet(v);
    expect(within(sheet).getByText("この日の休講は解除されます")).toBeInTheDocument();
    await v.user.click(within(sheet).getByTestId("class-transfer-submit"));
    await waitFor(() => expect(findCalls(calls, "POST", /^\/api\/class-transfers$/)).toHaveLength(1));
    expect(findCalls(calls, "POST", /^\/api\/class-transfers$/)[0]!.body.liftTargetSuspension).toBe(true);
  });

  it("[D12] success closes the sheet and invalidates 5 query families", async () => {
    const v = await openDay({ occurrences: existing });
    const spy = vi.spyOn(v.queryClient, "invalidateQueries");
    const sheet = await openTransferSheet(v);
    await v.user.click(within(sheet).getByTestId("class-transfer-submit"));
    await waitFor(() => expect(screen.queryByTestId("class-transfer-sheet")).toBeNull());
    expect(screen.getByRole("heading", { name: /2026年9月14日/ })).toBeInTheDocument();
    const heads = spy.mock.calls.map((c: any) => JSON.stringify((c[0] as any)?.queryKey?.[0] ?? c[0]));
    for (const k of ["day", "semesters", "stats", "today", "timetable-suspensions"]) {
      expect(heads, `invalidate ${k}`).toContain(JSON.stringify(k));
    }
  });
});
