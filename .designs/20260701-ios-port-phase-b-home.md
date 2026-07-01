# Atender iOS 忠実移植 — Phase B: ホーム + 出欠ループ

> **正典**: `.designs/20260701-ios-faithful-port-architecture.md` (マスター, 以下「マスター」) と `.designs/20260701-web-to-ios-port-bible.md` (Port Bible)。本書はマスターの Phase B 行 (§1.6) を実装着手粒度に展開する。**データ層・共通コンポーネント規約はマスター Part 1 準拠**、それを再定義しない。
>
> 一次資料 (Web 現物、`apps/web/src/`): `components/home/*`, `components/today/MainAttendanceCTA.tsx`, `components/timetable/*`, `components/rooms/calendar/{CalendarMonth,CalendarWeek,CalendarDay,DayAgendaPanel,CalendarSegmented,PeriodNav}.tsx`, `components/sheet/TimetableSettingsSheet.tsx`, `components/semester/CourseEditModal.tsx`, `lib/{coalesceTimetableEvents,meetingExpansion,calendarRange,calendarLane,calendarEventDisplay}.ts`, `api/hooks/{useTodayOccurrences,useUserTimetable,usePersonalEvents,useSemesterOverview}.ts`。
>
> 絶対方針: **Web と完全一致**。スマホ独自の簡略化・改変・新 UX をしない。迷ったら Web の現物に合わせる。実装で迷う余地を残さない。

---

## 目的

Home タブ (`/`) の中身と出欠ループを Web と 1:1 で移植する。具体的には: (1) `ContextChips` / `HomeViewModeTabs` / `HomeSemesterPicker` / `HomeBody` の縦積み構成、(2) self モード 2 種 (self×timetable = `SelfTimetableView` + `TimetableView` グリッド、self×calendar = `PersonalCalendar`)、(3) 下部固定 `SelfTodayCTA` (`MainAttendanceCTA`) の楽観更新出欠ループ、(4) それらに紐づく CRUD シート群。Phase A のデータ/キャッシュ層・共通コンポーネント基盤に実接続する。

---

## スコープ / スコープ外 (先に線引き)

### Phase B に含む

- Home 縦積み全体 (ContextChips / HomeViewModeTabs / HomeSemesterPicker / HomeBody dispatcher)。
- **self モード 2 分岐のみ**: `self×timetable` → `SelfTimetableView`、`self×calendar` → `PersonalCalendar`。
- `TimetableView` グリッド (periodIndex ベース・連続コマ結合・同一セル横並び) + `EventTile`。
- `SelfTodayCTA` + `MainAttendanceCTA` (楽観更新 + ロールバック + 403 SETUP_REQUIRED + トースト)。
- CRUD シート: `MeetingEditModal` (create/edit) + `PeriodChips` / `PeriodChipsPreview` + ネスト `CourseEditModal` (stackLevel 2)、`MeetingDetailSheet`、`TimetableSettingsSheet` + `DayChips`。
- カレンダー描画部品: `CalendarMonth` / `CalendarWeek` / `CalendarDay` / `DayAgendaPanel` / `CalendarSegmented` / `PeriodNav`。
- 純粋ロジック移植: `DayConvention` / `coalesceTimetableEvents` / `expandUserTimetable` / `calendarRange` / `assignLanes` / `groupPeriods` / `isContiguous` / `eventDisplay`。
- Phase B が使う Repository と mutation 配線 (attendance 楽観更新 + invalidation 実接続)。

### Phase B に**含まない** (スコープ外 — 各理由付き)

| 除外項目 | 理由 / 移送先 |
|---|---|
| **room モード 2 種** (`room×timetable`=`RoomTimetable` / `room×calendar`=`RoomCalendar`) | room データ (RoomWeekDto 等) は Phase D 依存。`HomeBody` の分岐 4 本のうち room 2 本は**プレースホルダ**を返す。ContextChips の room chip は Phase D で有効化 (下記「Phase D 拡張の耐性」参照)。 |
| **ContextChips の room chip 実データ** | `useRooms` は Phase D。Phase B では chip リストに「自分」1 件のみ + ＋ボタン。＋タップは Web と同じくルームタブへ遷移 (`router.selectedTab = .rooms`)。 |
| **Lyric スクロール** (`OccurrenceLyricCard` / `TimetableScroll` / `ReturnToNowFAB`) | Web の `Today.tsx` 専用。現行 Web の `/` (Home) では**描画されない** (Home.tsx を実読済: `SelfTodayCTA` のみ)。忠実移植の原則「Web の `/` で見えないものは出さない」に従い **Home に出さない**。Home の出欠 UI は `SelfTodayCTA` (下部バー) が唯一。§不採用に明記。 |
| **PersonalCalendar の個人予定 CRUD / PersonalEventEditModal** | Web の `components/home/PersonalCalendar.tsx` を実読した結果、**Home の PersonalCalendar は完全に read-only** (予定追加 FAB なし・セル/イベント tap で編集モーダルを開かない・`useCreate/Update/DeletePersonalEvent` を import しない)。個人予定 CRUD と `PersonalEventEditModal` は `/semester` の `DayDetailSheet` (Phase C) 専用。要望文の「PersonalCalendar 個人予定 CRUD」は Web 実装と不一致のため**採らない** (忠実移植優先)。`PersonalEventEditModal` は Phase C。 |
| **AttendanceCalendar (出欠特化)・Hero・CourseListItem・DayDetailSheet・BulkEditSheet** | `/semester` (Phase C)。 |
| **時間割コマ削除の確認ダイアログ差し込み** | Web は `MeetingDetailSheet` の「削除」で即 `useDeleteMeeting` (confirm なし)。忠実に confirm を挟まない。 |

### Phase D 拡張の耐性 (今 self 2 本だけ作るが将来 4 本に耐える形)

- `HomeContext` は列挙で `self` / `room(roomId)` を最初から両方定義する (room 分岐の器を残す)。
- `HomeBody` の dispatcher は 4 分岐すべてを `switch` で書き、room 2 本は `RoomTimetablePlaceholder` / `RoomCalendarPlaceholder` (「ルーム表示は準備中」) を返す。Phase D はこの 2 返り値を差し替えるだけ。
- `ContextChips` は `items: [ContextChipItem]` を受け、`self` 固定 + room 可変で描ける形にする。Phase B は呼び出し側が `[.self]` のみ渡す。Phase D で `rooms.map { .room(...) }` を足す。
- `TimetableView` は自分用・ルーム用共用 (Web と同じ)。Phase B で完成させ、Phase D の `RoomTimetable` はイベント供給を差し替えるだけで再利用する。

---

## 前提: Phase A から使う (再定義しない)

Phase A (merged, commit `81e31e5`/`5b92fe2`) の下記を**そのまま使う**。シグネチャは実在確認済:

- **DTO** (`Core/Models/DTOs.swift`): `OccurrenceDto` (`var status: AttendanceStatus?`), `TodayResponse` (`var occurrences: [OccurrenceDto]`), `UserTimetableDto`, `DaySlotDto`, `CourseDto`, `MeetingDto` (`dayOfWeek: Int` = 0..6, `startPeriodIndex`, `periodCount`), `MeetingBulkCreateInput` (`startPeriodIndexes: [Int]`), `MeetingUpdateInput`, `UserTimetableCreateInput`, `UserTimetablePatchInput`, `MarkAllPresentInput` (`var date/status`), `MarkAttendanceInput`, `PersonalEventDto`, `SemesterDto`, `SemesterOverviewDto` (`days: [AttendanceDaySummary]`), `AttendanceDaySummary` (`status: AttendanceDayStatus`), `CourseCreateInput`, `CourseUpdateInput`, `TemplateDto`, `TemplateCopyInput`。
  - **不足なら本 Phase で追加** (下記「DTO 追加/確認」参照)。
- **enum** (`Core/Models/Enums.swift`): `AttendanceStatus`, `AttendanceDayStatus`。
- **エンドポイント** (`Core/Networking/APIEndpoint.swift`, `enum Endpoints`): `today`, `markAllPresent`, `markAttendance`, `userTimetables`, `createUserTimetable`, `patchUserTimetable`, `publishAsTemplate`, `createCourse`, `updateCourse`, `createMeetingsBulk`, `updateMeeting`, `deleteMeeting`, `semesters`, `semesterOverview`, `personalEvents`, `templates`, `copyTemplate`。
- **データ層** (`Core/Data/`): `QueryClient` (`data/setData/keys/invalidate/isStale/snapshot/restore/removeAll`), `QueryKey` (`.today/.userTimetables/.semesters/.semesterOverview/.stats/.dayPrefix/.personalEvents/.me/.rooms` 等 factory + `hasPrefix`), `invalidationTargets(for: Mutation)` (全 case 実装済), `AttendanceOptimistic.applyMarkAll/applyPatch`, `Query<Value>`, `MeRepository`。
- **共通コンポーネント** (`Core/DesignSystem/Components/`): `BottomSheet<Content,Footer>` (3 経路 close 内蔵、`title/isPresented/detents/stackLevel/onDismiss/content/footer`、Footer==EmptyView 版 init あり), `AtenderButton`, `Panel`, `EmptyState`, `Chip`, `StatusDot`, `Skeleton`, `Toast`+`ToastCenter`, `ConfirmDialog`。
- **デザイントークン**: `Color.*` (accent500/statusPresent 等 + `forStatus`/`forDayStatus`), `Font.atender*`, `Space.*` (`selfTtChrome=352`/`tabBarHeight=64` 等), `Radius.*` (`timetableCell=8`/`full`), `AtenderShadow` (`.glowSoft`/`.card`) + `.atenderShadow(_:)`。
- **shell**: `AppRouter` (`selectedTab: MainTab`, `homePath` 等 NavigationPath), `AppEnvironment` (`authStore/apiClient/queryClient/toastCenter/appRouter`), `MainTabView` + `BottomTabBar`。`HomePlaceholderView` を本 Phase の `HomeView` に差し替える。

DI は Phase A 流儀 (`@MainActor @Observable final class`、依存は init 注入、`@ObservationIgnored` for 非観測依存) を踏襲する (gotcha `swiftui-final-mainactor-store-not-mockable-in-xctest`)。

---

## 画面構成 (Home 縦積み)

Web `Home.tsx` (`space-y-3 pb-32`) の忠実写し。

```
┌─ HomeView (NavigationStack root, 設定タブ以外の Home タブ) ───────┐
│  ScrollView (縦, spacing = Space.s3, 下 padding = 128pt)            │
│   ┌─ ContextChips ── 横スクロール: [自分] (+ room…Phase D) [＋]     │
│   ├─ HomeViewModeTabs ── ピル: [時間割 | カレンダー]                │
│   ├─ (self && mode==calendar のみ) HomeSemesterPicker              │
│   ├─ HomeBody ── 4 分岐 dispatcher                                 │
│   │     self×timetable → SelfTimetableView                        │
│   │     self×calendar  → PersonalCalendar                         │
│   │     room×timetable → RoomTimetablePlaceholder  (Phase D)      │
│   │     room×calendar  → RoomCalendarPlaceholder   (Phase D)      │
│   └────────────────────────────────────────────────────────────  │
│  (self && mode==timetable のみ) SelfTodayCTA ← 下部固定オーバレイ  │
└────────────────────────────────────────────────────────────────┘
```

- Web の分岐条件 (`Home.tsx`) をそのまま:
  - `HomeSemesterPicker` を出す条件 = `context==.self && mode != .timetable` (= self×calendar のみ)。
  - `SelfTodayCTA` を出す条件 = `context==.self && mode == .timetable`。
- 状態は Home ルート View が保持 (Web は `Home.tsx` の useState):
  - `context: HomeContext` (初期 `.self`)
  - `mode: HomeViewMode` (初期 `.timetable`)
  - `semesterId: String?` (初期 nil。`me.user.defaultSemesterId` が来たら一度だけ埋める = Web の `useEffect`)。
- `SelfTodayCTA` は下部固定なので `ScrollView` の外、`ZStack(alignment: .bottom)` で重ねる。CTA 自体が tab bar の上に載る fixed バー (Web `fixed bottom-[--tab-bar-height]`)。

---

## ファイル構成 (新規/改修)

`apps/ios/Atender/` 配下。マスターのディレクトリ規約に合わせる。

```
App/PlaceholderViews.swift        改修: HomePlaceholderView → HomeView 参照へ (Home 実装は Features/Home)
Features/Home/
  HomeView.swift                  新規: 縦積み root + 状態保持
  HomeContext.swift               新規: enum HomeContext / HomeViewMode / ContextChipItem
  ContextChips.swift              新規
  HomeViewModeTabs.swift          新規
  HomeSemesterPicker.swift        新規 (BottomSheet 使用)
  HomeBody.swift                  新規: dispatcher (room 2 本は placeholder)
  SelfTimetableView.swift         新規 + SelfTimetableViewModel.swift
  PersonalCalendar.swift          新規 + PersonalCalendarViewModel.swift
  SelfTodayCTA.swift              新規 + SelfTodayViewModel.swift
  RoomPlaceholders.swift          新規: RoomTimetablePlaceholder / RoomCalendarPlaceholder
Features/Timetable/
  TimetableGrid.swift             新規: periodIndex グリッド本体 (Web TimetableView 相当)
  EventTile.swift                 新規
  PeriodLabelCell.swift           新規 (Web PeriodLabel)
  EmptyCell.swift                 新規
  MeetingEditModal.swift          新規
  MeetingDetailSheet.swift        新規
  PeriodChips.swift               新規 + PeriodChipsPreview.swift
Features/Calendar/
  CalendarMonth.swift             新規
  CalendarWeek.swift              新規
  CalendarDay.swift               新規
  DayAgendaPanel.swift            新規
  CalendarSegmented.swift         新規
  PeriodNav.swift                 新規
Features/Course/
  CourseEditModal.swift           新規 (Web components/semester/CourseEditModal)
Features/Settings/ (sheet)
  TimetableSettingsSheet.swift    新規
  DayChips.swift                  新規
Core/Timetable/                   ← 純粋ロジック (テスト対象)
  DayConvention.swift             新規
  TimetableCoalesce.swift         新規 (coalesceTimetableEvents)
  MeetingExpansion.swift          新規 (expandUserTimetable / eventsByDate)
  CalendarRange.swift             新規 (monthGridRange / weekStartsFor / mondayOf)
  CalendarLane.swift              新規 (assignLanes)
  CalendarEventDisplay.swift      新規 (eventColor / eventTitle / dayStatusColor / dayStatusLabel)
  PeriodGrouping.swift            新規 (groupPeriods / renderPeriodPreview / isContiguous / meetingRange)
Core/Data/ (Repository 追加)
  TimetableRepository.swift       新規
  AttendanceRepository.swift      新規
  PersonalEventRepository.swift   新規
  SemesterRepository.swift        新規
```

> **注**: Phase A の `Features/Today/TodayView*`, `Features/Timetable/TimetableView*`, `Features/SemesterOverview/*` は foundation doc 由来の旧 IA。**Phase B は流用しない** (新規 `Features/Home` を作る)。旧ファイルの削除は本 Phase では**任意** (ビルドから外れていれば放置可)。命名衝突を避けるため新グリッドは `TimetableGrid` (旧 `Features/Timetable/TimetableView.swift` と別名) とする。

---

## 純粋ロジック移植 (Swift 確定シグネチャ / Reviewer テスト対象)

副作用ゼロ。すべて `@testable import Atender` で同期テスト可能。gotcha `design-doc-must-specify-swift-type-signatures` 順守で確定形。

### DayConvention.swift (Web `dayConvention.ts`)

曜日規約が 2 系統あるので**混在に注意** (knowledge `personal-calendar-data-source-meeting-expansion`)。`MeetingDto.dayOfWeek` = JS 0=日..6=土。グリッド表示系 = 1=月..7=日。

```swift
enum DayConvention {
    /// JS 0=日..6=土 → 表示 1=月..7=日
    static func jsToDisplay(_ js: Int) -> Int { ((js + 6) % 7) + 1 }
    /// 表示 1=月..7=日 → JS 0=日..6=土
    static func displayToJs(_ display: Int) -> Int { display % 7 }
    /// 設定曜日 ∪ 授業のある曜日 を表示系 1..7 昇順。空なら [1,2,3,4,5]
    static func resolveDisplayDays(daysOfWeek: [Int], meetings: [MeetingDto]) -> [Int] {
        var set = Set(daysOfWeek.isEmpty ? [1,2,3,4,5] : daysOfWeek)
        for m in meetings { set.insert(jsToDisplay(m.dayOfWeek)) }
        return set.sorted()
    }
    /// 今日の曜日 (JS)。土日は月(1)に丸める (Web getTodayDayOfWeek)
    static func todayDayOfWeekJs(_ date: Date = Date(), calendar: Calendar = .current) -> Int {
        let w = calendar.component(.weekday, from: date) - 1 // Swift 1=日 → 0=日
        return (w == 0 || w == 6) ? 1 : w
    }
}
```
Web `jsDowToDisplay((jsDow+6)%7)+1` / `displayDowToJs = display%7` / `resolveDisplayDays` / `getTodayDayOfWeek(day===0||6 → 1)` と一致。

### TimetableCoalesce.swift (Web `coalesceTimetableEvents.ts`) — knowledge `timetable-consecutive-cell-grid-row-span-coalesce`

```swift
struct TimetableEventInput: Equatable, Identifiable {
    let id: String
    let dayOfWeek: Int          // 表示系 1..7
    let startPeriodIndex: Int
    var periodCount: Int
    let color: String           // hex
    let title: String
    let subtitle: String?
    let mergeKey: String?       // nil は結合対象外 (素通し)
}

enum TimetableCoalesce {
    /// 同一 (dayOfWeek, mergeKey) かつ period 隣接を 1 ブロックに結合。
    /// mergeKey==nil は素通し。id は先頭 event を温存。
    /// 出力は (dayOfWeek asc, startPeriodIndex asc, 入力順 asc) 安定ソート。
    static func coalesce(_ events: [TimetableEventInput]) -> [TimetableEventInput]
}
```
アルゴリズム (Web 完全一致):
1. `mergeKey==nil` は passThrough に入力順 order 付きで退避。
2. 残りを `"\(dayOfWeek):\(mergeKey)"` でグルーピング。
3. 各グループを `(startPeriodIndex asc, order asc)` でソート。先頭から走査し `next.startPeriodIndex == current.startPeriodIndex + current.periodCount` なら `current.periodCount += next.periodCount` (吸収)、そうでなければ current を確定して新規開始。id/color/title 等は current (先頭) を温存。
4. passThrough + merged を `(dayOfWeek asc, startPeriodIndex asc, order asc)` で安定ソートして返す。

### MeetingExpansion.swift (Web `meetingExpansion.ts` の `expandUserTimetable` / `eventsByDate`)

```swift
enum CalendarEventKind: Equatable { case meeting, personal }   // Phase B は meeting/personal のみ (roomEvent は Phase D)

struct CalendarEvent: Equatable, Identifiable {
    let kind: CalendarEventKind
    let id: String              // 一意キー (下記 keying 規約)
    let date: String            // "YYYY-MM-DD"
    let title: String
    let startMinute: Int
    let endMinute: Int
    let color: String           // 表示色 (meeting=course color / personal=event color)
    let subtitle: String        // meeting="自分" / personal="自分"
    // meeting 専用 (personal では未使用)
    let courseId: String?
}

enum MeetingExpansion {
    /// 時間割を [rangeStart, rangeEnd] に日付展開して実授業イベント化。
    /// - dayOfWeek 判定は JS 0..6 (meeting.dayOfWeek を dayjs().day() と直接比較)
    /// - startMinute = daySlot(startPeriodIndex).startMinute
    ///   endMinute   = daySlot(startPeriodIndex + periodCount - 1).endMinute (無ければ startSlot)
    /// - statusByDate[date]=="NO_CLASS" の日はスキップ / "ALL_SUSPENDED" は展開する
    /// - semesterStart/End 外はスキップ / daySlot 不在の meeting はスキップ
    /// 出力は (date asc, startMinute asc) 安定ソート。
    static func expandUserTimetable(
        meetings: [MeetingDto],
        courses: [CourseDto],
        daySlots: [DaySlotDto],
        rangeStart: String,
        rangeEnd: String,
        semesterStart: String?,
        semesterEnd: String?,
        statusByDate: [String: AttendanceDayStatus]
    ) -> [CalendarEvent]

    static func eventsByDate(_ events: [CalendarEvent]) -> [String: [CalendarEvent]]
}
```
- 色: `course.color ?? fallbackMemberColor(courseId)`。fallback は Web `lib/memberColor.ts` を移植 (courseId のハッシュから固定パレット選択)。**`memberColor` も本 Phase で移植** (`Core/Timetable/MemberColor.swift`、Web の実装を 1:1)。personal は `event.color ?? "#8b5cf6"`。
- meeting の `id` keying = `"m:\(courseId):\(date):\(startMinute)"` (Web の CalendarMonth/Week key と整合)。personal は `"e:\(eventId)"`。
- 日付ループは `Calendar`/`DateComponents` で行うが、比較は文字列 `"YYYY-MM-DD"` 辞書順 (Web と同じ `date < semesterStart`)。dayjs 依存を作らず、`"YYYY-MM-DD"` 前提の自前 date util (`Core/Timetable/CalendarRange.swift` に集約) を使う。

### CalendarRange.swift (Web `calendarRange.ts`)

```swift
enum CalendarViewMode: String, CaseIterable { case day, week, month }

enum CalendarRange {
    /// 月曜始まり。日=0 のとき6日戻す, それ以外 day-1 戻す (Web mondayOf)
    static func mondayOf(_ date: String) -> String
    /// 月グリッド範囲 = mondayOf(月初) 〜 +41 日 (6週42日)
    static func monthGridRange(anchorMonthFirst: String) -> (start: String, end: String)
    /// day/week → [mondayOf(anchor)] / month → 6 週分の週頭 (7要素…Webは6要素: firstWeekStart..+5週)
    static func weekStartsFor(_ mode: CalendarViewMode, anchor: String) -> [String]
    // 補助
    static func addDays(_ date: String, _ n: Int) -> String
    static func format(_ date: String, _ pattern: DateFormatPattern) -> String  // "M/D" 等
}
```
`monthGridRange` は Web と同じく `mondayOf(anchor.startOf("month")) 〜 +41day`。`weekStartsFor(month)` は `firstWeekStart..firstWeekStart+5week` (6 要素)。すべて `"YYYY-MM-DD"` 文字列で計算 (UTC 固定・タイムゾーン非依存、Web dayjs はローカルだが日付のみ扱うので日単位一致)。

### CalendarLane.swift (Web `calendarLane.ts` の `assignLanes`)

```swift
enum CalendarLane {
    struct Laned: Equatable { var event: CalendarEvent; var lane: Int; var laneCount: Int }
    /// endMinute<=startMinute は除外。startMinute asc (同点 endMinute asc) ソート。
    /// 重なりクラスタごとに greedy lane 割当 (最も早く空く lane、無ければ新 lane)。
    static func assignLanes(_ events: [CalendarEvent]) -> [Laned]
}
```
Web の greedy と同一: クラスタ境界は `event.startMinute >= clusterEnd`。lane 探索は `lanes[i] <= event.startMinute` の最初の i、無ければ append。

### CalendarEventDisplay.swift (Web `calendarEventDisplay.ts`)

```swift
enum CalendarEventDisplay {
    static func eventColor(_ e: CalendarEvent) -> String   // meeting/personal は e.color。roomEvent は Phase D
    static func eventTitle(_ e: CalendarEvent) -> String   // meeting=courseName(=title), else title → 常に e.title
    static func dayStatusColor(_ s: AttendanceDayStatus) -> Color   // ALL_PRESENT→present / HAS_ABSENT→absent / HAS_TARDY→tardy / ALL_SUSPENDED→cancelled / else→none
    static func dayStatusLabel(_ s: AttendanceDayStatus) -> String  // 出席/欠席あり/遅刻・早退あり/休講/未記録あり
}
```
色は `Color.status*` トークンを返す (Web の `var(--color-status-*)`)。`ALL_SUSPENDED → statusCancelled` (Web 準拠。マスター A-1-1 の forDayStatus とは別で、こちらはドット色専用の Web `dayStatusColor` に一致させる)。

### PeriodGrouping.swift (Web `PeriodChipsPreview.tsx` / `MeetingEditModal` の period ロジック)

```swift
enum PeriodGrouping {
    struct Group: Equatable { let start: Int; let count: Int }
    /// 連続 period を (start,count) グループに畳む
    static func groupPeriods(_ periods: [Int]) -> [Group]
    /// "1限 (単独)" / "1-3限 (3連続)" を " + " で連結
    static func renderPreview(_ periods: [Int]) -> String
    /// 重複除去+昇順で連続か
    static func isContiguous(_ periods: [Int]) -> Bool
    /// 編集保存用: (startPeriodIndex, periodCount)
    static func meetingRange(_ periods: [Int]) -> (startPeriodIndex: Int, periodCount: Int)
}
```

---

## 各コンポーネント: SwiftUI 構造・状態・操作

配色/余白は Phase A トークンで Web クラスを機械変換 (`bg-accent-500`→`Color.accent500`, `rounded-full`→`Capsule()`, `text-sm`→`.atenderSm`, `font-bold`→`.fontWeight(.bold)`, `shadow-glow-soft`→`.atenderShadow(.glowSoft)`, `bg-bg-muted`→`Color.bgMuted`, `text-fg-secondary`→`Color.textSecondary` 等)。以下は構造・状態・**操作 (「○○で△△」)** を確定する。

### HomeContext.swift

```swift
enum HomeContext: Equatable { case `self`; case room(roomId: String) }
enum HomeViewMode: String, CaseIterable { case timetable, calendar }
enum ContextChipItem: Equatable, Identifiable {
    case selfChip(label: String)               // "自分"
    case room(roomId: String, roomName: String)
    var id: String { switch self { case .selfChip: "self"; case .room(let id, _): id } }
}
```

### HomeView.swift

- `@Environment(AppEnvironment.self)`。
- `@State context: HomeContext = .self`, `@State mode: HomeViewMode = .timetable`, `@State semesterId: String?`。
- `.task`: `me` を Repository から取得 (`environment.queryClient.data(for: .me())` を優先、無ければ MeRepository.me())。`semesterId == nil && me.user.defaultSemesterId != nil` で一度だけ `semesterId = defaultSemesterId` (Web useEffect と同挙動)。
- body:
  ```
  ZStack(alignment: .bottom) {
    ScrollView { VStack(spacing: Space.s3) {
      ContextChips(items: [.selfChip(label:"自分")], selected: context,
                   onChange: { context = $0 }, onAddRoom: { environment.appRouter.selectedTab = .rooms })
      HomeViewModeTabs(mode: mode, onChange: { mode = $0 })
      if context == .self && mode == .calendar { HomeSemesterPicker(semesterId: $semesterId) }
      HomeBody(context: context, mode: mode, semesterId: $semesterId)
    }.padding(.horizontal, Space.pagePxMobile).padding(.bottom, 128) }
    if context == .self && mode == .timetable { SelfTodayCTA() }
  }
  ```
- **操作**: 自分 chip tap で `context=.self` (Phase B は既に self のみ)。＋ tap で `appRouter.selectedTab = .rooms` (Web `navigate({to:"/rooms"})`)。ピル tap で `mode` 切替。

### ContextChips.swift (Web `ContextChips.tsx`)

- `ScrollView(.horizontal, showsIndicators:false)` に `HStack(spacing: Space.s2)`。左右に `-mx-3` 相当のはみ出し (`.padding(.horizontal, Space.pagePxMobile)` を内側に持たせ ScrollView 端で切れる形)。
- 各 chip: `h-10` (`.frame(height: 40)`), `Capsule`, border 1px。
  - active (`selected` と一致): `Color.accent500` border + `Color.accent500.opacity(0.15)` 塗り + `Color.accent500` text + `.atenderShadow(.glowSoft)`。
  - inactive: `Color.borderSubtle` border + `Color.bgElevated` 塗り + `Color.textSecondary`。
  - 左に SF Symbol (`person` for self / `person.2` for room)、`Text(label)` は `.lineLimit(1).truncationMode(.tail)` 最大 14ch 相当。
- 末尾 ＋: `40x40` circle, `Color.bgElevated` + `Color.borderSubtle` border, `plus` symbol, `Color.textTertiary`。tap で `onAddRoom()`。accessibilityLabel「ルームを追加」。
- **操作**: chip tap → `onChange(context)` (`.self` or `.room(id)`)。active 判定 = `selected` と item の一致。
- accessibilityIdentifier "context-chips" をコンテナに (Web `data-testid`)。

### HomeViewModeTabs.swift (Web `HomeViewModeTabs.tsx`)

- `HStack(spacing:0)` を `Capsule().fill(Color.bgMuted)` の中に `padding(4)`。各ボタン `.frame(maxWidth:.infinity)`。
- 選択: `Color.accent500` 塗り + `Color.textOnAccent` + `.atenderShadow(.glowSoft)`。非選択: `Color.textSecondary`。
- ラベル「時間割」/「カレンダー」、`.atenderSm.weight(.bold)`。
- **操作**: tap で `onChange(.timetable | .calendar)`。

### HomeSemesterPicker.swift (Web `HomeSemesterPicker.tsx`)

- `@Binding semesterId: String?`, `@State open = false`, オプション `trailing: AnyView?` (SelfTimetableView から歯車を差す)。
- Repository (`SemesterRepository`) から `semesters` 取得。`current = semesters.first { $0.id == semesterId } ?? semesters.first`。
- 表示行: `HStack { Button { open=true } label: { Text(current?.name ?? "学期を選択").bold(); Image("chevron.down") } ; Spacer(); trailing }`。`minHeight 36`。
- `.sheet` は `BottomSheet(title:"学期を選択", isPresented:$open)` に学期リスト。各行 tap で `onChange(id)` (=`semesterId = id`) + `open=false`。選択中は `Color.accent500.opacity(0.15)` + `Color.accent500`。
- **操作**: 名前 tap でシート開く。行 tap で学期切替 + 閉じる。

### HomeBody.swift (Web `HomeBody.tsx`)

```swift
struct HomeBody: View {
  let context: HomeContext; let mode: HomeViewMode
  @Binding var semesterId: String?
  var body: some View {
    switch (context, mode) {
    case (.self, .timetable): SelfTimetableView(semesterId: $semesterId)
    case (.self, .calendar):  PersonalCalendar(semesterId: semesterId)
    case (.room, .timetable): RoomTimetablePlaceholder()   // Phase D
    case (.room, .calendar):  RoomCalendarPlaceholder()    // Phase D
    }
  }
}
```
`onSemesterChange` は Web では `SelfTimetableView` が内部の HomeSemesterPicker から学期を変える経路 → iOS は `@Binding semesterId` を渡し直接書換 (Web の `onSemesterChange` と等価)。

### SelfTimetableView.swift (Web `SelfTimetableView.tsx`)

**状態** (`SelfTimetableViewModel`):
- 依存: `TimetableRepository`, `SemesterRepository`, `MeRepository` (init 注入), `QueryClient`。
- 保持: `me: MeResponse?`, `semesters: [SemesterDto]`, `timetables: [UserTimetableDto]`, `createdTimetable: UserTimetableDto?`, `loadState`。
- `defaultSlots: [DaySlotDto]` = Web の 5 コマ (1限 540-630 / 2限 640-730 / 3限 780-870 / 4限 880-970 / 5限 980-1070, isBreak=false)。
- `selected: UserTimetableDto?` = `timetables.first { $0.semesterId == semesterId }`。
- `emptyTimetable: UserTimetableDto?` = fallbackSemesterId (`semesterId ?? me.defaultSemesterId ?? semesters.first?.id`) が取れれば `id:"", title:"自分の時間割", daysOfWeek:[1..5], daySlots:defaultSlots, courses/meetings:[]`、無ければ nil。
- `display = selected ?? createdTimetable ?? emptyTimetable`。

**View state** (`@State`): `sheet: (dayOfWeekJs: Int, period: Int)?`, `detailMeeting: MeetingDto?`, `editMeeting: MeetingDto?`, `settingsOpen: Bool`。

**構造**:
- ローディング中 (me/semesters/timetables のいずれか未取得): skeleton (`HStack{ Skeleton(w:128,h:20,cap); Skeleton circle 36 }` + TimetableGrid skeleton days5 rows5)。Web の `TimetableGridSkeleton`。
- `display == nil` → `Panel { Text("先に学期を作成してください。") }`。
- 通常:
  ```
  VStack(spacing: Space.s3) {
    HomeSemesterPicker(semesterId: $semesterId, trailing: 歯車Button(→settingsOpen=true))
    TimetableGrid(
      daySlots: display.daySlots,
      days: DayConvention.resolveDisplayDays(daysOfWeek: display.daysOfWeek, meetings: display.meetings),
      events: display.meetings.map { toEventInput($0, courses: display.courses) },
      onEventTap: { id in detailMeeting = display.meetings.first { $0.id == id } },
      onEmptyCellTap: { displayDow, period in Task { await handleEmptyCell(displayDow, period) } }
    )
  }
  ```
- `toEventInput(m, courses)`: `TimetableEventInput(id:m.id, dayOfWeek: DayConvention.jsToDisplay(m.dayOfWeek), startPeriodIndex:m.startPeriodIndex, periodCount:m.periodCount, color: courses.first{$0.id==m.courseId}?.color ?? "#F97316", title: course?.name ?? "授業", subtitle: m.room, mergeKey: m.courseId)`。
- 歯車: `36x36` circle `Color.textPrimary.opacity(0.08)`, `gearshape` symbol。accessibilityLabel「時間割の設定」。

**操作** (Web と一致):
- **空セル tap** → `handleEmptyCell(displayDow, period)`: `ensureTimetable()` を await → 返った timetable があれば `sheet = (displayToJs(displayDow), period)`。
  - `ensureTimetable()`: `selected != nil || createdTimetable != nil` → それを返す。無ければ `emptyTimetable` を元に `TimetableRepository.createUserTimetable(semesterId:.., title:"自分の時間割", daySlots:defaultSlots, courses:[], meetings:[])` → `createdTimetable = 結果` → 返す。`emptyTimetable==nil` なら nil。
- **授業 tap** → `detailMeeting = 該当`。→ `MeetingDetailSheet` 表示。
  - 詳細内「編集」→ `editMeeting = detailMeeting; detailMeeting = nil` → `MeetingEditModal(mode:.edit)`。
  - 詳細内「削除」→ `TimetableRepository.deleteMeeting(id)` await → `detailMeeting = nil` (confirm なし)。
- **歯車 tap** → `settingsOpen = true` → `TimetableSettingsSheet(timetable: selected ?? createdTimetable)`。
- **MeetingEditModal (create)**: `(selected ?? createdTimetable) != nil` のときのみ生成、`open = sheet != nil`, `initialDayOfWeek = sheet?.dayOfWeekJs ?? DayConvention.todayDayOfWeekJs()`, `initialPeriod = sheet?.period ?? 1`。閉じたら `sheet = nil`。
- **MeetingEditModal (edit)**: `display != nil` のとき、`open = editMeeting != nil`, `meeting: editMeeting`。閉じたら `editMeeting = nil`。

**リロード配線**: mutation (createUserTimetable/createMeetingsBulk/updateMeeting/deleteMeeting/course/copy) 後、Repository が `QueryClient.invalidate(prefixes: invalidationTargets(for:))` を実行。SelfTimetableView は `user-timetables` を表示するので、mutation await 完了後に VM が `reloadTimetables()` を明示呼び (`isStale(.userTimetables())` 判定して load)。他タブ (semester/today) は各画面が appear 時に isStale 判定でリロード (マスター §不採用の「明示 load + isStale」方針)。

### TimetableGrid.swift (Web `TimetableView.tsx`) — periodIndex グリッド

knowledge `timetable-consecutive-cell-grid-row-span-coalesce` + `single-screen-compressed-timetable` 準拠。**分ベースでなく periodIndex ベース**。

**props**:
```swift
struct TimetableGrid: View {
    let daySlots: [DaySlotDto]
    let events: [TimetableEventInput]      // 表示系 dayOfWeek。内部で coalesce
    var days: [Int] = [1,2,3,4,5]          // 表示系
    var onEventTap: ((String) -> Void)?
    var onEmptyCellTap: ((_ displayDayOfWeek: Int, _ periodIndex: Int) -> Void)?
    var height: CGFloat?                    // 既定は下記 chrome 計算
}
```

**配置アルゴリズム** (Web と 1:1):
1. `periodIndexes = daySlots.map(\.periodIndex).sorted()`。`slotByIndex = Dictionary(periodIndex → slot)`。`rowCount = periodIndexes.count`。
2. `coalesced = TimetableCoalesce.coalesce(events)`。
3. **eventGroups**: `coalesced` を `days` に含まれ `periodIndexes` に startPeriodIndex がある物だけ、キー `"\(dayOfWeek):\(startPeriodIndex)"` でグルーピング。各グループ `{ events:[…], maxSpan: max(periodCount) }` (同一開始セル複数 = 横並び)。
4. **occupiedSet**: 各 coalesced event が占有するセル `"\(dayOfWeek):\(periodIndex)"` を、開始行 index から `periodCount` 個 (periodIndexes 配列を辿る) 収集。空セルボタンを出さない判定に使う。
5. **描画** — SwiftUI `Grid` は行スパン非対応なので **`GeometryReader` + 手動レイアウト** を採用 (下記「不採用」に SwiftUI `Grid`/`LazyVGrid` を採らない理由)。
   - 列: `[44pt] + days.count 個の等幅 (1fr = (W-44)/days.count)`。行ヘッダ高 `28pt` + `rowCount` 行 (行高 `= (H-28)/rowCount`)。
   - 背景レイヤ (ZStack 最下): (a) 左上コーナー、(b) 曜日ヘッダ (`Color.bgMuted`, `DAY_LABELS[dayOfWeek-1]` = 月火水木金土日, `.atender(11).weight(.semibold)`)、(c) 各行の限目ラベルセル (`PeriodLabelCell(slot:)`)、(d) 本体セル: `occupiedSet` に無く `onEmptyCellTap` があれば `EmptyCell(onTap:)`、境界線 `Color.borderSubtle` 1px (左/上基準で `border-l border-t` 相当)。
   - イベントレイヤ (背景の上): 各 eventGroup を `dayColumnIndex = days.firstIndex(dayOfWeek)`, `startRowIndex = periodIndexes.firstIndex(startPeriodIndex)`, `span = min(maxSpan, rowCount - startRowIndex)` で矩形計算。frame = `x = 44 + dayColumnIndex*colW`, `y = 28 + startRowIndex*rowH`, `w = colW`, `h = span*rowH`。グループ内 events は `HStack(spacing:2)` で等幅横並び (`.frame(maxWidth:.infinity)`)。各 `EventTile(...)`, tap で `onEventTap(event.id)`。padding 2pt (Web `p-0.5`)。
6. **高さ**: `height ?? UIScreen 高 - Space.selfTtChrome(352) - safeAreaBottom`, ただし `min 320pt` (Web `calc(100dvh - self-tt-chrome - safe-area)` / `minHeight 320`)。実装は親から `.frame(height:)`。self-tt-chrome=352 は ContextChips+ViewModeTabs+SemesterPicker+CTA+TopBar の合算 (Bible §1.3)。

> **gotcha `css-grid-mixed-explicit-auto-placement-collision` 相当の iOS 版**: 背景セルとイベントを別レイヤの絶対配置にするので CSS Grid の自動配置崩れは起きない。ただし **背景セルとイベントの行/列座標計算は同一の `periodIndexes`/`days` 由来関数を共有**し、二重定義しない (座標ズレ防止)。coalesce は **グリッド内部で 1 回だけ** 実行 (呼び出し側は raw events + mergeKey を渡す)。

### EventTile.swift (Web `EventTile.tsx`)

```swift
struct EventTile: View {
    let title: String; let color: String     // hex "#RRGGBB"
    var subtitle: String? = nil; var meta: String? = nil
    var density: Density = .compact           // compact | comfortable
    var align: VAlign = .center               // center | top
    var showPill: Bool = true
    var radius: CGFloat = Radius.timetableCell
    var onTap: (() -> Void)? = nil
    var accessibilityLabel: String? = nil
}
```
- **色ブレンド (Web `color-mix`)**: `tint = mix(color, bgElevated, 15%)` を背景、左 pill = `color` 実色、subtitle 色 = `mix(color, eventMixTarget, 70%)` (dark で white, light で black)。`Color+Mix.swift` に `static func mix(_ a: Color, _ b: Color, _ ratio: Double) -> Color` を追加 (RGB 線形補間、`a*ratio + b*(1-ratio)`。Web `color-mix(in srgb, A r%, B)` = A が r%)。
  - tint: `mix(color, .bgElevated, 0.15)`。subColor: `mix(color, .eventMixTarget, 0.70)`。
- レイアウト: `ZStack(alignment:.leading)` に tint 背景 (`RoundedRectangle(cornerRadius: radius)`), 左 pill (`Capsule` w=2(compact)/4(comfortable), 上下 inset)。テキスト: title `.atender(12).weight(.semibold)` 2 行 clamp (`lineLimit(2)`), subtitle `.atender(10).weight(.medium)` 1 行 (subColor), meta `.atender(10)` textTertiary。padding compact `8/4`。
- tap があれば `Button`, なければ静的。`.frame(maxWidth:.infinity, maxHeight:.infinity)`。

### PeriodLabelCell.swift / EmptyCell.swift

- `PeriodLabelCell(slot:)`: 縦 VStack。`Text("\(slot.periodIndex)").atender(12).weight(.bold)` + `Text(minutesToTime(slot.startMinute).prefix(5)).atender(8).monospacedDigit().foregroundStyle(Color.textTertiary)`。`Color.bgMuted` 背景。`minutesToTime` は Phase A `Core` に無ければ追加 (`m -> "HH:mm"`)。
- `EmptyCell(onTap:)`: `Button` 全面, `Color.bgBase` 背景, 中央「＋」を通常透明 (Web は hover 表示だが iOS に hover 無し → **常時 `Color.textTertiary.opacity(0.0)` = 非表示、tap 可能領域のみ**。忠実性: Web もデフォルト opacity 0、hover で 0.6。iOS は hover 概念が無いので非表示のまま tap 可で一致とみなす)。

### SelfTodayCTA.swift + MainAttendanceCTA.swift (Web `SelfTodayCTA.tsx` + `MainAttendanceCTA.tsx`)

**SelfTodayViewModel**:
- 依存: `AttendanceRepository`, `QueryClient`, `ToastCenter`, `AppRouter` (setup 遷移用 — 実際は RootView 分岐なので後述)。
- 保持: `today: TodayResponse?`, `loadState`。
- `occurrences: [OccurrenceDto]` = `today.occurrences.sorted { $0.startMinute < $1.startMinute }`。
- `date: String` = `today?.date ?? 今日("YYYY-MM-DD")`。
- `.task`: `AttendanceRepository.loadToday()`。**403 SETUP_REQUIRED**: `loadToday` が `APIError` で status 403 かつ code `SETUP_REQUIRED` を投げたら → `authStore.refreshMe()` を促し RootView が SetupFlow へ切替 (Web は `/setup` へ navigate)。Phase B では VM が `authStore.markSetupIncomplete()` 相当を呼ぶ or `environment.authStore` の me を再取得して RootView 分岐に委ねる。**確定挙動**: 403 SETUP_REQUIRED 受信で `authStore.refreshMe()` を呼ぶ (setupStatus.isComplete=false が返り RootView が SetupFlowView に遷移)。トーストは出さない。

**SelfTodayCTA View**:
- `today` ロード中 → `EmptyView` (nil 表示, Web `return null`)。
- `occurrences.isEmpty` → `EmptyView` (Web 0 件非表示)。
- それ以外 → `MainAttendanceCTA(occurrences:, expanded:$expanded, onToggle:, onMarkAll:, onChangeStatus:, pending:)`。
- `@State expanded = false`。

**MainAttendanceCTA View** (下部固定バー):
- `if keyboardVisible { EmptyView }` (Web `useIsKeyboardOpen`)。keyboard 監視は Phase A の BottomTabBar と同じ NotificationCenter パターンを流用。
- コンテナ: 画面下部固定 = `SelfTodayCTA` を `HomeView` の `ZStack(alignment:.bottom)` に置き、CTA 自身は tab bar (64pt) の上に来るよう `.padding(.bottom, Space.tabBarHeight)` + `safeArea`。背景 `Color.bgBase.opacity(0.85)` + `.background(.ultraThinMaterial)` + top border `Color.textPrimary.opacity(0.08)` 1px。`py 8`。
- `unrecorded = occurrences.filter { $0.status == nil }.count`。
- **展開パネル** (`expanded == true`, CTA ボタンの上): `ScrollView` maxHeight `36%` 相当, `Color.bgElevated` `Radius.md` `.atenderShadow(.card)`。各 occurrence 行:
  - `Text("\(periodIndex)限").foregroundStyle(Color.accent500) + Text(courseName)` (`.atenderBase.bold`), 右に `room`。
  - 6 状態ボタン (`AttendanceStatus.allCases` の CANCELLED 含む 6 値 = Web `ATTENDANCE_STATUS`): 選択中は `Color.accent500` + `Color.textOnAccent` + glowSoft、非選択 `Color.textPrimary.opacity(0.08)`。ラベルは `statusLabels[status]` (1 字: 出欠公遅早休)。tap → `onChangeStatus(occurrence.id, status)`。
- **CTA ボタン行** (`HStack(spacing: Space.s3)`):
  - 左: 分割ボタン群 (`ZStack`/相対配置で dropdown):
    - メインボタン (`AtenderButton`): `unrecorded==0` なら variant `.secondary` ラベル「本日の記録は完了済」, else variant `.primary` ラベル「今日は全出席 (\(unrecorded))」。右角を潰す (`rounded-r-none` 相当)。tap → `markAll(.present)`。`disabled = pending || unrecorded==0`。
    - 右のドロップダウントリガ (`44x幅48` 相当, chevron `chevron.up.chevron.down`): tap で `menuOpen.toggle()` (disabled 時無効)。
    - メニュー (`menuOpen`): メインボタンの**上**に浮かせる (`bottom-full mb-2`)。`Color.bgElevated` `Radius.md` card shadow。項目 = `[.absent, .excused, .tardy, .earlyLeave]` (Web `BULK_STATUSES`)、各「全部 \(statusLongLabels[status]) (\(unrecorded))」。tap → `markAll(status)` + `menuOpen=false`。
    - メニュー外 tap で閉じる (`.background` に透明タップ or `onTapGesture`/`simultaneousGesture`。ESC は iOS 不要)。
  - 右: 個別修正トグルボタン (`48x48` circle `Color.textPrimary.opacity(0.08)`): `expanded ? chevron.down : chevron.up`。tap → `onToggle()`。
- `markAll(status)` → `menuOpen=false; onMarkAll(status)`。
- **型**: `BulkAttendanceStatus` = CANCELLED を除く `AttendanceStatus` (present/absent/excused/tardy/earlyLeave)。`onMarkAll: (AttendanceStatus) -> Void` で受け送信側で CANCELLED を渡さない (present は「全出席」用)。

**操作まとめ (「○○で△△」)**:
- 「今日は全出席」tap → status未記録の occurrence を PRESENT で一括 (楽観)。
- ドロップダウンで「全部 欠席/公欠/遅刻/早退」選択 → 該当 status で一括 (楽観)。
- 個別修正パネルで各授業の 6 状態 tap → その 1 件を patch (楽観)。
- `unrecorded==0` で「本日の記録は完了済」表示・ボタン disabled。

`statusLabels`/`statusLongLabels`/`ATTENDANCE_STATUS` は Phase A `Core` に無ければ本 Phase で追加 (Web `components/ui/labels`): `statusLabels = [present:"出", absent:"欠", excused:"公", tardy:"遅", earlyLeave:"早", cancelled:"休"]`, `statusLongLabels = [absent:"欠席", excused:"公欠", tardy:"遅刻", earlyLeave:"早退", present:"出席", cancelled:"休講"]`, `ATTENDANCE_STATUS = [present, absent, excused, tardy, earlyLeave, cancelled]` (Web 順)。

### PersonalCalendar.swift (Web `PersonalCalendar.tsx`) — read-only

**PersonalCalendarViewModel**:
- 依存: `TimetableRepository`, `SemesterRepository`, `PersonalEventRepository`, `QueryClient`。
- 保持: `timetables/semesters/overview(SemesterOverviewDto)/personalEvents`。
- View state: `viewMode: CalendarViewMode = .month`, `anchor: String` (今日, "YYYY-MM-DD"), `selectedDate: String` (今日)。
- `timetable = timetables.first { $0.semesterId == semesterId }`, `semester = semesters.first { $0.id == semesterId }`。
- `statusByDate: [String: AttendanceDayStatus]` = `overview.days` を date→status に。
- `range`: month→`monthGridRange(anchor 月初)`, week→`weekStart …+6`, day→`[selectedDate, selectedDate]`。
- `personalEvents` fetch は `range.start..range.end` + `semesterId`。
- `events: [CalendarEvent]` = `expandUserTimetable(...)` (meeting) + personalEvents を CalendarEvent(personal) 化、`(date, startMinute)` でマージソート。personal の startMinute/endMinute は `isAllDay ? (0,1440) : (startMinute ?? 0, endMinute ?? startMinute ?? 0)`, color `?? "#8b5cf6"`。
- `eventMap = eventsByDate(events)`, `dayEvents = eventMap[selectedDate] ?? []`。

**構造/操作**:
- `semesterId == nil` → `Panel { "学期を選択してください。" }`。
- ローディング → skeleton (nav + Month/Week/Day skeleton)。
- error → `Panel { "カレンダーを読み込めませんでした。" }`。`timetable == nil` → `Panel { "この学期の時間割がありません" }`。`semester == nil` → `Panel { "学期を読み込めませんでした。" }`。
- 通常:
  ```
  VStack(spacing: Space.s3) {
    HStack { PeriodNav(viewMode:, anchor:$anchor, onChange:{ if day { selectedDate=$0 } }); Spacer(); CalendarSegmented(viewMode:$viewMode) }
    switch viewMode {
      case .month: CalendarMonth(anchor:, selectedDate:, events:, statusByDate:, onSelectDate:selectDate); DayAgendaPanel(date:selectedDate, events:dayEvents)
      case .week:  CalendarWeek(weekStart: weekStarts.first ?? selectedDate, selectedDate:, eventsByDateMap: eventMap, onSelectDate: selectDate)
      case .day:   CalendarDay(date: selectedDate, events: dayEvents)
    }
  }
  ```
- `selectDate(date)`: `selectedDate = date; anchor = date`。
- PeriodNav の onChange: `anchor = next`; day モードなら `selectedDate = next`。
- **read-only**: セル/イベント tap は日付選択のみ (`onSelectDate`)。予定の追加/編集/削除は**無し** (Web と一致)。

### CalendarMonth / CalendarWeek / CalendarDay / DayAgendaPanel / CalendarSegmented / PeriodNav

Web 現物 1:1 (詳細は正典参照)。要点のみ確定:

- **CalendarMonth**: 7 列グリッド (月火水木金土日ヘッダ)。`monthGridRange(anchor)` の 42 日。各日 `min-h-24`。`inMonth = 月一致`。日付バッジ: 選択 = `Color.accent500`+onAccent, 今日(inMonth) = accent500 文字, else 通常。`statusByDate[date]` が `!= nil && != NO_CLASS` なら日付右にドット (`dayStatusColor`)。inMonth のみイベント chip 最大 3 + `+N`。chip 背景 = `mix(eventColor, bgElevated, 18%)`。tap → `onSelectDate`。
- **CalendarWeek**: 7 日を縦カード。各カード日付 (選択で accent500) + 件数 + `EventTile` リスト (`radius: Radius.sm`, subtitle=subtitle, badge=開始時刻 `HH:mm`)。予定なしは「予定なし」。
- **CalendarDay**: 9-21 時タイムライン。`assignLanes(events)` で重なりを lane 分割。各イベント `top/height` = 分の割合%、`left = 12% + lane*(88/laneCount)%`, `width = (88/laneCount)% - 2px`。`EventTile(align:.top, subtitle:"自分 · HH:mm")`。時間軸横線 + 時刻ラベル。**実装は `GeometryReader` + 絶対配置** (percent → pt 換算)。
- **DayAgendaPanel**: `Color.bgElevated` `Radius.md` card。見出し「M/D の予定」。イベント行: 色ドット + タイトル + `HH:mm-HH:mm`。空は「予定はありません」。
- **CalendarSegmented**: 日/週/月ピル (Web と同じ、選択 accent500)。`@Binding viewMode`。
- **PeriodNav**: `< タイトル >`。タイトル: day=「YYYY年 M月D日」, week=「M/D - M/D (週)」, month=「YYYY年 M月」。`< / >` で anchor を day/week/month 単位で ±1。

### MeetingEditModal.swift (Web `MeetingEditModal.tsx`)

`BottomSheet` (footer 版) 上。

**props**: `isPresented: Binding<Bool>`, `timetable: UserTimetableDto`, `mode: .create | .edit`, `initialDayOfWeekJs: Int?`, `initialPeriod: Int?`, `meeting: MeetingDto?`。
**依存**: `TimetableRepository` (createMeetingsBulk / updateMeeting)。
**state**: `courseId: String`, `dayOfWeekJs: Int` (0..6), `periods: [Int]`, `room: String`, `courseModalOpen: Bool`, `createdCourses: [CourseDto]`。
- `courses` = `timetable.courses` ∪ `createdCourses` (id 重複は後勝ち)。
- **open 時初期化** (`.onChange(of: isPresented)` true):
  - edit & meeting: `courseId=meeting.courseId; dayOfWeekJs=meeting.dayOfWeek; periods = (0..<periodCount).map{ startPeriodIndex+$0 }; room = meeting.room ?? ""`。
  - create: `courseId = timetable.courses.first?.id ?? ""; dayOfWeekJs = initialDayOfWeekJs ?? 1; periods = [initialPeriod ?? 1]; room = ""`。
- `periodCount (chips 上限) = timetable.daySlots.count`。
- `canSave = courseId != "" && courseId != ADD && !periods.isEmpty && !isPending`。

**構造** (`BottomSheet(title: mode==create ? "授業を追加" : "授業を編集")`):
- Field「科目」(required): `Picker`/`Menu` で courses + 「＋ 科目を追加」。選択が「＋科目追加」なら `courseModalOpen=true` (courseId は変えない)。
- Field「曜日」: create は読み取り専用テキスト `dayLabels[dayOfWeekJs]` (`Color.bgMuted` box)。edit は `Picker` で 0..6 (`dayLabels`)。`dayLabels = ["日曜日","月曜日",…,"土曜日"]`。
- Field「時限 (複数選択で連続コマ)」: `PeriodChips(value:$periods, periodCount:)`。
  - **create**: 選択は自由 (連続でなくても各 startPeriodIndex として bulk 送信 — Web は create で isContiguous を強制しない)。
  - **edit**: `handlePeriodChange` = 新選択が `isContiguous` なら採用、非連続なら「新規追加された 1 個だけ」に切替 (Web の分岐そのまま: `added = next.first{ !periods.contains }; periods = added ? [added] : Array(next.suffix(1))`)。
- `PeriodChipsPreview(periods:)`: 「選択: 1限・2限 → 1-2限 (2連続)」。
- Field「教室」: `TextField(room)` maxLength 30。
- error 表示: `Color.statusAbsent.opacity(0.15)` box。
- footer: 「キャンセル」(ghost, `onClose`) / 「保存」(primary, `canSave`)。

**保存** (`handleSave`):
- create: `createMeetingsBulk(MeetingBulkCreateInput(userTimetableId: timetable.id, courseId:, dayOfWeek: dayOfWeekJs, startPeriodIndexes: periods, room: room.trimmed.nonEmpty))` → await → close。
- edit: `range = meetingRange(periods)`; `updateMeeting(id: meeting.id, MeetingUpdateInput(dayOfWeek: dayOfWeekJs, startPeriodIndex: range.start, periodCount: range.count, room: room.trimmed.isEmpty ? nil : room.trimmed))` → await → close。
- **ネスト CourseEditModal**: `CourseEditModal(isPresented:$courseModalOpen, timetableId: timetable.id, stackLevel: 2, onSaved: { course in createdCourses に upsert; courseId = course.id })`。

`ADD_COURSE_VALUE = "__add_course__"`。

### PeriodChips.swift / PeriodChipsPreview.swift

- `PeriodChips(value: Binding<[Int]>, periodCount: Int, disabled: Bool = false)`: `1...periodCount` を `LazyVGrid`/`FlowLayout` (折返し) で丸ボタン。選択 = `Color.accent500`+onAccent, 非選択 = `Color.bgBase` + `Color.borderDefault` border。tap で toggle (昇順維持)。`h-10 min-w-10`。
- `PeriodChipsPreview(periods:)`: 空なら「時限を選択してください」(textTertiary)。else「選択: {join "限・"}限」+ 改行 + 「→ {renderPreview}」。

### MeetingDetailSheet.swift (Web `MeetingDetailSheet.tsx`)

`BottomSheet(title:"授業の詳細", footer:)`。props: `meeting: MeetingDto?`, `course: CourseDto?`, `slots: [DaySlotDto]`, `pending: Bool`, `onEdit`, `onDelete`。
- `slots` = `display.daySlots.filter { $0.periodIndex >= meeting.startPeriodIndex && < startPeriodIndex+periodCount }` (呼び出し側 SelfTimetableView が算出)。
- `color = course.color ?? "#F97316"`。ヘッダカード背景 = color α15% (hex+"26")。
- 大きな限数字: `first`/`last` から periodLabel = `slots.count>1 ? "\(first.periodIndex)-\(last.periodIndex)" : "\(first.periodIndex)"`。フォント `first>2桁? 5xl : 7xl`(=44/約72pt) black, color。「限」ラベル。
- 右: `course.name` (`.atender2xl.weight(.black)`), `"\(dayLabels[meeting.dayOfWeek])曜日 · \(minutesToTime(first.startMinute)) – \(minutesToTime(last.endMinute))"` (`dayLabels = ["日","月",…,"土"]`)。
- 詳細 dl: 教室 / 先生 / メモ (`Row(label,value ?? "—")`)。
- footer: 「削除」(destructive, `pending` disabled, `onDelete`) / 「閉じる」(ghost) / 「編集」(primary, `onEdit`)。
- `course/meeting/first/last` が揃わなければ本文空。

### CourseEditModal.swift (Web `components/semester/CourseEditModal.tsx`)

`BottomSheet(stackLevel:)` 上。props: `isPresented`, `timetableId: String`, `course: CourseDto? = nil`, `stackLevel: Int = 1`, `onSaved: (CourseDto) -> Void`。
- 依存: `TimetableRepository` (createCourse / updateCourse)。
- `colors = ["#10b981","#60a5fa","#f472b6","#8b5cf6","#f59e0b"]`。
- state: `name/teacher/color/note`。open 時に course から初期化 (無ければ空 + colors[0])。
- Field: 科目名 (required, max100) / 先生 (max50) / 色 (5 プリセット丸 + カスタム color picker) / メモ (Textarea max500)。
- `canSave = name.trimmed.count>0 && !isPending`。
- 保存: course あれば `updateCourse(id, CourseUpdateInput(name:, teacher: trimmed.nilIfEmpty, color:, note: trimmed.nilIfEmpty))`, なければ `createCourse(CourseCreateInput(userTimetableId:, name:, teacher: trimmed.orNil, color:, note: trimmed.orNil))`。結果 `onSaved(course)` + close。
- footer: キャンセル/保存。

### TimetableSettingsSheet.swift (Web `TimetableSettingsSheet.tsx`)

`BottomSheet(title:"時間割の設定", footer:)`。props: `isPresented`, `timetable: UserTimetableDto?`。
- 依存: `TimetableRepository` (patchUserTimetable / publishAsTemplate / templates / copyTemplate), `SemesterRepository`, `MeRepository`。
- state: `name`, `publishEnabled=true`, `publishTitle`, `daysOfWeek: [Int]=[1..5]`, `slots: [SlotInput]`, `message: String?`, `searchOpen=false`, `searchQuery=""`。
  - `SlotInput { periodIndex; label; startMinute; endMinute; isBreak }` (可変)。
- open 時初期化: `name=timetable.title; publishTitle = semester?.name ?? timetable.title; daysOfWeek = timetable.daysOfWeek; slots = timetable.daySlots.copy`。
- **本文** (Web 順):
  1. Field「名前」(`TextField`).
  2. 「表示する曜日」+ `DayChips(value:$daysOfWeek)` (1..7)。
  3. 「時限 (\(slots.count) 限)」+「＋ コマを追加」ボタン。各 slot 行: label TextField (w56) + 開始 time picker + 「–」+ 終了 time picker + 削除 ✕。
     - addSlot: 末尾 endMinute+10 開始, +100 終了, `periodIndex = count+1`, label「\(n)限」。
     - removeSlot(i): 削除後 periodIndex を 1..n 振り直し。
     - 時刻は `DatePicker(.hourAndMinute)` を分に変換 (`minutesToHHMM`/`hhmmToMinutes` 相当)。
  4. `Toggle(publishEnabled, "みんなの時間割で公開")` + on なら Field「公開タイトル」。
  5. 「同じ学校の公開時間割から持ってくる」展開: `searchOpen` トグル。開くと検索 `TextField` + `templates` リスト。学校/学科未設定なら警告。各 template 行「取り込む」→ `copyTemplate(templateId, TemplateCopyInput(semesterId: timetable.semesterId))` → `message="「\(title)」を取り込みました"; searchOpen=false`。
- **保存** (`handleSave`, Web 差分検知一致):
  - `timetable == nil` return。`daysOfWeek.isEmpty` → message「表示する曜日を1つ以上選んでください」return。
  - slot バリデーション: 各 `endMinute <= startMinute` → message「\(i+1) 限目: 終了時刻は開始時刻より後にしてください」return。
  - 差分ある項目だけ `patchUserTimetable` を並列: title 変更 / daysOfWeek 変更 (ソート比較) / daySlots 変更 (JSON 等価比較 → Swift は配列 Equatable 比較) を個別 patch。await all。
  - `publishEnabled` なら publishTitle 空チェック → `publishAsTemplate(id, {title: publishTitle})`。
  - close。
- **キャンセル** (`handleCancel`): 全 state を timetable から再初期化 + close。
- footer: キャンセル (ghost, handleCancel) / 保存 (primary, disabled = timetable==nil || pending)。
- `timetable == nil` のとき本文冒頭に「先に学期を作成してください。」box + 各入力 disabled。

### DayChips.swift (Web `DayChips.tsx`)

`DayChips(value: Binding<[Int]>, disabled: Bool=false)`: 月火水木金土日 (value 1..7)。選択 accent500、非選択 bgBase+borderDefault。toggle 昇順。

---

## 出欠ループ: 楽観更新フロー (実接続)

マスター §1.4.3 の設計を Phase B で実配線する。純粋変換 (`AttendanceOptimistic`) と invalidation (`invalidationTargets`) は Phase A 実装済・テスト済。本 Phase は Repository で mutation を組む。

### AttendanceRepository.swift

```swift
@MainActor @Observable final class AttendanceRepository {
    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let cache: QueryClient
    @ObservationIgnored private let toast: ToastCenter
    init(client: APIClient, cache: QueryClient, toast: ToastCenter)

    /// today 取得 (キャッシュ書込)。403 SETUP_REQUIRED は APIError を throw (呼び出し側で分岐)
    func loadToday(date: String? = nil) async throws -> TodayResponse

    /// 全出席 (未記録のみ)。楽観 → API → onError restore+toast / onSuccess invalidate
    func markAllPresent(date: String, status: AttendanceStatus) async

    /// 個別 patch。楽観 → API → onError restore+toast / onSuccess invalidate
    func patchAttendance(occurrenceId: String, status: AttendanceStatus) async
}
```

### `markAllPresent(date:status:)` の手順 (Web `useMarkAllPresent` 1:1)

1. **onMutate**: `let snapshot = cache.snapshot(matching: QueryKey(["today"]), as: TodayResponse.self)`。snapshot の各 (key, today) に `AttendanceOptimistic.applyMarkAll(today, status: status)` を適用して `cache.setData(_, for: key)` (即時 UI 反映)。
2. **API**: `try await client.send(Endpoints.markAllPresent(MarkAllPresentInput(date: date, status: status)), as: MarkAllPresentResponse.self)`。
3. **onError** (throw catch): `cache.restore(snapshot)` + `toast.show("保存できませんでした、もう一度試してください")`。
4. **onSuccess**: `cache.invalidate(prefixes: invalidationTargets(for: .markAllPresent))` = `[stats, semesters, dayPrefix]` (today は楽観反映済なので**含めない** — Phase A の invalidationTargets が既にこの形)。

### `patchAttendance(occurrenceId:status:)` (Web `usePatchAttendance` 1:1)

1. onMutate: `snapshot` 取得 → 各 today に `AttendanceOptimistic.applyPatch(today, occurrenceId:, status:)` 適用 setData。
2. API: `POST Endpoints.markAttendance(occurrenceId:, MarkAttendanceInput(status: status, note: nil))` → `AttendanceRecordResponse`。
3. onError: `restore(snapshot)` + toast。
4. onSuccess: `invalidate(prefixes: invalidationTargets(for: .patchAttendance))` = `[stats, semesters, dayPrefix]`。

> **UI との結合**: `SelfTodayViewModel.today` は `cache.data(for: .today())` を単一の真実源として毎 body 参照する (VM が cache を read)。楽観更新は cache を直接書換えるので、`@Observable QueryClient` の変更が View を再描画する。**ただし** SwiftUI で `cache.data(for:)` の変更を観測するには VM が cache 内容をローカル `today` に写す必要がある → 実装方針: **VM が mutation 後に `today = cache.data(for: .today())` を再読込**し、`applyMarkAll/applyPatch` の楽観結果も cache 経由で `today` に反映されるよう、mutation 前後で VM が cache を read する。具体的には `markAll`/`patch` を **VM のメソッドがラップ**し、(a) 楽観適用は Repository が cache に書く、(b) VM は Repository 呼び出しの前後で `today = cache.data(for: .today())` を更新する。楽観の即時性のため、VM 側でも同じ `AttendanceOptimistic` を `today` に適用してから Repository を呼ぶ二重反映は**しない** (真実源は cache に一本化)。→ 確定: Repository が cache を更新し、VM は `withObservationTracking` ではなく mutation メソッド内で `defer { self.today = cache.data(for: .today()) }` により同期。

### mutation ボタンの pending / トースト

- `markAll.mutate` 相当は `Task { await repo.markAllPresent(...) ; self.pending=false }`。`pending` は VM の `@State`/`@Observable` プロパティ。CTA の disabled に反映。
- トーストは `ToastCenter.show(...)` (2600ms, Phase A)。`RootView` に `ToastOverlay` が既に載っている前提。

---

## Repository とデータ配線 (Phase B 全体)

各 Repository は `APIClient` + `QueryClient` を init 注入。read 系は fetch 後 `cache.setData`、write 系は API 後 `cache.invalidate(prefixes: invalidationTargets(for:))`。`AppEnvironment` に 4 Repository を追加保持し、`HomeView`/各 VM に注入。

| Repository | read | write (→ invalidationTargets) |
|---|---|---|
| `SemesterRepository` | `semesters()` → `.semesters()`, `semesterOverview(id)` → `.semesterOverview(id)` | (Phase B は read のみ) |
| `TimetableRepository` | `userTimetables()` → `.userTimetables()`, `templates(query)` → `.templates()` | `createUserTimetable` (.userTimetableCreate), `patchUserTimetable` (.userTimetableEdit), `publishAsTemplate` (.userTimetablePublish), `createCourse`/`updateCourse` (= userTimetables/today/semesters を invalidate。Web hook 準拠。Phase A の Mutation enum に course create/update case が無いため **course 用の invalidate は Repository が明示 prefix 指定**: `[.userTimetables(), QueryKey(["today"]), .semesters()]`), `createMeetingsBulk` (Web: userTimetables/today/stats/rooms/semesters → 明示 prefix), `updateMeeting`/`deleteMeeting` (userTimetables/today/stats/semesters), `copyTemplate` (Web `useCopyTemplate` の invalidate を確認して合わせる) |
| `AttendanceRepository` | `today(date)` → `.today(date)` | `markAllPresent` (.markAllPresent + 楽観), `patchAttendance` (.patchAttendance + 楽観) |
| `PersonalEventRepository` | `personalEvents(from,to,semesterId)` → `.personalEvents()` | (Phase B は read のみ。CRUD は Phase C) |

> **course/meeting bulk の invalidate**: `Mutation` enum に `courseCreate/courseUpdate` case が無い (Phase A は attendance 中心)。`createMeetingsBulk` は `.userTimetableEdit` 相当だが Web hook は `rooms` も invalidate する。**Developer は `apps/web/src/api/hooks/useUserTimetable.ts` の各 mutation の `invalidateQueries` を正とし**、Repository で明示 prefix 配列を渡す (Mutation enum を無理に流用しない)。具体値:
> - `createUserTimetable`: `[.userTimetables(), .me()]`
> - `createCourse`/`updateCourse`: `[.userTimetables(), QueryKey(["today"]), .semesters()]`
> - `createMeetingsBulk`: `[.userTimetables(), QueryKey(["today"]), QueryKey(["stats"]), .rooms(), .semesters()]`
> - `updateMeeting`/`deleteMeeting`: `[.userTimetables(), QueryKey(["today"]), QueryKey(["stats"]), .semesters()]`
> - `patchUserTimetable`: `[.userTimetables(), QueryKey(["today"]), .semesters()]`
> - `copyTemplate`: Web `useCopyTemplate` を確認 (`user-timetables` 系)。

**リロード方針** (マスター §不採用の「明示 load + isStale」): 各 VM は `.task`/`onAppear` で自分が表示する QueryKey が cache miss か `isStale` なら load。mutation を起こした VM は await 後に自分の表示 key を強制 reload。別タブは appear 時に isStale 判定で reload (例: 出欠変更で `stats`/`semesters` が stale 化 → Semester タブ表示時に再取得)。

---

## 使用する DTO / エンドポイント / invalidation まとめ

- **DTO** (Phase A 済): `MeResponse`, `SemesterDto`, `SemesterOverviewDto`, `AttendanceDaySummary`, `UserTimetableDto`, `DaySlotDto`, `CourseDto`, `MeetingDto`, `OccurrenceDto`, `TodayResponse`, `MarkAllPresentInput`, `MarkAllPresentResponse`, `MarkAttendanceInput`, `MeetingBulkCreateInput`, `MeetingUpdateInput`, `UserTimetableCreateInput`, `UserTimetablePatchInput`, `CourseCreateInput`, `CourseUpdateInput`, `PersonalEventDto`, `TemplateDto`, `TemplateCopyInput`。
- **DTO 追加/確認 (Phase A に無ければ本 Phase で追加)**:
  - `AttendanceRecordResponse` (patch 応答): Web `types.ts:81` = `{ record: { occurrenceId: String; status: AttendanceStatus?; note: String?; updatedAt: String } }`。→ `struct AttendanceRecordResponse: Codable, Equatable { let record: Record; struct Record: Codable, Equatable { let occurrenceId: String; let status: AttendanceStatus?; let note: String?; let updatedAt: String } }`。
  - `UserTimetableCreateInput` の実フィールド (Web `useCreateUserTimetable` body): `{ semesterId: String; title: String; daySlots: [DaySlotInput]; courses: [...]; meetings: [...] }`。Phase A は `UserTimetableCreateInput` を宣言済だが中身空 → **本 Phase で確定**: `struct UserTimetableCreateInput: Codable, Equatable { let semesterId: String; var title: String?; var daySlots: [DaySlotInput]?; var courses: [CourseSeed]?; var meetings: [MeetingSeed]? }` (SelfTimetableView は `daySlots: defaultSlots, courses:[], meetings:[]` を送る。`DaySlotInput` = periodIndex/label/startMinute/endMinute/isBreak)。**shared `userTimetable.ts` を Developer が正として最終確定**。
  - `UserTimetablePatchInput`: `{ title?: String; daysOfWeek?: [Int]; daySlots?: [DaySlotInput] }` (TimetableSettingsSheet が送る範囲)。shared 確認。
  - `TemplatesResponse`/`UserTimetablesResponse`/`SemestersResponse`/`PersonalEventsResponse`/`SemesterOverview` の envelope 形 (`{ userTimetables: [...] }` 等): Phase A の envelope 規約に従う。無ければ追加。
- **エンドポイント** (Phase A `Endpoints` 済): `today`, `markAllPresent`, `markAttendance`, `userTimetables`, `createUserTimetable`, `patchUserTimetable`, `publishAsTemplate`, `createCourse`, `updateCourse`, `createMeetingsBulk`, `updateMeeting`, `deleteMeeting`, `semesters`, `semesterOverview`, `personalEvents`, `templates`, `copyTemplate`。**Developer は `apps/api/src/routes/*` でパス/クエリ/メソッドを最終照合**。
- **QueryKey** (Phase A 済): `.today(date)`, `.userTimetables()`, `.semesters()`, `.semesterOverview(id)`, `.stats()`, `.dayPrefix()`, `.personalEvents()`, `.templates()`, `.me()`, `.rooms()`。

---

## 挙動仕様 (Reviewer がテスト生成)

純粋ロジックは View から分離済。SwiftUI View 本体の描画 assertion は XCTest では困難 (jsdom 無し) なので、**Reviewer は純粋関数 + VM 状態遷移 (URLProtocol スタブ) をテスト**し、描画は simulator 目視観点に回す (マスターのテスト方針を踏襲)。曖昧表現なし。

### T-1 DayConvention

- `jsToDisplay(0)==7`(日), `jsToDisplay(1)==1`(月), `jsToDisplay(6)==6`(土)。`displayToJs(1)==1`, `displayToJs(7)==0`。往復: `displayToJs(jsToDisplay(x))==x` for 0..6。
- `resolveDisplayDays(daysOfWeek:[1,3], meetings:[dow=5(金→display6),dow=0(日→7)])` == `[1,3,6,7]` 昇順。空 daysOfWeek → `[1,2,3,4,5]` に meeting 曜日を追加。
- `todayDayOfWeekJs`: 土(6)/日(0) の Date で 1 を返す。平日はその曜日。

### T-2 TimetableCoalesce.coalesce

- 隣接同 mergeKey (月1限+月2限, mergeKey同) → 1 件 periodCount=2, id=先頭。
- 非隣接 (月1限+月3限) → 2 件据置。
- 曜日違い (月1+火1 同 mergeKey) → 結合しない (2 件)。
- mergeKey nil 2 件 → 素通し (順序=入力 order 反映)。
- 3 連続 (1,2,3) → periodCount=3。
- 出力ソート = (dayOfWeek asc, startPeriodIndex asc, order asc)。id 温存を assert。

### T-3 MeetingExpansion.expandUserTimetable

- meeting(dow=1=月, start=1, count=2) を月曜含むレンジで展開 → その月曜日に startMinute=slot1.start, endMinute=slot2.end の meeting イベント。
- `statusByDate[date]=="NO_CLASS"` の日は展開されない。`"ALL_SUSPENDED"` は展開される。
- `semesterStart`/`End` 外の日付は除外 (文字列比較)。
- daySlot 不在 (periodIndex 欠落) の meeting はスキップ。
- 出力ソート (date asc, startMinute asc)。`eventsByDate` が date→配列に正しく分配。
- 色 = course.color、無ければ memberColor fallback。

### T-4 CalendarRange

- `mondayOf("2026-06-24"(水))` == `"2026-06-22"(月)`。`mondayOf` 日曜は 6 日戻し。
- `monthGridRange(2026-06 月初)` == start=mondayOf(6/1), end=start+41day。42 日ちょうど。
- `weekStartsFor(.month, anchor)` == 6 要素 (週頭)。`weekStartsFor(.week/.day, anchor)` == `[mondayOf(anchor)]`。
- `addDays`/日付跨ぎ (月末→翌月, 年跨ぎ) 正しい。

### T-5 CalendarLane.assignLanes

- 重ならない 2 件 → 両方 lane=0, laneCount=1。
- 完全重なり 2 件 → lane 0/1, laneCount=2。
- 部分重なり 3 件で greedy → 期待 lane 割当。
- `endMinute<=startMinute` は除外。

### T-6 PeriodGrouping

- `groupPeriods([1,2,3,5])` == `[(1,3),(5,1)]`。
- `renderPreview([1,2,3])` == `"1-3限 (3連続)"`。`renderPreview([1,3])` == `"1限 (単独) + 3限 (単独)"`。
- `isContiguous([1,2,3])==true`, `isContiguous([1,3])==false`, `isContiguous([2,1])==true` (重複除去+ソート後判定)。
- `meetingRange([2,3,4])` == `(start:2, count:3)`。

### T-7 CalendarEventDisplay

- `dayStatusColor`: ALL_PRESENT→statusPresent, HAS_ABSENT→statusAbsent, HAS_TARDY→statusTardy, ALL_SUSPENDED→statusCancelled, その他→statusNone。
- `dayStatusLabel`: 出席 / 欠席あり / 遅刻・早退あり / 休講 / 未記録あり。
- `eventTitle(meeting)` == courseName, `eventTitle(personal)` == title。

### T-8 出欠楽観更新 (VM + Repository, URLProtocol スタブ)

- `AttendanceRepository.markAllPresent`: 成功時、cache の today で status==nil だった occurrence のみ指定 status、既記録は不変。`invalidate` 後 `stats/semesters/day` prefix が stale、**today は stale でない**。
- `markAllPresent` API 失敗 (URLProtocol 500): cache today が呼び出し前スナップショットに復元される。`ToastCenter.message == "保存できませんでした、もう一度試してください"`。
- `patchAttendance`: 指定 occurrenceId のみ status 置換、他不変。失敗で restore + toast。成功で `stats/semesters/day` stale、today は stale でない。
- `loadToday` が 403 + code `SETUP_REQUIRED` の APIError を throw する (SelfTodayViewModel がそれを受けて setup 遷移フラグを立てることを VM テストで確認)。
- `MainAttendanceCTA` の `unrecorded` = status==nil 件数の算出ロジック (VM/pure) が正しい。`unrecorded==0` でメインボタンラベルが「本日の記録は完了済」相当・disabled になる状態が VM で決まる。

### T-9 SelfTimetableView VM ロジック

- `activeTimetable`: `timetables.first { semesterId 一致 }`。無ければ nil。
- `emptyTimetable`: fallbackSemesterId 解決 (`semesterId ?? me.default ?? semesters.first`)。全て無ければ nil。
- `ensureTimetable`: selected/created があればそれを返し API 呼ばない。無ければ createUserTimetable を 1 回呼び created にセット。
- `toEventInput`: dayOfWeek を jsToDisplay 変換、color/title/subtitle/mergeKey=courseId を正しく写す。
- 空セル tap → sheet に (displayToJs(dow), period) が入る。

### T-10 MeetingEditModal VM ロジック

- open(create) 初期化: courseId=先頭, dayOfWeekJs=initial, periods=[initialPeriod], room=""。
- open(edit) 初期化: meeting から courseId/dayOfWeek/periods(展開)/room。
- create の handlePeriodChange: 非連続でもそのまま採用。edit: 非連続選択で「追加された 1 個」に切替。
- handleSave(create) が `MeetingBulkCreateInput(startPeriodIndexes: periods)` を組む。handleSave(edit) が `meetingRange` から startPeriodIndex/periodCount を組み room 空→nil。
- `canSave`: courseId 空/ADD/periods 空/ pending で false。

### T-11 TimetableSettingsSheet VM ロジック

- open 初期化・handleCancel 再初期化が timetable から正しく復元。
- daysOfWeek 空で save → message、patch 呼ばない。
- slot endMinute<=startMinute で save → 該当 message、patch 呼ばない。
- 差分検知: title/daysOfWeek/daySlots が変わった項目だけ patch 呼ぶ (未変更は呼ばない)。
- addSlot/removeSlot が periodIndex を 1..n に正規化。

### DTO デコード (Phase A DTODecodingTests 拡張)

- `AttendanceRecordResponse`: `record.status=null`→nil, 正常値デコード。
- `UserTimetableCreateInput`/`PatchInput` エンコードが Web body 形状 (キー名) と一致。

---

## テスト基盤 + simulator 確認観点

- **フレームワーク**: XCTest。ターゲット `AtenderTests` (既存)。`@testable import Atender`。`@MainActor` 型は test クラス/メソッドに `@MainActor` (gotcha 順守)。
- **配置** (`apps/ios/AtenderTests/` に追加):
  - `DayConventionTests.swift` / `TimetableCoalesceTests.swift` / `MeetingExpansionTests.swift` / `CalendarRangeTests.swift` / `CalendarLaneTests.swift` / `PeriodGroupingTests.swift` / `CalendarEventDisplayTests.swift` (T-1〜T-7)。
  - `AttendanceFlowTests.swift` (T-8, URLProtocol スタブ + QueryClient 実体 + ToastCenter)。
  - `SelfTimetableViewModelTests.swift` / `MeetingEditModalLogicTests.swift` / `TimetableSettingsLogicTests.swift` (T-9〜T-11)。
  - `DTODecodingTests.swift` (拡張): `AttendanceRecordResponse` 等。
  - Fixtures: `today.json`(既存), 追加 `userTimetableWithMeetings.json`, `semesterOverviewDays.json`, `attendanceRecord.json` を `AtenderTests/Fixtures/` に。実 API 形状 (shared schema と 1:1、フィールド名/null 位置一致)。
- **HTTP テスト**: `URLProtocol` スタブで `URLSession` 差し替え (gotcha `swiftui-final-mainactor-store-not-mockable-in-xctest`)。`final @MainActor` Store 本体はモックせず、依存 (URLSession/QueryClient/ToastCenter) を init 注入して実体を動かし observable state を assert。
- **simulator 目視観点** (手動 / UI テスト): (1) Home タブに ContextChips「自分」+ ＋、ピル 時間割/カレンダー が出る (2) 時間割モードで periodIndex グリッドが曜日×限で描画、連続コマが 1 タイルに結合、空セル tap で MeetingEditModal (無時間割なら自動生成後) が出る (3) 授業 tap → MeetingDetailSheet → 編集/削除が効く (4) 歯車 → TimetableSettingsSheet (5) 下部 CTA「今日は全出席 (N)」tap で即時 UI が全出席化 → 失敗時ロールバック+トースト、ドロップダウン一括、個別修正パネル 6 状態 (6) カレンダーモードで 月/週/日 切替、PeriodNav 前後、月グリッドに授業展開+状態ドット、read-only (7) dark 既定/light 切替で崩れない (8) クラッシュしない。
- ビルド: `xcodegen generate` → `xcodebuild -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 15'`。

---

## 不採用 / スコープ外 (検討ループ防止)

- **Lyric スクロール (OccurrenceLyricCard / TimetableScroll) を Home に出す**: 不採用。Web の `/` (Home.tsx) では非描画で `Today.tsx` 専用。忠実移植原則「Web の `/` で見えないものは出さない」。Home の出欠 UI は `SelfTodayCTA` 下部バーが唯一。Lyric は将来 Today 相当を復活させる場合のみ (現行 IA に無いので当面作らない)。
- **PersonalCalendar に個人予定 CRUD / PersonalEventEditModal**: 不採用。Web の Home PersonalCalendar は read-only (現物確認済)。CRUD と `PersonalEventEditModal` は `/semester` の `DayDetailSheet` = Phase C。要望文の該当記述は Web 実装と不一致のため採らない。
- **room モード (RoomTimetable / RoomCalendar / ContextChips room chip 実データ)**: スコープ外 (Phase D)。`HomeBody` は 4 分岐すべて `switch` で書き room 2 本はプレースホルダ。`HomeContext`/`ContextChipItem` は room を型として先に定義し Phase D で中身差し替え。
- **SwiftUI `Grid` / `LazyVGrid` で TimetableView を組む**: 不採用。SwiftUI `Grid` は行スパン (`gridCellColumns` はあるが行スパン無し) を持たず、連続コマの縦結合 (Web `grid-row: span N`) を素直に表現できない。`GeometryReader` + 絶対配置 (背景レイヤ + イベントレイヤ) を採用し、座標は共有関数 (periodIndexes/days) で算出して背景/イベントのズレを防ぐ (knowledge `timetable-consecutive-cell-grid-row-span-coalesce` の iOS 版)。
- **出欠変更で today も invalidate**: 不採用。Web `useMarkAllPresent`/`usePatchAttendance` は today を楽観更新済のため invalidate しない (`deleteAttendance` のみ today を invalidate)。Phase A の `invalidationTargets(.markAllPresent/.patchAttendance)` も既にこの形。忠実に踏襲。
- **course create/update の invalidate を Mutation enum に足す**: 本 Phase では足さず、Repository が明示 prefix 配列を渡す (Web hook 準拠)。`Mutation` enum の拡張は必要になった Phase で判断。
- **削除確認ダイアログを MeetingDetailSheet に差す**: 不採用。Web は confirm 無しで即削除。忠実移植。
- **TanStack Query 相当の自動再フェッチ (staleTime/GC/observer 自動 refetch)**: スコープ外 (マスター §不採用踏襲)。各 VM の明示 load + `isStale` 判定で足す。
- **旧 `Features/Today` / `Features/Timetable/TimetableView.swift` (foundation IA) の流用**: 不採用。新 `Features/Home` + `TimetableGrid` を作る。旧ファイル削除は任意。
