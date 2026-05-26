import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSessionCookie, createTestUser, setupCompleteUser } from "./helpers/auth";
import { createOccurrence } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";
import { addRoomMember, createRoom, createRoomEvent } from "./helpers/seedRoom";

function cookieHeader(cookie: string) {
  return { Cookie: cookie };
}

describe("room week endpoint", () => {
  it("rejects non-members and invalid weekStart values", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const outsider = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const nonMember = await requestJson(app, `/api/rooms/${room.id}/week?weekStart=2026-05-25`, {
      headers: cookieHeader(outsider.cookie),
    });
    expect(nonMember.status).toBe(403);
    expectError(await json(nonMember), "NOT_MEMBER");

    for (const weekStart of ["2026-05-26", "not-a-date"]) {
      const invalid = await requestJson(app, `/api/rooms/${room.id}/week?weekStart=${weekStart}`, {
        headers: cookieHeader(owner.cookie),
      });
      expect(invalid.status).toBe(400);
      expectError(await json(invalid), "INVALID_WEEK_START");
    }
  });

  it("returns stable member colors, ordered members, week meetings, own meetings, and overlapping room events", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db, { name: "Owner" });
    const first = await setupCompleteUser(db, { name: "First" });
    const second = await setupCompleteUser(db, { name: "Second" });
    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: second.user.id, joinedAt: new Date("2026-05-03T00:00:00.000Z") });
    await addRoomMember(db, { roomId: room.id, userId: first.user.id, joinedAt: new Date("2026-05-02T00:00:00.000Z") });

    const ownerOccurrence = await createOccurrence(db, {
      meetingId: owner.meeting.id,
      courseId: owner.course.id,
      date: new Date("2026-05-27T00:00:00.000Z"),
      startMinute: 540,
      endMinute: 630,
    });
    const firstOccurrence = await createOccurrence(db, {
      meetingId: first.meeting.id,
      courseId: first.course.id,
      date: new Date("2026-05-28T00:00:00.000Z"),
      startMinute: 640,
      endMinute: 730,
    });
    await createOccurrence(db, {
      meetingId: second.meeting.id,
      courseId: second.course.id,
      date: new Date("2026-06-03T00:00:00.000Z"),
      startMinute: 780,
      endMinute: 870,
    });
    const inside = await createRoomEvent(db, {
      roomId: room.id,
      authorId: owner.user.id,
      title: "Inside",
      start: new Date("2026-05-27T04:00:00.000Z"),
      end: new Date("2026-05-27T05:00:00.000Z"),
    });
    const spanning = await createRoomEvent(db, {
      roomId: room.id,
      authorId: owner.user.id,
      title: "Spanning",
      start: new Date("2026-05-24T15:00:00.000Z"),
      end: new Date("2026-05-25T01:00:00.000Z"),
    });
    await createRoomEvent(db, {
      roomId: room.id,
      authorId: owner.user.id,
      title: "Outside",
      start: new Date("2026-06-03T04:00:00.000Z"),
      end: new Date("2026-06-03T05:00:00.000Z"),
    });

    const firstRes = await requestJson(app, `/api/rooms/${room.id}/week?weekStart=2026-05-25`, {
      headers: cookieHeader(owner.cookie),
    });
    expect(firstRes.status).toBe(200);
    const body = await json(firstRes) as any;
    expect(body.members.map((member: any) => member.userId)).toEqual([owner.user.id, first.user.id, second.user.id]);
    for (const member of body.members) {
      expect(member.color).toMatch(/^hsl\(\d+, 65%, 55%\)$/);
    }

    const secondRes = await requestJson(app, `/api/rooms/${room.id}/week?weekStart=2026-05-25`, {
      headers: cookieHeader(first.cookie),
    });
    expect(secondRes.status).toBe(200);
    const colorsAgain = (await json(secondRes) as any).members.map((member: any) => [member.userId, member.color]);
    expect(colorsAgain).toEqual(body.members.map((member: any) => [member.userId, member.color]));

    const meetingIds = body.meetings.map((meeting: any) => meeting.occurrenceId);
    expect(meetingIds).toContain(ownerOccurrence.id);
    expect(meetingIds).toContain(firstOccurrence.id);
    expect(body.meetings.find((meeting: any) => meeting.occurrenceId === ownerOccurrence.id).userId).toBe(owner.user.id);

    const eventIds = body.roomEvents.map((event: any) => event.id);
    expect(eventIds).toContain(inside.id);
    expect(eventIds).toContain(spanning.id);
    expect(eventIds).not.toContain(expect.stringMatching(/Outside/));
  });

  it("requires auth and setup completion", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const incomplete = await createTestUser(db);
    const incompleteCookie = await createSessionCookie(db, incomplete.id);
    const room = await createRoom(db, { ownerId: owner.user.id });

    const unauthenticated = await requestJson(app, `/api/rooms/${room.id}/week?weekStart=2026-05-25`);
    expect(unauthenticated.status).toBe(401);
    expectError(await json(unauthenticated), "UNAUTHORIZED");

    const setupRequired = await requestJson(app, `/api/rooms/${room.id}/week?weekStart=2026-05-25`, {
      headers: cookieHeader(incompleteCookie),
    });
    expect(setupRequired.status).toBe(403);
    expectError(await json(setupRequired), "SETUP_REQUIRED");
  });
});
