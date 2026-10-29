/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity §5.3.4 / §5.4 / §7.SM20-21 / §7.T (T1-T16)
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";
import {
  course, findCalls, meeting, recordCalls, sem, stopRecording, template, timetable, useMe, useSemesters, useTemplates, useTimetables, settle } from "../utils/parity-fixtures";

afterEach(() => {
  stopRecording();
});

const S1 = sem("semester-1", "前期", "2026-04-01", "2099-03-31");
const S2 = sem("s2", "後期", "2026-10-01", "2099-03-31");
const tplA = template({ id: "tA", title: "テンプレA" });
type View = Awaited<ReturnType<typeof renderApp>>;

async function openBrowser(v: View) {
  await v.user.click(await screen.findByText("学期管理"));
  const btn = await screen.findByTestId("semester-list-import-template");
  await waitFor(() => expect(btn).toBeEnabled());
  await v.user.click(btn);
  await screen.findByRole("heading", { name: "公開時間割" });
}

async function openPreview(v: View, id = "tA") {
  await v.user.click(await screen.findByTestId(`template-card-${id}`));
  await screen.findByTestId("template-preview");
}

const copyCalls = (calls: any[]) => findCalls(calls, "POST", /timetable-templates\/[^/]+\/copy$/);

describe("[SM] semester list sheet", () => {
  it("[SM20a] delete 409 -> dedicated toast", async () => {
    useSemesters([S1, S2]);
    server.use(http.delete(`${API_URL}/api/semesters/:id`, () => HttpResponse.json({ error: { code: "HAS_TIMETABLE", message: "x" } }, { status: 409 })));
    const v = await renderApp({ initialPath: "/settings" });
    await v.user.click(await screen.findByText("学期管理"));
    await v.user.click((await screen.findAllByRole("button", { name: "削除" }))[1]!);
    expect(await screen.findByText("時間割があるため削除できません。先に時間割を削除してください")).toBeInTheDocument();
  });

  it("[SM20b] delete 500 -> generic toast", async () => {
    useSemesters([S1, S2]);
    server.use(http.delete(`${API_URL}/api/semesters/:id`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));
    const v = await renderApp({ initialPath: "/settings" });
    await v.user.click(await screen.findByText("学期管理"));
    await v.user.click((await screen.findAllByRole("button", { name: "削除" }))[1]!);
    expect(await screen.findByText("削除できませんでした")).toBeInTheDocument();
  });

  it("[SM21a] import button enabled with 4 values", async () => {
    useSemesters([S1]);
    const v = await renderApp({ initialPath: "/settings" });
    await v.user.click(await screen.findByText("学期管理"));
    expect(await screen.findByTestId("semester-list-import-template")).toBeEnabled();
    expect(screen.getByText("公開時間割から取り込む")).toBeInTheDocument();
  });

  it("[SM21b] import button disabled when schoolName is null", async () => {
    useSemesters([S1]);
    useMe({ schoolName: null });
    const v = await renderApp({ initialPath: "/settings" });
    await v.user.click(await screen.findByText("学期管理"));
    expect(await screen.findByTestId("semester-list-import-template")).toBeDisabled();
  });

  it("[SM22] edit save failure -> toast 保存できませんでした", async () => {
    useSemesters([S1]);
    server.use(http.patch(`${API_URL}/api/semesters/:id`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));
    const v = await renderApp({ initialPath: "/settings" });
    await v.user.click(await screen.findByText("学期管理"));
    await v.user.click(await screen.findByRole("button", { name: "編集" }));
    const save = await screen.findByRole("button", { name: /保存/ });
    await v.user.click(save);
    expect(await screen.findByText("保存できませんでした")).toBeInTheDocument();
  });
});

describe("[T] template browser (entry E1)", () => {
  function base(extra: () => void = () => {}) {
    useSemesters([S1, S2]);
    useTimetables([]);
    useTemplates([tplA]);
    extra();
  }

  it("[T1] empty state", async () => {
    base(() => useTemplates([]));
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    expect(await screen.findByText("この学科の公開時間割はまだありません")).toBeInTheDocument();
    expect(screen.getByText("時間割を作って「みんなの時間割で公開」をオンにすると、同じ学科の人が使えるようになります")).toBeInTheDocument();
  });

  it("[T2] fetch error -> retry", async () => {
    let fail = true;
    base(() => server.use(http.get(`${API_URL}/api/timetable-templates`, () => (fail ? HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 }) : HttpResponse.json({ templates: [tplA], nextCursor: null })))));
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    expect(await screen.findByText("読み込めませんでした")).toBeInTheDocument();
    fail = false;
    await v.user.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(await screen.findByTestId("template-card-tA")).toBeInTheDocument();
  });

  it("[T3] card content, no author handle", async () => {
    base();
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    const card = await screen.findByTestId("template-card-tA");
    expect(within(card).getByText("テンプレA")).toBeInTheDocument();
    expect(within(card).getByText("8科目・週12コマ")).toBeInTheDocument();
    expect(within(card).getByText("12人が使用・2026/10/3 更新")).toBeInTheDocument();
    expect(card.textContent).not.toContain("author-1");
    expect(screen.getByText(/テスト大学\s*›\s*情報科学科/)).toBeInTheDocument();
    expect(screen.getByTestId("template-browse-other")).toBeInTheDocument();
    expect(screen.queryByText("✓ 同じ学科の時間割が見つかりました")).toBeNull();
  });

  it("[T4] browse other department: refetch with new scope, no PATCH me, no create buttons", async () => {
    base(() =>
      server.use(
        http.get(`${API_URL}/api/schools`, () => HttpResponse.json({ schools: [{ id: "school-9", name: "別の大学", prefecture: "東京都" }] })),
        http.get(`${API_URL}/api/schools/:id/departments`, () => HttpResponse.json({ departments: [{ id: "department-9", schoolId: "school-9", name: "別学科" }] })),
      ),
    );
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await screen.findByTestId("template-card-tA");
    const calls = recordCalls();
    await v.user.click(screen.getByTestId("template-browse-other"));
    expect(await screen.findByRole("heading", { name: "学校・学科" })).toBeInTheDocument();
    await v.user.click(await screen.findByRole("button", { name: /別の大学/ }));
    expect(screen.queryByRole("button", { name: /リストに無い学校を追加/ })).toBeNull();
    await v.user.click(await screen.findByRole("button", { name: /別学科/ }));
    await waitFor(() => {
      const hit = findCalls(calls, "GET", /timetable-templates$/).filter((c) => c.url.searchParams.get("departmentId") === "department-9");
      expect(hit.length).toBeGreaterThan(0);
      expect(hit[0]!.url.searchParams.get("schoolId")).toBe("school-9");
    });
    expect(await screen.findByRole("heading", { name: "公開時間割" })).toBeInTheDocument();
    expect(screen.getByText(/別の大学\s*›\s*別学科/)).toBeInTheDocument();
    expect(findCalls(calls, "PATCH", /^\/api\/me$/)).toHaveLength(0);
  });

  it("[T4b] department stage has no 学科を追加", async () => {
    base();
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await v.user.click(await screen.findByTestId("template-browse-other"));
    await v.user.click(await screen.findByRole("button", { name: /東京テスト高校/ }));
    await screen.findByPlaceholderText("東京テスト高校 の学科名で検索");
    expect(screen.queryByRole("button", { name: /学科を追加/ })).toBeNull();
  });

  it("[T5] card -> preview -> back to list", async () => {
    base();
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    expect(screen.getByRole("heading", { name: "時間割の中身" })).toBeInTheDocument();
    const pv = screen.getByTestId("template-preview");
    expect(within(pv).getByText("テンプレA")).toBeInTheDocument();
    expect(within(pv).getAllByText(/1–5限/).length).toBeGreaterThan(0);
    await v.user.click(screen.getByRole("button", { name: "戻る" }));
    expect(await screen.findByRole("heading", { name: "公開時間割" })).toBeInTheDocument();
  });

  it("[T6] import into semester without timetable: body has no replaceExisting; toast; browser closes", async () => {
    const calls = recordCalls();
    base();
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    await v.user.click(screen.getByTestId("template-import-button"));
    await waitFor(() => expect(copyCalls(calls)).toHaveLength(1));
    const body = copyCalls(calls)[0]!.body;
    expect(body).toEqual({ semesterId: "semester-1" });
    expect("replaceExisting" in body).toBe(false);
    expect(await screen.findByText("「テンプレA」を取り込みました")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "時間割の中身" })).toBeNull());
    expect(screen.getByRole("heading", { name: "学期管理" })).toBeInTheDocument();
  });

  it("[T7] existing empty timetable -> no confirm, replaceExisting once", async () => {
    const calls = recordCalls();
    base(() => useTimetables([timetable({ courses: [], meetings: [] })]));
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    await v.user.click(screen.getByTestId("template-import-button"));
    await waitFor(() => expect(copyCalls(calls)).toHaveLength(1));
    expect(copyCalls(calls)[0]!.body).toEqual({ semesterId: "semester-1", replaceExisting: true });
    expect(screen.queryByText("既存の時間割と出欠記録を置き換えます")).toBeNull();
  });

  const twoCourses = () =>
    timetable({
      courses: [course("c1", "数学I"), course("c2", "英語")],
      meetings: [meeting("m1", "c1", 1, 1)],
    });

  it("[T8] existing timetable -> confirm text; cancel sends nothing; confirm sends replaceExisting", async () => {
    const calls = recordCalls();
    base(() => useTimetables([twoCourses()]));
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    await v.user.click(screen.getByTestId("template-import-button"));
    expect(await screen.findByText("既存の時間割と出欠記録を置き換えます")).toBeInTheDocument();
    expect(screen.getByText("「前期」の時間割（2 科目）と、その出欠記録はすべて削除され、元に戻せません。")).toBeInTheDocument();
    await v.user.click(screen.getByRole("button", { name: "キャンセル" }));
    await settle(200);
    expect(copyCalls(calls)).toHaveLength(0);
    await v.user.click(screen.getByTestId("template-import-button"));
    await v.user.click(await screen.findByRole("button", { name: "置き換える" }));
    await waitFor(() => expect(copyCalls(calls)).toHaveLength(1));
    expect(copyCalls(calls)[0]!.body).toEqual({ semesterId: "semester-1", replaceExisting: true });
  });

  it("[T9] first copy 409, refetched timetable empty -> silent replace (copy x2)", async () => {
    const calls = recordCalls();
    let conflicted = false;
    base(() =>
      server.use(
        http.get(`${API_URL}/api/user-timetables`, () => HttpResponse.json({ userTimetables: conflicted ? [timetable({ courses: [], meetings: [] })] : [] })),
        http.post(`${API_URL}/api/timetable-templates/:id/copy`, async ({ request }) => {
          const b = (await request.json()) as any;
          if (!b.replaceExisting) {
            conflicted = true;
            return HttpResponse.json({ error: { code: "CONFLICT", message: "exists" } }, { status: 409 });
          }
          return HttpResponse.json({ userTimetable: { id: "x", title: "x" } }, { status: 201 });
        }),
      ),
    );
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    await v.user.click(screen.getByTestId("template-import-button"));
    await waitFor(() => expect(copyCalls(calls)).toHaveLength(2));
    expect(copyCalls(calls)[1]!.body).toEqual({ semesterId: "semester-1", replaceExisting: true });
    expect(findCalls(calls, "GET", /user-timetables$/).length).toBeGreaterThanOrEqual(2);
  });

  it("[T10] 409 twice -> generic toast, stops at 2 copies", async () => {
    const calls = recordCalls();
    let conflicted = false;
    base(() =>
      server.use(
        http.get(`${API_URL}/api/user-timetables`, () => HttpResponse.json({ userTimetables: conflicted ? [timetable({ courses: [], meetings: [] })] : [] })),
        http.post(`${API_URL}/api/timetable-templates/:id/copy`, () => {
          conflicted = true;
          return HttpResponse.json({ error: { code: "CONFLICT", message: "exists" } }, { status: 409 });
        }),
      ),
    );
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    await v.user.click(screen.getByTestId("template-import-button"));
    expect(await screen.findByText("取り込めませんでした、もう一度試してください")).toBeInTheDocument();
    await settle(300);
    expect(copyCalls(calls)).toHaveLength(2);
  });

  it("[T11] 404 -> toast, refetch list, back on list screen", async () => {
    const calls = recordCalls();
    base(() => server.use(http.post(`${API_URL}/api/timetable-templates/:id/copy`, () => HttpResponse.json({ error: { code: "NOT_FOUND", message: "gone" } }, { status: 404 }))));
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    const before = findCalls(calls, "GET", /timetable-templates$/).length;
    await v.user.click(screen.getByTestId("template-import-button"));
    expect(await screen.findByText("この時間割は公開が終了しました")).toBeInTheDocument();
    await waitFor(() => expect(findCalls(calls, "GET", /timetable-templates$/).length).toBeGreaterThan(before));
    expect(await screen.findByRole("heading", { name: "公開時間割" })).toBeInTheDocument();
    expect(screen.queryByTestId("template-preview")).toBeNull();
  });

  it("[T12] 500 -> toast, stays on preview", async () => {
    base(() => server.use(http.post(`${API_URL}/api/timetable-templates/:id/copy`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 }))));
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    await v.user.click(screen.getByTestId("template-import-button"));
    expect(await screen.findByText("取り込めませんでした、もう一度試してください")).toBeInTheDocument();
    expect(screen.getByTestId("template-preview")).toBeInTheDocument();
  });

  it("[T13] no semesters -> import disabled with hint", async () => {
    base(() => useSemesters([]));
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    expect(screen.getByTestId("template-import-button")).toBeDisabled();
    expect(screen.getByText("先に学期を作成してください")).toBeInTheDocument();
  });

  it("[T14] success invalidates the 6 query families", async () => {
    base();
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    await openPreview(v);
    const spy = vi.spyOn(v.queryClient, "invalidateQueries");
    await v.user.click(screen.getByTestId("template-import-button"));
    await screen.findByText("「テンプレA」を取り込みました");
    const heads = spy.mock.calls.map((c: any) => JSON.stringify((c[0] as any)?.queryKey?.[0] ?? c[0]));
    for (const k of ["user-timetables", "me", "today", "stats", "semesters", "day"]) {
      expect(heads, `invalidate ${k}`).toContain(JSON.stringify(k));
    }
  });

  it("[T15] E1: target select exists and is not locked", async () => {
    base();
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    expect(await screen.findByTestId("template-target-semester")).toBeInTheDocument();
    expect(screen.queryByText(/^取り込み先: /)).toBeNull();
  });

  // T16 本来の観点 (確認中に取り込み先を変える) は、取り込み先 Select が一覧画面にしか無く
  // 確認ダイアログ表示中 (中身画面) に変更する UI 経路が無いため書けない。代わりに
  // 「取り込み先を変えるとその学期の時間割で判定される」ことを見る。
  it("[T16'] decision follows the selected target semester (s2 has no timetable)", async () => {
    const calls = recordCalls();
    base(() => useTimetables([twoCourses()]));
    const v = await renderApp({ initialPath: "/settings" });
    await openBrowser(v);
    const select = (await screen.findByTestId("template-target-semester")) as HTMLSelectElement;
    const opt = Array.from(select.options).find((o) => o.textContent === "後期");
    expect(opt, "後期 option").toBeDefined();
    fireEvent.change(select, { target: { value: opt!.value } });
    await openPreview(v);
    await v.user.click(screen.getByTestId("template-import-button"));
    await waitFor(() => expect(copyCalls(calls)).toHaveLength(1));
    expect(copyCalls(calls)[0]!.body).toEqual({ semesterId: "s2" });
    expect(screen.queryByText("既存の時間割と出欠記録を置き換えます")).toBeNull();
  });
});
