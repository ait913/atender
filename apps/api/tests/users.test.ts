import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSessionCookie, createTestUser } from "./helpers/auth";
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
