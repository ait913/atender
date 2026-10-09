import { buildAppleClientSecret } from "../auth";
import { prisma } from "../db";

export type AppleCredentialsConfig = {
  teamId: string;
  keyId: string;
  privateKeyPem: string; // APPLE_PRIVATE_KEY の生値 (base64 の .p8 も PEM も可。buildAppleClientSecret が normalizeApplePem する)
  bundleId: string; // APPLE_APP_BUNDLE_ID (net.appily.atender)
  servicesId: string | null; // APPLE_CLIENT_ID (Web の Services ID)。未設定なら null
};

export const APPLE_HTTP_TIMEOUT_MS = 5000;

export type AppleExchangeFailureReason =
  | "NOT_CONFIGURED"
  | "NO_APPLE_ACCOUNT"
  | "EXCHANGE_FAILED"
  | "NO_REFRESH_TOKEN"
  | "SUBJECT_MISMATCH";
export type AppleExchangeResult = { stored: true } | { stored: false; reason: AppleExchangeFailureReason };

function nonEmpty(value: string | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY / APPLE_APP_BUNDLE_ID のどれかが未設定 or 空文字なら null。
 *  env.ts の定数でなく呼び出し時の source を読む (テストで出し入れするため) */
export function readAppleCredentialsConfig(source: NodeJS.ProcessEnv = process.env): AppleCredentialsConfig | null {
  const teamId = nonEmpty(source.APPLE_TEAM_ID);
  const keyId = nonEmpty(source.APPLE_KEY_ID);
  const privateKeyPem = nonEmpty(source.APPLE_PRIVATE_KEY);
  const bundleId = nonEmpty(source.APPLE_APP_BUNDLE_ID);
  if (!teamId || !keyId || !privateKeyPem || !bundleId) return null;
  return { teamId, keyId, privateKeyPem, bundleId, servicesId: nonEmpty(source.APPLE_CLIENT_ID) };
}

export function appleClientSecretFor(config: AppleCredentialsConfig, clientId: string, now: Date = new Date()): string {
  return buildAppleClientSecret(
    { teamId: config.teamId, keyId: config.keyId, privateKeyPem: config.privateKeyPem, clientId },
    now,
  );
}

/** 署名は検証しない (TLS で Apple のトークンエンドポイントから直接受け取った値のため) */
export function decodeJwtSubject(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    if (payload && typeof payload === "object" && "sub" in payload) {
      const sub = (payload as { sub: unknown }).sub;
      return typeof sub === "string" ? sub : null;
    }
    return null;
  } catch {
    return null;
  }
}

function warnFailed(userId: string, reason: AppleExchangeFailureReason, status: number | null) {
  // 認可コード・トークン・client_secret はログに出さない
  console.warn("[apple-exchange] failed", { userId, reason, status });
}

export async function exchangeAppleAuthorizationCode(args: {
  userId: string;
  authorizationCode: string;
  now?: Date;
}): Promise<AppleExchangeResult> {
  const now = args.now ?? new Date();
  const fail = (reason: AppleExchangeFailureReason, status: number | null = null): AppleExchangeResult => {
    warnFailed(args.userId, reason, status);
    return { stored: false, reason };
  };

  const config = readAppleCredentialsConfig();
  if (!config) return fail("NOT_CONFIGURED");

  const account = await prisma.account.findFirst({ where: { userId: args.userId, providerId: "apple" } });
  if (!account) return fail("NO_APPLE_ACCOUNT");

  let status: number | null = null;
  let body: Record<string, unknown>;
  try {
    const form = new URLSearchParams({
      client_id: config.bundleId,
      client_secret: appleClientSecretFor(config, config.bundleId, now),
      code: args.authorizationCode,
      grant_type: "authorization_code",
    });
    const res = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(APPLE_HTTP_TIMEOUT_MS),
    });
    status = res.status;
    if (!res.ok) return fail("EXCHANGE_FAILED", status);
    const parsed: unknown = await res.json();
    if (!parsed || typeof parsed !== "object") return fail("EXCHANGE_FAILED", status);
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("EXCHANGE_FAILED", status);
  }

  const refreshToken = body.refresh_token;
  if (typeof refreshToken !== "string" || refreshToken.length === 0) return fail("NO_REFRESH_TOKEN", status);
  if (decodeJwtSubject(body.id_token) !== account.accountId) return fail("SUBJECT_MISMATCH", status);

  await prisma.account.update({
    where: { id: account.id },
    data: {
      refreshToken,
      accessToken: typeof body.access_token === "string" ? body.access_token : null,
      accessTokenExpiresAt:
        typeof body.expires_in === "number" ? new Date(now.getTime() + body.expires_in * 1000) : null,
    },
  });
  return { stored: true };
}
