import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSemester, createSessionCookie, createTestUser, createUserTimetable } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

describe("semesters API", () => {
  it("[§8 #22] POST /api/semesters rejects startDate later than endDate", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/semesters", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { name: "逆転学期", startDate: "2026-10-01", endDate: "2026-04-01" },
    });
    const body = await json(res);

    expect(res.status).toBe(400);
    expectError(body, "VALIDATION_ERROR");
  });

  it("[§8 #23] DELETE /api/semesters/:id returns 409 when a UserTimetable exists", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const semester = await createSemester(db, user.id);
    await createUserTimetable(db, user.id, semester.id);
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request(`/api/semesters/${semester.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    const body = await json(res);

    expect(res.status).toBe(409);
    expectError(body, "CONFLICT");
  });

  it("[§8 #24] GET/PATCH/DELETE on another user's Semester returns 403", async () => {
    const db = prisma();
    const owner = await createTestUser(db, { email: "owner@example.test" });
    const other = await createTestUser(db, { email: "other@example.test" });
    const semester = await createSemester(db, owner.id);
    const cookie = await createSessionCookie(db, other.id);

    const getRes = await app.request(`/api/semesters/${semester.id}`, { headers: { Cookie: cookie } });
    const patchRes = await requestJson(app, `/api/semesters/${semester.id}`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: { name: "変更" },
    });
    const deleteRes = await app.request(`/api/semesters/${semester.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });

    expect(getRes.status).toBe(403);
    expectError(await json(getRes), "FORBIDDEN");
    expect(patchRes.status).toBe(403);
    expectError(await json(patchRes), "FORBIDDEN");
    expect(deleteRes.status).toBe(403);
    expectError(await json(deleteRes), "FORBIDDEN");
  });
});
