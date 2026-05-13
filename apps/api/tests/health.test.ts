import { describe, expect, it } from "vitest";
import { app } from "./helpers/app";
import { json } from "./helpers/http";

describe("health API", () => {
  it("[§8 #73] GET /healthz responds 200 without HTTPS redirect loop", async () => {
    const res = await app.request("/healthz");

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(302);
    expect(res.status).not.toBe(307);
  });

  it("[§8 #74] GET /healthz returns DB ping state", async () => {
    const res = await app.request("/healthz");
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, db: true });
  });
});
