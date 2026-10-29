// A2 Reviewer 独立テスト (設計doc §3.12 / §7.A AD1〜AD12 / §8.7 / §9 / §10.3)
// a2-calendar-removed.test.ts (Developer 作) が持たない観点: 残す route の contract、成果物 (schema / SQL / shared / package.json / privacy.html) の検査、/version とゲート
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as shared from "@atender/shared";
import { app, prisma } from "./helpers/app";
import { createOccurrence, setupCompleteUser } from "./helpers/auth";
import { expectError, json } from "./helpers/http";
import { createRoom } from "./helpers/seedRoom";

const API_ROOT = process.cwd(); // apps/api
const REPO = path.resolve(API_ROOT, "../..");
const read = (...p: string[]) => readFileSync(path.join(...p), "utf8");

describe("[A2 review] gate: /version and X-Atender-Client", () => {
  it("[AD11] GET /version -> minIOSBuild == 21 (design-mandated literal)", async () => {
    const res = await app.request("/version");
    expect(res.status).toBe(200);
    expect(((await json(res)) as any).minIOSBuild).toBe(21);
  });

  it.each([12, 19, 20])("[AD2] ios/%i on a kept route -> 426 CLIENT_UPGRADE_REQUIRED", async (b) => {
    const u = await setupCompleteUser(prisma());
    const res = await app.request("/api/me", { headers: { Cookie: u.cookie, "X-Atender-Client": `ios/${b}` } });
    expect(res.status).toBe(426);
    expectError(await json(res), "CLIENT_UPGRADE_REQUIRED");
  });

  it.each([21, 22])("[AD11] ios/%i passes the gate", async (b) => {
    const u = await setupCompleteUser(prisma());
    const res = await app.request("/api/me", { headers: { Cookie: u.cookie, "X-Atender-Client": `ios/${b}` } });
    expect(res.status).toBe(200);
  });
});

describe("[A2 review] kept routes still alive (ios/21)", () => {
  const H = (cookie: string) => ({ Cookie: cookie, "X-Atender-Client": "ios/21" });

  it("[AD3] GET /api/occurrences returns the seeded occurrence", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    await createOccurrence(db, {
      meetingId: u.meeting.id,
      courseId: u.course.id,
      date: new Date("2026-07-23T00:00:00.000Z"),
      periodOffset: 0,
      startMinute: 540,
      endMinute: 630,
    });
    const res = await app.request("/api/occurrences?from=2026-07-20&to=2026-07-26", { headers: H(u.cookie) });
    expect(res.status).toBe(200);
    const body = (await json(res)) as any;
    expect(JSON.stringify(body)).toContain("2026-07-23");
  });

  it("[AD7] POST /api/class-transfers exists (not 404; invalid body -> 400)", async () => {
    const u = await setupCompleteUser(prisma());
    const res = await app.request("/api/class-transfers", {
      method: "POST",
      headers: { ...H(u.cookie), "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("[AD4] GET /api/rooms/:id/week keeps members/meetings/recurringMeetings, no roomEvents", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: u.user.id });
    const res = await app.request(`/api/rooms/${room.id}/week?weekStart=2026-05-25`, { headers: H(u.cookie) });
    expect(res.status).toBe(200);
    const body = (await json(res)) as any;
    expect(Object.keys(body)).not.toContain("roomEvents");
    expect(body.members).toHaveLength(1);
    expect(Array.isArray(body.meetings)).toBe(true);
    expect(Array.isArray(body.recurringMeetings)).toBe(true);
  });

  it("[AD5] GET /api/day/:date has no personalEvents key", async () => {
    const u = await setupCompleteUser(prisma());
    const res = await app.request("/api/day/2026-07-23", { headers: H(u.cookie) });
    expect(res.status).toBe(200);
    const body = (await json(res)) as any;
    expect(Object.keys(body)).not.toContain("personalEvents");
  });

  it("[AD8] GET /api/me works; GET /api/timetable-templates works", async () => {
    const u = await setupCompleteUser(prisma());
    const me = await app.request("/api/me", { headers: H(u.cookie) });
    expect(me.status).toBe(200);
    expect(((await json(me)) as any).user.email).toBe(u.user.email);
    const t = await app.request("/api/timetable-templates?q=x", { headers: H(u.cookie) });
    expect(t.status).toBe(200);
  });

  it("[AD9] Google sign-in auth route is alive (not 404); magic-link route too", async () => {
    const g = await app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Atender-Client": "ios/21" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    expect(g.status).not.toBe(404);
    expect(g.status).not.toBe(426);
    const m = await app.request("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Atender-Client": "ios/21" },
      body: JSON.stringify({ email: "x@example.test" }),
    });
    expect(m.status).not.toBe(404);
  });
});

describe("[A2 review] artifacts", () => {
  const schema = read(API_ROOT, "prisma/schema.prisma");
  const MODELS = [
    "PersonalEvent",
    "PersonalEventOverride",
    "RoomEvent",
    "RoomEventOverride",
    "IcsImport",
    "IcsTitleRule",
    "GoogleCalendarConnection",
    "GoogleCalendarSync",
    "PersonalCalendarShare",
  ];
  const ENUMS = [
    "EventSource",
    "RoomEventSource",
    "EventVisibility",
    "IcsImportStatus",
    "TitleMatchType",
    "GoogleConnStatus",
    "GoogleSyncStatus",
  ];

  it.each(MODELS)("[schema] model %s is gone", (m) => {
    expect(schema).not.toMatch(new RegExp(`^model\\s+${m}\\s*\\{`, "m"));
  });
  it.each(ENUMS)("[schema] enum %s is gone", (e) => {
    expect(schema).not.toMatch(new RegExp(`^enum\\s+${e}\\s*\\{`, "m"));
  });
  it("[schema] Account/User/Room kept, no dangling calendar relations", () => {
    expect(schema).toMatch(/^model\s+Account\s*\{/m);
    expect(schema).toMatch(/^model\s+User\s*\{/m);
    expect(schema).toMatch(/^model\s+Room\s*\{/m);
    expect(schema).not.toMatch(/authoredRoomEvents|googleCalendarConnection|icsTitleRules|personalCalendarShares|googleCalendarSyncs/);
    expect(schema).toMatch(/^model\s+Account\s*\{[^}]*accessToken/m);
  });

  it("[migration] a DROP migration newer than all others, children before parents, PRAGMA wrapped", () => {
    const dir = path.join(API_ROOT, "prisma/migrations");
    const names = readdirSync(dir).filter((n) => /^\d+_/.test(n)).sort();
    const drops = names.filter((n) => /drop_calendar/.test(n));
    expect(drops).toHaveLength(1);
    expect(names[names.length - 1]).toBe(drops[0]);
    const sql = read(dir, drops[0], "migration.sql");
    const stmts = sql
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("--"));
    expect(stmts[0]).toBe("PRAGMA foreign_keys=OFF;");
    expect(stmts[stmts.length - 1]).toBe("PRAGMA foreign_keys=ON;");
    const dropped = stmts.filter((s) => s.startsWith("DROP TABLE")).map((s) => s.match(/"(\w+)"/)![1]);
    expect([...dropped].sort()).toEqual([...MODELS].sort());
    const idx = (n: string) => dropped.indexOf(n);
    // 子 → 親
    expect(idx("RoomEventOverride")).toBeLessThan(idx("RoomEvent"));
    expect(idx("PersonalEventOverride")).toBeLessThan(idx("PersonalEvent"));
    expect(idx("RoomEvent")).toBeLessThan(dropped.length);
    // 余計な破壊的文が無い
    expect(stmts.filter((s) => /^(DELETE|UPDATE|ALTER|CREATE)/i.test(s))).toEqual([]);
  });

  it("[shared] no calendar schemas exported; files removed", () => {
    const keys = Object.keys(shared);
    const bad = keys.filter((k) => /PersonalEvent|RoomEvent|IcsImport|IcsTitleRule|GoogleCalendar|GoogleSync|PersonalCalendarShare|Recurrence|Rrule/i.test(k));
    expect(bad).toEqual([]);
    const sdir = path.join(REPO, "packages/shared/src");
    for (const f of ["schemas/personalEvent.ts", "schemas/recurrence.ts", "schemas/ics.ts", "schemas/google.ts", "recurrence/rrule.ts"]) {
      expect(existsSync(path.join(sdir, f))).toBe(false);
    }
    const idx = read(sdir, "index.ts");
    expect(idx).not.toMatch(/personalEvent|recurrence|\/ics|\/google|rrule/i);
  });

  it("[shared] RoomWeekDto/DayDetailDto/RoomSummaryDto shapes lack removed keys but keep core keys", () => {
    const shape = (s: any) => Object.keys(s?.shape ?? s?._def?.shape?.() ?? {});
    const week = shape((shared as any).RoomWeekDto);
    const day = shape((shared as any).DayDetailDto);
    const sum = shape((shared as any).RoomSummaryDto);
    if (week.length) {
      expect(week).not.toContain("roomEvents");
      expect(week).toContain("members");
    }
    if (day.length) expect(day).not.toContain("personalEvents");
    if (sum.length) expect(sum).not.toContain("upcomingEvent");
  });

  it.each(["node-ical", "rrule", "iconv-lite", "jschardet"])("[package.json] %s removed from api dependencies", (pkg) => {
    const p = JSON.parse(read(API_ROOT, "package.json"));
    expect(Object.keys({ ...p.dependencies, ...p.devDependencies })).not.toContain(pkg);
  });

  it("[removed files] calendar services/routes/scripts do not exist", () => {
    for (const f of [
      "src/routes/personalEvents.ts",
      "src/services/personalEvent.service.ts",
      "src/services/icsImport.service.ts",
      "src/services/googleCalendar.service.ts",
      "src/services/googleCalendarSync.service.ts",
      "src/services/googleAccessToken.service.ts",
      "src/lib/rruleExpand.ts",
      "src/lib/icsParse.ts",
      "src/lib/googleApi.ts",
      "scripts/sync-google-calendars.ts",
    ]) {
      expect(existsSync(path.join(API_ROOT, f)), f).toBe(false);
    }
    expect(existsSync(path.join(API_ROOT, "src/services/tokenRevocation.service.ts"))).toBe(true);
  });

  it("[§10.3.2] privacy.html final wording: 削除しました, not 提供終了に伴い削除します", () => {
    const html = read(REPO, "apps/web/public/privacy.html");
    expect(html).toContain("提供を終了しました");
    expect(html).toContain("終了した機能のデータ");
    expect(html).toContain("は削除しました");
    expect(html).not.toContain("提供終了に伴い削除します");
    expect(html).not.toContain("読み込むカレンダーはiOSアプリの設定から変更できます");
    expect(html).toContain("カレンダーの内容をサーバーに送信しません");
    expect(html).toContain("Googleでのサインイン");
  });
});
