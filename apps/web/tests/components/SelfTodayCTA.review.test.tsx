import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { SelfTodayCTA } from "@/components/home/SelfTodayCTA";
import { API_URL } from "../msw/handlers";
import { server } from "../msw/server";
import { renderWithClient } from "../utils/render";

const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

describe("SelfTodayCTA setup deadlock review", () => {
  it("does not navigate to setup when GET /api/today returns 200 with empty occurrences", async () => {
    const todayHit = vi.fn();
    server.use(
      http.get(`${API_URL}/api/today`, () => {
        todayHit();
        return HttpResponse.json({ date: "2026-05-13", occurrences: [] });
      }),
    );

    renderWithClient(<SelfTodayCTA />);

    await waitFor(() => expect(todayHit).toHaveBeenCalled());
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("navigates to setup when GET /api/today returns SETUP_REQUIRED", async () => {
    const todayHit = vi.fn();
    server.use(
      http.get(`${API_URL}/api/today`, () => {
        todayHit();
        return HttpResponse.json(
          { error: { code: "SETUP_REQUIRED", message: "setup required" } },
          { status: 403 },
        );
      }),
    );

    renderWithClient(<SelfTodayCTA />);

    await waitFor(() => expect(todayHit).toHaveBeenCalled());
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith({ to: "/setup" }));
  });

  it("renders nothing when GET /api/today returns 200 with empty occurrences", async () => {
    const todayHit = vi.fn();
    server.use(
      http.get(`${API_URL}/api/today`, () => {
        todayHit();
        return HttpResponse.json({ date: "2026-05-13", occurrences: [] });
      }),
    );

    const { container } = renderWithClient(<SelfTodayCTA />);

    await waitFor(() => expect(todayHit).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
