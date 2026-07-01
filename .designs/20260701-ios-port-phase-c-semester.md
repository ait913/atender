# Atender iOS 忠実移植 Phase C — 学期・科目タブ (SemesterOverview)

> 親設計: `.designs/20260701-ios-faithful-port-architecture.md` (Part1 データ層/コンポーネント規約) / 移植正典: `.designs/20260701-web-to-ios-port-bible.md` (§3.2 / §4.4 / §4.6)。
> 方針: **Web (`apps/web`) と完全一致**。スマホ独自の簡略化・改変をしない。迷ったら `apps/web/src/components/semester/*` を正典とする。
> Swift 型はすべて確定形で書く (gotcha `design-doc-must-specify-swift-type-signatures`)。

## 目的

Web の `/semester` (SemesterOverview) を iOS に忠実移植する。出席率ヒーロー / 出欠特化月カレンダー (複数選択・個人予定ドット・statusVisual アイコン) / 科目一覧 / 日別詳細シート (出欠6状態・休講・一括・個人予定) / 科目詳細モーダル (編集・休講日・出席履歴・削除) / 複数日一括操作 を Web と 1:1 で再現する。Phase A/B の土台 (デザインシステム・全DTO・全 endpoint・Data 層・共通コンポーネント・カレンダー基盤) を再利用し、新規は本タブ固有分のみ。

## スコープ境界

**このタブに含む**: SemesterOverviewView 全体 (Phase A のスタブを全面置換) / AttendanceRateHero / AttendanceCalendar (出欠特化・Web §4.4) / CourseListItem / DayDetailSheet / CourseDetailModal (+CourseSuspensionSection / CourseOccurrenceHistory / DangerZone) / BulkActionBar / BulkEditSheet / PersonalEventEditModal。HomeSemesterPicker は Phase B 実装を**再利用**。

**含まない (別 Phase)**: 学期の作成/編集/削除・SemesterListSheet (設定タブ=Phase E)。ルーム/友達/テンプレート/設定/Setup/認証。Home タブ (Phase B 完了)。MeetingEditModal (Phase B)。

## 再利用する Phase A/B 資産 (再定義しない)

| 資産 | パス | 用途 |
|---|---|---|
| `HomeSemesterPicker` | `Features/Home/HomeCore.swift` | header の学期ピッカー (`@Binding var semesterId: String?`, `trailing: AnyView?`) |
| `BottomSheet(title:isPresented:stackLevel:content:footer:)` | `Core/DesignSystem/Components/BottomSheet.swift` | DayDetailSheet / BulkEditSheet / CourseEditModal / PersonalEventEditModal |
| `FullScreenModal` | `Core/DesignSystem/Components/FullScreenModal.swift` | CourseDetailModal |
| `AtenderButton(title:variant:size:isLoading:isEnabled:action:)` | `Components/AtenderButton.swift` | 全ボタン (variant: primary/secondary/ghost/destructive/danger) |
| `Panel` / `EmptyState` / `Skeleton` / `ConfirmDialog` / `ToastCenter`/`ToastOverlay` | `Components/*` | 空状態・スケルトン・削除確認・トースト |
| `CourseEditModal(isPresented:timetableId:course:stackLevel:onSaved:)` | `Features/Course/CourseEditModal.swift` | 科目編集/追加。**そのまま再利用** |
| `Color.forRate(pct:required:)` / `Color.statusPresent/Absent/Tardy/Suspended/None` / `Color.accent500` | `Core/DesignSystem/Color+Atender.swift` | rateColor 相当・statusVisual 配色 |
| `CalendarRange` (parse/yyyyMMdd/addDays/addMonths/monthFirst/format/todayString) | `Core/Timetable/TimetableLogic.swift` | 日付演算 (UTC 正規化) |
| `TimeFormatting.minutesToTime(_:)` | `TimetableLogic.swift` | 分→"H:MM" |
| Data 層: `QueryClient` / `QueryKey` / `Query<Value>` / `AppEnvironment` (repositories) | `Core/Data/*`, `App/AppEnvironment.swift` | prefix invalidation キャッシュ・楽観更新 |
| 全 DTO / 全 Endpoint | `Core/Models/DTOs.swift` / `Core/Networking/APIEndpoint.swift` | Phase A resync 済。**追加不要** (下記「使用 DTO/endpoint」参照) |

> ★ `CalendarRange.monthGridRange` / `CalendarMonth` は **月曜始まり**。AttendanceCalendar は Web と同じ **日曜始まり** かつ出欠特化のため**別物**として新規に作る (再利用しない)。日付演算プリミティブ (addDays 等) だけ流用する。

---

## 画面構成 (ツリーと状態オーナー)

```
SemesterOverviewView                      … 学期・科目タブの NavigationStack 直下ルート
  state: semesterId:String?  (既定 me.defaultSemesterId)
         selectionMode:Bool, selectedDates:Set<String>
         openCourseId:String?, dayDetailDate:String?, bulkSheetOpen:Bool
  ├─ header:  HomeSemesterPicker(semesterId:$semesterId, trailing: 期間ラベル "M/D 〜 M/D")
  ├─ AttendanceRateHero(overall:, requiredRate:)
  ├─ AttendanceCalendar(days:, startDate:, endDate:, today:, semesterId:,
  │        selectionMode:, selectedDates:, onSelectDay:, onToggleSelectionMode:, onToggleDate:)
  ├─ 科目一覧:  ForEach CourseListItem(stats:, requiredRate:, onTap:{ openCourseId = id })
  ├─ (selectionMode時) BulkActionBar(count:, onOpenSheet:, onCancel:)          … overlay 下部固定
  ├─ .sheet(dayDetailDate)   → DayDetailSheet(date:, semesterId:, onChanged:)
  ├─ .sheet(bulkSheetOpen)   → BulkEditSheet(dates:, semesterId:, onDone:)
  └─ .fullScreenCover(openCourseId) → CourseDetailModal(courseId:, onClose:)
```

Web `SemesterOverview.tsx` の state と 1:1。iOS はモバイル単一カラム (Web の `md:grid-cols-[1.15fr_1fr]` はモバイルでは縦積み) なので**カレンダー → 科目一覧の縦積み**とする (Web もモバイル幅では縦積み)。

### レイアウト実値 (Web 準拠)

- ルート: `ScrollView` + `VStack(spacing: Space.s4)` + `.padding(Space.pagePxMobile)` (12pt) + 下部 `padding(.bottom, Space.s6)`。背景 `Color.bgBase`。
- header: `HStack(alignment: .firstTextBaseline)` — 左 `HomeSemesterPicker`、右 `Text("期間 \(mMd(start)) 〜 \(mMd(end))")` (`.atenderXs`, `.textTertiary`)。期間ラベルは `HomeSemesterPicker` の `trailing:` に差す。
- カード共通: `Color.bgElevated` + `RoundedRectangle(cornerRadius: Radius.md)` (18pt = rounded-3xl 相当は既存 md=18 を踏襲) + `.atenderShadow(.card)`。

---

## コンポーネント別 詳細設計

### 1. SemesterOverviewView (Phase A スタブを全面置換)

現行 `Features/SemesterOverview/SemesterOverviewView.swift` + `SemesterOverviewViewModel.swift` は Phase A の旧3タブ用スタブ (直 apiClient・`全期間見込み` 表示あり)。**両ファイルとも全面置換**する。

```swift
struct SemesterOverviewView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var model: SemesterOverviewViewModel?
    @State private var semesterId: String?
    @State private var didApplyDefault = false
    @State private var selectionMode = false
    @State private var selectedDates: Set<String> = []
    @State private var openCourseId: String?
    @State private var dayDetailDate: String?
    @State private var bulkSheetOpen = false
    // body: 下記「挙動仕様」参照
}

@MainActor @Observable
final class SemesterOverviewViewModel {
    @ObservationIgnored private let env: AppEnvironment
    private(set) var overview: SemesterOverviewDto?
    private(set) var isLoading = false
    var alertMessage: String?
    init(env: AppEnvironment)
    func load(semesterId: String, force: Bool = false) async   // env.semesterRepository.semesterOverview(id:force:)
    func reload(semesterId: String) async { await load(semesterId: semesterId, force: true) }
}
```

- 既定学期解決: Web と同じ — `semesterId == nil` かつ `me.defaultSemesterId` があれば適用 (`me` は `queryClient.data(.me())` → なければ `meRepository.me()`)。適用は一度だけ (`didApplyDefault`)。
- 学期変更 (`changeSemester`): `semesterId` 更新 + `clearSelection()` (selectionMode=false, selectedDates=[], bulkSheetOpen=false)。
- Web の `Panel("学期を選択してください")` = overview==nil 時に表示。
- ★ Web に無い「全期間見込み」表示は**移植しない** (Phase A スタブの `projectedPct` 行は削除)。

### 2. AttendanceRateHero

Web `AttendanceRateHero.tsx` 忠実。

```swift
struct AttendanceRateHero: View {
    let overall: SemesterOverviewDto.Overall
    let requiredRate: Int
}
```

- 見出し `Text("今日までの出席率")` (`.atenderSm.weight(.bold)`, `.textSecondary`)。
- 数値: `pct = overall.toDate.attendanceRate.map { Int(($0*100).rounded()) }`。`nil→"—"`。`.atender5xl.weight(.black)` + `%` `.atender2xl.weight(.bold)`、色 `Color.forRate(pct:required:)`。右に `"\(num限) / \(den)限"` 相当 `Text("\(clean(effNum)) / \(clean(effDen))限")` (`.atenderXs`, `.textTertiary`) — `toDate.effectiveNumerator/Denominator`。
- プログレスバー: 高さ 10pt (`h-2.5`)。`bgMuted` トラック + 塗り幅 `clamp(pct ?? 0, 0, 100)%` 色=rateColor + 必要率マーカー (縦 2pt 線 `Color.textTertiary`, `left = requiredRate%`)。既存 `RateProgressBar`(Canvas) を流用可だがマーカー色は Web=`fg-tertiary` に合わせる。
- アクション行: `Text(overallActionText(...))` 色 `overallActionColor(...)` + 右に `Text("残り \(overall.remainingCount)限")` (`.atenderXs.textTertiary`)。
- 未記録バナー: `overall.unrecordedCount > 0` のとき `AlertTriangle` (SF: `exclamationmark.triangle.fill`) + `"未記録 \(n) 件 — 記録して"`。背景 `Color.statusTardy.opacity(0.15)`、左 3pt ボーダー `statusTardy`、文字 `statusTardy`、角丸 `Radius.timetableCell`。**「カレンダーへ」ボタンは出さない** (Web SemesterOverview は `onJumpToCalendar` を渡さない)。

### 3. AttendanceCalendar (出欠特化・日曜始まり・新規)

Web `AttendanceCalendar.tsx` 忠実。**CalendarMonth とは別物**。

```swift
struct AttendanceCalendar: View {
    let days: [AttendanceDaySummary]
    let startDate: String
    let endDate: String
    let today: String
    let semesterId: String?
    let selectionMode: Bool
    let selectedDates: Set<String>
    let onSelectDay: (String) -> Void
    let onToggleSelectionMode: () -> Void
    let onToggleDate: (String) -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var anchor: String          // 月初 yyyy-MM-01。init で clampMonth(today,…)
    @State private var eventDates: Set<String> = []   // 表示中グリッド範囲の個人予定がある日
}
```

- **ヘッダ**: `‹` (前月, `atStart` で disabled+opacity0.3) / `Text(anchor.format(.yearMonth))` (`.atenderBase.bold`) / `›` (次月, `atEnd` で disabled)。ナビボタンは 44x44 の丸タップ域。
- **ツールバー行** (右寄せ `HStack`): `anchor != todayMonth` のとき `今日` チップ (押下で `anchor = todayMonth`)。`複数選択`/`選択中` トグルチップ (`selectionMode` で `bg-accent-500 text-on-accent`、`aria`=selectionMode)。押下 = `onToggleSelectionMode()`。
- **曜日ヘッダ**: `["日","月","火","水","木","金","土"]` (`.atender(10, .bold)`, `.textTertiary`)、7列。
- **セルグリッド**: `LazyVGrid` 7列, spacing 6pt (`gap-1.5`)。セル = `aspect-square` の角丸 (`Radius.timetableCell` = 8pt) ボタン。セル内容 (下から): 日付数字 (`.bold`) + statusVisual アイコン (16pt, `.mt-0.5`)。
- **セルの状態装飾** (重ね順):
  - 背景: `visual.bg` (statusVisual、下表)。
  - ボーダー: `visual.dashed ? 破線(色=statusTardy 40%) : border-border-subtle`。
  - `iso == today` → `ring 1pt accent 60%`。`selected` → `ring 2pt accent`。
  - `inMonth==false` (前後月) → 文字 `textTertiary` + `opacity 0.4`。
  - `selected` → 左上に `accent500` 丸バッジ + `checkmark` (12pt, `.bold`)。
  - `hasEvent` (eventDates に含む) → 右上に 8pt `accent500` ドット。
  - `disabled = selectionMode && !inSemester` → `opacity 0.25` + タップ無効。
- **タップ**: `selectionMode ? onToggleDate(iso) : onSelectDay(iso)`。
- **凡例 (Legend)**: check=出席 / x=欠席あり / clock=遅刻・早退 / ban=休講 / 破線=未記録あり / accentドット=予定。`.atender(10,.bold)`, `.textTertiary`。
- **個人予定ドット取得**: 表示グリッド範囲 (gridStart〜gridEnd) の `personalEventRepository.personalEvents(from:to:semesterId:)` を呼び `eventDates = Set(events.map{$0.date})`。`anchor` 変化と `semesterId` 変化で再取得 (`.task(id: anchor)` / `.onChange`)。
- **前後月ナビ境界**: `atStart = anchor.prefix(7) == startDate.prefix(7)`、`atEnd = anchor.prefix(7) == endDate.prefix(7)`。

#### statusVisual マッピング (Web `lib/dayStatusVisual.ts` 忠実)

純粋関数 `AttendanceDayVisual.of(status:isFuture:)` を新規追加 (下記「純粋ロジック」)。`isFuture = iso > today`。

| status | isFuture 分岐 | icon (SF Symbol) | iconColor | 背景 bg | dashed |
|---|---|---|---|---|---|
| (未来 && status≠ALL_SUSPENDED) | 最優先 | none (無し) | statusNone | 無し | false |
| `ALL_PRESENT` | — | `checkmark` | statusPresent | statusPresent 20% over bgElevated | false |
| `HAS_ABSENT` | — | `xmark` | statusAbsent | statusAbsent 26% over bgElevated | false |
| `HAS_TARDY` | — | `clock` | statusTardy | statusTardy 24% over bgElevated | false |
| `ALL_SUSPENDED` | 未来でも表示 | `nosign` | statusSuspended | statusSuspended 20% over bgElevated | false |
| `PARTIAL_UNRECORDED` | — | `minus` | textTertiary | statusNone 12% over bgElevated | **true** |
| `NO_CLASS` / nil / unknown | — | none | statusNone | 無し | false |

- **背景の "N% over bgElevated"**: Web の `color-mix(in srgb, <status> N%, var(--color-bg-elevated))` を移植。SwiftUI では **セル背景を `Color.bgElevated` にした上で `statusColor.opacity(N/100)` をオーバーレイ**して近似する (`ZStack { bgElevated; statusColor.opacity(fraction) }`)。fraction は上表の % を 0..1 化。`bg` が「無し」の場合はオーバーレイ無し (セル素地)。
- **アイコン `strokeWidth 2.5` 相当**: SF Symbol は `.fontWeight(.bold)` + `.font(.system(size:16))` で近似。iconColor は `.foregroundStyle`。
- SF Symbol 対応: check=`checkmark` / x=`xmark` / clock=`clock` / ban=`nosign` / minus=`minus`。

#### 複数選択モデル

- 選択状態は**親 (SemesterOverviewView) が保持** (`selectedDates: Set<String>`)。AttendanceCalendar は `selectedDates`/`selectionMode` を読み、`onToggleDate`/`onToggleSelectionMode` で親へ通知 (Web と同一のリフトアップ)。
- `onToggleSelectionMode`: 親側で `selectionMode.toggle()`。**true→false に落とすとき `selectedDates` をクリア** (Web と同じ)。
- `toggleDate(iso)`: 親の Set に insert/remove。
- 選択可能日: **学期範囲内のみ** (`startDate <= iso <= endDate`)。範囲外は selectionMode 中 disabled。
- selectionMode 中は日タップで DayDetailSheet を開かない (トグルのみ)。

### 4. CourseListItem

Web `CourseListItem.tsx` 忠実。

```swift
struct CourseListItem: View {
    let stats: CourseStatsDto
    let requiredRate: Int
    let onTap: () -> Void
}
```

- ボタン全体 = `bgElevated` カード (角丸 `Radius.timetableCell` 相当、Web=rounded-2xl)。左に 4pt 縦バー (色=rateColor)。
- 1行目: 科目名 (`.atenderSm.bold`, 1行 truncate) + `stats.counts.unrecorded > 0` で `exclamationmark.triangle.fill` + 数字バッジ (statusTardy 18% 背景)。右端に率 `.atender2xl.weight(.black)` 色=rateColor (nil→"—")、`%` は nil 以外で付与。
- 2行目: ミニプログレスバー (高さ 6pt = `h-1.5`) + 必要率マーカー。
- 3行目: `"出\(present) 欠\(absent) ・ \(shortActionText)"` (`.atenderXs`, `.textTertiary`)。action 部だけ色 `courseActionColor(...)`。
- 押下 → `onTap()` (親が openCourseId をセット)。

### 5. DayDetailSheet (BottomSheet stackLevel 1)

Web `DayDetailSheet.tsx` 忠実。

```swift
struct DayDetailSheet: View {
    let date: String
    let semesterId: String?
    let onChanged: () async -> Void        // 親 overview を reload させる通知
    let onClose: () -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var model: DayDetailViewModel
    @State private var reason = ""
    @State private var editingEvent: PersonalEventDto?
    @State private var creatingEvent = false
}

@MainActor @Observable
final class DayDetailViewModel {
    @ObservationIgnored private let env: AppEnvironment
    let date: String
    private(set) var detail: DayDetailDto?
    private(set) var isLoading = false
    var errorMessage: String?
    init(env: AppEnvironment, date: String)
    func load() async
    // 各 mutation は下記 Repository を呼び → 成功後 self.load() + 親 onChanged() を発火
    func createTimetableSuspension(reason: String?) async
    func deleteTimetableSuspension(id: String) async
    func patchAttendance(occurrenceId: String, status: AttendanceStatus) async
    func deleteAttendance(occurrenceId: String) async
    func createCourseSuspension(courseId: String) async
    func deleteCourseSuspension(courseId: String, id: String) async
    func bulkMark(status: AttendanceStatus, mode: BulkMode) async
    func deletePersonalEvent(id: String) async
}
```

タイトル: `date.format(.yearMonthDayWeekday)` (Web=`YYYY年M月D日 (ddd)`。`CalendarRange.format` に曜日付きパターンを追加)。

構成 (縦):
1. **休講セクション** (`bgMuted 50%` カード):
   - `timetableSuspension != nil` → `"休講中: \(reason)"` (`statusCancelled`) + `休講を解除` ボタン (ghost, `deleteTimetableSuspension`)。
   - nil → 見出し `"この日を休講にする (時間割全体)"` + 理由 `TextField` (maxLength 100) + `この日を休講にする` (primary, `createTimetableSuspension(reason)`; 成功後 reason クリア)。
2. **授業セクション**: 見出し `"授業 (\(occurrences.count))"`。
   - `occurrences.count > 0 && timetableSuspension == nil` → `DayBulkAttendanceControl` (下記)。
   - `ForEach occurrences` → `OccurrenceRow`。
   - 0件 → `"授業はありません"`。
3. **予定セクション**: 見出し `"予定 (\(personalEvents.count))"` + `追加` ボタン (secondary → creatingEvent=true)。各予定行: 色ドット + タイトル + `終日` or `H:MM - H:MM` + 編集/削除 IconButton。0件 → `"予定はありません"`。
4. `PersonalEventEditModal` ×2 (作成用 `creatingEvent` / 編集用 `editingEvent`, stackLevel 2)。

派生値 (純粋、DayDetailViewModel の computed):
- `courseSuspendedIds: Set<String>` = `detail.courseSuspensions.map(\.courseId)`。
- `unrecordedCount` = `occurrences.filter { $0.status == nil && !courseSuspendedIds.contains($0.courseId) }.count`。
- `occurrenceCount` = `occurrences.filter { !courseSuspendedIds.contains($0.courseId) }.count`。

#### DayBulkAttendanceControl (分割ボタン + メニュー)

```swift
struct DayBulkAttendanceControl: View {
    let occurrenceCount: Int
    let unrecordedCount: Int
    let isPending: Bool
    let onMark: (AttendanceStatus, BulkMode) -> Void   // status は CANCELLED 以外
}
```

- `allRecorded = unrecordedCount == 0`、`mode = allRecorded ? .overwrite : .fill` (純粋 `dayBulkMode`)。
- メインボタン: `allRecorded ? "全部 出席に上書き"(secondary) : "全部出席にする (\(unrecordedCount))"(primary)` → `onMark(.present, mode)`。
- 分割の `chevron.down` → メニュー (`ABSENT/EXCUSED/TARDY/EARLY_LEAVE`)。各項目ラベル: `allRecorded ? "全部 \(long) に上書き" : "全部 \(long) (\(unrecordedCount))"`。メニュー説明文も Web 準拠。`long` = statusLongLabels (欠/公/遅/早 の2字ラベル。`AttendanceStatus.label` の "欠席/公欠/遅刻/早退" を使用)。

#### OccurrenceRow

```swift
struct OccurrenceRow: View {
    let occurrence: OccurrenceDto
    let timetableSuspended: Bool
    let courseSuspension: CourseSuspensionDto?
    let onPatch: (AttendanceStatus) -> Void
    let onDeleteAttendance: () -> Void
    let onCreateCourseSuspension: () -> Void
    let onDeleteCourseSuspension: (String) -> Void
}
```

- 1行目: `"\(periodIndex)限 \(courseName)"` + `H:MM - H:MM` + バッジ (`timetableSuspended`→"休講中 (時間割全体)" / `courseSuspension`→"科目休講中")。
- 2行目: ステータスチップ列 `未 / 出 / 欠 / 公 / 遅 / 早 / 休`。
  - `未` = active when `status == nil` → `onDeleteAttendance()`。
  - 他 = `PRESENT/ABSENT/EXCUSED/TARDY/EARLY_LEAVE/CANCELLED` → `onPatch(status)`。active when `status == item`。
  - `disabled = timetableSuspended || courseSuspension != nil`。
  - 末尾に `科目休講`/`科目休講解除` ボタン (ghost)。`timetableSuspended` 中は disabled。
- チップ配色: active=`accent500`/`textOnAccent`、非active=`bgElevated`/`textSecondary`。

### 6. BulkActionBar

```swift
struct BulkActionBar: View {
    let count: Int
    let onOpenSheet: () -> Void
    let onCancel: () -> Void
}
```

- `selectionMode` 中のみ表示。下部固定 overlay (`Color.bgElevated` カード、Web=`fixed inset-x-3 bottom-20`)。iOS は `SemesterOverviewView` の `ZStack(alignment: .bottom)` overlay に置き、`.padding(.bottom, Space.tabBarHeight + Space.s3)` でタブバー上に浮かせる。
- `"\(count)日選択中"` + `一括操作` (primary, count==0 で disabled → onOpenSheet) + `キャンセル` (ghost → onCancel = clearSelection)。

### 7. BulkEditSheet (BottomSheet stackLevel 1)

Web `BulkEditSheet.tsx` 忠実。

```swift
struct BulkEditSheet: View {
    let dates: [String]                    // sortedDates
    let semesterId: String?
    let onDone: () -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var status: AttendanceStatus?
    @State private var overwrite = false
    @State private var reason = ""
    @State private var eventTitle = ""
    @State private var errorMessage: String?
    @State private var anyPending = false
}
```

タイトル `"\(dates.count)日に一括適用"`。冒頭に `"\(formatDateList(dates)) の\(count)日に一括適用"`。

4 セクション (各 `border-t` 区切り):
1. **出席を一括登録**: ステータス丸ボタン `出/欠/公/遅/早` (`PRESENT/ABSENT/EXCUSED/TARDY/EARLY_LEAVE`、選択で accent)。`記録済みも上書きする` チェック (`overwrite`)。`この内容で登録` (primary, `status==nil||anyPending` で disabled) → `bulkMark(dates, status, overwrite ? .overwrite : .fill)`。成功トースト `markToast(upserted, skippedExisting, skippedSuspended)` → `onDone()`。
2. **未記録に戻す**: `選択日の記録をすべて削除` (danger) → `bulkClear(dates)`。成功 `"\(deletedCount)件 削除しました"`。
3. **休講**: 理由 `TextField` (maxLength 100)。`休講にする` (secondary) → `bulkCreateTimetableSuspensions(dates, reason)` 成功 `"\(createdCount)日 休講登録\(skipped>0 ? " (\(skipped)日 登録済み)" : "")"`。`休講を解除` (ghost) → `bulkRemoveTimetableSuspensions(dates)` 成功 `"\(removedCount)日 解除しました"`。
4. **予定**: タイトル `TextField` (maxLength 80)。`選択日すべてに終日予定を追加` (secondary, 空/pending で disabled) → **各 date に `createPersonalEvent(date, title, isAllDay: true, semesterId)` を並列発行** (`withTaskGroup`)。全成功 `"\(n)日に予定を追加しました"`、一部失敗 `"\(ok)件 追加、\(ng)件 失敗しました"` + errorMessage。
- 成功時は `onDone()` (= 親 clearSelection + BulkEditSheet close)。トーストは `environment.toastCenter.show(_:)` (2.6s)。

### 8. CourseDetailModal (FullScreenModal)

Web `CourseDetailModal.tsx` 忠実。

```swift
struct CourseDetailModal: View {
    let courseId: String
    let onClose: () -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var editOpen = false
}
```

- タイトル "科目"、`FullScreenModal(isPresented:title:)` (戻る/×)。
- 科目 (+所属 timetable) を `timetableRepository.userTimetables()` から検索 (`findCourse`)。見つからなければ `Panel("科目が見つかりません")`。`semesterId = timetable.semesterId ?? me.defaultSemesterId`。
- 縦構成:
  1. **CourseEditSection**: `bgElevated` カード。`course.name` (`.atenderBase.bold`) + `course.teacher ?? "先生未設定"` + `course.note` (任意) + `編集` ボタン (primary → editOpen)。`CourseEditModal(isPresented:$editOpen, timetableId:course:onSaved:)` (Phase B 再利用)。onSaved 後 userTimetables は既に invalidate 済 → 再取得。
  2. `CourseSuspensionSection(courseId:)`。
  3. `CourseOccurrenceHistory(courseId:, semesterId:)`。
  4. `DangerZone(courseId:, onDeleted: onClose)`。
- Web は openCourseId で開閉。iOS は `.fullScreenCover(item:)` 相当 (courseId Optional binding)。

#### CourseSuspensionSection

Web `CourseSuspensionSection.tsx` 忠実。

```swift
struct CourseSuspensionSection: View {
    let courseId: String
    @Environment(AppEnvironment.self) private var environment
    @State private var suspensions: [CourseSuspensionDto] = []
    @State private var date = ""      // yyyy-MM-dd (DatePicker)
    @State private var reason = ""
    @State private var errorMessage: String?
    @State private var isPending = false
}
```

- 見出し `"休講日"`。一覧: 各行 `date` (tabular) + reason + 削除 (`trash`)。0件 → `"休講日はまだ登録されていません"`。
- 追加フォーム: 日付 (`DatePicker`, `.date` → yyyy-MM-dd 文字列化) + 理由 (maxLength 100, placeholder "学園祭振替 等") + `追加` (primary, date 空/pending で disabled)。成功で date/reason クリア。
- `courseSuspensionRepository.list(courseId:)` / `.create(courseId:date:reason:)` / `.delete(courseId:id:)`。create 失敗 (409 DUPLICATE) は `errorMessage` に表示。
- ★ Web は `<input type="date">`。iOS はネイティブ `DatePicker` を使う (WebKit の date input はみ出し gotcha は iOS ネイティブでは無関係)。

#### CourseOccurrenceHistory

Web `CourseOccurrenceHistory.tsx` 忠実。

```swift
struct CourseOccurrenceHistory: View {
    let courseId: String
    let semesterId: String?
    @Environment(AppEnvironment.self) private var environment
    @State private var stat: CourseStatsDto?
}
```

- `semesterRepository.semesterOverview(id:)` の `courses` から courseId 一致を取得。無ければ非表示 (`EmptyView`)。
- 見出し `"出席履歴"`。2〜3列グリッドで counts: 出席/欠席/遅刻/早退/公欠/休講(個別)=cancelled/休講(一括)=suspended/未記録=unrecorded。各セル色は status 色 (`present/absent/tardy/early/excused/cancelled`、未記録=textTertiary)。
- 末尾: `"\(clean(effNum)) / \(clean(effDen)) = \(rate)"` (`attendanceRate` nil→"—"、そうでなければ `"\((rate*100)を小数1桁)%"`)。
- ★ status-early 色: 現状 `Color+Atender.swift` に `statusEarly` があるか要確認 (grep で present/absent/tardy/suspended/none のみ確認済)。**無ければ `statusEarly = dynamic(dark:#C685FF, light:#9333EA)` を追加** (bible §1.1)。cancelled 色も同様に `statusCancelled` (dark rgba(255,255,255,0.30)/light rgba(15,23,42,0.40)) が無ければ追加。

#### DangerZone

Web `DangerZone.tsx` 忠実。

```swift
struct DangerZone: View {
    let courseId: String
    let onDeleted: () -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var confirming = false
}
```

- `statusAbsent 30%` ボーダー + `statusAbsent 5%` 背景カード。見出し `"この科目を削除"` (statusAbsent)。説明 `"出席記録・休講日も全て削除されます。元に戻せません。"`。`削除する` (ghost, statusAbsent 文字) → `confirming=true`。
- `ConfirmDialog(open:$confirming, title:"科目を削除", body:…, confirmLabel:"削除する", onConfirm:)` → `courseRepository.deleteCourse(id:)` → `onDeleted()` (= CourseDetailModal を閉じる)。

### 9. PersonalEventEditModal (BottomSheet stackLevel 2)

Web `PersonalEventEditModal.tsx` 忠実。

```swift
struct PersonalEventEditModal: View {
    let date: String
    var event: PersonalEventDto?        // nil=作成
    let semesterId: String?
    let onSaved: (PersonalEventDto) -> Void
    @Binding var isPresented: Bool
    @Environment(AppEnvironment.self) private var environment
    @State private var form: Form       // title, date, isAllDay, startTime, endTime, color, note
    @State private var isPending = false
    @State private var errorMessage: String?
}
```

- タイトル `event==nil ? "予定を追加" : "予定を編集"`。フィールド: タイトル (必須, maxLength 100) / 日付 (`DatePicker`) / `終日` トグル (既定 true) / 非終日時のみ 開始/終了時刻 (`DatePicker .hourAndMinute`) / 色 (5候補 + カスタム `ColorPicker`) / メモ (maxLength 500)。
- 保存: `isAllDay ? startMinute=nil,endMinute=nil : timeToMinute(...)`。`event != nil ? updatePersonalEvent : createPersonalEvent`。`canSave = title 非空 && date 非空 && !pending`。
- color 候補: `["#10b981","#60a5fa","#f472b6","#8b5cf6","#f59e0b"]` (Web と同一)。既定 startMinute=540/endMinute=600。

---

## 純粋ロジック (Reviewer が単体テスト、View 非依存)

### 既存で流用 (再定義しない・Web と一致確認済)

| 関数 | 場所 | Web 対応 | 一致 |
|---|---|---|---|
| `Color.forRate(pct:required:)` | `Color+Atender.swift` | `lib/attendanceRateColor.ts` `rateColor` | ✅ (pct>=req→accent, else absent。Web の重複 branch も実質同値) |
| `SemesterOverviewDisplayLogic.overallActionText/Color` | 既存 (置換後も維持) | Hero `actionText/actionColor` | ✅ |
| `SemesterOverviewDisplayLogic.courseActionText/Color` | 既存 | `CourseListItem` `shortActionText/actionColor` | ✅ |
| `SemesterOverviewDisplayLogic.pct(rate:)/rateText(_:)` | 既存 | `Math.round(rate*100)` | ✅ |
| `TimeFormatting.minutesToTime` | `TimetableLogic.swift` | `minuteLabel` | ✅ (H:MM) |

> ★ `SemesterOverviewDisplayLogic` は現行ファイルに存在するが Phase A スタブ内。Phase C の全面置換時に**この enum は保持**し、View から `全期間見込み` 呼び出しのみ削る。

### 新規追加する純粋ロジック

`Features/SemesterOverview/SemesterLogic.swift` (新規) にまとめる:

```swift
enum AttendanceDayVisual {
    struct Visual: Equatable {
        let icon: Icon           // check/x/clock/ban/minus/none
        let iconColor: Color
        let bgStatusColor: Color?   // nil = 素地 (bgElevated のみ)
        let bgFraction: Double      // 0..1。over bgElevated の不透明度
        let dashed: Bool
    }
    enum Icon: Equatable { case check, x, clock, ban, minus, none }
    static func of(status: AttendanceDayStatus?, isFuture: Bool) -> Visual
    // isFuture && status != .allSuspended → none/透明/dashed=false を最優先で返す
}

enum SemesterCalendarGrid {
    // 日曜始まり。gridStart = sundayOf(monthFirst(anchor)), gridEnd = saturdayOf(monthEnd(anchor))
    // 返り値: [String] の全セル日付 (35 or 42 個。Web の startOf('week')…endOf('week') と一致)
    static func cells(monthAnchor: String) -> [String]
    static func clampMonth(_ target: String, start: String, end: String) -> String  // 月初 yyyy-MM-01
    static func atStart(anchor: String, start: String) -> Bool   // 同月
    static func atEnd(anchor: String, end: String) -> Bool
    static func sundayOf(_ date: String) -> String               // 日曜始まり (CalendarRange.mondayOf の日曜版)
}

enum DayDetailLogic {
    static func courseSuspendedIds(_ d: DayDetailDto) -> Set<String>
    static func unrecordedCount(_ d: DayDetailDto) -> Int
    static func occurrenceCount(_ d: DayDetailDto) -> Int
    static func bulkMode(unrecordedCount: Int) -> BulkMode   // unrecorded==0 ? .overwrite : .fill
}

enum BulkToast {
    static func mark(upserted: Int, skippedExisting: Int, skippedSuspended: Int) -> String
    static func createSuspensions(created: Int, skipped: Int) -> String
    static func formatDateList(_ dates: [String]) -> String   // "M/D, M/D, …"
}
```

- `AttendanceDayVisual.of` の分岐順は Web と厳密一致 (未来判定が最優先、次に status 別、最後に default=none)。iconColor / bgFraction の値は上の statusVisual 表の通り。
- `SemesterCalendarGrid.cells` は **日曜始まり**。既存 `CalendarRange` は月曜始まりなので流用せず、`CalendarRange.parse/addDays/yyyyMMdd/monthFirst` を土台に日曜版 helper を新設する。
- `mMd(_:)` (期間ラベル "M/D") は `CalendarRange.format(_, .monthDay)` を流用可 ("7/1")。

---

## データ層への追加 (Repository メソッド + invalidation)

Phase A/B の Repository には **DayDetail / 日別出欠 mutation / 休講 CRUD / 一括 / 科目削除 / 個人予定 CRUD** が未実装。Phase C で追加する。既存の `QueryClient` (prefix invalidate) と `invalidationTargets(for:)` に乗せる。

### 新規/拡張 Repository

```swift
// 新規: Core/Data/DayRepository.swift
@MainActor @Observable
final class DayRepository {
    init(client: APIClient, cache: QueryClient)
    func dayDetail(date: String, force: Bool = false) async throws -> DayDetailDto   // key .dayDetail(date)
    func patchAttendance(occurrenceId: String, status: AttendanceStatus) async throws
    func deleteAttendance(occurrenceId: String) async throws
    func createTimetableSuspension(date: String, reason: String?) async throws -> TimetableSuspensionDto
    func deleteTimetableSuspension(id: String, date: String) async throws
    func createCourseSuspension(courseId: String, date: String, reason: String?) async throws -> CourseSuspensionDto
    func deleteCourseSuspension(courseId: String, id: String) async throws
    func bulkMark(dates: [String], status: AttendanceStatus, mode: BulkMode) async throws -> BulkMarkAttendanceResponse
    func bulkClear(dates: [String]) async throws -> BulkClearAttendanceResponse
    func bulkCreateTimetableSuspensions(dates: [String], reason: String?) async throws -> BulkTimetableSuspensionResponse
    func bulkRemoveTimetableSuspensions(dates: [String]) async throws -> BulkTimetableSuspensionRemoveResponse
}

// 新規: Core/Data/CourseRepository.swift
@MainActor @Observable
final class CourseRepository {
    init(client: APIClient, cache: QueryClient)
    func courseSuspensions(courseId: String, force: Bool = false) async throws -> [CourseSuspensionDto]  // key .courseSuspensions(courseId)
    func createCourseSuspension(courseId: String, date: String, reason: String?) async throws -> CourseSuspensionDto
    func deleteCourseSuspension(courseId: String, id: String) async throws
    func deleteCourse(id: String) async throws
}

// 拡張: PersonalEventRepository (create/update/delete + range 取得)
func personalEvents(from: String, to: String, semesterId: String?) async throws -> [PersonalEventDto]  // 既存
func createPersonalEvent(_ input: PersonalEventCreateInput) async throws -> PersonalEventDto
func updatePersonalEvent(id: String, _ input: PersonalEventUpdateInput) async throws -> PersonalEventDto
func deletePersonalEvent(id: String, date: String) async throws
```

- `courseSuspension` 系は Day/Course 双方から呼ばれる。**実体は 1 箇所 (CourseRepository)** に置き、DayRepository は委譲 or 同 endpoint 直呼び。二重定義を避ける (どちらでも invalidation は同一なので、DayRepository 側の `create/deleteCourseSuspension` は CourseRepository を内部利用)。
- `AppEnvironment` に `dayRepository` / `courseRepository` を追加し init で配線。

### invalidation マトリクス追加 (`InvalidationMatrix.swift`)

既存の `Mutation` に不足分を追加。invalidation は Web hooks と一致させる:

| Mutation (新規/既存) | invalidate prefixes | Web hook 根拠 |
|---|---|---|
| `.patchAttendance` (既存) | `stats`, `semesters`, `day` | usePatchAttendance |
| `.deleteAttendance` (既存) | `today`, `stats`, `semesters`, `day` | useDeleteAttendance |
| `.bulkAttendance` (既存) | `semesters`, `stats`, `day`, `today`, `timetable-suspensions` | useBulkMarkAttendance |
| **`.bulkClearAttendance`** (新規) | `semesters`, `stats`, `day`, `today` | useBulkClearAttendance |
| `.courseSuspension(courseId)` (既存) | `courses/<id>/suspensions`, `semesters`, `stats`, `day` | useCreate/DeleteCourseSuspension |
| `.timetableSuspension(date)` (既存) | `timetable-suspensions`, `day`, `semesters`, `stats`, `today`, `day/<date>` | useCreate/DeleteTimetableSuspension |
| **`.bulkTimetableSuspension`** (新規) | `timetable-suspensions`, `day`, `semesters`, `stats`, `today` | useBulkCreate/RemoveTimetableSuspensions |
| `.personalEvent(date)` (既存) | `personal-events`, `day`, `day/<date>` | usePersonalEvents 系 |
| **`.deleteCourse`** (新規) | `user-timetables`, `today`, `stats`, `semesters`, `day` | useDeleteCourse |
| `courseCreate/Update` | (TimetableRepository inline: `user-timetables`, `today`, `semesters`。既存のまま) | useCreate/UpdateCourse |

- iOS は「invalidate = stale フラグ」で自動 refetch しない。**mutation 後の反映は VM 側の reload で行う** (Phase B 踏襲):
  - DayDetailViewModel: 各 mutation 成功後 `await load()` (自 detail 再取得) + `await onChanged()` (親 SemesterOverviewViewModel.reload → hero/calendar/科目一覧更新)。
  - BulkEditSheet: mutation 後 `onDone()` → 親 `clearSelection()` + `SemesterOverviewViewModel.reload()`。
  - CourseSuspensionSection/CourseEditModal/DangerZone: mutation 後、自身の一覧 reload + CourseDetailModal 全体 (OccurrenceHistory は overview 依存) を再取得。CourseDetailModal close 時にも overview.reload。
- **楽観更新**: Web は day/attendance を invalidation ベース (楽観は today のみ)。iOS も **DayDetailSheet の出欠 patch は楽観更新なしで load 再取得**とする (Web と同じ体感: mutate→invalidate→refetch)。`AttendanceOptimistic` (today 用) は流用しない。

---

## 使用 DTO / Endpoint (すべて実装済・追加不要)

**DTO** (`Core/Models/DTOs.swift`): `SemesterOverviewDto`(+Overall/ToDate), `CourseStatsDto`(+Counts/ToDate), `AttendanceDaySummary`, `DayDetailDto`, `OccurrenceDto`, `CourseSuspensionDto`/`CourseSuspensionCreateInput`, `TimetableSuspensionDto`/`CreateInput`/`Bulk*`, `PersonalEventDto`/`Create`/`Update`Input, `CourseDto`/`CourseUpdateInput`, `BulkMarkAttendanceInput`/`Response`, `BulkClearAttendanceInput`/`Response`, `MarkAttendanceInput`。

**Endpoint** (`Endpoints`): `semesterOverview(id:)`, `dayDetail(date:)`, `markAttendance(occurrenceId:_:)`, `deleteAttendance(occurrenceId:)`, `bulkAttendance(_:)`, `bulkClearAttendance(_:)`, `createTimetableSuspension`/`deleteTimetableSuspension`/`bulkTimetableSuspension`/`bulkRemoveTimetableSuspension`, `courseSuspensions`/`createCourseSuspension`/`deleteCourseSuspension`, `updateCourse`/`deleteCourse`, `personalEvents`/`createPersonalEvent`/`updatePersonalEvent`/`deletePersonalEvent`, `userTimetables`。

**Enum**: `AttendanceStatus`(present/absent/excused/tardy/earlyLeave/cancelled), `AttendanceDayStatus`(allPresent/hasAbsent/hasTardy/allSuspended/partialUnrecorded/noClass), `BulkMode`(fill/overwrite)。

---

## 挙動仕様 (Reviewer テスト生成の根拠)

### AttendanceDayVisual.of (statusVisual)

- 正常: `of(.allPresent, isFuture:false)` → icon=check, iconColor=statusPresent, bgFraction=0.20, dashed=false。
- `of(.hasAbsent, false)` → x/statusAbsent/0.26/false。
- `of(.hasTardy, false)` → clock/statusTardy/0.24/false。
- `of(.allSuspended, false)` → ban/statusSuspended/0.20/false。
- `of(.partialUnrecorded, false)` → minus/textTertiary/0.12/**dashed=true**。
- `of(.noClass, false)` / `of(nil, false)` / `of(.unknown, false)` → none/statusNone/bgStatusColor=nil/dashed=false。
- **未来分岐 (最優先)**: `of(.allPresent, isFuture:true)` → none (bg 無し)。`of(.hasAbsent, true)` → none。`of(.allSuspended, isFuture:true)` → **ban のまま**表示 (例外)。

### SemesterCalendarGrid

- `cells(monthAnchor:"2026-07-01")` の先頭 = 2026-06-28 (日曜)、末尾 = 2026-08-01 (土曜) を含む範囲。全要素が連続日付・先頭が日曜・末尾が土曜。
- `clampMonth("2026-05-15", start:"2026-06-01", end:"2026-08-31")` → "2026-06-01"。範囲内はその月初、範囲後は "2026-08-01"。
- `atStart(anchor:"2026-06-10", start:"2026-06-01")` → true (同月)。`atEnd` 同様。

### DayDetailLogic

- `unrecordedCount`: status==nil かつ courseSuspension されていない occurrence のみ数える。course 休講中の occurrence は未記録に含めない。
- `occurrenceCount`: courseSuspension を除いた occurrence 数。
- `bulkMode(unrecordedCount:0)` → .overwrite。`bulkMode(unrecordedCount:3)` → .fill。

### DayDetailSheet 操作

- 休講登録: `timetableSuspension==nil` で「この日を休講にする」→ 全 OccurrenceRow が disabled + バッジ「休講中 (時間割全体)」。解除で復帰。
- 出欠: `未`タップ (status!=nil のとき) → deleteAttendance → status=nil。`出`タップ → patch(PRESENT)。course 休講中/timetable 休講中は全チップ disabled。
- 科目休講: OccurrenceRow の「科目休講」→ その courseId の他 occurrence にもバッジ「科目休講中」+ disabled。timetableSuspended 中は科目休講ボタン自体 disabled。
- 一括: unrecordedCount>0 → メイン「全部出席にする (N)」= FILL。unrecordedCount==0 → 「全部 出席に上書き」= OVERWRITE。
- 各 mutation 後: 自 detail 再取得 + 親 overview 再取得 (hero 率・カレンダーアイコンが即更新)。
- 異常: mutation 失敗 → `environment.toastCenter.show("保存できませんでした、もう一度試してください")`、状態は変えない (load で復元)。

### 複数選択 → 一括

- `複数選択` トグル → selectionMode=true。学期範囲内の日タップで selectedDates に追加/除去 (check バッジ表示)。範囲外は選択不可 (disabled)。
- `複数選択`→再タップで false + selectedDates クリア。
- BulkActionBar「一括操作」→ BulkEditSheet (dates=sorted)。
- bulkMark: status 未選択で「この内容で登録」disabled。成功トースト `markToast`。overwrite チェックで mode 切替。
- bulkClear/bulk 休講/bulk 予定: 各成功でトースト + onDone (selection クリア + overview reload)。予定は date ごとに並列 POST、一部失敗を件数表示。

### CourseDetailModal 操作

- 編集 → CourseEditModal (Phase B)。保存で名前/先生/色/メモ更新、CourseEditSection とヘッダ即反映。
- 休講日追加/削除 → CourseSuspensionSection 一覧 + OccurrenceHistory (overview 依存) 更新。409 重複はエラー表示。
- 削除 → ConfirmDialog → deleteCourse → モーダル close + 科目一覧から消える。
- 異常: 科目が userTimetables に無い → 「科目が見つかりません」。

### rateColor / actionText (既存関数で一致確認)

- `Color.forRate(pct:85, required:70)` → accent。`forRate(pct:60, required:70)` → statusAbsent。`forRate(pct:nil, …)` → textTertiary。
- overallActionText: null→"データなし"、<0→"70% を下回る見込み"、>=remaining→"残りを全部休んでも 70% を維持"、else→"あと N限 休める"。
- courseActionText: null→"—"、<0→"下回る見込み"、>=remaining→"残り全休OK"、days==nil→"あとN限休める"、else→"あとN限 (D日) 休める"。

---

## テスト基盤

- **ユニット (純粋ロジック)**: XCTest。`apps/ios/AtenderTests/` に `SemesterLogicTests.swift` (AttendanceDayVisual / SemesterCalendarGrid / DayDetailLogic / BulkToast)。既存の DisplayLogic テストがあれば同ファイル群に追随。invalidation は `InvalidationMatrixTests` に新規 Mutation ケースを追加 (targets の集合一致を検証)。
  - 日付 fixture は本番の JST 正規化規約に合わせる (gotcha `api-test-date-fixtures-must-match-production-normalization`)。CalendarRange は UTC calendar 固定なので `yyyy-MM-dd` 文字列比較で決定的。
- **配置**: 既存 `apps/ios` のテストターゲット (xcodegen `project.yml` 定義) に従う。新規ファイルは同ターゲットに追加。
- **XCUITest / simulator 観点** (jsdom 不可の視覚は実機/シミュレータ目視):
  - AttendanceCalendar: statusVisual 各アイコン/背景/破線が Web と一致 (`ATENDER_UI_TEST_BEARER_TOKEN` 経由でログイン、seed データで各 status を再現)。
  - 複数選択: トグル → 複数日選択 → BulkActionBar 出現 → BulkEditSheet で bulkMark → 率が更新される導線。
  - DayDetailSheet: 出欠チップ・休講・一括・個人予定 CRUD。
  - CourseDetailModal: 編集/休講日/削除。
  - スクリーンショット比較は chrome-devtools MCP ではなく **iOS シミュレータ** (`xcrun simctl` / XCUITest snapshot)。accessibilityIdentifier を主要ボタン (`context-chips` 同様に `attendance-calendar` / `bulk-action-bar` / `day-detail-sheet` 等) に付与し UI テストで参照。
  - **jsdom 相当の制約**: color-mix 近似 (opacity over bgElevated) は自動ピクセル検証せず目視確認とする旨を Reviewer に明記。

---

## 不採用案 / スコープ外

- **CalendarMonth (Phase B) を AttendanceCalendar に転用**: 却下。月曜始まり・イベントchip中心で、Web AttendanceCalendar (日曜始まり・出欠アイコン・複数選択・aspect-square) と別物。日付演算プリミティブのみ共有し UI は新規。
- **出欠 patch の楽観更新 (today 方式) を DayDetailSheet にも適用**: 却下。Web が day を invalidation ベースにしている (楽観は today CTA のみ) ため、忠実移植として mutate→load 再取得に統一。体感差は refetch が速いため許容。
- **`SemesterOverviewView(semesterId:)` の外部注入継続 (Phase A スタブ形)**: 却下。Web は画面内 state + me.defaultSemesterId 解決。iOS も自己管理に変更 (タブ切替で毎回同一挙動)。
- **カレンダーと科目一覧の 2 カラム (Web md+ グリッド)**: スコープ外。モバイル iOS は縦単一カラム (Web もモバイル幅で縦積み = 忠実)。
- **`status-early` / `status-cancelled` を暫定色で代用**: 却下。無ければ bible §1.1 の実値で `Color+Atender.swift` に追加 (忠実移植)。
- **学期の作成/編集/削除・SemesterListSheet**: Phase E (設定タブ) スコープ。本タブは学期切替 (HomeSemesterPicker 再利用) のみ。
- **RoomCalendar / RoomTimetable / 友達 / テンプレート**: 別 Phase。

## 参考 knowledge

`pattern/attendance-to-date-rate-and-allowed-absences` (率/あとN回/日数換算), `pattern/course-suspension-denominator-reduction` (科目休講 CRUD), `pattern/swiftui-tanstack-query-port-invalidation-cache` (invalidation 移植), `pattern/tanstack-query-invalidation-matrix`, `gotcha/design-doc-must-specify-swift-type-signatures`, `gotcha/api-test-date-fixtures-must-match-production-normalization`, `projects/atender/.knowledge/personal-calendar-data-source-meeting-expansion`。
