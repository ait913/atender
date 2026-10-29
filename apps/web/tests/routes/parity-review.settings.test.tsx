/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity §5.8 / §7.ST (ST1-ST9) + §7.T17 (E4)
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";
import { findCalls, recordCalls, stopRecording, template, useMe, useTemplates } from "../utils/parity-fixtures";

afterEach(() => {
  stopRecording();
  vi.restoreAllMocks();
});

type View = Awaited<ReturnType<typeof renderApp>>;

async function openSchoolSheet(v: View) {
  await v.user.click(await screen.findByText("学校・学科"));
  return await screen.findByRole("heading", { name: "学校・学科" });
}

/** 学校・学科シートで学科 (department-2) まで選ぶ */
async function pickOtherDepartment(v: View) {
  server.use(
    http.get(`${API_URL}/api/schools/:id/departments`, ({ params }) =>
      HttpResponse.json({ departments: [{ id: "department-2", schoolId: params.id, name: "別学科" }] }),
    ),
  );
  await v.user.click(await screen.findByRole("button", { name: /東京テスト高校/ }));
  await v.user.click(await screen.findByRole("button", { name: /別学科/ }));
}

describe("[ST] settings school/department", () => {
  it("[ST1] no raw ID inputs; 現在 line", async () => {
    const v = await renderApp({ initialPath: "/settings" });
    await openSchoolSheet(v);
    expect(screen.queryByText("学校 ID")).toBeNull();
    expect(screen.queryByText("学科 ID")).toBeNull();
    expect(screen.queryByLabelText(/学校 ?ID/)).toBeNull();
    expect(screen.getByText("現在: テスト大学 / 情報科学科")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("学校名で検索")).toBeInTheDocument();
  });

  it("[ST1b] current line shows 未設定 when empty", async () => {
    useMe({ schoolId: null, departmentId: null, schoolName: null, departmentName: null });
    const v = await renderApp({ initialPath: "/settings" });
    await openSchoolSheet(v);
    expect(screen.getByText(/現在: 未設定/)).toBeInTheDocument();
  });

  it("[ST2] same school/department -> save disabled", async () => {
    const v = await renderApp({ initialPath: "/settings" });
    await openSchoolSheet(v);
    await v.user.click(await screen.findByRole("button", { name: /東京テスト高校/ }));
    await v.user.click(await screen.findByRole("button", { name: /普通科/ }));
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("[ST3] different department, no suggestions: PATCH, toast, closes", async () => {
    const calls = recordCalls();
    const v = await renderApp({ initialPath: "/settings" });
    await openSchoolSheet(v);
    await pickOtherDepartment(v);
    const save = screen.getByRole("button", { name: "保存" });
    await waitFor(() => expect(save).toBeEnabled());
    await v.user.click(save);
    await waitFor(() => expect(findCalls(calls, "PATCH", /^\/api\/me$/)).toHaveLength(1));
    expect(findCalls(calls, "PATCH", /^\/api\/me$/)[0]!.body).toEqual({ schoolId: "school-1", departmentId: "department-2" });
    expect(await screen.findByText("学校・学科を変更しました")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "学校・学科" })).toBeNull());
  });

  it("[ST4] PATCH 500 -> toast, stays open", async () => {
    server.use(http.patch(`${API_URL}/api/me`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));
    const v = await renderApp({ initialPath: "/settings" });
    await openSchoolSheet(v);
    await pickOtherDepartment(v);
    const save = screen.getByRole("button", { name: "保存" });
    await waitFor(() => expect(save).toBeEnabled());
    await v.user.click(save);
    expect(await screen.findByText("保存できませんでした")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "学校・学科" })).toBeInTheDocument();
  });

  it("[ST5] row shows school / department", async () => {
    await renderApp({ initialPath: "/settings" });
    expect(await screen.findByText("テスト大学 / 情報科学科")).toBeInTheDocument();
  });

  it("[ST5b] only one side set -> that side only", async () => {
    useMe({ schoolName: null });
    await renderApp({ initialPath: "/settings" });
    await screen.findByText("学校・学科");
    expect(await screen.findByText("情報科学科")).toBeInTheDocument();
    expect(screen.queryByText(/ \/ /)).toBeNull();
  });
});

describe("[ST] settings rows / legal links / theme", () => {
  it("[ST6] その他 order and window.open args", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    window.open = open as any;
    const v = await renderApp({ initialPath: "/settings" });
    const heading = await screen.findByRole("heading", { name: "その他" });
    const sec = heading.closest("section")!;
    expect(within(sec).getAllByRole("button").map((b) => b.textContent)).toEqual(["プライバシーポリシー", "利用規約", "サポート", "ログアウト", "アカウントを削除"]);
    for (const [label, path] of [["プライバシーポリシー", "/privacy"], ["利用規約", "/terms"], ["サポート", "/support"]] as const) {
      await v.user.click(within(sec).getByRole("button", { name: label }));
      expect(open).toHaveBeenLastCalledWith(path, "_blank", "noopener,noreferrer");
    }
    expect(v.path()).toBe("/settings");
    vi.unstubAllGlobals();
  });

  const darkOs = () =>
    (window.matchMedia as any).mockImplementation((query: string) => ({
      matches: query.includes("dark"), media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
  const theme = () => document.documentElement.getAttribute("data-theme");

  it("[ST7] no stored theme -> light even when OS is dark", async () => {
    darkOs();
    await renderApp({ initialPath: "/settings" });
    await screen.findByText("ライト");
    expect(theme()).toBe("light");
  });

  it("[ST8] choosing 自動 stores 'auto'", async () => {
    const v = await renderApp({ initialPath: "/settings" });
    await v.user.click(await screen.findByRole("button", { name: "自動" }));
    expect(localStorage.getItem("theme")).toBe("auto");
  });

  it("[ST9] stored dark is kept", async () => {
    localStorage.setItem("theme", "dark");
    await renderApp({ initialPath: "/settings" });
    await screen.findByText("ダーク");
    expect(theme()).toBe("dark");
  });
});

describe("[T] E4: browser after changing school/department", () => {
  const tplA = template({ id: "tA", title: "テンプレA" });

  async function toBrowser() {
    useTemplates([tplA]);
    const v = await renderApp({ initialPath: "/settings" });
    await openSchoolSheet(v);
    await pickOtherDepartment(v);
    const save = screen.getByRole("button", { name: "保存" });
    await waitFor(() => expect(save).toBeEnabled());
    await v.user.click(save);
    expect(await screen.findByText("✓ 同じ学科の時間割が見つかりました")).toBeInTheDocument();
    return v;
  }

  it("[T17a] browser opens with banner; 戻る returns to the school sheet", async () => {
    const v = await toBrowser();
    expect(screen.getByRole("heading", { name: "公開時間割" })).toBeInTheDocument();
    await v.user.click(screen.getByRole("button", { name: "戻る" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "公開時間割" })).toBeNull());
    expect(screen.getByRole("heading", { name: "学校・学科" })).toBeInTheDocument();
  });

  it("[T17b] × closes the school sheet too", async () => {
    const v = await toBrowser();
    const dlg = screen.getByRole("heading", { name: "公開時間割" }).closest('[role="dialog"]') as HTMLElement;
    await v.user.click(within(dlg).getByRole("button", { name: "閉じる" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "公開時間割" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "学校・学科" })).toBeNull();
    });
  });
});
