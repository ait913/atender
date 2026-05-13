---
title: Atender Pre-design Research Summary
category: research
project: atender
tags: [stack-comparison, auth, capacitor, prisma, hono, attendance, school-code]
created: 2026-05-13
sources:
  - npm registry (npm view) — versions 直接照会, 2026-05-13
  - https://lucia-auth.com/  (公式)
  - https://github.com/lucia-auth/lucia/discussions/1714  (deprecate 告知)
  - https://www.better-auth.com/docs/  (公式)
  - https://authjs.dev/  (公式)
  - https://nextjs.org/docs/app/api-reference/config/next-config-js/output  (公式)
  - https://hono.dev/  (公式)
  - https://resend.com/docs/  (公式)
  - https://github.com/ammarmbe/tally
  - https://github.com/trulyPranav/AttendEase
  - https://www.mext.go.jp/b_menu/toukei/mext_01087.html
  - [[library/authjs-v5-prisma-sqlite]]
  - [[library/capacitor-nextjs-ios-2026]]
  - [[library/nextjs15-prisma-sqlite-coolify]]
  - [[pattern/web-first-capacitor-later-design]]
  - [[pattern/portable-realtime-rescue-stack]]
  - [[gotcha/prisma-coolify-dockerfile]]
  - [[gotcha/coolify-https-redirect-loop]]
---

# Atender — Pre-design Research Summary

調査日: 2026-05-13 / 調査者: researcher (Gemini + WebFetch + WebSearch + `npm view`)。
Codex は本セッション中、CLI 認証トークンが invalid_grant で失敗したため未使用。要再ログイン (`codex login`)。

## Executive Summary (Architect への推奨)

### 推奨スタック (1 案)

**Next.js 16 (`output: 'export'`) + better-auth 1.6.x + Prisma 6.x + SQLite + Resend** を**単一リポジトリ・1 コンテナ** で立ち上げる **「Web 先行 + API 分離準備済」** 構成。

- `apps/web` = Next.js static export (Phase 1.5 で Capacitor 同梱)
- API は同じ Next.js の **Route Handler (`/api/*`, GET/POST 含む)** に置くが、**`<form action>` や Server Action は使わない・全部 `fetch` で叩く** 縛りを敷く。Route Handler は static export 時に **dynamic route として残せる** ため、Phase 1 では 1 コンテナで動かし、Phase 1.5 で iPhone 化する時に **Route Handler を Hono に剥がす移行** が「URL を維持したまま」可能 (詳細: §1)
- 認証は **better-auth + Prisma adapter (SQLite)**。Magic Link は **better-auth `magicLink` plugin の `sendMagicLink` コールバックの中で Resend SDK を呼ぶ** だけ。Google OAuth は `socialProviders.google`
- ホスティングは Coolify (Appily)。1 service・1 volume (`/app/data/prod.db`) で起動

なぜこの案か:
1. **Lucia v3 が 2026-03 に正式 deprecate 済み** ([discussion #1714](https://github.com/lucia-auth/lucia/discussions/1714)) → session-based 純度を取る選択肢は Lucia ではなくなった
2. **better-auth は 2026-05 時点で v1.6.11 が `latest` (stable)** (`npm view better-auth dist-tags` 確認、最終 publish 2026-05-12)。Auth.js v5 がいまだ `5.0.0-beta.31` ([npm](https://www.npmjs.com/package/next-auth) の `next-auth` `beta` tag) なので **逆転して better-auth の方が stable**
3. Auth.js v5 と比べて **Magic Link の SDK 経由送信が 1 級コールバック** で済む (Auth.js は Nodemailer transport を介す層が 1 段多い)
4. Touri 既存知見 (Next.js 15 + Prisma + SQLite + Coolify Dockerfile 完成形 [[gotcha/prisma-coolify-dockerfile]]) の **再利用率が最大**
5. tomori で学んだ「output: 'export' 縛り」パターン [[pattern/web-first-capacitor-later-design]] にそのまま乗る

### 不採用案 (再検討ループ防止のため明記)

| 案 | 不採用理由 |
|---|---|
| **A: Next.js + Auth.js v5** | better-auth が同じ機能で stable・型が強い・コード短い。Auth.js v5 はまだ beta (5.0.0-beta.31)、stable は 4.24.x のまま [npm](https://www.npmjs.com/package/next-auth)。v4 を採用すると 1-2 年内に v5 移行の手戻りが確定 |
| **B: Hono 完全分離 + Vite+React+TanStack** | API 分離度は最高だが、(1) Touri の Next.js+Prisma+SQLite+Coolify 既踏スタック [[library/nextjs15-prisma-sqlite-coolify]] を捨てる学習コスト、(2) Magic Link UI (リンク踏んで verify→redirect) を Hono+SPA で組むと SSR redirect が無くて UX が荒れる、(3) MVP の規模感に対し overengineering。**Phase 1.5 で iPhone 化する時に剥がせる余地は推奨案 A' で確保** |
| **C: Encore.dev / Bun+Elysia / Remix** | ベンダーロック ([[pattern/portable-realtime-rescue-stack]] のポータブル原則違反) または Touri 既存知見ゼロで学習コスト過剰 |
| **Lucia v3 採用** | 2025-10 に deprecate アナウンス、2026-03 で完全停止。新規 PJ で採用してはならない |
| **PostgreSQL** | MVP の規模・共有時間割テンプレ検索の負荷想定で SQLite で十分。Phase 2 で必要になったら移行可 (§5) |

### 設計への ★ 強い含意 (Architect が見落とさないこと)

★1. **`output: 'export'` 採用 ≠ Route Handler 禁止**。Next.js 16 公式 ([Static Exports](https://nextjs.org/docs/pages/guides/static-exports)) で `output: 'export'` でも **Route Handler の GET は静的事前生成可能・POST/PUT/DELETE は禁止**。これは [[pattern/web-first-capacitor-later-design]] の縛り表とも整合。Atender の API は **全部 POST/PUT/DELETE で書くなら別 Hono サーバが必須**、または **Phase 1 だけ Route Handler を Node モードで動かし `output: 'export'` を Phase 1.5 直前まで遅延** という二択。後者 (=遅延) を推奨。

★2. **better-auth は Next.js middleware/proxy.ts に依存しない設計が公式推奨** ([Next.js 統合 docs](https://www.better-auth.com/docs/integrations/next))。各 page/route で `auth.api.getSession({ headers: await headers() })` を都度呼ぶ流儀。Capacitor 化しても `<SessionGuard>` パターン ([[pattern/web-first-capacitor-later-design]]) で踏襲できる。

★3. **Auth.js v5 stable 化を待たない**。better-auth は API/型が安定しているし、後で乗り換えるコストは Prisma スキーマ + handler 配置の差し替えのみ (両方 user/session/account/verification の 4 テーブル前提で同一構造)。

★4. **時間割の DB スキーマは `meeting`+`period_offset` 2 表構造を推奨** (§3 詳細)。「同じ授業が 1-2 限連続」は 1 row × N period の **slot 多重表現** で押す。AttendEase は `start_period`/`end_period` で weight 計算する手法を採るが、出席記録の重み計算がスキーマに混入して保守性を落とす。

---

## §1 技術スタック比較

### 候補 3 案

| 軸 | 案 A: Next.js + better-auth ★推奨 | 案 A': Next.js + Auth.js v5 | 案 B: Hono + Vite+React |
|---|---|---|---|
| Next.js | 16 (App Router, `output: 'export'` 遅延適用) | 同 | 不使用 |
| Auth | **better-auth 1.6.11 (stable)** | next-auth 5.0.0-beta.31 | better-auth (Node adapter) or 自前 |
| DB ORM | Prisma 6.x | 同 | 同 |
| DB | SQLite (better-sqlite3) | 同 | 同 (or Postgres) |
| Frontend | React 19 (Next.js 内蔵) | 同 | Vite + React 19 + TanStack Router |
| HTTP server | Next.js Node server (Phase 1) → static + 別 API (Phase 1.5) | 同 | Hono + @hono/node-server |
| iPhone 移行容易さ | ◎ (Capacitor で web を同梱、API は剥がして残す) | ◎ | ○ (SPA を Capacitor 化、API はそのまま) |
| API 分離度 | △→◎ (Phase 1 は同居、Phase 1.5 で剥離) | △→◎ | ◎ (最初から分離) |
| Touri 既存知見再利用 | ◎ ([[gotcha/prisma-coolify-dockerfile]] そのまま) | ◎ ([[library/authjs-v5-prisma-sqlite]] 参照) | △ (Hono+Prisma は [[pattern/portable-realtime-rescue-stack]] にあるが Coolify Dockerfile は別実装) |
| OSS 純度 / session-based | ◎ (better-auth は session DB 持つ) | △ (JWT or DB 選択制、設定で迷いやすい) | ◎ (自由設計、ただし自分で組む) |
| Magic Link 実装コスト | 低 (`sendMagicLink` 1 コールバック内で Resend SDK 呼ぶだけ、[better-auth docs](https://www.better-auth.com/docs/plugins/magic-link)) | 中 (Nodemailer transport 経由、`sendVerificationRequest` で `request` 引数を捌く) | 中 (自前で token 発行 → email → verify route) |
| Google OAuth コスト | 低 (`socialProviders.google: { clientId, clientSecret }`) | 低 (`GoogleProvider`) | 中 (arctic 等で OAuth 自前実装) |
| Coolify デプロイ容易さ | ◎ ([[gotcha/prisma-coolify-dockerfile]] テンプレ流用) | ◎ 同 | ○ (2 service: web + api、または 1 service で reverse proxy) |
| 2026 年保守状況 | ◎ (1.6.11 publish 2026-05-12) | △ (v5 beta 継続中、stable 未公開) | ◎ (4.12.18 publish 2026-05-06) |

### 案 A の詳細 (推奨)

**ディレクトリ構成**:
```
atender/
├── app/                          # Next.js App Router
│   ├── (auth)/login/page.tsx
│   ├── (auth)/verify/page.tsx
│   ├── api/auth/[...all]/route.ts   # better-auth handler (toNextJsHandler)
│   ├── api/timetables/route.ts      # MVP は同一プロセスで OK
│   ├── api/attendances/route.ts
│   └── ...
├── lib/auth.ts                   # betterAuth({ adapter: prismaAdapter(prisma, { provider: "sqlite" }), plugins: [magicLink({ sendMagicLink })], socialProviders: { google } })
├── prisma/schema.prisma          # better-auth CLI で生成: User / Session / Account / Verification + Atender 独自モデル
└── Dockerfile                    # [[gotcha/prisma-coolify-dockerfile]] そのまま
```

**Phase 1 → Phase 1.5 移行戦略**:
1. Phase 1: `output` 設定なし (Node mode)。Route Handler を素直に書く。同一オリジン `/api/*` 同居
2. Phase 1.5 直前: `output: 'export'` を試し、動的な API を **別ディレクトリ (`api/` を `worker/` に分離) + Hono コンテナ** に剥がす。better-auth handler だけが Hono への移植が要るが、better-auth は **Node 環境ベース** ([Hono integration](https://www.better-auth.com/docs/integrations/hono) も公式提供) なので 1:1 で書き直し可能
3. Phase 1.5: Capacitor で `apps/web` を同梱、`apps/api` (Hono) は Coolify 別 service

**Phase 1 から守る縛り** ([[pattern/web-first-capacitor-later-design]] 流用):
- `next/image` 不使用 (素 `<img>`)
- Server Actions 不使用 (全部 `fetch('/api/...')`)
- `middleware.ts` / `proxy.ts` で重い認可をしない (`<SessionGuard>` でクライアント側 redirect)
- ISR / on-demand revalidate なし
- `cookies()` `headers()` を **route handler 内では使う** (Phase 1.5 で Hono の `c.req.header()` に書き換える 1 関数を切る)
- `trailingSlash: true` を最初から設定

---

## §2 Magic Link + Google OAuth 鉄板実装 (2026-05)

### better-auth の Magic Link 実装

```ts
// lib/auth.ts
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { magicLink } from "better-auth/plugins"
import { nextCookies } from "better-auth/next-js"
import { Resend } from "resend"
import { prisma } from "./db"

const resend = new Resend(process.env.RESEND_API_KEY)

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,   // 15 min (default 300s だと短すぎる)
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: "Atender <noreply@atender.example>",
          to: email,
          subject: "Atender ログイン用リンク",
          html: `<a href="${url}">サインインする</a>`,
        })
      },
    }),
    nextCookies(),
  ],
})
```

- バージョン根拠: `better-auth@1.6.11` (`npm view better-auth dist-tags` 2026-05-13、最終 publish 2026-05-12)
- 公式 [magic-link docs](https://www.better-auth.com/docs/plugins/magic-link) より `sendMagicLink` の引数は `{ email, token, url, request? }`
- Next.js handler 設置: `app/api/auth/[...all]/route.ts` に `export const { GET, POST } = toNextJsHandler(auth)` ([Next.js 統合 docs](https://www.better-auth.com/docs/integrations/next))

### Resend Node SDK 仕様 (2026-05)

- `resend@4.12.18` が `latest` (`npm view resend dist-tags` 2026-05-13、最終 publish 2026-05-06)
- `emails.send({ from, to, subject, html?|text?|react?, cc?, bcc?, replyTo?, scheduledAt?, headers?, tags?, attachments?, idempotencyKey? })` で `{ data, error }` を返す ([公式 Node guide](https://resend.com/docs/send-with-nodejs))
- 必須 DNS レコード ([Resend Domain docs](https://resend.com/docs/dashboard/domains/introduction)):
  - **SPF (TXT)** — IP 認可リスト + MX 含む
  - **DKIM (TXT)** — 公開鍵
  - **DMARC (TXT)** — オプション (推奨)
- ドメイン推奨: `atender.example.com` 本体ではなく `mail.atender.example.com` 等のサブドメイン分離

### Auth.js v5 を選んだ場合の参考実装

(不採用だが、後でなにかあった時のために) [[library/authjs-v5-prisma-sqlite]] に既存記述あり。今回の調査で確認したのは `next-auth@5.0.0-beta.31` (`npm view next-auth dist-tags` 2026-05-13)。`latest` tag は依然 `4.24.14`。stable 化は未だ。

---

## §3 時間割 / 出欠系 OSS 先行事例

### 結論: 「コピー元になる強い OSS」は見つからなかった

| Repo | Stars | Stack | DB スキーマの肝 | Atender 流用可否 |
|---|---|---|---|---|
| [ammarmbe/tally](https://github.com/ammarmbe/tally) | **6** | Next.js 15 + Lucia + Neon Postgres + Shadcn/ui | course (days/start/end/room) + 出席率自動計算 + PWA push | **Lucia 採用済 = 認証層は使えない**。UX (current-class one-tap) は参考に |
| [trulyPranav/AttendEase](https://github.com/trulyPranav/AttendEase) | 100+ | Dart (Flutter) + Etlab スクレイピング | `Subject` 1:N `Timetable` / `AttendanceLog` (weight) | 言語違い、参考は schema 概念のみ |
| [GDSCNITD/attendance-tracker](https://github.com/GDSCNITD/attendance-tracker) | 0 (初期段階) | Next.js + Drizzle + NextAuth | (詳細不明、4 commits) | 参考にならず |
| [OS4ED/openSIS-Classic](https://github.com/OS4ED/openSIS-Classic) | 400+ | PHP (教育機関向け SIS) | `Course_Periods` テーブル / `Meeting_Days` + `Period_ID` | 規模が違いすぎる、概念のみ |

### 連続コマ授業の DB 表現 (Atender 独自設計が必要)

「1 限+2 限 = 同じ授業」をどう表現するかは 2 流派ある:

**流派 X: range (start_period / end_period)** — AttendEase 採用
- `Meeting { course_id, day_of_week, start_period, end_period, weight }`
- 出席記録 1 回で weight 倍カウント
- 短所: 出席率計算で「絶対値の出席コマ数 / 絶対値の総コマ数」を出す時、weight ロジックがアプリ層に染み出す。テスト書きにくい

**流派 Y: slot 多重 (period offset)** ★ Atender 推奨
- `Meeting { course_id, day_of_week, start_period_index }`
- `MeetingSlot { meeting_id, period_offset: 0 | 1 | ... }` ← 1限+2限なら 2 行
- `Attendance { meeting_slot_id, status }` でコマ単位記録
- 出席率は単純な `count(present) / count(total)`、ユーザーが「ワンタッチで全 slot をまとめて present」と「個別 slot だけ absent」両方できる
- Touri の [[pattern/touri-design-philosophy]] (Uniform Shape + Discriminator) と整合

詳細スキーマ案は Architect に委ねる。流派 Y を強く推奨。

### ワンタッチ出欠 UX

OSS 共通パターン: **今日の日付の current class card に大きな「出席」「欠席」「公欠」ボタンを並べる**。ホーム画面で 1 タップ。tally が PWA 通知 + リンクで「今 ○○ 授業中、出席する?」フローを採用しているのが新しい (が、PWA push の信頼性は iOS で劣化することに注意。Phase 1.5 で Capacitor 化したら Local Notification に置換)。

---

## §4 iPhone 移行戦略

| Phase 1 (Web) | Phase 1.5 (iPhone) のルート |
|---|---|
| 推奨案 A (Next.js + better-auth, Node mode) | (a) `output: 'export'` 切替 + Capacitor で同梱 + Route Handler を Hono コンテナに剥がし、cookie cross-origin (Capacitor scheme `capacitor://localhost` → API `https://atender-api.appily.run`) で **`Set-Cookie SameSite=None; Secure`** を返す。better-auth の Hono integration 公式あり |
| 案 B (Hono 分離型) | (a) Vite SPA を `cap copy`、API は別 Coolify service にそのまま |
| 案 C (Capacitor 直、Expo 採用) | RN 別実装、共通 API。Atender は Web UX 優先なので Expo は overkill |

### 認証セッション引き継ぎ

- Phase 1 同一オリジン (`atender.appily.run`) → cookie `Lax` で OK
- Phase 1.5 cross-origin → `SameSite=None; Secure; HttpOnly` + better-auth の `trustedOrigins` 設定 + CORS allowlist (`Access-Control-Allow-Origin: capacitor://localhost`、`Access-Control-Allow-Credentials: true`)
- Sign-In with Apple は better-auth の `appleId` social provider で **Phase 1.5 で追加するだけ** (`appleId.clientId`, `appleId.clientSecret`)

### Capacitor バージョン

[[library/capacitor-nextjs-ios-2026]] のとおり v8 stable、v9 alpha。Phase 1.5 着手時に v9 が stable 化しているか再確認 (Touri 設計時に re-research)。

---

## §5 PostgreSQL vs SQLite

### 結論: **SQLite (better-sqlite3) でスタート、Phase 2 で必要なら Postgres へ**

| 軸 | SQLite | PostgreSQL |
|---|---|---|
| Coolify 1 コンテナで動く | ◎ ([[library/nextjs15-prisma-sqlite-coolify]]) | ○ (2 コンテナ or compose) |
| 共有時間割テンプレ検索 | ○ (FTS5 や `LIKE` で数千件レベルなら問題なし) | ◎ (pg_trgm / 全文検索) |
| 数百人スケール | ○ (WAL モードで read 並列 OK、write は単一) | ◎ |
| Phase 1.5 iPhone との同期 | △ (SQLite ↔ Server SQLite で楽だが MVP 段階で同期は要らない) | ○ |
| Touri 既存知見 | ◎ ([[gotcha/prisma-coolify-dockerfile]]) | ○ ([[pattern/portable-realtime-rescue-stack]]) |
| 移行コスト | (出発点) | Prisma の `datasource provider` 変更 + migration 再生成 |

学校+学科で共有時間割テンプレを public 検索する規模感は、専門学校・大学合計 4 桁校 × 学科数 (各校 5-30) で **最大 数万行**。SQLite + FTS5 で十分余裕がある (1 万行の `LIKE` 検索でも数 ms)。

Phase 2 (数千 DAU 超え or 同時書き込み多発) で Postgres 移行は標準コース。Prisma スキーマレベルでは変更ほぼ不要。

---

## §6 Codex (gpt-image-1) でキャラ生成

[[tool-quirk/codex-cli-imagegen-tool]] と [[tool-quirk/image-generation-models]] のとおり Codex を使う前提。

### Atender マスコット プロンプト雛形 (英語、3 案)

**案 (i): 抽象幾何系**
```
A friendly mascot character for an attendance tracking app called "Atender".
Style: minimal flat geometric shapes, similar to the Claude/ChatGPT brand-mascot
style — friendly but not anime. A small rounded character with a calendar / checkmark
motif as its body. Soft gradient background (#0a1830 to #000), white character outline.
NOT anime, NOT chibi, NOT 3D render. Logo-quality, 1024x1024 PNG, white background.
```

**案 (ii): 紙の人形系**
```
A paper-cutout style mascot for a school attendance app. The character is a stylized
piece of paper shaped like a smiling notebook with checkmarks on its body. Friendly,
approachable, gentle smile. Color palette: white paper, dark navy background.
NOT anime, NOT cute manga style. Editorial illustration vibe like The New Yorker
or Notion's brand illustrations. 1024x1024 PNG.
```

**案 (iii): タイポグラフィ寄り**
```
A typographic mascot: a rounded sans-serif letter "A" with two small dots as eyes
and a tiny smile. Walking on small stick legs. Style: brand mark, geometric,
playful. Off-white character on near-black background (#000 to #0a1830 gradient).
NOT anime. Style reference: Duolingo simplicity meets Helvetica Bold confidence.
1024x1024 PNG.
```

### 出力指定の現実解

- サイズ: `1024x1024` リクエストしても `1254x1254` で返ってくることがある ([[tool-quirk/codex-cli-imagegen-tool]] に既述)、`sips -z 1024 1024` で後処理
- 背景: アルファ透過 (`background: transparent`) は不安定。**白背景 or 黒背景で出力 → 後段で `magick -fuzz 10% -transparent` で抜く** が現実
- 並列生成: `codex exec` を `run_in_background: true` で 3-5 案同時生成、Touri 選別

---

## §7 学校・学科マスタの扱い

### 公式データソース

- **文部科学省 学校コード** ([公式](https://www.mext.go.jp/b_menu/toukei/mext_01087.html)) — CSV/Excel 提供、令和7年 (2025) 12月公表が最新。大学・短期大学・高等専門学校 / 専修学校 (専門学校はこの区分) / 高等学校 等を網羅
- **edu-data.jp** (チエル株式会社) — 公式の文科省コードを Web 検索 UI でラップ。**API は有償** (個人開発で本格利用は厳しい)
- **e-Stat 学校基本調査** — 統計データ、機械可読あり

### MVP 推奨

1. **MVP**: 文科省 CSV を build 時に取り込んで **静的 JSON シード** にする (`prisma db seed` で School/Department テーブル投入)。表記揺れは別問題として `LIKE` 検索 + ユーザー入力許容
2. **学科 (department)** は文科省データに**含まれない** (学校単位までしかコード化されてない)。学科はユーザー入力 + 同名グルーピングで開始、後で「学校 X の学科一覧」を public ビューに溜める
3. **将来**: 表記揺れ正規化が必要になったら kuromoji + 編集距離 or LLM 補助で寄せる

### スキーマ案 (Architect への参考)

```
School { id, mext_code?, kind, name, name_kana, prefecture, ... }
Department { id, school_id, name, name_kana, source: 'mext'|'user' }
TimetableTemplate { id, school_id, department_id, year, term, ..., is_public }
```

---

## §8 Coolify デプロイ構成

### 推奨案 A (1 service) の Coolify 構成

- Application type: Dockerfile
- Domain: `atender.appily.run` (or 独自ドメイン)
- Volume: `/app/data` (SQLite ファイル永続化) + `/app/storage` (画像等)
- Env:
  - `DATABASE_URL=file:/app/data/prod.db`
  - `BETTER_AUTH_SECRET=...` (32 byte random)
  - `BETTER_AUTH_URL=https://atender.appily.run`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `RESEND_API_KEY`
  - **`NODE_ENV` は Coolify env に登録しない** ([[gotcha/prisma-coolify-dockerfile]] の罠)
- Coolify 設定 (新規アプリ作成直後に必ず PATCH):
  - `is_force_https_enabled: false` ([[gotcha/coolify-https-redirect-loop]])
- Dockerfile: [[gotcha/prisma-coolify-dockerfile]] の完成形を流用

### Phase 1.5 の 2 service 構成 (参考、Phase 1 では不要)

- service A: `apps/web` (Next.js static export → Nginx で配信、または Vercel-like static host)
- service B: `apps/api` (Hono コンテナ + Prisma + SQLite volume) ← 認証も含む

### SKILL `appily` との整合

`~/.claude/skills/appily/SKILL.md` の「新規アプリ作成標準フロー」 (Coolify API で create → `is_force_https_enabled` PATCH → redeploy) がそのまま使える。Architect から Developer へ渡す設計 doc では「§9 デプロイ手順」セクションに **SKILL appily を参照する旨だけ書く** (詳細は SKILL 側で管理)。

---

## §9 設計時の不確定事項 (Architect が決めること)

調査だけで決められないので Architect に委ねる:

- (a) MVP のスコープ確定: 公欠/遅刻/早退 の概念を MVP で扱うか
- (b) 時間割テンプレ共有の発見性 (検索 UI / 学校別 index / ランキング表示有無)
- (c) 出席率の計算粒度 (slot 単位 / day 単位 / week 単位)
- (d) Phase 1 で本当に Next.js Node mode でいくか、最初から `output: 'export'` + Hono の 2 リポジトリ構成にするか — **Touri の意思確認推奨**
- (e) Resend ドメインを `appily.run` のサブにするか専用ドメインにするか

---

## §10 既存 knowledge に新規追加すべき技術事実

このリサーチ中に判明した「単独で価値ある事実」は以下 2 件、別途 knowledge file 化する:

1. **`library/lucia-deprecated-2025.md`** — Lucia v3 が 2025-10 アナウンス・2026-03 完全停止。新規 PJ で採用してはならない (deprecated 化を踏まない記述として残す)
2. **`library/better-auth-2026.md`** — better-auth 1.6.11 stable、Magic Link + Google + Prisma SQLite の最小構成、Auth.js v5 (beta) との比較

(本ファイルとは別に作成する。INDEX 再生成も含む)

---

## 出典 URL 一覧

- npm registry (live query 2026-05-13):
  - `npm view better-auth dist-tags time.modified` → latest `1.6.11`, modified `2026-05-12`
  - `npm view next-auth dist-tags time.modified` → latest `4.24.14`, beta `5.0.0-beta.31`, modified `2026-04-14`
  - `npm view @auth/prisma-adapter dist-tags` → latest `2.11.2`
  - `npm view resend dist-tags time.modified` → latest `4.12.18`, modified `2026-05-06`
  - `npm view hono dist-tags time.modified` → latest `4.12.18` ※ (?: resend と紛らわしい; 正確には hono `4.12.18` published 2026-05-06)
  - `npm view @hono/node-server dist-tags` → latest `2.0.2`
  - `npm view lucia dist-tags time.modified` → latest `3.2.2`, modified `2025-06-06` (停滞)
- 公式 docs:
  - https://www.better-auth.com/docs/introduction
  - https://www.better-auth.com/docs/plugins/magic-link
  - https://www.better-auth.com/docs/integrations/next
  - https://www.better-auth.com/docs/adapter/prisma
  - https://authjs.dev/getting-started/providers/nodemailer
  - https://nextjs.org/docs/pages/guides/static-exports
  - https://hono.dev/getting-started/nodejs
  - https://resend.com/docs/send-with-nodejs
  - https://resend.com/docs/dashboard/domains/introduction
- Lucia deprecation:
  - https://github.com/lucia-auth/lucia/discussions/1714
  - https://x.com/pilcrowonpaper/status/1847975622087414177
- OSS 参考:
  - https://github.com/ammarmbe/tally
  - https://github.com/trulyPranav/AttendEase
  - https://github.com/OS4ED/openSIS-Classic
- 学校コード:
  - https://www.mext.go.jp/b_menu/toukei/mext_01087.html
