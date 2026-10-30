/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity §5.2 / §7.S (S1-S17)
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL, defaultMe, setupRequiredMe } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";
import { findCalls, recordCalls, stopRecording, template, settle } from "../utils/parity-fixtures";

afterEach(() => {
  stopRecording();
  vi.useRealTimers();
});

/** defaultSemesterId を PATCH するまでは未完了、以後は完了の me */
function statefulMe() {
  let complete = false;
  server.use(
    http.get(`${API_URL}/api/me`, () => HttpResponse.json(complete ? defaultMe : setupRequiredMe)),
    http.patch(`${API_URL}/api/me`, async ({ request }) => {
      const body = (await request.json()) as any;
      if (body.defaultSemesterId) complete = true;
      return HttpResponse.json(complete ? defaultMe : { ...setupRequiredMe, user: { ...setupRequiredMe.user, ...body } });
    }),
  );
}

const tplA = template({ id: "T", title: "テンプレA" });
const tplB = template({ id: "T2", title: "テンプレB", copyCount: 3, authorUserId: "author-2" });

function useSuggestions(list: any[] | "error") {
  server.use(
    http.get(`${API_URL}/api/timetable-templates`, () =>
      list === "error" ? HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 }) : HttpResponse.json({ templates: list, nextCursor: null }),
    ),
  );
}

type View = Awaited<ReturnType<typeof renderApp>>;

async function toDepartmentStep(v: View) {
  await screen.findByText("Step 1/3: 学校を選ぶ");
  await v.user.click(await screen.findByRole("button", { name: /東京テスト高校/ }));
  await screen.findByText("Step 2/3: 学科を選ぶ");
}

async function submitDepartment(v: View) {
  await v.user.click(await screen.findByRole("button", { name: /普通科/ }));
  await v.user.click(screen.getByRole("button", { name: "次へ" }));
}

const defaultSemPatches = (calls: ReturnType<typeof recordCalls>) =>
  findCalls(calls, "PATCH", /^\/api\/me$/).filter((c) => c.body?.defaultSemesterId);

describe("[S] onboarding", () => {
  it("[S1] initial school step", async () => {
    statefulMe();
    await renderApp({ initialPath: "/setup" });
    expect(await screen.findByText("Step 1/3: 学校を選ぶ")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("学校名で検索")).toBeInTheDocument();
    expect(screen.getByText("都道府県")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /＋\s*リストに無い学校を追加/ })).toBeInTheDocument();
    expect(screen.getByText("セットアップ")).toBeInTheDocument();
  });

  it("[S2] search debounce 300ms and prefecture param", async () => {
    statefulMe();
    const v = await renderApp({ initialPath: "/setup" });
    const input = await screen.findByPlaceholderText("学校名で検索");
    await settle(500);
    const calls = recordCalls();
    await v.user.type(input, "東京");
    await waitFor(() => {
      const hit = findCalls(calls, "GET", /^\/api\/schools$/).filter((c) => c.url.searchParams.get("q") === "東京");
      expect(hit.length).toBeGreaterThan(0);
      expect(hit[0]!.url.searchParams.get("limit")).toBe("20");
      expect(hit[0]!.url.searchParams.has("prefecture")).toBe(false);
    }, { timeout: 2000 });
    const select = screen.getByRole("combobox");
    await v.user.selectOptions(select, "東京都");
    await waitFor(() => {
      const hit = findCalls(calls, "GET", /^\/api\/schools$/).filter((c) => c.url.searchParams.get("prefecture") === "東京都");
      expect(hit.length).toBeGreaterThan(0);
      expect(hit[0]!.url.searchParams.get("q")).toBe("東京");
    }, { timeout: 2000 });
  });

  it("[S3] choose school -> department step", async () => {
    statefulMe();
    const v = await renderApp({ initialPath: "/setup" });
    await toDepartmentStep(v);
    expect(screen.getByText("東京テスト高校")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "変更" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("東京テスト高校 の学科名で検索")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /＋\s*学科を追加/ })).toBeInTheDocument();
  });

  it("[S4] 変更 and 戻る go back to step 1", async () => {
    statefulMe();
    const v = await renderApp({ initialPath: "/setup" });
    await toDepartmentStep(v);
    await v.user.click(screen.getByRole("button", { name: "変更" }));
    expect(await screen.findByText("Step 1/3: 学校を選ぶ")).toBeInTheDocument();
    await v.user.click(await screen.findByRole("button", { name: /東京テスト高校/ }));
    await screen.findByText("Step 2/3: 学科を選ぶ");
    await v.user.click(screen.getByRole("button", { name: "戻る" }));
    expect(await screen.findByText("Step 1/3: 学校を選ぶ")).toBeInTheDocument();
  });

  it("[S5] next -> PATCH me, fetch suggestions, template step with cards", async () => {
    statefulMe();
    useSuggestions([tplA, tplB]);
    const calls = recordCalls();
    const v = await renderApp({ initialPath: "/setup" });
    await toDepartmentStep(v);
    await submitDepartment(v);
    expect(await screen.findByText("Step 3/4: 時間割を選ぶ")).toBeInTheDocument();
    expect(screen.getByText("✓ 同じ学科の時間割が見つかりました")).toBeInTheDocument();
    expect(screen.getByTestId("setup-template-step")).toBeInTheDocument();
    expect(screen.getByTestId("setup-template-card-T")).toBeInTheDocument();
    expect(screen.getByTestId("setup-template-card-T2")).toBeInTheDocument();
    const patch = findCalls(calls, "PATCH", /^\/api\/me$/)[0]!;
    expect(patch.body).toEqual({ schoolId: "school-1", departmentId: "department-1" });
    const get = findCalls(calls, "GET", /timetable-templates$/)[0]!;
    expect(get.url.searchParams.get("schoolId")).toBe("school-1");
    expect(get.url.searchParams.get("departmentId")).toBe("department-1");
    expect(get.url.searchParams.get("limit")).toBe("20");
  });

  it("[S6] 0 suggestions / 500 -> straight to semester step, no error", async () => {
    for (const mode of [[], "error"] as const) {
      statefulMe();
      useSuggestions(mode as any);
      const v = await renderApp({ initialPath: "/setup" });
      await toDepartmentStep(v);
      await submitDepartment(v);
      expect(await screen.findByText("Step 3/3: 学期を作る")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
      v.unmount();
    }
  });

  async function toTemplateStep() {
    statefulMe();
    useSuggestions([tplA, tplB]);
    const v = await renderApp({ initialPath: "/setup" });
    await toDepartmentStep(v);
    await submitDepartment(v);
    await screen.findByText("Step 3/4: 時間割を選ぶ");
    return v;
  }

  it("[S7] 'use' disabled with no selection", async () => {
    await toTemplateStep();
    expect(screen.getByTestId("setup-template-use")).toBeDisabled();
    expect(screen.getByTestId("setup-template-skip")).toBeEnabled();
  });

  it("[S8] select card -> use -> semester step with 取り込む時間割", async () => {
    const v = await toTemplateStep();
    const card = screen.getByTestId("setup-template-card-T");
    await v.user.click(card.querySelector("[aria-pressed]") as HTMLElement);
    expect(card.querySelector("[aria-pressed]")).toHaveAttribute("aria-pressed", "true");
    await v.user.click(screen.getByTestId("setup-template-use"));
    expect(await screen.findByText("Step 4/4: 学期を作る")).toBeInTheDocument();
    expect(screen.getByText(/取り込む時間割: テンプレA/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "変更" })).toBeInTheDocument();
  });

  it("[S8b] preview expands in card", async () => {
    const v = await toTemplateStep();
    const card = screen.getByTestId("setup-template-card-T");
    await v.user.click(within(card).getByRole("button", { name: /中身を見る/ }));
    expect((await within(card).findAllByText(/1–5限/)).length).toBeGreaterThan(0);
  });

  it("[S9] skip -> Step 4/4 without 取り込む時間割", async () => {
    const v = await toTemplateStep();
    await v.user.click(screen.getByTestId("setup-template-skip"));
    expect(await screen.findByText("Step 4/4: 学期を作る")).toBeInTheDocument();
    expect(screen.queryByText(/取り込む時間割/)).toBeNull();
  });

  async function toPlainSemesterStep(now: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    statefulMe();
    useSuggestions([]);
    const v = await renderApp({ initialPath: "/setup" });
    await toDepartmentStep(v);
    await submitDepartment(v);
    await screen.findByText("Step 3/3: 学期を作る");
    return v;
  }

  const val = (re: RegExp) => (screen.getByLabelText(re) as HTMLInputElement).value;

  it("[S10] semester defaults from today (JST)", async () => {
    await toPlainSemesterStep("2026-10-29T03:00:00Z");
    expect([val(/名前/), val(/開始日/), val(/終了日/)]).toEqual(["2026 後期", "2026-10-01", "2027-03-31"]);
  });

  it("[S11a] defaults at JST 3/31 23:59", async () => {
    await toPlainSemesterStep("2026-03-31T14:59:00Z");
    expect([val(/名前/), val(/開始日/), val(/終了日/)]).toEqual(["2025 後期", "2025-10-01", "2026-03-31"]);
  });

  it("[S11b] defaults at JST 4/1 0:00", async () => {
    await toPlainSemesterStep("2026-03-31T15:00:00Z");
    expect([val(/名前/), val(/開始日/), val(/終了日/)]).toEqual(["2026 前期", "2026-04-01", "2026-09-30"]);
  });

  async function toSemesterStep(withTemplate: boolean) {
    const v = await toTemplateStep();
    if (withTemplate) {
      const card = screen.getByTestId("setup-template-card-T");
      await v.user.click(card.querySelector("[aria-pressed]") as HTMLElement);
      await v.user.click(screen.getByTestId("setup-template-use"));
    } else {
      await v.user.click(screen.getByTestId("setup-template-skip"));
    }
    await screen.findByText("Step 4/4: 学期を作る");
    return v;
  }

  it("[S12] order: semesters -> copy (no replaceExisting) -> PATCH defaultSemesterId -> GET me -> /", async () => {
    const calls = recordCalls();
    const v = await toSemesterStep(true);
    const before = calls.length;
    await v.user.click(screen.getByRole("button", { name: "完了して時間割を作る" }));
    await waitFor(() => expect(v.path()).toBe("/"));
    const after = calls.slice(before);
    const seq = after.map((c) => `${c.method} ${c.url.pathname}`);
    const iSem = seq.indexOf("POST /api/semesters");
    const iCopy = seq.indexOf("POST /api/timetable-templates/T/copy");
    const iPatch = after.findIndex((c) => c.method === "PATCH" && c.body?.defaultSemesterId);
    const iMe = seq.lastIndexOf("GET /api/me");
    expect(iSem).toBeGreaterThanOrEqual(0);
    expect(iCopy).toBeGreaterThan(iSem);
    expect(iPatch).toBeGreaterThan(iCopy);
    expect(iMe).toBeGreaterThan(iPatch);
    const copy = findCalls(calls, "POST", /templates\/T\/copy$/)[0]!;
    expect(copy.body).toEqual({ semesterId: "semester-new" });
    expect("replaceExisting" in copy.body).toBe(false);
    expect(after[iPatch]!.body).toEqual({ defaultSemesterId: "semester-new" });
  });

  const copyFails = () => server.use(http.post(`${API_URL}/api/timetable-templates/:id/copy`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));

  it("[S13] copy 500 -> red banner, retry/skip buttons, no default PATCH, inputs disabled", async () => {
    const calls = recordCalls();
    copyFails();
    const v = await toSemesterStep(true);
    await v.user.click(screen.getByRole("button", { name: "完了して時間割を作る" }));
    expect(await screen.findByText("学期は作成しました。時間割を取り込めませんでした")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "もう一度" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取り込まずに完了" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "完了して時間割を作る" })).toBeNull();
    expect(screen.getByLabelText(/名前/)).toBeDisabled();
    expect(screen.getByLabelText(/開始日/)).toBeDisabled();
    expect(screen.getByLabelText(/終了日/)).toBeDisabled();
    expect(defaultSemPatches(calls)).toHaveLength(0);
  });

  it("[S14] copy fail -> skip: semesters POST once, copy once, PATCH -> /", async () => {
    const calls = recordCalls();
    copyFails();
    const v = await toSemesterStep(true);
    await v.user.click(screen.getByRole("button", { name: "完了して時間割を作る" }));
    await v.user.click(await screen.findByRole("button", { name: "取り込まずに完了" }));
    await waitFor(() => expect(v.path()).toBe("/"));
    expect(findCalls(calls, "POST", /^\/api\/semesters$/)).toHaveLength(1);
    expect(findCalls(calls, "POST", /templates\/T\/copy$/)).toHaveLength(1);
    expect(defaultSemPatches(calls)).toHaveLength(1);
  });

  it("[S15] copy fail -> retry (201): semesters once, copy twice -> /", async () => {
    const calls = recordCalls();
    copyFails();
    const v = await toSemesterStep(true);
    await v.user.click(screen.getByRole("button", { name: "完了して時間割を作る" }));
    const retry = await screen.findByRole("button", { name: "もう一度" });
    server.use(http.post(`${API_URL}/api/timetable-templates/:id/copy`, () => HttpResponse.json({ userTimetable: { id: "x", title: "x" } }, { status: 201 })));
    await v.user.click(retry);
    await waitFor(() => expect(v.path()).toBe("/"));
    expect(findCalls(calls, "POST", /^\/api\/semesters$/)).toHaveLength(1);
    expect(findCalls(calls, "POST", /templates\/T\/copy$/)).toHaveLength(2);
  });

  it("[S16] copy 409 is treated as success", async () => {
    const calls = recordCalls();
    server.use(http.post(`${API_URL}/api/timetable-templates/:id/copy`, () => HttpResponse.json({ error: { code: "CONFLICT", message: "exists" } }, { status: 409 })));
    const v = await toSemesterStep(true);
    await v.user.click(screen.getByRole("button", { name: "完了して時間割を作る" }));
    await waitFor(() => expect(v.path()).toBe("/"));
    expect(defaultSemPatches(calls)).toHaveLength(1);
  });

  it("[S17] without template: no copy call", async () => {
    const calls = recordCalls();
    const v = await toSemesterStep(false);
    await v.user.click(screen.getByRole("button", { name: "完了して時間割を作る" }));
    await waitFor(() => expect(v.path()).toBe("/"));
    expect(findCalls(calls, "POST", /^\/api\/semesters$/)).toHaveLength(1);
    expect(findCalls(calls, "POST", /copy$/)).toHaveLength(0);
    expect(defaultSemPatches(calls)).toHaveLength(1);
  });
});
