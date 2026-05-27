# Atender v7 — カレンダー繰り返し (RRULE) + .ics import + タイトル正規化マッピング

設計日: 2026-05-27 / Architect: architect subagent
対象 commit: v6 (`.designs/20260527-v6-room-calendar-timetable.md`) デプロイ後
前提 docs:
- `.designs/20260513-mvp.md` (Phase 1 schema + API)
- `.designs/20260526-v3-rooms-friends.md` (Room / RoomEvent v3 設計)
- `.designs/20260526-v4-snap-style.md` (Snap token)
- `.designs/20260526-v5-mobile-rework.md` (8pt grid / Major Third)
- `.designs/20260527-v6-room-calendar-timetable.md` (RoomCalendar / RoomTimetable)
- `.knowledge/06-calendar-rrule-ics-import.md` (Researcher findings, 825 行)

---

## Executive Summary

v6 で完成した「RoomCalendar (日/週/月) + RoomTimetable (1 画面圧縮)」を踏まえ、ルーム共有予定 (`RoomEvent`) に **(1) RRULE による繰り返し**、**(2) .ics ファイル import (file upload)**、**(3) タイトル → カテゴリマッピング (プライバシー隠蔽)** の 3 機能を追加する。

`Meeting` / `MeetingOccurrence` (時間割 + 出欠) には**一切手を入れない**。RoomEvent 系の拡張に閉じる。RRULE は生文字列保存 + オンザフライ展開 (Mattermost / Outline 方針)、.ics import は MVP では**ファイルアップロードのみ**(URL subscribe / Google OAuth は Phase 1.5+ 送り)。

### 主要設計判断

1. **RRULE は生文字列で保存・展開はオンザフライ**: `RoomEvent.recurrenceRule` に RFC 5545 RRULE 文字列 (`FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959Z`) を保存。`GET /api/rooms/:id/week` の処理内で `rrule` npm の `RRule.fromString().between(weekStart, weekEnd)` を呼び、当該週の occurrence を都度生成する。事前展開テーブルは作らない (Meeting 系の `MeetingOccurrence` 事前展開とは方針を分離)。
2. **個別回 override は別テーブル `RoomEventOverride`**: 「この回のみ編集」「この回のみキャンセル」を `(seriesId, originalDate)` で unique な行として保存。展開時に同 `(seriesId, originalDate)` の override があれば適用、`isCancelled=true` なら occurrence ごと除外。Cal.com / Google Cal と同じパターン。
3. **編集 3 択 (single / future / all)**: occurrence 編集 UI で Google Cal 同様 3 択ダイアログを出す。`single` は override 作成。`future` は元 RRULE に `UNTIL=originalDate-1day` を追加して打ち切り + 新シリーズを `originalDate` から開始 (series 分割)。`all` は元シリーズ全体を直接 update。
4. **.ics import は file upload 1 本に絞る**: 5MB 制限 + multipart upload。`node-ical` で parse、`rrule` で展開、エンコーディングは `jschardet`+`iconv-lite` で正規化。URL subscribe / Google OAuth は Phase 1.5 以降。
5. **タイトルマッピングは 3 種 (EQUALS / CONTAINS / REGEX) + デフォルト「全部 → 予定」**: `IcsTitleRule` を user 単位で持ち、import commit 時に各 VEVENT の `SUMMARY` に対し priority 昇順で評価、最初に hit したルールを適用。新規 import の初回 commit 時に「全部 → 予定」の fallback rule が自動生成される (priority=9999、`REGEX/.*`)。
6. **visibility 3 段階**: `EventVisibility` enum (`NORMAL` / `TITLE_MAPPED` / `BUSY_ONLY`)。`BUSY_ONLY` は week endpoint レスポンスから本人以外には `title` を `"予定あり"` に強制置換。本人 (`authorId === me`) には常に `rawTitle` を返す。
7. **SQLite 制約での実装**: `String[]` 不可なので `exDates` / `rDates` は CSV TEXT。RRULE 文字列も TEXT で十分。enum は `enum RoomEventSource`, `EventVisibility`, `IcsImportStatus`, `TitleMatchType` の 4 個を新規追加。
8. **MVP では duration ベースで end 計算**: シリーズ全 occurrence は同一 duration (= `series.end - series.start`)。RFC 5545 の DURATION/DTEND 二重持ちは MVP 不採用、`RoomEvent.start` / `RoomEvent.end` は DTSTART 相当 (シリーズの起点 = 最初の occurrence) を保存し、展開時に `endMinute - startMinute` 分を加える。
9. **API 完全分離維持**: ルームから見た import 操作は `/api/rooms/:id/ics-imports/*`、title-rule はユーザー設定として `/api/me/ics-title-rules/*`。Web 側 hooks も新規追加分のみ (`useIcsImports`, `useIcsTitleRules`, `useUpdateRoomEvent({ scope })` 等)。
10. **依存追加は `node-ical` + `rrule` + `jschardet` + `iconv-lite` + `multer` の 5 個**: 既存 API package には現在 multipart middleware が無いので `multer` を Hono 経由ではなく `c.req.parseBody()` (Hono ネイティブ multipart 対応) を使い、新規依存は **`node-ical` + `rrule` + `jschardet` + `iconv-lite`** の 4 個に抑える (Touri 制約「`node-ical@0.x` + `rrule@2.8.x` のみ」に対し、文字コード正規化のため 2 個追加を要請)。
11. **v6 を壊さない**: v6 `RoomCalendar` `RoomTimetable` の prop / hook シグネチャは変更しない。`useRoomMonth` / `useRoomWeek` のレスポンス DTO に新フィールドを追加する形 (`source`, `recurrenceRule`, `isRecurringOccurrence`, `seriesId`)。フロントは既存 destructure に支障なし。

### スコープ外 (v7 でやらない)

- **URL subscribe (webcal:// / HTTPS)** — Phase 1.5 (cron + ETag 必要、別設計)
- **Google Cal OAuth + watch** — Phase 2 (GCP 審査・サーバー側暗号化)
- **LLM ベース auto-categorize** — Phase 2 (Claude Haiku で SUMMARY → カテゴリ推論)
- **.ics export (ical-generator)** — Phase 2
- **RoomEvent の location / attendees** — `.ics` パース時に **常に破棄**、保存しない
- **DESCRIPTION の保存** — 既存 `description` カラムには **入れず破棄** (プライバシー優先)
- **RRULE 文字列 720 char 超のサポート** — Google Cal の事実上上限と同値 (HARD limit、超えたら 400)
- **TZID 変換 UI** — MVP は **Asia/Tokyo 固定** で UTC 化、`User.timezone` カラム追加なし
- **`MeetingOccurrence` への影響** — 既存時間割 / 出欠は完全不変

---

## §0 用語

| 用語 | 意味 |
|---|---|
| **RoomEvent (series)** | RRULE 持ちの **シリーズ親レコード**。`recurrenceRule` が non-null の場合 series、null なら単発 |
| **occurrence** | RRULE 展開で生成された 1 回分の予定。DB 行にはなく、API レスポンスでのみ存在 |
| **override** | series 内の特定 occurrence を上書きする `RoomEventOverride` 行 |
| **DTSTART** | RFC 5545 のシリーズ起点日時。`RoomEvent.start` がこれに相当 |
| **duration** | `RoomEvent.end - RoomEvent.start` の分数。全 occurrence で共通 |
| **externalUid** | RFC 5545 の `UID:`。import dedup の primary key |
| **SEQUENCE** | RFC 5545 の `SEQUENCE:`。import 時の update 判定に使う |
| **rawTitle** | import 元のオリジナル `SUMMARY:`。本人だけ表示可、他メンバーには露出させない |
| **title** | mapping 適用後の表示名 (例: `"予定"`)。メンバー全員が見る値 |
| **visibilityMode** | `NORMAL` / `TITLE_MAPPED` / `BUSY_ONLY` の表示制御 enum |
| **editScope** | 編集時の 3 択。`"single" \| "future" \| "all"` |

---

## §1 全体構成

```
v7 = (A) Prisma schema:
        - RoomEvent に 10 列追加
        - RoomEventOverride (新)
        - IcsImport (新)
        - IcsTitleRule (新)
        - enum 4 個 (RoomEventSource / EventVisibility / IcsImportStatus / TitleMatchType)
        - migration: 20260527140000_v7_rrule_ics_mapping
     (B) Shared zod:
        - RoomEventDto に 6 フィールド追加 + occurrence DTO 新規
        - CreateRoomEventInput / UpdateRoomEventInput に recurrence / editScope 追加
        - IcsImport / IcsTitleRule DTO 新規
        - RoomWeekDto.roomEvents を「展開済 occurrence 配列」に変える (フロント変更なし)
     (C) API:
        - POST /api/rooms/:id/ics-imports          (multipart upload + parse + preview)
        - GET  /api/rooms/:id/ics-imports          (history)
        - DELETE /api/rooms/:id/ics-imports/:importId (cascade delete RoomEvent)
        - POST /api/rooms/:id/ics-imports/:importId/commit (mapping 適用 + upsert)
        - GET  /api/me/ics-title-rules
        - POST /api/me/ics-title-rules
        - PATCH /api/me/ics-title-rules/:ruleId
        - DELETE /api/me/ics-title-rules/:ruleId
        - PATCH /api/rooms/:id/events/:eventId     (editScope: single|future|all を body に)
        - DELETE /api/rooms/:id/events/:eventId    (?scope=single|future|all)
        - GET /api/rooms/:id/week                  (response の roomEvents を展開済 occurrence に)
     (D) Backend services:
        - apps/api/src/services/icsImport.service.ts (新規、parse + upsert)
        - apps/api/src/services/icsTitleRule.service.ts (新規、CRUD)
        - apps/api/src/services/recurrence.service.ts (新規、RRULE 展開 + 編集 3 択)
        - apps/api/src/services/room.service.ts (既存、week 展開ロジック差し替え)
        - apps/api/src/lib/icsParse.ts (新規、encoding + node-ical + 抽出)
        - apps/api/src/lib/rruleExpand.ts (新規、rrule wrapper)
     (E) Frontend 新規 component:
        - RecurrencePicker (作成 sheet 内)
        - RecurrenceEditDialog (3 択)
        - IcsImportWizard (4 step: file → preview → mapping → commit)
        - TitleRuleEditor (ユーザー設定画面)
        - RoomEventDetailSheet (改修、recurrence 表示 + 編集 3 択へ接続)
     (F) Frontend 改修 component:
        - RoomEventCreateSheet (recurrence フィールド追加)
        - RoomCalendar (FAB 「予定を追加」の隣に「⤓ カレンダー取り込み」追加)
        - RoomSettingsSheet (⚙ に「カレンダー取り込み」リンク追加)
        - SettingsRoute (新規 /settings/calendar、TitleRuleEditor をホスト)
     (G) lib 新規:
        - apps/web/src/lib/rruleClient.ts (rrule npm + toText 日本語ラッパ)
        - apps/web/src/lib/recurrenceFormat.ts (UI 自然言語表示)
     (H) tests (§9)
```

依存関係:

```
Prisma schema migration
    └─ shared/schemas/room.ts (RoomEventDto + RoomWeekDto)
    └─ shared/schemas/ics.ts (新規)
            └─ apps/api/src/services/recurrence.service.ts
            └─ apps/api/src/services/icsImport.service.ts
            └─ apps/api/src/services/icsTitleRule.service.ts
            └─ apps/api/src/services/room.service.ts (getRoomWeek 改修)
                    └─ apps/api/src/routes/rooms.ts (+ ics-imports / events scope)
                    └─ apps/api/src/routes/me.ts (+ ics-title-rules)
                            └─ apps/web/src/api/hooks/useRoomEvents.ts (拡張)
                            └─ apps/web/src/api/hooks/useIcsImports.ts (新)
                            └─ apps/web/src/api/hooks/useIcsTitleRules.ts (新)

apps/web/src/lib/rruleClient.ts (新)
apps/web/src/lib/recurrenceFormat.ts (新)
    └─ apps/web/src/components/recurrence/RecurrencePicker.tsx (新)
    └─ apps/web/src/components/recurrence/RecurrenceEditDialog.tsx (新)
    └─ apps/web/src/components/rooms/RoomEventCreateSheet.tsx (改修)
    └─ apps/web/src/components/rooms/RoomEventDetailSheet.tsx (改修)

apps/web/src/components/ics-import/IcsImportWizard.tsx (新)
apps/web/src/components/ics-import/TitleRuleEditor.tsx (新)
    └─ apps/web/src/components/rooms/RoomCalendar.tsx (改修、ボタン追加)
    └─ apps/web/src/components/rooms/RoomSettingsSheet.tsx (改修、リンク追加)
    └─ apps/web/src/routes/SettingsCalendar.tsx (新、TitleRuleEditor をホスト)
```

---

## §2 データモデル (Prisma schema delta)

### 2.1 RoomEvent に 10 カラム追加

```prisma
model RoomEvent {
  // ===== 既存 (v6 まで) =====
  id          String   @id @default(cuid())
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  authorId    String
  author      User     @relation("RoomEventAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  title       String
  description String?
  start       DateTime
  end         DateTime
  isAllDay    Boolean  @default(false)
  color       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // ===== v7 新規 =====
  rawTitle             String?            // import 元 SUMMARY (本人のみ閲覧、mapping 前の値)
  recurrenceRule       String?            // RRULE 文字列 (例: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959Z")
  exDates              String?            // EXDATE の CSV (ISO8601 UTC, "20260615T090000Z,20260622T090000Z")
  rDates               String?            // RDATE の CSV (同上)
  source               RoomEventSource @default(MANUAL)
  externalUid          String?            // RFC 5545 UID:
  externalSeq          Int?               // RFC 5545 SEQUENCE:
  externalLastModified DateTime?          // RFC 5545 LAST-MODIFIED:
  importId             String?            // FK to IcsImport
  import               IcsImport?      @relation(fields: [importId], references: [id], onDelete: SetNull)
  visibilityMode       EventVisibility @default(NORMAL)

  overrides   RoomEventOverride[]

  @@index([roomId, start])
  @@index([authorId])
  @@unique([roomId, externalUid])        // ★ dedup: 同一 room × 同一 UID は 1 行のみ
}
```

### 2.2 RoomEventOverride (新)

```prisma
model RoomEventOverride {
  id            String    @id @default(cuid())
  seriesId      String
  series        RoomEvent @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  originalDate  DateTime  // 元の occurrence の DTSTART (UTC で保存、Asia/Tokyo の 09:00 なら 00:00:00Z)
  isCancelled   Boolean   @default(false)
  newStart      DateTime?
  newEnd        DateTime?
  newTitle      String?
  newDescription String?
  newColor      String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([seriesId, originalDate])
  @@index([seriesId])
}
```

### 2.3 IcsImport (新)

```prisma
model IcsImport {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  roomId        String                                 // 必須 (room 単位 import のみ MVP)
  room          Room      @relation(fields: [roomId], references: [id], onDelete: Cascade)
  source        RoomEventSource                        // ICS_FILE (MVP)、ICS_URL は Phase 1.5
  filename      String?                                // ICS_FILE 時の元ファイル名
  url           String?                                // ICS_URL 時 (Phase 1.5)
  contentHash   String                                 // SHA-256 of raw bytes (dedup re-upload)
  rawText       String                                 // parse 済の text (= 正規化後 utf-8)。プレビュー / commit のため保持
  status        IcsImportStatus @default(PENDING)
  parsedEventCount  Int @default(0)
  committedEventCount Int @default(0)
  skippedEventCount   Int @default(0)
  errorMessage  String?
  committedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  events        RoomEvent[]

  @@index([userId])
  @@index([roomId])
}
```

`rawText` を保持する理由: preview → commit の 2 phase で、ユーザーが mapping rule を編集してから commit するまでに parse 結果を保持する必要がある。MVP では DB に持つ (re-parse コスト避ける)。サイズは原則 5MB 以下 (upload 制限) なのでテーブル肥大の懸念は小さい。`status=SUCCESS` 後 7 日経過した import は `rawText` を null に nullify する cron を Phase 1.5 で検討 (v7 では nullify しない)。

### 2.4 IcsTitleRule (新)

```prisma
model IcsTitleRule {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  matchType       TitleMatchType                       // EQUALS | CONTAINS | REGEX
  pattern         String                               // 比較対象文字列 / REGEX なら ECMA RegExp 文字列
  replaceWith     String?                              // null → "予定" を fallback
  visibilityMode  EventVisibility @default(TITLE_MAPPED)
  priority        Int       @default(0)                // 昇順評価、小さいほど優先
  isDefault       Boolean   @default(false)            // 「全部 → 予定」のデフォ rule フラグ
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([userId, priority])
}
```

`isDefault=true` の rule は user 1 人につき最大 1 個。初回 import 時に user に default rule が無ければ自動作成。

### 2.5 enum 4 個 (新)

```prisma
enum RoomEventSource {
  MANUAL         // ユーザー手動作成 (v6 までと同じ)
  ICS_FILE       // .ics ファイルアップロード
  ICS_URL        // (Phase 1.5) URL subscribe
  GOOGLE_OAUTH   // (Phase 2) Google Cal API
}

enum EventVisibility {
  NORMAL         // タイトルそのまま全員に見せる (デフォ for MANUAL)
  TITLE_MAPPED   // mapping 適用済、rawTitle は本人のみ
  BUSY_ONLY      // 全員に「予定あり」のみ、本人だけ title 閲覧可
}

enum IcsImportStatus {
  PENDING        // upload 直後、parse 完了前
  PARSED         // parse 成功、commit 待ち
  SUCCESS        // commit 完了
  PARTIAL_ERROR  // commit したが一部 VEVENT で error
  FAILED         // parse 失敗 / commit 失敗
}

enum TitleMatchType {
  EQUALS
  CONTAINS
  REGEX
}
```

### 2.6 Migration ファイル (SQLite)

ファイル: `apps/api/prisma/migrations/20260527140000_v7_rrule_ics_mapping/migration.sql`

```sql
-- v7: RRULE + .ics import + title mapping

-- 1. enum は SQLite では無視 (Prisma 側 type check のみ)、TEXT で保存される

-- 2. RoomEvent に 10 カラム追加 (全 nullable / default あり、既存 row が壊れない)
ALTER TABLE "RoomEvent" ADD COLUMN "rawTitle" TEXT;
ALTER TABLE "RoomEvent" ADD COLUMN "recurrenceRule" TEXT;
ALTER TABLE "RoomEvent" ADD COLUMN "exDates" TEXT;
ALTER TABLE "RoomEvent" ADD COLUMN "rDates" TEXT;
ALTER TABLE "RoomEvent" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "RoomEvent" ADD COLUMN "externalUid" TEXT;
ALTER TABLE "RoomEvent" ADD COLUMN "externalSeq" INTEGER;
ALTER TABLE "RoomEvent" ADD COLUMN "externalLastModified" DATETIME;
ALTER TABLE "RoomEvent" ADD COLUMN "importId" TEXT;
ALTER TABLE "RoomEvent" ADD COLUMN "visibilityMode" TEXT NOT NULL DEFAULT 'NORMAL';

-- 3. RoomEventOverride
CREATE TABLE "RoomEventOverride" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seriesId" TEXT NOT NULL,
  "originalDate" DATETIME NOT NULL,
  "isCancelled" BOOLEAN NOT NULL DEFAULT false,
  "newStart" DATETIME,
  "newEnd" DATETIME,
  "newTitle" TEXT,
  "newDescription" TEXT,
  "newColor" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "RoomEventOverride_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "RoomEvent" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RoomEventOverride_seriesId_originalDate_key"
  ON "RoomEventOverride"("seriesId", "originalDate");
CREATE INDEX "RoomEventOverride_seriesId_idx" ON "RoomEventOverride"("seriesId");

-- 4. IcsImport
CREATE TABLE "IcsImport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "filename" TEXT,
  "url" TEXT,
  "contentHash" TEXT NOT NULL,
  "rawText" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "parsedEventCount" INTEGER NOT NULL DEFAULT 0,
  "committedEventCount" INTEGER NOT NULL DEFAULT 0,
  "skippedEventCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "committedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "IcsImport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IcsImport_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "IcsImport_userId_idx" ON "IcsImport"("userId");
CREATE INDEX "IcsImport_roomId_idx" ON "IcsImport"("roomId");

-- 5. RoomEvent の externalUid unique と importId FK
CREATE UNIQUE INDEX "RoomEvent_roomId_externalUid_key"
  ON "RoomEvent"("roomId", "externalUid");
-- importId FK は SQLite では既存テーブル ALTER で追加不可。
-- 既存 RoomEvent テーブルを recreate するパターンを Prisma が自動生成する想定。
-- SQLite では Prisma の "table_recreation" モードで FK を含めて作り直す。

-- 6. IcsTitleRule
CREATE TABLE "IcsTitleRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "matchType" TEXT NOT NULL,
  "pattern" TEXT NOT NULL,
  "replaceWith" TEXT,
  "visibilityMode" TEXT NOT NULL DEFAULT 'TITLE_MAPPED',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "IcsTitleRule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "IcsTitleRule_userId_priority_idx" ON "IcsTitleRule"("userId", "priority");
```

#### Migration の SQLite 注意

- SQLite では `ALTER TABLE ... ADD COLUMN ... REFERENCES` が制限される。`importId` の FK は Prisma が **table recreation** で対応する。Developer は `prisma migrate dev` 実行時に Prisma が自動生成する SQL を確認し、上記 6 ステップ + table recreation 部分が全て含まれていることをチェックする。`.env.test` の `DATABASE_URL` で migrate も走らせ、既存 row が壊れないことを確認。
- `enum` は SQLite では `TEXT` として保存される。zod / TS 側で integrity を保証する。
- 既存データ保護: 既存 `RoomEvent` の `source` は default `'MANUAL'`、`visibilityMode` は default `'NORMAL'` が ALTER で全行に充填されるので壊れない。

### 2.7 User リレーション追加

`User` model に以下リレーションを追加 (model 自体の変更):

```prisma
model User {
  // ... 既存 ...
  icsImports     IcsImport[]
  icsTitleRules  IcsTitleRule[]
}
```

`Room` model:

```prisma
model Room {
  // ... 既存 ...
  icsImports  IcsImport[]
}
```

---

## §3 RRULE 展開ロジック (Backend)

### 3.1 ライブラリ wrapper: `apps/api/src/lib/rruleExpand.ts`

```ts
import { RRule, RRuleSet, rrulestr } from "rrule";

export type RRuleParts = {
  rrule: string;            // "FREQ=WEEKLY;..."
  dtstart: Date;            // UTC Date
  exDates: Date[];          // EXDATE
  rDates: Date[];           // RDATE
};

/**
 * RRULE + DTSTART + EXDATE + RDATE を合成して RRuleSet を構築する。
 * - rrule npm の rrulestr() に投げると、複数行の string を解釈してくれる
 * - dtstart は ISO 文字列で "DTSTART:..." の行を先頭に追加する
 */
export function buildRRuleSet(parts: RRuleParts): RRuleSet {
  const lines: string[] = [];
  // DTSTART は必ず先頭
  lines.push(`DTSTART:${toIcsDate(parts.dtstart)}`);
  // RRULE
  lines.push(`RRULE:${parts.rrule}`);
  // EXDATE
  for (const d of parts.exDates) lines.push(`EXDATE:${toIcsDate(d)}`);
  // RDATE
  for (const d of parts.rDates) lines.push(`RDATE:${toIcsDate(d)}`);
  const set = rrulestr(lines.join("\n"), { forceset: true }) as RRuleSet;
  return set;
}

/**
 * weekStart (inclusive) から weekEnd (exclusive) の範囲で occurrence date 配列を返す。
 * - UTC Date 配列、昇順
 */
export function expandBetween(parts: RRuleParts, weekStart: Date, weekEnd: Date): Date[] {
  const set = buildRRuleSet(parts);
  // rrule.between(start, end, true) = inclusive 両端
  return set.between(weekStart, weekEnd, true);
}

/** Date → "YYYYMMDDTHHmmssZ" (RFC 5545 UTC 形式) */
function toIcsDate(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** "YYYYMMDDTHHmmssZ,YYYYMMDDTHHmmssZ" CSV → Date[] */
export function parseCsvDates(csv: string | null | undefined): Date[] {
  if (!csv) return [];
  return csv.split(",").map(s => s.trim()).filter(Boolean).map(parseIcsDate);
}

/** "20260615T090000Z" → Date */
function parseIcsDate(s: string): Date {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) throw new Error(`Invalid ICS date: ${s}`);
  const [, y, mo, d, h, mi, se] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se));
}

/** RRULE 文字列が syntactically valid か確認 (parse できれば OK) */
export function validateRRule(rrule: string, dtstart: Date): void {
  try {
    rrulestr(`DTSTART:${toIcsDate(dtstart)}\nRRULE:${rrule}`);
  } catch (e) {
    throw new Error(`Invalid RRULE: ${e instanceof Error ? e.message : String(e)}`);
  }
}
```

### 3.2 expansion service: `apps/api/src/services/recurrence.service.ts`

```ts
import { prisma } from "../db";
import { buildRRuleSet, expandBetween, parseCsvDates } from "../lib/rruleExpand";
import type { RoomEvent, RoomEventOverride } from "@prisma/client";

export type ExpandedOccurrence = {
  seriesId: string;
  occurrenceDate: Date;             // 元の date (override 適用前)
  start: Date;
  end: Date;
  title: string;
  rawTitle: string | null;
  description: string | null;
  color: string | null;
  isAllDay: boolean;
  source: string;
  visibilityMode: string;
  authorId: string;
  isRecurringOccurrence: boolean;   // true = RRULE 展開行、false = 単発
  recurrenceRule: string | null;
  overrideId: string | null;
};

/**
 * 範囲 [from, to] に含まれる occurrence を展開して返す。
 * - 単発 RoomEvent (recurrenceRule=null) はそのまま 1 つ
 * - RRULE 持ち RoomEvent は rrule.between() で展開、override を差し込み
 * - cancellation override は除外
 */
export async function expandRoomEvents(
  roomId: string,
  from: Date,
  to: Date,
): Promise<ExpandedOccurrence[]> {
  const events = await prisma.roomEvent.findMany({
    where: {
      roomId,
      OR: [
        // 単発で範囲に重なるもの
        { recurrenceRule: null, start: { lte: to }, end: { gte: from } },
        // 繰り返しで DTSTART <= to のもの (UNTIL が範囲外でも展開可能)
        { recurrenceRule: { not: null }, start: { lte: to } },
      ],
    },
    include: { overrides: true },
  });

  const result: ExpandedOccurrence[] = [];
  const durationByEvent = new Map<string, number>();

  for (const e of events) {
    const durationMs = e.end.getTime() - e.start.getTime();
    durationByEvent.set(e.id, durationMs);

    if (!e.recurrenceRule) {
      result.push(toOccurrence(e, e.start, durationMs, null));
      continue;
    }

    // RRULE 展開
    const dates = expandBetween(
      {
        rrule: e.recurrenceRule,
        dtstart: e.start,
        exDates: parseCsvDates(e.exDates),
        rDates: parseCsvDates(e.rDates),
      },
      from,
      to,
    );
    const overridesByDate = new Map<string, RoomEventOverride>();
    for (const o of e.overrides) {
      overridesByDate.set(o.originalDate.toISOString(), o);
    }

    for (const occDate of dates) {
      const override = overridesByDate.get(occDate.toISOString());
      if (override?.isCancelled) continue; // この回は除外
      result.push(toOccurrence(e, occDate, durationMs, override ?? null));
    }
  }
  // 開始時刻昇順
  result.sort((a, b) => a.start.getTime() - b.start.getTime());
  return result;
}

function toOccurrence(
  e: RoomEvent,
  occDate: Date,
  durationMs: number,
  override: RoomEventOverride | null,
): ExpandedOccurrence {
  const start = override?.newStart ?? occDate;
  const end = override?.newEnd ?? new Date(start.getTime() + durationMs);
  return {
    seriesId: e.id,
    occurrenceDate: occDate,
    start,
    end,
    title: override?.newTitle ?? e.title,
    rawTitle: e.rawTitle,
    description: override?.newDescription ?? e.description,
    color: override?.newColor ?? e.color,
    isAllDay: e.isAllDay,
    source: e.source,
    visibilityMode: e.visibilityMode,
    authorId: e.authorId,
    isRecurringOccurrence: e.recurrenceRule != null,
    recurrenceRule: e.recurrenceRule,
    overrideId: override?.id ?? null,
  };
}
```

### 3.3 編集 3 択ロジック (single / future / all)

```ts
/**
 * editScope に応じて RoomEvent / RoomEventOverride を更新する。
 * 戻り値: 影響した RoomEvent シリーズの id 配列 (1 か 2)
 */
export async function applyEditScope(args: {
  seriesId: string;
  originalDate: Date;        // occurrence の元 DTSTART
  scope: "single" | "future" | "all";
  patch: {
    title?: string;
    description?: string | null;
    start?: Date;            // 同日内の時刻変更想定
    end?: Date;
    color?: string | null;
    isCancelled?: boolean;   // single + cancel のみ意味あり
  };
}): Promise<{ affectedSeriesIds: string[]; newSeriesId?: string }> {
  const series = await prisma.roomEvent.findUniqueOrThrow({ where: { id: args.seriesId } });

  if (args.scope === "single") {
    // override upsert
    await prisma.roomEventOverride.upsert({
      where: { seriesId_originalDate: { seriesId: args.seriesId, originalDate: args.originalDate } },
      create: {
        seriesId: args.seriesId,
        originalDate: args.originalDate,
        isCancelled: args.patch.isCancelled ?? false,
        newStart: args.patch.start ?? null,
        newEnd: args.patch.end ?? null,
        newTitle: args.patch.title ?? null,
        newDescription: args.patch.description ?? null,
        newColor: args.patch.color ?? null,
      },
      update: {
        isCancelled: args.patch.isCancelled ?? undefined,
        newStart: args.patch.start ?? undefined,
        newEnd: args.patch.end ?? undefined,
        newTitle: args.patch.title ?? undefined,
        newDescription: args.patch.description ?? undefined,
        newColor: args.patch.color ?? undefined,
      },
    });
    return { affectedSeriesIds: [args.seriesId] };
  }

  if (args.scope === "future") {
    if (!series.recurrenceRule) {
      throw new AppError(400, "NOT_RECURRING", "Cannot scope=future on non-recurring event");
    }
    // 1. 元シリーズの RRULE に UNTIL=originalDate-1ms を追加
    const untilDate = new Date(args.originalDate.getTime() - 1);
    const newOldRRule = appendOrReplaceUntil(series.recurrenceRule, untilDate);
    await prisma.roomEvent.update({
      where: { id: series.id },
      data: { recurrenceRule: newOldRRule },
    });
    // 2. 新シリーズを originalDate から複製
    const durationMs = series.end.getTime() - series.start.getTime();
    const newStart = args.patch.start ?? args.originalDate;
    const newEnd = args.patch.end ?? new Date(newStart.getTime() + durationMs);
    const newSeries = await prisma.roomEvent.create({
      data: {
        roomId: series.roomId,
        authorId: series.authorId,
        title: args.patch.title ?? series.title,
        description: args.patch.description ?? series.description,
        start: newStart,
        end: newEnd,
        isAllDay: series.isAllDay,
        color: args.patch.color ?? series.color,
        rawTitle: series.rawTitle,
        recurrenceRule: stripUntil(series.recurrenceRule), // 元 series の UNTIL を抜いたもの (再開シリーズ)
        exDates: null,
        rDates: null,
        source: series.source,
        externalUid: null,        // 分割後の新シリーズは UID 引き継がない
        externalSeq: null,
        externalLastModified: null,
        importId: series.importId,
        visibilityMode: series.visibilityMode,
      },
    });
    return { affectedSeriesIds: [series.id, newSeries.id], newSeriesId: newSeries.id };
  }

  // scope === "all"
  await prisma.roomEvent.update({
    where: { id: series.id },
    data: {
      title: args.patch.title ?? undefined,
      description: args.patch.description ?? undefined,
      start: args.patch.start ?? undefined,
      end: args.patch.end ?? undefined,
      color: args.patch.color ?? undefined,
    },
  });
  return { affectedSeriesIds: [series.id] };
}

function appendOrReplaceUntil(rrule: string, until: Date): string {
  // "FREQ=WEEKLY;BYDAY=MO;COUNT=10" → "FREQ=WEEKLY;BYDAY=MO;UNTIL=YYYYMMDDTHHMMSSZ"
  const parts = rrule.split(";").filter(p => !p.startsWith("UNTIL=") && !p.startsWith("COUNT="));
  parts.push(`UNTIL=${toIcsDateUtc(until)}`);
  return parts.join(";");
}

function stripUntil(rrule: string | null): string | null {
  if (!rrule) return null;
  return rrule.split(";").filter(p => !p.startsWith("UNTIL=") && !p.startsWith("COUNT=")).join(";");
}
```

### 3.4 RRULE 上限値 (Hard limits)

- **文字列長 ≤ 720 chars** (Google Cal 同等)。validate 段で `recurrenceRule.length > 720` なら 400 reject。
- **UNTIL も COUNT も無い場合** = 無限ループ防止のため `expandBetween` は最大 366 occurrence で打ち切り。`set.between(from, to, true)` は範囲指定なので無限ループの心配は構造的に無いが、`from` と `to` の差が 1 年超なら 400 reject。MVP では month view が最長なので 6 週分 = `to-from <= 50 days` を service が保証。

---

## §4 .ics import パイプライン

### 4.1 ライブラリ wrapper: `apps/api/src/lib/icsParse.ts`

```ts
import * as ical from "node-ical";
import jschardet from "jschardet";
import iconv from "iconv-lite";
import { createHash } from "node:crypto";

export type ParsedVEvent = {
  uid: string;
  sequence: number | null;
  lastModified: Date | null;
  summary: string;                  // = SUMMARY 生
  start: Date;                      // UTC
  end: Date;                        // UTC (DURATION から計算済)
  isAllDay: boolean;
  rrule: string | null;             // "FREQ=WEEKLY;..." (DTSTART 抜き)
  exDates: Date[];
  rDates: Date[];
  recurrenceId: Date | null;        // 個別回 override 用
};

/** 5MB 上限 */
export const MAX_ICS_BYTES = 5 * 1024 * 1024;

export type ParseResult = {
  events: ParsedVEvent[];
  contentHash: string;
  normalizedText: string;
};

/**
 * Buffer → エンコーディング正規化 (UTF-8 化) → node-ical parse → VEVENT 抽出
 * 戻り値: { events, contentHash, normalizedText }
 */
export function parseIcsBuffer(buf: Buffer): ParseResult {
  if (buf.byteLength === 0) throw new Error("Empty file");
  if (buf.byteLength > MAX_ICS_BYTES) throw new Error("File too large");

  const text = normalizeEncoding(buf);
  const contentHash = createHash("sha256").update(buf).digest("hex");
  const raw = ical.parseICS(text);
  const events: ParsedVEvent[] = [];

  for (const k of Object.keys(raw)) {
    const v = (raw as Record<string, unknown>)[k] as IcalVEvent;
    if (!v || (v as { type?: string }).type !== "VEVENT") continue;
    events.push(extractVEvent(v));
  }
  return { events, contentHash, normalizedText: text };
}

function normalizeEncoding(buf: Buffer): string {
  const detected = jschardet.detect(buf);
  const enc = (detected?.encoding ?? "utf-8").toLowerCase();
  let decoded: string;
  if (enc === "utf-8" || enc === "utf8" || enc === "ascii") {
    decoded = buf.toString("utf8");
  } else {
    decoded = iconv.decode(buf, enc);
  }
  // BOM strip
  return decoded.replace(/^﻿/, "");
}

type IcalVEvent = {
  type?: string;
  uid?: string;
  sequence?: number | string;
  lastmodified?: { toJSDate?: () => Date } | Date;
  summary?: string;
  start?: Date & { tz?: string };
  end?: Date & { tz?: string };
  datetype?: "date" | "date-time";
  duration?: string;
  rrule?: { toString?: () => string; origOptions?: unknown };
  recurrenceid?: Date | { toJSDate?: () => Date };
  exdate?: Record<string, Date>;
  rdate?: Record<string, Date>;
};

function extractVEvent(v: IcalVEvent): ParsedVEvent {
  if (!v.uid) throw new Error("VEVENT missing UID");
  if (!v.start) throw new Error("VEVENT missing DTSTART");
  const summary = (v.summary ?? "").toString().trim();

  // start / end の UTC 化
  const start = toUtc(v.start);
  const end = v.end ? toUtc(v.end) : new Date(start.getTime() + 60 * 60 * 1000); // duration 不明なら 1h

  const isAllDay = v.datetype === "date";

  // RRULE: node-ical は rrule npm Rule object を返す。toString() で "RRULE:FREQ=..." 形式
  // ただし v7 では DTSTART を含まない RRULE 部分のみ保存する
  let rruleStr: string | null = null;
  if (v.rrule) {
    const full = v.rrule.toString?.() ?? "";
    rruleStr = full.replace(/^RRULE:/i, "").trim() || null;
  }

  // EXDATE / RDATE: node-ical は object map で返す
  const exDates: Date[] = v.exdate ? Object.values(v.exdate).map(toUtc) : [];
  const rDates: Date[] = v.rdate ? Object.values(v.rdate).map(toUtc) : [];

  // RECURRENCE-ID
  let recurrenceId: Date | null = null;
  if (v.recurrenceid) {
    recurrenceId = v.recurrenceid instanceof Date
      ? v.recurrenceid
      : (v.recurrenceid.toJSDate?.() ?? null);
  }

  // SEQUENCE
  const sequence = v.sequence != null
    ? (typeof v.sequence === "number" ? v.sequence : parseInt(String(v.sequence), 10) || 0)
    : null;

  // LAST-MODIFIED
  let lastModified: Date | null = null;
  if (v.lastmodified) {
    lastModified = v.lastmodified instanceof Date
      ? v.lastmodified
      : (v.lastmodified.toJSDate?.() ?? null);
  }

  return {
    uid: v.uid,
    sequence,
    lastModified,
    summary,
    start,
    end,
    isAllDay,
    rrule: rruleStr,
    exDates,
    rDates,
    recurrenceId,
  };
}

function toUtc(d: Date & { tz?: string }): Date {
  // node-ical はすでに Date オブジェクトを返す (TZID 解決済み)。
  // Floating time (tz === undefined) の場合は Asia/Tokyo として解釈する。
  if (!d.tz) {
    // Floating: 受信した時刻が "Asia/Tokyo の壁時計" であると仮定し、
    // ローカルマシン TZ != JST のサーバーでも JST 9h 補正で UTC に揃える
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    return new Date(d.getTime() - jstOffsetMs);
    // 注: node-ical が Floating を local TZ Date として返すか、UTC として返すかは
    // 検証必要。Reviewer はこれを fixture でテスト。
  }
  return d; // TZID 付きは node-ical 内で UTC 化済
}
```

### 4.2 import service: `apps/api/src/services/icsImport.service.ts`

```ts
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { parseIcsBuffer, type ParsedVEvent, MAX_ICS_BYTES } from "../lib/icsParse";
import { validateRRule } from "../lib/rruleExpand";
import { applyTitleRules, ensureDefaultRule } from "./icsTitleRule.service";

export async function createIcsImport(args: {
  userId: string;
  roomId: string;
  filename: string;
  buf: Buffer;
}) {
  await assertRoomMember(args.roomId, args.userId);
  if (args.buf.byteLength > MAX_ICS_BYTES) {
    throw new AppError(413, "FILE_TOO_LARGE", "ICS file exceeds 5MB");
  }

  let parsed: ReturnType<typeof parseIcsBuffer>;
  try {
    parsed = parseIcsBuffer(args.buf);
  } catch (e) {
    throw new AppError(400, "INVALID_ICS", e instanceof Error ? e.message : String(e));
  }

  // 同一 user × room × contentHash は dedup
  const existing = await prisma.icsImport.findFirst({
    where: { userId: args.userId, roomId: args.roomId, contentHash: parsed.contentHash },
  });
  if (existing) {
    return { import: existing, parsed: parsed.events, dedup: true };
  }

  const created = await prisma.icsImport.create({
    data: {
      userId: args.userId,
      roomId: args.roomId,
      source: "ICS_FILE",
      filename: args.filename,
      contentHash: parsed.contentHash,
      rawText: parsed.normalizedText,
      status: "PARSED",
      parsedEventCount: parsed.events.length,
    },
  });
  return { import: created, parsed: parsed.events, dedup: false };
}

export async function previewIcsImport(userId: string, importId: string) {
  const imp = await prisma.icsImport.findUnique({ where: { id: importId } });
  if (!imp || imp.userId !== userId) throw new AppError(404, "NOT_FOUND", "Import not found");
  if (imp.status === "FAILED") throw new AppError(409, "ALREADY_FAILED", "Import is failed");
  const reparsed = parseIcsBuffer(Buffer.from(imp.rawText, "utf8"));
  // mapping を適用したシミュレーション
  const rules = await prisma.icsTitleRule.findMany({
    where: { userId },
    orderBy: { priority: "asc" },
  });
  return {
    importId,
    events: reparsed.events.map(v => {
      const applied = applyTitleRules(v.summary, rules);
      return {
        uid: v.uid,
        rawTitle: v.summary,
        mappedTitle: applied.title,
        visibilityMode: applied.visibilityMode,
        ruleId: applied.ruleId,
        start: v.start.toISOString(),
        end: v.end.toISOString(),
        isRecurring: v.rrule != null,
        rrule: v.rrule,
      };
    }),
  };
}

export async function commitIcsImport(userId: string, importId: string) {
  const imp = await prisma.icsImport.findUnique({ where: { id: importId } });
  if (!imp || imp.userId !== userId) throw new AppError(404, "NOT_FOUND", "Import not found");
  if (imp.status === "SUCCESS") throw new AppError(409, "ALREADY_COMMITTED", "Already committed");

  await ensureDefaultRule(userId);
  const rules = await prisma.icsTitleRule.findMany({
    where: { userId },
    orderBy: { priority: "asc" },
  });

  const parsed = parseIcsBuffer(Buffer.from(imp.rawText, "utf8"));

  let committed = 0;
  let skipped = 0;
  const errors: string[] = [];

  // 1. RECURRENCE-ID 持ち VEVENT を後で処理するため分離
  const masterEvents = parsed.events.filter(v => v.recurrenceId == null);
  const overrideEvents = parsed.events.filter(v => v.recurrenceId != null);

  for (const v of masterEvents) {
    try {
      if (v.rrule) validateRRule(v.rrule, v.start);
      if (v.rrule && v.rrule.length > 720) {
        skipped++;
        errors.push(`UID ${v.uid}: RRULE > 720 chars`);
        continue;
      }
      const applied = applyTitleRules(v.summary, rules);

      // dedup by (roomId, externalUid)
      const existing = await prisma.roomEvent.findUnique({
        where: { roomId_externalUid: { roomId: imp.roomId, externalUid: v.uid } },
      });

      if (existing) {
        const incomingSeq = v.sequence ?? 0;
        const existingSeq = existing.externalSeq ?? 0;
        if (incomingSeq < existingSeq) { skipped++; continue; }
        if (incomingSeq === existingSeq && v.lastModified && existing.externalLastModified
            && v.lastModified <= existing.externalLastModified) { skipped++; continue; }

        await prisma.roomEvent.update({
          where: { id: existing.id },
          data: {
            title: applied.title,
            rawTitle: v.summary,
            start: v.start,
            end: v.end,
            isAllDay: v.isAllDay,
            recurrenceRule: v.rrule,
            exDates: v.exDates.length > 0 ? v.exDates.map(toIcsCsv).join(",") : null,
            rDates: v.rDates.length > 0 ? v.rDates.map(toIcsCsv).join(",") : null,
            externalSeq: v.sequence,
            externalLastModified: v.lastModified,
            importId: imp.id,
            visibilityMode: applied.visibilityMode,
          },
        });
      } else {
        await prisma.roomEvent.create({
          data: {
            roomId: imp.roomId,
            authorId: userId,
            title: applied.title,
            rawTitle: v.summary,
            description: null,           // DESCRIPTION は破棄
            start: v.start,
            end: v.end,
            isAllDay: v.isAllDay,
            color: null,
            recurrenceRule: v.rrule,
            exDates: v.exDates.length > 0 ? v.exDates.map(toIcsCsv).join(",") : null,
            rDates: v.rDates.length > 0 ? v.rDates.map(toIcsCsv).join(",") : null,
            source: "ICS_FILE",
            externalUid: v.uid,
            externalSeq: v.sequence,
            externalLastModified: v.lastModified,
            importId: imp.id,
            visibilityMode: applied.visibilityMode,
          },
        });
      }
      committed++;
    } catch (e) {
      skipped++;
      errors.push(`UID ${v.uid}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. RECURRENCE-ID 持ちは override として保存
  for (const v of overrideEvents) {
    try {
      const master = await prisma.roomEvent.findUnique({
        where: { roomId_externalUid: { roomId: imp.roomId, externalUid: v.uid } },
      });
      if (!master) { skipped++; errors.push(`UID ${v.uid}: master not found for RECURRENCE-ID`); continue; }
      const applied = applyTitleRules(v.summary, rules);
      await prisma.roomEventOverride.upsert({
        where: { seriesId_originalDate: { seriesId: master.id, originalDate: v.recurrenceId! } },
        create: {
          seriesId: master.id,
          originalDate: v.recurrenceId!,
          newStart: v.start,
          newEnd: v.end,
          newTitle: applied.title,
        },
        update: {
          newStart: v.start,
          newEnd: v.end,
          newTitle: applied.title,
        },
      });
      committed++;
    } catch (e) {
      skipped++;
      errors.push(`UID ${v.uid} (override): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await prisma.icsImport.update({
    where: { id: importId },
    data: {
      status: errors.length === 0 ? "SUCCESS" : "PARTIAL_ERROR",
      committedEventCount: committed,
      skippedEventCount: skipped,
      errorMessage: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
      committedAt: new Date(),
    },
  });

  return { committed, skipped, errors: errors.slice(0, 20) };
}

export async function deleteIcsImport(userId: string, importId: string) {
  const imp = await prisma.icsImport.findUnique({ where: { id: importId } });
  if (!imp || imp.userId !== userId) throw new AppError(404, "NOT_FOUND", "Import not found");
  // cascade で RoomEvent.importId が SetNull、event は残る
  // 「import に紐づく RoomEvent も削除する」のがユーザー期待のため、明示削除する
  await prisma.$transaction([
    prisma.roomEvent.deleteMany({ where: { importId } }),
    prisma.icsImport.delete({ where: { id: importId } }),
  ]);
}

export async function listIcsImports(userId: string, roomId: string) {
  await assertRoomMember(roomId, userId);
  return prisma.icsImport.findMany({
    where: { userId, roomId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      source: true,
      status: true,
      parsedEventCount: true,
      committedEventCount: true,
      skippedEventCount: true,
      errorMessage: true,
      committedAt: true,
      createdAt: true,
    },
  });
}

function toIcsCsv(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

async function assertRoomMember(roomId: string, userId: string) {
  const m = await prisma.roomMembership.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!m) throw new AppError(403, "NOT_MEMBER", "Room member only");
  return m;
}
```

### 4.3 タイトル正規化アルゴリズム: `apps/api/src/services/icsTitleRule.service.ts`

```ts
import { prisma } from "../db";
import { AppError } from "../lib/appError";

export type AppliedRule = {
  title: string;
  visibilityMode: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  ruleId: string | null;
  rawTitle: string;
};

/**
 * 純粋関数: 既に取得済の rule[] を rawTitle に適用。
 * - priority 昇順で評価、最初に hit したルールを使う
 * - どれも hit しなければ title=rawTitle, visibility=NORMAL, ruleId=null
 */
export function applyTitleRules(
  rawTitle: string,
  rules: Array<{ id: string; matchType: string; pattern: string; replaceWith: string | null; visibilityMode: string }>,
): AppliedRule {
  for (const r of rules) {
    if (matches(r.matchType, r.pattern, rawTitle)) {
      return {
        title: r.replaceWith ?? "予定",
        visibilityMode: r.visibilityMode as AppliedRule["visibilityMode"],
        ruleId: r.id,
        rawTitle,
      };
    }
  }
  return { title: rawTitle, visibilityMode: "NORMAL", ruleId: null, rawTitle };
}

function matches(matchType: string, pattern: string, target: string): boolean {
  if (matchType === "EQUALS") return target === pattern;
  if (matchType === "CONTAINS") return target.includes(pattern);
  if (matchType === "REGEX") {
    try {
      return new RegExp(pattern).test(target);
    } catch {
      return false; // invalid REGEX は match しない (skip)
    }
  }
  return false;
}

/**
 * ユーザーに default rule が無ければ作成する。
 * default rule = matchType=REGEX, pattern=".*", replaceWith="予定", priority=9999
 */
export async function ensureDefaultRule(userId: string) {
  const existing = await prisma.icsTitleRule.findFirst({
    where: { userId, isDefault: true },
  });
  if (existing) return existing;
  return prisma.icsTitleRule.create({
    data: {
      userId,
      matchType: "REGEX",
      pattern: ".*",
      replaceWith: "予定",
      visibilityMode: "TITLE_MAPPED",
      priority: 9999,
      isDefault: true,
    },
  });
}

export async function listRules(userId: string) {
  return prisma.icsTitleRule.findMany({
    where: { userId },
    orderBy: { priority: "asc" },
  });
}

export async function createRule(userId: string, input: {
  matchType: "EQUALS" | "CONTAINS" | "REGEX";
  pattern: string;
  replaceWith?: string | null;
  visibilityMode?: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  priority?: number;
}) {
  if (input.matchType === "REGEX") {
    try { new RegExp(input.pattern); } catch { throw new AppError(400, "INVALID_REGEX", "Pattern is invalid RegExp"); }
  }
  return prisma.icsTitleRule.create({
    data: {
      userId,
      matchType: input.matchType,
      pattern: input.pattern,
      replaceWith: input.replaceWith ?? "予定",
      visibilityMode: input.visibilityMode ?? "TITLE_MAPPED",
      priority: input.priority ?? 100,
      isDefault: false,
    },
  });
}

export async function patchRule(userId: string, ruleId: string, patch: {
  matchType?: "EQUALS" | "CONTAINS" | "REGEX";
  pattern?: string;
  replaceWith?: string | null;
  visibilityMode?: "NORMAL" | "TITLE_MAPPED" | "BUSY_ONLY";
  priority?: number;
}) {
  const rule = await prisma.icsTitleRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.userId !== userId) throw new AppError(404, "NOT_FOUND", "Rule not found");
  if (rule.isDefault) throw new AppError(409, "DEFAULT_RULE_LOCKED", "Default rule cannot be edited (only deleted)");
  if (patch.matchType === "REGEX" && patch.pattern) {
    try { new RegExp(patch.pattern); } catch { throw new AppError(400, "INVALID_REGEX", "Pattern is invalid RegExp"); }
  }
  return prisma.icsTitleRule.update({
    where: { id: ruleId },
    data: {
      ...(patch.matchType !== undefined ? { matchType: patch.matchType } : {}),
      ...(patch.pattern !== undefined ? { pattern: patch.pattern } : {}),
      ...(patch.replaceWith !== undefined ? { replaceWith: patch.replaceWith } : {}),
      ...(patch.visibilityMode !== undefined ? { visibilityMode: patch.visibilityMode } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    },
  });
}

export async function deleteRule(userId: string, ruleId: string) {
  const rule = await prisma.icsTitleRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.userId !== userId) throw new AppError(404, "NOT_FOUND", "Rule not found");
  await prisma.icsTitleRule.delete({ where: { id: ruleId } });
}
```

---

## §5 API (HTTP layer)

すべて Hono ルート。既存パターン (`sessionMiddleware` + `setupGuard` + `zValidator`) を継続。

### 5.1 ルート追加: `apps/api/src/routes/rooms.ts` (拡張)

```ts
// 既存の registerRoomRoutes() 内に追加

const IcsImportParam = z.object({ id: z.string(), importId: z.string() });
const EditScopeBody = UpdateRoomEventInput.extend({
  editScope: z.enum(["single", "future", "all"]).default("all"),
  originalDate: z.string().datetime().optional(), // single/future のとき必須
});
const EditScopeQuery = z.object({ scope: z.enum(["single", "future", "all"]).default("all"), originalDate: z.string().datetime().optional() });

// .ics 取込
app.post(
  "/api/rooms/:id/ics-imports",
  sessionMiddleware,
  setupGuard,
  zValidator("param", IdParam),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) throw new AppError(400, "FILE_REQUIRED", "file field required");
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await createIcsImport({
      userId: c.get("user").id,
      roomId: c.req.valid("param").id,
      filename: file.name ?? "calendar.ics",
      buf,
    });
    return c.json({ import: dtoIcsImport(result.import), parsedCount: result.parsed.length, dedup: result.dedup }, 201);
  },
);

app.get(
  "/api/rooms/:id/ics-imports",
  sessionMiddleware,
  setupGuard,
  zValidator("param", IdParam),
  async (c) => c.json({ imports: await listIcsImports(c.get("user").id, c.req.valid("param").id) }),
);

app.get(
  "/api/rooms/:id/ics-imports/:importId/preview",
  sessionMiddleware,
  setupGuard,
  zValidator("param", IcsImportParam),
  async (c) => c.json(await previewIcsImport(c.get("user").id, c.req.valid("param").importId)),
);

app.post(
  "/api/rooms/:id/ics-imports/:importId/commit",
  sessionMiddleware,
  setupGuard,
  zValidator("param", IcsImportParam),
  async (c) => c.json(await commitIcsImport(c.get("user").id, c.req.valid("param").importId)),
);

app.delete(
  "/api/rooms/:id/ics-imports/:importId",
  sessionMiddleware,
  setupGuard,
  zValidator("param", IcsImportParam),
  async (c) => {
    await deleteIcsImport(c.get("user").id, c.req.valid("param").importId);
    return c.json({ ok: true });
  },
);

// 編集 3 択 (既存 PATCH /api/rooms/:id/events/:eventId を置き換え)
app.patch(
  "/api/rooms/:id/events/:eventId",
  sessionMiddleware,
  setupGuard,
  zValidator("param", EventParam),
  zValidator("json", EditScopeBody),
  async (c) => {
    const event = await updateRoomEventWithScope(
      c.get("user").id,
      c.req.valid("param").id,
      c.req.valid("param").eventId,
      c.req.valid("json"),
    );
    return c.json({ event });
  },
);

// 削除 3 択 (既存 DELETE を置き換え)
app.delete(
  "/api/rooms/:id/events/:eventId",
  sessionMiddleware,
  setupGuard,
  zValidator("param", EventParam),
  zValidator("query", EditScopeQuery),
  async (c) => {
    await deleteRoomEventWithScope(
      c.get("user").id,
      c.req.valid("param").id,
      c.req.valid("param").eventId,
      c.req.valid("query"),
    );
    return c.json({ ok: true });
  },
);
```

`dtoIcsImport()` は `IcsImport` row → API DTO 変換。

### 5.2 ルート追加: `apps/api/src/routes/me.ts` (拡張)

```ts
const RuleId = z.object({ ruleId: z.string() });
const CreateRuleInput = z.object({
  matchType: z.enum(["EQUALS", "CONTAINS", "REGEX"]),
  pattern: z.string().min(1).max(500),
  replaceWith: z.string().max(120).nullable().optional(),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).optional(),
  priority: z.number().int().min(0).max(9998).optional(),
});
const PatchRuleInput = CreateRuleInput.partial();

app.get("/api/me/ics-title-rules", sessionMiddleware, setupGuard, async (c) => {
  return c.json({ rules: await listRules(c.get("user").id) });
});

app.post(
  "/api/me/ics-title-rules",
  sessionMiddleware,
  setupGuard,
  zValidator("json", CreateRuleInput),
  async (c) => c.json({ rule: await createRule(c.get("user").id, c.req.valid("json")) }, 201),
);

app.patch(
  "/api/me/ics-title-rules/:ruleId",
  sessionMiddleware,
  setupGuard,
  zValidator("param", RuleId),
  zValidator("json", PatchRuleInput),
  async (c) => c.json({ rule: await patchRule(c.get("user").id, c.req.valid("param").ruleId, c.req.valid("json")) }),
);

app.delete(
  "/api/me/ics-title-rules/:ruleId",
  sessionMiddleware,
  setupGuard,
  zValidator("param", RuleId),
  async (c) => {
    await deleteRule(c.get("user").id, c.req.valid("param").ruleId);
    return c.json({ ok: true });
  },
);
```

### 5.3 `GET /api/rooms/:id/week` の差し替え

`room.service.ts` の `getRoomWeek` を以下に置換 (差分のみ抜粋):

```ts
export async function getRoomWeek(userId: string, roomId: string, weekStart: Date) {
  const { room } = await assertMember(roomId, userId);
  const weekEnd = dayjs(weekStart).add(7, "day").subtract(1, "millisecond").toDate();

  // (members / occurrences は v6 と同じ)
  // ...

  // ★ v6 までの roomEvents を「展開済 occurrence」に差し替え
  const occurrences = await expandRoomEvents(roomId, weekStart, weekEnd);

  // visibility 適用 (本人以外には rawTitle を露出させない)
  const visibleEvents = occurrences.map(o => applyVisibility(o, userId));

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    members: /* v6 と同じ */,
    meetings: /* v6 と同じ */,
    roomEvents: visibleEvents,
  };
}

function applyVisibility(o: ExpandedOccurrence, viewerId: string) {
  const isAuthor = o.authorId === viewerId;
  let title = o.title;
  let description = o.description;
  if (o.visibilityMode === "BUSY_ONLY" && !isAuthor) {
    title = "予定あり";
    description = null;
  }
  // BUSY_ONLY だろうと TITLE_MAPPED だろうと、authorId === viewerId なら rawTitle も含めて返す
  // 但し rawTitle は **本人のみ** に渡す (他メンバーには null)
  return {
    id: o.seriesId,                        // series 単位 id (同 occurrence は overrideId 等で識別)
    seriesId: o.seriesId,
    roomId,                                // 既存通り
    authorId: o.authorId,
    title,
    rawTitle: isAuthor ? o.rawTitle : null,
    description,
    start: o.start.toISOString(),
    end: o.end.toISOString(),
    isAllDay: o.isAllDay,
    color: o.color,
    source: o.source,
    visibilityMode: o.visibilityMode,
    isRecurringOccurrence: o.isRecurringOccurrence,
    recurrenceRule: isAuthor ? o.recurrenceRule : null,   // 他人には RRULE も非露出
    occurrenceDate: o.occurrenceDate.toISOString(),       // 編集 3 択で client が送り返す
    overrideId: o.overrideId,
    createdAt: /* 既存通り (series.createdAt) */,
  };
}
```

### 5.4 zod DTO: `packages/shared/src/schemas/room.ts` 改修

```ts
export const RoomEventDto = z.object({
  id: z.string(),
  seriesId: z.string(),
  roomId: z.string(),
  authorId: z.string(),
  title: z.string(),
  rawTitle: z.string().nullable(),
  description: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  isAllDay: z.boolean(),
  color: z.string().nullable(),
  source: z.enum(["MANUAL", "ICS_FILE", "ICS_URL", "GOOGLE_OAUTH"]),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]),
  isRecurringOccurrence: z.boolean(),
  recurrenceRule: z.string().nullable(),
  occurrenceDate: z.string(),
  overrideId: z.string().nullable(),
  createdAt: z.string(),
});

const RecurrenceInput = z.object({
  rrule: z.string().min(1).max(720),          // "FREQ=WEEKLY;BYDAY=MO,WE" (DTSTART は別)
  exDates: z.array(z.string().datetime()).default([]),  // 個別除外日 (ISO UTC)
  rDates: z.array(z.string().datetime()).default([]),
}).optional();

const RoomEventInputBase = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  isAllDay: z.boolean().default(false),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  recurrence: RecurrenceInput,
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]).default("NORMAL"),
});

export const CreateRoomEventInput = RoomEventInputBase.refine(
  (v) => new Date(v.end) > new Date(v.start),
  { message: "end must be after start" },
);

export const UpdateRoomEventInput = RoomEventInputBase.partial().extend({
  editScope: z.enum(["single", "future", "all"]).default("all"),
  originalDate: z.string().datetime().optional(),
}).refine(
  (v) => v.editScope === "all" || v.originalDate != null,
  { message: "originalDate required for scope=single|future" },
).refine(
  (v) => v.start == null || v.end == null || new Date(v.end) > new Date(v.start),
  { message: "end must be after start" },
);
```

### 5.5 zod DTO: `packages/shared/src/schemas/ics.ts` (新規)

```ts
import { z } from "zod";

export const IcsImportDto = z.object({
  id: z.string(),
  filename: z.string().nullable(),
  source: z.enum(["ICS_FILE", "ICS_URL", "GOOGLE_OAUTH"]),
  status: z.enum(["PENDING", "PARSED", "SUCCESS", "PARTIAL_ERROR", "FAILED"]),
  parsedEventCount: z.number().int(),
  committedEventCount: z.number().int(),
  skippedEventCount: z.number().int(),
  errorMessage: z.string().nullable(),
  committedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const IcsImportPreviewItem = z.object({
  uid: z.string(),
  rawTitle: z.string(),
  mappedTitle: z.string(),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]),
  ruleId: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  isRecurring: z.boolean(),
  rrule: z.string().nullable(),
});

export const IcsImportPreview = z.object({
  importId: z.string(),
  events: z.array(IcsImportPreviewItem),
});

export const IcsImportCommitResult = z.object({
  committed: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.string()),
});

export const IcsTitleRuleDto = z.object({
  id: z.string(),
  matchType: z.enum(["EQUALS", "CONTAINS", "REGEX"]),
  pattern: z.string(),
  replaceWith: z.string().nullable(),
  visibilityMode: z.enum(["NORMAL", "TITLE_MAPPED", "BUSY_ONLY"]),
  priority: z.number().int(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IcsImportDto = z.infer<typeof IcsImportDto>;
export type IcsImportPreview = z.infer<typeof IcsImportPreview>;
export type IcsImportCommitResult = z.infer<typeof IcsImportCommitResult>;
export type IcsTitleRuleDto = z.infer<typeof IcsTitleRuleDto>;
```

### 5.6 API レスポンスサンプル

#### POST /api/rooms/:id/ics-imports

リクエスト: multipart `file=<calendar.ics>`

レスポンス: `201`
```json
{
  "import": {
    "id": "clx0...",
    "filename": "calendar.ics",
    "source": "ICS_FILE",
    "status": "PARSED",
    "parsedEventCount": 42,
    "committedEventCount": 0,
    "skippedEventCount": 0,
    "errorMessage": null,
    "committedAt": null,
    "createdAt": "2026-05-27T12:00:00.000Z"
  },
  "parsedCount": 42,
  "dedup": false
}
```

#### GET /api/rooms/:id/ics-imports/:importId/preview

```json
{
  "importId": "clx0...",
  "events": [
    {
      "uid": "abc-123@google",
      "rawTitle": "デート",
      "mappedTitle": "予定",
      "visibilityMode": "TITLE_MAPPED",
      "ruleId": "default-rule-id",
      "start": "2026-06-01T00:00:00.000Z",
      "end": "2026-06-01T02:00:00.000Z",
      "isRecurring": false,
      "rrule": null
    }
  ]
}
```

#### POST /api/rooms/:id/ics-imports/:importId/commit

```json
{ "committed": 40, "skipped": 2, "errors": ["UID xyz: RRULE > 720 chars", "UID abc: VEVENT missing DTSTART"] }
```

---

## §6 UI / UX 設計

### 6.1 RecurrencePicker (新規)

ファイル: `apps/web/src/components/recurrence/RecurrencePicker.tsx`

`RoomEventCreateSheet` / `RoomEventDetailSheet` 内で使う。

#### Props

```ts
export type RecurrenceValue = {
  rrule: string | null;            // null = 繰り返しなし
  // exDates / rDates は MVP UI で編集しない (内部のみ)
};
export type RecurrencePickerProps = {
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
  start: Date;                     // RecurrencePicker は start の曜日 / 日付を preset 表示で使う
};
```

#### モック

```
┌──────────────────────────────────────┐
│ 繰り返し                              │
│ ┌──────────────────────────────────┐ │
│ │ なし                          ▼  │ │  ← select 1 個
│ └──────────────────────────────────┘ │
│  └─ オプション:                       │
│      なし                              │
│      毎日                              │
│      毎週 (火)                          │  ← start の曜日
│      平日のみ (月-金)                   │
│      毎月 5 日                          │  ← start の日付
│      毎月 第1火曜                       │  ← BYDAY=1TU 風
│      毎年 6月5日                        │
│      カスタム...                        │
│                                        │
│  ★ カスタム選択時                       │
│  ┌──────────────────────────────────┐│
│  │ 間隔  [N]   [日/週/月/年]         ││
│  │                                  ││
│  │ ─ 単位=週 ─                       ││
│  │ 曜日: [日][月●][火][水●][木][金][土]
│  │                                  ││
│  │ ─ 単位=月 ─                       ││
│  │ ○ 毎月 N 日                        ││
│  │ ○ 第○ 曜日                         ││
│  │                                  ││
│  │ ─ 終了 ─                          ││
│  │ ○ 終了日なし                       ││
│  │ ○ N 回繰り返す  [N]                ││
│  │ ○ 特定日まで  [date picker]        ││
│  │                                  ││
│  │ "毎週 月, 水"  ← rrule.toText() 日本語│
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘
```

#### preset → RRULE 文字列マップ

```ts
function presetToRRule(preset: string, start: Date): string | null {
  const day = ["SU","MO","TU","WE","TH","FR","SA"][start.getUTCDay()];
  switch (preset) {
    case "none":     return null;
    case "daily":    return "FREQ=DAILY";
    case "weekly":   return `FREQ=WEEKLY;BYDAY=${day}`;
    case "weekday":  return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "monthly_bymonthday": return `FREQ=MONTHLY;BYMONTHDAY=${start.getUTCDate()}`;
    case "monthly_byday":      return `FREQ=MONTHLY;BYDAY=${weekOrdinalOf(start)}${day}`;
    case "yearly":   return `FREQ=YEARLY;BYMONTH=${start.getUTCMonth()+1};BYMONTHDAY=${start.getUTCDate()}`;
    default:         return null; // custom は別途構築
  }
}

function weekOrdinalOf(d: Date): number {
  // 1-indexed: 1MO / 2MO / 3MO / 4MO / -1MO
  return Math.floor((d.getUTCDate() - 1) / 7) + 1;
}
```

#### Custom UI の state

```ts
type CustomState = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byDays: Array<"SU"|"MO"|"TU"|"WE"|"TH"|"FR"|"SA">;
  monthlyMode: "bymonthday" | "byday";
  endMode: "never" | "count" | "until";
  count: number;
  until: string;          // YYYY-MM-DD
};
```

`customStateToRRule(state)` で RRULE 文字列に変換、`rrule.fromString()` で validate して `toText()` で自然言語表示。

### 6.2 RoomEventCreateSheet (改修)

```diff
- export function RoomEventCreateSheet({ roomId, open, onClose }: ...) {
+ export function RoomEventCreateSheet({
+   roomId,
+   open,
+   onClose,
+   defaultDate,    // RoomCalendar 経由で「この日付に予定追加」想定
+ }: ...) {
    const create = useCreateRoomEvent(roomId);
    const [title, setTitle] = useState("");
    const [start, setStart] = useState(...);
    const [end, setEnd] = useState(...);
+   const [recurrence, setRecurrence] = useState<RecurrenceValue>({ rrule: null });
+   const [visibilityMode, setVisibilityMode] = useState<EventVisibility>("NORMAL");
    ...
    return (
      <BottomSheet ...>
        <Field label="タイトル" required>...</Field>
        <Field label="開始">...</Field>
        <Field label="終了">...</Field>
+       <RecurrencePicker value={recurrence} onChange={setRecurrence} start={new Date(start)} />
+       <Field label="表示モード">
+         <RadioGroup
+           value={visibilityMode}
+           onChange={setVisibilityMode}
+           options={[
+             { value: "NORMAL", label: "通常 (タイトル全員表示)" },
+             { value: "TITLE_MAPPED", label: "タイトル隠す (例: 予定)" },
+             { value: "BUSY_ONLY", label: "予定ありのみ (時間枠も非表示なし)" },
+           ]}
+         />
+       </Field>
        ... 保存ボタンで create.mutate({...,recurrence: recurrence.rrule ? recurrence : undefined, visibilityMode })
      </BottomSheet>
    );
  }
```

### 6.3 RecurrenceEditDialog (3 択、新規)

`RoomEventDetailSheet` 内で「保存」or「削除」を押した時に **シリーズ予定なら** 表示。単発予定 (`recurrenceRule=null`) なら表示せず `scope='all'` で直接送る。

```tsx
// apps/web/src/components/recurrence/RecurrenceEditDialog.tsx
export function RecurrenceEditDialog({
  open,
  mode,                              // "edit" | "delete"
  onClose,
  onConfirm,                         // (scope: "single" | "future" | "all") => void
}: {
  open: boolean;
  mode: "edit" | "delete";
  onClose: () => void;
  onConfirm: (scope: "single" | "future" | "all") => void;
}) {
  const [scope, setScope] = useState<"single" | "future" | "all">("single");
  const title = mode === "edit" ? "この予定を編集" : "この予定を削除";

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <RadioGroup
        value={scope}
        onChange={setScope}
        options={[
          { value: "single", label: "この予定のみ" },
          { value: "future", label: "これ以降のすべての予定" },
          { value: "all", label: "すべての予定" },
        ]}
      />
      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button type="button" variant={mode === "delete" ? "danger" : "primary"} onClick={() => onConfirm(scope)}>
          {mode === "delete" ? "削除" : "保存"}
        </Button>
      </div>
    </BottomSheet>
  );
}
```

#### 編集フロー

```
RoomEventDetailSheet 内で 「編集」ボタン押下
    ↓ (event.recurrenceRule != null?)
       │
   YES ├─→ RecurrenceEditDialog 表示
       │       ↓ ユーザーが scope を選ぶ
       │   onConfirm(scope)
       │       ↓
       │   PATCH /api/rooms/:id/events/:eventId
       │       body: { title, start, end, ..., editScope: scope, originalDate: event.occurrenceDate }
       │
    NO └─→ 直接 PATCH (editScope: "all", originalDate なし)
```

### 6.4 IcsImportWizard (新規)

ファイル: `apps/web/src/components/ics-import/IcsImportWizard.tsx`

#### モック (4 step)

```
[Step 1] アップロード
┌──────────────────────────────────┐
│ カレンダーを取り込む          ✕  │
├──────────────────────────────────┤
│  iPhone / Google カレンダーから   │
│  .ics ファイルをアップロード     │
│                                  │
│  ┌────────────────────────────┐  │
│  │  📁 ファイルを選択         │  │
│  │     (.ics, 5MB まで)       │  │
│  └────────────────────────────┘  │
│                                  │
│  ▼ 取り出し方を見る (折りたたみ)  │
│   - Google: 設定 > インポート…   │
│   - iPhone: 公開カレンダー…       │
│                                  │
│              [キャンセル]         │
└──────────────────────────────────┘

[Step 2] プレビュー (parse 後)
┌──────────────────────────────────┐
│ 取り込み内容を確認            ✕  │
├──────────────────────────────────┤
│  ✓ 42 件のイベントが見つかった   │
│                                  │
│  デフォルトでは「全部 → 予定」    │
│  に変換されます。                 │
│  細かいルールは [設定] から。     │
│                                  │
│  ─ 最初の 10 件 ─                │
│   06/01 (月) 09:00               │
│     "デート"      → "予定"         │
│   06/02 (火) 14:00               │
│     "授業"        → "予定"         │
│   ...                             │
│                                  │
│  [もう一度] [取り込む]            │
└──────────────────────────────────┘

[Step 3] commit 中
┌──────────────────────────────────┐
│ 取り込み中... (skeleton + spinner)│
└──────────────────────────────────┘

[Step 4] 結果
┌──────────────────────────────────┐
│ 取り込み完了                  ✕  │
├──────────────────────────────────┤
│  ✓ 40 件取り込んだ                │
│  ⚠ 2 件スキップ                   │
│      - UID xyz: RRULE > 720 chars │
│      - UID abc: DTSTART 欠落      │
│                                  │
│  [閉じる]   [ルールを編集]        │
└──────────────────────────────────┘
```

#### State

```ts
type Step = "upload" | "preview" | "committing" | "done" | "error";
type WizardState = {
  step: Step;
  file: File | null;
  importId: string | null;
  preview: IcsImportPreview | null;
  result: IcsImportCommitResult | null;
  error: string | null;
};
```

#### Hooks 接続

```ts
const upload = useUploadIcsImport(roomId);          // POST /api/rooms/:id/ics-imports
const preview = useIcsImportPreview(importId);      // GET .../preview
const commit = useCommitIcsImport(importId);        // POST .../commit
```

### 6.5 TitleRuleEditor (新規)

ファイル: `apps/web/src/components/ics-import/TitleRuleEditor.tsx`
配置先: 新規 route `/settings/calendar` (= `apps/web/src/routes/SettingsCalendar.tsx`)
AvatarMenu に「カレンダー設定」を追加 (v6 で削除した「みんなの時間割」枠を埋める形)。

#### モック

```
┌────────────────────────────────────┐
│ ← カレンダー設定                    │
├────────────────────────────────────┤
│ # タイトル正規化ルール              │
│ import したカレンダーのタイトルを   │
│ 別の文字に置き換えます。            │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ ⋮  デート → 予定 (CONTAINS)    │ │
│ │    表示モード: タイトル隠す     │ │
│ │    優先度: 10  [編集] [削除]    │ │
│ ├────────────────────────────────┤ │
│ │ ⋮  会議 → 会議 (EQUALS)        │ │
│ │    表示モード: 通常              │ │
│ │    優先度: 50  [編集] [削除]    │ │
│ ├────────────────────────────────┤ │
│ │ 🔒 すべて → 予定 (デフォルト)    │ │
│ │    表示モード: タイトル隠す      │ │
│ │    優先度: 9999  [編集不可][削除]│ │
│ └────────────────────────────────┘ │
│                                    │
│ [+ 新規ルールを追加]                │
└────────────────────────────────────┘
```

`⋮` = drag handle (priority 並び替え)。MVP では drag は不要、`priority` 数値直接編集で対応。Phase 1.5 で drag 化。

#### 編集モーダル

```
┌────────────────────────────────────┐
│ ルールを編集                  ✕    │
├────────────────────────────────────┤
│ 種別                                │
│ ○ 完全一致 (EQUALS)                 │
│ ● 部分一致 (CONTAINS)               │
│ ○ 正規表現 (REGEX)                  │
│                                    │
│ パターン                            │
│ [デート________________________]    │
│                                    │
│ 置換後                              │
│ [予定__________________________]    │
│ (空欄で「予定」)                    │
│                                    │
│ 表示モード                          │
│ ● 通常                              │
│ ○ タイトル隠す (TITLE_MAPPED)       │
│ ○ 予定ありのみ (BUSY_ONLY)          │
│                                    │
│ 優先度                              │
│ [10] (小さいほど優先)                │
│                                    │
│ [キャンセル]              [保存]     │
└────────────────────────────────────┘
```

### 6.6 RoomCalendar 改修

`RoomCalendar` の FAB ボタン領域に「⤓ カレンダー取り込み」を追加。

```diff
- {viewMode !== "month" ? (
-   <Button type="button" variant="primary" onClick={() => /* RoomEventCreateSheet open */}>
-     + 予定を追加
-   </Button>
- ) : null}
+ <div className="fixed bottom-24 right-5 flex flex-col gap-2 z-fab">
+   <button onClick={() => setImportWizardOpen(true)} aria-label="カレンダー取り込み"
+           className="grid h-12 w-12 place-items-center rounded-full bg-bg-elevated shadow-card">
+     <UploadIcon className="h-5 w-5" />
+   </button>
+   <button onClick={() => setCreateOpen(true)} aria-label="予定を追加"
+           className="grid h-14 w-14 place-items-center rounded-full bg-accent-500 shadow-glow-soft">
+     <PlusIcon className="h-6 w-6" />
+   </button>
+ </div>
+ <RoomEventCreateSheet roomId={roomId} open={createOpen} onClose={() => setCreateOpen(false)} defaultDate={selectedDate} />
+ <IcsImportWizard roomId={roomId} open={importWizardOpen} onClose={() => setImportWizardOpen(false)} />
```

### 6.7 RoomEventDetailSheet 改修

シリーズ予定の表示と編集 3 択への接続:

```tsx
function RoomEventDetailSheet({ event, ... }) {
  const isRecurring = event.isRecurringOccurrence;
  const isAuthor = event.authorId === me.id;

  return (
    <BottomSheet ...>
      <h2>{event.title}</h2>
      {isAuthor && event.rawTitle && event.rawTitle !== event.title ? (
        <p className="text-xs text-fg-tertiary">元: {event.rawTitle}</p>
      ) : null}
      {isRecurring ? (
        <p className="text-xs text-fg-secondary">
          🔁 {recurrenceToText(event.recurrenceRule, new Date(event.start))}
        </p>
      ) : null}
      ...
      {isAuthor ? (
        <div className="flex gap-2">
          <Button onClick={() => setEditDialogOpen(true)}>編集</Button>
          <Button variant="danger" onClick={() => setDeleteDialogOpen(true)}>削除</Button>
        </div>
      ) : null}

      <RecurrenceEditDialog
        open={editDialogOpen}
        mode="edit"
        onClose={() => setEditDialogOpen(false)}
        onConfirm={(scope) => {
          patch.mutate({
            title: editingTitle,
            ...
            editScope: isRecurring ? scope : "all",
            originalDate: isRecurring ? event.occurrenceDate : undefined,
          });
        }}
      />
      <RecurrenceEditDialog
        open={deleteDialogOpen}
        mode="delete"
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={(scope) => {
          del.mutate({ scope, originalDate: event.occurrenceDate });
        }}
      />
    </BottomSheet>
  );
}
```

### 6.8 visibility mode の見え方

| visibilityMode | 本人 (authorId === me) | 他メンバー |
|---|---|---|
| NORMAL | title をそのまま | title をそのまま |
| TITLE_MAPPED | title (mapped) + rawTitle 小文字補足 | title (mapped) のみ |
| BUSY_ONLY | title (mapped) | "予定あり" (強制) |

EventCard でのレンダ:

```tsx
function EventCard({ event }) {
  // event.title は API が visibility 適用済の値を返すので、フロントは何も判定しない
  return (
    <div ...>
      {event.title}
      {event.rawTitle && event.title !== event.rawTitle ? (
        <span className="text-xs text-fg-tertiary">({event.rawTitle})</span>
      ) : null}
    </div>
  );
}
```

---

## §7 挙動仕様 (Reviewer がテスト生成可)

### 7.1 RRULE 展開

| ID | 入力 | 期待 |
|---|---|---|
| RR-01 | `FREQ=DAILY` + dtstart=2026-06-01 + range=[06-01, 06-08] | 8 occurrences (06-01 〜 06-08) |
| RR-02 | `FREQ=WEEKLY;BYDAY=MO,WE,FR` + dtstart=2026-06-01(月) + range=2 週間 | 6 occurrences (月水金 × 2 週) |
| RR-03 | `FREQ=WEEKLY;INTERVAL=2` + dtstart=2026-06-01 + range=4 週間 | 2 occurrences (06-01, 06-15) |
| RR-04 | `FREQ=MONTHLY;BYMONTHDAY=15` + dtstart=2026-06-15 + range=3 か月 | 3 occurrences (6/15, 7/15, 8/15) |
| RR-05 | `FREQ=MONTHLY;BYMONTHDAY=-1` + dtstart=2026-06-30 + range=3 か月 | 3 occurrences (6/30, 7/31, 8/31) — 月末 |
| RR-06 | `FREQ=MONTHLY;BYDAY=-1FR` + dtstart=2026-06-26(最終金) + range=3 か月 | 3 occurrences (6/26, 7/31, 8/28) — 最終金曜 |
| RR-07 | `FREQ=WEEKLY;BYDAY=MO;UNTIL=20260615T000000Z` + dtstart=2026-06-01(月) | 3 occurrences (6/1, 6/8, 6/15) |
| RR-08 | `FREQ=WEEKLY;BYDAY=MO;COUNT=4` + dtstart=2026-06-01 | 4 occurrences |
| RR-09 | EXDATE=2026-06-08 + 上記 RR-08 | 3 occurrences (6/8 が除外) |
| RR-10 | RDATE=2026-06-04 + RR-08 | 5 occurrences (6/4 が追加) |
| RR-11 | RRULE 文字列が 721 char | API が 400 INVALID_RRULE |
| RR-12 | RRULE 文字列が syntactically invalid (`FREQ=BLAH`) | API が 400 INVALID_RRULE |
| RR-13 | range 1 年超 | API が 400 RANGE_TOO_LARGE |
| RR-14 | recurrenceRule=null の単発 event | 単発で 1 occurrence (= start..end が range と重なれば) |
| RR-15 | series.start が range より前、UNTIL が range より後 | range 内の occurrence 全てを展開 |

### 7.2 編集 3 択

| ID | 操作 | 期待 |
|---|---|---|
| ES-01 | scope=single + cancel | `RoomEventOverride` 1 行作成 (isCancelled=true)、元 series 不変、次回 week 展開で当該回が消える |
| ES-02 | scope=single + newTitle | override 1 行作成 (newTitle=...)、week 展開で当該回のみ新 title |
| ES-03 | scope=future | 元 series.recurrenceRule に `UNTIL=originalDate-1ms` 追加、新 series (recurrenceRule = 元の UNTIL を抜いたもの) 作成、week 展開で originalDate 以前は元 series、以降は新 series |
| ES-04 | scope=all | 元 series.recurrenceRule / start / end / title などを直接 update、override は全保持 |
| ES-05 | scope=single + recurrenceRule=null の event に対し | 400 NOT_RECURRING |
| ES-06 | scope=future + originalDate 未指定 | 400 ORIGINAL_DATE_REQUIRED |
| ES-07 | scope=future + recurrenceRule=null | 400 NOT_RECURRING |
| ES-08 | 削除 scope=single | override 1 行 (isCancelled=true) のみ作成、series 不変 |
| ES-09 | 削除 scope=future | 元 series に UNTIL=originalDate-1ms、新 series は作らない (= 削除なので) |
| ES-10 | 削除 scope=all | series 行ごと delete (CASCADE で override / 関連も削除) |

### 7.3 .ics import

| ID | 操作 | 期待 |
|---|---|---|
| IM-01 | Google Cal export .ics を upload | parsedEventCount > 0、status=PARSED |
| IM-02 | iCloud export .ics (Floating time 含む) を upload | Floating time が Asia/Tokyo として UTC 化される |
| IM-03 | Outlook export .ics (CRLF + Win-1252) を upload | エンコーディング自動検出で UTF-8 化、parse 成功 |
| IM-04 | 5MB 超のファイル | 413 FILE_TOO_LARGE |
| IM-05 | 空ファイル | 400 INVALID_ICS (Empty file) |
| IM-06 | 中身 garbage の .ics | 400 INVALID_ICS |
| IM-07 | 同一 contentHash の re-upload | dedup=true で既存 import を返す (新規 row 作らず) |
| IM-08 | preview レスポンス | parsed.events 全件、mapping 適用後の mappedTitle を含む |
| IM-09 | commit 1 回目 | committedEventCount = parsedEventCount、status=SUCCESS、RoomEvent 行 N 個生成 |
| IM-10 | 同 import を commit 2 回目 | 409 ALREADY_COMMITTED |
| IM-11 | commit 後に同 UID の VEVENT を SEQUENCE up で再 import | UPDATE される (= RoomEvent の externalSeq up) |
| IM-12 | commit 後に同 UID の VEVENT を SEQUENCE 同で再 import | SKIP (skipped++) |
| IM-13 | commit 後に同 UID の VEVENT を LAST-MODIFIED 古い値で再 import | SKIP |
| IM-14 | VEVENT に RECURRENCE-ID 持ち | master VEVENT (= 同 UID で RECURRENCE-ID なし) があれば override 行作成 |
| IM-15 | VEVENT に RECURRENCE-ID 持ち + master 不在 | skipped++、errorMessage に記録 |
| IM-16 | DELETE /api/rooms/:id/ics-imports/:importId | 該当 import + 紐づく RoomEvent 全件 cascade 削除 |
| IM-17 | 非メンバーが POST upload | 403 NOT_MEMBER |
| IM-18 | 非作者が DELETE import | 404 NOT_FOUND (= userId 不一致でアクセス不可) |
| IM-19 | RRULE 721 char の VEVENT | skipped++、errorMessage に記録 |
| IM-20 | DESCRIPTION 持ちの VEVENT | RoomEvent.description は null (破棄)、rawTitle と title のみ保存 |

### 7.4 タイトル正規化

| ID | rules | rawTitle | 期待 |
|---|---|---|---|
| TR-01 | `[{matchType:EQUALS, pattern:"デート", replaceWith:"予定", priority:10}]` | "デート" | mapped="予定" |
| TR-02 | 同上 | "アキバデート" | match なし (EQUALS は完全一致のみ) → mapped="アキバデート" or default rule で「予定」(default あれば) |
| TR-03 | `[{CONTAINS, "デート", "予定", priority:10}]` | "アキバデート" | mapped="予定" |
| TR-04 | `[{REGEX, "^(デート|彼女).*", "予定", priority:10}]` | "デート" | mapped="予定" |
| TR-05 | 同 TR-04 | "彼女と公園" | mapped="予定" |
| TR-06 | 同 TR-04 | "公園で彼女と" | match なし (^ 制約) |
| TR-07 | `[{REGEX, "[invalid", ...}]` (invalid regex) | "デート" | rule 内で例外 swallow、match なし扱い |
| TR-08 | priority 10 と priority 20 の 2 rule どちらも hit | priority 10 (小さい方) が適用 |
| TR-09 | default rule (priority 9999) + user rule 1 個 (priority 50) | user rule にマッチしない "ランチ" は default rule で "予定" に |
| TR-10 | rule 0 個 (default も削除済) | mapped=rawTitle、visibilityMode=NORMAL |
| TR-11 | default rule の PATCH | 409 DEFAULT_RULE_LOCKED |
| TR-12 | default rule の DELETE | 200 OK (削除可能、次回 import 時に再生成) |
| TR-13 | replaceWith=null + matchType=CONTAINS | mapped="予定" (fallback) |
| TR-14 | visibilityMode=BUSY_ONLY のルールが hit | RoomEvent.visibilityMode=BUSY_ONLY、week endpoint で他メンバーから title="予定あり" |
| TR-15 | priority < 0 | 400 (zod min(0)) |
| TR-16 | priority = 9999 (default と衝突) | 400 (zod max(9998)) |

### 7.5 visibility / プライバシー

| ID | 設定 | viewer | 期待 |
|---|---|---|---|
| VS-01 | visibilityMode=NORMAL, title="ランチ" | author | title="ランチ", rawTitle=null |
| VS-02 | 同上 | other member | title="ランチ", rawTitle=null |
| VS-03 | visibilityMode=TITLE_MAPPED, title="予定", rawTitle="デート" | author | title="予定", rawTitle="デート" |
| VS-04 | 同上 | other member | title="予定", rawTitle=null |
| VS-05 | visibilityMode=BUSY_ONLY, title="予定", rawTitle="デート" | author | title="予定", rawTitle="デート" |
| VS-06 | 同上 | other member | title="予定あり" (強制置換), rawTitle=null, description=null |
| VS-07 | 同上 | other member | recurrenceRule=null (RRULE も非露出) |
| VS-08 | 同上 | other member | start / end / occurrenceDate は露出 (時間枠は隠さない、Calendly 風) |

### 7.6 week endpoint

| ID | 操作 | 期待 |
|---|---|---|
| WK-01 | 単発 RoomEvent が範囲内 | roomEvents に 1 行 |
| WK-02 | 単発 RoomEvent が範囲外 | roomEvents に 0 行 |
| WK-03 | RRULE=WEEKLY series で範囲内に 7 occurrences | roomEvents に 7 行、全行 seriesId 同一、各行 occurrenceDate 異なる |
| WK-04 | override で cancel された occurrence | 該当 date の行が消える |
| WK-05 | override で newTitle | 該当行 title=newTitle、他行は元 title |
| WK-06 | 同一 roomId に 50 series | レスポンス 50 × occurrences、500ms 以内 (パフォーマンス目安) |
| WK-07 | 非メンバーが GET | 403 NOT_MEMBER |

### 7.7 既存機能との非干渉

| ID | 操作 | 期待 |
|---|---|---|
| EX-01 | v6 で作成済の単発 RoomEvent を GET | 既存通り取得可、`source=MANUAL`, `visibilityMode=NORMAL` |
| EX-02 | v6 までの client (RoomEventDto 古い形) が GET | 新 field を ignore してエラーなく表示 (= 既存フィールドは破壊しない) |
| EX-03 | Meeting / MeetingOccurrence への影響 | 一切無し (テストは既存 roomWeek.test.ts でカバー済) |
| EX-04 | 既存 PATCH /api/rooms/:id/events/:eventId (body に editScope なし) | editScope=all がデフォ、既存挙動と互換 |

---

## §8 MVP スコープと Phase 分け

### Phase 1 (v7 本体、今回実装)

- Prisma schema 拡張 (RoomEvent 10 列追加 + 新 3 model + enum 4 個)
- RRULE 作成 / 編集 (3 択) / 削除 (3 択)
- RRULE 展開 (`/api/rooms/:id/week`)
- .ics file upload (5MB) + parse + preview + commit
- IcsTitleRule CRUD + default rule auto-create
- visibility 3 段階 (NORMAL / TITLE_MAPPED / BUSY_ONLY)
- フロント: RecurrencePicker, RecurrenceEditDialog, IcsImportWizard, TitleRuleEditor

### Phase 1.5 (次回想定、今回は実装しない)

- URL subscribe (webcal:// / HTTPS)
- Cron polling (6 時間毎) + ETag / If-Modified-Since
- IcsImport.url の envelope encryption
- TitleRuleEditor の drag-and-drop
- IcsImport.rawText を SUCCESS 後 7 日で nullify
- 月 view での RoomEvent (occurrence) 表示

### Phase 2 (将来)

- Google Calendar OAuth + watch (即時同期)
- LLM ベース auto-categorize (Claude Haiku)
- .ics export (ical-generator)
- RoomEvent.description / location / attendees の保存
- User.timezone カラム + TZID 選択 UI

---

## §9 テスト基盤

### 9.1 フレームワーク

- Backend: **vitest** (既存 `apps/api/vitest.config.ts`)
- Frontend: **vitest + @testing-library/react** (既存 `apps/web/vitest.config.ts`)
- DB は per-test SQLite (`tests/helpers/db.ts` パターンを継続)
- MSW (`tests/msw/`) でフロントの API mocking

### 9.2 テスト配置先

```
apps/api/tests/
├── rrule-expansion.test.ts          (新) — RR-01〜15 (§7.1)
├── editScope.test.ts                (新) — ES-01〜10 (§7.2)
├── icsImport.test.ts                (新) — IM-01〜20 (§7.3)
├── icsTitleRule.test.ts             (新) — TR-01〜16 (§7.4)
├── visibility.test.ts               (新) — VS-01〜08 (§7.5)
├── roomWeek-v7.test.ts              (新) — WK-01〜07 (§7.6)
└── compatibility-v6.test.ts         (新) — EX-01〜04 (§7.7)

apps/api/tests/fixtures/ics/
├── google-export.ics                (新) — Google Cal export (UTF-8)
├── icloud-floating.ics              (新) — iCloud (Floating time)
├── outlook-cp1252.ics               (新) — Outlook (Win-1252)
├── single-event.ics                 (新) — RRULE なし 1 個
├── weekly-mwf.ics                   (新) — FREQ=WEEKLY;BYDAY=MO,WE,FR
├── monthly-last-friday.ics          (新) — FREQ=MONTHLY;BYDAY=-1FR
├── with-exdate.ics                  (新) — EXDATE 1 件
├── with-recurrence-id.ics           (新) — RECURRENCE-ID 持ち override
├── empty.ics                        (新) — 空 (テスト用)
└── garbage.ics                      (新) — VCALENDAR でない

apps/web/tests/
├── recurrence/RecurrencePicker.test.tsx  (新)
├── recurrence/RecurrenceEditDialog.test.tsx (新)
├── ics-import/IcsImportWizard.test.tsx   (新)
├── ics-import/TitleRuleEditor.test.tsx   (新)
└── rooms/RoomEventDetailSheet-v7.test.tsx (新)
```

### 9.3 主要テストパターン (Reviewer 向けガイド)

#### Backend: `rrule-expansion.test.ts`

```ts
describe("RRULE expansion", () => {
  it("RR-01: FREQ=DAILY expands 8 occurrences over 8 days", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });
    await db.roomEvent.create({
      data: {
        roomId: room.id, authorId: owner.user.id, title: "Daily",
        start: new Date("2026-06-01T00:00:00Z"),
        end: new Date("2026-06-01T01:00:00Z"),
        recurrenceRule: "FREQ=DAILY",
        source: "MANUAL", visibilityMode: "NORMAL",
      },
    });
    const res = await requestJson(app, `/api/rooms/${room.id}/week?weekStart=2026-06-01`, {
      method: "GET", headers: { Cookie: owner.cookie },
    });
    const week = await json(res) as any;
    expect(week.roomEvents).toHaveLength(7);  // 1 週分 = 7 occurrences
    // 各 occurrenceDate が連続日
  });
  // ... RR-02 〜 RR-15
});
```

#### Backend: `icsImport.test.ts`

```ts
import fs from "node:fs/promises";
import path from "node:path";

describe("ICS import", () => {
  it("IM-01: parses Google Cal export and counts events", async () => {
    const db = prisma();
    const owner = await setupCompleteUser(db);
    const room = await createRoom(db, { ownerId: owner.user.id });
    const buf = await fs.readFile(path.join(__dirname, "fixtures/ics/google-export.ics"));
    const fd = new FormData();
    fd.append("file", new File([buf], "calendar.ics", { type: "text/calendar" }));
    const res = await app.request(`/api/rooms/${room.id}/ics-imports`, {
      method: "POST",
      headers: { Cookie: owner.cookie },
      body: fd,
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.parsedCount).toBeGreaterThan(0);
    expect(body.import.status).toBe("PARSED");
  });
  // ... IM-02 〜 IM-20
});
```

#### Frontend: `RecurrencePicker.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

it("preset 'weekly' produces FREQ=WEEKLY;BYDAY=<start day>", async () => {
  const onChange = vi.fn();
  render(
    <RecurrencePicker
      value={{ rrule: null }}
      onChange={onChange}
      start={new Date("2026-06-02T00:00:00Z")} // 火曜
    />,
  );
  await userEvent.selectOptions(screen.getByLabelText("繰り返し"), "weekly");
  expect(onChange).toHaveBeenCalledWith({ rrule: "FREQ=WEEKLY;BYDAY=TU" });
});
```

### 9.4 既存テストの修正範囲

| 既存テストファイル | 修正方針 |
|---|---|
| `apps/api/tests/roomWeek.test.ts` | レスポンス DTO に新フィールド (`seriesId`, `isRecurringOccurrence`, `occurrenceDate`, `source`, `visibilityMode`) が追加されるため、existing assertion が **`expect(events).toHaveLength(n)` 系のみで title / start を緩めにチェックしていれば壊れない**。新 field を含むかどうかは新規テストで確認。 |
| `apps/api/tests/roomEvent.test.ts` | `PATCH /events/:id` の body に `editScope` がデフォ追加されるが、未指定なら `"all"` で従来挙動 (= EX-04)。既存 assertion はそのまま動く。 |
| `apps/web/tests/...` | RoomCalendar / RoomTimetable の hook シグネチャは不変なので、既存 test は壊れない |

---

## §10 不採用案

### 10.1 事前展開方式 (Cal.com 流)

**案**: RRULE シリーズ作成時に N 回分の `RoomEventOccurrence` 行を生成、week endpoint は単純 WHERE で取る。

**却下理由**:
- シリーズ編集時に大量 UPDATE/DELETE が発生 (例: scope=all で title 変更 → 100 occurrence を全部 update)
- UNTIL 無しシリーズは事前展開しようがない (5 年先まで埋める方針は無理がある)
- Atender の RoomEvent シリーズ数想定 = ルーム 1 個あたり数十程度。オンザフライ展開で十分 (1 week = 50 series × 7 occurrence = 350 件、< 100ms)
- Meeting (時間割) は事前展開だが、それは出欠記録 (`AttendanceRecord`) との JOIN 要件があるため。RoomEvent は出欠記録なし、JOIN 要件なし → オンザフライで足りる

### 10.2 RRULE を JSON 構造化保存

**案**: `recurrence Json` (= `{freq:"WEEKLY", byDay:["MO","WE"], until:"..."}`) で保存。

**却下理由**:
- Google Cal API と互換性が落ちる (将来 OAuth 連携時に変換コスト)
- `.ics export` 時に再シリアライズ必要
- `rrule` npm の入力形式 (= RRULE 文字列) からズレ、変換 layer が 1 つ増える
- SQLite の Json index 不可なので保存方式の優位性なし

### 10.3 RoomEvent と Meeting を統合

**案**: `Meeting` を「繰り返し定義」、`RoomEvent` を「単発」と切り分けず、`Event` 1 model で `recurrenceRule` 持ちなら時間割、null なら単発、と扱う。

**却下理由**:
- `Meeting` は `Course` / `AttendanceRecord` と JOIN しているドメインオブジェクト、`RoomEvent` は単純な「予定」
- 統合すると `AttendanceRecord.meetingId` を `eventId` にする必要があり、既存 schema を破壊
- v7 制約「既存 v6 を壊さない」「Meeting 系には触らない」に反する

### 10.4 .ics URL subscribe を MVP に含める

**案**: file upload と同じ Phase 1 で webcal:// / HTTPS URL subscribe + cron polling を出す。

**却下理由**:
- secret URL を DB に保存 → 暗号化必要 (envelope encryption pattern 別途設計)
- cron 実装 (node-cron / Coolify scheduled task) のセットアップが MVP には重い
- 学生 iPhone ユーザー (Touri 想定 main) は file export → upload で十分
- ETag / If-Modified-Since の運用ロジック + 失敗時 retry の設計コスト

### 10.5 Google Cal OAuth を MVP に含める

**案**: Google Cal API v3 + watch を最初から繋ぐ。

**却下理由**:
- GCP 審査 (calendar.events スコープは sensitive scope) で数週間
- watch endpoint の HTTPS callback 設定が Coolify 環境で煩雑
- 学生主体ユーザーは iPhone iCloud が多い → 投資効率悪い

### 10.6 LLM auto-categorize を MVP に含める

**案**: Claude Haiku で SUMMARY → カテゴリ自動推論。

**却下理由**:
- 推論コスト (1 import = 数十円〜) を最初から請求 / 自社負担するか決まっていない
- ユーザー定義 rule 3 種 (EQUALS/CONTAINS/REGEX) + デフォルト「全部 → 予定」で十分 (Researcher 結論 D-4)
- 失敗パターン (例: 「会議」を「予定」にマップしてしまう、ユーザーが意図しない) のリカバリ設計コスト

### 10.7 occurrence を行として返す (= ID を occurrenceId に統一)

**案**: week endpoint の roomEvents 各行を `id = "${seriesId}:${occurrenceDate}"` で識別。

**却下理由**:
- 既存 v6 client は `event.id` でキャッシュキーを作っているため、id がシリーズ間で重複しないと安全
- v7 では `id = seriesId` (同シリーズの全 occurrence で同 id)、`occurrenceDate` で区別する。client は `(seriesId, occurrenceDate)` の組をキーに扱う
- 既存 client コードを最小変更で互換維持できる

### 10.8 visibility を per-room 設定にする

**案**: `Room.defaultVisibilityMode` を持ち、RoomEvent ごとは継承。

**却下理由**:
- 同じルーム内でも「ランチ会 (NORMAL)」と「個人予定 (BUSY_ONLY)」を混在させたい (Touri 想定)
- per-event 制御の方が柔軟

### 10.9 multer / multipart middleware を追加

**案**: `multer` を依存に追加し、Express 風 middleware で file 受信。

**却下理由**:
- Hono は `c.req.parseBody()` で multipart をネイティブサポート (4.x)
- 依存追加最小化の制約

---

## §11 受け入れ基準 (MVP 完了)

- [ ] `pnpm --filter @atender/api db:migrate dev` が migration_20260527140000 を適用、既存データ破壊なし
- [ ] `pnpm --filter @atender/api test` で新規 6 ファイル + 既存 21 ファイル全 GREEN
- [ ] `pnpm --filter @atender/web test` で新規 5 ファイル + 既存全 GREEN
- [ ] 手動: Google Cal export (`https://calendar.google.com/calendar/ical/<email>/private-<token>/basic.ics` 等) を upload → preview → commit → RoomCalendar の week view で「予定」が表示される
- [ ] 手動: 繰り返し予定 (FREQ=WEEKLY) を作成 → week view で 7 occurrence、RoomEventDetailSheet の編集ボタンで 3 択ダイアログ表示
- [ ] 手動: visibilityMode=BUSY_ONLY の RoomEvent を別ユーザーで GET /week すると title="予定あり"
- [ ] 手動: TitleRuleEditor で CONTAINS rule を追加し、その後の import で適用される

---

## §12 Architect への補足 (Developer / Reviewer 向け)

- **node-ical の型は弱い** (`@types/node-ical` が存在せず、独自定義に頼る)。`icsParse.ts` 内の `IcalVEvent` を 1 か所に集約し、TypeScript の `as unknown as IcalVEvent` cast を許す。Developer はこの cast を他箇所で複製しない。
- **rrule npm の WKST デフォルト**: `WKST=MO` (週開始月曜)。Apple Cal の WKST 無視挙動はサーバー側では関係ない (= rrule npm の解釈に任せる)。
- **Floating time 解釈**: `Asia/Tokyo` 固定。node-ical の挙動が node サーバーの local TZ に依存するため、サーバーの `process.env.TZ=Asia/Tokyo` を設定するか、`icsParse.ts` 内で明示補正する (上記 `toUtc()` 実装)。Reviewer は両ケースを fixture でカバー。
- **migration の SQLite 制約**: Prisma 6.19 では SQLite で `ALTER TABLE ADD COLUMN ... REFERENCES` が制限される。`importId` FK は **table recreation** で実装される。Developer は `prisma migrate dev` 後の SQL ファイルを目視確認し、本設計書 §2.6 と同等の DDL になっているか検証する。
- **既存 cuidToHsl の流用**: メンバー色は v6 と同じく `apps/api/src/lib/cuidToHsl.ts` を使う。v7 では新色生成しない。
- **TanStack Query invalidation**:
  - import commit 成功 → `['room', roomId, 'week', *]` を全 weekStart で invalidate
  - title-rule CRUD → `['user', 'title-rules']` のみ invalidate (week は紐づかない、次回 import 時に効く)
  - RoomEvent PATCH (scope=all) → `['room', roomId, 'week', *]` invalidate
  - RoomEvent PATCH (scope=single) → `['room', roomId, 'week', containing-week]` のみ invalidate でも可、シンプル化のため全 weekStart invalidate でも OK
  - 詳細は `Muraki/knowledge/pattern/tanstack-query-invalidation-matrix.md` を参照しマトリクス化する

---

以上。Developer は §2-§5 の DB / API / service 実装、§6 のフロント実装、§9 のテスト配置の順に進める。

