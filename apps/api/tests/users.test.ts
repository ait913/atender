import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSessionCookie, createTestUser, setupCompleteUser, createOccurrence } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";
import { createFriendship, setUserHandle } from "./helpers/seedFriendship";

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

describe("user search endpoint", () => {
  it("searches handles by case-insensitive prefix, excludes self and blocked users, and returns status", async () => {
    const db = prisma();
    const me = await setUserHandle(db, (await createTestUser(db, { name: "Me" })).id, "touri");
    const pending = await setUserHandle(db, (await createTestUser(db, { name: "Pending" })).id, "touri_pending");
    const accepted = await setUserHandle(db, (await createTestUser(db, { name: "Accepted" })).id, "touri_accepted");
    const blocked = await setUserHandle(db, (await createTestUser(db, { name: "Blocked" })).id, "touri_blocked");
    const unrelated = await setUserHandle(db, (await createTestUser(db, { name: "Unrelated" })).id, "TOURI_unrelated");
    const nonPrefix = await setUserHandle(db, (await createTestUser(db, { name: "Other" })).id, "xtouri");
    await createFriendship(db, { senderId: pending.id, receiverId: me.id, status: "PENDING" });
    await createFriendship(db, { senderId: me.id, receiverId: accepted.id, status: "ACCEPTED" });
    await createFriendship(db, { senderId: me.id, receiverId: blocked.id, status: "BLOCKED" });
    const cookie = await createSessionCookie(db, me.id);

    const res = await requestJson(app, "/api/users/search?handle=ToUrI", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const users = (await json(res) as any).users;
    const ids = users.map((user: any) => user.id);
    expect(ids).toContain(pending.id);
    expect(ids).toContain(accepted.id);
    expect(ids).toContain(unrelated.id);
    expect(ids).not.toContain(me.id);
    expect(ids).not.toContain(blocked.id);
    expect(ids).not.toContain(nonPrefix.id);
    expect(users.find((user: any) => user.id === pending.id).friendshipStatus).toBe("PENDING");
    expect(users.find((user: any) => user.id === accepted.id).friendshipStatus).toBe("ACCEPTED");
    expect(users.find((user: any) => user.id === unrelated.id).friendshipStatus).toBeNull();
  });

  it("limits results to 10 users", async () => {
    const db = prisma();
    const me = await createTestUser(db);
    const cookie = await createSessionCookie(db, me.id);
    for (let i = 0; i < 12; i++) {
      await setUserHandle(db, (await createTestUser(db)).id, `limit_${i.toString().padStart(2, "0")}`);
    }

    const res = await requestJson(app, "/api/users/search?handle=limit_", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    expect((await json(res) as any).users).toHaveLength(10);
  });

  it("rejects empty query and requires auth", async () => {
    const db = prisma();
    const me = await createTestUser(db);
    const cookie = await createSessionCookie(db, me.id);

    const empty = await requestJson(app, "/api/users/search?handle=", {
      headers: cookieHeader(cookie),
    });
    expect(empty.status).toBe(400);
    expectError(await json(empty), "BAD_REQUEST");

    const unauthenticated = await requestJson(app, "/api/users/search?handle=touri");
    expect(unauthenticated.status).toBe(401);
    expectError(await json(unauthenticated), "UNAUTHORIZED");
  });
});

describe("me requiredAttendanceRate", () => {
  it("returns default requiredAttendanceRate for a newly created user", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await app.request("/api/me", { headers: cookieHeader(complete.cookie) });
    const body = await json(res);

    // 仕様 #17
    expect(res.status).toBe(200);
    expect(body.user.requiredAttendanceRate).toBe(70);
  });

  it("patches requiredAttendanceRate without changing unrelated user fields", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/me", {
      method: "PATCH",
      headers: cookieHeader(complete.cookie),
      body: { requiredAttendanceRate: 80 },
    });
    const body = await json(res);
    const get = await app.request("/api/me", { headers: cookieHeader(complete.cookie) });
    const after = await json(get);

    // 仕様 #18
    expect(res.status).toBe(200);
    expect(body.user.requiredAttendanceRate).toBe(80);
    expect(after.user.requiredAttendanceRate).toBe(80);
    expect(after.user.defaultSemesterId).toBe(complete.semester.id);
  });

  it.each([0, 101, 70.5])("rejects invalid requiredAttendanceRate %s", async (requiredAttendanceRate) => {
    const db = prisma();
    const complete = await setupCompleteUser(db);

    const res = await requestJson(app, "/api/me", {
      method: "PATCH",
      headers: cookieHeader(complete.cookie),
      body: { requiredAttendanceRate },
    });
    const body = await json(res);

    // 仕様 #19
    expect(res.status).toBe(400);
    expectError(body, "VALIDATION_ERROR");
  });

  it("updates overview allowedAbsences when requiredAttendanceRate changes", async () => {
    const db = prisma();
    const complete = await setupCompleteUser(db);
    // 過去 1 件 (PRESENT 記録) + 学期内未来 9 件 = 射影 10/10。
    // rate70 → floor(10-7)=3、rate90 → floor(10-9)=1 で確実に差が出る fixture (JST midnight 規約)
    const past = await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date("2026-06-01T00:00:00+09:00") });
    const futureDates = ["2026-06-18", "2026-06-25", "2026-07-02", "2026-07-09", "2026-07-16", "2026-07-23", "2026-07-30", "2026-08-06", "2026-08-13"];
    for (const d of futureDates) {
      await createOccurrence(db, { meetingId: complete.meeting.id, courseId: complete.course.id, date: new Date(`${d}T00:00:00+09:00`) });
    }
    await db.attendanceRecord.create({ data: { occurrenceId: past.id, userId: complete.user.id, status: "PRESENT" } });

    await requestJson(app, "/api/me", { method: "PATCH", headers: cookieHeader(complete.cookie), body: { requiredAttendanceRate: 70 } });
    const before = await json(await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: cookieHeader(complete.cookie) }));
    await requestJson(app, "/api/me", { method: "PATCH", headers: cookieHeader(complete.cookie), body: { requiredAttendanceRate: 90 } });
    const after = await json(await app.request(`/api/semesters/${complete.semester.id}/overview`, { headers: cookieHeader(complete.cookie) }));

    // 仕様 #20
    expect(after.overall.allowedAbsences).toBeLessThan(before.overall.allowedAbsences);
  });
});
