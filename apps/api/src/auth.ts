import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { getPrisma } from "./db";
import { env, trustedOrigins } from "./env";

const resend = new Resend(env.RESEND_API_KEY);

type Auth = ReturnType<typeof betterAuth>;

function getAppleProviderConfig() {
  const { APPLE_CLIENT_ID, APPLE_CLIENT_SECRET, APPLE_APP_BUNDLE_ID } = env;
  if (!APPLE_CLIENT_ID || !APPLE_CLIENT_SECRET || !APPLE_APP_BUNDLE_ID) return null;
  return {
    clientId: APPLE_CLIENT_ID,
    clientSecret: APPLE_CLIENT_SECRET,
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
          clientId: env.GOOGLE_CLIENT_ID,
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
            const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Atender にログインする</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a1830;color:#f5f3ee;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0a1830;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#0f1f3a;border-radius:14px;padding:36px;">
<tr><td style="text-align:left;padding-bottom:28px;"><span style="font-size:24px;font-weight:900;color:#f5f3ee;letter-spacing:-0.5px;">Atender::</span></td></tr>
<tr><td style="color:#f5f3ee;font-size:18px;font-weight:700;padding-bottom:12px;">ログインリンクが届いています</td></tr>
<tr><td style="color:#c9c4b4;font-size:14px;line-height:1.7;padding-bottom:28px;">下のボタンを開くと Atender にログインできます。リンクの有効期限は<strong style="color:#f5f3ee;"> 15 分</strong>です。心当たりがなければそのまま閉じてください。</td></tr>
<tr><td align="center" style="padding-bottom:28px;"><a href="${url}" style="display:inline-block;background:#10b981;color:#0a1830;text-decoration:none;font-weight:900;padding:14px 32px;border-radius:10px;font-size:15px;">ログインする</a></td></tr>
<tr><td style="color:#7d7967;font-size:12px;line-height:1.6;padding-top:24px;border-top:1px solid rgba(255,255,255,0.08);">リンクが開けないときは下記の URL を直接ブラウザに貼り付けてください:<br /><a href="${url}" style="color:#7d7967;word-break:break-all;">${url}</a></td></tr>
<tr><td style="color:#5a5448;font-size:11px;text-align:center;padding-top:28px;">Atender :: attendance, one tap.<br />based in tokyo/chiba</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
            const text = `Atender にログインする\n\n下記のリンクを開くとログインできます (有効期限 15 分):\n${url}\n\n心当たりがなければそのまま閉じてください。\n\n-- \nAtender :: attendance, one tap.\nbased in tokyo/chiba`;
            await resend.emails.send({
              from: env.RESEND_FROM,
              to: email,
              subject: "Atender にログインする",
              html,
              text,
            });
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
