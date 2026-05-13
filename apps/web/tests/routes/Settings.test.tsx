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

describe("/settings", () => {
  it("renders profile email and name", async () => {
    await renderApp({ initialPath: "/settings" });

    // 設計 §5 Settings 「プロフィール (email、name、image ...)」
    expect(await screen.findByText(byTextContent(/teacher@example\.com/))).toBeInTheDocument();
    expect(screen.getByDisplayValue("田中")).toBeInTheDocument();
  });

  it("renders AttendanceRule tabs and strategy radios", async () => {
    await renderApp({ initialPath: "/settings" });

    // 設計 §5 Settings 「学校 + 学科のデフォルト」「自分の上書き」
    expect(await screen.findByText(/AttendanceRule/)).toBeInTheDocument();
    expect(screen.getByText(/デフォルト|共有設定/)).toBeInTheDocument();
    expect(screen.getAllByText(/自分の上書き/)[0]).toBeInTheDocument();
    const strategies = [
      /出席扱い|COUNT_AS_PRESENT|PRESENT/,
      /欠席扱い|COUNT_AS_ABSENT|ABSENT/,
      /半分出席|HALF_PRESENT|HALF/,
      /分母除外|REDUCE_DENOMINATOR|REDUCE/,
      /別集計|SEPARATE_COUNT|SEPARATE/,
    ];
    for (const strategy of strategies) {
      expect(screen.getAllByText(strategy).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("patches the default attendance rule when a default strategy radio is selected", async () => {
    const patches: unknown[] = [];
    server.use(
      http.patch(`${API_URL}/api/attendance-rules/default`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ rule: { id: "rule-default" } });
      }),
    );

    const { user } = await renderApp({ initialPath: "/settings" });
    const defaultMode =
      screen.queryByRole("tab", { name: /デフォルト|共有/ }) ??
      screen.queryByRole("button", { name: /デフォルト|共有/ });
    expect(defaultMode, "設計 §5 Settings の学校 + 学科デフォルト編集 UI").toBeInTheDocument();
    await user.click(defaultMode);
    const absentControl =
      screen.queryByRole("radio", { name: /ABSENT|欠席扱い/ }) ??
      screen.queryByRole("combobox", { name: /公欠|遅刻|早退/ });
    expect(absentControl).toBeInTheDocument();
    await user.click(absentControl);

    await waitFor(() => expect(JSON.stringify(patches)).toContain("ABSENT"));
  });

  it("posts sign-out and redirects to login", async () => {
    let signedOut = false;
    server.use(
      http.post(`${API_URL}/api/auth/sign-out`, () => {
        signedOut = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    const { user, path } = await renderApp({ initialPath: "/settings" });
    await user.click(await screen.findByRole("button", { name: /サインアウト|ログアウト/ }));

    await waitFor(() => expect(signedOut).toBe(true));
    await waitFor(() => expect(path()).toMatch(/^\/(?:login|signin)$/));
  });
});
