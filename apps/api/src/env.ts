import { z } from "zod";

const OptionalNonEmptyString = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().min(1),
  BETTER_AUTH_COOKIE_DOMAIN: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
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
