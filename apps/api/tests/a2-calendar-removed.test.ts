// A2: カレンダー API 削除 — 設計doc §7.A AD1 / AD2 / AD4〜AD6 / AD10 / AD11 / AD12
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIN_IOS_BUILD } from "../src/lib/clientVersion";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { expectError, json } from "./helpers/http";
import { createRoom } from "./helpers/seedRoom";

type Route = [method: string, path: string];

// 削除した 34 route (:id / :eventId 等はダミー値)
const REMOVED_ROUTES: Route[] = [
  ["GET", "/api/personal-events"],
  ["POST", "/api/personal-events"],
  ["PATCH", "/api/personal-events/x"],
  ["DELETE", "/api/personal-events/x"],
  ["POST", "/api/personal-events/eventkit-sync"],
  ["GET", "/api/personal-events/eventkit-legacy-pushes"],
  ["POST", "/api/personal-events/eventkit-legacy-pushes/clear"],
  ["GET", "/api/rooms/r1/events"],
  ["POST", "/api/rooms/r1/events"],
  ["PATCH", "/api/rooms/r1/events/e1"],
  ["DELETE", "/api/rooms/r1/events/e1"],
  ["POST", "/api/rooms/r1/ics-imports"],
  ["GET", "/api/rooms/r1/ics-imports"],
  ["GET", "/api/rooms/r1/ics-imports/i1/preview"],
  ["POST", "/api/rooms/r1/ics-imports/i1/commit"],
  ["DELETE", "/api/rooms/r1/ics-imports/i1"],
  ["GET", "/api/rooms/r1/google-calendar-syncs"],
  ["POST", "/api/rooms/r1/google-calendar-syncs"],
  ["PATCH", "/api/rooms/r1/google-calendar-syncs/s1"],
  ["DELETE", "/api/rooms/r1/google-calendar-syncs/s1"],
  ["POST", "/api/rooms/r1/google-calendar-syncs/s1/run"],
  ["GET", "/api/rooms/r1/personal-calendar-share"],
  ["POST", "/api/rooms/r1/personal-calendar-share"],
  ["PATCH", "/api/rooms/r1/personal-calendar-share"],
  ["DELETE", "/api/rooms/r1/personal-calendar-share"],
  ["GET", "/api/me/ics-title-rules"],
  ["POST", "/api/me/ics-title-rules"],
  ["PATCH", "/api/me/ics-title-rules/r1"],
  ["DELETE", "/api/me/ics-title-rules/r1"],
  ["GET", "/api/me/google-calendar/connection"],
  ["POST", "/api/me/google-calendar/link/complete"],
  ["DELETE", "/api/me/google-calendar/connection"],
  ["GET", "/api/me/google-calendar/calendars"],
  ["POST", "/api/me/google-calendar/sync-all"],
];

async function call(cookie: string, [method, p]: Route, client: string) {
  const hasBody = method === "POST" || method === "PATCH";
  return app.request(p, {
    method,
    headers: {
      Cookie: cookie,
      "X-Atender-Client": client,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? "{}" : undefined,
  });
}

describe("[A2] calendar API removed", () => {
  it("removes exactly 34 routes", () => {
    expect(REMOVED_ROUTES).toHaveLength(34);
  });

  it.each(REMOVED_ROUTES)("[AD1] %s %s -> 404 for ios/21", async (method, p) => {
    const u = await setupCompleteUser(prisma());
    const res = await call(u.cookie, [method, p], "ios/21");
    expect(res.status).toBe(404);
  });

  it.each(REMOVED_ROUTES)("[AD2] %s %s -> 426 for ios/20", async (method, p) => {
    const u = await setupCompleteUser(prisma());
    const res = await call(u.cookie, [method, p], "ios/20");
    expect(res.status).toBe(426);
    expectError(await json(res), "CLIENT_UPGRADE_REQUIRED");
  });

  it("[AD4] GET /api/rooms/:id/week has no roomEvents key; the rest is kept", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    const res = await app.request(`/api/rooms/${room.id}/week?weekStart=2026-05-25`, { headers: { Cookie: u.cookie } });
    expect(res.status).toBe(200);
    const body = (await json(res)) as any;
    expect(body).not.toHaveProperty("roomEvents");
    expect(Array.isArray(body.members)).toBe(true);
    expect(Array.isArray(body.meetings)).toBe(true);
    expect(Array.isArray(body.recurringMeetings)).toBe(true);
  });

  it("[AD6] GET /api/rooms and /api/rooms/:id have no upcomingEvent key", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    const list = (await json(await app.request("/api/rooms", { headers: { Cookie: u.cookie } }))) as any;
    expect(list.rooms).toHaveLength(1);
    expect(list.rooms[0]).not.toHaveProperty("upcomingEvent");
    expect(list.rooms[0]).toMatchObject({ id: room.id, memberCount: 1, myRole: "OWNER" });
    const one = (await json(await app.request(`/api/rooms/${room.id}`, { headers: { Cookie: u.cookie } }))) as any;
    expect(JSON.stringify(one)).not.toContain("upcomingEvent");
  });

  it("[AD10] the 9 calendar tables do not exist, others do", async () => {
    const rows = (await prisma().$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table'`)) as { name: string }[];
    const names = rows.map((r) => r.name);
    for (const t of [
      "PersonalEvent",
      "PersonalEventOverride",
      "RoomEvent",
      "RoomEventOverride",
      "IcsImport",
      "IcsTitleRule",
      "GoogleCalendarConnection",
      "GoogleCalendarSync",
      "PersonalCalendarShare",
    ]) {
      expect(names).not.toContain(t);
    }
    for (const t of ["User", "Account", "Room", "RoomMembership", "MeetingOccurrence", "TimetableTemplate"]) {
      expect(names).toContain(t);
    }
  });

  it("[AD11] MIN_IOS_BUILD is 21 and GET /version reports it", async () => {
    expect(MIN_IOS_BUILD).toBe(21);
    const res = await app.request("/version");
    expect(res.status).toBe(200);
    expect(((await json(res)) as any).minIOSBuild).toBe(21);
  });

  it("[AD12] apps/api/src has no calendar identifiers; Google sign-in remains", () => {
    const srcRoot = path.join(process.cwd(), "src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) files.push(p);
      }
    };
    walk(srcRoot);
    const pattern = /personalEvent|roomEvent|icsImport|googleCalendar|personalCalendarShare/i;
    const offenders = files.filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    expect(readFileSync(path.join(srcRoot, "auth.ts"), "utf8")).toContain("google");
  });
});
