import { z } from "zod";

const OptionalNonEmptyString = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());

export const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().min(1),
  BETTER_AUTH_COOKIE_DOMAIN: z.string().min(1),
  // AIS Mail のサービストークン。形式は AIS Mail 側の検査 (service-api/token.ts) と同じ。
  // 貼り付けの崩れ (引用符・改行の混入) を起動時に落とすために形式まで見る。
  AIS_MAIL_TOKEN: z.string().trim().regex(/^aism_svc_[a-z0-9]{10}\.[A-Za-z0-9_-]{43}$/i),
  AIS_MAIL_URL: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().url().default("https://mail.aisaba.net"),
  ),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_IOS_CLIENT_ID: OptionalNonEmptyString,
  APPLE_CLIENT_ID: OptionalNonEmptyString,
  APPLE_CLIENT_SECRET: OptionalNonEmptyString,
  APPLE_APP_BUNDLE_ID: OptionalNonEmptyString,
  APPLE_TEAM_ID: OptionalNonEmptyString,
  APPLE_KEY_ID: OptionalNonEmptyString,
  APPLE_PRIVATE_KEY: OptionalNonEmptyString,
  PUBLIC_WEB_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = EnvSchema.parse(process.env);
// Include web origins and native callback origins such as atender://auth.
export const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
