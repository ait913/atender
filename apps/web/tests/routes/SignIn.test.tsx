import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";

describe("/login", () => {
  it("renders email input and magic-link submit button", async () => {
    await renderApp({ initialPath: "/login" });

    expect(await screen.findByRole("textbox", { name: /email|メール/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログインリンクを送る" })).toBeInTheDocument();
  });

  it("posts email and callbackURL to the magic-link endpoint", async () => {
    const requests: unknown[] = [];
    server.use(
      http.post(`${API_URL}/api/auth/sign-in/magic-link`, async ({ request }) => {
        requests.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );

    const { user } = await renderApp({ initialPath: "/login" });
    await user.type(await screen.findByRole("textbox", { name: /email|メール/i }), "student@example.com");
    await user.click(screen.getByRole("button", { name: "ログインリンクを送る" }));

    await waitFor(() => {
      expect(requests).toContainEqual({
        email: "student@example.com",
        callbackURL: expect.stringMatching(/\/verify|\/$/),
      });
    });
  });

  it("shows the inline success message after sending mail", async () => {
    const { user } = await renderApp({ initialPath: "/login" });
    await user.type(await screen.findByRole("textbox", { name: /email|メール/i }), "student@example.com");
    await user.click(screen.getByRole("button", { name: "ログインリンクを送る" }));

    expect(
      await screen.findByText("メールを送信しました。15 分以内にリンクを開いてください"),
    ).toBeInTheDocument();
  });

  it("keeps resend disabled before 60 seconds and enables it after the timer", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderApp({ initialPath: "/login" });
    try {
      await user.type(await screen.findByRole("textbox", { name: /email|メール/i }), "student@example.com");
      await user.click(screen.getByRole("button", { name: /ログインリンクを送る/ }));

      const resend = screen.getByRole("button", { name: /再送|ログインリンクを送る/ });
      expect(resend).toBeDisabled();

      vi.advanceTimersByTime(60_000);
      expect(resend).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers Google sign-in with the API callback URL", async () => {
    await renderApp({ initialPath: "/login" });

    const google =
      screen.queryByRole("button", { name: /Google.*サインイン/ }) ??
      (await screen.findByRole("link", { name: /Google.*サインイン/ }));
    expect(google).toBeInTheDocument();
    const target = google.closest("a") ?? google;
    const href = target.getAttribute("href") ?? "";
    expect(href).toContain("/api/auth/sign-in/social/google");
    expect(href).toContain("callbackURL=");
  });
});
