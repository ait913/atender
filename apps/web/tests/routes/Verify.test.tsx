import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API_URL, setupRequiredMe } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";

describe("/verify", () => {
  it("calls the magic-link verify endpoint with the token query", async () => {
    let requestedToken: string | null = null;
    server.use(
      http.get(`${API_URL}/api/auth/magic-link/verify`, ({ request }) => {
        requestedToken = new URL(request.url).searchParams.get("token");
        return HttpResponse.json({ ok: true });
      }),
    );

    await renderApp({ initialPath: "/verify?token=token-123" });

    await waitFor(() => expect(requestedToken).toBe("token-123"));
  });

  it("navigates to home when verify succeeds and setup is complete", async () => {
    const { path } = await renderApp({ initialPath: "/verify?token=token-123" });

    expect(await screen.findByText(/こんにちは、田中 さん/)).toBeInTheDocument();
    await waitFor(() => expect(path()).toBe("/"));
  });

  it("navigates to setup when verify succeeds and setup is incomplete", async () => {
    server.use(http.get(`${API_URL}/api/me`, () => HttpResponse.json(setupRequiredMe)));

    const { path } = await renderApp({ initialPath: "/verify?token=token-123" });

    await waitFor(() => expect(path()).toBe("/setup"));
    expect(await screen.findByText(/学校選択|学校/)).toBeInTheDocument();
  });

  it("shows a retry-login link when token verification fails", async () => {
    server.use(
      http.get(`${API_URL}/api/auth/magic-link/verify`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_TOKEN", message: "invalid token" } },
          { status: 400 },
        ),
      ),
    );

    await renderApp({ initialPath: "/verify?token=expired" });

    // 設計 §5 Verify 「失敗 ... → エラー文言 + 「もう一度ログイン」リンク」
    const link = await screen.findByRole("link", { name: /もう一度ログイン/ });
    expect(link).toHaveAttribute("href", expect.stringMatching(/^\/(?:login|signin)$/));
  });
});
