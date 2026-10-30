/* eslint-disable @typescript-eslint/no-explicit-any */
// web-parity Reviewer: 設計 doc §6 / §7.L のみを根拠にした純粋関数テスト。
import { describe, expect, it } from "vitest";
import * as SchoolClock from "@/lib/SchoolClock";
import * as CD from "@/lib/CalendarDate";
import * as SR from "@/lib/SemesterRollover";
import * as CO from "@/lib/TimetableCarryOver";
import * as SCP from "@/lib/SemesterCreationPlan";
import * as TIL from "@/lib/TemplateImportLogic";
import * as TPL from "@/lib/TimetablePublishLogic";
import * as TSL from "@/lib/TemplateSuggestionLogic";
import * as CRL from "@/lib/CourseRuleLogic";
import * as SOD from "@/lib/SemesterOverviewDisplayLogic";
import * as TGL from "@/lib/TimetableGridLayout";
import * as RTL from "@/lib/RoomTimetableLogic";
import * as TT from "@/lib/TodayTimeline";
import * as CTL from "@/lib/ClassTransferLogic";

const sem = (id: string, startDate: string, endDate: string, name = id): any => ({ id, name, startDate, endDate });

describe("SchoolClock / CalendarDate", () => {
  it("[LSC1] todayString JST boundary", () => {
    expect(SchoolClock.todayString(new Date("2026-09-30T14:59:00Z"))).toBe("2026-09-30");
    expect(SchoolClock.todayString(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
  });
  it("[LSC2] nowMinute", () => {
    expect(SchoolClock.nowMinute(new Date("2026-09-30T14:59:00Z"))).toBe(1439);
    expect(SchoolClock.nowMinute(new Date("2026-09-30T15:00:00Z"))).toBe(0);
  });
  it("[LSC3] displayDay (Sunday=7, no rounding to Monday)", () => {
    expect(SchoolClock.displayDay(new Date("2026-09-30T14:59:00Z"))).toBe(3);
    expect(SchoolClock.displayDay(new Date("2026-09-30T15:00:00Z"))).toBe(4);
    expect(SchoolClock.displayDay(new Date("2026-10-31T14:59:59Z"))).toBe(6);
    expect(SchoolClock.displayDay(new Date("2026-11-01T01:00:00Z"))).toBe(7);
    expect(SchoolClock.displayDay(new Date("2026-11-01T15:00:00Z"))).toBe(1);
  });
  it("[LSC4] device TZ independent", () => {
    const old = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(SchoolClock.todayString(new Date("2026-09-30T14:59:00Z"))).toBe("2026-09-30");
      expect(SchoolClock.todayString(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
      expect(SchoolClock.nowMinute(new Date("2026-09-30T14:59:00Z"))).toBe(1439);
      expect(SchoolClock.nowMinute(new Date("2026-09-30T15:00:00Z"))).toBe(0);
      expect(SchoolClock.displayDay(new Date("2026-11-01T01:00:00Z"))).toBe(7);
      expect(SchoolClock.displayDay(new Date("2026-11-01T15:00:00Z"))).toBe(1);
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });
  it("[LCD1] addMonths clamps to month end", () => {
    expect(CD.addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(CD.addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(CD.addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(CD.addMonths("2026-10-31", -1)).toBe("2026-09-30");
  });
  it("[LCD2] mondayOf", () => {
    expect(CD.mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(CD.mondayOf("2026-10-26")).toBe("2026-10-26");
  });
  it("[LCD3] formats", () => {
    expect(CD.formatYearMonthDay("2026-09-30")).toBe("2026年 9月30日");
    expect(CD.formatMonthDay("2026-09-11")).toBe("9/11");
  });
  it("[LCD4] addDays / monthFirst / jsWeekday", () => {
    expect(CD.addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(CD.addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(CD.monthFirst("2026-09-30")).toBe("2026-09-01");
    expect(CD.jsWeekday("2026-09-14")).toBe(1);
    expect(CD.jsWeekday("2026-11-01")).toBe(0);
  });
});

describe("SemesterRollover", () => {
  const A = sem("A", "2026-04-01", "2026-09-30", "2026 前期");
  const B = sem("B", "2026-10-01", "2027-03-31", "2026 後期");
  it("[LR1] latest", () => {
    expect(SR.latest([A, B])?.id).toBe("B");
    expect(SR.latest([B, A])?.id).toBe("B");
    expect(SR.latest([])).toBeNull();
  });
  it("[LR2] latest: endDate desc", () => {
    expect(SR.latest([A, sem("Z", "2026-04-01", "2026-12-31")])?.id).toBe("Z");
  });
  it("[LR3] latest: id asc tiebreak", () => {
    const A0 = sem("A0", "2026-04-01", "2026-09-30");
    expect(SR.latest([A, A0])?.id).toBe("A");
    expect(SR.latest([A0, A])?.id).toBe("A");
  });
  it("[LR4] allEnded", () => {
    expect(SR.allEnded([A], "2026-10-01")).toBe(true);
    expect(SR.allEnded([A], "2026-09-30")).toBe(false);
    expect(SR.allEnded([A, B], "2026-10-01")).toBe(false);
    expect(SR.allEnded([], "2026-10-01")).toBe(false);
  });
  it("[LR5] promptTarget with dismissed", () => {
    expect(SR.promptTarget([A], "2026-10-01", null)?.id).toBe("A");
    expect(SR.promptTarget([A], "2026-10-01", "A")).toBeNull();
    expect(SR.promptTarget([A], "2026-10-01", "zzz")?.id).toBe("A");
  });
  it("[LR6] promptTarget", () => {
    expect(SR.promptTarget([A, B], "2026-10-01", null)).toBeNull();
    expect(SR.promptTarget([], "2026-10-01", null)).toBeNull();
    expect(SR.promptTarget([A, B], "2027-04-01", "A")?.id).toBe("B");
  });
  it("[LR7] promptTarget at JST boundary", () => {
    expect(SR.promptTarget([A], SchoolClock.todayString(new Date("2026-09-30T14:59:00Z")), null)).toBeNull();
    expect(SR.promptTarget([A], SchoolClock.todayString(new Date("2026-09-30T15:00:00Z")), null)?.id).toBe("A");
  });
  it("[LR8] proposal after A", () => {
    expect(SR.proposal(A, "2026-10-01")).toEqual({ name: "2026 後期", startDate: "2026-10-01", endDate: "2027-03-31" });
  });
  it("[LR9] proposal after B", () => {
    expect(SR.proposal(B, "2027-04-05")).toEqual({ name: "2027 前期", startDate: "2027-04-01", endDate: "2027-09-30" });
  });
  it("[LR10] proposal neglected", () => {
    expect(SR.proposal(sem("x", "2025-04-01", "2025-09-30"), "2026-10-07")).toEqual({
      name: "2026 後期", startDate: "2026-10-01", endDate: "2027-03-31",
    });
  });
  it("[LR11] proposal Aug 31", () => {
    expect(SR.proposal(sem("x", "2026-04-01", "2026-08-31"), "2026-09-01")).toEqual({
      name: "2026 前期", startDate: "2026-09-01", endDate: "2027-02-28",
    });
  });
  it("[LR12] proposal month-end start", () => {
    expect(SR.proposal(sem("x", "2026-04-01", "2026-08-30"), "2026-08-31")).toEqual({
      name: "2026 前期", startDate: "2026-08-31", endDate: "2027-02-27",
    });
  });
  it("[LR13] proposal Feb", () => {
    expect(SR.proposal(sem("x", "2026-08-01", "2027-01-31"), "2027-02-01")).toEqual({
      name: "2027 後期", startDate: "2027-02-01", endDate: "2027-07-31",
    });
  });
  it("[LR14] alertMessage", () => {
    expect(SR.alertMessage(A)).toBe("「2026 前期」は 2026年 9月30日 に終了しました。新しい学期を作成しますか?");
  });
  it("[LR15] canCreate", () => {
    expect(SR.canCreate(" ", "2026-10-01", "2027-03-31")).toBe(false);
    expect(SR.canCreate("x", "2027-04-01", "2027-03-31")).toBe(false);
    expect(SR.canCreate("x", "2026-10-01", "2026-10-01")).toBe(true);
    expect(SR.canCreate(" 2026 後期 ", "2026-10-01", "2027-03-31")).toBe(true);
  });
  it("[LR16] dismissed storage", () => {
    expect(SR.DISMISSED_KEY).toBe("atender.semesterRollover.dismissedSemesterId");
    SR.writeDismissed("A");
    expect(SR.readDismissed()).toBe("A");
    expect(localStorage.getItem(SR.DISMISSED_KEY)).toBe("A");
    SR.writeDismissed(null);
    expect(SR.readDismissed()).toBeNull();
    expect(localStorage.getItem(SR.DISMISSED_KEY)).toBeNull();
  });
  it("[LR17] initialProposal", () => {
    expect(SR.initialProposal("2026-10-29")).toEqual({ name: "2026 後期", startDate: "2026-10-01", endDate: "2027-03-31" });
    expect(SR.initialProposal("2026-04-01")).toEqual({ name: "2026 前期", startDate: "2026-04-01", endDate: "2026-09-30" });
    expect(SR.initialProposal("2026-09-30")).toEqual({ name: "2026 前期", startDate: "2026-04-01", endDate: "2026-09-30" });
    expect(SR.initialProposal("2026-03-31")).toEqual({ name: "2025 後期", startDate: "2025-10-01", endDate: "2026-03-31" });
    expect(SR.initialProposal("2027-01-15")).toEqual({ name: "2026 後期", startDate: "2026-10-01", endDate: "2027-03-31" });
  });
});

describe("TimetableCarryOver", () => {
  const semA = sem("A", "2026-04-01", "2026-09-30");
  const semB = sem("B", "2026-10-01", "2027-03-31");
  const semC = sem("C", "2027-04-01", "2027-09-30");
  const slots = Array.from({ length: 8 }, (_, i) => ({ periodIndex: i + 1, label: `${i + 1}限`, startMinute: 540 + i * 60, endMinute: 590 + i * 60, isBreak: false }));
  const tt = (semesterId: string): any => ({ id: `tt-${semesterId}`, semesterId, daySlots: slots, daysOfWeek: [1, 2, 3, 4, 5, 6], meetings: [], courses: [] });
  const DEFAULT: any[] = [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }];
  it("[LC1] skips semester without timetable", () => {
    expect(CO.previousTimetable(semC, [semA, semB, semC], [tt("A")])?.id).toBe("tt-A");
  });
  it("[LC2] previous / none", () => {
    expect(CO.previousTimetable(semB, [semA, semB, semC], [tt("A")])?.id).toBe("tt-A");
    expect(CO.previousTimetable(semA, [semA, semB, semC], [tt("A")])).toBeNull();
  });
  it("[LC3] most recent / none", () => {
    expect(CO.previousTimetable(semC, [semA, semB, semC], [tt("A"), tt("B")])?.id).toBe("tt-B");
    expect(CO.previousTimetable(semC, [semA, semB, semC], [])).toBeNull();
  });
  it("[LC4] endDate desc", () => {
    const A2 = sem("A2", "2026-04-01", "2026-10-15");
    expect(CO.previousTimetable(semB, [semA, A2, semB], [tt("A"), tt("A2")])?.id).toBe("tt-A2");
  });
  it("[LC5] id asc", () => {
    const A3 = sem("A3", "2026-04-01", "2026-09-30");
    expect(CO.previousTimetable(semB, [A3, semA, semB], [tt("A3"), tt("A")])?.id).toBe("tt-A");
  });
  it("[LC6] same startDate is not a candidate", () => {
    const A2 = sem("A2", "2026-04-01", "2026-09-30");
    expect(CO.previousTimetable(semA, [semA, A2], [tt("A2")])).toBeNull();
  });
  it("[LC7] inheritedSlots", () => {
    expect(CO.inheritedSlots(tt("A"), DEFAULT)).toHaveLength(8);
    expect(CO.inheritedSlots(null, DEFAULT)).toBe(DEFAULT);
    expect(CO.inheritedSlots({ ...tt("A"), daySlots: [] }, DEFAULT)).toBe(DEFAULT);
  });
  it("[LC8] inheritedDaysOfWeek", () => {
    expect(CO.inheritedDaysOfWeek(tt("A"))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(CO.inheritedDaysOfWeek(null)).toEqual([1, 2, 3, 4, 5]);
    expect(CO.inheritedDaysOfWeek({ ...tt("A"), daysOfWeek: [] })).toEqual([1, 2, 3, 4, 5]);
    expect(CO.DEFAULT_DAYS_OF_WEEK).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("SemesterCreationPlan", () => {
  const kinds = (s: any[]) => s.map((x) => (x.kind === "copyTemplate" ? `copy(${x.templateId})` : x.kind));
  it("[LP1]", () => {
    expect(kinds(SCP.steps("onboarding", null, "T", false))).toEqual(["createSemester", "copy(T)", "setDefaultSemester", "refreshMe"]);
  });
  it("[LP2]", () => {
    expect(kinds(SCP.steps("onboarding", "s", "T", false))).toEqual(["copy(T)", "setDefaultSemester", "refreshMe"]);
    expect(kinds(SCP.steps("onboarding", "s", "T", true))).toEqual(["setDefaultSemester", "refreshMe"]);
  });
  it("[LP3]", () => {
    expect(kinds(SCP.steps("onboarding", null, null, false))).toEqual(["createSemester", "setDefaultSemester", "refreshMe"]);
  });
  it("[LP4]", () => {
    expect(kinds(SCP.steps("rollover", null, "T", false))).toEqual(["createSemester", "copy(T)", "setDefaultSemester"]);
    expect(kinds(SCP.steps("rollover", null, null, false))).toEqual(["createSemester", "setDefaultSemester"]);
  });
});

describe("TemplateImportLogic / TimetablePublishLogic", () => {
  const ttx = (meetings: number, courses: number, extra: any = {}): any => ({
    id: "ut", semesterId: "s", meetings: Array.from({ length: meetings }, (_, i) => ({ id: `m${i}` })),
    courses: Array.from({ length: courses }, (_, i) => ({ id: `c${i}` })), sourceTemplateId: null, ...extra,
  });
  it("[LI1] decide", () => {
    expect(TIL.decide(null)).toEqual({ kind: "copy" });
    expect(TIL.decide(ttx(0, 0))).toEqual({ kind: "replaceSilently" });
    expect(TIL.decide(ttx(0, 2))).toEqual({ kind: "confirmReplace", courseCount: 2 });
    expect(TIL.decide(ttx(3, 2))).toEqual({ kind: "confirmReplace", courseCount: 2 });
  });
  it("[LI2] copyInput(copy) has no replaceExisting / title", () => {
    const r: any = TIL.copyInput("s", { kind: "copy" });
    expect(r).toEqual({ semesterId: "s" });
    expect("replaceExisting" in r).toBe(false);
    expect("title" in r).toBe(false);
  });
  it("[LI3] copyInput(replace)", () => {
    expect(TIL.copyInput("s", { kind: "replaceSilently" })).toEqual({ semesterId: "s", replaceExisting: true });
    expect(TIL.copyInput("s", { kind: "confirmReplace", courseCount: 1 })).toEqual({ semesterId: "s", replaceExisting: true });
  });
  it("[LPub1] initialToggle", () => {
    expect(TPL.initialToggle(null)).toBe(false);
    expect(TPL.initialToggle(ttx(1, 1, { publishedTemplate: { id: "p", isPublic: true, title: "t" } }))).toBe(true);
    expect(TPL.initialToggle(ttx(1, 1, { publishedTemplate: { id: "p", isPublic: false, title: "t" } }))).toBe(false);
    expect(TPL.initialToggle(ttx(1, 1))).toBe(true);
    expect(TPL.initialToggle(ttx(1, 1, { sourceTemplateId: "x" }))).toBe(false);
  });
  it("[LPub2] action ON", () => {
    expect(TPL.action(true, "T", ttx(0, 0)).kind).toBe("none");
    expect(TPL.action(true, "T", ttx(1, 1))).toEqual({ kind: "publish", title: "T" });
  });
  it("[LPub3] action OFF", () => {
    expect(TPL.action(false, "T", ttx(1, 1, { publishedTemplate: { id: "p", isPublic: true } }))).toEqual({ kind: "unpublish", templateId: "p" });
    expect(TPL.action(false, "T", ttx(1, 1, { publishedTemplate: { id: "p", isPublic: false } })).kind).toBe("none");
    expect(TPL.action(false, "T", ttx(1, 1)).kind).toBe("none");
  });
});

describe("TemplateSuggestionLogic", () => {
  const meeting = (id: string, courseId = "c1", dayOfWeek = 1, startPeriodIndex = 1, periodCount = 1, room: string | null = null): any => ({ id, courseId, dayOfWeek, startPeriodIndex, periodCount, room });
  const tpl = (o: any = {}): any => ({
    id: "t", authorUserId: "a", title: "T", copyCount: 0, updatedAt: "2026-10-01T00:00:00.000Z",
    courses: [{ id: "c1", name: "数学", teacher: null }], meetings: [meeting("m1")], ...o,
  });
  it("[LS1] drops templates without meetings", () => {
    const r = TSL.visible([tpl({ id: "x", meetings: [] }), tpl({ id: "y", authorUserId: "b" })]);
    expect(r.map((t) => t.id)).toEqual(["y"]);
  });
  it("[LS2] keeps newer of same author+title", () => {
    const r = TSL.visible([tpl({ id: "o", updatedAt: "2026-10-01T00:00:00.000Z" }), tpl({ id: "n", updatedAt: "2026-10-03T00:00:00.000Z" })]);
    expect(r.map((t) => t.id)).toEqual(["n"]);
  });
  it("[LS3] tie -> larger id", () => {
    expect(TSL.visible([tpl({ id: "a" }), tpl({ id: "b" })]).map((t) => t.id)).toEqual(["b"]);
    expect(TSL.visible([tpl({ id: "b" }), tpl({ id: "a" })]).map((t) => t.id)).toEqual(["b"]);
  });
  it("[LS4] empty author not grouped", () => {
    expect(TSL.visible([tpl({ id: "a", authorUserId: "" }), tpl({ id: "b", authorUserId: "" })])).toHaveLength(2);
  });
  it("[LS5] sort copyCount desc then newer", () => {
    const r = TSL.visible([
      tpl({ id: "c3", authorUserId: "x", title: "a", copyCount: 3 }),
      tpl({ id: "c10old", authorUserId: "y", title: "b", copyCount: 10, updatedAt: "2026-10-01T00:00:00.000Z" }),
      tpl({ id: "c10new", authorUserId: "z", title: "c", copyCount: 10, updatedAt: "2026-10-05T00:00:00.000Z" }),
    ]);
    expect(r.map((t) => t.id)).toEqual(["c10new", "c10old", "c3"]);
  });
  it("[LS6] sizeText", () => {
    const t = tpl({
      courses: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: "n", teacher: null })),
      meetings: [meeting("m1", "c0", 1, 1, 5), meeting("m2", "c1", 2, 1, 4), meeting("m3", "c2", 3, 1, 3)],
    });
    expect(TSL.sizeText(t)).toBe("8科目・週12コマ");
  });
  it("[LS7] metaText", () => {
    expect(TSL.metaText(tpl({ copyCount: 12, updatedAt: "2026-10-03T00:30:00.000Z" }), null)).toBe("12人が使用・2026/10/3 更新");
  });
  it("[LS8] metaText JST date", () => {
    expect(TSL.metaText(tpl({ copyCount: 0, updatedAt: "2026-10-02T15:30:00.000Z" }), null)).toBe("2026/10/3 更新");
    expect(TSL.metaText(tpl({ copyCount: 0, updatedAt: "2026-10-02T14:59:00.000Z" }), null)).toBe("2026/10/2 更新");
  });
  it("[LS9] metaText mine", () => {
    expect(TSL.metaText(tpl({ authorUserId: "me", copyCount: 12, updatedAt: "2026-10-03T00:30:00.000Z" }), "me")).toBe("あなたが公開・12人が使用・2026/10/3 更新");
  });
  it("[LS10] no 'mine' for empty author", () => {
    expect(TSL.metaText(tpl({ authorUserId: "", copyCount: 12 }), null)).not.toContain("あなたが公開");
  });
  it("[LS11] previewRows", () => {
    const t = tpl({
      courses: [{ id: "c1", name: "数学", teacher: "山田" }, { id: "c2", name: "英語", teacher: null }],
      meetings: [
        meeting("mSun", "c1", 0, 1, 1),
        meeting("mMon2", "c1", 1, 3, 2, null),
        meeting("mUnknown", "zzz", 2, 1, 1),
        meeting("mRoom", "c2", 3, 1, 1, "A1"),
      ],
    });
    const rows = TSL.previewRows(t);
    expect(rows[rows.length - 1]!.weekday).toBe("日");
    const mon = rows.find((r) => r.id === "mMon2")!;
    expect(mon.periodText).toBe("3–4限");
    expect(mon.detail).toBe("山田");
    expect(mon.courseName).toBe("数学");
    expect(rows.find((r) => r.id === "mUnknown")!.courseName).toBe("授業");
    expect(rows.find((r) => r.id === "mRoom")!.detail).toBe("A1");
    expect(TSL.FOUND_TITLE).toBe("同じ学科の時間割が見つかりました");
  });
});

describe("CourseRuleLogic / SemesterOverviewDisplayLogic", () => {
  it("[LCR1] footnote", () => {
    expect(CRL.footnote(false, false, 70)).toBe("未設定の項目は共通の必要出席率（70%）で判定します");
    expect(CRL.footnote(true, false, 70, 80)).toBe("この科目は 80% で判定します");
    expect(CRL.footnote(false, true, 70)).toBe("この科目は回数の上限で判定します（共通の必要出席率は使いません）");
    expect(CRL.footnote(true, true, 70)).toBe("出席率と回数の厳しい方で「あと何回休めるか」を出します");
  });
  it("[LCR2] summary", () => {
    expect(CRL.summary({ requiredAttendanceRate: null, maxAbsences: null, tardiesPerAbsence: null }, 70)).toBe("共通（70%）");
    expect(CRL.summary({ requiredAttendanceRate: 80, maxAbsences: 4, tardiesPerAbsence: null }, 70)).toBe("出席率 80% ・ 欠席 4 回まで");
    expect(CRL.summary({ requiredAttendanceRate: null, maxAbsences: null, tardiesPerAbsence: 3 }, 70)).toBe("共通（70%） ・ 遅刻・早退 3 回で欠席 1 回");
  });
  it("[LSO1] requiredRate", () => {
    expect(SOD.requiredRate({ requiredAttendanceRate: 80 } as any, 70)).toBe(80);
    expect(SOD.requiredRate({} as any, 70)).toBe(70);
  });
  it("[LSO2] legacy rule", () => {
    const f = (o: any): any => ({ ...o });
    expect(SOD.courseActionText(f({ allowedAbsences: 2, remainingCount: 9, allowedAbsenceDays: 1 }))).toBe("あと2限 (1日) 休める");
    expect(SOD.courseActionTone(f({ allowedAbsences: 2, remainingCount: 9, allowedAbsenceDays: 1 }))).toBe("tertiary");
    expect(SOD.courseActionText(f({ allowedAbsences: null, remainingCount: 9 }))).toBe("—");
    expect(SOD.courseActionTone(f({ allowedAbsences: null, remainingCount: 9 }))).toBe("tertiary");
    expect(SOD.courseActionText(f({ allowedAbsences: -1, remainingCount: 9 }))).toBe("下回る見込み");
    expect(SOD.courseActionTone(f({ allowedAbsences: -1, remainingCount: 9 }))).toBe("absent");
    expect(SOD.courseActionText(f({ allowedAbsences: 9, remainingCount: 9, allowedAbsenceDays: 3 }))).toBe("残り全休OK");
    expect(SOD.courseActionTone(f({ allowedAbsences: 9, remainingCount: 9, allowedAbsenceDays: 3 }))).toBe("accent");
    expect(SOD.courseActionText(f({ allowedAbsences: 2, remainingCount: 9, allowedAbsenceDays: null }))).toBe("あと2限休める");
  });
  it("[LSO3] new rule over limit", () => {
    expect(SOD.courseActionText({ allowedAbsenceLessons: -1, limitedBy: "count", remainingLessons: 5 } as any)).toBe("欠席上限を超えています");
    expect(SOD.courseActionTone({ allowedAbsenceLessons: -1, limitedBy: "count", remainingLessons: 5 } as any)).toBe("absent");
    expect(SOD.courseActionText({ allowedAbsenceLessons: -1, limitedBy: "rate", remainingLessons: 5 } as any)).toBe("下回る見込み");
    expect(SOD.courseActionTone({ allowedAbsenceLessons: -1, limitedBy: "rate", remainingLessons: 5 } as any)).toBe("absent");
  });
  it("[LSO4] new rule", () => {
    expect(SOD.courseActionText({ allowedAbsenceLessons: 5, remainingLessons: 3 } as any)).toBe("残り全休OK");
    expect(SOD.courseActionTone({ allowedAbsenceLessons: 5, remainingLessons: 3 } as any)).toBe("accent");
    expect(SOD.courseActionText({ allowedAbsenceLessons: 0, remainingLessons: 10 } as any)).toBe("あと0回休める");
    expect(SOD.courseActionTone({ allowedAbsenceLessons: 0, remainingLessons: 10 } as any)).toBe("tertiary");
    expect(SOD.courseActionText({ allowedAbsenceLessons: 2, remainingLessons: 9 } as any)).toBe("あと2回休める");
    expect(SOD.courseActionText({ allowedAbsenceLessons: 0 } as any)).toBe("残り全休OK");
  });
});

describe("TimetableGridLayout", () => {
  it("[LG1] currentPeriodIndex", () => {
    for (const [m, e] of [[539, null], [540, 1], [629, 1], [630, null], [635, null]] as const) {
      expect(TGL.currentPeriodIndex(RTL.DEFAULT_SLOTS, m)).toBe(e);
    }
  });
});

describe("RoomTimetableLogic", () => {
  const rm = (o: any = {}): any => ({ userId: "u1", timetableId: "t1", courseId: "c1", courseName: "Math", courseColor: "#123", dayOfWeek: 3, startPeriodIndex: 1, periodCount: 2, ...o });
  const week = (recurringMeetings: any[], members: any[] = [{ userId: "u1", name: "Alice", handle: null, image: null, color: "#0f0" }]): any => ({
    weekStart: "2026-10-26", weekEnd: "2026-11-01", members, meetings: [], recurringMeetings,
  });
  it("[LRM1] DEFAULT_SLOTS", () => {
    expect(RTL.DEFAULT_SLOTS).toHaveLength(5);
    expect(RTL.DEFAULT_SLOTS.map((s) => s.startMinute)).toEqual([540, 640, 780, 880, 980]);
    expect(RTL.DEFAULT_SLOTS.map((s) => s.endMinute)).toEqual([630, 730, 870, 970, 1070]);
    expect(RTL.DEFAULT_SLOTS[0]!.label).toBe("1限");
    expect(RTL.DEFAULT_SLOTS[0]!.isBreak).toBe(false);
  });
  it("[LRM2] basic mapping", () => {
    const r = RTL.buildRecurringEvents(week([rm()]));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ dayOfWeek: 3, startPeriodIndex: 1, periodCount: 2, color: "#123", title: "Math", subtitle: "Alice", mergeKey: "u1:c1", id: "u1:c1:3:1" });
  });
  it("[LRM3] dayOfWeek 0 -> 7", () => {
    const d = (n: number) => RTL.buildRecurringEvents(week([rm({ dayOfWeek: n })]))[0]!.dayOfWeek;
    expect([d(0), d(1), d(6)]).toEqual([7, 1, 6]);
  });
  it("[LRM4] color fallback", () => {
    expect(RTL.buildRecurringEvents(week([rm({ courseColor: null })]))[0]!.color).toBe("#0f0");
    expect(RTL.buildRecurringEvents(week([rm({ courseColor: null })], []))[0]!.color).toBe("#F97316");
  });
  it("[LRM5] subtitle fallback", () => {
    const m = (name: any, handle: any) => [{ userId: "u1", name, handle, image: null, color: "#0f0" }];
    expect(RTL.buildRecurringEvents(week([rm()], m(null, "al")))[0]!.subtitle).toBe("al");
    expect(RTL.buildRecurringEvents(week([rm()], m(null, null)))[0]!.subtitle).toBe("No name");
  });
  it("[LRM6] different members same slot kept", () => {
    const r = RTL.buildRecurringEvents(week([rm({ userId: "u1", courseId: "cy", dayOfWeek: 3, startPeriodIndex: 2 }), rm({ userId: "u2", courseId: "cz", dayOfWeek: 3, startPeriodIndex: 2 })]));
    expect(r.map((e) => e.id)).toEqual(["u1:cy:3:2", "u2:cz:3:2"]);
  });
  it("[LRM7] duplicate key first wins", () => {
    const r = RTL.buildRecurringEvents(week([rm({ courseName: "First" }), rm({ courseName: "Second" })]));
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe("First");
  });
  it("[LRM8] periodCount 0 -> 1", () => {
    expect(RTL.buildRecurringEvents(week([rm({ periodCount: 0 })]))[0]!.periodCount).toBe(1);
  });
  it("[LRM9] sorted by day", () => {
    const r = RTL.buildRecurringEvents(week([rm({ dayOfWeek: 5, courseId: "a" }), rm({ dayOfWeek: 1, courseId: "b" }), rm({ dayOfWeek: 3, courseId: "c" })]));
    expect(r.map((e) => e.dayOfWeek)).toEqual([1, 3, 5]);
  });
  it("[LRM10] resolveDaySlots", () => {
    const slots = (n: number) => [{ periodIndex: 1, label: `s${n}`, startMinute: 0, endMinute: 10, isBreak: false }];
    const t = (id: string, semesterId: string, daySlots: any[]): any => ({ id, semesterId, daySlots });
    const tts = [t("t1", "first", slots(0)), t("t2", "pref", slots(1)), t("t3", "def", slots(2))];
    expect(RTL.resolveDaySlots({ preferredSemesterId: "pref", defaultSemesterId: "def", timetables: tts })[0]!.label).toBe("s1");
    expect(RTL.resolveDaySlots({ preferredSemesterId: null, defaultSemesterId: "def", timetables: tts })[0]!.label).toBe("s2");
    expect(RTL.resolveDaySlots({ preferredSemesterId: "nope", defaultSemesterId: "nope2", timetables: tts })[0]!.label).toBe("s0");
    expect(RTL.resolveDaySlots({ preferredSemesterId: null, defaultSemesterId: null, timetables: [] })).toEqual(RTL.DEFAULT_SLOTS);
    expect(RTL.resolveDaySlots({ preferredSemesterId: "pref", defaultSemesterId: null, timetables: [t("t", "pref", [])] })).toEqual(RTL.DEFAULT_SLOTS);
  });
  it("[LRM11] parseInviteCode", () => {
    expect(RTL.parseInviteCode("https://atender.appily.run/rooms/join/abc")).toBe("abc");
    expect(RTL.parseInviteCode(" abc ")).toBe("abc");
    expect(RTL.parseInviteCode("https://atender.appily.run/rooms/join/abc/")).toBe("abc");
  });
  it("[LRM12] displayDays", () => {
    expect(RTL.displayDays([])).toEqual([1, 2, 3, 4, 5]);
    expect(RTL.displayDays([{ dayOfWeek: 6 }, { dayOfWeek: 7 }] as any)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("TodayTimeline / NowNextText / HomeAttendance", () => {
  const occ = (id: string, periodIndex: number, startMinute: number, endMinute: number, extra: any = {}): any => ({
    id, periodIndex, startMinute, endMinute, courseName: id === "o1" ? "数学" : "科目", room: null, status: null, ...extra,
  });
  const o1 = occ("o1", 1, 540, 630), o2 = occ("o2", 2, 640, 730), o3 = occ("o3", 3, 780, 870);
  const all = [o1, o2, o3];
  const desc = (s: any) => ({ kind: s.kind, id: (s.current ?? s.next ?? s.last)?.id, next: s.kind === "inClass" ? s.next?.id ?? null : undefined });
  it("[LT1]", () => expect(TT.state([], 500).kind).toBe("noClass"));
  it("[LT2]", () => {
    expect(desc(TT.state(all, 480))).toMatchObject({ kind: "upcoming", id: "o1" });
    expect(desc(TT.state(all, 540))).toMatchObject({ kind: "inClass", id: "o1", next: "o2" });
    expect(desc(TT.state(all, 600))).toMatchObject({ kind: "inClass", id: "o1", next: "o2" });
    expect(desc(TT.state(all, 630))).toMatchObject({ kind: "upcoming", id: "o2" });
  });
  it("[LT3]", () => {
    expect(desc(TT.state(all, 735))).toMatchObject({ kind: "upcoming", id: "o3" });
    expect(desc(TT.state(all, 780))).toMatchObject({ kind: "inClass", id: "o3", next: null });
    expect(desc(TT.state(all, 870))).toMatchObject({ kind: "finished", id: "o3" });
    expect(desc(TT.state(all, 1000))).toMatchObject({ kind: "finished", id: "o3" });
  });
  it("[LT4] input order irrelevant", () => {
    const rev = [...all].reverse();
    for (const m of [480, 540, 600, 630, 735, 780, 870, 1000]) {
      expect(desc(TT.state(rev, m))).toEqual(desc(TT.state(all, m)));
    }
  });
  it("[LT5] single", () => {
    expect(TT.state([o1], 100).kind).toBe("upcoming");
    const mid: any = TT.state([o1], 600);
    expect(mid.kind).toBe("inClass");
    expect(mid.next).toBeNull();
    expect(TT.state([o1], 700).kind).toBe("finished");
  });
  it("[LT6] overlap -> first", () => {
    const a = occ("a", 1, 540, 630), b = occ("b", 2, 560, 650);
    const s: any = TT.state([b, a], 600);
    expect(s.kind).toBe("inClass");
    expect(s.current.id).toBe("a");
  });
  it("[LT7] isStale", () => {
    expect(TT.isStale(null, new Date("2026-07-17T00:00:00Z"))).toBe(true);
    expect(TT.isStale("2026-07-17", new Date("2026-07-16T23:00:00Z"))).toBe(false);
    expect(TT.isStale("2026-07-17", new Date("2026-07-17T15:00:00Z"))).toBe(true);
  });
  it("[LN1] noClass", () => {
    const s: any = { kind: "noClass" };
    expect([TT.NowNextText.statusLabel(s), TT.NowNextText.title(s), TT.NowNextText.detail(s)]).toEqual([null, null, null]);
  });
  it("[LN2] upcoming", () => {
    const s: any = { kind: "upcoming", next: occ("e", 3, 780, 870, { courseName: "英語", room: "A302" }) };
    expect(TT.NowNextText.statusLabel(s)).toBe("次の授業");
    expect(TT.NowNextText.title(s)).toBe("3限 英語");
    expect(TT.NowNextText.detail(s)).toBe("13:00 · A302");
  });
  it("[LN3] inClass", () => {
    const s: any = { kind: "inClass", current: occ("d", 1, 540, 630, { courseName: "情報デザイン", room: "B201" }), next: null };
    expect(TT.NowNextText.statusLabel(s)).toBe("授業中");
    expect(TT.NowNextText.title(s)).toBe("1限 情報デザイン");
    expect(TT.NowNextText.detail(s)).toBe("09:00–10:30 · B201");
  });
  it("[LN4] empty room", () => {
    for (const room of [null, ""]) {
      expect(TT.NowNextText.detail({ kind: "upcoming", next: occ("e", 3, 780, 870, { room }) } as any)).toBe("13:00");
    }
  });
  it("[LN5] finished", () => {
    const s: any = { kind: "finished", last: o3 };
    expect(TT.NowNextText.statusLabel(s)).toBe("本日終了");
    expect(TT.NowNextText.title(s)).toBe("今日の授業は終わりました");
    expect(TT.NowNextText.detail(s)).toBeNull();
  });
  it("[LHA1] isActive", () => {
    expect(TT.HomeAttendance.isActive([])).toBe(false);
    expect(TT.HomeAttendance.isActive([o1])).toBe(true);
  });
  it("[LHA2] defaultExpanded / unrecordedCount", () => {
    const p = (id: string) => occ(id, 1, 0, 1, { status: "PRESENT" });
    expect(TT.HomeAttendance.defaultExpanded([o1, o2])).toBe(true);
    expect(TT.HomeAttendance.defaultExpanded([p("a"), p("b")])).toBe(false);
    expect(TT.HomeAttendance.defaultExpanded([p("a"), o1])).toBe(true);
    expect(TT.HomeAttendance.defaultExpanded([])).toBe(false);
    expect(TT.unrecordedCount([p("a"), o1, o2])).toBe(2);
  });
  it("[LHA3] shouldCollapse", () => {
    expect(TT.HomeAttendance.DRAG_THRESHOLD).toBe(40);
    expect(TT.HomeAttendance.shouldCollapse(41, 0)).toBe(true);
    expect(TT.HomeAttendance.shouldCollapse(40, 0)).toBe(false);
    expect(TT.HomeAttendance.shouldCollapse(-41, 0)).toBe(false);
    expect(TT.HomeAttendance.shouldCollapse(41, 50)).toBe(false);
  });
  it("[LHA4] shouldExpand", () => {
    expect(TT.HomeAttendance.shouldExpand(-41, 0)).toBe(true);
    expect(TT.HomeAttendance.shouldExpand(-40, 0)).toBe(false);
    expect(TT.HomeAttendance.shouldExpand(41, 0)).toBe(false);
  });
});

describe("ClassTransferLogic", () => {
  const course = (id: string, name: string) => ({ id, name, teacher: null, color: null, note: null });
  const mtg = (id: string, courseId: string, dayOfWeek: number, startPeriodIndex: number, periodCount = 1): any => ({ id, courseId, dayOfWeek, startPeriodIndex, periodCount, room: null });
  const mF1 = mtg("mF1", "cF1", 5, 1), mF2 = mtg("mF2", "cF2", 5, 3, 2), mM1 = mtg("mM1", "cM1", 1, 1), mM2 = mtg("mM2", "cM2", 1, 5);
  const tt: any = {
    id: "tt", semesterId: "s", daySlots: [], daysOfWeek: [1, 2, 3, 4, 5],
    courses: [course("cF1", "F1科目"), course("cF2", "F2科目"), course("cM1", "M1科目"), course("cM2", "M2科目")],
    meetings: [mF1, mF2, mM1, mM2],
  };
  const target = "2026-09-14";
  const occ = (id: string, courseId: string, courseName: string, periodIndex: number, extra: any = {}): any => ({
    id, courseId, courseName, periodIndex, date: target, status: null, transferId: null, ...extra,
  });
  const oM1 = occ("oM1", "cM1", "M1科目", 1), oM2 = occ("oM2", "cM2", "M2科目", 5);
  it("[LCT0] groupPeriods", () => {
    expect(CTL.groupPeriods([4, 3, 6, 3])).toEqual([{ start: 3, count: 2 }, { start: 6, count: 1 }]);
  });
  it("[LCT1] defaultSourceDay", () => {
    expect(CTL.defaultSourceDay(target, [mtg("a", "c", 5, 1), mtg("b", "c", 1, 1)])).toBe(5);
    expect(CTL.defaultSourceDay(target, [mtg("b", "c", 1, 1)])).toBeNull();
    expect(CTL.defaultSourceDay(target, [mtg("a", "c", 3, 1), mtg("b", "c", 5, 1)])).toBe(3);
  });
  it("[LCT2] defaultSourceDate", () => {
    expect(CTL.defaultSourceDate(target, 5, "2026-04-06")).toBe("2026-09-11");
    expect(CTL.defaultSourceDate("2026-04-07", 5, "2026-04-06")).toBe("2026-04-10");
  });
  it("[LCT3] previewMoveDay", () => {
    const rows = CTL.previewMoveDay(target, 5, tt, [oM1, oM2]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ periodIndex: 1, periodCount: 1, courseName: "F1科目", replaces: "月曜 1限 M1科目 を置き換え" });
    expect(rows[0]!.blockedBy ?? null).toBeNull();
    expect(rows[1]).toMatchObject({ periodIndex: 3, periodCount: 2, courseName: "F2科目" });
    expect(rows[1]!.replaces ?? null).toBeNull();
    expect(CTL.canSubmit(rows)).toBe(true);
  });
  it("[LCT4] blockedBy", () => {
    const rows = CTL.previewMoveDay(target, 5, tt, [occ("ot", "cM1", "M1科目", 1, { transferId: "t" })]);
    expect(rows[0]!.blockedBy).toBe("既に授業変更があります");
    expect(CTL.canSubmit(rows)).toBe(false);
  });
  it("[LCT5] previewSingle", () => {
    const rows = CTL.previewSingle([3, 4, 6], "cF1", tt, [oM2]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => (r.replaces ?? null) === null)).toBe(true);
    expect(CTL.previewSingle([], "cF1", tt, [])).toEqual([]);
    expect(CTL.canSubmit([])).toBe(false);
  });
  it("[LCT6] summary", () => {
    const mv: any = { id: "t", kind: "MOVE_DAY", sourceDayOfWeek: 5, sourceDate: "2026-09-11" };
    const three = [oM1, oM2, occ("x", "cM1", "x", 2)];
    expect(CTL.summary(mv, three)).toBe("金曜日の時間割 (3コマ) · 9/11(金) を休講");
    expect(CTL.summary({ ...mv, sourceDate: null }, three)).toBe("金曜日の時間割 (3コマ)");
    const sg: any = { id: "t", kind: "SINGLE", sourceDayOfWeek: null, sourceDate: null };
    expect(CTL.summary(sg, [occ("a", "c", "情報数学", 3), occ("b", "c", "情報数学", 4)])).toBe("情報数学 3-4限");
  });
  it("[LCT7] needsDeleteConfirmation", () => {
    const t1: any = { id: "t1" };
    expect(CTL.needsDeleteConfirmation(t1, [
      occ("a", "c", "c", 1, { transferId: "t1", status: "PRESENT" }),
      occ("b", "c", "c", 2, { transferId: "t1", status: null }),
      occ("c", "c", "c", 3, { transferId: "other", status: "ABSENT" }),
    ])).toBe(1);
  });
});
