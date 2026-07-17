import type { VersionResponse } from "@atender/shared";
import type { Hono } from "hono";
import { MIN_IOS_BUILD } from "../lib/clientVersion";

export function registerVersionRoutes(app: Hono) {
  app.get("/version", (c) => {
    const raw = process.env.SOURCE_COMMIT?.trim();
    const body: VersionResponse = {
      commit: raw && raw.length > 0 ? raw : "unknown",
      minIOSBuild: MIN_IOS_BUILD,
    };
    return c.json(body);
  });
}
