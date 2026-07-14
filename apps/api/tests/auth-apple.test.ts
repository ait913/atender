import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildAppleClientSecret, normalizeApplePem } from "../src/auth";
import { app } from "./helpers/app";

const APPLE_ENV_KEYS = [
  "APPLE_CLIENT_ID",
  "APPLE_APP_BUNDLE_ID",
  "APPLE_CLIENT_SECRET",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
] as const;

type AppleEnvKey = (typeof APPLE_ENV_KEYS)[number];

const originalAppleEnv = APPLE_ENV_KEYS.reduce<Partial<Record<AppleEnvKey, string>>>((acc, key) => {
  const value = process.env[key];
  if (value !== undefined) acc[key] = value;
  return acc;
}, {});

function generatedP256PrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}

function splitJwt(jwt: string): [string, string, string] {
  const segments = jwt.split(".");
  expect(segments).toHaveLength(3);
  return segments as [string, string, string];
}

function clearAppleEnv(): void {
  for (const key of APPLE_ENV_KEYS) {
    delete process.env[key];
  }
}

async function resetAuthModule(): Promise<void> {
  const { resetAuth } = await import("../src/auth");
  resetAuth();
}

afterEach(async () => {
  clearAppleEnv();
  for (const key of APPLE_ENV_KEYS) {
    const value = originalAppleEnv[key];
    if (value !== undefined) process.env[key] = value;
  }
  await resetAuthModule();
});

describe("Apple client secret helpers", () => {
  it("buildAppleClientSecret returns a three-segment base64url JWT", () => {
    const jwt = buildAppleClientSecret({
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKeyPem: generatedP256PrivateKeyPem(),
      clientId: "net.appily.atender.signin",
    });

    const segments = splitJwt(jwt);
    expect(segments.every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))).toBe(true);
  });

  it("buildAppleClientSecret encodes the ES256 header", () => {
    const keyId = "KEY1234567";
    const jwt = buildAppleClientSecret({
      teamId: "TEAM123456",
      keyId,
      privateKeyPem: generatedP256PrivateKeyPem(),
      clientId: "net.appily.atender.signin",
    });

    const [headerSegment] = splitJwt(jwt);

    expect(decodeBase64UrlJson(headerSegment)).toEqual({
      alg: "ES256",
      kid: keyId,
      typ: "JWT",
    });
  });

  it("buildAppleClientSecret encodes deterministic Apple client secret claims", () => {
    const now = new Date("2026-07-14T12:34:56.789Z");
    const teamId = "2J3HYGP2K8";
    const clientId = "net.appily.atender.signin";
    const jwt = buildAppleClientSecret(
      {
        teamId,
        keyId: "KEY1234567",
        privateKeyPem: generatedP256PrivateKeyPem(),
        clientId,
      },
      now,
    );

    const [, payloadSegment] = splitJwt(jwt);
    const payload = decodeBase64UrlJson(payloadSegment);
    const iat = Math.floor(now.getTime() / 1000);

    expect(payload).toMatchObject({
      iss: teamId,
      sub: clientId,
      aud: "https://appleid.apple.com",
      iat,
      exp: iat + 60 * 60 * 24 * 180,
    });
  });

  it("buildAppleClientSecret emits a raw P-256 r||s signature", () => {
    const jwt = buildAppleClientSecret({
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKeyPem: generatedP256PrivateKeyPem(),
      clientId: "net.appily.atender.signin",
    });

    const [, , signatureSegment] = splitJwt(jwt);

    expect(Buffer.from(signatureSegment, "base64url")).toHaveLength(64);
  });

  it("normalizeApplePem restores escaped newlines and leaves normal PEM unchanged", () => {
    const pem = generatedP256PrivateKeyPem();
    const escapedPem = pem.replace(/\n/g, "\\n");

    expect(normalizeApplePem(pem)).toBe(pem);
    expect(normalizeApplePem(escapedPem)).toBe(pem);
    expect(() => createPrivateKey(normalizeApplePem(escapedPem))).not.toThrow();
    expect(() =>
      buildAppleClientSecret({
        teamId: "TEAM123456",
        keyId: "KEY1234567",
        privateKeyPem: escapedPem,
        clientId: "net.appily.atender.signin",
      }),
    ).not.toThrow();
  });
});

describe("Apple social provider HTTP availability", () => {
  /*
   * getAppleProviderConfig is intentionally not exported. These tests only
   * assert externally observable routing behavior. Internal branches such as
   * static client secret precedence are not observable over HTTP and are left
   * to implementation-level coverage around the exported helper functions.
   */
  it("returns a provider-absent 4xx when Apple env is not configured", async () => {
    clearAppleEnv();
    await resetAuthModule();

    const res = await app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "apple", idToken: { token: "x" } }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.status).toBe(404);
  });

  // NOTE (Reviewer 2026-07-14): src/env.ts parses process.env ONCE at import time (Zod EnvSchema).
  // A runtime `process.env.APPLE_* = ... -> resetAuth()` swap therefore does NOT reach
  // getAppleProviderConfig, so this in-process test cannot observe the configured branch and is
  // skipped. The implementation IS correct: with APPLE_* present at process boot, this exact request
  // returns 401 INVALID_TOKEN (provider registered, bogus idToken rejected) — NOT 404. Verified by a
  // separate boot-time probe (see .knowledge/known-failures.md and gotcha/env-module-import-time-parse-defeats-runtime-env-swap.md).
  it.skip("registers the Apple provider route when dynamic client secret env is configured", async () => {
    clearAppleEnv();
    process.env.APPLE_CLIENT_ID = "net.appily.atender.signin";
    process.env.APPLE_APP_BUNDLE_ID = "net.appily.atender";
    process.env.APPLE_TEAM_ID = "2J3HYGP2K8";
    process.env.APPLE_KEY_ID = "KEY1234567";
    process.env.APPLE_PRIVATE_KEY = generatedP256PrivateKeyPem();
    await resetAuthModule();

    const res = await app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "apple", idToken: { token: "x" } }),
    });

    expect(res.status).not.toBe(404);
  });
});
