import { screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API_URL, occurrence } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";

describe("/", () => {
  function expectMascotToBeRendered() {
    // 設計 §5 Home #12 「Home 挨拶エリア ... で Codex 生成画像を出す」
    const accessibleMascot =
      screen.queryByRole("img", { name: /マスコット|mascot|owl/i }) ??
      screen.queryByAltText(/マスコット|mascot/i) ??
      screen.queryByTestId("mascot");
    const decorativeMascot = document.querySelector('img[src*="mascot"]');
    expect(accessibleMascot ?? decorativeMascot).toBeInTheDocument();
  }

  it("renders mascot header, date, and greeting", async () => {
    await renderApp({ initialPath: "/" });

    expect(await screen.findByText(/こんにちは、田中 さん/)).toBeInTheDocument();
    expect(screen.getByText(/2026|5月|05/)).toBeInTheDocument();
    expectMascotToBeRendered();
  });

  it("shows mark-all count for only unrecorded occurrences", async () => {
    await renderApp({ initialPath: "/" });

    expect(await screen.findByRole("button", { name: "すべて出席にする (3 件)" })).toBeInTheDocument();
  });

  it("optimistically marks all unrecorded occurrences as present and posts today's date", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get(`${API_URL}/api/today`, () =>
        HttpResponse.json({
          date: "2026-05-13",
          occurrences: [
            occurrence("occ-1", "数学I", 1, null),
            occurrence("occ-2", "英語", 2, null),
            occurrence("occ-3", "化学", 3, null),
            occurrence("occ-4", "現代文", 4, null),
          ],
        }),
      ),
      http.post(`${API_URL}/api/attendance/mark-all-present`, async ({ request }) => {
        bodies.push(await request.json());
        await delay(100);
        return HttpResponse.json({ date: "2026-05-13", markedCount: 4, skippedCount: 0 });
      }),
    );

    const { user } = await renderApp({ initialPath: "/" });
    await user.click(await screen.findByRole("button", { name: "すべて出席にする (4 件)" }));

    expect(screen.getAllByText("出席").length).toBeGreaterThanOrEqual(4);
    await waitFor(() => expect(bodies).toContainEqual({ date: "2026-05-13" }));
    // 設計 §5 Home #2 「N = 0 のとき disabled、ラベルは `本日の記録は完了済`」
    expect(await screen.findByRole("button", { name: /本日の記録.*完了済/ })).toBeDisabled();
  });

  it("rolls back mark-all optimistic update and shows a toast on failure", async () => {
    server.use(
      http.get(`${API_URL}/api/today`, () =>
        HttpResponse.json({
          date: "2026-05-13",
          occurrences: [occurrence("occ-1", "数学I", 1, null)],
        }),
      ),
      http.post(`${API_URL}/api/attendance/mark-all-present`, async () => {
        await delay(100);
        return HttpResponse.json({ error: { code: "SAVE_FAILED", message: "failed" } }, { status: 500 });
      }),
    );

    const { user } = await renderApp({ initialPath: "/" });
    await user.click(await screen.findByRole("button", { name: "すべて出席にする (1 件)" }));
    expect(screen.getByText("出席")).toBeInTheDocument();

    expect(await screen.findByText("保存できませんでした、もう一度試してください")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "すべて出席にする (1 件)" })).toBeEnabled();
  });

  it("renders six status buttons for an unrecorded occurrence and posts the selected status", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get(`${API_URL}/api/today`, () =>
        HttpResponse.json({
          date: "2026-05-13",
          occurrences: [occurrence("occ-1", "数学I", 1, null)],
        }),
      ),
      http.post(`${API_URL}/api/attendance/:occurrenceId`, async ({ params, request }) => {
        bodies.push({ occurrenceId: params.occurrenceId, body: await request.json() });
        return HttpResponse.json({
          record: {
            occurrenceId: params.occurrenceId,
            status: "ABSENT",
            note: null,
            updatedAt: "2026-05-13T00:00:00.000Z",
          },
        });
      }),
    );

    const { user } = await renderApp({ initialPath: "/" });
    const card = (await screen.findByText("数学I")).closest("article") ?? document.body;
    for (const label of ["出席", "欠席", "公欠", "遅刻", "早退", "休講"]) {
      expect(within(card as HTMLElement).getByRole("button", { name: label })).toBeInTheDocument();
    }

    await user.click(within(card as HTMLElement).getByRole("button", { name: "欠席" }));
    await waitFor(() =>
      expect(bodies).toContainEqual({ occurrenceId: "occ-1", body: { status: "ABSENT" } }),
    );
    // 設計 §5 Home #3 「現状態 1 つだけ強調表示 + 右に小さな「変更」リンク」
    expect(await screen.findByRole("button", { name: /変更/ })).toBeInTheDocument();
  });

  it("rolls back an individual optimistic update and shows a toast on failure", async () => {
    server.use(
      http.get(`${API_URL}/api/today`, () =>
        HttpResponse.json({
          date: "2026-05-13",
          occurrences: [occurrence("occ-1", "数学I", 1, null)],
        }),
      ),
      http.post(`${API_URL}/api/attendance/:occurrenceId`, async () => {
        await delay(100);
        return HttpResponse.json({ error: { code: "SAVE_FAILED", message: "failed" } }, { status: 500 });
      }),
    );

    const { user } = await renderApp({ initialPath: "/" });
    await user.click(await screen.findByRole("button", { name: "遅刻" }));
    expect(screen.getAllByText(/遅刻/).length).toBeGreaterThanOrEqual(1);

    expect(await screen.findByText("保存できませんでした、もう一度試してください")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "出席" })).toBeInTheDocument();
  });

  it("shows the empty-day message and no active mark-all button when there are no occurrences", async () => {
    server.use(
      http.get(`${API_URL}/api/today`, () =>
        HttpResponse.json({
          date: "2026-05-13",
          occurrences: [],
        }),
      ),
    );

    await renderApp({ initialPath: "/" });

    expect(await screen.findByText("今日は授業がありません")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /すべて出席にする/ })).not.toBeInTheDocument();
  });

  it("does not show undefined or null status occurrences as already present", async () => {
    server.use(
      http.get(`${API_URL}/api/today`, () =>
        HttpResponse.json({
          date: "2026-05-13",
          occurrences: [occurrence("occ-1", "数学I", 1, null)],
        }),
      ),
    );

    await renderApp({ initialPath: "/" });

    const card = (await screen.findByText("数学I")).closest("article") ?? document.body;
    expect(within(card as HTMLElement).getByRole("button", { name: "出席" })).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("変更")).not.toBeInTheDocument();
  });

  it("renders bottom navigation to Timetable, Templates, Stats, and Settings", async () => {
    await renderApp({ initialPath: "/" });

    const navigations = await screen.findAllByRole("navigation");
    const bottomNav = navigations[navigations.length - 1];
    expect(within(bottomNav).getAllByRole("link", { name: /Timetable|時間割/ })[0]).toBeInTheDocument();
    expect(within(bottomNav).getAllByRole("link", { name: /Templates|テンプレート/ })[0]).toBeInTheDocument();
    expect(within(bottomNav).getAllByRole("link", { name: /Stats|統計/ })[0]).toBeInTheDocument();
    expect(within(bottomNav).getAllByRole("link", { name: /Settings|設定/ })[0]).toBeInTheDocument();
  });
});
