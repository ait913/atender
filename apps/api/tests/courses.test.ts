import { describe, it, expect } from "vitest";
import { app, prisma } from "./helpers/app";
import {
  createOccurrence,
  createSessionCookie,
  createTestUser,
  setupCompleteUser,
} from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

describe("courses API", () => {
  it("[仕様10] POST /api/courses に room を含めても Course に room は保存されない", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/courses", {
      method: "POST",
      headers: cookieHeader(complete.cookie),
      body: {
        userTimetableId: complete.userTimetable.id,
        name: "線形代数",
        teacher: "佐藤",
        room: "A301",
        color: "#10b981",
        totalSessions: 15,
        note: "room は CourseCreateInput から除去済み",
      },
    });
    const body = await json(res) as any;

    // 仕様は「無視される/型エラー」の二択を許容しているため、どちらかを検証する。
    if (res.status === 201) {
      expect(body.course).not.toHaveProperty("room");
      const columns = await db.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Course")');
      expect(columns).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "room" })]));
    } else {
      expect(res.status).toBe(400);
      expectError(body, /VALIDATION|BAD_REQUEST|INVALID/);
    }
  });

  it("[仕様11] PATCH /api/courses/:id で name を変えても MeetingOccurrence は再生成されず出席記録が保持される", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });
    await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "PRESENT" } });

    const res = await requestJson(app, `/api/courses/${complete.course.id}`, {
      method: "PATCH",
      headers: cookieHeader(complete.cookie),
      body: { name: "変更後の科目名" },
    });
    const body = await json(res) as any;

    expect(res.status).toBe(200);
    expect(body.course.name).toBe("変更後の科目名");
    await expect(db.course.findUniqueOrThrow({ where: { id: complete.course.id } })).resolves.toMatchObject({ name: "変更後の科目名" });
    await expect(db.meetingOccurrence.findUniqueOrThrow({ where: { id: occurrence.id } })).resolves.toMatchObject({ id: occurrence.id });
    await expect(db.attendanceRecord.findUniqueOrThrow({ where: { occurrenceId: occurrence.id } })).resolves.toMatchObject({ status: "PRESENT" });
  });

  it("[仕様12] PATCH /api/courses/:id は他人の course に 404 を返す", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const other = await setupCompleteUser(db);

    const res = await requestJson(app, `/api/courses/${owner.course.id}`, {
      method: "PATCH",
      headers: cookieHeader(other.cookie),
      body: { name: "不正な更新" },
    });
    const body = await json(res);

    expect(res.status).toBe(404);
    expectError(body, "NOT_FOUND");
    await expect(db.course.findUniqueOrThrow({ where: { id: owner.course.id } })).resolves.toMatchObject({ name: owner.course.name });
  });

  it("[仕様13] DELETE /api/courses/:id は course と紐づく Meeting / MeetingOccurrence / AttendanceRecord / CourseSuspension を cascade 削除する", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const occurrence = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id });
    await db.attendanceRecord.create({ data: { occurrenceId: occurrence.id, userId: complete.user.id, status: "ABSENT" } });
    const suspension = await db.courseSuspension.create({
      data: {
        courseId: complete.course.id,
        date: new Date("2026-05-20T00:00:00.000Z"),
        reason: "休講",
      },
    });

    const res = await app.request(`/api/courses/${complete.course.id}`, {
      method: "DELETE",
      headers: cookieHeader(complete.cookie),
    });
    const body = await json(res) as any;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    await expect(db.course.count({ where: { id: complete.course.id } })).resolves.toBe(0);
    await expect(db.meeting.count({ where: { id: complete.meeting.id } })).resolves.toBe(0);
    await expect(db.meetingOccurrence.count({ where: { id: occurrence.id } })).resolves.toBe(0);
    await expect(db.attendanceRecord.count({ where: { occurrenceId: occurrence.id } })).resolves.toBe(0);
    await expect(db.courseSuspension.count({ where: { id: suspension.id } })).resolves.toBe(0);
  });

  it("[仕様14] courses 個別エンドポイントは認証なし 401、setup 未完了 403", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    const incomplete = await createTestUser(db);
    const incompleteCookie = await createSessionCookie(db, incomplete.id);

    const unauthenticated = await requestJson(app, `/api/courses/${complete.course.id}`, {
      method: "PATCH",
      body: { name: "認証なし" },
    });
    expect(unauthenticated.status).toBe(401);
    expectError(await json(unauthenticated), "UNAUTHORIZED");

    const setupRequired = await requestJson(app, `/api/courses/${complete.course.id}`, {
      method: "PATCH",
      headers: cookieHeader(incompleteCookie),
      body: { name: "setup 未完了" },
    });
    expect(setupRequired.status).toBe(403);
    expectError(await json(setupRequired), "SETUP_REQUIRED");
  });
});
