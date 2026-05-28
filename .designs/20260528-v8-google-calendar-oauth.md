# Atender v8 — Google Calendar OAuth 連携 (incremental scope + sync token polling + room-scoped sync)

設計日: 2026-05-28 / Architect: architect subagent
対象 commit: v7 (`.designs/20260527-v7-calendar-rrule-import.md`) デプロイ後
前提 docs:
- `.designs/20260527-v6-room-calendar-timetable.md` (RoomCalendar / RoomTimetable)
- `.designs/20260527-v7-calendar-rrule-import.md` (RRULE + .ics import + title mapping)
- `.knowledge/07-google-calendar-oauth-integration.md` (Researcher findings, 614 行)
- `.knowledge/06-calendar-rrule-ics-import.md` (Phase 1.5 で URL subscribe / Phase 2 で Google OAuth に進む計画)
- `knowledge/library/better-auth-2026.md`
- `knowledge/pattern/rrule-string-onfly-expand-with-overrides.md`
- `knowledge/pattern/tanstack-query-invalidation-matrix.md`

---

## Executive Summary

v7 で完成した「RoomEvent (RRULE 含む) + .ics import + タイトルマッピング + visibility 3 段階」基盤の上に、**Google Calendar OAuth による継続的同期**を追加する。ユーザーが Google アカウント単位で Calendar scope を**後付け**で許可 (better-auth `linkSocial` の incremental authorization)、各ルームに**「どの Google カレンダーをどの visibility で取り込むか」**を 1:N で紐付け、cron (1 時間毎) + 手動同期ボタンで `events.list?syncToken=...` の差分取得を回す。RoomEvent.source 値として **GOOGLE_OAUTH** が既に v7 schema に存在しているため、新規 column 追加で済む。

`.ics import` (v7) と Google OAuth (v8) は**並存**する。同一ルームに ICS 系と Google 系の RoomEvent が混在しても、`(roomId, externalUid)` unique は ICS_FILE 用、`(googleSyncId, googleEventId)` unique は Google 用、と key を分離する。

### 主要設計判断

1. **better-auth socialProviders.google.scope は最小維持**: sign-in 時の Google scope は `openid email profile` のまま (現状維持)。Calendar scope は authClient.linkSocial で後付け取得する。これにより既存ユーザーがログインしているだけで Calendar 権限を要求される事故を防ぐ。なお `accessType: "offline"` / `prompt: "consent"` を社会 provider 設定に **追加** し、初回 linkSocial で refresh_token が確実に発行される状態にする。
2. **incremental scope は authClient.linkSocial({ scopes: ["calendar.readonly"] })**: better-auth 1.2.7+ で既存連携済プロバイダにも追加 scope を要求できる。Atender は better-auth 1.6.11 採用済なので linkSocial で済む。callbackURL は `/settings/integrations/google?linked=1` に戻し、Web 側で「連携できました」UI を出す。Google 側は `include_granted_scopes=true` を better-auth が default で付ける。
3. **server-side token 取得は auth.api.getAccessToken({ providerId: "google", userId, headers })**: better-auth が自動 refresh する。API ハンドラ (session cookie あり) からは `headers` 経由で完結。**cron / background job からは session cookie が無い**ため、`userId` を直渡しする。これが better-auth 1.6.11 で動作するかは v8 不確定事項 #1 として実装中検証 (本書 §10 参照)。失敗時は dummy session を service 層で組み立てる fallback を最初から仕込む。
4. **新規 model 2 個 (GoogleCalendarConnection / GoogleCalendarSync)**: better-auth Account とは別 table。Account には access/refresh token + scope だけ (better-auth 管理)、Atender 固有の status / lastError / lastSyncedAt 等は新 model に持つ。GoogleCalendarSync は **room × Google calendar** の中間テーブルで、`roomId` / `connectionId` / `googleCalendarId` / `visibilityMode` / `syncToken` / `enabled` を保持する。
5. **RoomEvent に Google 系 column 3 個を追加**: `googleSyncId` (FK to GoogleCalendarSync) / `googleEventId` (Google events.list の id) / `googleRecurringEventId` (recurringEventId、親イベント紐付け用)。dedup key は `(googleSyncId, googleEventId)` unique。`recurrenceRule` は **空** にする (Google は singleEvents=true 展開で個別 instance を返すので、Atender 側でも RRULE 持たず 1 instance = 1 RoomEvent 行で保存)。
6. **events.list は singleEvents=true で展開済 instance 取得**: 自前 RRULE 展開しない。`recurringEventId` を持つ instance は親イベント検索用に保存。これにより v7 の RRULE 展開ロジックを Google 由来 RoomEvent に対しては**呼ばない**運用にできる (= `expandRoomEvents` 内で `recurrenceRule == null && source === GOOGLE_OAUTH` の行をそのまま単発として返す)。
7. **同期戦略は polling のみ (Watch API は Phase 2)**: 初回 sync は `timeMin = now`, `timeMax = now + 6 months` で fetch、`nextSyncToken` を保存。以降は `syncToken=...` のみで差分取得。**410 GONE で full re-sync** (該当 sync の RoomEvent を一括削除 → syncToken をクリア → 再フル fetch)。cron 間隔 = 1 時間 (ユーザー数 100 規模では Calendar API quota 余裕)。
8. **ユーザー単位の連携 × ルーム単位の sync 行**: 「連携 (Google アカウント)」と「sync (ルーム × カレンダー × visibility)」を別 model に分離。1 ユーザー = 1 GoogleCalendarConnection (1 Google アカウントのみサポート、MVP 範囲)、1 ルーム × 1 カレンダー = 1 GoogleCalendarSync 行。例えば「ルーム A には 自分の primary カレンダー」「ルーム B には 学校カレンダー + 個人」も可。
9. **連携解除モーダルは 2 択 (取り込んだ予定も削除する / 残す)**: default = 削除。プライバシー優先の Touri 方針。「残す」を選んだ場合 RoomEvent は残り source は `GOOGLE_OAUTH` のまま、`googleSyncId` は SetNull、以降同期されない孤立イベントとして扱う。
10. **visibility default = TITLE_MAPPED**: 既存の `EventVisibility` enum (v7 で導入) を再利用。同期時に v7 の `applyTitleRules` を**そのまま流用**して Google event summary に適用する。これにより「デート」などの生 summary を rawTitle に保持しつつ、表示 title は「予定」に正規化される。BUSY_ONLY も選択可。NORMAL は ICS_FILE と違って Google OAuth では `apps/api/scripts/sync-google-calendars.ts` という独立した cron スクリプトで実行され、毎回ユーザー rule を読み直す。
11. **cron は単独 tsx スクリプト (node-cron でなく Coolify scheduled task)**: `apps/api/scripts/sync-google-calendars.ts` を `tsx` で 1 時間毎に実行。Coolify scheduled task で `pnpm --filter @atender/api exec tsx scripts/sync-google-calendars.ts` を cron `0 * * * *` で打つ。理由: API container 1 個だけのシンプル構成を維持、node-cron をプロセス内に持つと dev / 多重起動時に重複実行する事故が起きる。
12. **API 完全分離維持**: Web client / iPhone client は同じ `/api/me/google-calendar/*` と `/api/rooms/:id/google-calendar-syncs/*` を叩く。UI 側の linkSocial は better-auth-client で direct call (API 経由でない)、ただし linkSocial 後の callback URL は Atender Web に戻る (`https://atender.appily.run/settings/integrations/google?linked=1`)。
13. **v7 を壊さない**: `RoomEvent` には 3 column 追加 + 既存 unique index は触らない (`@@unique([roomId, externalUid])` はそのまま残す)。`getRoomWeek` の `expandRoomEvents` は Google 由来 RoomEvent (`recurrenceRule == null` だが `source === GOOGLE_OAUTH`) も単発として返すだけなので、ロジック差し替え**不要**。

### スコープ外 (v8 でやらない)

- **Watch API (push notification)** — Phase 2.5。channel 1 ヶ月 expiry & 再購読 cron が複雑
- **複数 Google アカウント連携** — 1 user = 1 Google アカウント。複数アカウント要求は Phase 2 以降
- **書き戻し** — Atender → Google 方向は完全不採用。read-only
- **Microsoft / Outlook** — 別 issue 化、v8 範囲外
- **OAuth verification (Production 化)** — Testing ステータス + 100 ユーザー上限のまま (MVP 期間)
- **LLM ベース auto-categorize** — v7 と同様 Phase 2 送り
- **rawTitle 暗号化保存** — MVP は plain text。本人専用ストレージとして DB 上に置く (将来 envelope encryption 検討)
- **Google calendar の colorId 反映** — MVP は単色 (`null`)、ユーザー設定の color を v9 で検討
- **all-day event の DST 越境正確化** — Asia/Tokyo 固定で日付の境界処理する。Floating time も同様
- **同期中の race condition (同一 sync 並行 fetch)** — 単純 mutex (DB の `status=SYNCING` 行ロック相当) で防止、分散 lock は不要

---

## §0 用語

| 用語 | 意味 |
|---|---|
| **Connection** | `GoogleCalendarConnection` 行。1 user × 1 Google アカウント (= better-auth Account) を結びつける Atender 拡張行 |
| **Sync** | `GoogleCalendarSync` 行。1 ルーム × 1 Google カレンダーの取り込み単位。`syncToken` / `visibilityMode` / `enabled` を持つ |
| **incremental scope** | OAuth で「sign-in 時に最小 scope、機能利用時に追加 scope」を段階要求する手法。Google `include_granted_scopes=true` で実現 |
| **syncToken** | Google events.list が最終ページに返す token。次回 `?syncToken=` で渡すと差分のみ |
| **410 GONE** | syncToken expire (約 1 週間未使用) で events.list が返すステータス。full re-sync が必要 |
| **singleEvents=true** | events.list クエリ。RRULE を Google 側で展開し instance 単位で返してくれる |
| **recurringEventId** | 展開済 instance が持つ親イベント id。Atender では `googleRecurringEventId` に保存 |
| **rawTitle** | v7 由来。Google event summary をマッピング適用前に保存する column (本人のみ閲覧可) |

---

## §1 全体構成

```
v8 = (A) Prisma schema:
        - 新 model: GoogleCalendarConnection / GoogleCalendarSync
        - RoomEvent に 3 column 追加 (googleSyncId / googleEventId / googleRecurringEventId)
        - RoomEvent に @@unique([googleSyncId, googleEventId]) 追加
        - enum 2 個追加 (GoogleConnStatus / GoogleSyncStatus)
        - migration: 20260528090000_v8_google_calendar_oauth
     (B) Shared zod:
        - GoogleCalendarConnectionDto / GoogleCalendarSyncDto / GoogleListedCalendarDto を新規追加
        - CreateGoogleSyncInput / UpdateGoogleSyncInput / DeleteGoogleConnectionInput
        - RoomEventDto に 3 field 追加 (源データ識別用)
     (C) API endpoint:
        - GET    /api/me/google-calendar/connection
        - POST   /api/me/google-calendar/link              (linkSocial fallback、ただし MVP は Web 側 client SDK 経由)
        - DELETE /api/me/google-calendar/connection        (?deleteEvents=true|false)
        - GET    /api/me/google-calendar/calendars         (Google から fetch、保存しない)
        - GET    /api/rooms/:id/google-calendar-syncs
        - POST   /api/rooms/:id/google-calendar-syncs
        - PATCH  /api/rooms/:id/google-calendar-syncs/:syncId
        - DELETE /api/rooms/:id/google-calendar-syncs/:syncId
        - POST   /api/rooms/:id/google-calendar-syncs/:syncId/run  (手動同期)
        - POST   /api/me/google-calendar/sync-all                  (連携中 sync を全 run、手動 + cron 共通)
     (D) Backend services:
        - apps/api/src/services/googleCalendar.service.ts        (新規、Google API call wrapper)
        - apps/api/src/services/googleCalendarSync.service.ts    (新規、Connection / Sync の CRUD + run)
        - apps/api/src/services/googleAccessToken.service.ts     (新規、auth.api.getAccessToken wrapper)
     (E) Backend lib:
        - apps/api/src/lib/googleApi.ts                          (新規、fetch wrapper + 410/401 ハンドリング)
        - apps/api/src/lib/googleCalendarMapping.ts              (新規、Google event → RoomEvent 変換)
     (F) cron script:
        - apps/api/scripts/sync-google-calendars.ts              (新規、tsx run、Coolify scheduled task)
     (G) auth.ts 改修:
        - socialProviders.google に accessType: "offline" / prompt: "consent" を追加
        - scope は base 維持 (sign-in に Calendar を要求しない)
     (H) Frontend 新規 component:
        - GoogleCalendarSection (アカウントメニュー内 section、AvatarMenu から開く)
        - GoogleCalendarConnectSheet (連携 / 連携解除モーダル)
        - GoogleCalendarSelectorSheet (Google カレンダー一覧 multi-select)
        - RoomGoogleSyncSection (ルーム⚙設定モーダル内 section)
     (I) Frontend 改修 component:
        - AvatarMenu (「Google Calendar 連携」MenuButton を追加)
        - RoomSettingsSheet (「Google Cal から同期」section を追加)
        - SettingsCalendar route (アカウントメニュー → settings/calendar に Google section を併設)
     (J) Frontend 新規 hook:
        - useGoogleConnection
        - useGoogleCalendars  (= Google 側 fetch、enabled = connection あり)
        - useGoogleSyncs(roomId)
        - useLinkGoogleCalendar (authClient.linkSocial wrapper)
        - useUnlinkGoogleCalendar
        - useCreateGoogleSync / useUpdateGoogleSync / useDeleteGoogleSync / useRunGoogleSync
     (K) Frontend 新規 auth-client.ts:
        - apps/web/src/lib/authClient.ts (現在は app に存在しない可能性あり)
        - better-auth/client React 用 SDK でインスタンス化、linkSocial / signIn / signOut を export
     (L) Touri 作業手順:
        - Google Cloud Console での Calendar scope 追加 (sensitive scope verification 申請は除外)
        - Test users 追加 (MVP)
        - Coolify scheduled task 設定 (cron 0 * * * *)
```

### 依存関係グラフ

```
Prisma schema migration
    └─ shared/schemas/google.ts (新規 DTO)
    └─ shared/schemas/room.ts (RoomEventDto に 3 field 追加、Google 由来判定用)
            └─ apps/api/src/services/googleAccessToken.service.ts
            └─ apps/api/src/lib/googleApi.ts
                    └─ apps/api/src/services/googleCalendar.service.ts (calendarList / events.list)
                            └─ apps/api/src/services/googleCalendarSync.service.ts (Connection / Sync CRUD + run)
                                    └─ apps/api/src/routes/me.ts (+ google-calendar/*)
                                    └─ apps/api/src/routes/rooms.ts (+ google-calendar-syncs/*)
                                    └─ apps/api/scripts/sync-google-calendars.ts

apps/web/src/lib/authClient.ts (新規 / better-auth client)
    └─ apps/web/src/api/hooks/useGoogleCalendar*.ts
            └─ apps/web/src/components/avatar/AvatarMenu.tsx (改修)
            └─ apps/web/src/components/avatar/GoogleCalendarSection.tsx (新)
            └─ apps/web/src/components/avatar/GoogleCalendarConnectSheet.tsx (新)
            └─ apps/web/src/components/avatar/GoogleCalendarSelectorSheet.tsx (新)
            └─ apps/web/src/components/rooms/RoomSettingsSheet.tsx (改修 - GoogleSyncSection 追加)
            └─ apps/web/src/components/rooms/RoomGoogleSyncSection.tsx (新)
            └─ apps/web/src/routes/SettingsCalendar.tsx (改修、Google Section 表示)
```

---

## §2 データモデル (Prisma schema delta)

### 2.1 GoogleCalendarConnection (新)

ユーザー単位で 1 個。`Account` row (better-auth) と 1:1 紐づくが、Atender 固有メタを持つ独立 model。

```prisma
model GoogleCalendarConnection {
  id            String              @id @default(cuid())
  userId        String
  user          User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  accountId     String              // better-auth Account.id (FK)
  account       Account             @relation(fields: [accountId], references: [id], onDelete: Cascade)
  googleEmail   String              // Google アカウントの email (UI 表示用、Account には保存されていないため別途取得して保存)
  scope         String              // 保存時点で許可済 scope の space-separated string (例: "openid email profile https://www.googleapis.com/auth/calendar.readonly")
  status        GoogleConnStatus    @default(ACTIVE)
  lastError     String?
  lastSyncedAt  DateTime?           // すべての sync を回したうち最新の lastSyncedAt
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  syncs         GoogleCalendarSync[]

  @@unique([userId])              // 1 ユーザー = 1 connection (MVP)
  @@unique([accountId])
  @@index([status])
}

enum GoogleConnStatus {
  ACTIVE          // 同期可能
  REVOKED         // refresh_token revoked、再 linkSocial 必要
  ERROR           // 一時的エラー (Google 5xx 等)、次回 cron で復旧試行
}
```

理由: better-auth Account には access/refresh token / scope 等の OAuth 必要情報があるが、Atender 側で「最後の同期成功時刻」「scope を計算するためにユーザーが UI で見るための同期表示用 scope 情報」「REVOKED の表示」を持ちたい。Account row を直接読まずに GoogleCalendarConnection 経由でやり取りする。

`@@unique([userId])`: MVP は 1 ユーザー 1 Google アカウント。複数アカウントは Phase 2 以降。`@@unique([accountId])`: 1 Account に 1 Connection。

### 2.2 GoogleCalendarSync (新)

ルーム × Google カレンダーの中間テーブル。

```prisma
model GoogleCalendarSync {
  id                   String                   @id @default(cuid())
  connectionId         String
  connection           GoogleCalendarConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  roomId               String
  room                 Room                     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  googleCalendarId     String                   // 例: "primary" / "abc...@group.calendar.google.com"
  calendarSummary      String                   // 取り込み時の Google カレンダー表示名 (UI 用)
  calendarTimeZone     String                   // 例: "Asia/Tokyo"
  visibilityMode       EventVisibility          @default(TITLE_MAPPED)
  syncToken            String?                  // 初回 sync 前は null、以降 incremental token
  status               GoogleSyncStatus         @default(IDLE)
  lastError            String?
  lastSyncedAt         DateTime?
  enabled              Boolean                  @default(true)
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt

  events               RoomEvent[]              @relation("RoomEventGoogleSync")

  @@unique([roomId, connectionId, googleCalendarId])
  @@index([connectionId, enabled])
  @@index([roomId])
  @@index([status, lastSyncedAt])
}

enum GoogleSyncStatus {
  IDLE         // 待機中
  SYNCING      // 同期中 (mutex 兼用)
  OK           // 直近 sync 成功
  FAILED       // 直近 sync 失敗 (lastError あり)
  REVOKED      // connection が REVOKED 化したことに連動
}
```

- `@@unique([roomId, connectionId, googleCalendarId])`: 同一 (ルーム, 接続, カレンダー) の重複防止。同じ Google カレンダーを同じルームに 2 度設定不可。
- `@@index([connectionId, enabled])`: cron で「全 enabled sync を回す」クエリ高速化。
- `@@index([status, lastSyncedAt])`: cron が「最後の同期が古い順に」回すためのインデックス。

### 2.3 RoomEvent に 3 column 追加

```prisma
model RoomEvent {
  // ===== v7 までの既存 =====
  id          String   @id @default(cuid())
  // ... (省略、v7 と同じ)
  rawTitle             String?
  recurrenceRule       String?
  exDates              String?
  rDates               String?
  source               RoomEventSource @default(MANUAL)
  externalUid          String?
  externalSeq          Int?
  externalLastModified DateTime?
  importId             String?
  import               IcsImport?      @relation(fields: [importId], references: [id], onDelete: SetNull)
  visibilityMode       EventVisibility @default(NORMAL)

  // ===== v8 新規 =====
  googleSyncId          String?
  googleSync            GoogleCalendarSync? @relation("RoomEventGoogleSync", fields: [googleSyncId], references: [id], onDelete: SetNull)
  googleEventId         String?            // events.list の id (= instance id)
  googleRecurringEventId String?            // 親イベント id (singleEvents=true で展開された場合のみ set)

  overrides RoomEventOverride[]

  @@index([roomId, start])
  @@index([authorId])
  @@unique([roomId, externalUid])
  @@unique([googleSyncId, googleEventId])  // ★ v8 新規 dedup key
  @@index([googleSyncId])
}
```

設計判断:
- `googleSyncId` の onDelete = `SetNull` (Sync を「予定残す」で削除した時、孤立 RoomEvent として残す)。Cascade も検討したが「予定削除する」option は service 層で明示的に delete するため、SetNull の方が「残す」を素直に表現できる。
- `@@unique([googleSyncId, googleEventId])` は SQLite で **NULL を含む複合 unique** が許容される (Prisma 仕様)。googleSyncId が null の行 (= MANUAL / ICS) は複数 row が googleEventId=null でも competing しない。
- `recurrenceRule` は **常に null** (Google 由来は singleEvents=true 展開済の instance を 1 行ずつ格納)。Atender 側でもう一度展開はしない。
- `externalUid` (v7 用) は **Google 由来 RoomEvent には set しない**。`@@unique([roomId, externalUid])` も null 同士は競合しないので問題なし。

### 2.4 User / Account / Room リレーション追加

```prisma
model User {
  // ... 既存 ...
  googleCalendarConnection GoogleCalendarConnection?   // 1:1 (MVP)
}

model Account {
  // ... 既存 ...
  googleCalendarConnection GoogleCalendarConnection?   // 1:1
}

model Room {
  // ... 既存 ...
  googleCalendarSyncs GoogleCalendarSync[]
}
```

### 2.5 Migration (SQLite)

ファイル: `apps/api/prisma/migrations/20260528090000_v8_google_calendar_oauth/migration.sql`

```sql
-- v8: Google Calendar OAuth incremental sync

-- 1. GoogleCalendarConnection
CREATE TABLE "GoogleCalendarConnection" (
  "id"           TEXT     NOT NULL PRIMARY KEY,
  "userId"       TEXT     NOT NULL,
  "accountId"    TEXT     NOT NULL,
  "googleEmail"  TEXT     NOT NULL,
  "scope"        TEXT     NOT NULL,
  "status"       TEXT     NOT NULL DEFAULT 'ACTIVE',
  "lastError"    TEXT,
  "lastSyncedAt" DATETIME,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    DATETIME NOT NULL,
  CONSTRAINT "GoogleCalendarConnection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoogleCalendarConnection_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoogleCalendarConnection_userId_key"   ON "GoogleCalendarConnection"("userId");
CREATE UNIQUE INDEX "GoogleCalendarConnection_accountId_key" ON "GoogleCalendarConnection"("accountId");
CREATE INDEX        "GoogleCalendarConnection_status_idx"    ON "GoogleCalendarConnection"("status");

-- 2. GoogleCalendarSync
CREATE TABLE "GoogleCalendarSync" (
  "id"               TEXT     NOT NULL PRIMARY KEY,
  "connectionId"     TEXT     NOT NULL,
  "roomId"           TEXT     NOT NULL,
  "googleCalendarId" TEXT     NOT NULL,
  "calendarSummary"  TEXT     NOT NULL,
  "calendarTimeZone" TEXT     NOT NULL,
  "visibilityMode"   TEXT     NOT NULL DEFAULT 'TITLE_MAPPED',
  "syncToken"        TEXT,
  "status"           TEXT     NOT NULL DEFAULT 'IDLE',
  "lastError"        TEXT,
  "lastSyncedAt"     DATETIME,
  "enabled"          BOOLEAN  NOT NULL DEFAULT true,
  "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        DATETIME NOT NULL,
  CONSTRAINT "GoogleCalendarSync_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "GoogleCalendarConnection" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoogleCalendarSync_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoogleCalendarSync_room_conn_cal_key"
  ON "GoogleCalendarSync"("roomId", "connectionId", "googleCalendarId");
CREATE INDEX        "GoogleCalendarSync_connection_enabled_idx"
  ON "GoogleCalendarSync"("connectionId", "enabled");
CREATE INDEX        "GoogleCalendarSync_roomId_idx" ON "GoogleCalendarSync"("roomId");
CREATE INDEX        "GoogleCalendarSync_status_lastSyncedAt_idx" ON "GoogleCalendarSync"("status", "lastSyncedAt");

-- 3. RoomEvent に 3 column 追加
-- SQLite では ALTER ADD COLUMN ... REFERENCES が制限される。
-- Prisma は table recreation で対処する想定。Developer は prisma migrate dev 生成 SQL を確認し、
-- 既存 row が壊れないこと (default null) を必ずチェックすること。
ALTER TABLE "RoomEvent" ADD COLUMN "googleSyncId"          TEXT;
ALTER TABLE "RoomEvent" ADD COLUMN "googleEventId"         TEXT;
ALTER TABLE "RoomEvent" ADD COLUMN "googleRecurringEventId" TEXT;

CREATE UNIQUE INDEX "RoomEvent_googleSyncId_googleEventId_key"
  ON "RoomEvent"("googleSyncId", "googleEventId");
CREATE INDEX        "RoomEvent_googleSyncId_idx"
  ON "RoomEvent"("googleSyncId");

-- googleSyncId FK は table recreation で Prisma が自動付与する想定 (SQLite では ALTER ADD ... REFERENCES 不可)
```

#### SQLite migration 注意 (Developer 確認事項)

1. SQLite では既存テーブルに `REFERENCES ... ON DELETE SetNull` を ALTER で追加できない。Prisma は **table recreation** モードで RoomEvent を作り直す。`prisma migrate dev --name v8_google_calendar_oauth` 実行時に生成された SQL を確認し、recreation が走っていて既存 row が全部保存されることを確認。
2. enum は SQLite 上 TEXT。`GoogleConnStatus` / `GoogleSyncStatus` の値範囲は zod / TS で integrity 担保。
3. 既存データの保護: `RoomEvent.googleSyncId` は default null。既存 MANUAL / ICS_FILE / ICS_URL の row は全て googleSyncId = null になり、`@@unique([googleSyncId, googleEventId])` でも競合しない (両方 null の行同士は SQLite では unique 違反にならない、Prisma 仕様準拠)。
4. v8 migration を本番に流す前に `.env.test` の DATABASE_URL でリハーサル必須 (Architect 指示)。

---

## §3 better-auth 設定変更 (auth.ts)

### 3.1 socialProviders.google に offline / consent を追加

ファイル: `apps/api/src/auth.ts`

差分:

```ts
socialProviders: {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    // v8 追加 ↓
    accessType: "offline",
    prompt: "consent",
    // scope は base のみ。Calendar scope は linkSocial で incremental に取得する
  },
},
```

**scope に Calendar を追加しない理由**: sign-in 時 (Atender アカウントを作るだけのユーザー) に Calendar 権限要求を見せると離脱率が上がる。「ルームに Google Calendar を繋ぐ」操作の文脈で初めて consent を求めるのが UX 上正しい。

`accessType: "offline"` / `prompt: "consent"`: refresh_token を確実に発行させるため。これがないと再認可時に refresh_token が空になり、cron での auto-refresh が失敗する。

### 3.2 better-auth client SDK の追加

ファイル: `apps/web/src/lib/authClient.ts` (新規)

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8787",
});
```

依存追加: `apps/web/package.json` の `dependencies` に `"better-auth": "1.6.11"` を追加 (server と同 version)。

理由: linkSocial / signIn / signOut の Web 側呼び出しは better-auth client SDK 経由が正規ルート。現状 Atender Web は素の `fetch` で `/api/auth/sign-out` を呼んでいるが、`linkSocial` は client SDK の方が型/エラー/cookie ハンドリングが整う。**既存の signOut / signIn / verify 経路は触らない** (auth-client は new 用途専用)。

### 3.3 better-auth Account row に email を保存する仕組み

問題: better-auth の Account model には userId / accessToken / refreshToken / scope はあるが、**Google アカウントの email を保持する column が標準では無い**。`GoogleCalendarConnection.googleEmail` を埋めるためには、linkSocial 完了 callback 後に Atender 側で `https://www.googleapis.com/oauth2/v3/userinfo` を 1 回叩いて email を取得し、Connection を作成する。

実装方針:
- linkSocial callbackURL `/settings/integrations/google?linked=1` に Web が戻った時、フロントが `POST /api/me/google-calendar/link/complete` を叩く
- Backend がそのユーザーの Account (providerId="google") の最新 accessToken を `auth.api.getAccessToken` で取得
- userinfo endpoint で email を取得
- `GoogleCalendarConnection` を upsert (`unique(userId)`)

これによりユーザーの手作業なしで Connection が作成され、UI 上に「連携済の Google アカウント: xxx@example.com」と表示できる。

---

## §4 Google API 呼び出し層

### 4.1 `apps/api/src/lib/googleApi.ts` (新規)

低レベル fetch wrapper。token / status エラーをハンドリングする。

```ts
import { AppError } from "./appError";

const BASE = "https://www.googleapis.com";

export class GoogleAuthError extends Error {
  constructor(public reason: "FAILED_TO_GET_ACCESS_TOKEN" | "TOKEN_INVALID" | "INVALID_GRANT", message: string) {
    super(message);
  }
}

export class GoogleSyncTokenInvalidError extends Error {}

export class GoogleApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Google API ${status}: ${body.slice(0, 500)}`);
  }
}

export async function googleFetchJson<T = unknown>(args: {
  accessToken: string;
  url: string;          // 絶対 URL (https://www.googleapis.com/...)
  method?: "GET" | "POST" | "DELETE";
}): Promise<T> {
  const res = await fetch(args.url, {
    method: args.method ?? "GET",
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });
  if (res.status === 401) {
    // access_token が refresh されてすぐの 401 は invalid_grant 相当の可能性
    throw new GoogleAuthError("TOKEN_INVALID", "Token rejected after refresh");
  }
  if (res.status === 410) {
    throw new GoogleSyncTokenInvalidError("syncToken expired or invalid");
  }
  if (!res.ok) {
    throw new GoogleApiError(res.status, await res.text().catch(() => ""));
  }
  return res.json() as Promise<T>;
}

export function buildUrl(path: string, query: Record<string, string | number | undefined>): string {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}
```

理由: Google API のエラー条件 (401 token / 410 syncToken / その他 4xx) を呼び出し側で type で区別したい。`GoogleAuthError` は再認可 (= REVOKED 化) 判定に、`GoogleSyncTokenInvalidError` は full re-sync 判定に使う。

### 4.2 `apps/api/src/services/googleAccessToken.service.ts` (新規)

better-auth の `auth.api.getAccessToken` を呼ぶ wrapper。session cookie 文脈と cron 文脈を統一インタフェースで扱う。

```ts
import { APIError } from "better-auth/api";
import { auth } from "../auth";
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { GoogleAuthError } from "../lib/googleApi";

/**
 * userId 直渡しで Google access token を取得する (cron 文脈、session cookie 不要)。
 * 内部で better-auth が refresh_token を使って自動 refresh する。
 *
 * v8 不確定事項 #1: better-auth 1.6.11 が cron 文脈 (= headers なし) で
 * userId 直渡しを受け付けるかを実装中検証。
 * - 受け付ける場合: そのまま使う
 * - 受け付けない場合: 下記 fallback で dummy session を構築
 *
 * fallback: 内部で prisma 経由で Account row を読み、refreshAccessToken を直接呼ぶ。
 *           better-auth が提供しない場合、Google OAuth2 token endpoint を直接 fetch する。
 */
export async function getGoogleAccessTokenByUserId(userId: string): Promise<string> {
  try {
    // primary path
    const result = await auth.api.getAccessToken({
      body: { providerId: "google", userId },
    });
    if (!result?.accessToken) {
      throw new GoogleAuthError("FAILED_TO_GET_ACCESS_TOKEN", "Empty access token from better-auth");
    }
    return result.accessToken;
  } catch (e) {
    if (e instanceof APIError) {
      const code = (e.body as { code?: string } | undefined)?.code;
      if (code === "FAILED_TO_GET_ACCESS_TOKEN" || code === "INVALID_GRANT") {
        // refresh_token revoked → Connection を REVOKED 化
        await markConnectionRevoked(userId, code);
        throw new GoogleAuthError(code, code);
      }
    }
    // fallback path (better-auth が cron 文脈で動かない場合)
    // - 直接 prisma 経由で Account を読み、refresh_token を取得
    // - Google token endpoint に POST して新 access_token を取得
    // - DB を update (better-auth の format で書き戻し)
    return refreshGoogleTokenManually(userId);
  }
}

/**
 * API ハンドラ文脈 (session cookie あり) では headers 経由でセッションを better-auth に渡せる。
 */
export async function getGoogleAccessTokenWithHeaders(headers: Headers): Promise<string> {
  try {
    const result = await auth.api.getAccessToken({
      body: { providerId: "google" },
      headers,
    });
    if (!result?.accessToken) throw new GoogleAuthError("FAILED_TO_GET_ACCESS_TOKEN", "Empty");
    return result.accessToken;
  } catch (e) {
    if (e instanceof APIError) {
      const code = (e.body as { code?: string } | undefined)?.code;
      if (code === "FAILED_TO_GET_ACCESS_TOKEN" || code === "INVALID_GRANT") {
        throw new AppError(401, "GOOGLE_REVOKED", "Google reconnection required");
      }
    }
    throw e;
  }
}

async function markConnectionRevoked(userId: string, reason: string) {
  await prisma.googleCalendarConnection.updateMany({
    where: { userId },
    data: { status: "REVOKED", lastError: reason },
  });
  await prisma.googleCalendarSync.updateMany({
    where: { connection: { userId } },
    data: { status: "REVOKED" },
  });
}

/**
 * fallback: better-auth が cron 文脈で動かない場合に直接 Google token endpoint を叩く。
 * 不確定事項 #1 が "動かない" 判定の場合のみ使用。
 */
async function refreshGoogleTokenManually(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "google" },
  });
  if (!account?.refreshToken) {
    await markConnectionRevoked(userId, "no_refresh_token");
    throw new GoogleAuthError("FAILED_TO_GET_ACCESS_TOKEN", "No refresh_token");
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("invalid_grant")) {
      await markConnectionRevoked(userId, "invalid_grant");
      throw new GoogleAuthError("INVALID_GRANT", "Refresh token revoked");
    }
    throw new GoogleAuthError("FAILED_TO_GET_ACCESS_TOKEN", text);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  await prisma.account.update({
    where: { id: account.id },
    data: {
      accessToken: data.access_token,
      accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      ...(data.scope ? { scope: data.scope } : {}),
    },
  });
  return data.access_token;
}
```

#### 不確定事項 #1 の実装中検証手順 (Developer 必読)

実装中に以下を順に確認:

1. `auth.api.getAccessToken({ body: { providerId: "google", userId }, headers: undefined })` を試す
2. APIError が throw された場合、`e.body?.code` の値を `console.error` で記録 (FAILED_TO_GET_ACCESS_TOKEN / INVALID_GRANT / その他)
3. 動かない場合は `refreshGoogleTokenManually` 経路に倒す
4. 動く場合は fallback path を未到達のまま残しておく (将来 better-auth 仕様変更時の保険)

検証スクリプト案: `apps/api/scripts/verify-getAccessToken.ts` を作って手動実行できる形で確認。

### 4.3 `apps/api/src/services/googleCalendar.service.ts` (新規)

calendarList / events.list の wrapper。

```ts
import { buildUrl, googleFetchJson } from "../lib/googleApi";

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  timeZone: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  primary?: boolean;
  selected?: boolean;
  backgroundColor?: string;
};

export type GoogleEvent = {
  id: string;
  iCalUID?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  updated?: string;
  visibility?: "default" | "public" | "private" | "confidential";
};

export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarListItem[]> {
  const items: GoogleCalendarListItem[] = [];
  let pageToken: string | undefined;
  do {
    const data = await googleFetchJson<{ items?: GoogleCalendarListItem[]; nextPageToken?: string }>({
      accessToken,
      url: buildUrl("/calendar/v3/users/me/calendarList", { pageToken, maxResults: 250 }),
    });
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

export type EventsListResult = {
  events: GoogleEvent[];
  nextSyncToken: string | null;
};

export async function listGoogleEvents(args: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  timeMin?: Date;      // syncToken なしの時のみ
  timeMax?: Date;
}): Promise<EventsListResult> {
  const allEvents: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const query: Record<string, string | number | undefined> = {
      maxResults: 2500,
      pageToken,
    };
    if (args.syncToken) {
      query.syncToken = args.syncToken;
    } else {
      query.singleEvents = "true";
      query.orderBy = "startTime";
      if (args.timeMin) query.timeMin = args.timeMin.toISOString();
      if (args.timeMax) query.timeMax = args.timeMax.toISOString();
    }

    const data = await googleFetchJson<{
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>({
      accessToken: args.accessToken,
      url: buildUrl(`/calendar/v3/calendars/${encodeURIComponent(args.calendarId)}/events`, query),
    });
    allEvents.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { events: allEvents, nextSyncToken };
}

export type GoogleUserInfo = {
  email: string;
  email_verified: boolean;
  name?: string;
};

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  return googleFetchJson<GoogleUserInfo>({
    accessToken,
    url: "https://www.googleapis.com/oauth2/v3/userinfo",
  });
}
```

### 4.4 Google event → RoomEvent 変換: `apps/api/src/lib/googleCalendarMapping.ts` (新規)

```ts
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezonePlugin from "dayjs/plugin/timezone";
import { applyTitleRules, ensureDefaultRule } from "../services/icsTitleRule.service";
import { prisma } from "../db";
import type { GoogleEvent } from "../services/googleCalendar.service";

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

const FALLBACK_TZ = "Asia/Tokyo";

export type MappedGoogleEvent = {
  googleEventId: string;
  googleRecurringEventId: string | null;
  rawTitle: string;
  mappedTitle: string;
  visibilityMode: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  startUtc: Date;
  endUtc: Date;
  isAllDay: boolean;
  status: "confirmed" | "tentative" | "cancelled";
};

/**
 * Google event 1 個を RoomEvent 保存形式にマッピングする。
 * - syncDefaultVisibility = GoogleCalendarSync.visibilityMode (UI で選んだもの)
 *   と user 単位の IcsTitleRule を**組み合わせ**て決定する
 * - title rule が hit したらそちらが優先 (rule.visibilityMode)、hit しなければ syncDefaultVisibility
 */
export async function mapGoogleEvent(args: {
  event: GoogleEvent;
  userId: string;
  syncDefaultVisibility: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  calendarTimeZone: string;
}): Promise<MappedGoogleEvent | null> {
  const ev = args.event;
  if (!ev.id) return null;

  const status = ev.status ?? "confirmed";
  // cancelled は呼び元で削除扱いするためここでも mapped を返す (start/end は推定)
  const rawTitle = ev.summary ?? "(タイトルなし)";

  await ensureDefaultRule(args.userId);
  const rules = await prisma.icsTitleRule.findMany({
    where: { userId: args.userId },
    orderBy: { priority: "asc" },
  });
  const applied = applyTitleRules(rawTitle, rules);

  // visibility: rule が hit したら rule の visibilityMode、しなかったら sync の default
  const visibilityMode = applied.ruleId != null ? applied.visibilityMode : args.syncDefaultVisibility;

  // 時刻処理
  const { startUtc, endUtc, isAllDay } = resolveDates(ev, args.calendarTimeZone);

  return {
    googleEventId: ev.id,
    googleRecurringEventId: ev.recurringEventId ?? null,
    rawTitle,
    mappedTitle: applied.title,
    visibilityMode,
    startUtc,
    endUtc,
    isAllDay,
    status,
  };
}

function resolveDates(ev: GoogleEvent, calendarTz: string): { startUtc: Date; endUtc: Date; isAllDay: boolean } {
  const tz = calendarTz || FALLBACK_TZ;

  if (ev.start?.date) {
    // all-day: start.date = "2026-06-01" (calendarTz の壁時計 00:00 として扱う)
    const start = dayjs.tz(ev.start.date + " 00:00:00", tz).utc().toDate();
    const endStr = ev.end?.date ?? ev.start.date;
    // Google all-day の end.date は exclusive (翌日)。1ms 差で内包させる
    const end = dayjs.tz(endStr + " 00:00:00", tz).subtract(1, "millisecond").utc().toDate();
    return { startUtc: start, endUtc: end, isAllDay: true };
  }

  if (ev.start?.dateTime) {
    // timed: dateTime は ISO 8601 with offset、UTC 化はそのまま new Date() で OK
    const start = new Date(ev.start.dateTime);
    const end = ev.end?.dateTime ? new Date(ev.end.dateTime) : new Date(start.getTime() + 60 * 60 * 1000);
    return { startUtc: start, endUtc: end, isAllDay: false };
  }

  // Floating (start.date も dateTime も無いケース) — calendarTz で 00:00 として扱う
  const fallback = dayjs.tz(new Date(), tz).utc().toDate();
  return { startUtc: fallback, endUtc: new Date(fallback.getTime() + 60 * 60 * 1000), isAllDay: false };
}
```

---

## §5 同期サービス層

### 5.1 `apps/api/src/services/googleCalendarSync.service.ts` (新規)

Connection / Sync の CRUD と「sync 実行 (= events.list 呼んで RoomEvent upsert)」を担当。

```ts
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { GoogleAuthError, GoogleApiError, GoogleSyncTokenInvalidError } from "../lib/googleApi";
import {
  fetchGoogleUserInfo, listGoogleCalendars, listGoogleEvents,
  type GoogleEvent,
} from "./googleCalendar.service";
import { getGoogleAccessTokenByUserId, getGoogleAccessTokenWithHeaders } from "./googleAccessToken.service";
import { mapGoogleEvent } from "../lib/googleCalendarMapping";

const DEFAULT_INITIAL_RANGE_MONTHS = 6;
const SYNC_MAX_DURATION_MS = 10 * 60 * 1000;  // 1 sync = 10 分以内に終わるべし

/**
 * linkSocial callback 完了後に呼ばれる。
 * 1. Account row (providerId="google") から最新 access_token 取得
 * 2. userinfo で email 取得
 * 3. GoogleCalendarConnection を upsert
 */
export async function completeGoogleLink(args: { userId: string; headers: Headers }) {
  const accessToken = await getGoogleAccessTokenWithHeaders(args.headers);
  const userInfo = await fetchGoogleUserInfo(accessToken);

  const account = await prisma.account.findFirst({
    where: { userId: args.userId, providerId: "google" },
  });
  if (!account) throw new AppError(409, "GOOGLE_ACCOUNT_NOT_FOUND", "Google account not linked");
  const scope = account.scope ?? "";
  if (!scope.includes("https://www.googleapis.com/auth/calendar.readonly")) {
    throw new AppError(409, "CALENDAR_SCOPE_MISSING", "Calendar scope not granted");
  }

  return prisma.googleCalendarConnection.upsert({
    where: { userId: args.userId },
    create: {
      userId: args.userId,
      accountId: account.id,
      googleEmail: userInfo.email,
      scope,
      status: "ACTIVE",
    },
    update: {
      accountId: account.id,
      googleEmail: userInfo.email,
      scope,
      status: "ACTIVE",
      lastError: null,
    },
  });
}

export async function getConnection(userId: string) {
  return prisma.googleCalendarConnection.findUnique({
    where: { userId },
  });
}

/**
 * 連携解除。deleteEvents=true で同期由来 RoomEvent を全削除。
 */
export async function unlinkGoogle(args: { userId: string; deleteEvents: boolean }) {
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { userId: args.userId },
    include: { syncs: true },
  });
  if (!conn) return { ok: true, deletedEvents: 0 };

  let deletedEvents = 0;
  if (args.deleteEvents) {
    const syncIds = conn.syncs.map(s => s.id);
    if (syncIds.length > 0) {
      const r = await prisma.roomEvent.deleteMany({
        where: { googleSyncId: { in: syncIds } },
      });
      deletedEvents = r.count;
    }
  }
  // Sync を消すと cascade で RoomEvent.googleSyncId が SetNull になる (events 残す側)
  // ただし events 残す場合でも、source は GOOGLE_OAUTH のまま (孤立 import 同等)
  await prisma.googleCalendarSync.deleteMany({ where: { connectionId: conn.id } });
  await prisma.googleCalendarConnection.delete({ where: { id: conn.id } });

  // 注: better-auth Account の Google row はそのまま残す (signIn 経路維持のため)。
  //     ユーザーが Google でログインしているなら、認可されている scope は Calendar 抜きの base のみ
  //     に戻すことは Google 側コンソール (myaccount.google.com/permissions) でユーザーが行う想定。
  return { ok: true, deletedEvents };
}

/**
 * Connection 経由で Google から calendarList を fetch。保存はしない。
 */
export async function listAvailableCalendars(args: { userId: string; headers?: Headers }) {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: args.userId } });
  if (!conn) throw new AppError(404, "NOT_CONNECTED", "Google not connected");
  if (conn.status !== "ACTIVE") throw new AppError(409, "CONNECTION_INACTIVE", `Connection status: ${conn.status}`);

  const token = args.headers
    ? await getGoogleAccessTokenWithHeaders(args.headers)
    : await getGoogleAccessTokenByUserId(args.userId);
  return listGoogleCalendars(token);
}

export async function createSync(args: {
  userId: string;
  roomId: string;
  googleCalendarId: string;
  visibilityMode: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  headers?: Headers;
}) {
  await assertRoomMember(args.roomId, args.userId);
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: args.userId } });
  if (!conn) throw new AppError(404, "NOT_CONNECTED", "Google not connected");

  // 重複チェック
  const existing = await prisma.googleCalendarSync.findUnique({
    where: { roomId_connectionId_googleCalendarId: {
      roomId: args.roomId, connectionId: conn.id, googleCalendarId: args.googleCalendarId,
    }},
  });
  if (existing) throw new AppError(409, "ALREADY_SYNCED", "This calendar is already synced to this room");

  // Google からカレンダーメタ取得 (summary / timeZone)
  const token = args.headers
    ? await getGoogleAccessTokenWithHeaders(args.headers)
    : await getGoogleAccessTokenByUserId(args.userId);
  const cals = await listGoogleCalendars(token);
  const cal = cals.find(c => c.id === args.googleCalendarId);
  if (!cal) throw new AppError(404, "CALENDAR_NOT_FOUND", "Google calendar not found on account");

  const sync = await prisma.googleCalendarSync.create({
    data: {
      connectionId: conn.id,
      roomId: args.roomId,
      googleCalendarId: cal.id,
      calendarSummary: cal.summary,
      calendarTimeZone: cal.timeZone,
      visibilityMode: args.visibilityMode,
      status: "IDLE",
      enabled: true,
    },
  });

  // 初回同期を即実行 (失敗しても sync 行は残し、status=FAILED にする)
  await runSync({ syncId: sync.id, userId: args.userId, headers: args.headers });
  return prisma.googleCalendarSync.findUniqueOrThrow({ where: { id: sync.id } });
}

export async function updateSync(args: {
  userId: string;
  roomId: string;
  syncId: string;
  patch: { visibilityMode?: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY"; enabled?: boolean };
}) {
  const sync = await prisma.googleCalendarSync.findUnique({
    where: { id: args.syncId },
    include: { connection: true },
  });
  if (!sync || sync.roomId !== args.roomId) throw new AppError(404, "NOT_FOUND", "Sync not found");
  if (sync.connection.userId !== args.userId) throw new AppError(403, "FORBIDDEN", "Not owner of sync");

  return prisma.googleCalendarSync.update({
    where: { id: args.syncId },
    data: {
      ...(args.patch.visibilityMode !== undefined ? { visibilityMode: args.patch.visibilityMode } : {}),
      ...(args.patch.enabled !== undefined ? { enabled: args.patch.enabled } : {}),
    },
  });
}

export async function deleteSync(args: {
  userId: string;
  roomId: string;
  syncId: string;
  deleteEvents: boolean;
}) {
  const sync = await prisma.googleCalendarSync.findUnique({
    where: { id: args.syncId },
    include: { connection: true },
  });
  if (!sync || sync.roomId !== args.roomId) throw new AppError(404, "NOT_FOUND", "Sync not found");
  if (sync.connection.userId !== args.userId) throw new AppError(403, "FORBIDDEN", "Not owner of sync");

  if (args.deleteEvents) {
    await prisma.roomEvent.deleteMany({ where: { googleSyncId: args.syncId } });
  }
  await prisma.googleCalendarSync.delete({ where: { id: args.syncId } });
  return { ok: true };
}

export async function listSyncs(userId: string, roomId: string) {
  await assertRoomMember(roomId, userId);
  return prisma.googleCalendarSync.findMany({
    where: { roomId, connection: { userId } },
    orderBy: { createdAt: "desc" },
  });
}

async function assertRoomMember(roomId: string, userId: string) {
  const m = await prisma.roomMembership.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!m) throw new AppError(403, "NOT_MEMBER", "Room member only");
}

/**
 * 1 sync の同期実行 (mutex 兼用 status=SYNCING)。
 * - syncToken あり → incremental
 * - syncToken なし or 410 GONE → full re-sync
 */
export async function runSync(args: { syncId: string; userId?: string; headers?: Headers }) {
  // mutex: 既に SYNCING の sync は skip
  const sync0 = await prisma.googleCalendarSync.findUnique({ where: { id: args.syncId } });
  if (!sync0) throw new AppError(404, "NOT_FOUND", "Sync not found");
  if (!sync0.enabled) return { ok: true, skipped: "DISABLED" as const };
  if (sync0.status === "SYNCING") return { ok: true, skipped: "ALREADY_SYNCING" as const };

  const connection = await prisma.googleCalendarConnection.findUniqueOrThrow({
    where: { id: sync0.connectionId },
  });
  if (connection.status !== "ACTIVE") return { ok: false, skipped: "CONN_INACTIVE" as const };
  const userId = args.userId ?? connection.userId;

  await prisma.googleCalendarSync.update({
    where: { id: args.syncId },
    data: { status: "SYNCING", lastError: null },
  });

  const startedAt = Date.now();
  try {
    const token = args.headers
      ? await getGoogleAccessTokenWithHeaders(args.headers)
      : await getGoogleAccessTokenByUserId(userId);

    let useSyncToken = sync0.syncToken;
    let result;
    try {
      result = await listGoogleEvents({
        accessToken: token,
        calendarId: sync0.googleCalendarId,
        syncToken: useSyncToken,
        timeMin: useSyncToken ? undefined : new Date(),
        timeMax: useSyncToken ? undefined : addMonths(new Date(), DEFAULT_INITIAL_RANGE_MONTHS),
      });
    } catch (e) {
      if (e instanceof GoogleSyncTokenInvalidError) {
        // 410 → full re-sync
        await prisma.roomEvent.deleteMany({ where: { googleSyncId: args.syncId } });
        await prisma.googleCalendarSync.update({
          where: { id: args.syncId },
          data: { syncToken: null },
        });
        useSyncToken = null;
        result = await listGoogleEvents({
          accessToken: token,
          calendarId: sync0.googleCalendarId,
          timeMin: new Date(),
          timeMax: addMonths(new Date(), DEFAULT_INITIAL_RANGE_MONTHS),
        });
      } else {
        throw e;
      }
    }

    // upsert / delete
    let upserted = 0;
    let deleted = 0;
    for (const ev of result.events) {
      if (Date.now() - startedAt > SYNC_MAX_DURATION_MS) {
        throw new Error("Sync exceeded max duration (10 min)");
      }
      const mapped = await mapGoogleEvent({
        event: ev,
        userId,
        syncDefaultVisibility: sync0.visibilityMode,
        calendarTimeZone: sync0.calendarTimeZone,
      });
      if (!mapped) continue;

      if (mapped.status === "cancelled") {
        const r = await prisma.roomEvent.deleteMany({
          where: { googleSyncId: args.syncId, googleEventId: mapped.googleEventId },
        });
        deleted += r.count;
        continue;
      }

      await prisma.roomEvent.upsert({
        where: { googleSyncId_googleEventId: { googleSyncId: args.syncId, googleEventId: mapped.googleEventId } },
        create: {
          roomId: sync0.roomId,
          authorId: userId,
          title: mapped.mappedTitle,
          rawTitle: mapped.rawTitle,
          description: null,           // DESCRIPTION は破棄 (プライバシー)
          start: mapped.startUtc,
          end: mapped.endUtc,
          isAllDay: mapped.isAllDay,
          color: null,
          source: "GOOGLE_OAUTH",
          visibilityMode: mapped.visibilityMode,
          googleSyncId: args.syncId,
          googleEventId: mapped.googleEventId,
          googleRecurringEventId: mapped.googleRecurringEventId,
        },
        update: {
          title: mapped.mappedTitle,
          rawTitle: mapped.rawTitle,
          start: mapped.startUtc,
          end: mapped.endUtc,
          isAllDay: mapped.isAllDay,
          visibilityMode: mapped.visibilityMode,
          googleRecurringEventId: mapped.googleRecurringEventId,
        },
      });
      upserted++;
    }

    await prisma.googleCalendarSync.update({
      where: { id: args.syncId },
      data: {
        syncToken: result.nextSyncToken,
        lastSyncedAt: new Date(),
        status: "OK",
        lastError: null,
      },
    });
    await prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });

    return { ok: true, upserted, deleted };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const status = e instanceof GoogleAuthError ? "REVOKED" : "FAILED";
    await prisma.googleCalendarSync.update({
      where: { id: args.syncId },
      data: { status, lastError: reason.slice(0, 1000) },
    });
    if (e instanceof GoogleAuthError) {
      await prisma.googleCalendarConnection.update({
        where: { id: connection.id },
        data: { status: "REVOKED", lastError: reason.slice(0, 500) },
      });
    }
    return { ok: false, error: reason };
  }
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setMonth(r.getMonth() + n);
  return r;
}

/** cron / sync-all 用: ユーザーの全 enabled sync を順次走らせる */
export async function runAllSyncsForUser(userId: string) {
  const syncs = await prisma.googleCalendarSync.findMany({
    where: { connection: { userId }, enabled: true, status: { not: "SYNCING" } },
    orderBy: { lastSyncedAt: "asc" },          // 古い順
  });
  const results: Array<{ syncId: string; ok: boolean; error?: string }> = [];
  for (const s of syncs) {
    const r = await runSync({ syncId: s.id, userId });
    results.push({ syncId: s.id, ok: r.ok, ...(("error" in r) ? { error: r.error } : {}) });
  }
  return { results, count: syncs.length };
}

/** cron 用: 全 ACTIVE Connection を loop */
export async function runAllSyncsGlobal() {
  const connections = await prisma.googleCalendarConnection.findMany({
    where: { status: "ACTIVE" },
    select: { userId: true },
  });
  let total = 0;
  for (const c of connections) {
    const r = await runAllSyncsForUser(c.userId);
    total += r.count;
  }
  return { totalSyncs: total, userCount: connections.length };
}
```

#### 設計の要点

- **mutex は `status=SYNCING` で**: 同一 sync を並行に走らせない。cron 中 + 手動同期重複も防ぐ。`runSync` 先頭で `SYNCING` の sync は skip return。
- **upsert key は `(googleSyncId, googleEventId)`**: Google が返す instance id をそのまま使う。recurring イベントの個別 instance も独立 id を持つので衝突しない。
- **DESCRIPTION / LOCATION / ATTENDEE は保存しない**: v7 と同じプライバシー方針。`description: null` でハードコード。
- **cancelled は deleteMany**: 差分 sync で `status=cancelled` の event は対応 RoomEvent を削除する。
- **10 分タイムアウト**: 1 sync が pathological に長引いた場合の安全弁。

### 5.2 cron スクリプト: `apps/api/scripts/sync-google-calendars.ts` (新規)

```ts
#!/usr/bin/env tsx
import "../src/env";  // env load
import { runAllSyncsGlobal } from "../src/services/googleCalendarSync.service";

async function main() {
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[cron] sync-google-calendars start at ${new Date().toISOString()}`);
  try {
    const r = await runAllSyncsGlobal();
    // eslint-disable-next-line no-console
    console.log(`[cron] sync-google-calendars done: users=${r.userCount}, syncs=${r.totalSyncs}, durationMs=${Date.now() - startedAt}`);
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[cron] sync-google-calendars FAILED:`, e);
    process.exit(1);
  }
}

void main();
```

実行: `pnpm --filter @atender/api exec tsx scripts/sync-google-calendars.ts`

Coolify scheduled task (UI で設定):
- Cron: `0 * * * *` (毎時 0 分)
- Container: atender-api
- Command: `pnpm --filter @atender/api exec tsx scripts/sync-google-calendars.ts`

---

## §6 API endpoint 詳細

すべて Hono ルート。既存パターン (`sessionMiddleware` + `setupGuard` + `zValidator`) を継続。

### 6.1 `apps/api/src/routes/me.ts` (拡張)

```ts
import {
  completeGoogleLink,
  getConnection,
  unlinkGoogle,
  listAvailableCalendars,
  runAllSyncsForUser,
} from "../services/googleCalendarSync.service";

// ===== Google Calendar Connection =====

app.get("/api/me/google-calendar/connection", sessionMiddleware, setupGuard, async (c) => {
  const conn = await getConnection(c.get("user").id);
  return c.json({ connection: conn ? dtoConnection(conn) : null });
});

// linkSocial の callback 後に呼ばれる完了 endpoint
const LinkCompleteBody = z.object({}).strict();
app.post("/api/me/google-calendar/link/complete", sessionMiddleware, setupGuard,
  zValidator("json", LinkCompleteBody),
  async (c) => {
    const conn = await completeGoogleLink({ userId: c.get("user").id, headers: c.req.raw.headers });
    return c.json({ connection: dtoConnection(conn) }, 201);
  });

const UnlinkQuery = z.object({ deleteEvents: z.enum(["true", "false"]).default("true") });
app.delete("/api/me/google-calendar/connection", sessionMiddleware, setupGuard,
  zValidator("query", UnlinkQuery),
  async (c) => {
    const r = await unlinkGoogle({
      userId: c.get("user").id,
      deleteEvents: c.req.valid("query").deleteEvents === "true",
    });
    return c.json(r);
  });

app.get("/api/me/google-calendar/calendars", sessionMiddleware, setupGuard, async (c) => {
  const calendars = await listAvailableCalendars({
    userId: c.get("user").id,
    headers: c.req.raw.headers,
  });
  return c.json({ calendars: calendars.map(dtoListedCalendar) });
});

app.post("/api/me/google-calendar/sync-all", sessionMiddleware, setupGuard, async (c) => {
  const r = await runAllSyncsForUser(c.get("user").id);
  return c.json(r);
});

function dtoConnection(conn: { id: string; googleEmail: string; scope: string; status: string; lastError: string | null; lastSyncedAt: Date | null; createdAt: Date }) {
  return {
    id: conn.id,
    googleEmail: conn.googleEmail,
    scope: conn.scope,
    status: conn.status,
    lastError: conn.lastError,
    lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
    createdAt: conn.createdAt.toISOString(),
  };
}

function dtoListedCalendar(c: { id: string; summary: string; timeZone: string; accessRole: string; primary?: boolean; backgroundColor?: string }) {
  return {
    id: c.id,
    summary: c.summary,
    timeZone: c.timeZone,
    accessRole: c.accessRole,
    primary: c.primary ?? false,
    backgroundColor: c.backgroundColor ?? null,
  };
}
```

### 6.2 `apps/api/src/routes/rooms.ts` (拡張)

```ts
import {
  listSyncs, createSync, updateSync, deleteSync, runSync,
} from "../services/googleCalendarSync.service";

const SyncParam = z.object({ id: z.string(), syncId: z.string() });
const CreateSyncBody = z.object({
  googleCalendarId: z.string().min(1).max(500),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).default("TITLE_MAPPED"),
});
const PatchSyncBody = z.object({
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).optional(),
  enabled: z.boolean().optional(),
});
const DeleteSyncQuery = z.object({ deleteEvents: z.enum(["true", "false"]).default("true") });

app.get("/api/rooms/:id/google-calendar-syncs", sessionMiddleware, setupGuard,
  zValidator("param", IdParam),
  async (c) => {
    const syncs = await listSyncs(c.get("user").id, c.req.valid("param").id);
    return c.json({ syncs: syncs.map(dtoSync) });
  });

app.post("/api/rooms/:id/google-calendar-syncs", sessionMiddleware, setupGuard,
  zValidator("param", IdParam),
  zValidator("json", CreateSyncBody),
  async (c) => {
    const sync = await createSync({
      userId: c.get("user").id,
      roomId: c.req.valid("param").id,
      googleCalendarId: c.req.valid("json").googleCalendarId,
      visibilityMode: c.req.valid("json").visibilityMode,
      headers: c.req.raw.headers,
    });
    return c.json({ sync: dtoSync(sync) }, 201);
  });

app.patch("/api/rooms/:id/google-calendar-syncs/:syncId", sessionMiddleware, setupGuard,
  zValidator("param", SyncParam),
  zValidator("json", PatchSyncBody),
  async (c) => {
    const sync = await updateSync({
      userId: c.get("user").id,
      roomId: c.req.valid("param").id,
      syncId: c.req.valid("param").syncId,
      patch: c.req.valid("json"),
    });
    return c.json({ sync: dtoSync(sync) });
  });

app.delete("/api/rooms/:id/google-calendar-syncs/:syncId", sessionMiddleware, setupGuard,
  zValidator("param", SyncParam),
  zValidator("query", DeleteSyncQuery),
  async (c) => {
    const r = await deleteSync({
      userId: c.get("user").id,
      roomId: c.req.valid("param").id,
      syncId: c.req.valid("param").syncId,
      deleteEvents: c.req.valid("query").deleteEvents === "true",
    });
    return c.json(r);
  });

app.post("/api/rooms/:id/google-calendar-syncs/:syncId/run", sessionMiddleware, setupGuard,
  zValidator("param", SyncParam),
  async (c) => {
    const r = await runSync({
      syncId: c.req.valid("param").syncId,
      userId: c.get("user").id,
      headers: c.req.raw.headers,
    });
    return c.json(r);
  });

function dtoSync(s: {
  id: string; googleCalendarId: string; calendarSummary: string; calendarTimeZone: string;
  visibilityMode: string; syncToken: string | null; status: string; lastError: string | null;
  lastSyncedAt: Date | null; enabled: boolean; createdAt: Date;
}) {
  return {
    id: s.id,
    googleCalendarId: s.googleCalendarId,
    calendarSummary: s.calendarSummary,
    calendarTimeZone: s.calendarTimeZone,
    visibilityMode: s.visibilityMode,
    status: s.status,
    lastError: s.lastError,
    lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
    enabled: s.enabled,
    createdAt: s.createdAt.toISOString(),
    hasSyncToken: s.syncToken != null,  // 内部 token 値は API 経由で出さない
  };
}
```

### 6.3 shared schema: `packages/shared/src/schemas/google.ts` (新規)

```ts
import { z } from "zod";

export const GoogleCalendarConnectionDto = z.object({
  id: z.string(),
  googleEmail: z.string(),
  scope: z.string(),
  status: z.enum(["ACTIVE", "REVOKED", "ERROR"]),
  lastError: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const GoogleListedCalendarDto = z.object({
  id: z.string(),
  summary: z.string(),
  timeZone: z.string(),
  accessRole: z.enum(["owner", "writer", "reader", "freeBusyReader"]),
  primary: z.boolean(),
  backgroundColor: z.string().nullable(),
});

export const GoogleCalendarSyncDto = z.object({
  id: z.string(),
  googleCalendarId: z.string(),
  calendarSummary: z.string(),
  calendarTimeZone: z.string(),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]),
  status: z.enum(["IDLE", "SYNCING", "OK", "FAILED", "REVOKED"]),
  lastError: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  hasSyncToken: z.boolean(),
});

export const CreateGoogleSyncInput = z.object({
  googleCalendarId: z.string().min(1).max(500),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).default("TITLE_MAPPED"),
});

export const UpdateGoogleSyncInput = z.object({
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).optional(),
  enabled: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "at least one field required" });

export type GoogleCalendarConnectionDto = z.infer<typeof GoogleCalendarConnectionDto>;
export type GoogleListedCalendarDto = z.infer<typeof GoogleListedCalendarDto>;
export type GoogleCalendarSyncDto = z.infer<typeof GoogleCalendarSyncDto>;
export type CreateGoogleSyncInput = z.infer<typeof CreateGoogleSyncInput>;
export type UpdateGoogleSyncInput = z.infer<typeof UpdateGoogleSyncInput>;
```

`packages/shared/src/index.ts` から `export * from "./schemas/google"` を追加。

### 6.4 API レスポンス例

#### GET /api/me/google-calendar/connection

未連携:
```json
{ "connection": null }
```

連携済:
```json
{
  "connection": {
    "id": "clx...",
    "googleEmail": "touri@example.com",
    "scope": "openid email profile https://www.googleapis.com/auth/calendar.readonly",
    "status": "ACTIVE",
    "lastError": null,
    "lastSyncedAt": "2026-05-28T08:00:00.000Z",
    "createdAt": "2026-05-28T07:00:00.000Z"
  }
}
```

#### POST /api/me/google-calendar/link/complete

成功 (201):
```json
{
  "connection": { /* 上記同形 */ }
}
```

失敗例 (409):
```json
{ "error": { "code": "CALENDAR_SCOPE_MISSING", "message": "Calendar scope not granted" } }
```

#### DELETE /api/me/google-calendar/connection?deleteEvents=true

```json
{ "ok": true, "deletedEvents": 124 }
```

#### GET /api/me/google-calendar/calendars

```json
{
  "calendars": [
    {
      "id": "primary",
      "summary": "Touri Aida",
      "timeZone": "Asia/Tokyo",
      "accessRole": "owner",
      "primary": true,
      "backgroundColor": "#9fe1e7"
    },
    {
      "id": "ja.japanese#holiday@group.v.calendar.google.com",
      "summary": "祝日",
      "timeZone": "UTC",
      "accessRole": "reader",
      "primary": false,
      "backgroundColor": null
    }
  ]
}
```

#### POST /api/rooms/:id/google-calendar-syncs

リクエスト:
```json
{ "googleCalendarId": "primary", "visibilityMode": "TITLE_MAPPED" }
```

レスポンス (201):
```json
{
  "sync": {
    "id": "clx...",
    "googleCalendarId": "primary",
    "calendarSummary": "Touri Aida",
    "calendarTimeZone": "Asia/Tokyo",
    "visibilityMode": "TITLE_MAPPED",
    "status": "OK",
    "lastError": null,
    "lastSyncedAt": "2026-05-28T08:30:00.000Z",
    "enabled": true,
    "createdAt": "2026-05-28T08:30:00.000Z",
    "hasSyncToken": true
  }
}
```

#### POST /api/rooms/:id/google-calendar-syncs/:syncId/run

```json
{ "ok": true, "upserted": 12, "deleted": 1 }
```

エラー時:
```json
{ "ok": false, "error": "Token rejected after refresh" }
```

ステータスコード自体は 200 (sync は記録された)。`ok=false` で UI が判断する。

---

## §7 UI / UX 設計

### 7.1 アカウントメニュー (AvatarMenu)

既存 `AvatarMenu.tsx` の MenuButton 列に「Google Calendar」を追加。

```
┌─ AvatarMenu (右上アバター) ──────────┐
│ Touri Aida                            │
│ touri1705@outlook.com                 │
│ ────────────────────────────────────  │
│  プロフィール                  >       │
│  学校・学科                    >       │
│  出欠ルール                    >       │
│  学期管理                      >       │
│  カレンダー設定                >       │
│  Google Calendar 連携          >  ★ NEW │
│ ────────────────────────────────────  │
│  出席率を見る                  >       │
│ ────────────────────────────────────  │
│  ライト / ダーク / システム            │
│ ────────────────────────────────────  │
│  ログアウト                            │
└──────────────────────────────────────┘
```

クリックで `GoogleCalendarSection` を表示 (BottomSheet モバイル / Dialog PC、既存 `BottomSheet` パターン継続)。

### 7.2 GoogleCalendarSection (新)

ファイル: `apps/web/src/components/avatar/GoogleCalendarSection.tsx`

未連携状態:
```
┌─ Google Calendar 連携 ────────────────┐
│                                       │
│  📅                                   │
│  Google Calendar を連携すると、       │
│  ルームに自分の予定を                  │
│  「内容を伏せた状態で」共有できます。  │
│                                       │
│  読み取り専用です。                    │
│  Atender から Google Calendar に      │
│  予定を追加することはありません。      │
│                                       │
│   [Google Calendar と連携する]   ★    │
│                                       │
│  ※連携には Google アカウントへの       │
│   認可が必要です                       │
└───────────────────────────────────────┘
```

連携済:
```
┌─ Google Calendar 連携 ────────────────┐
│  ✓ 連携中                              │
│  touri@example.com                    │
│  最後の同期: 5 分前                    │
│                                       │
│  ┌─ どこに反映しますか? ─────────────┐│
│  │ Atender ではルームごとに「どの     ││
│  │ Google カレンダーをどう見せるか」 ││
│  │ を選びます。                       ││
│  │ → ルーム⚙設定 → Google 同期       ││
│  └────────────────────────────────────┘│
│                                       │
│  [すべてのルームを今すぐ同期]   ↻      │
│                                       │
│  ────────────────────────────────────  │
│  [連携を解除する]            (危険)    │
└───────────────────────────────────────┘
```

REVOKED 状態:
```
┌─ Google Calendar 連携 ────────────────┐
│  ⚠ 認可が無効になりました              │
│  Google アカウント側で連携を解除した   │
│  か、長期間アクセスがありませんでした。│
│                                       │
│   [もう一度連携する]                   │
└───────────────────────────────────────┘
```

#### 連携ボタンのフロー

```ts
async function onConnect() {
  await authClient.linkSocial({
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    callbackURL: `${APP_URL}/settings/integrations/google?linked=1`,
  });
  // linkSocial 内部で Google authorization URL に redirect
  // callback 後、Web は SettingsCalendar route に戻り、useEffect で `linked=1` を検出
}
```

`SettingsCalendar.tsx` の改修:
```ts
useEffect(() => {
  const url = new URL(window.location.href);
  if (url.searchParams.get("linked") === "1") {
    void api("/api/me/google-calendar/link/complete", { method: "POST", body: {} })
      .then(() => queryClient.invalidateQueries({ queryKey: QK.googleConnection() }));
    url.searchParams.delete("linked");
    window.history.replaceState(null, "", url.toString());
  }
}, []);
```

### 7.3 連携解除モーダル (GoogleCalendarConnectSheet)

```
┌─ Google Calendar の連携を解除 ────────┐
│                                       │
│  本当に解除しますか?                   │
│  解除すると以降の同期が止まります。    │
│                                       │
│  ─ 取り込んだ予定の扱い ─              │
│  ◉ 取り込んだ予定も削除する  (推奨)    │
│  ○ ルームに残す                        │
│                                       │
│  「残す」を選ぶと、解除後も予定が表示  │
│  されますが Google 側の変更は反映      │
│  されません。プライバシー上、不要なら  │
│  「削除する」をお勧めします。          │
│                                       │
│  [キャンセル]      [解除する]   (危険) │
└───────────────────────────────────────┘
```

実装:
```ts
async function onUnlink(deleteEvents: boolean) {
  await api("/api/me/google-calendar/connection", {
    method: "DELETE",
    query: { deleteEvents: deleteEvents ? "true" : "false" },
  });
  queryClient.invalidateQueries({ queryKey: QK.googleConnection() });
  queryClient.invalidateQueries({ queryKey: QK.rooms() });   // 全 room の events 再 fetch
}
```

### 7.4 GoogleCalendarSelectorSheet (新)

ルーム⚙設定の「Google Cal から同期を追加」ボタンで開く。

```
┌─ どのカレンダーを同期しますか? ────────┐
│  ルーム: "サークル"                    │
│                                       │
│  ┌─ あなたの Google カレンダー ─────┐ │
│  │ ◉ Touri Aida (primary)          │ │
│  │ ○ TUS スケジュール                │ │
│  │ ○ 祝日 (祝日 cal、推奨除外)       │ │
│  └─────────────────────────────────┘ │
│                                       │
│  ─ 表示モード ─                       │
│  ◉ タイトルを伏せる (推奨)             │
│      "デート" → "予定" 等              │
│  ○ そのまま表示                        │
│  ○ 「予定あり」のみ                    │
│      時間枠だけ見せる、タイトル無し    │
│                                       │
│  [キャンセル]            [追加する]    │
└───────────────────────────────────────┘
```

#### コンポーネント構成

```ts
type Props = {
  open: boolean;
  onClose: () => void;
  roomId: string;
};

export function GoogleCalendarSelectorSheet({ open, onClose, roomId }: Props) {
  const conn = useGoogleConnection();
  const calendars = useGoogleCalendars();
  const existingSyncs = useGoogleSyncs(roomId);
  const createSync = useCreateGoogleSync(roomId);
  const [selected, setSelected] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY">("TITLE_MAPPED");

  // 既に同期中の cal は disable
  const alreadySyncedIds = new Set((existingSyncs.data?.syncs ?? []).map(s => s.googleCalendarId));
  // ...
}
```

### 7.5 RoomGoogleSyncSection (新)

ルーム⚙設定モーダル内の section。

```
┌─ Google Calendar から同期 ────────────┐
│                                       │
│  ┌─ 同期中 ──────────────────────────┐│
│  │ Touri Aida (primary)              ││
│  │ タイトル正規化 ↻ 5 分前  [⋮]      ││
│  │ ────                              ││
│  │ TUS スケジュール                  ││
│  │ そのまま表示 ↻ 1 時間前 [⋮]       ││
│  └────────────────────────────────────┘│
│                                       │
│  [+ カレンダーを追加]                  │
│                                       │
│  ※連携自体はアカウントメニューから    │
└───────────────────────────────────────┘
```

[⋮] メニュー:
- 「今すぐ同期する」 → `POST /api/rooms/:id/google-calendar-syncs/:syncId/run`
- 「表示モードを変更」 → modal、`PATCH /api/rooms/:id/google-calendar-syncs/:syncId` (visibilityMode)
- 「一時停止 / 再開」 → `PATCH .../{:syncId}` (enabled toggle)
- 「このカレンダーを切断」 → confirm modal (2 択 = 予定残す / 削除)、`DELETE .../{:syncId}?deleteEvents=true|false`

未連携時表示:
```
┌─ Google Calendar から同期 ────────────┐
│  まず Google アカウントを連携してね。  │
│  [連携設定を開く]                      │
└───────────────────────────────────────┘
```

クリックで `AvatarMenu` の `GoogleCalendarSection` を開く (router で `/settings/integrations/google` に navigate)。

### 7.6 ルームの週/月 view 上での表示

既存 v7 の `RoomCalendar` / `RoomTimetable` は `source` enum を見て表示制御している:

| source | 表示 | 縦線 | アイコン |
|---|---|---|---|
| MANUAL | author 色 | 中 (2px) | (なし) |
| ICS_FILE / ICS_URL | グレー | 細点線 | 🔗 |
| GOOGLE_OAUTH | 薄ブルー | 細点線 | 📅 (新) |

`apps/web/src/lib/calendarLane.ts` に source 別色定義があれば、そこに GOOGLE_OAUTH を追加。

### 7.7 状態管理 (where state lives)

- **Connection 状態**: `useGoogleConnection()` → TanStack Query (`QK.googleConnection`)。AvatarMenu / RoomGoogleSyncSection / SettingsCalendar の全てが同じ key を購読。
- **Google カレンダー一覧 (Google 側 fetch)**: `useGoogleCalendars()` → `enabled = connection.status === "ACTIVE"`。`staleTime: 5 分`。
- **Sync 一覧 (ルーム単位)**: `useGoogleSyncs(roomId)` → `QK.googleSyncs(roomId)`。
- **同期実行状態**: mutation の `isPending` を UI が見る (個別 sync ごとに `runMutation` を独立 hook)。

### 7.8 query key と invalidation matrix

`apps/web/src/api/queryKeys.ts` に追加:

```ts
googleConnection: () => ["me", "google-calendar", "connection"] as const,
googleCalendars: () => ["me", "google-calendar", "calendars"] as const,
googleSyncs: (roomId: string) => ["rooms", roomId, "google-calendar-syncs"] as const,
```

| Mutation | 必須 invalidate queryKey |
|---|---|
| `linkSocial` (callback 完了 後の `POST /link/complete`) | `googleConnection()`, `googleCalendars()` |
| `DELETE /api/me/google-calendar/connection` | `googleConnection()`, `googleCalendars()`, **全 `rooms`** (room x sync 全削除), 全 `roomWeek` |
| `POST /api/me/google-calendar/sync-all` | 全 `roomWeek`, 全 `roomEvents`, `googleConnection()` (lastSyncedAt 更新) |
| `POST /api/rooms/:id/google-calendar-syncs` | `googleSyncs(roomId)`, `roomWeek(roomId, *)`, `roomEvents(roomId, *)`, `googleConnection()` |
| `PATCH /api/rooms/:id/google-calendar-syncs/:syncId` | `googleSyncs(roomId)`, `roomWeek(roomId, *)` (visibility 変更時) |
| `DELETE /api/rooms/:id/google-calendar-syncs/:syncId` | `googleSyncs(roomId)`, `roomWeek(roomId, *)`, `roomEvents(roomId, *)` |
| `POST /api/rooms/:id/google-calendar-syncs/:syncId/run` | `googleSyncs(roomId)`, `roomWeek(roomId, *)`, `roomEvents(roomId, *)` |

`roomWeek(roomId, *)` は `queryClient.invalidateQueries({ queryKey: ["rooms", roomId] })` で配下全 invalidate する。`refetchActive: true` (default) で十分。

### 7.9 useGoogleCalendar フック (新)

ファイル: `apps/web/src/api/hooks/useGoogleCalendar.ts` (新規、複数 hook を 1 ファイルに集約)

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GoogleCalendarConnectionDto, GoogleCalendarSyncDto, GoogleListedCalendarDto,
  CreateGoogleSyncInput, UpdateGoogleSyncInput,
} from "@atender/shared";
import { authClient } from "@/lib/authClient";
import { api, APP_URL } from "@/api/client";
import { QK } from "@/api/queryKeys";

export function useGoogleConnection() {
  return useQuery({
    queryKey: QK.googleConnection(),
    queryFn: () => api<{ connection: GoogleCalendarConnectionDto | null }>("/api/me/google-calendar/connection"),
  });
}

export function useGoogleCalendars() {
  const conn = useGoogleConnection();
  return useQuery({
    queryKey: QK.googleCalendars(),
    queryFn: () => api<{ calendars: GoogleListedCalendarDto[] }>("/api/me/google-calendar/calendars"),
    enabled: conn.data?.connection?.status === "ACTIVE",
    staleTime: 5 * 60 * 1000,
  });
}

export function useGoogleSyncs(roomId?: string) {
  return useQuery({
    queryKey: QK.googleSyncs(roomId ?? ""),
    queryFn: () => api<{ syncs: GoogleCalendarSyncDto[] }>(`/api/rooms/${roomId}/google-calendar-syncs`),
    enabled: Boolean(roomId),
  });
}

export function useLinkGoogleCalendar() {
  return useMutation({
    mutationFn: async () => {
      await authClient.linkSocial({
        provider: "google",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        callbackURL: `${APP_URL}/settings/integrations/google?linked=1`,
      });
    },
  });
}

export function useCompleteGoogleLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ connection: GoogleCalendarConnectionDto }>("/api/me/google-calendar/link/complete", {
      method: "POST",
      body: {},
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.googleConnection() });
      qc.invalidateQueries({ queryKey: QK.googleCalendars() });
    },
  });
}

export function useUnlinkGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { deleteEvents: boolean }) =>
      api<{ ok: boolean; deletedEvents: number }>("/api/me/google-calendar/connection", {
        method: "DELETE",
        query: { deleteEvents: args.deleteEvents ? "true" : "false" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.googleConnection() });
      qc.invalidateQueries({ queryKey: QK.googleCalendars() });
      qc.invalidateQueries({ queryKey: QK.rooms() });
    },
  });
}

export function useCreateGoogleSync(roomId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoogleSyncInput) =>
      api<{ sync: GoogleCalendarSyncDto }>(`/api/rooms/${roomId}/google-calendar-syncs`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      if (!roomId) return;
      qc.invalidateQueries({ queryKey: QK.googleSyncs(roomId) });
      qc.invalidateQueries({ queryKey: ["rooms", roomId] });
    },
  });
}

export function useUpdateGoogleSync(roomId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { syncId: string; input: UpdateGoogleSyncInput }) =>
      api<{ sync: GoogleCalendarSyncDto }>(`/api/rooms/${roomId}/google-calendar-syncs/${args.syncId}`, {
        method: "PATCH",
        body: args.input,
      }),
    onSuccess: () => {
      if (!roomId) return;
      qc.invalidateQueries({ queryKey: QK.googleSyncs(roomId) });
      qc.invalidateQueries({ queryKey: ["rooms", roomId] });
    },
  });
}

export function useDeleteGoogleSync(roomId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { syncId: string; deleteEvents: boolean }) =>
      api<{ ok: boolean }>(`/api/rooms/${roomId}/google-calendar-syncs/${args.syncId}`, {
        method: "DELETE",
        query: { deleteEvents: args.deleteEvents ? "true" : "false" },
      }),
    onSuccess: () => {
      if (!roomId) return;
      qc.invalidateQueries({ queryKey: QK.googleSyncs(roomId) });
      qc.invalidateQueries({ queryKey: ["rooms", roomId] });
    },
  });
}

export function useRunGoogleSync(roomId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (syncId: string) =>
      api<{ ok: boolean; upserted?: number; deleted?: number; error?: string }>(
        `/api/rooms/${roomId}/google-calendar-syncs/${syncId}/run`,
        { method: "POST", body: {} },
      ),
    onSuccess: () => {
      if (!roomId) return;
      qc.invalidateQueries({ queryKey: QK.googleSyncs(roomId) });
      qc.invalidateQueries({ queryKey: ["rooms", roomId] });
    },
  });
}

export function useRunAllGoogleSyncs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ count: number; results: Array<{ syncId: string; ok: boolean; error?: string }> }>(
      "/api/me/google-calendar/sync-all",
      { method: "POST", body: {} },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.googleConnection() });
      // 全 rooms invalidate
      qc.invalidateQueries({ queryKey: QK.rooms() });
    },
  });
}
```

### 7.10 Touri の Google Cloud Console 準備手順 (Touri 自身が事前に作業)

設計 doc としてここに明文化しておく (Developer に「Touri がやることリスト」を伝える):

1. **Google Cloud Console** (`https://console.cloud.google.com/`) で既存 Atender プロジェクトを開く
2. **API & Services → Library** → "Google Calendar API" を有効化
3. **API & Services → OAuth consent screen**:
   - App type: External
   - User type: Testing (本 MVP では testing で 100 ユーザー上限のまま運用)
   - **Scopes** で `https://www.googleapis.com/auth/calendar.readonly` を追加
     - 警告: sensitive scope 区分。Testing なら審査不要、Production にする時に審査が必要
   - **Test users** に Touri 自身と最初の検証協力者を追加 (上限 100)
4. **API & Services → Credentials**:
   - 既存の OAuth 2.0 Client ID (Web) を編集
   - "Authorized redirect URIs" に下記が含まれていることを確認:
     - `https://atender-api.appily.run/api/auth/callback/google` (prod)
     - `http://localhost:8787/api/auth/callback/google` (dev)
5. **環境変数の確認** (既存の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` をそのまま使う、追加なし)
6. **Coolify scheduled task の追加**:
   - app uuid: `tq2lgr4eh6t80r3tkqjbpu7o` (atender-api)
   - cron: `0 * * * *`
   - command: `pnpm --filter @atender/api exec tsx scripts/sync-google-calendars.ts`

---

## §8 挙動仕様 (Reviewer 向け、テスト生成の根拠)

### 8.1 better-auth 設定

- 8.1.1: 既存ユーザーが Magic Link でログインしただけのとき、その user の Account.scope に Calendar scope が**含まれない**。
- 8.1.2: 既存ユーザーが Google Sign-In でログインしただけのとき、Account.scope は `openid email profile` のみで Calendar scope を**含まない**。
- 8.1.3: 既存ユーザーが UI から「Google Calendar 連携」を押下 → linkSocial 完了後、Account.scope に `https://www.googleapis.com/auth/calendar.readonly` が**含まれる**。
- 8.1.4: linkSocial 完了 callback で `/api/me/google-calendar/link/complete` を POST すると、ステータスは 201 で `connection.googleEmail` が Google アカウントの email と一致。
- 8.1.5: scope が calendar.readonly を含まない状態で `link/complete` を呼ぶと 409 `CALENDAR_SCOPE_MISSING`。
- 8.1.6: 同一 user が `link/complete` を 2 回呼ぶと、2 回目は upsert 動作で同じ Connection 行を更新 (新規作成しない)。`@@unique([userId])` 違反なし。

### 8.2 GoogleCalendarConnection

- 8.2.1: 未連携状態で `GET /api/me/google-calendar/connection` → 200 `{ "connection": null }`。
- 8.2.2: 連携済で `GET /api/me/google-calendar/connection` → 200 で status=ACTIVE。
- 8.2.3: refresh_token revoked 後の cron 走行で Connection.status が REVOKED に遷移、`lastError` に reason 文字列 (`invalid_grant` 等) が入る。
- 8.2.4: status=REVOKED の Connection に対して `GET /api/me/google-calendar/calendars` → 409 `CONNECTION_INACTIVE`。
- 8.2.5: `DELETE /api/me/google-calendar/connection?deleteEvents=true` で Connection 削除 + 関連 GoogleCalendarSync 削除 + `googleSyncId` を指す RoomEvent も削除。レスポンスは `{ "ok": true, "deletedEvents": <count> }`。
- 8.2.6: `DELETE /api/me/google-calendar/connection?deleteEvents=false` で Connection / Sync 削除、ただし RoomEvent は **残る** (googleSyncId = SetNull、source は GOOGLE_OAUTH のまま)。
- 8.2.7: `deleteEvents` クエリ未指定なら default = true (削除側)。
- 8.2.8: Connection が削除されると better-auth Account row は**触らない** (sign-in 経路維持)。

### 8.3 GoogleCalendarSync (room × calendar)

- 8.3.1: 未連携状態で `POST /api/rooms/:id/google-calendar-syncs` → 404 `NOT_CONNECTED`。
- 8.3.2: 連携済 + 該当カレンダーが Google にあれば 201 で sync 作成 + 初回 sync が runSync 経由で実行され status=OK / syncToken=non-null。
- 8.3.3: 同一 (roomId, calendarId) で 2 度作成 → 409 `ALREADY_SYNCED`。
- 8.3.4: 自分が member でないルームに対して `POST .../google-calendar-syncs` → 403 `NOT_MEMBER`。
- 8.3.5: 他人 (Sync.connection.userId !== request user) の sync を `PATCH/DELETE` → 403 `FORBIDDEN`。
- 8.3.6: `PATCH .../syncId` で `visibilityMode` を変更すると、次回 runSync 時の新規/更新 RoomEvent.visibilityMode に反映される (既存 RoomEvent は触らない、次回 sync 時の upsert で update される)。
- 8.3.7: `PATCH .../syncId` で `enabled: false` にすると、cron / sync-all の対象から外れる。`POST .../run` (手動) でも skip し `{ "ok": true, "skipped": "DISABLED" }`。
- 8.3.8: `DELETE .../syncId?deleteEvents=true` で sync 削除 + その sync 経由の RoomEvent 全削除。
- 8.3.9: `DELETE .../syncId?deleteEvents=false` で sync 削除、RoomEvent は googleSyncId=null で残る。
- 8.3.10: `GET /api/rooms/:id/google-calendar-syncs` → 自分の sync のみが返る (自分以外の member の sync は含めない、MVP の 1 user 1 connection 前提)。
- 8.3.11: `GET .../syncs` レスポンス DTO に `hasSyncToken: boolean` が含まれ、syncToken の値そのものは含まれない。

### 8.4 syncToken 動作 (incremental sync)

- 8.4.1: 初回 runSync (sync.syncToken === null) は `events.list?singleEvents=true&orderBy=startTime&timeMin=now&timeMax=now+6m` を fetch。
- 8.4.2: 2 回目以降 (sync.syncToken !== null) は `events.list?syncToken=...` のみで差分取得。
- 8.4.3: events.list が最終ページに `nextSyncToken` を返したら `sync.syncToken` を更新。
- 8.4.4: events.list が pageToken を返す間 ループし続け、全ページ統合して RoomEvent upsert。
- 8.4.5: events.list が 410 GONE を返したら、その sync の RoomEvent を `deleteMany` で削除、syncToken をクリア、即座に full re-sync を再実行 (`timeMin=now / timeMax=+6m`)。
- 8.4.6: events.list 中の `status: "cancelled"` event は対応 RoomEvent (googleSyncId, googleEventId) を `deleteMany`。
- 8.4.7: events.list 中の `recurringEventId` 持ち event は `googleRecurringEventId` を埋めて RoomEvent.recurrenceRule は null (singleEvents=true 由来は instance 1 行で保存)。
- 8.4.8: events.list 中の同一 `id` event の 2 回目以降の upsert で `title` / `start` / `end` が変化していたら DB が更新される。
- 8.4.9: cron 中に新規 sync が createSync された場合、その sync は次の cron tick (1 時間後) からのみ対象になる。ただし createSync 内で初回 runSync を即実行するため初期データは取れる。

### 8.5 タイトルマッピング適用 (Google → RoomEvent)

- 8.5.1: User の IcsTitleRule が空 (= default rule のみ存在) + sync.visibilityMode = TITLE_MAPPED の場合、全 Google event の title が `replaceWith ?? "予定"` に置換される。rawTitle は元の summary。
- 8.5.2: User の IcsTitleRule に `pattern="デート"` EQUALS / `replaceWith="予定"` がある場合、summary が "デート" の event のみが該当ルールで処理、他は default rule にフォールバック。
- 8.5.3: User の IcsTitleRule が hit したら、その rule.visibilityMode が sync.visibilityMode より優先される。
- 8.5.4: User の IcsTitleRule が hit しなかった場合、sync.visibilityMode がそのまま採用される。
- 8.5.5: sync.visibilityMode = NORMAL + ユーザーに rule が無い場合、event.summary が title にそのまま入る。rawTitle も同じ。
- 8.5.6: sync.visibilityMode = BUSY_ONLY の場合、`/api/rooms/:id/week` レスポンスで本人以外の viewer に対しては title="予定あり" / rawTitle=null / description=null (v7 と同じ applyVisibility)。本人 viewer は rawTitle 含めて表示される。
- 8.5.7: ensureDefaultRule は連携・同期実行のいずれかで初めて呼ばれた時に 1 度作成する (二重作成しない)。

### 8.6 タイムゾーン処理

- 8.6.1: Google event の start.dateTime = "2026-06-01T10:00:00+09:00" → RoomEvent.start (UTC) = "2026-06-01T01:00:00.000Z"。
- 8.6.2: Google event の start.dateTime = "2026-06-01T18:00:00-04:00" → RoomEvent.start (UTC) = "2026-06-01T22:00:00.000Z"。
- 8.6.3: all-day event start.date = "2026-06-01" / sync.calendarTimeZone = "Asia/Tokyo" → start UTC = "2026-05-31T15:00:00.000Z" (JST 00:00 を UTC に直したもの)。
- 8.6.4: all-day event の end.date は Google 仕様で exclusive (翌日)。RoomEvent.end は `-1ms` で内包させる (例: end.date=2026-06-02 → RoomEvent.end = 2026-06-01T14:59:59.999Z JST 23:59:59.999)。
- 8.6.5: Floating time (start.dateTime に offset なし、start.timeZone も無い) は MVP では sync.calendarTimeZone を採用、それも無ければ "Asia/Tokyo"。

### 8.7 RoomEvent との混在

- 8.7.1: 同一ルームに source=MANUAL / source=ICS_FILE / source=GOOGLE_OAUTH の RoomEvent が混在しても `GET /api/rooms/:id/week` は全部返す。
- 8.7.2: GOOGLE_OAUTH の RoomEvent は recurrenceRule=null なので `expandRoomEvents` 内では「単発 RoomEvent」として扱われ、そのまま 1 件返る。
- 8.7.3: 同一 Google event ID が同一 sync 内で 2 度返ってきても upsert で 1 行だけ残る (`@@unique([googleSyncId, googleEventId])`)。
- 8.7.4: 異なる sync (例: room A の primary cal sync, room B の primary cal sync) が同じ Google event を取り込むと、`googleSyncId` が違うので別 RoomEvent 行になる。これは仕様通り (= 2 つのルームに同じ予定を意図的に出している)。

### 8.8 cron スクリプト

- 8.8.1: `apps/api/scripts/sync-google-calendars.ts` を tsx で実行すると Connection.status=ACTIVE の全 user に対して runAllSyncsForUser を順に呼ぶ。
- 8.8.2: enabled=false の sync は cron でスキップ。`status: SYNCING` の sync も skip (mutex)。
- 8.8.3: 1 sync の runSync が 10 分超過したら `Sync exceeded max duration` で fail 状態に。
- 8.8.4: cron 中に 1 user の token refresh が失敗 (GoogleAuthError) → その user の Connection を REVOKED に、配下 syncs も REVOKED に。**他 user の同期は続行**。
- 8.8.5: runAllSyncsGlobal の戻り値が `{ totalSyncs, userCount }` で、stdout に `[cron] sync-google-calendars done: users=N, syncs=M` がログされる。
- 8.8.6: cron が異常終了 (例: DB 切断) すると exit code 1。Coolify scheduled task は記録するだけで次の cron tick で再試行。

### 8.9 認可エラー (REVOKED / TOKEN_INVALID)

- 8.9.1: runSync 中の 401 → GoogleAuthError "TOKEN_INVALID" → sync.status=REVOKED, sync.lastError="Token rejected after refresh"。
- 8.9.2: runSync 中の auth.api.getAccessToken エラー (code=FAILED_TO_GET_ACCESS_TOKEN / INVALID_GRANT) → Connection.status=REVOKED, 配下全 syncs.status=REVOKED, 各 sync.lastError に reason。
- 8.9.3: API ハンドラ文脈で `getGoogleAccessTokenWithHeaders` が失敗 → 401 `GOOGLE_REVOKED` を Hono error として返す (フロントに「再連携してね」を促す)。

### 8.10 不確定事項 #1 検証 (cron で auth.api.getAccessToken)

- 8.10.1: cron 文脈で `auth.api.getAccessToken({ body: { providerId, userId }, headers: undefined })` を呼んだ際に APIError(`USER_NOT_FOUND` / `SESSION_REQUIRED` 等) が throw された場合、`refreshGoogleTokenManually` を呼ぶ fallback が動く。
- 8.10.2: fallback `refreshGoogleTokenManually` は `oauth2.googleapis.com/token` を直接 POST、access_token を取得して Account row を update する。
- 8.10.3: fallback が `invalid_grant` を返したら Connection.status=REVOKED、`refresh_token` が無い場合 (`!account.refreshToken`) も REVOKED 化。
- 8.10.4: primary path (better-auth) が動くなら fallback は到達しない (Developer は実装中に「primary が動いたかどうか」をログに出して確認)。

### 8.11 UI 状態 (Web)

- 8.11.1: 未連携 + 未訪問: AvatarMenu の「Google Calendar 連携」をクリック → SettingsCalendar 画面 → 「Google Calendar と連携する」ボタンが表示 + クリックで authClient.linkSocial が起動。
- 8.11.2: linkSocial 後の callback `?linked=1` がついたら useEffect で `POST /link/complete` を 1 回呼ぶ。完了で `useGoogleConnection` query が invalidate されて表示が更新。
- 8.11.3: 連携済の SettingsCalendar に「すべてのルームを今すぐ同期」ボタンがあり、`POST /api/me/google-calendar/sync-all` を発火。完了で全 `rooms` query invalidate。
- 8.11.4: ルーム⚙設定モーダルに「Google Calendar から同期」section があり、`useGoogleConnection()` の data null なら「先に Google アカウントを連携してね」のメッセージ。
- 8.11.5: 連携済かつ sync 1 つ以上ありなら、sync 一覧と [+ カレンダーを追加] ボタン。
- 8.11.6: [+ カレンダーを追加] クリック → GoogleCalendarSelectorSheet が開き、`useGoogleCalendars()` を fetch して radio list 表示。
- 8.11.7: 既に同期中のカレンダーは radio で disable + 「同期中」バッジ表示。
- 8.11.8: [⋮] メニュー → 「このカレンダーを切断」→ 2 択 confirm modal (default = 削除する) → DELETE で sync 削除 + UI 更新。
- 8.11.9: ルームの週 view (`useRoomWeek`) は GOOGLE_OAUTH event を `source` で識別、薄ブルー縦線 + 📅 アイコン表示。
- 8.11.10: visibility=BUSY_ONLY の event は本人以外には title="予定あり"。本人にはタイトル正規化適用後の値 + rawTitle が AvatarMenu のリンクから後で見える (Phase 1.5 で詳細 UI 検討、v8 では rawTitle はレスポンスに含めるが UI 表示先は未実装で OK)。

### 8.12 異常系

- 8.12.1: Google API が 5xx を返すと runSync は GoogleApiError を投げ sync.status=FAILED, lastError に body 先頭 500 文字。Connection.status は変えない (一時障害扱い)。次の cron で再試行。
- 8.12.2: Google API のレート制限 (403 userRateLimitExceeded) → 同様に FAILED、次回再試行。指数バックオフは MVP 不採用。
- 8.12.3: API レスポンス JSON が malformed → GoogleApiError として扱い FAILED 化。
- 8.12.4: createSync の初回 runSync が失敗しても sync 行は残り status=FAILED で返る (UI で「同期に失敗したよ。もう一度試してね」を表示)。
- 8.12.5: 同一 sync が並行リクエストされた場合 (= UI で連打)、後発の runSync は `status=SYNCING` を見て `skipped: "ALREADY_SYNCING"` を返す。
- 8.12.6: better-auth signOut → ユーザーが再ログイン後も GoogleCalendarConnection は残る (User cascade で消えるのは User 自体を削除した時のみ)。
- 8.12.7: ユーザーが myaccount.google.com 上で Atender への認可を取り消すと、次回 token refresh で invalid_grant → Connection.status=REVOKED → UI 上で「もう一度連携する」ボタンに切り替わる (`useGoogleConnection.data.connection.status === "REVOKED"` を見る)。

### 8.13 dedup と shared schema

- 8.13.1: RoomEvent.source は MANUAL / ICS_FILE / ICS_URL / GOOGLE_OAUTH の 4 値が引き続き enum で定義済 (v7 の wishlist が v8 で実体化)。
- 8.13.2: shared/schemas/room.ts の RoomEventDto に `source` の enum 値が反映済 (v7 で済み)。v8 では追加変更不要。
- 8.13.3: shared/schemas/google.ts に GoogleCalendarConnectionDto / GoogleCalendarSyncDto / GoogleListedCalendarDto / CreateGoogleSyncInput / UpdateGoogleSyncInput が定義されている。

---

## §9 テスト基盤

### 9.1 フレームワーク (既存継続)

- API: **Vitest 2.x** + Hono `app.request()` (`apps/api/tests/`)
- Web: **Vitest 2.x** + React Testing Library + jsdom + **msw 2.x** (`apps/web/src/**/__tests__/`)
- DB: SQLite テンポラリ DB を各 test で `createTestDb` 経由でセットアップ (既存 `apps/api/tests/helpers/db.ts`)

### 9.2 主要テスト配置先

```
apps/api/tests/
├── googleCalendarConnection.test.ts       (Connection CRUD + status 遷移)
├── googleCalendarSync.test.ts             (Sync CRUD + create-room-sync-with-token)
├── googleCalendarSyncRun.test.ts          (runSync 動作、syncToken / 410 / cancelled)
├── googleCalendarMapping.test.ts          (mapGoogleEvent タイムゾーン / all-day / visibility 適用)
├── googleAccessToken.test.ts              (auth.api.getAccessToken + fallback)
├── googleCron.test.ts                     (sync-google-calendars.ts スクリプト挙動 — runAllSyncsGlobal を invoke)

apps/web/src/api/hooks/__tests__/
├── useGoogleCalendar.test.tsx             (各 hook の invalidation matrix 検証)

apps/web/src/components/avatar/__tests__/
├── GoogleCalendarSection.test.tsx         (連携 / 未連携 / REVOKED 表示分岐)

apps/web/src/components/rooms/__tests__/
├── RoomGoogleSyncSection.test.tsx         (sync list + add + delete + run flow)
```

### 9.3 Google API のテストパターン (Reviewer 必読)

Backend テストでは Google API への実 HTTP を絶対に叩かない。`globalThis.fetch` を `vi.spyOn` で差し替える:

```ts
// apps/api/tests/helpers/googleApi.mock.ts (新規)
import { vi } from "vitest";

export type FakeGoogleResponse = {
  status: number;
  body: unknown;
};

export function mockGoogleFetch(handler: (url: string, init: RequestInit) => FakeGoogleResponse | Promise<FakeGoogleResponse>) {
  const original = globalThis.fetch;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith("https://www.googleapis.com") && !url.startsWith("https://oauth2.googleapis.com")) {
      return original(input as RequestInfo, init);   // 他ホストは passthrough
    }
    const r = await handler(url, init ?? {});
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  return spy;
}
```

使用例:
```ts
it("incremental sync で syncToken を渡し nextSyncToken を保存する", async () => {
  mockGoogleFetch((url) => {
    if (url.includes("/calendar/v3/calendars/")) {
      expect(url).toContain("syncToken=prev-token");
      return {
        status: 200,
        body: {
          items: [
            { id: "g1", summary: "デート", start: { dateTime: "2026-06-01T10:00:00+09:00" }, end: { dateTime: "2026-06-01T12:00:00+09:00" } },
          ],
          nextSyncToken: "next-token",
        },
      };
    }
    return { status: 404, body: {} };
  });
  // ... seed sync with syncToken="prev-token", run runSync
});
```

### 9.4 better-auth テストパターン

`apps/api/tests/helpers/auth.ts` (既存) を流用。Session を直接 prisma で作成 + Cookie ヘッダーで叩く。

linkSocial を直接テストするのは困難 (Google にリダイレクト)。代替として:
- `link/complete` endpoint を、**事前に Account.scope に calendar.readonly を入れた状態で**叩いて Connection 作成を確認

### 9.5 主要テストパターン (Reviewer 向け snippet)

#### Connection 作成

```ts
it("link/complete で Account.scope に calendar スコープがあれば Connection 作成", async () => {
  const { userId, cookie } = await createTestUserAndSignIn();
  await prisma.account.create({
    data: {
      id: "acc-1", accountId: "google-uid", providerId: "google", userId,
      accessToken: "tok-1", refreshToken: "rt-1",
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
    },
  });
  mockGoogleFetch((url) => {
    if (url.includes("/oauth2/v3/userinfo")) {
      return { status: 200, body: { email: "test@example.com", email_verified: true } };
    }
    return { status: 404, body: {} };
  });
  const res = await app.request("/api/me/google-calendar/link/complete", {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}",
  });
  expect(res.status).toBe(201);
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  expect(conn?.googleEmail).toBe("test@example.com");
  expect(conn?.status).toBe("ACTIVE");
});
```

#### 410 → full re-sync

```ts
it("syncToken で 410 を返したら RoomEvent 削除 → 即 full re-sync", async () => {
  const { sync, userId } = await seedSyncWithToken("prev-token");
  await prisma.roomEvent.createMany({ data: [
    { /* 既存 GOOGLE_OAUTH RoomEvent... */ googleSyncId: sync.id, googleEventId: "g1", ... },
  ]});
  mockGoogleFetch((url) => {
    if (url.includes("syncToken=prev-token")) return { status: 410, body: {} };
    if (url.includes("singleEvents=true")) {
      return { status: 200, body: { items: [/* 新規 2 件 */], nextSyncToken: "new-token" } };
    }
    return { status: 404, body: {} };
  });
  const r = await runSync({ syncId: sync.id, userId });
  expect(r.ok).toBe(true);
  const after = await prisma.roomEvent.findMany({ where: { googleSyncId: sync.id } });
  expect(after.length).toBe(2);    // 旧 g1 削除、新 2 件
  const updatedSync = await prisma.googleCalendarSync.findUniqueOrThrow({ where: { id: sync.id } });
  expect(updatedSync.syncToken).toBe("new-token");
});
```

#### visibility 適用 (week response)

```ts
it("BUSY_ONLY の Google 由来 RoomEvent は他人 viewer で title='予定あり'", async () => {
  // 1 ユーザーが author の sync + 別ユーザーが viewer のテスト
  // GET /api/rooms/:id/week を viewer のセッションで叩く
  // → response の event[0].title === "予定あり" / rawTitle === null
});
```

### 9.6 cron スクリプトのテスト

`runAllSyncsGlobal` を直接 invoke し、stdout / sync 状態を assertion。実 process spawn は不要。

```ts
it("ACTIVE Connection のみ runAllSyncsForUser される", async () => {
  await seedConn({ status: "ACTIVE", userId: "u1" });
  await seedConn({ status: "REVOKED", userId: "u2" });
  const r = await runAllSyncsGlobal();
  expect(r.userCount).toBe(1);
});
```

### 9.7 Web hooks のテスト (msw)

`msw` で `/api/me/google-calendar/*` と `/api/rooms/:id/google-calendar-syncs/*` を server で intercept。React Testing Library 経由で hook の query/mutation を発火、invalidation を assertion。

```ts
it("useCreateGoogleSync 完了で QK.googleSyncs と rooms 全体を invalidate", async () => {
  server.use(http.post("/api/rooms/r1/google-calendar-syncs", () => HttpResponse.json({ sync: { /* ... */ } }, { status: 201 })));
  const { result } = renderHook(() => useCreateGoogleSync("r1"), { wrapper });
  await act(() => result.current.mutateAsync({ googleCalendarId: "primary", visibilityMode: "TITLE_MAPPED" }));
  expect(queryClient.getQueryState(QK.googleSyncs("r1"))?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["rooms", "r1"])?.isInvalidated).toBe(true);
});
```

---

## §10 不確定事項 (実装中検証)

### #1: cron 文脈で `auth.api.getAccessToken({ body: { providerId, userId }, headers: undefined })` が動くか

**懸念**: better-auth 1.6.11 source の `auth.api.getAccessToken` 実装が session cookie 必須なら、userId 直渡し path が単に reject される可能性。
**検証方法**:
1. Developer は `apps/api/scripts/verify-google-token.ts` を作る (`npx tsx scripts/verify-google-token.ts <userId>` で手動実行)
2. ステップ 1 で APIError の `code` を console 出力して挙動を確認
3. 動けば primary path のみで完結、動かなければ `refreshGoogleTokenManually` fallback がそのまま動く設計になっているので、コード変更なしで運用に乗る

**Architect の判断**: primary 失敗時の fallback (`refreshGoogleTokenManually`) を **最初から実装** しておく。これで「動くなら primary」「動かないなら fallback」のどちらでも MVP は成立する。Developer は実装後に primary が呼ばれた / fallback が呼ばれたかを 1 回の cron で確認して結果を Touri に報告。

### #2: better-auth 1.6.11 で linkSocial が既存ログイン済 user に対して動作するか

**懸念**: docs では「v1.2.7+ で動く」と書かれているが、実環境で同一 Google アカウントの場合に余計な「アカウント連携済です」エラーが出る等の挙動が未確認。
**検証方法**: Touri が手元で 1 度 Atender に Google でログイン → SettingsCalendar から linkSocial を発火 → consent screen が calendar.readonly のみ要求してくることを目視確認。
**Architect の判断**: 検証で問題が出たら `unlink` (一度 better-auth から google account を unlink して signOut → 再 signIn with calendar scope 付き) する経路を実装に追加。MVP では「linkSocial が動く前提」で進め、失敗時の手動回避手順を README にメモ。

### #3: include_granted_scopes はデフォルト ON か明示が必要か

**懸念**: better-auth が `include_granted_scopes=true` を OAuth URL に default で付けているかが docs では断言されていない。
**検証方法**: linkSocial 後に Google authorization URL を browser DevTools / network で確認、`include_granted_scopes=true` クエリの有無を見る。無ければ better-auth options で `authorizationUrlParams: { include_granted_scopes: "true" }` を追加する。
**Architect の判断**: MVP は default 信頼で進め、検証時に欠落があれば auth.ts で 1 行追加で済む。

### #4: Per-user QPS (Google Calendar API)

**懸念**: Researcher で「10 QPS/user 程度」とあるが公式数字は Cloud Console 実測。1 ユーザーが多数のカレンダー sync を持つ場合の cron スパイク注意。
**Architect の判断**: MVP では `runAllSyncsForUser` の中で sync を for-await で **直列実行** する (並列にしない)。1 user で sync N 個 = 直列 N 回の events.list。QPS スパイクが起きないので 10 QPS を超えない。Phase 2 で並列化検討。

### #5: all-day event の TZ 解釈

**懸念**: Google all-day の `start.date` は TZ なしの YYYY-MM-DD。これを calendar.timeZone (例: Asia/Tokyo) の壁時計 00:00 として解釈するのが Atender 仕様。
**Architect の判断**: §4.4 の `resolveDates` 関数で `dayjs.tz(date + " 00:00:00", tz)` 経由で扱う。dayjs-timezone plugin に依存する (既に依存にある)。Reviewer はこれを fixture で複数 TZ + 複数 date でテスト。

---

## §11 不採用案

### 11.1 Watch API webhook (push notification)

- **却下理由**: Channel expiration が events で最長 30 日、再購読 cron が必要。Coolify 1 container でも実装可能だが Webhook URL 公開・署名検証・channel 管理 table が増える。MVP の polling 1 時間で UX 上十分。
- **再検討トリガー**: ユーザーが 1000 人超 or 「Google で予定変更したら 1 分以内に Atender に反映してほしい」要望が複数

### 11.2 複数 Google アカウント (1 ユーザー × N 連携)

- **却下理由**: Connection を `userId` unique にすると schema がシンプル。複数アカウントは UI も複雑化 (連携アカウント切替 / どの sync がどのアカウント所属か明示)。MVP 範囲外。
- **再検討トリガー**: 「学校用 Google + 個人 Google を同時連携したい」要望

### 11.3 ルーム単位の OAuth 連携 (= ルームごとに別アカウント)

- **却下理由**: Calendly 系の発想だが、Atender は「学生が自分のスマホ予定をルームメンバーに見せる」がメインユースケース。ユーザー単位の方が自然 (= Google アカウントは個人持ち)。
- **再検討トリガー**: ルームオーナーが「サークル共有カレンダー」を連携したい等のユースケース

### 11.4 ICS_URL の延伸 (Phase 1.5 の webcal 同期と統合)

- **却下理由**: ICS_URL は v6/v7 の Phase 1.5 範囲、Google OAuth は v8。実装層を共有しない (Google は API、ICS_URL は webcal HTTP)。
- **再検討トリガー**: なし (別 layer で並走)

### 11.5 LLM ベース auto-categorize の v8 同時導入

- **却下理由**: v7 で Phase 2 と決めている。v8 で OAuth と同時投入すると複雑度が上がる。
- **再検討トリガー**: Phase 2 で v9 として別 doc

### 11.6 GoogleCalendarConnection を Account row 拡張で実現

- **却下理由**: better-auth Account に Atender 固有の lastSyncedAt / lastError / googleEmail を追加すると、better-auth の adapter が無効化される列を扱う形になる。better-auth の migration 再生成と衝突しやすい。
- **再検討トリガー**: なし

### 11.7 同期データ保持期間制限 (e.g. 過去 1 ヶ月で自動削除)

- **却下理由**: ルームメンバーが過去予定を遡る正当なユースケースあり。プライバシー懸念は rawTitle 限定の話で、削除より visibility 制御が解。
- **再検討トリガー**: 「DB 肥大化」が実測で問題に

### 11.8 Atender → Google 書き戻し (双方向)

- **却下理由**: 設計複雑度が爆発 (差分判定 / 競合解決 / 失敗時の Atender 側 rollback)。MVP は read-only に絞る。
- **再検討トリガー**: ユーザーが「Atender で予定作って、Google にも反映して」要望

### 11.9 OAuth Production verification

- **却下理由**: sensitive scope 申請に 1-2 週間、Privacy Policy / Terms of Service ドキュメント作成必須。MVP 段階では Testing + 100 ユーザー上限で十分。
- **再検討トリガー**: ユーザー数 80 接近 / Production 公開ローンチ

---

## §12 ロールアウト計画

### 12.1 マイルストン

1. **Migration & schema** (Day 1): Prisma schema + migration 適用、`.env.test` で動作確認
2. **better-auth diff** (Day 1): accessType / prompt 追加、authClient.ts 新規
3. **lib / services 実装** (Day 2-3): googleApi / googleCalendar / googleAccessToken / googleCalendarSync 各 service
4. **API ルート** (Day 3): me.ts + rooms.ts に endpoint 追加
5. **shared schema** (Day 3): packages/shared/src/schemas/google.ts
6. **cron script** (Day 4): sync-google-calendars.ts
7. **Web hooks** (Day 4): useGoogleCalendar 系
8. **Web UI** (Day 5-6): AvatarMenu 改修 / GoogleCalendarSection / GoogleCalendarSelectorSheet / RoomGoogleSyncSection
9. **Reviewer (Architect 推奨テスト範囲)** (Day 6-7): backend + frontend テスト一式
10. **Touri 手元検証** (Day 7): Google Cloud Console 設定 + Coolify scheduled task 設定 + 実機 link
11. **本番デプロイ** (Day 8)

### 12.2 段階リリース

- Stage 1 (内部): Touri 1 ユーザーで動作確認 (testing-mode の test users に追加)
- Stage 2 (招待制): 5 ユーザーで実機テスト 1 週間
- Stage 3 (全体公開): Testing ステータスのまま (100 ユーザー上限) 一般解禁

### 12.3 ロールバック計画

- 本番デプロイ後に致命バグ発生 → migration を down (RoomEvent の 3 column / GoogleCalendarSync / GoogleCalendarConnection を drop)、API endpoint 削除、UI section 非表示。`source = GOOGLE_OAUTH` の RoomEvent は手動 SQL で削除 (= ICS_FILE は影響なし)。
- 全 user の Coolify scheduled task を 1 度停止する手順を README に明記。

---

## §13 設計まとめ (Developer 向けの最終チェックリスト)

実装着手前に確認:

- [ ] Prisma schema に新規 2 model + RoomEvent 3 column + enum 2 個を追加し migration を生成
- [ ] `.env.test` で migration 動作確認、既存テスト全 green
- [ ] `apps/api/src/auth.ts` に `accessType: "offline"` / `prompt: "consent"` を追加 (scope は触らない)
- [ ] `apps/web/src/lib/authClient.ts` を新規追加し `better-auth` を web 依存に追加
- [ ] `apps/api/package.json` には新依存追加なし (fetch native + dayjs 既存)
- [ ] `googleAccessToken.service.ts` の primary path + fallback 両方実装、検証スクリプト用意
- [ ] cron script の Coolify scheduled task コマンドが README に書かれる
- [ ] Web UI は AvatarMenu の MenuButton リストに新規エントリ追加するだけ (既存パターン継続)
- [ ] visibility 表示 = v7 と同じ `applyVisibility` 関数を流用する (新規追加なし)
- [ ] テストで Google API は必ず `mockGoogleFetch` 経由、実 HTTP は絶対叩かない
- [ ] Reviewer 用に §8 の 50+ 挙動仕様が全部根拠として使える形になっているか確認
- [ ] 不確定事項 #1 #2 #3 の検証結果を Touri に報告 (実装後)

---

## Appendix A: 既存資産との関係

| 既存 | v8 の関係 |
|---|---|
| `RoomEventSource` enum (v7) | `GOOGLE_OAUTH` 値が既に定義済、v8 では実体化のみ |
| `EventVisibility` enum (v7) | そのまま再利用 (NORMAL / TITLE_MAPPED / BUSY_ONLY) |
| `IcsTitleRule` (v7) | Google 同期でも `applyTitleRules` を流用、user 単位の rule が ICS / Google 共通 |
| `applyVisibility` in `getRoomWeek` (v7) | そのまま機能、Google 由来 RoomEvent にも適用される |
| `expandRoomEvents` (v7) | recurrenceRule=null の単発 RoomEvent をそのまま返すロジックで Google 由来も処理可能、変更不要 |
| better-auth Account (1.6.11) | scope / accessToken / refreshToken を活用、別 model は追加しない |

## Appendix B: 環境変数 (v8 で追加なし)

| 変数 | 用途 | 既存有無 |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID | 既存 |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | 既存 |
| `BETTER_AUTH_URL` | Atender API base | 既存 |
| `PUBLIC_WEB_URL` / `VITE_APP_URL` | callback redirect 先 | 既存 |

v8 で `.env` への追加変数は**なし**。

## Appendix C: knowledge への追記候補 (Architect が設計完了後に書く)

- `Muraki/knowledge/pattern/better-auth-incremental-scope-google.md` (新規予定)
  - linkSocial による段階 scope 取得 + auth.api.getAccessToken の cron 文脈 fallback パターン
- `Muraki/knowledge/pattern/google-calendar-incremental-sync-rooms-syncs.md` (新規予定)
  - Connection (user) × Sync (room × calendar) の 2 段 schema + syncToken / 410 handling + applyTitleRules 流用パターン

(設計 doc 完成後、本ファイルの上書きでなく `knowledge/pattern/` に追記する)
