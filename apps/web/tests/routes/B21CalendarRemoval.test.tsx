/**
 * build 21 レーン A-Web (カレンダー撤去) — 設計 doc §3.11 / §7.A (AW1-AW10) / §8.8 から生成。
 * 実装は参照していない (ブラックボックス)。MSW の onUnhandledRequest: "error" (tests/setup.ts) を
 * そのまま使い、加えて AW8 用に禁止 URL の呼び出しを全テストで記録する。
 */
import fs from "node:fs";
import path from "node:path";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";

beforeAll(() => {
  let store: Record<string, string> = {};
  const ls = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: ls });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: ls });
});

const ISO = "2026-04-01T00:00:00.000Z";

const timetable = {
  id: "ut1",
  userId: "user-1",
  semesterId: "semester-1",
  title: "前期",
  sourceTemplateId: null,
  daysOfWeek: [1, 2, 3, 4, 5],
  daySlots: [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }],
  courses: [{ id: "c1", name: "数学I", teacher: null, color: "#2f80ed", note: null }],
  meetings: [{ id: "m1", courseId: "c1", dayOfWeek: 1, startPeriodIndex: 1, periodCount: 1, room: null }],
  createdAt: ISO,
  updatedAt: ISO,
};

const room = {
  id: "room-1",
  name: "情報科学1年",
  description: null,
  showMemberTimetables: true,
  memberCount: 1,
  myRole: "OWNER",
  createdAt: ISO,
};

const counts = { present: 0, absent: 0, excused: 0, tardy: 0, earlyLeave: 0, suspended: 0, unrecorded: 1 };

const overview = {
  semesterId: "semester-1",
  semesterName: "前期",
  startDate: "2026-04-01",
  endDate: "2026-09-30",
  today: "2026-05-13",
  requiredAttendanceRate: 80,
  overall: {
    effectiveNumerator: 1,
    effectiveDenominator: 1,
    attendanceRate: 1,
    toDate: { effectiveNumerator: 1, effectiveDenominator: 1, attendanceRate: 1 },
    unrecordedCount: 1,
    remainingCount: 5,
    allowedAbsences: 2,
  },
  days: [{ date: "2026-05-13", status: "PARTIAL_UNRECORDED", occurrenceCount: 1, counts }],
  courses: [
    {
      courseId: "c1",
      courseName: "数学I",
      teacher: null,
      generatedOccurrences: 10,
      counts: { present: 1, absent: 0, excused: 0, tardy: 0, earlyLeave: 0, cancelled: 0, suspended: 0, unrecorded: 0 },
      effectiveNumerator: 1,
      effectiveDenominator: 1,
      attendanceRate: 1,
      toDate: { effectiveNumerator: 1, effectiveDenominator: 1, attendanceRate: 1 },
      remainingCount: 9,
      allowedAbsences: 2,
      maxDayPeriods: 1,
      allowedAbsenceDays: 2,
    },
  ],
};

// サーバーが (A2 前の) 古い形で personalEvents / upcomingEvent / roomEvents を返してきても UI に出さない、を見るため
// わざと撤去対象のペイロードを混ぜる。
const dayDetail = {
  date: "2026-05-13",
  occurrences: [
    {
      id: "o1",
      meetingId: "m1",
      courseId: "c1",
      courseName: "数学I",
      teacher: null,
      room: null,
      color: "#2f80ed",
      date: "2026-05-13",
      periodIndex: 1,
      periodOffset: 0,
      startMinute: 540,
      endMinute: 630,
      status: null,
    },
  ],
  courseSuspensions: [],
  timetableSuspension: null,
  personalEvents: [
    {
      id: "pe1",
      seriesId: "pe1",
      title: "歯医者の予約",
      start: "2026-05-13T05:00:00.000Z",
      end: "2026-05-13T06:00:00.000Z",
      isAllDay: false,
      occurrenceDate: "2026-05-13",
    },
  ],
};

function useFixtures() {
  server.use(
    http.get(`${API_URL}/api/user-timetables`, () => HttpResponse.json({ userTimetables: [timetable] })),
    http.get(`${API_URL}/api/rooms`, () =>
      HttpResponse.json({
        rooms: [{ ...room, upcomingEvent: { id: "re1", title: "新歓コンパの予定", start: "2026-05-20T10:00:00.000Z" } }],
      }),
    ),
    http.get(`${API_URL}/api/rooms/room-1`, () =>
      HttpResponse.json({ room: { ...room, inviteCode: "abc123", inviteExpiresAt: null } }),
    ),
    http.get(`${API_URL}/api/rooms/room-1/members`, () =>
      HttpResponse.json({
        members: [{ userId: "user-1", name: "田中", handle: "tanaka", image: null, role: "OWNER", joinedAt: ISO }],
      }),
    ),
    http.get(`${API_URL}/api/rooms/room-1/week`, () =>
      HttpResponse.json({
        weekStart: "2026-10-26",
        weekEnd: "2026-11-01",
        members: [{ userId: "user-1", name: "田中", handle: "tanaka", image: null, color: "#2f80ed" }],
        meetings: [
          {
            userId: "user-1",
            occurrenceId: "occ-w1",
            courseId: "c1",
            courseName: "数学I",
            courseColor: "#2f80ed",
            date: "2026-10-26",
            startMinute: 540,
            endMinute: 630,
          },
        ],
        recurringMeetings: [
          {
            userId: "user-1",
            timetableId: "ut1",
            courseId: "c1",
            courseName: "数学I",
            courseColor: "#2f80ed",
            dayOfWeek: 1,
            startPeriodIndex: 1,
            periodCount: 1,
          },
        ],
        roomEvents: [],
      }),
    ),
    http.get(`${API_URL}/api/semesters/semester-1/overview`, () => HttpResponse.json(overview)),
    http.get(`${API_URL}/api/day/2026-05-13`, () => HttpResponse.json(dayDetail)),
  );
}

// ---- AW8: 撤去したエンドポイントを一度も呼ばない -----------------------------------------
const FORBIDDEN = [
  /\/api\/personal-events/,
  /\/api\/rooms\/[^/]+\/events/,
  /ics-/,
  /google-calendar/,
  /personal-calendar-share/,
  /\/api\/me\/ics-title-rules/,
];
let requested: string[] = [];
const recorder = ({ request }: { request: Request }) => {
  requested.push(`${request.method} ${new URL(request.url).pathname}${new URL(request.url).search}`);
};

beforeEach(() => {
  requested = [];
  server.events.on("request:start", recorder);
  useFixtures();
});

afterEach(() => {
  server.events.removeListener("request:start", recorder);
  const hit = requested.filter((r) => FORBIDDEN.some((re) => re.test(r)));
  cleanup();
  expect(hit, `撤去済みエンドポイントへのリクエスト: ${hit.join(", ")}`).toEqual([]);
});

const ABSENT_BUTTON_LABELS = [/^カレンダー$/, /^時間割$/];

function expectNoCalendarModeSwitch() {
  for (const re of ABSENT_BUTTON_LABELS) {
    expect(screen.queryByRole("tab", { name: re })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: re })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: re })).not.toBeInTheDocument();
  }
  expect(screen.queryByTestId("home-mode-picker")).not.toBeInTheDocument();
}

describe("[B21 AW1] Home (/)", () => {
  it("「時間割 / カレンダー」の切替が無く、自分 chip では自分の時間割が出る", async () => {
    await renderApp({ initialPath: "/" });
    expect(await screen.findByText("数学I")).toBeInTheDocument();
    expectNoCalendarModeSwitch();
    expect(screen.getByRole("button", { name: "時間割の設定" })).toBeInTheDocument();
    expect(screen.queryByText(/カレンダー/)).not.toBeInTheDocument();
  });

  it("ルーム chip に切り替えるとルーム時間割 (week) を取りに行き、カレンダー UI は出ない", async () => {
    const { user } = await renderApp({ initialPath: "/" });
    await user.click(await screen.findByRole("button", { name: "情報科学1年" }));
    await waitFor(() => expect(requested.some((r) => r.startsWith("GET /api/rooms/room-1/week"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "時間割の設定" })).not.toBeInTheDocument());
    expectNoCalendarModeSwitch();
    expect(screen.queryByText(/カレンダー/)).not.toBeInTheDocument();
  });
});

describe("[B21 AW2] /rooms/:id", () => {
  it("「カレンダー」タブが無く、ルーム時間割 (week) と設定ボタンが出る", async () => {
    await renderApp({ initialPath: "/rooms/room-1" });
    expect(await screen.findByRole("button", { name: "ルームの設定" })).toBeInTheDocument();
    await waitFor(() => expect(requested.some((r) => r.startsWith("GET /api/rooms/room-1/week"))).toBe(true));
    await waitFor(() => expect(document.querySelector("main")?.textContent ?? "").toMatch(/月.*火.*水.*木.*金/), {
      timeout: 4000,
    });
    expect(document.querySelector("main")?.textContent ?? "").toContain("数学I");
    expectNoCalendarModeSwitch();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText(/カレンダー/)).not.toBeInTheDocument();
  });

  it("/rooms の一覧カードに upcomingEvent (予定) を出さない", async () => {
    await renderApp({ initialPath: "/rooms" });
    expect(await screen.findByText(/情報科学1年/)).toBeInTheDocument();
    expect(screen.queryByText(/新歓コンパの予定/)).not.toBeInTheDocument();
  });
});

describe("[B21 AW3] ルーム設定シート", () => {
  it("ICS / Google / カレンダー取り込み設定が無く、「メンバーの時間割を表示」トグルが PATCH を飛ばす", async () => {
    const patches: unknown[] = [];
    server.use(
      http.patch(`${API_URL}/api/rooms/room-1`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({
          room: { ...room, showMemberTimetables: false, inviteCode: "abc123", inviteExpiresAt: null },
        });
      }),
    );
    const { user } = await renderApp({ initialPath: "/rooms/room-1" });
    await user.click(await screen.findByRole("button", { name: "ルームの設定" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/メンバーの時間割を表示/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/メンバーの時間割をカレンダーに反映/)).not.toBeInTheDocument();
    for (const re of [/ICS/i, /Google/i, /カレンダー取り込み設定/, /外部カレンダー/, /個人カレンダー/, /カレンダー/]) {
      expect(within(dialog).queryByText(re), String(re)).not.toBeInTheDocument();
    }
    expect(within(dialog).queryByRole("button", { name: /ICS|Google|カレンダー/i })).not.toBeInTheDocument();

    const toggle =
      within(dialog).queryByRole("switch") ??
      within(dialog).queryByRole("checkbox", { name: /メンバーの時間割/ }) ??
      within(dialog).getByRole("button", { name: /メンバーの時間割を表示/ });
    await user.click(toggle);
    await waitFor(() => expect(patches).toContainEqual({ showMemberTimetables: false }));
  });
});

describe("[B21 AW4] /settings", () => {
  it("Google Calendar 連携 / カレンダー設定 (ICS) の行が無く、残す行は残る", async () => {
    await renderApp({ initialPath: "/settings" });
    expect(await screen.findByText("出欠ルール")).toBeInTheDocument();
    expect(screen.queryByText(/Google Calendar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/カレンダー設定/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ICS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/カレンダー/)).not.toBeInTheDocument();
    expect(screen.getByText(/必要出席率/)).toBeInTheDocument();
    expect(screen.getByText("学期管理")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログアウト" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "アカウントを削除" })).toBeInTheDocument();
  });

  it("[A28 Web] アカウント削除の確認文は §3.4.1 の文字列で、「予定」を含まない", async () => {
    const EXPECTED =
      "時間割・出欠・友達などのデータはすべて直ちに削除され、元に戻せません。作成したルームは他のメンバーに引き継がれます。公開した時間割テンプレートは、作成者を伏せて残ります。";
    const { user } = await renderApp({ initialPath: "/settings" });
    await user.click(await screen.findByRole("button", { name: "アカウントを削除" }));
    await waitFor(() => expect(document.body.textContent ?? "").toContain("元に戻せません"));
    expect(document.body.textContent ?? "").toContain(EXPECTED);
    expect(EXPECTED).not.toContain("予定");
  });
});

describe("[B21 AW5] 撤去ルートは /settings へ redirect (404 にしない)", () => {
  it.each(["/settings/calendar", "/settings/integrations/google"])("%s -> /settings", async (p) => {
    const { path } = await renderApp({ initialPath: p });
    expect(await screen.findByText("出欠ルール")).toBeInTheDocument();
    expect(path()).toBe("/settings");
    expect(screen.queryByText(/Not Found|404|見つかりません/i)).not.toBeInTheDocument();
  });

  it("Google OAuth の戻り先クエリ付きでも /settings に着く", async () => {
    const { path } = await renderApp({ initialPath: "/settings/integrations/google?connected=1" });
    expect(await screen.findByText("出欠ルール")).toBeInTheDocument();
    expect(path()).toBe("/settings");
  });
});

describe("[B21 AW6/AW7] 学期 (/semester) の日別シートと一括編集", () => {
  it("AW6: 日別シートに「予定」節が無く、授業 (出欠) は従来どおり出る", async () => {
    const { user } = await renderApp({ initialPath: "/semester" });
    await user.click(await screen.findByRole("button", { name: "5月13日" }, { timeout: 6000 }));
    expect(await screen.findByText(/^授業 \(1\)$/)).toBeInTheDocument();
    expect(screen.queryByText(/歯医者の予約/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /予定/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/予定 \(\d+\)/)).not.toBeInTheDocument();
    expect(screen.queryByText("予定はありません")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /予定を?追加|予定/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /欠/ })).toBeInTheDocument();
  });

  it("AW7: 複数選択 → 一括編集に終日予定の追加が無く、出欠一括・休講は残る", async () => {
    const { user } = await renderApp({ initialPath: "/semester" });
    await user.click(await screen.findByRole("button", { name: "複数選択" }, { timeout: 6000 }));
    await user.click(await screen.findByRole("button", { name: "5月13日" }));
    const open = await screen.findByRole("button", { name: /一括|編集|選択した|登録/ }).catch(() => null);
    if (open) await user.click(open);
    expect(await screen.findByRole("button", { name: "この内容で登録" })).toBeInTheDocument();
    expect(screen.queryByText(/終日/)).not.toBeInTheDocument();
    expect(screen.queryByText(/予定/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "欠" })).toBeInTheDocument();
  });
});

describe("[B21 AW9] Google サインインは残す", () => {
  it("/login (未ログイン) に「Google で続ける」が出る", async () => {
    server.use(
      http.get(`${API_URL}/api/me`, () =>
        HttpResponse.json({ error: { code: "UNAUTHORIZED", message: "unauthorized" } }, { status: 401 }),
      ),
    );
    const { path } = await renderApp({ initialPath: "/login" });
    const google = await screen.findByRole("button", { name: /Google/ });
    expect(google).toBeEnabled();
    expect(path()).toBe("/signin");
  });
});

describe("[B21 AW8] 全画面巡回で撤去済みエンドポイントを呼ばない", () => {
  it.each(["/", "/rooms", "/rooms/room-1", "/settings", "/semester", "/friends", "/templates"])("%s", async (p) => {
    server.use(http.get(`${API_URL}/api/friendships`, () => HttpResponse.json({ friends: [], incoming: [], outgoing: [] })));
    await renderApp({ initialPath: p });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    await waitFor(() => expect(requested.length).toBeGreaterThan(0));
    // afterEach が禁止 URL の有無を判定する
  });
});

describe("[B21 残存画面] 撤去の巻き添えで壊れていない", () => {
  it("/templates (共有テンプレ) が描画される", async () => {
    await renderApp({ initialPath: "/templates" });
    expect(await screen.findByText("みんなの時間割")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "コピー" })).toBeInTheDocument();
  });

  it("/rooms (ルーム一覧) と /friends が描画される", async () => {
    await renderApp({ initialPath: "/rooms" });
    expect(await screen.findByText(/情報科学1年/)).toBeInTheDocument();
    cleanup();
    server.use(http.get(`${API_URL}/api/friendships`, () => HttpResponse.json({ friends: [], incoming: [], outgoing: [] })));
    await renderApp({ initialPath: "/friends" });
    expect(await screen.findByText("友達を追加")).toBeInTheDocument();
  });

  it("/semester の出欠カレンダー (月表示) と科目一覧が残る", async () => {
    await renderApp({ initialPath: "/semester" });
    expect(await screen.findByText("科目一覧", undefined, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前の月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次の月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5月13日" })).toBeInTheDocument();
  });

  it("ホームの「今日は全出席」CTA (自分 chip) が残る", async () => {
    await renderApp({ initialPath: "/" });
    expect(await screen.findByRole("button", { name: /今日は全出席/ })).toBeInTheDocument();
  });
});

// ---- AW10 / §3.11: ソース走査 (件数のみ。内容は読まない) -------------------------------------
const SRC = path.resolve(__dirname, "../../src");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe("[B21 AW10] apps/web/src のソース走査", () => {
  const files = walk(SRC).filter((f) => /\.(ts|tsx|css)$/.test(f));

  it("走査対象が空ではない (vacuous green 防止)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(["PersonalEvent", "RoomEvent", "IcsImport", "GoogleCalendar", "personal-events"])("%s は 0 件", (word) => {
    const hits = files.filter((f) => fs.readFileSync(f, "utf8").includes(word)).map((f) => path.relative(SRC, f));
    expect(hits).toEqual([]);
  });

  it("§3.11 の削除対象ファイル・ディレクトリが存在しない", () => {
    const gone = [
      "routes/SettingsCalendar.tsx",
      "components/home/HomeViewModeTabs.tsx",
      "components/home/PersonalCalendar.tsx",
      "components/rooms/RoomCalendar.tsx",
      "components/rooms/RoomEventCreateSheet.tsx",
      "components/rooms/RoomEventDetailSheet.tsx",
      "components/rooms/RoomGoogleSyncSection.tsx",
      "components/rooms/calendar",
      "components/avatar/GoogleCalendarSection.tsx",
      "components/avatar/GoogleCalendarConnectSheet.tsx",
      "components/avatar/GoogleCalendarSelectorSheet.tsx",
      "components/ics-import",
      "components/recurrence",
      "components/semester/PersonalEventEditModal.tsx",
      "lib/calendarEventDisplay.ts",
      "lib/calendarLane.ts",
      "lib/calendarRange.ts",
      "lib/meetingExpansion.ts",
      "lib/personalEventDays.ts",
      "lib/recurrenceFormat.ts",
      "api/hooks/useGoogleCalendar.ts",
      "api/hooks/useIcsImports.ts",
      "api/hooks/useIcsTitleRules.ts",
      "api/hooks/usePersonalEvents.ts",
      "api/hooks/useRoomEvents.ts",
      "api/hooks/useRoomMonth.ts",
      "components/ui/skeletons/CalendarDaySkeleton.tsx",
      "components/ui/skeletons/CalendarMonthSkeleton.tsx",
      "components/ui/skeletons/CalendarWeekSkeleton.tsx",
      "components/ui/skeletons/DayAgendaPanelSkeleton.tsx",
    ];
    const present = gone.filter((g) => fs.existsSync(path.join(SRC, g)));
    expect(present).toEqual([]);
  });

  it("§3.11 の「残す」ファイルは残っている (時間割・Google ログイン)", () => {
    const kept = [
      "components/event-tile",
      "lib/memberColor.ts",
      "components/ui/AuthProviderButton.tsx",
      "routes/SignIn.tsx",
    ];
    const missing = kept.filter((k) => !fs.existsSync(path.join(SRC, k)));
    expect(missing).toEqual([]);
  });
});
