/**
 * 受け入れる最小の iOS CFBundleVersion。これ未満を名乗るクライアントは 426 で弾く。
 *
 * 初期値 1 の理由 (2026-07-17):
 * - block は「そのビルドでは主要機能が壊れる / データを壊す」ときの最終手段
 * - 実ビルドは 1 以上なので、初期値 1 は「誰も弾かれない」= 新設 middleware の本番誤爆余地がゼロ
 * - 値の上げ方は CLAUDE.md の TestFlight 手順を参照
 */
export const MIN_IOS_BUILD = 1;

export type ClientInfo = { platform: "ios"; build: number };

const IOS_CLIENT_RE = /^ios\/(\d{1,9})$/;

/** 解釈できないものは全て null (= ゲート対象外)。フェイルオープン */
export function parseClientHeader(value: string | undefined): ClientInfo | null {
  if (!value) return null;
  const m = IOS_CLIENT_RE.exec(value.trim());
  if (!m) return null;
  return { platform: "ios", build: Number(m[1]) };
}
