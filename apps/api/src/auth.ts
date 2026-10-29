import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, magicLink } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { getPrisma } from "./db";
import { env, trustedOrigins } from "./env";
import { MailSendError, sendMail } from "./lib/mail";
import { buildMagicLinkMail } from "./lib/magicLinkMail";

export const MAGIC_LINK_SEND_FAILED_MESSAGE =
  "ログイン用のメールを送れませんでした。しばらくしてからもう一度お試しください。";

type Auth = ReturnType<typeof betterAuth>;

export function normalizeApplePem(raw: string): string {
  const s = raw.trim();
  // PEM が直接入っている場合: エスケープ改行 (\n) を実改行へ復元
  if (s.includes("BEGIN")) {
    return s.includes("\\n") ? s.replace(/\\n/g, "\n") : s;
  }
  // ヘッダが無い = base64 化された .p8 本文。Coolify の env 注入は backslash 二重化 /
  // 実改行 truncate のどちらかで PEM を壊すため、base64 (単一行・記号なし) で格納し
  // ここで復号する。復号結果は BEGIN/END 付きの PEM テキスト。
  return Buffer.from(s, "base64").toString("utf8");
}

export function buildAppleClientSecret(
  input: { teamId: string; keyId: string; privateKeyPem: string; clientId: string },
  now: Date = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + 60 * 60 * 24 * 180;
  const b64url = (buffer: Buffer) => buffer.toString("base64url");
  const header = b64url(Buffer.from(JSON.stringify({ alg: "ES256", kid: input.keyId, typ: "JWT" })));
  const payload = b64url(Buffer.from(JSON.stringify({
    iss: input.teamId,
    iat,
    exp,
    aud: "https://appleid.apple.com",
    sub: input.clientId,
  })));
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(normalizeApplePem(input.privateKeyPem));
  const signature = cryptoSign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(signature)}`;
}

function getAppleProviderConfig() {
  const {
    APPLE_CLIENT_ID,
    APPLE_CLIENT_SECRET,
    APPLE_APP_BUNDLE_ID,
    APPLE_TEAM_ID,
    APPLE_KEY_ID,
    APPLE_PRIVATE_KEY,
  } = env;
  if (!APPLE_CLIENT_ID || !APPLE_APP_BUNDLE_ID) return null;
  const clientSecret = APPLE_CLIENT_SECRET ??
    (APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY
      ? buildAppleClientSecret({
          teamId: APPLE_TEAM_ID,
          keyId: APPLE_KEY_ID,
          privateKeyPem: APPLE_PRIVATE_KEY,
          clientId: APPLE_CLIENT_ID,
        })
      : null);
  if (!clientSecret) return null;
  return {
    clientId: APPLE_CLIENT_ID,
    clientSecret,
    appBundleIdentifier: APPLE_APP_BUNDLE_ID,
  };
}

let authInstance: Auth | null = null;

export function resetAuth() {
  authInstance = null;
}

export function getAuth(): Auth {
  if (!authInstance) {
    const appleProviderConfig = getAppleProviderConfig();
    const created = betterAuth({
      database: prismaAdapter(getPrisma(), { provider: "sqlite" }),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      socialProviders: {
        google: {
          clientId: env.GOOGLE_IOS_CLIENT_ID ? [env.GOOGLE_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID] : env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          accessType: "offline",
          prompt: "consent",
        },
        ...(appleProviderConfig
          ? {
              apple: appleProviderConfig,
            }
          : {}),
      },
      plugins: [
        bearer(),
        magicLink({
          expiresIn: 60 * 15,
          sendMagicLink: async ({ email, url }) => {
            const mail = buildMagicLinkMail(url);
            try {
              await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
            } catch (error) {
              console.error(
                "[mail] magic link send failed",
                error instanceof MailSendError
                  ? { code: error.code, status: error.status }
                  : { code: "unexpected", name: error instanceof Error ? error.name : typeof error },
              );
              throw new APIError("INTERNAL_SERVER_ERROR", {
                error: { code: "MAIL_SEND_FAILED", message: MAGIC_LINK_SEND_FAILED_MESSAGE },
              });
            }
          },
        }),
      ],
      session: {
        expiresIn: 60 * 60 * 24 * 30,
        updateAge: 60 * 60 * 24,
      },
      advanced: {
        defaultCookieAttributes: {
          sameSite: "lax",
          secure: true,
          httpOnly: true,
        },
        crossSubDomainCookies: {
          enabled: true,
          domain: env.BETTER_AUTH_COOKIE_DOMAIN,
        },
      },
      trustedOrigins,
    });
    authInstance = created as unknown as Auth;
  }

  return authInstance as Auth;
}

export const auth = new Proxy({} as Auth, {
  get(_target, property, receiver) {
    return Reflect.get(getAuth(), property, receiver);
  },
  set(_target, property, value, receiver) {
    return Reflect.set(getAuth(), property, value, receiver);
  },
}) as Auth;
