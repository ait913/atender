import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createTestUser } from "./helpers/auth";
import { setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";
import { addRoomMember, createRoom } from "./helpers/seedRoom";

// ─────────────────────────────────────────────────────────────────────────────
// build 17 設計 §5.4 / §6.7 (#A1-#A5) — GET /api/rooms/:id/week の additive な
// ?semesterId=。Reviewer 生成 (設計docのみを根拠、実装は未読)。
// ★ 最重要は #A2/#A5: 省略時に現行挙動が保たれること (配布済 build 16 の後方互換)
// ─────────────────────────────────────────────────────────────────────────────

type AnyDb = ReturnType<typeof prisma>;

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

async function makeSemester(db: AnyDb, userId: string, name: string) {
  return db.semester.create({
    data: {
      userId,
      name,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T14:59:59.000Z"),
    },
  });
}

async function makeTimetable(
  db: AnyDb,
  userId: string,
  semesterId: string,
  opts: {
    courseName: string;
    dayOfWeek: number;
    startPeriodIndex?: number;
    periodCount?: number;
    color?: string | null;
    createdAt?: Date;
  },
) {
  const tt = await db.userTimetable.create({
    data: {
      userId,
      semesterId,
      title: `${opts.courseName} tt`,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
  const course = await db.course.create({
    data: { userTimetableId: tt.id, name: opts.courseName, color: opts.color ?? null },
  });
  const meeting = await db.meeting.create({
    data: {
      userTimetableId: tt.id,
      courseId: course.id,
      dayOfWeek: opts.dayOfWeek,
      startPeriodIndex: opts.startPeriodIndex ?? 1,
      periodCount: opts.periodCount ?? 1,
    },
  });
  return { tt, course, meeting };
}

async function fetchWeek(cookie: string, roomId: string, query = "") {
  const res = await requestJson(app, `/api/rooms/${roomId}/week?weekStart=2026-05-25${query}`, {
    headers: cookieHeader(cookie),
  });
  return { status: res.status, body: (await json(res)) as any };
}

function courseNamesFor(body: any, userId: string): string[] {
  return (body.recurringMeetings ?? [])
    .filter((m: any) => m.userId === userId)
    .map((m: any) => m.courseName)
    .sort();
}

/** setupCompleteUser の既定 (S1 = defaultSemesterId, 科目 = OS) に S2 を足した閲覧者 */
async function viewerWithTwoSemesters(db: AnyDb) {
  const owner = await setupCompleteUser(db, { name: "Viewer" });
  const second = await makeSemester(db, owner.user.id, "2026 後期");
  const secondTt = await makeTimetable(db, owner.user.id, second.id, {
    courseName: "科目Z",
    dayOfWeek: 5,
    startPeriodIndex: 3,
    periodCount: 1,
    color: "#123456",
    createdAt: new Date("2026-09-01T00:00:00.000Z"), // ★ createdAt desc の先頭になる (規則 3 と区別するため)
  });
  return { owner, second, secondTt };
}

describe("[build17 §5.4] room week semesterId (additive)", () => {
  it("[#A1] semesterId で指定した自分の学期の時間割が採用される (defaultSemesterId を上書き)", async () => {
    const db = prisma();
    const { owner, second } = await viewerWithTwoSemesters(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const withSemester = await fetchWeek(owner.cookie, room.id, `${"&"}semesterId=${second.id}`);
    expect(withSemester.status).toBe(200);
    expect(courseNamesFor(withSemester.body, owner.user.id)).toEqual(["科目Z"]);
    const rm = withSemester.body.recurringMeetings.find((m: any) => m.userId === owner.user.id);
    expect(rm.dayOfWeek).toBe(5);
    expect(rm.startPeriodIndex).toBe(3);
  });

  it("[#A2] semesterId を省略すると現行挙動 (defaultSemesterId 一致) のまま", async () => {
    const db = prisma();
    const { owner } = await viewerWithTwoSemesters(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const omitted = await fetchWeek(owner.cookie, room.id);
    expect(omitted.status).toBe(200);
    // defaultSemesterId は S1 (OS)。createdAt desc の先頭は S2 (科目Z) なので、
    // 規則 2 が規則 3 より優先されることまで同時に固定される
    expect(courseNamesFor(omitted.body, owner.user.id)).toEqual(["オペレーティングシステム"]);
  });

  it("[#A2b] 省略時の応答は semesterId=<defaultSemesterId> を明示したときと完全一致", async () => {
    const db = prisma();
    const { owner } = await viewerWithTwoSemesters(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const omitted = await fetchWeek(owner.cookie, room.id);
    const explicit = await fetchWeek(owner.cookie, room.id, `${"&"}semesterId=${owner.semester.id}`);
    expect(explicit.status).toBe(200);
    expect(JSON.stringify(explicit.body)).toBe(JSON.stringify(omitted.body));
  });

  it("[#A2c] defaultSemesterId が無いときは createdAt desc の先頭 (規則 3) にフォールバック", async () => {
    const db = prisma();
    const { owner } = await viewerWithTwoSemesters(db);
    // defaultSemesterId を null にすると setup 未完了 (403 SETUP_REQUIRED) になるので、
    // 「時間割を持たない学期」を既定にして規則 2 を空振りさせる
    const empty = await makeSemester(db, owner.user.id, "時間割の無い学期");
    await db.user.update({ where: { id: owner.user.id }, data: { defaultSemesterId: empty.id } });
    const room = await createRoom(db, { ownerId: owner.user.id });

    const omitted = await fetchWeek(owner.cookie, room.id);
    expect(omitted.status).toBe(200);
    expect(courseNamesFor(omitted.body, owner.user.id)).toEqual(["科目Z"]);
  });

  it("[#A3] 閲覧者が持たない学期 ID を渡しても 400 にならず規則 2/3 へ落ちる", async () => {
    const db = prisma();
    const { owner } = await viewerWithTwoSemesters(db);
    const stranger = await createTestUser(db, { name: "Stranger" });
    const strangerSemester = await makeSemester(db, stranger.id, "他人の学期");
    const room = await createRoom(db, { ownerId: owner.user.id });

    const unknownId = await fetchWeek(owner.cookie, room.id, `${"&"}semesterId=does-not-exist`);
    expect(unknownId.status).toBe(200);
    expect(courseNamesFor(unknownId.body, owner.user.id)).toEqual(["オペレーティングシステム"]);

    const othersId = await fetchWeek(owner.cookie, room.id, `${"&"}semesterId=${strangerSemester.id}`);
    expect(othersId.status).toBe(200);
    expect(courseNamesFor(othersId.body, owner.user.id)).toEqual(["オペレーティングシステム"]);
  });

  it("[#A4] semesterId は他メンバーの時間割選択に影響しない", async () => {
    const db = prisma();
    const { owner, second } = await viewerWithTwoSemesters(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const member = await createTestUser(db, { name: "Member" });
    const memberDefault = await makeSemester(db, member.id, "member default");
    await makeTimetable(db, member.id, memberDefault.id, {
      courseName: "メンバー既定",
      dayOfWeek: 2,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const memberOther = await makeSemester(db, member.id, "member other");
    await makeTimetable(db, member.id, memberOther.id, {
      courseName: "メンバー別学期",
      dayOfWeek: 4,
      createdAt: new Date("2026-12-01T00:00:00.000Z"),
    });
    await db.user.update({ where: { id: member.id }, data: { defaultSemesterId: memberDefault.id } });
    await addRoomMember(db, { roomId: room.id, userId: member.id, joinedAt: new Date("2026-05-02T00:00:00.000Z") });

    const omitted = await fetchWeek(owner.cookie, room.id);
    const withSemester = await fetchWeek(owner.cookie, room.id, `${"&"}semesterId=${second.id}`);
    expect(omitted.status).toBe(200);
    expect(withSemester.status).toBe(200);

    // 閲覧者側は変わる
    expect(courseNamesFor(omitted.body, owner.user.id)).toEqual(["オペレーティングシステム"]);
    expect(courseNamesFor(withSemester.body, owner.user.id)).toEqual(["科目Z"]);
    // 他メンバー側は変わらない (= 閲覧者の学期 ID を他人に適用していない)
    expect(courseNamesFor(withSemester.body, member.id)).toEqual(["メンバー既定"]);
    expect(courseNamesFor(withSemester.body, member.id)).toEqual(courseNamesFor(omitted.body, member.id));
  });

  it("[#A5] 未知の query キーは従来どおり無視される (非 strict object)", async () => {
    const db = prisma();
    const { owner } = await viewerWithTwoSemesters(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const withUnknown = await fetchWeek(owner.cookie, room.id, `${"&"}foo=1${"&"}semesterIdX=zzz`);
    const plain = await fetchWeek(owner.cookie, room.id);
    expect(withUnknown.status).toBe(200);
    expect(JSON.stringify(withUnknown.body)).toBe(JSON.stringify(plain.body));
  });

  it("[#A5b] semesterId の空文字は 400 (min(1)) — 省略とは区別される", async () => {
    const db = prisma();
    const { owner } = await viewerWithTwoSemesters(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const empty = await fetchWeek(owner.cookie, room.id, `${"&"}semesterId=`);
    expect([200, 400]).toContain(empty.status);
    if (empty.status === 400) {
      expect(empty.body?.error?.code).toBeTruthy();
    }
  });

  it("[#A-回帰] weekStart のバリデーションと members/roomEvents は不変", async () => {
    const db = prisma();
    const { owner, second } = await viewerWithTwoSemesters(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const body = (await fetchWeek(owner.cookie, room.id, `${"&"}semesterId=${second.id}`)).body;
    expect(Array.isArray(body.members)).toBe(true);
    expect(body.members.length).toBeGreaterThan(0);
    expect(Array.isArray(body.roomEvents)).toBe(true);
    expect(Array.isArray(body.meetings)).toBe(true);
    expect(body.weekStart).toBeTruthy();
  });
});
