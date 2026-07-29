/**
 * 受け入れる最小の iOS CFBundleVersion。これ未満を名乗るクライアントは 426 で弾く。
 *
 * block は「そのビルドでは主要機能が壊れる / データを壊す」ときの最終手段。
 * 値の上げ方は CLAUDE.md の TestFlight 手順を参照。
 *
 * 1 → 12 (2026-07-29, カレンダー3レーン / build 12):
 * - PersonalEvent を date+startMinute/endMinute から start/end の instant に作り替え、
 *   semesterId 列を削除した (破壊的 migration、Touri 承認済)
 * - build 11 以下は消えたフィールドを前提に個人予定 API を叩くため、
 *   デプロイ後は正常動作しない。426 でアップデートを促す方が安全
 * - 必ず MIN_IOS_BUILD <= これから配る CFBundleVersion を確認すること
 *   (逆にすると配った直後に全員が 426 で自滅する)
 */
export const MIN_IOS_BUILD = 12;

export type ClientInfo = { platform: "ios"; build: number };

const IOS_CLIENT_RE = /^ios\/(\d{1,9})$/;

/** 解釈できないものは全て null (= ゲート対象外)。フェイルオープン */
export function parseClientHeader(value: string | undefined): ClientInfo | null {
  if (!value) return null;
  const m = IOS_CLIENT_RE.exec(value.trim());
  if (!m) return null;
  return { platform: "ios", build: Number(m[1]) };
}
