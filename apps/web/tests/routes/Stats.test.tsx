import { screen } from "@testing-library/react";
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

describe("/stats", () => {
  it("renders course progress numbers including rate", async () => {
    server.use(
      http.get(`${API_URL}/api/stats`, () =>
        HttpResponse.json({
          semesterId: "semester-1",
          courses: [
            {
              courseId: "course-1",
              courseName: "数学I",
              generatedOccurrences: 15,
              counts: {
                present: 13,
                absent: 2,
                excused: 0,
                tardy: 0,
                earlyLeave: 0,
                cancelled: 0,
                unrecorded: 0,
              },
              effectiveNumerator: 13,
              effectiveDenominator: 15,
              attendanceRate: 0.867,
            },
          ],
        }),
      ),
    );

    await renderApp({ initialPath: "/stats" });

    expect(await screen.findByText("数学I")).toBeInTheDocument();
    // 設計 §5 Stats 「13/15  86.7%」
    expect(screen.getByText(byTextContent(/13\s*\/\s*15\s*86\.7%/))).toBeInTheDocument();
  });

  it("renders dash percent when attendanceRate is null", async () => {
    await renderApp({ initialPath: "/stats" });

    expect(await screen.findByText("未記録科目")).toBeInTheDocument();
    expect(screen.getByText("—%")).toBeInTheDocument();
  });

  it("renders the empty state when there are no courses", async () => {
    server.use(
      http.get(`${API_URL}/api/stats`, () =>
        HttpResponse.json({
          semesterId: "semester-1",
          courses: [],
        }),
      ),
    );

    await renderApp({ initialPath: "/stats" });

    // 設計 §5 Stats は空状態文言を固定していないため、案内表示または進捗未描画を確認する。
    const guidance = await screen.findByText(/授業|コマ|対象|集計|ありません|未登録/);
    expect(guidance).toBeInTheDocument();
  });
});
