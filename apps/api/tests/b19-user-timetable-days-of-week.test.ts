import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSemester, createSessionCookie, createTestUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

// Reviewer 生成: build 19 設計 §8.2 (#A1-#A5) のみを根拠。#A6 は既存テストの緑で担保。
async function post(extra: Record<string, unknown>) {
  const db = prisma();
  const user = await createTestUser(db);
  const semester = await createSemester(db, user.id);
  const cookie = await createSessionCookie(db, user.id);
  const res = await requestJson(app, "/api/user-timetables", {
    method: "POST",
    headers: { Cookie: cookie },
    body: {
      semesterId: semester.id,
      title: "t",
      daySlots: [{ periodIndex: 1, label: "1限", startMinute: 540, endMinute: 630, isBreak: false }],
      courses: [],
      meetings: [],
      ...extra,
    },
  });
  return { db, user, cookie, res, body: await json(res) };
}

describe("[b19] POST /api/user-timetables daysOfWeek", () => {
  it("[#A1] saves given daysOfWeek and GET reflects it", async () => {
    const { cookie, res, body } = await post({ daysOfWeek: [1, 2, 3, 4, 5, 6] });
    expect(res.status).toBe(201);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);
    const list = await json(await requestJson(app, "/api/user-timetables", { headers: { Cookie: cookie } }));
    const row = list.userTimetables.find((t: { id: string }) => t.id === body.userTimetable.id);
    expect(row.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("[#A2] omitted daysOfWeek defaults to weekdays", async () => {
    const { res, body } = await post({});
    expect(res.status).toBe(201);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("[#A3] unordered daysOfWeek is normalized ascending", async () => {
    const { res, body } = await post({ daysOfWeek: [6, 1, 3] });
    expect(res.status).toBe(201);
    expect(body.userTimetable.daysOfWeek).toEqual([1, 3, 6]);
  });

  for (const bad of [[1, 1], [], [0], [8]]) {
    it(`[#A4] rejects daysOfWeek ${JSON.stringify(bad)} with 400 VALIDATION_ERROR and creates no row`, async () => {
      const { db, user, res, body } = await post({ daysOfWeek: bad });
      expect(res.status).toBe(400);
      expectError(body, "VALIDATION_ERROR");
      await expect(db.userTimetable.count({ where: { userId: user.id } })).resolves.toBe(0);
    });
  }

  it("[#A5] weekend-only daysOfWeek [7]", async () => {
    const { res, body } = await post({ daysOfWeek: [7] });
    expect(res.status).toBe(201);
    expect(body.userTimetable.daysOfWeek).toEqual([7]);
  });
});
