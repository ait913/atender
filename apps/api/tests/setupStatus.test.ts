import { describe, expect, it } from "vitest";
import { isSetupComplete } from "../src/lib/setupStatus";

describe("isSetupComplete", () => {
  it("returns true when school department and default semester are all present", () => {
    expect(isSetupComplete({ schoolId: "s", departmentId: "d", defaultSemesterId: "sem" })).toBe(true);
  });

  it.each([
    [{ schoolId: null, departmentId: "d", defaultSemesterId: "sem" }],
    [{ schoolId: "s", departmentId: null, defaultSemesterId: "sem" }],
    [{ schoolId: "s", departmentId: "d", defaultSemesterId: null }],
  ])("returns false when any setup field is missing: %j", (fields) => {
    expect(isSetupComplete(fields)).toBe(false);
  });
});
