import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { prisma } from "./db";
import { env, trustedOrigins } from "./env";

const resend = new Resend(env.RESEND_API_KEY);

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: env.RESEND_FROM,
          to: email,
          subject: "Atender login link",
          html: `<p>Atender にログインします。</p><p><a href="${url}">ログインする</a></p>`,
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
