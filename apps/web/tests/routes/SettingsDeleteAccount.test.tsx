import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { API_URL, defaultMe } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";

beforeAll(() => {
  let store: Record<string, string> = {};
  const ls = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: ls });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: ls });
});

const TITLE = "アカウントを削除しますか?";
const BODY =
  "時間割・出欠・友達などのデータはすべて直ちに削除され、元に戻せません。作成したルームは他のメンバーに引き継がれます。公開した時間割テンプレートは、作成者を伏せて残ります。";
const ERROR_TEXT = "アカウントを削除できませんでした。通信状況を確認して、もう一度お試しください。";

describe("[B20 #W] /settings account deletion", () => {
  it("#W1 has an 'アカウントを削除' button", async () => {
    await renderApp({ initialPath: "/settings" });
    expect(await screen.findByRole("button", { name: "アカウントを削除" })).toBeInTheDocument();
  });

  it("#W2 tap opens the confirm dialog; キャンセル closes it with zero DELETE calls", async () => {
    let deletes = 0;
    server.use(
      http.delete(`${API_URL}/api/me`, () => {
        deletes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp({ initialPath: "/settings" });
    await user.click(await screen.findByRole("button", { name: "アカウントを削除" }));

    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(BODY)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除する" })).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "キャンセル" });
    await user.click(cancel);

    await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument());
    expect(deletes).toBe(0);
  });

  it("#W3 削除する sends DELETE /api/me once with no body and navigates to /signin", async () => {
    const seen: { method: string; body: string; contentType: string | null }[] = [];
    server.use(
      http.delete(`${API_URL}/api/me`, async ({ request }) => {
        seen.push({ method: request.method, body: await request.text(), contentType: request.headers.get("content-type") });
        return new HttpResponse(null, { status: 204 });
      }),
      // 実サーバーは削除後に旧セッションを 401 にする (guard が / へ戻さないように)
      http.get(`${API_URL}/api/me`, () =>
        seen.length > 0
          ? HttpResponse.json({ error: { code: "UNAUTHORIZED", message: "no" } }, { status: 401 })
          : HttpResponse.json(defaultMe),
      ),
    );
    const { user, path } = await renderApp({ initialPath: "/settings" });
    await user.click(await screen.findByRole("button", { name: "アカウントを削除" }));
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].method).toBe("DELETE");
    expect(seen[0].body).toBe("");
    await waitFor(() => expect(path()).toMatch(/^\/(?:signin|login)$/));
    expect(seen).toHaveLength(1);
  });

  it("#W4 DELETE 500 shows the failure message and stays on /settings", async () => {
    server.use(
      http.delete(`${API_URL}/api/me`, () =>
        HttpResponse.json({ error: { code: "INTERNAL", message: "x" } }, { status: 500 }),
      ),
    );
    const { user, path } = await renderApp({ initialPath: "/settings" });
    await user.click(await screen.findByRole("button", { name: "アカウントを削除" }));
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    expect(await screen.findByText(ERROR_TEXT)).toBeInTheDocument();
    expect(path()).toBe("/settings");
    // the account row is usable again
    expect(screen.getByRole("button", { name: "アカウントを削除" })).toBeInTheDocument();
  });
});
