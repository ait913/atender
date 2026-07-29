/**
 * Reviewer blind tests — .designs/20260729-semester-calendar-multi-status.md §5.1 (S1〜S14)
 * 設計docのみを根拠に生成。実装コードは参照していない。
 */
import { describe, expect, it } from "vitest";
import { AttendanceDaySummary } from "@atender/shared";
import { app, prisma } from "./helpers/app";
import { createOccurrence, setupCompleteUser } from "./helpers/auth";
import { json } from "./helpers/http";

type Counts = {
  present: number;
  absent: number;
  excused: number;
  tardy: number;
  earlyLeave: number;
  suspended: number;
  unrecorded: number;
};

const ZERO: Counts = {
  present: 0,
  absent: 0,
  excused: 0,
  tardy: 0,
  earlyLeave: 0,
  suspended: 0,
  unrecorded: 0,
};

const DATE = "2026-05-13";
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function overview(semesterId: string, cookie: string) {
  const res = await app.request(`/api/semesters/${semesterId}/overview`, { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  return (await json(res)) as any;
}

function day(body: any, iso: string) {
  const found = (body.days as any[]).find((d) => d.date === iso);
  expect(found, `day ${iso} missing from overview.days`).toBeTruthy();
  return found;
}

/** occurrence を N 件作り、status[i] が null でなければ AttendanceRecord を付ける */
async function seedDay(
  db: any,
  complete: Awaited<ReturnType<typeof setupCompleteUser>>,
  iso: string,
  statuses: Array<string | null>,
  courseId?: string,
  meetingId?: string,
) {
  const created: any[] = [];
  for (let i = 0; i < statuses.length; i += 1) {
    const occ = await createOccurrence(db, {
      meetingId: meetingId ?? complete.meeting.id,
      courseId: courseId ?? complete.course.id,
      date: D(iso),
      periodOffset: i,
      startMinute: 540 + i * 100,
      endMinute: 630 + i * 100,
    });
    created.push(occ);
    const status = statuses[i];
    if (status) {
      await db.attendanceRecord.create({
        data: { occurrenceId: occ.id, userId: complete.user.id, status },
      });
    }
  }
  return created;
}

describe("[§5.1] semester overview の日別 counts", () => {
  it("[S1] 1 日 2 件・両方 PRESENT → present:2 / occurrenceCount:2", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, ["PRESENT", "PRESENT"]);

    const d = day(await overview(c.semester.id, c.cookie), DATE);
    expect(d.counts).toEqual({ ...ZERO, present: 2 });
    expect(d.occurrenceCount).toBe(2);
  });

  it("[S2] PRESENT×3 + ABSENT×1 → present:3 / absent:1、status は HAS_ABSENT のまま", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, ["PRESENT", "PRESENT", "PRESENT", "ABSENT"]);

    const d = day(await overview(c.semester.id, c.cookie), DATE);
    expect(d.counts.present).toBe(3);
    expect(d.counts.absent).toBe(1);
    expect(d.status).toBe("HAS_ABSENT");
  });

  it("[S3] EXCUSED×1 + PRESENT×1 → excused:1 / present:1、status は ALL_PRESENT (legacy の穴は塞がない)", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, ["EXCUSED", "PRESENT"]);

    const d = day(await overview(c.semester.id, c.cookie), DATE);
    expect(d.counts.excused).toBe(1);
    expect(d.counts.present).toBe(1);
    expect(d.status).toBe("ALL_PRESENT");
  });

  it("[S4] EXCUSED のみ 1 件 → excused:1 で他 0、status === ALL_PRESENT", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, ["EXCUSED"]);

    const d = day(await overview(c.semester.id, c.cookie), DATE);
    expect(d.counts).toEqual({ ...ZERO, excused: 1 });
    expect(d.status).toBe("ALL_PRESENT");
  });

  it("[S5] TARDY×1 + EARLY_LEAVE×1 → サーバは合算しない (tardy:1 / earlyLeave:1)", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, ["TARDY", "EARLY_LEAVE"]);

    const d = day(await overview(c.semester.id, c.cookie), DATE);
    expect(d.counts.tardy).toBe(1);
    expect(d.counts.earlyLeave).toBe(1);
  });

  it("[S6] 時間割休講の日 (occurrence 2 件) → suspended:2 / unrecorded:0 / ALL_SUSPENDED", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, [null, null]);
    await db.timetableSuspension.create({
      data: { userTimetableId: c.userTimetable.id, date: D(DATE) },
    });

    const d = day(await overview(c.semester.id, c.cookie), DATE);
    expect(d.counts.suspended).toBe(2);
    expect(d.counts.unrecorded).toBe(0);
    expect(d.status).toBe("ALL_SUSPENDED");
  });

  it("[S7] 科目休講の occurrence 1 件 + 別科目の PRESENT 1 件 → suspended:1 / present:1", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    const course2 = await db.course.create({
      data: { userTimetableId: c.userTimetable.id, name: "データベース", teacher: "佐藤", color: "#eeeeee" },
    });
    const meeting2 = await db.meeting.create({
      data: {
        userTimetableId: c.userTimetable.id,
        courseId: course2.id,
        dayOfWeek: 3,
        startPeriodIndex: 3,
        periodCount: 1,
        room: "306",
      },
    });

    await seedDay(db, c, DATE, [null]);
    await db.courseSuspension.create({ data: { courseId: c.course.id, date: D(DATE) } });
    await seedDay(db, c, DATE, ["PRESENT"], course2.id, meeting2.id);

    const d = day(await overview(c.semester.id, c.cookie), DATE);
    expect(d.counts.suspended).toBe(1);
    expect(d.counts.present).toBe(1);
  });

  it("[S8] 記録が無い occurrence 3 件 → unrecorded:3 で他 0、PARTIAL_UNRECORDED", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, [null, null, null]);

    const d = day(await overview(c.semester.id, c.cookie), DATE);
    expect(d.counts).toEqual({ ...ZERO, unrecorded: 3 });
    expect(d.status).toBe("PARTIAL_UNRECORDED");
  });

  it("[S9] CANCELLED 記録 1 件 → suspended:1 (cancelled という別枠は作らない)", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, ["CANCELLED"]);

    const d = day(await overview(c.semester.id, c.cookie), DATE);
    expect(d.counts.suspended).toBe(1);
    expect(Object.keys(d.counts).sort()).toEqual(
      ["absent", "earlyLeave", "excused", "present", "suspended", "tardy", "unrecorded"],
    );
  });

  it("[S10] 学期範囲内で occurrence 0 件の日 → counts 全 0 / occurrenceCount 0 / NO_CLASS", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, ["PRESENT"]);

    const d = day(await overview(c.semester.id, c.cookie), "2026-05-14");
    expect(d.counts).toEqual(ZERO);
    expect(d.occurrenceCount).toBe(0);
    expect(d.status).toBe("NO_CLASS");
  });

  it("[S11] 不変条件: counts の総和 === occurrenceCount (全日)", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, ["PRESENT", "ABSENT", "EXCUSED", "TARDY"]);
    await seedDay(db, c, "2026-05-20", ["EARLY_LEAVE", "CANCELLED", null]);
    await db.timetableSuspension.create({
      data: { userTimetableId: c.userTimetable.id, date: D("2026-05-27") },
    });
    await seedDay(db, c, "2026-05-27", [null, null]);

    const body = await overview(c.semester.id, c.cookie);
    for (const d of body.days as any[]) {
      const sum =
        d.counts.present +
        d.counts.absent +
        d.counts.excused +
        d.counts.tardy +
        d.counts.earlyLeave +
        d.counts.suspended +
        d.counts.unrecorded;
      expect(sum, `mismatch on ${d.date}`).toBe(d.occurrenceCount);
    }
  });

  it("[S12] 未来日の EXCUSED もサーバは過去日と同じく excused:1 を返す", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayIso = jstNow.toISOString().slice(0, 10);
    const futureIso = new Date(jstNow.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const startIso = new Date(jstNow.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endIso = new Date(jstNow.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await db.semester.update({
      where: { id: c.semester.id },
      data: { startDate: D(startIso), endDate: D(endIso) },
    });

    await seedDay(db, c, futureIso, ["EXCUSED"]);

    const body = await overview(c.semester.id, c.cookie);
    expect(futureIso > todayIso).toBe(true);
    const d = day(body, futureIso);
    expect(d.counts.excused).toBe(1);
    expect(d.occurrenceCount).toBe(1);
  });

  it("[S13] overall / courses / toDate / allowedAbsences は本変更で値が変わらない", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    // 過去日に 4 件 (PRESENT×3 + ABSENT×1)
    await seedDay(db, c, "2026-04-08", ["PRESENT", "PRESENT"]);
    await seedDay(db, c, "2026-04-15", ["PRESENT", "ABSENT"]);

    const body = await overview(c.semester.id, c.cookie);
    expect(body.overall).toBeTruthy();
    expect(Array.isArray(body.courses)).toBe(true);
    expect(body.overall.effectiveDenominator).toBe(4);
    expect(body.overall.attendanceRate).toBeCloseTo(0.75);
    expect(body.courses[0].toDate).toBeTruthy();
    expect(body.courses[0].toDate.effectiveDenominator).toBe(4);
    expect(body.courses[0]).toHaveProperty("allowedAbsences");
  });

  it("[S14] days[] の各要素が AttendanceDaySummary (counts 必須) として zod parse を通る", async () => {
    const db = prisma() as any;
    const c = await setupCompleteUser(db);
    await seedDay(db, c, DATE, ["PRESENT", "ABSENT"]);

    const body = await overview(c.semester.id, c.cookie);
    for (const d of body.days as any[]) {
      expect(() => AttendanceDaySummary.parse(d)).not.toThrow();
    }
  });

  it("[S14b] counts を欠く day summary は zod parse に失敗する (counts は必須)", () => {
    const withoutCounts = { date: "2026-05-13", status: "ALL_PRESENT", occurrenceCount: 1 };
    expect(AttendanceDaySummary.safeParse(withoutCounts).success).toBe(false);
  });
});
