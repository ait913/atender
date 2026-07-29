# カレンダー同期刷新 (EventKit) + ルーム共有マスキング + カレンダー UI 刷新 (TimeTree 参考・月のみ)

> 対象 PJ: atender (`apps/api` backend / `apps/ios` SwiftUI)。UI 正典: `DESIGN.md`。機能正典: Web。
> Researcher findings: `Muraki/knowledge/library/eventkit-ios17-access-and-sync-identifiers.md`。
> **本 doc は 4 つの独立度の高いサブ機能を 1 本にまとめている**が、PersonalCalendar.swift / schema.prisma を共有するため 1 doc + フェーズ制で衝突を避ける。UI 刷新 (F4) は F1–F3 と独立に先行出荷可。
>
> **★ 2026-07-29 に大きく 2 本の doc へ移管された。矛盾する記述はすべて置換済で、以下が現在の正典:**
> - **個人カレンダーのモデル・API・UI (月グリッドのタイル化 / 繰り返し / 複数日 / 日タップシート)** → `.designs/20260729-personal-calendar-rebuild.md`
> - **EventKit の書き出し (専用「Atender」カレンダーへの一方向エクスポート)** → `.designs/20260729-eventkit-dedicated-calendar-export.md`
>
> 本 doc に残っているのは **ルーム共有マスキング (G2 / §1.3 / §2.2 の endpoint / M 系)** と **gcal iOS 撤去 (G3 / F5)** の 2 つ、および両 doc へのポインタである。

---

## ★ 承認ゲート裁定 (2026-07-23 Touri 確定)

承認ゲートは通過。以下 4 点は Touri 裁定で確定済。本 doc はこの裁定に整合させた確定版。

### G1. source of truth — **2026-07-29 に方向を分離**
- 案A (EK 主 + Atender 発だけ push) は**さらに絞られた**。書き出し先は専用「Atender」カレンダーで、そこは **Atender が唯一の正典・一方向 (書き出し専用)**。読み戻さない。読み込みは Atender カレンダー**以外**からのみで、そちらは EK が正典。
- 正典は `.designs/20260729-eventkit-dedicated-calendar-export.md` §3。
- 案B (完全対称双方向 + version コンフリクト解決) は不採用 (§不採用案)。

### G2. マスキングの UX 粒度 — **共有単位モード + 既存ルールエンジン 採択**
- **ルーム共有単位の `visibilityMode` 3 段** — `そのまま / マスキング / 予定のみ` (= 既存 `EventVisibility` enum `NORMAL/TITLE_MAPPED/BUSY_ONLY` を再利用)。`マスキング` は**既存の per-user `IcsTitleRule` エンジンを無改変再利用** ("デート"→"予定" は CONTAINS ルール1本)。新モデル最小、ICS/Google と挙動一貫。
- **個別イベント手動マスク・カテゴリ (色) マッピングは post-MVP** (本 doc の対象外)。

### G3. gcal iOS 撤去のユーザー影響 — **影響ゼロ・確認済 (異議なし)**
コード実測: **iOS には Google カレンダー同期の UI が一つも実在しない**。`APIEndpoint.swift` に `googleSyncs / createGoogleSync / googleCalendars / googleConnection / completeGoogleLink / googleSyncAll` 等の宣言は在るが、**どの View からも呼ばれていない (call site 0)**。iOS の Google は **ログイン認証 (`GoogleSignIn` / better-auth OAuth) のみ**で、これは温存。
- iOS ユーザーで「iOS から gcal 連携を設定した人」は**存在し得ない** (UI が無かった) → 撤去の移行体験は不要。backend / Web の Google 機構は温存 (要件どおり)。
- 撤去作業は「死んだ endpoint 宣言 + 孤児 DTO の掃除」だけ (F5、非ブロッキング低優先)。

### G4. UI 刷新のスコープ — **2026-07-29 の Touri 要望で撤回**
全幅 (full-bleed) 統一の裁定は撤回された。**月カレンダーはタイル (カード) に戻す** — `Radius.lg` + `.atenderShadow(.card)` + page margin の内側。`CalendarMonth` は単一スタイルとし `CalendarMonthChrome` enum は廃止する。personal / room の両 caller に等しく適用する。
- 正典は `.designs/20260729-personal-calendar-rebuild.md` §6.3 と `DESIGN.md` §3.6.3。

---

## 目的

1. iOS の予定同期を **Google Calendar 依存から EventKit (iPhone/iCloud ローカルカレンダー)** へ置換する。iPhone で足した予定が Atender に入り (読み込み)、Atender の予定が iPhone の専用「Atender」カレンダーに出る (書き出し) 「シンプルカレンダー」体験。backend/Web の Google 機構は無改変で温存。
2. 自分のカレンダーを**ルームに共有**できる。共有時にタイトルを**そのまま / マスキング (デート→予定) / 予定のみ**で出し分けられる (既存 `IcsTitleRule` エンジン再利用)。
3. Home の**カレンダー UI を刷新** — 月表示のみ・**タイル (カード) 内**・影あり・TimeTree 参考の見やすい月グリッド。

**当初「破壊的 migration はしない (全 additive・全 nullable)」としていたが、2026-07-29 に撤回された。** `PersonalEvent` は `.designs/20260729-personal-calendar-rebuild.md` §3.4 で破壊的に作り替えられている (`MIN_IOS_BUILD` を 12 に上げて build 11 を切る)。

---

## スコープ境界 (どのファイルが誰の専属か)

| フェーズ | 主対象ファイル | 触ってよい範囲 |
|---|---|---|
| **F1 schema** | `apps/api/prisma/schema.prisma`, migration | `RoomEventSource` 追加値 / `PersonalCalendarShare` 新設 / `EventSource` enum 新設。※ `PersonalEvent` は 20260729-personal-calendar-rebuild doc §3.1 が全面置換済 |
| **F2 backend sync API** | `apps/api/src/routes/personalEvents.ts`, `services/personalEvent.service.ts`, `packages/shared/src/schemas/personalEvent.ts` | → 20260729 の 2 doc に移管済 |
| **F3 backend room share** | `apps/api/src/routes/rooms.ts`, 新 `services/personalCalendarShare.service.ts` | personal-calendar-share endpoint + 投影。`services/icsTitleRule.service.ts` は**無改変再利用**のみ。投影のロジックは 20260729-personal-calendar-rebuild doc §5.5 が正典 |
| **F4 iOS EventKit + UI** | → 20260729 の 2 doc に移管済 (対象ファイルはそれぞれの「触るファイル確定リスト」を見る) | ※ 旧「共有部品 `CalendarWeek/CalendarDay/CalendarSegmented` は削除禁止」の制約は**失効**。build 11 の裁定でこれらは本番 caller を失い、20260729-personal-calendar-rebuild doc §6.8 で削除された。`CalendarLane` は純 util として存続 |
| **F5 gcal 掃除 (低優先)** | `apps/ios/Atender/Core/Networking/APIEndpoint.swift`, `Core/Models/DTOs.swift` | 死んだ gcal-sync 宣言と孤児 DTO のみ。**1 シンボルずつ grep で参照 0 を確認してから削除** |

---

# データモデル (F1)

## 1.1 `PersonalEvent`

→ **`.designs/20260729-personal-calendar-rebuild.md` §3.1 で全面置換済 (破壊的)**。`date` + `startMinute`/`endMinute` は廃止され `start`/`end` の instant + `recurrenceRule` + `PersonalEventOverride` になった。dedup キーも `(userId, ekExternalId, ekOccurrenceStart)` に変わっている。

## 1.2 `RoomEventSource` — enum 値追加 (additive)

```prisma
enum RoomEventSource {
  MANUAL
  ICS_FILE
  ICS_URL
  GOOGLE_OAUTH
  PERSONAL          // ★ 追加: 個人カレンダー共有由来
}
```

`RoomEvent` (schema.prisma:464) 自体は無改変。既存の汎用外部ソース設計に乗る:
- `source = PERSONAL`
- `externalUid = "pe:<personalEventId>"` (既存 `@@unique([roomId, externalUid])` で upsert キーに使える)
- `rawTitle` = 元タイトル、`title` = マスク後、`visibilityMode` = 共有設定
- `authorId` = 共有した本人

## 1.3 `PersonalCalendarShare` — 新モデル (共有単位の親)

`GoogleCalendarSync` (schema.prisma:525) の類似。共有単位は **(ルーム × ユーザー)**。

```prisma
model PersonalCalendarShare {
  id             String          @id @default(cuid())
  roomId         String
  room           Room            @relation(fields: [roomId], references: [id], onDelete: Cascade)
  userId         String
  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  visibilityMode EventVisibility @default(TITLE_MAPPED)   // NORMAL=そのまま / TITLE_MAPPED=マスキング / BUSY_ONLY=予定のみ
  enabled        Boolean         @default(true)
  lastProjectedAt DateTime?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@unique([roomId, userId])
  @@index([userId])
  @@index([roomId])
}
```

`Room` / `User` に `personalCalendarShares PersonalCalendarShare[]` の back-relation を追加 (additive)。

## 1.4 migration

`prisma migrate` で 1 本。**本節の対象 (`RoomEventSource` の値追加 / `PersonalCalendarShare` 新設 / `EventSource` enum) に限れば**全て additive/nullable/default 付きで既存データ移行不要、破壊的変更に該当しない (Cascade は既存パターン踏襲)。SQLite なので enum は文字列列 + CHECK。
※ `PersonalEvent` の migration は別物で、**破壊的** (`.designs/20260729-personal-calendar-rebuild.md` §2.1 / §3.4)。

---

# API / 関数シグネチャ

## 2.1 backend: EventKit 同期 endpoint (F2)

→ **`.designs/20260729-personal-calendar-rebuild.md` §5.6 で instant 基準に置換済**。`EventKitSyncEvent` の鍵は `(ekExternalId, ekOccurrenceStart)` になり、日単位分解 (`date` + `startMinute`/`endMinute`) は廃止された。
→ さらに **`.designs/20260729-eventkit-dedicated-calendar-export.md` §6.3 で `EventKitSyncResult.manualNeedingPush` を削除済**。この endpoint は**読み込み (EK → Atender ミラー) 専用**であり、書き出しは差分エンジンが別経路で担う。

## 2.2 backend: ルーム共有 endpoint (F3)

`rooms.ts` に追加 (既存 google-calendar-syncs の隣、同じ `sessionMiddleware, setupGuard, IdParam` 構成):
```
GET    /api/rooms/:id/personal-calendar-share            → { share: PersonalCalendarShareDto | null }
POST   /api/rooms/:id/personal-calendar-share            body { visibilityMode } → 作成/有効化 + 投影
PATCH  /api/rooms/:id/personal-calendar-share            body { visibilityMode?, enabled? } → 更新 + 再投影
DELETE /api/rooms/:id/personal-calendar-share            → 無効化 + 投影 RoomEvent 全削除
```
ガード: ルームメンバーであること (既存 membership チェック踏襲)。

新サービス `personalCalendarShare.service.ts`:
```ts
export async function getShare(a: { roomId; userId }): Promise<PersonalCalendarShareDto | null>
export async function upsertShare(a: { roomId; userId; visibilityMode: VisibilityMode }): Promise<PersonalCalendarShareDto>
export async function patchShare(a: { roomId; userId; patch: { visibilityMode?; enabled? } }): Promise<PersonalCalendarShareDto>
export async function disableShare(a: { roomId; userId }): Promise<void>   // enabled=false + 投影削除

// 投影 (upsert/patch/eventkit-sync フックから呼ぶ)
export async function projectShare(shareId: string): Promise<{ upserted: number; deleted: number }>
```

`projectShare` 詳細 → **`.designs/20260729-personal-calendar-rebuild.md` §5.5 で系列単位 + 繰り返しごと投影に置換済**。「1 予定 = 1 RoomEvent (occurrence 単位)」ではなく「1 系列 = 1 RoomEvent (`recurrenceRule` ごと投影)」になり、`PersonalEventOverride` → `RoomEventOverride` の投影と終日 end の −1ms 変換が加わった。マスク (`visibilityMode` 3 段 + `applyTitleRules` の default 除外) の規則だけは無改変で維持される。

DTO (shared):
```ts
export const PersonalCalendarShareDto = z.object({
  id: z.string(), roomId: z.string(), userId: z.string(),
  visibilityMode: z.enum(["NORMAL","TITLE_MAPPED","BUSY_ONLY"]),
  enabled: z.boolean(),
  createdAt: z.string(), updatedAt: z.string(),
});
```

## 2.3 backend: mapping engine 再利用点 (無改変)

- `services/icsTitleRule.service.ts` の `applyTitleRules(rawTitle, rules)` / `listRules(userId)` を**そのまま**呼ぶ。engine 改変なし。
- EventKit イベント → ルーム共有への「マッピング」は、EK→`PersonalEvent`→(投影)→`RoomEvent` の 2 段で、投影段だけが `applyTitleRules` を通す。EK 生イベントに直接ルールを当てる `mapEventKitEvent` ラッパは backend には不要 (PersonalEvent を経由するため)。★ Researcher findings の「`mapEventKitEvent` ラッパ新設」は **iOS 側の EK→PersonalEvent 変換** (§F4.4) が担い、マスクは backend の投影段が担う、と役割分担する。

## 2.4 iOS: EventKit 同期層 (F4)

### 権限・I/O ラッパ (副作用境界・非ユニットテスト)

→ **`.designs/20260729-eventkit-dedicated-calendar-export.md` §6.4 に移管。** `EventKitService` は **`actor EventKitStore` に置換**され (MainActor で数百件を書くと UI が固まるため)、書き込み先は専用「Atender」カレンダー固定 (ユーザー設定を廃止)。個別の `createEvent` / `updateEvent` / `deleteEvent` は差分適用 API `apply(_ plan: ExportPlan, calendarId:)` 1 本に置換。カレンダーの解決は `id → title 完全一致 → 作成` の 3 段 (`AtenderCalendarResolver`)。

- `NSCalendarsFullAccessUsageDescription` を `project.yml` `info.properties` に追加 (Info.plist は xcodegen 生成なので**手編集禁止**、project.yml が正典 — CLAUDE.md gotcha)。文言は 20260729-eventkit doc §7.8 が正典。

### 純ロジック (★ユニットテスト対象・EKEventStore 非依存)

→ **`ReconcilePlan` と `EventKitReconciler.pushTargets` は廃止** (書き戻し経路が無くなったため)。書き出しの差分は `CalendarExportPlanner` が担う — **20260729-eventkit doc §5.4**。読み込み側の `EventKitReconciler.uploads(from:)` は存続する。
`EKEventSnapshot` の形は 20260729-personal-calendar-rebuild doc §6.10 が正典 (日単位分解をやめ occurrence をそのまま持つ)。

### 時刻変換 (★ユニットテスト対象・境界の両側で測る)

→ `EventKitTimeMapping.toPersonalDays` は **20260729-personal-calendar-rebuild doc §6.10 で廃止済** (`jstDayStart(_:)` に置換)。
- 既存 `SchoolClock` (Asia/Tokyo 固定 calendar) を時計源に**再利用**する原則は不変 (client-today バグの教訓、`gotcha/client-today-must-use-server-timezone.md`)。UTC 暦で日付を割らない。

### オーケストレータ

→ **20260729-eventkit doc §6.5 に移管。** `linkedCalendarIds` は**読み込み専用のゲート**になり、書き出しを止めない (旧実装は読み込み設定が空だと書き出しごと no-op だった)。`writeTargetCalendarId` は**廃止**。発火点は 7 トリガ (起動 / 前面化 / `EKEventStoreChanged` / 権限付与 / カレンダー画面 / データ変更フック / 手動) に増える。

## 2.5 iOS: API endpoint 追加 (`APIEndpoint.swift`)
```swift
static func eventKitSync(_ body: EventKitSyncInput) -> APIEndpoint {
    .init(path: "/api/personal-events/eventkit-sync", method: .post, body: body) }
static func personalCalendarShare(roomId: String) -> APIEndpoint {
    .init(path: "/api/rooms/\(roomId)/personal-calendar-share", method: .get) }
static func setPersonalCalendarShare(roomId: String, _ body: SharePutInput) -> APIEndpoint {
    .init(path: "/api/rooms/\(roomId)/personal-calendar-share", method: .post, body: body) }
static func patchPersonalCalendarShare(roomId: String, _ body: SharePatchInput) -> APIEndpoint {
    .init(path: "/api/rooms/\(roomId)/personal-calendar-share", method: .patch, body: body) }
static func deletePersonalCalendarShare(roomId: String) -> APIEndpoint {
    .init(path: "/api/rooms/\(roomId)/personal-calendar-share", method: .delete) }
static func icsTitleRulesList() -> APIEndpoint { .init(path: "/api/me/ics-title-rules", method: .get) }  // ★ 死んでた宣言を有効化 (マスク編集 UI 用)
```
`PersonalEventCreateInput`/`UpdateInput` の形は **20260729-personal-calendar-rebuild doc §6.1 で全面置換済**。書き出しに要る endpoint (`occurrenceRange` / legacy 掃除) は **20260729-eventkit doc §6.6** が正典。

---

# UI / UX (F4)

汎用層チェック観点 (`ui-ux-design-perspectives.md` §7) を通し、正典 `DESIGN.md` に従う。**2026-07-29 の Touri 要望で「全幅・影なし」は撤回され、月カレンダーはタイル (カード) が正典に戻った** (DESIGN.md §3.6.3)。以降の月グリッド関連の記述は 20260729-personal-calendar-rebuild doc §6.3 に移管済み。

## F4.1 personal / room カレンダー = 月のみ (週/日モード撤去)

★ build 11 で **personal・room とも月固定に統一** (room も週日を撤去、§room 節)。

- **`PersonalCalendarViewModel` から `viewMode` を除去**し常に月。`currentRange` は月グリッド範囲固定。**`RoomCalendar` からも `viewMode` state を除去**し常に月 (§room 節)。
- **両 View から `CalendarSegmented` (日/週/月ピッカー) と `case .week/.day` 分岐を削除**。`PeriodNav` は月送りのみ (chevron + 「2026年7月」)。
- ★ **孤児化 → 削除済**: 両 caller が週日を捨てた結果 `CalendarWeek`/`CalendarDay`/`CalendarSegmented` は本番 caller ゼロになり、**2026-07-29 に削除された** (`.designs/20260729-personal-calendar-rebuild.md` §6.8。grep 実測 0 件)。`CalendarLane` は `TimetableLogic` 定義側 + `CalendarLaneTests` に参照が残り**存続**。
- `CalendarMonthLayout` は **`agendaHeight` 控除を撤廃** (アジェンダ廃止・§F4.3) → 月グリッドが縦フル。この式変更は build 11 で着地済で、`CalendarLayoutTests` #CA1/#CA3 は**現在の式で緑**である (§C7)。

## F4.2 月グリッドの視覚

→ **`.designs/20260729-personal-calendar-rebuild.md` §6.3 に移管 (タイル化に反転)。** 月カレンダーは `Radius.lg` + `.atenderShadow(.card)` + `Space.s2` padding のカードで、page margin の**内側**に収まる。負マージン・幅拡張・`offset` は使わない。`CalendarMonthChrome` enum は廃止し単一スタイル。描画規則の正典は `DESIGN.md` §3.6.3。

### room カレンダー = 自分カレンダーと完全統一 (★ build 11 Touri 実機裁定)

**build 11 で、ルームカレンダーは「日/週/月トグル・週表示・日表示・AvailabilityBar (空き時間バー) を全撤去」し、自分カレンダーと完全に同じ月グリッドに統一された。** 表示するのは**マスキング適用済のルーム予定のみ**。「空き時間」機能は Touri 裁定で**一旦削除** (post-MVP で別導線に戻す余地)。※ 外殻は 2026-07-29 に全幅からタイル (カード) へ反転済 (§F4.2)。

`RoomCalendar` の確定形:
- **月グリッド固定**: `CalendarSegmented` (日/週/月トグル)・`case .week`/`.day` 分岐・`CalendarWeek`/`CalendarDay` 呼び出し・`viewMode` state を **RoomCalendar から撤去**。常に月。PersonalCalendar と同じ月送り chevron のみ。
- **AvailabilityBar 撤去**: 空き時間バー (`AvailabilityBar`) と `RoomDayEventList` (日別予定リスト) を撤去。自分カレンダーと同様、月グリッドが縦スペースをフル使用 (アジェンダ無し、§F4.3)。
- **表示内容**: `RoomCalendarLogic.buildCalendarEvents` のルーム予定 (マスキング適用済 `source=PERSONAL` 含む)。時間割/出席状態のオーバーレイは無し (ルームは予定共有のみ)。
- **レイアウト**: 月グリッドは祖先 `RoomDetailView.body` の `.padding(Space.pagePxMobile)` の**内側**にそのまま収まる (負マージンを使わない、§F4.2)。
- **FAB**: 「予定を追加」FAB は月グリッドと `.overlay(alignment:.bottomTrailing)` で共存 (月固定になったので、旧「`viewMode != .month` のとき表示」条件は撤廃し**常時表示**)。ICS 取込 FAB も同様に月画面で表示。
- **★ 孤児化した共有 struct → 削除済**: PersonalCalendar (§F4.1) と RoomCalendar の両方が週日を撤去した結果、`CalendarWeek` / `CalendarDay` / `CalendarSegmented` / `DayAgendaPanel` は本番 caller を全て失った。**build 11 の「日/週表示とアジェンダを廃止」裁定の実行として 2026-07-29 に削除済** (`.designs/20260729-personal-calendar-rebuild.md` §6.8)。`CalendarLane` は純 util + `CalendarLaneTests` 5 件のため存続。

## F4.3 選択日アジェンダ — ★ build 11 で廃止

**build 11 Touri 実機裁定: グリッド下の `DayAgendaPanel` (「N/N の予定」リスト) は撤去。** 日タップ時のアジェンダ表示は**無し**。月グリッドが空いた縦スペースをフル使用して拡大する (`CalendarMonthLayout.rowHeight` の `available` から `agendaHeight` を引く控除を撤廃 → 行高がその分増える、§下記)。personal / room とも同一 (アジェンダ無し)。

- **`DayAgendaPanel` struct と呼び出しを撤去**。グリッド下のアジェンダは廃止のまま。**日セルタップでは `PersonalDaySheet` (下から出るシート) を出す** — 正典は `.designs/20260729-personal-calendar-rebuild.md` §6.4。
- **`CalendarMonthLayout` 調整 (build 11 で着地済)**: `agendaHeight` の控除は撤廃され、現在の式は `rowHeight(available:) = max(minRowHeight, (available - weekdayHeaderHeight) / rowCount)`。タイル化 (2026-07-29) で card chrome ぶんを外から引く `gridAvailable(available:) = max(0, available - cardChromeHeight(16))` が加わったが、**`rowHeight` の式自体は変えていない** (`CalendarLayoutTests` #CA1/#CA3 を壊さないため)。
- **★ 予定追加導線 (アジェンダ撤去後の代替)**: アジェンダに載せていた `+` ボタンは行き場を失う。代替として **`PersonalCalendar` / `RoomCalendar` の月画面に追加導線を残す** — personal は月ヘッダ (chevron 行) の trailing に `＋`、room は既存 FAB (「予定を追加」、月固定化で常時表示、§room 節)。押下で **`PersonalDaySheet(editor)`** (`.designs/20260729-personal-calendar-rebuild.md` §6.5 の新エディタ。**旧 `PersonalEventEditModal` / `PersonalEventEditModalContent` は削除済**)。日付は選択中の日をプリセット。保存後、Atender の予定は次の同期で専用「Atender」カレンダーに書き出される (`.designs/20260729-eventkit-dedicated-calendar-export.md` §5.3)。

## F4.4 視覚階層の割当 (汎用層 §7-1)

| 階層 | 要素 | 表現 |
|---|---|---|
| L0 | 今日 / 選択日のセル強調 | accent 塗り丸 (今日) / アウトライン丸 (選択) |
| L1 | 月グリッド全体 | タイル (`Radius.lg` + shadow) の中に面主役・hairline のみ |
| L2 | イベント chip | 時間割セル §3.6.1 同スタイル (不透明 tint 面 base=bgElevated 白 + 2pt solid 左バー + textPrimary) |
| L3 (meta) | 曜日ヘッダ・月ラベル・状態ドット | `.caption`/`.footnote` secondary |

## F4.5 状態網羅 (汎用層 §7-4) — Reviewer はここからテスト
- loading: 既存 `Skeleton` 踏襲。
- error: 「カレンダーを読み込めませんでした」+ 再試行。
- empty (予定 0): アジェンダは廃止 (build 11) のため下部リスト無し。月グリッドは予定 chip が無い素の月表示 (時間割/backend 予定があればそれのみ)。追加は**月ヘッダの `＋` / 日タップシート内の `＋` / room は FAB** (§F4.3)。
- **EventKit 権限**: 状態ごとの表示・メッセージ・回復導線は **`.designs/20260729-eventkit-dedicated-calendar-export.md` §7.4 が正典** (設定シートの同期状態欄 + カレンダー画面のバナー)。`writeOnly` は専用カレンダー方式が成立しないため**エラーとして扱い** full access を要求する。どの状態でもアプリは backend 予定のみで**動作継続**しクラッシュしない。

## F4.6 DESIGN.md の置換

→ **`.designs/20260729-personal-calendar-rebuild.md` §14.1 が新しい置換文案 (タイル) であり、2026-07-29 に `DESIGN.md` へ適用済み。** 本節にあった full-bleed の置換文案は失効した。

## F4.7 カレンダー設定 UI (新規)

`SettingsView` に新セクション「カレンダー同期」を追加 (既存 enum `SettingsSection` に `.calendar` ケース追加。既存 `.google` = ログイン表示は温存)。
シートの構成は **権限 / 書き出しトグル (マスター + 授業 + 自分の予定) / 同期状態 (最終書き出し・件数・エラーと回復導線) / 読み込み対象カレンダーのトグル一覧** の 4 節。**正典は `.designs/20260729-eventkit-dedicated-calendar-export.md` §7.1。**

- **書き込み先は専用「Atender」カレンダー固定**。選択 UI は**廃止** (`writeTargetCalendarId` ごと削除)。カレンダーは初回書き出し時に自動生成する。
- **読み込み対象の一覧には Atender カレンダーを出さない** (自分が書いたものを読み戻して二重化しないため)。
- ルーム共有のマスク編集への導線 (下記) は本節に残す。

## F4.8 ルーム共有 UI

`RoomDetailView` の設定 (歯車) 内に「自分のカレンダーを共有」セクション:
- 共有 ON/OFF (`POST`/`DELETE personal-calendar-share`)。
- `visibilityMode` Picker: **そのまま / マスキング / 予定のみ** (`NORMAL/TITLE_MAPPED/BUSY_ONLY`)。
- 「マスキング」選択時のみ**マスクルール編集**への導線 → `IcsTitleRuleEditorSheet` (新規・最小):
  - `GET/POST/PATCH/DELETE /api/me/ics-title-rules` (既存 backend、iOS 側は死んでた宣言を有効化)。
  - ルール行: matchType (完全一致/含む/正規表現) + pattern (例「デート」) + replaceWith (例「予定」)。"デート→予定" を 1 行で作れる。
  - default ルールは編集不可 (backend が 409、既存挙動)。

## F4.9 iOS ナビ構造 (汎用層 §7-7)
- 変更なし: personal カレンダーは Home 内 (別タブ新設しない、CLAUDE.md IA 規約)。設定は二次階層 (Settings)。ルーム共有はルーム詳細内。→ 最頻タスク (予定を見る) は Home 1 タップ、追加は月画面の + / FAB、同期設定は低頻度で Settings 送り。

---

# 挙動仕様 (「○○のとき△△」網羅) — ★Reviewer はここからテスト生成

時刻依存項は**標本時刻を #番号ごとに明記** (00:00–08:59 JST の危険窓を必ず含める、`gotcha/client-today-must-use-server-timezone` の教訓)。

## S. 時刻変換 `EventKitTimeMapping` (iOS 純ロジック)

→ `toPersonalDays` (日単位分解) の廃止に伴い、本節の S1-S6 は **`.designs/20260729-personal-calendar-rebuild.md` の EventKitTimeMapping テストへ移管**。書き出し側の時刻写像は **`.designs/20260729-eventkit-dedicated-calendar-export.md` §8 の MC / MP / PL 系**が正典 (終日 end の 23:59:59 規約・JST 危険窓の標本を含む)。

## R. reconcile (backend `reconcileEventKit`)

→ **`.designs/20260729-personal-calendar-rebuild.md` §9 の K 系に置換** (鍵が `(ekExternalId, date)` から `(ekExternalId, ekOccurrenceStart)` に変わり、複数日イベントを日ごとに分解しなくなったため)。
→ さらに **`.designs/20260729-eventkit-dedicated-calendar-export.md` §12 の差分 B により、旧 R6 (`manualNeedingPush` の返却) と対応する K9 / K10 は削除**。この endpoint は読み込み専用になった。

## E. echo / dedup (iOS `CalendarSyncCoordinator`)

→ **`.designs/20260729-eventkit-dedicated-calendar-export.md` §5.5 の TR 系に置換。** 抑止は `recentlyWritten` セット (5 秒) でなく **`lastSelfWriteAt` からの 3 秒間の quiet period** で行い、再入は `isRunning` で止める。書き出し先が読み込み対象から構造的に除外されているため、echo による重複行はそもそも発生しない。収束 (2 回連続で差分 0) は同 doc の PL2 / K13 が担保する。

## P. 権限 (iOS)

→ **`.designs/20260729-eventkit-dedicated-calendar-export.md` §7.4 と §8 の ST 系に置換。**
- **エラーは握り潰さず必ず可視化する** (旧 P4 の「例外を握り潰し hasError を立てず既存表示維持」という方針は**撤回**)。設定シートの同期状態欄とカレンダー画面のバナーに、メッセージ + 回復導線を出す。
- `writeOnly` は「双方向不可」ではなく **専用カレンダー方式が成立しない状態**として扱い、full access を要求する (write-only では自分が作ったカレンダーすら再取得できないため)。
- どの権限状態でもアプリは backend 予定のみで動作継続しクラッシュしない、は不変。

## M. マスク投影 (backend `projectShare`)
- **M1 (そのまま)**: share=NORMAL、`PersonalEvent("デート")` → `RoomEvent(title="デート", rawTitle="デート", visibilityMode=NORMAL)`。
- **M2 (予定のみ)**: share=BUSY_ONLY、`("デート")` → `RoomEvent(title="予定", rawTitle="デート")`。
- **M3 (マスキング一致)**: share=TITLE_MAPPED、ルール `CONTAINS "デート"→"予定"`、`("デートの予定")` → `title="予定"`。
- **M4 (マスキング不一致は素通し)**: 同 share、ルール無しの `("会議")` → `title="会議"` (default catch-all は個人共有では除外)。
- **M5 (投影 upsert キー)**: `externalUid="pe:"+id`。同 PersonalEvent を再投影 → 重複 RoomEvent を作らず update。
- **M6 (個人側削除伝播)**: PersonalEvent 削除後に再投影 → 対応 `source=PERSONAL` RoomEvent 削除。
- **M7 (共有 OFF)**: `DELETE share` → この room+user の `source=PERSONAL` RoomEvent 全削除。他 source (ICS/Google/MANUAL) は残す。
- **M8 (eventkit-sync フック連鎖)**: iPhone で予定追加 → `/eventkit-sync` → PersonalEvent 作成 → enabled share があれば自動投影で RoomEvent 出現。
- **M9 (非メンバー)**: room メンバーでない user の share 操作 → 404/403 (既存ガード)。

## C. UI (iOS)
- **C1 (月のみ・personal / room 共通)**: PersonalCalendar・RoomCalendar のどちらにも日/週セグメントが**無い**。月送り chevron のみ。`viewMode` state が両 View から消えている。
- **C2 (personal はタイル)**: personal の月 `CalendarMonth` は **`.atenderShadow(.card)` と `Radius.lg` を持ち、左右に 16pt の page margin がある**。背景は `bgElevated`。
- **C3 (room もタイル・週日/空き時間 撤去)**: ★ build 11 — RoomCalendar は**月グリッドのみ**。日/週トグル・`CalendarWeek`/`CalendarDay`・`AvailabilityBar` (空き時間バー)・`RoomDayEventList` が**無い**。表示はマスキング適用済ルーム予定のみ。月グリッドは personal と同じタイル (**`.atenderShadow(.card)` + `Radius.lg` + 左右 16pt の page margin**)。Reviewer は「room に segmented/AvailabilityBar が無い」「月グリッドに `.atenderShadow(.card)` がある」「グリッドが画面端まで伸びていない」を確認。
- **C4 (曜日色)**: 日セル日付が 日=red / 土=blue / 平日=primary (personal / room 共通)。
- **C5 (chip = 時間割セル同スタイル)**: ★ build 11 — カレンダーのイベント chip が **不透明 tint 面 (base=`bgElevated` 白) + 2pt solid 左バー + `textPrimary`** (時間割セル §3.6.1 と同スタイル)。半透明ピルでない。
- **C6 (追加→一方向書き出し)**: 月画面の追加導線 (personal=月ヘッダ trailing の `＋` / 日タップシート内の `＋` / room=常時 FAB) で作成 → backend 保存 → **次の同期で専用「Atender」カレンダーに現れる**。個別 push (`pushManualEvent`) は廃止され、差分エンジンが担う (`.designs/20260729-eventkit-dedicated-calendar-export.md` §8 EK3)。
- **C7 (アジェンダ廃止)**: ★ build 11 — 日タップで下部アジェンダ (`DayAgendaPanel`) が**出ない** (代わりに `PersonalDaySheet` が下から出る、§F4.3)。`CalendarMonthLayout.rowHeight` は `agendaHeight` 控除を撤廃済で、式は `(available - weekdayHeaderHeight) / rowCount`。`CalendarLayoutTests` #CA1/#CA3 はこの式のまま**緑を維持**する (タイル化の card chrome は `gridAvailable` として外から引く)。
- **C8 (共有 UI 到達不能層)**: ルーム共有 toggle/Picker は View 層。ロジック (visibilityMode → 投影) は backend テストで担保 (M系)。iOS 側はマッピングロジックを純関数化してテスト、View 自体は SmokeTests でクラッシュ非回帰のみ。

---

# テスト基盤

## backend (`apps/api`, Vitest)
- 配置: `apps/api/tests/*.test.ts` (既存慣習)。
- `tests/eventkit-sync.test.ts` / `tests/personal-calendar-share.test.ts` / `tests/personal-events.test.ts` は **20260729 の 2 doc で全面書き換え済**。読み込み同期は 20260729-personal-calendar-rebuild doc §10 の K 系、投影は同 P 系、書き出し用 endpoint は 20260729-eventkit doc §9 の API 系が正典。
- マスク投影は `applyTitleRules` の既存挙動に依存 → 既存 rule-scope テストと矛盾しないこと (default 除外は投影側の呼び出しで表現、engine 無改変)。
- ★ known-failures 台帳 (`.knowledge/known-failures.md`) と照合し、未分類失敗を残したままマージしない。

## iOS (`apps/ios/AtenderTests`, XCTest)
- → **`.designs/20260729-eventkit-dedicated-calendar-export.md` §9 が正典。** `EventKitReconcilerTests` の `pushTargets` 系は削除され、EKEventStore 非依存の純ロジック 7 スイート (`AtenderCalendarResolverTests` / `ExportKeyTests` / `CourseExportMappingTests` / `PersonalExportMappingTests` / `CalendarExportPlannerTests` / `CalendarSyncTriggerTests` / `CalendarSyncStatusTests`) を新設する。`EventKitTimeMappingTests` は 20260729-personal-calendar-rebuild doc が書き換える。
- EK I/O 層 (`actor EventKitStore`) は**ユニットテスト対象外** (Simulator の EventKit 実体依存)。回帰は既存 `SmokeTests`/`ScreenshotFlow` (token 注入ハーネス) でクラッシュ非回帰のみ。実体が要る項目は 20260729-eventkit doc §8 の EK1-EK16 として Touri の実機確認に回す。
- 月のみ化 + アジェンダ廃止 (build 11): `CalendarLayoutTests` #CA1/#CA3 は `agendaHeight` 控除撤廃で更新済。**タイル化 (2026-07-29) では `rowHeight` の式を変えず `gridAvailable` を足したので、この 2 件は緑を維持する** (§C7)。`CalendarRangeTests` は月グリッド範囲演算のみで無改変・緑維持。`CalendarLaneTests` は `CalendarLane` が util として生存するため緑維持 (§F4.1)。
- ★ Reviewer はコードを見ず本 §挙動仕様からテスト生成。時刻標本は #番号どおり使う (無害な正午を選ばない)。

---

# フェーズ (実行単位。節番号 = トピック単位なので依存で割る)

1. **F1** schema migration (additive) → `prisma generate`。単独で緑。
2. **F2** backend eventkit-sync (R系テスト) — F1 依存。
3. **F3** backend personal-calendar-share + 投影 (M系テスト) — F1 依存。F2 のフック (M8) は F2 後。
4. **F4a** iOS UI 刷新 (personal/room 月のみ統一 + chip=時間割セル化 + アジェンダ/週日/AvailabilityBar 撤去) — **F1–F3 非依存、先行出荷可** (build 11 で着地済)。C1/C4/C5/C7 系。※ 外殻は 2026-07-29 に全幅からタイルへ反転 (C2/C3)。
5. **F4b** iOS EventKit 同期層 + 設定 UI + 月画面の予定追加導線 — **`.designs/20260729-eventkit-dedicated-calendar-export.md` §11 の E1-E5 に置換**。
6. **F4c** iOS ルーム共有 UI + マスク編集 — F3 依存。C8 系。
7. **F5** gcal 死宣言/孤児 DTO 掃除 (低優先・非ブロッキング) — 1 シンボルずつ grep 後。

各 iOS フェーズ後に `CFBundleVersion` を上げ、backend 依存を含む出荷では atender-api を先にデプロイ (CLAUDE.md 手順)。

---

# 不採用案

- **案B: 完全対称双方向 + version コンフリクト解決** — 却下。両ソースが同時に真だと、同一予定の同時編集で LWW/マージ/tombstone/vector-clock が必要になり、EventKit のバックグラウンド配信不在 (前面化 diff 前提) と噛み合わず ping-pong が増える。要件2「シンプルカレンダー」は案A (EK 主 + Atender 発だけ push) で満たせる。**2026-07-29: 案A もさらに絞られ、Atender カレンダーは一方向の書き出し専用になった** (`.designs/20260729-eventkit-dedicated-calendar-export.md` §3)。書き出し先を読み込み対象から構造的に除外することで、同一予定に 2 つの正典ができる状態そのものを無くしている。
- **backend の Google カレンダー機構を撤去** — 却下 (要件)。Web は Google 連携を継続。iOS が呼ばなくなるだけ。schema の `GoogleCalendar*` は温存。
- **EK 生イベントに直接 backend でルール適用する `mapEventKitEvent` を backend に置く** — 却下。EK→PersonalEvent→(投影)→RoomEvent の 2 段にし、マスクは投影段の `applyTitleRules` に一本化。生 EK を backend に送らない (PersonalEvent がミラー)。engine 二重呼び出しを避ける。
- **`ekExternalId` に DB unique 制約** — 却下。同一 DB 内で重複しうる (複数取込/共有招待、library note) ため unique にすると取込が 500。複合キー **`(userId, ekExternalId, ekOccurrenceStart)`** をアプリ層照合 (`.designs/20260729-personal-calendar-rebuild.md` §3.1)。
- **`eventIdentifier` を永続キーに使う** — 却下。カレンダー移動/sync で揮発 (library note)。`calendarItemExternalIdentifier` を永続キー、`eventIdentifier` は「今の再フェッチ」限定。
- **PersonalCalendar の月のみ化で `CalendarWeek/Day/Lane/Segmented` を削除** — 当時は却下 (RoomDetailView が使用中だった)。**2026-07-29 に前提が消えた**: build 11 で room も月固定になり本番 caller が 0 になったため、`CalendarWeek`/`CalendarDay`/`CalendarSegmented`/`DayAgendaPanel` は `.designs/20260729-personal-calendar-rebuild.md` §6.8 で削除済 (grep 実測 0 件)。`CalendarLane` だけは純 util + `CalendarLaneTests` 5 件のため**存続**している。
- **Web の gcal 設定 UI を iOS に移植** — 却下。iOS には gcal 同期 UI が元々無く (G3)、EventKit がその役割を置換する。移植する UI が存在しない。
- **マスクを個別イベント手動 + カテゴリマッピングで MVP** — 却下 (G2)。共有単位 `visibilityMode` + 既存 per-user ルールで MVP。手動マスクは post-MVP。

> **本 doc から削除した不採用案** (前提が反転したため):
> - 月カレンダーの外殻 (タイル vs 全幅) と `CalendarMonthChrome` の要否 → 現行は `.designs/20260729-personal-calendar-rebuild.md` §15 が正典。
> - EventKit 書き出し (専用カレンダー / 識別子 / 差分方式 / 繰り返しの表現) → `.designs/20260729-eventkit-dedicated-calendar-export.md` §13 が正典。
