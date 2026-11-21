---
title: Atender 管理画面 (ユーザー管理 / 軽い KPI / 公開時間割管理) の設計前調査
category: library
project: atender
tags: [admin, kpi, retention, better-auth, cloudflare-access, templates]
created: 2026-11-22
sources:
  - apps/api/src (index.ts, middleware/session.ts, middleware/clientVersion.ts, middleware/cors.ts, auth.ts, routes/*, services/accountDeletion.service.ts)
  - apps/api/prisma/schema.prisma
  - Muraki/knowledge/library/better-auth-admin-plugin-ban-semantics-1-6-33.md
  - Muraki/knowledge/library/cloudflare-access-cors-preflight-and-app-paths-2026.md
---

## 1. アクティブ計測の事実
- `app.use("*")` は corsMiddleware と clientVersionGuard だけ (`index.ts:32-33`)。**認証は全体ミドルウェアでなくルートごとの `sessionMiddleware`** (`middleware/session.ts:27`)。ユーザーが確定する共通点はここ 1 か所 (成功パスは `session.ts:30-34`、DB フォールバックは `:42-50`)。sessionMiddleware を持たないのは `/healthz` `/version` `/api/auth/*` `/api/auth/native/callback`。
- clientVersionGuard は user を知らない (`middleware/clientVersion.ts`)。ヘッダ `X-Atender-Client: ios/<build>` は iOS が全リクエストに付ける (`APIConfig.swift:34`)。Web は付けない (CORS の Allow-Headers が `Content-Type` のみ、`cors.ts:5`)。→ プラットフォーム判別に使える。
- iOS のコールドスタートは `AuthStore.bootstrap` → `fetchMe` (`/api/me`) (`AuthStore.swift:35-49`)。Web は root route の loader が毎ロード `/api/me` を叩く (`router.tsx:19`)。バックグラウンド復帰では叩かない (cache)。
- DB に「最終来訪」の列は無い。`Session.updatedAt` は better-auth の getSession が `updateAge` (86400 秒、`auth.ts:126`) 経過後の最初のリクエストで更新 (`better-auth/dist/api/routes/session.mjs:206-232`)。毎日使っても 24 時間未満の間隔で来ると更新されず、日別アクティブには使えない (週単位の粗い目安にはなる)。iOS の生 token Bearer も bearer plugin が署名して同じ経路に入る (`plugins/bearer/index.mjs:27-34`)。DB フォールバック経路 (`session.ts:42`) は updatedAt を更新しない。
- ★ テストの `createSessionCookie` は偽署名の cookie を作る (`tests/helpers/auth.ts`) ので getSession が通らず、**テストでは常にフォールバック経路になる** (コード読みの推測。実測は未)。更新条件が better-auth 任せだとテストで観測できない → 記録は sessionMiddleware 自体に置く方がテスト可能。
- 過去の日別アクティブは復元不能。残る痕跡: `User.createdAt` (登録日、コホート定義には使える)、`Session.createdAt/updatedAt` (ログイン・更新、期限切れ・サインアウトで行が消える)、`AttendanceRecord(userId, createdAt/updatedAt)` (出欠を付けた日。index あり)、`UserTimetable/Semester.createdAt`。サーバーアクセスログは Traefik/Nginx に生で残る可能性があるが user id は無い (Bearer のみ)。保持期間は未確認 (本番に触れない制約)。
- 参考: bloom は「アプリが前景のときだけ付くヘッダ + route→機能表」で閲覧を数え、仮名イベントログに raw を貯めて mart を再構築 (`knowledge/pattern/admin-service-internal-api-and-pseudonymous-event-log.md`)。

## 2. ユーザー管理の既存部品
- 削除: `DELETE /api/me` → `deleteAccount(userId)` (`routes/me.ts:68`、`services/accountDeletion.service.ts:62`)。順序: `collectRevocableTokens` (Apple/Google の Account を User 削除前に読む) → `deleteUserData` (1 tx: 所有 Room を最古参メンバーへ移譲、いなければ削除 / 非公開テンプレ削除 / `user.deleteMany`) → `revokeTokens` (commit 後、失敗はログのみ、`tokenRevocation.service.ts:94`)。同一ユーザーの二重実行は inFlight Map で合流。**認証済みの自分 id 前提でなく `userId` 引数なので、管理から任意 id で呼べる** (呼び出し側の認可だけ足す)。
- Cascade (User 削除): Account / Session / Semester / UserTimetable (→ DaySlot / Course / Meeting / Occurrence / AttendanceRecord / 振替 / 休講) / AttendanceRecord / AttendanceRule(userId) / Friendship (送信・受信) / Room(createdBy, 移譲で回避) / RoomMembership。SetNull: School.createdBy / Department.createdBy / TimetableTemplate.author (`b20_author_set_null`、公開テンプレは作成者不明で残る)。
- BAN/停止: grep `banned|suspend.*user|isAdmin|admin` (src, schema, shared) で**該当なし** (Suspension 系は休講テーブルのみ)。admin ロール・allowlist も無い。
- better-auth admin plugin: 1.6.33 に現存 (`better-auth/plugins` の `admin`)。詳細は `knowledge/library/better-auth-admin-plugin-ban-semantics-1-6-33.md`。要点: 追加列 role/banned/banReason/banExpires + session.impersonatedBy (additive migration)、ban は全セッション削除 + サインイン時拒否、`remove-user` は退会処理を飛ばす、`adminUserIds` で role 列なしでも admin 指定可。`/api/auth/*` の catch-all (`routes/auth.ts:59`) にそのまま載る。
- `/api/me` の応答に role を足すなら shared の `MeResponseDto` 変更 (iOS は未知キーを無視する前提だが、型を厳密に読むので要デコード確認)。

## 3. 公開時間割
- モデル: TimetableTemplate (`schema.prisma:171`: authorUserId SetNull / schoolId, departmentId Cascade / isPublic / copyCount / sourceUserTimetableId (FK 無し・unique) / daysOfWeek) + TemplateDaySlot / TemplateCourse / TemplateMeeting (全て Cascade)。UserTimetable.sourceTemplateId SetNull。School (mextCode null = ユーザー作成、createdByUserId SetNull)、Department (source USER/MEXT、`@@unique([schoolId,name])`、School 削除で Cascade)。
- ロジックの所在: 公開 = `POST /api/user-timetables/:id/publish-as-template` (upsert、`routes/userTimetables.ts:134-185`)。非公開 = `PATCH /api/timetable-templates/:id {isPublic:false}` (`routes/templates.ts:119`、作成者のみ)。一覧・詳細は `isPublic:true` のみ (`:24-59`)。取り込み = `copyTemplateToUser` (`services/templateCopy.ts`、copyCount を加算)。提案 = 「同学科の GET 一覧を iOS/Web が絞る」クライアント側ロジック (`TemplateSuggestionLogic`)。サーバーに提案専用 API は無い。
- 運営の介入手段: **無い**。PATCH/DELETE は `authorUserId !== user.id` で 403 (`templates.ts:125,167`)。School/Department は GET/POST のみで更新・削除・統合の API が無い (`routes/schools.ts`)。授業 0 件のテンプレも作られうる (設計 build21 §判断)、重複テンプレは放置 (設計 T4)。
- 再利用可: `templateDto` (`lib/dto.ts`)、`templateInclude` (`templates.ts:15`)、`decodeCursor/encodeCursor`、`copyTemplateToUser`。管理用に新規が要るもの: 作成者に関わらない非公開化/削除、School・Department の統合や削除 (Cascade でテンプレごと消えるので注意)。

## 4. 置き場所の事実
- 構成: atender-api (`vrdxzvmakcxieyhfhayz5r8r`, `atender-api.appily.run`, tsx で `src/index.ts` 直実行、起動時に DB を 5 世代コピー → `prisma migrate deploy` → seed、`entrypoint.sh`)。atender-web (`xxg31wshj6rhjmnffju1bg5r`, `atender.appily.run`, nginx の SPA、`try_files ... /index.html`、`nginx.conf`)。LP は別 (`atender.aisaba.net`)。
- Web のルーティング: TanStack Router のコード定義 (`router.tsx`)。`/admin` を足すなら同じ SPA バンドルに入る (管理 UI コードが全利用者に配られる。認可は API 側が要る)。Web は API を別オリジンで `credentials: include` (`api/client.ts:37`)、API の CORS は `PUBLIC_WEB_URL` 1 オリジンのみ許可 (`cors.ts:9`)、cookie は `BETTER_AUTH_COOKIE_DOMAIN` の cross-subdomain (`auth.ts:134-137`)。
- Access: iOS が叩く API ホスト全体に Access は掛けられない (Bearer の機械クライアントが入れない)。パス単位は可能だが、(a) 別オリジンのブラウザ → Access 越し API は preflight が落ちる (`knowledge/library/cloudflare-access-cors-preflight-and-app-paths-2026.md`)、(b) 末尾 wildcard は親パスを含まない、(c) 1 アプリ内のパス別 policy は公式未確認。同一オリジン (API ホストの `/admin*` を API 自身が配る) なら (a) は出ない (未実測)。
- 前例: bloom = 別サービス (Go, 本体 DB に繋がず内部 listener + HMAC)、ホスト全体を Access (AIS Pass IdP) + OIDC の 2 段 (`projects/bloom/.designs/20261010-admin-service.md`)。ais-pass pad = 別ホスト `passconsole.aisaba.net` を Access、アプリ内で `Cf-Access-Jwt-Assertion` 検証 (`research-pass-hardening-audit-20261029.md:36`)。Access の IdP はサービスごとに AIS Pass の client を分ける (`knowledge/pattern/access-idp-per-pass-client.md`、手順 `projects/ais-pass/CLAUDE.md:82-100`)。penpen は `/api` を Access から外さず service token で通した (sessions/2026-11-13-8110305a.md:11)。2 階層サブドメインに www を同居させない (`knowledge/gotcha/cloudflare-access-multi-domain-redirects-to-uncertified-host.md`)。
- Atender に管理系を足した前例は無い (grep `admin|管理画面|cohort|retention` in atender/.knowledge は無関係ヒットのみ)。

## 5. テスト基盤
- API: Vitest 2、`pool: forks, singleFork`、`tests/setup.ts` が env を固定し `tests/.tmp/template.db` (migrate deploy 済み) を test ごとにコピー (`tests/helpers/db.ts`)。呼び出しは `app.request(path, { headers: { Cookie } })`、ユーザーは `createTestUser` / `createSessionCookie` (DB に Session を直接作る・偽署名)、`createSchoolDepartment`、`expectError` (`tests/helpers/*`)。別途 `test:secure-cookie` 設定あり (`package.json`)。
- 台帳 (`.knowledge/known-failures.md:430-435`): API 既知失敗 13 (A1/A2/A4/A5/A8 + B1-B5 + Magic Link 3)、未分類 0。2026-10-30 の実測 13 failed / 684 passed / 1 skipped。今日の実測はしていない。migration を足すと `b20-author-set-null-migration` #M3 が「最後の migration」前提で割れた前例 (緩め済み)。
- 注意 (researcher.md #31): ベースラインは単独・フォアグラウンド・`rm -rf tests/.tmp` で測る。Prisma Client が古いと大量失敗するので migration 追加後は `pnpm exec prisma generate`。
