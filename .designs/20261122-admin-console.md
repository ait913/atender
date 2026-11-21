# Atender 簡易管理画面 (ユーザー管理 / 軽い KPI / 公開時間割の管理)

- 作成: 2026-11-22 (Architect)
- 入力: Touri 要望 (2026-11-22) と裁定 (ユーザーは閲覧 + 削除・BAN なし / 公開時間割は 4 操作全部)、`.knowledge/research-20261122-admin.md`
- 基準: `main` `0105910` (1.0.2 = build 24 審査中)。**iOS アプリの変更は無し**。Web は法務ページ (静的 HTML) だけ触る

---

## 0. スコープ

| 区分 | ファイル / 資源 | 内容 |
|---|---|---|
| 新規 | `apps/api/src/admin/` 一式 (§8-1 の表) | 管理ホスト専用のサーバーレンダリング HTML とその処理 |
| 新規 | `apps/api/src/services/activity.service.ts` | 日別の利用記録 |
| 変更 | `apps/api/src/middleware/session.ts` | ユーザー確定後に利用記録を 1 行呼ぶ |
| 変更 | `apps/api/src/index.ts` | ホスト分離 middleware を先頭に、管理 sub-app を `/admin` に mount |
| 変更 | `apps/api/src/env.ts` | `ADMIN_HOST` / `ADMIN_ACCESS_TEAM_DOMAIN` / `ADMIN_ACCESS_AUD` (任意・3 つ揃いで有効) |
| 変更 | `apps/api/src/routes/userTimetables.ts` / `routes/templates.ts` | 運営が非公開にした時間割を作成者が公開に戻せないようにする (§9-2) |
| 変更 | `apps/api/prisma/schema.prisma` + migration `20261122120000_admin_console` | 表 3 つ追加 + `TimetableTemplate.hiddenByAdminAt` 列追加 (全て additive) |
| 変更 | `apps/web/public/privacy.html` / `terms.html` | §16 の文案 (Touri 承認後) |
| 変更 (テスト) | `apps/api/tests/a2-review.test.ts` / `apps/web/tests/legal/ais-mail.review.test.ts` / `apps/api/tests/setup.ts` | §14 の移行表 |
| 触らない | `apps/ios/**` / `apps/web/src/**` / `packages/shared/**` | iOS 1.0.2 審査中。管理 UI を Web SPA に入れない (全利用者に配られるため) |
| インフラ | Cloudflare Access アプリ 1 本 + IdP 1 本、AIS Pass client 1 本、Coolify atender-api の env 3 つ + ドメイン 1 本 | 新しい Coolify リソース・DB は作らない |

## 1. 目的

運営者 (Touri 1 人) が、(1) 登録数と「登録した人が使い続けているか」を見て、(2) ユーザーを確認・削除し、(3) 公開時間割と学校・学科の表記ゆれ・重複を整理できるようにする。iOS/Web の利用者には何も配らず、既存の API プロセスに足すだけで済ませる。

## 2. 全体構成

```
ブラウザ (Touri)
   │ https://atender-admin.appily.run/admin/...
   ▼
Cloudflare Access (アプリ: atender-admin、IdP: AIS Pass (atender-admin) だけ)
   │ Cf-Access-Jwt-Assertion を付与
   ▼
cloudflared → Traefik (Host で振り分け) → atender-api コンテナ (既存・同一プロセス)
   ├─ adminHostGate (全リクエストの最初)
   │     Host = ADMIN_HOST      → /admin* 以外は 404、GET/HEAD/POST 以外は 405
   │     Host ≠ ADMIN_HOST      → /admin* は 404 (存在しないルートと同じ応答)
   ├─ 既存: cors / clientVersionGuard / /api/* (iOS・Web)    ← 変更なし
   └─ /admin sub-app
         securityHeaders → accessJwt (RS256・iss・aud・exp・email) → sameOriginPost → 画面
```

- 管理ホスト名は **`atender-admin.appily.run`**。理由: Atender の既存ホスト (`atender.appily.run` / `atender-api.appily.run`) と同じ zone で、`*.appily.run` の wildcard CNAME → Tunnel → Traefik の既存経路に乗るので DNS 作業が無い。1 階層サブドメインなので Universal SSL の証明書がある (`gotcha/cloudflare-access-multi-domain-redirects-to-uncertified-host.md` の 2 階層問題に当たらない)。appily.run の Access アプリは bloom-admin 系に前例がある。`www.` 付きは Coolify にも Access にも登録しない。
- 同一オリジンのフォーム POST とリンクだけで組み、JavaScript を 1 行も配らない。別オリジン fetch が無いので `library/cloudflare-access-cors-preflight-and-app-paths-2026.md` の preflight 問題は起きない。
- 管理が侵害されたときにできること (`pattern/admin-service-internal-api-and-pseudonymous-event-log.md` の How to apply に従って表にする):

| 侵害の形 | できること | 防いでいる層 |
|---|---|---|
| Access と JWT 検証の両方を破られた | 全ユーザーのメール・利用日の閲覧、アカウント削除、公開時間割の編集・削除、学校統合 | Access (AIS Pass の client 単位の許可) + オリジンの JWT 検証 + Host 照合 |
| 管理者のブラウザで別サイトから POST を撃たれる (CSRF) | 同上の書き込み | POST の `Origin` 完全一致 (§3-4)。`appily.run` 配下の他アプリは same-site なので SameSite cookie では防げない |
| API プロセスのコード実行 | 既存と同じ (DB 全体) | 本設計で増えない |

時間割の中身・出欠・メモ・IP・UA・トークンは画面に出さない (§11)。

## 3. ホスト分離と認証

### 3-1. 設定 (env)

```ts
// apps/api/src/env.ts に追加 (既存の EnvSchema に optional で足し、superRefine で「3 つ揃い or 3 つ無し」)
ADMIN_HOST: OptionalNonEmptyString,               // 例 "atender-admin.appily.run" (小文字 host、scheme なし、port 可)
ADMIN_ACCESS_TEAM_DOMAIN: OptionalNonEmptyString, // 例 "https://ait913.cloudflareaccess.com" (末尾 / は除去して保持)
ADMIN_ACCESS_AUD: OptionalNonEmptyString,         // Access アプリの AUD タグ

// apps/api/src/admin/config.ts
export type AdminConfig = {
  host: string;           // ADMIN_HOST を toLowerCase
  teamDomain: string;     // 末尾 "/" 除去済み。iss の期待値
  aud: string;
  certsUrl: string;       // `${teamDomain}/cdn-cgi/access/certs`
  expectedOrigin: string; // `https://${host}`
};
/** 3 つとも未設定 (undefined / "") → null。1〜2 つだけ → Error を投げる。
 *  host が /^[a-z0-9.-]+(:\d{1,5})?$/ に合わない、teamDomain が https: の URL でない → Error */
export function adminConfigFromEnv(source: Record<string, string | undefined>): AdminConfig | null;
export const adminConfig: AdminConfig | null; // = adminConfigFromEnv(process.env)。起動時に 1 回
```

`env.ts` の既存の流儀 (起動時 parse・失敗で起動しない) に合わせ、設定ミスは起動失敗にする (fail loud)。未設定は「管理画面なし」で起動する (fail closed)。

### 3-2. adminHostGate

```ts
// apps/api/src/admin/hostGate.ts
export function adminHostGate(config: AdminConfig | null): MiddlewareHandler;
// index.ts: app.use("*", adminHostGate(adminConfig)) を corsMiddleware より前に。
//           if (adminConfig) app.route("/admin", createAdminApp(adminConfig));
```

- ホストは `new URL(c.req.url).host.toLowerCase()` で取る (@hono/node-server は `Host` ヘッダから URL を組む)。`X-Forwarded-Host` は読まない。
- 管理パス = `c.req.path === "/admin"` または `c.req.path.startsWith("/admin/")` (Hono がデコードした後のパス)。
- 判定表:

| config | ホスト | 管理パス | メソッド | 結果 |
|---|---|---|---|---|
| null | 任意 | はい | 任意 | `c.notFound()` (既定の 404 と同一) |
| null | 任意 | いいえ | 任意 | `next()` (既存どおり) |
| あり | = host | はい | GET/HEAD/POST | `next()` |
| あり | = host | はい | その他 | 405 (本文 `Method Not Allowed`、`Allow: GET, HEAD, POST`) |
| あり | = host | いいえ | 任意 | `c.notFound()` |
| あり | ≠ host | はい | 任意 | `c.notFound()` |
| あり | ≠ host | いいえ | 任意 | `next()` |

### 3-3. Access JWT 検証

```ts
// apps/api/src/admin/access.ts
export type AdminActor = { email: string; sub: string };
export type AdminDeps = { fetch: typeof fetch };
export type AccessVerifyFailure =
  | "missing" | "malformed" | "alg" | "kid" | "signature" | "claims" | "email" | "jwks_unavailable";
export async function verifyAccessJwt(
  token: string | undefined, config: AdminConfig, deps: AdminDeps,
): Promise<{ ok: true; actor: AdminActor } | { ok: false; reason: AccessVerifyFailure }>;
export function __resetAccessJwksCacheForTests(): void;
```

手順:
1. `Cf-Access-Jwt-Assertion` ヘッダを読む。無い・空・8192 文字超 → `missing`。cookie (`CF_Authorization`) は読まない。
2. `decodeHeader` (hono/utils/jwt) が投げる → `malformed`。`alg !== "RS256"` → `alg`。`kid` が無い → `kid`。
3. 鍵集合: プロセス内キャッシュ `{ keys, fetchedAt }`。キャッシュが無い or 10 分経過 → `deps.fetch(certsUrl, { signal: AbortSignal.timeout(5000) })`。トークンの `kid` が鍵集合に無く、最後の取得から 60 秒以上経っていれば 1 回だけ取り直す。取得失敗 (例外・非 200・`keys` が配列でない) のとき、過去に成功した鍵集合が 24 時間以内なら それを使い、無ければ `jwks_unavailable`。それでも `kid` が無ければ `kid`。
4. `verifyWithJwks(token, { keys, allowedAlgorithms: ["RS256"], verification: { iss: config.teamDomain, aud: config.aud } })` (hono 4.13.13 実装を確認済み: `aud` は payload の配列にも対応、`exp`/`nbf`/`iat` を既定で検査)。署名不一致 → `signature`、その他の claim 例外 → `claims`。
5. **hono の `verify` は `exp` が無いと検査を飛ばす** (`jwt.js:52`) ので、`typeof payload.exp !== "number"` を自前で `claims` にする。
6. `payload.email` が空でない string でなければ `email`。`actor = { email, sub: String(payload.sub ?? "") }`。

応答: `jwks_unavailable` → 503 (本文「認証鍵を取得できませんでした。時間をおいて再読み込みしてください。」)、それ以外の失敗 → 403 (本文「この画面にはアクセスできません。」)。理由コードはサーバーログ `admin_access_denied reason=<code>` にだけ出し、応答に出さない。

管理者のメール許可リストはオリジン側に持たない (不採用案 N4)。

### 3-4. 同一オリジン POST

`sameOriginPost`: メソッドが POST のとき `Origin` ヘッダが `config.expectedOrigin` と完全一致しなければ 403 (本文「不正な送信元です。」)。GET/HEAD は見ない。

### 3-5. 応答ヘッダ (admin sub-app の全応答。403/404/422/503 を含む)

```
Content-Type: text/html; charset=utf-8          (405 と hostGate の 404 は対象外)
Cache-Control: no-store
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Robots-Tag: noindex, nofollow
```

admin sub-app は最後に `all("*")` の 404 HTML (「見つかりません」) を持ち (未知の `/admin/xxx` も認可を通った後にここで HTML の 404 になる。親の text の notFound には落とさない)、自前の `onError` を持ち (Hono の `route()` は sub-app の errorHandler を合成する: `hono-base.js:105-117` で確認)、`AppError` は同じ status の HTML エラーページ、それ以外は 500 の HTML (「処理に失敗しました」) で返す (既存の JSON 封筒を管理画面に出さない)。

## 4. データモデル

```prisma
// schema.prisma に追加
enum ActivityPlatform {
  IOS // X-Atender-Client: ios/<数字> を名乗った要求
  WEB // それ以外 (ヘッダなし・解釈不能)
}

/// 認証済み要求があった「ユーザー × 日 (Asia/Tokyo) × 環境」。時刻は持たない
model UserDailyActivity {
  userId   String
  user     User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  date     String           // "YYYY-MM-DD" (Asia/Tokyo)
  platform ActivityPlatform

  @@id([userId, date, platform])
  @@index([date])
}

/// KPI の集計から外すユーザー (運営者本人・テスト用アカウント)
model AdminKpiExclusion {
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}

/// 管理操作の記録。追記のみ (更新・削除の経路を作らない)
model AdminAuditLog {
  id         String   @id @default(cuid())
  createdAt  DateTime @default(now())
  actorEmail String   // Access JWT の email
  action     String   // §12 の列挙
  targetType String   // "user" | "template" | "school" | "department"
  targetId   String
  detail     String   // JSON 文字列 (§12)

  @@index([createdAt])
}

// User に relation 2 本 (列は増えない)
//   dailyActivities UserDailyActivity[]
//   kpiExclusion    AdminKpiExclusion?
// TimetableTemplate に列 1 本
//   hiddenByAdminAt DateTime? // null 以外 = 運営が非公開にした。不変条件: null 以外なら isPublic = false
```

- `date` を DateTime でなく文字列にする理由: 既存の日付列 (JST 00:00 の DateTime) は TZ の取り違えが起きやすく、KPI は日付の比較と集合演算しかしない。`lib/tz.ts` の `today(now).isoDate` と同じ形式。
- migration は `prisma migrate dev --create-only --name admin_console` で生成し、ディレクトリ名を `20261122120000_admin_console` にする。**受入条件: `migration.sql` に `PRAGMA foreign_keys=OFF` / `CREATE TABLE "new_` / `INSERT INTO "new_` が無い** (= 既存表の作り直しが無い。`ALTER TABLE "TimetableTemplate" ADD COLUMN "hiddenByAdminAt" DATETIME;` と `CREATE TABLE` 3 本 + index だけ)。
- enum 名・識別子に `personalEvent|roomEvent|icsImport|googleCalendar|personalCalendarShare` (大文字小文字無視) を含めない (`a2-calendar-removed.test.ts` AD12 が `src/**/*.ts` を走査する)。

## 5. 利用の記録

```ts
// apps/api/src/services/activity.service.ts
export type ActivityPlatformValue = "IOS" | "WEB";
/** parseClientHeader (lib/clientVersion.ts) が非 null → "IOS"、null → "WEB" */
export function activityPlatformFromHeader(value: string | undefined): ActivityPlatformValue;
/** today(now).isoDate (Asia/Tokyo) */
export function activityDateKey(now: Date): string;
/** 例外を投げない。"written" = INSERT OR IGNORE を実行した (既存行で無視された場合も含む)
 *  "cached" = 当日・同キーを記録済みで DB に触らなかった / "failed" = DB 例外 */
export async function recordActivity(
  userId: string, platform: ActivityPlatformValue, now?: Date,
): Promise<"written" | "cached" | "failed">;
export function __resetActivityCacheForTests(): void;
```

- プロセス内キャッシュ: `cacheDate: string | null` と `Set<"<userId>|<platform>">`。`activityDateKey(now) !== cacheDate` なら Set を空にして `cacheDate` を更新。Set にあれば `"cached"`。無ければ **先に Set へ入れてから** `prisma.$executeRaw\`INSERT OR IGNORE INTO "UserDailyActivity" ("userId","date","platform") VALUES (${userId}, ${date}, ${platform})\`` を await。例外なら Set から消して (次の要求で再試行) `console.error("activity_record_failed", { code })` を出し `"failed"`。
  - Set を先に入れるのは、iOS 起動時の並列要求 (`/api/me` ほか) で同じ INSERT を重ねないため。同時に来ても INSERT OR IGNORE なので最悪でも重複はしない。
  - 再起動で Set が消えても INSERT OR IGNORE で行は増えない。メモリは「当日アクセスしたユーザー数 × 2」で頭打ち。
- `sessionMiddleware` の 2 つの成功経路 (getSession 成功 / DB フォールバック) の両方で、`c.set("session", …)` の直後・`await next()` の前に `await recordActivity(user.id, activityPlatformFromHeader(c.req.header("X-Atender-Client")))` を 1 行足す。戻り値は使わない。
  - 「認証を通った要求」を数える。ハンドラが後で 403/409 を返しても記録する。401 (未認証) と、`clientVersionGuard` の 426 (sessionMiddleware より前) は記録しない。
- 1 日の最初の要求だけ INSERT 1 回分の待ちが増える。2 回目以降は DB に触らない。

## 6. KPI の定義

### 6-1. 用語

- `today` = `now` の Asia/Tokyo 日付。`Y` = `today` の前日 (今日は途中なので継続の判定に使わない)。
- `signupDate(u)` = `User.createdAt` の Asia/Tokyo 日付。
- `M` (計測開始日) = `UserDailyActivity.date` の最小値 **の翌日**。導入日は途中から記録が始まるので丸 1 日記録できた最初の日を M とする。行が 0 件なら M = null。
- 週 = Asia/Tokyo の **月曜始まり**。`weekStart(d)` = d 以前で最も近い月曜。
- 「アクティブ」= その日に `UserDailyActivity` の行が 1 つ以上ある (環境は問わない)。
- KPI の母集団 = 現存する User から `AdminKpiExclusion` のユーザーを除いたもの。除外ユーザーの利用行も使わない。

### 6-2. 表示する数字

1. **概要**: 総ユーザー数、直近 7 日のアクティブ人数 (`[today-6, today]` に 1 日以上)、直近 28 日のアクティブ人数 (`[today-27, today]`)、計測開始日 M、除外中の人数。M = null なら 7 日 / 28 日は「—」。
2. **日別 (直近 28 日、新しい順)**: 日付 / 新規登録数 (signupDate = その日) / アクティブ人数 / うち iOS / うち Web (同じ人が両方なら両方に数える)。**d < M の日はアクティブ系 3 列を「—」** (導入日の途中記録も「—」)。
3. **週別登録 (直近 12 週、新しい順)**: 週の月曜 / 新規登録数 / 累計 (signupDate ≤ その週の日曜)。
4. **登録コホートの継続率 (週コホート × W1〜W8)**:
   - 行 = `weekStart(today)` から `weekStart(M)` までの各週 (新しい順、最大 26 行)。行のメンバー = signupDate がその週の月〜日 **かつ signupDate ≥ M** のユーザー。
   - 列 WN (N = 1..8): ユーザーごとの窓 `[s+7N, s+7N+6]` (s = signupDate)。**窓の末日 ≤ Y のメンバーだけが分母**。分子 = 分母のうち窓の中に 1 日以上アクティブ。
   - セル表示 `分子/分母 (割合%)`、割合 = `Math.round(分子 * 100 / 分母)`。分母 0 → 「—」。
5. **計測開始前に登録したユーザーの継続 (1 行)**: メンバー = signupDate < M のユーザー全員。列 K (K = 1..8): 窓 `[M+7(K-1), M+7(K-1)+6]`。窓の末日 > Y → 「—」、それ以外は分母 = メンバー全員、分子 = 窓の中にアクティブ。M = null ならこの表を出さない。

週コホートにした理由: 現在 18 人で週 1 人前後の登録。日コホートは全セルが 0/1 か 1/1 になり読めない。月コホートは結果が出るまで遅すぎる。人数が小さいので割合だけでなく分子/分母を必ず出す。

### 6-3. 純関数

```ts
// apps/api/src/admin/kpi.ts (DB に触らない)
export type KpiUser = { id: string; createdAt: Date };
export type KpiActivity = { userId: string; date: string; platform: "IOS" | "WEB" };
export type RetentionCell = { eligible: number; retained: number } | null; // null = 分母 0
export type KpiReport = {
  today: string; yesterday: string;
  measurementStart: string | null;
  totals: { users: number; active7: number | null; active28: number | null };
  daily: { date: string; signups: number; active: number | null; ios: number | null; web: number | null }[]; // 28 行、today が先頭
  weekly: { weekStart: string; signups: number; cumulative: number }[]; // 12 行、weekStart(today) が先頭
  cohorts: { weekStart: string; size: number; cells: RetentionCell[] }[]; // cells は常に 8 要素
  legacy: { size: number; cells: RetentionCell[] } | null;               // M = null なら null
};
export function computeKpi(input: { users: KpiUser[]; activity: KpiActivity[]; now: Date }): KpiReport;
// users に無い userId の activity は無視する
```

### 6-4. 検算済みの標本 (scratchpad で規則を実走した値。Reviewer の KP2 の期待値)

入力 (`now = 2026-12-29T03:00:00Z` → today 2026-12-29、Y 2026-12-28):

| user | createdAt (UTC) | signupDate (JST) |
|---|---|---|
| u1 | 2026-10-01T03:00:00Z | 2026-10-01 |
| u2 | 2026-11-05T03:00:00Z | 2026-11-05 |
| u3 | 2026-11-24T03:00:00Z | 2026-11-24 |
| u4 | 2026-11-26T03:00:00Z | 2026-11-26 |
| u5 | 2026-11-30T15:00:00Z | **2026-12-01** (JST 0:00 ちょうど) |
| u6 | 2026-11-30T14:59:59Z | **2026-11-30** |

activity: u1 {11-22 IOS, 11-25 IOS, 12-02 WEB}、u2 {12-20 IOS}、u3 {11-24 IOS, 12-03 IOS, 12-03 WEB, 12-22 IOS}、u4 {11-26 WEB, 12-12 WEB}、u5 {12-01 IOS, 12-08 IOS}、u6 {11-30 IOS} (年は全て 2026)。

期待値:
- `measurementStart` = `2026-11-23` (最小 11-22 の翌日)
- `totals` = `{ users: 6, active7: 0, active28: 5 }`
- `daily` (範囲は 2026-12-29〜12-02 の 28 行): 2026-12-03 → `{ signups: 0, active: 1, ios: 1, web: 1 }` (u3 が両方)、2026-12-20 → `{ signups: 0, active: 1, ios: 1, web: 0 }`、2026-12-28 → `{ signups: 0, active: 0, ios: 0, web: 0 }`。11-22〜11-30 は範囲外なので `daily` に無い (「d < M は null」は KP1 と、M を範囲内に置いた別の入力で確かめる)
- `weekly`: 2026-11-30 → `{ signups: 2, cumulative: 6 }`、2026-11-23 → `{ signups: 2, cumulative: 4 }`、2026-11-02 → `{ signups: 1, cumulative: 2 }`、2026-12-28 → `{ signups: 0, cumulative: 6 }`
- `cohorts` (6 行: 12-28, 12-21, 12-14, 12-07, 11-30, 11-23):
  - 12-28 / 12-21 / 12-14 / 12-07: size 0、cells 全て null
  - 11-30: size 2、cells `[1/2, 0/2, 0/2, null, null, null, null, null]`
  - 11-23: size 2、cells `[1/2, 1/2, 0/2, 1/1, null, null, null, null]` (W4 は u3 の窓 12-22〜12-28 だけが末日 ≤ Y)
- `legacy`: size 2 (u1, u2)、cells `[1/2, 1/2, 0/2, 1/2, 0/2, null, null, null]`

(`a/b` は `{ retained: a, eligible: b }`)

## 7. UI/UX

### 7-1. 方針

- Atender の DESIGN.md (iOS の視覚言語) には寄せない。管理画面は運営者 1 人の作業道具なので、法務ページ (`apps/web/public/privacy.html`) と同じ配色変数と system フォントで、表とフォームだけで組む。
- ナビ構造 (`ui-ux-design-perspectives.md` §5): 「対等なコンテキストを数個往復」→ 上部の横並びナビ 5 項目 (KPI / ユーザー / 公開時間割 / 学校・学科 / 操作履歴)。階層は「一覧 → 詳細 → 確認」の最大 3 段だが、確認ページは破壊的操作専用で常に詳細へ戻るリンクを持つ。
- タスク頻度: 最頻 = KPI を見る (トップ `/admin` が KPI へ 302)。次 = ユーザー検索 → 詳細 (2 クリック)。整理作業 (統合・削除) は低頻度で詳細の下部に置く。
- JavaScript なし。確認は「確認ページ + 確認コードの入力」で行う (ブラウザのダイアログに頼らない)。

### 7-2. 共通レイアウト

```
┌───────────────────────────────────────────────────────────────┐
│ Atender 管理   KPI  ユーザー  公開時間割  学校・学科  操作履歴      touri@…(actor) │
├───────────────────────────────────────────────────────────────┤
│ [完了バナー: 例「ユーザーを削除しました」] ← ?ok=<code> のときだけ      │
│ <h1>ページ名</h1>                                               │
│ 本文 (表 / フォーム)                                             │
└───────────────────────────────────────────────────────────────┘
```

- `<html lang="ja">`、`<meta name="viewport" content="width=device-width, initial-scale=1">`、`<meta name="robots" content="noindex">`、`<title><ページ名> | Atender 管理</title>`。
- 現在のナビ項目に `aria-current="page"`。actor のメールは右端に全文 (運営者自身の情報)。
- 完了バナーは `ok` クエリの値を固定の文言表に引くだけ (表に無い値は何も出さない = 任意文字列を反射しない)。表: `user_deleted` 「ユーザーを削除しました」/ `kpi_excluded` 「KPI の集計から外しました」/ `kpi_included` 「KPI の集計に戻しました」/ `template_hidden` 「非公開にしました」/ `template_unhidden` 「公開に戻しました」/ `template_deleted` 「公開時間割を削除しました」/ `saved` 「保存しました」/ `deleted_row` 「削除しました」/ `renamed` 「名前を変更しました」/ `merged` 「統合しました」。

### 7-3. トークン (admin 専用 CSS 変数。レイアウトの `<style>` 1 か所に置く)

| 用途 | light | dark | 根拠 |
|---|---|---|---|
| `--bg` / `--surface` / `--text` / `--text-2` / `--border` / `--link` | `#F7F8FA` / `#FFFFFF` / `#0F172A` / `rgba(15,23,42,.72)` / `rgba(15,23,42,.12)` / `#0F6399` | `#0B0E14` / `#1A1F2A` / `#F5F6F8` / `rgba(245,246,248,.72)` / `rgba(255,255,255,.12)` / `#63BEF5` | privacy.html と同値 (border だけ表の罫線用に .08 → .12) |
| `--danger` | `#B42318` (白地 6.57:1) | `#F97066` (#1A1F2A 地 5.92:1) | 破壊的ボタン・エラー |
| `--ok` | `#067647` (5.69:1) | `#75E0A7` (10.19:1) | 完了バナー・「公開中」 |
| `--warn` | `#B54708` (5.43:1) | `#FDB022` (8.96:1) | 「運営が非公開」・リンク中の注意 |

- dark は `prefers-color-scheme` のみ (手動切替なし)。コントラストは scratchpad で計算した値 (全て 4.5:1 以上)。
- 本文 15px / 行間 1.6 (表が主体の密度重視画面のため 16px から 1 段下げる。`ui-ux-design-perspectives.md` §1 の Web 14-16px の範囲内)。見出し h1 22px / h2 17px の 3 段。
- 余白: セル内 8px 12px、要素間 12px、セクション間 32px。角丸 8px。最大幅 1120px、表は横スクロール (`overflow-x: auto` の枠)。
- ボタン・入力の高さ 40px 以上、リンク行は行全体でなく名前リンク (タップ領域 44px は管理画面がデスクトップ前提のため適用しない。逸脱理由: 運営者 1 人の PC 作業専用)。
- `:focus-visible` に 2px の `--link` アウトライン。状態は色だけで示さず必ず文字 (「公開中」「作成者が非公開」「運営が非公開」) を付ける。破壊的ボタンは `--danger` の枠線 + 文字「削除する」「統合する」(塗りの primary にしない)。

### 7-4. 画面

**P1 KPI `/admin/kpi`** (`/admin` は 302 で ここへ)

```
概要   総ユーザー 18   直近7日 6   直近28日 9   計測開始 2026-11-23   除外 2人
───────────────
登録コホートの継続 (その週に1回でも使った人 / 判定できる人)
 登録週      人数  W1        W2        … W8
 2026-11-30   2    1/2 (50%) 0/2 (0%)  … —
───────────────
計測開始前に登録した人 (12人)   計測1週目 … 8週目
───────────────
日別 (直近28日)   日付 | 新規登録 | アクティブ | iOS | Web
───────────────
週別の登録 (直近12週)   週 | 新規登録 | 累計
```

- 表の注記 (各表の直下、`--text-2`): 「今日は途中のため継続の判定に含めません」「— は判定できる日数に達していない、または計測前」「退会したユーザーは過去の数字からも消えます」(§19 Q1 = A の場合の文言)。
- 空状態: M = null → 概要の下に「まだ計測データがありません。利用の記録は導入した日の翌日から集計します。」を出し、コホート 2 表は出さない。日別表はアクティブ列が全て「—」で出る。

**P2 ユーザー一覧 `/admin/users?q=&sort=`**

```
[検索: メール・名前・ハンドル・ID] [検索]     並び: 登録が新しい順 | 最終アクセスが新しい順
 登録日     名前 (@handle)   メール          最終アクセス  利用環境(28日) 学校 / 学科        時間割 出欠記録 公開 KPI
 2026-11-20 山田 (@yamada)  y***@example.com 2026-11-22    iOS・Web     専門学校A / 情報   2     154     1   除外
```

- 列の定義: 登録日 = signupDate / 最終アクセス = その人の `UserDailyActivity.date` の最大、無ければ「計測前」/ 利用環境 = `[today-27, today]` に行がある環境 (「iOS」「Web」「iOS・Web」「—」)/ 学校・学科 = 名前、未設定は「未設定」/ 時間割 = `UserTimetable` 件数 / 出欠記録 = `AttendanceRecord` 件数 / 公開 = `TimetableTemplate` で `authorUserId = その人 AND isPublic = true` の件数 / KPI = 除外なら「除外」。
- メールは伏せる: `maskEmail(e)` = 最後の `@` で分け、ローカル部の 1 文字目 + `***` + `@` + ドメイン。`@` が無ければ `***`。全文は詳細だけ。
- `q` (1〜100 文字、trim) は email / name / handle の部分一致 (Prisma `contains`) か id の完全一致の OR。`sort` は `created` (既定、createdAt 降順) / `last` (最終アクセス降順、「計測前」は末尾、同値は createdAt 降順)。上限 500 行、超えたら表の下に「500 件で打ち切りました。検索で絞り込んでください。」。
- 空状態: 0 人 → 「ユーザーはまだいません」。検索 0 件 → 「「<q>」に一致するユーザーはいません」(q はエスケープ) + 検索解除リンク。

**P3 ユーザー詳細 `/admin/users/:id`**

```
<h1>名前 (@handle)</h1>
基本     メール (全文) / ユーザーID / 登録日時 (JST, 分まで) / ログイン方法 / 学校・学科
利用     最終アクセス / 直近28日の利用日 (日付 + iOS/Web の列挙。無ければ「なし」)
         セッション数 / 最新のセッション更新 (目安: 24時間単位でしか更新されません)
データ   学期 n / 時間割 n / 科目 n / 出欠記録 n (最後に記録した日) / 友達 n / 参加ルーム n
         作成した時間割テンプレート: タイトル (状態) → P6 へのリンク
KPI      [KPI の集計から外す] または [KPI の集計に戻す]  (POST)
──────── 危険な操作 ────────
[アカウントを削除…] → P4
```

- ログイン方法: `Account.providerId` を `apple` → 「Apple」、`google` → 「Google」、その他 → 「メール」に写して重複を除き「・」で連結。Account 0 件 → 「メール」。
- 友達 = `Friendship` で自分が sender か receiver かつ `status = ACCEPTED` の件数。ルーム = `RoomMembership` 件数。
- **出さないもの**: IP アドレス、User-Agent、セッショントークン、Account のトークン類、`inviteCode`、プロフィール画像 (外部 URL を読み込まない。CSP でも塞がる)、時間割の科目名・教員名・教室・メモ、出欠の状態とメモ。理由: 運営の判断 (削除・問い合わせ対応・KPI) に要らない私的な中身を画面に出さない。

**P4 アカウント削除の確認 `/admin/users/:id/delete` (GET) → POST 同 URL**

```
<h1>アカウントを削除</h1>
対象: 名前 (@handle) / メール全文 / 登録日
削除されるもの: 時間割 n・出欠記録 n・友達 n・参加ルーム n・セッション n
ルーム: 作成したルーム n (メンバーがいれば最古参に引き継ぎ、いなければ削除)
公開時間割 n 件は作成者不明として残ります。非公開の時間割テンプレートは削除されます。
Apple / Google の連携解除を依頼します。
[!] この操作は取り消せません。
(actor のメールと対象のメールが一致するときだけ) [!] 管理者と同じメールアドレスのアカウントです。
確認のため「<確認コード>」と入力: [______]   [削除する]  [キャンセル (詳細へ戻る)]
```

- 確認コード = `confirmCode(id)` = id の末尾 6 文字 (§8-3)。

**P5 公開時間割一覧 `/admin/templates?state=`**

- 表: 状態 / タイトル / 学校 / 学科 / 作成者 (`@handle` で P3 へリンク、`authorUserId = null` は「退会済み」) / 科目数 / コマ数 / コピー数 / 更新日 / 元の時間割 (「リンク中」 = `sourceUserTimetableId` が非 null かつ作成者あり、それ以外「なし」)。
- 状態 = `hiddenByAdminAt != null` → 「運営が非公開」、それ以外で `isPublic` → 「公開中」、それ以外 → 「作成者が非公開」。
- `state` = `all` (既定) / `public` / `author_private` / `admin_hidden` の絞り込みリンク。並びは updatedAt 降順。上限 500。
- 空状態: 「時間割テンプレートはまだありません」/ 絞り込み 0 件は「この状態の時間割はありません」。

**P6 公開時間割の詳細と編集 `/admin/templates/:id`**

```
<h1>タイトル</h1>  [状態バッジ]  学校 / 学科  作成者  コピー数  更新日時
(リンク中のとき・--warn の枠)
  作成者が公開設定を保存すると、学校・学科・時限・科目・コマは作成者の時間割で作り直されます。
  タイトル・説明・学年・学期は残ります。恒久的な付け替えは「学校・学科」の統合で行ってください。
操作: [非公開にする] または [公開に戻す] (運営が非公開のときだけ) / [削除…] → P7
── 基本情報 ── (1 フォーム)
  タイトル [____] 説明 [textarea] 学年 [select: なし,1..8] 学期 [____]
  学科 [select: <optgroup 学校名> 学科名 …]   [保存]
── 時限 ── (行ごとの 1 フォーム)
  1限  ラベル[1限] 開始[09:00] 終了[10:30] [ ]休憩  [保存]
── 科目 ── (行ごとの 1 フォーム)
  名前[____] 教員[____] 色[#RRGGBB] メモ[____] [保存] [削除…]
  (追加行) 名前[____] 教員 色 メモ [追加]
── コマ ── (行ごとの 1 フォーム、曜日 → 開始時限の順)
  科目[select] 曜日[日..土] 開始時限[select] コマ数[1..8] 教室[____] [保存] [削除する]
  (追加行) … [追加]
```

- 時刻入力は `<input type="time">` (HH:MM) を分に変換。曜日は `0..6 = 日..土` (既存の `TemplateMeeting.dayOfWeek` の JS 規約)。
- 科目の削除は確認ページ `/admin/templates/:id/courses/:courseId/delete` (そのコマ n 件も消える旨を表示、確認コードは courseId の末尾 6 文字)。コマの削除は即時 (1 行で作り直せるため)。
- 科目 0 件・コマ 0 件の空状態: 「科目はありません」「コマはありません」+ 追加行。

**P7 公開時間割の削除確認** — P4 と同形。「この時間割をコピーした人の時間割は残ります (元テンプレとの紐付けだけ外れます)」を表示。

**P8 学校一覧 `/admin/schools?q=`**: 名前 / 区分 (kind の日本語) / 都道府県 / 出典 (「文科省」= `mextCode` 非 null、「ユーザー追加」) / 学科数 / ユーザー数 / 時間割数。q は name・nameKana の部分一致。並びは名前昇順、上限 500。空状態「一致する学校はありません」。

**P9 学校詳細 `/admin/schools/:id`**

```
<h1>学校名</h1>  区分 / 都道府県 / 出典 / 作成日
── 名前の変更 ── 名前[____] よみ[____] [変更]   (文科省の学校はフォームの代わりに「文科省データの学校は起動時に元の名前へ戻るため変更できません」)
── 学科 ── 学科名 | ユーザー | 時間割 | 出欠ルール | 名前[____][変更] | 統合先[select 同じ学校の他学科][統合…]
── この学校を別の学校へ統合 ── (文科省の学校には出さない)
  統合先 [select: 他の全学校 (名前 / 都道府県 / 出典)] [統合…] → P10
```

**P10 統合の確認 `/admin/schools/:id/merge?into=<targetId>` / `/admin/departments/:id/merge?into=<targetId>`**

```
<h1>「S」を「T」へ統合</h1>
移るもの: ユーザー n / 時間割テンプレート n / 出欠ルール n
学科: 「情報処理科」→ T の「情報処理科」へ統合 / 「ゲーム科」→ T へ移動
重複のため捨てる出欠ルール n (統合先の設定を残します)
統合後「S」は削除されます。[!] 取り消せません。
確認のため「<sourceId の末尾6文字>」と入力: [____] [統合する] [キャンセル]
```

**P11 操作履歴 `/admin/audit`**: 日時 (JST) / 実行者 / 操作 / 対象 (種別 + id、存在すれば詳細へリンク) / 内容 (detail の JSON を 1 行)。新しい順 200 件。空状態「操作の記録はまだありません」。

### 7-5. エラー表示

| 状況 | status | 表示 |
|---|---|---|
| 入力が不正 (§9・§10 の検証) | 422 | 同じページを再描画し、上部に `--danger` の枠で理由 (例「タイトルは 1〜100 文字で入力してください」)、入力値は保持 |
| 確認コード不一致 | 422 | 確認ページを再描画「確認コードが一致しません」 |
| 名前の衝突 | 409 | 「同じ名前の学校 (学科) が既にあります」+ その相手への統合確認リンク |
| 対象が無い | 404 | 「見つかりません」+ 一覧へのリンク |
| 認可失敗 | 403 / 503 | §3-3 の文言だけ (ナビも出さない) |
| 想定外 | 500 | 「処理に失敗しました。操作履歴を確認してから、もう一度お試しください。」 |

## 8. ルートと関数シグネチャ

### 8-1. ファイル

| パス | 中身 |
|---|---|
| `src/admin/config.ts` | `AdminConfig` / `adminConfigFromEnv` / `adminConfig` |
| `src/admin/hostGate.ts` | `adminHostGate` |
| `src/admin/access.ts` | `verifyAccessJwt` / JWKS キャッシュ |
| `src/admin/app.ts` | `createAdminApp(config: AdminConfig, deps?: Partial<AdminDeps>): Hono` (securityHeaders・認可・onError・全ルート登録) |
| `src/admin/kpi.ts` | `computeKpi` (純関数) / `loadKpiInput(now: Date): Promise<…>` |
| `src/admin/format.ts` | `maskEmail` / `confirmCode` / `minutesToHHMM` / `hhmmToMinutes` / 日付整形 |
| `src/admin/services/templateAdmin.ts` | 公開時間割の操作 (§9) |
| `src/admin/services/schoolMerge.ts` | 名前変更・統合 (§10) |
| `src/admin/audit.ts` | `writeAudit(tx, entry)` |
| `src/admin/views/*.ts` | `hono/html` の `html` タグで組む各ページ (自動エスケープ。生 HTML の挿入は `raw` を使わない。レイアウトの `<style>` だけ定数文字列) |

`hono/html` を使う理由: 既存の tsconfig が `.ts` しか含まず JSX 設定も無い。`html` タグは補間値を自動でエスケープし、依存も増えない。

### 8-2. ルート (全て `/admin` 配下・管理ホストのみ。POST は全て `application/x-www-form-urlencoded` を `c.req.parseBody()` → zod で検証。成功は 303 で次のページへ)

| メソッド | パス | 処理 | 成功時の遷移 |
|---|---|---|---|
| GET | `/admin` | — | 302 `/admin/kpi` |
| GET | `/admin/kpi` | P1 | — |
| GET | `/admin/users` | P2 | — |
| GET | `/admin/users/:id` | P3 | — |
| POST | `/admin/users/:id/kpi-exclusion` | body `action=exclude\|include` | `/admin/users/:id?ok=kpi_excluded\|kpi_included` |
| GET / POST | `/admin/users/:id/delete` | P4 / `deleteAccount(id)` | `/admin/users?ok=user_deleted` |
| GET | `/admin/templates` | P5 | — |
| GET | `/admin/templates/:id` | P6 | — |
| POST | `/admin/templates/:id/hide` | §9-1 | `/admin/templates/:id?ok=template_hidden` |
| POST | `/admin/templates/:id/unhide` | §9-1 | `/admin/templates/:id?ok=template_unhidden` |
| GET / POST | `/admin/templates/:id/delete` | P7 / 削除 | `/admin/templates?ok=template_deleted` |
| POST | `/admin/templates/:id/meta` | 基本情報 | `/admin/templates/:id?ok=saved` |
| POST | `/admin/templates/:id/day-slots/:slotId` | 時限の更新 | 同上 |
| POST | `/admin/templates/:id/courses` | 科目の追加 | 同上 |
| POST | `/admin/templates/:id/courses/:courseId` | 科目の更新 | 同上 |
| GET / POST | `/admin/templates/:id/courses/:courseId/delete` | 確認 / 削除 | `/admin/templates/:id?ok=deleted_row` |
| POST | `/admin/templates/:id/meetings` | コマの追加 | `?ok=saved` |
| POST | `/admin/templates/:id/meetings/:meetingId` | コマの更新 | `?ok=saved` |
| POST | `/admin/templates/:id/meetings/:meetingId/delete` | コマの削除 (確認なし) | `?ok=deleted_row` |
| GET | `/admin/schools` / `/admin/schools/:id` | P8 / P9 | — |
| POST | `/admin/schools/:id/rename` | §10-1 | `/admin/schools/:id?ok=renamed` |
| GET / POST | `/admin/schools/:id/merge?into=` | P10 / §10-2 (POST は body に `into` と `confirm`) | `/admin/schools/<into>?ok=merged` |
| POST | `/admin/departments/:id/rename` | §10-1 | `/admin/schools/<schoolId>?ok=renamed` |
| GET / POST | `/admin/departments/:id/merge?into=` | P10 / §10-3 | `/admin/schools/<schoolId>?ok=merged` |
| GET | `/admin/audit` | P11 | — |

子リソースの `:slotId` / `:courseId` / `:meetingId` が `:id` のテンプレに属さなければ 404。

### 8-3. 小さな関数

```ts
export function maskEmail(email: string): string;   // "touri@example.com" → "t***@example.com"、"a@b" → "a***@b"、"nouser" → "***"
export function confirmCode(id: string): string;     // id.slice(-6)。照合は trim 後の完全一致 (大文字小文字を区別)
export function hhmmToMinutes(v: string): number | null; // /^([01]\d|2[0-3]):[0-5]\d$/ 以外は null。"24:00" は null
export function minutesToHHMM(m: number): string;    // 540 → "09:00"、1440 → "24:00"
```

## 9. 公開時間割の操作

### 9-1. 非公開 / 公開に戻す / 削除

- **非公開にする**: `hiddenByAdminAt = now, isPublic = false`。既に `hiddenByAdminAt` が非 null → 変更も監査もせず 303 (`ok=template_hidden`)。作成者が非公開にしているもの (`isPublic = false, hiddenByAdminAt = null`) にも実行でき、以後は作成者が公開に戻せなくなる。
- **公開に戻す**: `hiddenByAdminAt` が非 null のときだけ `isPublic = true, hiddenByAdminAt = null`。null のものに POST → 409 「運営が非公開にした時間割ではありません」(作成者が自分で非公開にしたものを運営が公開しない)。
- **削除**: 確認コード一致で `timetableTemplate.delete` (子の時限・科目・コマは Cascade、コピー先の `UserTimetable.sourceTemplateId` は SetNull = 既存スキーマどおり)。
- 非公開・削除は既存の利用者 API に自動で効く: 一覧・詳細 (`isPublic: true` 絞り込み、`templates.ts:28,53`) と取り込み (`templateCopy.ts:31`) が 404 になる。既にコピーした人の時間割はそのまま。

### 9-2. 作成者の再公開との関係 (調べた事実と決定)

事実: iOS (`TimetableSettingsSheet.swift:186-195` + `TimetablePublishLogic.swift:13-21`) と Web (`TimetableSettingsSheet.tsx` + `lib/TimetablePublishLogic.ts`) は、時間割設定シートを **保存するたびに、公開トグルが ON で授業が 1 件以上なら `publish-as-template` を呼ぶ**。トグルの初期値は `publishedTemplate.isPublic`、公開タイトルの初期値は `publishedTemplate.title`。サーバーの publish (`userTimetables.ts:134-185`) は `sourceUserTimetableId` で既存行を探して upsert し、`isPublic: true` を書き、時限・科目・コマを作り直す。

| 項目 | 運営の編集 | 作成者がトグル ON で保存したとき |
|---|---|---|
| タイトル | 変更できる | クライアントが現タイトルを初期値に送るので **残る** (作成者が書き換えた場合だけ変わる) |
| 説明 / 学年 / 学期 | 変更できる | クライアントが送らない (`undefined` = 更新しない) ので **残る** |
| 学校 / 学科 | 変更できる | 作成者の `User.schoolId/departmentId` で **上書き** |
| 時限 / 科目 / コマ / 曜日 | 変更できる | 作成者の時間割から **作り直し** |
| 公開状態 | 非公開にできる | 下記の変更で **覆らない** |

決定:
- 中身の編集は「作成者の時間割が正本、運営の編集はその時点の写しへの修正」とする。上書きされうることを P6 のバナーで示す。学校・学科の恒久的な付け替えは統合 (§10) で行う (ユーザーとテンプレの両方を付け替えるので再公開でも戻らない)。
- 運営の非公開は作成者が覆せない:
  - `POST /api/user-timetables/:id/publish-as-template`: tx 内で既存行 (`sourceUserTimetableId = id`) の `hiddenByAdminAt` が非 null なら、何も書かず `AppError(409, "TEMPLATE_HIDDEN_BY_ADMIN", "この時間割は運営により非公開になっています。お問い合わせください。")`。
  - `PATCH /api/timetable-templates/:id`: 作成者チェックの後、`input.isPublic === true` かつ `hiddenByAdminAt` が非 null なら同じ 409。それ以外の項目 (タイトル等・`isPublic: false`) は従来どおり更新し、`hiddenByAdminAt` は保持。
  - `DELETE /api/timetable-templates/:id`: 従来どおり作成者は消せる。
  - iOS 1.0.2 は 409 を「公開設定を保存できませんでした」と出してシートを閉じない (`catch` の汎用文言)。トグルを OFF にすれば保存できる。iOS の変更は不要。
- 運営が「削除」したものは鍵にならない: 作成者が次にトグル ON で保存すると新しい公開時間割ができる。作らせたくない場合は削除でなく非公開を使う (P7 に 1 行で表示: 「作成者が公開設定を保存すると新しく公開されます。止めたい場合は非公開にしてください。」)。

### 9-3. 編集の検証 (既存 `TemplateCreateInput` の制約に揃える)

| 対象 | 規則 (違反は 422、何も書かない) |
|---|---|
| タイトル | trim 後 1〜100 文字 |
| 説明 | 0〜500 文字。空文字 → null |
| 学年 | 空 → null、または整数 1〜8 |
| 学期 | 0〜20 文字。空 → null |
| 学科 | 存在する Department の id。テンプレの `schoolId` をその学科の `schoolId` に同時に書く |
| 時限 | ラベル 0〜20 文字、開始・終了は `hhmmToMinutes` が非 null、終了 > 開始。`isBreak` は checkbox (`on` なら true)。`periodIndex` は変更しない (追加・削除もしない) |
| 科目 | 名前 trim 後 1〜100、教員 0〜50、色は空 → null か `/^#[0-9a-fA-F]{6}$/`、メモ 0〜500 |
| コマ | 科目 = 同じテンプレの科目 id、曜日 0〜6、コマ数 1〜8、開始時限 = そのテンプレの `TemplateDaySlot.periodIndex` に存在、かつ `開始 + コマ数 - 1` も存在、教室 0〜30 (空 → null) |

- 基本情報・時限の保存は親テンプレの `updatedAt` を Prisma の `@updatedAt` で進める (= 利用者の一覧で上に来る)。科目・コマの追加・更新・削除は子表だけ書き、親の `updatedAt` は触らない。
- 同時編集の楽観ロックは持たない (運営者 1 人、作成者の再公開は §9-2 のとおり全置換)。

## 10. 学校・学科の整理

### 10-1. 名前の変更

- 学校: `mextCode` が非 null → 422 「文科省データの学校は起動時に元の名前へ戻るため変更できません」。**理由**: `entrypoint.sh` が毎回 `prisma db seed` を走らせ、`seed-mext-schools.ts` が `mextCode` で upsert して `name` を上書きする。本番に入っているのはリポジトリの `mext-schools-sample.csv` (35 校、`MOCK_` コード) と推定され、48 校のうち 35 校がこれに当たる。
- 学校の名前は trim 後 1〜100、よみは 0〜100 (空 → null)。同じ `(name, prefecture, kind)` の別の学校があれば 409 (既存の `POST /api/schools` の重複判定と同じ組) + その学校への統合確認リンク。
- 学科: trim 後 1〜100。同じ学校に同名の別学科があれば 409 + 統合確認リンク (`@@unique([schoolId, name])`)。
- 成功で監査 1 行 (`detail = { before: {name, nameKana}, after: {…} }`)。

### 10-2. 学校の統合 `mergeSchool(sourceId, targetId, actor)`

前提検査 (どれかに当たれば何も書かない):
| 条件 | 結果 |
|---|---|
| source / target が無い | 404 |
| source = target | 422 「同じ学校には統合できません」 |
| source の `mextCode` が非 null | 422 「文科省データの学校は統合元にできません (起動時に復活します)」 |
| 確認コード ≠ `confirmCode(sourceId)` | 422 |

本処理 (**1 つの `prisma.$transaction`**。途中の例外で全部戻る):
1. source の学科を名前昇順に走査。target に同名の学科 dT があれば `mergeDepartmentInto(tx, d.id, dT.id)`、無ければ `department.update(d → schoolId: target)` の後、`user.updateMany(departmentId = d → schoolId: target)`、`timetableTemplate.updateMany(departmentId = d → schoolId: target)`、出欠ルールは `departmentId = d` の各行を `moveRule(tx, rule, target, d)`。
2. 残りの参照: `user.updateMany(schoolId = source → target)` (学科未設定のユーザー)、`timetableTemplate.updateMany(schoolId = source → target)`、`schoolId = source` の出欠ルール各行を `moveRule(tx, rule, target, rule.departmentId)`。
3. 安全確認: `schoolId = source` の Department / TimetableTemplate / AttendanceRule / User が全て 0 件でなければ throw (→ 500、全部戻る)。School 削除の Cascade でテンプレや学科を巻き込まないための確認。
4. `school.delete(source)`。
5. 監査 1 行 (`school.merge`、`detail = { into, movedDepartments, mergedDepartments: [{from, to}], users, templates, rulesMoved, rulesDropped }`)。`users` は付け替えたユーザーの重複なし人数。

```ts
// 出欠ルールの付け替え。@@unique([schoolId, departmentId, userId]) は userId = NULL を区別しない
// (SQLite の UNIQUE は NULL 同士を別物扱い) ので、衝突判定は userId の NULL 同士も「同じ」として自前で行う
async function moveRule(tx, rule: AttendanceRule, schoolId: string, departmentId: string): Promise<"moved" | "dropped">;
// 移動先に (schoolId, departmentId, userId) が同じ別の行があれば rule を delete して "dropped" (統合先の設定を残す)。
// 無ければ update して "moved"。既定ルール (userId NULL) の読み取りは findFirst + createdAt 昇順 (services/rules.ts:26) なので、
// 残す側を統合先に固定すれば利用者から見える既定は統合先のもののまま。
async function mergeDepartmentInto(tx, sourceDeptId: string, targetDeptId: string): Promise<{ users: number; templates: number; rulesMoved: number; rulesDropped: number }>;
// user.updateMany(departmentId = src → { departmentId: dst.id, schoolId: dst.schoolId })
// timetableTemplate.updateMany(departmentId = src → { departmentId: dst.id, schoolId: dst.schoolId })
// departmentId = src の出欠ルール各行 → moveRule(tx, rule, dst.schoolId, dst.id)
// 参照 0 件を確認 → department.delete(src)
```

### 10-3. 学科の統合

- 前提: 両方存在 (404)、同一 id でない (422)、**同じ学校** (違えば 422 「別の学校の学科には統合できません。学校の統合を使ってください」)、確認コード一致 (422)。
- 本処理: 1 tx で `mergeDepartmentInto` + 監査 (`department.merge`)。

### 10-4. 統合が利用者に与える影響

- `/api/me` の学校・学科は付け替え後の値になる (名前は都度 join)。iOS/Web は古い id を持っていても次の `/api/me` で更新される。統合元の id で `GET /api/schools/:id/departments` を叩くと既存どおり 404。
- 時間割テンプレートは消えない (付け替えだけ)。学校・学科の削除機能は作らない (不採用案 N7)。
- 統合の前に戻す手段はバックアップの復元だけ (§18-3)。

## 11. ユーザー管理

- 削除は既存の `deleteAccount(userId)` (`services/accountDeletion.service.ts:62`) をそのまま呼ぶ。better-auth の `remove-user` は使わない (ルーム移譲・Apple/Google の連携解除が飛ぶ)。`deleteAccount` が返した後に監査を別 tx で書く。監査の書き込みが失敗したら削除は成立したまま完了バナーに「(操作履歴の記録に失敗しました)」を足す (削除を巻き戻す手段が無いため)。
- 削除の効き目: Session も Cascade で消えるので、そのユーザーの次の要求は 401 (iOS/Web はサインアウト扱い)。
- 利用記録 (`UserDailyActivity`) と KPI 除外は User の Cascade で消える (§19 Q1 = A の場合)。
- 停止 (BAN) は作らない (Touri 裁定)。

## 12. 監査

残す理由: 削除・統合は取り消せず、後から「なぜ消えたか」を辿れるのはこの表だけ。1 表・1 関数で済み、操作と同じ tx に入れられる (ユーザー削除だけ別 tx、§11)。

| action | targetType | detail (JSON) |
|---|---|---|
| `user.delete` | user | `{ deleted, transferredRooms, deletedRooms, revocations: [{provider, ok}] }` (メール・名前は入れない) |
| `template.hide` / `template.unhide` / `template.delete` | template | `{ title }` |
| `template.meta` | template | `{ before: {…変わった項目}, after: {…} }` |
| `template.dayslot.update` | template | `{ slotId, before, after }` |
| `template.course.create` / `.update` / `.delete` | template | `{ courseId, before?, after? , deletedMeetings? }` |
| `template.meeting.create` / `.update` / `.delete` | template | `{ meetingId, before?, after? }` |
| `school.rename` / `department.rename` | school / department | `{ before, after }` |
| `school.merge` / `department.merge` | school / department (= source) | §10-2 の detail |

- 失敗した操作 (404/409/422) は書かない。KPI 除外の切替は書かない (データを変えない集計設定のため)。
- 監査の行は消さない・変えない (経路を作らない)。保持期限なし (件数が小さい)。

## 13. 挙動仕様 (Reviewer はここからテストを書く)

共通の前提: `tests/setup.ts` に `ADMIN_HOST=atender-admin.test`、`ADMIN_ACCESS_TEAM_DOMAIN=https://team.access.test`、`ADMIN_ACCESS_AUD=test-aud-0001` を足す (§14)。管理ホストへの要求は `app.request("http://atender-admin.test/admin/…", { headers: { "Cf-Access-Jwt-Assertion": <jwt>, Origin: "https://atender-admin.test" } })`。JWT は `node:crypto` の `generateKeyPairSync("rsa", { modulusLength: 2048 })` の鍵を JWK (`kid`・`alg: "RS256"` 付き) にし、`hono/jwt` の `sign(payload, privateJwk, "RS256")` で作る (header に kid が要る場合は自前で組む)。certs URL (`https://team.access.test/cdn-cgi/access/certs`) は `vi.stubGlobal("fetch", …)` で `{ keys: [publicJwk] }` を返し、それ以外の URL は元の fetch に渡す。各テストの前に `__resetAccessJwksCacheForTests()` と `__resetActivityCacheForTests()`。正しい JWT の payload = `{ iss: "https://team.access.test", aud: ["test-aud-0001"], email: "admin@example.test", sub: "s1", iat: now-10, exp: now+600 }`。

### AZ: ホスト分離と認可

- **AZ1** `adminConfigFromEnv({})` → null。`{ADMIN_HOST:"", ADMIN_ACCESS_TEAM_DOMAIN:"", ADMIN_ACCESS_AUD:""}` → null。
- **AZ2** 3 つのうち 1 つ・2 つだけ値がある 6 通り → 全て throw。`ADMIN_HOST="https://x"` → throw。`ADMIN_ACCESS_TEAM_DOMAIN="http://team.access.test"` → throw。`"https://team.access.test/"` → `teamDomain === "https://team.access.test"`。
- **AZ3** config = null の app (`new Hono()` に `adminHostGate(null)` + 既存と同じ notFound) で `GET http://atender-admin.test/admin/kpi` → 404 で、`GET /no-such-route` と status・本文が同一。
- **AZ4** 公開ホスト (`http://localhost`) と `http://atender-api.appily.run` で、正しい JWT と Origin を付けても `GET /admin`、`GET /admin/`、`GET /admin/kpi`、`GET /admin/users/x`、`POST /admin/users/x/delete` → 全て 404 で本文は `GET /no-such-route` と同一。
- **AZ5** 公開ホストで `GET /%61dmin/kpi` → 404。`X-Forwarded-Host: atender-admin.test` を付けた公開ホストの `GET /admin/kpi` → 404。
- **AZ6** 管理ホストで有効な session cookie 付き `GET /api/me`、`GET /healthz`、`GET /version`、`GET /api/auth/get-session` → 全て 404。公開ホストの `GET /healthz` は 200 のまま。
- **AZ7** 管理ホストで `OPTIONS` / `PUT` / `PATCH` / `DELETE` `/admin/kpi` → 405、`Allow: GET, HEAD, POST`。
- **AZ8** 管理ホスト `GET /admin/kpi` に JWT ヘッダ無し → 403、本文に「この画面にはアクセスできません。」を含み、DB にいるユーザーのメール (完全一致・伏せ字の両方) を含まない。
- **AZ9** 以下の JWT はそれぞれ 403: aud = `["other-aud"]` / iss = `https://evil.access.test` / exp = now-1 / exp 無し / nbf = now+600 / 別の RSA 鍵で署名 (kid は正しい鍵と同じ) / header の alg を HS256 にして同じ kid / kid が JWKS に無い / email 無し / email = "" / 3 区切りでない文字列 `abc`。
- **AZ10** 正しい JWT → 200、本文に `admin@example.test` を含む。
- **AZ11** JWKS キャッシュ (`vi.useFakeTimers({ toFake: ["Date"] })`、JWT は時刻を動かした後に作る): (a) 正しい JWT で 2 回 GET → certs の fetch は 1 回。(b) キャッシュ空の状態から JWKS に無い kid の JWT を 2 回 → 2 回とも 403、certs の fetch は 1 回 (取得直後なので取り直さない)。(c) 正しい JWT で 1 回 (fetch 1) → 61 秒進めて JWKS に無い kid → 403、fetch は合計 2 回。
- **AZ12** certs が 500 を返し、過去の成功が無い → 503、本文に「認証鍵を取得できませんでした」。正しい JWT で 1 回成功した後、certs を 500 に切り替えて 11 分進め、**その時刻で作り直した**正しい JWT で GET → 200 (24 時間以内の古い鍵で検証)。さらに 25 時間進めて同様 → 503。
- **AZ13** POST (正しい JWT) で Origin 無し → 403「不正な送信元です。」、`Origin: https://evil.example` → 403、`Origin: http://atender-admin.test` (scheme 違い) → 403、`Origin: https://atender-admin.test` → 処理に進む。どの 403 でも DB は変わらない (AZ13 は `POST /admin/templates/:id/hide` で `isPublic` が true のままを確認)。
- **AZ14** 管理ホストの admin sub-app の応答 (200 / 403 / 404 / 422 / 503) が §3-5 の 6 ヘッダを全て持つ (`Content-Security-Policy` は文字列完全一致)。

### AC: 利用の記録

- **AC1** iOS: `Authorization: Bearer <token>` + `X-Atender-Client: ios/24` で `GET /api/me` を `2026-11-22T14:59:59.999Z` に → `UserDailyActivity` に `(userId, "2026-11-22", "IOS")` が 1 行。
- **AC2** 同じことを `2026-11-22T15:00:00.000Z` に → `"2026-11-23"`。
- **AC3** cookie だけ (ヘッダなし) → `"WEB"`。`X-Atender-Client: ios/abc` → `"WEB"`。`X-Atender-Client: ios/20` (MIN_IOS_BUILD 未満) → 426 で行は増えない。
- **AC4** 同じユーザー・同じ日・同じ環境で 3 回 → 1 行。iOS と Web で 1 回ずつ → 2 行。
- **AC5** 認証なし `GET /api/me` (401) → 行なし。
- **AC6** `setupGuard` で 403 になるルート (セットアップ未完了ユーザーで `GET /api/user-timetables/:id`) でも行が 1 つできる。
- **AC7** `vi.spyOn(prisma, "$executeRaw")` を 1 回だけ reject させて `GET /api/me` → 200 で本文は通常どおり、行なし。続けてもう 1 回 → 行が 1 つできる (`recordActivity` が "failed" の後に再試行)。
- **AC8** `recordActivity(u, "IOS", t)` を 2 回 → 1 回目 "written"、2 回目 "cached" で `$executeRaw` の呼び出しは 1 回。`t = 2026-11-22T14:59:59Z` → `2026-11-22T15:00:01Z` で 2 回 → 両方 "written" (日付が変わるとキャッシュを捨てる)。
- **AC9** `__resetActivityCacheForTests()` 後に同じ日・同じキーで呼ぶ → "written"、行は 1 行のまま、例外なし。
- **AC10** `DELETE /api/me` → そのユーザーの `UserDailyActivity` と `AdminKpiExclusion` が 0 行 (Q1 = A の場合)。

### KP: KPI

- **KP1** `computeKpi({ users: [u(2026-11-01)], activity: [], now })` → `measurementStart: null`、`cohorts: []`、`legacy: null`、`totals.active7 === null`、`totals.active28 === null`、`daily` は 28 行で `active/ios/web` が全て null、`signups` は数える。
- **KP2** §6-4 の標本 → §6-4 の期待値と完全一致 (`cohorts` の行順・`cells` の長さ 8 を含む)。
- **KP3** `users` に無い userId の activity を足しても KP2 の結果は変わらない。
- **KP4** 割合: 1/3 → 33、2/3 → 67 (`Math.round`)。表示は `1/3 (33%)`。分母 0 のセルは「—」。
- **KP5** `cohorts` は 26 行を超えない (M を 40 週前に置いた入力で 26 行、先頭が `weekStart(today)`)。`daily` 28 行、`weekly` 12 行。
- **KP6** 画面: 除外したユーザー (`AdminKpiExclusion`) の登録・利用は P1 の数字に入らず、概要に「除外 1人」。
- **KP7** 画面: 利用行が 0 件 → 「まだ計測データがありません」を表示し、「登録コホートの継続」の見出しが無い。

### US: ユーザー管理

- **US1** P2 にユーザーのメールが伏せ字 (`maskEmail`) で出て、完全なメールは出ない。並びは createdAt 降順。
- **US2** `?q=<完全なメール>` → そのユーザーだけ。`?q=<handle の一部>` → 一致する人だけ。0 件 → 「に一致するユーザーはいません」。`?q=` に `<b>x</b>` → 本文に `&lt;b&gt;x&lt;/b&gt;` が出て `<b>x</b>` は出ない。
- **US3** 名前 `<script>alert(1)</script>` のユーザー → P2・P3 とも `&lt;script&gt;` で出て `<script>alert(1)` を含まない。
- **US4** P3 に完全なメールが出る。Session の `ipAddress "203.0.113.9"`・`userAgent "UA-SECRET-XYZ"`、`Session.token`、`User.inviteCode`、Course 名 `COURSE-SECRET`、AttendanceRecord の note `NOTE-SECRET` は本文に出ない。
- **US5** P3 の「最終アクセス」は `UserDailyActivity` の最大日付、行が無いと「計測前」。「直近28日の利用日」に `2026-11-22 iOS` のように出る。
- **US6** 存在しない id の P3 / P4 / POST 削除 → 404。
- **US7** P4 に確認コード (`id.slice(-6)`) が出る。POST の `confirm` が違う → 422、ユーザーは残る、監査 0 行。
- **US8** 正しい確認コードで POST → 303 `Location: /admin/users?ok=user_deleted`。ユーザー・Session・時間割が消え、作成ルームは他メンバーがいれば最古参に OWNER 移譲 (`DELETE /api/me` の #D 系と同じ結果)、非公開テンプレは消え、公開テンプレは `authorUserId = null` で残る。監査 `user.delete` が 1 行で `actorEmail = "admin@example.test"`、`detail` にそのユーザーのメール・名前が含まれない。
- **US9** 対象のメールが JWT の email と同じとき、P4 に「管理者と同じメールアドレスのアカウントです」が出る。違えば出ない。
- **US10** `POST /admin/users/:id/kpi-exclusion action=exclude` → `AdminKpiExclusion` 1 行、303 `?ok=kpi_excluded`。もう 1 回 exclude → 1 行のまま。`action=include` → 0 行。`action=other` → 422。

### TP: 公開時間割 (管理)

- **TP1** 公開中 / 作成者が非公開 / 運営が非公開 の 3 件を作る → P5 に 3 件と状態の文字が出る。`?state=admin_hidden` → 1 件。作者削除済みのテンプレは作成者欄が「退会済み」。
- **TP2** P6 に科目名・コマ (曜日・時限)・時限の時刻 (`09:00`) が出る。存在しない id → 404。
- **TP3** 公開中を `POST …/hide` → `isPublic=false`・`hiddenByAdminAt` 非 null、利用者の `GET /api/timetable-templates?schoolId=…` に出ない、`GET /api/timetable-templates/:id` → 404、`POST /api/timetable-templates/:id/copy` → 404。監査 `template.hide` 1 行。
- **TP4** 運営が非公開のものを再度 hide → 303、`hiddenByAdminAt` は変わらない、監査は増えない。作成者が非公開のものを hide → `hiddenByAdminAt` が入る。
- **TP5** 運営が非公開を `unhide` → `isPublic=true`・`hiddenByAdminAt=null`。作成者が非公開のものを `unhide` → 409、`isPublic=false` のまま。
- **TP6** 削除: 確認コード違い → 422 で残る。正しい → テンプレと時限・科目・コマが消え、そのテンプレからコピーした `UserTimetable` は残り `sourceTemplateId = null`。監査 `template.delete`。
- **TP7** 基本情報: タイトル "" → 422「タイトルは 1〜100 文字で入力してください」、値は変わらない、フォームに入力値が残る。101 文字 → 422。学年 "9" → 422。学科 = 存在しない id → 422。正しい学科 (別の学校) → `departmentId` と `schoolId` がその学科と学校になり、利用者の一覧で新しい学校・学科に出る。説明 "" → null。
- **TP8** 時限: 開始 `10:30` 終了 `10:30` → 422。開始 `24:00` → 422。ラベル 21 文字 → 422。正しい値 → `startMinute/endMinute` が分で保存。
- **TP9** 科目: 名前 "" → 422、色 `red` → 422、追加 → 1 件増える。削除確認ページに「コマ n 件も削除されます」、正しい確認コードで科目とそのコマが消える。
- **TP10** コマ: 別テンプレの科目 id → 422、曜日 7 → 422、開始時限 = 時限に無い番号 → 422、開始 11・コマ数 3 (時限が 12 まで) → 422、開始 11・コマ数 2 → 保存。コマの削除 → 即時に消える。
- **TP11** 子の id が別テンプレのもの (`/admin/templates/A/courses/<B の科目>`) → 404、何も変わらない。
- **TP12** TP7〜TP10 の成功 1 回ごとに監査がちょうど 1 行、失敗 (422/404) では 0 行。

### PB: 作成者側 API の鍵 (既存の利用者 API の変更)

- **PB1** 作成者が公開 → 運営が hide → 作成者が `POST /api/user-timetables/:id/publish-as-template {title}` → 409、`error.code = "TEMPLATE_HIDDEN_BY_ADMIN"`、`error.message` は §9-2 の文。テンプレの title・科目数・`isPublic=false`・`hiddenByAdminAt` は変わらない。
- **PB2** 同じ状態で作成者が `PATCH /api/timetable-templates/:id {isPublic:true}` → 409 同コード。`{isPublic:false}` → 200 で `hiddenByAdminAt` は非 null のまま。`{title:"新"}` → 200、title が変わり非公開のまま。
- **PB3** 同じ状態で作成者が `DELETE /api/timetable-templates/:id` → 200、行が消える。
- **PB4** 運営が `unhide` した後の作成者の publish → 従来どおり 200 (更新)。
- **PB5** 運営が説明を "運営の説明"・タイトルを "運営タイトル" に、科目を 1 件追加した後、作成者が `publish {title: "運営タイトル"}` → 説明 "運営の説明" が残る、タイトル "運営タイトル"、科目は作成者の時間割と同じ構成 (運営が足した科目は無い)、学校・学科は作成者の `User` のもの。
- **PB6** hide されていないテンプレの publish / PATCH / DELETE は既存テスト (`b21-template-publish-copy.test.ts`、`timetable-templates.test.ts`) が全て緑のまま。

### SC: 学校・学科

- **SC1** P8 に「文科省」「ユーザー追加」の区別と各件数。`?q=` は名前・よみの部分一致。
- **SC2** ユーザー追加の学校を改名 → 名前が変わり、利用者の `GET /api/schools?q=<新名>` に出る。名前 "" → 422。`mextCode` のある学校 → 422 で名前は変わらない (P9 に変更フォームが無いことも確認)。同じ (name, prefecture, kind) の別学校がある名前 → 409 で、本文に `/admin/schools/<S>/merge?into=<相手>` へのリンク。
- **SC3** 学科の改名: 同じ学校の別学科と同名 → 409 + 統合リンク、別の学校の学科と同名は 200。
- **SC4** 学校の統合 (標本): S (ユーザー追加) に学科 A「情報処理科」・B「ゲーム科」、T に A'「情報処理科」。ユーザー u1 (S,A)・u2 (S,B)・u3 (S,学科なし)。テンプレ t1 (S,A)・t2 (S,B)。出欠ルール r1 (S,A,null)・r2 (T,A',null)・r3 (S,A,u1)・r4 (T,A',u1)・r5 (S,B,u2)。正しい確認コードで統合 → S と A が無い、B の schoolId = T、u1 = (T,A')・u2 = (T,B)・u3 = (T,null)、t1 = (T,A')・t2 = (T,B)、出欠ルールは r2・r4・r5 だけが残り r5 = (T,B,u2)、テンプレ総数・ユーザー総数は不変。監査 `school.merge` の detail = `{ into: T, movedDepartments: 1, mergedDepartments: [{from: A, to: A'}], users: 3, templates: 2, rulesMoved: 1, rulesDropped: 2 }`。303 `/admin/schools/<T>?ok=merged`。
- **SC5** 統合元が `mextCode` 持ち → 422、何も変わらない。source = target → 422。target が無い → 404。確認コード違い → 422。どれも監査 0 行。
- **SC6** 学科の統合 (同じ学校): A → B でユーザー・テンプレ・ルールが B に移り A が消える。別の学校の学科へ → 422。
- **SC7** SC4 の後、u1 の `GET /api/me` の学校 id が T、`GET /api/schools/<S>/departments` → 404。

### AU / UI

- **AU1** P11 は監査を新しい順に最大 200 件。0 件 → 「操作の記録はまだありません」。
- **UI1** `GET /admin` → 302 `Location: /admin/kpi`。
- **UI2** `?ok=user_deleted` → 「ユーザーを削除しました」が出る。`?ok=<script>` や未知の値 → バナーが出ず、値も本文に出ない。
- **UI3** 全ページの現在ナビに `aria-current="page"` が 1 つだけ。全フォーム入力に `<label>` がある。削除・統合ボタンの文字が「削除する」「統合する」。

### LG: 法務ページ (§19 Q3 = A の場合)

- **LG-A1** `privacy.html` に「利用の記録：」「日付のみ」「iOSアプリかWeb版か」「管理画面」を含む。§7 の削除リストに「利用の記録」を含む。
- **LG-A2** `privacy.html` / `terms.html` の改定日が同じデプロイ日 (Developer がデプロイ予定日で埋め、`ais-mail.review.test.ts` LG4 を同じ日に置換)。既存の `legal-pages.test.ts` #L4 / #L5 / #L6 と `b21-legal-calendar.test.ts` は緑のまま。

## 14. 既存テストへの影響 (移行表)

grep で確認した結果 (`readdirSync` で migration を読むテスト 3 本、`sqlite_master` 1 本、`改定日` 固定 1 本、識別子走査 1 本):

| テスト | 今の固定 | 本設計で | 処置 |
|---|---|---|---|
| `apps/api/tests/a2-review.test.ts:153-155` `[migration] a DROP migration newer than all others…` | `names[names.length - 1] === drop_calendar` | 新しい migration が最後になるので **赤** | 「drop_calendar が `_b20_` / `_b21_` を含む全 migration より新しい」に置換: `expect(names.filter((n) => /_b2[01]_/.test(n)).every((n) => n <= drops[0])).toBe(true)`。後続の SQL 検査はそのまま |
| `apps/api/tests/b20-author-set-null-migration.test.ts` #M3 | b20 以降を後から当てる | 緑 (既に後続 migration を許容) | 変更なし |
| `apps/api/tests/a2-calendar-removed.test.ts` AD10 / AD12 | 9 表が無いこと / src に旧識別子が無いこと | 緑 (§4 の命名規則を守る限り) | 変更なし |
| `apps/web/tests/legal/ais-mail.review.test.ts` LG4 | 改定日 `2026-10-30` | Q3 = A なら **赤** | デプロイ日に置換 (LG-A2) |
| `apps/web/tests/legal/legal-pages.test.ts` / `b21-legal-calendar.test.ts` | 必須文言・制定日形式・改定日 ≥ 2026-10-29 | 緑 (§16 の文案は既存の必須文言を消さない) | 変更なし |
| `apps/api/tests/setup.ts` | admin env なし | AZ・US 等に必要 | `process.env.ADMIN_HOST ??= "atender-admin.test"` ほか 2 行を足す (Reviewer)。公開ホスト (`localhost`) のテストには影響しない |
| 認証付きの全 API テスト | — | 各テストで `UserDailyActivity` に行ができる | 表の行数を固定しているテストは無い (`count()` の対象は user/session/classTransfer 等のみ) ので変更なし |

ベースライン: API の既知失敗は台帳 (`.knowledge/known-failures.md`) で 13 (2026-10-30 実測)。Reviewer は着手時に `rm -rf apps/api/tests/.tmp` → `pnpm exec prisma generate` → 単独・フォアグラウンドで 1 回測り、13 と一致することを確かめてから始める。新しい失敗が出たら未分類のままマージしない。

## 15. テスト基盤

- API: Vitest 2 (`apps/api/vitest.config.ts`、`pool: forks, singleFork`)、配置 `apps/api/tests/admin-*.test.ts` (例: `admin-access.test.ts` = AZ、`admin-activity.test.ts` = AC、`admin-kpi.test.ts` = KP、`admin-users.test.ts` = US、`admin-templates.test.ts` = TP/PB、`admin-schools.test.ts` = SC、`admin-ui.test.ts` = AU/UI)。DB は既存の `tests/helpers/db.ts` (test ごとに template.db を複製)、ユーザーは `createTestUser` / `createSessionCookie` / `setupCompleteUser` / `createSchoolDepartment`、時刻は `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime`。
- HTML の検査は文字列 (`toContain` / `not.toContain`) と `Location` ヘッダで行う。ブラウザ E2E (chrome-devtools MCP) は使わない (JS が無く、HTTP 応答で全て判定できるため)。
- `computeKpi` は DB を使わない単体テスト (KP1〜KP5)。
- Web: Vitest (`apps/web`) の legal テストだけ (LG)。
- 負のコントロール (Reviewer が 1 回ずつ実施して赤を確認): (a) `adminHostGate` の「ホスト ≠ 管理 → 404」行を `next()` に変える → AZ4 が赤、(b) `verifyAccessJwt` の aud 指定を外す → AZ9 の aud 行が赤、(c) §3-3 手順 5 (exp 必須) を外す → AZ9 の「exp 無し」が赤、(d) `sameOriginPost` を外す → AZ13 が赤、(e) publish の 409 分岐を外す → PB1 が赤、(f) `moveRule` の衝突判定を外す → SC4 が赤 (ユニーク違反か重複ルール)。

## 16. プライバシーポリシー・利用規約の文案 (§19 Q3)

照合結果: 現行のポリシー (`apps/web/public/privacy.html`) §2「取得する情報」に利用日の記録は無い。§3 の目的「障害の調査とサービスの安定運用」で読める余地はあるが、取得項目の列挙から漏れるので足す。運営者による閲覧の記述も無い。利用規約 §5 は「規約に違反する内容を削除し、またはアカウントの利用を制限することがあります」までで、表記の修正・統合と削除は書いていない。

privacy.html の置換 (`<li>` / `<p>` 単位。改定日を `<time>` でデプロイ日に):
- §2 の「公開した時間割テンプレート」の `<li>` の直後に 1 行追加:
  `<li><strong>利用の記録：</strong>本サービスを利用した日（日付のみ。時刻は記録しません）と、iOSアプリかWeb版かの別。</li>`
- §3 の本文を置換: 「…不正利用の防止、障害の調査とサービスの安定運用のために利用します。」→ 「…不正利用の防止、障害の調査とサービスの安定運用、利用状況の集計（登録数や、続けて使われているかの把握）によるサービスの改善のために利用します。」(後続の「広告やマーケティングには利用しません。」はそのまま)
- §7 の削除リストの 1 行目を置換: 「…ルームへの参加情報、ログイン情報を直ちに削除します。」→ 「…ルームへの参加情報、ログイン情報、利用の記録を直ちに削除します。」(Q1 = A の場合。B なら §16 末尾の別案)
- §10 の本文の後ろに 1 文追加: 「運営者は、本人確認を経てログインする管理画面から、運営に必要な範囲（お問い合わせへの対応、利用規約に基づく対応、公開された時間割や学校名の整理、利用状況の集計）で保存データを閲覧します。」

terms.html §5 の最後の文を置換:
- 「運営者は、本規約に違反する内容を削除し、またはアカウントの利用を制限することがあります。」→ 「運営者は、本規約に違反する内容を非公開にし、もしくは削除し、またはアカウントを削除することがあります。また、検索しやすくするため、公開された時間割テンプレートの学校・学科の付け替えや明らかな誤りの修正、学校名・学科名の修正と重複の統合を行うことがあります。」

Q1 = B (匿名化して残す) の場合の §7 別案: 「…ログイン情報を直ちに削除します。利用の記録は、アカウントと結び付かない形（登録日と利用日のみ）に変えて集計に使います。」

禁止語の確認: Developer は置換後の両ページを `legal-pages.test.ts` / `b21-legal-calendar.test.ts` の `not.toContain` 一覧で部分一致検査してから commit する (role ノート #20)。

App Store の「App のプライバシー」: 「使用状況データ > 製品の操作」(ユーザーに関連付け・用途 = 分析) を追加する (§17 T5)。iOS の `PrivacyInfo.xcprivacy` に `NSPrivacyCollectedDataTypeProductInteraction` を足すのは次の iOS ビルド (25) に申し送る (`B20PrivacyManifestTests` が型の集合を固定していれば同時に直す)。

## 17. Touri の作業 (Leader にできない手順を時系列で)

| # | いつ | 作業 | Leader に渡すもの |
|---|---|---|---|
| T1 | 承認後すぐ (コードと並行可) | passconsole「サービスを登録」: 名前 `Atender Admin`、リダイレクト URI `https://ait913.cloudflareaccess.com/cdn-cgi/access/callback`、ログアウト後 URI 空。自分に許可を付ける (TOTP) | client id / secret (Leader は `Muraki/.tmp/atender/admin-access.env` に控える、doc に写さない) |
| T2 | T1 の後 | Cloudflare > Integrations > Identity providers > OpenID Connect: 名前 `AIS Pass (atender-admin)`、App ID / secret = T1、Auth / Token / Certificate URL は Pass の discovery の値、PKCE ON | **IdP の ID と名前の対** |
| T3 | 承認ゲート | §16 の文案の承認 (Q3) | — |
| T4 | デプロイ後 | シークレットウィンドウで `https://atender-admin.appily.run/admin` に入り、AIS Pass で認証 → KPI が出る。自分のアカウントと検証用アカウントを P3 から「KPI の集計から外す」 | 入れたか / 外したアカウント |
| T5 | 1.0.2 の審査完了後 | App Store Connect の「App のプライバシー」に「製品の操作」を追加 (§16) | 完了の連絡 |

Leader がやる (参考): Access アプリ作成 (API。`allowed_idps` = T2 の IdP 1 個、reusable policy `atender-admin-via-pass` = `login_method` が T2、セッション 12 時間、`self_hosted_domains` は `atender-admin.appily.run` の 1 本だけ)、AUD 取得、Coolify の env とドメイン、デプロイ、確認。手順は `projects/ais-pass/CLAUDE.md`「Access 越しのサービスを追加する」と同じ。

## 18. デプロイ手順と切り戻し

### 18-1. マージ前 (Developer / Leader、ローカル)

- **D0-a** migration に表の作り直しが無いこと (§4 の受入条件) を `migration.sql` で確認。
- **D0-b** 切り戻しの成立確認 (未確認事項 U3 を潰す): scratchpad に本番相当の DB (`prisma/dev.db` のコピー) を置き、新 migration まで `prisma migrate deploy` → その DB に対して **旧コード** (`main` の checkout) の `prisma migrate deploy` を実行し、終了コードが 0 であることを見る。0 でなければ §18-3 の切り戻しは「コードを戻す」ではなく「env を外す」だけにする旨を doc に追記して Leader に報告。
- **D0-c** API テスト全件 (既知 13 以外の失敗 0) と Web の legal テスト。

### 18-2. 本番 (順序が重要)

1. T1 / T2 完了 → Leader が Access アプリを作り AUD を得る。`curl -sL https://atender-admin.appily.run/admin` の HTML に `AIS Pass (atender-admin)` と T1 の `client_id` が出ることを確認 (反映に約 1 分)。この時点でオリジンにはまだドメインが無いので、ログイン後は Traefik の 404 になる (正常)。
2. **法務ページを先に**: Q3 承認済みの `privacy.html` / `terms.html` を含む `atender-web` をデプロイ (`POST /deploy?uuid=xxg31wshj6rhjmnffju1bg5r`)。記録の開始 (手順 4) より前に公開しておくため。`https://atender.appily.run/privacy.html` の改定日を curl で確認。
3. Coolify `atender-api` (`vrdxzvmakcxieyhfhayz5r8r`): env に `ADMIN_HOST=atender-admin.appily.run` / `ADMIN_ACCESS_TEAM_DOMAIN=https://ait913.cloudflareaccess.com` / `ADMIN_ACCESS_AUD=<AUD>` を追加 (`is_preview` の重複行ができていれば消す)。domains を `https://atender-api.appily.run,https://atender-admin.appily.run` に (既存を残す・`www.` を足さない)。`is_force_https_enabled=false` のままを GET で確認。**Access アプリ (手順 1) より先にドメインを足さない** (足しても JWT 検証で 403 になるが、Access の外に管理ホストが出る時間を作らない)。
4. main にマージ → `atender-api` をデプロイ。entrypoint が DB を 5 世代コピー → `db-stats before-migrate` → `prisma migrate deploy` → `db-stats after-migrate` → seed → 起動。Coolify のログで before/after の既存表の件数が一致すること、migration 名 `20261122120000_admin_console` が適用されたことを確認。
5. 確認 (Leader が curl):
   - `GET https://atender-api.appily.run/healthz` → 200、`/version` → 200 で `minIOSBuild: 21`
   - `GET https://atender-api.appily.run/admin/kpi` → 404
   - `GET https://atender-admin.appily.run/admin/kpi` (cookie なし) → 302 で `ait913.cloudflareaccess.com` へ
   - `curl -H "Cf-Access-Jwt-Assertion: abc" https://atender-admin.appily.run/admin/kpi` → Access の 302 (オリジンまで届かない)
   - Web: `https://atender.appily.run` にログイン済みブラウザでホームが出る
6. T4 (Touri がログイン)。iOS アプリ (1.0.1 公開版 / 1.0.2 TestFlight) を開いた後、P3 の自分の「直近28日の利用日」に今日の日付と iOS が出ること、Web を開いた後に Web が出ることを確認 (P1 の日別は M = 翌日なので導入日は「—」が正しい)。
7. `projects/atender/CLAUDE.md` の「デプロイ / 外部リソース」に管理画面の URL・Access アプリ・IdP id・env 名を、「主要ワークフロー」に「管理画面に入る / 学校を統合する前にバックアップを取る」を Leader が追記。`projects/ais-pass/CLAUDE.md` の対応表に 1 行足す。

### 18-3. 切り戻し

| 症状 | 切り戻し | 失うもの |
|---|---|---|
| 管理画面に問題 (認可の不具合の疑い含む) | Coolify の domains から `atender-admin.appily.run` を外して再デプロイ、または env の 3 つを消して再デプロイ (管理機能ごと無効、/admin は全ホストで 404) | なし (利用記録は続く) |
| 利用記録が本来の要求を遅く・落とす | 前の commit を再デプロイ (D0-b が 0 の場合)。新しい表と列は残っても旧コードは読まない | 切り戻し中の利用記録 |
| 管理操作の誤り (誤削除・誤統合) | 元に戻す API は無い。データの復元は起動時の DB コピー (`/app/data/prod.db.bak-*`) からだけで、コピー以後の全利用者の書き込みを失う。**大きな整理 (統合・複数削除) の前に `atender-api` を restart して最新のコピーを 1 世代作る** (entrypoint がコピーする) | コピー以後の書き込み |

iOS / Web 既存動作への影響の確認: (1) D0-c で既存テストが既知 13 以外緑、(2) 本番の手順 5 の curl、(3) `UserDailyActivity` の記録失敗は要求を落とさない (AC7)、(4) 公開時間割の鍵は運営が非公開にしたテンプレにしか効かず、導入時点では 0 件。

## 19. Touri 確認項目 (承認ゲートの AskUserQuestion 用)

> **裁定 (Touri、2026-11-22、AskUserQuestion)**: Q1 = A 一緒に消す / Q2 = A 運営が非公開にしたものは作成者が戻せない / Q3 = A 文案どおり改定し管理画面より先に Web に反映、App のプライバシーは 1.0.2 の審査後 / Q4 = A 週コホート × W1〜W8。**本 doc は承認済み。**

**Q1. 退会・管理画面からの削除のとき、そのユーザーの利用の記録をどうしますか**
- A (推奨): 一緒に消す。ポリシーの「直ちに削除」と一致する。代わりに、退会した人は登録数・継続率の過去の数字からも消える (継続率は辞めた人が減る分だけ高めに出る)。今の規模 (18 人) では退会はまれ
- B: 「登録日と利用日だけ」の形でアカウントと切り離して残す。過去の数字が縮まない。代わりにポリシーに「削除後も集計に使う」と書く必要があり、人数が少ないので運営者から見ると誰の記録か推測できてしまう

**Q2. 運営が非公開にした公開時間割を、作成者が「公開」に戻せるようにしますか**
- A (推奨): 戻せない。作成者が公開を ON にして保存するとエラー (iOS は「公開設定を保存できませんでした」)。運営の「公開に戻す」でだけ戻る
- B: 戻せる。作成者が時間割設定を保存し直すと再び公開される (運営の非公開は一時的な措置になる)
- (共通の前提: 運営が直した科目・コマ・学校学科は、作成者が保存し直すと作成者の時間割で上書きされる。タイトル・説明は残る)

**Q3. プライバシーポリシーと利用規約を §16 の文案で改定しますか**
- A (推奨): 文案どおり改定し、管理画面の公開より先に Web へ反映。App Store の「App のプライバシー」も 1.0.2 審査後に更新
- B: ポリシーだけ改定し、規約は今のまま (表記の修正・統合を規約に書かない)
- C: 文案を直してから (指摘をもらって Architect が書き直す)

**Q4. 継続率の数え方はこれでよいですか**
- A (推奨): 登録した週ごとにまとめ、登録から 1〜8 週後の各週に「1 回でもアクセスした人 / 判定できる人」。自分とテスト用アカウントは管理画面で集計から外せる
- B: 日ごとにまとめ、1 日後・7 日後・30 日後に使ったか (今の登録ペースだとほぼ全セルが 0/1 か 1/1)
- C: 月ごとにまとめ、1〜3 か月後

## 20. 不採用案

- **N1 better-auth の admin プラグイン**: `/admin/*` 14 本 (impersonate を含む) が一括で生え個別に切れない。`remove-user` は退会処理を飛ばす。BAN は今回作らない。必要な操作 (閲覧・削除) は既存の `deleteAccount` と Prisma で足りる。
- **N2 Web SPA (`apps/web`) に `/admin` を足す**: 管理 UI のコードが全利用者のバンドルに入る。API ホストへの別オリジン fetch になり、Access を掛けると preflight で落ちる (`cloudflare-access-cors-preflight…`)。
- **N3 bloom 型の別サービス + 内部 API + 仮名イベント**: 規模 (18 人・運営者 1 人) に対して Coolify リソース・秘密・同期が増えすぎる。被害範囲の議論は §2 の表で、同一プロセスでも増える攻撃面は Access + JWT の層だけと整理できた。
- **N4 オリジン側の管理者メール許可リスト**: 誰が入れるかの正典は AIS Pass の「サービス × ユーザー」許可 (2026-11-19 Touri 裁定)。オリジンに 2 つ目の台帳を持つと食い違いの元になる。JWT の aud がこの Access アプリに縛られているので、Pass で許可された人しか有効な JWT を持てない。
- **N5 API ホストのパス単位 Access (`atender-api.appily.run/admin*`)**: 1 アプリ内のパス別 policy は公式に確認できず、末尾 wildcard は親パスを含まない。iOS の Bearer と同居させると設定ミスで iOS ごと止まる。ホスト名を分ける方が境界が明確。
- **N6 `Session.updatedAt` や `AttendanceRecord.createdAt` で利用日を推定**: 前者は 24 時間に 1 回しか動かず、後者は「出欠を付けた日」で閲覧だけの日を数えない。過去分の復元は諦め、導入日から測る。
- **N7 学校・学科の削除**: School 削除は Department とテンプレを Cascade で消す。重複は統合で解消でき、要望 (名前修正・重複の統合) に削除は無い。
- **N8 運営の編集で作成者とのリンク (`sourceUserTimetableId`) を切る**: 作成者が次に公開を ON で保存すると新しい公開時間割ができ、同じ内容が 2 件並ぶ。
- **N9 運営の編集を作成者の再公開から守る (編集したら再公開を 409)**: 作成者は自分の時間割を直しても公開版を更新できなくなる。正本は作成者の時間割にする。
- **N10 日コホート (D1/D7/D30)・月コホート**: §6-2 の理由。Q4 で Touri が選べば `computeKpi` の窓の定義だけ差し替える。
- **N11 管理画面のローカル用の認証バイパス (`ADMIN_DEV_INSECURE` 等)**: 本番コードにバイパスの分岐を置くとそれ自体が穴になる。ローカルの確認はテスト (署名した JWT) で行う。
- **N12 リクエストごとの利用記録 (時刻つきアクセスログ)**: KPI に要るのは日単位だけで、時刻は行動の追跡になる。書き込みも要求数に比例する。
- **N13 確認に JavaScript の `confirm()`**: CSP で JS を全面禁止にしている。確認ページ + 確認コードの方が誤操作に強い。

## 21. 調査と食い違った事実・未確認事項

食い違い・追加で分かった事実:
- **F1** `entrypoint.sh` の `prisma db seed` が毎回 `mextCode` で学校を upsert して名前を戻す。本番の学校 48 校のうち 35 校は `mext-schools-sample.csv` の `MOCK_` 行と推定 (本番の DB は見ていない)。文科省の学校は改名不可・統合元にできない (§10)。
- **F2** iOS / Web は時間割設定を保存するたびに (公開トグル ON・授業 1 件以上) publish を呼ぶ。運営の中身の編集はかなり頻繁に上書きされうる。タイトルはクライアントが現タイトルを送り返すので残る (§9-2)。
- **F3** `a2-review.test.ts` は「drop_calendar が最新の migration」を固定しており、migration を足すと赤になる (§14)。調査の「#M3 は緩め済み」だけでは足りなかった。
- **F4** hono の `verify` は `exp` が無いトークンの期限検査を飛ばす。自前で必須にした (§3-3)。
- **F5** `AttendanceRule` は学校・学科の両方に Cascade 付き FK があり、`@@unique` は `userId = NULL` の重複を防がない (既定ルールは `findFirst` + `createdAt` 昇順で読まれる)。統合はこの前提で衝突を自前判定する (§10-2)。
- **F6** 利用規約 §5 は「削除・利用制限」までで、表記の修正・統合とアカウントの削除は書いていない (§16)。iOS の `PrivacyInfo.xcprivacy` は製品の操作を宣言していない。

未確認:
- **U1** Cloudflare Access の `CF_Authorization` cookie の SameSite の既定値。どちらでも §3-4 の Origin 照合で CSRF は閉じる。
- **U2** 管理ホストの Universal SSL と Tunnel の経路は実機で未確認 (1 階層サブドメイン + wildcard CNAME の既存の作法に従う)。手順 18-2 の 1 で確認できる。
- **U3** 旧コードの `prisma migrate deploy` が「DB にあってフォルダに無い migration」で失敗しないか。D0-b で実走して確認する。
- **U4** App Store Connect の「App のプライバシー」を審査中に変えて審査に影響があるか。影響を避けるため T5 は審査完了後にした。
- **U5** テストの `createSessionCookie` が偽署名で getSession が通らず DB フォールバック経路になる (調査の推測)。AC は両経路で記録する設計なので結果は変わらない。
