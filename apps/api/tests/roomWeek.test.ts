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

// ─────────────────────────────────────────────────────────────────────────────
// Reviewer-generated (independent from Developer): recurringMeetings B1-B9
// Source of truth: .designs/20260721-room-recurring-timetable.md §挙動仕様 backend
// ─────────────────────────────────────────────────────────────────────────────

type AnyDb = ReturnType<typeof prisma>;

async function makeSemester(
  db: AnyDb,
  userId: string,
  name: string,
  startDate = new Date("2026-04-01T00:00:00.000Z"),
  endDate = new Date("2026-09-30T14:59:59.000Z"),
) {
  return db.semester.create({ data: { userId, name, startDate, endDate } });
}

async function makeTimetable(
  db: AnyDb,
  userId: string,
  semesterId: string,
  opts: {
    title?: string;
    courseName: string;
    color?: string | null;
    dayOfWeek: number;
    startPeriodIndex?: number;
    periodCount?: number;
    createdAt?: Date;
  },
) {
  const tt = await db.userTimetable.create({
    data: {
      userId,
      semesterId,
      title: opts.title ?? `${opts.courseName} tt`,
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

async function fetchWeek(cookie: string, roomId: string, weekStart = "2026-05-25") {
  const res = await requestJson(app, `/api/rooms/${roomId}/week?weekStart=${weekStart}`, {
    headers: cookieHeader(cookie),
  });
  expect(res.status).toBe(200);
  return (await json(res)) as any;
}

describe("room week recurringMeetings (Reviewer B1-B9)", () => {
  it("B1: single member returns exactly one recurring meeting with mapped fields", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db, { name: "Owner" });
    const room = await createRoom(db, { ownerId: owner.user.id });

    const body = await fetchWeek(owner.cookie, room.id);
    expect(Array.isArray(body.recurringMeetings)).toBe(true);
    expect(body.recurringMeetings).toHaveLength(1);
    const rm = body.recurringMeetings[0];
    expect(rm.userId).toBe(owner.user.id);
    expect(rm.dayOfWeek).toBe(3);
    expect(rm.startPeriodIndex).toBe(1);
    expect(rm.periodCount).toBe(2);
    expect(rm.courseName).toBe("オペレーティングシステム");
    expect(rm.courseColor).toBe("#ffffff");
    expect(rm.timetableId).toBe(owner.userTimetable.id);
    expect(rm.courseId).toBe(owner.course.id);
  });

  it("B2: recurringMeetings are identical regardless of weekStart (in-range vs out-of-range)", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db, { name: "Owner" });
    const room = await createRoom(db, { ownerId: owner.user.id });

    const outOfRange = await fetchWeek(owner.cookie, room.id, "2027-01-04");
    const inRange = await fetchWeek(owner.cookie, room.id, "2026-04-06");

    const norm = (b: any) =>
      [...b.recurringMeetings]
        .map((m: any) => JSON.stringify(m))
        .sort();
    expect(norm(outOfRange)).toEqual(norm(inRange));
    expect(outOfRange.recurringMeetings).toHaveLength(1);
    // occurrence contrast: out-of-range week has no occurrence meetings
    expect(inRange.recurringMeetings).toHaveLength(1);
  });

  it("B3: multiple members overlapping same room appear distinctly by userId", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db, { name: "Owner" }); // 水1-2 OS
    const memberB = await createTestUser(db, { name: "MemberB" });
    const semB = await makeSemester(db, memberB.id, "B sem");
    const ttB = await makeTimetable(db, memberB.id, semB.id, {
      courseName: "科目Y",
      color: "#00ff00",
      dayOfWeek: 3,
      startPeriodIndex: 2,
      periodCount: 1,
    });
    await db.user.update({ where: { id: memberB.id }, data: { defaultSemesterId: semB.id } });
    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: memberB.id, joinedAt: new Date("2026-05-02T00:00:00.000Z") });

    const body = await fetchWeek(owner.cookie, room.id);
    const ownerRm = body.recurringMeetings.find((m: any) => m.userId === owner.user.id);
    const bRm = body.recurringMeetings.find((m: any) => m.userId === memberB.id);
    expect(ownerRm).toBeTruthy();
    expect(ownerRm.startPeriodIndex).toBe(1);
    expect(ownerRm.courseName).toBe("オペレーティングシステム");
    expect(bRm).toBeTruthy();
    expect(bRm.startPeriodIndex).toBe(2);
    expect(bRm.courseName).toBe("科目Y");
    expect(bRm.timetableId).toBe(ttB.tt.id);
  });

  it("B4: defaultSemesterId is preferred over the newest-created timetable", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db, { name: "Owner" });
    const memberB = await createTestUser(db, { name: "MemberB" });
    const semOld = await makeSemester(db, memberB.id, "old");
    const semNew = await makeSemester(db, memberB.id, "new");
    await makeTimetable(db, memberB.id, semOld.id, {
      courseName: "OLD",
      dayOfWeek: 1, // 月
      startPeriodIndex: 1,
      periodCount: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await makeTimetable(db, memberB.id, semNew.id, {
      courseName: "NEW",
      dayOfWeek: 2, // 火
      startPeriodIndex: 1,
      periodCount: 1,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    // defaultSemesterId points at the OLDER (not the newest-created) timetable
    await db.user.update({ where: { id: memberB.id }, data: { defaultSemesterId: semOld.id } });

    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: memberB.id });

    const body = await fetchWeek(owner.cookie, room.id);
    const bRms = body.recurringMeetings.filter((m: any) => m.userId === memberB.id);
    expect(bRms).toHaveLength(1);
    expect(bRms[0].courseName).toBe("OLD");
    expect(bRms[0].dayOfWeek).toBe(1);
  });

  it("B5: with defaultSemesterId null, the newest-created timetable is used (fallback)", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db, { name: "Owner" });
    const memberC = await createTestUser(db, { name: "MemberC", defaultSemesterId: null });
    const semOld = await makeSemester(db, memberC.id, "old");
    const semNew = await makeSemester(db, memberC.id, "new");
    await makeTimetable(db, memberC.id, semOld.id, {
      courseName: "OLD",
      dayOfWeek: 1,
      startPeriodIndex: 1,
      periodCount: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await makeTimetable(db, memberC.id, semNew.id, {
      courseName: "NEW",
      dayOfWeek: 2,
      startPeriodIndex: 1,
      periodCount: 1,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: memberC.id });

    const body = await fetchWeek(owner.cookie, room.id);
    const cRms = body.recurringMeetings.filter((m: any) => m.userId === memberC.id);
    expect(cRms).toHaveLength(1);
    expect(cRms[0].courseName).toBe("NEW");
    expect(cRms[0].dayOfWeek).toBe(2);
  });

  it("B6: a member without any timetable contributes nothing but remains in members", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db, { name: "Owner" });
    const memberD = await createTestUser(db, { name: "MemberD" }); // no timetable at all
    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: memberD.id });

    const body = await fetchWeek(owner.cookie, room.id);
    expect(body.recurringMeetings.some((m: any) => m.userId === memberD.id)).toBe(false);
    expect(body.members.map((m: any) => m.userId)).toContain(memberD.id);
  });

  it("B7: showMemberTimetables=false restricts recurringMeetings to the viewer only", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db, { name: "Owner" }); // 水1-2 OS
    const memberB = await createTestUser(db, { name: "MemberB" });
    const semB = await makeSemester(db, memberB.id, "B sem");
    await makeTimetable(db, memberB.id, semB.id, {
      courseName: "科目Y",
      dayOfWeek: 3,
      startPeriodIndex: 2,
      periodCount: 1,
    });
    await db.user.update({ where: { id: memberB.id }, data: { defaultSemesterId: semB.id } });

    const room = await createRoom(db, { ownerId: owner.user.id });
    await addRoomMember(db, { roomId: room.id, userId: memberB.id });
    await db.room.update({ where: { id: room.id }, data: { showMemberTimetables: false } });

    const body = await fetchWeek(owner.cookie, room.id);
    expect(body.recurringMeetings.length).toBeGreaterThan(0);
    expect(body.recurringMeetings.every((m: any) => m.userId === owner.user.id)).toBe(true);
    expect(body.recurringMeetings.some((m: any) => m.userId === memberB.id)).toBe(false);
  });
});
