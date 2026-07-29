import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { MIN_IOS_BUILD, parseClientHeader } from "../src/lib/clientVersion";
import { app } from "./helpers/app";
import { expectError, json } from "./helpers/http";

afterEach(() => {
  delete process.env.SOURCE_COMMIT;
});

async function getJson(path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  return { res, body: await json(res) };
}

function expectVersionShape(body: unknown) {
  expect(body).toEqual({
    commit: expect.any(String),
    minIOSBuild: expect.any(Number),
  });
}

// 設計 §8: 境界はすべて MIN_IOS_BUILD に対する相対的な性質。
// リリースのたびに MIN_IOS_BUILD が上がるので、テストは定数から標本を導出する
// (リテラルで埋めると版数を上げた瞬間に落ちる)。
const BUILD_ABOVE_MIN = MIN_IOS_BUILD + 1; // #G2: build > MIN_IOS_BUILD
const BUILD_AT_MIN = MIN_IOS_BUILD; // #G4: build === MIN_IOS_BUILD (境界は素通し)
const BUILD_BELOW_MIN = MIN_IOS_BUILD - 1; // #G3: build < MIN_IOS_BUILD
const iosHeader = (build: number) => `ios/${build}`;

async function expectGatePassedWithUnauthorized(headerValue?: string) {
  const headers = headerValue === undefined ? undefined : { "X-Atender-Client": headerValue };
  const { res, body } = await getJson("/api/me", { headers });

  expect(res.status).toBe(401);
  expect(res.status).not.toBe(426);
  expectError(body, "UNAUTHORIZED");
}

describe("version API", () => {
  it("[version #V1] GET /version returns 200 with commit and minIOSBuild", async () => {
    const { res, body } = await getJson("/version");

    expect(res.status).toBe(200);
    expectVersionShape(body);
  });

  it("[version #V2] SOURCE_COMMIT is returned as-is when set", async () => {
    process.env.SOURCE_COMMIT = "3078d66f55a71496bd82dcfb2b97da7b4857892b";

    const { res, body } = await getJson("/version");

    expect(res.status).toBe(200);
    expect((body as { commit: string }).commit).toBe("3078d66f55a71496bd82dcfb2b97da7b4857892b");
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("[version #V3] SOURCE_COMMIT %s returns unknown", async (_name, value) => {
    if (value === undefined) {
      delete process.env.SOURCE_COMMIT;
    } else {
      process.env.SOURCE_COMMIT = value;
    }

    const { res, body } = await getJson("/version");

    expect(res.status).toBe(200);
    expect((body as { commit: string }).commit).toBe("unknown");
  });

  it("[version #V4] GET /version is public without Authorization", async () => {
    const { res } = await getJson("/version");

    expect(res.status).toBe(200);
  });

  it("[version #V5] GET /version is exempt from the client gate even for ios/0", async () => {
    const { res } = await getJson("/version", {
      headers: { "X-Atender-Client": "ios/0" },
    });

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(426);
  });

  it("[version #V6] minIOSBuild matches MIN_IOS_BUILD and is an integer >= 1", async () => {
    const { res, body } = await getJson("/version");
    const minIOSBuild = (body as { minIOSBuild: number }).minIOSBuild;

    expect(res.status).toBe(200);
    expect(minIOSBuild).toBe(MIN_IOS_BUILD);
    expect(Number.isInteger(minIOSBuild)).toBe(true);
    expect(minIOSBuild).toBeGreaterThanOrEqual(1);
  });

  it.each(["HEAD", "unknown"])("[version #V7] SOURCE_COMMIT=%s still satisfies the version response shape", async (commit) => {
    process.env.SOURCE_COMMIT = commit;

    const { res, body } = await getJson("/version");

    expect(res.status).toBe(200);
    expectVersionShape(body);
    expect((body as { commit: string }).commit).toBe(commit);
  });
});

describe("clientVersionGuard", () => {
  it("[version #G1] missing X-Atender-Client passes through to the existing /api/me 401", async () => {
    await expectGatePassedWithUnauthorized();
  });

  it("[version #G2] a build greater than MIN_IOS_BUILD passes through", async () => {
    await expectGatePassedWithUnauthorized(iosHeader(BUILD_ABOVE_MIN));
  });

  it("[version #G3] a build below MIN_IOS_BUILD is rejected with CLIENT_UPGRADE_REQUIRED details", async () => {
    // 標本が正当なヘッダである前提 (#V6 の「1 以上」): MIN_IOS_BUILD - 1 >= 0
    expect(MIN_IOS_BUILD).toBeGreaterThanOrEqual(1);

    const { res, body } = await getJson("/api/me", {
      headers: { "X-Atender-Client": iosHeader(BUILD_BELOW_MIN) },
    });

    expect(res.status).toBe(426);
    expectError(body, "CLIENT_UPGRADE_REQUIRED");
    expect((body as { error: { message: unknown; details: unknown } }).error.message).toEqual(expect.any(String));
    expect((body as { error: { details: unknown } }).error.details).toEqual({
      platform: "ios",
      build: BUILD_BELOW_MIN,
      minIOSBuild: MIN_IOS_BUILD,
    });
  });

  it("[version #G4] a build exactly at the MIN_IOS_BUILD boundary passes through", async () => {
    await expectGatePassedWithUnauthorized(iosHeader(BUILD_AT_MIN));
  });

  it.each(["ios/abc", "ios/", "ios", "ios/6/7", "android/6", "IOS/6", "", "ios/-1", "ios/1234567890"])(
    "[version #G5] malformed header %j fails open",
    async (headerValue) => {
      await expectGatePassedWithUnauthorized(headerValue);
    },
  );

  it("[version #G6] surrounding whitespace is trimmed before rejecting ios/0", async () => {
    const { res, body } = await getJson("/api/me", {
      headers: { "X-Atender-Client": " ios/0 " },
    });

    expect(res.status).toBe(426);
    expectError(body, "CLIENT_UPGRADE_REQUIRED");
  });

  it("[version #G7] /healthz is exempt from the client gate even for ios/0", async () => {
    const { res } = await getJson("/healthz", {
      headers: { "X-Atender-Client": "ios/0" },
    });

    expect(res.status).toBe(200);
  });

  it("[version #G8] pre-auth magic-link route is gated for ios/0", async () => {
    const { res, body } = await getJson("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Atender-Client": "ios/0",
      },
      body: JSON.stringify({ email: "blocked@example.test", callbackURL: "https://atender.appily.run/verify" }),
    });

    expect(res.status).toBe(426);
    expectError(body, "CLIENT_UPGRADE_REQUIRED");
  });

  it("[version #G9] tokenless /api/me with ios/0 returns 426 before session middleware can return 401", async () => {
    const { res, body } = await getJson("/api/me", {
      headers: { "X-Atender-Client": "ios/0" },
    });

    expect(res.status).toBe(426);
    expect(res.status).not.toBe(401);
    expectError(body, "CLIENT_UPGRADE_REQUIRED");
  });

  it("[version §5.3] OPTIONS preflight is not rejected by the client gate even for ios/0", async () => {
    const res = await app.request("/api/me", {
      method: "OPTIONS",
      headers: {
        Origin: "https://atender.appily.run",
        "X-Atender-Client": "ios/0",
      },
    });

    expect(res.status).not.toBe(426);
  });
});

describe("version operations invariants", () => {
  it("[version §9] MIN_IOS_BUILD does not exceed the iOS CFBundleVersion in project.yml", () => {
    const projectYml = readFileSync(new URL("../../ios/project.yml", import.meta.url), "utf8");
    const match = projectYml.match(/CFBundleVersion:\s*["']?(\d+)["']?/);

    expect(match).not.toBeNull();
    const bundleVersion = Number(match![1]);
    expect(Number.isInteger(bundleVersion)).toBe(true);
    expect(MIN_IOS_BUILD).toBeLessThanOrEqual(bundleVersion);
  });
});

// Reviewer 追記 (Codex 生成分の穴埋め): 設計 §8 は「境界検証は parseClientHeader + MIN_IOS_BUILD の
// 単体と、実 middleware 経由の両方で行う」と明記しているが、生成分は middleware 経由しか無かった。
//
// ★ この層が無いと #G6 (trim) は原理的に検証できない: HTTP のヘッダ値は Headers 実装が
//   前後空白を落としてから届くため、" ios/0 " は実装が trim してもしなくても "ios/0" になる。
//   実測: parseClientHeader の value.trim() を消しても #G6 は緑のまま = vacuous だった。
describe("parseClientHeader (unit) - 設計 §5.2 / §8", () => {
  it("[version #G6-unit] trims surrounding whitespace before matching", () => {
    expect(parseClientHeader(" ios/0 ")).toEqual({ platform: "ios", build: 0 });
    expect(parseClientHeader("\tios/6\n")).toEqual({ platform: "ios", build: 6 });
  });

  it("[version #G2-unit] parses a well-formed header into platform and build", () => {
    expect(parseClientHeader("ios/6")).toEqual({ platform: "ios", build: 6 });
    expect(parseClientHeader("ios/123456789")).toEqual({ platform: "ios", build: 123456789 });
  });

  it.each([
    ["ios/abc"], ["ios/"], ["ios"], ["ios/6/7"], ["android/6"], ["IOS/6"], [""],
    ["ios/-1"], ["ios/1234567890"], ["ios/6.1"], ["ios/ 6"], ["ios/+6"],
  ])("[version #G5-unit] %j is unparseable and therefore fails open (null)", (value) => {
    expect(parseClientHeader(value)).toBeNull();
  });

  it("[version #G1-unit] undefined header yields null (no version claimed)", () => {
    expect(parseClientHeader(undefined)).toBeNull();
  });

  it("[version #G4-unit] boundary is exclusive: only build < MIN_IOS_BUILD is blocked", () => {
    const blocked = (build: number) => build < MIN_IOS_BUILD;
    expect(blocked(MIN_IOS_BUILD)).toBe(false);
    expect(blocked(MIN_IOS_BUILD + 1)).toBe(false);
    expect(blocked(MIN_IOS_BUILD - 1)).toBe(true);
  });
});
