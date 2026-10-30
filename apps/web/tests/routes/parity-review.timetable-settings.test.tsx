/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity §5.5 / §7.TS (TS1-TS15)
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";
import {
  course, findCalls, meeting, recordCalls, stopRecording, template, timetable, useMe, useTemplates, useTimetables } from "../utils/parity-fixtures";

afterEach(() => stopRecording());

type View = Awaited<ReturnType<typeof renderApp>>;

async function openSettings(init: any[] | null) {
  if (init) useTimetables(init);
  const v = await renderApp({ initialPath: "/" });
  await v.user.click(await screen.findByRole("button", { name: "時間割の設定" }));
  await screen.findByRole("heading", { name: "時間割の設定" });
  return v;
}

const toggle = () => screen.getByLabelText("みんなの時間割で公開") as HTMLInputElement;
const published = (isPublic: boolean, over: any = {}) => ({ id: "p", title: "公開名", isPublic, updatedAt: "2026-10-01T00:00:00.000Z", ...over });

describe("[TS] timetable settings sheet", () => {
  it("[TS1] self-made timetable -> toggle ON", async () => {
    await openSettings([timetable()]);
    expect(toggle().checked).toBe(true);
  });

  it("[TS2] imported timetable (no published template) -> OFF", async () => {
    await openSettings([timetable({ sourceTemplateId: "x" })]);
    expect(toggle().checked).toBe(false);
  });

  it("[TS3a] publishedTemplate isPublic=false -> OFF", async () => {
    await openSettings([timetable({ publishedTemplate: published(false) })]);
    expect(toggle().checked).toBe(false);
  });

  it("[TS3b] publishedTemplate isPublic=true -> ON, title prefilled", async () => {
    await openSettings([timetable({ publishedTemplate: published(true) })]);
    expect(toggle().checked).toBe(true);
    expect((screen.getByLabelText("公開タイトル") as HTMLInputElement).value).toBe("公開名");
  });

  it("[TS4] saving an imported timetable does not publish (W-D1)", async () => {
    const calls = recordCalls();
    const v = await openSettings([timetable({ sourceTemplateId: "x" })]);
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "時間割の設定" })).toBeNull());
    expect(findCalls(calls, "POST", /publish-as-template$/)).toHaveLength(0);
    expect(findCalls(calls, "PATCH", /timetable-templates/)).toHaveLength(0);
  });

  it("[TS5] ON -> OFF on published timetable PATCHes isPublic:false and closes", async () => {
    const calls = recordCalls();
    const v = await openSettings([timetable({ publishedTemplate: published(true) })]);
    await v.user.click(toggle());
    expect(toggle().checked).toBe(false);
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(findCalls(calls, "PATCH", /timetable-templates\/p$/)).toHaveLength(1));
    expect(findCalls(calls, "PATCH", /timetable-templates\/p$/)[0]!.body).toEqual({ isPublic: false });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "時間割の設定" })).toBeNull());
    expect(findCalls(calls, "POST", /publish-as-template$/)).toHaveLength(0);
  });

  it("[TS5b] publish on self-made timetable POSTs title", async () => {
    const calls = recordCalls();
    const v = await openSettings([timetable()]);
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(findCalls(calls, "POST", /user-timetables\/ut-1\/publish-as-template$/)).toHaveLength(1));
    expect(findCalls(calls, "POST", /publish-as-template$/)[0]!.body).toEqual({ title: "前期" });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "時間割の設定" })).toBeNull());
  });

  it("[TS6] ON with zero meetings: hint shown, no publish", async () => {
    const calls = recordCalls();
    const v = await openSettings([timetable({ meetings: [], courses: [] })]);
    expect(screen.getByText("授業を 1 つ以上登録すると公開されます")).toBeInTheDocument();
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "時間割の設定" })).toBeNull());
    expect(findCalls(calls, "POST", /publish-as-template$/)).toHaveLength(0);
  });

  it("[TS6b] hint also shown while toggle OFF", async () => {
    await openSettings([timetable({ meetings: [], courses: [], sourceTemplateId: "x" })]);
    expect(toggle().checked).toBe(false);
    expect(screen.getByText("授業を 1 つ以上登録すると公開されます")).toBeInTheDocument();
  });

  it("[TS7] empty publish title -> message, sheet stays, nothing posted", async () => {
    const calls = recordCalls();
    const v = await openSettings([timetable()]);
    await v.user.clear(screen.getByLabelText("公開タイトル"));
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText("公開タイトルを入力してください")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "時間割の設定" })).toBeInTheDocument();
    expect(findCalls(calls, "POST", /publish-as-template$/)).toHaveLength(0);
  });

  it("[TS8] publish 500: message, stays open, name PATCH already sent", async () => {
    const calls = recordCalls();
    server.use(http.post(`${API_URL}/api/user-timetables/:id/publish-as-template`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));
    const v = await openSettings([timetable()]);
    const name = screen.getByLabelText("名前");
    await v.user.clear(name);
    await v.user.type(name, "新しい名前");
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText("公開設定を保存できませんでした")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "時間割の設定" })).toBeInTheDocument();
    const patches = findCalls(calls, "PATCH", /user-timetables\/ut-1$/);
    expect(patches.some((p) => p.body?.title === "新しい名前")).toBe(true);
  });

  it("[TS9] old inline import section is gone", async () => {
    await openSettings([timetable()]);
    expect(screen.queryByText(/同じ学校の公開時間割から持ってくる/)).toBeNull();
  });

  it("[TS10] timetable null: import button still enabled; 先に学期を作成してください", async () => {
    await openSettings([]);
    expect(screen.getByText("先に学期を作成してください。")).toBeInTheDocument();
    expect(screen.getByTestId("timetable-settings-import-template")).toBeEnabled();
    expect(screen.getByLabelText("みんなの時間割で公開")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("[TS11] no school/department: red hint, browser not opened", async () => {
    useMe({ schoolId: null, departmentId: null, schoolName: null, departmentName: null });
    const v = await openSettings([timetable()]);
    await v.user.click(screen.getByTestId("timetable-settings-import-template"));
    const msg = await screen.findByText("先に学校・学科を設定してください");
    expect(msg.className).toContain("text-status-absent");
    expect(screen.queryByRole("heading", { name: "公開時間割" })).toBeNull();
  });

  it("[TS12] import into existing timetable: locked target, confirm, replaceExisting, both sheets close", async () => {
    const calls = recordCalls();
    const tpl = template({ id: "tA", title: "テンプレA" });
    useTemplates([tpl]);
    const v = await openSettings([timetable({ courses: [course("c1", "数学I"), course("c2", "英語")], meetings: [meeting("m1", "c1", 1, 1)] })]);
    await v.user.click(screen.getByTestId("timetable-settings-import-template"));
    await screen.findByRole("heading", { name: "公開時間割" });
    expect(screen.getByText("取り込み先: 前期")).toBeInTheDocument();
    expect(screen.queryByTestId("template-target-semester")).toBeNull();
    await v.user.click(await screen.findByTestId("template-card-tA"));
    await v.user.click(await screen.findByTestId("template-import-button"));
    await v.user.click(await screen.findByRole("button", { name: "置き換える" }));
    await waitFor(() => expect(findCalls(calls, "POST", /tA\/copy$/)).toHaveLength(1));
    expect(findCalls(calls, "POST", /tA\/copy$/)[0]!.body).toEqual({ semesterId: "semester-1", replaceExisting: true });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "時間割の設定" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "時間割の中身" })).toBeNull();
    });
  });

  it("[TS13] delete flow", async () => {
    const calls = recordCalls();
    const v = await openSettings([timetable()]);
    expect(screen.getByText("この時間割を削除")).toBeInTheDocument();
    await v.user.click(screen.getByRole("button", { name: "削除する" }));
    expect(await screen.findByRole("heading", { name: "時間割を削除" })).toBeInTheDocument();
    const dlg = screen.getByRole("heading", { name: "時間割を削除" }).closest('[role="dialog"]') as HTMLElement;
    expect(dlg.querySelectorAll("p").length).toBe(0);
    const confirmBtn = Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent === "削除する")!;
    await v.user.click(confirmBtn);
    await waitFor(() => expect(findCalls(calls, "DELETE", /user-timetables\/ut-1$/)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "時間割の設定" })).toBeNull());
  });

  it("[TS13b] delete 500 -> toast", async () => {
    server.use(http.delete(`${API_URL}/api/user-timetables/:id`, () => HttpResponse.json({ error: { code: "X", message: "x" } }, { status: 500 })));
    const v = await openSettings([timetable()]);
    await v.user.click(screen.getByRole("button", { name: "削除する" }));
    const dlg = (await screen.findByRole("heading", { name: "時間割を削除" })).closest('[role="dialog"]') as HTMLElement;
    await v.user.click(Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent === "削除する")!);
    expect(await screen.findByText("削除できませんでした")).toBeInTheDocument();
  });

  it("[TS14] timetable null: no danger zone", async () => {
    await openSettings([]);
    expect(screen.queryByText("この時間割を削除")).toBeNull();
  });

  it("[TS15] name / days / slots PATCHed one at a time in order", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const order: string[] = [];
    server.use(
      http.patch(`${API_URL}/api/user-timetables/:id`, async ({ request }) => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        const body = (await request.json()) as any;
        order.push(Object.keys(body).join(","));
        await new Promise((r) => setTimeout(r, 60));
        inflight--;
        return HttpResponse.json({ userTimetable: timetable({ ...body }) });
      }),
    );
    const v = await openSettings([timetable({ sourceTemplateId: "x" })]);
    const name = screen.getByLabelText("名前");
    await v.user.clear(name);
    await v.user.type(name, "変更後");
    await v.user.click(screen.getByRole("button", { name: "土曜日" }));
    fireEvent.change(screen.getAllByLabelText("開始時刻")[0]!, { target: { value: "09:05" } });
    await v.user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(order).toHaveLength(3), { timeout: 3000 });
    expect(order.map((o) => o.split(",")[0])).toEqual(["title", "daysOfWeek", "daySlots"]);
    expect(maxInflight).toBe(1);
  });
});

void describe;
