/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity Reviewer 用フィクスチャ。設計 doc §7 の標本から作る (実装は参照しない)。
import { act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { API_URL, defaultMe } from "../msw/handlers";
import { server } from "../msw/server";

export const ISO = "2026-04-01T00:00:00.000Z";

export const slots5 = [
  { periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false },
  { periodIndex: 2, label: "2限", startMinute: 640, endMinute: 730, isBreak: false },
  { periodIndex: 3, label: "3限", startMinute: 780, endMinute: 870, isBreak: false },
  { periodIndex: 4, label: "4限", startMinute: 880, endMinute: 970, isBreak: false },
  { periodIndex: 5, label: "5限", startMinute: 980, endMinute: 1070, isBreak: false },
];

export function slotsN(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    periodIndex: i + 1,
    label: `${i + 1}限`,
    startMinute: 540 + i * 60,
    endMinute: 590 + i * 60,
    isBreak: false,
  }));
}

export const room1 = {
  id: "room-1",
  name: "情報科学1年",
  description: null,
  showMemberTimetables: true,
  memberCount: 2,
  myRole: "OWNER",
  createdAt: ISO,
  inviteCode: "room-invite-1",
  inviteExpiresAt: null,
};

export const course = (id: string, name: string, extra: any = {}) => ({
  id, name, teacher: null, color: "#2f80ed", note: null, ...extra,
});

export const meeting = (id: string, courseId: string, dayOfWeek: number, startPeriodIndex: number, periodCount = 1, room: string | null = null) => ({
  id, courseId, dayOfWeek, startPeriodIndex, periodCount, room,
});

export function timetable(over: any = {}) {
  return {
    id: "ut-1",
    userId: "user-1",
    semesterId: "semester-1",
    title: "前期",
    sourceTemplateId: null,
    daysOfWeek: [1, 2, 3, 4, 5],
    daySlots: slots5,
    courses: [course("c1", "数学I", { teacher: "山田" })],
    meetings: [meeting("m1", "c1", 1, 1)],
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

export function sem(id: string, name: string, startDate: string, endDate: string) {
  return { id, name, startDate, endDate };
}

export function template(over: any = {}) {
  return {
    id: "tpl-1",
    authorUserId: "author-1",
    schoolId: "school-1",
    departmentId: "department-1",
    title: "情報科学1年 前期",
    description: null,
    year: 2026,
    term: "前期",
    isPublic: true,
    copyCount: 12,
    daySlots: slots5,
    courses: Array.from({ length: 8 }, (_, i) => course(`tc${i}`, `科目${i}`, { teacher: i === 0 ? "鈴木" : null })),
    meetings: [
      meeting("tm0", "tc0", 1, 1, 5),
      meeting("tm1", "tc1", 2, 1, 4),
      meeting("tm2", "tc2", 3, 1, 3),
    ],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-10-03T00:30:00.000Z",
    schoolName: "テスト大学",
    departmentName: "情報科学科",
    ...over,
  };
}

/** 呼び出しログ付きで server.use するヘルパー。 */
export type Call = { method: string; url: URL; body: any };

export function recordCalls(): Call[] {
  const calls: Call[] = [];
  server.events.on("request:start", async ({ request }) => {
    let body: any = null;
    try {
      const txt = await request.clone().text();
      body = txt ? JSON.parse(txt) : null;
    } catch {
      body = null;
    }
    calls.push({ method: request.method, url: new URL(request.url), body });
  });
  return calls;
}

export function stopRecording() {
  server.events.removeAllListeners();
}

export function findCalls(calls: Call[], method: string, pathRe: RegExp) {
  return calls.filter((c) => c.method === method && pathRe.test(c.url.pathname));
}

export function useTimetables(list: any[]) {
  server.use(http.get(`${API_URL}/api/user-timetables`, () => HttpResponse.json({ userTimetables: list })));
}

export function useSemesters(list: any[]) {
  server.use(http.get(`${API_URL}/api/semesters`, () => HttpResponse.json({ semesters: list })));
}

export function useRooms(list: any[]) {
  server.use(http.get(`${API_URL}/api/rooms`, () => HttpResponse.json({ rooms: list })));
}

export function useTemplates(list: any[]) {
  server.use(http.get(`${API_URL}/api/timetable-templates`, () => HttpResponse.json({ templates: list, nextCursor: null })));
}

export function useMe(userOver: any = {}) {
  server.use(http.get(`${API_URL}/api/me`, () => HttpResponse.json({ ...defaultMe, user: { ...defaultMe.user, ...userOver } })));
}

export function occ(id: string, courseName: string, periodIndex: number, startMinute: number, endMinute: number, status: any = null, date = "2026-05-13", room: string | null = "101") {
  return {
    id, meetingId: `m-${id}`, courseId: `c-${id}`, courseName, teacher: null, room, color: "#2f80ed",
    date, periodIndex, periodOffset: 0, startMinute, endMinute, status,
  };
}

/** タイマー起因の state 更新が act 外で起きて console.error (= Unhandled Error) にならないよう、待ちは act 内で行う */
export function settle(ms: number) {
  return act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
