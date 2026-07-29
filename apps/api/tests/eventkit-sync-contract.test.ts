// Swift クライアント契約 (S 系) + エラー封筒 (V 系)
//
// 由来: build 13 の実機で `POST /api/personal-events/eventkit-sync` が毎回 400 になった事故。
//   1. Swift の合成 Codable は nil の Optional を **キーごと落とす**のに、
//      zod が bare `.nullable()` (= キー欠落を許さない) だった            → S 系
//   2. zValidator の失敗レスポンスが `{success:false,error:{issues,name}}` で
//      iOS の `ErrorResponse` (code/message が非 Optional) が decode できず、
//      原因が「サーバーエラー (HTTP 400)」に潰れていた                     → V 系
//
// 参照: tests/fixtures/README.md,
//       Muraki/knowledge/gotcha/swift-codable-omits-nil-vs-zod-nullable.md
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { app, prisma } from "./helpers/app";
import { setupCompleteUser } from "./helpers/auth";
import { json, requestJson } from "./helpers/http";
import { SwiftDecodingError, decodeErrorResponse } from "./helpers/swiftDecode";

const RANGE = { from: "2026-07-20", to: "2026-08-16" };

/**
 * body を **そのまま** (TS の型を一切通さず) POST する。
 * `Record<string, unknown>` で受けるのが肝: 型付きの Event を経由すると
 * 欠落キーが `undefined` として復活し、fixture の意味が消える。
 */
async function postRaw(cookie: string, body: unknown) {
  const res = await requestJson(app, "/api/personal-events/eventkit-sync", {
    method: "POST",
    headers: { Cookie: cookie },
    body: body as Record<string, unknown>,
  });
  return { res, body: (await json(res)) as any };
}

/** 全キーが揃った健全なイベント。ここから delete でキーを落として使う。 */
function fullEvent(id: string): Record<string, unknown> {
  return {
    ekExternalId: id,
    ekCalendarId: "cal-a",
    ekOccurrenceStart: "2026-07-23T00:00:00.000Z",
    ekLastModified: "2026-07-22T00:00:00.000Z",
    start: "2026-07-23T00:00:00.000Z",
    end: "2026-07-23T01:00:00.000Z",
    isAllDay: false,
    title: "EK 予定",
    location: "渋谷",
  };
}

function without(base: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const copy = { ...base };
  for (const k of keys) delete copy[k];
  for (const k of keys) {
    // 落とし忘れの自己検査 (このテストが「キー欠落」を見ている根拠)
    expect(Object.prototype.hasOwnProperty.call(copy, k)).toBe(false);
  }
  return copy;
}

describe("S. eventkit-sync — Swift クライアントが送る body の契約", () => {
  it("[S1] location キーが無いイベントを含む body を 200 で受ける", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const { res } = await postRaw(u.cookie, {
      range: RANGE,
      events: [without(fullEvent("S1"), "location")],
    });
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(res.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].ekExternalId).toBe("S1");
    expect(rows[0].location).toBeNull();
  });

  it("[S2] ekLastModified キーが無いイベントを含む body を 200 で受ける", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const { res } = await postRaw(u.cookie, {
      range: RANGE,
      events: [without(fullEvent("S2"), "ekLastModified")],
    });
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(res.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].ekExternalId).toBe("S2");
    expect(rows[0].ekLastModified).toBeNull();
  });

  it("[S3] location と ekLastModified の両キーが無いイベントを 200 で受ける", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const { res } = await postRaw(u.cookie, {
      range: RANGE,
      events: [without(fullEvent("S3"), "location", "ekLastModified")],
    });
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(res.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].location).toBeNull();
    expect(rows[0].ekLastModified).toBeNull();
  });

  it("[S4] 両方を null で明示した body も 200 (従来の TS クライアントの後方互換)", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const { res } = await postRaw(u.cookie, {
      range: RANGE,
      events: [{ ...fullEvent("S4"), location: null, ekLastModified: null }],
    });
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(res.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].location).toBeNull();
    expect(rows[0].ekLastModified).toBeNull();
  });

  it("[S5] 両方に値がある body は 200 で、値がミラーに反映される", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    const { res, body } = await postRaw(u.cookie, {
      range: RANGE,
      events: [{ ...fullEvent("S5"), location: "渋谷デンタルクリニック" }],
    });
    const rows = await db.personalEvent.findMany({ where: { userId: u.user.id } });

    expect(res.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].location).toBe("渋谷デンタルクリニック");
    expect(rows[0].ekLastModified?.toISOString()).toBe("2026-07-22T00:00:00.000Z");
    expect(body.mirrors.map((m: any) => m.ekExternalId)).toContain("S5");
  });

  it("[S6] ★ iOS 実出力 fixture を JSON.parse したまま渡して 200", async () => {
    const db = prisma();
    const u = await setupCompleteUser(db);

    // tests/fixtures/README.md:「JSON.parse した結果をそのまま request body に渡すこと。
    // TS の型を経由して組み直すと欠落キーが undefined として復活し fixture の意味が消える」
    const fixturePath = fileURLToPath(new URL("./fixtures/ios-eventkit-sync-body.json", import.meta.url));
    const parsed = JSON.parse(readFileSync(fixturePath, "utf8"));
    const events = parsed.events as Record<string, unknown>[];
    const has = (i: number, k: string) => Object.prototype.hasOwnProperty.call(events[i], k);

    // fixture が「キー欠落」を保っていることの自己検査。
    // ここが崩れたら fixture の再生成が誤っており、本テストは無力になる。
    expect(events).toHaveLength(3);
    expect(has(0, "location")).toBe(false);
    expect(has(0, "ekLastModified")).toBe(true);
    expect(has(1, "location")).toBe(false);
    expect(has(1, "ekLastModified")).toBe(false);
    expect(has(2, "location")).toBe(true);
    expect(has(2, "ekLastModified")).toBe(true);

    const { res, body } = await postRaw(u.cookie, parsed);
    const rows = await db.personalEvent.findMany({
      where: { userId: u.user.id },
      orderBy: { ekExternalId: "asc" },
    });

    expect(res.status).toBe(200);
    expect(rows.map((r) => r.ekExternalId)).toEqual(["EK-EXT-0001", "EK-EXT-0002", "EK-EXT-0003"]);
    expect(rows[0].location).toBeNull();
    expect(rows[0].ekLastModified?.toISOString()).toBe("2026-07-29T12:00:00.000Z");
    expect(rows[1].location).toBeNull();
    expect(rows[1].ekLastModified).toBeNull();
    expect(rows[1].isAllDay).toBe(true);
    expect(rows[2].location).toBe("渋谷デンタルクリニック");
    expect(rows[2].ekLastModified?.toISOString()).toBe("2026-07-28T09:15:00.000Z");
    expect(body.mirrors).toHaveLength(3);
  });

  it("[S7] 必須フィールド (start/title) の欠落は 400 VALIDATION_ERROR", async () => {
    const u = await setupCompleteUser(prisma());

    const { res, body } = await postRaw(u.cookie, {
      range: RANGE,
      events: [without(fullEvent("S7"), "start", "title")],
    });

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("V. エラー封筒 — iOS の ErrorResponse が decode できる形", () => {
  async function validationFailure() {
    const u = await setupCompleteUser(prisma());
    return postRaw(u.cookie, {
      range: RANGE,
      events: [without(fullEvent("V"), "start")],
    });
  }

  it("[V1] バリデーション失敗は {error:{code:'VALIDATION_ERROR', message:<string>}} を返す", async () => {
    const { res, body } = await validationFailure();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
    // 旧 zValidator の生 ZodError 封筒が残っていないこと
    expect(body.success).toBeUndefined();
    expect(body.error.name).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("ZodError");
  });

  it("[V2] ★ iOS の ErrorResponse (code/message が非 Optional) で decode できる", async () => {
    const { res, body } = await validationFailure();

    expect(res.status).toBe(400);
    const decoded = decodeErrorResponse(body);
    expect(decoded.code).toBe("VALIDATION_ERROR");
    expect(decoded.message.length).toBeGreaterThan(0);
  });

  it("[V2-neg] 旧実装の封筒は同じデコーダで keyNotFound になる (V2 の判別力の証明)", () => {
    const legacy = {
      success: false,
      error: {
        issues: [
          { code: "invalid_type", expected: "string", received: "undefined", path: ["events", 0, "location"], message: "Required" },
        ],
        name: "ZodError",
      },
    };

    expect(() => decodeErrorResponse(legacy)).toThrow(SwiftDecodingError);
    try {
      decodeErrorResponse(legacy);
      expect.unreachable("legacy envelope must not decode");
    } catch (e) {
      expect((e as SwiftDecodingError).kind).toBe("keyNotFound");
      expect((e as SwiftDecodingError).codingPath).toBe("error.code");
    }
  });

  it("[V3] AppError 経路 (RANGE_TOO_LARGE) の封筒は変わっていない", async () => {
    const u = await setupCompleteUser(prisma());

    const res = await app.request("/api/personal-events?from=2026-01-01&to=2027-06-01", {
      headers: { Cookie: u.cookie },
    });
    const body = (await json(res)) as any;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("RANGE_TOO_LARGE");
    const decoded = decodeErrorResponse(body);
    expect(decoded.code).toBe("RANGE_TOO_LARGE");
    expect(decoded.message.length).toBeGreaterThan(0);
  });

  it("[V4] zod issue が複数あるとき message から悪いフィールドが判別できる", async () => {
    const u = await setupCompleteUser(prisma());

    const { res, body } = await postRaw(u.cookie, {
      range: RANGE,
      events: [without(fullEvent("V4"), "start", "title")],
    });

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const message = decodeErrorResponse(body).message;
    expect(message).toContain("start");
    expect(message).toContain("title");
  });
});
