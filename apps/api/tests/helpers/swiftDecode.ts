/**
 * Swift の合成 Codable の意味論をモデル化した最小デコーダ。
 *
 * 目的: サーバのエラー封筒が **iOS の `ErrorResponse` で decode できる形か**を
 * Node 側のテストから検証する。Swift の合成 `init(from:)` は
 *   - 非 Optional のプロパティに対応するキーが無い       → DecodingError.keyNotFound
 *   - キーはあるが値が null                              → DecodingError.valueNotFound
 *   - 型が違う                                           → DecodingError.typeMismatch
 *   - 未知のキー                                         → 無視 (エラーにならない)
 * という挙動を持つ。ここではその 4 点だけを写す。
 *
 * 契約 (iOS 側):
 *   struct ErrorResponse: Decodable { let error: ErrorBody }
 *   struct ErrorBody: Decodable { let code: String; let message: String }
 */

export type SwiftDecodingErrorKind = "keyNotFound" | "typeMismatch" | "valueNotFound";

export class SwiftDecodingError extends Error {
  constructor(
    readonly kind: SwiftDecodingErrorKind,
    readonly codingPath: string,
  ) {
    super(`${kind} at "${codingPath}"`);
    this.name = "SwiftDecodingError";
  }
}

function keyedContainer(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object") throw new SwiftDecodingError("typeMismatch", path);
  if (value === null) throw new SwiftDecodingError("valueNotFound", path);
  if (Array.isArray(value)) throw new SwiftDecodingError("typeMismatch", path);
  return value as Record<string, unknown>;
}

function decodeString(container: Record<string, unknown>, key: string, path: string): string {
  if (!Object.prototype.hasOwnProperty.call(container, key)) {
    throw new SwiftDecodingError("keyNotFound", path);
  }
  const raw = container[key];
  if (raw === null) throw new SwiftDecodingError("valueNotFound", path);
  if (typeof raw !== "string") throw new SwiftDecodingError("typeMismatch", path);
  return raw;
}

/** iOS の `ErrorResponse` 相当の decode。失敗時は SwiftDecodingError を throw する。 */
export function decodeErrorResponse(raw: unknown): { code: string; message: string } {
  const root = keyedContainer(raw, "");
  if (!Object.prototype.hasOwnProperty.call(root, "error")) {
    throw new SwiftDecodingError("keyNotFound", "error");
  }
  const body = keyedContainer(root.error, "error");
  return {
    code: decodeString(body, "code", "error.code"),
    message: decodeString(body, "message", "error.message"),
  };
}
