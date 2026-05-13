import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API_URL, setupRequiredMe } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";

function setupAuth() {
  server.use(http.get(`${API_URL}/api/me`, () => HttpResponse.json(setupRequiredMe)));
}

describe("/setup", () => {
  it("renders the school selection step with search and add-school controls", async () => {
    setupAuth();
    await renderApp({ initialPath: "/setup" });

    // 設計 §5 Setup Step 1 「学校名で検索」+ 「リストに無い学校を追加」
    expect((await screen.findAllByText(/Step 1\/3: 学校を選ぶ|学校選択|学校/))[0]).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/学校名で検索|学校|検索/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /リストに無い学校を追加/ })).toBeInTheDocument();
  });

  it("searches schools with q and prefecture parameters", async () => {
    setupAuth();
    const queries: Array<{ q: string | null; prefecture: string | null }> = [];
    server.use(
      http.get(`${API_URL}/api/schools`, ({ request }) => {
        const url = new URL(request.url);
        queries.push({
          q: url.searchParams.get("q"),
          prefecture: url.searchParams.get("prefecture"),
        });
        return HttpResponse.json({
          schools: [{ id: "school-1", name: "東京テスト高校", prefecture: "東京都" }],
        });
      }),
    );

    const { user } = await renderApp({ initialPath: "/setup" });
    await user.type(await screen.findByPlaceholderText(/学校名で検索|学校|検索/), "東京");

    await waitFor(() =>
      expect(queries).toEqual(
        expect.arrayContaining([expect.objectContaining({ q: expect.stringContaining("東京") })]),
      ),
    );
  });

  it("moves to department selection and patches schoolId plus departmentId", async () => {
    setupAuth();
    const patches: unknown[] = [];
    server.use(
      http.patch(`${API_URL}/api/me`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json(setupRequiredMe);
      }),
    );

    const { user } = await renderApp({ initialPath: "/setup" });
    await user.click(await screen.findByRole("button", { name: /東京テスト高校/ }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect((await screen.findAllByText(/Step 2\/3: 学科を選ぶ|学科選択|学科/))[0]).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /普通科/ }));
    await user.click(screen.getByRole("button", { name: "次へ" }));

    await waitFor(() =>
      expect(patches).toEqual([
        expect.objectContaining({ schoolId: "school-1", departmentId: "department-1" }),
      ]),
    );
  });

  it("supports going back from department selection to school selection", async () => {
    setupAuth();
    const { user } = await renderApp({ initialPath: "/setup" });
    await user.click(await screen.findByRole("button", { name: /東京テスト高校/ }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(await screen.findByRole("button", { name: "戻る" }));

    expect((await screen.findAllByText(/Step 1\/3: 学校を選ぶ|学校選択|学校/))[0]).toBeInTheDocument();
  });

  it("creates a semester, patches defaultSemesterId, and navigates to timetable", async () => {
    setupAuth();
    const posts: unknown[] = [];
    const patches: unknown[] = [];
    server.use(
      http.patch(`${API_URL}/api/me`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json(setupRequiredMe);
      }),
      http.post(`${API_URL}/api/semesters`, async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json(
          { semester: { id: "semester-new", name: "前期", startDate: "2026-04-01", endDate: "2026-09-30" } },
          { status: 201 },
        );
      }),
    );

    const { user, path } = await renderApp({ initialPath: "/setup" });
    await user.click(await screen.findByRole("button", { name: /東京テスト高校/ }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(await screen.findByRole("button", { name: /普通科/ }));
    await user.click(screen.getByRole("button", { name: "次へ" }));

    const semesterName = await screen.findByRole("textbox", { name: /name|学期名|名前/i });
    await user.clear(semesterName);
    await user.type(semesterName, "前期");
    await user.type(screen.getByLabelText(/startDate|開始/i), "2026-04-01");
    await user.type(screen.getByLabelText(/endDate|終了/i), "2026-09-30");
    await user.click(screen.getByRole("button", { name: "完了して時間割を作る" }));

    await waitFor(() => expect(posts).toContainEqual(expect.objectContaining({ name: "前期" })));
    await waitFor(() =>
      expect(patches).toEqual(expect.arrayContaining([expect.objectContaining({ defaultSemesterId: "semester-new" })])),
    );
    await waitFor(() => expect(path()).toBe("/timetable"));
  });
});
