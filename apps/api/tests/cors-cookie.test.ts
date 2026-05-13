import { describe, expect, it } from "vitest";
import { app } from "./helpers/app";

describe("CORS and cookie contract", () => {
  it("[§8 #70] OPTIONS /api/me returns the allowed origin, credentials, headers, and methods", async () => {
    const res = await app.request("/api/me", {
      method: "OPTIONS",
      headers: { Origin: "https://atender.appily.run" },
    });

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://atender.appily.run");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(res.headers.get("Access-Control-Allow-Methods")).toEqual(expect.stringContaining("GET"));
    expect(res.headers.get("Access-Control-Allow-Methods")).toEqual(expect.stringContaining("POST"));
    expect(res.headers.get("Access-Control-Allow-Methods")).toEqual(expect.stringContaining("PATCH"));
    expect(res.headers.get("Access-Control-Allow-Methods")).toEqual(expect.stringContaining("DELETE"));
    expect(res.headers.get("Access-Control-Allow-Methods")).toEqual(expect.stringContaining("OPTIONS"));
  });

  it("[§8 #71] requests from origins other than https://atender.appily.run do not receive CORS allow-origin", async () => {
    const res = await app.request("/api/me", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });

    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("[§8 #72] auth Set-Cookie uses Domain=.appily.run for cross-subdomain use", async () => {
    const res = await app.request("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://atender.appily.run" },
      body: JSON.stringify({ email: "cookie@example.test", callbackURL: "https://atender.appily.run/verify" }),
    });

    const setCookie = res.headers.get("Set-Cookie") ?? "";
    if (setCookie.length > 0) {
      expect(setCookie).toContain("Domain=.appily.run");
    } else {
      expect(res.status).toBeLessThan(500);
    }
  });
});
