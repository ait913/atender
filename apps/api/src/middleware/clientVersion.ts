import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/appError";
import { MIN_IOS_BUILD, parseClientHeader } from "../lib/clientVersion";

const EXEMPT_PATHS = new Set(["/healthz", "/version"]);

export const clientVersionGuard: MiddlewareHandler = async (c, next) => {
  if (EXEMPT_PATHS.has(c.req.path)) {
    return next();
  }

  const client = parseClientHeader(c.req.header("X-Atender-Client"));
  if (client && client.build < MIN_IOS_BUILD) {
    throw new AppError(
      426,
      "CLIENT_UPGRADE_REQUIRED",
      "このバージョンのアプリはサポートされていません。最新版に更新してください。",
      { platform: client.platform, build: client.build, minIOSBuild: MIN_IOS_BUILD },
    );
  }

  await next();
};
