import { APIError } from "better-auth/api";
import { auth } from "../auth";
import { prisma } from "../db";
import { env } from "../env";
import { AppError } from "../lib/appError";
import { GoogleAuthError } from "../lib/googleApi";

type AccessTokenResult = { accessToken?: string | null };

export async function getGoogleAccessTokenByUserId(userId: string): Promise<string> {
  try {
    const result = await (auth.api as unknown as {
      getAccessToken: (args: { body: { providerId: string; userId: string } }) => Promise<AccessTokenResult>;
    }).getAccessToken({ body: { providerId: "google", userId } });
    if (!result?.accessToken) {
      throw new GoogleAuthError("FAILED_TO_GET_ACCESS_TOKEN", "Empty access token from better-auth");
    }
    return result.accessToken;
  } catch (error) {
    if (error instanceof APIError) {
      const code = (error.body as { code?: string } | undefined)?.code;
      if (code === "FAILED_TO_GET_ACCESS_TOKEN" || code === "INVALID_GRANT") {
        await markConnectionRevoked(userId, code);
        throw new GoogleAuthError(code, code);
      }
    }
    return refreshGoogleTokenManually(userId);
  }
}

export async function getGoogleAccessTokenWithHeaders(headers: Headers): Promise<string> {
  try {
    const result = await (auth.api as unknown as {
      getAccessToken: (args: { body: { providerId: string }; headers: Headers }) => Promise<AccessTokenResult>;
    }).getAccessToken({ body: { providerId: "google" }, headers });
    if (!result?.accessToken) throw new GoogleAuthError("FAILED_TO_GET_ACCESS_TOKEN", "Empty access token from better-auth");
    return result.accessToken;
  } catch (error) {
    if (error instanceof APIError) {
      const code = (error.body as { code?: string } | undefined)?.code;
      if (code === "FAILED_TO_GET_ACCESS_TOKEN" || code === "INVALID_GRANT") {
        throw new AppError(401, "GOOGLE_REVOKED", "Google reconnection required");
      }
    }
    throw error;
  }
}

async function markConnectionRevoked(userId: string, reason: string) {
  await prisma.googleCalendarConnection.updateMany({
    where: { userId },
    data: { status: "REVOKED", lastError: reason },
  });
  await prisma.googleCalendarSync.updateMany({
    where: { connection: { userId } },
    data: { status: "REVOKED" },
  });
}

async function refreshGoogleTokenManually(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({ where: { userId, providerId: "google" } });
  if (!account?.refreshToken) {
    await markConnectionRevoked(userId, "no_refresh_token");
    throw new GoogleAuthError("FAILED_TO_GET_ACCESS_TOKEN", "No refresh_token");
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("invalid_grant")) {
      await markConnectionRevoked(userId, "invalid_grant");
      throw new GoogleAuthError("INVALID_GRANT", "Refresh token revoked");
    }
    throw new GoogleAuthError("FAILED_TO_GET_ACCESS_TOKEN", text);
  }
  const data = await res.json() as { access_token: string; expires_in: number; scope?: string };
  await prisma.account.update({
    where: { id: account.id },
    data: {
      accessToken: data.access_token,
      accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      ...(data.scope ? { scope: data.scope } : {}),
    },
  });
  return data.access_token;
}
