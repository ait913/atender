import { prisma } from "../db";
import { appleClientSecretFor, type AppleCredentialsConfig } from "./appleAuthorization.service";

export type RevocableToken = {
  provider: "apple" | "google";
  token: string;
  tokenTypeHint: "refresh_token" | "access_token";
};
export type RevokeOutcome = { provider: "apple" | "google"; clientId: string | null; ok: boolean; status: number | null };
export const REVOKE_TIMEOUT_MS = 5000;

/** Account (providerId "apple" | "google") を読み、1 行につき最大 1 トークン:
 *  refreshToken が非空ならそれ、無ければ accessToken が非空ならそれ、どちらも無ければ出さない */
export async function collectRevocableTokens(userId: string): Promise<RevocableToken[]> {
  const accounts = await prisma.account.findMany({
    where: { userId, providerId: { in: ["apple", "google"] } },
    orderBy: { id: "asc" },
  });
  const tokens: RevocableToken[] = [];
  for (const account of accounts) {
    const provider = account.providerId as "apple" | "google";
    if (account.refreshToken) {
      tokens.push({ provider, token: account.refreshToken, tokenTypeHint: "refresh_token" });
    } else if (account.accessToken) {
      tokens.push({ provider, token: account.accessToken, tokenTypeHint: "access_token" });
    }
  }
  return tokens;
}

async function postForm(url: string, form: URLSearchParams): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    return { ok: res.status === 200, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

function warnFailed(outcome: RevokeOutcome) {
  // トークン・client_secret はログに出さない
  console.warn("[account-deletion] token revoke failed", {
    provider: outcome.provider,
    clientId: outcome.clientId,
    status: outcome.status,
  });
}

async function revokeGoogle(token: RevocableToken): Promise<RevokeOutcome[]> {
  const result = await postForm("https://oauth2.googleapis.com/revoke", new URLSearchParams({ token: token.token }));
  return [{ provider: "google", clientId: null, ok: result.ok, status: result.status }];
}

async function revokeApple(
  token: RevocableToken,
  config: AppleCredentialsConfig | null | undefined,
  now: Date | undefined,
): Promise<RevokeOutcome[]> {
  if (!config) {
    console.warn("[account-deletion] apple revoke skipped: not configured");
    return [{ provider: "apple", clientId: null, ok: false, status: null }];
  }
  const clientIds = [config.bundleId, config.servicesId].filter(
    (id, index, all): id is string => id != null && all.indexOf(id) === index,
  );
  // client_id ごとに並行 (§6)。直列だと Apple 障害時に REVOKE_TIMEOUT_MS × 2 だけ削除応答が遅れる (Codex ゲート指摘)
  return Promise.all(
    clientIds.map(async (clientId): Promise<RevokeOutcome> => {
      let result: { ok: boolean; status: number | null };
      try {
        result = await postForm(
          "https://appleid.apple.com/auth/revoke",
          new URLSearchParams({
            client_id: clientId,
            client_secret: appleClientSecretFor(config, clientId, now),
            token: token.token,
            token_type_hint: token.tokenTypeHint,
          }),
        );
      } catch {
        result = { ok: false, status: null };
      }
      return { provider: "apple", clientId, ok: result.ok, status: result.status };
    }),
  );
}

/** 全部 Promise.allSettled で並行。throw しない */
export async function revokeTokens(
  tokens: RevocableToken[],
  options: { apple?: AppleCredentialsConfig | null; now?: Date } = {},
): Promise<RevokeOutcome[]> {
  const settled = await Promise.allSettled(
    tokens.map((token) => (token.provider === "google" ? revokeGoogle(token) : revokeApple(token, options.apple, options.now))),
  );
  const outcomes: RevokeOutcome[] = [];
  settled.forEach((entry, index) => {
    if (entry.status === "fulfilled") {
      outcomes.push(...entry.value);
    } else {
      outcomes.push({ provider: tokens[index]!.provider, clientId: null, ok: false, status: null });
    }
  });
  for (const outcome of outcomes) {
    if (!outcome.ok && outcome.clientId !== null) warnFailed(outcome);
    else if (!outcome.ok && outcome.provider === "google") warnFailed(outcome);
  }
  return outcomes;
}
