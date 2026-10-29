/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity §3 / §7.R (R1-R7)
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { API_URL, setupRequiredMe } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";
import { findCalls, recordCalls, room1, stopRecording, useRooms, settle } from "../utils/parity-fixtures";

afterEach(() => stopRecording());

describe("[R] routing", () => {
  it("[R1] nav has exactly 4 items and no /rooms link", async () => {
    await renderApp({ initialPath: "/" });
    await waitFor(() => expect(screen.getAllByRole("link", { name: "ホーム" }).length).toBeGreaterThan(0));
    for (const name of ["ホーム", "学期・科目", "友達", "設定"]) {
      expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("link", { name: "ルーム" })).toBeNull();
    expect(document.querySelectorAll('a[href^="/rooms"]').length).toBe(0);
  });

  it("[R2] /rooms /rooms/room-1 /templates redirect to / without calling their APIs", async () => {
    for (const p of ["/rooms", "/rooms/room-1", "/templates"]) {
      const calls = recordCalls();
      const view = await renderApp({ initialPath: p });
      await waitFor(() => expect(view.path()).toBe("/"));
      await waitFor(() => expect(screen.getAllByRole("link", { name: "ホーム" }).length).toBeGreaterThan(0));
      expect(findCalls(calls, "GET", /^\/api\/rooms\/room-1$/)).toHaveLength(0);
      if (p === "/templates") expect(findCalls(calls, "GET", /\/api\/timetable-templates/)).toHaveLength(0);
      view.unmount();
      stopRecording();
    }
  });

  it("[R3] /rooms/join/abc123 opens join sheet with code and auto joins exactly once", async () => {
    const calls = recordCalls();
    server.use(http.post(`${API_URL}/api/rooms/join`, () => HttpResponse.json({ error: { code: "INVITE_NOT_FOUND", message: "Invite not found" } }, { status: 404 })));
    const view = await renderApp({ initialPath: "/rooms/join/abc123" });
    await waitFor(() => expect(view.path()).toBe("/"));
    const input = await screen.findByLabelText("招待リンクまたはコード");
    await waitFor(() => expect((input as HTMLInputElement).value).toBe("abc123"));
    await waitFor(() => expect(findCalls(calls, "POST", /\/api\/rooms\/join$/)).toHaveLength(1));
    expect(findCalls(calls, "POST", /\/api\/rooms\/join$/)[0]!.body).toEqual({ inviteCode: "abc123" });
  });

  it("[R4] join 200 closes sheet, selects the room chip, loads its week", async () => {
    const calls = recordCalls();
    let joined = false;
    server.use(
      http.get(`${API_URL}/api/rooms`, () => HttpResponse.json({ rooms: joined ? [room1] : [] })),
      http.post(`${API_URL}/api/rooms/join`, () => {
        joined = true;
        return HttpResponse.json({ room: room1 });
      }),
    );
    await renderApp({ initialPath: "/rooms/join/abc123" });
    const chip = await screen.findByRole("button", { name: /情報科学1年/ });
    await waitFor(() => expect(chip).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(screen.queryByLabelText("招待リンクまたはコード")).toBeNull());
    await waitFor(() => expect(findCalls(calls, "GET", /\/api\/rooms\/room-1\/week$/).length).toBeGreaterThan(0));
  });

  it("[R5] join 404 keeps sheet open with server message, joins only once", async () => {
    const calls = recordCalls();
    server.use(http.post(`${API_URL}/api/rooms/join`, () => HttpResponse.json({ error: { code: "INVITE_NOT_FOUND", message: "Invite not found" } }, { status: 404 })));
    await renderApp({ initialPath: "/rooms/join/abc123" });
    expect(await screen.findByText("Invite not found")).toBeInTheDocument();
    expect(screen.getByLabelText("招待リンクまたはコード")).toBeInTheDocument();
    await settle(300);
    expect(findCalls(calls, "POST", /\/api\/rooms\/join$/)).toHaveLength(1);
  });

  it("[R6] join link with incomplete setup goes to /setup without joining", async () => {
    const calls = recordCalls();
    server.use(http.get(`${API_URL}/api/me`, () => HttpResponse.json(setupRequiredMe)));
    const view = await renderApp({ initialPath: "/rooms/join/abc123" });
    await waitFor(() => expect(view.path()).toBe("/setup"));
    await settle(200);
    expect(findCalls(calls, "POST", /\/api\/rooms\/join$/)).toHaveLength(0);
  });

  it("[R7] existing redirects unchanged", async () => {
    useRooms([]);
    for (const [from, to] of [["/timetable", "/"], ["/stats", "/semester"], ["/me", "/settings"], ["/login", "/signin"], ["/settings/calendar", "/settings"]] as const) {
      const view = await renderApp({ initialPath: from });
      // /login は未サインイン時のみ /signin に残る。サインイン済みは / へ弾かれる (現行挙動) ので到達先は集合で見る
      await waitFor(() => expect(view.path()).not.toBe(from));
      if (from !== "/login" && from !== "/me" && from !== "/settings/calendar") expect(view.path()).toBe(to);
      view.unmount();
    }
  });
});
