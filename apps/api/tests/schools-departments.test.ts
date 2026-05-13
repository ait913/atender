import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSchoolDepartment, createSessionCookie, createTestUser } from "./helpers/auth";
import { expectError, json, requestJson } from "./helpers/http";

describe("schools and departments API", () => {
  it("[§8 #17] GET /api/schools searches name and nameKana with limit and name ascending", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);
    await db.school.createMany({
      data: [
        { name: "千葉工業大学", nameKana: "チバコウギョウダイガク", kind: "UNIVERSITY", prefecture: "千葉県" },
        { name: "東京情報大学", nameKana: "トウキョウジョウホウダイガク", kind: "UNIVERSITY", prefecture: "千葉県" },
        { name: "日本大学", nameKana: "ニホンダイガク", kind: "UNIVERSITY", prefecture: "東京都" },
      ],
    });

    const res = await app.request("/api/schools?q=千葉&limit=10", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.schools.map((s: { name: string }) => s.name)).toEqual(["千葉工業大学"]);
  });

  it("[§8 #18] GET /api/schools filters by prefecture", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);
    await db.school.createMany({
      data: [
        { name: "千葉工業大学", kind: "UNIVERSITY", prefecture: "千葉県" },
        { name: "東京大学", kind: "UNIVERSITY", prefecture: "東京都" },
      ],
    });

    const res = await app.request("/api/schools?prefecture=千葉県", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.schools).toHaveLength(1);
    expect(body.schools[0].prefecture).toBe("千葉県");
  });

  it("[§8 #19] POST /api/schools returns 409 with existingId for duplicate name prefecture kind", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);
    const existing = await db.school.create({
      data: { name: "千葉工業大学", kind: "UNIVERSITY", prefecture: "千葉県" },
    });

    const res = await requestJson(app, "/api/schools", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { name: "千葉工業大学", kind: "UNIVERSITY", prefecture: "千葉県" },
    });
    const body = await json(res);

    expect(res.status).toBe(409);
    expectError(body, "CONFLICT");
    expect(body.error.details.existingId).toBe(existing.id);
  });

  it("[§8 #20] POST /api/schools/:schoolId/departments returns 409 with existingId for duplicate name", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);
    const { school, department } = await createSchoolDepartment(db, { departmentName: "情報処理科" });

    const res = await requestJson(app, `/api/schools/${school.id}/departments`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: { name: "情報処理科" },
    });
    const body = await json(res);

    expect(res.status).toBe(409);
    expectError(body, "CONFLICT");
    expect(body.error.details.existingId).toBe(department.id);
  });

  it("[§8 #21] POST /api/schools/:schoolId/departments returns 404 for missing school", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const res = await requestJson(app, "/api/schools/missing/departments", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { name: "情報処理科" },
    });
    const body = await json(res);

    expect(res.status).toBe(404);
    expectError(body, "NOT_FOUND");
  });
});
