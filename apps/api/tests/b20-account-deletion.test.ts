import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app, prisma } from "./helpers/app";
import {
  createOccurrence,
  createSchoolDepartment,
  createSemester,
  createSessionCookie,
  createTestUser,
  createUserTimetable,
  setupCompleteUser,
} from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";
import { addRoomMember, createRoom, createRoomEvent } from "./helpers/seedRoom";

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

const APPLE_ENV_KEYS = [
  "APPLE_CLIENT_ID",
  "APPLE_APP_BUNDLE_ID",
  "APPLE_CLIENT_SECRET",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
] as const;

const savedEnv: Partial<Record<(typeof APPLE_ENV_KEYS)[number], string>> = {};
for (const key of APPLE_ENV_KEYS) {
  const v = process.env[key];
  if (v !== undefined) savedEnv[key] = v;
}

function p256Pem(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function setAppleEnv(opts: { servicesId?: boolean } = {}) {
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_KEY_ID = "KEY1234567";
  process.env.APPLE_PRIVATE_KEY = p256Pem();
  process.env.APPLE_APP_BUNDLE_ID = "net.appily.atender";
  if (opts.servicesId === false) delete process.env.APPLE_CLIENT_ID;
  else process.env.APPLE_CLIENT_ID = "net.appily.atender.web";
}

function clearAppleEnv() {
  for (const key of APPLE_ENV_KEYS) delete process.env[key];
}

function jwtPayload(jwt: string): Record<string, unknown> {
  const segs = jwt.split(".");
  expect(segs).toHaveLength(3);
  return JSON.parse(Buffer.from(segs[1], "base64url").toString("utf8"));
}

type FetchCall = { url: string; init: RequestInit; form: URLSearchParams };

function fetchCalls(spy: ReturnType<typeof vi.spyOn>): FetchCall[] {
  return spy.mock.calls.map((c: any[]) => {
    const url = typeof c[0] === "string" ? c[0] : c[0] instanceof URL ? c[0].toString() : (c[0] as Request).url;
    const init = (c[1] ?? {}) as RequestInit;
    const form = new URLSearchParams(typeof init.body === "string" ? init.body : String(init.body ?? ""));
    return { url, init, form };
  });
}

function headerOf(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 200 }));
  clearAppleEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearAppleEnv();
  for (const key of APPLE_ENV_KEYS) {
    const v = savedEnv[key];
    if (v !== undefined) process.env[key] = v;
  }
});

function bearerFrom(cookie: string) {
  return cookie.slice(cookie.indexOf("=") + 1);
}

async function setupUser(name = "U") {
  const db = prisma();
  const { school, department } = await createSchoolDepartment(db);
  const semesterOwner = await createTestUser(db, { schoolId: school.id, departmentId: department.id, name });
  const semester = await createSemester(db, semesterOwner.id);
  const user = await db.user.update({ where: { id: semesterOwner.id }, data: { defaultSemesterId: semester.id } });
  const cookie = await createSessionCookie(db, user.id);
  return { user, school, department, semester, cookie };
}

async function del(cookie: string) {
  return app.request("/api/me", { method: "DELETE", headers: { Cookie: cookie } });
}

// ---------------------------------------------------------------------------
// #D
// ---------------------------------------------------------------------------

describe("[B20 #D] DELETE /api/me", () => {
  it("#D1 deletes the user and every personal row; other users untouched", async () => {
    const db = prisma();
    const u = await setupUser();
    const a = await setupCompleteUser(db);
    const b = await setupCompleteUser(db);
    const tt = await createUserTimetable(db, u.user.id, u.semester.id);
    const occ = await createOccurrence(db, { meetingId: tt.meeting.id, courseId: tt.course.id });
    await db.attendanceRecord.create({ data: { occurrenceId: occ.id, userId: u.user.id, status: "PRESENT" } });
    await db.personalEvent.create({
      data: {
        userId: u.user.id,
        title: "p",
        start: new Date("2026-06-01T00:00:00Z"),
        end: new Date("2026-06-01T01:00:00Z"),
      },
    });
    await db.icsTitleRule.create({ data: { userId: u.user.id, matchType: "EQUALS", pattern: "x" } });
    await db.friendship.create({ data: { senderId: u.user.id, receiverId: a.user.id, status: "ACCEPTED" } });
    await db.friendship.create({ data: { senderId: b.user.id, receiverId: u.user.id, status: "PENDING" } });
    await db.account.create({
      data: { id: "acc-g-d1", accountId: "g-sub-d1", providerId: "google", userId: u.user.id },
    });

    const res = await del(u.cookie);
    expect(res.status).toBe(204);
    expect((await res.text()).length).toBe(0);

    const U = u.user.id;
    expect(await db.user.count({ where: { id: U } })).toBe(0);
    expect(await db.session.count({ where: { userId: U } })).toBe(0);
    expect(await db.account.count({ where: { userId: U } })).toBe(0);
    expect(await db.semester.count({ where: { userId: U } })).toBe(0);
    expect(await db.userTimetable.count({ where: { userId: U } })).toBe(0);
    expect(await db.attendanceRecord.count({ where: { userId: U } })).toBe(0);
    expect(await db.personalEvent.count({ where: { userId: U } })).toBe(0);
    expect(await db.icsTitleRule.count({ where: { userId: U } })).toBe(0);
    expect(await db.friendship.count({ where: { OR: [{ senderId: U }, { receiverId: U }] } })).toBe(0);
    expect(await db.user.count({ where: { id: { in: [a.user.id, b.user.id] } } })).toBe(2);
    expect(await db.semester.count({ where: { userId: a.user.id } })).toBe(1);
    expect(await db.semester.count({ where: { userId: b.user.id } })).toBe(1);
  });

  it("#D2 un-setup user (no school / department / default semester) can delete", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);
    const res = await del(cookie);
    expect(res.status).toBe(204);
    expect(await db.user.count({ where: { id: user.id } })).toBe(0);
  });

  it("#D3 unauthenticated -> 401 UNAUTHORIZED, user count unchanged", async () => {
    const db = prisma();
    await createTestUser(db);
    const before = await db.user.count();
    const res = await app.request("/api/me", { method: "DELETE" });
    expect(res.status).toBe(401);
    expectError(await json(res), "UNAUTHORIZED");
    expect(await db.user.count()).toBe(before);
  });

  it("#D4 old cookie / Bearer token is dead after deletion", async () => {
    const u = await setupUser();
    expect((await del(u.cookie)).status).toBe(204);

    const getCookie = await app.request("/api/me", { headers: { Cookie: u.cookie } });
    expect(getCookie.status).toBe(401);
    const getBearer = await app.request("/api/me", { headers: { Authorization: `Bearer ${bearerFrom(u.cookie)}` } });
    expect(getBearer.status).toBe(401);
    const delAgain = await del(u.cookie);
    expect(delAgain.status).toBe(401);
  });

  it("#D5 Bearer-only DELETE -> 204", async () => {
    const db = prisma();
    const u = await setupUser();
    const res = await app.request("/api/me", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bearerFrom(u.cookie)}` },
    });
    expect(res.status).toBe(204);
    expect(await db.user.count({ where: { id: u.user.id } })).toBe(0);
  });

  it("#D6 OWNER is transferred to the oldest remaining member (role + createdByUserId)", async () => {
    const db = prisma();
    const u = await setupUser();
    const a = await setupCompleteUser(db);
    const b = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    await addRoomMember(db, { roomId: room.id, userId: a.user.id, joinedAt: new Date("2026-05-02T00:00:00Z") });
    await addRoomMember(db, { roomId: room.id, userId: b.user.id, joinedAt: new Date("2026-05-03T00:00:00Z") });
    const ev = await createRoomEvent(db, { roomId: room.id, authorId: a.user.id });

    expect((await del(u.cookie)).status).toBe(204);

    const r = await db.room.findUnique({ where: { id: room.id } });
    expect(r).not.toBeNull();
    expect(r!.createdByUserId).toBe(a.user.id);
    const ms = await db.roomMembership.findMany({ where: { roomId: room.id } });
    expect(ms).toHaveLength(2);
    expect(ms.find((m) => m.userId === a.user.id)!.role).toBe("OWNER");
    expect(ms.find((m) => m.userId === b.user.id)!.role).toBe("MEMBER");
    const e = await db.roomEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(e.authorId).toBe(a.user.id);
  });

  it.each([
    ["m-a", "m-b", "A"],
    ["m-b", "m-a", "B"],
  ])("#D7 same joinedAt -> membership id ascending decides (A id=%s, B id=%s -> %s)", async (idA, idB, expected) => {
    const db = prisma();
    const u = await setupUser();
    const a = await setupCompleteUser(db);
    const b = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    const same = new Date("2026-05-02T00:00:00Z");
    await db.roomMembership.create({ data: { id: idA, roomId: room.id, userId: a.user.id, role: "MEMBER", joinedAt: same } });
    await db.roomMembership.create({ data: { id: idB, roomId: room.id, userId: b.user.id, role: "MEMBER", joinedAt: same } });

    expect((await del(u.cookie)).status).toBe(204);

    const winner = expected === "A" ? a.user.id : b.user.id;
    const r = await db.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(r.createdByUserId).toBe(winner);
    const owner = await db.roomMembership.findFirstOrThrow({ where: { roomId: room.id, role: "OWNER" } });
    expect(owner.userId).toBe(winner);
  });

  it("#D8 room with no remaining member is deleted with all children", async () => {
    const db = prisma();
    const u = await setupUser();
    const room = await createRoom(db, { ownerId: u.user.id });
    const imp = await db.icsImport.create({
      data: { userId: u.user.id, roomId: room.id, source: "ICS_FILE", contentHash: "h", rawText: "BEGIN:VCALENDAR" },
    });
    const e1 = await db.roomEvent.create({
      data: {
        roomId: room.id,
        authorId: u.user.id,
        title: "m",
        start: new Date("2026-05-27T04:00:00Z"),
        end: new Date("2026-05-27T05:00:00Z"),
        source: "MANUAL",
      },
    });
    await db.roomEvent.create({
      data: {
        roomId: room.id,
        authorId: u.user.id,
        title: "i",
        start: new Date("2026-05-28T04:00:00Z"),
        end: new Date("2026-05-28T05:00:00Z"),
        source: "ICS_FILE",
        importId: imp.id,
      },
    });
    await db.roomEventOverride.create({
      data: { seriesId: e1.id, originalDate: new Date("2026-05-27T04:00:00Z"), isCancelled: true },
    });

    expect((await del(u.cookie)).status).toBe(204);

    expect(await db.room.count({ where: { id: room.id } })).toBe(0);
    expect(await db.roomEvent.count({ where: { roomId: room.id } })).toBe(0);
    expect(await db.roomEventOverride.count({ where: { seriesId: e1.id } })).toBe(0);
    expect(await db.roomMembership.count({ where: { roomId: room.id } })).toBe(0);
  });

  async function seedRoomWithContributions() {
    const db = prisma();
    const u = await setupUser();
    const a = await setupCompleteUser(db);
    const ra = await createRoom(db, { ownerId: a.user.id, name: "RA" });
    await addRoomMember(db, { roomId: ra.id, userId: u.user.id });
    const imp = await db.icsImport.create({
      data: { userId: u.user.id, roomId: ra.id, source: "ICS_FILE", contentHash: "h", rawText: "BEGIN:VCALENDAR" },
    });
    const mk = (title: string, source: any, extra: Record<string, unknown> = {}) =>
      db.roomEvent.create({
        data: {
          roomId: ra.id,
          authorId: u.user.id,
          title,
          start: new Date("2026-05-27T04:00:00Z"),
          end: new Date("2026-05-27T05:00:00Z"),
          source,
          ...extra,
        },
      });
    const e1 = await mk("E1", "MANUAL");
    const e2 = await mk("E2", "ICS_FILE", { importId: imp.id });
    return { db, u, a, ra, e1, e2, mk };
  }

  it("#D9 contributions to someone else's room survive with authorId NULL", async () => {
    const { db, u, a, ra, e1, e2 } = await seedRoomWithContributions();
    expect((await del(u.cookie)).status).toBe(204);

    expect(await db.roomMembership.count({ where: { roomId: ra.id, userId: u.user.id } })).toBe(0);
    const room = await db.room.findUniqueOrThrow({ where: { id: ra.id } });
    expect(room.createdByUserId).toBe(a.user.id);
    const r1 = await db.roomEvent.findUniqueOrThrow({ where: { id: e1.id } });
    const r2 = await db.roomEvent.findUniqueOrThrow({ where: { id: e2.id } });
    expect(r1.authorId).toBeNull();
    expect(r2.authorId).toBeNull();
    expect(r2.importId).toBeNull();
  });

  it("#D10 DTOs return authorId sentinel \"\" (not null) for anonymised events", async () => {
    const { u, a, ra, e1, e2 } = await seedRoomWithContributions();
    expect((await del(u.cookie)).status).toBe(204);

    const list = await requestJson(app, `/api/rooms/${ra.id}/events?from=2026-05-01T00:00:00.000Z&to=2026-06-30T00:00:00.000Z`, {
      headers: { Cookie: a.cookie },
    });
    expect(list.status).toBe(200);
    const events = ((await json(list)) as any).events as any[];
    const g1 = events.find((e) => e.id === e1.id);
    const g2 = events.find((e) => e.id === e2.id);
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
    expect(g1.authorId).toBe("");
    expect(g2.authorId).toBe("");

    const week = await requestJson(app, `/api/rooms/${ra.id}/week?weekStart=2026-05-25`, { headers: { Cookie: a.cookie } });
    expect(week.status).toBe(200);
    const wevents = ((await json(week)) as any).roomEvents as any[];
    const w1 = wevents.find((e) => e.id === e1.id);
    expect(w1).toBeDefined();
    expect(w1.authorId).toBe("");
  });

  it("#D11 projections (PERSONAL / GOOGLE_OAUTH) are deleted, MANUAL / ICS_FILE remain", async () => {
    const { db, u, ra, e1, e2, mk } = await seedRoomWithContributions();
    const e3 = await mk("E3", "PERSONAL", { externalUid: "pe:x" });
    const e4 = await mk("E4", "GOOGLE_OAUTH");
    expect((await del(u.cookie)).status).toBe(204);

    expect(await db.roomEvent.count({ where: { id: { in: [e3.id, e4.id] } } })).toBe(0);
    const remaining = await db.roomEvent.findMany({ where: { roomId: ra.id } });
    expect(remaining.map((e) => e.id).sort()).toEqual([e1.id, e2.id].sort());
  });

  it("#D12 anonymised event cannot be edited by room owner (403 NOT_AUTHOR)", async () => {
    const { u, a, ra, e1 } = await seedRoomWithContributions();
    expect((await del(u.cookie)).status).toBe(204);
    const res = await requestJson(app, `/api/rooms/${ra.id}/events/${e1.id}`, {
      method: "PATCH",
      headers: { Cookie: a.cookie },
      body: { title: "changed" },
    });
    expect(res.status).toBe(403);
    expectError(await json(res), "NOT_AUTHOR");
  });

  async function seedPublicTemplate(authorId: string, schoolId: string, departmentId: string, isPublic: boolean, copyCount = 0) {
    const db = prisma();
    const t = await db.timetableTemplate.create({
      data: { authorUserId: authorId, schoolId, departmentId, title: isPublic ? "T1" : "T2", isPublic, copyCount },
    });
    await db.templateDaySlot.create({
      data: { templateId: t.id, periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630 },
    });
    const c = await db.templateCourse.create({ data: { templateId: t.id, name: "OS" } });
    await db.templateMeeting.create({
      data: { templateId: t.id, courseId: c.id, dayOfWeek: 3, startPeriodIndex: 1, periodCount: 1 },
    });
    return t;
  }

  it("#D13 public template is anonymised and kept (children, copyCount, copies intact)", async () => {
    const db = prisma();
    const u = await setupUser();
    const c = await setupCompleteUser(db);
    const t1 = await seedPublicTemplate(u.user.id, u.school.id, u.department.id, true, 3);
    const cs = await createSemester(db, c.user.id, { name: "copy-sem" });
    const copy = await createUserTimetable(db, c.user.id, cs.id, { sourceTemplateId: t1.id });

    expect((await del(u.cookie)).status).toBe(204);

    const t = await db.timetableTemplate.findUnique({ where: { id: t1.id } });
    expect(t).not.toBeNull();
    expect(t!.authorUserId).toBeNull();
    expect(t!.copyCount).toBe(3);
    expect(await db.templateDaySlot.count({ where: { templateId: t1.id } })).toBe(1);
    expect(await db.templateCourse.count({ where: { templateId: t1.id } })).toBe(1);
    expect(await db.templateMeeting.count({ where: { templateId: t1.id } })).toBe(1);
    const ut = await db.userTimetable.findUniqueOrThrow({ where: { id: copy.userTimetable.id } });
    expect(ut.sourceTemplateId).toBe(t1.id);
  });

  it("#D14 template DTO uses sentinel \"\"; non-author PATCH / DELETE stay 403 FORBIDDEN", async () => {
    const db = prisma();
    const u = await setupUser();
    const c = await setupCompleteUser(db);
    const t1 = await seedPublicTemplate(u.user.id, u.school.id, u.department.id, true, 3);
    expect((await del(u.cookie)).status).toBe(204);

    const list = await app.request(`/api/timetable-templates?schoolId=${u.school.id}&departmentId=${u.department.id}`, {
      headers: { Cookie: c.cookie },
    });
    expect(list.status).toBe(200);
    const found = ((await json(list)) as any).templates.find((t: any) => t.id === t1.id);
    expect(found).toBeDefined();
    expect(found.authorUserId).toBe("");

    const patch = await requestJson(app, `/api/timetable-templates/${t1.id}`, {
      method: "PATCH",
      headers: { Cookie: c.cookie },
      body: { title: "hijack" },
    });
    expect(patch.status).toBe(403);
    expectError(await json(patch), "FORBIDDEN");
    const delT = await app.request(`/api/timetable-templates/${t1.id}`, { method: "DELETE", headers: { Cookie: c.cookie } });
    expect(delT.status).toBe(403);
    expectError(await json(delT), "FORBIDDEN");
  });

  it("#D15 private template is hard-deleted with its children", async () => {
    const db = prisma();
    const u = await setupUser();
    const t2 = await seedPublicTemplate(u.user.id, u.school.id, u.department.id, false);
    expect((await del(u.cookie)).status).toBe(204);
    expect(await db.timetableTemplate.count({ where: { id: t2.id } })).toBe(0);
    expect(await db.templateDaySlot.count({ where: { templateId: t2.id } })).toBe(0);
    expect(await db.templateCourse.count({ where: { templateId: t2.id } })).toBe(0);
    expect(await db.templateMeeting.count({ where: { templateId: t2.id } })).toBe(0);
  });

  it("#D16 School / Department created by the user remain with createdByUserId NULL", async () => {
    const db = prisma();
    const u = await setupUser();
    await db.school.update({ where: { id: u.school.id }, data: { createdByUserId: u.user.id } });
    await db.department.update({ where: { id: u.department.id }, data: { createdByUserId: u.user.id } });
    expect((await del(u.cookie)).status).toBe(204);
    const s = await db.school.findUnique({ where: { id: u.school.id } });
    const d = await db.department.findUnique({ where: { id: u.department.id } });
    expect(s).not.toBeNull();
    expect(d).not.toBeNull();
    expect(s!.createdByUserId).toBeNull();
    expect(d!.createdByUserId).toBeNull();
  });

  it("#D17 Google revoke: one POST to oauth2.googleapis.com/revoke with refresh token (access token fallback)", async () => {
    const db = prisma();
    const u = await setupUser();
    await db.account.create({
      data: { id: "acc-g", accountId: "g-sub", providerId: "google", userId: u.user.id, refreshToken: "g-refresh", accessToken: "g-access" },
    });
    expect((await del(u.cookie)).status).toBe(204);
    let calls = fetchCalls(fetchSpy);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/revoke");
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0].init, "Content-Type")).toBe("application/x-www-form-urlencoded");
    expect(calls[0].form.get("token")).toBe("g-refresh");
    expect(calls[0].init.signal).toBeDefined();

    // access-token-only
    fetchSpy.mockClear();
    const u2 = await setupUser("U2");
    await db.account.create({
      data: { id: "acc-g2", accountId: "g-sub2", providerId: "google", userId: u2.user.id, refreshToken: null, accessToken: "g-access" },
    });
    expect((await del(u2.cookie)).status).toBe(204);
    calls = fetchCalls(fetchSpy);
    expect(calls).toHaveLength(1);
    expect(calls[0].form.get("token")).toBe("g-access");
  });

  it("#D18 Apple revoke: Bundle ID then Services ID, signed client_secret per client_id", async () => {
    const db = prisma();
    setAppleEnv();
    const u = await setupUser();
    await db.account.create({
      data: { id: "acc-a", accountId: "apple-sub-u", providerId: "apple", userId: u.user.id, refreshToken: "a-refresh" },
    });
    expect((await del(u.cookie)).status).toBe(204);
    const calls = fetchCalls(fetchSpy);
    expect(calls).toHaveLength(2);
    const ids = ["net.appily.atender", "net.appily.atender.web"];
    calls.forEach((call, i) => {
      expect(call.url).toBe("https://appleid.apple.com/auth/revoke");
      expect(call.init.method).toBe("POST");
      expect(headerOf(call.init, "Content-Type")).toBe("application/x-www-form-urlencoded");
      expect(call.form.get("client_id")).toBe(ids[i]);
      expect(call.form.get("token")).toBe("a-refresh");
      expect(call.form.get("token_type_hint")).toBe("refresh_token");
      const payload = jwtPayload(call.form.get("client_secret")!);
      expect(payload.sub).toBe(ids[i]);
      expect(payload.iss).toBe("TEAM123456");
      expect(payload.aud).toBe("https://appleid.apple.com");
    });

    // without APPLE_CLIENT_ID only the Bundle ID is tried
    fetchSpy.mockClear();
    delete process.env.APPLE_CLIENT_ID;
    const u2 = await setupUser("U2");
    await db.account.create({
      data: { id: "acc-a2", accountId: "apple-sub-u2", providerId: "apple", userId: u2.user.id, refreshToken: "a-refresh2" },
    });
    expect((await del(u2.cookie)).status).toBe(204);
    const calls2 = fetchCalls(fetchSpy);
    expect(calls2).toHaveLength(1);
    expect(calls2[0].form.get("client_id")).toBe("net.appily.atender");
  });

  it("#D19 no tokens (Apple all null / no Account at all) -> no fetch", async () => {
    const db = prisma();
    setAppleEnv();
    const u = await setupUser();
    await db.account.create({ data: { id: "acc-a", accountId: "apple-sub-u", providerId: "apple", userId: u.user.id } });
    expect((await del(u.cookie)).status).toBe(204);
    expect(fetchSpy).not.toHaveBeenCalled();

    const u2 = await setupUser("U2");
    expect((await del(u2.cookie)).status).toBe(204);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("#D20 Apple not configured -> no Apple fetch, still 204 and user deleted", async () => {
    const db = prisma();
    setAppleEnv();
    delete process.env.APPLE_TEAM_ID;
    const u = await setupUser();
    await db.account.create({
      data: { id: "acc-a", accountId: "apple-sub-u", providerId: "apple", userId: u.user.id, refreshToken: "a-refresh" },
    });
    expect((await del(u.cookie)).status).toBe(204);
    expect(fetchCalls(fetchSpy).filter((c) => c.url.includes("appleid.apple.com"))).toHaveLength(0);
    expect(await db.user.count({ where: { id: u.user.id } })).toBe(0);
  });

  it.each([
    ["HTTP 400", () => fetchSpy.mockImplementation(async () => new Response("", { status: 400 }))],
    ["network error", () => fetchSpy.mockRejectedValue(new Error("network"))],
  ])("#D21 revoke failure (%s) does not block deletion and logs no secrets", async (_label, arm) => {
    const db = prisma();
    setAppleEnv();
    const u = await setupUser();
    await db.account.create({
      data: { id: "acc-g", accountId: "g-sub", providerId: "google", userId: u.user.id, refreshToken: "g-refresh" },
    });
    await db.account.create({
      data: { id: "acc-a", accountId: "apple-sub-u", providerId: "apple", userId: u.user.id, refreshToken: "a-refresh" },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    arm();

    const res = await del(u.cookie);
    expect(res.status).toBe(204);
    expect(await db.user.count({ where: { id: u.user.id } })).toBe(0);
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(1);
    const logged = JSON.stringify(warn.mock.calls, (_k, v) => (v instanceof Error ? { message: v.message, stack: v.stack } : v));
    expect(logged).not.toContain("g-refresh");
    expect(logged).not.toContain("a-refresh");
    for (const call of fetchCalls(fetchSpy)) {
      const secret = call.form.get("client_secret");
      if (secret) expect(logged).not.toContain(secret);
    }
  });

  it("#D22 revoke happens after commit (user already gone when fetch runs)", async () => {
    const db = prisma();
    const u = await setupUser();
    await db.account.create({
      data: { id: "acc-g", accountId: "g-sub", providerId: "google", userId: u.user.id, refreshToken: "g-refresh" },
    });
    const seen: unknown[] = [];
    fetchSpy.mockImplementation(async () => {
      seen.push(await prisma().user.findUnique({ where: { id: u.user.id } }));
      return new Response("", { status: 200 });
    });
    expect((await del(u.cookie)).status).toBe(204);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    for (const s of seen) expect(s).toBeNull();
  });

  it("#D23 double submit: no 500, user gone, revoke fetched once", async () => {
    const db = prisma();
    const u = await setupUser();
    await db.account.create({
      data: { id: "acc-g", accountId: "g-sub", providerId: "google", userId: u.user.id, refreshToken: "g-refresh" },
    });
    const [r1, r2] = await Promise.all([del(u.cookie), del(u.cookie)]);
    for (const r of [r1, r2]) expect([204, 401]).toContain(r.status);
    expect([r1.status, r2.status]).toContain(204);
    expect(await db.user.count({ where: { id: u.user.id } })).toBe(0);
    expect(fetchCalls(fetchSpy)).toHaveLength(1);
  });

  it("#D24 transaction failure -> 500 INTERNAL, user remains, no revoke", async () => {
    const db = prisma();
    const u = await setupUser();
    await db.account.create({
      data: { id: "acc-g", accountId: "g-sub", providerId: "google", userId: u.user.id, refreshToken: "g-refresh" },
    });
    vi.spyOn(prisma(), "$transaction").mockRejectedValueOnce(new Error("db"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await del(u.cookie);
    expect(res.status).toBe(500);
    expectError(await json(res), "INTERNAL");
    expect(await db.user.count({ where: { id: u.user.id } })).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
