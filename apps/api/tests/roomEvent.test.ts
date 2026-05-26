import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";
import { addRoomMember, createRoom, createRoomEvent } from "./helpers/seedRoom";

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

describe("room event endpoints", () => {
  it("allows any room member to create, edit, and delete events while fixing authorId to caller", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const member = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: member.user.id });

    const created = await requestJson(app, `/api/rooms/${room.id}/events`, {
      method: "POST",
      headers: cookieHeader(member.cookie),
      body: {
        title: "Planning",
        start: "2026-05-27T04:00:00.000Z",
        end: "2026-05-27T05:00:00.000Z",
        color: "#1a2b3c",
      },
    });
    expect(created.status).toBe(201);
    const event = (await json(created) as any).event;
    expect(event.authorId).toBe(member.user.id);
    expect(event.color).toBe("#1a2b3c");

    const patched = await requestJson(app, `/api/rooms/${room.id}/events/${event.id}`, {
      method: "PATCH",
      headers: cookieHeader(owner.cookie),
      body: { title: "Edited by owner" },
    });
    expect(patched.status).toBe(200);
    expect((await json(patched) as any).event.title).toBe("Edited by owner");

    const deleted = await requestJson(app, `/api/rooms/${room.id}/events/${event.id}`, {
      method: "DELETE",
      headers: cookieHeader(owner.cookie),
    });
    expect(deleted.status).toBe(200);
    expect(await db.roomEvent.findUnique({ where: { id: event.id } })).toBeNull();
  });

  it("validates ranges on create and patch, including partial start/end changes", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const invalidCreate = await requestJson(app, `/api/rooms/${room.id}/events`, {
      method: "POST",
      headers: cookieHeader(owner.cookie),
      body: {
        title: "Bad",
        start: "2026-05-27T05:00:00.000Z",
        end: "2026-05-27T05:00:00.000Z",
      },
    });
    expect(invalidCreate.status).toBe(400);
    expectError(await json(invalidCreate), "INVALID_RANGE");

    const event = await createRoomEvent(db, {
      roomId: room.id,
      authorId: owner.user.id,
      start: new Date("2026-05-27T04:00:00.000Z"),
      end: new Date("2026-05-27T05:00:00.000Z"),
    });
    const invalidPatch = await requestJson(app, `/api/rooms/${room.id}/events/${event.id}`, {
      method: "PATCH",
      headers: cookieHeader(owner.cookie),
      body: { start: "2026-05-27T06:00:00.000Z" },
    });
    expect(invalidPatch.status).toBe(400);
    expectError(await json(invalidPatch), "INVALID_RANGE");
  });

  it("validates color format", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const invalid = await requestJson(app, `/api/rooms/${room.id}/events`, {
      method: "POST",
      headers: cookieHeader(owner.cookie),
      body: {
        title: "Bad color",
        start: "2026-05-27T04:00:00.000Z",
        end: "2026-05-27T05:00:00.000Z",
        color: "red",
      },
    });
    expect(invalid.status).toBe(400);

    const valid = await requestJson(app, `/api/rooms/${room.id}/events`, {
      method: "POST",
      headers: cookieHeader(owner.cookie),
      body: {
        title: "Good color",
        start: "2026-05-27T04:00:00.000Z",
        end: "2026-05-27T05:00:00.000Z",
        color: "#1a2b3c",
      },
    });
    expect(valid.status).toBe(201);
  });

  it("rejects non-members and unauthenticated users", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const outsider = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const nonMember = await requestJson(app, `/api/rooms/${room.id}/events`, {
      method: "POST",
      headers: cookieHeader(outsider.cookie),
      body: {
        title: "No access",
        start: "2026-05-27T04:00:00.000Z",
        end: "2026-05-27T05:00:00.000Z",
      },
    });
    expect(nonMember.status).toBe(403);
    expectError(await json(nonMember), "NOT_MEMBER");

    const unauthenticated = await requestJson(app, `/api/rooms/${room.id}/events`, {
      method: "POST",
      body: {
        title: "No auth",
        start: "2026-05-27T04:00:00.000Z",
        end: "2026-05-27T05:00:00.000Z",
      },
    });
    expect(unauthenticated.status).toBe(401);
    expectError(await json(unauthenticated), "UNAUTHORIZED");
  });
});
