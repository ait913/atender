import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSessionCookie, createTestUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";
import { createFriendship, setUserHandle } from "./helpers/seedFriendship";

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

describe("friendship endpoints", () => {
  it("resolves receivers by handle, inviteCode, and id", async () => {
    const db = prisma();
    const sender = await createTestUser(db);
    const byHandle = await setUserHandle(db, (await createTestUser(db)).id, "alice");
    const byInvite = await createTestUser(db);
    const byId = await createTestUser(db);
    const cookie = await createSessionCookie(db, sender.id);

    const handleRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverHandle: "alice" },
    });
    expect(handleRes.status).toBe(201);
    expect((await json(handleRes) as any).friendship.receiver.id).toBe(byHandle.id);

    const inviteRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverInviteCode: byInvite.inviteCode },
    });
    expect(inviteRes.status).toBe(201);
    expect((await json(inviteRes) as any).friendship.receiver.id).toBe(byInvite.id);

    const idRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverId: byId.id },
    });
    expect(idRes.status).toBe(201);
    expect((await json(idRes) as any).friendship.receiver.id).toBe(byId.id);
  });

  it("rejects self friendship and missing receivers", async () => {
    const db = prisma();
    const me = await setUserHandle(db, (await createTestUser(db)).id, "me");
    const cookie = await createSessionCookie(db, me.id);

    const selfRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverId: me.id },
    });
    expect(selfRes.status).toBe(409);
    expectError(await json(selfRes), "SELF_FRIENDSHIP");

    for (const body of [
      { receiverHandle: "missing" },
      { receiverInviteCode: "missing-code" },
      { receiverId: "missing-id" },
    ]) {
      const res = await requestJson(app, "/api/friendships", {
        method: "POST",
        headers: cookieHeader(cookie),
        body,
      });
      expect(res.status).toBe(404);
      expectError(await json(res), "USER_NOT_FOUND");
    }
  });

  it("handles create idempotency, reverse pending auto-accept, accepted, blocked, and declined revival", async () => {
    const db = prisma();
    const me = await createTestUser(db);
    const other = await createTestUser(db);
    const cookie = await createSessionCookie(db, me.id);

    const pending = await createFriendship(db, { senderId: me.id, receiverId: other.id });
    const pendingRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverId: other.id },
    });
    expect(pendingRes.status).toBe(200);
    expect((await json(pendingRes) as any).friendship.id).toBe(pending.id);
    expect(await db.friendship.count({ where: { senderId: me.id, receiverId: other.id } })).toBe(1);

    await db.friendship.delete({ where: { id: pending.id } });
    const reversePending = await createFriendship(db, { senderId: other.id, receiverId: me.id });
    const acceptRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverId: other.id },
    });
    expect(acceptRes.status).toBe(200);
    const acceptedBody = await json(acceptRes) as any;
    expect(acceptedBody.friendship.id).toBe(reversePending.id);
    expect(acceptedBody.friendship.status).toBe("ACCEPTED");
    expect(acceptedBody.friendship.sender.id).toBe(other.id);
    expect(acceptedBody.friendship.receiver.id).toBe(me.id);
    expect(acceptedBody.friendship.acceptedAt).toEqual(expect.any(String));

    const alreadyRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverId: other.id },
    });
    expect(alreadyRes.status).toBe(409);
    expectError(await json(alreadyRes), "ALREADY_FRIEND");

    await db.friendship.delete({ where: { id: reversePending.id } });
    const blockedByOther = await createFriendship(db, { senderId: other.id, receiverId: me.id, status: "BLOCKED" });
    const hiddenRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverId: other.id },
    });
    expect(hiddenRes.status).toBe(404);
    expectError(await json(hiddenRes), "USER_NOT_FOUND");

    await db.friendship.delete({ where: { id: blockedByOther.id } });
    const blockedByMe = await createFriendship(db, { senderId: me.id, receiverId: other.id, status: "BLOCKED" });
    const blockedRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverId: other.id },
    });
    expect(blockedRes.status).toBe(409);
    expectError(await json(blockedRes), "YOU_BLOCKED_THIS_USER");

    await db.friendship.delete({ where: { id: blockedByMe.id } });
    const declined = await createFriendship(db, {
      senderId: other.id,
      receiverId: me.id,
      status: "DECLINED",
      acceptedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    const reviveRes = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverId: other.id },
    });
    expect(reviveRes.status).toBe(200);
    const revived = await db.friendship.findUniqueOrThrow({ where: { id: declined.id } });
    expect(revived.senderId).toBe(me.id);
    expect(revived.receiverId).toBe(other.id);
    expect(revived.status).toBe("PENDING");
    expect(revived.acceptedAt).toBeNull();
  });

  it("accepts, declines, cancels, blocks, and deletes with the documented authorization rules", async () => {
    const db = prisma();
    const sender = await createTestUser(db);
    const receiver = await createTestUser(db);
    const stranger = await createTestUser(db);
    const senderCookie = await createSessionCookie(db, sender.id);
    const receiverCookie = await createSessionCookie(db, receiver.id);
    const strangerCookie = await createSessionCookie(db, stranger.id);

    const request = await createFriendship(db, { senderId: sender.id, receiverId: receiver.id });
    const notReceiver = await requestJson(app, `/api/friendships/${request.id}/accept`, {
      method: "POST",
      headers: cookieHeader(strangerCookie),
    });
    expect(notReceiver.status).toBe(403);
    expectError(await json(notReceiver), "NOT_RECEIVER");

    const accepted = await requestJson(app, `/api/friendships/${request.id}/accept`, {
      method: "POST",
      headers: cookieHeader(receiverCookie),
    });
    expect(accepted.status).toBe(200);
    expect((await json(accepted) as any).friendship.acceptedAt).toEqual(expect.any(String));

    const acceptAgain = await requestJson(app, `/api/friendships/${request.id}/accept`, {
      method: "POST",
      headers: cookieHeader(receiverCookie),
    });
    expect(acceptAgain.status).toBe(409);
    expectError(await json(acceptAgain), "NOT_PENDING");

    await db.friendship.delete({ where: { id: request.id } });
    const declineTarget = await createFriendship(db, { senderId: sender.id, receiverId: receiver.id });
    const declined = await requestJson(app, `/api/friendships/${declineTarget.id}/decline`, {
      method: "POST",
      headers: cookieHeader(receiverCookie),
    });
    expect(declined.status).toBe(200);
    expect((await json(declined) as any).friendship.status).toBe("DECLINED");

    const cancelTarget = await createFriendship(db, { senderId: sender.id, receiverId: receiver.id });
    const notSender = await requestJson(app, `/api/friendships/${cancelTarget.id}/cancel`, {
      method: "POST",
      headers: cookieHeader(receiverCookie),
    });
    expect(notSender.status).toBe(403);
    expectError(await json(notSender), "NOT_SENDER");

    const cancelled = await requestJson(app, `/api/friendships/${cancelTarget.id}/cancel`, {
      method: "POST",
      headers: cookieHeader(senderCookie),
    });
    expect(cancelled.status).toBe(200);
    expect(await db.friendship.findUnique({ where: { id: cancelTarget.id } })).toBeNull();

    const nonPendingCancel = await createFriendship(db, { senderId: sender.id, receiverId: receiver.id, status: "ACCEPTED" });
    const nonPending = await requestJson(app, `/api/friendships/${nonPendingCancel.id}/cancel`, {
      method: "POST",
      headers: cookieHeader(senderCookie),
    });
    expect(nonPending.status).toBe(409);
    expectError(await json(nonPending), "NOT_PENDING");

    const blocked = await requestJson(app, `/api/friendships/${nonPendingCancel.id}/block`, {
      method: "POST",
      headers: cookieHeader(receiverCookie),
    });
    expect(blocked.status).toBe(200);
    const blockedRow = await db.friendship.findUniqueOrThrow({ where: { id: nonPendingCancel.id } });
    expect(blockedRow.status).toBe("BLOCKED");
    expect(blockedRow.senderId).toBe(receiver.id);
    expect(blockedRow.receiverId).toBe(sender.id);

    const deleted = await requestJson(app, `/api/friendships/${nonPendingCancel.id}`, {
      method: "DELETE",
      headers: cookieHeader(senderCookie),
    });
    expect(deleted.status).toBe(200);
    expect(await db.friendship.findUnique({ where: { id: nonPendingCancel.id } })).toBeNull();
  });

  it("filters received pending requests, requires auth, and skips setup guard", async () => {
    const db = prisma();
    const me = await createTestUser(db);
    const a = await createTestUser(db);
    const b = await createTestUser(db);
    const c = await createTestUser(db);
    await createFriendship(db, { senderId: a.id, receiverId: me.id });
    await createFriendship(db, { senderId: b.id, receiverId: me.id, status: "ACCEPTED" });
    await createFriendship(db, { senderId: me.id, receiverId: c.id });
    const cookie = await createSessionCookie(db, me.id);

    const res = await requestJson(app, "/api/friendships?direction=received&status=PENDING", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const body = await json(res) as any;
    expect(body.friendships).toHaveLength(1);
    expect(body.friendships[0].sender.id).toBe(a.id);

    const unauthenticated = await requestJson(app, "/api/friendships", { method: "POST", body: { receiverId: a.id } });
    expect(unauthenticated.status).toBe(401);
    expectError(await json(unauthenticated), "UNAUTHORIZED");

    const setupIncomplete = await requestJson(app, "/api/friendships", {
      method: "POST",
      headers: cookieHeader(cookie),
      body: { receiverId: b.id },
    });
    expect(setupIncomplete.status).not.toBe(403);
  });
});
