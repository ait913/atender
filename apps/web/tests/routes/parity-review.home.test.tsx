/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity §5.1 / §7.H (H1-H16) / §7.A (A1-A13)
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";
import {
  settle, findCalls, occ, recordCalls, room1, sem, stopRecording, timetable, useMe, useRooms, useSemesters, useTimetables,
} from "../utils/parity-fixtures";

afterEach(() => {
  stopRecording();
  vi.useRealTimers();
});

const members = [
  { userId: "user-1", name: "田中", handle: "tanaka", image: null, role: "OWNER", joinedAt: "2026-04-01T00:00:00Z" },
  { userId: "u2", name: "B", handle: "bee", image: null, role: "MEMBER", joinedAt: "2026-04-01T00:00:00Z" },
];

function setFakeNow(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

function roomHandlers(week: any = null) {
  server.use(
    http.get(`${API_URL}/api/rooms/room-1`, () => HttpResponse.json({ room: room1 })),
    http.get(`${API_URL}/api/rooms/room-1/members`, () => HttpResponse.json({ members })),
  );
  if (week) server.use(http.get(`${API_URL}/api/rooms/room-1/week`, () => HttpResponse.json(week)));
}

async function waitHome() {
  await screen.findByRole("button", { name: "ルームを追加" });
}

describe("[H] home chips / rooms", () => {
  it("[H1] + menu has exactly 2 items; Escape and outside pointerdown close", async () => {
    const v = await renderApp({ initialPath: "/" });
    await waitHome();
    await v.user.click(screen.getByRole("button", { name: "ルームを追加" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((e) => e.textContent)).toEqual(["ルームを作成", "リンクで参加"]);
    await v.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await v.user.click(screen.getByRole("button", { name: "ルームを追加" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("[H2] create room -> POST {name}, refetch rooms, chip selected", async () => {
    const calls = recordCalls();
    let created = false;
    const room9 = { ...room1, id: "room-9", name: "新ルーム" };
    server.use(
      http.get(`${API_URL}/api/rooms`, () => HttpResponse.json({ rooms: created ? [room9] : [] })),
      http.post(`${API_URL}/api/rooms`, () => {
        created = true;
        return HttpResponse.json({ room: room9 }, { status: 201 });
      }),
    );
    const v = await renderApp({ initialPath: "/" });
    await waitHome();
    await v.user.click(screen.getByRole("button", { name: "ルームを追加" }));
    await v.user.click(screen.getByRole("menuitem", { name: "ルームを作成" }));
    await v.user.type(await screen.findByLabelText(/ルーム名/), "新ルーム");
    await v.user.click(screen.getByRole("button", { name: "作成" }));
    await waitFor(() => expect(findCalls(calls, "POST", /^\/api\/rooms$/)).toHaveLength(1));
    expect(findCalls(calls, "POST", /^\/api\/rooms$/)[0]!.body).toEqual({ name: "新ルーム" });
    const chip = await screen.findByRole("button", { name: "新ルーム" });
    await waitFor(() => expect(chip).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByLabelText(/ルーム名/)).toBeNull();
    expect(findCalls(calls, "GET", /^\/api\/rooms$/).length).toBeGreaterThanOrEqual(2);
  });

  it("[H2b] create sheet shape: title / キャンセル / 作成 disabled when empty", async () => {
    const v = await renderApp({ initialPath: "/" });
    await waitHome();
    await v.user.click(screen.getByRole("button", { name: "ルームを追加" }));
    await v.user.click(screen.getByRole("menuitem", { name: "ルームを作成" }));
    expect(await screen.findByRole("heading", { name: "ルームを作成" })).toBeInTheDocument();
    expect(screen.getByLabelText("説明")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作成" })).toBeDisabled();
  });

  it("[H3] create 500 -> toast, sheet stays", async () => {
    server.use(http.post(`${API_URL}/api/rooms`, () => HttpResponse.json({ error: { code: "X", message: "boom" } }, { status: 500 })));
    const v = await renderApp({ initialPath: "/" });
    await waitHome();
    await v.user.click(screen.getByRole("button", { name: "ルームを追加" }));
    await v.user.click(screen.getByRole("menuitem", { name: "ルームを作成" }));
    await v.user.type(await screen.findByLabelText(/ルーム名/), "新ルーム");
    await v.user.click(screen.getByRole("button", { name: "作成" }));
    expect(await screen.findByText("保存できませんでした、もう一度試してください")).toBeInTheDocument();
    expect(screen.getByLabelText(/ルーム名/)).toBeInTheDocument();
  });

  it("[H4] join by link: body {inviteCode:'xyz'}, switches room, no キャンセル in footer", async () => {
    const calls = recordCalls();
    let joined = false;
    server.use(
      http.get(`${API_URL}/api/rooms`, () => HttpResponse.json({ rooms: joined ? [room1] : [] })),
      http.post(`${API_URL}/api/rooms/join`, () => {
        joined = true;
        return HttpResponse.json({ room: room1 });
      }),
    );
    const v = await renderApp({ initialPath: "/" });
    await waitHome();
    await v.user.click(screen.getByRole("button", { name: "ルームを追加" }));
    await v.user.click(screen.getByRole("menuitem", { name: "リンクで参加" }));
    const input = await screen.findByLabelText("招待リンクまたはコード");
    expect(screen.queryByRole("button", { name: "キャンセル" })).toBeNull();
    expect(screen.getByRole("button", { name: "参加" })).toBeDisabled();
    await v.user.type(input, "https://atender.appily.run/rooms/join/xyz");
    await v.user.click(screen.getByRole("button", { name: "参加" }));
    await waitFor(() => expect(findCalls(calls, "POST", /\/api\/rooms\/join$/)).toHaveLength(1));
    expect(findCalls(calls, "POST", /\/api\/rooms\/join$/)[0]!.body).toEqual({ inviteCode: "xyz" });
    const chip = await screen.findByRole("button", { name: "情報科学1年" });
    await waitFor(() => expect(chip).toHaveAttribute("aria-pressed", "true"));
  });

  it("[H5] self context gear = 時間割の設定", async () => {
    await renderApp({ initialPath: "/" });
    await waitHome();
    expect(await screen.findByRole("button", { name: "時間割の設定" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ルームの設定" })).toBeNull();
  });

  it("[H6] room context gear = ルームの設定 + semester picker still shown", async () => {
    useRooms([room1]);
    useSemesters([sem("semester-1", "前期", "2026-04-01", "2099-03-31")]);
    roomHandlers();
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "情報科学1年" }));
    const gear = await screen.findByRole("button", { name: "ルームの設定" });
    expect(gear).toHaveAttribute("data-testid", "home-room-settings");
    expect(screen.queryByRole("button", { name: "時間割の設定" })).toBeNull();
    expect(screen.getByRole("button", { name: "前期" })).toBeInTheDocument();
  });

  it("[H7] room week request carries semesterId and JST monday weekStart", async () => {
    setFakeNow("2026-10-28T02:00:00Z");
    const calls = recordCalls();
    useRooms([room1]);
    useSemesters([sem("semester-1", "前期", "2026-04-01", "2099-03-31"), sem("semester-2", "後期", "2026-10-01", "2099-03-31")]);
    roomHandlers();
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "情報科学1年" }));
    await waitFor(() => expect(findCalls(calls, "GET", /\/rooms\/room-1\/week$/).length).toBeGreaterThan(0));
    await v.user.click(screen.getByRole("button", { name: "前期" }));
    await v.user.click(await screen.findByRole("button", { name: "後期" }));
    await waitFor(() => {
      const hit = findCalls(calls, "GET", /\/rooms\/room-1\/week$/).filter((c) => c.url.searchParams.get("semesterId") === "semester-2");
      expect(hit.length).toBeGreaterThan(0);
      expect(hit[0]!.url.searchParams.get("weekStart")).toBe("2026-10-26");
    });
  });

  const weekBase = {
    weekStart: "2026-10-26", weekEnd: "2026-11-01",
    members: [{ userId: "u2", name: "B", handle: "bee", image: null, color: "#0f0" }],
  };

  it("[H8] recurringMeetings drive the grid (meetings ignored)", async () => {
    useRooms([room1]);
    useTimetables([timetable()]);
    roomHandlers({
      ...weekBase, meetings: [],
      recurringMeetings: [{ userId: "u2", timetableId: "t", courseId: "c9", courseName: "数学I", courseColor: "#123456", dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1 }],
    });
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "情報科学1年" }));
    const grid = await screen.findByTestId("room-timetable");
    expect(await within(grid).findByText("数学I")).toBeInTheDocument();
  });

  it("[H9] only date-based meetings -> empty state", async () => {
    useRooms([room1]);
    roomHandlers({
      ...weekBase, recurringMeetings: [],
      meetings: [{ userId: "u2", occurrenceId: "o", courseId: "c9", courseName: "数学I", courseColor: null, date: "2026-10-26", startMinute: 540, endMinute: 630 }],
    });
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "情報科学1年" }));
    expect(await screen.findByText("メンバーの時間割がまだありません")).toBeInTheDocument();
    expect(screen.queryByText("数学I")).toBeNull();
  });

  it("[H10] delete room -> DELETE, back to 自分, path stays /", async () => {
    const calls = recordCalls();
    let deleted = false;
    server.use(
      http.get(`${API_URL}/api/rooms`, () => HttpResponse.json({ rooms: deleted ? [] : [room1] })),
      http.delete(`${API_URL}/api/rooms/room-1`, () => {
        deleted = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    roomHandlers();
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "情報科学1年" }));
    await v.user.click(await screen.findByRole("button", { name: "ルームの設定" }));
    await v.user.click(await screen.findByRole("button", { name: "ルームを削除" }));
    await v.user.click(await screen.findByRole("button", { name: "削除" }));
    await waitFor(() => expect(findCalls(calls, "DELETE", /\/api\/rooms\/room-1$/)).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "自分" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByRole("dialog", { name: "ルームの設定" })).toBeNull();
    expect(v.path()).toBe("/");
  });

  it("[H11] room settings wording", async () => {
    useRooms([room1]);
    roomHandlers();
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "情報科学1年" }));
    await v.user.click(await screen.findByRole("button", { name: "ルームの設定" }));
    expect(await screen.findByText("説明")).toBeInTheDocument();
    expect(screen.queryByText("ルームの説明")).toBeNull();
    expect(screen.getByText("メンバー時間割を表示")).toBeInTheDocument();
    expect(screen.queryByText("反映する")).toBeNull();
    expect(await screen.findByText("@tanaka · オーナー")).toBeInTheDocument();
    expect(screen.getByText("@bee · メンバー")).toBeInTheDocument();
    // 追放 -> 本文なし・確認 "追放"
    await v.user.click(screen.getByRole("button", { name: "追放" }));
    const dlg = await screen.findByRole("alertdialog").catch(() => screen.getByText("メンバーを追放しますか？").closest('[role="dialog"]') as HTMLElement);
    expect(within(dlg).getByText("メンバーを追放しますか？")).toBeInTheDocument();
    expect(within(dlg).getAllByRole("button").map((b) => b.textContent)).toEqual(expect.arrayContaining(["追放", "キャンセル"]));
    expect(within(dlg).queryByText("追放する")).toBeNull();
    expect(dlg.querySelectorAll("p").length).toBe(0);
  });

  it("[H12] show-member toggle PATCH 500 -> reverts + toast", async () => {
    useRooms([room1]);
    roomHandlers();
    server.use(http.patch(`${API_URL}/api/rooms/room-1`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "情報科学1年" }));
    await v.user.click(await screen.findByRole("button", { name: "ルームの設定" }));
    const sw = await screen.findByRole("switch", { hidden: true }).catch(() => screen.getByLabelText("メンバー時間割を表示"));
    const checkbox = screen.getByLabelText("メンバー時間割を表示") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await v.user.click(checkbox);
    expect(await screen.findByText("保存できませんでした、もう一度試してください")).toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText("メンバー時間割を表示") as HTMLInputElement).checked).toBe(true));
    void sw;
  });
});

describe("[H] today / current period highlight", () => {
  const prep = (daysOfWeek = [1, 2, 3, 4, 5]) => {
    useTimetables([timetable({ daysOfWeek })]);
  };
  const headerOf = (txt: string) => screen.getAllByText(txt).map((e) => e.closest("[data-today]") ?? e).find((e) => e.hasAttribute("data-today")) ?? null;

  it("[H13] Wed 11:00 JST: 水 data-today, 2限 data-current, one ring", async () => {
    setFakeNow("2026-10-28T02:00:00Z");
    prep();
    await renderApp({ initialPath: "/" });
    await screen.findByText("2限");
    const todayEls = document.querySelectorAll('[data-today="true"]');
    expect(todayEls).toHaveLength(1);
    expect(todayEls[0]!.textContent).toBe("水");
    const cur = document.querySelectorAll('[data-current="true"]');
    expect(cur).toHaveLength(1);
    expect(cur[0]!.textContent).toContain("2限");
    expect(screen.getAllByTestId("timetable-now-ring")).toHaveLength(1);
  });

  it("[H14] boundary: Wed 23:59 and Thu 00:00 JST", async () => {
    setFakeNow("2026-10-28T14:59:00Z");
    prep();
    const v1 = await renderApp({ initialPath: "/" });
    await screen.findByText("2限");
    expect(document.querySelector('[data-today="true"]')!.textContent).toBe("水");
    expect(document.querySelector('[data-current="true"]')).toBeNull();
    expect(screen.queryByTestId("timetable-now-ring")).toBeNull();
    v1.unmount();
    setFakeNow("2026-10-28T15:00:00Z");
    await renderApp({ initialPath: "/" });
    await screen.findByText("2限");
    expect(document.querySelector('[data-today="true"]')!.textContent).toBe("木");
    expect(document.querySelector('[data-current="true"]')).toBeNull();
    expect(screen.queryByTestId("timetable-now-ring")).toBeNull();
  });

  it("[H15] Saturday 11:00 with Mon-Fri grid: no data-today, no ring, 2限 current", async () => {
    setFakeNow("2026-10-31T02:00:00Z");
    prep();
    await renderApp({ initialPath: "/" });
    await screen.findByText("2限");
    expect(document.querySelector('[data-today="true"]')).toBeNull();
    expect(screen.queryByTestId("timetable-now-ring")).toBeNull();
    const cur = document.querySelectorAll('[data-current="true"]');
    expect(cur).toHaveLength(1);
    expect(cur[0]!.textContent).toContain("2限");
  });

  it("[H16] room context gets the same attributes", async () => {
    setFakeNow("2026-10-28T02:00:00Z");
    useRooms([room1]);
    prep();
    roomHandlers({
      weekStart: "2026-10-26", weekEnd: "2026-11-01",
      members: [{ userId: "u2", name: "B", handle: "bee", image: null, color: "#0f0" }], meetings: [],
      recurringMeetings: [{ userId: "u2", timetableId: "t", courseId: "c9", courseName: "数学I", courseColor: "#123456", dayOfWeek: 3, startPeriodIndex: 2, periodCount: 1 }],
    });
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "情報科学1年" }));
    const grid = await screen.findByTestId("room-timetable");
    await within(grid).findByText("数学I");
    expect(grid.querySelector('[data-today="true"]')!.textContent).toBe("水");
    expect(grid.querySelector('[data-current="true"]')!.textContent).toContain("2限");
    expect(within(grid).getAllByTestId("timetable-now-ring")).toHaveLength(1);
    void headerOf;
  });
});

describe("[A] attendance overlay", () => {
  const JST_8 = "2026-05-12T23:00:00Z"; // 2026-05-13 08:00 JST

  function todayState(list: any[]) {
    const state = list.map((o) => ({ ...o }));
    server.use(
      http.get(`${API_URL}/api/today`, () => HttpResponse.json({ date: "2026-05-13", occurrences: state })),
      http.post(`${API_URL}/api/attendance/mark-all-present`, () => {
        let n = 0;
        state.forEach((o) => { if (o.status === null) { o.status = "PRESENT"; n++; } });
        return HttpResponse.json({ date: "2026-05-13", markedCount: n, skippedCount: 0 });
      }),
      http.post(`${API_URL}/api/attendance/:id`, async ({ params, request }) => {
        const body = (await request.json()) as any;
        const o = state.find((x) => x.id === params.id);
        if (o) o.status = body.status;
        return HttpResponse.json({ record: { occurrenceId: params.id, status: body.status, note: null, updatedAt: "2026-05-13T00:00:00.000Z" } });
      }),
    );
    return state;
  }
  const three = (s1: any = null, s2: any = null, s3: any = "PRESENT") => [
    occ("o1", "数学I", 1, 540, 630, s1), occ("o2", "英語", 2, 640, 730, s2), occ("o3", "化学", 3, 780, 870, s3),
  ];

  it("[A1] 0 occurrences -> nothing", async () => {
    setFakeNow(JST_8);
    todayState([]);
    await renderApp({ initialPath: "/" });
    await waitHome();
    await settle(300);
    expect(screen.queryByTestId("attendance-grabber")).toBeNull();
    expect(screen.queryByTestId("cta-expand-toggle")).toBeNull();
  });

  it("[A2] unrecorded 2 -> tile open by default", async () => {
    setFakeNow(JST_8);
    todayState(three());
    await renderApp({ initialPath: "/" });
    expect(await screen.findByText("今日は全出席 (2)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "各コマの出欠を開く" })).toHaveAttribute("data-testid", "cta-expand-toggle");
    expect(screen.getByTestId("attendance-grabber")).toBeInTheDocument();
  });

  it("[A3] all recorded -> only grabber", async () => {
    setFakeNow(JST_8);
    todayState(three("PRESENT", "PRESENT"));
    await renderApp({ initialPath: "/" });
    await screen.findByTestId("attendance-grabber");
    expect(screen.queryByText(/今日は全出席/)).toBeNull();
    expect(screen.queryByText("本日の記録は完了済")).toBeNull();
    expect(screen.queryByTestId("cta-expand-toggle")).toBeNull();
  });

  it("[A4] mark all -> POST, tile closes", async () => {
    setFakeNow(JST_8);
    const calls = recordCalls();
    todayState(three());
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByText("今日は全出席 (2)"));
    await waitFor(() => expect(findCalls(calls, "POST", /mark-all-present$/)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(/今日は全出席/)).toBeNull());
    expect(screen.getByTestId("attendance-grabber")).toBeInTheDocument();
  });

  it("[A5] last unrecorded marked individually: tile closes, detail panel stays open", async () => {
    setFakeNow(JST_8);
    todayState(three("PRESENT", null));
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByRole("button", { name: "各コマの出欠を開く" }));
    await screen.findByText("英語");
    // パネルの行順 = o1, o2, o3。2 行目 (英語) の「出」
    await v.user.click(screen.getAllByRole("button", { name: "出" })[1]!);
    await waitFor(() => expect(screen.queryByText(/今日は全出席/)).toBeNull());
    expect(screen.getByText("英語")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "出" }).length).toBeGreaterThan(0);
  });

  it("[A6] closed -> grabber opens tile with disabled 本日の記録は完了済", async () => {
    setFakeNow(JST_8);
    todayState(three("PRESENT", "PRESENT"));
    const v = await renderApp({ initialPath: "/" });
    await v.user.click(await screen.findByTestId("attendance-grabber"));
    const done = await screen.findByText("本日の記録は完了済");
    expect(done.closest("button")).toBeDisabled();
  });

  async function drag(el: HTMLElement, dy: number) {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 500, pointerId: 1, button: 0 });
    fireEvent.pointerUp(el, { clientX: 100, clientY: 500 + dy, pointerId: 1, button: 0 });
  }

  it("[A7] drag down 41px collapses, 40px does not", async () => {
    setFakeNow(JST_8);
    todayState(three());
    await renderApp({ initialPath: "/" });
    await screen.findByText("今日は全出席 (2)");
    await drag(screen.getByTestId("attendance-grabber"), 40);
    await settle(100);
    expect(screen.queryByText("今日は全出席 (2)")).not.toBeNull();
    await drag(screen.getByTestId("attendance-grabber"), 41);
    await waitFor(() => expect(screen.queryByText("今日は全出席 (2)")).toBeNull());
  });

  it("[A8] drag up 41px expands closed tile", async () => {
    setFakeNow(JST_8);
    todayState(three("PRESENT", "PRESENT"));
    await renderApp({ initialPath: "/" });
    await screen.findByTestId("attendance-grabber");
    await drag(screen.getByTestId("attendance-grabber"), -41);
    expect(await screen.findByText("本日の記録は完了済")).toBeInTheDocument();
  });

  const nowNext = (iso: string) => {
    setFakeNow(iso);
    todayState([occ("o1", "数学I", 1, 540, 630, null, "2026-05-13", "101"), occ("o2", "英語", 2, 640, 730, null, "2026-05-13", "101")]);
  };

  it("[A9] in class", async () => {
    nowNext("2026-05-13T00:30:00Z");
    await renderApp({ initialPath: "/" });
    expect(await screen.findByText("授業中 · 09:00–10:30 · 101")).toBeInTheDocument();
    expect(screen.getByText("1限 数学I")).toBeInTheDocument();
  });

  it("[A10] upcoming", async () => {
    nowNext(JST_8);
    await renderApp({ initialPath: "/" });
    expect(await screen.findByText("次の授業 · 09:00 · 101")).toBeInTheDocument();
    expect(screen.getByText("1限 数学I")).toBeInTheDocument();
  });

  it("[A11] finished", async () => {
    nowNext("2026-05-13T14:00:00Z"); // JST 23:00
    await renderApp({ initialPath: "/" });
    expect(await screen.findByText("本日終了")).toBeInTheDocument();
    expect(screen.getByText("今日の授業は終わりました")).toBeInTheDocument();
  });

  it("[A12] date rollover -> refetch /api/today after 60s", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval"] });
    vi.setSystemTime(new Date("2026-05-13T14:59:00Z")); // JST 23:59
    const calls = recordCalls();
    todayState(three());
    await renderApp({ initialPath: "/" });
    await screen.findByText("今日は全出席 (2)");
    const before = findCalls(calls, "GET", /\/api\/today$/).length;
    vi.setSystemTime(new Date("2026-05-13T15:01:00Z")); // JST 05-14 00:01
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await waitFor(() => expect(findCalls(calls, "GET", /\/api\/today$/).length).toBeGreaterThan(before));
  });

  it("[A13] new date with unrecorded reopens a closed tile", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval"] });
    vi.setSystemTime(new Date("2026-05-13T14:59:00Z"));
    let day = "2026-05-13";
    let list: any[] = three("PRESENT", "PRESENT");
    server.use(http.get(`${API_URL}/api/today`, () => HttpResponse.json({ date: day, occurrences: list })));
    await renderApp({ initialPath: "/" });
    await screen.findByTestId("attendance-grabber");
    expect(screen.queryByText(/今日は全出席/)).toBeNull();
    day = "2026-05-14";
    list = three(null, null, null).map((o) => ({ ...o, date: "2026-05-14" }));
    vi.setSystemTime(new Date("2026-05-13T15:01:00Z"));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(await screen.findByText("今日は全出席 (3)")).toBeInTheDocument();
  });
});

void useMe;
