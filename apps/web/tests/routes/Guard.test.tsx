import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API_URL, setupRequiredMe } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";

describe("route guards", () => {
  it("redirects authenticated routes to /login when /api/me returns 401", async () => {
    server.use(
      http.get(`${API_URL}/api/me`, () =>
        HttpResponse.json({ error: { code: "UNAUTHORIZED", message: "unauthorized" } }, { status: 401 }),
      ),
    );

    const { path } = await renderApp({ initialPath: "/" });

    await waitFor(() => expect(path()).toMatch(/^\/(?:login|signin)$/));
    expect(await screen.findByRole("button", { name: /ログインリンクを送る/ })).toBeInTheDocument();
  });

  it("redirects incomplete setup users from / to /setup", async () => {
    server.use(http.get(`${API_URL}/api/me`, () => HttpResponse.json(setupRequiredMe)));

    const { path } = await renderApp({ initialPath: "/" });

    await waitFor(() => expect(path()).toBe("/setup"));
    expect((await screen.findAllByText(/Step 1\/3: 学校を選ぶ|学校選択|学校/))[0]).toBeInTheDocument();
  });

  it("redirects to /setup when /api/today returns SETUP_REQUIRED", async () => {
    server.use(
      http.get(`${API_URL}/api/today`, () =>
        HttpResponse.json(
          { error: { code: "SETUP_REQUIRED", message: "setup required" } },
          { status: 403 },
        ),
      ),
    );

    const { path } = await renderApp({ initialPath: "/" });

    await waitFor(() => expect(path()).toBe("/setup"));
  });
});
