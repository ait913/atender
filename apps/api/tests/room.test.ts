import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSessionCookie, createTestUser, setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";
import { addRoomMember, createRoom, createRoomEvent } from "./helpers/seedRoom";

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

describe("room endpoints", () => {
  it("creates a room with owner membership and a 7-day invite", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const before = Date.now();

    const res = await requestJson(app, "/api/rooms", {
      method: "POST",
      headers: cookieHeader(owner.cookie),
      body: { name: "TC0701" },
    });

    expect(res.status).toBe(201);
    const room = (await json(res) as any).room;
    expect(room.name).toBe("TC0701");
    expect(room.inviteCode).toMatch(/^c[a-z0-9]+$/);
    const expiresAt = new Date(room.inviteExpiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 6.9 * 24 * 60 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(before + 7.1 * 24 * 60 * 60 * 1000);

    const membership = await db.roomMembership.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: owner.user.id } },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("lists only joined rooms with memberCount and myRole", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const member = await setupCompleteUser(db);
    const outsider = await setupCompleteUser(db);
    const joined = await createRoom(db, { ownerId: owner.user.id, name: "Joined" });
    await addRoomMember(db, { roomId: joined.id, userId: member.user.id });
    await createRoom(db, { ownerId: outsider.user.id, name: "Hidden" });

    const res = await requestJson(app, "/api/rooms", { headers: cookieHeader(member.cookie) });
    expect(res.status).toBe(200);
    const rooms = (await json(res) as any).rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ id: joined.id, memberCount: 2, myRole: "MEMBER" });
  });

  it("enforces membership and owner-only operations, and owner delete cascades", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const member = await setupCompleteUser(db);
    const outsider = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: member.user.id });
    await createRoomEvent(db, { roomId: room.id, authorId: owner.user.id });

    const getNonMember = await requestJson(app, `/api/rooms/${room.id}`, {
      headers: cookieHeader(outsider.cookie),
    });
    expect(getNonMember.status).toBe(404);
    expectError(await json(getNonMember), "NOT_MEMBER");

    const patchNonOwner = await requestJson(app, `/api/rooms/${room.id}`, {
      method: "PATCH",
      headers: cookieHeader(member.cookie),
      body: { name: "Nope" },
    });
    expect(patchNonOwner.status).toBe(403);
    expectError(await json(patchNonOwner), "NOT_OWNER");

    const deleteNonOwner = await requestJson(app, `/api/rooms/${room.id}`, {
      method: "DELETE",
      headers: cookieHeader(member.cookie),
    });
    expect(deleteNonOwner.status).toBe(403);
    expectError(await json(deleteNonOwner), "NOT_OWNER");

    const deleted = await requestJson(app, `/api/rooms/${room.id}`, {
      method: "DELETE",
      headers: cookieHeader(owner.cookie),
    });
    expect(deleted.status).toBe(200);
    expect(await db.room.findUnique({ where: { id: room.id } })).toBeNull();
    expect(await db.roomMembership.count({ where: { roomId: room.id } })).toBe(0);
    expect(await db.roomEvent.count({ where: { roomId: room.id } })).toBe(0);
  });

  it("handles leave and member removal rules", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const member = await setupCompleteUser(db);
    const otherMember = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: member.user.id, joinedAt: new Date("2026-05-02T00:00:00.000Z") });
    await addRoomMember(db, { roomId: room.id, userId: otherMember.user.id, joinedAt: new Date("2026-05-03T00:00:00.000Z") });

    const ownerLeave = await requestJson(app, `/api/rooms/${room.id}/leave`, {
      method: "POST",
      headers: cookieHeader(owner.cookie),
    });
    expect(ownerLeave.status).toBe(409);
    expectError(await json(ownerLeave), "OWNER_CANNOT_LEAVE");

    const memberLeave = await requestJson(app, `/api/rooms/${room.id}/leave`, {
      method: "POST",
      headers: cookieHeader(member.cookie),
    });
    expect(memberLeave.status).toBe(200);
    expect(await db.roomMembership.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: member.user.id } },
    })).toBeNull();

    const removeByNonOwner = await requestJson(app, `/api/rooms/${room.id}/members/${owner.user.id}`, {
      method: "DELETE",
      headers: cookieHeader(otherMember.cookie),
    });
    expect(removeByNonOwner.status).toBe(403);
    expectError(await json(removeByNonOwner), "NOT_OWNER");

    const removeOwner = await requestJson(app, `/api/rooms/${room.id}/members/${owner.user.id}`, {
      method: "DELETE",
      headers: cookieHeader(owner.cookie),
    });
    expect(removeOwner.status).toBe(409);
    expectError(await json(removeOwner), "CANNOT_REMOVE_OWNER");
  });

  it("orders members with OWNER first and then joinedAt ascending", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const first = await setupCompleteUser(db);
    const second = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: second.user.id, joinedAt: new Date("2026-05-03T00:00:00.000Z") });
    await addRoomMember(db, { roomId: room.id, userId: first.user.id, joinedAt: new Date("2026-05-02T00:00:00.000Z") });

    const res = await requestJson(app, `/api/rooms/${room.id}/members`, {
      headers: cookieHeader(owner.cookie),
    });
    expect(res.status).toBe(200);
    const members = (await json(res) as any).members;
    expect(members.map((member: any) => member.userId)).toEqual([owner.user.id, first.user.id, second.user.id]);
    expect(members[0].role).toBe("OWNER");
  });

  it("regenerates invites and joins by current invite code only", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const member = await setupCompleteUser(db);
    const joiner = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id, inviteCode: "old-code" });
    await addRoomMember(db, { roomId: room.id, userId: member.user.id });

    const nonOwnerInvite = await requestJson(app, `/api/rooms/${room.id}/invite`, {
      method: "POST",
      headers: cookieHeader(member.cookie),
    });
    expect(nonOwnerInvite.status).toBe(403);
    expectError(await json(nonOwnerInvite), "NOT_OWNER");

    const reissued = await requestJson(app, `/api/rooms/${room.id}/invite`, {
      method: "POST",
      headers: cookieHeader(owner.cookie),
    });
    expect(reissued.status).toBe(200);
    const invite = await json(reissued) as any;
    expect(invite.inviteCode).not.toBe("old-code");
    expect(invite.inviteCode).toMatch(/^c[a-z0-9]+$/);

    const oldJoin = await requestJson(app, "/api/rooms/join", {
      method: "POST",
      headers: cookieHeader(joiner.cookie),
      body: { inviteCode: "old-code" },
    });
    expect(oldJoin.status).toBe(404);
    expectError(await json(oldJoin), "INVITE_NOT_FOUND");

    const already = await requestJson(app, "/api/rooms/join", {
      method: "POST",
      headers: cookieHeader(owner.cookie),
      body: { inviteCode: invite.inviteCode },
    });
    expect(already.status).toBe(409);
    expectError(await json(already), "ALREADY_MEMBER");
    expect((await json(already) as any).error.details.roomId).toBe(room.id);

    const joined = await requestJson(app, "/api/rooms/join", {
      method: "POST",
      headers: cookieHeader(joiner.cookie),
      body: { inviteCode: invite.inviteCode },
    });
    expect(joined.status).toBe(200);
    expect((await json(joined) as any).room.id).toBe(room.id);
    expect((await db.roomMembership.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: joiner.user.id } },
    }))?.role).toBe("MEMBER");
  });

  it("returns invite errors for missing and expired invites", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const joiner = await setupCompleteUser(db);
    await createRoom(db, {
      ownerId: owner.user.id,
      inviteCode: "expired-code",
      inviteExpiresAt: new Date(Date.now() - 1000),
    });

    const missing = await requestJson(app, "/api/rooms/join", {
      method: "POST",
      headers: cookieHeader(joiner.cookie),
      body: { inviteCode: "missing" },
    });
    expect(missing.status).toBe(404);
    expectError(await json(missing), "INVITE_NOT_FOUND");

    const expired = await requestJson(app, "/api/rooms/join", {
      method: "POST",
      headers: cookieHeader(joiner.cookie),
      body: { inviteCode: "expired-code" },
    });
    expect(expired.status).toBe(410);
    expectError(await json(expired), "INVITE_EXPIRED");
  });

  it("requires auth and setup completion", async () => {
    const db = prisma();
    const incomplete = await createTestUser(db);
    const cookie = await createSessionCookie(db, incomplete.id);

    const unauthenticated = await requestJson(app, "/api/rooms");
    expect(unauthenticated.status).toBe(401);
    expectError(await json(unauthenticated), "UNAUTHORIZED");

    const setupRequired = await requestJson(app, "/api/rooms", {
      headers: cookieHeader(cookie),
    });
    expect(setupRequired.status).toBe(403);
    expectError(await json(setupRequired), "SETUP_REQUIRED");
  });
});
