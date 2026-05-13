import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";

function byTextContent(pattern: RegExp) {
  return (_: string, element: Element | null) => {
    if (!element) return false;
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const childHasText = Array.from(element.children).some((child) =>
      pattern.test(child.textContent?.replace(/\s+/g, " ").trim() ?? ""),
    );
    return pattern.test(text) && !childHasText;
  };
}

describe("/templates", () => {
  it("renders school, department, and q filters", async () => {
    await renderApp({ initialPath: "/templates" });

    // 設計 §5 TemplateSearch 「学校」「学科」「検索」フィルタ
    expect(await screen.findByPlaceholderText(/検索|q/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/学校/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/学科/)).toBeInTheDocument();
  });

  it("shows template cards with title, author, copy count, updated date, and actions", async () => {
    await renderApp({ initialPath: "/templates" });

    expect(await screen.findByText("普通科 1年前期")).toBeInTheDocument();
    expect(screen.getByText(/author-1|@/)).toBeInTheDocument();
    expect(screen.getByText(byTextContent(/copy x\s*12/))).toBeInTheDocument();
    expect(screen.getByText(/2026|5月|05/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /詳細を見る/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /自分の時間割に|コピー/ })).toBeInTheDocument();
  });

  it("opens semester selection and copies a template to the selected semester", async () => {
    const copies: unknown[] = [];
    server.use(
      http.post(`${API_URL}/api/timetable-templates/:id/copy`, async ({ params, request }) => {
        copies.push({ id: params.id, body: await request.json() });
        return HttpResponse.json({ userTimetable: { id: "user-timetable-1" } }, { status: 201 });
      }),
    );

    const { user } = await renderApp({ initialPath: "/templates" });
    await user.click(await screen.findByRole("button", { name: /自分の時間割に|コピー/ }));
    const semesterChoice =
      screen.queryByRole("radio", { name: /前期/ }) ?? screen.queryByRole("option", { name: /前期/ });
    if (semesterChoice) await user.click(semesterChoice);
    await user.click(screen.getByRole("button", { name: /コピー|作成|決定/ }));

    await waitFor(() =>
      expect(copies).toContainEqual({ id: "template-1", body: expect.objectContaining({ semesterId: "semester-1" }) }),
    );
  });

  it("shows the 409 copy conflict message", async () => {
    server.use(
      http.post(`${API_URL}/api/timetable-templates/:id/copy`, async () =>
        HttpResponse.json(
          { error: { code: "CONFLICT", message: "already exists" } },
          { status: 409 },
        ),
      ),
    );

    const { user } = await renderApp({ initialPath: "/templates" });
    await user.click(await screen.findByRole("button", { name: /自分の時間割に|コピー/ }));
    const semesterChoice =
      screen.queryByRole("radio", { name: /前期/ }) ?? screen.queryByRole("option", { name: /前期/ });
    if (semesterChoice) await user.click(semesterChoice);
    await user.click(screen.getByRole("button", { name: /コピー|作成|決定/ }));

    expect(await screen.findByText(/既に時間割があります|上書き/)).toBeInTheDocument();
  });
});
