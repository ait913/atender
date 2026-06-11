import { describe, expect, it } from "vitest";
import { computeCourseStats } from "../src/services/attendanceStats";
import { prisma } from "./helpers/app";
import { createOccurrence, setupCompleteUser } from "./helpers/auth";

/**
 * 設計doc: 20260611-occurrence-based-denominator.md
 * 母数 (denominator) を totalSessions(手入力) から occurrence 実数ベースへ統一する検証。
 *
 * 正準定義:  denominator = max(0, occurrences.length - denominatorReduction)
 * 主張(等式): denominator === fixedDenAll + floatingPast + floatingFuture (= 旧 projectedDen)
 *
 * すべて now 固定・requiredAttendanceRate 明示。fixture は totalSessions を渡さない
 * (schema から削除済)。occurrence の件数だけが母数を決める。
 */

type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "TARDY" | "EARLY_LEAVE" | "CANCELLED" | null;

const NOW = new Date("2026-06-08T03:00:00.000Z");

// occurrence を date 指定で並べ、status があれば記録を作る汎用シナリオ。
// occurrences.length === statuses.length が保証される。
async function scenario(args: {
  statuses: AttendanceStatus[];
  dates: string[];
  requiredAttendanceRate: number;
  now?: Date;
  excusedStrategy?: "REDUCE_DENOMINATOR" | "SEPARATE_COUNT" | "COUNT_AS_PRESENT" | "COUNT_AS_ABSENT" | "HALF_PRESENT";
}) {
  const db = prisma();
  const complete = await setupCompleteUser(db);

  if (args.excusedStrategy) {
    await db.attendanceRule.create({
      data: {
        schoolId: complete.school.id,
        departmentId: complete.department.id,
        userId: complete.user.id,
        excusedStrategy: args.excusedStrategy,
        tardyStrategy: "HALF_PRESENT",
        earlyLeaveStrategy: "HALF_PRESENT",
      },
    });
  }

  for (let i = 0; i < args.statuses.length; i += 1) {
    const occurrence = await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: new Date(`${args.dates[i]}T00:00:00.000Z`),
      periodOffset: i,
      startMinute: 540 + i,
      endMinute: 630 + i,
    });
    const status = args.statuses[i];
    if (status) {
      await db.attendanceRecord.create({
        data: { occurrenceId: occurrence.id, userId: complete.user.id, status },
      });
    }
  }

  const result = await computeCourseStats({
    semesterId: complete.semester.id,
    userId: complete.user.id,
    requiredAttendanceRate: args.requiredAttendanceRate,
    now: args.now ?? NOW,
  } as any);
  const courses = Array.isArray(result) ? result : (result as any).courses;
  return { ...complete, courseStats: courses[0] };
}

// 過去日付 (NOW=06-08 より前) を n 件
function pastDates(n: number) {
  // 06-01 .. 06-07 は過去。足りなければ 05 月へ。
  const base = ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29",
    "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07"];
  return base.slice(base.length - n);
}

describe("occurrence-based denominator (設計検証)", () => {
  // ── (a) #1 ★ユーザー例: 水曜2限×4日=8 occurrence・休講0・全員出席・required70 → あと2限 ──
  it("[★ユーザー例 a#1] occurrence 8件・休講0・全PRESENT・required70 → denominator=8 / rate=1.0 / allowedAbsences=2", async () => {
    const { courseStats } = await scenario({
      statuses: Array(8).fill("PRESENT" as const),
      dates: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28",
        "2026-05-29", "2026-06-01", "2026-06-02", "2026-06-03"],
      requiredAttendanceRate: 70,
    });

    expect(courseStats.effectiveDenominator).toBe(8);
    expect(courseStats.effectiveNumerator).toBe(8);
    expect(courseStats.attendanceRate).toBeCloseTo(1.0);
    // floor((1-0.7)*8 - 0 + 1e-9) = floor(2.4) = 2 (旧 totalSessions=15 ベースの 4 ではない)
    expect(courseStats.allowedAbsences).toBe(2);
    expect(courseStats.generatedOccurrences).toBe(8);
  });

  // negative control: 旧 totalSessions=15 ベースなら allowedAbsences=4 になるはず。
  // occurrence ベースでは 4 で「ない」ことを明示的に押さえる (回帰の番兵)。
  it("[★ユーザー例 negative-control] occurrence8件の allowedAbsences は旧 totalSessions=15 由来の 4 ではない", async () => {
    const { courseStats } = await scenario({
      statuses: Array(8).fill("PRESENT" as const),
      dates: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28",
        "2026-05-29", "2026-06-01", "2026-06-02", "2026-06-03"],
      requiredAttendanceRate: 70,
    });
    expect(courseStats.allowedAbsences).not.toBe(4);
    expect(courseStats.effectiveDenominator).not.toBe(15);
  });

  // ── (a) #2 休講0・全件未記録 → denominator=8 / rate=0 / allowedAbsences=2 ──
  it("[a#2] occurrence 8件・全件未記録 → denominator=8 / rate=0.0 / allowedAbsences=2", async () => {
    const { courseStats } = await scenario({
      statuses: Array(8).fill(null),
      dates: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28",
        "2026-05-29", "2026-06-01", "2026-06-02", "2026-06-03"],
      requiredAttendanceRate: 70,
    });
    expect(courseStats.effectiveDenominator).toBe(8);
    expect(courseStats.effectiveNumerator).toBe(0);
    expect(courseStats.attendanceRate).toBeCloseTo(0.0);
    // 未記録は fixedDen に入らず消化欠席0 → floor(0.3*8) = 2
    expect(courseStats.allowedAbsences).toBe(2);
  });

  // ── (a) #3 休講2件 → denominator=6 / rate=5/6 / allowedAbsences=0 ──
  it("[a#3] occurrence 8件うち休講2件・残6件 PRESENT5/ABSENT1 → denominator=6 / rate≈0.833 / allowedAbsences=0", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const dates = ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28",
      "2026-05-29", "2026-06-01", "2026-06-02", "2026-06-03"];
    // 0..5 を実授業 (PRESENT5/ABSENT1)、6,7 を休講 (CourseSuspension)
    for (let i = 0; i < 8; i += 1) {
      await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: new Date(`${dates[i]}T00:00:00.000Z`),
        periodOffset: i,
        startMinute: 540 + i,
        endMinute: 630 + i,
      });
    }
    const occs = await db.meetingOccurrence.findMany({ where: { courseId: complete.course.id }, orderBy: { date: "asc" } });
    const statuses: AttendanceStatus[] = ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT"];
    for (let i = 0; i < 6; i += 1) {
      await db.attendanceRecord.create({ data: { occurrenceId: occs[i].id, userId: complete.user.id, status: statuses[i]! } });
    }
    // 残り 2 件を休講 (CourseSuspension)
    await db.courseSuspension.create({ data: { courseId: complete.course.id, date: occs[6].date } });
    await db.courseSuspension.create({ data: { courseId: complete.course.id, date: occs[7].date } });

    const result = await computeCourseStats({
      semesterId: complete.semester.id,
      userId: complete.user.id,
      requiredAttendanceRate: 70,
      now: NOW,
    } as any);
    const courseStats = (Array.isArray(result) ? result : (result as any).courses)[0];

    expect(courseStats.counts.suspended).toBe(2);
    expect(courseStats.effectiveDenominator).toBe(6); // 8 - 2(休講)
    expect(courseStats.effectiveNumerator).toBe(5);
    expect(courseStats.attendanceRate).toBeCloseTo(5 / 6);
    // 消化欠席 = fixedDenAll(6) - fixedNumAll(5) = 1 → floor(0.3*6 - 1) = floor(0.8) = 0
    expect(courseStats.allowedAbsences).toBe(0);
  });

  // ── (a) #4 SEPARATE_COUNT → denominator=5 / rate=0.8 / allowedAbsences=1 ──
  it("[a#4] occurrence 6件 PRESENT4/SEPARATE1/未記録1 → denominator=5 / rate=0.8 / allowedAbsences=1", async () => {
    const { courseStats } = await scenario({
      statuses: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "EXCUSED", null],
      dates: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-06-01"],
      requiredAttendanceRate: 70,
      excusedStrategy: "SEPARATE_COUNT",
    });
    expect(courseStats.effectiveDenominator).toBe(5); // 6 - 1(SEPARATE)
    expect(courseStats.effectiveNumerator).toBe(4);
    expect(courseStats.attendanceRate).toBeCloseTo(0.8);
    expect(courseStats.separateCounts.EXCUSED).toBe(1);
    // floor(0.3*5 - 0) = floor(1.5) = 1
    expect(courseStats.allowedAbsences).toBe(1);
  });

  // ── (a) #5 REDUCE_DENOMINATOR(EXCUSED default) → denominator=6 / rate=1.0 / allowedAbsences=1 ──
  it("[a#5] occurrence 7件 PRESENT6/EXCUSED(REDUCE)1 → denominator=6 / rate=1.0 / allowedAbsences=1", async () => {
    const { courseStats } = await scenario({
      statuses: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "EXCUSED"],
      dates: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-06-01", "2026-06-02"],
      requiredAttendanceRate: 70,
      // EXCUSED system default = REDUCE_DENOMINATOR (rule 行なし)
    });
    expect(courseStats.effectiveDenominator).toBe(6); // 7 - 1(REDUCE)
    expect(courseStats.effectiveNumerator).toBe(6);
    expect(courseStats.attendanceRate).toBeCloseTo(1.0);
    // floor(0.3*6 - 0) = floor(1.8) = 1
    expect(courseStats.allowedAbsences).toBe(1);
  });

  // ── (a) #6 occurrence 0件 → denominator=0 / null ──
  it("[a#6] occurrence 0件(時間割未設定) → denominator=0 / rate=null / allowedAbsences=null / 0除算しない", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await db.meetingOccurrence.deleteMany({ where: { meetingId: complete.meeting.id } });

    const result = await computeCourseStats({
      semesterId: complete.semester.id,
      userId: complete.user.id,
      requiredAttendanceRate: 70,
      now: NOW,
    } as any);
    const courseStats = (Array.isArray(result) ? result : (result as any).courses)[0];

    expect(courseStats.effectiveDenominator).toBe(0);
    expect(courseStats.effectiveNumerator).toBe(0);
    expect(courseStats.attendanceRate).toBeNull();
    expect(courseStats.allowedAbsences).toBeNull();
    expect(courseStats.generatedOccurrences).toBe(0);
  });

  // ── (a) #7 全休講 → denominator=0 / null / suspended=4 ──
  it("[a#7] occurrence 4件すべて休講 → denominator=0 / rate=null / allowedAbsences=null / suspended=4", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const dates = ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28"];
    for (let i = 0; i < 4; i += 1) {
      const occ = await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: new Date(`${dates[i]}T00:00:00.000Z`),
        periodOffset: i,
        startMinute: 540 + i,
        endMinute: 630 + i,
      });
      await db.courseSuspension.create({ data: { courseId: complete.course.id, date: occ.date } });
    }

    const result = await computeCourseStats({
      semesterId: complete.semester.id,
      userId: complete.user.id,
      requiredAttendanceRate: 70,
      now: NOW,
    } as any);
    const courseStats = (Array.isArray(result) ? result : (result as any).courses)[0];

    expect(courseStats.counts.suspended).toBe(4);
    expect(courseStats.effectiveDenominator).toBe(0); // 4 - 4
    expect(courseStats.attendanceRate).toBeNull();
    expect(courseStats.allowedAbsences).toBeNull();
  });

  // ── (a) #8 ★恒等等式: denominator === occurrences.length - reduction かつ generatedOccurrences - 除外 と一致 ──
  // 複数の occurrence 構成 (記録あり/未記録/休講/SEPARATE 混在) で直接アサート。
  it.each([
    {
      label: "記録のみ(PRESENT/ABSENT)",
      statuses: ["PRESENT", "ABSENT", "PRESENT"] as AttendanceStatus[],
      dates: ["2026-05-25", "2026-05-26", "2026-05-27"],
      suspend: 0,
      excusedStrategy: undefined as any,
      expectedDen: 3, // 3 - 0
    },
    {
      label: "未記録混在",
      statuses: ["PRESENT", null, null, "ABSENT"] as AttendanceStatus[],
      dates: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28"],
      suspend: 0,
      excusedStrategy: undefined,
      expectedDen: 4, // 4 - 0
    },
    {
      label: "休講混在(#3 構成: occ8/休講2)",
      statuses: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT"] as AttendanceStatus[],
      dates: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-06-01"],
      suspend: 2,
      excusedStrategy: undefined,
      expectedDen: 6, // 8 - 2
    },
    {
      label: "SEPARATE混在",
      statuses: ["PRESENT", "PRESENT", "EXCUSED", null] as AttendanceStatus[],
      dates: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28"],
      suspend: 0,
      excusedStrategy: "SEPARATE_COUNT",
      expectedDen: 3, // 4 - 1(SEPARATE)
    },
  ])("[a#8 恒等等式] $label: denominator == occurrences.length - reduction", async (c) => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    if (c.excusedStrategy) {
      await db.attendanceRule.create({
        data: {
          schoolId: complete.school.id,
          departmentId: complete.department.id,
          userId: complete.user.id,
          excusedStrategy: c.excusedStrategy,
          tardyStrategy: "HALF_PRESENT",
          earlyLeaveStrategy: "HALF_PRESENT",
        },
      });
    }
    const occIds: string[] = [];
    for (let i = 0; i < c.statuses.length; i += 1) {
      const occ = await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: new Date(`${c.dates[i]}T00:00:00.000Z`),
        periodOffset: i,
        startMinute: 540 + i,
        endMinute: 630 + i,
      });
      occIds.push(occ.id);
      const status = c.statuses[i];
      if (status) {
        await db.attendanceRecord.create({ data: { occurrenceId: occ.id, userId: complete.user.id, status } });
      }
    }
    // suspend 件数ぶん、追加の休講 occurrence を足す
    const extraDates = ["2026-06-04", "2026-06-05"];
    for (let s = 0; s < c.suspend; s += 1) {
      const occ = await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: new Date(`${extraDates[s]}T00:00:00.000Z`),
        periodOffset: 100 + s,
        startMinute: 700 + s,
        endMinute: 790 + s,
      });
      await db.courseSuspension.create({ data: { courseId: complete.course.id, date: occ.date } });
    }

    const totalOccurrences = await db.meetingOccurrence.count({ where: { courseId: complete.course.id } });

    const result = await computeCourseStats({
      semesterId: complete.semester.id,
      userId: complete.user.id,
      requiredAttendanceRate: 70,
      now: NOW,
    } as any);
    const courseStats = (Array.isArray(result) ? result : (result as any).courses)[0];

    // generatedOccurrences は occurrence 総数 (休講含む) と一致する
    expect(courseStats.generatedOccurrences).toBe(totalOccurrences);
    // 正準定義どおりの値であることを直接アサート
    expect(courseStats.effectiveDenominator).toBe(c.expectedDen);
    // 等式: denominator === occurrences.length - denominatorReduction を逆算で確認
    const impliedReduction = totalOccurrences - courseStats.effectiveDenominator;
    expect(impliedReduction).toBe(totalOccurrences - c.expectedDen);
    // denominator は generatedOccurrences を上回らない (occurrence 実数が上限)
    expect(courseStats.effectiveDenominator).toBeLessThanOrEqual(courseStats.generatedOccurrences);
  });

  // ── (a) #9 occurrence を増やすと母数が追従 (8 -> 10) ──
  it("[a#9] occurrence を 8 → 10 件に増やして再 compute すると denominator が 8 → 10 になる", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const dates8 = ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28",
      "2026-05-29", "2026-06-01", "2026-06-02", "2026-06-03"];
    for (let i = 0; i < 8; i += 1) {
      await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: new Date(`${dates8[i]}T00:00:00.000Z`),
        periodOffset: i,
        startMinute: 540 + i,
        endMinute: 630 + i,
      });
    }
    const before = await computeCourseStats({
      semesterId: complete.semester.id,
      userId: complete.user.id,
      requiredAttendanceRate: 70,
      now: NOW,
    } as any);
    const beforeCourse = (Array.isArray(before) ? before : (before as any).courses)[0];
    expect(beforeCourse.effectiveDenominator).toBe(8);

    // 2 件追加 (未来日付)
    for (let i = 8; i < 10; i += 1) {
      await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: new Date(`2026-06-2${i - 8}T00:00:00.000Z`),
        periodOffset: i,
        startMinute: 540 + i,
        endMinute: 630 + i,
      });
    }
    const after = await computeCourseStats({
      semesterId: complete.semester.id,
      userId: complete.user.id,
      requiredAttendanceRate: 70,
      now: NOW,
    } as any);
    const afterCourse = (Array.isArray(after) ? after : (after as any).courses)[0];
    expect(afterCourse.effectiveDenominator).toBe(10);
    expect(afterCourse.generatedOccurrences).toBe(10);
  });

  // ── (a) #10 今日まで率は不変 (回帰) — toDate は occurrence ベースのまま ──
  it("[a#10 回帰] 今日まで率(toDate)は本変更で値が変わらない", async () => {
    const { courseStats } = await scenario({
      // PRESENT6/ABSENT1 (過去) + 未来未記録 1
      statuses: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT", null],
      dates: ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29",
        "2026-06-01", "2026-06-02", "2026-06-20"],
      requiredAttendanceRate: 70,
    });
    // 過去 7 件 (PRESENT6/ABSENT1) が toDate。未来 1 は除外。
    expect(courseStats.toDate.effectiveNumerator).toBe(6);
    expect(courseStats.toDate.effectiveDenominator).toBe(7);
    expect(courseStats.toDate.attendanceRate).toBeCloseTo(6 / 7);
    // 全期間 denominator は occurrence 実数 8 (未来含む)
    expect(courseStats.effectiveDenominator).toBe(8);
  });

  // ── (b) overview 集約: overall の母数も occurrence 実数 ──
  it("[b#11 overview] 単一course(occ8・休講0・全PRESENT) → overall.effectiveDenominator=8 / rate=1.0", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await (db.user.update as any)({ where: { id: complete.user.id }, data: { requiredAttendanceRate: 70 } }).catch(() => undefined);
    const dates = ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28",
      "2026-05-29", "2026-06-01", "2026-06-02", "2026-06-03"];
    for (let i = 0; i < 8; i += 1) {
      const occ = await createOccurrence(db, {
        meetingId: complete.meeting.id,
        courseId: complete.course.id,
        date: new Date(`${dates[i]}T00:00:00.000Z`),
        periodOffset: i,
        startMinute: 540 + i,
        endMinute: 630 + i,
      });
      await db.attendanceRecord.create({ data: { occurrenceId: occ.id, userId: complete.user.id, status: "PRESENT" } });
    }

    const { app } = await import("./helpers/app");
    const { json } = await import("./helpers/http");
    const res = await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: { Cookie: complete.cookie } });
    const overview = await json(res);

    expect(res.status).toBe(200);
    expect(overview.overall.effectiveDenominator).toBe(8);
    expect(overview.overall.attendanceRate).toBeCloseTo(1.0);
  });

  // ── (c) CRUD/DTO: stats レスポンスに totalSessions が含まれない / generatedOccurrences は含まれる ──
  it("[c#16] GET /api/stats の course レスポンスに totalSessions が含まれず generatedOccurrences は含まれる", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    await createOccurrence(db, {
      meetingId: complete.meeting.id,
      courseId: complete.course.id,
      date: new Date("2026-06-01T00:00:00.000Z"),
    });

    const { app } = await import("./helpers/app");
    const { json } = await import("./helpers/http");
    const res = await app.request(`/api/stats?semesterId=${complete.semester.id}`, { headers: { Cookie: complete.cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    const course = body.courses[0];
    expect(course).not.toHaveProperty("totalSessions");
    expect(course).toHaveProperty("generatedOccurrences");
  });

  // ── (c) #14 POST /api/courses が totalSessions 無しで 201 成功 ──
  it("[c#14] POST /api/courses は totalSessions 無しで course 作成成功(201)", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const { app } = await import("./helpers/app");
    const { requestJson, json } = await import("./helpers/http");
    const res = await requestJson(app, "/api/courses", {
      method: "POST",
      headers: { Cookie: complete.cookie },
      body: { userTimetableId: complete.userTimetable.id, name: "新規科目", color: "#abcdef" },
    });
    const body = await json(res);

    expect(res.status).toBe(201);
    expect(body.course).not.toHaveProperty("totalSessions");
    expect(body.course.name).toBe("新規科目");
  });
});
