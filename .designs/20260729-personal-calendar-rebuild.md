# 個人カレンダー再構築 — 繰り返し / 複数日 / 学期非依存 + タイル月グリッド + 日タップシート

> 対象 PJ: atender (`apps/api` / `packages/shared` / `apps/ios` / `apps/web`)。UI 正典: `DESIGN.md`。
> 前提 doc: `.designs/20260723-calendar-eventkit-sync-and-redesign.md` (本 doc が一部を**置換**する。§14 参照)、`.designs/20260721-room-recurring-timetable.md` (RoomEvent 側の先例)。
> 参照パターン: `Muraki/knowledge/pattern/rrule-string-onfly-expand-with-overrides.md`。
> 出荷単位: **build 12 で 1 回**。段階 (§13) は実装順であって出荷単位ではない。

---

## 0. 前提 — Touri 確定事項 (本 doc は覆さない)

| # | 決定 |
|---|---|
| T1 | 持つ項目 = 繰り返し / 複数日またぎ / 場所 / メモ / 色。**通知 (EKAlarm)・ゲスト招待・公開範囲・空き状態は対象外** |
| T2 | 繰り返しの編集単位は **この予定のみ / これ以降すべて / すべての予定** の 3 択全部 |
| T3 | **個人カレンダーは学期非依存**。学期は時間割/出欠側だけの概念 |
| T4 | 繰り返し予定のルーム共有は**繰り返しごと投影** (RRULE をそのまま渡す) |
| T5 | **build 11 との互換は取らない**。`MIN_IOS_BUILD` を 12 に上げ強制アップデート。DTO は additive でなくてよい |
| T6 | **Web も同時に直す**。UI をどこまで揃えるかは設計判断 |

## 0.1 スコープ境界 (触ってよい / 触らない)

| 区分 | 対象 |
|---|---|
| **触る** | `PersonalEvent` 系のモデル・API・iOS/Web UI 全部。`lib/rruleExpand.ts` (共有化 + JST 展開)。`services/recurrence.service.ts` (純ヘルパの import 元差し替え + 展開の JST 化)。`services/dayDetail.service.ts` / `services/personalCalendarShare.service.ts` (波及)。`Core/Sync/*` (EventKit sync の入力形) |
| **触らない** | `RoomEvent` の **schema / 入力 zod / route / 編集 3 択 API**。ルームの繰り返しピッカー UI (iOS `RecurrencePicker` / web `RecurrencePicker.tsx`) と `RecurrencePresetLogic`。Google カレンダー連携。ICS import。出欠・時間割・学期のモデル |
| **例外的に触る (依存のため必須)** | `expandRoomEvents` の展開を UTC → JST 基準に変える (§4.3)。**これをやらないと T4 の投影が room 側で曜日ズレする**。API テストに RRULE 展開のアサートは 1 件も無い (`grep -rn "recurrenceRule\|FREQ=" apps/api/tests` = 0 件、実測) ので既存テスト破壊はゼロ |
| **次レーン (本 doc の範囲外)** | EventKit への**書き出し**。正典は `.designs/20260729-eventkit-dedicated-calendar-export.md` (以下 **D3**)。本 doc が確定させるのは「D3 が読むデータ契約」だけで (§5.7)、**書き出しの実装方式は D3 が持つ** — 本 doc に再掲しない |

---

## 1. 目的

1. 個人カレンダーを「Google カレンダー同等に編集できる普通のカレンダー」にする — **繰り返し (RRULE + 3 択編集) と複数日またぎ**を持たせ、場所/メモ/色を編集可能にする。
2. **学期非依存化** — 学期を選んでいなくても・その学期の時間割が無くても予定が見える。月グリッドと日詳細で同じ予定が出る (現在は不整合)。
3. 月グリッドを**タイル (カード) の中**に収め、**日付マスのタップで下からシートを出して予定を一覧・追加・編集・削除**できるようにする。現在、個人カレンダー画面から予定を追加する手段は**ゼロ**である (§2.3)。

---

## 2. ★ 破壊的変更の告知 (Leader / Touri が読む節)

### 2.1 ★★ 破壊的 DB migration — 実行前にバックアップ必須

**`PersonalEvent` テーブルを作り替える。** カラムを消す (`semesterId` / `date` / `startMinute` / `endMinute`) ため、SQLite の RedefineTables (新テーブル作成 → `INSERT ... SELECT` → `DROP` → `RENAME`) になる。本番は Coolify Volume の `/app/data/prod.db`、`apps/api/entrypoint.sh:5` が **コンテナ起動時に `prisma migrate deploy` を自動実行**する。

> **★ デプロイ前に必ず本番 DB のファイルコピーを取ること。**
> ```sh
> # atender-api コンテナ内 (デプロイ前)
> cp /app/data/prod.db /app/data/prod.db.bak-20260729
> ```
> migration 自体は 1 トランザクションなので失敗すればロールバックするが、**変換式が間違って「成功する」ケース**はロールバックで守れない。守るのはこのバックアップだけ。

CLAUDE.md「エスカレーション」の「破壊的 migration」に該当する。**Leader は本 doc の承認ゲートでこの節を Touri に明示すること。**

### 2.2 iOS build 11 が即座に使えなくなる

`MIN_IOS_BUILD` を 1 → **12** に上げる (T5)。API をデプロイした瞬間、build 11 以下の端末は全 API が 426 になる。デプロイ順序は §13.2 に定める。

### 2.3 現在の壊れている状態 (この設計が直すもの、doc 完成時点の main = `66b893a` で再確認済)

| # | 事実 | 実測 |
|---|---|---|
| B1 | **個人カレンダー画面から予定を追加できない** | `PersonalCalendar.swift:95` の `@State isAddingPersonalEvent` を `true` にする箇所がリポジトリ内 **0 件** (宣言 `:95` とバインド `:172` の 2 ヒットのみ)。シート本体 `:162` は生きているが呼び出し元が無い |
| B2 | **当月外のマスをタップすると予定が消えた月が出る** | `PersonalCalendar.swift:79-82` `selectDate` が `anchor` を書き換えるのに `load()` を呼ばない。ハンドラは `:149-151`。月送り `:137-140` とスワイプ `:152-155` は `load()` を呼ぶ。`RoomDetailView.swift:169-172` も同型 (room は本 doc の範囲外なので**報告のみ**) |
| B3 | **同じ予定が月グリッドに出ないのに日詳細には出る** | `GET /api/personal-events` は `semesterId` で絞る (`personalEvent.service.ts:67`) が `GET /api/day/:date` は絞らない (`dayDetail.service.ts:40-42`) |
| B4 | **複数日予定が型として表現できない** | `date` 1 本 + `startMinute/endMinute`。EventKit の複数日は N 日分の別行に分解され (`EventKitTimeMapping.swift:15-53`)、戻すときは単日しか作らない (`:55-66`) ので**往復で N 個の単日予定に化ける** |
| B5 | **`DayDetailSheet` が `BottomSheet` を兄弟に 2 枚並べている** | `DayDetailSheet.swift:34-52`。`gotcha/swiftui-multiple-sibling-sheets-only-one-fires.md` に該当。**片方 (作成用) しか開かない疑い** |
| B6 | **終日 + 週次の繰り返しが 1 日ズレる (RoomEvent 実装済経路の既存バグ)** | `rruleExpand.ts` は `DTSTART:<UTC>Z` で UTC 展開する。JST 00:00 = 前日 15:00 UTC なので `FREQ=WEEKLY;BYDAY=MO` の終日予定は UTC 月曜 = **JST 火曜**に展開される。§4.3 で修正 |

---

## 3. データモデル

### 3.1 `PersonalEvent` — 全面作り替え

現行 (`apps/api/prisma/schema.prisma:291-315`) を次で**置換**する。

```prisma
model PersonalEvent {
  id             String    @id @default(cuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title          String
  start          DateTime          // DTSTART (絶対時刻)
  end            DateTime          // 排他。duration = end - start は全 occurrence 共通
  isAllDay       Boolean   @default(false)
  location       String?
  note           String?
  color          String?
  recurrenceRule String?           // "FREQ=WEEKLY;BYDAY=MO" (DTSTART 行を含まない)
  exDates        String?           // "20260615T000000Z,..." CSV (UTC ICS)
  rDates         String?           // 同上
  source            EventSource @default(MANUAL)
  ekExternalId      String?        // EKCalendarItem.calendarItemExternalIdentifier
  ekCalendarId      String?
  ekOccurrenceStart DateTime?      // EKEvent.occurrenceDate 相当 (EK 由来ミラーの occurrence 識別)
  ekLastModified    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  overrides PersonalEventOverride[]

  @@index([userId, start])
  @@index([userId, ekExternalId])
}

enum EventSource {   // 無変更
  MANUAL
  EVENTKIT
}
```

**消えるフィールド**: `semesterId` (T3)、`date`、`startMinute`、`endMinute`。
**消える relation**: `Semester.personalEvents` (`@relation("SemesterPersonalEvents")`) — `Semester` モデル側の back-relation 行も削除する。
**unique 制約は貼らない** (現行方針を踏襲)。EK の dedup はアプリ層で `(userId, ekExternalId, ekOccurrenceStart)` 照合 (§5.6)。理由は「同一 DB 内で `ekExternalId` が重複しうるので unique にすると取込が 500 になる」— 20260723 doc の不採用案と同じ。

### 3.2 `PersonalEventOverride` — 新設

`RoomEventOverride` (`schema.prisma:594-610`) と同型。`newLocation` / `newNote` / `newIsAllDay` を足す。

```prisma
model PersonalEventOverride {
  id           String        @id @default(cuid())
  seriesId     String
  series       PersonalEvent @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  originalDate DateTime      // 元 occurrence の開始 (RECURRENCE-ID 相当)
  isCancelled  Boolean       @default(false)
  newStart     DateTime?
  newEnd       DateTime?
  newTitle     String?
  newLocation  String?
  newNote      String?
  newColor     String?
  newIsAllDay  Boolean?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@unique([seriesId, originalDate])
  @@index([seriesId])
}
```

### 3.3 時刻・終日の正典規約 (これ 1 個に集約する)

| 規則 | 内容 |
|---|---|
| **TZ** | サーバ側の暦は常に `APP_TZ = "Asia/Tokyo"` (`apps/api/src/lib/tz.ts:8`)。クライアントは**日付演算をしない** (§5.2 の `days` をそのまま使う) |
| **終日の表現** | `isAllDay=true` のとき `start` = 最初の日の JST 00:00、`end` = **最終日の翌日の JST 00:00 (排他)**。1 日の終日 = `end - start` が 24h。7/23〜7/25 の終日 = start 7/23 00:00 JST / end 7/26 00:00 JST |
| **終日の正規化** | サーバは `isAllDay=true` の入力を**エラーにせず正規化**する: `start` を JST 当日 00:00 に切り下げ、`end` を「`start` より真に後の最初の JST 00:00」に切り上げる。EK 由来入力もこれで揃う |
| **時刻ありの表現** | `end` は排他。`end > start` を要求 (満たさなければ 400 `INVALID_RANGE`) |
| **UI の「終了日」** | 終日モードのフォームで**ユーザーが選ぶ終了日は包含**。保存時に +1 日して排他 `end` に変換し、表示時は −1 日して戻す (§6.5) |
| **RoomEvent への変換** | RoomEvent は終日を「包含 end」で持っている (`personalCalendarShare.service.ts:172-181` が `endOfDay` を書いていた)。投影時、`isAllDay` なら `end - 1ms` にして渡す (§5.5)。これで単日終日予定の room 側描画が現行と 1ms 差で一致する |

### 3.4 migration (★破壊的)

Prisma 1 本。`prisma migrate dev --create-only` で骨組みを出し、`INSERT ... SELECT` の**変換式を手で書く**。

```sql
-- CreateTable
CREATE TABLE "PersonalEventOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "originalDate" DATETIME NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "newStart" DATETIME, "newEnd" DATETIME, "newTitle" TEXT,
    "newLocation" TEXT, "newNote" TEXT, "newColor" TEXT, "newIsAllDay" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonalEventOverride_seriesId_fkey" FOREIGN KEY ("seriesId")
      REFERENCES "PersonalEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PersonalEventOverride_seriesId_originalDate_key" ON "PersonalEventOverride"("seriesId", "originalDate");
CREATE INDEX "PersonalEventOverride_seriesId_idx" ON "PersonalEventOverride"("seriesId");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PersonalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT, "note" TEXT, "color" TEXT,
    "recurrenceRule" TEXT, "exDates" TEXT, "rDates" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "ekExternalId" TEXT, "ekCalendarId" TEXT,
    "ekOccurrenceStart" DATETIME, "ekLastModified" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonalEvent_userId_fkey" FOREIGN KEY ("userId")
      REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ★ 変換式。旧 "date" は「JST 00:00 の絶対時刻」を INTEGER(ms) で保持している (実測: typeof=integer)。
--   終日      : start = date,                      end = date + 86400000        (排他・翌日 JST 00:00)
--   時刻あり  : start = date + startMinute*60000,  end = date + endMinute*60000
--   時刻ありで startMinute/endMinute が NULL の壊れ行は終日として救済する
INSERT INTO "new_PersonalEvent"
  ("id","userId","title","start","end","isAllDay","location","note","color",
   "recurrenceRule","exDates","rDates","source","ekExternalId","ekCalendarId",
   "ekOccurrenceStart","ekLastModified","createdAt","updatedAt")
SELECT
  "id","userId","title",
  CASE WHEN "isAllDay" = 1 OR "startMinute" IS NULL THEN "date"
       ELSE "date" + "startMinute" * 60000 END,
  CASE WHEN "isAllDay" = 1 OR "startMinute" IS NULL OR "endMinute" IS NULL THEN "date" + 86400000
       WHEN "endMinute" <= "startMinute" THEN "date" + "startMinute" * 60000 + 60000
       ELSE "date" + "endMinute" * 60000 END,
  CASE WHEN "isAllDay" = 1 OR "startMinute" IS NULL THEN 1 ELSE 0 END,
  NULL, "note", "color",
  NULL, NULL, NULL,
  "source", "ekExternalId", "ekCalendarId",
  NULL, "ekLastModified",
  "createdAt","updatedAt"
FROM "PersonalEvent";

DROP TABLE "PersonalEvent";
ALTER TABLE "new_PersonalEvent" RENAME TO "PersonalEvent";
CREATE INDEX "PersonalEvent_userId_start_idx" ON "PersonalEvent"("userId", "start");
CREATE INDEX "PersonalEvent_userId_ekExternalId_idx" ON "PersonalEvent"("userId", "ekExternalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
```

**検証手順 (デプロイ担当が実行)**:
1. デプロイ前: `SELECT COUNT(*) FROM PersonalEvent;` を記録。
2. デプロイ後: 同じ COUNT が一致すること。
3. デプロイ後: `SELECT COUNT(*) FROM PersonalEvent WHERE "end" <= "start";` が **0** であること。
4. デプロイ後: `SELECT COUNT(*) FROM PersonalEvent WHERE "isAllDay"=1 AND ("end"-"start") % 86400000 <> 0;` が **0** であること。

`semesterId` の値は**捨てる** (T3 により意味を失うため)。捨てても予定そのものは残る。

---

## 4. 繰り返しの表現

### 4.1 ★ RRULE 文字列を組み立てるのはサーバだけ (二重実装を構造的に潰す)

現状は web (`apps/web/src/lib/recurrenceFormat.ts:4-22`) と iOS (`Features/Rooms/RoomLogic.swift:187-216` `RecurrencePresetLogic`) が**それぞれ RRULE 文字列を手組み**しており、プリセット 6 個・終了条件なし。ここに INTERVAL / 複数曜日 / COUNT / UNTIL を足すと、2 実装が食い違う余地が一気に増える。

**本設計では、クライアントは RRULE 文字列を組み立てない・解析しない。** 構造化した `RecurrenceSpec` を送り、サーバが RRULE に変換する。レスポンスには `recurrenceRule` (文字列) と `recurrenceSpec` (構造) の**両方**を載せ、クライアントはピッカーの初期値に `recurrenceSpec` をそのまま使う。→ 変換ロジックの実装は `packages/shared` に **1 個だけ**存在する。

`packages/shared/src/schemas/recurrence.ts` (新規):

```ts
export const WeekdayCode = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);

export const RecurrenceEnd = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("never") }),
  z.object({ kind: z.literal("until"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), // JST 日付・その日を含む
  z.object({ kind: z.literal("count"), count: z.number().int().min(1).max(730) }),
]);

export const RecurrenceSpec = z.object({
  freq: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.number().int().min(1).max(99).default(1),
  byDay: z.array(WeekdayCode).max(7).default([]),                 // WEEKLY のときのみ意味を持つ
  monthlyMode: z.enum(["BYMONTHDAY", "BYDAY"]).nullable().default(null), // MONTHLY のときのみ
  end: RecurrenceEnd.default({ kind: "never" }),
});
export type RecurrenceSpec = z.infer<typeof RecurrenceSpec>;
```

`packages/shared/src/recurrence/rrule.ts` (新規・純関数):

```ts
/** spec + DTSTART から RFC5545 の RRULE 本体 (DTSTART 行を含まない) を組む */
export function buildRRule(spec: RecurrenceSpec, dtstart: Date): string;
/** RRULE 本体を spec へ戻す。表現できない RRULE (BYSETPOS/BYWEEKNO/複数 BYMONTHDAY 等) は null */
export function parseRRule(rrule: string, dtstart: Date): RecurrenceSpec | null;
```

**`buildRRule` の生成規則** (Google Calendar の UI→RRULE 対応に合わせる。曜日・日・月は **JST 暦の `dtstart`** から導出する):

| freq / mode | 出力 |
|---|---|
| `DAILY` | `FREQ=DAILY` |
| `WEEKLY` | `FREQ=WEEKLY;BYDAY=<byDay>`。`byDay` が空なら `dtstart` の JST 曜日 1 個 |
| `MONTHLY` + `BYMONTHDAY` | `FREQ=MONTHLY;BYMONTHDAY=<dtstart の JST 日>` |
| `MONTHLY` + `BYDAY` | `FREQ=MONTHLY;BYDAY=<ord><DAY>`。`ord = floor((day-1)/7)+1`、ただし **`ord == 5` のときは `-1` (最終)** |
| `MONTHLY` + `monthlyMode=null` | `BYMONTHDAY` として扱う |
| `YEARLY` | `FREQ=YEARLY;BYMONTH=<JST 月>;BYMONTHDAY=<JST 日>` |

- `interval > 1` のときだけ `INTERVAL=<n>` を出す (1 は出さない)。
- `byDay` の並びは常に `MO,TU,WE,TH,FR,SA,SU` の順に正規化する。
- `end.kind="count"` → `COUNT=<n>`。`end.kind="until"` → `UNTIL=<その JST 日の 23:59:59 を UTC ICS 化>` (例 `2026-12-31` → `UNTIL=20261231T145959Z`)。
- **`COUNT` と `UNTIL` は同時に出ない** — `RecurrenceEnd` が discriminated union なので構造的に不可能 (EventKit の `EKRecurrenceEnd` が排他であるため、次レーンの制約と一致する)。
- **パートの出力順は固定**: `FREQ, INTERVAL, BYDAY, BYMONTH, BYMONTHDAY, COUNT, UNTIL`。文字列が決定的になり、テストが `toBe` で書ける。

**`parseRRule` の規則**: 上の生成物を必ず往復できること。加えて `INTERVAL` 欠落 → 1、`BYDAY` に `-1MO` 形式が来たら `monthlyMode=BYDAY`。未知のパート (`BYSETPOS` / `BYWEEKNO` / `BYYEARDAY` / `WKST` / 複数値の `BYMONTHDAY`) が 1 つでもあれば **`null`** を返す。

### 4.2 上限値

| 値 | 上限 | 超えたら |
|---|---|---|
| RRULE 文字列長 | 720 文字 | 400 `VALIDATION_ERROR` (zod) |
| `COUNT` | 730 | 400 `VALIDATION_ERROR` (zod。Google と同値) |
| `interval` | 99 | 400 `VALIDATION_ERROR` (zod) |
| `GET /api/personal-events` の `from`〜`to` | 366 日 | 400 `RANGE_TOO_LARGE` |
| `from` / `to` | **必須** (現行は optional) | 欠落は 400 `VALIDATION_ERROR` |

`from`/`to` を必須化しても既存呼び出しは壊れない (実測: iOS `PersonalCalendar.swift:33` / `SemesterOverviewComponents.swift:271`、web `PersonalCalendar.tsx:44` / `AttendanceCalendar.tsx:39-43` の 4 箇所すべてが両方渡している)。

### 4.3 ★ 展開は「JST を UTC に見立てた擬似空間」で行う (B6 の修正)

`rrule` npm は DTSTART の **UTC 暦**で曜日・日を数える。JST の予定は UTC では最大 9 時間戻るので、**JST 00:00〜08:59 に始まる予定 (終日予定は必ずここに入る)** は曜日・日付が 1 つ前になり、`BYDAY=MO` が JST 火曜に展開される。

日本には DST が無いので、**全ての入力を +9h してから展開し、結果を −9h して戻せば厳密に正しい**。

`apps/api/src/lib/rruleExpand.ts` に追加 (既存関数は無改変、`parseIcsDate` を `export` に変更):

```ts
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** RRULE 内の UNTIL= を offsetMs だけずらす (擬似空間へ入れる/戻すため) */
export function shiftRRuleUntil(rrule: string, offsetMs: number): string;

/** JST 暦で正しく展開する。dtstart / exDates / rDates / UNTIL / from / to を全て +9h して展開し、結果を -9h */
export function expandBetweenJst(parts: RRuleParts, from: Date, to: Date): Date[];
```

**適用先**:
- `services/personalRecurrence.service.ts` (新規、§5.3) — `expandBetweenJst` を使う。
- `services/recurrence.service.ts:48` `expandRoomEvents` — `expandBetween` → **`expandBetweenJst` に差し替える** (§0.1 の「例外的に触る」)。これをやらないと、投影された繰り返し個人予定が個人カレンダーとルームカレンダーで別の日に出る。

**`recurrence.service.ts` からの純ヘルパ抽出** (振る舞い不変):
`appendOrReplaceUntil` (`:197`)、`stripUntil` (`:203`)、`datesToCsv` (`:207`) の 3 つを `lib/rruleExpand.ts` へ移し `export` する。`recurrence.service.ts` は import に差し替える。個人側も同じものを使う → RRULE 文字列操作の実装が 1 箇所になる。

### 4.4 編集 3 択の意味論 (T2)

`applyEditScope` (`recurrence.service.ts:97`) と同じ骨格を `personalRecurrence.service.ts` に**別実装**する。共通化しない理由は §15 (不採用案)。

| scope | 挙動 |
|---|---|
| `single` | `PersonalEventOverride` を `(seriesId, originalDate)` で upsert。`patch.start/end` は**絶対時刻**として `newStart/newEnd` に入る。系列が非繰り返しなら 400 `NOT_RECURRING` |
| `future` | 元系列の RRULE に `UNTIL = originalDate - 1ms` を付ける (既存 `COUNT`/`UNTIL` は除去してから)。元系列の `originalDate` 以降の override を**削除**する (到達不能になるため)。新系列を作る: `start = patch.start ?? originalDate`、`end = patch.end ?? start + 元 duration`、`recurrenceRule = stripUntil(元)`、`exDates/rDates = null`、override は引き継がない。非繰り返しなら 400 `NOT_RECURRING` |
| `all` | 系列本体を update。**`patch.start` は「編集中の occurrence の新しい開始」として解釈し、差分を系列に適用する**: `delta = patch.start - originalDate`、`series.start += delta`、`series.end = series.start + (patch.end - patch.start)`。`patch.recurrence` があれば `recurrenceRule/exDates/rDates` を差し替える (RRULE は**移動後の `series.start`** を DTSTART として `buildRRule` する)。override は保持する |

`originalDate` は「override 適用**前**の occurrence 開始時刻」= `PersonalEventOccurrenceDto.occurrenceDate`。系列が繰り返し (`recurrenceRule != null`) のとき **PATCH / DELETE で必須**、欠落は 400 `ORIGINAL_DATE_REQUIRED`。非繰り返しのときは省略可で、省略時 `series.start` とみなす (= `all` の delta が 0 になり絶対指定と一致する)。

削除も同じ 3 択:

| scope | 挙動 |
|---|---|
| `single` | override を `isCancelled=true` で upsert |
| `future` | 元系列に `UNTIL = originalDate - 1ms`。新系列は作らない。`originalDate` 以降の override を削除 |
| `all` | 系列を delete (override は Cascade) |

---

## 5. API / 関数シグネチャ

### 5.1 `packages/shared/src/schemas/personalEvent.ts` — 全面置換

```ts
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** occurrence が覆う JST 1 日ぶんの表示情報。クライアントは日付演算をしない */
export const OccurrenceDayDto = z.object({
  date: DateStr,
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
});

/** 系列そのもの (POST/PATCH のレスポンス、編集フォームの原本) */
export const PersonalEventSeriesDto = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),                       // ISO8601 instant
  end: z.string(),                         // ISO8601 instant (排他)
  isAllDay: z.boolean(),
  location: z.string().nullable(),
  note: z.string().nullable(),
  color: z.string().nullable(),
  recurrenceRule: z.string().nullable(),
  recurrenceSpec: RecurrenceSpec.nullable(),   // 表現できない RRULE は null
  exDates: z.array(z.string()).default([]),    // ISO8601 instant
  rDates: z.array(z.string()).default([]),
  source: z.enum(["MANUAL", "EVENTKIT"]),
  ekExternalId: z.string().nullable(),
  ekCalendarId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 展開済み occurrence (GET のレスポンス、カレンダー描画の単位) */
export const PersonalEventOccurrenceDto = z.object({
  seriesId: z.string(),
  occurrenceDate: z.string(),              // override 適用前の開始 (RECURRENCE-ID 相当)
  start: z.string(),                       // override 適用後
  end: z.string(),                         // override 適用後・排他
  days: z.array(OccurrenceDayDto).min(1),  // ★ クエリ範囲でクリップ済
  isAllDay: z.boolean(),
  title: z.string(),
  location: z.string().nullable(),
  note: z.string().nullable(),
  color: z.string().nullable(),
  isRecurringOccurrence: z.boolean(),
  recurrenceRule: z.string().nullable(),
  recurrenceSpec: RecurrenceSpec.nullable(),
  overrideId: z.string().nullable(),
  source: z.enum(["MANUAL", "EVENTKIT"]),
  ekExternalId: z.string().nullable(),
  ekCalendarId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

> **★ `id` フィールドを意図的に持たせない。** occurrence は系列 ID では一意にならず、`id` を置くと「DELETE に `id` を渡す」誤用を招く。一意キーは `(seriesId, occurrenceDate)`。iOS は `Identifiable` を**計算プロパティ** `var id: String { "\(seriesId):\(occurrenceDate)" }` で満たす。API に渡すのは常に `seriesId`。

入力:

```ts
export const PersonalEventRecurrenceInput = z.object({
  spec:    RecurrenceSpec.optional(),
  rrule:   z.string().min(1).max(720).optional(),   // import 経路用。UI からは使わない
  exDates: z.array(z.string().datetime()).default([]),
  rDates:  z.array(z.string().datetime()).default([]),
}).refine((v) => (v.spec != null) !== (v.rrule != null), {
  message: "recurrence requires exactly one of spec or rrule",
});

export const PersonalEventCreateInput = z.object({
  title:      z.string().min(1).max(100),
  start:      z.string().datetime(),
  end:        z.string().datetime(),
  isAllDay:   z.boolean().default(false),
  location:   z.string().max(200).nullable().optional(),
  note:       z.string().max(500).nullable().optional(),
  color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  recurrence: PersonalEventRecurrenceInput.nullable().optional(),
  source:         z.enum(["MANUAL", "EVENTKIT"]).optional(),
  ekExternalId:   z.string().optional(),
  ekCalendarId:   z.string().optional(),
  ekLastModified: z.string().datetime().optional(),
}).refine((v) => v.isAllDay || new Date(v.end) > new Date(v.start), {
  message: "end must be after start",
});

export const PersonalEventUpdateInput = PersonalEventCreateInputShape.partial().extend({
  editScope:    z.enum(["single", "future", "all"]).default("all"),
  originalDate: z.string().datetime().optional(),
});   // ※ .partial() を使うため refine 前の ZodObject を別名 export して使う

export const PersonalEventDeleteQuery = z.object({
  scope:        z.enum(["single", "future", "all"]).default("all"),
  originalDate: z.string().datetime().optional(),
});
```

- `recurrence: null` (明示的 null) = **繰り返しを解除**する。`undefined` = 触らない。解除は `editScope="all"` のときのみ許可、それ以外は 400 `SCOPE_NOT_ALLOWED`。
- `EventKitSyncEvent` / `EventKitSyncInput` は §5.6 で置換。

### 5.2 endpoints

```
GET    /api/personal-events?from=YYYY-MM-DD&to=YYYY-MM-DD    → { events: PersonalEventOccurrenceDto[] }
POST   /api/personal-events                                  → { event: PersonalEventSeriesDto }  (201)
PATCH  /api/personal-events/:id                              → { event: PersonalEventSeriesDto }
DELETE /api/personal-events/:id?scope=&originalDate=         → { ok: true }
POST   /api/personal-events/eventkit-sync                    → { mirrors }
```

- `semesterId` クエリ・`semesterId` 入力は**廃止**。送られても zod が `strip` するので既存クライアントは 400 にならないが、build 12 の各クライアントは送らない。
- `:id` は**系列 ID** (`PersonalEvent.id`)。
- `GET` の返りは `start` 昇順、同時刻は `seriesId` 昇順で安定ソートする。

### 5.3 service

`apps/api/src/services/personalRecurrence.service.ts` (新規):

```ts
export type PersonalOccurrence = {
  seriesId: string; occurrenceDate: Date; start: Date; end: Date; isAllDay: boolean;
  title: string; location: string | null; note: string | null; color: string | null;
  isRecurringOccurrence: boolean; recurrenceRule: string | null;
  overrideId: string | null; source: string;
  ekExternalId: string | null; ekCalendarId: string | null;
  createdAt: Date; updatedAt: Date;
};

export async function expandPersonalEvents(userId: string, from: Date, to: Date): Promise<PersonalOccurrence[]>;

export async function applyPersonalEditScope(args: {
  seriesId: string;
  originalDate: Date;
  scope: "single" | "future" | "all";
  patch: {
    title?: string; location?: string | null; note?: string | null; color?: string | null;
    start?: Date; end?: Date; isAllDay?: boolean;
    recurrence?: { rrule: string; exDates?: string[]; rDates?: string[] } | null;
  };
}): Promise<{ affectedSeriesIds: string[]; newSeriesId?: string }>;

export async function deletePersonalOccurrence(args: {
  seriesId: string; originalDate: Date; scope: "single" | "future" | "all";
}): Promise<void>;
```

`expandPersonalEvents` は `expandRoomEvents` (`recurrence.service.ts:29-62`) と同じ骨格:
1. `where: { userId, OR: [{ recurrenceRule: null, start: { lte: to }, end: { gte: from } }, { recurrenceRule: { not: null }, start: { lte: to } }] }`、`include: { overrides: true }`。
2. 非繰り返し → そのまま 1 件。
3. 繰り返し → `expandBetweenJst({ rrule, dtstart: start, exDates, rDates }, from, to)`。
4. override があれば `newStart/newEnd/newTitle/newLocation/newNote/newColor/newIsAllDay` を差し込み、`isCancelled` はスキップ。
5. `start` 昇順ソート。

`apps/api/src/services/personalEvent.service.ts` (全面書き換え):

```ts
export function personalEventSeriesDto(event: PersonalEvent): PersonalEventSeriesDto;
export function personalEventOccurrenceDto(o: PersonalOccurrence, from: string, to: string): PersonalEventOccurrenceDto;

/** occurrence が覆う JST 日を [from,to] でクリップして返す。★ この関数だけが日付分割を持つ */
export function occurrenceDays(start: Date, end: Date, isAllDay: boolean, from: string, to: string): OccurrenceDayDto[];

export async function listPersonalEvents(args: { userId: string; from: string; to: string }): Promise<PersonalEventOccurrenceDto[]>;
export async function createPersonalEvent(args: { userId: string; input: PersonalEventCreateInput }): Promise<PersonalEventSeriesDto>;
export async function updatePersonalEvent(args: { userId: string; id: string; input: PersonalEventUpdateInput }): Promise<PersonalEventSeriesDto>;
export async function deletePersonalEvent(args: { userId: string; id: string; query: PersonalEventDeleteQuery }): Promise<void>;
export async function reconcileEventKit(args: { userId: string; input: EventKitSyncInput }): Promise<EventKitSyncResult>;
```

**`occurrenceDays` の生成規則** (これが `days` の唯一の定義):
- 覆う日の集合 = `[jstDate(start) .. jstDate(end - 1ms)]`。`end <= start` の異常時は `[jstDate(start)]`。
- 各日 D について `dayStart = D の JST 00:00`、`dayEnd = 翌日の JST 00:00`。
  - `startMinute = clamp(0, 1440, (max(start, dayStart) - dayStart) / 60000)`
  - `endMinute   = clamp(0, 1440, (min(end,   dayEnd)   - dayStart) / 60000)`
- `isAllDay` のときは全日 `{0, 1440}`。
- 最後に `from <= date <= to` でフィルタ。フィルタ後が空になる occurrence は `listPersonalEvents` の返りから**除外**する。

**`updatePersonalEvent` の手順**:
1. 系列を `findFirst({ id, userId })`。無ければ 404 `NOT_FOUND`。
2. 系列が繰り返しかつ `originalDate` 欠落 → 400 `ORIGINAL_DATE_REQUIRED`。
3. `input.recurrence?.spec` があれば **DTSTART を確定してから** `buildRRule(spec, dtstart)`。DTSTART は scope により決まる: `all` → 移動後の `series.start`、`future` → 新系列の `start`、`single` → 繰り返し変更は不可 (400 `SCOPE_NOT_ALLOWED`)。
4. `isAllDay` が true になる入力は §3.3 の正規化を通す。
5. `applyPersonalEditScope` を呼ぶ。
6. 返りは**編集対象の系列** (`future` のときは新系列) の `PersonalEventSeriesDto`。
7. 最後に `projectEnabledSharesForUser(userId)` を呼ぶ (§5.5)。create / delete も同様。

### 5.4 `dayDetail.service.ts` への波及

`getDayDetail` の `personalEvents` を、直接 `findMany` する形 (`:40-43`) から **`expandPersonalEvents(userId, day.startOfDay, day.endOfDay)` → `personalEventOccurrenceDto(..., from=date, to=date)`** に差し替える。`DayDetailDto.personalEvents` の型は `PersonalEventOccurrenceDto[]` になる。

これで B3 (月グリッドと日詳細の不整合) が消える — **どちらも学期で絞らず、同じ展開関数を通る**。

### 5.5 ルーム共有への投影 (T4: 繰り返しごと投影)

`services/personalCalendarShare.service.ts` の `projectShare` (`:89-157`) を書き換える。骨格 (share の有効/無効判定・マスク・stale 削除) は維持。

| 項目 | 新規則 |
|---|---|
| 取得 | `PersonalEvent` を **occurrence でなく系列**で取る。条件は `expandPersonalEvents` と同じ OR 条件、範囲は `today().startOfDay` 〜 `+DEFAULT_PROJECTION_MONTHS(3)` |
| 投影単位 | 系列 1 本 = `RoomEvent` 1 行。`externalUid = "pe:<seriesId>"` (現行と同じ、`@@unique([roomId, externalUid])` で upsert) |
| コピーする値 | `start`, `end`, `isAllDay`, `recurrenceRule`, `exDates`, `rDates`, `color`, `description = note`, `rawTitle = 元 title`, `title = マスク後` |
| **終日の end 変換** | `isAllDay` のとき投影先 `end = personal.end - 1ms`。理由: RoomEvent は終日を包含 end で持つ (現行 `personalEventTiming` が `endOfDay` を書いていた)。これで単日終日予定の room 側描画が現行と一致する |
| **場所** | `RoomEvent` に `location` は無い。`description` に `note` のみを入れ、**場所は共有しない** (T1 の共有仕様に場所は含まれない)。マスク対象外の情報を増やさない |
| override | `PersonalEventOverride` → `RoomEventOverride` を `(投影 RoomEvent.id, originalDate)` で upsert。`newTitle` は**マスクを通す**。`newDescription = newNote`、`newColor`、`newStart/newEnd` (終日なら newEnd も −1ms)。個人側に無い override は削除 |
| stale 削除 | 現行どおり `source=PERSONAL` かつ `externalUid` が `pe:` 始まりで、生存 uid に無いものを削除 |
| マスク | 現行の `mapTitle` を無改変で使う (`NORMAL` / `BUSY_ONLY`→"予定" / `TITLE_MAPPED`→`applyTitleRules`、default ルール除外) |

`personalEventTiming` (`:172-181`) は**削除**する (`date`+`startMinute` を前提にしているため)。

### 5.6 EventKit 同期 endpoint の作り替え (この lane の範囲)

build 10 で出荷済の `POST /api/personal-events/eventkit-sync` は `(ekExternalId, date)` を鍵にした**日単位分解**前提 (`personalEvent.service.ts:223`)。新モデルでは日単位の行が存在しないので、**instant 基準に作り替える**。

```ts
export const EventKitSyncEvent = z.object({
  ekExternalId:      z.string(),
  ekCalendarId:      z.string(),
  ekOccurrenceStart: z.string().datetime(),          // EKEvent.occurrenceDate
  ekLastModified:    z.string().datetime().nullable(),
  start:             z.string().datetime(),
  end:               z.string().datetime(),
  isAllDay:          z.boolean(),
  title:             z.string().min(1).max(100),
  location:          z.string().max(200).nullable(),
});
export const EventKitSyncInput = z.object({
  range:  z.object({ from: DateStr, to: DateStr }),
  events: z.array(EventKitSyncEvent),
});
export type EventKitSyncResult = { mirrors: PersonalEventSeriesDto[] };
```

> **★ この endpoint は「読み込み (EK → Atender)」専用**。書き出し (Atender → EK) の返り値をここに載せない。**書き込み経路は D3 の差分エンジン 1 本**であり、2 経路が同じ予定を書くと同じ予定が 2 件できる (D3 §12 差分 B、Leader 裁定 2026-07-29)。旧案の `manualNeedingPush` は**廃止**。

`reconcileEventKit` の新規則:
- 鍵 = `(ekExternalId, ekOccurrenceStart)`。
- ミラーは**常に非繰り返し** (`recurrenceRule = null`)。EK の繰り返しはクライアント側で occurrence 展開済のものが個別に届く。
- 複数日 EK イベントは**分解しない** — 1 occurrence = 1 行 (`start`/`end` が実体)。これで B4 の「往復で N 個の単日に化ける」が消える。
- **削除伝播の対象**は `source=EVENTKIT` かつ `start ∈ [range.from の JST 00:00, range.to の JST 23:59:59]` のミラーのみ。範囲より前に始まって範囲に食い込む occurrence はクライアントが incoming に含める (EventKit の `predicateForEvents` は重なりで返す) ので、upsert はされ、削除対象にはならない。
- `source=MANUAL` は一切触らない。
- **push 対象の算出はしない** (返り値は `mirrors` のみ)。
- 最後に `projectEnabledSharesForUser(userId)`。

### 5.7 ★ D3 (EventKit 書き出し) が読むデータ契約

> **★ 2026-07-29 Leader 裁定**: 書き出しの**実装方式**は D3 (`20260729-eventkit-dedicated-calendar-export.md`) が正典。本節は「D3 が読むデータがどういう形か」だけを確定させ、**EK 側の書き方 (`EKRecurrenceRule` / `EKSpan` / `EventKitStore` の API 形) は一切規定しない**。以前あった「系列を `EKRecurrenceRule` として書き `EKSpan` で 3 択を反映する」という記述は D3 §12 差分 A により**撤回**した (理由: 一方向なので rule の価値が表示バッジだけになる / EventKit に EXDATE・detach 取り消しの API が無く override が減る方向の変更を反映できない / そのフォールバック分岐が EKEventStore 実体依存でテスト到達不能 / 展開方式なら授業と個人予定で同じ差分アルゴリズムを通せる)。

本 doc が確定させ、D3 が前提にしてよいもの:

1. **系列の正典はサーバ**。`PersonalEvent` 1 行 = 1 系列。`recurrenceRule` は RFC5545 の RRULE 本体 (DTSTART 行を含まない・`UNTIL` は実 UTC instant)。
2. **例外の正典はサーバの `PersonalEventOverride`**。鍵は `(seriesId, originalDate)`、`originalDate` = override 適用前の occurrence 開始 instant。
3. **★ D3 は繰り返しを「展開済み occurrence の列」として受け取れる。** `GET /api/personal-events?from&to` の返り (`PersonalEventOccurrenceDto[]`) は **override 適用済・`isCancelled` の回を除外済**であり、D3 はこれをそのまま書き出し対象にできる。RRULE を解釈する必要はない。一意キーは `(seriesId, occurrenceDate)`。
4. **`source` で書き出し対象を絞れる**。`source = "EVENTKIT"` の occurrence は EK 由来のミラーなので、書き戻すと二重になる。D3 はこれを除外する (D3 §5.3-1)。
5. **終日は排他 end** (§3.3)。`isAllDay` の occurrence は `start` = 最初の日の JST 00:00、`end` = 最終日の翌日の JST 00:00。D3 が EK の終日解釈のゆらぎを吸収するために `end` をずらす場合、その規則は D3 §5.3-6 が持つ。
6. **クライアントは日付演算をしない**。`days: [{date, startMinute, endMinute}]` と `start`/`end` (instant) が揃っているので、ISO8601 の parse 以上のことは要らない。
7. **`COUNT` と `UNTIL` は同時に立たない** (`RecurrenceEnd` が union)。`BYHOUR`/`BYMINUTE`/`BYSECOND` は生成しない (`RecurrenceSpec` に無い)。→ 将来 D3 が `EKRecurrenceRule` 方式に戻す判断をしても、spec 側の制約は既に EventKit の表現力に収まっている。
8. **EK → Atender 方向 (読み込み)** は本 doc §5.6 が正典。EK ミラーは常に非繰り返しなので、「EK 側の detached occurrence を override に変換する」処理は**発生しない**。EK occurrence の識別子は `(calendarItemExternalIdentifier, occurrenceDate)` で、`ekOccurrenceStart` が後者を保持する。

---

## 6. iOS

### 6.1 DTO / Endpoint

`Core/Models/DTOs.swift` の `PersonalEventDto` (`:442-458`) / `PersonalEventCreateInput` (`:460-472`) / `PersonalEventUpdateInput` (`:474-486`) / `EventKitSyncEvent` (`:490-499`) を置換する。

```swift
struct RecurrenceEndDto: Codable, Equatable {
    let kind: String            // "never" | "until" | "count"
    var date: String? = nil     // kind == "until"
    var count: Int? = nil       // kind == "count"
}

struct RecurrenceSpecDto: Codable, Equatable {
    var freq: String            // "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
    var interval: Int
    var byDay: [String]         // "MO".."SU"
    var monthlyMode: String?    // "BYMONTHDAY" | "BYDAY" | nil
    var end: RecurrenceEndDto
}

struct OccurrenceDayDto: Codable, Equatable {
    let date: String
    let startMinute: Int
    let endMinute: Int
}

struct PersonalEventSeriesDto: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let start: String
    let end: String
    let isAllDay: Bool
    let location: String?
    let note: String?
    let color: String?
    let recurrenceRule: String?
    let recurrenceSpec: RecurrenceSpecDto?
    let exDates: [String]
    let rDates: [String]
    let source: String
    let ekExternalId: String?
    let ekCalendarId: String?
    let createdAt: String
    let updatedAt: String
}

struct PersonalEventOccurrenceDto: Codable, Equatable, Identifiable {
    let seriesId: String
    let occurrenceDate: String
    let start: String
    let end: String
    let days: [OccurrenceDayDto]
    let isAllDay: Bool
    let title: String
    let location: String?
    let note: String?
    let color: String?
    let isRecurringOccurrence: Bool
    let recurrenceRule: String?
    let recurrenceSpec: RecurrenceSpecDto?
    let overrideId: String?
    let source: String
    let ekExternalId: String?
    let ekCalendarId: String?
    let createdAt: String
    let updatedAt: String

    // ★ wire に id は無い。Identifiable は計算プロパティで満たす
    var id: String { "\(seriesId):\(occurrenceDate)" }
    private enum CodingKeys: String, CodingKey {
        case seriesId, occurrenceDate, start, end, days, isAllDay, title, location, note, color
        case isRecurringOccurrence, recurrenceRule, recurrenceSpec, overrideId, source
        case ekExternalId, ekCalendarId, createdAt, updatedAt
    }
}

struct PersonalEventRecurrenceInput: Codable, Equatable {
    var spec: RecurrenceSpecDto? = nil
    var rrule: String? = nil
    var exDates: [String] = []
    var rDates: [String] = []
}

struct PersonalEventCreateInput: Codable, Equatable {
    let title: String
    let start: String
    let end: String
    var isAllDay: Bool = false
    var location: String? = nil
    var note: String? = nil
    var color: String? = nil
    var recurrence: PersonalEventRecurrenceInput? = nil
    var source: String? = nil
    var ekExternalId: String? = nil
    var ekCalendarId: String? = nil
    var ekLastModified: String? = nil
}

struct PersonalEventUpdateInput: Codable, Equatable {
    var title: String? = nil
    var start: String? = nil
    var end: String? = nil
    var isAllDay: Bool? = nil
    var location: String? = nil
    var note: String? = nil
    var color: String? = nil
    var recurrence: PersonalEventRecurrenceInput? = nil
    var editScope: String = "all"          // "single" | "future" | "all"
    var originalDate: String? = nil
    var ekExternalId: String? = nil
    var ekCalendarId: String? = nil
}

struct EventKitSyncEvent: Codable, Equatable {
    let ekExternalId: String
    let ekCalendarId: String
    let ekOccurrenceStart: String
    let ekLastModified: String?
    let start: String
    let end: String
    let isAllDay: Bool
    let title: String
    let location: String?
}
```

> **★ `PersonalEventUpdateInput.recurrence` は `nil` = 「触らない」。「繰り返しを解除する」は `recurrence` に `PersonalEventRecurrenceInput()` (spec も rrule も nil) を入れて表現しない** — Swift の `Optional` では JSON の `null` と欠落を書き分けられないため、**解除は専用フラグ `clearRecurrence: Bool = false` で送る**。サーバ側 zod にも `clearRecurrence: z.boolean().optional()` を追加し、`true` かつ `editScope="all"` のときだけ `recurrenceRule/exDates/rDates` を null にする。`recurrence: null` の直接送信は Web だけが使える経路だが、契約を 1 本にするため **Web も `clearRecurrence` を使う**。`PersonalEventRecurrenceInput` の `nullable()` は zod から外す。

`Core/Networking/APIEndpoint.swift:95-102` を更新:

```swift
static func personalEvents(from: String, to: String) -> APIEndpoint {
    .init(path: "/api/personal-events", method: .get, query: ["from": from, "to": to]) }
static func createPersonalEvent(_ body: PersonalEventCreateInput) -> APIEndpoint { ... }          // 無変更 (body 型だけ変わる)
static func updatePersonalEvent(id: String, _ body: PersonalEventUpdateInput) -> APIEndpoint { ... }
static func deletePersonalEvent(id: String, scope: String, originalDate: String?) -> APIEndpoint {
    .init(path: "/api/personal-events/\(id)", method: .delete,
          query: compactQuery(["scope": scope, "originalDate": originalDate])) }
```

`Core/Data/Repositories.swift:189-220` `PersonalEventRepository`:

```swift
func personalEvents(from: String, to: String) async throws -> [PersonalEventOccurrenceDto]
func createPersonalEvent(_ input: PersonalEventCreateInput) async throws -> PersonalEventSeriesDto
func updatePersonalEvent(id: String, _ input: PersonalEventUpdateInput) async throws -> PersonalEventSeriesDto
func deletePersonalEvent(id: String, scope: String, originalDate: String?, invalidateDate: String?) async throws
```
invalidation は現行どおり `invalidationTargets(for: .personalEvent(date:))` (`InvalidationMatrix.swift:56-57`) を使う。`.personalEvent(date:)` の定義は無変更。

### 6.2 `PersonalCalendarViewModel` (`Features/Calendar/PersonalCalendar.swift:3-87`)

```swift
@MainActor @Observable final class PersonalCalendarViewModel {
    var anchor: String = SchoolClock.todayString()
    var selectedDate: String = SchoolClock.todayString()
    var timetables: [UserTimetableDto] = []
    var semesters: [SemesterDto] = []
    var overview: SemesterOverviewDto?
    var occurrences: [PersonalEventOccurrenceDto] = []
    var isLoading = false
    var hasError = false

    init(environment: AppEnvironment)

    var currentRange: (start: String, end: String)                    // 無変更
    func load(semesterId: String?) async
    func events(semesterId: String?) -> [CalendarEvent]
    func occurrences(on date: String) -> [PersonalEventOccurrenceDto]
    func selectDate(_ date: String)
    func statusByDate() -> [String: AttendanceDayStatus]
}
```

**`load` の変更 (T3)**: `guard let semesterId else { return }` (`:21`) を**削除**。予定は常に取る。

```swift
func load(semesterId: String?) async {
    isLoading = true; hasError = false
    defer { isLoading = false }
    let range = currentRange
    do {
        async let occ = environment.personalEventRepository.personalEvents(from: range.start, to: range.end)
        async let tt  = environment.timetableRepository.userTimetables()
        async let sem = environment.semesterRepository.semesters()
        occurrences = try await occ
        timetables  = try await tt
        semesters   = try await sem
    } catch {
        hasError = true
        return
    }
    // 出席オーバーレイは学期があるときだけ。失敗しても hasError を立てない (予定は見えるべき)
    if let semesterId {
        overview = try? await environment.semesterRepository.semesterOverview(id: semesterId)
    } else {
        overview = nil
    }
}
```

**`events(semesterId:)` の変更**: 授業は「学期があり、その学期の時間割と学期が両方見つかるとき」だけ足す。無ければ**予定だけ**返す (現行は `[]` を返して画面ごと空になる)。

```swift
func events(semesterId: String?) -> [CalendarEvent] {
    let range = currentRange
    var out: [CalendarEvent] = []
    if let semesterId,
       let timetable = timetables.first(where: { $0.semesterId == semesterId }),
       let semester = semesters.first(where: { $0.id == semesterId }) {
        out += MeetingExpansion.expandUserTimetable(... 現行どおり ...)
    }
    out += PersonalEventDisplay.calendarEvents(occurrences: occurrences)
    return out.sorted { $0.date != $1.date ? $0.date < $1.date : $0.startMinute < $1.startMinute }
}
```

**新しい純関数** `Core/Timetable/TimetableLogic.swift` に追加 (★ユニットテスト対象):

```swift
enum PersonalEventDisplay {
    /// occurrence を days ごとに 1 CalendarEvent へ割る。日付演算はしない (days をそのまま使う)
    static func calendarEvents(occurrences: [PersonalEventOccurrenceDto]) -> [CalendarEvent]
}
```
生成規則: 各 occurrence の各 `day` について
- `kind = .personal`
- `id = "e:\(seriesId):\(occurrenceDate):\(day.date)"`
- `date = day.date`, `startMinute = day.startMinute`, `endMinute = day.endMinute`
- `title = occurrence.title`
- `color = occurrence.color ?? "#8b5cf6"` (現行フォールバック値を維持)
- `subtitle = "自分"`
- `courseId = nil`

`occurrences(on date:)` = `occurrences.filter { $0.days.contains { $0.date == date } }`、`days` 内の当該日の `startMinute` 昇順 → `title` 昇順で安定ソート。

**`selectDate` の変更 (B2 修正)**: `selectedDate` と `anchor` を両方更新するのは現行どおり。加えて純関数を足し、View が再取得を判断する。

```swift
enum PersonalCalendarLogic {
    /// anchor を date に移すと表示月が変わるか (= 再取得が要るか)
    static func monthChanged(anchor: String, date: String) -> Bool {
        CalendarRange.monthFirst(anchor) != CalendarRange.monthFirst(date)
    }
}
```

### 6.3 月グリッドをタイルに戻す

`CalendarMonth` (`PersonalCalendar.swift:254-447`) から **`CalendarMonthChrome` enum (`:249-252`) と `chrome` プロパティ (`:260`) を削除**し、`.card` 相当の単一スタイルにする。呼び出し側 2 箇所 (`PersonalCalendar.swift:143`, `RoomDetailView.swift:163`) は `chrome` を渡していないので**呼び出しの変更は不要**。

```swift
// monthGrid(...) の末尾
content
    .padding(Space.s2)
    .background(Color.bgElevated)
    .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    .atenderShadow(.card)
```

`GeometryReader` による幅拡張 + `.offset(x: -Space.pagePxMobile)` (`:326-331`) と `.frame(height:)` (`:332`) は削除する。日セル内部 (`dayCell`) は**一切変えない** (Touri「中の UI はそのままでいい」)。

**高さ計算**: `.card` は上下に `Space.s2` (8pt) ずつ chrome を持つ。`Core/Timetable/CalendarMonthLayout.swift` に追加:

```swift
static let cardChromeHeight: CGFloat = Space.s2 * 2        // 16
static func gridAvailable(available: CGFloat) -> CGFloat { max(0, available - cardChromeHeight) }
```
`CalendarMonth` は `available.map { CalendarMonthLayout.rowHeight(available: CalendarMonthLayout.gridAvailable(available: $0)) } ?? 86` を使う。**`rowHeight(available:)` の式は変えない** → 既存 `CalendarLayoutTests` #CA1/#CA3 は緑のまま。新規テストは `gridAvailable` に対して書く。

日セル側の下限 `max(44, rowHeight)` (`:405`) と `CalendarMonthLayout.minRowHeight = 60` の二重下限は**現状維持**。統合は視覚を変えるので本 doc の目的外。

**ルームも同じタイルになる** — 共有部品の見た目規則は全 caller に流す (DESIGN.md 由来の原則)。build 11 の「ルームも自分と統一」裁定と整合する。`RoomDetailView` 側のレイアウト変更は不要 (祖先の `.padding(Space.pagePxMobile)` の内側に収まるだけ)。

### 6.4 日タップシート `PersonalDaySheet` (新規ファイル `Features/Calendar/PersonalDaySheet.swift`)

日付マスをタップ → 下からシート。参照した見え方は `TodayAttendanceSheet` (`Features/Home/NowNextBar.swift:48-110`) の「1 行 = 1 カード」構造。

**シートは常に 1 枚だけ** (`gotcha/swiftui-multiple-sibling-sheets-only-one-fires.md`)。`PersonalCalendar` に単一の `activeSheet` を持ち、`@ViewBuilder switch` で出す。編集フォームは**別シートにしない** — 同じシートの中で内容を差し替える。

```swift
// PersonalCalendar.swift
enum PersonalCalendarSheet: Equatable { case day(String) }
@State private var activeSheet: PersonalCalendarSheet?
private var activeSheetBinding: Binding<Bool> {
    Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } })
}
@ViewBuilder private var sheetHost: some View {
    switch activeSheet {
    case .day(let date):
        BottomSheet(title: nil, isPresented: activeSheetBinding, stackLevel: 1) {
            PersonalDaySheet(
                date: date,
                meetings: model.events(semesterId: semesterId).filter { $0.date == date && $0.kind == .meeting },
                occurrences: model.occurrences(on: date),
                semesterId: semesterId,
                onChanged: { await model.load(semesterId: semesterId) },
                onClose: { activeSheet = nil }
            )
        }
    case nil:
        EmptyView()
    }
}
```
`BottomSheet(title: nil, ...)` にするのは、シート内でモードが変わるとタイトルが変わるため。`BottomSheet` は `title == nil` でもグラバー + × を描く (`BottomSheet.swift:75-100` の `if let title` はテキストだけを守っている)。見出しは `PersonalDaySheet` が自前で描く。

```swift
struct PersonalDaySheet: View {
    let date: String
    let meetings: [CalendarEvent]
    let occurrences: [PersonalEventOccurrenceDto]
    let semesterId: String?              // 現状は未使用だが将来の授業導線用に受ける — ★受けない。下記参照
    let onChanged: () async -> Void
    let onClose: () -> Void

    enum Mode: Equatable {
        case list
        case editor(EditorTarget)
    }
    struct EditorTarget: Equatable {
        var occurrence: PersonalEventOccurrenceDto?   // nil = 新規
        var defaultDate: String
    }
    @State private var mode: Mode = .list
}
```
> `semesterId` は**受けない**。個人カレンダーは学期非依存 (T3) で、このシートは学期を一切参照しない。上の擬似コードから削除する。

**レイアウト (list モード)**

```
┌──────────────────────────────┐
│            ▬▬▬            [×]│  BottomSheet chrome
│  7月23日 (水)                 │  .atender2xl bold  (見出し)
│                              │
│  授業 (2)                     │  .footnote secondary   ← 0 件なら節ごと非表示
│  ┌──────────────────────────┐│
│  │ ▌1限  情報数学    9:00-10:30││  bgMuted / Radius.md / 読み取り専用
│  └──────────────────────────┘│
│  ┌──────────────────────────┐│
│  │ ▌3限  OS 演習   13:00-14:30││
│  └──────────────────────────┘│
│                              │
│  予定 (2)                     │
│  ┌──────────────────────────┐│
│  │ ▌バイト          18:00-22:00││  タップで編集
│  │   ↻ 毎週 月,水  ・ 渋谷店   ││  繰り返し記号 + 場所
│  │                      [🗑]  ││
│  └──────────────────────────┘│
│  ┌──────────────────────────┐│
│  │ ▌帰省 (終日)   7/23-7/25   ││  複数日は範囲表記
│  └──────────────────────────┘│
│                              │
│  [      + 予定を追加       ] │  full-width primary
└──────────────────────────────┘
```

- 行のガワ: `Color.bgMuted` + `RoundedRectangle(cornerRadius: Radius.md)`。**影は敷かない** — `BottomSheet` の面はシステム部品由来なので `.atenderShadow` を重ねない (DESIGN.md §3.3 の例外規定)。`bgElevated` にするとシート背景 (`presentationBackground(Color.bgElevated)`) と同色で行が消えるため `bgMuted` を使う。
- 行の左端に **2pt solid の色バー** (`Radius.full`)。色 = 予定の `color`、授業は科目色。DESIGN.md §3.6.1 の「不透明 tint 面 + solid 左バー」を行に写したもの。
- 時刻表記: 終日 → `終日`。単日時刻あり → `HH:MM-HH:MM`。複数日 → `M/D HH:MM - M/D HH:MM` (終日複数日は `M/D - M/D`、**表示は包含最終日** = `end - 1ms` の日)。
- 繰り返し occurrence の行に `Image(systemName: "arrow.triangle.2.circlepath")` + 繰り返し説明文。
- タップ領域は行全体 44pt 以上。削除ボタンは 44×44pt の hit area を持つ (視覚 32pt + `.contentShape`)。
- 予定 0 件 → 「予定はありません」(`.footnote` tertiary)。授業 0 件 → 授業節を出さない。
- **授業行は読み取り専用**。出欠の記録は「学期・科目」の `DayDetailSheet` とホームの出欠 CTA が担当する (CLAUDE.md の IA 規約: 出欠は Home 内 CTA と 学期・科目)。ここに出欠操作を足すと `DayDetailSheet` と二重になる。

**editor モード**: 見出しが「予定を追加」/「予定を編集」に変わり、`PersonalEventEditorContent` (§6.5) が出る。左上に「戻る」テキストボタン (`chevron.left` + "予定") で `mode = .list` に戻る。保存/削除の完了で `mode = .list` に戻し `await onChanged()`。

### 6.5 エディタ `PersonalEventEditorContent` (新規、`Features/Calendar/PersonalEventEditor.swift`)

現行 `PersonalEventEditModalContent` (`Features/SemesterOverview/BulkAndPersonalEventSheets.swift:190-319`) と `PersonalEventEditModal` (`:321-337`) を**置換**する (現行は `date`+`startMinute` 前提)。

```swift
struct PersonalEventEditorContent: View {
    let defaultDate: String
    var occurrence: PersonalEventOccurrenceDto?      // nil = 新規
    let onSaved: () async -> Void
    let onDeleted: () async -> Void
    let onCancel: () -> Void
    @Environment(AppEnvironment.self) private var environment
}
```

フィールド (上から):

| # | 項目 | コントロール | 制約 |
|---|---|---|---|
| 1 | タイトル | `TextField` | 1..100 文字。空なら保存不可 |
| 2 | 終日 | `Toggle` | ON で 3/4 が `.date` のみに変わる |
| 3 | 開始 | `DatePicker(displayedComponents: isAllDay ? .date : [.date, .hourAndMinute])` | — |
| 4 | 終了 | 同上 | 終日: 終了日 >= 開始日 (**包含**)。時刻あり: 終了 > 開始 |
| 5 | 繰り返し | `RecurrenceSpecPicker` (§6.6) | — |
| 6 | 場所 | `TextField` | 0..200 |
| 7 | メモ | `TextField(axis: .vertical, lineLimit: 3...6)` | 0..500 |
| 8 | 色 | 現行のスウォッチ 6 個 + `ColorPicker` (`BulkAndPersonalEventSheets.swift:229-247` を移植) | `#RRGGBB` |
| 9 | 保存 | `AtenderButton(variant: .primary)` | 上の検証を満たすときだけ有効 |
| 10 | 削除 | `AtenderButton(variant: .ghost)` 赤字。**編集時のみ**表示 | — |

**終日の日付変換 (§3.3 の UI 側)**:
- 読み込み時: `isAllDay` なら 終了日 = `jstDate(end - 1ms)`。
- 保存時: `isAllDay` なら `start = 開始日の JST 00:00`、`end = (終了日 + 1 日) の JST 00:00`。
- 時刻ありのときは DatePicker の値をそのまま ISO8601 で送る。

**保存の分岐**:
- 新規 → `POST`。`recurrence` は spec を組んだときだけ入れる。
- 編集 かつ `occurrence.isRecurringOccurrence == false` → `PATCH` を `editScope: "all"`、`originalDate: occurrence.occurrenceDate` で 1 回。
- 編集 かつ `occurrence.isRecurringOccurrence == true` → **`.confirmationDialog` で 3 択**を出してから `PATCH` (§6.7)。
- **繰り返しの内容 (spec) を変えた場合、`single` は選べない** — 3 択ダイアログで「この予定のみ」を無効化 (ボタンを出さない) し、2 択にする。サーバも 400 `SCOPE_NOT_ALLOWED` で二重防御。
- 削除: 非繰り返し → 即 `DELETE scope=all`。繰り返し → 3 択ダイアログ (3 つとも `role: .destructive`)。

**保存後の EventKit 書き出し**: **エディタは EventKit を直接呼ばない。** 現行 `PersonalCalendar.swift:167-170` の `pushManualEvent(saved)` 呼び出しは**削除**する。保存後の `cache.invalidate` を D3 のトリガ (D3 §7.6 / TR-6) が拾って差分エンジンが書き出す。→ **書き込み経路を 1 本に保つ** (D3 §12 差分 B、Leader 裁定 2026-07-29)。

### 6.6 `RecurrenceSpecPicker` (新規、`Features/Calendar/RecurrenceSpecPicker.swift`)

```swift
struct RecurrenceSpecPicker: View {
    @Binding var spec: RecurrenceSpecDto?      // nil = 繰り返しなし
    let start: Date                            // 開始日時 (プリセット導出に使う)
}

enum RecurrencePresetKind: String, CaseIterable {
    case none, daily, weekly, weekday, monthlyByMonthDay, monthlyByDay, yearly, custom
}

enum RecurrenceSpecLogic {
    /// プリセット → spec。custom / none は nil を返す
    static func spec(for preset: RecurrencePresetKind, start: Date) -> RecurrenceSpecDto?
    /// spec → どのプリセットか。どれとも一致しなければ .custom、nil なら .none
    static func preset(for spec: RecurrenceSpecDto?, start: Date) -> RecurrencePresetKind
    /// 表示文 (Web と同一文字列)
    static func describe(_ spec: RecurrenceSpecDto?, start: Date) -> String
}
```

UI:
- 「繰り返し」`Picker` (menu style): `なし / 毎日 / 毎週 <曜> / 毎週 平日 / 毎月 <D>日 / 毎月 第<N><曜> / 毎年 <M>月<D>日 / カスタム…`
- `カスタム` を選ぶと下に展開:
  - **間隔**: `Stepper` 1...99 + 単位 `Picker` (日 / 週 / 月 / 年)
  - **曜日** (単位=週のときのみ): 7 個のトグルチップ (月火水木金土日)。全部 OFF にしようとしたら開始日の曜日を強制 ON にする
  - **月の繰り返し方** (単位=月のときのみ): `Picker` (毎月 D 日 / 毎月 第N曜)
  - **終了**: `Picker` (なし / 日付 / 回数) — **排他** (EventKit の `EKRecurrenceEnd` が排他のため)
    - 日付 → `DatePicker(.date)`、開始日以降のみ
    - 回数 → `Stepper` 1...730
- 選択の下に `RecurrenceSpecLogic.describe(...)` を `.footnote` secondary で常時表示。

**表示文の正典** (Web と 1 文字も違わないこと。両方でテストする):

| spec | 文 |
|---|---|
| nil | `繰り返しなし` |
| DAILY, interval 1 | `毎日` |
| DAILY, interval n>1 | `n日ごと` |
| WEEKLY, interval 1, byDay=[MO..FR] (5 個ちょうど) | `毎週 平日` |
| WEEKLY, interval 1, その他 | `毎週 月, 水` (byDay を MO..SU 順に日本語 1 文字, `, ` 区切り) |
| WEEKLY, interval n>1 | `n週ごと 月, 水` |
| MONTHLY, BYMONTHDAY, interval 1 | `毎月 23日` |
| MONTHLY, BYDAY, interval 1, ord 1..4 | `毎月 第4水曜` |
| MONTHLY, BYDAY, interval 1, ord 5 | `毎月 最終水曜` |
| MONTHLY, interval n>1 | 上の `毎月` を `nヶ月ごと` に置換 |
| YEARLY, interval 1 | `毎年 7月23日` |
| YEARLY, interval n>1 | `n年ごと 7月23日` |
| 末尾 (end.kind=until) | 上の文 + ` ・2026/12/31 まで` |
| 末尾 (end.kind=count) | 上の文 + ` ・10回` |

MONTHLY/YEARLY の日・曜日・月は `start` (JST) から導出する。

### 6.7 3 択ダイアログ

`.confirmationDialog` を使う (`.sheet` を消費しないので §6.4 の単一シート方針と衝突しない)。

```swift
.confirmationDialog(scopePromptTitle, isPresented: $scopePrompt, titleVisibility: .visible) {
    if allowsSingle { Button("この予定のみ", role: scopeRole) { commit("single") } }
    Button("これ以降すべて", role: scopeRole) { commit("future") }
    Button("すべての予定", role: scopeRole) { commit("all") }
    Button("キャンセル", role: .cancel) { }
}
```
- `scopePromptTitle` = 編集なら `繰り返しの予定を変更`、削除なら `繰り返しの予定を削除`。
- `scopeRole` = 削除のとき `.destructive`、編集のとき `nil`。
- `allowsSingle` = 繰り返し内容 (spec) を変えていない、かつ削除でない/削除でも single 可 → 削除は 3 択とも可。編集で spec を変えたときのみ false。

### 6.8 削除する死にコード (本番 caller 0 を grep で実測済)

| 対象 | 実測 |
|---|---|
| `DayAgendaPanel` (`PersonalCalendar.swift:449-509`) | `grep -rn "\bDayAgendaPanel\b" apps/ios` → 定義以外 **0 件** |
| `CalendarSegmented` (`:186-209`) | 同 **0 件** |
| `CalendarWeek` (`:511-554`) | 同 **0 件** |
| `CalendarDay` (`:556-595`) | 同 **0 件** |
| `@State isAddingPersonalEvent` (`:95`) + `.overlay { PersonalEventEditModal(...) }` (`:161-175`) | B1 の死んだ導線。`activeSheet` に置換 |
| `PersonalEventEditModal` / `PersonalEventEditModalContent` (`BulkAndPersonalEventSheets.swift:190-337`) | §6.5 の新エディタで置換。`DayDetailSheet` からの 2 参照 (`:36`, `:46`) も差し替える |
| `EventKitTimeMapping.toPersonalDays` (`EventKitTimeMapping.swift:15-53`) | 日単位分解が不要になる (§5.6) |

**これは新しいプロダクト判断ではない** — 日/週表示とアジェンダの廃止は build 11 で Touri が実機裁定済で、この 4 つはその裁定の結果 caller を失った残骸である。裁定の実行として削除する。

`CalendarLane` (`TimetableLogic.swift:243`) は `CalendarDay` 削除後、本番 caller が 0 になり `CalendarLaneTests` (5 件) だけが参照する。**削除しない** — 純 util であり、削除するとテストを 5 件減らして台帳の突合を複雑にする。「本番 caller が 0 になった事実」を §16 で報告する。
`CalendarViewMode` は `PeriodNav` と `TimetableLogic.weekStartsFor` が使い続けるので**残す**。`PeriodNav` も**無変更** (両 caller が `.month` を渡すのみ)。

### 6.9 `DayDetailSheet` の兄弟シート修正 (B5)

`Features/SemesterOverview/DayDetailSheet.swift:34-52` の `.background { BottomSheet(...); BottomSheet(...) }` を、`SemesterOverviewView.swift:113-146` と同じ**単一 `.sheet` 集約形**に直す。

```swift
enum DayDetailSheetKind: Equatable { case create, edit(PersonalEventDto) }   // → PersonalEventOccurrenceDto
@State private var activeSheet: DayDetailSheetKind?
private var activeSheetBinding: Binding<Bool> { Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } }) }

@ViewBuilder private var sheetHost: some View {
    switch activeSheet {
    case .create:
        BottomSheet(title: "予定を追加", isPresented: activeSheetBinding, stackLevel: 2) {
            PersonalEventEditorContent(defaultDate: date, occurrence: nil, ...)
        }
    case .edit(let occurrence):
        BottomSheet(title: "予定を編集", isPresented: activeSheetBinding, stackLevel: 2) {
            PersonalEventEditorContent(defaultDate: date, occurrence: occurrence, ...)
        }
    case nil:
        EmptyView()
    }
}
```
`.background { sheetHost }` に置換。あわせて `DayDetailSheet.swift:7` の dead parameter `onClose` (body から一度も呼ばれない) を**削除**し、呼び出し側 `SemesterOverviewView.swift:125` の `onClose:` 引数も削除する。

### 6.10 EventKit 層の追随 — **読み込み側だけ** (§5.6 の入力形に合わせる)

> **★ 2026-07-29 Leader 裁定**: **書き出し側 (`EventKitService` / `CalendarSyncCoordinator` の書き込み経路) は本 doc の対象外**で、D3 が正典。以前あった「`EventKitService.createEvent/updateEvent` の引数型を `PersonalEventSeriesDto` に変える」「`pushManualEvent` に `guard event.recurrenceRule == nil` を足す」という記述は、D3 §12 差分 B / 差分 C により**撤回**した (`EventKitService` は `actor EventKitStore` + `apply(_ plan:calendarId:)` 1 本に置換され、個別 create/update と push-back 経路は消える)。本 doc が触るのは**読み込み (EK → Atender) に必要な型追随だけ**である。

| ファイル | 変更 (本 doc の範囲) |
|---|---|
| `Core/Sync/EventKitTimeMapping.swift` | `toPersonalDays` を**削除**。`toAbsolute(date:isAllDay:startMinute:endMinute:)` は範囲計算にしか使われないので `static func jstDayStart(_ date: String) -> Date` に置換。`EKEventSnapshot` を `{ externalId, calendarId, occurrenceStart: Date, lastModified: Date?, start: Date, end: Date, isAllDay: Bool, title: String, location: String? }` に置換 |
| `Core/Sync/EventKitReconciler.swift` | `uploads(from:)` が新 `EventKitSyncEvent` を作る。**`pushTargets` / `ReconcilePlan` / `recentlyWritten` は D3 が削除する** (本 doc では触らない) |
| EK スナップショット取得 (`fetchSnapshots`) | per-day 展開をやめ occurrence をそのまま返す。**この関数の置き場所は D3 §6.4 の `actor EventKitStore`** (旧 `EventKitService` は D3 が削除する)。本 doc は「返る値の形」だけを規定する |
| `Core/Sync/CalendarSyncCoordinator.swift` | 読み込み経路の型追随のみ。**`pushManualEvent` の削除とオーケストレータの全面書き換えは D3 §6.5** |

---

## 7. Web

`apps/web` は「モデル変更で壊れる箇所を直す」が下限だが、**繰り返しの作成・3 択編集までは入れる**。理由: Web で繰り返し予定を編集できないと、iOS で作った繰り返しを Web から触った瞬間に系列が壊れる (`editScope` 未指定 = `all` で全回が動く) 危険がある。Web の日/週/月表示や `DayAgendaPanel` の**レイアウトは変えない** (Touri の要望は iOS 側の見た目についてのもの)。

| ファイル | 変更 |
|---|---|
| `src/api/hooks/types.ts` | `PersonalEventsResponse` / `PersonalEventResponse` の型を新 DTO に差し替え |
| `src/api/hooks/usePersonalEvents.ts` | `usePersonalEvents({from,to})` (semesterId 廃止)。`useUpdatePersonalEvent` / `useDeletePersonalEvent` が `editScope` / `originalDate` / `scope` を受ける |
| `src/api/queryKeys.ts:14` | `personalEvents` のキーから `semesterId` を落とす |
| `src/components/home/PersonalCalendar.tsx:44,56-66` | `usePersonalEvents` の引数と `ownEvents` マッピングを `days` ベースに。1 occurrence × N 日 → N イベント。`eventId` は `${seriesId}:${occurrenceDate}:${day.date}` |
| `src/components/semester/AttendanceCalendar.tsx:39-47` | `eventDates` を `new Set(events.flatMap(e => e.days.map(d => d.date)))` に |
| `src/components/semester/DayDetailSheet.tsx:127-168` | 予定行の表示 (終日/時刻/場所/繰り返し記号) と、編集・削除で `RecurrenceEditDialog` (`src/components/recurrence/RecurrenceEditDialog.tsx`、既存・**無改変で再利用**) を挟む |
| `src/components/semester/PersonalEventEditModal.tsx` | 全面書き換え。`start`/`end` (datetime-local / date)、場所、`RecurrenceSpecPicker` を持つ |
| `src/components/semester/BulkEditSheet.tsx:63-78` | `POST` body を `{ start, end, isAllDay: true, title }` に (日付 → JST 00:00 / 翌 00:00 の ISO)。`semesterId` を送らない |
| `src/components/recurrence/RecurrenceSpecPicker.tsx` | **新規**。`RecurrenceSpec` を組む。`presetToRRule` は使わない |
| `src/lib/meetingExpansion.ts:33-43` | `PersonalEvent` variant に `seriesId` / `occurrenceDate` / `isAllDay` / `isRecurringOccurrence` を追加 (`eventId` は残す) |

**触らない**: `src/components/recurrence/RecurrencePicker.tsx` と `src/lib/recurrenceFormat.ts` (ルーム予定専用のまま)。ルームの繰り返しピッカーの強化は次レーン (§16)。

---

## 8. UI/UX 総括

### 8.1 画面レイアウト (ホーム → 自分 → カレンダー)

```
┌────────────────────────────────┐
│ 2026 前期 ▾      ホーム         │  nav bar (inline) — 無変更
├────────────────────────────────┤
│ [自分] [情報処理科] [+]         │  ContextChips (rooms があるときだけ)
│ [ 時間割 ][ カレンダー ]         │  segmented
│                                │
│    ‹   2026年7月   ›       [＋] │  月ヘッダ行 (PeriodNav + 追加ボタン)
│ ┌────────────────────────────┐ │
│ │ 月 火 水 木 金 土 日        │ │ ← ★ タイル (Radius.lg + shadow + s2 padding)
│ │ 30  1  2  3  4  5  6       │ │   画面左右は page margin 16pt の内側
│ │  7  8  9 10 11 12 13       │ │   中の描き方は無変更
│ │ 14 15 16 17 18 19 20       │ │
│ │ 21 22 ⬤ 24 25 26 27       │ │   ⬤ = 今日
│ │ 28 29 30 31  1  2  3       │ │
│ │  4  5  6  7  8  9 10       │ │
│ └────────────────────────────┘ │
│                                │
│   [ 今日は全出席 ]              │  出欠 CTA overlay (無変更)
└────────────────────────────────┘
        ↓ 日付マスをタップ
┌────────────────────────────────┐
│  §6.4 の PersonalDaySheet      │
└────────────────────────────────┘
```

### 8.2 コンポーネント構成 / 状態の置き場所

| state | 置き場所 |
|---|---|
| `anchor` / `selectedDate` / `occurrences` / `timetables` / `semesters` / `overview` / `isLoading` / `hasError` | `PersonalCalendarViewModel` (`@Observable`) |
| `activeSheet: PersonalCalendarSheet?` | `PersonalCalendar` の `@State` |
| シート内のモード (`list` / `editor`) | `PersonalDaySheet` の `@State mode` |
| エディタのフォーム値 | `PersonalEventEditorContent` の `@State` |
| 3 択ダイアログの表示フラグと保留中の操作 | `PersonalEventEditorContent` / `PersonalDaySheet` の `@State` |

### 8.3 画面遷移

```
月グリッド ──日付タップ──▶ PersonalDaySheet(list)
   │                          │  行タップ / +
   │                          ▼
   │                       PersonalDaySheet(editor)
   │                          │  保存 / 削除 (繰り返しなら 3 択 dialog)
   │                          ▼
   │                       PersonalDaySheet(list)  ← reload 済
   └──月ヘッダの ＋──▶ PersonalDaySheet(editor, 選択日で新規)
```
シート内の「戻る」または × でシートを閉じる。× は `BottomSheet` 標準、外側タップ・スワイプダウンも native `.sheet` の標準挙動で閉じる。

### 8.4 視覚階層 (DESIGN.md §4 の割当を本画面へ)

| 階層 | 要素 | 表現 |
|---|---|---|
| L0 | 今日 / 選択日のセル | accent 塗り丸 (今日) / accent アウトライン丸 (選択) |
| L1 | 月グリッド **タイル** | `Color.bgElevated` + `Radius.lg` (24) + `.atenderShadow(.card)` + `Space.s2` padding |
| L2 | イベント chip / シートの行 | 不透明 tint 面 + 2pt solid 左バー + `textPrimary` |
| L3 (meta) | 曜日ヘッダ・月ラベル・時刻・繰り返し説明 | `.caption` / `.footnote` secondary |

### 8.5 状態の網羅

- **loading**: 現行の `Skeleton` 2 枚 (`:123-126`) を維持。
- **error**: 「カレンダーを読み込めませんでした。」+ 再試行ボタンを追加 (現行は再試行導線が無い)。
- **empty (予定 0・授業 0)**: 月グリッドは空セルのまま出す (`ContentUnavailableView` にしない — カレンダーは空でもグリッドが情報)。日タップシートは「予定はありません」+ 追加ボタン。
- **学期なし / 時間割なし**: 月グリッドは**出る**。授業が乗らないだけ (T3)。現行の 3 つの遮断パネル (`:99-100`, `:129-130`, `:131-132`) は**カレンダーモードでは出さない**。
- **EventKit 権限なし**: 現行どおり同期しないだけ。月グリッドは backend の予定を出す。

### 8.6 ナビゲーション / IA

個人カレンダーは Home 内のまま (CLAUDE.md の IA 規約)。新規タブを作らない。予定の追加は「月ヘッダの ＋」(1 タップ) と「日タップ → シート内の ＋」(2 タップ) の 2 経路。

> **逸脱 1 行**: DESIGN.md §3.7.1 は「画面固有アクションは toolbar trailing」と定めるが、`＋` は月ヘッダ行に置く。`HomeView` の toolbar は 自分/ルーム × 時間割/カレンダー の 4 組合せで共有されており、選択日 state を持つ `PersonalCalendar` から離れているため。gear (時間割設定) は toolbar trailing のまま変えない。

---

## 9. 挙動仕様 (★ Reviewer はここからテストを生成する)

時刻に依存する項目は **#番号ごとに標本時刻を明記**する。JST 00:00〜08:59 の危険窓を必ず含めること (`gotcha/client-today-must-use-server-timezone.md`)。

### R. `buildRRule` / `parseRRule` (packages/shared・純関数)

DTSTART は特記なければ **2026-07-23 (木) 09:00 JST** = `2026-07-23T00:00:00Z`。

- **R1**: `{freq:"DAILY", interval:1, end:{kind:"never"}}` → `"FREQ=DAILY"`。
- **R2**: `{freq:"DAILY", interval:3}` → `"FREQ=DAILY;INTERVAL=3"`。
- **R3**: `{freq:"WEEKLY", interval:1, byDay:[]}` → `"FREQ=WEEKLY;BYDAY=TH"` (DTSTART の JST 曜日)。
- **R4 (危険窓)**: DTSTART = **2026-07-23 (木) 00:30 JST** (= `2026-07-22T15:30:00Z`) で `{freq:"WEEKLY", byDay:[]}` → `"FREQ=WEEKLY;BYDAY=TH"`。**UTC 暦で曜日を採る実装はここで `WE` を出して落ちる。**
- **R5**: `{freq:"WEEKLY", byDay:["FR","MO","WE"]}` → `"FREQ=WEEKLY;BYDAY=MO,WE,FR"` (MO..SU 順に正規化)。
- **R6**: `{freq:"WEEKLY", interval:2, byDay:["MO","TU","WE","TH","FR"]}` → `"FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR"`。
- **R7**: `{freq:"MONTHLY", monthlyMode:"BYMONTHDAY"}` → `"FREQ=MONTHLY;BYMONTHDAY=23"`。
- **R8**: `{freq:"MONTHLY", monthlyMode:"BYDAY"}` → `"FREQ=MONTHLY;BYDAY=4TH"` (23 日 → `floor((23-1)/7)+1 = 4`)。
- **R9**: DTSTART = 2026-07-30 (木、第 5 木曜) で `{freq:"MONTHLY", monthlyMode:"BYDAY"}` → `"FREQ=MONTHLY;BYDAY=-1TH"`。
- **R10**: `{freq:"MONTHLY", monthlyMode:null}` → `"FREQ=MONTHLY;BYMONTHDAY=23"` (null は BYMONTHDAY 扱い)。
- **R11**: `{freq:"YEARLY"}` → `"FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=23"`。
- **R12**: `end:{kind:"count", count:10}` を R3 に足す → `"FREQ=WEEKLY;BYDAY=TH;COUNT=10"`。
- **R13**: `end:{kind:"until", date:"2026-12-31"}` を R3 に足す → `"FREQ=WEEKLY;BYDAY=TH;UNTIL=20261231T145959Z"` (JST 12/31 23:59:59 = UTC 14:59:59)。
- **R14**: `COUNT` と `UNTIL` が同時に出る spec は**型として構築できない** (discriminated union)。zod で `{kind:"count", count:10, date:"..."}` を渡すと `date` が strip される。
- **R15 (往復)**: R1〜R13 の全出力を `parseRRule(out, dtstart)` に通すと元の spec と `toEqual` になる (`interval` は 1 に正規化)。
- **R16 (未対応 RRULE)**: `"FREQ=MONTHLY;BYSETPOS=2;BYDAY=MO,TU"` → `parseRRule` は `null`。`"FREQ=WEEKLY;BYDAY=MO;WKST=SU"` → `null`。`"FREQ=MONTHLY;BYMONTHDAY=1,15"` → `null`。
- **R17 (上限)**: `interval: 100` / `count: 731` は `RecurrenceSpec.safeParse` が失敗する。

### X. JST 展開 (`expandBetweenJst` / `shiftRRuleUntil`)

- **X1 (終日 + 週次)**: DTSTART = **2026-07-20 (月) 00:00 JST** (= `2026-07-19T15:00:00Z`)、`FREQ=WEEKLY;BYDAY=MO`、範囲 2026-07-20〜2026-08-16 → 展開結果は **7/20, 7/27, 8/3, 8/10 の各 JST 00:00** (4 件)。**`expandBetween` (UTC 版) を使う実装はここで 7/21, 7/28,… を返して落ちる。**
- **X2 (危険窓 + 週次)**: DTSTART = **2026-07-20 (月) 07:00 JST** (= `2026-07-19T22:00:00Z`)、`FREQ=WEEKLY;BYDAY=MO` → 7/20, 7/27, … の各 07:00 JST。
- **X3 (安全帯・回帰確認)**: DTSTART = 2026-07-20 (月) 13:00 JST (= `04:00Z`)、`FREQ=WEEKLY;BYDAY=MO` → 7/20, 7/27, … (UTC 版と同じ結果になること = X1 の修正が安全帯を壊していない)。
- **X4 (UNTIL の整合)**: DTSTART = 2026-07-20 00:00 JST、`FREQ=WEEKLY;BYDAY=MO;UNTIL=20260803T145959Z` (= JST 8/3 23:59:59) → 7/20, 7/27, **8/3 を含む** (3 件)。8/10 は含まない。
- **X5 (`shiftRRuleUntil`)**: `shiftRRuleUntil("FREQ=WEEKLY;UNTIL=20261231T145959Z", 9*3600_000)` → `"FREQ=WEEKLY;UNTIL=20261231T235959Z"`。UNTIL を含まない文字列は無変更で返る。
- **X6 (月次)**: DTSTART = 2026-07-01 00:00 JST の終日、`FREQ=MONTHLY;BYMONTHDAY=1`、範囲 7/1〜9/30 → 7/1, 8/1, 9/1 の各 JST 00:00。
- **X7 (EXDATE)**: X1 の系列に `exDates = ["20260727T000000Z"]` (= JST 7/27 09:00 相当の UTC 表記ではなく、**保存されている値そのもの** = `toIcsDate(JST 7/27 00:00)` = `20260726T150000Z`) を与えると 7/27 が落ちる。→ EXDATE は DTSTART と同じ実 UTC instant で保存し、展開時に同じシフトを受けること。
- **X8 (範囲上限)**: `to - from > 366 日` で `expandBetweenJst` が `RANGE_TOO_LARGE` を throw する (既存 `expandBetween` の上限をそのまま継承)。

### D. `occurrenceDays` (日分割・純関数)

- **D1 (単日・時刻あり)**: start=2026-07-23 09:00 JST, end=10:30 JST, from=to=2026-07-23 → `[{date:"2026-07-23", startMinute:540, endMinute:630}]`。
- **D2 (危険窓)**: start=**2026-07-23 00:30 JST**, end=01:00 JST → `[{date:"2026-07-23", startMinute:30, endMinute:60}]`。**UTC 暦で日を割る実装はここで `2026-07-22` を返して落ちる。**
- **D3 (単日・終日)**: start=2026-07-23 00:00 JST, end=2026-07-24 00:00 JST, isAllDay → `[{date:"2026-07-23", startMinute:0, endMinute:1440}]` (1 件のみ。翌日は含まない)。
- **D4 (複数日・終日)**: start=7/23 00:00, end=7/26 00:00, isAllDay → 7/23, 7/24, 7/25 の 3 件、全て `{0,1440}`。
- **D5 (複数日・時刻あり)**: start=7/23 22:00 JST, end=7/25 03:00 JST → `[{7/23, 1320, 1440}, {7/24, 0, 1440}, {7/25, 0, 180}]`。
- **D6 (深夜跨ぎ・翌 00:00 ちょうどで終わる)**: start=7/23 22:00, end=7/24 00:00 → `[{7/23, 1320, 1440}]` (7/24 を含まない)。
- **D7 (範囲クリップ)**: D4 の occurrence を from=2026-07-24, to=2026-07-24 で計算 → `[{7/24, 0, 1440}]` の 1 件のみ。
- **D8 (クリップで空 → 除外)**: D3 の occurrence を from=to=2026-07-25 で計算 → `[]`。`listPersonalEvents` はこの occurrence を返さない。
- **D9 (異常 end <= start)**: start=end=7/23 09:00 → `[{7/23, 540, 540}]` (1 件、クラッシュしない)。

### A. CRUD + 編集 3 択 (`apps/api`)

- **A1 (作成・単発)**: `POST {title:"面談", start:"2026-07-23T00:00:00Z", end:"2026-07-23T01:30:00Z", isAllDay:false}` → 201、`recurrenceRule=null`、`recurrenceSpec=null`。
- **A2 (作成・終日正規化)**: `POST {title:"帰省", start:"2026-07-23T05:00:00Z"(=JST 14:00), end:"2026-07-25T05:00:00Z", isAllDay:true}` → `start` が JST 7/23 00:00、`end` が JST **7/26** 00:00 に正規化される。
- **A3 (作成・繰り返し)**: `POST {..., start:"2026-07-19T15:00:00Z"(=JST 7/20 00:00), isAllDay:true, recurrence:{spec:{freq:"WEEKLY",byDay:["MO"]}}}` → `recurrenceRule === "FREQ=WEEKLY;BYDAY=MO"`、`recurrenceSpec` が同 spec。
- **A4 (作成・rrule 直指定)**: `recurrence:{rrule:"FREQ=DAILY;INTERVAL=2"}` → そのまま保存、`recurrenceSpec` が `{freq:"DAILY",interval:2,...}`。
- **A5 (作成・spec と rrule 両方)**: 400 `VALIDATION_ERROR`。両方無しの `recurrence:{}` も 400。
- **A6 (作成・end <= start)**: `isAllDay:false` で `end === start` → 400。
- **A7 (取得・展開)**: A3 の系列に対し `GET ?from=2026-07-20&to=2026-08-16` → 4 occurrence、`occurrenceDate` は JST 7/20, 7/27, 8/3, 8/10 の各 00:00、全て `isRecurringOccurrence: true`、`seriesId` は同一、`days` は各 1 件。
- **A8 (取得・from/to 必須)**: `GET /api/personal-events` (クエリなし) → 400。`from` のみ → 400。
- **A9 (取得・範囲上限)**: `from=2026-01-01&to=2027-06-01` (367 日) → 400 `RANGE_TOO_LARGE`。
- **A10 (取得・学期非依存)**: 予定を 2 件作り (片方は昔 `semesterId` を持っていた行を migration 済とみなす)、`GET ?from&to` に**両方**含まれる。`semesterId` クエリを付けても結果が変わらない。
- **A11 (single 編集)**: A3 の系列で `PATCH {editScope:"single", originalDate:"<7/27 00:00 JST の ISO>", title:"帰省(変更)"}` → 系列の `title` は不変。`GET` すると 7/27 の occurrence だけ `title="帰省(変更)"` かつ `overrideId != null`、他 3 件は元 title。
- **A12 (single・非繰り返し)**: A1 の単発に `editScope:"single"` → 400 `NOT_RECURRING`。
- **A13 (future 編集)**: A3 の系列で `PATCH {editScope:"future", originalDate:"<8/3>", title:"新"}` → 元系列の `recurrenceRule` に `UNTIL=` が付き 8/3 より前で切れる。新系列が返る。`GET ?from=2026-07-20&to=2026-08-16` は 7/20, 7/27 (旧 title) + 8/3, 8/10 (新 title) の 4 件。
- **A14 (future で override が掃除される)**: A11 で 7/27 に override を付けた系列に `future originalDate=7/27` → 7/27 以降の override が削除され、`overrideId` が null になる。7/20 より前の override は残る。
- **A15 (all 編集・時刻を delta で動かす)**: 開始 JST 09:00 の毎週木曜の系列で `PATCH {editScope:"all", originalDate:"<8/6 09:00>", start:"<8/6 10:00>", end:"<8/6 11:30>"}` → 系列の `start` が **+1h** され、`GET` の全 occurrence が 10:00-11:30 になる。`recurrenceRule` の `BYDAY=TH` は不変。
- **A16 (all 編集・繰り返しを差し替え)**: `PATCH {editScope:"all", originalDate:"<...>", recurrence:{spec:{freq:"WEEKLY",byDay:["MO","WE"]}}}` → `recurrenceRule === "FREQ=WEEKLY;BYDAY=MO,WE"`。override は保持される。
- **A17 (繰り返し解除)**: `PATCH {editScope:"all", originalDate:"<...>", clearRecurrence:true}` → `recurrenceRule/exDates/rDates` が null、override が全削除、`GET` は 1 occurrence だけ返す。
- **A18 (single で繰り返し変更は不可)**: `PATCH {editScope:"single", originalDate:"<...>", recurrence:{spec:...}}` → 400 `SCOPE_NOT_ALLOWED`。`clearRecurrence:true` + `single`/`future` も同じく 400。
- **A19 (originalDate 必須)**: 繰り返し系列に `PATCH {editScope:"all", title:"x"}` (originalDate 無し) → 400 `ORIGINAL_DATE_REQUIRED`。単発系列なら 200 (省略可)。
- **A20 (削除 single)**: `DELETE ?scope=single&originalDate=<7/27>` → `GET` の occurrence が 3 件になり 7/27 が消える。系列行は残る。
- **A21 (削除 future)**: `DELETE ?scope=future&originalDate=<8/3>` → 7/20, 7/27 の 2 件だけ残る。新系列は作られない。
- **A22 (削除 all)**: `DELETE ?scope=all` → 系列と override が消え `GET` が空。
- **A23 (他人の予定)**: 他ユーザーの `id` に PATCH / DELETE → 404 `NOT_FOUND`。
- **A24 (未認証)**: Cookie 無しで全 endpoint → 401。
- **A25 (バリデーション)**: `title` 空 / 101 文字 / `color:"red"` / `location` 201 文字 / `note` 501 文字 → いずれも 400。
- **A26 (ソート)**: 同日に 3 件 (08:00 / 終日 / 13:00) → `GET` の返りは `start` 昇順 = 終日 (00:00) → 08:00 → 13:00。

### DD. `GET /api/day/:date` (dayDetail)

- **DD1 (繰り返しが日詳細に出る)**: A3 の毎週月曜の系列に対し `GET /api/day/2026-08-03` → `personalEvents` に 1 件、`seriesId` は系列 ID、`occurrenceDate` が JST 8/3 00:00。
- **DD2 (学期で絞らない)**: 時間割の無いユーザーでも `personalEvents` が返る (occurrences は空、personalEvents は非空)。
- **DD3 (複数日の途中の日)**: A2 の 7/23〜7/25 終日に対し `GET /api/day/2026-07-24` → `personalEvents` に 1 件、`days` は `[{2026-07-24, 0, 1440}]`。
- **DD4 (single 取り消し済の回は出ない)**: A20 の後 `GET /api/day/2026-07-27` → `personalEvents` が空。

### P. ルーム共有への投影 (`projectShare`)

- **P1 (単発・そのまま)**: share=NORMAL、単発予定「デート」→ `RoomEvent(title="デート", rawTitle="デート", externalUid="pe:<seriesId>", recurrenceRule=null)`。
- **P2 (繰り返しごと投影・T4)**: 毎週月曜の予定 → `RoomEvent` は **1 行**で `recurrenceRule="FREQ=WEEKLY;BYDAY=MO"`。`GET /api/rooms/:id/week` を 3 週分叩くと 3 occurrence 出る (毎週 1 件)。
- **P3 (投影先でも曜日が合う)**: P2 が**終日**予定のとき、room 側の `roomEvents[].start` の JST 日付が**月曜**になる。**`expandRoomEvents` が UTC 展開のままだと火曜になり落ちる** (§4.3 の必須従属)。
- **P4 (終日 end の変換)**: 個人側 `end = JST 7/24 00:00` の単日終日 → 投影 `RoomEvent.end = JST 7/23 23:59:59.999`。room 側 `RoomEventTiming.timing` の `endMinute` が 1439 になる (build 11 の見え方と一致)。
- **P5 (override の投影)**: 個人側で 7/27 だけ title を変えた override → `RoomEventOverride(originalDate=7/27, newTitle=<マスク後>)` が作られる。個人側で override を消すと投影側も消える。
- **P6 (マスク)**: share=BUSY_ONLY → `title="予定"`, `rawTitle="デート"`。share=TITLE_MAPPED + CONTAINS ルール「デート→予定」→ `title="予定"`。ルール不一致 (「会議」) は素通しで `title="会議"`。**override の `newTitle` も同じマスクを通る**。
- **P7 (再投影で重複しない)**: 同じ share を 2 回 project → `RoomEvent` の件数が増えない (`externalUid` upsert)。
- **P8 (個人側削除の伝播)**: 系列を delete → 再投影で `source=PERSONAL` の該当 `RoomEvent` が消える。他 source (ICS/Google/MANUAL) は残る。
- **P9 (share OFF)**: `DELETE share` → その room+user の `source=PERSONAL` が全消え。
- **P10 (場所は共有しない)**: `location="渋谷店"` の予定を NORMAL で共有 → `RoomEvent.description` に「渋谷店」が**含まれない** (`note` のみ)。

### K. EventKit sync (`reconcileEventKit`)

範囲は特記なければ `{from:"2026-07-20", to:"2026-08-16"}`。

- **K1 (新規ミラー)**: incoming に `(ext=X, occStart=2026-07-23T00:00:00Z)` → `PersonalEvent(source=EVENTKIT, recurrenceRule=null)` が 1 件 create される。
- **K2 (複数日を分解しない)**: incoming の 1 件が start=JST 7/23 00:00, end=JST 7/26 00:00, isAllDay → **PersonalEvent は 1 行**。`GET` すると 1 occurrence で `days` が 3 件。**旧実装のように 3 行にならないこと。**
- **K3 (更新)**: 既存ミラー `ekLastModified=T0`、incoming `T1>T0` → title/start/end/location が更新される。
- **K4 (更新しない)**: incoming `ekLastModified <= 既存` → no-op。
- **K5 (削除伝播)**: 既存ミラー `(ext=Y, occStart=JST 7/25 10:00)` が incoming に無い → delete。
- **K6 (範囲外は消さない)**: 既存ミラーの `start` が JST 2026-07-19 23:00 (range の外) で incoming にも無い → **削除されない**。
- **K7 (範囲に食い込む先頭)**: incoming に `start=JST 7/19 23:00, end=JST 7/20 02:00` が含まれる → upsert され、K5 の削除対象にならない。
- **K8 (MANUAL 不可侵)**: `source=MANUAL` の行は incoming に無くても削除・更新されない。
- **K9 / K10 — 欠番。** 旧「`manualNeedingPush` に入る / 入らない」の 2 項目は、**2026-07-29 の Leader 裁定 (D3 §12 差分 B) で push-back 経路ごと廃止**されたため削除した。**残る項目の番号は振り直していない** (Reviewer が ID で参照するため)。書き出し側の挙動仕様は D3 §8 の `MP.` / `PL.` 系が持つ。
- **K11 (同 externalId・別 occurrence)**: 同じ `ekExternalId` で `ekOccurrenceStart` が違う 2 件 → 別行として両方保持 (unique 制約に頼らない)。
- **K12 (投影フック)**: sync 後に enabled な share の再投影が走る (P2 の RoomEvent が現れる)。
- **K13 (収束)**: 同じ input で 2 回連続 sync → 2 回目は create/update/delete が全て 0。

### U. iOS (純ロジック層)

- **U1 (`PersonalEventDisplay.calendarEvents`)**: `days` が 3 件の occurrence 1 個 → `CalendarEvent` 3 個。各 `date`/`startMinute`/`endMinute` が `days` の値と一致。`id` は `"e:<seriesId>:<occurrenceDate>:<date>"`。
- **U2 (色フォールバック)**: `color=nil` → `"#8b5cf6"`。
- **U3 (空)**: `occurrences: []` → `[]`。
- **U4 (`occurrences(on:)`)**: 3 日にまたがる occurrence は 3 つの日いずれで呼んでも 1 件返る。またがらない日では 0 件。
- **U5 (ソート)**: 同日に 終日 (0-1440) と 13:00 (780-870) と 08:00 (480-570) → `startMinute` 昇順で 終日 → 08:00 → 13:00。
- **U6 (`PersonalCalendarLogic.monthChanged`)**: `("2026-07-15","2026-07-31")` → false。`("2026-07-15","2026-08-01")` → true。`("2026-07-15","2026-06-30")` → true。
- **U7 (`CalendarMonthLayout.gridAvailable`)**: `gridAvailable(available: 600) == 584`。`gridAvailable(available: 10) == 0` (負にならない)。
- **U8 (`rowHeight` 不変)**: `rowHeight(available: 626) == 100` — 既存式 `(available - 26)/6` のまま。`CalendarLayoutTests` #CA1/#CA3 は緑を維持する。
- **U9 (`RecurrenceSpecLogic.spec(for:start:)`)**: start=2026-07-23 (木) で `.weekly` → `{freq:"WEEKLY", byDay:["TH"], interval:1, end:{kind:"never"}}`。`.weekday` → `byDay:["MO","TU","WE","TH","FR"]`。`.monthlyByDay` → `{freq:"MONTHLY", monthlyMode:"BYDAY"}`。`.none`/`.custom` → nil。
- **U10 (`preset(for:start:)` の逆写像)**: U9 の各出力を戻すと元のプリセットになる。`{freq:"WEEKLY", interval:2, byDay:["MO"]}` → `.custom`。`nil` → `.none`。
- **U11 (`describe`)**: §6.6 の表の全行を検証する。特に `{freq:"WEEKLY",interval:1,byDay:["MO","WE"],end:{kind:"count",count:10}}` (start=2026-07-23) → `"毎週 月, 水 ・10回"`。`{freq:"MONTHLY",monthlyMode:"BYDAY"}` (start=2026-07-30) → `"毎月 最終木曜"`。
- **U12 (終日の日付往復)**: `end = JST 2026-07-26 00:00` の終日 occurrence をエディタで開くと終了日フィールドが **2026-07-25**。そのまま保存すると `end` が `JST 2026-07-26 00:00` に戻る。
- **U13 (DTO decode)**: `days` を含む occurrence JSON を `PersonalEventOccurrenceDto` に decode でき、`id` が `"<seriesId>:<occurrenceDate>"` になる。JSON に `id` キーがあっても無視される。
- **U14 (repository 配線)**: `PersonalEventRepository.personalEvents(from:to:)` が実 API 形状の fixture を decode できる (型直書き decode でなく repository 経由で検証する。`gotcha/dto-type-literal-decode-tests-bypass-repository-wiring.md`)。

### V. iOS (View 層 — SmokeTests / スクショで見る項目)

ユニットテストでは検証できない。Reviewer は「クラッシュ非回帰」までを担保し、以下は Touri のシミュレータ確認に回す。

- **V1**: 月グリッドが**タイル** (左右に 16pt の余白、角丸、影) になっている。画面端まで伸びていない。
- **V2**: ルーム詳細のカレンダーも同じタイルになっている。
- **V3**: 日付マスをタップすると下からシートが出る。
- **V4**: 月ヘッダ右の `＋` から予定を追加できる (B1 の解消)。
- **V5**: **当月外のグレーのマスをタップして表示月が変わったとき、その月の予定が入った状態で描画される** (B2 の解消)。
- **V6**: 学期を選んでいない / その学期の時間割が無い状態でも月グリッドと予定が出る (T3)。
- **V7**: `DayDetailSheet` (学期・科目 → 日タップ) で「追加」と「編集」の**両方**のシートが開く (B5 の解消)。

### W. Web

- **W1**: `PersonalCalendar` が複数日 occurrence を各日に描く。
- **W2**: `AttendanceCalendar` の予定ドットが複数日 occurrence の全日に付く。
- **W3**: `DayDetailSheet` で繰り返し occurrence を編集/削除しようとすると `RecurrenceEditDialog` が出て、選んだ scope が API に渡る。非繰り返しならダイアログは出ず即実行。
- **W4**: `BulkEditSheet` が複数日付に終日予定を作る (`start`/`end` を JST 00:00 / 翌 00:00 で送る)。
- **W5 (負の対照)**: `usePersonalEvents` に `from`/`to` を渡さない呼び出しが**リポジトリ内に 1 つも無い** (grep で 0 件)。

---

## 10. テスト基盤

### backend (`apps/api` + `packages/shared`, Vitest)

- 配置: `apps/api/tests/*.test.ts` (既存慣習)。`packages/shared` に単独のテスト設定は無いので、**shared の純関数テストも `apps/api/tests/` に置く** (`@atender/shared` から import)。
- 新規:
  - `tests/recurrence-spec.test.ts` — R1〜R17
  - `tests/rrule-expand-jst.test.ts` — X1〜X8。**X1/X3 は負の対照**として「`expandBetween` (UTC 版) では別の日が出る」ことも併せてアサートし、修正が効いていることを示す
  - `tests/personal-occurrence-days.test.ts` — D1〜D9
  - `tests/personal-events-recurrence.test.ts` — A11〜A22
- 拡張:
  - `tests/personal-events.test.ts` — 既存 10 件を新モデルへ全面書き換え (A1〜A10, A23〜A26)。`date`/`startMinute`/`semesterId` を使う既存アサートは全て新形式に置換する
  - `tests/day-detail.test.ts` — DD1〜DD4 を追加
  - `tests/personal-calendar-share.test.ts` — P1〜P10 へ書き換え (既存 9 件は単発前提)
  - `tests/eventkit-sync.test.ts` — K1〜K8, K11〜K13 へ書き換え (既存 11 件は日単位鍵前提)。**K9/K10 は欠番** (D3 §12 差分 B の裁定で push-back 経路ごと廃止)
- **★ 既存テストで壊れるもの (grep で母数確定済)**: `personalEvent|personal-events` を含む api テストは `personal-events.test.ts` / `eventkit-sync.test.ts` / `day-detail.test.ts` / `personal-calendar-share.test.ts` の **4 ファイルのみ**。`roomEvent.test.ts` / `roomWeek.test.ts` には RRULE 展開のアサートが 1 件も無い (`grep -rn "recurrenceRule\|FREQ=" apps/api/tests` = 0 件) ので §4.3 の JST 化で壊れるテストは**ゼロ**。
- ★ known-failures 台帳 (`.knowledge/known-failures.md`) と照合し、**未分類の失敗を残したままマージしない**。実測ベースラインは 17 failed / 318 passed (2026-07-17, `3c9e85b`)。

### iOS (`apps/ios/AtenderTests`, XCTest)

- 新規: `PersonalEventDisplayTests` (U1-U5)、`PersonalCalendarLogicTests` (U6)、`RecurrenceSpecLogicTests` (U9-U11)、`PersonalEventEditorLogicTests` (U12)。
- 拡張: `CalendarLayoutTests` に U7/U8 を追加 (既存 #CA1/#CA3 は**変更しない**)。`DTODecodingTests` に U13。`PersonalEventContractTests` (新規) に U14 — **実 API から採取した fixture** を `Fixtures/personalEventsLive.json` に置き、repository 経由で decode する。
- **書き換えが要るもの**: `EventKitTimeMappingTests` (S1-S6 は `toPersonalDays` 前提なので**削除**し、`jstDayStart` と snapshot 変換の新テストに置換)、`EventKitReconcilerTests` (`uploads(from:)` のケースを新 DTO 形に。**`pushTargets` のケースは D3 が削除する**ので本 doc では触らない)。
- **EKEventStore の実体に触る層 (D3 の `actor EventKitStore`) はユニットテスト対象外** (Simulator の EventKit 実体依存)。テストの割り当ては D3 §9 が持つ。本 doc 側の回帰は `SmokeTests` / `ScreenshotFlow` でクラッシュ非回帰のみ。
- **★ View 層 (§9 V 系) はこのスイートで検出できない**。台帳の教訓どおり `0 failures` を根拠にしない。Touri のシミュレータ確認が最終ゲート。
- ベースライン: **iOS 268 GREEN / 0 RED** (`0368155`, 2026-07-18 実測)。Reviewer は pass/fail 以前に `xcodebuild build-for-testing` が通るかを第一関門にする (DTO 全面置換のため)。

### Web (`apps/web`, Vitest + RTL)

- 配置: `apps/web/tests/components/*.test.tsx` (既存慣習)。
- 拡張: `DayDetailSheet.test.tsx` / `DayDetailSheet.review.test.tsx` / `BulkEditSheet.test.tsx` — 新 DTO 形に。W3/W4 を追加。
- 新規: `tests/components/RecurrenceSpecPicker.test.tsx` (W1 相当の spec 組み立て)、`tests/lib/personalEventDays.test.ts` (W1/W2 のマッピング)。
- **prop 契約**: `RecurrenceSpecPicker` の公開 prop は `{ value: RecurrenceSpec | null; onChange: (next: RecurrenceSpec | null) => void; start: Date }`。`RecurrenceEditDialog` は無改変 (`{ open, mode: "edit"|"delete", onClose, onConfirm(scope) }`)。

---

## 11. 触るファイル確定リスト

### packages/shared
1. `src/schemas/recurrence.ts` — **新規**。`RecurrenceSpec` / `RecurrenceEnd` / `WeekdayCode`
2. `src/recurrence/rrule.ts` — **新規**。`buildRRule` / `parseRRule`
3. `src/schemas/personalEvent.ts` — **全面置換** (§5.1)
4. `src/index.ts` — 新 export を追加

### apps/api
5. `prisma/schema.prisma` — `PersonalEvent` 置換 (`:291-315`)、`PersonalEventOverride` 新設、`Semester` の `personalEvents` back-relation 削除
6. `prisma/migrations/20260729xxxxxx_personal_event_rebuild/migration.sql` — **新規** (§3.4)
7. `src/lib/rruleExpand.ts` — `JST_OFFSET_MS` / `shiftRRuleUntil` / `expandBetweenJst` 追加、`parseIcsDate` を export、`appendOrReplaceUntil` / `stripUntil` / `datesToCsv` を移設
8. `src/services/recurrence.service.ts` — 3 つの private ヘルパを削除し lib から import (`:197-209`)。`:48` の `expandBetween` → `expandBetweenJst`
9. `src/services/personalRecurrence.service.ts` — **新規** (§5.3)
10. `src/services/personalEvent.service.ts` — **全面書き換え**
11. `src/services/dayDetail.service.ts` — `:40-43` を展開経由に (§5.4)
12. `src/services/personalCalendarShare.service.ts` — `projectShare` (`:89-157`) 書き換え、`personalEventTiming` (`:172-181`) 削除 (§5.5)
13. `src/routes/personalEvents.ts` — クエリ/パラメータ更新 (§5.2)
14. `src/lib/clientVersion.ts:9` — `MIN_IOS_BUILD = 1` → **12**
15. テスト: §10 の 4 ファイル書き換え + 4 ファイル新規

### apps/ios
16. `Atender/Core/Models/DTOs.swift` — `:442-499` を §6.1 で置換
17. `Atender/Core/Networking/APIEndpoint.swift:95-102` — 更新
18. `Atender/Core/Data/Repositories.swift:189-220` — `PersonalEventRepository` 更新
19. `Atender/Core/Timetable/TimetableLogic.swift` — `PersonalEventDisplay` / `PersonalCalendarLogic` 追加
20. `Atender/Core/Timetable/CalendarMonthLayout.swift` — `cardChromeHeight` / `gridAvailable` 追加
21. `Atender/Features/Calendar/PersonalCalendar.swift` — VM 書き換え、`CalendarMonth` のタイル化、`CalendarMonthChrome` 削除、`activeSheet` 導入、死にコード 4 struct 削除
22. `Atender/Features/Calendar/PersonalDaySheet.swift` — **新規** (§6.4)
23. `Atender/Features/Calendar/PersonalEventEditor.swift` — **新規** (§6.5)
24. `Atender/Features/Calendar/RecurrenceSpecPicker.swift` — **新規** (§6.6)
25. `Atender/Features/SemesterOverview/BulkAndPersonalEventSheets.swift` — `PersonalEventEditModal` / `PersonalEventEditModalContent` (`:190-337`) 削除、一括作成 (`:145`) の入力形を更新
26. `Atender/Features/SemesterOverview/DayDetailSheet.swift` — 単一シート集約 (`:34-52`)、`onClose` 削除 (`:7`)、新エディタ利用、`personalEvents` 型追随
27. `Atender/Features/SemesterOverview/SemesterOverviewView.swift:125` — `onClose:` 引数削除
28. `Atender/Features/SemesterOverview/SemesterOverviewComponents.swift:271` — `personalEvents(from:to:semesterId:)` → `(from:to:)`、`eventDates` を `days` から作る
29. `Atender/Core/Sync/EventKitTimeMapping.swift` / `EventKitReconciler.swift` (`uploads` のみ) — §6.10。**`EventKitService.swift` は本 doc では触らない** — D3 が削除して `actor EventKitStore` に置換する。`CalendarSyncCoordinator.swift` も**読み込み経路の型追随だけ**で、全面書き換えは D3 §6.5
30. `project.yml` — `CFBundleVersion: "11"` → **"12"** (★ `Atender/Info.plist` は手編集しない。xcodegen が毎回生成し直す)
31. テスト: §10 の新規 4 + 書き換え 2 + 拡張 2

### apps/web
32〜44. §7 の表のとおり (13 ファイル)。テストは §10。

### 変更不要と確認済 (grep で母数確定)
- `Atender/Features/Rooms/RoomLogic.swift` の `RecurrencePresetLogic` / `RoomSheets.swift:554` の `RecurrencePicker` — ルーム専用のまま生存
- `Atender/Features/Calendar/PersonalCalendar.swift` の `PeriodNav` — 両 caller が `.month` を渡すのみ、無変更
- `Core/Timetable/TimetableLogic.swift` の `CalendarLane` — 純 util として残す (本番 caller は 0 になる、§16 で報告)
- `Core/Data/InvalidationMatrix.swift:56-57` — `.personalEvent(date:)` の定義は無変更
- `apps/web/src/components/recurrence/RecurrencePicker.tsx` / `src/lib/recurrenceFormat.ts` — ルーム専用のまま無変更

---

## 12. UI/UX チェック観点の通過確認 (`ui-ux-design-perspectives.md` §7)

| 観点 | 本設計での扱い |
|---|---|
| 視覚階層 | §8.4 で L0-L3 を割当済 |
| タップ 44pt | 日セル (`max(44, rowHeight)`)、シートの行・削除ボタン (`.contentShape` で 44pt 確保)、曜日チップ 44pt |
| 色だけで情報を伝えない | 予定色は左バー + テキストの併記。繰り返しは色でなく `arrow.triangle.2.circlepath` 記号 + 文言 |
| 状態網羅 | §8.5 (loading / error+再試行 / empty / 学期なし / 権限なし) |
| Dynamic Type | built-in text style のみ使用。行は `lineLimit` + truncate |
| ナビ階層 | §8.6。新規タブなし、最頻タスク 1 タップ |
| 破壊操作 | 削除は `role: .destructive`。繰り返しは 3 択ダイアログを必ず挟む (誤って全回消せない) |
| 数値の逸脱 | タイルの角丸は `Radius.lg` (24)。DESIGN.md §3.1 の「card 標準 = `Radius.md` (18)」からの逸脱理由: 月グリッドは画面の主情報面 = 「大カード」区分に当たり、かつ build 10 まで実在した `.card` 実装がこの値だったため見た目の連続性がある |

---

## 13. 段階 (実装順。出荷は build 12 で 1 回)

| 段 | 内容 | 依存 | 単独で緑になるか |
|---|---|---|---|
| **S1** | `packages/shared` の `RecurrenceSpec` / `buildRRule` / `parseRRule` + テスト (R 系) | なし | ○ |
| **S2** | `lib/rruleExpand.ts` の JST 化 + ヘルパ移設、`recurrence.service.ts` の追随 + テスト (X 系) | なし | ○ (既存 room テスト緑のまま) |
| **S3** | schema + migration + `prisma generate` | なし | ○ (この時点でサービス層はコンパイルが通らないので S4 とセットで検証する) |
| **S4** | `personalRecurrence.service.ts` / `personalEvent.service.ts` / routes / shared zod + テスト (D/A 系) | S1,S2,S3 | ○ |
| **S5** | `dayDetail.service.ts` / `personalCalendarShare.service.ts` + テスト (DD/P 系) | S4 | ○ |
| **S6** | `eventkit-sync` の作り替え + テスト (K 系) | S4 | ○ |
| **S7** | iOS: DTO / endpoint / repository / 純ロジック + テスト (U1-U8, U13, U14) | S4-S6 | ○ |
| **S8** | iOS: 月グリッドのタイル化 + 死にコード削除 + `selectDate` 修正 (V1,V2,V5) | S7 | ○ |
| **S9** | iOS: `PersonalDaySheet` + エディタ + `RecurrenceSpecPicker` + 3 択 (U9-U12, V3,V4,V6) | S7,S8 | ○ |
| **S10** | iOS: `DayDetailSheet` 単一シート化 + EventKit **読み込み層**の型追随 (V7)。書き出し層 (`EventKitStore` / オーケストレータ全面書き換え) は **D3 の実装順**が持つ | S7,S9 | ○ |
| **S11** | Web 全部 (W 系) | S4-S6 | ○ |
| **S12** | `MIN_IOS_BUILD=12` + `CFBundleVersion=12` | 全部 | — |

**S3 は単独マージ不可** (schema を変えるとサービス層の型が壊れる)。S3+S4 を 1 コミットにする。

### 13.2 デプロイ順序 (★守ること)

1. 本番 DB のファイルバックアップ (`cp /app/data/prod.db /app/data/prod.db.bak-20260729`) と `SELECT COUNT(*)` の記録
2. `atender-api` をデプロイ (起動時に `prisma migrate deploy` が走る) → §3.4 の検証クエリ 4 本
3. **同時に** `atender-web` をデプロイ (web には版数ゲートが無く、API 形状が変わると壊れるため間を空けない)
4. iOS build 12 を archive → export → TestFlight upload

**2 の直後から build 11 の端末は全 API が 426 になる** (T5 の意図どおり)。4 の反映まで iOS は使えない。TestFlight 配布のみでユーザーが Touri 本人なので受容する。

---

## 14. 既存 doc の置換 (仕様マークダウンの編集規律)

### 14.1 `DESIGN.md` (PJ の視覚言語正典)

grep で拾った衝突箇所は **7 箇所**。追記でなく置換する。

| 行 | 旧 | 新 |
|---|---|---|
| `:20` | 「月カレンダー外殻は full-bleed のため角丸なし (§3.6.3)」 | 「月カレンダー外殻もカードとして `Radius.lg` (§3.6.3)」 |
| `:67` | 「大きな情報面、シート上端。月カレンダー外殻は対象外 (§3.6.3)」 | 「大きな情報面、シート上端、**月カレンダー外殻** (§3.6.3)」 |
| `:88` | 「月カレンダー (§3.6.3) 以外のグリッド全体は card として…」 | 「**月カレンダーを含む**グリッド全体は card として `sectionGap` で周囲から離す」 |
| `:94` | 「ただし月カレンダー (§3.6.3) は full-bleed でありカード面ではないため影を敷かない (2026-07-23 裁定)」 | **一文ごと削除**。月カレンダーは影を持つ面に戻るため例外規定が不要になる |
| `:155-166` | §3.6.3 全体 (full-bleed 規定) | 下記の置換文へ全面差し替え |
| `:220` | 「月カレンダーは full-bleed + hairline (§3.6.3)」 | 「月カレンダーも `Radius.lg` + shadow のカード。内側は hairline (§3.6.3)」 |
| `:269` | 不採用案の「月カレンダー full-bleed hairline」 | 「月カレンダーの**カード外殻 + 内側 hairline**」 |

§3.6.3 の置換文:

> #### 3.6.3 月カレンダー (personal / room 共通)
>
> **2026-07-29 Touri 裁定により、月カレンダーは「タイル (カード) の中」に戻す** (2026-07-23 の full-bleed 裁定は**撤回**)。要望の逐語は「タイルの中に入れて欲しい。今は横幅いっぱいになってると思うから。中の UI はそのままでいい」。personal (Home) と room (ルーム詳細) の両方に適用し、`CalendarMonth` は**単一スタイル**とする (`CalendarMonthChrome` enum は廃止)。
>
> | 属性 | 規則 |
> |---|---|
> | 外殻 | `Color.bgElevated` + `Radius.lg` (24) + `.atenderShadow(.card)` + `Space.s2` の内側 padding。祖先の `Space.pagePxMobile` (16pt) page margin の**内側**に収まる。負マージン・幅拡張・`offset` を使わない |
> | セル分離 | TimeTree 風 hairline (`Color.borderSubtle` = `.separator` の 0.5pt)。週行上辺 + 列間。濃い罫線で表組みにしない |
> | 日セル | 枠なし・角丸なし。当月 `bgElevated` / 当月外 `bgMuted`。日付左上。曜日色 (日=`#E5484D` / 土=`#0091FF` / 平日=`textPrimary`、当月外は 0.38 不透明度)。今日=accent 塗り丸、選択=accent アウトライン丸。高さ `max(44, rowHeight)` |
> | イベント | 時間割セル (§3.6.1) と同スタイル。不透明 tint 面 (`surfaceTintRatio`・base=`bgElevated`) + 2pt solid 左バー (`Radius.full`) + `textPrimary`。`.caption2` semibold、1 行 truncate、最大 2 行、超過は chip 1 個 + `+N` |
> | 高さ算出 | `CalendarMonthLayout.rowHeight(available: gridAvailable(available:))`。`gridAvailable = available - cardChromeHeight(16)` |
>
> **月カレンダーは §3.3「浮くべき面は必ず影を持つ」の対象**に戻る (2026-07-23 の除外規定は撤回)。

### 14.2 `.designs/20260723-calendar-eventkit-sync-and-redesign.md`

同 doc の現行記述のうち、本 doc の決定と矛盾するものを置換する。**旧記述を残さない。**

| 節 | 旧記述 | 置換後 |
|---|---|---|
| §G4 (`:26-30`) | 「(b) personal も room も全幅統一を採択 — DESIGN.md 全面置換」 | 「**2026-07-29 の Touri 要望で撤回**。月カレンダーはタイル (カード) に戻す。正典は `.designs/20260729-personal-calendar-rebuild.md` §6.3 と DESIGN.md §3.6.3」 |
| §目的 3 (`:38`) | 「月表示のみ・全幅・タイル外側の影なし」 | 「月表示のみ・**タイル (カード) 内**・影あり」 |
| §F4.2 (`:376-392`) | full-bleed の描画規則表 (「現状 (card)」列を含む) | 節ごと削除し「→ 20260729 doc §6.3 に移管 (タイル化に反転)」の 1 行に置換。※ この節の「`.padding(.horizontal, -Space.pagePxMobile)` で打ち消す」という記述は**実装 (`PersonalCalendar.swift:326-331` の幅拡張 + offset) と一致していなかった** ので、置換で誤記も消える |
| §F4.3 (`:406-412`) | 「日セルタップは選択状態のハイライトのみで、下部リストは出さない」 | 「**日セルタップで `PersonalDaySheet` を出す** (20260729 doc §6.4)。グリッド下のアジェンダ (`DayAgendaPanel`) は廃止のまま」 |
| §F4.3 の予定追加導線 | 「押下で `PersonalEventEditorSheet` (既存 `BulkAndPersonalEventSheets.swift:296` の作成フォーム再利用)」 | 「押下で `PersonalDaySheet(editor)` (20260729 doc §6.5 の新エディタ)。**旧フォームは削除済**」 |
| §F4.6 (`:429-447`) | DESIGN.md 置換文案 (full-bleed) | 節ごと削除し「→ 20260729 doc §14.1 が新しい置換文案 (タイル)」の 1 行に置換 |
| §C2/§C3 (`:518-519`) | 「`.atenderShadow` を持たず」「グリッド右端が画面端に一致」 | 「**`.atenderShadow(.card)` と `Radius.lg` を持ち、左右に 16pt の page margin がある**」 |
| §F4.5 (`:426`) | 「追加は月画面の `+` / FAB」 | 「追加は月ヘッダの `＋` / 日タップシート内の `＋` / room は FAB」 |
| §1.1 (`:58-101`) | `PersonalEvent` の additive スキーマ | 「**20260729 doc §3.1 で全面置換済 (破壊的)**」の 1 行に置換 |
| §2.1 (`:154-205`) | `EventKitSyncEvent` の日単位鍵 | 「**20260729 doc §5.6 で instant 基準に置換済**」の 1 行に置換 |
| §2.2 の `projectShare` (`:228-240`) | 「PersonalEvent を取得 → 1 予定 = 1 RoomEvent」 | 「**20260729 doc §5.5 で系列単位 + 繰り返しごと投影に置換済**」の 1 行に置換 |
| §不採用案 (`:569-570`) | 「personal だけ full-bleed・room は card 維持 — 却下」「`.card` variant も残置 — 却下寄り」 | 2 項目とも削除 (前提が反転したため。新しい不採用案は 20260729 doc §15) |

**編集記録の 1 行**: 「20260723 doc の full-bleed / 日タップ非表示 / PersonalEvent additive スキーマ / EK 日単位鍵 / 1 予定 = 1 RoomEvent 投影 の記述を消して、タイル化・日タップシート・破壊的モデル置換・instant 鍵・系列投影 (本 doc への参照) に置換した。」

### 14.3 ★ 本 doc 自身が D3 の裁定で置換された箇所 (2026-07-29)

後続レーンの D3 (`.designs/20260729-eventkit-dedicated-calendar-export.md`) §12 が本 doc §5.7 の契約を 3 点覆し、**Leader が `codex exec` のセカンドオピニオンと突合した上で D3 の 3 点すべてを採用**した (CLAUDE.md「エスカレーション > セカンドオピニオン」、見解一致のため Touri へのエスカレーションは不要と判断)。本 doc の該当記述は**追記でなく置換済**。

| 差分 | 本 doc で消した記述 | 置換後 |
|---|---|---|
| **A** | §0.1 / §5.7-3 の「Atender → EK: 系列を `EKRecurrenceRule` として書き、`single`/`future`/`all` を `EKSpan` (`.thisEvent` / `.futureEvents`) で反映する」 | §5.7 は「D3 が読む**データ契約**」だけを持ち、EK 側の書き方を規定しない。D3 は展開済み occurrence を 1 件 1 非繰り返し EKEvent として書く (D3 §5.3) |
| **B** | §5.2 / §5.6 の `EventKitSyncResult.manualNeedingPush`、§6.5 の `pushManualEvent(saved)` 呼び出し、挙動仕様 **K9 / K10** | `EventKitSyncResult` は `{ mirrors }` のみ。エディタは EventKit を直接呼ばず `cache.invalidate` を D3 のトリガが拾う。K9/K10 は**欠番**として注記 (番号は振り直さない) |
| **C** | §6.10 の「`EventKitService.createEvent/updateEvent` の引数型を `PersonalEventSeriesDto` に変更」、§11-29 の `EventKitService.swift` を触る記述 | §6.10 は**読み込み側だけ**の節に縮小。`EventKitService` の削除と `actor EventKitStore` への置換は D3 §6.4 が持つ |

**編集記録の 1 行**: 「本 doc から EventKit **書き出し**の実装詳細 (`EKRecurrenceRule`/`EKSpan` 方式・`manualNeedingPush`・`pushManualEvent`・`EventKitService` の API 形・K9/K10) を消して、**D3 への参照ポインタ + 読み込み側の契約のみ**に置換した。二重管理を作らないため、書き出しの正典は D3 に一本化。」

---

## 15. 不採用案

- **`date` + `startMinute/endMinute` を維持し、複数日は「連結された複数行」で表現する** — 却下。現行がまさにそれで、EventKit 往復で N 個の単日予定に化ける (B4)、繰り返しの duration が定義できない、ルーム投影が 1 予定 = N 行になる、という 3 つの破綻が既に出ている。要望「複数日またぎ必須」を満たすには `start`/`end` の instant にするしかない。
- **`semesterId` を残したまま「フィルタしない」運用にする** — 却下。列が残ると「いつか使うのでは」で参照が復活し、B3 の不整合が再発する。T3 が「学期は時間割/出欠側だけの概念」と決めた以上、型から消すのが正しい。ただし**破壊的**なので §2.1 で赤字扱いにした。
- **`recurrence.service.ts` を generics/delegate で共通化し RoomEvent と PersonalEvent の両方から使う** — 却下。`applyEditScope` は `prisma.roomEvent` / `roomEventOverride` の**モデル名とフィールド名に直接依存**しており、共通化すると `any` 型のデリゲート渡しか大きなリファクタになる。出荷済で 9 テストが乗っている room 経路を巻き込むリスクに見合わない。**代わりに、共通化の価値がある「純粋な文字列/日付操作」(`appendOrReplaceUntil` / `stripUntil` / `datesToCsv` / RRULE 展開) だけを `lib/rruleExpand.ts` に抽出して両者が共有する** (§4.3)。分岐する余地があるのは Prisma 呼び出しの形だけになる。
- **クライアント (iOS/Web) が RRULE 文字列を組み立てる (現行 `RecurrencePresetLogic` / `recurrenceFormat.ts` の拡張)** — 却下。現状すでに 2 実装がプリセット 6 個で並んでおり、ここに INTERVAL / 複数曜日 / COUNT / UNTIL / カスタムを足すと組合せが数十倍になり、Swift と TS の食い違いをテストで担保し続けるコストが跳ね上がる。**構造化 spec をサーバに送り、変換の実装を `packages/shared` の 1 個に閉じる** (§4.1)。クライアントに残るのは「spec を組む UI」と「spec を日本語にする表示関数」だけで、後者は表示文字列を §6.6 の表で固定して両方テストする。
- **クライアントが `start`/`end` から JST の日を自分で割る** — 却下。`gotcha/client-today-must-use-server-timezone.md` の再演になる (日中しか再現しない 9 時間ズレ)。サーバが `days: [{date, startMinute, endMinute}]` を計算して渡す (§5.1)。日付分割の実装はリポジトリ内に `occurrenceDays` 1 個だけになる。
- **`expandBetween` を UTC のまま使い、JST ズレは「終日予定では繰り返しを使わせない」で回避する** — 却下。終日 + 毎週は最も普通の使い方 (「毎週月曜はバイト」) であり、機能を削って回避する話にならない。かつ JST 00:00〜08:59 に始まる時刻あり予定も同じ穴に落ちる。**自分側 (展開器) を仕様に頑健にする**。
- **`expandRoomEvents` は UTC のままにして、投影だけ JST 補正した RRULE を書く** — 却下。「相手側の設定で回避する案」に当たる。同じ RRULE が個人カレンダーとルームカレンダーで別の日に展開される状態が残り、しかもその不一致は補正済 RRULE が room 側に保存されるので `.ics` エクスポートや Google 連携にまで伝播する。展開器を 1 つ直す方が安い (API テストの RRULE アサートは 0 件)。
- **日タップシートに既存 `DayDetailSheet` を流用する** — 却下。3 つ理由がある: (a) 休講設定 UI (時間割全体を休講にする) を抱えており、個人カレンダーの文脈で出すには重すぎる (b) `semesterId` を要求するが個人カレンダーは学期非依存 (T3) (c) `GET /api/day/:date` を別途叩くが、月グリッドは既に同じ範囲の occurrence をメモリに持っている (往復が増える)。**授業の一覧だけは読み取りで見せる** ことで「グリッドに出ているのにシートに無い」を防ぐ。
- **日タップシートに出欠のステータスボタンを載せる (`TodayAttendanceSheet` の機能ごと移植)** — 却下。Touri が挙げた参照は**見え方** (下から出るシート、1 行 1 カード、行ごとに操作) であって出欠機能そのものではない。載せると `DayDetailSheet` と 3 つ目の出欠入力口ができ、CLAUDE.md の IA 規約 (出欠は Home の CTA と 学期・科目) に反する。
- **編集フォームを日タップシートの上に第 2 のシートとして重ねる** — 却下。`gotcha/swiftui-multiple-sibling-sheets-only-one-fires.md` の直撃コース (`DayDetailSheet.swift:34-52` が現に踏んでいる、B5)。**同じシートの中でモードを切り替える** (§6.4) と、ツリー内の `.sheet` が常に高々 1 つになり構造的に踏めない。
- **`activeSheet` の enum に `.day` と `.editor` の 2 case を持ち、提示中に case を切り替える** — 却下。`switch` は `_ConditionalContent` を作るので分岐が変わると View identity が変わり、`BottomSheet` の内部 `sheetPresented` state ごと作り直される (dismiss → present のちらつき / 状態消失)。モードはシートの**中**に持つ。
- **月グリッドのタイル化を personal だけに適用し room は full-bleed のまま** — 却下。`CalendarMonth` は共有部品で、見た目の規則は全 caller に流すのが本 PJ の方針 (DESIGN.md)。かつ build 11 で Touri が「ルームも自分と統一」を裁定済み。片方だけ変えるとその裁定を無言で覆すことになる。
- **`CalendarMonthChrome` enum を残し `.card` / `.fullBleed` を両方持つ** — 却下。両 caller が同じ値になるので variant が不要になる。未使用 variant を残すと「どちらが正典か」が doc とコードの 2 箇所に分かれる。
- **`CalendarMonthLayout.rowHeight` の式に card chrome を織り込む** — 却下。既存 `CalendarLayoutTests` #CA1/#CA3 が `rowHeight` の式を直接検証しており、式を変えると壊れる。**壊さずに済むなら壊さない** — chrome 分は新関数 `gridAvailable` で外から引く (§6.3)。
- **`CalendarLane` とそのテスト 5 件も削除する** — 却下。`CalendarDay` を消すと本番 caller は 0 になるが、`CalendarLane` は「重なるイベントにレーンを割る」汎用の純関数で、日ビューを将来戻すときに使える。削除すると緑のテストが 5 件減り、台帳 (268 GREEN) の突合が複雑になる。**事実だけ §16 で報告する。**
- **ルームの繰り返しピッカーも spec 方式に統一する** — 却下 (次レーン)。`RoomEvent` の入力 zod・route・iOS/Web の 3 実装を同時に触ることになり、本 doc のスコープ (個人カレンダー) を超える。結果として iOS には繰り返しピッカーが 2 種類 (個人=spec / ルーム=旧プリセット) 並ぶが、**個人側が先に spec 方式で安定してからルームを寄せる**方が安全。§16 で follow-up として報告する。
- **build 11 との後方互換を保つため DTO を additive にする** — 却下 (T5)。`date` → `start/end` は additive にできず、無理に両方載せると「どちらが正か」が全経路に伝播する。`MIN_IOS_BUILD` で切る。
- **migration で旧テーブルを `PersonalEvent_legacy` として残す** — 却下寄り。Prisma が管理しないテーブルが残ると次回の `migrate dev` が DROP を提案してきて drift の元になる。**代わりに、より確実な「デプロイ前の DB ファイルコピー」を手順に組み込む** (§2.1)。SQLite の DDL はトランザクショナルなので INSERT 失敗はロールバックされ、守るべきは「変換式が間違ったまま成功する」ケースだけ — それはバックアップでしか守れない。

---

## 16. 報告事項 (Leader / Touri 判断・本 doc では決めない)

1. **`RoomDetailView.swift:169-172` にも B2 と同型のバグがある** (当月外タップで `anchor` を書き換えるが `reload` しない)。ルームカレンダーは本 doc のスコープ外なので直していない。1 行で直るので、次にルームを触るときに合わせるか、今回ついでに直すかは Leader 判断。
2. **`CalendarLane` (`TimetableLogic.swift:243`) は本 doc の削除後、本番 caller が 0 になり `CalendarLaneTests` 5 件だけが参照する。** 残す判断をしたが (§15)、「作った UI を捨てるか」の系統なので記録する。
3. **ルームの繰り返しピッカーは 6 プリセット・終了条件なしのまま**で、UI からは終わりのない繰り返ししか作れない。個人側が spec 方式で安定したら寄せる follow-up。
4. **`expandRoomEvents` の UTC 展開バグ (B6) は本 doc で修正する**が、これは「ルームの既存の繰り返し予定の展開日が変わる」ことを意味する。本番に終日 + 繰り返しのルーム予定が存在する場合、**表示日が 1 日ずれていたものが正しい日に移動する**。データは変わらず表示だけが変わる。Touri に見え方の変化として伝えること。
5. **`GET /api/personal-events` の `from`/`to` 必須化と `semesterId` 廃止は wire 破壊**である。Web も同時デプロイする前提 (§13.2) で問題ないが、外部から API を叩いているものが他に無いことを Leader が確認すること (grep 上は iOS/Web の 4 呼び出しのみ)。
