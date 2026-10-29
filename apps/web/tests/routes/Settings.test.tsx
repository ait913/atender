import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderApp } from "../utils/render";

beforeAll(() => {
  let store: Record<string, string> = {};
  const ls = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: ls });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: ls });
});

describe("/settings", () => {
  it("renders required attendance rate row in the attendance settings section", async () => {
    server.use(
      http.get(`${API_URL}/api/me`, () =>
        HttpResponse.json({
          user: {
            id: "user-1",
            email: "teacher@example.com",
            name: "田中",
            image: null,
            defaultSemesterId: "semester-1",
            schoolId: "school-1",
            departmentId: "department-1",
            requiredAttendanceRate: 70,
          },
          setupStatus: {
            hasSchool: true,
            hasDepartment: true,
            hasSemester: true,
            hasUserTimetable: true,
            isComplete: true,
          },
        }),
      ),
    );

    await renderApp({ initialPath: "/settings" });

    // 仕様 #70
    expect(await screen.findByText("必要出席率")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("saves RequiredRateSheet changes through usePatchMe payload", async () => {
    const patches: unknown[] = [];
    server.use(
      http.get(`${API_URL}/api/me`, () =>
        HttpResponse.json({
          user: {
            id: "user-1",
            email: "teacher@example.com",
            name: "田中",
            image: null,
            defaultSemesterId: "semester-1",
            schoolId: "school-1",
            departmentId: "department-1",
            requiredAttendanceRate: 70,
          },
          setupStatus: {
            hasSchool: true,
            hasDepartment: true,
            hasSemester: true,
            hasUserTimetable: true,
            isComplete: true,
          },
        }),
      ),
      http.patch(`${API_URL}/api/me`, async ({ request }) => {
        const body = await request.json();
        patches.push(body);
        return HttpResponse.json({
          user: {
            id: "user-1",
            email: "teacher@example.com",
            name: "田中",
            image: null,
            defaultSemesterId: "semester-1",
            schoolId: "school-1",
            departmentId: "department-1",
            ...(body as Record<string, unknown>),
          },
          setupStatus: {
            hasSchool: true,
            hasDepartment: true,
            hasSemester: true,
            hasUserTimetable: true,
            isComplete: true,
          },
        });
      }),
    );

    const { user } = await renderApp({ initialPath: "/settings" });
    await user.click(await screen.findByText("必要出席率"));
    await user.click(await screen.findByRole("button", { name: "80" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    // 仕様 #69
    await waitFor(() => expect(patches).toContainEqual({ requiredAttendanceRate: 80 }));
  });
});
