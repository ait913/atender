# EventKit 書き出し再設計 — 専用「Atender」カレンダー + 授業/個人予定の一方向エクスポート

> 対象 PJ: atender (`apps/ios` 中心 / `apps/api` / `packages/shared`)。UI 正典: `DESIGN.md`。
> **前提 doc: `.designs/20260729-personal-calendar-rebuild.md` (以下 **D2**)。本 doc は D2 の着地後に実装する。D2 が確定させたモデル (`PersonalEvent` の `start`/`end` instant + `recurrenceRule` + `PersonalEventOverride`) と API (`GET /api/personal-events?from&to` → `PersonalEventOccurrenceDto[]`) を前提とする。**
> 置換する doc: `.designs/20260723-calendar-eventkit-sync-and-redesign.md` (§14 参照)。
> 参照: `Muraki/knowledge/library/eventkit-ios17-access-and-sync-identifiers.md`, `Muraki/knowledge/library/eventkit-recurrence-model.md`。
> 出荷単位: **build 12 で 1 回** (D2 と同一ビルド)。`CFBundleVersion` / `MIN_IOS_BUILD` の 12 への引き上げは D2 が担当し、本 doc では触らない。

---

## 0. 前提 — Touri 確定事項 (本 doc は覆さない)

| # | 決定 |
|---|---|
| T1 | **専用「Atender」カレンダーを自動生成し、そこを書き込み先にする** (シフトボード方式) |
| T2 | **書き出す対象は 授業 + 個人予定の両方**。Atender で作ったものは全部 Atender カレンダーに入る |
| T3 | **通知/リマインダー (EKAlarm) は対象外** |
| T4 | **`MIN_IOS_BUILD` は 12**。build 11 との互換は考えない |
| T5 | 出荷は build 12 で 1 回にまとめる (D2 と同じビルド) |

## 0.1 スコープ境界 (D2 との分担)

| 区分 | 対象 |
|---|---|
| **本 doc 専属** | `apps/ios/Atender/Core/Sync/*` 全部。`Features/Settings/CalendarSyncSettingsSheet.swift`。`App/RootView.swift` の同期トリガ。`apps/api/src/routes/occurrences.ts` / `services/occurrence.service.ts` (新規)。`packages/shared/src/schemas/attendance.ts` の range 系追加 |
| **D2 専属 (本 doc は D2 適用後の状態を前提に差分だけ書く)** | `Features/Calendar/PersonalCalendar.swift` / `PersonalDaySheet.swift` / `PersonalEventEditor.swift`、`PersonalEvent` のモデル・API・migration、`Core/Models/DTOs.swift` の PersonalEvent 系 |
| **両方が触るファイル (実装順で衝突回避)** | `Core/Models/DTOs.swift` (D2 → 本 doc の順)、`Core/Networking/APIEndpoint.swift` (同)、`Features/Calendar/PersonalCalendar.swift` (D2 が全面改修 → 本 doc が §7.2 のバナー 1 ブロックと同期呼び出し 1 行を足す)、`packages/shared/src/schemas/personalEvent.ts` (D2 → 本 doc の §12 差分) |
| **触らない** | `RoomEvent` 系全部、Google カレンダー連携、ICS import、出欠・時間割・学期のモデル、`apps/web` (Web には EventKit が無い。本 doc は Web を一切変更しない) |

---

## 1. 目的

1. **「書き出し同期ができていない」を構造的に潰す** — 現状は (a) 読み込み設定が書き出しのゲートを兼ねている、(b) 書き出しを起動する UI 導線が存在しない、(c) 全エラーが無言、の 3 点で**ほぼ確実に何も起きない**。ゲート・導線・可視化を作り直す。
2. **専用「Atender」カレンダーを自動生成し、そこだけに書き出す** (T1)。ユーザーの既存カレンダーを汚さず、Atender 側の全削除も安全にできる。
3. **授業 (科目の予定) を初めて EventKit に書き出す** (T2)。授業は現在 EK に一度も書かれていない = 新規実装。

---

## 2. ★ 現状の壊れ方 (この設計が直すもの。doc 完成時点の main = `66b893a` で再確認済)

| # | 事実 | 実測 |
|---|---|---|
| B1 | **読み込み設定が書き出しのゲートを兼ねている** | `CalendarSyncCoordinator.swift:56` `guard !linkedCalendarIds.isEmpty else { return }`。`linkedCalendarIds` は設定シートの「表示するカレンダー」トグル (`CalendarSyncSettingsSheet.swift:61-67`) で既定 空。**読み込みトグルを 1 つも ON にしないと書き出しも丸ごと走らない** |
| B2 | **書き出しを起動する UI 導線が存在しない** | `pushManualEvent` の唯一の呼び出し元は `PersonalCalendar.swift:168`。それを開く `isAddingPersonalEvent` (`:95` 宣言 / `:172` バインド) を `true` にする箇所がリポジトリ内 **0 件**。原因コミット `6533e21` (build 11)。※導線復活は D2 (B1) の担当、本 doc は「保存後に書き出しが走る」配線だけを担う |
| B3 | **エラーが 100% 不可視** | silent return が `CalendarSyncCoordinator.swift:55,56,78,80` / `EventKitService.swift:51,59,64,67`。`lastError` (`Coordinator:12`) / `isSyncing` (`:13`) を読む View がリポジトリ内 **0 件**。`requestFullAccess()` の catch (`EventKitService.swift:42-45`) はエラーを捨てる |
| B4 | **編集・削除が EK に伝播しない** | `EventKitService.updateEvent` (`:98`) / `deleteEvent` (`:105`) は call site **0 の死にコード** |
| B5 | **書き込み先が読み込み対象にも入ると二重行になる** | push した EK イベントが次の sync で読み戻され、`reconcileEventKit` が `source:"EVENTKIT"` のみで照合するため MANUAL 行と結び付かず EVENTKIT ミラーを新規 create する。既定設定 (書き込み先 = `defaultCalendarForNewEvents`、読み込み = 同じカレンダーを ON) で普通に踏む |
| B6 | **マスターの ON/OFF スイッチが無い** | 永続キーは `atender.eventkit.linkedCalendarIds` / `atender.eventkit.writeTargetCalendarId` の 2 つだけ (`CalendarSyncCoordinator.swift:103-106`) |
| B7 | **権限要求の導線が「設定 > iPhone のカレンダー」しか無い** | `SettingsView.swift:32-33` (行) / `:67` (シート)。オンボーディングも予定作成時の誘導も無く、設定を開かない限り `.notDetermined` = 全同期が無言 no-op |
| B8 | **書き込みが MainActor 上で行われる** | `EventKitService` は `@MainActor`。授業を学期ぶん書くと数百件の `store.save` が主スレッドを占有し UI が固まる |

---

## 3. ★ 中心論点の裁定 — Atender カレンダーは「書き出し専用」にする

**採択: Atender カレンダーは一方向 (Atender → EK) の書き出し専用。読み込み (EK → Atender) の対象から構造的に除外する。**

| 方向 | 対象 | 正典 |
|---|---|---|
| **書き出し (export)** | Atender の 授業 + 個人予定 (`source=MANUAL`) → **Atender カレンダーのみ** | **Atender (backend)** |
| **読み込み (import)** | ユーザーが選んだ**それ以外の**カレンダー → `PersonalEvent(source=EVENTKIT)` ミラー | **EK** |

除外の担保は 2 層:
1. `availableCalendars()` が Atender カレンダーを一覧から**除く** → 設定 UI にトグルが出ない。
2. `fetchSnapshots(range:calendarIds:)` が要求集合から Atender カレンダー id を**引き算**する → 設定が壊れていても読まない。

これで B5 (二重行) が構造的に消える。「Atender が書いたものを Atender が読み戻す」経路が存在しなくなる。

**この裁定の帰結 (受容するトレードオフ)**:
- ユーザーが標準カレンダー App で Atender カレンダー内の予定を編集しても、次の書き出しで**元に戻る** (Atender が正典)。標準 App での編集は Atender に伝わらない。
- 逆に「iPhone で予定を作って Atender に取り込む」は、Atender カレンダー**以外**のカレンダーを読み込み対象に選ぶことで従来どおりできる。
- ユーザーが Atender カレンダー内に手で作った予定は、**削除しない** (§5.4 の foreign 判定)。上書きも削除もせず放置する。

選択肢と却下理由は §15。

---

## 4. データモデル

### 4.1 EK 側に置く識別子 — `EKEvent.url`

Atender が書いた 1 イベントは `EKEvent.url` に自分の識別子を持つ。**これが唯一の同定キーであり、対応表をアプリ側にも backend 側にも持たない。**

```
atender://m/<meetingId>/<yyyyMMdd>/<firstPeriodOffset>     授業ブロック 1 個
atender://p/<seriesId>/<yyyyMMdd'T'HHmmss'Z'>              個人予定 occurrence 1 個
```

`ExportKey` = この URL の `absoluteString`。

**なぜ対応表を持たないか**: 対応表は「アプリ側の記録」と「EK の実体」が食い違いうる (ユーザーが標準 App で 1 件消す / アプリ再インストールで UserDefaults が飛ぶ)。食い違うと孤児が消せず重複が増える。**状態を成果物そのものに書いておけば、毎回 EK を読むだけで真の状態が分かる** (`Muraki/knowledge/role/architect.md` の「相手側に依存せず自分側を頑健にする」の再適用)。

- `calendarItemExternalIdentifier` を鍵にしない理由: 繰り返しの全 occurrence で同値になる (library note) + 我々の意味 (どの授業のどの日か) を持たない。
- `eventIdentifier` を永続保存しない理由: カレンダー移動/sync で揮発する (library note)。**同一 export 実行の内側でだけ** ハンドルとして使う。
- `notes` に埋め込まない理由: ユーザーに見える本文を汚す。`url` は詳細画面の 1 行に収まる。

**`url` が保存されない環境への備え**: 初回書き出し (= 書き出し前に owned が 0 件で、かつ create が 1 件以上あった実行) の直後にだけ、同じ窓を再取得して owned が 1 件以上あるかを検証する。0 件なら `identityUnavailable` エラーを立てて**書き出しを止める** (壊れたまま書き続けて重複を量産しない)。判定は純関数 `CalendarExportPlanner.shouldVerifyIdentity(plan:existingOwnedCount:)`。

### 4.2 永続設定 (UserDefaults)

| キー | 型 | 既定 | 意味 |
|---|---|---|---|
| `atender.eventkit.exportEnabled` | `Bool` | **`true`** | 書き出しマスタースイッチ |
| `atender.eventkit.exportCourses` | `Bool` | `true` | 授業を書き出す |
| `atender.eventkit.exportPersonal` | `Bool` | `true` | 個人予定を書き出す |
| `atender.eventkit.atenderCalendarId` | `String?` | `nil` | 解決済み Atender カレンダーの `calendarIdentifier` (キャッシュ) |
| `atender.eventkit.linkedCalendarIds` | `[String]` | `[]` | **読み込み**対象。既存キーを意味そのままで継続 |
| `atender.eventkit.promptDismissed` | `Bool` | `false` | カレンダー画面の権限バナーを × で閉じたか |
| `atender.eventkit.legacyPushCleanupDone` | `Bool` | `false` | build 11 以前の push 済みイベントの掃除が完了したか |
| ~~`atender.eventkit.writeTargetCalendarId`~~ | — | — | **廃止**。`CalendarSyncCoordinator.init` で `removeObject(forKey:)` する (冪等) |

> キー文字列を grep 実測: `"atender.eventkit"` を含む宣言はリポジトリ内 **2 箇所のみ** (`CalendarSyncCoordinator.swift:104,105`)。テスト・UI テストにも重複宣言は無いので、キーの追加/廃止は同ファイルの `Keys` enum を直すだけで完結する。

`exportEnabled` の既定を `true` にするのは T1 (「デフォルトは Atender カレンダーを作ってそこに入れる」) のため。ただし **書き出しが実際に走るのは `access == .fullAccess` のときだけ**なので、既定 ON でも権限付与という明示的な同意の前には何も起きない。

### 4.3 iOS 側の型 (すべて `Core/Sync/` に置く。EventKit を import しない = 純ロジック)

```swift
// CalendarSyncStatus.swift
enum EventKitAccess: String, Equatable, Sendable {
    case notDetermined, denied, restricted, writeOnly, fullAccess
}

enum CalendarSyncError: Equatable, Error, Sendable {
    case accessNotDetermined
    case accessDenied
    case accessRestricted
    case accessWriteOnly
    case noWritableSource
    case calendarCreateFailed(String)     // EKError の localizedDescription 逐語
    case calendarReadOnly
    case calendarLookupTransient          // fullAccess なのにカレンダー 0 件 (ソース未ロード)
    case identityUnavailable              // §4.1 の read-back 検証に失敗
    case applyFailed(String)
    case network(String)

    var message: String { get }           // §7.4 の表が正典
    var recovery: CalendarSyncRecovery { get }
}

enum CalendarSyncRecovery: Equatable, Sendable {
    case none                 // ボタンを出さない
    case requestAccess        // 「許可する」→ requestFullAccess()
    case openSystemSettings   // 「設定を開く」→ UIApplication.openSettingsURLString
    case retry                // 「もう一度」→ sync(trigger: .manual)
}

struct ExportSummary: Equatable, Sendable {
    var created: Int = 0
    var updated: Int = 0
    var deleted: Int = 0
    var unchanged: Int = 0
    var foreign: Int = 0      // Atender カレンダー内にある「我々が書いていない」イベント数
}

enum CalendarSyncPhase: Equatable, Sendable { case idle, running, succeeded, failed }

struct CalendarSyncStatus: Equatable, Sendable {
    var phase: CalendarSyncPhase = .idle
    var access: EventKitAccess = .notDetermined
    var lastSuccessAt: Date? = nil
    var lastSummary: ExportSummary? = nil
    var lastError: CalendarSyncError? = nil
    var calendarTitle: String? = nil       // 解決済みカレンダーの表示名 (title + source)
}
```

```swift
// ExportKey.swift
enum ExportKind: String, Equatable, Sendable { case meeting = "m", personal = "p" }

enum ExportKey {
    static let scheme = "atender"
    static func meeting(meetingId: String, date: String, firstPeriodOffset: Int) -> String
    static func personal(seriesId: String, occurrenceDate: Date) -> String   // ISO8601 basic UTC
    static func kind(of key: String) -> ExportKind?      // 我々の書いたものでなければ nil
    static func isOwned(_ urlString: String?) -> Bool
}
```

```swift
// CalendarExportPlanner.swift
struct ExportItem: Equatable, Sendable {
    let key: String
    let title: String
    let start: Date
    let end: Date
    let isAllDay: Bool
    let location: String?
    let notes: String?
}

struct ExportedEvent: Equatable, Sendable {   // EK から読んだ既存イベントの値だけを持つ (EKEvent は持ち出さない)
    let key: String?                 // url.absoluteString。我々のものでなければ nil
    let eventIdentifier: String
    let title: String
    let start: Date
    let end: Date
    let isAllDay: Bool
    let location: String?
    let notes: String?
}

struct ExportUpdate: Equatable, Sendable { let item: ExportItem; let eventIdentifier: String }

struct ExportPlan: Equatable, Sendable {
    var creates: [ExportItem] = []
    var updates: [ExportUpdate] = []
    var deletes: [String] = []       // eventIdentifier
    var unchanged: Int = 0
    var foreign: Int = 0
}
```

```swift
// CalendarSyncCoordinator.swift
enum SyncTrigger: Equatable, Sendable {
    case appLaunch, foreground, storeChanged, permissionGranted, calendarScreen, dataChanged, manual
    var bypassesThrottle: Bool { self == .appLaunch || self == .permissionGranted || self == .manual }
}

struct ExportWindow: Equatable, Sendable {
    let from: String    // "yyyy-MM-dd" JST・含む
    let to: String      // "yyyy-MM-dd" JST・含む
    static func around(today: String) -> ExportWindow   // from = today-31日, to = today+334日
}
```

### 4.4 backend 側 (新規 DTO)

`packages/shared/src/schemas/attendance.ts` に **additive** で追加:

```ts
export const OccurrenceRangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const OccurrenceRangeDto = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasActiveTimetable: z.boolean(),
  occurrences: z.array(OccurrenceDto),
  courseSuspensions: z.array(CourseSuspensionDto),      // ← course.js から import
  timetableSuspensions: z.array(TimetableSuspensionDto), // ← timetableSuspension.js から import
});
export type OccurrenceRangeQuery = z.infer<typeof OccurrenceRangeQuery>;
export type OccurrenceRangeDto = z.infer<typeof OccurrenceRangeDto>;
```

> `hasActiveTimetable` は**書き出しの安全弁**である。`false` のときクライアントは「授業の desired が不明」と解釈し、`m:` の削除掃除を**行わない** (§5.4)。これが無いと、時間割を一時的に持たない状態で sync が走ったときに書き出し済みの授業を全消しする。

`packages/shared/src/schemas/personalEvent.ts` に追加 (D2 適用後のファイルに対して):

```ts
export const LegacyEkPushListDto  = z.object({ externalIds: z.array(z.string()) });
export const LegacyEkPushClearInput = z.object({ externalIds: z.array(z.string()).max(2000) });
export const LegacyEkPushClearDto  = z.object({ clearedCount: z.number().int() });
```

---

## 5. アルゴリズム (すべて純関数。EKEventStore に触れない)

### 5.1 カレンダー解決 `AtenderCalendarResolver`

```swift
// AtenderCalendarSpec.swift — 文字列/色の正典はここ 1 個
enum AtenderCalendarSpec {
    static let title = "Atender"        // ローカライズしない (言語を変えると title 探索が壊れるため)
    static let colorHex = "#1E96E6"     // Color.accent500 の light 値。EKCalendar の色は dark 変種を持てない
}

// AtenderCalendarResolver.swift
enum EKSourceKind: String, Equatable, Sendable { case local, exchange, calDAV, mobileMe, subscribed, birthdays, other }

struct EKSourceSnapshot: Equatable, Sendable { let id: String; let title: String; let kind: EKSourceKind }

struct EKCalendarSnapshot: Equatable, Sendable {
    let id: String
    let title: String
    let sourceId: String
    let sourceTitle: String
    let colorHex: String?
    let allowsModify: Bool
    let allowsEvents: Bool          // allowedEntityTypes に .event を含むか
}

enum CalendarResolution: Equatable, Sendable {
    case use(String)                        // calendarIdentifier
    case createNew(sourceId: String)
    case unavailable(CalendarSyncError)
}

enum AtenderCalendarResolver {
    static func resolve(
        storedId: String?,
        calendars: [EKCalendarSnapshot],
        sources: [EKSourceSnapshot],
        defaultCalendarSourceId: String?,
        allowCreate: Bool
    ) -> CalendarResolution

    static func writableSourceId(
        sources: [EKSourceSnapshot],
        defaultCalendarSourceId: String?
    ) -> String?
}
```

**`resolve` の規則 (この順に評価する)**:

1. `calendars` が**空** → `.unavailable(.calendarLookupTransient)`。
   ★ fullAccess で 1 件も返らないのはソース未ロードの過渡状態なので、**ここで作ってはいけない** (作ると次回に重複する)。
2. `storedId` が非 nil で、`calendars` にその id があり `allowsEvents && allowsModify` → `.use(storedId)`。
3. `calendars` から `title == AtenderCalendarSpec.title && allowsEvents && allowsModify` を抽出 (完全一致・大小区別あり・前後空白は trim しない)。
   - 1 件以上 → 次の順で 1 件に決める: (a) `sourceId == defaultCalendarSourceId` のもの、(b) それが無ければ `id` の昇順で先頭。→ `.use(選ばれた id)`。
4. `allowCreate == false` → `.unavailable(.calendarLookupTransient)`。
5. `writableSourceId(...)` が nil → `.unavailable(.noWritableSource)`。
6. それ以外 → `.createNew(sourceId: 取得した source id)`。

**`writableSourceId` の規則**:
1. `defaultCalendarSourceId` が非 nil で、`sources` に存在し、その `kind` が `.subscribed` / `.birthdays` **でない** → それを返す。
2. `sources` から `kind == .calDAV` の先頭 (`id` 昇順) → 返す。
3. `sources` から `kind == .mobileMe` の先頭 → 返す。
4. `sources` から `kind == .local` の先頭 → 返す。
5. nil。

> `kind == .local` を第一候補にしないのは TN QA1926 の実測: リモートアカウント (iCloud 等) が有効だと**空のローカルカレンダーは標準カレンダー App に表示されない**。「作ったのに出てこない」になるので、`defaultCalendarForNewEvents?.source` を最優先にする (library note)。
> `title` で iCloud を判定しない (title はユーザーが変更できる)。

**再作成が暴発しない条件 (明示)**:
- `.createNew` を返すのは「id 一致も title 一致も無い」かつ「カレンダーが 1 件以上見えている」かつ `allowCreate == true` のときだけ。
- `allowCreate: true` を渡すのは **export 実行パスのみ**。`availableCalendars()` (設定 UI の一覧構築) と import パスは常に `allowCreate: false`。
- 作成 API が throw したら、**同一アプリ起動中は二度と作成を試みない** (`CalendarSyncCoordinator` の `didFailCreateThisSession: Bool`)。`.manual` トリガ (ユーザーが「今すぐ書き出す」を押す) のときだけこのフラグを解除する。
- 作成に成功したら `atenderCalendarId` を即保存する。
- ★ 解決された id が保存済み id と**異なった**とき (= ユーザーが標準 App で消して作り直された / フルシンクで id が変わった) は、`atenderCalendarId` を新しい値で上書きするだけでよい。対応表を持たない設計 (§4.1) なので、失われた EK イベントは次の diff で自然に create し直される。

### 5.2 授業 → `ExportItem` (`CourseExportMapping`)

入力は `OccurrenceRangeDto`。

```swift
enum CourseExportMapping {
    static func items(
        occurrences: [OccurrenceDto],
        courseSuspensions: [CourseSuspensionDto],
        timetableSuspensions: [TimetableSuspensionDto]
    ) -> [ExportItem]
}
```

**規則**:

1. **除外 (これらの occurrence は書き出さない)**:
   - `timetableSuspensions` に同じ `date` がある (時間割全体の休講)。
   - `courseSuspensions` に `(courseId, date)` が一致するものがある (科目単位の休講)。
   - `occurrence.status == .cancelled` (出欠ステータスの休講)。
   - `occurrence.endMinute <= occurrence.startMinute` (壊れた行)。
2. **連コマの結合**: 残った occurrence を `(meetingId, date)` でグループ化し、各グループの `periodIndex` 集合に `PeriodGrouping.groupPeriods(_:)` (`TimetableLogic.swift:327`、`enum PeriodGrouping` は `:321-363`、既存・無改変) をかけて**連続する run** に割る。1 run = 1 `ExportItem`。
   - `start` = run 内の最小 `startMinute` を JST 当日 00:00 に足した絶対時刻。
   - `end` = run 内の最大 `endMinute` を同様に足した絶対時刻。
   - 休み時間 (コマ間の空き) は結合後の区間に**含まれる** (時間割グリッドの見え方と一致)。
   - `firstPeriodOffset` = run 内の最小 `periodOffset`。
3. **フィールド**:
   - `key` = `ExportKey.meeting(meetingId:date:firstPeriodOffset:)`
   - `title` = `courseName` (そのまま。「1限」等を混ぜない)
   - `location` = `room` (空文字は nil に正規化)
   - `notes` = 次の行を `"\n"` で連結:
     - 期の表記: run が 1 コマなら `"\(periodIndex)限"`、2 コマ以上なら `"\(最小periodIndex)-\(最大periodIndex)限"`
     - `teacher` が非 nil/非空なら `"担当: \(teacher)"`
   - `isAllDay` = `false`
4. **並び**: `start` 昇順 → `key` 昇順で安定ソート。

**欠席 (`.absent` 等) は除外しない・印も付けない。** 授業はその時間に実在したので、カレンダーからは消さない。EK 側は「予定表」であって出欠簿ではないので、タイトルに ✗ 等を付けると標準 App の検索・共有に意味不明な文字列が混ざる。

### 5.3 個人予定 → `ExportItem` (`PersonalExportMapping`)

入力は D2 の `[PersonalEventOccurrenceDto]` (= `GET /api/personal-events?from&to` の返り、override 適用済・取り消し済 occurrence は既に除かれている)。

```swift
enum PersonalExportMapping {
    static func items(occurrences: [PersonalEventOccurrenceDto]) -> [ExportItem]
}
```

**規則**:
1. `occurrence.source != "MANUAL"` は**除外**する。
   ★ `EVENTKIT` ミラーを書き戻すと、ユーザーの元カレンダーにある予定が Atender カレンダーにも二重に出る。
2. `key` = `ExportKey.personal(seriesId: occurrence.seriesId, occurrenceDate: <occurrenceDate を parse した Date>)`
3. `title` = `occurrence.title` (空文字なら `"予定"`)
4. `isAllDay` = `occurrence.isAllDay`
5. `start` = `occurrence.start` を parse した Date (D2 の instant、override 適用後)
6. `end`:
   - `isAllDay == false` → `occurrence.end` を parse した Date。
   - `isAllDay == true` → **`occurrence.end - 1 秒`**。
     > D2 の終日 `end` は「最終日の翌日 JST 00:00 (排他)」。EventKit の終日 `endDate` は**包含解釈と排他解釈のどちらとも取れる**ため、どちらの解釈でも最終日が変わらない `最終日 23:59:59` を書く (`Muraki/knowledge/role/architect.md` の「相手の解釈に依存せず自分側を頑健にする」)。単日終日なら start = 当日 00:00 / end = 当日 23:59:59。
7. `location` = `occurrence.location` (空文字は nil)
8. `notes` = `occurrence.note` (空文字は nil)
9. **繰り返しは `EKRecurrenceRule` にしない。展開済みの occurrence を 1 件 1 EKEvent として書く** (§12 の D2 差分 A、理由は §15)。
10. 並び: `start` 昇順 → `key` 昇順。

**`start` / `end` の parse は ISO8601 文字列 → `Date` の 1 手順だけ。クライアントは日付演算 (JST 暦の日割り) を一切しない** (D2 の方針を踏襲)。

### 5.4 差分 `CalendarExportPlanner.plan`

```swift
enum CalendarExportPlanner {
    static func plan(
        desired: [ExportItem],
        existing: [ExportedEvent],
        prunableKinds: Set<ExportKind>
    ) -> ExportPlan

    static func isSame(_ item: ExportItem, _ existing: ExportedEvent) -> Bool
    static func normalizedText(_ value: String?) -> String?
    static func shouldVerifyIdentity(plan: ExportPlan, existingOwnedCount: Int) -> Bool
}
```

**`plan` の規則**:
1. `existing` を 3 分割する。
   - **foreign**: `ExportKey.kind(of: key)` が nil (= `url` が我々のものでない、または `url` が無い)。→ **一切触らない**。`plan.foreign` に件数だけ記録。
   - **owned**: `key` が我々のもの。
   - **重複**: 同じ `key` が owned に 2 件以上 → `eventIdentifier` 昇順で先頭だけを残し、残りを `deletes` に入れる (過去の不具合や手動コピーの自己修復)。
2. `desired` の各 item について:
   - owned に同じ `key` がある → `isSame` が `true` なら `unchanged += 1`、`false` なら `updates` に `ExportUpdate(item, eventIdentifier)`。
   - 無ければ `creates` に追加。
3. owned にあって `desired` に無い `key` について:
   - `ExportKey.kind(of: key)` が `prunableKinds` に**含まれるときだけ** `deletes` に入れる。
   - 含まれないときは何もしない (= 情報が不完全なので消さない)。
4. `creates` / `updates` / `deletes` は入力順 (= `desired` 順、`existing` 順) を保つ = 決定的。

**`prunableKinds` の決め方 (呼び出し側で確定する)**:

| 条件 | `prunableKinds` |
|---|---|
| 授業データの取得に成功し `hasActiveTimetable == true` | `.meeting` を含める |
| 授業データの取得に成功したが `hasActiveTimetable == false` | `.meeting` を**含めない** |
| `exportCourses == false` | `.meeting` を含める (= 書き出し済みの授業を消す。これがトグル OFF の意味) |
| 個人予定の取得に成功 | `.personal` を含める |
| `exportPersonal == false` | `.personal` を含める |
| いずれかの取得が throw | **export 自体を中止** (plan を作らない)。`status.lastError = .network(...)` |

**`isSame` の規則** (これが正典。`ExportItem` と `ExportedEvent` の `==` を使わない):
1. `item.isAllDay != existing.isAllDay` → `false`。
2. `item.title != existing.title` → `false`。
3. `normalizedText(item.location) != normalizedText(existing.location)` → `false`。
4. `normalizedText(item.notes) != normalizedText(existing.notes)` → `false`。
5. 時刻:
   - `isAllDay == false`: `floor(start.timeIntervalSince1970)` と `floor(end.timeIntervalSince1970)` が両方一致すること。
   - `isAllDay == true`: `SchoolClock.todayString(start)` が一致し、かつ `SchoolClock.todayString(end - 1秒)` が一致すること。
     > EK が終日の `endDate` を「翌 00:00」で返しても「23:59:59」で返しても同じ最終日になるので、**毎回 update が走り続ける無限チャーン**を構造的に防げる。
6. 全部通れば `true`。

**`normalizedText`**: `trimmingCharacters(in: .whitespacesAndNewlines)` して空なら `nil`、それ以外はその値。
> EK は未設定の `location` / `notes` に `""` を返すことがある。正規化しないと「nil vs ""」で毎回 update が走る。

**`shouldVerifyIdentity`**: `existingOwnedCount == 0 && plan.creates.count > 0` のとき `true`。

### 5.5 トリガとスロットル `CalendarSyncTrigger`

```swift
enum CalendarSyncTrigger {
    static let throttle: TimeInterval = 15
    static let selfWriteQuietPeriod: TimeInterval = 3
    static let storeChangedDebounce: TimeInterval = 1

    static func shouldRun(
        trigger: SyncTrigger,
        now: Date,
        lastRunAt: Date?,
        lastSelfWriteAt: Date?,
        isRunning: Bool
    ) -> Bool

    static let watchedPrefixes: [QueryKey]
    static func isDataChange(_ invalidated: [QueryKey]) -> Bool
}
```

**`shouldRun` の規則 (この順)**:
1. `isRunning == true` → `false` (再入禁止)。
2. `trigger == .storeChanged` かつ `lastSelfWriteAt` があり `now - lastSelfWriteAt < selfWriteQuietPeriod` → `false`
   (自分の `commit()` が `EKEventStoreChanged` を発火させるので、その反響を無視する)。
3. `trigger.bypassesThrottle == true` → `true`。
4. `lastRunAt` が nil → `true`。
5. `now - lastRunAt >= throttle` → `true`、それ以外 `false`。

**トリガ一覧 (これが「発火点が 4 つしかない」問題への回答)**:

| # | トリガ | 配線先 | throttle |
|---|---|---|---|
| TR-1 | アプリ起動 (ログイン済 + セットアップ完了) | `RootView` の `.task(id:)` (§7.5) | 無視 |
| TR-2 | 前面化 | `UIApplication.willEnterForegroundNotification` | 従う |
| TR-3 | `EKEventStoreChanged` | `NotificationCenter` (1 秒 debounce) | 従う + 自書き込み後 3 秒は無視 |
| TR-4 | 権限付与直後 | `requestFullAccess()` の返り後 | 無視 |
| TR-5 | カレンダー画面表示 | `PersonalCalendar` の `.task` | 従う |
| TR-6 | Atender 側データ変更 | `QueryClient.onInvalidate` フック (§7.6) | 従う |
| TR-7 | 「今すぐ書き出す」 | 設定シートのボタン | 無視 |

`watchedPrefixes` (キーの実体は `QueryKey.swift:22-33` で確認済) =
```swift
[ QueryKey(["personal-events"]),        // .personalEvents()
  QueryKey(["user-timetables"]),        // .userTimetables()
  QueryKey(["timetable-suspensions"]),  // .timetableSuspensions()
  QueryKey(["semesters"]),              // .semesters() / .semesterOverview(_:) の両方を覆う
  QueryKey(["courses"]) ]               // .courseSuspensions(id) = ["courses", id, "suspensions"]
```
`isDataChange(invalidated:)` = `invalidated` のいずれかの `k` について `k.hasPrefix(p)` を満たす `p` が `watchedPrefixes` にあること (`QueryKey.hasPrefix` は `QueryKey.swift:14`、既存・無改変)。
> `.dayPrefix()` を入れないのは、出欠タップのたびに 2 本の API 往復が走るのを避けるため。休講操作は `["courses",...]` / `["timetable-suspensions"]` / `["semesters"]` を必ず invalidate するので取りこぼさない。

---

## 6. API / 関数シグネチャ

### 6.1 backend: 授業 occurrence の範囲取得 (新規)

```
GET /api/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD  → OccurrenceRangeDto
```

`apps/api/src/routes/occurrences.ts` (新規):
```ts
export function registerOccurrenceRoutes(app: Hono): void
```
- `sessionMiddleware` を通す (`setupGuard` は**付けない** — セットアップ未完了でも 400 にせず空で返す方が同期側が単純)。
- `to < from` → 400 `VALIDATION_ERROR`。
- `to - from > 366 日` → 400 `RANGE_TOO_LARGE`。

`apps/api/src/services/occurrence.service.ts` (新規):
```ts
export function occurrenceDto(occurrence: OccurrenceRow): OccurrenceDto;   // dayDetail.service.ts:9-36 から移設 (振る舞い不変)
export async function listOccurrenceRange(args: {
  userId: string; from: string; to: string;
}): Promise<OccurrenceRangeDto>;
```
- `findActiveUserTimetable(userId)` が null → `{ from, to, hasActiveTimetable: false, occurrences: [], courseSuspensions: [], timetableSuspensions: [] }`。
- 非 null → `hasActiveTimetable: true` とし、
  - `meetingOccurrence.findMany({ where: { date: { gte: fromStart, lte: toEnd }, meeting: { userTimetableId } }, orderBy: [{ date: "asc" }, { startMinute: "asc" }], include: { meeting: true, course: true, attendanceRecord: true } })`
  - `courseSuspension.findMany({ where: { date: { gte: fromStart, lte: toEnd }, course: { userTimetableId } }, orderBy: { date: "asc" } })`
  - `timetableSuspension.findMany({ where: { userTimetableId, date: { gte: fromStart, lte: toEnd } }, orderBy: { date: "asc" } })`
  - 日境界は `dateStringToJstDay(from).startOfDay` / `dateStringToJstDay(to).endOfDay` (`lib/tz.ts:21`)。

`apps/api/src/services/dayDetail.service.ts` — 自前の `occurrenceDto` (`:9-36`) を削除し `occurrence.service.ts` から import に差し替える (振る舞い不変)。
`apps/api/src/index.ts` — `registerOccurrenceRoutes(app)` を `registerDayRoutes(app)` の隣に追加。

### 6.2 backend: build 11 以前の push 済みイベントの掃除 (新規・一度きり)

```
GET  /api/personal-events/eventkit-legacy-pushes        → LegacyEkPushListDto
POST /api/personal-events/eventkit-legacy-pushes/clear  → LegacyEkPushClearDto
```

`apps/api/src/services/personalEvent.service.ts` に追加:
```ts
export async function listLegacyEkPushes(args: { userId: string }): Promise<{ externalIds: string[] }>;
// where: { userId, source: "MANUAL", ekExternalId: { not: null } } → ekExternalId の配列 (重複除去・昇順)

export async function clearLegacyEkPushes(args: { userId: string; externalIds: string[] }): Promise<{ clearedCount: number }>;
// updateMany({ where: { userId, source: "MANUAL", ekExternalId: { in: externalIds } },
//              data: { ekExternalId: null, ekCalendarId: null } })
```
ルート登録は `/api/personal-events/:id` の**前**に置く (既存の `eventkit-sync` と同じ位置づけ)。

> **なぜ要るか**: build 11 は MANUAL な個人予定をユーザーの既定カレンダーに push し、`ekExternalId` を記録していた。build 12 は同じ予定を Atender カレンダーに書くので、掃除しないと**同じ予定が 2 つのカレンダーに出続ける**。

### 6.3 backend: `reconcileEventKit` の返りから `manualNeedingPush` を落とす

D2 §5.6 の `EventKitSyncResult` を次に変更する (§12 の差分 B):
```ts
export type EventKitSyncResult = { mirrors: PersonalEventSeriesDto[] };
```
`manualNeedingPush` の算出と、それに対応する D2 の挙動仕様 **K9 / K10 を削除**する。

### 6.4 iOS: EK I/O 境界 (`actor` — MainActor から外す)

`Core/Sync/EventKitStore.swift` (新規。既存 `EventKitService.swift` を**削除**して置き換える):

```swift
import EventKit

actor EventKitStore {
    private let store = EKEventStore()

    nonisolated static func currentAccess() -> EventKitAccess      // EKEventStore.authorizationStatus(for:.event) の写像
    func requestFullAccess() async -> EventKitAccess               // requestFullAccessToEvents() / throw は握って現在値を返す
    func refreshSources()

    struct StoreSnapshot: Sendable {
        let calendars: [EKCalendarSnapshot]
        let sources: [EKSourceSnapshot]
        let defaultCalendarSourceId: String?
    }
    func snapshot() -> StoreSnapshot

    func createCalendar(title: String, colorHex: String, sourceId: String) throws -> String   // 戻り: calendarIdentifier
    func fetchExported(calendarId: String, window: DateInterval) -> [ExportedEvent]
    func apply(_ plan: ExportPlan, calendarId: String) throws -> ExportSummary
    func fetchSnapshots(range: DateInterval, calendarIds: Set<String>) -> [EKEventSnapshot]   // 読み込み用 (D2 §6.10 の形)
    func removeEvents(externalIds: [String], excludingCalendarId: String?) -> Int             // legacy 掃除用
    func wipeOwned(calendarId: String, window: DateInterval) throws -> Int                    // owned だけ全削除
}
```

- **`actor` にする理由**: 学期ぶんの授業 (最大でおよそ 400 件) を `save` するので、`@MainActor` のままだと UI が固まる (B8)。`EKEvent` / `EKCalendar` は actor の外へ出さず、`Sendable` な値型 (`ExportedEvent` / `EKCalendarSnapshot`) だけを返す。
- **呼び出し契約**: 全メソッドが `await` を要求する。`currentAccess()` だけ `nonisolated static` で同期に読める。
- `apply` の実装規約:
  - `deletes` → `store.event(withIdentifier:)` で引き、非 nil なら `store.remove(event, span: .thisEvent, commit: false)`。nil なら数えずスキップ。
  - `updates` → `store.event(withIdentifier:)` で引き、`applyFields` して `store.save(event, span: .thisEvent, commit: false)`。nil なら**その item を create にフォールバック**する (実行中に消えた場合)。
  - `creates` → `EKEvent(eventStore: store)` に `applyFields` + `event.calendar = <Atender>` + `store.save(..., commit: false)`。
  - 最後に `try store.commit()`。throw したら `store.reset()` して `CalendarSyncError.applyFailed(逐語)` を投げる。
  - `applyFields(item, to: event)` は `title` / `isAllDay` / `startDate` / `endDate` / `location` / `notes` / `url = URL(string: item.key)` の 7 つだけを書く。**`alarms` は触らない** (T3)。`recurrenceRules` も触らない (常に nil)。
- `fetchExported` は `store.predicateForEvents(withStart: window.start, end: window.end, calendars: [cal])` → `events(matching:)` → `ExportedEvent` へ写像。`key` は `event.url?.absoluteString` が `ExportKey.isOwned` を満たすときだけ入れる。
- `wipeOwned` は `fetchExported` の owned だけを `remove(_:span:.thisEvent, commit:false)` → `commit()`。

`Core/Sync/EventKitService.swift` は**削除**。`EventKitServiceError` も削除 (`CalendarSyncError` に統合)。
`EKCalendarInfo` (View 用) は `Core/Sync/AtenderCalendarResolver.swift` の `EKCalendarSnapshot` に統合し、**型を 1 個にする**。

### 6.5 iOS: オーケストレータ

`Core/Sync/CalendarSyncCoordinator.swift` (全面書き換え):

```swift
@MainActor @Observable final class CalendarSyncCoordinator {
    private(set) var status: CalendarSyncStatus

    var exportEnabled: Bool { get set }      // UserDefaults 4.2
    var exportCourses: Bool { get set }
    var exportPersonal: Bool { get set }
    var linkedCalendarIds: Set<String> { get set }
    var promptDismissed: Bool { get set }

    init(store: EventKitStore, client: APIClient, cache: QueryClient, calendarRepository: CalendarExportRepository)

    func refreshAccess()                                        // status.access を更新するだけ
    func requestFullAccess() async                              // 付与されたら sync(trigger: .permissionGranted)
    func availableCalendars() async -> [EKCalendarSnapshot]     // ★ Atender カレンダーを除いた一覧
    func sync(trigger: SyncTrigger) async                       // 唯一の入口
    func setExportEnabled(_ value: Bool) async                  // false にしたら wipeExport()
    func wipeExport() async                                     // Atender カレンダー内の owned を ±2 年で全削除
    func startObserving()                                       // EKEventStoreChanged / willEnterForeground
}
```

**`sync(trigger:)` の手順 (これが正典)**:

1. `CalendarSyncTrigger.shouldRun(...)` が `false` → 即 return (状態を触らない)。
2. `status.access = EventKitStore.currentAccess()`。
3. `status.access != .fullAccess` → `status.phase = .idle` にし、`lastError` を次で設定して return:
   - `.notDetermined` → `.accessNotDetermined`、`.denied` → `.accessDenied`、`.restricted` → `.accessRestricted`、`.writeOnly` → `.accessWriteOnly`。
   > 書き出し先の再取得ができない write-only では専用カレンダー方式が成立しない (library note 逐語) ので、**write-only を「部分的に動く状態」として扱わない**。
4. `status.phase = .running`。`isRunning = true`。`defer` で `isRunning = false`。
5. `window = ExportWindow.around(today: SchoolClock.todayString())`。
6. **カレンダー解決**: `store.snapshot()` → `AtenderCalendarResolver.resolve(storedId:..., allowCreate: exportEnabled && !didFailCreateThisSession)`。
   - `.use(id)` → `atenderCalendarId = id`、`status.calendarTitle = "<title>（<sourceTitle>）"`。
   - `.createNew(sourceId)` → `store.createCalendar(...)`。成功なら id を保存。throw なら `didFailCreateThisSession = true`、`status.lastError = .calendarCreateFailed(逐語)`、`phase = .failed`、**ここで return せず 8 (読み込み) は続行**する。
   - `.unavailable(err)` → `status.lastError = err`、同様に読み込みだけ続行。
7. **legacy 掃除** (`legacyPushCleanupDone == false` かつ Atender カレンダーが解決できたときだけ、1 回):
   `GET /eventkit-legacy-pushes` → `store.removeEvents(externalIds:excludingCalendarId: <Atender の id>)` → `POST /clear` → 成功したら `legacyPushCleanupDone = true`。どこかで throw したらフラグを立てず次回に再試行 (冪等)。
8. **読み込み (import)**: `linkedCalendarIds` が空でなければ、`ids = linkedCalendarIds.subtracting([atenderCalendarId])` で `store.fetchSnapshots(...)` → `POST /api/personal-events/eventkit-sync` (D2 §5.6)。空なら何もしない。
   ★ ここで `guard` に引っかかっても **9 の書き出しは実行する** (B1 の解体)。
9. **書き出し (export)**: `exportEnabled` かつ Atender カレンダーが解決済みのときだけ:
   1. `desired` を作る。
      - `exportCourses` → `GET /api/occurrences?from&to` → `CourseExportMapping.items(...)`。
      - `exportPersonal` → `GET /api/personal-events?from&to` → `PersonalExportMapping.items(...)`。
      - どちらかが throw → `status.lastError = .network(逐語)`、`phase = .failed`、**plan を作らずに return**。
   2. `existing = await store.fetchExported(calendarId:window:interval)`。
   3. `prunableKinds` を §5.4 の表で決める。
   4. `plan = CalendarExportPlanner.plan(desired:existing:prunableKinds:)`。
   5. `plan` が空 (creates/updates/deletes すべて 0) → 書き込まない。`lastSelfWriteAt` も更新しない。
   6. `summary = try await store.apply(plan, calendarId:)`。`lastSelfWriteAt = .now`。
   7. `CalendarExportPlanner.shouldVerifyIdentity(plan:existingOwnedCount:)` が `true` なら `fetchExported` をもう一度呼び、owned が 0 件なら `status.lastError = .identityUnavailable`、`phase = .failed` にして return。
10. 成功 → `status.phase = .succeeded`、`lastSuccessAt = .now`、`lastSummary = summary`、`lastError = nil`。
11. `cache.invalidate(prefixes: [.personalEvents()])` (読み込みで新しいミラーが入りうるため)。**この invalidate が TR-6 を再帰的に起こさないよう、`isRunning` 中の `onInvalidate` は無視する** (§7.6)。

`Core/Sync/EventKitReconciler.swift` — `pushTargets(manualNeedingPush:recentlyWritten:)` を**削除**し、`uploads(from:)` だけ残す。`ReconcilePlan` 構造体も削除 (使用箇所なし)。
`recentlyWritten` (echo 抑止セット) も削除 — 抑止は `lastSelfWriteAt` の時刻ベースに一本化する。

### 6.6 iOS: リポジトリ / エンドポイント

`Core/Networking/APIEndpoint.swift` の `Endpoints` に追加:
```swift
static func occurrenceRange(from: String, to: String) -> APIEndpoint {
    .init(path: "/api/occurrences", method: .get, query: ["from": from, "to": to]) }
static func legacyEkPushes() -> APIEndpoint {
    .init(path: "/api/personal-events/eventkit-legacy-pushes", method: .get) }
static func clearLegacyEkPushes(_ body: LegacyEkPushClearInput) -> APIEndpoint {
    .init(path: "/api/personal-events/eventkit-legacy-pushes/clear", method: .post, body: body) }
```

`Core/Data/CalendarExportRepository.swift` (新規):
```swift
@MainActor final class CalendarExportRepository {
    init(client: APIClient)
    func occurrenceRange(from: String, to: String) async throws -> OccurrenceRangeResponse
    func legacyEkPushes() async throws -> [String]
    func clearLegacyEkPushes(_ externalIds: [String]) async throws -> Int
}
```
> **`QueryClient` にキャッシュしない**。書き出しは常に最新を読む必要があり、キャッシュすると `QueryKey` と `InvalidationMatrix` に新ケースが要る (= 既存の `InvalidationMatrixPhaseDTests` の母数が動く)。壊さずに済むなら壊さない。

`Core/Models/DTOs.swift` に追加 (D2 適用後のファイルに対して):
```swift
struct OccurrenceRangeResponse: Codable, Equatable {
    let from: String
    let to: String
    let hasActiveTimetable: Bool
    let occurrences: [OccurrenceDto]
    let courseSuspensions: [CourseSuspensionDto]
    let timetableSuspensions: [TimetableSuspensionDto]
}
struct LegacyEkPushListResponse: Codable, Equatable { let externalIds: [String] }
struct LegacyEkPushClearInput: Codable, Equatable { let externalIds: [String] }
struct LegacyEkPushClearResponse: Codable, Equatable { let clearedCount: Int }
```
`EventKitSyncResponse` から `manualNeedingPush` を**削除** (`let mirrors: [PersonalEventSeriesDto]` だけになる)。

`App/AppEnvironment.swift:27,59` — `let eventKitService: EventKitService` → `let eventKitStore: EventKitStore` (actor)、`:60` の `CalendarSyncCoordinator(eventKit:client:cache:)` → `CalendarSyncCoordinator(store:client:cache:calendarRepository:)` に差し替え。

---

## 7. UI / UX

正典は `DESIGN.md`。**新しい視覚規則は導入しない** — 既存トークン (`Radius.md` / `Space.s3` / `.atenderShadow(.card)` / `.atenderSm`) と既存部品 (`SheetScaffold` / `SettingsSection` / `AtenderButton` / `ToastCenter`) だけを使う。

### 7.1 設定シート `CalendarSyncSettingsSheet` (全面書き換え)

```
┌─ カレンダー同期 ──────────────────────────┐
│                                          │
│  権限                                     │  .atenderSm semibold / textSecondary
│  ✓ 同期できます                            │  Label + checkmark.circle.fill / accent500
│                                          │
│  iPhone カレンダーへの書き出し               │
│  ┌──────────────────────────────────────┐│
│  │ Atender の予定を書き出す         [ ●] ││  Toggle (master)
│  │ ─────────────────────────────────────││
│  │ 授業                            [ ●] ││  master ON のときだけ表示
│  │ 自分の予定                       [ ●] ││
│  └──────────────────────────────────────┘│
│  書き出し先: Atender（iCloud）             │  .atenderXs / textTertiary
│  [        今すぐ書き出す         ]         │  AtenderButton(.secondary)
│                                          │
│  同期状態                                  │
│  ┌──────────────────────────────────────┐│
│  │ 最終書き出し 7/29 14:02               ││  .atenderSm / textSecondary
│  │ 作成 12 ・ 更新 3 ・ 削除 0            ││  .atenderXs / textTertiary
│  └──────────────────────────────────────┘│
│      ↑ 失敗時はここが赤字メッセージ + 回復ボタン │
│                                          │
│  iPhone カレンダーの読み込み                │
│  ● 仕事                          [  ] │  Toggle × カレンダー数
│  ● 個人                          [ ●] │
│  Atender カレンダーはここに出ません          │  .atenderXs / textTertiary
│                                          │
│  [             閉じる             ]        │  footer (既存 SheetScaffold)
└──────────────────────────────────────────┘
```

- **権限セクション** (`status.access` で分岐):
  - `.notDetermined` → `AtenderButton(.primary, "iPhone のカレンダーと同期する")` → `requestFullAccess()`。
  - `.fullAccess` → `Label("同期できます", systemImage: "checkmark.circle.fill")` / `Color.accent500`。
  - `.writeOnly` → 「書き出しにはフルアクセスが必要です。」+ `AtenderButton(.secondary, "フルアクセスを要求")`。
  - `.denied` / `.restricted` → 「設定 > Atender でカレンダーへのアクセスを許可してください。」+ `AtenderButton(.secondary, "設定を開く")` → `if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }` (Swift の正しい綴りは `UIApplication.openSettingsURLString`。ObjC の `UIApplicationOpenSettingsURLString` ではない)。`.restricted` のときはボタンを出さない (§7.4 の `recovery == .none`)。
- **書き出しセクション**: `.fullAccess` のときだけ表示。master トグル OFF → 子トグル 2 つと「書き出し先」「今すぐ書き出す」を隠す。
  - master を OFF にしたら `.confirmationDialog`「iPhone カレンダーから Atender の予定を削除します」(削除する / キャンセル、削除は `role: .destructive`)。確定で `wipeExport()`、完了後 `toast.show("iPhone カレンダーから削除しました")`。カレンダー自体は消さない。
  - 「今すぐ書き出す」→ `sync(trigger: .manual)` → 完了後 `toast.show("書き出しました（作成 N・更新 M・削除 K）")` または `toast.show(status.lastError!.message)`。
- **同期状態セクション**: 常時表示 (`.fullAccess` のときのみ)。`phase == .failed` なら背景 `Color.statusAbsent.opacity(0.10)` + `Color.statusAbsent` の `exclamationmark.triangle.fill` + `message` + `recovery` に応じたボタン 1 個。
- **読み込みセクション**: `.fullAccess` のときだけ。`availableCalendars()` (Atender 除外済み) のトグル。既存の見た目 (`calendarLabel`) を維持。
- **削除するもの**: 「書き込み先」`Picker` (`CalendarSyncSettingsSheet.swift:70-80`) と `writeTargetBinding` (`:110-115`)、`reloadCalendars` の write target 自動補完 (`:119-121`)。

### 7.2 カレンダー画面のバナー (`PersonalCalendar`)

D2 §6.3 の `ScrollView > VStack(spacing: Space.s3)` の**先頭** (`PeriodNav` 行の上) に、次の 1 ブロックを差し込む。**成功時は何も出さない。**

```
┌────────────────────────────────────────┐
│ ⚠ iPhone カレンダーに書き出せませんでした   │  Color.statusAbsent / .atenderSm
│   カレンダーへのアクセスが許可されていません   │  .atenderXs / textSecondary
│                             [ 許可する ]│  44pt / AtenderButton(.secondary, compact)
└────────────────────────────────────────┘
```

```swift
enum CalendarSyncBannerKind: Equatable {
    case none
    case permissionPrompt                 // 未決定 + 書き出し ON + 未 dismiss
    case failure(CalendarSyncError)
}

enum CalendarSyncBannerLogic {
    static func kind(status: CalendarSyncStatus, exportEnabled: Bool, promptDismissed: Bool) -> CalendarSyncBannerKind
}
```
**`kind` の規則 (この順)**:
1. `exportEnabled == false` → `.none`。
2. `status.access == .notDetermined` → `promptDismissed ? .none : .permissionPrompt`。
3. `status.phase == .failed`、かつ `status.lastError` が非 nil → `.failure(error)`。
4. それ以外 → `.none`。

- `.permissionPrompt`: 面 = `Color.bgElevated` + `Radius.md` + `.atenderShadow(.card)`、アイコン `calendar.badge.plus` / `Color.accent500`、本文「授業と予定を iPhone カレンダーに書き出せます」、右に `[許可]` (44pt) と `[×]` (44×44pt hit area、`promptDismissed = true`)。
- `.failure`: 同じ面でアイコン `exclamationmark.triangle.fill` / `Color.statusAbsent`、1 行目 = `error.message`、右のボタンは `error.recovery` で決まる (`.none` なら「詳細」→ 設定シートを開く)。
- `.denied` / `.restricted` のときはバナーを出さない (ユーザーが明示的に断った状態を毎回蒸し返さない) — `.failure` の対象は `lastError` が `.accessDenied` / `.accessRestricted` **以外**のものに限る。この除外は上の規則 3 に含める。

### 7.3 視覚階層の割当 (DESIGN.md §4)

| 階層 | 要素 | 表現 |
|---|---|---|
| L0 | (本設計に L0 要素は無い。カレンダー画面の L0 は月グリッドの今日セル = D2 の担当) | — |
| L1 | 設定シートの各セクションカード / バナー面 | `Color.bgElevated` + `Radius.md` + `.atenderShadow(.card)` |
| L2 | トグル行・状態行・回復ボタン | `.atenderSm`、44pt タップ領域 |
| L3 (meta) | 「書き出し先: Atender（iCloud）」「作成 12 ・ 更新 3 ・ 削除 0」「Atender カレンダーはここに出ません」 | `.atenderXs` / `textTertiary` |

### 7.4 状態の網羅とメッセージの正典

`CalendarSyncError.message` / `.recovery` はこの表が正典。**Reviewer はここから文字列を検証する。**

| ケース | `message` | `recovery` | ボタン文言 |
|---|---|---|---|
| `.accessNotDetermined` | `カレンダーへのアクセスが許可されていません` | `.requestAccess` | `許可する` |
| `.accessDenied` | `設定 > Atender でカレンダーへのアクセスを許可してください` | `.openSystemSettings` | `設定を開く` |
| `.accessRestricted` | `この端末ではカレンダーを利用できません` | `.none` | — |
| `.accessWriteOnly` | `書き出しにはカレンダーのフルアクセスが必要です` | `.requestAccess` | `許可する` |
| `.noWritableSource` | `書き込めるカレンダーアカウントが見つかりません` | `.none` | — |
| `.calendarCreateFailed(let d)` | `Atender カレンダーを作成できませんでした（\(d)）` | `.retry` | `もう一度` |
| `.calendarReadOnly` | `Atender カレンダーが読み取り専用になっています` | `.none` | — |
| `.calendarLookupTransient` | `カレンダーを読み込めませんでした` | `.retry` | `もう一度` |
| `.identityUnavailable` | `この端末では書き出しを続けられません（イベントの識別情報が保持されません）` | `.none` | — |
| `.applyFailed(let d)` | `iPhone カレンダーに書き込めませんでした（\(d)）` | `.retry` | `もう一度` |
| `.network(let d)` | `予定を取得できませんでした（\(d)）` | `.retry` | `もう一度` |

| 状態 | 設定シート | カレンダー画面 |
|---|---|---|
| **loading (同期中)** | 「同期状態」に `ProgressView` + 「書き出し中…」 | 何も出さない (バックグラウンド処理を邪魔しない) |
| **empty (書き出す予定が 0)** | 「作成 0 ・ 更新 0 ・ 削除 0」 | 何も出さない |
| **error** | 赤字メッセージ + 回復ボタン | §7.2 の `.failure` バナー |
| **権限なし (notDetermined)** | 権限セクションに CTA | `.permissionPrompt` バナー |
| **権限なし (denied)** | 「設定を開く」 | バナーを出さない |
| **書き出し OFF** | master トグルのみ表示 | バナーを出さない |

### 7.5 起動時トリガの配線 (`App/RootView.swift`)

既存の 2 つの `.task` に続けて追加する:

```swift
.task(id: isReadyForCalendarSync) {
    guard isReadyForCalendarSync else { return }
    await environment.calendarSyncCoordinator.sync(trigger: .appLaunch)
}
```
```swift
private var isReadyForCalendarSync: Bool {
    if case .signedIn = environment.authStore.state {
        return environment.authStore.me?.setupStatus.isComplete == true
    }
    return false
}
```
> `AuthStore` を変更しない (`RootView` に閉じた計算プロパティ)。`.task(id:)` なので、ログイン完了で `false → true` に変わった瞬間にも 1 回走る。

### 7.6 データ変更フックの配線 (`Core/Data/QueryClient.swift`)

`invalidate(prefixes:)` に 1 行足す (呼び出し側 40 箇所は無変更):

```swift
@ObservationIgnored var onInvalidate: (@MainActor ([QueryKey]) -> Void)?
//                                     ^ QueryClient は @MainActor なので、クロージャも MainActor 隔離で宣言する
//                                       (nonisolated から代入・呼び出しはできない — 呼び出し契約)

func invalidate(prefixes: [QueryKey]) {
    prefixes.forEach { invalidate(prefix: $0) }
    onInvalidate?(prefixes)
}
```
`CalendarSyncCoordinator.init` で登録:
```swift
cache.onInvalidate = { [weak self] keys in
    guard let self, !self.isRunning, CalendarSyncTrigger.isDataChange(keys) else { return }
    Task { await self.sync(trigger: .dataChanged) }
}
```
> `!self.isRunning` が、手順 11 の自分自身の invalidate による再帰を止める。`Task` で非同期化するのは、mutation の実行中に同期処理へ再入しないため。

### 7.7 サインアウト時の掃除

`SettingsView.signOut()` の先頭で `await environment.calendarSyncCoordinator.wipeExport()` を呼ぶ (`±2 年` の窓で owned を全削除)。カレンダー自体は残す。
> 別アカウントでログインしたときに前のアカウントの授業が残らないようにする。**トークン失効による自動サインアウト経路はカバーしない** (§17-3 に報告)。

### 7.8 権限説明文 (`project.yml`)

`NSCalendarsFullAccessUsageDescription` を置換する:
> 旧: `iPhoneのカレンダーと予定を同期するためにカレンダーへのアクセスを使用します。`
> 新: `授業と予定を「Atender」カレンダーに書き出し、選んだカレンダーの予定を読み込むためにカレンダーへのアクセスを使用します。`

`NSCalendarsWriteOnlyAccessUsageDescription` は**追加しない** (write-only を要求する経路が無い。write-only では専用カレンダー方式が成立しないため)。
★ `Atender/Info.plist` は手編集しない (xcodegen が毎回生成し直す)。

### 7.9 UI/UX チェック観点 (`ui-ux-design-perspectives.md` §7) の通過確認

| 観点 | 本設計での扱い |
|---|---|
| 視覚階層 | §7.3 で L1-L3 を割当 (L0 は本設計の対象外) |
| タスク頻度 → 動線 | 最頻タスク = 「何もしない」(自動同期)。手動操作は 設定 (2 タップ) に置く。失敗時だけカレンダー画面に 1 タップの回復導線が出る |
| token 参照先 | `DESIGN.md`。新規トークンを作らない |
| 状態網羅 | §7.4 (loading / empty / error / 権限なし 3 種 / 書き出し OFF) |
| アクセシビリティ | トグル・回復ボタン・× ともに 44pt (`.contentShape` で hit area 確保)。エラーは色だけでなく `exclamationmark.triangle.fill` + 文言を併記 |
| dark 対応 | 全部 semantic / dynamic トークン。**例外は `EKCalendar.cgColor`** — EK のカレンダー色は単一値しか持てないので light 変種 `#1E96E6` に固定 (逸脱理由) |
| ナビ構造 | 新規タブなし。設定は既存の 2 階層目のまま。バナーはカレンダー画面のコンテンツ先頭 (モーダルで割り込まない) |
| 数値の逸脱 | バナーの角丸は `Radius.md` (18) = DESIGN.md §3.1 の card 標準。逸脱なし |

---

## 8. 挙動仕様 (★ Reviewer はここからテストを生成する)

時刻に依存する項目は **#番号ごとに標本時刻を明記**する。JST 00:00〜08:59 の危険窓を必ず含める (`gotcha/client-today-must-use-server-timezone.md`)。

### CAL. カレンダー解決 (`AtenderCalendarResolver`・純関数)

共通の標本: `sources = [ {id:"src-icloud", title:"iCloud", kind:.calDAV}, {id:"src-local", title:"このiPhone内", kind:.local} ]`、`defaultCalendarSourceId = "src-icloud"`。

- **CAL1 (id 一致)**: `storedId="cal-1"`、`calendars=[{id:"cal-1", title:"Atender", allowsEvents:true, allowsModify:true, sourceId:"src-icloud"}]` → `.use("cal-1")`。
- **CAL2 (id 不一致 → title で救う)**: `storedId="cal-old"`、`calendars` に `cal-old` は無く `{id:"cal-2", title:"Atender", ...}` がある → `.use("cal-2")`。
- **CAL3 (id も title も無い → 作る)**: `storedId=nil`、`calendars=[{id:"cal-9", title:"仕事", ...}]`、`allowCreate:true` → `.createNew(sourceId:"src-icloud")`。
- **CAL4 (★ カレンダー 0 件では作らない)**: `calendars=[]`、`allowCreate:true` → `.unavailable(.calendarLookupTransient)`。**`.createNew` を返す実装はここで落ちる。**
- **CAL5 (allowCreate false)**: CAL3 と同条件で `allowCreate:false` → `.unavailable(.calendarLookupTransient)`。
- **CAL6 (title 一致が複数 → default source を優先)**: `calendars=[{id:"cal-b", title:"Atender", sourceId:"src-local"}, {id:"cal-a", title:"Atender", sourceId:"src-icloud"}]` → `.use("cal-a")`。
- **CAL7 (title 一致が複数・default source に無い → id 昇順)**: 両方 `sourceId:"src-local"` で id が `cal-b` / `cal-a` → `.use("cal-a")`。
- **CAL8 (読み取り専用は無視)**: 唯一の `"Atender"` が `allowsModify:false` → `allowCreate:true` なら `.createNew(...)`、`false` なら `.unavailable(.calendarLookupTransient)`。
- **CAL9 (イベント不可のカレンダーは無視)**: `allowsEvents:false` の `"Atender"` (リマインダー専用) → CAL8 と同じ。
- **CAL10 (title の完全一致)**: `"atender"` / `"Atender "` / `"Atender 予定"` はいずれも一致しない → `.createNew(...)`。
- **CAL11 (書き込めるソースが無い)**: `sources=[{id:"src-sub", kind:.subscribed}]`、`defaultCalendarSourceId="src-sub"`、`calendars` は 1 件以上あるが `"Atender"` 無し → `.unavailable(.noWritableSource)`。
- **CAL12 (`writableSourceId` の優先順)**:
  - `default="src-icloud"` → `"src-icloud"`。
  - `default=nil`、`sources=[local, calDAV]` → **`calDAV`** (local を先に選ぶ実装はここで落ちる)。
  - `default="src-birthdays"` (kind `.birthdays`)、他に calDAV あり → `calDAV`。
  - `sources=[local]` のみ → `"src-local"`。
  - `sources=[]` → `nil`。

### KEY. 識別子 (`ExportKey`・純関数)

- **KEY1**: `ExportKey.meeting(meetingId:"mt1", date:"2026-07-23", firstPeriodOffset:0)` → `"atender://m/mt1/20260723/0"`。
- **KEY2 (危険窓)**: `ExportKey.personal(seriesId:"s1", occurrenceDate: JST 2026-07-23 00:30)` → `"atender://p/s1/20260722T153000Z"` (UTC 基本形式)。**JST 表記で書く実装はここで落ちる。**
- **KEY3**: `ExportKey.personal(seriesId:"s1", occurrenceDate: JST 2026-07-23 09:00)` → `"atender://p/s1/20260723T000000Z"`。
- **KEY4**: `kind(of: "atender://m/mt1/20260723/0")` → `.meeting`。`kind(of: "atender://p/s1/20260723T000000Z")` → `.personal`。
- **KEY5**: `kind(of: "https://example.com")` / `kind(of: "atender://x/1")` / `kind(of: "")` / `kind(of: nil)` → すべて `nil`。
- **KEY6**: `isOwned("atender://m/mt1/20260723/0")` は `true`、`isOwned(nil)` / `isOwned("teams://meeting/1")` は `false`。
- **KEY7 (往復)**: KEY1〜KEY3 の各出力は `URL(string:)` で non-nil な URL になる。

### MC. 授業マッピング (`CourseExportMapping`・純関数)

共通の標本: `date="2026-07-23"`。`OccurrenceDto` は `{ id, meetingId:"mt1", courseId:"c1", courseName:"情報数学", teacher:"山田", room:"301", date, periodIndex, periodOffset, startMinute, endMinute, status }`。

- **MC1 (単コマ)**: 1 件 `{periodIndex:1, periodOffset:0, startMinute:540, endMinute:630}` → `ExportItem` 1 件。`key="atender://m/mt1/20260723/0"`、`title="情報数学"`、`location="301"`、`notes="1限\n担当: 山田"`、`isAllDay=false`、`start` = JST 7/23 09:00、`end` = JST 7/23 10:30。
- **MC2 (連コマ結合)**: 2 件 `{periodIndex:1, offset:0, 540-630}` と `{periodIndex:2, offset:1, 640-730}` → **1 件**。`start` = 09:00、`end` = 12:10 (= 730 分)、`notes="1-2限\n担当: 山田"`、`key` の offset は `0`。
- **MC3 (非連続は分ける)**: `{periodIndex:1, offset:0}` と `{periodIndex:3, offset:2}` → **2 件**。key の offset がそれぞれ `0` と `2`。
- **MC4 (別 meeting は結合しない)**: `mt1` の 1 限と `mt2` の 2 限 → 2 件。
- **MC5 (別日は結合しない)**: 同 `mt1` の 7/23 1 限と 7/24 1 限 → 2 件。
- **MC6 (時間割全体の休講)**: `timetableSuspensions=[{date:"2026-07-23"}]` → その日の全 occurrence が消え **0 件**。
- **MC7 (科目単位の休講)**: `courseSuspensions=[{courseId:"c1", date:"2026-07-23"}]` かつ occurrence が `c1` と `c2` → `c2` の 1 件だけ残る。
- **MC8 (別日の科目休講は効かない)**: `courseSuspensions=[{courseId:"c1", date:"2026-07-24"}]` → 7/23 の `c1` は残る。
- **MC9 (出欠 CANCELLED)**: `status: .cancelled` の occurrence → 除外。同じ日の `status: .absent` は**残る**。
- **MC10 (欠席はそのまま)**: `status: .absent` → 1 件。`title` に印が付かない (`"情報数学"` ちょうど)。
- **MC11 (教員なし)**: `teacher: nil` → `notes="1限"`。`teacher: ""` も同じ。
- **MC12 (教室なし)**: `room: nil` / `room: ""` → `location == nil`。
- **MC13 (壊れた行)**: `endMinute <= startMinute` → 除外。
- **MC14 (並び)**: 同日に 3 限 (13:00) と 1 限 (09:00) を入力順 `[3限, 1限]` で渡す → 出力は `start` 昇順 = `[1限, 3限]`。
- **MC15 (空入力)**: 全部空 → `[]`。

### MP. 個人予定マッピング (`PersonalExportMapping`・純関数)

- **MP1 (時刻あり)**: `{source:"MANUAL", isAllDay:false, start:"2026-07-23T00:00:00Z"(JST 09:00), end:"2026-07-23T01:30:00Z", title:"面談", location:"渋谷", note:"資料持参"}` → `start`/`end` はそのまま、`location="渋谷"`、`notes="資料持参"`。
- **MP2 (★ 危険窓)**: `start:"2026-07-22T15:30:00Z"` (= JST 7/23 00:30)、`end:"2026-07-22T16:00:00Z"` → `key == "atender://p/s1/20260722T153000Z"`、`start` はそのまま。**JST 暦で key を作る実装はここで落ちる。**
- **MP3 (単日終日)**: `{isAllDay:true, start:JST 7/23 00:00, end:JST 7/24 00:00}` → `start` = JST 7/23 00:00、**`end` = JST 7/23 23:59:59** (排他 end から 1 秒引く)。
- **MP4 (複数日終日)**: `{isAllDay:true, start:JST 7/23 00:00, end:JST 7/26 00:00}` → `end` = JST **7/25** 23:59:59。
- **MP5 (複数日・時刻あり)**: `{isAllDay:false, start:JST 7/23 22:00, end:JST 7/25 03:00}` → `ExportItem` は **1 件**で `start`/`end` がそのまま (日ごとに割らない)。
- **MP6 (EVENTKIT ミラーは書き戻さない)**: `source:"EVENTKIT"` の occurrence → `[]`。`MANUAL` と混在させたら `MANUAL` の分だけ返る。
- **MP7 (繰り返し occurrence)**: 同じ `seriesId` で `occurrenceDate` が 7/20・7/27・8/3 の 3 occurrence → `ExportItem` 3 件、`key` が 3 つとも異なる。`isAllDay` などは各 occurrence の値。
- **MP8 (override 適用済がそのまま出る)**: `occurrenceDate = JST 7/27 09:00`、`start = JST 7/27 10:00` (override で移動) → `key` は `occurrenceDate` 由来 (`20260727T000000Z`)、`start` は 10:00 (= `20260727T010000Z` 相当)。**key と start を同じ値から作る実装はここで落ちる。**
- **MP9 (空タイトル)**: `title:""` → `"予定"`。
- **MP10 (空文字の正規化)**: `location:""` / `note:""` → どちらも `nil`。
- **MP11 (並び)**: 入力順が逆でも `start` 昇順で返る。
- **MP12 (空入力)**: `[]` → `[]`。

### PL. 差分 (`CalendarExportPlanner`・純関数)

- **PL1 (全部新規)**: `existing=[]`、`desired` 3 件 → `creates` 3・`updates` 0・`deletes` 0・`unchanged` 0。
- **PL2 (変化なし)**: 同じ内容の owned が 3 件 → `unchanged` 3、他は 0。
- **PL3 (タイトル変更)**: title だけ違う → `updates` 1 件、`eventIdentifier` が既存のもの。
- **PL4 (時刻変更)**: `end` が 1 分違う → `updates` 1 件。
- **PL5 (削除)**: `desired=[]`、owned 2 件、`prunableKinds=[.meeting, .personal]` → `deletes` 2 件。
- **PL6 (★ prunableKinds で守る)**: `desired=[]`、owned に `m:` 1 件と `p:` 1 件、`prunableKinds=[.personal]` → `deletes` は `p:` の 1 件だけ。`m:` は残る。
- **PL7 (★ foreign は絶対に触らない)**: `existing` に `key=nil` (ユーザーが Atender カレンダーに手で作った予定) が 1 件 → `deletes` に入らず、`plan.foreign == 1`。
- **PL8 (重複 key の自己修復)**: 同じ key の owned が `eventIdentifier` `"ev-b"` と `"ev-a"` の 2 件、desired にその key がある → `"ev-a"` が `updates`/`unchanged` の対象、`"ev-b"` は `deletes` に入る。
- **PL9 (決定性)**: 同じ入力を 2 回通すと `ExportPlan` が `==` になる。`existing` の順序を入れ替えても `deletes` の内容 (集合として) が変わらない。
- **PL10 (`isSame` 終日・翌 00:00 表現)**: item = `{isAllDay:true, start:JST 7/23 00:00, end:JST 7/23 23:59:59}`、existing = `{isAllDay:true, start:JST 7/23 00:00, end:JST 7/24 00:00}` → **`isSame == true`**。★ 単純な `end ==` 比較の実装はここで落ち、毎回 update する無限チャーンになる。
- **PL11 (`isSame` 終日・別日は差分)**: existing の `end` が JST 7/25 00:00 → `isSame == false`。
- **PL12 (`isSame` nil と空文字)**: item `location=nil` / existing `location=""` → `isSame == true`。item `notes=nil` / existing `notes="  "` → `true`。
- **PL13 (`isSame` 秒未満の差)**: `start` が `0.4` 秒違う → `isSame == true` (両方 floor)。`1.0` 秒違えば `false`。
- **PL14 (`isSame` isAllDay 違い)**: 他が全部同じで `isAllDay` だけ違う → `false`。
- **PL15 (`shouldVerifyIdentity`)**: `existingOwnedCount=0` かつ `creates=3` → `true`。`existingOwnedCount=1` → `false`。`creates=0` → `false`。

### TR. トリガ判定 (`CalendarSyncTrigger`・純関数)

`now = 2026-07-23T12:00:00Z` を基準にする。

- **TR-A (再入禁止)**: `isRunning=true` → どの trigger でも `false`。
- **TR-B (初回)**: `lastRunAt=nil`、`trigger=.foreground` → `true`。
- **TR-C (throttle)**: `lastRunAt = now - 5秒`、`.foreground` → `false`。`now - 20秒` → `true`。
- **TR-D (throttle 無視)**: `lastRunAt = now - 1秒` でも `.manual` / `.appLaunch` / `.permissionGranted` → `true`。
- **TR-E (★ 自書き込みの反響を無視)**: `trigger=.storeChanged`、`lastSelfWriteAt = now - 1秒` → `false`。`now - 5秒` なら throttle 判定に進む。
- **TR-F (自書き込みは storeChanged 以外を止めない)**: `trigger=.manual`、`lastSelfWriteAt = now - 1秒` → `true`。
- **TR-G (`isDataChange`)**: `[.personalEvents()]` → `true`。`[.userTimetables()]` → `true`。`[.timetableSuspensions()]` → `true`。`[.semesters()]` → `true`。`[.semesterOverview("s1")]` → `true` (`["semesters","s1","overview"]` は `["semesters"]` を前方に含む)。`[.courseSuspensions("c1")]` → `true` (`["courses","c1","suspensions"]`)。`[.dayPrefix()]` → `false`。`[QueryKey(["rooms"])]` → `false`。`[QueryKey(["today"])]` → `false`。`[QueryKey(["stats"])]` → `false`。`[]` → `false`。`[QueryKey(["today"]), .personalEvents()]` → `true` (1 つでも当たれば true)。

### ST. バナーとメッセージ (`CalendarSyncBannerLogic` / `CalendarSyncError`・純関数)

- **ST1**: `exportEnabled=false` かつ `access=.notDetermined` → `.none`。
- **ST2**: `exportEnabled=true`、`access=.notDetermined`、`promptDismissed=false` → `.permissionPrompt`。
- **ST3**: 同条件で `promptDismissed=true` → `.none`。
- **ST4**: `access=.fullAccess`、`phase=.failed`、`lastError=.applyFailed("x")` → `.failure(.applyFailed("x"))`。
- **ST5 (★ denied は蒸し返さない)**: `phase=.failed`、`lastError=.accessDenied` → `.none`。`.accessRestricted` も `.none`。
- **ST6**: `phase=.succeeded` → `.none`。`phase=.running` → `.none`。
- **ST7 (メッセージ表)**: §7.4 の 11 ケースについて `message` と `recovery` が表どおり。`.calendarCreateFailed("EKErrorSourceDoesNotAllowCalendarAddDelete")` の `message` に元の文字列が含まれる。
- **ST8**: `recovery` が `.none` のケース (`.accessRestricted` / `.noWritableSource` / `.calendarReadOnly` / `.identityUnavailable`) でボタン文言が空になる。
- **ST9 (★ SF Symbol の実在)**: 本設計が名指しする 3 つの symbol — `"checkmark.circle.fill"` / `"exclamationmark.triangle.fill"` / `"calendar.badge.plus"` — がすべて `UIImage(systemName:)` で non-nil になる。`UIImage(systemName:)` は存在しない名前に対して**警告もクラッシュも出さず nil を返す** = アイコンが無言で消えるので、名前は必ずテストで実在を確かめる (`NavigationTests.swift:42` と同じ形。負の対照は同ファイル `:50-52` が既に持っている)。

### API. backend (`apps/api`, Vitest)

- **API1 (基本)**: 学期 7/1〜8/31、毎週木曜 1 限の時間割がある user で `GET /api/occurrences?from=2026-07-20&to=2026-08-16` → `hasActiveTimetable:true`、`occurrences` に 7/23・7/30・8/6・8/13 の 4 件、各 `courseName`/`room`/`startMinute`/`endMinute` が入っている。
- **API2 (範囲外を含まない)**: 同条件で `from=2026-07-24&to=2026-07-29` → 7/23 と 7/30 を含まない (0 件)。
- **API3 (★ 日境界 JST)**: `from=to=2026-07-23` → 7/23 の occurrence を返す。**UTC 日境界で切る実装は 7/22 のものを混ぜる or 7/23 を落とす。**
- **API4 (時間割なし)**: 時間割を持たない user → `hasActiveTimetable:false`、3 配列とも空、ステータス 200。
- **API5 (休講を消さずに返す)**: 7/23 に `timetableSuspension`、7/30 に `courseSuspension` を作る → `occurrences` は 4 件のまま、`timetableSuspensions` に 1 件、`courseSuspensions` に 1 件。**除外はクライアント側の責務**。
- **API6 (出欠ステータスが載る)**: 7/23 の occurrence に `CANCELLED` を記録 → その occurrence の `status === "CANCELLED"`。
- **API7 (範囲上限)**: `from=2026-01-01&to=2027-06-01` (367 日) → 400 `RANGE_TOO_LARGE`。`to=2027-01-01` (366 日) → 200。
- **API8 (逆順)**: `from=2026-08-01&to=2026-07-01` → 400 `VALIDATION_ERROR`。
- **API9 (必須)**: `from` だけ / クエリなし → 400。
- **API10 (未認証)**: Cookie / Bearer 無し → 401。
- **API11 (他人のデータが混ざらない)**: 別 user が同じ日に授業を持っていても自分の分だけ返る。
- **API12 (legacy 一覧)**: `source=MANUAL, ekExternalId="X"` の行と `ekExternalId=null` の行と `source=EVENTKIT, ekExternalId="Y"` の行がある → `GET /eventkit-legacy-pushes` は `{externalIds:["X"]}`。重複する `ekExternalId` は 1 個に畳まれる。
- **API13 (legacy クリア)**: `POST /eventkit-legacy-pushes/clear {externalIds:["X"]}` → `clearedCount:1`、対象行の `ekExternalId`/`ekCalendarId` が null。`source=EVENTKIT` の `"Y"` は**変わらない**。
- **API14 (legacy クリア・冪等)**: 同じ body で 2 回目 → `clearedCount:0`、エラーなし。
- **API15 (`dayDetail` 無回帰)**: `occurrenceDto` の移設後も `GET /api/day/:date` のレスポンス形が以前と同一 (既存 `day-detail.test.ts` が緑のまま)。
- **API16 (`eventkit-sync` の返り)**: `POST /api/personal-events/eventkit-sync` のレスポンスに `manualNeedingPush` キーが**存在しない**。`mirrors` は D2 の仕様どおり。

### EK. EKEventStore の実体が要る項目 (★ ユニットテストでは検証できない → Touri のシミュレータ / 実機確認に回す)

Reviewer はここを「クラッシュ非回帰」までしか担保しない。`SmokeTests` / `ScreenshotFlow` の範囲。

- **EK1**: 権限を許可すると、標準カレンダー App の一覧に **「Atender」カレンダーが 1 個だけ**現れる (色は azure)。
- **EK2**: そのカレンダーに**今学期の授業**が入っている (連コマが 1 件に結合されている / 教室が「場所」に入っている / メモに「1-2限」「担当: …」)。
- **EK3**: Atender で作った個人予定が同じカレンダーに入る。終日予定が**1 日だけ**を占める (2 日にまたがらない)。複数日の終日予定が正しい日数を占める。
- **EK4**: Atender で予定を編集/削除すると、次の同期 (アプリを開き直す等) で iPhone カレンダー側も追随する (B4 の解消)。
- **EK5**: 休講を設定すると、その授業が iPhone カレンダーから消える。
- **EK6**: アプリを 2 回起動しても**カレンダーが 2 個にならない・予定が二重にならない**。
- **EK7**: 標準カレンダー App で「Atender」カレンダーを削除 → アプリを開くと**作り直され、予定が復元される**。
- **EK8**: 設定シートで「Atender の予定を書き出す」を OFF → 確認ダイアログ → iPhone カレンダーから Atender の予定が消える (カレンダー自体は残る)。
- **EK9**: 「授業」だけ OFF → 授業だけ消え、個人予定は残る。
- **EK10**: 読み込みトグルを**1 つも ON にしていない**状態でも書き出しが動く (B1 の解消)。
- **EK11**: 読み込みカレンダー一覧に「Atender」が**出てこない**。読み込んだ予定が Atender カレンダーに二重に現れない (B5 の解消)。
- **EK12**: 権限未許可のままカレンダー画面を開くとバナーが出て、そこから許可すると即座に書き出しが走る (B7 の解消)。
- **EK13**: 機内モードにして「今すぐ書き出す」→ 赤字のエラーと「もう一度」ボタンが出る (B3 の解消)。無言で終わらない。
- **EK14**: build 11 から更新したとき、build 11 が既定カレンダーに書いていた個人予定が**消える** (Atender カレンダー側に 1 個だけ残る)。
- **EK15**: 授業が数百件ある学期で初回書き出しをしても、**UI が固まらない** (B8 の解消)。
- **EK16**: Atender カレンダーに標準アプリで予定を手で 1 件足す → 同期しても**消えない** (PL7 の実機確認)。

---

## 9. テスト基盤

### iOS (`apps/ios/AtenderTests`, XCTest)

- 新規:
  - `AtenderCalendarResolverTests.swift` — CAL1〜CAL12
  - `ExportKeyTests.swift` — KEY1〜KEY7
  - `CourseExportMappingTests.swift` — MC1〜MC15
  - `PersonalExportMappingTests.swift` — MP1〜MP12
  - `CalendarExportPlannerTests.swift` — PL1〜PL15
  - `CalendarSyncTriggerTests.swift` — TR-A〜TR-G
  - `CalendarSyncStatusTests.swift` — ST1〜ST9 (ST9 は `import UIKit` が要る)
- 書き換え:
  - `EventKitReconcilerTests.swift` — `pushTargets` の 2 件を**削除**し、`uploads` の 2 件は D2 の新 DTO 形に合わせて残す。
  - `EventKitTimeMappingTests.swift` — D2 §6.10 で `toPersonalDays` が消えるため D2 が書き換える。本 doc は追加しない。
- 拡張:
  - `DTODecodingTests.swift` — `OccurrenceRangeResponse` / `LegacyEkPushListResponse` の decode。`EventKitSyncResponse` に `manualNeedingPush` が無くても decode できること。
- **★ `EventKitStore` (actor・EKEventStore I/O) はユニットテスト対象外**。Simulator の EventKit 実体に依存する。回帰は `SmokeTests` / `ScreenshotFlow` のクラッシュ非回帰のみ。§8 の EK 系は Touri の実機確認が最終ゲート。
- **★ 純ロジックが EventKit を import しないことをテストで担保する**: `CalendarExportPlanner` / `CourseExportMapping` / `PersonalExportMapping` / `AtenderCalendarResolver` / `ExportKey` / `CalendarSyncTrigger` は `import EventKit` を持たない。これが崩れるとテストがビルドできなくなるので、ビルドが通ること自体が検査になる。
- ベースライン: D2 適用後の GREEN 数を基準にする。Reviewer は pass/fail 以前に `xcodebuild build-for-testing` が通るかを第一関門にする (`EventKitService` → `EventKitStore` の型置換があるため)。

### backend (`apps/api` + `packages/shared`, Vitest)

- 配置: `apps/api/tests/*.test.ts` (既存慣習)。
- 新規: `tests/occurrence-range.test.ts` — API1〜API11。
- 拡張: `tests/eventkit-sync.test.ts` (D2 が書き換える同ファイル) に API12〜API14、API16 を追加。D2 の **K9 / K10 は削除**する (§12 の差分 B)。
- 無回帰: `tests/day-detail.test.ts` (API15) — `occurrenceDto` の移設で壊れないこと。
- ★ known-failures 台帳 (`.knowledge/known-failures.md`) と照合し、**未分類の失敗を残したままマージしない**。

### Web

**変更なし**。Web に EventKit は存在しない。`apps/web` のテストは全件無変更で緑のまま。

---

## 10. 触るファイル確定リスト

### packages/shared
1. `src/schemas/attendance.ts` — `OccurrenceRangeQuery` / `OccurrenceRangeDto` 追加 (additive)。`CourseSuspensionDto` / `TimetableSuspensionDto` を import
2. `src/schemas/personalEvent.ts` — `EventKitSyncResult` から `manualNeedingPush` 削除、`LegacyEkPush*` 3 型を追加 (**D2 適用後のファイルに対して**)
3. `src/index.ts` — 変更不要 (`attendance.js` / `personalEvent.js` は既に export 済み。実測)

### apps/api
4. `src/services/occurrence.service.ts` — **新規**。`occurrenceDto` 移設 + `listOccurrenceRange`
5. `src/services/dayDetail.service.ts` — 自前 `occurrenceDto` (`:9-36`) を削除し import に差し替え
6. `src/routes/occurrences.ts` — **新規**
7. `src/index.ts` — `registerOccurrenceRoutes` の import (`:10` 付近) と呼び出し (`:41` 付近) を追加
8. `src/services/personalEvent.service.ts` — `listLegacyEkPushes` / `clearLegacyEkPushes` 追加、`reconcileEventKit` の返りから `manualNeedingPush` を削除 (**D2 適用後のファイルに対して**)
9. `src/routes/personalEvents.ts` — legacy 2 endpoints を `/:id` より前に追加
10. テスト: §9 のとおり

### apps/ios (中心)
11. `Atender/Core/Sync/AtenderCalendarSpec.swift` — **新規** (title / colorHex)
12. `Atender/Core/Sync/ExportKey.swift` — **新規** (純関数)
13. `Atender/Core/Sync/AtenderCalendarResolver.swift` — **新規** (純関数 + `EKCalendarSnapshot` / `EKSourceSnapshot`)
14. `Atender/Core/Sync/CalendarExportPlanner.swift` — **新規** (純関数 + `ExportItem` / `ExportedEvent` / `ExportPlan`)
15. `Atender/Core/Sync/CourseExportMapping.swift` — **新規** (純関数)
16. `Atender/Core/Sync/PersonalExportMapping.swift` — **新規** (純関数)
17. `Atender/Core/Sync/CalendarSyncStatus.swift` — **新規** (`EventKitAccess` / `CalendarSyncError` / `CalendarSyncStatus` / `ExportSummary` / `CalendarSyncBannerLogic`)
18. `Atender/Core/Sync/CalendarSyncTrigger.swift` — **新規** (純関数 + `SyncTrigger` / `ExportWindow`)
19. `Atender/Core/Sync/EventKitStore.swift` — **新規** (actor)
20. `Atender/Core/Sync/EventKitService.swift` — **削除** (19 が置き換える)。同ファイルにある `EKCalendarInfo` (`:6-12`) / `EventKitService.Access` (`:17-23`) / `EventKitServiceError` (`:159-164`) / `private extension UIColor.hexString` (`:166-175`) も一緒に消える。前 3 者の置き先は 13 (`EKCalendarSnapshot`) と 17 (`EventKitAccess` / `CalendarSyncError`)、`hexString` は 19 の中に private で持つ
21. `Atender/Core/Sync/CalendarSyncCoordinator.swift` — 全面書き換え (§6.5)
22. `Atender/Core/Sync/EventKitReconciler.swift` — `pushTargets` と `ReconcilePlan` を削除、`uploads` のみ残す
23. `Atender/Core/Sync/EventKitTimeMapping.swift` — D2 §6.10 の変更のみ。本 doc は `jstDayStart(_:)` を利用するだけ (追加変更なし)
24. `Atender/Core/Models/DTOs.swift` — `OccurrenceRangeResponse` / `LegacyEkPush*` 追加、`EventKitSyncResponse.manualNeedingPush` 削除
25. `Atender/Core/Networking/APIEndpoint.swift` — `occurrenceRange` / `legacyEkPushes` / `clearLegacyEkPushes` の 3 本追加
26. `Atender/Core/Data/CalendarExportRepository.swift` — **新規**
27. `Atender/Core/Data/QueryClient.swift` — `onInvalidate` フック 1 個追加 (`invalidate(prefixes:)` に 1 行)
28. `Atender/App/AppEnvironment.swift:27,59,60` — `EventKitStore` / 新 `CalendarSyncCoordinator` / `CalendarExportRepository` の配線
29. `Atender/App/RootView.swift` — 起動時トリガ (§7.5)
30. `Atender/Features/Settings/CalendarSyncSettingsSheet.swift` — 全面書き換え (§7.1)
31. `Atender/Features/Calendar/PersonalCalendar.swift` — **D2 適用後のファイルに対して**、(a) `content` の `VStack` 先頭にバナー 1 ブロック、(b) `.task` 内の同期呼び出しを `sync(trigger: .calendarScreen)` に、(c) D2 §6.5 が残す `pushManualEvent` 呼び出しを**削除** (書き出しは TR-6 が担う)
32. `Atender/Features/Settings/SettingsView.swift` — `signOut()` の先頭に `wipeExport()` (§7.7)
33. `project.yml` — `NSCalendarsFullAccessUsageDescription` の文言置換 (§7.8)。**`CFBundleVersion` は D2 が 12 にする。本 doc では触らない**
34. テスト: §9 のとおり

### 変更不要と確認済 (grep で母数確定)
- `Atender/Core/Timetable/TimetableLogic.swift` の `PeriodGrouping` (`:321-361`) — §5.2 で**無改変のまま再利用**する。`PeriodGroupingTests` は緑のまま
- `Atender/Core/Data/InvalidationMatrix.swift` — 新しい `Mutation` も `QueryKey` も追加しない (§6.6 の理由)。`InvalidationMatrixPhaseDTests` は緑のまま
- `apps/web/**` — 一切変更しない
- `Atender/Core/DesignSystem/**` — 新規トークン・新規コンポーネントを作らない

---

## 11. 実装順 (出荷は build 12 で 1 回)

**前提: D2 (`20260729-personal-calendar-rebuild.md`) が全段着地していること。**

| 段 | 内容 | 依存 | 単独でビルド + 緑になるか |
|---|---|---|---|
| **E1** | `packages/shared` の `OccurrenceRange*` + `apps/api` の `occurrence.service.ts` / `routes/occurrences.ts` / `dayDetail` 移設 + テスト (API1-API11, API15) | D2 | ○ |
| **E2** | `apps/api` の legacy endpoints + `manualNeedingPush` 削除 + テスト (API12-API14, API16)。D2 の K9/K10 を削除 | D2 | ○ |
| **E3** | iOS の純ロジック 7 ファイル (§10 の 11〜18) + テスト (CAL/KEY/MC/MP/PL/TR/ST) | E1 | ○ — **新しい型を足すだけで既存を消さない**。`EKCalendarSnapshot` と既存 `EKCalendarInfo` はこの段では併存する |
| **E4** | ★ iOS 配線の一括置換 (§10 の 19〜32)。`EventKitStore` 新規 / `EventKitService` 削除 / `EventKitReconciler` 縮小 / `CalendarSyncCoordinator` 全面書き換え / `CalendarExportRepository` / `QueryClient` フック / DTO / endpoint / `AppEnvironment` / `RootView` / `CalendarSyncSettingsSheet` / `SettingsView` / `PersonalCalendar` | E3, E1, E2 | ○ (**この段全体で 1 コミット**) |
| **E5** | `project.yml` の権限説明文 (§7.8) | — | ○ |

**★ E4 を細分できない理由 (1 個ずつ「最後の参照は誰か」を数えた結果)**:

| 消すもの | 現在の参照元 | その参照元を直す節 |
|---|---|---|
| `EventKitService` 型 | `CalendarSyncCoordinator.swift:7,15,27,37` / `AppEnvironment.swift:27,59` | §6.4 / §6.5 |
| `EventKitService.Access` | `CalendarSyncSettingsSheet.swift:12,26` (`coordinator.access` の型として) | §7.1 |
| `EKCalendarInfo` (`EventKitService.swift:6-12` に定義) | `CalendarSyncSettingsSheet.swift:6,62,82,118` / `CalendarSyncCoordinator.swift:45-47` | §7.1 / §6.5 |
| `writeTargetCalendarId` | `CalendarSyncSettingsSheet.swift:110-115,119-121` / `CalendarSyncCoordinator.swift:22-25,39-41,79` | §7.1 / §6.5 |
| `syncCurrentMonth()` | `CalendarSyncSettingsSheet.swift:32,105` / `CalendarSyncCoordinator.swift:31-34` | §7.1 / §6.5 |
| `sync(range:)` | `PersonalCalendar.swift:113` | §10 の 31-(b) |
| `pushManualEvent` | `PersonalCalendar.swift:168` (D2 適用後も残る) | §10 の 31-(c) |

= **`EventKitService.swift` を消した瞬間に 3 ファイルがコンパイル不能になる**ので、E4 は分割してもどの部分単独でもビルドが通らない。「`main` は常にデプロイ可能」を守るため 1 コミットにする。

**デプロイ順序**: D2 §13.2 に従う (API → Web → iOS)。本 doc の backend 変更は**すべて additive** (`manualNeedingPush` の削除だけが破壊的だが、それを読むのは build 11 の iOS のみで、build 11 は `MIN_IOS_BUILD=12` により既に 426 になっている) ので、D2 のデプロイに相乗りする。

---

## 12. ★ D2 との差分 (Leader 判断へ)

D2 §5.7 が「次レーンが依存してよい契約」として書いた項目のうち、**3 点を本 doc が置き換える**。D2 の doc 本体は Leader の裁定があるまで書き換えない。

### 差分 A — 繰り返しを `EKRecurrenceRule` にせず、展開済み occurrence を個別に書く

| | |
|---|---|
| **D2 の記述** | §5.7-3「Atender → EK: 系列は `EKRecurrenceRule` として書く。`single` は当該 occurrence を掴んで `save(_:span:.thisEvent)`、`future` は `.futureEvents`、`all` は系列先頭 occurrence に `.futureEvents`」 |
| **本 doc** | §5.3-9。系列は展開して **1 occurrence = 1 非繰り返し EKEvent** として書く。`EKSpan` を一切使わない (常に `.thisEvent` = 非繰り返しなのでイベント全体) |
| **理由** | (1) Atender カレンダーは**一方向** (§3) なので、`EKRecurrenceRule` の価値は「標準 App で繰り返しバッジが出る」という表示上のものだけになる。(2) EventKit には **EXDATE / RECURRENCE-ID の API が無く、detach を取り消す手段も無い** (library note) ので、D2 の override が減る方向の変更 (取り消しを戻す / この回だけの変更を戻す) を EK に反映できず、そのたびに「系列ごと消して作り直す」フォールバックが要る。(3) その分岐は EKEventStore 実体でしか動かせず、本 PJ の既知の盲点 (iOS UI 層到達不能) をさらに広げる。(4) 展開方式なら**授業と個人予定で同じ 1 本の差分アルゴリズム**を通せる |
| **失うもの** | 標準カレンダー App で繰り返しバッジが出ない。書き出し窓 (今日−31日〜今日+334日) の外側に繰り返しの未来分が出ない。窓の先端はアプリを開いたときにしか前進しないので、**1 ヶ月アプリを開かなければ先端は 11 ヶ月先まで縮む** (実害は小さいと判断) |
| **推奨** | 本 doc の方式を採る |

### 差分 B — `manualNeedingPush` と push-back 経路を廃止する

| | |
|---|---|
| **D2 の記述** | §5.6 の `EventKitSyncResult.manualNeedingPush`、挙動仕様 K9 / K10、§6.5「保存後の EventKit push … `pushManualEvent(saved)`」、§6.10「`pushManualEvent` に `guard event.recurrenceRule == nil` を追加」 |
| **本 doc** | `manualNeedingPush` を返さない。`pushManualEvent` / `pushTargets` / `recentlyWritten` を削除。個人予定の書き出しは §5.3 + §5.4 の差分エンジンが担う |
| **理由** | 2 つの書き込み経路 (push-back と差分エンジン) が同じ予定を書くと、**同じ予定が 2 件できる**。書き込み経路は 1 本でなければならない |
| **影響** | D2 のテスト **K9 / K10 を削除**する。D2 §6.5 の `pushManualEvent(saved)` 呼び出しを削除する (代わりに TR-6 が保存後の invalidate を拾って書き出す) |
| **推奨** | 本 doc の方式を採る |

### 差分 C — `EventKitService` の API 形

| | |
|---|---|
| **D2 の記述** | §6.10「`EventKitService.createEvent(_ pe: PersonalEventSeriesDto, in:)` / `updateEvent(externalId:_ pe:)` の引数型を `PersonalEventSeriesDto` に変更」 |
| **本 doc** | `EventKitService` を削除し `actor EventKitStore` に置換 (§6.4)。個別の create/update ではなく `apply(_ plan: ExportPlan, calendarId:)` 1 本にする |
| **理由** | 差分 B の帰結 (個別 push の呼び出し元が消える) + B8 (MainActor での数百件書き込み) の解消 |
| **影響** | D2 §6.10 の表のうち `EventKitService` の行が不要になる。`EventKitTimeMapping` / `EventKitReconciler.uploads` (読み込み側) は D2 の記述どおりで変更なし |
| **推奨** | 本 doc の方式を採る |

---

## 13. 不採用案

- **Atender カレンダーを双方向にする (書いたものを読み戻し、標準 App での編集を Atender に取り込む)** — 却下。(a) 「Atender が書いた → 読み戻して EVENTKIT ミラーを作る → それをまた書き出す」の輪ができ、B5 の二重行が消えない。(b) 同一予定に 2 つの正典ができ、同時編集の解決 (LWW / tombstone) が要る。EventKit にはバックグラウンド配信が無く前面化 diff 前提なので、この手の解決は必ずズレる。(c) T1 の参照実装 (シフトボード) も一方向。**代わりに、双方向が欲しいユーザーは「読み込みたいカレンダーを読み込み対象に選ぶ」という既存機能で満たす** — そちらは Atender カレンダーでない別カレンダーなので輪にならない。
- **書き込み先カレンダーをユーザーに選ばせる (`writeTargetCalendarId` を維持)** — 却下。T1 が「専用カレンダーを作ってそこに入れる」と決めている。書き込み先が任意だと (a) ユーザーの既存カレンダーに Atender が書いた大量の授業が混ざり、(b) それが読み込み対象と重なった瞬間に B5 が再発し、(c) 「Atender の書いたものだけ全部消す」が安全にできなくなる。**専用カレンダーは「全消しが安全にできる」ことに最大の価値がある。**
- **`calendarIdentifier` だけを保存し、消えたら諦める** — 却下。`calendarIdentifier` は sync-proof でない (ヘッダ逐語「a full sync will lose this identifier」) ので、iCloud の再ログインで必ず失われる。title フォールバック (§5.1-3) が無いと**そのたびに新しい Atender カレンダーが増える**。
- **`sourceType == .local` に決め打ちでカレンダーを作る** — 却下。TN QA1926 逐語「We hide your local calendars if they are empty」。iCloud が有効な端末では**作ったのに標準カレンダー App に出てこない**。`defaultCalendarForNewEvents?.source` を第一候補にする。
- **`sourceType == .calDAV && title == "iCloud"` で iCloud を判定する** — 却下。`EKSource.title` はユーザーが変更できる (library note)。
- **write-only アクセスで書き出しだけ動かす** — 却下。公式 doc 逐語「it can't access any of the existing calendars and events on the device, **including events your app created**」。作った専用カレンダーを再取得できないので「毎回見つからない → 再作成」に陥る。**full access 必須**であり、write-only は `.accessWriteOnly` エラーとして扱う。
- **アプリ側 (UserDefaults) や backend に「Atender の項目 ⇄ EK イベント」の対応表を持つ** — 却下。(a) UserDefaults は再インストールで飛び、飛んだ瞬間に既存の書き出しが孤児になって重複する。(b) backend に持つと EK が端末ごとに別物なのに 1 つの表を共有することになり、2 台目で壊れる。(c) ユーザーが標準 App で 1 件だけ消したときに表と実体がずれる。**識別子を成果物 (`EKEvent.url`) 自身に書けば、毎回 EK を読むだけで真の状態が分かる。**
- **識別子を `notes` の末尾行に埋める** — 却下。ユーザーに見えるメモ本文が汚れる。授業のメモには「1-2限 / 担当: …」という実用情報を入れる方針なので、そこに機械可読の ID を混ぜると読みづらい。`url` は詳細画面の独立した 1 行に収まる。
- **`calendarItemExternalIdentifier` を同定キーにする** — 却下。(a) 繰り返しの全 occurrence で同値になる (library note)。(b) 同一 DB 内で重複しうる。(c) そもそも「どの授業のどの日か」という**我々の意味**を持たないので、EK から読んだだけでは何に対応するか分からず、結局対応表が要る。
- **窓の中を毎回全削除して全再作成する (差分を取らない)** — 却下。授業だけで学期あたりおよそ 400 件になり、それを前面化のたびに削除→作成すると (a) iCloud 同期トラフィックが跳ね、(b) `EKEventStoreChanged` が毎回発火して自己ループの温床になり、(c) 標準 App の通知や「最近削除した項目」が汚れる。差分は `url` キーで正確に取れる。
- **`url` が保存されない環境向けに「窓内を全削除して全再作成」のフォールバックモードを持つ** — 却下。owned と foreign を区別できない状態で全削除すると、ユーザーが Atender カレンダーに手で作った予定を消す。**識別できないなら書かない** (`identityUnavailable` エラーで停止し、可視化する) 方が安全。
- **`EventKitUI` の `EKEventEditViewController` で予定を編集させる** — 却下。この UI は **EK 側にイベントを作る**ので、「Atender カレンダーの正典は backend」という不変条件 (§3) が壊れる。作られた予定は Atender に存在せず、次の書き出しで差分エンジンに foreign 扱いされて放置されるか、owned 判定できずに矛盾する。個人予定の編集 UI は D2 §6.5 の自前エディタが正典。
- **`EKCalendarChooser` で書き込み先を選ばせる** — 却下。書き込み先は Atender カレンダー固定 (T1)。読み込み対象の選択は既存のトグル一覧で足りており、`EKCalendarChooser` を出すと「Atender カレンダーを読み込み対象に選べてしまう」= B5 の再発経路を作る。
- **授業を `MeetingExpansion.expandUserTimetable` でクライアント展開して書き出す (backend endpoint を作らない)** — 却下。(a) 科目単位の休講 (`courseSuspension`) を知らないので休講の授業を書き出してしまう。(b) 出欠の `CANCELLED` も知らない。(c) 生成する id (`"m:courseId:date:startMinute"`) が `MeetingOccurrence` の実体と結び付かないので、時間割を編集したときの追随がずれる。(d) materialize の規則がサーバとクライアントの 2 実装になる。**`MeetingOccurrence` の正典は backend なので backend から取る。**
- **`GET /api/day/:date` を窓の日数ぶん (366 回) 叩く** — 却下。往復回数が非現実的。範囲取得の endpoint を 1 本足す方が安い。
- **`hasActiveTimetable` を返さず、`occurrences` が空なら「授業なし」と解釈する** — 却下。時間割を一時的に持たない状態 (学期を作り直している最中など) で sync が走ると、**書き出し済みの授業を全部削除する**。「空」と「不明」は別の状態であり、区別しないと破壊が起きる。
- **授業の窓を「学期全体」にする** — 却下寄り。(a) 学期の範囲を知るために追加の往復が要る。(b) 個人予定の窓 (D2 の 366 日上限に縛られる) と別の窓になり、掃除の窓を kind ごとに分ける必要が出て、差分アルゴリズムが 2 本になる。**単一窓 (今日−31日〜今日+334日) にすると `plan` が 1 本で済む。** 学期は最長でも 6 ヶ月程度なので窓に収まる。窓より前に始まった学期の授業は「既に書いた分がそのまま残る」= 履歴として妥当。
- **休講の授業を EK から消さず、タイトルに「【休講】」を付ける** — 却下。カレンダーは「その時間に何があるか」を示すもので、休講は「無い」。タイトルを飾ると (a) 標準 App の検索結果に休講が混ざり、(b) 他人と共有したときに意味が伝わらず、(c) 「休講が解除されたらタイトルを戻す」という余計な状態遷移が増える。
- **欠席した授業を EK から消す / 印を付ける** — 却下。授業はその時間に実在した。EK 側は予定表であって出欠簿ではない。出欠の記録・表示は Home の CTA と 学期・科目が担当する (CLAUDE.md の IA 規約)。
- **EKAlarm (通知) を付ける** — 却下 (T3)。かつ「カレンダーによっては保存時に黙って切り捨てられる」(ヘッダ逐語) ので、付けても付いたか分からない。
- **オンボーディングに権限要求ステップを追加する** — 却下。セットアップフロー (`SetupFlowView`) は学校・学科・時間割の登録という「アプリを使うのに必須」なものだけを扱っており、任意機能の権限を割り込ませると完了率が落ちる。**代わりに、カレンダー画面を開いたときの 1 行バナー (§7.2) で誘導する** — 書き出しの価値が一番伝わる文脈で、かつ × で永久に消せる。
- **エラーをトーストだけで出す** — 却下。トーストは 2.6 秒で消えるので、バックグラウンドで起きた失敗 (前面化トリガなど) は見られないまま消える。**恒常的な表示 (設定シートの同期状態 + カレンダー画面のバナー) を正典にし、トーストはユーザーが自分で押した操作 (「今すぐ書き出す」) の結果にだけ使う。**
- **`EventKitService` を `@MainActor` のまま残す** — 却下 (B8)。学期ぶんの授業を書くと数百件の `save` が主スレッドを占有する。`actor` にすれば `EKEvent` を外に出さないまま協調プールで動く。
- **`QueryClient` を触らず、書き出しトリガを各リポジトリの呼び出し元に手で撒く** — 却下。`invalidationTargets(for:)` の呼び出しは **40 箇所** (grep 実測) あり、撒き漏らしが必ず出る。`invalidate(prefixes:)` に 1 行足せば 40 箇所すべてを 1 点で拾える。
- **build 11 が push 済みのイベントを放置する** — 却下。同じ予定が「ユーザーの既定カレンダー」と「Atender カレンダー」の 2 箇所に出続ける。掃除は endpoint 2 本 + 一度きりの実行で済む。
- **build 11 の push 済みイベントを D2 の migration (SQL) で処理する** — 却下。SQL で `ekExternalId` を null にしても、**EK 側の実体は消えない**。消せるのは端末上のアプリだけ。

---

## 14. 既存 doc の置換 (仕様マークダウンの編集規律)

### 14.1 `.designs/20260723-calendar-eventkit-sync-and-redesign.md`

D2 §14.2 が置換する箇所とは**重ならない** (D2 は §G4 / §目的3 / §F4.2 / §F4.3 / §F4.5 / §F4.6 / §C2 / §C3 / §1.1 / §2.1 / §2.2 / §不採用案の full-bleed 2 項目を扱う)。本 doc は EventKit 同期の実装記述だけを置換する。**旧記述を残さない。**

| 節 | 旧記述 | 置換後 |
|---|---|---|
| §G1 (`:13-15`) | 「source of truth — 案A 採択 (EK 主 + Atender 発だけ push)」 | 「**2026-07-29 に方向を分離**。書き出し先は専用「Atender」カレンダーで **Atender が唯一の正典・一方向**。読み込みは Atender カレンダー**以外**からのみで EK が正典。正典は `.designs/20260729-eventkit-dedicated-calendar-export.md` §3」 |
| §2.4 の「権限・I/O ラッパ」(`:258-287`) | `@MainActor @Observable final class EventKitService` のシグネチャ一式 + 「書き込み先カレンダー: ユーザーが設定」 | 節ごと削除し「→ 20260729-eventkit doc §6.4 に移管。`EventKitService` は **`actor EventKitStore` に置換**され、書き込み先は専用「Atender」カレンダー固定 (ユーザー設定を廃止)」の 1 行に置換 |
| §2.4 の「純ロジック」(`:289-313`) | `ReconcilePlan` / `EventKitReconciler.pushTargets` の宣言 | 「`ReconcilePlan` と `pushTargets` は**廃止**。書き出しは `CalendarExportPlanner`。→ 20260729-eventkit doc §5.4」に置換。`EKEventSnapshot` の行は D2 §6.10 が置換済とする |
| §2.4 の「オレストレータ」(`:330-343`) | `sync(range:)` の 4 手順 + `linkedCalendarIds` / `writeTargetCalendarId` | 節ごと削除し「→ 20260729-eventkit doc §6.5。`linkedCalendarIds` は**読み込み専用のゲート**になり書き出しを止めない。`writeTargetCalendarId` は**廃止**」に置換 |
| §F4.7 (`:449-455`) | 「書き込み先カレンダー: `allowsModify=true` のカレンダーから 1 つ選択。既定 `defaultCalendarForNewEvents`」 | 「書き込み先は専用「Atender」カレンダー固定 (選択 UI を廃止)。設定シートは 権限 / 書き出しトグル / 同期状態 / 読み込み対象 の 4 節。→ 20260729-eventkit doc §7.1」 |
| §S (`:476-482`) | `EventKitTimeMapping` の S1-S6 | 「→ D2 §6.10 で `toPersonalDays` が廃止され、本項目は D2 の EventKitTimeMapping テストへ移管」の 1 行に置換 |
| §E (`:494-497`) | echo/dedup の E1-E3 (`recentlyWritten` 5 秒) | 「→ 20260729-eventkit doc §5.5 TR-E に置換。抑止は `recentlyWritten` セットでなく `lastSelfWriteAt` の 3 秒間で行う」 |
| §P (`:499-503`) | 権限 P1-P4 (「writeOnly は双方向不可の旨 + full 再要求導線」「権限剥奪は握り潰し」) | 「→ 20260729-eventkit doc §8 ST 系と §7.4 に置換。**エラーは握り潰さず必ず可視化する** (旧 P4 の「握り潰す」方針は撤回)」 |
| §C6 (`:522`) | 「追加→双方向: 月画面の追加導線で作成 → backend 保存 + EK へ push」 | 「追加→**一方向書き出し**: 作成 → backend 保存 → 次の同期で Atender カレンダーに現れる (個別 push は廃止)。→ 20260729-eventkit doc §8 EK3」 |
| §テスト基盤 iOS (`:538-541`) | `EventKitTimeMappingTests` / `EventKitReconcilerTests` (echo/dedup) | 「→ 20260729-eventkit doc §9。`EventKitReconcilerTests` の `pushTargets` 系は削除、純ロジック 7 スイートを新設」に置換 |
| §フェーズ 5 (`:553`) | 「F4b iOS EventKit 同期層 + 設定 UI + 月画面の予定追加導線 — F2 依存」 | 「F4b は **20260729-eventkit doc §11 の E1-E8 に置換**」 |
| §不採用案 (`:563`) | 「案B: 完全対称双方向 — 却下」の理由文 | 維持しつつ末尾に「**2026-07-29: 案A もさらに絞られ、Atender カレンダーは一方向の書き出し専用になった** (20260729-eventkit doc §3)」を追記 (方向が変わっていないので追記でよい) |
| §不採用案 (`:566`) | 「`ekExternalId` に DB unique 制約 — 却下。複合キー `(userId, ekExternalId, date)` をアプリ層照合」 | 「…複合キー **`(userId, ekExternalId, ekOccurrenceStart)`** をアプリ層照合 (D2 §3.1)」 |

**編集記録の 1 行**: 「20260723 doc の EventKit 実装記述 (案A の双方向前提 / `EventKitService` の MainActor シグネチャ / `ReconcilePlan`・`pushTargets` / `writeTargetCalendarId` のユーザー選択 / echo 抑止 5 秒セット / 権限エラーの握り潰し / S・E・P 系の挙動仕様) を消して、専用「Atender」カレンダーへの一方向書き出し (本 doc への参照) に置換した。」

### 14.2 `DESIGN.md`

**変更しない。** 本 doc は新しい視覚規則を導入せず、既存トークンと既存部品だけで構成する (§7)。月カレンダーの外殻に関する置換は D2 §14.1 が担当する。

---

## 15. 報告事項 (Leader / Touri 判断・本 doc では決めない)

1. **★ §12 の D2 差分 3 件は Leader の裁定が要る。** 特に差分 A (繰り返しを `EKRecurrenceRule` にしない) は「iPhone の標準カレンダーで繰り返しバッジが出ない」というユーザーに見える差になる。実装を始める前に裁定すること。
2. **書き出し窓の先端はアプリを開いたときにしか前進しない。** 現在は「今日+334日」。1 ヶ月アプリを開かなければ先端は 11 ヶ月先になる。EventKit にバックグラウンド配信の仕組みが無い (library note) ため、これを解決するには BGTaskScheduler (バックグラウンド更新) の導入が要る。**本 doc のスコープ外**。
3. **トークン失効による自動サインアウトでは書き出しが消えない。** §7.7 は設定画面の「ログアウト」ボタンのみをカバーする。401 で強制サインアウトされた場合、前アカウントの授業が Atender カレンダーに残る。別アカウントでログインすると次の同期で `m:`/`p:` の掃除により消えるので実害は 1 回の同期ぶんだが、多アカウント運用を始めるなら手当が要る。
4. **Atender カレンダー内にユーザーが手で作った予定 (foreign) は永久に残る。** 削除も上書きもしない (PL7)。設定シートの `ExportSummary` に件数だけ出る。「Atender カレンダーは Atender 専用なので手で足したものも消す」という方針にするなら**プロダクト判断**なので Touri に上げること。
5. **`EKEvent.url` が iCloud CalDAV 経由で保持されることは一次ソースで確認したが、実機で往復させていない。** §4.1 の read-back 検証で失敗は検出できるが、検出したら書き出しが止まる。**EK6 / EK7 の実機確認が実質この検証を兼ねる**ので、Touri の確認では特にここを見ること。
6. **`EventKitService` → `actor EventKitStore` の置換の波及範囲は小さい。** `EventKitService` 型そのものを名指ししているのは grep 実測で **2 ファイルだけ** (`CalendarSyncCoordinator.swift:7,15,27,37` と `AppEnvironment.swift:27,59`)。前者は本 doc で全面書き換えするので、機械的な追随が要るのは `AppEnvironment.swift` のみ。`CalendarSyncSettingsSheet.swift` は `calendarSyncCoordinator` 経由 (14 箇所) で触っており、これも本 doc で全面書き換えする。
7. **`GET /api/occurrences` は本 doc 以外にも使い道がある** (Web の月カレンダーが授業をクライアント展開しているのを置き換えられる)。今回は iOS の書き出しからしか呼ばない。Web の置き換えは follow-up。
