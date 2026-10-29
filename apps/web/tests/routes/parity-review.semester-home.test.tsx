/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity §5.3 / §7.SM (SM1-SM19)
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as SchoolClock from "@/lib/SchoolClock";
import * as SR from "@/lib/SemesterRollover";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";
import {
  findCalls, recordCalls, sem, slotsN, stopRecording, template, timetable, useMe, useRooms, useSemesters, useTemplates, useTimetables,
} from "../utils/parity-fixtures";

const KEY = "atender.semesterRollover.dismissedSemesterId";
const old = sem("old", "2000 前期", "2000-04-01", "2000-09-30");
const TITLE = "前回の学期が終了しました";

afterEach(() => {
  stopRecording();
  vi.useRealTimers();
});

async function expectNoDialog() {
  await new Promise((r) => setTimeout(r, 400));
  expect(screen.queryByText(TITLE)).toBeNull();
}

describe("[SM] semester rollover prompt", () => {
  it("[SM1] prompt shows with message and buttons", async () => {
    useSemesters([old]);
    await renderApp({ initialPath: "/" });
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText("「2000 前期」は 2000年 9月30日 に終了しました。新しい学期を作成しますか?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作成する" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "あとで" })).toBeInTheDocument();
  });

  it("[SM2] あとで stores dismissed id and survives remount", async () => {
    useSemesters([old]);
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "あとで" }));
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(localStorage.getItem(KEY)).toBe("old");
    v.unmount();
    await renderApp({ initialPath: "/" });
    await screen.findByRole("button", { name: "ルームを追加" });
    await expectNoDialog();
  });

  it("[SM3] × close is treated as あとで", async () => {
    useSemesters([old]);
    const v = await renderApp({ initialPath: "/" });
    await screen.findByText(TITLE);
    const dlg = screen.getByText(TITLE).closest('[role="dialog"],[role="alertdialog"]') as HTMLElement;
    await v.user.click(within(dlg).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(localStorage.getItem(KEY)).toBe("old");
  });

  it("[SM3b] Escape is treated as あとで", async () => {
    useSemesters([old]);
    const v = await renderApp({ initialPath: "/" });
    await screen.findByText(TITLE);
    await v.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(localStorage.getItem(KEY)).toBe("old");
  });

  it("[SM4] a newer ended semester prompts again after dismissal", async () => {
    localStorage.setItem(KEY, "old");
    useSemesters([old, sem("old2", "2001 前期", "2001-04-01", "2001-09-30")]);
    await renderApp({ initialPath: "/" });
    expect(await screen.findByText("「2001 前期」は 2001年 9月30日 に終了しました。新しい学期を作成しますか?")).toBeInTheDocument();
  });

  it("[SM5] default fixture (ongoing semester) -> no prompt", async () => {
    await renderApp({ initialPath: "/" });
    await screen.findByRole("button", { name: "ルームを追加" });
    await expectNoDialog();
  });

  it("[SM6] no semesters -> no prompt", async () => {
    useSemesters([]);
    await renderApp({ initialPath: "/" });
    await screen.findByRole("button", { name: "ルームを追加" });
    await expectNoDialog();
  });

  it("[SM7] visibilitychange re-evaluates; suppressed while a home sheet is open", async () => {
    useSemesters([old]);
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "あとで" }));
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    localStorage.clear();
    await v.user.click(screen.getByRole("button", { name: "ルームを追加" }));
    await v.user.click(screen.getByRole("menuitem", { name: "ルームを作成" }));
    await screen.findByRole("heading", { name: "ルームを作成" });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new Event("visibilitychange"));
    await expectNoDialog();
    await v.user.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "ルームを作成" })).toBeNull());
    fireEvent(document, new Event("visibilitychange"));
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
  });
});

describe("[SM] new semester sheet", () => {
  async function openSheet(extra: () => void = () => {}) {
    extra();
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "作成する" }));
    await screen.findByRole("heading", { name: "新しい学期" });
    return v;
  }
  const field = (re: RegExp) => screen.getByLabelText(re) as HTMLInputElement;

  it("[SM8] initial values = proposal(old, today)", async () => {
    useSemesters([old]);
    await openSheet();
    const p = SR.proposal(old as any, SchoolClock.todayString());
    expect([field(/学期名/).value, field(/開始日/).value, field(/終了日/).value]).toEqual([p.name, p.startDate, p.endDate]);
    expect(screen.getByText("時限と表示曜日は前の学期から引き継がれます")).toBeInTheDocument();
  });

  const tplA = template({ id: "tA", title: "テンプレA" });
  const tplB = template({ id: "tB", title: "テンプレB", authorUserId: "other", copyCount: 2 });

  it("[SM9] suggestion card with count and 選ぶ", async () => {
    useSemesters([old]);
    await openSheet(() => useTemplates([tplA, tplB]));
    const card = await screen.findByTestId("semester-create-template-suggestion");
    expect(within(card).getByText("同じ学科の時間割が 2 件見つかりました")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "選ぶ" })).toBeInTheDocument();
  });

  async function pick(v: Awaited<ReturnType<typeof renderApp>>) {
    const card = await screen.findByTestId("semester-create-template-suggestion");
    await v.user.click(within(card).getByRole("button", { name: "選ぶ" }));
    expect(await screen.findByText("✓ 同じ学科の時間割が見つかりました")).toBeInTheDocument();
    await v.user.click(await screen.findByTestId("template-card-tA"));
    await v.user.click(await screen.findByRole("button", { name: "この時間割を使う" }));
  }

  it("[SM10] select a template from the browser", async () => {
    useSemesters([old]);
    const v = await openSheet(() => useTemplates([tplA, tplB]));
    await pick(v);
    const card = await screen.findByTestId("semester-create-template-suggestion");
    expect(within(card).getByText("取り込む: テンプレA")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "解除" })).toBeInTheDocument();
    expect(screen.getByText("時限と表示曜日は取り込む時間割に合わせます")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "公開時間割" })).toBeNull();
  });

  function semState() {
    const list: any[] = [old];
    server.use(
      http.get(`${API_URL}/api/semesters`, () => HttpResponse.json({ semesters: list })),
      http.post(`${API_URL}/api/semesters`, async ({ request }) => {
        const body = (await request.json()) as any;
        const created = { id: "semester-new", ...body };
        list.push(created);
        return HttpResponse.json({ semester: created }, { status: 201 });
      }),
    );
  }

  it("[SM11] create: semesters -> copy -> PATCH default; sheet closes; picker shows new name", async () => {
    const calls = recordCalls();
    semState();
    const v = await openSheet(() => useTemplates([tplA, tplB]));
    await pick(v);
    await v.user.click(screen.getByRole("button", { name: "学期を作成" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "新しい学期" })).toBeNull());
    const seq = calls.map((c) => `${c.method} ${c.url.pathname}`);
    const iSem = seq.indexOf("POST /api/semesters");
    const iCopy = seq.indexOf("POST /api/timetable-templates/tA/copy");
    const iPatch = calls.findIndex((c) => c.method === "PATCH" && c.body?.defaultSemesterId);
    expect(iSem).toBeGreaterThanOrEqual(0);
    expect(iCopy).toBeGreaterThan(iSem);
    expect(iPatch).toBeGreaterThan(iCopy);
    expect(calls[iPatch]!.body).toEqual({ defaultSemesterId: "semester-new" });
    const p = SR.proposal(old as any, SchoolClock.todayString());
    expect(findCalls(calls, "POST", /^\/api\/semesters$/)[0]!.body).toEqual({ name: p.name, startDate: p.startDate, endDate: p.endDate });
    expect(await screen.findByRole("button", { name: p.name })).toBeInTheDocument();
  });

  // toast は module 単位の共有ストアで 2.6 秒残る。SM13 は「toast が出ない」ことを見るので SM12 より前に置く
  it("[SM13] copy 409 -> silent", async () => {
    const calls = recordCalls();
    semState();
    server.use(http.post(`${API_URL}/api/timetable-templates/:id/copy`, () => HttpResponse.json({ error: { code: "C", message: "dup" } }, { status: 409 })));
    const v = await openSheet(() => useTemplates([tplA, tplB]));
    await pick(v);
    await v.user.click(screen.getByRole("button", { name: "学期を作成" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "新しい学期" })).toBeNull());
    expect(findCalls(calls, "PATCH", /^\/api\/me$/).filter((c) => c.body?.defaultSemesterId)).toHaveLength(1);
    expect(screen.queryByText(/学期は作成しました/)).toBeNull();
  });

  it("[SM12] copy 500 -> toast, PATCH still sent, sheet closes", async () => {
    const calls = recordCalls();
    semState();
    server.use(http.post(`${API_URL}/api/timetable-templates/:id/copy`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));
    const v = await openSheet(() => useTemplates([tplA, tplB]));
    await pick(v);
    await v.user.click(screen.getByRole("button", { name: "学期を作成" }));
    expect(await screen.findByText("学期は作成しました。時間割は「時間割の設定」から取り込めます")).toBeInTheDocument();
    await waitFor(() => expect(findCalls(calls, "PATCH", /^\/api\/me$/).filter((c) => c.body?.defaultSemesterId)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "新しい学期" })).toBeNull());
  });

  it("[SM14] POST semesters 500 -> toast, sheet stays, no copy/PATCH", async () => {
    const calls = recordCalls();
    useSemesters([old]);
    server.use(http.post(`${API_URL}/api/semesters`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));
    const v = await openSheet(() => useTemplates([tplA, tplB]));
    await pick(v);
    await v.user.click(screen.getByRole("button", { name: "学期を作成" }));
    expect(await screen.findByText("保存できませんでした")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "新しい学期" })).toBeInTheDocument();
    expect(findCalls(calls, "POST", /copy$/)).toHaveLength(0);
    expect(findCalls(calls, "PATCH", /^\/api\/me$/).filter((c) => c.body?.defaultSemesterId)).toHaveLength(0);
  });

  it("[SM15] PATCH me 500 -> toast, sheet closes, home shows new semester", async () => {
    semState();
    server.use(http.patch(`${API_URL}/api/me`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));
    const v = await openSheet();
    await v.user.click(screen.getByRole("button", { name: "学期を作成" }));
    expect(await screen.findByText("既定の学期を更新できませんでした。設定の学期管理から選べます")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "新しい学期" })).toBeNull());
    const p = SR.proposal(old as any, SchoolClock.todayString());
    expect(await screen.findByRole("button", { name: p.name })).toBeInTheDocument();
  });

  it("[SM16] disabled for blank name or start > end", async () => {
    useSemesters([old]);
    const v = await openSheet();
    const btn = screen.getByRole("button", { name: "学期を作成" });
    expect(btn).toBeEnabled();
    await v.user.clear(field(/学期名/));
    await v.user.type(field(/学期名/), "   ");
    expect(btn).toBeDisabled();
    await v.user.clear(field(/学期名/));
    await v.user.type(field(/学期名/), "X");
    expect(btn).toBeEnabled();
    fireEvent.change(field(/開始日/), { target: { value: "2099-12-31" } });
    fireEvent.change(field(/終了日/), { target: { value: "2099-01-01" } });
    expect(btn).toBeDisabled();
  });
});

describe("[SM] carry-over of periods / days", () => {
  const tt8 = timetable({
    id: "ut-A", semesterId: "A", daySlots: slotsN(8), daysOfWeek: [1, 2, 3, 4, 5, 6],
  });
  const sA = sem("A", "春", "2026-04-01", "2026-09-30");
  const sB = sem("B", "秋", "2026-10-01", "2099-03-31");

  it("[SM17] new semester inherits 8 rows and Mon-Sat", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T02:00:00Z"));
    useMe({ defaultSemesterId: "A" });
    useSemesters([sA, sB]);
    useTimetables([tt8]);
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "春" }));
    await v.user.click(await screen.findByRole("button", { name: "秋" }));
    await screen.findByRole("button", { name: "秋" });
    await waitFor(() => {
      expect(screen.getByText("8限")).toBeInTheDocument();
      expect(screen.getByText("土")).toBeInTheDocument();
    });
  });

  it("[SM18] empty cell on new semester POSTs inherited daySlots / daysOfWeek", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T02:00:00Z"));
    const calls = recordCalls();
    useMe({ defaultSemesterId: "B" });
    useSemesters([sA, sB]);
    useTimetables([tt8]);
    const v = await renderApp({ initialPath: "/" });
    await screen.findByText("8限");
    const plus = screen.getAllByRole("button", { name: "+" })[0]!;
    await v.user.click(plus);
    await waitFor(() => expect(findCalls(calls, "POST", /^\/api\/user-timetables$/)).toHaveLength(1));
    const body = findCalls(calls, "POST", /^\/api\/user-timetables$/)[0]!.body;
    expect(body.semesterId).toBe("B");
    expect(body.daySlots).toHaveLength(8);
    expect(body.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("[SM19] no previous semester -> 5 rows, Mon-Fri defaults", async () => {
    const calls = recordCalls();
    useRooms([]);
    const v = await renderApp({ initialPath: "/" });
    await screen.findByText("5限");
    expect(screen.queryByText("6限")).toBeNull();
    expect(screen.queryByText("土")).toBeNull();
    await v.user.click(screen.getAllByRole("button", { name: "+" })[0]!);
    await waitFor(() => expect(findCalls(calls, "POST", /^\/api\/user-timetables$/)).toHaveLength(1));
    const body = findCalls(calls, "POST", /^\/api\/user-timetables$/)[0]!.body;
    expect(body.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(body.daySlots).toHaveLength(5);
  });
});
