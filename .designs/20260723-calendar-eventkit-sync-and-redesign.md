# カレンダー同期刷新 (EventKit 双方向) + カレンダー UI 刷新 (TimeTree 参考・月のみ)

> 対象 PJ: atender (`apps/api` backend / `apps/ios` SwiftUI)。UI 正典: `DESIGN.md`。機能正典: Web。
> Researcher findings: `Muraki/knowledge/library/eventkit-ios17-access-and-sync-identifiers.md`。
> **本 doc は 4 つの独立度の高いサブ機能を 1 本にまとめている**が、PersonalCalendar.swift / schema.prisma を共有するため 1 doc + フェーズ制で衝突を避ける。UI 刷新 (F4) は F1–F3 と独立に先行出荷可。

---

## ★ 承認ゲート裁定 (2026-07-23 Touri 確定)

承認ゲートは通過。以下 4 点は Touri 裁定で確定済。本 doc はこの裁定に整合させた確定版。

### G1. source of truth — **案A 採択**
- **EventKit を主**、backend `PersonalEvent` は読み取りミラー。書き戻しは「Atender 発の予定」だけを EventKit へ push (最小・echo リスク低)。要件2 (双方向) はこれで満たす。iCloud 前提。削除は EventKit 側が勝つ (EK 由来ミラーは EK 削除で消す)。
- 案B (完全対称双方向 + version コンフリクト解決) は不採用 (§不採用案)。

### G2. マスキングの UX 粒度 — **共有単位モード + 既存ルールエンジン 採択**
- **ルーム共有単位の `visibilityMode` 3 段** — `そのまま / マスキング / 予定のみ` (= 既存 `EventVisibility` enum `NORMAL/TITLE_MAPPED/BUSY_ONLY` を再利用)。`マスキング` は**既存の per-user `IcsTitleRule` エンジンを無改変再利用** ("デート"→"予定" は CONTAINS ルール1本)。新モデル最小、ICS/Google と挙動一貫。
- **個別イベント手動マスク・カテゴリ (色) マッピングは post-MVP** (本 doc の対象外)。

### G3. gcal iOS 撤去のユーザー影響 — **影響ゼロ・確認済 (異議なし)**
コード実測: **iOS には Google カレンダー同期の UI が一つも実在しない**。`APIEndpoint.swift` に `googleSyncs / createGoogleSync / googleCalendars / googleConnection / completeGoogleLink / googleSyncAll` 等の宣言は在るが、**どの View からも呼ばれていない (call site 0)**。iOS の Google は **ログイン認証 (`GoogleSignIn` / better-auth OAuth) のみ**で、これは温存。
- iOS ユーザーで「iOS から gcal 連携を設定した人」は**存在し得ない** (UI が無かった) → 撤去の移行体験は不要。backend / Web の Google 機構は温存 (要件どおり)。
- 撤去作業は「死んだ endpoint 宣言 + 孤児 DTO の掃除」だけ (F5、非ブロッキング低優先)。

### G4. UI 刷新のスコープ — **(b) personal も room も全幅統一を採択** — DESIGN.md 全面置換
要件4「タイルの外側の影は無くす / 横幅いっぱい / TimeTree 参考」を、**月カレンダー全体の正典**とする。
- `CalendarMonth` は **PersonalCalendar と RoomDetailView の共有部品**。**両呼び出しとも `.fullBleed` (全幅・背景/角丸/影なし・TimeTree hairline)** に統一する。
- `chrome:` gated prop 方式は残すが、**既定を `.fullBleed` 側**にする (両 caller が全幅)。`.card` は残置しない (使用箇所が消えるため。将来必要になるまで variant を増やさない)。→ 実装上は `chrome` prop 自体を落として単一スタイルにしてもよいが、room の周辺レイアウト差 (§F4.2 の負マージン) を prop で吸収するなら残す。
- これは **DESIGN.md §3.6.3 (月カレンダー = 角丸白カード + 影) と §3.3 (浮くべき面は影を持つ) の正面否定**。→ **DESIGN.md §3.6.3/§3.3 を追記でなく全面置換**し、「月カレンダーは card 面から除外・full-bleed が正典」を新正典にする (§F4.6 に置換文案、承認済のため F4 で実施)。

---

## 目的

1. iOS の予定同期を **Google Calendar 依存から EventKit (iPhone/iCloud ローカルカレンダー) の双方向同期**へ置換する。iPhone で足した予定が Atender (画面 + backend `PersonalEvent`) に入り、Atender で足した予定が iPhone に出る「シンプルカレンダー」体験。backend/Web の Google 機構は無改変で温存。
2. 自分のカレンダーを**ルームに共有**できる。共有時にタイトルを**そのまま / マスキング (デート→予定) / 予定のみ**で出し分けられる (既存 `IcsTitleRule` エンジン再利用)。
3. Home の**カレンダー UI を刷新** — 月表示のみ・全幅・タイル外側の影なし・TimeTree 参考の見やすい月グリッド。

破壊的 migration はしない (全 additive・全 nullable)。

---

## スコープ境界 (どのファイルが誰の専属か)

| フェーズ | 主対象ファイル | 触ってよい範囲 |
|---|---|---|
| **F1 schema** | `apps/api/prisma/schema.prisma`, migration | `PersonalEvent` additive / `RoomEventSource` 追加値 / `PersonalCalendarShare` 新設 / `EventSource` enum 新設。**既存フィールド・enum 値は改変禁止** |
| **F2 backend sync API** | `apps/api/src/routes/personalEvents.ts`, `services/personalEvent.service.ts`, `packages/shared/src/schemas/personalEvent.ts` | eventkit-sync endpoint 追加 + input 拡張。既存 CRUD 挙動は不変 |
| **F3 backend room share** | `apps/api/src/routes/rooms.ts`, 新 `services/personalCalendarShare.service.ts` | personal-calendar-share endpoint + 投影。`services/icsTitleRule.service.ts` は**無改変再利用**のみ |
| **F4 iOS EventKit + UI** | `apps/ios/Atender/Features/Calendar/PersonalCalendar.swift`, 新 `Core/Sync/EventKit*.swift`, `Features/Settings/`, `Core/Networking/APIEndpoint.swift`, `Core/Models/DTOs.swift`, `apps/ios/project.yml` | **共有部品 `CalendarWeek/CalendarDay/CalendarLane/CalendarSegmented` は削除禁止** (RoomDetailView が使用中) |
| **F5 gcal 掃除 (低優先)** | `apps/ios/Atender/Core/Networking/APIEndpoint.swift`, `Core/Models/DTOs.swift` | 死んだ gcal-sync 宣言と孤児 DTO のみ。**1 シンボルずつ grep で参照 0 を確認してから削除** |

---

# データモデル (F1)

## 1.1 `PersonalEvent` — additive (非破壊)

現状 (`schema.prisma:290`) に**全 nullable/デフォルト付き**で追加。既存行・Web は無影響。

```prisma
model PersonalEvent {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  semesterId  String?
  semester    Semester? @relation("SemesterPersonalEvents", fields: [semesterId], references: [id], onDelete: SetNull)
  date        DateTime
  title       String
  isAllDay    Boolean   @default(true)
  startMinute Int?
  endMinute   Int?
  color       String?
  note        String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // ★ additive (EventKit ミラー用)
  source         EventSource @default(MANUAL)   // MANUAL = Atender/Web 発, EVENTKIT = iPhone 由来ミラー
  ekExternalId   String?                        // EKCalendarItem.calendarItemExternalIdentifier (デバイス跨ぎ安定・iCloud 前提)
  ekCalendarId   String?                        // EKCalendar.calendarIdentifier (sync-proof でない → フォールバックは title/source、§F4.3)
  ekLastModified DateTime?                       // EKEvent.lastModifiedDate (どちらが新しいか判定用)

  @@index([userId, date])
  @@index([semesterId])
  @@index([userId, ekExternalId])   // ★ dedup lookup 用
}

enum EventSource {
  MANUAL
  EVENTKIT
}
```

**dedup キー**: `(userId, ekExternalId, date)` の複合。`ekExternalId` は同一 DB 内で重複しうる (ICS 複数取込 / 共有招待、library note) ので単独 unique にしない。繰り返しは全 occurrence 同値 → `date` 併用で occurrence を区別。ユニーク制約は貼らず**アプリ層で複合キー照合**する (unique 制約にすると重複コピーの取込が 500 になる)。

**時刻表現の差異** (変換層 §F4.4 が吸収):
- `PersonalEvent`: `date` (JST 00:00 の `DateTime`) + `startMinute`/`endMinute` (JST 00:00 からの分) + `isAllDay`。
- EventKit: `startDate`/`endDate` (絶対 `Date`) + `isAllDay`。
- 日本は DST 無し → JST 固定オフセットで安全。

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

`prisma migrate` で 1 本。全て additive/nullable/default 付きなので既存データ移行不要。**認証・課金・削除・破壊的変更に該当しない** (Cascade は既存パターン踏襲)。SQLite なので enum は文字列列 + CHECK。

---

# API / 関数シグネチャ

## 2.1 backend: EventKit 同期 endpoint (F2)

既存 `PersonalEventCreateInput`/`UpdateInput` (`packages/shared/src/schemas/personalEvent.ts`) に**全 optional** で additive 拡張 (Web は送らない → 無影響。★ gotcha: 非 optional 追加は additive でないので必ず optional):

```ts
// PersonalEventInputBase に追加 (create/update 共通)
source:         z.enum(["MANUAL", "EVENTKIT"]).optional(),
ekExternalId:   z.string().optional(),
ekCalendarId:   z.string().optional(),
ekLastModified: z.string().datetime().optional(),
```

既存 `POST/PATCH/DELETE /api/personal-events` はこれで「Atender 発予定に ekExternalId を後付け PATCH する」用途に足りる。加えて**双方向 reconcile 用の一括 endpoint**を新設 (削除伝播はサーバが範囲内の全 EK 集合を知る必要があるため一括が必須):

```
POST /api/personal-events/eventkit-sync   (sessionMiddleware)
```

`EventKitSyncInput` (shared に新設):
```ts
export const EventKitSyncEvent = z.object({
  ekExternalId:   z.string(),
  ekCalendarId:   z.string(),
  ekLastModified: z.string().datetime().nullable(),
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title:          z.string().min(1).max(100),
  isAllDay:       z.boolean(),
  startMinute:    z.number().int().min(0).max(1440).nullable(),
  endMinute:      z.number().int().min(0).max(1440).nullable(),
});
export const EventKitSyncInput = z.object({
  range:  z.object({ from: DateStr, to: DateStr }),   // 同期対象の JST 日付範囲
  events: z.array(EventKitSyncEvent),                 // range 内の linked カレンダーの全 EK イベント (per-day 展開済)
});
```

サービス `reconcileEventKit(args: { userId; input: EventKitSyncInput }): Promise<EventKitSyncResult>`:
```ts
export type EventKitSyncResult = {
  mirrors: PersonalEventDto[];            // 反映後の EVENTKIT ミラー (range 内)
  manualNeedingPush: PersonalEventDto[];  // MANUAL かつ ekExternalId==null (client が EK へ push すべき)
};
```
挙動 (1 トランザクション):
1. incoming `events` を `(ekExternalId, date)` でキー化。
2. `PersonalEvent where userId, source=EVENTKIT, date∈[from,to]` を取得。
3. **upsert**: incoming にあり既存ミラー無し → create (`source=EVENTKIT`)。既存あり かつ `incoming.ekLastModified > existing.ekLastModified` → update。等しい/古い → no-op。
4. **削除伝播**: 既存 EVENTKIT ミラーで incoming に無いキー → delete (iPhone 側で消えた予定)。
5. `source=MANUAL` は**一切触らない**。
6. return `mirrors` (再取得) + `manualNeedingPush` (`source=MANUAL, ekExternalId==null, date∈range`)。
7. **投影フック**: この user の `enabled` な `PersonalCalendarShare` 全てを再投影 (§2.2)。

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

`projectShare` 詳細 (`googleCalendarSync.service.ts:201` の upsert 形を踏襲):
- share が `enabled=false` → この room+user の `source=PERSONAL` RoomEvent を全削除して return。
- user の `PersonalEvent` (range: 今日から `DEFAULT_PROJECTION_MONTHS`=3ヶ月先まで、Google の `DEFAULT_INITIAL_RANGE_MONTHS` に合わせる) を取得。
- マスク: `share.visibilityMode` で分岐 —
  - `NORMAL` → `title = pe.title` (そのまま)。
  - `BUSY_ONLY` → `title = "予定"` (全マスク)。
  - `TITLE_MAPPED` → `applyTitleRules(pe.title, listRules(userId).filter(r => !r.isDefault))` を適用。**マッチ無しは元タイトルを維持** (default catch-all `.*→予定` は個人共有では除外する。理由: "デート→予定 だけ隠して他は素通し" が要件2の意図。default を含めると全部「予定」になり NORMAL と TITLE_MAPPED の差が消える)。`applyTitleRules` エンジンは**無改変**、呼び出し側でルール集合を絞るだけ。
- upsert: `RoomEvent where roomId_externalUid = (roomId, "pe:"+pe.id)`:
  - create: `{ roomId, authorId: userId, title: mapped, rawTitle: pe.title, description: pe.note, start: toUtc(pe), end: toUtc(pe), isAllDay: pe.isAllDay, color: pe.color, source: "PERSONAL", externalUid: "pe:"+pe.id, visibilityMode: share.visibilityMode }`
  - update: `title, rawTitle, start, end, isAllDay, color, visibilityMode`
- 削除: この room+user の `source=PERSONAL` RoomEvent で、対応 `pe:` が現存 PersonalEvent に無いもの → delete (個人側削除の伝播)。
- `start/end` の UTC 変換: `pe.date` (JST 00:00) + `startMinute` → `dateStringToJstDay(...).startOfDay` に分加算して `toDate()` (既存 `lib/tz.ts` の dayjs tz 変換を使う。分単位は `dayjs.tz(date).add(startMinute,'minute')`)。all-day は `startOfDay`〜`endOfDay`。

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
```swift
import EventKit

@MainActor @Observable final class EventKitService {
    enum Access { case notDetermined, denied, restricted, writeOnly, fullAccess }
    private(set) var access: Access
    private let store = EKEventStore()

    func currentAccess() -> Access                                  // EKEventStore.authorizationStatus(for:.event) を Access へ写像
    func requestFullAccess() async -> Access                        // requestFullAccessToEvents(completion:)  ← iOS17+ 一本 (target iOS17+)
    func availableCalendars() -> [EKCalendarInfo]                   // calendars(for:.event) → 表示用 info
    func fetchSnapshots(range: DateInterval, calendarIds: Set<String>) -> [EKEventSnapshot]
        // refreshSourcesIfNecessary() → predicateForEvents(withStart:end:calendars:) → events(matching:) → per-day 展開
    func createEvent(_ pe: PersonalEventDto, in calendarId: String) throws -> String   // 戻り: calendarItemExternalIdentifier
    func updateEvent(externalId: String, _ pe: PersonalEventDto) throws
    func deleteEvent(externalId: String) throws
    func startObserving(_ onChange: @escaping () -> Void)           // NSNotification.Name.EKEventStoreChanged 購読 + 前面化で発火
}

struct EKCalendarInfo: Identifiable, Equatable {   // View 用 (EKCalendar を直接持たない)
    let id: String            // calendarIdentifier
    let title: String
    let sourceTitle: String   // EKSource.title (iCloud/ローカル判別)
    let colorHex: String?
    let allowsModify: Bool     // EKCalendar.allowsContentModifications
}
```
- `NSCalendarsFullAccessUsageDescription` を `project.yml` `info.properties` に追加 (Info.plist は xcodegen 生成なので**手編集禁止**、project.yml が正典 — CLAUDE.md gotcha)。
- 書き込み先カレンダー: ユーザーが設定 (§F4.7)。未設定時は `defaultCalendarForNewEvents`。`allowsModify=false` のカレンダーは push 先に選べない。

### 純ロジック (★ユニットテスト対象・EKEventStore 非依存)
```swift
struct EKEventSnapshot: Equatable {
    let externalId: String      // calendarItemExternalIdentifier
    let calendarId: String
    let lastModified: Date?     // EKEvent.lastModifiedDate
    let date: String            // per-day 展開後の JST yyyy-MM-dd
    let title: String
    let isAllDay: Bool
    let startMinute: Int?       // JST 分
    let endMinute: Int?
}

struct ReconcilePlan: Equatable {
    var uploads: [EventKitSyncEvent]          // backend eventkit-sync へ送る EK 集合 (= snapshots そのまま)
    var pushToEK: [PersonalEventDto]          // manualNeedingPush を EK へ書く
}

enum EventKitReconciler {
    // 前半: EK snapshots を backend へ送る形へ (range/linked フィルタ + per-day 済み前提)
    static func uploads(from snapshots: [EKEventSnapshot]) -> [EventKitSyncEvent]
    // 後半: backend 応答から EK へ push すべき MANUAL を返す (echo 抑止セットを除外)
    static func pushTargets(manualNeedingPush: [PersonalEventDto],
                            recentlyWritten: Set<String>) -> [PersonalEventDto]
}
```

### 時刻変換 (★ユニットテスト対象・境界の両側で測る)
```swift
enum EventKitTimeMapping {
    // EK 絶対時刻 → PersonalEvent JST 表現。複数日跨ぎは spanned JST 日ごとに 1 要素 (all-day 展開)
    static func toPersonalDays(start: Date, end: Date, isAllDay: Bool,
                               clock: SchoolClock.Type = SchoolClock.self)
        -> [(date: String, isAllDay: Bool, startMinute: Int?, endMinute: Int?)]
    // PersonalEvent JST 表現 → EK 絶対時刻
    static func toAbsolute(date: String, isAllDay: Bool, startMinute: Int?, endMinute: Int?)
        -> (start: Date, end: Date)
}
```
- 既存 `SchoolClock` (Asia/Tokyo 固定 calendar) を時計源に**再利用** (client-today バグの教訓、`gotcha/client-today-must-use-server-timezone.md`)。UTC 暦で日付を割らない。

### オーケストレータ
```swift
@MainActor @Observable final class CalendarSyncCoordinator {
    // load 時 / 前面化時 / EKEventStoreChanged 時に呼ぶ
    func sync(range: DateInterval) async
    //  1. store.fetchSnapshots(range, linkedCalendarIds)
    //  2. POST /eventkit-sync { range, events: uploads }
    //  3. 応答 manualNeedingPush を EK へ createEvent → 得た externalId を PATCH /personal-events/:id { ekExternalId, ekCalendarId }
    //     書いた externalId は recentlyWritten に 5s 登録 (echo 抑止)
    //  4. PersonalEvent キャッシュを invalidate → PersonalCalendar 再描画
    var linkedCalendarIds: Set<String>   // @AppStorage 永続 (calendarIdentifier + フォールバックは title/sourceTitle)
    var writeTargetCalendarId: String?
}
```

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
`PersonalEventCreateInput`/`UpdateInput` (DTOs.swift:456/467) に optional 追加: `var source: String? / ekExternalId: String? / ekCalendarId: String? / ekLastModified: String?`。

---

# UI / UX (F4)

汎用層チェック観点 (`ui-ux-design-perspectives.md` §7) を通し、正典 `DESIGN.md` に従う。**要件4 (全幅・影なし) は DESIGN.md §3.6.3/§3.3 と衝突していたが、G4=(b) 裁定で「月カレンダーは personal / room とも full-bleed が正典」に確定** → DESIGN.md §3.6.3/§3.3 を全面置換 (§F4.6)。以降の記述は full-bleed 統一前提。

## F4.1 personal / room カレンダー = 月のみ (週/日モード撤去)

★ build 11 で **personal・room とも月固定に統一** (room も週日を撤去、§room 節)。

- **`PersonalCalendarViewModel` から `viewMode` を除去**し常に月。`currentRange` は月グリッド範囲固定。**`RoomCalendar` からも `viewMode` state を除去**し常に月 (§room 節)。
- **両 View から `CalendarSegmented` (日/週/月ピッカー) と `case .week/.day` 分岐を削除**。`PeriodNav` は月送りのみ (chevron + 「2026年7月」)。
- ★ **孤児化**: 両 caller が週日を捨てた結果 `CalendarWeek`/`CalendarDay`/`CalendarSegmented` は本番 caller ゼロになる (§room 節で報告項目化)。`CalendarLane` は `TimetableLogic` 定義側 + test に参照が残り生存。
- `CalendarMonthLayout` は **`agendaHeight` 控除を撤廃** (アジェンダ廃止・§F4.3) → 月グリッドが縦フル。`CalendarLayoutTests` の #CA1/#CA3 は式変更で更新が要る (§C7)。

## F4.2 月グリッドの視覚 — TimeTree 参考・全幅・影なし (両 caller 統一)

`CalendarMonth` を **全幅 full-bleed に統一** (G4=(b))。**PersonalCalendar と RoomDetailView の両方**が全幅。`var chrome: CalendarMonthChrome = .fullBleed` を追加 (既定 full-bleed)。`.card` variant は残置しない (使用 caller が消えるため)。room 側だけ周辺レイアウトの調整が要る (下記 §room 側の全幅化調整)。

`.fullBleed` の描画規則 (TimeTree の月表示を参考):

| 属性 | 現状 (card) | `.fullBleed` 新規則 |
|---|---|---|
| 外殻 | `bgElevated` 角丸 `Radius.lg` + `.atenderShadow(.card)` + `Space.s2` padding | **角丸・影なし**。背景は `Color.bgElevated` (白)。**画面左右端まで**。両 caller とも祖先で `Space.pagePxMobile` (16pt) の水平 page margin を持つ (PersonalCalendar の host / RoomDetailView は `.padding(Space.pagePxMobile)` at `RoomDetailView.swift:51`) ので、`CalendarMonth(.fullBleed)` は **`.padding(.horizontal, -Space.pagePxMobile)` で page margin を打ち消して端まで伸ばす**。曜日ヘッダ〜週行は端から端まで、日付/chip の**内側**にだけ小 padding |
| セル分離 | `LazyVGrid spacing:1` の 1pt gap | **hairline 罫線**: 各週行の上辺に `Color.borderSubtle` (= `.separator`) の 0.5pt (1px)。列間も同 hairline。TimeTree の薄いグリッド線 (§3.6.2「8% hairline」許容範囲内) |
| 日セル背景 | `bgElevated`/`bgMuted.opacity` | **不透明**。当月 `Color.bgElevated` (白)、当月外 `Color.bgMuted`。角丸なし (グリッドが連続) |
| 日付 | 左上、選択=accent 丸、今日=accent 文字 | 左上維持。**曜日色**: 日=`#E5484D` 系 (red)、土=`#0091FF` 系 (blue)、平日=`textPrimary`、当月外は各色の tertiary。今日=accent 塗り丸、選択=accent アウトライン丸 |
| イベント chip | 18% 不透明 tint ピル | **★ build 11: 時間割セル (§3.6.1) と同スタイルに統一** — **不透明 tint 面** (base = `Color.bgElevated` 白 に科目/予定色を合成、半透明にしない) + **2pt solid 左バー** (`Radius.full`、科目/予定色) + テキスト `textPrimary`。`.caption2` semibold 1 行 truncate。最大 N 行 → 超過 `+M` (既存ロジック流用)。TimeTree の帯でなく時間割セルの縮小版 |
| 状態ドット | 日付右 6pt 丸 | 維持 (出席状態) |

- 曜日ヘッダ: 全幅・Mon 始まり (既存 `monthGridRange` が Mon 基準のため踏襲)。土日を上記色で。**TimeTree 既定は日曜始まりだが、時間割が月〜金中心 + 既存グリッド演算が Mon 基準なので Mon 始まりを維持 (逸脱理由 1 行)**。
- タップターゲット: 日セルは視覚が小さくても hit area 44pt を確保 (§3.6 / 汎用層 §2)。

### room カレンダー = 自分カレンダーと完全統一 (★ build 11 Touri 実機裁定)

**build 11 で、ルームカレンダーは「日/週/月トグル・週表示・日表示・AvailabilityBar (空き時間バー) を全撤去」し、自分カレンダーと完全に同じ月グリッド全幅 (`CalendarMonth(chrome:.fullBleed)`) に統一された。** 表示するのは**マスキング適用済のルーム予定のみ**。「空き時間」機能は Touri 裁定で**一旦削除** (post-MVP で別導線に戻す余地)。

`RoomCalendar` の確定形:
- **月グリッド固定**: `CalendarSegmented` (日/週/月トグル)・`case .week`/`.day` 分岐・`CalendarWeek`/`CalendarDay` 呼び出し・`viewMode` state を **RoomCalendar から撤去**。常に月。PersonalCalendar と同じ月送り chevron のみ。
- **AvailabilityBar 撤去**: 空き時間バー (`AvailabilityBar`) と `RoomDayEventList` (日別予定リスト) を撤去。自分カレンダーと同様、月グリッドが縦スペースをフル使用 (アジェンダ無し、§F4.3)。
- **表示内容**: `RoomCalendarLogic.buildCalendarEvents` のルーム予定 (マスキング適用済 `source=PERSONAL` 含む)。時間割/出席状態のオーバーレイは無し (ルームは予定共有のみ)。
- **負マージンで端まで**: 祖先 `RoomDetailView.body` の `.padding(Space.pagePxMobile)` (`:51`) を月グリッドだけ負マージンで打ち消し画面端まで (§F4.2 外殻行)。月送り chevron 行は page margin inset のまま。
- **FAB**: 「予定を追加」FAB は月グリッドと `.overlay(alignment:.bottomTrailing)` で共存 (月固定になったので、旧「`viewMode != .month` のとき表示」条件は撤廃し**常時表示**)。ICS 取込 FAB も同様に月画面で表示。
- **★ 孤児化する共有 struct (実測)**: PersonalCalendar (§F4.1) と RoomCalendar の両方が週日を撤去した結果、**`CalendarWeek` / `CalendarDay` / `CalendarSegmented` は本番 caller を全て失う** (build 10 時点の caller は PersonalCalendar と RoomDetailView の 2 つだけ、と grep 実測)。`CalendarLane` は `TimetableLogic.swift` (定義側) と `CalendarLaneTests` に参照が残るので**純 util として生存** (`CalendarDay` からの呼びだけ消える)。→ **孤児化した `CalendarWeek`/`CalendarDay`/`CalendarSegmented` を削除するか残すかは Architect 裁量でない** (作った UI を捨てるプロダクト判断)。設計としては「本番 caller ゼロになった事実」を Reviewer/Leader に報告項目として上げ、削除は別途 Touri 判断。放置する場合も**未使用 struct として明示**し、週日関連テスト (もしあれば) の陳腐化を台帳に載せる。

## F4.3 選択日アジェンダ — ★ build 11 で廃止

**build 11 Touri 実機裁定: グリッド下の `DayAgendaPanel` (「N/N の予定」リスト) は撤去。** 日タップ時のアジェンダ表示は**無し**。月グリッドが空いた縦スペースをフル使用して拡大する (`CalendarMonthLayout.rowHeight` の `available` から `agendaHeight` を引く控除を撤廃 → 行高がその分増える、§下記)。personal / room とも同一 (アジェンダ無し)。

- **`DayAgendaPanel` struct と呼び出しを撤去**。日セルタップは選択状態 (accent アウトライン丸) のハイライトのみで、下部リストは出さない。
- **`CalendarMonthLayout` 調整**: `rowHeight(available:)` は現状 `available - weekdayHeaderHeight - agendaHeight` を行数で割っている (`agendaHeight=200` を差し引いていた)。アジェンダ撤去で **`agendaHeight` の控除を 0 にする** (or `agendaHeight` 定数を撤去) → 月グリッドが縦フルに広がる。`CalendarLayoutTests` の #CA1/#CA3 は `agendaHeight` を式に含むので**この式変更で更新が要る** (§テスト基盤・挙動仕様 §C7)。
- **★ 予定追加導線 (アジェンダ撤去後の代替)**: アジェンダに載せていた `+` ボタンは行き場を失う。代替として **`PersonalCalendar` / `RoomCalendar` の月画面に追加導線を残す** — personal は月ヘッダ (chevron 行) の trailing に `+`、room は既存 FAB (「予定を追加」、月固定化で常時表示、§room 節)。押下で `PersonalEventEditorSheet` (既存 `BulkAndPersonalEventSheets.swift:296` の作成フォーム再利用)。保存で **backend create → `CalendarSyncCoordinator` 経由で EK にも push** (要件2「Atender で追加→iPhone にも出る」)。日付は選択中の日をプリセット。

## F4.4 視覚階層の割当 (汎用層 §7-1)

| 階層 | 要素 | 表現 |
|---|---|---|
| L0 | 今日 / 選択日のセル強調 | accent 塗り丸 (今日) / アウトライン丸 (選択) |
| L1 | 月グリッド全体 | 全幅・面主役・hairline のみ |
| L2 | イベント chip | 時間割セル §3.6.1 同スタイル (不透明 tint 面 base=bgElevated 白 + 2pt solid 左バー + textPrimary) |
| L3 (meta) | 曜日ヘッダ・月ラベル・状態ドット | `.caption`/`.footnote` secondary |

## F4.5 状態網羅 (汎用層 §7-4) — Reviewer はここからテスト
- loading: 既存 `Skeleton` 踏襲。
- error: 「カレンダーを読み込めませんでした」+ 再試行。
- empty (予定 0): アジェンダは廃止 (build 11) のため下部リスト無し。月グリッドは予定 chip が無い素の月表示 (時間割/backend 予定があればそれのみ)。追加は月画面の `+` / FAB (§F4.3)。
- **EventKit 権限**: `notDetermined` → 設定画面で「iPhone のカレンダーと同期」ボタン (要求前は何も同期しない、月グリッドは時間割/backend 予定のみ表示)。`denied`/`restricted` → 「設定 > Atender でカレンダーを許可」への誘導 + アプリは backend 予定のみで**動作継続** (同期無効フォールバック、クラッシュしない)。`writeOnly` → 双方向不可の旨表示し full access を再要求 (双方向は full 必須、library note)。

## F4.6 ★ DESIGN.md 全面置換 (G4=(b) 採択・追記でなく置換)

月カレンダーは personal / room とも full-bleed が正典。**`DESIGN.md §3.6.3` の表と原則を全面置換**する (仕様 md 編集規律: 旧「card + shadow + gap」記述を残さず書き換え):

> #### 3.6.3 月カレンダー (personal / room 共通)
> **2026-07-23 Touri 裁定により、月カレンダーは full-bleed に統一** (旧「角丸白カード + `.atenderShadow(.card)`」規定は撤回)。TimeTree の月表示を参考に、**全幅・背景/角丸/外殻カードなし・影なし**で描く。personal (Home) と room (ルーム詳細) の両方に適用し、`CalendarMonth(chrome: .fullBleed)` を既定とする。
>
> | 属性 | full-bleed 規則 |
> |---|---|
> | 外殻 | カード面にしない。`Color.bgBase`、角丸なし、`.atenderShadow` を**敷かない**。祖先の `Space.pagePxMobile` page margin を負マージンで打ち消し**画面左右端まで** |
> | セル分離 | TimeTree 風 hairline (`Color.borderSubtle` = `.separator` の 1px)。週行上辺 + 列間。濃い罫線で表組みにしない |
> | 日セル | 枠なし・角丸なし。当月 `bgBase` / 当月外 `bgMuted`。日付左上。曜日色 (日=red / 土=blue / 平日=primary)。今日=accent 塗り丸、選択=accent アウトライン丸 |
> | イベント | 不透明 tint の細バー、`.caption2`、1 行 truncate、超過 `+M` |
>
> **月カレンダーは §3.3「浮くべき面は必ず影を持つ」の対象外** (カード面から除外)。時間割セル (§3.6.1) や他のカード面の影規定は不変。

`§3.3` の本文にも一文を**置換で**追加: 「ただし**月カレンダー (§3.6.3) は full-bleed でありカード面ではない**ため影を敷かない (2026-07-23 裁定)」。「浮くべき面は影を持つ」の一般規則自体は維持し、月カレンダーを明示的に除外面として列挙する。

**この DESIGN.md 編集は F4a の一部として実施** (承認済。今は置換文案)。

## F4.7 カレンダー設定 UI (新規)

`SettingsView` に新セクション「カレンダー同期」を追加 (既存 enum `SettingsSection` に `.calendar` ケース追加。既存 `.google` = ログイン表示は温存):
- **権限**: 未許可なら「iPhone のカレンダーと同期する」→ `requestFullAccess()`。
- **表示するカレンダー選択**: `availableCalendars()` の一覧に toggle (複数選択可)。選んだ `calendarIdentifier` を永続 (フォールバック: `title`+`sourceTitle`、calendarIdentifier は sync-proof でないため — library note §How)。
- **書き込み先カレンダー**: `allowsModify=true` のカレンダーから 1 つ選択 (Atender 発の予定の保存先)。既定 `defaultCalendarForNewEvents`。
- ルーム共有のマスク編集への導線 (下記)。

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
- **S1**: EK timed 単日 (JST 2026-07-23 09:00–10:30) → `[(date:"2026-07-23", isAllDay:false, startMinute:540, endMinute:630)]`。
- **S2 (危険窓)**: EK timed (JST 2026-07-23 **00:30**–01:00) → `date:"2026-07-23"`, `startMinute:30`。**UTC 暦で割ると前日 07-22 になる変異体をここで殺す** (UTC では 07-22 15:30)。標本を正午にしない。
- **S3**: EK all-day 単日 (2026-07-23) → `isAllDay:true, startMinute:nil, endMinute:nil`。
- **S4 (複数日)**: EK all-day 2026-07-23〜07-25 (3日) → JST 日ごとに 3 要素、各 all-day。dedup は `(externalId, date)` で 3 キーに分かれる。
- **S5**: `toAbsolute("2026-07-23", isAllDay:false, 540, 630)` → JST 09:00/10:30 の絶対 Date。round-trip で S1 に戻る。
- **S6**: `toAbsolute` all-day → JST 00:00〜翌 00:00 (EK all-day 慣習)。

## R. reconcile (backend `reconcileEventKit`)
- **R1 (新規 EK→mirror)**: incoming に `(ext=X, date=D)`、既存ミラー無し → `PersonalEvent(source=EVENTKIT, ekExternalId=X, date=D)` を create。
- **R2 (更新)**: 既存ミラー `ekLastModified=T0`、incoming `ekLastModified=T1>T0` → title/時刻を update。
- **R3 (更新なし)**: incoming `ekLastModified <= 既存` → no-op (ping-pong 防止)。
- **R4 (削除伝播)**: 既存 EVENTKIT ミラー `(ext=Y,date=D)` が incoming に無い かつ `D∈range` → delete。
- **R5 (MANUAL 不可侵)**: `source=MANUAL` の行は incoming に無くても削除しない・更新しない。
- **R6 (push 対象返却)**: `source=MANUAL, ekExternalId=null, date∈range` を `manualNeedingPush` に含める。ekExternalId 付き MANUAL は含めない。
- **R7 (重複 externalId)**: 同 range に同 `ekExternalId` で `date` 違いが 2 件 (複数日イベント) → 別行として両方保持 (unique 制約に頼らない)。
- **R8 (範囲外不干渉)**: `date∉range` の EVENTKIT ミラーは削除判定の対象外。

## E. echo / dedup (iOS `CalendarSyncCoordinator`)
- **E1 (自己書き込み echo)**: Atender で予定作成 → EK へ push → `EKEventStoreChanged` 発火 → 再 sync。push 済 externalId は既に PersonalEvent.ekExternalId に載る → R1 でなく既存一致 → **重複行を作らない**。
- **E2 (recentlyWritten)**: push 直後 5s 以内の change 通知は当該 externalId の再 push をスキップ (`pushTargets` が除外)。
- **E3 (両方向落ち着き)**: 変更なしで sync を 2 回連続実行 → 2 回目は create/update/delete/push すべて 0 (収束)。

## P. 権限 (iOS)
- **P1**: `notDetermined` で同期ボタン押下 → `requestFullAccess()` → 許可 → `fullAccess`、初回 sync 実行。
- **P2 (拒否)**: `denied` → 同期は無効、月グリッドは時間割 + backend の既存予定のみ描画、**クラッシュしない**。設定誘導を表示。
- **P3 (writeOnly)**: 双方向不可の旨 + full 再要求導線。EK 読み取りをしない。
- **P4 (権限剥奪の途中変化)**: sync 中に権限が失われたら例外を握り潰し hasError を立てず既存表示維持 (フォールバック)。

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
- **C2 (personal full-bleed)**: personal の月 `CalendarMonth` は `.atenderShadow` を持たず、背景が `bgElevated` (白)、月グリッド左右が画面端まで (負マージンで page margin を打ち消す)。
- **C3 (room も full-bleed・週日/空き時間 撤去)**: ★ build 11 — RoomCalendar は**月グリッド全幅のみ**。日/週トグル・`CalendarWeek`/`CalendarDay`・`AvailabilityBar` (空き時間バー)・`RoomDayEventList` が**無い**。表示はマスキング適用済ルーム予定のみ。周辺 (月送り chevron) は page margin inset、月グリッドは影なし・端まで。Reviewer は「room に segmented/AvailabilityBar が無い」「月グリッドに `.atenderShadow(.card)` が無い」「グリッド右端が画面端に一致」を確認。
- **C4 (曜日色)**: 日セル日付が 日=red / 土=blue / 平日=primary (personal / room 共通)。
- **C5 (chip = 時間割セル同スタイル)**: ★ build 11 — カレンダーのイベント chip が **不透明 tint 面 (base=`bgElevated` 白) + 2pt solid 左バー + `textPrimary`** (時間割セル §3.6.1 と同スタイル)。半透明ピルでない。
- **C6 (追加→双方向)**: 月画面の追加導線 (personal=月ヘッダ trailing の `+` / room=常時 FAB) で作成 → backend 保存 + EK へ push → iPhone カレンダーに出現。
- **C7 (アジェンダ廃止・グリッド縦フル)**: ★ build 11 — 日タップで下部アジェンダ (`DayAgendaPanel`) が**出ない**。`CalendarMonthLayout.rowHeight` は `agendaHeight` 控除を撤廃 → 同 `available` で行高が旧より大きい。`CalendarLayoutTests` #CA1/#CA3 は新式 (`available - weekdayHeaderHeight` を行数で割る、`agendaHeight` 項なし) に更新。
- **C8 (共有 UI 到達不能層)**: ルーム共有 toggle/Picker は View 層。ロジック (visibilityMode → 投影) は backend テストで担保 (M系)。iOS 側はマッピングロジックを純関数化してテスト、View 自体は SmokeTests でクラッシュ非回帰のみ。

---

# テスト基盤

## backend (`apps/api`, Vitest)
- 配置: `apps/api/tests/*.test.ts` (既存慣習)。
- 新規: `tests/eventkit-sync.test.ts` (R1–R8)、`tests/personal-calendar-share.test.ts` (M1–M9)。
- 拡張: `tests/personal-events.test.ts` (optional 新フィールドの受理・Web 非送信時の後方互換)。
- マスク投影は `applyTitleRules` の既存挙動に依存 → 既存 rule-scope テストと矛盾しないこと (default 除外は投影側の呼び出しで表現、engine 無改変)。
- ★ known-failures 台帳 (`.knowledge/known-failures.md`) と照合し、未分類失敗を残したままマージしない。

## iOS (`apps/ios/AtenderTests`, XCTest)
- 純ロジックを I/O から分離してテスト:
  - `EventKitTimeMappingTests` (S1–S6、**境界の両側 = 00:30 と 12:00 と 23:30 を測る**)。
  - `EventKitReconcilerTests` (uploads/pushTargets、E1–E3 の echo/dedup)。
- `EventKitService` (EKEventStore I/O) は**ユニットテスト対象外** (Simulator の EventKit 実体依存)。回帰は既存 `SmokeTests`/`ScreenshotFlow` (token 注入ハーネス) でクラッシュ非回帰のみ。
- 月のみ化 + アジェンダ廃止 (build 11): `CalendarLayoutTests` #CA1/#CA3 は **`agendaHeight` 控除撤廃で式が変わるため更新が要る** (§C7)。`CalendarRangeTests` は月グリッド範囲演算のみで無改変・緑維持。`CalendarLaneTests` は `CalendarLane` が util として生存するため緑維持 (§F4.1 孤児化注記)。
- ★ Reviewer はコードを見ず本 §挙動仕様からテスト生成。時刻標本は #番号どおり使う (無害な正午を選ばない)。

---

# フェーズ (実行単位。節番号 = トピック単位なので依存で割る)

1. **F1** schema migration (additive) → `prisma generate`。単独で緑。
2. **F2** backend eventkit-sync (R系テスト) — F1 依存。
3. **F3** backend personal-calendar-share + 投影 (M系テスト) — F1 依存。F2 のフック (M8) は F2 後。
4. **F4a** iOS UI 刷新 (personal/room 月のみ統一 + full-bleed + chip=時間割セル化 + アジェンダ/週日/AvailabilityBar 撤去) — **F1–F3 非依存、先行出荷可** (build 11 で着地済/進行中)。C1–C5/C7 系。
5. **F4b** iOS EventKit 同期層 + 設定 UI + 月画面の予定追加導線 — F2 依存。S/E/P/C6 系。
6. **F4c** iOS ルーム共有 UI + マスク編集 — F3 依存。C8 系。
7. **F5** gcal 死宣言/孤児 DTO 掃除 (低優先・非ブロッキング) — 1 シンボルずつ grep 後。

各 iOS フェーズ後に `CFBundleVersion` を上げ、backend 依存を含む出荷では atender-api を先にデプロイ (CLAUDE.md 手順)。

---

# 不採用案

- **案B: 完全対称双方向 + version コンフリクト解決** — 却下。両ソースが同時に真だと、同一予定の同時編集で LWW/マージ/tombstone/vector-clock が必要になり、EventKit のバックグラウンド配信不在 (前面化 diff 前提) と噛み合わず ping-pong が増える。要件2「シンプルカレンダー」は案A (EK 主 + Atender 発だけ push) で満たせる。案A の弱点 (EK が常に勝つので Atender 側の後編集が EK 未反映だと負ける) は「Atender 編集は必ず EK にも書く」で消える。
- **backend の Google カレンダー機構を撤去** — 却下 (要件)。Web は Google 連携を継続。iOS が呼ばなくなるだけ。schema の `GoogleCalendar*` は温存。
- **EK 生イベントに直接 backend でルール適用する `mapEventKitEvent` を backend に置く** — 却下。EK→PersonalEvent→(投影)→RoomEvent の 2 段にし、マスクは投影段の `applyTitleRules` に一本化。生 EK を backend に送らない (PersonalEvent がミラー)。engine 二重呼び出しを避ける。
- **`ekExternalId` に DB unique 制約** — 却下。同一 DB 内で重複しうる (複数取込/共有招待、library note) ため unique にすると取込が 500。複合キー `(userId, ekExternalId, date)` をアプリ層照合。
- **`eventIdentifier` を永続キーに使う** — 却下。カレンダー移動/sync で揮発 (library note)。`calendarItemExternalIdentifier` を永続キー、`eventIdentifier` は「今の再フェッチ」限定。
- **PersonalCalendar の月のみ化で `CalendarWeek/Day/Lane/Segmented` を削除** — 却下。RoomDetailView が使用中 (grep 実測)。呼び出しを外すだけ。削除すると `CalendarLaneTests` 等が孤児破壊 (共有部品の教訓)。
- **personal だけ full-bleed・room は card 維持 (旧推奨 (a))** — 却下 (G4=(b) 裁定)。Touri は月カレンダー全体の full-bleed 統一を採択。personal/room で見た目が割れる (a) より、視覚言語統一の (b) を採る。共有部品の見た目規則は全 caller に流す (DESIGN.md §40「見た目の規則は全 caller」)。room の**レイアウト差** (page margin を負マージンで打ち消す) だけ §F4.2 で個別に吸収する。
- **`chrome` prop を残し `.card` variant も残置** — 却下寄り。`.card` を使う caller が消えるため、未使用 variant を残さない (将来必要になるまで増やさない)。room のレイアウト差は負マージンで吸収でき、variant 分岐は不要。ただし実装上 prop を残して既定 `.fullBleed` にするのは可 (§G4)。
- **Web の gcal 設定 UI を iOS に移植** — 却下。iOS には gcal 同期 UI が元々無く (G3)、EventKit がその役割を置換する。移植する UI が存在しない。
- **マスクを個別イベント手動 + カテゴリマッピングで MVP** — 却下 (G2)。共有単位 `visibilityMode` + 既存 per-user ルールで MVP。手動マスクは post-MVP。
