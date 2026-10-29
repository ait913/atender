import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { createSchoolDepartment, createSessionCookie, createTestUser } from "./helpers/auth";
import { json } from "./helpers/http";

// Reviewer 生成: build 21 設計 §5.2.3 / §7.C18 のみを根拠。
describe("[b21 C18] GET /api/me school / department names", () => {
  it("returns schoolName and departmentName when set", async () => {
    const db = prisma();
    const { school, department } = await createSchoolDepartment(db, { schoolName: "千葉テスト大学", departmentName: "情報処理科" });
    const user = await createTestUser(db, { schoolId: school.id, departmentId: department.id });
    const cookie = await createSessionCookie(db, user.id);

    const res = await app.request("/api/me", { headers: { Cookie: cookie } });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.user.schoolName).toBe("千葉テスト大学");
    expect(body.user.departmentName).toBe("情報処理科");
    expect(body.user.schoolId).toBe(school.id);
    expect(body.user.departmentId).toBe(department.id);
  });

  it("returns null names when school and department are unset", async () => {
    const db = prisma();
    const user = await createTestUser(db);
    const cookie = await createSessionCookie(db, user.id);

    const body = await json(await app.request("/api/me", { headers: { Cookie: cookie } }));

    expect(body.user.schoolName ?? null).toBeNull();
    expect(body.user.departmentName ?? null).toBeNull();
    expect(body.user).toHaveProperty("schoolName");
    expect(body.user).toHaveProperty("departmentName");
  });

  it("school set, department unset: schoolName set, departmentName null", async () => {
    const db = prisma();
    const { school } = await createSchoolDepartment(db, { schoolName: "片方だけ大学" });
    const user = await createTestUser(db, { schoolId: school.id });
    const cookie = await createSessionCookie(db, user.id);
    const body = await json(await app.request("/api/me", { headers: { Cookie: cookie } }));
    expect(body.user.schoolName).toBe("片方だけ大学");
    expect(body.user.departmentName ?? null).toBeNull();
  });
});
