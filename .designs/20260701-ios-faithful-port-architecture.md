# Atender iOS 忠実移植 — マスターアーキテクチャ + Phase A 詳細設計

> **本設計が iOS IA の正典**。`20260608-ios-foundation.md` の独自 IA (3 タブ Today/Timetable/設定、read-only 段階、SetupRequiredView=「Web でやれ」) は本設計が**上書き・是正**する。矛盾する記述は foundation doc ではなく本書に従う。
>
> 一次資料: `.designs/20260701-web-to-ios-port-bible.md` (Port Bible)。Web ソース `apps/web/src/`。DTO 正典 `packages/shared/src/schemas/`。曖昧箇所は必ず現物を読む。
>
> 絶対方針: **Web と完全一致**。スマホ独自の簡略化・IA 改変・タブ再発明をしない。迷ったら「Web がどうしているか」を `apps/web` で確認して合わせる。

---

# Part 1: マスターアーキテクチャ (横断的決定)

## 1.1 デザインシステム parity

Port Bible §1 の全トークンを Swift `Core/DesignSystem/` へ 1:1 マップする。dark を既定、light を上書き。現行 iOS の不一致・欠落 (§1.5) を Web 実値へ直す。全確定値は **Part 2 §A-1** に列挙。ここでは構造だけ確定する。

- **Color+Atender.swift**: `Color.dynamic(dark:light:)` を土台に、bg/text/border/accent スケール/status/friendship/room の全トークンを `static let`。rgba は `UIColor(hex:).withAlphaComponent(_:)` または `UIColor.white/black.withAlphaComponent(_:)` で表現。`forStatus(_:)`/`forDayStatus(_:)`/`forFriendship(_:)`/`forRoomEvent()` の色解決関数を持つ。
- **Typography.swift**: text scale (xs11〜5xl44) を `Font.atender*`。**Inter + Noto Sans JP をバンドル**し `Font.custom(_:size:relativeTo:)` で Dynamic Type 対応 (方針は §1.1.1)。leading/weight 定数を追加。
- **Space.swift**: 8pt スケール (0_5〜20) + セマンティック spacing 群を `enum Space` に追加。
- **Radius.swift**: sm/md/lg/xl/timetableCell + `full` (= 9999、実装は `Capsule()` またはコーナー半径大値)。
- **Shadow.swift** (新規): `struct ShadowSpec { color; radius; x; y }` と `enum AtenderShadow { case card, sheet, glow, glowSoft, settingsPanel; func specs(_ scheme: ColorScheme) -> [ShadowSpec] }`。SwiftUI は多重シャドウを直接持たないため `.atenderShadow(_:)` ViewModifier で `.shadow()` をスタック適用。
- **Theme.swift**: 既存のセマンティックエイリアス + テーマ切替 (§1.1.2)。
- **AmbientBackground.swift** (新規): dark 時 body に orange+purple の radial-gradient 2 枚 (Bible §1.2)。`RadialGradient` 2 枚を `ZStack` 背景に。light では非表示。

### 1.1.1 フォントバンドル方針

- **Inter** (Latin/数字) + **Noto Sans JP** (日本語) を `Atender/Resources/Fonts/` にバンドルし `Info.plist` の `UIAppFonts` に登録。
- ウェイトは regular400 / medium500 / semibold600 / bold700 / black900 の 5 段を用意 (Web の font-weight に対応)。Inter は static instance ファイル、Noto Sans JP も同 5 ウェイト。
- `Font.atender*` は `Font.custom("Inter", size:, relativeTo:)` で定義。日本語グリフは iOS のフォントフォールバックで Noto Sans JP を後段に置く。フォールバックのため `UIFontDescriptor` のカスケードは Phase A では組まず、Inter → system の自然フォールバックで日本語は system (ヒラギノ) が出る挙動を許容し、Noto Sans JP バンドルは登録のみ (完全カスケードは B 以降で調整)。**Phase A の確定要件は「Inter がラテン/数字に適用され、`tabular-nums` 相当が数値に効くこと」**。
- `tabular-nums` (出席率・限数) は `.monospacedDigit()` modifier で担保。

### 1.1.2 テーマ切替 (auto/light/dark、dark 既定)

Web の theme-auto-resolve パターン (`Muraki/knowledge/pattern/theme-auto-resolve-data-theme-matchmedia`) の iOS 版。SwiftUI は `preferredColorScheme` に `nil` を渡せば OS 追従になるため matchMedia 監視は不要。

```swift
enum ThemePreference: String, CaseIterable, Codable {
    case auto, light, dark
    var colorScheme: ColorScheme? {   // nil = OS 追従
        switch self {
        case .auto: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
    var label: String { switch self { case .auto: "自動"; case .light: "ライト"; case .dark: "ダーク" } }
}
```

- 永続化: `@AppStorage("atender.theme")` に rawValue。**既定値 = `.dark`** (Web の `:root` 既定が dark、Bible §1)。
- 適用: `RootView` に `.preferredColorScheme(themePref.colorScheme)`。`AmbientBackground` は `@Environment(\.colorScheme)` で dark 判定して表示切替。
- 設定画面 (Phase E) の 3 択セグメントは `ThemePreference.allCases` を選ぶだけ。

## 1.2 ナビゲーション shell

### 1.2.1 5 タブ (Bible §2.2、`navItems.ts`)

| # | ラベル | route相当 | SF Symbol | アクティブ表示 |
|---|---|---|---|---|
| 1 | ホーム | `/` | `calendar` | アイコンを accent-500 塗り + glow + `text-on-accent`、ラベル accent |
| 2 | 学期・科目 | `/semester` | `graduationcap` | 同上 |
| 3 | ルーム | `/rooms` | `person.2` | 同上 |
| 4 | 友達 | `/friends` | `person.crop.circle` | 同上 |
| 5 | 設定 | `/settings` | `gearshape` | 同上 |

- `MainTabView` = SwiftUI `TabView` 5 項目。各タブは独立 `NavigationStack`。
- Web のアクティブ表示 (アイコンを `h-10 w-10 rounded-xl bg-accent-500 shadow-glow` で包む) を忠実移植するため、**標準 `TabView` の tabItem では accent glow の丸角背景を再現しきれない**。よって `MainTabView` は**カスタムボトムバー**を採用: `ZStack(alignment: .bottom)` に選択中タブの `NavigationStack` + 自作 `BottomTabBar`。バーは `bg-bg-elevated/85` + `backdrop`(`.ultraThinMaterial`) + top border-subtle + safe-area-bottom、高さ 64。ラベル `text-[10px] font-bold`。キーボード表示中は非表示 (`@FocusState`/`keyboardWillShow` 監視で hide)。
  - **不採用**: 標準 `TabView` + `.tint` のみ (Web のアクティブ丸角 glow を再現できない → parity 崩れ)。
- 選択状態は `@Observable AppRouter.selectedTab: MainTab` で保持。`enum MainTab: Hashable { case home, semester, rooms, friends, settings }`。

### 1.2.2 push vs sheet 規約 (Bible §2.4)

- **push** (`NavigationStack.navigationDestination`): `RoomDetail`(`/rooms/$id`)、`SettingsCalendar`(`/settings/calendar`)、招待着地 (`JoinRoom`/`AddFriendByInviteCode`)。SettingsCalendar の「戻る」は Web では `/` へ戻るが、iOS では NavigationStack の自然な pop (設定タブへ戻る) を採用 (親タブ = 設定なので忠実)。
- **sheet** (`.sheet` + `presentationDetents`): ほぼ全 CRUD (Bible §4.2 の各 Sheet)。遷移ではない。
- **fullScreenCover**: `CourseDetailModal` (Web は FullScreenModal)。
- 各タブの `navigationDestination(for:)` は `enum` route 値で型付け。例: ルームタブは `enum RoomRoute: Hashable { case detail(id: String), join(code: String) }`。

### 1.2.3 RootView 分岐 (現行流用 + Setup 差し替え)

現行 `RootView` の `unknown / signedOut / signedIn` 分岐を流用。`signedIn` かつ `setupStatus.isComplete == false` の分岐先を、現行 `SetupRequiredView`(「Web でやれ」表示) から**アプリ内 Setup フロー** (`SetupFlowView`) に差し替える。

```
RootView:
  .unknown   → SplashView (ProgressView)
  .signedOut → AuthView (SignIn: Apple/Google + magic link)
  .signedIn:
     me.setupStatus.isComplete == false → SetupFlowView   ← Phase E で実装
     else                               → MainTabView
```

Phase A では `SetupFlowView` は**プレースホルダ** (「初期設定 (実装予定)」+ 再読み込みボタン、現行 SetupRequiredView 相当の暫定) を置く。shell の分岐点は本設計で確定し、中身の実装のみ Phase E。

### 1.2.4 TopBar

各画面上部に sticky TopBar (h48、`bg-bg-base/70` + `.ultraThinMaterial` backdrop、safe-area-top)。Web は `AppLayout` 共通だが iOS は各 `NavigationStack` の `.toolbar` / カスタムヘッダで実装。Phase A では枠のみ (タイトル表示)。

## 1.3 DTO / モデル層

`packages/shared/src/schemas/*.ts` を Swift Codable へ 1:1 で貼り直す。命名規約・Optional 性・Int/Double・enum は Part 2 §A-2 で確定形を明記 (gotcha `design-doc-must-specify-swift-type-signatures` 順守)。

### schema ファイル → Swift ファイル対応

| shared schema | Swift ファイル (`Core/Models/DTO/`) | 主要型 |
|---|---|---|
| `api.ts` | `CommonDTO.swift` | `ErrorResponse`, `UserDto` |
| `me.ts` | `MeDTO.swift` | `MeResponse`(user+setupStatus), `SetupStatus`, `MeUpdateInput` |
| `semester.ts` | `SemesterDTO.swift` | `SemesterDto`, `SemesterOverviewDto`, `AttendanceDaySummary`, `SemesterCreateInput`, `SemesterUpdateInput` |
| `stats.ts` | `StatsDTO.swift` | `CourseStatsDto`, `StatsResponse` |
| `attendance.ts` | `AttendanceDTO.swift` | `OccurrenceDto`, `TodayResponse`, `MarkAttendanceInput`, `MarkAllPresentInput/Response`, `BulkMark*`, `BulkClear*` |
| `course.ts` | `CourseDTO.swift` | `CourseCreateInput`, `CourseUpdateInput`, `CourseSuspensionDto`, `CourseSuspensionCreateInput` |
| `meeting.ts` | `MeetingDTO.swift` | `MeetingBulkCreateInput`, `MeetingUpdateInput` |
| `template.ts` | `TemplateDTO.swift` | `DaySlotDto`, `CourseDto`, `MeetingDto`, `TemplateDto`, `TemplateSearchQuery`, `TemplateCreateInput`, `TemplateCopyInput` |
| `userTimetable.ts` | `UserTimetableDTO.swift` | `UserTimetableDto`, `UserTimetableCreateInput`, `UserTimetablePatchInput` |
| `timetableSuspension.ts` | `TimetableSuspensionDTO.swift` | `TimetableSuspensionDto`, `*CreateInput`, `Bulk*` |
| `personalEvent.ts` | `PersonalEventDTO.swift` | `PersonalEventDto`, `*CreateInput`, `*UpdateInput` |
| `day.ts` | `DayDTO.swift` | `DayDetailDto` |
| `friendship.ts` | `FriendshipDTO.swift` | `FriendshipDto`, `FriendshipUserDto`, `CreateFriendshipInput`, `UserSearchDto` |
| `room.ts` | `RoomDTO.swift` | `RoomSummaryDto`, `RoomDto`, `RoomMemberDto`, `RoomEventDto`, `RoomWeekDto`, `Create/Update*Input` |
| `school.ts` | `SchoolDTO.swift` | `SchoolDto`, `DepartmentDto`, `SchoolSearchQuery`, `*CreateInput` |
| `rules.ts` | `RulesDTO.swift` | `AttendanceRuleDto`, `AttendanceRuleUpsertInput`, `EffectiveRuleResponse` |
| `google.ts` | `GoogleDTO.swift` | `GoogleCalendarConnectionDto`, `GoogleListedCalendarDto`, `GoogleCalendarSyncDto`, `Create/Update*Input` |
| `ics.ts` | `IcsDTO.swift` | `IcsImportDto`, `IcsImportPreview`, `IcsImportPreviewItem`, `IcsImportCommitResult`, `IcsTitleRuleDto` |
| `enums.ts` | `Enums.swift` (既存拡張) | `AttendanceStatus`, `AttendanceDayStatus`, `FriendshipStatus`, `RoomRole`, `RuleStrategy`, `SchoolKind`, `VisibilityMode`, `RoomEventSource`, `GoogleSyncStatus` 他 |

方針: **全 DTO を Phase A で貼り直す** (画面が無くても型は先に揃える)。デコード純粋ロジックを Reviewer がテストできる。

## 1.4 データ / キャッシュ層 (最重要の新規設計)

Web は TanStack Query の (a) クエリキャッシュ、(b) prefix invalidation マトリクス、(c) 楽観更新 + ロールバック を持つ。iOS に等価物が無い (現行は VM 手動 load のみ)。**SwiftUI + `@Observable` でこれを移植する**。

### 1.4.1 設計原則

- **純粋ロジックを View / 非同期から分離**して `@testable`。invalidation マトリクスと楽観更新変換は**副作用ゼロの純粋関数**にする (Reviewer が同期テスト可能)。
- キャッシュは TanStack と同じ **prefix (前方一致) invalidation** を採る。queryKey を配列 (`[String]`) でモデル化し、`invalidate(prefix:)` は前方一致した全エントリを stale 化。

### 1.4.2 構成要素 (Swift 型シグネチャは Part 2 §A-5 に確定形)

1. **`QueryKey`** — `struct QueryKey: Hashable { let parts: [String] }`。`QK.*` (Web queryKeys.ts) を factory static func で再現。`func hasPrefix(_ other: QueryKey) -> Bool`。
2. **`QueryClient`** (`@MainActor @Observable final class`) — 型消去キャッシュ `[QueryKey: CacheEntry]`。`data(for:as:)` / `setData(_:for:)` / `getEntries(matching prefix:)` / `invalidate(prefix:)` (matching エントリを `isStale=true`) / `removeAll()` (ログアウト時 `queryClient.clear()` 相当)。
3. **`InvalidationMatrix`** — 純粋関数 `func targets(for mutation: Mutation) -> [QueryKey]`。Web の各 mutation の `invalidateQueries` 呼び出し集合を写像 (§1.4.4)。
4. **楽観更新変換 (純粋関数)** — `AttendanceOptimistic` namespace。`applyMarkAll(_:status:) -> TodayResponse` (status==nil の occurrence のみ更新)、`applyPatch(_:occurrenceId:status:) -> TodayResponse` (該当 occurrence のみ更新)。ロールバックは変更前スナップショットを `QueryClient.snapshot(matching:)` で取得し onError で書き戻す。
5. **`Repository` プロトコル + `Query<Value>`** — 各画面 VM は Repository 経由でデータ取得。`Query<Value>` (`@Observable`) が `state: QueryState<Value>` を公開し View が観測。Phase A では `QueryClient` + 1 参照実装 (`MeRepository`) のみ。ドメイン別 Repository は各 Phase で追加。

```swift
enum QueryState<Value: Sendable>: Sendable {
    case idle
    case loading
    case success(Value)
    case failure(APIError)
}
```

### 1.4.3 楽観更新フロー (Web `useTodayOccurrences` 移植)

`patchAttendance` を例に (Web onMutate/onError/onSuccess):

1. **onMutate**: `let snapshot = queryClient.snapshot(matching: QueryKey(["today"]))` → 全 today エントリに `applyPatch` を適用して即時反映。
2. **API 実行**: `POST /api/attendance/{occurrenceId}`。
3. **onError**: `snapshot` を書き戻す + トースト「保存できませんでした、もう一度試してください」。
4. **onSuccess**: `queryClient.invalidate(prefix:)` を `InvalidationMatrix.targets(for: .patchAttendance)` の各 key に適用 (= stats/semesters/day)。today は楽観反映済みなので invalidate しない (Web と一致)。

`markAllPresent` も同型 (`applyMarkAll`)。`deleteAttendance` は楽観更新なし、onSuccess で today も invalidate (§1.4.4)。

### 1.4.4 invalidation マトリクス (Web `api/hooks/*` から写像、prefix 一致)

TanStack の prefix 一致 (例 `["today"]` は `["today","current"]` に一致) を `QueryKey.hasPrefix` で再現。

| Mutation (`enum Mutation`) | invalidate する prefix (楽観更新は別記) | 出典 hook |
|---|---|---|
| `.markAllPresent` | `stats`, `semesters`, `day` (today は楽観) | useTodayOccurrences |
| `.patchAttendance` | `stats`, `semesters`, `day` (today は楽観) | 〃 |
| `.deleteAttendance` | `today`, `stats`, `semesters`, `day` | 〃 |
| `.bulkAttendance` | `semesters`, `stats`, `day`, `today`, `timetable-suspensions` | useBulkAttendance |
| `.courseSuspension(courseId)` | `["courses",courseId,"suspensions"]`, `semesters`, `stats`, `day` | useCourseSuspensions |
| `.timetableSuspension(date?)` | `timetable-suspensions`, `day`, `semesters`, `stats`, `today`, (+`["day",date]`) | useTimetableSuspensions |
| `.personalEvent(date?)` | `personal-events`, `day`, (+`["day",date]`) | usePersonalEvents |
| `.userTimetableCreate` | `user-timetables`, `today`, `semesters` | useUserTimetable |
| `.userTimetableEdit` | `user-timetables`, `today`, `stats`, `semesters` (patch は +`rooms`) | 〃 |
| `.userTimetablePublish` | `user-timetables`, `me` | 〃 |
| `.userTimetableDelete` | `user-timetables`, `today`, `stats`, `semesters` | 〃 |
| `.meUpdate` | `["users","search"]`, `semesters`, `stats` | useMe |
| `.semesterCreate` / `.semesterUpdate` | `semesters` | useSemesters |
| `.semesterDelete` | `semesters`, `stats`, `day`, `today`, `user-timetables` | 〃 |
| `.roomCreate` | `rooms` | useRooms |
| `.roomUpdate(id)` | `rooms`, `["rooms",id]` | 〃 |
| `.roomJoin(id)` | `rooms`, `["rooms",id,"members"]`, `["rooms",id]` | 〃 |
| `.roomLeave(id)` / `.roomDelete(id)` | `rooms`, `["rooms",id]` | 〃 |
| `.roomEvent(id)` | `["rooms",id,"events"]`, `["rooms",id,"week"]` | useRoomEvents |
| `.icsImport(roomId)` | `["rooms",roomId,"week"]`, `["rooms",roomId,"ics-imports"]` | useIcsImports |
| `.friendshipAction` | `friendships`, `["users","search"]` | useFriendships |
| `.friendshipAdd` | `friendships` | 〃 |

**Developer は実装時に `apps/web/src/api/hooks/*` を再確認**し、上表と差異があれば Web を正とする。Phase A では `.markAllPresent`/`.patchAttendance`/`.deleteAttendance`/`.bulkAttendance`/`.timetableSuspension`/`.personalEvent`/`.meUpdate` の 7 種を実装 + テスト (残りは各 Phase で追加、`Mutation` enum は全 case 宣言しておく)。

### 1.4.5 ログアウト時

Web は `queryClient.clear()` → `/signin`。iOS は `AuthStore.signOut()` 内で `queryClient.removeAll()` を呼ぶ (`AppEnvironment` が両者を保持)。

## 1.5 共通コンポーネント基盤

Bible §4。Phase A では基盤 (下記 ★) を実装。重い部品 (EventTile/TimetableView/カレンダー各種/AttendanceCalendar/MainAttendanceCTA/Lyric/Hero/CourseListItem) は使う Phase で作るが、**基盤 modifier / primitive はここで揃える**。SwiftUI シグネチャ要点は Part 2 §A-6。

- ★ **BottomSheet** (`Core/DesignSystem/Components/BottomSheet.swift`): `.sheet` + `.presentationDetents`。3 経路 close (背景 dim tap / スワイプダウン / ×ボタン) を基底に内蔵 (`modal-sheet-base-component-3way-close` パターン)。ドラッグハンドル + タイトル + × + 任意 footer。`stackLevel` (ネスト時) を Web と揃える。個別 Sheet は close を実装しない。
- ★ **FullScreenModal** (`FullScreenModal.swift`): `.fullScreenCover` ラッパ。ヘッダ (戻る/タイトル/×)。CourseDetailModal (Phase C) が using。
- ★ **AtenderButton** (現行拡張): variant `primary/secondary/destructive/ghost/danger` × size `sm/md/lg`。`Capsule` clip + `font-bold`、primary = accent-500 塗り + glowSoft、active `scaleEffect(0.97)`。
- ★ **Panel** (`Panel.swift`): `rounded-3xl bg-bg-elevated p-5 shadow-card` 相当のコンテナ。
- ★ **EmptyState** (`EmptyState.swift`): Mascot 画像 + title + 説明 + action。`min-h-64 rounded-3xl bg-fg-primary/4`。Mascot 画像 (`mascot-hello-1024`) は Assets へ。
- ★ **Toast** (`Toast.swift` + `ToastCenter` `@Observable`): 下部トースト。表示時間 2600ms (Bible §3.1)。`ToastCenter.show(_ message:)`。
- ★ **Skeleton** (`Skeleton.swift`): shimmer placeholder。構造パリティ (`skeleton-structural-parity` パターン) — 実データと同形状。
- (基盤 modifier) **ConfirmDialog**: `.confirmationDialog` ラッパ or カスタム。破棄確認等。
- (Phase C+) EventTile (color-mix tint 15%/70%)、TimetableView (periodIndex グリッド)、CalendarMonth/Week/Day、AttendanceCalendar、MainAttendanceCTA、Hero、CourseListItem。

## 1.6 Phase 分割 (実装順)

| Phase | スコープ (1 段落) |
|---|---|
| **A 土台** (本書 Part 2) | DesignSystem 全トークン確定・全 DTO 貼り直し・全 API エンドポイント層・5 タブ nav shell (中身プレースホルダ) + RootView 分岐・データ/キャッシュ層骨格 (QueryClient/QueryKey/InvalidationMatrix/楽観更新変換)・共通コンポーネント基盤 (BottomSheet/FullScreenModal/Button/Panel/EmptyState/Toast/Skeleton)。**画面ロジックは持たない土台一式**。 |
| **B ホーム + 出欠ループ** | Home (ContextChips / HomeViewModeTabs / HomeBody 4 分岐 / HomeSemesterPicker)、SelfTimetableView + TimetableView 本体 + EventTile、SelfTodayCTA + MainAttendanceCTA (楽観更新の実接続)、PersonalCalendar (month/week/day + meetingExpansion)、MeetingEditModal / MeetingDetailSheet / TimetableSettingsSheet。出欠マーク → invalidation の実配線。 |
| **C 学期・科目** | SemesterOverview、AttendanceRateHero、AttendanceCalendar (複数選択)、CourseListItem、DayDetailSheet (休講/6 状態/一括/個人予定)、CourseDetailModal (FullScreenModal: 編集/CourseSuspensionSection/OccurrenceHistory/DangerZone)、BulkActionBar/BulkEditSheet、to-date 率 3 指標表示 (`attendance-to-date-rate` パターン)。 |
| **D ルーム / 友達 / テンプレ** | Rooms/RoomDetail (RoomCalendar/RoomTimetable/AvailabilityBar)、RoomEventCreateSheet/RoomSettingsSheet/JoinByCodeSheet、Friends (FriendCard/AddFriendSheet/friendshipAction)、Templates (フィルタ/copy/publish)、ICS 取込 Wizard、Universal Links 招待着地。 |
| **E 設定 / Setup / 認証補完** | Settings (Profile/School-Dept/RequiredRate/AttendanceRule/SemesterList/Theme/Logout)、SettingsCalendar + GoogleCalendarSection + TitleRuleEditor、Setup 3 ステップ (SetupFlowView 実装)、SignIn magic link 追加。 |

B〜E の詳細は後続の Phase 別設計 doc で確定する。

---

# Part 2: Phase A 詳細 (実装着手粒度)

Phase A のゴール: **土台一式をビルド・テスト可能な状態で置く**。5 タブが出て各タブ枠が描画され (中身はプレースホルダ)、全 DTO がデコードでき、キャッシュ/invalidation/楽観更新の純粋ロジックが動く。

## A-1 DesignSystem (Swift 確定値、Web 実値と 1:1)

### A-1-1 Color+Atender.swift (全トークン)

`dynamic(dark:light:)` は現行の実装を流用。rgba は下記ヘルパ:

```swift
private extension UIColor {
    convenience init(hex: Int) { /* 現行実装 */ }
    static func hex(_ v: Int, _ a: CGFloat) -> UIColor { UIColor(hex: v).withAlphaComponent(a) }
}
```

| Swift `static let` (Color) | dark | light |
|---|---|---|
| `bgBase` | `#0B0E14` | `#F9F9F9` |
| `bgMuted` | `#14181F` | `#F2F2F2` |
| `bgElevated` | `#1A1F2A` | `#FFFFFF` |
| `bgOverlay` | `black α0.72` | `#0F172A α0.40` |
| `textPrimary` | `#F5F6F8` | `#0F172A` |
| `textSecondary` | `#F5F6F8 α0.72` | `#0F172A α0.72` |
| `textTertiary` | `#F5F6F8 α0.52` | `#0F172A α0.58` |
| `textOnAccent` | `#FFFFFF` | `#FFFFFF` |
| `textOnDanger` | `#FFFFFF` | `#FFFFFF` |
| `borderSubtle` | `white α0.06` **(現行 0.10 を修正)** | `#0F172A α0.08` **(現行 0.10 を修正)** |
| `borderDefault` | `white α0.12` | `#0F172A α0.14` |
| `borderEmphasis` | `white α0.28` | `#0F172A α0.30` |
| `borderSettings` | = `borderDefault` | = `borderSubtle` |
| `accent50` | `#F97316 α0.12` | `#EA580C α0.10` |
| `accent100` | `#F97316 α0.20` | `#EA580C α0.18` |
| `accent500` (= `accent`) | `#F97316` | `#EA580C` |
| `accent600` | `#FB923C` | `#C2410C` |
| `accent700` | `#FDBA74` | `#9A3412` |
| `statusPresent` | `#34D399` | `#16A34A` |
| `statusAbsent` | `#FF5C7A` | `#DC2626` |
| `statusExcused` | `#5AA9FF` | `#2563EB` |
| `statusTardy` | `#FFC93C` | `#D97706` |
| `statusEarly` | `#C685FF` | `#9333EA` |
| `statusCancelled` | `white α0.30` | `#0F172A α0.40` |
| `statusSuspended` | `#94A3B8` | `#64748B` |
| `statusNone` | `white α0.18` | `#0F172A α0.18` |
| `friendshipPending` | `#FFC93C` | `#D97706` |
| `friendshipAccepted` | `#34D399` | `#16A34A` |
| `friendshipBlocked` | `#FF5C7A` | `#DC2626` |
| `roomEvent` | `#C685FF` | `#9333EA` |
| `roomAvailabilityEmpty` | `#F97316 α0.16` | `#EA580C α0.14` |
| `eventMixTarget` | `white` | `black` |

色解決関数:
```swift
static func forStatus(_ status: AttendanceStatus?) -> Color  // 現行を suspended 追加で拡張不要 (suspended は day 集計側)
static func forDayStatus(_ status: AttendanceDayStatus) -> Color
static func forFriendship(_ status: FriendshipStatus) -> Color  // pending/accepted/blocked/declined(=none)
```
`forDayStatus` の `.allSuspended` は `statusSuspended` に変更 (現行は statusCancelled)。※ Web `dayStatusColor` を確認して合わせる (Developer が `apps/web` の該当関数で最終照合)。

### A-1-2 Typography.swift

```swift
extension Font {
    static func atender(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom("Inter", size: size, relativeTo: .body).weight(weight)   // Inter バンドル後
    }
    static var atenderXs: Font   { atender(11) }   // 11
    static var atenderSm: Font   { atender(13) }   // 13
    static var atenderBase: Font { atender(14) }   // 14
    static var atenderLg: Font   { atender(17) }   // 17
    static var atenderXl: Font   { atender(20) }   // 20
    static var atender2xl: Font  { atender(24) }   // 24
    static var atender3xl: Font  { atender(30) }   // 30
    static var atender4xl: Font  { atender(36) }   // 36
    static var atender5xl: Font  { atender(44) }   // 44
}
enum Leading { static let tight=1.1, snug=1.2, normal=1.4, body=1.4, relaxed=1.5 }  // lineSpacing 換算は (leading-1)*fontSize
```
weight: regular=.regular, medium=.medium, semibold=.semibold, bold=.bold, black=.black。数値は `.monospacedDigit()`。

### A-1-3 Space.swift (追加分)

```swift
enum Space {
    static let s0_5:CGFloat=2; static let s1:CGFloat=4; static let s2:CGFloat=8
    static let s3:CGFloat=12; static let s4:CGFloat=16; static let s5:CGFloat=20
    static let s6:CGFloat=24; static let s8:CGFloat=32
    static let s10:CGFloat=40; static let s12:CGFloat=48; static let s14:CGFloat=56
    static let s16:CGFloat=64; static let s20:CGFloat=80
    // semantic
    static let pagePxMobile:CGFloat=12;  static let pagePxDesktop:CGFloat=24
    static let cardPadding:CGFloat=12;   static let cardPaddingLg:CGFloat=16
    static let sectionGapMobile:CGFloat=16; static let sectionGapDesktop:CGFloat=24
    static let buttonGap:CGFloat=8;      static let buttonGapDestructive:CGFloat=12
    static let tabBarHeight:CGFloat=64;  static let tabBarContent:CGFloat=48
    static let topbarHeightMobile:CGFloat=48; static let topbarHeightDesktop:CGFloat=56
    static let selfTtChrome:CGFloat=352; static let roomTtChromeTop:CGFloat=168; static let roomTtChromeBottom:CGFloat=64
}
```

### A-1-4 Radius.swift (追加)

```swift
enum Radius {
    static let sm:CGFloat=10; static let md:CGFloat=18; static let lg:CGFloat=24
    static let xl:CGFloat=28; static let timetableCell:CGFloat=8; static let full:CGFloat=9999
}
```

### A-1-5 Shadow.swift (新規)

```swift
struct ShadowSpec { let color: Color; let radius: CGFloat; let x: CGFloat; let y: CGFloat }

enum AtenderShadow {
    case card, sheet, glow, glowSoft, settingsPanel
    func specs(_ scheme: ColorScheme) -> [ShadowSpec] { /* Bible §1.2 の dark/light 値 */ }
}
extension View { func atenderShadow(_ s: AtenderShadow) -> some View { /* colorScheme 取得し specs を .shadow で重ねる */ } }
```
値 (dark): card=`[(black α.45, r24, y8),(black α.30, r6, y2)]`、sheet=`[(black α.65, r48, y-16),(black α.40, r8, y-2)]`、glow=`[(accent α.45, r24),(accent α.20, r48)]`、glowSoft=`[(accent α.28, r16)]`、settingsPanel=`[]`。light は Bible §1.2 の対応値。SwiftUI の `.shadow` は blur radius = CSS blur/2 目安で調整 (Developer が視覚一致で微調整可、値は上記を基準)。

### A-1-6 Theme.swift + AmbientBackground.swift

`ThemePreference` (§1.1.2)。`AmbientBackground`: dark 時のみ orange (`accent α`) + purple (`roomEvent α`) の `RadialGradient` 2 枚を画面上部/下部にブラー配置 (Bible §1.2 の radial-gradient 2 枚)。`RootView` の背景に敷く。

## A-2 DTO 層 (shared 全 schema の Swift 確定形)

規約: `struct ... : Codable, Equatable`。id 持ちは `Identifiable`。**Optional 性は Zod の `.nullable()`/`.optional()` を Swift `?` に畳む** (どちらも `?`)。デフォルト値 (`.default(x)`) を持つレスポンスフィールドは非 Optional (サーバが必ず返す)、入力型では Optional 可。`z.number().int()`→`Int`、`z.number()`→`Double`。enum 型名は §A-2-9。JSON キーは camelCase 一致 (`keyDecodingStrategy = .useDefaultKeys`)。

以下、**null/optional 一覧を明記** (gotcha 順守)。`?` = Optional。

### A-2-1 CommonDTO.swift / MeDTO.swift

```swift
struct ErrorResponse: Codable, Equatable { let error: Body
    struct Body: Codable, Equatable { let code: String; let message: String } }

struct UserDto: Codable, Equatable, Identifiable {
    let id: String; let email: String
    let name: String?; let image: String?; let handle: String?; let inviteCode: String?
    let defaultSemesterId: String?; let schoolId: String?; let departmentId: String?
    let requiredAttendanceRate: Int          // ★ 現行 MeResponse.User に欠落 → 追加
}
struct MeResponse: Codable, Equatable { let user: UserDto; let setupStatus: SetupStatus }
struct SetupStatus: Codable, Equatable {
    let hasSchool: Bool; let hasDepartment: Bool; let hasSemester: Bool
    let hasUserTimetable: Bool; let isComplete: Bool
}
struct MeUpdateInput: Codable, Equatable {   // 全 Optional (PATCH 部分更新)
    var schoolId: String?; var departmentId: String?; var defaultSemesterId: String?
    var name: String?; var handle: String?; var requiredAttendanceRate: Int?
}
```
> 現行 `DTOs.swift` の `MeResponse.User` は inline struct + `requiredAttendanceRate` 欠落。**`UserDto` に統一し `requiredAttendanceRate: Int` を追加**する (置換)。

### A-2-2 SemesterDTO.swift

```swift
struct SemesterDto: Codable, Equatable, Identifiable {
    let id: String; let name: String; let startDate: String; let endDate: String
}
struct AttendanceDaySummary: Codable, Equatable, Identifiable {
    var id: String { date }
    let date: String; let status: AttendanceDayStatus; let occurrenceCount: Int
}
struct SemesterOverviewDto: Codable, Equatable {
    let semesterId: String; let semesterName: String
    let startDate: String; let endDate: String
    let today: String                        // ★ 追加
    let requiredAttendanceRate: Int          // ★ 追加
    let overall: Overall
    let days: [AttendanceDaySummary]
    let courses: [CourseStatsDto]
    struct Overall: Codable, Equatable {
        let effectiveNumerator: Double; let effectiveDenominator: Double
        let attendanceRate: Double?
        let toDate: ToDate                   // ★ 追加
        let unrecordedCount: Int             // ★ 追加
        let remainingCount: Int              // ★ 追加
        let allowedAbsences: Int?            // ★ 追加 (nullable)
    }
    struct ToDate: Codable, Equatable {
        let effectiveNumerator: Double; let effectiveDenominator: Double; let attendanceRate: Double?
    }
}
struct SemesterCreateInput: Codable, Equatable { let name: String; let startDate: String; let endDate: String }
struct SemesterUpdateInput: Codable, Equatable { var name: String?; var startDate: String?; var endDate: String? }
```

### A-2-3 StatsDTO.swift (全面是正)

現行 `CourseStatsDto` は `totalSessions` (shared 削除済) を持ち toDate 系を欠く。**shared `stats.ts` に一致させる**:

```swift
struct CourseStatsDto: Codable, Equatable, Identifiable {
    var id: String { courseId }
    let courseId: String; let courseName: String; let teacher: String?
    let generatedOccurrences: Int            // ★ totalSessions は削除
    let counts: Counts
    let effectiveNumerator: Double; let effectiveDenominator: Double
    let attendanceRate: Double?
    let separateCounts: [String: Int]?       // record<AttendanceStatus,int> optional
    let toDate: ToDate                        // ★ 追加 (非 Optional)
    let remainingCount: Int                   // ★ 追加
    let allowedAbsences: Int?                 // ★ 追加 (nullable)
    let maxDayPeriods: Int                    // ★ 追加
    let allowedAbsenceDays: Int?              // ★ 追加 (nullable)
    struct Counts: Codable, Equatable {
        let present: Int; let absent: Int; let excused: Int; let tardy: Int
        let earlyLeave: Int; let cancelled: Int; let suspended: Int; let unrecorded: Int
    }
    struct ToDate: Codable, Equatable {
        let effectiveNumerator: Double; let effectiveDenominator: Double; let attendanceRate: Double?
    }
}
struct StatsResponse: Codable, Equatable {
    let semesterId: String; let requiredAttendanceRate: Int; let courses: [CourseStatsDto]
}
```
> `SemesterOverviewDto.ToDate` と `CourseStatsDto.ToDate` は同形だが**別 nested 型**として宣言 (名前空間分離、混同回避)。

### A-2-4 AttendanceDTO.swift

```swift
struct OccurrenceDto: Codable, Equatable, Identifiable {
    let id: String; let meetingId: String; let courseId: String; let courseName: String
    let teacher: String?; let room: String?; let color: String?
    let date: String; let periodIndex: Int; let periodOffset: Int
    let startMinute: Int; let endMinute: Int
    var status: AttendanceStatus?            // nullable。var (楽観更新で書換)
}
struct TodayResponse: Codable, Equatable { let date: String; var occurrences: [OccurrenceDto] }
struct MarkAttendanceInput: Codable, Equatable { let status: AttendanceStatus; var note: String? }
struct MarkAllPresentInput: Codable, Equatable { var date: String?; var status: AttendanceStatus? }  // ★ status 追加
struct MarkAllPresentResponse: Codable, Equatable { let date: String; let markedCount: Int; let skippedCount: Int }
struct BulkMarkAttendanceInput: Codable, Equatable {
    let dates: [String]; let status: AttendanceStatus; let mode: BulkMode   // enum FILL/OVERWRITE
}
struct BulkMarkAttendanceResponse: Codable, Equatable {
    let upsertedCount: Int; let skippedExistingCount: Int; let skippedSuspendedCount: Int; let noOccurrenceDates: [String]
}
struct BulkClearAttendanceInput: Codable, Equatable { let dates: [String] }
struct BulkClearAttendanceResponse: Codable, Equatable { let deletedCount: Int }
```
> `MarkAttendanceInput`/`MarkAllPresentInput` の `status` は `BulkMode`/`AttendanceStatus`。`BulkMarkAttendanceInput.status` は `PRESENT/ABSENT/EXCUSED/TARDY/EARLY_LEAVE` のみ (CANCELLED 不可) — Swift では `AttendanceStatus` を受け、送信側で CANCELLED を弾く。`AttendanceRecordResponse` (patch 応答) は Web の `./types.ts` にあり本体未読 — Developer が `apps/web/src/api/hooks/types.ts` を確認して型追加。

### A-2-5 CourseDTO / MeetingDTO / TemplateDTO / UserTimetableDTO

```swift
// template.ts
struct DaySlotDto: Codable, Equatable, Identifiable {
    var id: Int { periodIndex }
    let periodIndex: Int; let label: String; let startMinute: Int; let endMinute: Int; let isBreak: Bool
}
struct CourseDto: Codable, Equatable, Identifiable {
    let id: String; let name: String; let teacher: String?; let color: String?; let note: String?
    // ★ 現行にある totalSessions は shared に無い → 削除
}
struct MeetingDto: Codable, Equatable, Identifiable {
    let id: String; let courseId: String; let dayOfWeek: Int
    let startPeriodIndex: Int; let periodCount: Int; let room: String?
}
struct TemplateDto: Codable, Equatable, Identifiable {
    let id: String; let authorUserId: String; let schoolId: String; let departmentId: String
    let title: String; let description: String?; let year: Int?; let term: String?
    let isPublic: Bool; let copyCount: Int
    let daySlots: [DaySlotDto]; let courses: [CourseDto]; let meetings: [MeetingDto]
    let createdAt: String; let updatedAt: String
}
struct TemplateSearchQuery { var schoolId: String?; var departmentId: String?; var q: String?; var limit: Int = 20; var cursor: String? }  // query 用 (Codable 不要、[String:String] 生成)
struct TemplateCopyInput: Codable, Equatable { let semesterId: String; var title: String? }
// TemplateCreateInput は Phase D (テンプレ公開) で使用 — 型は貼るが Phase A 必須でない

// course.ts
struct CourseCreateInput: Codable, Equatable { let userTimetableId: String; let name: String; var teacher: String?; var color: String?; var note: String? }
struct CourseUpdateInput: Codable, Equatable { var name: String?; var teacher: String?; var color: String?; var note: String? }
struct CourseSuspensionDto: Codable, Equatable, Identifiable {
    let id: String; let courseId: String; let date: String; let reason: String?; let createdAt: String; let updatedAt: String
}
struct CourseSuspensionCreateInput: Codable, Equatable { let date: String; var reason: String? }

// meeting.ts
struct MeetingBulkCreateInput: Codable, Equatable {
    let userTimetableId: String; let courseId: String; let dayOfWeek: Int
    let startPeriodIndexes: [Int]; var room: String?
}
struct MeetingUpdateInput: Codable, Equatable { var dayOfWeek: Int?; var startPeriodIndex: Int?; var periodCount: Int?; var room: String? }

// userTimetable.ts
struct UserTimetableDto: Codable, Equatable, Identifiable {
    let id: String; let userId: String; let semesterId: String; let title: String
    let sourceTemplateId: String?; let daysOfWeek: [Int]
    let daySlots: [DaySlotDto]; let courses: [CourseDto]; let meetings: [MeetingDto]
    let createdAt: String; let updatedAt: String
}
struct UserTimetableCreateInput: Codable, Equatable { /* TemplateCreateInput から school/dept/isPublic を除き semesterId 追加。Phase B */ }
struct UserTimetablePatchInput: Codable, Equatable { /* title?/daysOfWeek?/daySlots?/courses?/meetings? 全 Optional。Phase B */ }
```
> `daysOfWeek` は `[Int]` (要素 1..7、月=1)。`MeetingDto.dayOfWeek` は 0..6。**曜日変換の混在に注意** (Bible §4.3 dayConvention) — Phase B で扱う。

### A-2-6 TimetableSuspension / PersonalEvent / Day

```swift
struct TimetableSuspensionDto: Codable, Equatable, Identifiable {
    let id: String; let userTimetableId: String; let date: String; let reason: String?; let createdAt: String; let updatedAt: String
}
struct TimetableSuspensionCreateInput: Codable, Equatable { let date: String; var reason: String? }
struct BulkTimetableSuspensionInput: Codable, Equatable { let dates: [String]; var reason: String? }
struct BulkTimetableSuspensionResponse: Codable, Equatable { let createdCount: Int; let skippedCount: Int }
struct BulkTimetableSuspensionRemoveInput: Codable, Equatable { let dates: [String] }
struct BulkTimetableSuspensionRemoveResponse: Codable, Equatable { let removedCount: Int }

struct PersonalEventDto: Codable, Equatable, Identifiable {
    let id: String; let semesterId: String?; let date: String; let title: String
    let isAllDay: Bool; let startMinute: Int?; let endMinute: Int?
    let color: String?; let note: String?; let createdAt: String; let updatedAt: String
}
struct PersonalEventCreateInput: Codable, Equatable {
    var semesterId: String?; let date: String; let title: String; var isAllDay: Bool = true
    var startMinute: Int?; var endMinute: Int?; var color: String?; var note: String?
}
struct PersonalEventUpdateInput: Codable, Equatable { /* 全 Optional */ }

struct DayDetailDto: Codable, Equatable {
    let date: String
    let occurrences: [OccurrenceDto]
    let courseSuspensions: [CourseSuspensionDto]
    let timetableSuspension: TimetableSuspensionDto?    // nullable
    let personalEvents: [PersonalEventDto]
}
```

### A-2-7 Friendship / Room / School / Rules

```swift
// friendship.ts
struct FriendshipUserDto: Codable, Equatable, Identifiable { let id: String; let name: String?; let handle: String?; let image: String? }
struct FriendshipDto: Codable, Equatable, Identifiable {
    let id: String; let sender: FriendshipUserDto; let receiver: FriendshipUserDto
    let status: FriendshipStatus; let createdAt: String; let acceptedAt: String?
}
struct CreateFriendshipInput: Codable, Equatable { var receiverHandle: String?; var receiverInviteCode: String?; var receiverId: String? }
struct UserSearchDto: Codable, Equatable, Identifiable {
    let id: String; let name: String?; let handle: String?; let image: String?
    let friendshipStatus: FriendshipStatus?
}

// room.ts
struct RoomSummaryDto: Codable, Equatable, Identifiable {
    let id: String; let name: String; let description: String?
    let showMemberTimetables: Bool; let memberCount: Int; let myRole: RoomRole
    let upcomingEvent: UpcomingEvent?; let createdAt: String
    struct UpcomingEvent: Codable, Equatable { let id: String; let title: String; let start: String }
}
struct RoomDto: Codable, Equatable, Identifiable {
    let id: String; let name: String; let description: String?
    let showMemberTimetables: Bool; let memberCount: Int; let myRole: RoomRole
    let upcomingEvent: RoomSummaryDto.UpcomingEvent?; let createdAt: String
    let inviteCode: String; let inviteExpiresAt: String?         // RoomSummary + 2
}
struct RoomMemberDto: Codable, Equatable, Identifiable {
    var id: String { userId }
    let userId: String; let name: String?; let handle: String?; let image: String?
    let role: RoomRole; let joinedAt: String
}
struct RoomEventDto: Codable, Equatable, Identifiable {
    let id: String; let seriesId: String; let roomId: String; let authorId: String
    let title: String; let rawTitle: String?; let description: String?
    let start: String; let end: String; let isAllDay: Bool; let color: String?
    let source: RoomEventSource; let visibilityMode: VisibilityMode
    let isRecurringOccurrence: Bool; let recurrenceRule: String?
    let occurrenceDate: String; let overrideId: String?
    let googleSyncId: String?; let googleEventId: String?; let googleRecurringEventId: String?   // optional (省略可)
    let createdAt: String
}
struct RoomWeekDto: Codable, Equatable {
    let weekStart: String; let weekEnd: String
    let members: [Member]; let meetings: [Meeting]; let roomEvents: [RoomEventDto]
    struct Member: Codable, Equatable, Identifiable { var id: String { userId }
        let userId: String; let name: String?; let handle: String?; let image: String?; let color: String }
    struct Meeting: Codable, Equatable {
        let userId: String; let occurrenceId: String; let courseId: String; let courseName: String
        let courseColor: String?; let date: String; let startMinute: Double; let endMinute: Double  // z.number() → Double
    }
}
struct CreateRoomInput: Codable, Equatable { let name: String; var description: String?; var showMemberTimetables: Bool? }
struct UpdateRoomInput: Codable, Equatable { var name: String?; var description: String?; var showMemberTimetables: Bool? }
// CreateRoomEventInput / UpdateRoomEventInput は Phase D

// school.ts
struct SchoolDto: Codable, Equatable, Identifiable {
    let id: String; let mextCode: String?; let kind: SchoolKind; let name: String; let nameKana: String?; let prefecture: String?
}
struct DepartmentDto: Codable, Equatable, Identifiable { let id: String; let schoolId: String; let name: String; let nameKana: String? }
struct SchoolCreateInput: Codable, Equatable { let name: String; var nameKana: String?; let kind: SchoolKind; var prefecture: String? }
struct DepartmentCreateInput: Codable, Equatable { let name: String; var nameKana: String? }
struct SchoolSearchQuery { var q: String?; var prefecture: String?; var kind: SchoolKind?; var limit: Int = 20 }  // query 生成用

// rules.ts
struct AttendanceRuleDto: Codable, Equatable, Identifiable {
    let id: String; let schoolId: String; let departmentId: String; let userId: String?
    let excusedStrategy: RuleStrategy; let tardyStrategy: RuleStrategy; let earlyLeaveStrategy: RuleStrategy
}
struct AttendanceRuleUpsertInput: Codable, Equatable { let excusedStrategy: RuleStrategy; let tardyStrategy: RuleStrategy; let earlyLeaveStrategy: RuleStrategy }
struct EffectiveRuleResponse: Codable, Equatable {
    let `default`: AttendanceRuleDto?; let userOverride: AttendanceRuleDto?; let effective: Effective
    struct Effective: Codable, Equatable { let excusedStrategy: RuleStrategy; let tardyStrategy: RuleStrategy; let earlyLeaveStrategy: RuleStrategy }
}
```

### A-2-8 Google / Ics (Phase E/D 用、型は Phase A で貼る)

```swift
struct GoogleCalendarConnectionDto: Codable, Equatable, Identifiable {
    let id: String; let googleEmail: String; let scope: String
    let status: GoogleConnectionStatus; let lastError: String?; let lastSyncedAt: String?; let createdAt: String
}
struct GoogleListedCalendarDto: Codable, Equatable, Identifiable {
    let id: String; let summary: String; let timeZone: String
    let accessRole: GoogleAccessRole; let primary: Bool; let backgroundColor: String?
}
struct GoogleCalendarSyncDto: Codable, Equatable, Identifiable {
    let id: String; let googleCalendarId: String; let calendarSummary: String; let calendarTimeZone: String
    let visibilityMode: VisibilityMode; let status: GoogleSyncStatus
    let lastError: String?; let lastSyncedAt: String?; let enabled: Bool; let createdAt: String; let hasSyncToken: Bool
}
struct CreateGoogleSyncInput: Codable, Equatable { let googleCalendarId: String; var visibilityMode: VisibilityMode? }
struct UpdateGoogleSyncInput: Codable, Equatable { var visibilityMode: VisibilityMode?; var enabled: Bool? }

struct IcsImportDto: Codable, Equatable, Identifiable {
    let id: String; let filename: String?; let source: IcsSource; let status: IcsImportStatus
    let parsedEventCount: Int; let committedEventCount: Int; let skippedEventCount: Int
    let errorMessage: String?; let committedAt: String?; let createdAt: String
}
struct IcsImportPreviewItem: Codable, Equatable, Identifiable {
    var id: String { uid }
    let uid: String; let rawTitle: String; let mappedTitle: String; let visibilityMode: VisibilityMode
    let ruleId: String?; let start: String; let end: String; let isRecurring: Bool; let rrule: String?
}
struct IcsImportPreview: Codable, Equatable { let importId: String; let events: [IcsImportPreviewItem] }
struct IcsImportCommitResult: Codable, Equatable { let committed: Int; let skipped: Int; let errors: [String] }
struct IcsTitleRuleDto: Codable, Equatable, Identifiable {
    let id: String; let matchType: IcsMatchType; let pattern: String; let replaceWith: String?
    let visibilityMode: VisibilityMode; let priority: Int; let isDefault: Bool; let createdAt: String; let updatedAt: String
}
```

### A-2-9 Enums.swift (追加分。全て unknown フォールバック付き string enum)

現行 `AttendanceStatus`/`AttendanceDayStatus` の decode パターン (`init(from:)` で unknown フォールバック) を踏襲。

```swift
enum BulkMode: String, Codable { case fill="FILL", overwrite="OVERWRITE" }
enum FriendshipStatus: String, Codable { case pending="PENDING", accepted="ACCEPTED", declined="DECLINED", blocked="BLOCKED", unknown }
enum RoomRole: String, Codable { case owner="OWNER", member="MEMBER", unknown }
enum RuleStrategy: String, Codable { case countAsPresent="COUNT_AS_PRESENT", countAsAbsent="COUNT_AS_ABSENT", halfPresent="HALF_PRESENT", reduceDenominator="REDUCE_DENOMINATOR", separateCount="SEPARATE_COUNT", unknown }
enum SchoolKind: String, Codable { case university="UNIVERSITY", juniorCollege="JUNIOR_COLLEGE", technicalCollege="TECHNICAL_COLLEGE", vocationalSchool="VOCATIONAL_SCHOOL", highSchool="HIGH_SCHOOL", other="OTHER", unknown }
enum VisibilityMode: String, Codable { case normal="NORMAL", titleMapped="TITLE_MAPPED", busyOnly="BUSY_ONLY", unknown }
enum RoomEventSource: String, Codable { case manual="MANUAL", icsFile="ICS_FILE", icsUrl="ICS_URL", googleOauth="GOOGLE_OAUTH", unknown }
enum IcsSource: String, Codable { case icsFile="ICS_FILE", icsUrl="ICS_URL", googleOauth="GOOGLE_OAUTH", unknown }
enum IcsImportStatus: String, Codable { case pending="PENDING", parsed="PARSED", success="SUCCESS", partialError="PARTIAL_ERROR", failed="FAILED", unknown }
enum IcsMatchType: String, Codable { case equals="EQUALS", contains="CONTAINS", regex="REGEX", unknown }
enum GoogleConnectionStatus: String, Codable { case active="ACTIVE", revoked="REVOKED", error="ERROR", unknown }
enum GoogleAccessRole: String, Codable { case owner, writer, reader, freeBusyReader, unknown }
enum GoogleSyncStatus: String, Codable { case idle="IDLE", syncing="SYNCING", ok="OK", failed="FAILED", revoked="REVOKED", unknown }
```
各 enum は現行 `AttendanceStatus` と同じ custom `init(from:)`/`encode(to:)` で unknown フォールバック (未知値でデコード破綻させない)。`AttendanceStatus`/`AttendanceDayStatus` は現行踏襲 (変更なし)。

## A-3 API エンドポイント層

現行 `APIEndpoint` (path/method/query/body/requiresAuth) + `APIClient.send` を流用。Bible §3.11 の全エンドポイントを `APIEndpoint` の static factory (namespace `Endpoints`) で網羅する。

```swift
enum Endpoints {
    // me
    static func me() -> APIEndpoint { .init(path: "/api/me", method: .get) }
    static func updateMe(_ b: MeUpdateInput) -> APIEndpoint { .init(path: "/api/me", method: .patch, body: b) }
    // schools / departments
    static func schools(_ q: SchoolSearchQuery) -> APIEndpoint { .init(path:"/api/schools", method:.get, query: q.asQuery) }
    static func createSchool(_ b: SchoolCreateInput) -> APIEndpoint { .init(path:"/api/schools", method:.post, body:b) }
    static func departments(schoolId: String, q: String?) -> APIEndpoint
    static func createDepartment(schoolId: String, _ b: DepartmentCreateInput) -> APIEndpoint
    // semesters
    static func semesters() -> APIEndpoint
    static func createSemester(_ b: SemesterCreateInput) -> APIEndpoint
    static func updateSemester(id: String, _ b: SemesterUpdateInput) -> APIEndpoint
    static func deleteSemester(id: String) -> APIEndpoint
    static func semesterOverview(id: String) -> APIEndpoint      // /api/semesters/{id}/overview
    // user-timetables
    static func userTimetables() -> APIEndpoint                  // GET (list)
    static func createUserTimetable(_ b: UserTimetableCreateInput) -> APIEndpoint
    static func patchUserTimetable(id: String, _ b: UserTimetablePatchInput) -> APIEndpoint
    static func publishAsTemplate(id: String, _ b: TemplateCreateInput) -> APIEndpoint  // /publish-as-template
    // courses
    static func createCourse(_ b: CourseCreateInput) -> APIEndpoint
    static func updateCourse(id: String, _ b: CourseUpdateInput) -> APIEndpoint
    static func deleteCourse(id: String) -> APIEndpoint
    static func courseSuspensions(courseId: String) -> APIEndpoint      // GET
    static func createCourseSuspension(courseId: String, _ b: CourseSuspensionCreateInput) -> APIEndpoint
    static func deleteCourseSuspension(courseId: String, date: String) -> APIEndpoint  // DELETE ?date=
    // meetings
    static func createMeetingsBulk(_ b: MeetingBulkCreateInput) -> APIEndpoint          // /api/meetings/bulk
    static func updateMeeting(id: String, _ b: MeetingUpdateInput) -> APIEndpoint
    static func deleteMeeting(id: String) -> APIEndpoint
    // today / attendance
    static func today(date: String?) -> APIEndpoint
    static func markAttendance(occurrenceId: String, _ b: MarkAttendanceInput) -> APIEndpoint  // POST
    static func deleteAttendance(occurrenceId: String) -> APIEndpoint                           // DELETE
    static func markAllPresent(_ b: MarkAllPresentInput) -> APIEndpoint
    static func bulkAttendance(_ b: BulkMarkAttendanceInput) -> APIEndpoint                      // /attendance/bulk
    static func bulkClearAttendance(_ b: BulkClearAttendanceInput) -> APIEndpoint                // /attendance/bulk-clear
    // day / stats
    static func dayDetail(date: String) -> APIEndpoint                                          // /api/day/{date}
    static func stats(semesterId: String?) -> APIEndpoint
    // timetable-suspensions
    static func timetableSuspensions(from: String?, to: String?) -> APIEndpoint                 // GET
    static func createTimetableSuspension(_ b: TimetableSuspensionCreateInput) -> APIEndpoint
    static func deleteTimetableSuspension(date: String) -> APIEndpoint
    static func bulkTimetableSuspension(_ b: BulkTimetableSuspensionInput) -> APIEndpoint         // /bulk
    static func bulkRemoveTimetableSuspension(_ b: BulkTimetableSuspensionRemoveInput) -> APIEndpoint  // /bulk-remove
    // personal-events
    static func personalEvents(from: String?, to: String?, semesterId: String?) -> APIEndpoint
    static func createPersonalEvent(_ b: PersonalEventCreateInput) -> APIEndpoint
    static func updatePersonalEvent(id: String, _ b: PersonalEventUpdateInput) -> APIEndpoint
    static func deletePersonalEvent(id: String) -> APIEndpoint
    // friendships / users
    static func friendships(status: String?, direction: String?) -> APIEndpoint
    static func createFriendship(_ b: CreateFriendshipInput) -> APIEndpoint
    static func friendshipAction(id: String, action: String) -> APIEndpoint     // POST /friendships/{id}/{action}
    static func deleteFriendship(id: String) -> APIEndpoint
    static func searchUsers(handle: String) -> APIEndpoint                       // /api/users/search?handle=
    // rooms
    static func rooms() -> APIEndpoint
    static func createRoom(_ b: CreateRoomInput) -> APIEndpoint
    static func room(id: String) -> APIEndpoint
    static func updateRoom(id: String, _ b: UpdateRoomInput) -> APIEndpoint
    static func deleteRoom(id: String) -> APIEndpoint
    static func joinRoom(inviteCode: String) -> APIEndpoint                      // POST /rooms/join/{code}
    static func leaveRoom(id: String) -> APIEndpoint                             // POST /rooms/{id}/leave
    static func roomMembers(id: String) -> APIEndpoint
    static func roomWeek(id: String, weekStart: String) -> APIEndpoint           // GET /rooms/{id}/week?weekStart=
    static func roomEvents(id: String, from: String?, to: String?) -> APIEndpoint
    static func createRoomEvent(id: String, _ b: CreateRoomEventInput) -> APIEndpoint
    static func updateRoomEvent(id: String, eventId: String, _ b: UpdateRoomEventInput) -> APIEndpoint
    static func icsImports(roomId: String) -> APIEndpoint
    static func icsImportPreview(roomId: String, importId: String) -> APIEndpoint
    static func commitIcsImport(roomId: String, importId: String) -> APIEndpoint
    static func googleSyncs(roomId: String) -> APIEndpoint
    static func runGoogleSync(roomId: String, syncId: String) -> APIEndpoint
    // me google-calendar / ics-title-rules
    static func googleConnection() -> APIEndpoint            // /api/me/google-calendar/connection
    static func googleCalendars() -> APIEndpoint
    static func completeGoogleLink(...) -> APIEndpoint       // /link/complete
    static func googleSyncAll() -> APIEndpoint               // /sync-all
    static func icsTitleRules() -> APIEndpoint               // /api/me/ics-title-rules
    // templates
    static func templates(_ q: TemplateSearchQuery) -> APIEndpoint
    static func copyTemplate(id: String, _ b: TemplateCopyInput) -> APIEndpoint  // /timetable-templates/{id}/copy
}
```

- `attendance/mark-all-present`/`patch`/`delete` の正確なパス・メソッドは上記。**Developer は `apps/api/src/routes/*` で最終照合** (パス/クエリ名の齟齬防止)。特に `deleteCourseSuspension`/`deleteTimetableSuspension` が `?date=` クエリか path かは API ルートで確認。
- クエリ生成: 各 SearchQuery/optional は `[String:String]` へ (nil は除外)。`SchoolSearchQuery.asQuery` 等の computed を用意。
- 認証: 現行どおり全て Bearer (`requiresAuth: true`)。auth 系 (magic link/social) は `AuthStore` 側 (現行) で `requiresAuth:false`。
- **Phase A 実装範囲**: `Endpoints` 全 factory を宣言 (コンパイル可能に)。`APIClient.send(_:as:)` は現行流用。実際の呼び出し配線は各 Phase の Repository/VM で。

## A-4 ナビ shell

### ファイル

- `App/MainTabView.swift` (全面書換): カスタムボトムバー 5 タブ。
- `App/BottomTabBar.swift` (新規): タブバー View。
- `App/AppRouter.swift` (新規): `@Observable final class AppRouter { var selectedTab: MainTab = .home; var homePath = NavigationPath(); ... 各タブ path }`。
- `App/RootView.swift` (改修): `SetupRequiredView` → `SetupFlowView` プレースホルダ差し替え。
- 各タブ画面プレースホルダ: `HomePlaceholderView` / `SemesterPlaceholderView` / `RoomsPlaceholderView` / `FriendsPlaceholderView` / `SettingsPlaceholderView` (各「(画面名) 準備中」+ タブ枠が描画されることの確認用。Phase B 以降で実装置換)。

```swift
enum MainTab: Int, Hashable, CaseIterable { case home, semester, rooms, friends, settings
    var label: String { ["ホーム","学期・科目","ルーム","友達","設定"][rawValue] }
    var symbol: String { ["calendar","graduationcap","person.2","person.crop.circle","gearshape"][rawValue] }
}
struct MainTabView: View {
    @Environment(AppRouter.self) private var router
    var body: some View {
        ZStack(alignment: .bottom) {
            // selectedTab に応じた NavigationStack(path: ...) を表示
            BottomTabBar(selected: router.selectedTab) { router.selectedTab = $0 }
        }
    }
}
```

- BottomTabBar: 選択タブは `h40 w40` 丸角 (`Radius.md`) の accent-500 塗り + `atenderShadow(.glow)` にアイコンを包み、`text-on-accent`。非選択は `text-tertiary`。ラベル `atenderXs.weight(.bold)`。バー背景 `bgElevated.opacity(0.85)` + `.background(.ultraThinMaterial)` + top `borderSubtle` 1px + `.padding(.bottom, safeAreaBottom)`、高さ 64。
- キーボード表示中はバー非表示 (`@State keyboardVisible` を NotificationCenter で監視)。

### RootView (改修点のみ)

```swift
case .signedIn:
    if environment.authStore.me?.setupStatus.isComplete == false {
        SetupFlowView()          // ← 差し替え。Phase A はプレースホルダ
    } else {
        MainTabView().environment(appRouter)
    }
```
`AmbientBackground()` を `RootView` 背景に追加。`.preferredColorScheme(themePref.colorScheme)` を適用。

## A-5 データ / キャッシュ層 (骨格実装)

ファイル: `Core/Data/QueryKey.swift` / `QueryClient.swift` / `InvalidationMatrix.swift` / `AttendanceOptimistic.swift` / `Query.swift` / `MeRepository.swift`。

```swift
// QueryKey.swift
struct QueryKey: Hashable {
    let parts: [String]
    init(_ parts: [String]) { self.parts = parts }
    func hasPrefix(_ other: QueryKey) -> Bool {
        guard other.parts.count <= parts.count else { return false }
        return Array(parts.prefix(other.parts.count)) == other.parts
    }
    // QK 写像 (queryKeys.ts)
    static func me() -> QueryKey { .init(["me"]) }
    static func semesters() -> QueryKey { .init(["semesters"]) }
    static func today(_ date: String?) -> QueryKey { .init(["today", date ?? "current"]) }
    static func dayDetail(_ date: String?) -> QueryKey { .init(["day", date ?? "none"]) }
    static func stats(_ semesterId: String?) -> QueryKey { .init(["stats", semesterId ?? "current"]) }
    static func semesterOverview(_ id: String?) -> QueryKey { .init(["semesters", id ?? "any", "overview"]) }
    static func userTimetables() -> QueryKey { .init(["user-timetables"]) }
    static func courseSuspensions(_ courseId: String) -> QueryKey { .init(["courses", courseId, "suspensions"]) }
    static func timetableSuspensions() -> QueryKey { .init(["timetable-suspensions"]) }
    static func personalEvents() -> QueryKey { .init(["personal-events"]) }
    static func friendships() -> QueryKey { .init(["friendships"]) }
    static func rooms() -> QueryKey { .init(["rooms"]) }
    static func room(_ id: String) -> QueryKey { .init(["rooms", id]) }
    static func roomMembers(_ id: String) -> QueryKey { .init(["rooms", id, "members"]) }
    static func roomWeek(_ id: String) -> QueryKey { .init(["rooms", id, "week"]) }   // prefix
    static func roomEvents(_ id: String) -> QueryKey { .init(["rooms", id, "events"]) } // prefix
    static func usersSearch() -> QueryKey { .init(["users", "search"]) }
    // ... 残り QK も写像
}

// QueryClient.swift
@MainActor @Observable final class QueryClient {
    struct CacheEntry { var value: Any; var isStale: Bool; var updatedAt: Date }
    private var entries: [QueryKey: CacheEntry] = [:]

    func data<T>(for key: QueryKey, as type: T.Type) -> T? { entries[key]?.value as? T }
    func setData<T>(_ value: T, for key: QueryKey) { entries[key] = .init(value: value, isStale: false, updatedAt: .now) }
    func keys(matching prefix: QueryKey) -> [QueryKey] { entries.keys.filter { $0.hasPrefix(prefix) } }
    func invalidate(prefix: QueryKey) { for k in keys(matching: prefix) { entries[k]?.isStale = true } }
    func invalidate(prefixes: [QueryKey]) { prefixes.forEach { invalidate(prefix: $0) } }
    func isStale(_ key: QueryKey) -> Bool { entries[key]?.isStale ?? true }
    /// 楽観更新用: prefix 一致エントリを (key, value) で退避
    func snapshot<T>(matching prefix: QueryKey, as type: T.Type) -> [(QueryKey, T)] {
        keys(matching: prefix).compactMap { k in (entries[k]?.value as? T).map { (k, $0) } }
    }
    func restore<T>(_ snapshot: [(QueryKey, T)]) { for (k, v) in snapshot { setData(v, for: k) } }
    func removeAll() { entries.removeAll() }
}

// InvalidationMatrix.swift  (§1.4.4 の写像。純粋関数)
enum Mutation: Equatable {
    case markAllPresent, patchAttendance, deleteAttendance, bulkAttendance
    case courseSuspension(courseId: String)
    case timetableSuspension(date: String?)
    case personalEvent(date: String?)
    case userTimetableCreate, userTimetableEdit, userTimetablePublish, userTimetableDelete
    case meUpdate, semesterCreate, semesterUpdate, semesterDelete
    case roomCreate, roomUpdate(id: String), roomJoin(id: String), roomLeave(id: String), roomDelete(id: String)
    case roomEvent(id: String), icsImport(roomId: String), friendshipAction, friendshipAdd
}
func invalidationTargets(for m: Mutation) -> [QueryKey] { /* §1.4.4 表どおり */ }

// AttendanceOptimistic.swift  (純粋関数)
enum AttendanceOptimistic {
    /// status==nil の occurrence のみ status を埋める (Web mark-all-present)
    static func applyMarkAll(_ today: TodayResponse, status: AttendanceStatus) -> TodayResponse {
        var t = today
        t.occurrences = t.occurrences.map { $0.status == nil ? { var o=$0; o.status=status; return o }() : $0 }
        return t
    }
    /// 特定 occurrence の status を置換 (Web patch)
    static func applyPatch(_ today: TodayResponse, occurrenceId: String, status: AttendanceStatus) -> TodayResponse {
        var t = today
        t.occurrences = t.occurrences.map { $0.id == occurrenceId ? { var o=$0; o.status=status; return o }() : $0 }
        return t
    }
}

// Query.swift  (View 観測用の汎用ボックス。骨格)
@MainActor @Observable final class Query<Value: Sendable> {
    private(set) var state: QueryState<Value> = .idle
    private let fetch: @Sendable () async throws -> Value
    init(fetch: @escaping @Sendable () async throws -> Value) { self.fetch = fetch }
    func load() async {
        state = .loading
        do { state = .success(try await fetch()) }
        catch let e as APIError { state = .failure(e) }
        catch { state = .failure(.transport(error.localizedDescription)) }
    }
    var value: Value? { if case .success(let v) = state { return v } else { return nil } }
}

// MeRepository.swift (参照実装 1 本)
@MainActor @Observable final class MeRepository {
    private let client: APIClient; private let cache: QueryClient
    init(client: APIClient, cache: QueryClient) { self.client = client; self.cache = cache }
    func me() async throws -> MeResponse {
        let r = try await client.send(Endpoints.me(), as: MeResponse.self)
        cache.setData(r, for: .me()); return r
    }
}
```

- `AppEnvironment` に `let queryClient = QueryClient()` を追加し `AuthStore.signOut()` で `queryClient.removeAll()`。DI は init 注入 (`@MainActor` gotcha 順守、`final class` の依存は init で注入)。
- **Phase A のテスト対象**: `QueryKey.hasPrefix`、`QueryClient` の setData/invalidate/snapshot/restore、`invalidationTargets(for:)` (§1.4.4 全 case)、`AttendanceOptimistic.applyMarkAll/applyPatch`。全て同期純粋 or `@MainActor` 同期で XCTest 可能。

## A-6 共通コンポーネント基盤 (SwiftUI シグネチャ)

ファイル: `Core/DesignSystem/Components/`。

```swift
// BottomSheet.swift — 3 経路 close 内蔵基底 (modal-sheet-base-component-3way-close)
struct BottomSheet<Content: View, Footer: View>: View {
    let title: String?
    @Binding var isPresented: Bool
    var detents: Set<PresentationDetent> = [.medium, .large]
    var stackLevel: Int = 1
    var onDismiss: (() -> Void)? = nil
    @ViewBuilder var content: () -> Content
    @ViewBuilder var footer: () -> Footer
    // 実装: .sheet(isPresented:) 内で drag handle + title + ×(dismiss) + content + footer。
    //   3 経路: 背景 tap(=detent 外)/swipe-down(標準)/×ボタン → すべて isPresented=false + onDismiss。
    //   .presentationDetents(detents) / .presentationDragIndicator(.visible) / .presentationBackground(Color.bgElevated)
}
// 呼び出し側は close を実装しない。× は data-testid 相当の accessibilityIdentifier "sheet-close"。

// FullScreenModal.swift
struct FullScreenModal<Content: View>: View {
    let title: String; @Binding var isPresented: Bool; var onDismiss: (()->Void)? = nil
    @ViewBuilder var content: () -> Content
    // .fullScreenCover: ヘッダ(戻る "chevron.left" / title / × ) + content。背景 bgBase。
}

// AtenderButton.swift (現行拡張)
enum ButtonVariant { case primary, secondary, destructive, ghost, danger }
enum ButtonSize { case sm, md, lg }
struct AtenderButton: View {
    let title: String; var systemImage: String? = nil
    var variant: ButtonVariant = .primary; var size: ButtonSize = .md
    var isLoading: Bool = false; var isEnabled: Bool = true; let action: () -> Void
    // Capsule clip、font-bold、primary=accent500 塗り + atenderShadow(.glowSoft)、押下 scaleEffect(0.97)
}

// Panel.swift
struct Panel<Content: View>: View {  // rounded(Radius.lg) bgElevated padding(20) atenderShadow(.card)
    var padding: CGFloat = 20; @ViewBuilder var content: () -> Content
}

// EmptyState.swift
struct EmptyState: View {
    let title: String; var message: String? = nil
    var actionTitle: String? = nil; var action: (() -> Void)? = nil
    // Mascot(Image("mascot-hello")) + title(atenderLg.bold) + message(atenderSm.secondary) + optional AtenderButton
    // min-h 256、rounded(Radius.lg)、bg textPrimary.opacity(0.04)
}

// Toast.swift
@MainActor @Observable final class ToastCenter {
    private(set) var message: String?
    func show(_ message: String, duration: TimeInterval = 2.6)   // 2600ms
}
struct ToastOverlay: View { @Environment(ToastCenter.self) var center /* 下部に表示 */ }

// Skeleton.swift
struct Skeleton: View { var width: CGFloat? = nil; var height: CGFloat = 16; var radius: CGFloat = Radius.sm
    // shimmer (linear gradient アニメ) placeholder }
```

- `ToastCenter` は `AppEnvironment` に持たせ `RootView` に `ToastOverlay` を重ねる。楽観更新失敗時 (§1.4.3) に `ToastCenter.show("保存できませんでした、もう一度試してください")`。
- `ConfirmDialog`: Phase A は SwiftUI 標準 `.confirmationDialog` を薄くラップした `confirmDestructive(...)` modifier のみ用意 (破棄確認は Phase B+ で BottomSheet の dismissConfirm と統合)。

---

## 挙動仕様 (Reviewer がテスト生成)

純粋ロジックは View から分離済み。全て `@testable import Atender` + XCTest。`@MainActor` 型のテストクラス/メソッドは `@MainActor` を付す (gotcha 順守)。

### S-1 DTO デコード (全 schema、null 境界)

- **正常系**: 各 DTO を実 API 形状の JSON fixture からデコードでき、全フィールドが一致する。fixture は実 API レスポンス (§テスト基盤)。
  - `CourseStatsDto`: `toDate`/`remainingCount`/`allowedAbsences`/`maxDayPeriods`/`allowedAbsenceDays` を含む JSON をデコードでき、`allowedAbsences=null`/`allowedAbsenceDays=null` が `nil` になる。`totalSessions` キーが JSON に有っても無視されデコード成功する。
  - `SemesterOverviewDto`: `today`/`requiredAttendanceRate`/`overall.toDate`/`overall.unrecordedCount`/`overall.remainingCount`/`overall.allowedAbsences(null可)` を持つ JSON をデコードできる。
  - `OccurrenceDto`: `status=null` → `nil`、`teacher/room/color=null` → `nil`。`status="PRESENT"` → `.present`。未知 `status="FOO"` → `.unknown` (デコード破綻しない)。
  - `DayDetailDto`: `timetableSuspension=null` → `nil`、各配列 `[]` で空。
  - `PersonalEventDto`: `isAllDay=true` かつ `startMinute=null`/`endMinute=null` → `nil`。`semesterId=null` → `nil`。
  - `RoomDto`/`RoomSummaryDto`: `upcomingEvent=null` → `nil`、`description=null` → `nil`。`RoomDto` は `inviteCode`/`inviteExpiresAt(null可)` を持つ。
  - `RoomWeekDto.Meeting.startMinute/endMinute` が `Double` としてデコード (整数 JSON でも成功)。
  - `FriendshipDto`: `acceptedAt=null` → `nil`、`status` enum 5 値 + 未知 → `.unknown`。
  - 各 enum (`RoomRole`/`RuleStrategy`/`SchoolKind`/`VisibilityMode`/`GoogleSyncStatus`/`IcsImportStatus` 等): 正規値がデコードでき、未知値が `.unknown` になる。
- **異常系**: 必須フィールド (非 Optional、例 `OccurrenceDto.id`) 欠落 JSON はデコード失敗 (throw)。`ErrorResponse` (`error.code`/`error.message`) をデコードできる。

### S-2 データ層 invalidation / 楽観更新

- **QueryKey.hasPrefix**: `["today","current"].hasPrefix(["today"]) == true`、`["stats","s1"].hasPrefix(["today"]) == false`、`["rooms","r1","week","2026-06-01"].hasPrefix(["rooms","r1","week"]) == true`、`["rooms","r1"].hasPrefix(["rooms","r1","week"]) == false` (長い prefix は不一致)。
- **QueryClient**: `setData` 後 `data(for:as:)` が値を返す。`invalidate(prefix: ["today"])` で `["today","current"]` の `isStale==true`、`["stats","s1"]` は `false` のまま。`snapshot(matching:)` → 破壊的変更 → `restore` で元に戻る。`removeAll()` で全消去。
- **invalidationTargets(for:)** (§1.4.4 全 case): 
  - `.patchAttendance` → `[stats, semesters, day]` (today を含まない)。
  - `.deleteAttendance` → `[today, stats, semesters, day]` (today を含む)。
  - `.markAllPresent` → `[stats, semesters, day]`。
  - `.bulkAttendance` → `[semesters, stats, day, today, timetable-suspensions]`。
  - `.courseSuspension(courseId:"c1")` → `[["courses","c1","suspensions"], semesters, stats, day]`。
  - `.timetableSuspension(date:"2026-06-01")` → `[timetable-suspensions, day, semesters, stats, today, ["day","2026-06-01"]]`。
  - `.personalEvent(date:"2026-06-01")` → `[personal-events, day, ["day","2026-06-01"]]`。
  - `.meUpdate` → `[["users","search"], semesters, stats]`。
  - (他 case も §1.4.4 表と一致することを assert)
- **AttendanceOptimistic.applyMarkAll**: `status==nil` の occurrence のみ指定 status に変わり、既に status を持つ occurrence は不変。件数・順序保持。
- **AttendanceOptimistic.applyPatch**: `occurrenceId` 一致の 1 件のみ status 置換、他は不変。存在しない id なら全件不変。

### S-3 デザイントークン値

- `Radius.full == 9999`、`Space.s20 == 80`、`Space.tabBarHeight == 64`、`Space.selfTtChrome == 352`。
- `ThemePreference.dark.colorScheme == .dark`、`.auto.colorScheme == nil`、`.light.colorScheme == .light`。
- (色は UIColor 解決値を `resolvedColor(with:)` で dark/light trait 別に検証可能: 例 `Color.borderSubtle` dark = white α0.06。Reviewer が UIColor 比較でトークン回帰を 1-2 点サンプル検証。全色網羅は必須でない。)

### S-4 ナビ / ルーティング

- `MainTab.allCases.count == 5`、各 `label`/`symbol` が §1.2.1 表と一致 (home→"ホーム"/"calendar" 等)。
- `AppRouter` 初期 `selectedTab == .home`。`selectedTab` 変更で切替わる (state 検証)。
- simulator: 起動 → 5 タブが並ぶ / 各タブ tap で該当プレースホルダ枠が描画 / クラッシュしない (§テスト基盤の simulator 観点)。

## テスト基盤

- **フレームワーク**: XCTest。ターゲット `AtenderTests` (既存)。`@testable import Atender`。
- **配置**: `apps/ios/AtenderTests/` に追加。
  - `DTODecodingTests.swift` (既存拡張): 全 DTO デコード + null 境界。
  - `QueryCacheTests.swift` (新規): QueryKey/QueryClient/invalidationTargets。
  - `AttendanceOptimisticTests.swift` (新規): applyMarkAll/applyPatch。
  - `DesignTokenTests.swift` (新規): Radius/Space/ThemePreference/色サンプル。
  - `NavigationTests.swift` (新規): MainTab/AppRouter。
- **fixture**: 実 API レスポンス JSON を `AtenderTests/Fixtures/*.json` に置く。取得元は `apps/api` をローカル起動 (`localhost:8787`) して実レスポンスを保存、または `apps/web` の型と突き合わせた実形状。**手書き JSON は shared schema と 1:1 に一致させる** (フィールド名/null 位置)。
- **HTTP を伴うテスト** (将来 Repository): `URLProtocol` スタブで `URLSession` を差し替える (gotcha `swiftui-final-mainactor-store-not-mockable-in-xctest`)。`final @MainActor` の Store 本体はモックせず、依存 (URLSession/QueryClient) を init 注入して実体を動かし observable state を assert。
- **simulator 確認観点** (手動 or UI テスト): (1) 5 タブが表示される (2) 各タブ tap で対応プレースホルダが出る (3) ダーク既定で表示・light 切替が効く (4) クラッシュしない。ビルドは `xcodegen generate` → `xcodebuild -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 15'`。

## 不採用 / スコープ外

- **標準 TabView + .tint のみ**: 不採用。Web のアクティブ丸角 accent glow を再現できず parity が崩れる。カスタムボトムバー採用 (§1.2.1)。
- **Today/Timetable/Stats を別タブ化**: 禁止 (Web に存在しない IA)。foundation doc の 3 タブ構成は本設計が破棄。
- **TanStack Query 相当の汎用フレームワーク自作 (再フェッチ自動化/staleTime/GC まで)**: Phase A スコープ外。骨格 (キャッシュ/prefix invalidation/楽観更新純粋関数) のみ。自動再フェッチ配線は各画面 Phase で `Query.load()` 明示呼び + `isStale` 判定で足す。
- **画面ロジック本体** (Home/Semester/Rooms/Friends/Settings/Setup の中身): Phase B〜E。Phase A はプレースホルダ枠のみ。
- **EventTile / TimetableView / カレンダー / AttendanceCalendar / MainAttendanceCTA / Lyric / Hero / CourseListItem**: 使う Phase (B/C/D) で実装。基盤 modifier のみ Phase A。
- **magic link サインイン / Universal Links 招待着地**: Phase E/D。現行 Apple/Google + Keychain は流用。
- **Noto Sans JP の完全フォントカスケード**: Phase A は登録のみ。日本語グリフの Inter→NotoSansJP 明示カスケードは B 以降で調整 (Phase A は Inter がラテン/数字に効けば可)。
- **TemplateCreateInput / CreateRoomEventInput / UpdateRoomEventInput / Google・Ics 各 Input の完全実装**: 型は Phase A で宣言するが、複雑な refine (recurrence/editScope) を伴う送信配線は使う Phase (D/E)。
