# Atender iOS 忠実移植 Phase D — ルーム / 友達 / テンプレート

> 親設計: `.designs/20260701-ios-faithful-port-architecture.md` (データ層/コンポーネント規約) / 移植正典: `.designs/20260701-web-to-ios-port-bible.md` (§3.3〜3.6 / §4.4)。
> 方針: **Web (`apps/web`) と完全一致**。スマホ独自の簡略化・IA 改変・新 UX をしない。迷ったら `apps/web/src/components/rooms/*`・`components/friends/*`・`routes/Templates.tsx` を正典とする。
> Swift 型はすべて確定形で書く (gotcha `design-doc-must-specify-swift-type-signatures`)。
> ★ 1 View 内の複数シートは兄弟に並べず**単一 `activeSheet` enum + switch host + 共有 Binding** に集約する (gotcha `swiftui-multiple-sibling-sheets-only-one-fires`)。Phase B/C で 2 回踏んだ落とし穴。本 Phase の全マルチシート画面 (Rooms / RoomDetail / RoomCalendar) に最初から適用する。

## 目的

Web の `/rooms`・`/rooms/$id`・`/friends`・`/templates` と招待着地 2 種を iOS に忠実移植する。ルーム一覧/作成/参加、ルーム詳細 (カレンダー・時間割トグル / 設定 / メンバー色描画 / 空き時間バー / 予定追加 / ICS 取込)、友達の申請振り分けとアクション、公開テンプレ検索/コピー/公開、招待ディープリンク着地 を Web と 1:1 で再現する。Phase A〜C の土台 (デザインシステム・全 DTO・全 endpoint・Data 層・共通コンポーネント・カレンダー基盤・TimetableView・純粋ロジック) を最大限再利用し、新規は本 Phase 固有分のみ。

## スコープ境界

**含む**:
- ルームタブ: `RoomsView` (一覧 / 作成 / リンク参加 / EmptyState) / `RoomCard` / `RoomCreateSheet` / `JoinByCodeSheet` / `JoinRoomView` (招待着地) / `RoomDetailView` (header+歯車 / calendar⇄timetable トグル) / `RoomSettingsSheet` / `RoomCalendar` (AvailabilityBar / month·week·day / FAB 2つ / DayEventList) / `RoomTimetable` (RoomWeek→periodIndex 逆算・member 色) / `RoomEventCreateSheet` (+RecurrencePicker) / `IcsImportWizard` (upload→preview→commit)
- 友達タブ: `FriendsView` (received/sent/accepted/blocked 振り分け) / `FriendCard` / `AddFriendSheet` (users/search + 招待リンク) / `AddFriendByInviteCodeView` (招待着地)
- テンプレ: `TemplatesView` (学校/学科/検索/学期フィルタ / コピー / 公開)。導線は「ルーム系」から (下記 §導線)
- ディープリンク受け口: Universal Links (`applinks:atender.appily.run`) + custom scheme (`atender://`) の `/rooms/join/<code>`・`/friends/add/<code>`
- データ層: `RoomRepository` / `RoomEventRepository` / `FriendshipRepository` / `TemplateRepository` / `IcsImportRepository` 新規、invalidation mutation 追加、multipart upload 対応追加
- 純粋ロジック: `RoomCalendarLogic` (buildCalendarEvents) / `RoomAvailability` (空き時間) / `RoomTimetableLogic` (逆算) / `RoomEventTiming` (ISO→分) / `FriendshipBuckets` (振り分け) / `RecurrencePresetLogic` (preset⇄RRULE) / `DeepLink` (URL parse)

**含まない (別 Phase)**:
- Google Calendar 連携全般 (`RoomGoogleSyncSection` / `/settings/calendar` push / TitleRuleEditor) = **Phase E**。RoomSettingsSheet からは Google セクションと「カレンダー取り込み設定 (`/settings/calendar` push)」ボタンを**外す** (ICS 取込ボタンは Phase D で残す)。
- 設定タブ本体 (`SettingsView` 全面 / ProfileEditSheet / SchoolDeptEditSheet 等) = **Phase E**
- `RoomEventDetailSheet` (Web で定義のみ・どこからも呼ばれない孤児 → **移植しない**。ルーム予定の編集/削除導線は Web に存在しない)
- magic link 認証 / Setup / Home / SemesterOverview (既 Phase)

## 再利用する Phase A/B/C 資産 (再定義しない)

| 資産 | パス | 用途 |
|---|---|---|
| `CalendarSegmented($viewMode)` / `PeriodNav(viewMode:anchor:onChange:)` | `Features/Calendar/PersonalCalendar.swift` | RoomCalendar のビューモード切替・期間ナビ (**そのまま**) |
| `CalendarMonth(anchor:selectedDate:events:statusByDate:onSelectDate:)` | 同上 | RoomCalendar month (statusByDate は `[:]` を渡す) |
| `CalendarWeek(weekStart:selectedDate:eventsByDateMap:onSelectDate:)` | 同上 | RoomCalendar week |
| `CalendarDay(date:events:)` | 同上 | RoomCalendar day。★ subtitle ハードコード修正あり (下記) |
| `DayAgendaPanel(date:events:)` | 同上 | 参考 (RoomCalendar は独自 `RoomDayEventList` を使う。下記) |
| `TimetableView(daySlots:events:days:onEventTap?:onEmptyCellTap?:height:)` | `Features/Timetable/TimetableGridPhaseB.swift` | RoomTimetable のグリッド描画 (メンバー色は events に載せる) |
| `EventTile(title:color:subtitle:meta:onTap:)` | 同上 | week/day のイベント片。★ 任意 `leadingSystemImage` 追加あり (下記) |
| `CalendarEvent` / `CalendarEventKind` / `MemberColor` / `CalendarEventDisplay` | `Core/Timetable/TimetableLogic.swift` | ★ `.roomEvent` case と 2 フィールド追加あり (下記) |
| `CalendarLane.assignLanes(_:)` / `MeetingExpansion.eventsByDate(_:)` | 同上 | day のレーン割当・日付グルーピング (**そのまま**) |
| `CalendarRange` (parse/yyyyMMdd/addDays/addMonths/mondayOf/monthFirst/monthGridRange/weekStartsFor/format/todayString) | 同上 | 日付演算 (UTC 正規化)。**そのまま** |
| `TimeFormatting.minutesToTime(_:)` | 同上 | 分→"H:MM" |
| `BottomSheet(title:isPresented:stackLevel:content:footer:)` | `Core/DesignSystem/Components/BottomSheet.swift` | 全シート |
| `FullScreenModal` | `Core/DesignSystem/Components/FullScreenModal.swift` | (本 Phase では未使用。RoomDetail は push) |
| `AtenderButton(title:variant:size:isLoading:isEnabled:action:)` | `Components/AtenderButton.swift` | 全ボタン |
| `Panel` / `EmptyState` / `Skeleton`(ListSkeleton 相当) / `ConfirmDialog` / `Chip` / `ToastCenter`/`ToastOverlay` | `Components/*` | 空状態・スケルトン・確認・トースト |
| Data 層: `QueryClient` / `QueryKey` / `Query<Value>` / `invalidationTargets(for:)` / `AppEnvironment` | `Core/Data/*`, `App/AppEnvironment.swift` | prefix invalidation キャッシュ |
| 全 DTO / 全 Endpoint / 全 Enum | `Core/Models/DTOs.swift` / `Core/Networking/APIEndpoint.swift` / `Core/Models/Enums.swift` | Phase A resync 済 (Room/Friendship/RoomEvent/RoomWeek/Template/Ics 系すべて実装済。§使用 DTO 参照) |
| `AppRouter` (selectedTab / roomsPath / friendsPath NavigationPath) | `App/AppRouter.swift` | ルーム→RoomDetail push・招待着地の遷移先 |
| `MainTabView` (5 タブ + NavigationStack) | `App/MainTabView.swift` | rooms/friends の Placeholder を実画面へ差し替え |

### Phase B/C 資産への**必須の小改修** (追記でなく既存の一般化)

1. **`CalendarEvent` の拡張** (`Core/Timetable/TimetableLogic.swift`):
   - `CalendarEventKind` に `case roomEvent` を追加 (現状 `meeting, personal`)。
   - `CalendarEvent` に 2 フィールド追加: `var ownerId: String? = nil` (空き時間計算用: meeting=userId, roomEvent=authorId) / `var source: RoomEventSource? = nil` (アイコン用)。既存 PersonalCalendar 生成箇所は default nil のままで無影響 (デフォルト値付き)。
2. **`CalendarDay` の subtitle ハードコード解消** (同 `PersonalCalendar.swift` の `CalendarDay`):
   - 現状 `subtitle: "自分 · \(time)"` とハードコード → `subtitle: "\(event.subtitle) · \(TimeFormatting.minutesToTime(event.startMinute))"` に変更。PersonalCalendar の meeting は `subtitle="自分"` なので**表示は完全に不変**、かつ RoomCalendar でメンバー名が出せる。
3. **`EventTile` に任意アイコン**: `var leadingSystemImage: String? = nil` を追加。`content` の Capsule の右に `if let leadingSystemImage { Image(systemName:).font(.system(size:10,weight:.bold)) }`。既存呼び出しは無影響。ICS/Google 由来イベントのソースアイコン (§RoomCalendar) 用。

> ★ 上記 3 点は「Phase C までの実装を壊さない後方互換な一般化」であり、規約「追記でなく置換」に沿って**該当行を置換**する (新 case/フィールドは既存 enum/struct への追加なので許容範囲)。

---

## ナビゲーション配線

### タブ差し替え (`MainTabView.swift`)

```swift
case .rooms:
    NavigationStack(path: $bindableRouter.roomsPath) {
        RoomsView()
            .navigationDestination(for: RoomsRoute.self) { route in
                switch route {
                case .detail(let id):     RoomDetailView(roomId: id)
                case .join(let code):     JoinRoomView(inviteCode: code)
                case .templates:          TemplatesView()
                }
            }
    }
case .friends:
    NavigationStack(path: $bindableRouter.friendsPath) {
        FriendsView()
            .navigationDestination(for: FriendsRoute.self) { route in
                switch route {
                case .addByInvite(let code): AddFriendByInviteCodeView(inviteCode: code)
                }
            }
    }
```

```swift
enum RoomsRoute: Hashable { case detail(String), join(String), templates }
enum FriendsRoute: Hashable { case addByInvite(String) }
```

- Web の push (`/rooms/$id`, `/rooms/join/$inviteCode`, `/friends/add/$inviteCode`) を `navigationDestination(for:)` で再現。RoomCard tap → `roomsPath.append(RoomsRoute.detail(id))`。
- `RoomsView` からテンプレへ: header に「みんなの時間割」テキストボタン → `roomsPath.append(RoomsRoute.templates)` (§テンプレ導線)。
- `AppRouter` の既存 `roomsPath` / `friendsPath` を使用 (追加不要)。

### 招待ディープリンク受け口

Web の招待 route (`/rooms/join/$code`, `/friends/add/$code`) を iOS では **Universal Links + custom scheme** で受ける。

- `Info.plist`: 既存 `CFBundleURLSchemes` に `atender` があるか確認し無ければ追加。Associated Domains に `applinks:atender.appily.run` を追加 (entitlements)。サーバ側 `/.well-known/apple-app-site-association` 配備は本 Phase の**前提** (未配備なら custom scheme のみでも成立)。
- ルートで受信 (`AtenderApp` の `WindowGroup` or `RootView`):
  ```swift
  .onOpenURL { url in appRouter.handleDeepLink(url) }
  .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
      if let url = activity.webpageURL { appRouter.handleDeepLink(url) }
  }
  ```
- `DeepLink.parse(_:)` は**純粋関数** (View 非依存, テスト対象):
  ```swift
  enum DeepLink: Equatable {
      case roomJoin(code: String)
      case friendAdd(code: String)
      static func parse(_ url: URL) -> DeepLink?
      // https://atender.appily.run/rooms/join/<code>  → .roomJoin(code)
      // atender://rooms/join/<code>                   → .roomJoin(code)
      // .../friends/add/<code>                         → .friendAdd(code)
      // それ以外 → nil
  }
  ```
  - path 抽出は `url.pathComponents` を使い、`["rooms","join",code]` / `["friends","add",code]` を末尾一致で判定 (host 差異 = Universal Link は host あり / custom scheme は host が "rooms" になる点を両対応。実装は「`rooms`,`join`,X の 3 連続」を含むかで判定)。
- `AppRouter.handleDeepLink(_ url: URL)` (View 側):
  ```swift
  func handleDeepLink(_ url: URL) {
      guard let link = DeepLink.parse(url) else { return }
      switch link {
      case .roomJoin(let code):
          selectedTab = .rooms;   roomsPath.append(RoomsRoute.join(code))
      case .friendAdd(let code):
          selectedTab = .friends; friendsPath.append(FriendsRoute.addByInvite(code))
      }
  }
  ```
  - 未サインイン / setup 未完了時: `RootView` の状態分岐が優先されるので、認証前に来たリンクは `AppRouter.pendingDeepLink: DeepLink?` に退避し、`signedIn && setupComplete` になった `.onChange` で適用する (Web の `requireCompleteSetup` ガード相当)。着地画面自体は認証済前提。

---

## 画面別 詳細設計

### 1. RoomsView (`/rooms` Rooms.tsx 忠実)

```swift
struct RoomsView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var model: RoomsViewModel?
    @State private var activeSheet: RoomsSheet?
    private enum RoomsSheet: Identifiable { case create, join; var id: Int { self == .create ? 0 : 1 } }
}

@MainActor @Observable
final class RoomsViewModel {
    @ObservationIgnored private let env: AppEnvironment
    private(set) var rooms: [RoomSummaryDto] = []
    private(set) var isLoading = false
    var errorMessage: String?
    init(env: AppEnvironment)
    func load(force: Bool = false) async     // env.roomRepository.rooms(force:)
}
```

- レイアウト: `ScrollView` + `VStack(spacing: Space.s6)` + `.padding(Space.pagePxMobile)`、背景 `Color.bgBase`。
- header: `HStack` — 左 `Text("ルーム").font(.atender2xl).weight(.bold)`、右 `HStack(spacing: Space.s3)` に `AtenderButton("リンクで参加", variant:.secondary){ activeSheet = .join }` + `AtenderButton("作成", variant:.primary){ activeSheet = .create }`。header 直下 (右寄せ tertiary) に `Button("みんなの時間割"){ router.roomsPath.append(RoomsRoute.templates) }` (`.atenderXs`, `.textTertiary`) — §テンプレ導線。
- 本体: `isLoading` → `ListSkeleton(rows: 3)` 相当。`rooms.isEmpty` → `EmptyState(title:"まだルームに参加していません", message:"友達の時間割と予定をまとめて見られます。", action: AtenderButton("ルームを作成", variant:.primary))`。それ以外 → `LazyVGrid(columns: [.init(.flexible())], spacing: Space.s3)` (モバイル 1 列。Web `md:grid-cols-2` はモバイルで 1 列 = 忠実) に `RoomCard`。
- シート host (単一 switch):
  ```swift
  .sheet(item: $activeSheet) { sheet in
      switch sheet {
      case .create: RoomCreateSheet(isPresented: activeSheetBoolBinding, onCreated: { await model?.load(force:true) })
      case .join:   JoinByCodeSheet(isPresented: activeSheetBoolBinding, onJoined: { id in router.roomsPath.append(RoomsRoute.detail(id)) })
      }
  }
  ```
  ※ `.sheet(item:)` は 1 スロット消費で兄弟並列にならないため gotcha 回避済。BottomSheet コンポーネントを使う場合は §0 の `activeSheet` enum + 共有 Binding 形に統一する。

### 2. RoomCard (`RoomCard.tsx` 忠実)

```swift
struct RoomCard: View {
    let room: RoomSummaryDto
    let onTap: () -> Void
}
```

- ボタン全体 = `Color.bgElevated` カード (角丸 `Radius.lg` = 24pt = rounded-3xl 相当、`.atenderShadow(.card)`, `active:scale-0.98`)。
- 背景グラデ tint: `roomTint(room.id)` で 4 パレットから hash 選択、`opacity 0.30` の `LinearGradient(.topLeading→.bottomTrailing)` を `ZStack` 最下層に敷く。パレットは Web の Tailwind クラスを実色に写す (下表)。純粋関数 `RoomTint.gradient(id:) -> [Color]`。
  | index | Web クラス | iOS 実色 (from→to) |
  |---|---|---|
  | 0 | `from-status-present/80 to-cyan-500/40` | `statusPresent(.8)` → `#06B6D4(.4)` |
  | 1 | `from-violet-500/80 to-fuchsia-500/40` | `#8B5CF6(.8)` → `#D946EF(.4)` |
  | 2 | `from-amber-400/80 to-rose-500/40` | `#FBBF24(.8)` → `#F43F5E(.4)` |
  | 3 | `from-sky-500/80 to-indigo-500/40` | `#0EA5E9(.8)` → `#6366F1(.4)` |
  - hash: `var h: UInt32 = 0; for c in id.unicodeScalars { h = h &* 31 &+ c.value }; palette[Int(h) % 4]`。
- 前景: `HStack(alignment:.top)` — 左 `VStack` に `Text(room.name).font(.atenderXl).weight(.black).lineLimit(1)` + `Text("\(room.memberCount) メンバー").font(.atenderSm).weight(.medium).foregroundStyle(.textSecondary)`。右上に role バッジ `Text(room.myRole.rawValue).font(.atender(11,.bold))` を `Color.bgBase.opacity(0.7)` + `.background(.ultraThinMaterial)` の pill (`Radius.full`, uppercase)。
- `room.upcomingEvent != nil` → 下部に pill: `Circle().fill(.accent500)` (glow) + `Text("\(start.slice) · \(title)")`。start は Web `.slice(5,16).replace("T"," ")` = `"MM-DD HH:MM"`。純粋 `RoomCardLogic.upcomingLabel(start:title:) -> String`。

### 3. RoomCreateSheet / JoinByCodeSheet

```swift
struct RoomCreateSheet: View {
    @Binding var isPresented: Bool
    let onCreated: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var name = ""
    @State private var description = ""
    @State private var isPending = false
}
struct JoinByCodeSheet: View {
    @Binding var isPresented: Bool
    let onJoined: (String) -> Void        // 参加後の room.id を渡す
    @Environment(AppEnvironment.self) private var environment
    @State private var code = ""
    @State private var isPending = false
    @State private var errorMessage: String?
}
```

- **RoomCreateSheet**: `BottomSheet(title:"ルームを作成")`。Field「ルーム名」(required, Input) + 「説明」(Textarea)。footer: 「キャンセル」(ghost) / 「作成」(primary, `disabled = name.isEmpty || isPending`) → `roomRepository.createRoom(.init(name:name, description: description.isEmpty ? nil : description))` → 成功で `onCreated()` + close。
- **JoinByCodeSheet**: `BottomSheet(title:"リンクで参加")`。Field「招待リンクまたはコード」(Input)。footer:「参加」(primary, `disabled = code.isEmpty || isPending`) → `roomRepository.joinRoom(inviteCode: parseCode(code))` → 成功で `onJoined(room.id)` + close。失敗 (410 INVITE_EXPIRED / 404 INVITE_NOT_FOUND) → `errorMessage`。
- `parseCode`: 純粋 `RoomInviteCode.parse(_:) -> String` = `trim → "/" split → filter(非空) → last ?? trim`。フル URL 貼付でも末尾コードを取る (Web と同一)。

### 4. JoinRoomView (招待着地 `JoinRoom.tsx` 忠実)

```swift
struct JoinRoomView: View {
    let inviteCode: String
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var phase: Phase = .joining
    enum Phase { case joining, failed }
}
```

- `.task { do { let r = try await environment.roomRepository.joinRoom(inviteCode: inviteCode); router.roomsPath は自身を pop してから detail へ replace } catch { phase = .failed } }`。
- 成功: `router.roomsPath` の末尾 (この JoinRoute) を除去し `RoomsRoute.detail(r.room.id)` を append (Web の `navigate replace`)。実装は `roomsPath.removeLast(); roomsPath.append(.detail(id))`。
- 表示: `Panel` に `phase == .failed ? "招待リンクが無効です" : "ルームに参加しています"`。失敗時のみ `AtenderButton("ルームへ戻る"){ router.roomsPath = NavigationPath() }`。
- 冪等: 既メンバー (409 ALREADY_MEMBER) は Web 同様サーバが room を返す想定なら成功扱い。サーバが 409 を返す実装なら `.failed` を避けるため 409 は detail へ流す (要 API 挙動確認: 現行 join は 200 で room を返す = 成功扱いでよい)。

### 5. RoomDetailView (`/rooms/$id` RoomDetail.tsx 忠実)

```swift
struct RoomDetailView: View {
    let roomId: String
    @Environment(AppEnvironment.self) private var environment
    @State private var model: RoomDetailViewModel?
    @State private var tab: RoomDetailTab = .calendar
    @State private var settingsOpen = false
    enum RoomDetailTab: String, CaseIterable { case calendar, timetable }
}

@MainActor @Observable
final class RoomDetailViewModel {
    @ObservationIgnored private let env: AppEnvironment
    let roomId: String
    private(set) var room: RoomDto?
    private(set) var isLoading = false
    init(env: AppEnvironment, roomId: String)
    func load(force: Bool = false) async     // env.roomRepository.room(id:force:)
}
```

- レイアウト: `VStack(spacing: Space.s3)` + `.padding(Space.pagePxMobile)`。
- header: `HStack` — 左 `VStack(alignment:.leading)` に `Text(room?.name ?? "ルーム").font(.atender2xl).weight(.bold).lineLimit(1)` + `room?.description` があれば `Text(.atenderSm, .textSecondary)`。右 歯車ボタン `Image(systemName:"gearshape.fill")` を 44x44 丸 (`Color.textPrimary.opacity(0.08)` bg) → `settingsOpen = true`。
- トグル: `HStack(spacing:0)` の pill (`Color.bgMuted`, `Radius.full`, padding 4) に 2 セグメント「カレンダー」「時間割」。選択 = `Color.accent500` + `.textOnAccent` + `.atenderShadow(.glowSoft)`。
- 本体: `tab == .calendar ? RoomCalendar(roomId:) : RoomTimetable(roomId:)`。
- `.sheet(isPresented: $settingsOpen) { RoomSettingsSheet(roomId: roomId, isPresented: $settingsOpen, onChanged: { await model?.load(force:true) }) }` (単一シート)。

### 6. RoomSettingsSheet (`RoomSettingsSheet.tsx` 忠実 — ただし Google セクション/`settings/calendar` push は Phase E で除外)

```swift
struct RoomSettingsSheet: View {
    let roomId: String
    @Binding var isPresented: Bool
    let onChanged: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var model: RoomSettingsViewModel
    @State private var name = ""
    @State private var description = ""
    @State private var showMemberTimetables = true
    @State private var copyMessage: String?
    @State private var confirm: Confirm?        // 単一 ConfirmDialog 集約
    @State private var importOpen = false        // IcsImportWizard (stackLevel 2)
    enum Confirm: Identifiable { case removeMember(String), leave, delete; var id: String {...} }
}

@MainActor @Observable
final class RoomSettingsViewModel {
    @ObservationIgnored private let env: AppEnvironment
    let roomId: String
    private(set) var room: RoomDto?
    private(set) var members: [RoomMemberDto] = []
    private(set) var meId: String?
    var isOwner: Bool { members.first { $0.userId == meId }?.role == .owner }
    init(env: AppEnvironment, roomId: String)
    func load() async                                       // room + members + me を並列取得
    func persist(name: String?, description: String??, showMemberTimetables: Bool?) async  // owner のみ, updateRoom
    func removeMember(_ userId: String) async
    func regenerateInvite() async
    func leave() async
    func delete() async
}
```

- `BottomSheet(title:"ルームの設定")`。`.task { await model.load(); name = room.name; description = room.description ?? ""; showMemberTimetables = room.showMemberTimetables }`。owner でなければ全入力 `disabled`。
- **ルーム名 / 説明**: Input/Textarea。`onSubmit`/フォーカス喪失で値が変われば `persist` (Web は `onBlur`。iOS は `.onSubmit` + フォーカス離脱時。TextField の `.focused` 状態変化で発火)。
- **メンバー時間割トグル**: `Toggle(showMemberTimetables)` (Web `showMemberTimetables`) → 変更即 `persist(showMemberTimetables:)`。
- **メンバーセクション**: 見出し `"メンバー (\(count))"`。各行: イニシャル丸バッジ (色 = `MemberColor.memberColor(userId)`) + 名前/handle + role 日本語 (OWNER→"オーナー" / MEMBER→"メンバー")。`isOwner && userId != meId && role != .owner` の行に「✕ 追放」ボタン → `confirm = .removeMember(userId)`。
- **外部カレンダー取込セクション**: 見出し + 説明 + `AtenderButton("取り込み画面を開く"){ importOpen = true }`。★ Web の「カレンダー取り込み設定 (`/settings/calendar`)」ボタンと `RoomGoogleSyncSection` は **Phase E**、本 Phase では出さない。
- **招待リンクセクション** (owner のみ): `Text("\(APPUrl)/rooms/join/\(room.inviteCode)")` (break-all) + `copyMessage` + 「リンクをコピー」(`UIPasteboard.general.string = link` → `copyMessage = "コピーしました"`) / 「再発行」(ghost → `regenerateInvite`)。`APPUrl` = `APIConfig` の Web ベース URL (`https://atender.appily.run`)。
- footer: owner → `AtenderButton("ルームを削除", variant:.destructive){ confirm = .delete }` / 非 owner → `AtenderButton("退出する", variant:.ghost){ confirm = .leave }`。
- **ConfirmDialog 集約** (単一): `.confirmDialog(item: $confirm)` 相当を 1 つだけ張り、case で title/body/label/onConfirm を出し分ける。
  - `.removeMember` → title「メンバーを追放しますか？」/ `removeMember(userId)`。
  - `.leave` → 「ルームを退出しますか？」/ `leave()` → close + `router.roomsPath = NavigationPath()` (一覧へ)。
  - `.delete` → 「ルームを削除しますか？」/ `delete()` → close + 一覧へ。
- `IcsImportWizard(roomId:roomId, isPresented:$importOpen)` は stackLevel 2 で本シート上に重ねる (単一)。
- 各 mutation 成功後 `onChanged()` (RoomDetail の room 再取得)。

### 7. RoomCalendar (`RoomCalendar.tsx` 忠実)

```swift
struct RoomCalendar: View {
    let roomId: String
    @Environment(AppEnvironment.self) private var environment
    @State private var viewMode: CalendarViewMode = .day       // Web 既定 day
    @State private var anchor: String = CalendarRange.todayString()
    @State private var selectedDate: String = CalendarRange.todayString()
    @State private var expanded = false                          // AvailabilityBar メンバー別
    @State private var activeSheet: RoomCalSheet?
    @State private var weeks: [RoomWeekDto] = []
    @State private var isLoading = false
    @State private var loadError = false
    enum RoomCalSheet: Identifiable { case event, ics; var id: Int {...} }
}
```

- **データ取得**: `weekStarts = CalendarRange.weekStartsFor(viewMode, anchor: anchor)` (day/week=1 週, month=6 週)。各 weekStart を `roomRepository.roomWeek(id:roomId, weekStart:)` で**並列 fetch** (`withTaskGroup`) → `weeks`。`.task(id: "\(viewMode)-\(anchor)")` で再取得。`isLoading` は取得中、`loadError` はいずれか失敗。
- **イベント合成**: `let events = RoomCalendarLogic.buildCalendarEvents(weeks: weeks)` (純粋, 下記)。`eventMap = MeetingExpansion.eventsByDate(events)`、`dayEvents = eventMap[selectedDate] ?? []`。
- レイアウト `VStack(spacing: Space.s3)`:
  1. header 行: `HStack` — `PeriodNav(viewMode:viewMode, anchor:anchor, onChange: { next in anchor = next; if viewMode == .day { selectedDate = next } })` + `CalendarSegmented(viewMode: $viewMode)`。
     - ★ `PeriodNav.onChange` は「次の anchor 文字列」を返す既存実装。Web は day 変更時 selectedDate も更新 (`if viewMode==="day" setSelectedDate`)。同挙動。
  2. `AvailabilityBar(date: selectedDate, members: weeks.first?.members ?? [], events: dayEvents, expanded: expanded, onToggle: { expanded.toggle() })`。
  3. ローディング → 対応スケルトン (month: month+agenda / week / day)。エラー → `Panel("カレンダーを読み込めませんでした。")`。
  4. 本体:
     - `.month` → `CalendarMonth(anchor:anchor, selectedDate:selectedDate, events:events, statusByDate:[:], onSelectDate: selectDate)` + `RoomDayEventList(date:selectedDate, events:dayEvents)`。
     - `.week` → `CalendarWeek(weekStart: weekStarts.first ?? selectedDate, selectedDate:selectedDate, eventsByDateMap:eventMap, onSelectDate: selectDate)`。
     - `.day` → `CalendarDay(date:selectedDate, events:dayEvents)`。
  5. **FAB** (`.month` 以外): `.overlay(alignment:.bottomTrailing)` に縦 2 ボタン。上「↓ (カレンダー取り込み)」= 12x12 丸 `Color.bgElevated` → `activeSheet = .ics`。下「+ 予定を追加」= `Color.accent500` pill (`.atenderShadow(.glowSoft)`) → `activeSheet = .event`。`.padding(.trailing, Space.s5)` + `.padding(.bottom, Space.tabBarHeight + Space.s6)` (Web `bottom-24 right-5`、タブバー上に浮かせる)。
- `selectDate(_ date:)`: `selectedDate = date; anchor = date` (Web 同一)。
- シート host (単一 switch):
  ```swift
  .sheet(item: $activeSheet) { sheet in
      switch sheet {
      case .event: RoomEventCreateSheet(roomId: roomId, defaultDate: selectedDate, isPresented: activeSheetBool, onCreated: { await reload() })
      case .ics:   IcsImportWizard(roomId: roomId, isPresented: activeSheetBool, onCommitted: { await reload() })
      }
  }
  ```

#### RoomDayEventList (Web `DayEventList` 忠実 — month 下部)

```swift
struct RoomDayEventList: View {
    let date: String
    let events: [CalendarEvent]     // 既 startMinute asc
}
```

- `section` (`Color.bgElevated`, `Radius.md`, `.atenderShadow(.card)`)。見出し `"\(CalendarRange.format(date, .monthDay)) の予定"` (`.atenderXs`, `.textTertiary`)。
- 各行: 左 4pt 縦 pill (色 = `event.color`) + `Text(TimeFormatting.minutesToTime(event.startMinute))` (色 = 70% ブレンド `event.color`) + タイトル (truncate) + 末尾に `event.subtitle` (メンバー/作者名, `.atender(10)`)。背景 tint = `event.color.opacity(0.15)` over bgElevated。
- 空 → `Text("予定なし")`。
- ★ Web `DayEventList` は meeting=memberColor / roomEvent=authorColor をそのまま使う (source 上書きなし) が、iOS は `event.color` に **buildCalendarEvents 段でソース考慮済の色** を載せる (§不採用案参照)。差は ICS/Google 予定の色のみで軽微、目視許容。

#### AvailabilityBar (`AvailabilityBar.tsx` 忠実)

```swift
struct AvailabilityBar: View {
    let date: String
    let members: [RoomWeekDto.Member]
    let events: [CalendarEvent]
    let expanded: Bool
    let onToggle: () -> Void
}
```

- `section` (`Color.bgElevated`, `Radius.lg`=24pt, `.atenderShadow(.card)`)。header: `"\(monthDay) の空き時間"` (`.atenderBase.weight(.black)`) + 右に開閉ボタン (`expanded ? "▴":"▾"`, 40x40 丸)。
- 時刻目盛: `9`〜`18` の 10 ラベル (`.atender(10,.bold)`, `.textTertiary`) を 44pt ラベル列 + 均等配置。
- **全員行** `BarRow(label:"全員", slots: combined.map{ (busy:$0, total: members.count) })`。
- `expanded` → 各メンバー行 `BarRow(label: name ?? handle ?? "No name", color: member.color, slots: perMember)`。
- **BarRow**: `HStack` 44pt ラベル + 18 スロットの横バー (`Color.textPrimary.opacity(0.04)` トラック, `Radius.full`, 高さ 20pt)。各スロット塗り = `ratio = total==0 ? 0 : busy/total`。`ratio==0 → clear`、color 指定あり → `color.opacity(ratio)`、無し → `accent500.opacity(ratio)`。スロット間に 1pt `bgElevated` 区切り。
- 計算は純粋関数 `RoomAvailability.compute(...)` に出す (下記)。

### 8. RoomTimetable (`RoomTimetable.tsx` 忠実)

```swift
struct RoomTimetable: View {
    let roomId: String
    @Environment(AppEnvironment.self) private var environment
    @State private var week: RoomWeekDto?
    @State private var daySlots: [DaySlotDto] = RoomTimetableLogic.defaultSlots
    @State private var isLoading = false
    @State private var loadError = false
}
```

- `weekStart` = 今週の月曜 (`CalendarRange.mondayOf(CalendarRange.todayString())`)。
- `.task`: (a) `roomRepository.roomWeek(id:roomId, weekStart:)` → `week`、(b) `meRepository.me()` + `timetableRepository.userTimetables()` → `daySlots` を `RoomTimetableLogic.resolveDaySlots(me:timetables:)` で決定 (defaultSemester の時間割 → 無ければ先頭 → 無ければ `defaultSlots`)。
- `events = RoomTimetableLogic.buildEvents(week: week, daySlots: daySlots)` (純粋, 下記)、`displayDays = RoomTimetableLogic.displayDays(events:)`。
- 状態分岐 (Web 同一):
  - `isLoading` → `TimetableGridSkeleton` (既存)。
  - `loadError` → `Panel("時間割を読み込めませんでした。")`。
  - `events.isEmpty` → `EmptyState(title: week?.members.isEmpty == false ? "メンバーの時間割がまだありません" : "メンバーがいません")`。
  - else → `TimetableView(daySlots: daySlots, events: events, days: displayDays, height: roomTtHeight)`。
- `roomTtHeight` = `UIScreen.main.bounds.height - Space.roomTtChromeTop(168) - Space.tabBarHeight - safeAreaBottom` (Web `--room-tt-chrome-top:168px`)。定数が DesignSystem に無ければ `Space` に `roomTtChromeTop = 168` 追加。

### 9. RoomEventCreateSheet (`RoomEventCreateSheet.tsx` 忠実 + RecurrencePicker)

```swift
struct RoomEventCreateSheet: View {
    let roomId: String
    let defaultDate: String
    @Binding var isPresented: Bool
    let onCreated: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var title = ""
    @State private var start: Date      // defaultDate の 00:00 起点 (Web は defaultDate 当日)
    @State private var end: Date        // start + 1h
    @State private var rrule: String?
    @State private var visibility: VisibilityMode = .normal
    @State private var isPending = false
}
```

- `BottomSheet(title:"予定を追加")`。フィールド: タイトル (required) / 開始 (`DatePicker .dateAndHourAndMinute`) / 終了 (同) / `RecurrencePicker(rrule:$rrule, start: start)` / 表示モード (`Picker` 3 択: 通常/タイトル隠す/予定ありのみ = NORMAL/TITLE_MAPPED/BUSY_ONLY)。
- footer:「保存」(primary, `disabled = title.isEmpty || isPending`) → `roomEventRepository.createRoomEvent(roomId:roomId, .init(title:title, start: iso(start), end: iso(end), isAllDay:false, recurrence: rrule.map{ .init(rrule:$0, exDates:[], rDates:[]) }, visibilityMode: visibility))` → 成功で `onCreated()` + close。`iso(_:)` = `ISO8601DateFormatter` (`.withInternetDateTime`)。
- **RecurrencePicker** (iOS 版, `RecurrencePicker.tsx` 忠実):
  ```swift
  struct RecurrencePicker: View {
      @Binding var rrule: String?
      let start: Date
  }
  ```
  - `Picker("繰り返し", selection: preset)` 7 択 (none/daily/weekly/weekday/monthly_bymonthday/monthly_byday/yearly)。ラベルは start の曜日/日/週序数を埋める (Web と同一文言、下記純粋関数)。選択で `rrule = RecurrencePresetLogic.presetToRRule(preset, start:)`。
  - `rrule != nil` → `Text(RecurrencePresetLogic.recurrenceToText(rrule, start:))` (`.atenderXs`, `.textSecondary`)。
  - 表示中の現在プリセットは `RecurrencePresetLogic.currentPreset(rrule, start:)` で逆引き。
  - ★ Web は **UTC** の曜日/日で RRULE を組む (`getUTCDay` 等)。iOS も**UTC カレンダー**で分解する (`CalendarRange.utcCalendar` の component)。決定性のため device tz を使わない。

### 10. IcsImportWizard (`IcsImportWizard.tsx` 忠実, 2-phase preview/commit)

```swift
struct IcsImportWizard: View {
    let roomId: String
    @Binding var isPresented: Bool
    var onCommitted: (() async -> Void)? = nil
    @Environment(AppEnvironment.self) private var environment
    @State private var step: Step = .upload
    @State private var importId: String?
    @State private var preview: IcsImportPreview?
    @State private var commitResult: IcsImportCommitResult?
    @State private var errorText: String?
    @State private var fileImporterOpen = false
    enum Step { case upload, preview, committing, done, error }
}
```

- `BottomSheet(title:"カレンダーを取り込む")`。`isPresented` が false に落ちたら state リセット (Web の `useEffect(!open)`)。
- **upload**: 破線ボックス「ファイルを選択 / .ics, 5MB まで」→ tap で `.fileImporter(isPresented:$fileImporterOpen, allowedContentTypes: [UTType(filenameExtension:"ics") ?? .data, UTType("text/calendar") ?? .data])`。選択 → ファイル `Data` 読込 → `icsImportRepository.upload(roomId:roomId, fileData:, filename:)` → 成功で `importId = res.import.id; step = .preview` / 失敗で `errorText; step = .error`。アップロード中は `TextLineSkeleton`。
- **preview**: `.task(id: importId)` で `icsImportRepository.preview(roomId:roomId, importId:)` → `preview`。ローディング中 `ListSkeleton(rows:4)`。表示: 「N 件のイベントが見つかりました」+ 先頭 10 件リスト (各: `"MM/DD HH:MM"` + `"\"rawTitle\" → \"mappedTitle\""`)。footer:「もう一度」(ghost → step=.upload) /「取り込む」(primary, `disabled = preview==nil || pending`) → step=.committing。
- **committing**: `icsImportRepository.commit(roomId:roomId, importId:)` → `commitResult; step=.done` / 失敗 → `errorText; step=.error`。表示 `TextLineSkeleton`。
- **done**: 「\(committed) 件取り込み、\(skipped) 件スキップ」+ errors があれば赤リスト。footer:「ルールを編集」(ghost → **Phase E: 本 Phase では無効化 or 非表示**。Web は `/settings/calendar` へ。Phase D では出さない) /「閉じる」(primary → `onCommitted?()` + close)。
- **error**: 赤バナー `errorText` + 「戻る」(primary → step=.upload)。
- **multipart upload の追加実装** (§データ層) に依存。日時整形の `"MM/DD HH:MM"` は preview item の `start` (ISO) を JST で整形 (`RoomEventTiming` の formatter 流用)。

### 11. FriendsView (`Friends.tsx` 忠実)

```swift
struct FriendsView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var model: FriendsViewModel?
    @State private var addOpen = false
}

@MainActor @Observable
final class FriendsViewModel {
    @ObservationIgnored private let env: AppEnvironment
    private(set) var friendships: [FriendshipDto] = []
    private(set) var meId: String?
    private(set) var isLoading = false
    init(env: AppEnvironment)
    func load(force: Bool = false) async         // friendships + me
    func act(_ action: FriendshipActionKind, id: String) async  // 成功後 load(force:true)
    enum FriendshipActionKind: String { case accept, decline, cancel, block, delete }
}
```

- レイアウト `ScrollView` + `VStack(spacing: Space.s6)` + padding。header: `Text("友達").font(.atender2xl).weight(.bold)` + `AtenderButton("友達を追加", variant:.primary){ addOpen = true }`。
- 振り分けは純粋 `FriendshipBuckets.split(friendships:meId:) -> Buckets` (下記)。空 (全 0 かつ非ローディング) → `EmptyState(title:"まだ友達がいません", message:"ハンドル検索または招待リンクで追加できます。")`。
- セクション (見出し `.atenderSm.weight(.semibold).textSecondary`):
  - `"受信した申請 (\(received.count))"` → FriendCard(variant:.received, onAccept: act(.accept), onDecline: act(.decline))。
  - `"送信した申請 (\(sent.count))"` → FriendCard(variant:.sent, onCancel: act(.cancel))。
  - `"友達 (\(accepted.count))"` → FriendCard(variant:.accepted, onBlock: act(.block), onDelete: act(.delete))。
  - `blocked.isEmpty == false` のときのみ `"ブロック中 (\(blocked.count))"` → FriendCard(variant:.blocked, onDelete: act(.delete))。
- `.sheet(isPresented: $addOpen) { AddFriendSheet(isPresented:$addOpen, onChanged: { await model?.load(force:true) }) }`。

### 12. FriendCard (`FriendCard.tsx` 忠実)

```swift
struct FriendCard: View {
    let friendship: FriendshipDto
    let meId: String?
    let variant: Variant
    var onAccept: (() -> Void)? = nil
    var onDecline: (() -> Void)? = nil
    var onCancel: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil
    var onBlock: (() -> Void)? = nil
    enum Variant { case received, sent, accepted, blocked }
}
```

- `article` (`Color.bgElevated`, `Radius.lg`=24pt, `.atenderShadow(.card)`)。相手 = `FriendshipLogic.otherUser(friendship, meId:)` (sender==me ? receiver : sender)。
- `HStack(spacing: Space.s4)`: 56x56 角丸 (`Radius.md`) グラデ avatar (色 = `FriendAvatar.gradient(id:)` 5 パレット, Web `avatarColor` を実色化) にイニシャル大文字 + `VStack` に `Text(user.name ?? "名前未設定").font(.atenderLg).weight(.bold)` + `Text("@\(user.handle ?? String(user.id.prefix(8)))").font(.atenderSm).textSecondary`。
- アクション行 (`HStack` 右寄せ `.wrap`): variant 別ボタン (size `.sm`) — received:「承認」(primary)+「拒否」/ sent:「取消」/ accepted:「ブロック」(ghost)+「解除」(ghost)/ blocked:「解除」。

### 13. AddFriendSheet (`AddFriendSheet.tsx` 忠実)

```swift
struct AddFriendSheet: View {
    @Binding var isPresented: Bool
    let onChanged: () async -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var rawHandle = ""
    @State private var searchResults: [UserSearchDto] = []
    @State private var invite = ""
    @State private var myInviteCode: String?
    @State private var copyMessage: String?
    @State private var isPending = false
}
```

- `BottomSheet(title:"友達を追加")`。
- ハンドル検索: Field「ハンドル検索」(Input, placeholder "@handle")。`rawHandle` を **300ms デバウンス** (`.task(id: rawHandle)` + `Task.sleep`) で `@` 除去 → `friendshipRepository.searchUsers(handle:)` → `searchResults`。空文字は検索しない (Web `enabled: handle>0`)。
- 検索結果: 各行ボタン (名前 + `@handle` + "申請") → `friendshipRepository.createFriendship(.init(receiverId: user.id))` → 成功で `onChanged()` + close。
- 招待リンク: `myInviteCode` (from `me`) で `"\(APPUrl)/friends/add/\(code)"` を表示 + 「リンクをコピー」(`UIPasteboard`)。
- Field「招待リンクで追加」(Input) + footer「追加」(primary, `disabled = invite.isEmpty`) → `createFriendship(.init(receiverInviteCode: parseInviteCode(invite)))` → 成功で close。
- `parseInviteCode` は `RoomInviteCode.parse` と同一ロジック (末尾コード抽出)。

### 14. AddFriendByInviteCodeView (招待着地 `AddFriendByInviteCode.tsx` 忠実)

```swift
struct AddFriendByInviteCodeView: View {
    let inviteCode: String
    @Environment(AppEnvironment.self) private var environment
    @Environment(AppRouter.self) private var router
    @State private var errorText: String?
}
```

- `.task { do { try await environment.friendshipRepository.createFriendship(.init(receiverInviteCode: inviteCode)); router.friendsPath = NavigationPath() } catch { errorText = ... } }` (Web は成功で `/friends` replace)。
- `Panel(errorText ?? "友達申請を送信しています...")` + 失敗時のみ `AtenderButton("友達へ戻る"){ router.friendsPath = NavigationPath() }`。

### 15. TemplatesView (`routes/Templates.tsx` 忠実)

```swift
struct TemplatesView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var schoolId = ""
    @State private var departmentId = ""
    @State private var query = ""
    @State private var semesterId = ""
    @State private var templates: [TemplateDto] = []
    @State private var semesters: [SemesterDto] = []
    @State private var currentTimetableId: String?     // 公開対象 (semesterId の自時間割)
    @State private var currentTitle = ""
    @State private var defaultSchoolId, defaultDepartmentId, defaultSemesterId: String?
    @State private var isPending = false
    @State private var toast: String?
}
```

- `PageTitle("みんなの時間割", subtitle:"共有テンプレ検索")`。
- フィルタ 4 つ (縦積み, Web `md:grid-cols-4` はモバイル縦): 「学校 ID」Input (既定 = me.schoolId) / 「学科 ID」Input (既定 = me.departmentId) / 「検索」Input / 「学期」Picker (semesters)。
- 検索: `.task(id: "\(schoolId)-\(departmentId)-\(query)")` (デバウンス 300ms) → `templateRepository.templates(.init(schoolId: schoolId空? default : schoolId, departmentId: 同, q: query.isEmpty ? nil : query, limit:20))` → `templates`。
- 「自分の時間割を公開」ボタン (`disabled = currentTimetableId==nil || isPending`) → `templateRepository.publishTimetable(id: currentTimetableId!, title: currentTitle)` → 成功トースト。`currentTimetableId` = `userTimetables` から `semesterId (or default)` 一致で解決。
- テンプレカード (`Panel`, 縦積み): `Text(template.title).font(.atenderXl).weight(.semibold)` + `"by @\(authorHandle)"` + `"copy x \(copyCount) / 更新: \(updatedAt.prefix(10))"` + `AtenderButton("コピー", variant:.primary, isEnabled: (semesterId空? defaultSemesterId!=nil : true)){ copy }`。
  - `copy` → `templateRepository.copyTemplate(id:template.id, .init(semesterId: semesterId.isEmpty ? defaultSemesterId! : semesterId))` → 成功トースト (Web は user-timetables/me invalidate のみ)。
  - `authorHandle` 純粋 `TemplateLogic.authorHandle(_:) -> String` = `author?.handle ?? authorName ?? authorUserId`。
  - ★ iOS `TemplateDto` に `author`/`authorName` フィールドがあるか要確認 (shared にはない)。無ければ `authorUserId` を表示にフォールバック (現行 iOS `TemplateDto` に準拠)。

#### テンプレ導線 (iOS 必須の最小追加)

Web の `/templates` は**どこからもリンクされない直リンク専用ルート** (grep で参照 0)。iOS は URL バーが無いため最小の着地導線が必須。設定タブ本体は Phase E のため、**Phase D スコープ内の RoomsView header に「みんなの時間割」テキストボタン** を置き `roomsPath.append(.templates)` で push する。これは「ルーム系から辿る導線 (指示で許可)」に該当し、タブは増やさない。Phase E で設定画面が出来たら設定側にも導線を足す (学校/学科ベースの時間割共有という意味的所属先)。

---

## 純粋ロジック (Reviewer が単体テスト、View 非依存)

`Features/Rooms/RoomLogic.swift` / `Features/Friends/FriendLogic.swift` / `Core/DeepLink.swift` に新規。

```swift
// === RoomCalendarLogic ===
enum RoomCalendarLogic {
    /// Web buildCalendarEvents 忠実。weeks 横断で meeting(dedup: occurrenceId) と roomEvent(dedup: seriesId+occurrenceDate) を CalendarEvent へ。
    /// meeting: color = courseColor ?? member.color ?? MemberColor(userId), subtitle = member 名, ownerId = userId, kind=.meeting
    /// roomEvent: color = sourceColor(source, authorColor), subtitle = author 名, ownerId = authorId, kind=.roomEvent, source=source
    ///   start/end は ISO → RoomEventTiming で (date, startMinute, endMinute) に変換
    /// 出力は (date asc, startMinute asc) 安定ソート。
    static func buildCalendarEvents(weeks: [RoomWeekDto]) -> [CalendarEvent]
    /// Web eventColor の roomEvent 分岐: GOOGLE_OAUTH→"#38bdf8", ICS_FILE/ICS_URL→"#94a3b8", それ以外→authorColor
    static func sourceColor(_ source: RoomEventSource, authorColor: String) -> String
}

// === RoomEventTiming ===
enum RoomEventTiming {
    /// ISO8601 datetime を JST(Asia/Tokyo) 壁時計で (yyyy-MM-dd, 分, 分) に分解。Web dayjs(local) 相当を JST 固定で決定化。
    static func timing(startISO: String, endISO: String) -> (date: String, startMinute: Int, endMinute: Int)
    static func format(_ iso: String, pattern: String) -> String   // preview の "M/d HH:mm" 用
    private static let jst: TimeZone   // Asia/Tokyo
}

// === RoomAvailability ===
enum RoomAvailability {
    struct Result: Equatable {
        let combined: [Int]                       // 各スロットの busy 人数 (18 要素)
        let perMember: [(userId: String, busy: [Bool])]
    }
    /// 9:00-18:00 / 30 分 = 18 スロット。event.ownerId == member.userId かつ
    /// event.startMinute < slot.end && event.endMinute > slot.start で busy。
    static func compute(members: [RoomWeekDto.Member], events: [CalendarEvent]) -> Result
    static let slotStartMin = 540, slotEndMin = 1080, slotStep = 30
}

// === RoomTimetableLogic ===
enum RoomTimetableLogic {
    static let defaultSlots: [DaySlotDto]         // Web DEFAULT_SLOTS 1..5 (540/640/780/880/980 起点, +90/+90/+90/+90/+90)
    static func resolveDaySlots(defaultSemesterId: String?, timetables: [UserTimetableDto]) -> [DaySlotDto]
    /// RoomWeekDto.meetings(date+startMinute/endMinute Double) を daySlots に照合し
    /// dow=((jsDay+6)%7)+1(1=Mon..7=Sun), startSlot=分を含む slot(なければ最初に endMinute 超えの slot),
    /// span=endMinute まで跨ぐ slot 数, dedup key=userId:courseId:dow:periodIndex,
    /// color=courseColor ?? member.color ?? "#F97316", subtitle=member 名, mergeKey=userId:courseId。
    static func buildEvents(week: RoomWeekDto, daySlots: [DaySlotDto]) -> [TimetableEventInput]
    static func displayDays(events: [TimetableEventInput]) -> [Int]   // {1..5} ∪ event.dayOfWeek, 昇順
}

// === RecurrencePresetLogic (Web recurrenceFormat.ts 忠実, UTC) ===
enum RecurrencePresetLogic {
    static func presetToRRule(_ preset: String, start: Date) -> String?
    static func recurrenceToText(_ rrule: String?, start: Date?) -> String
    static func currentPreset(_ rrule: String?, start: Date) -> String   // 逆引き ("none" fallback)
    static func presetLabel(_ preset: String, start: Date) -> String     // Picker 表示文言
}

// === FriendshipBuckets / FriendshipLogic ===
enum FriendshipBuckets {
    struct Buckets: Equatable { let received, sent, accepted, blocked: [FriendshipDto] }
    /// received = PENDING && receiver.id==meId
    /// sent     = PENDING && sender.id==meId
    /// accepted = ACCEPTED
    /// blocked  = BLOCKED && sender.id==meId
    static func split(_ list: [FriendshipDto], meId: String?) -> Buckets
}
enum FriendshipLogic {
    static func otherUser(_ f: FriendshipDto, meId: String?) -> FriendshipUserDto  // sender.id==meId ? receiver : sender
}

// === 共通 ===
enum RoomInviteCode { static func parse(_ raw: String) -> String }   // trim/split("/")/last
enum RoomCardLogic { static func upcomingLabel(start: String, title: String) -> String }  // "MM-DD HH:MM · title"
enum TemplateLogic { static func authorHandle(_ t: TemplateDto) -> String }

// === DeepLink === (§ナビゲーション参照)
enum DeepLink: Equatable { case roomJoin(code: String), friendAdd(code: String)
    static func parse(_ url: URL) -> DeepLink?
}
```

---

## データ層への追加 (Repository + endpoint + invalidation)

### 新規 Repository (`Core/Data/`)

すべて `@MainActor @Observable final class`, `init(client: APIClient, cache: QueryClient)`。GET はキャッシュ (`isStale`/`setData`)、mutation は `cache.invalidate(prefixes: invalidationTargets(for:))`。既存 `CourseRepository`/`PersonalEventRepository` と同型。

```swift
// RoomRepository.swift
func rooms(force: Bool = false) async throws -> [RoomSummaryDto]          // key .rooms()
func room(id: String, force: Bool = false) async throws -> RoomDto        // key .room(id)
func roomMembers(id: String, force: Bool = false) async throws -> [RoomMemberDto]  // key .roomMembers(id)
func roomWeek(id: String, weekStart: String, force: Bool = false) async throws -> RoomWeekDto
    // ★ 保存キーは per-weekStart: QueryKey(["rooms", id, "week", weekStart])。
    //   invalidation は prefix .roomWeek(id)=["rooms",id,"week"] が全 weekStart を stale 化 (hasPrefix)。
func createRoom(_ input: CreateRoomInput) async throws -> RoomDto          // inv .roomCreate
func updateRoom(id: String, _ input: UpdateRoomInput) async throws -> RoomDto   // inv .roomUpdate(id)
func joinRoom(inviteCode: String) async throws -> RoomDto                  // inv .roomJoin(<返り room.id>)
func leaveRoom(id: String) async throws                                    // inv .roomLeave(id)
func deleteRoom(id: String) async throws                                   // inv .roomDelete(id)
func removeMember(id: String, userId: String) async throws                 // inv .roomMemberRemove(id)  ★新規
func regenerateInvite(id: String) async throws -> RoomInviteResponse       // inv .roomUpdate(id) (room 再取得; Web は room のみ invalidate)

// RoomEventRepository.swift
func createRoomEvent(roomId: String, _ input: CreateRoomEventInput) async throws -> RoomEventDto  // inv .roomEvent(roomId)
// update/delete は RoomEventDetailSheet 未移植のため本 Phase では実装しない (Phase E/将来)

// FriendshipRepository.swift
func friendships(force: Bool = false) async throws -> [FriendshipDto]      // key .friendships()
func createFriendship(_ input: CreateFriendshipInput) async throws -> FriendshipDto  // inv .friendshipAdd
func action(_ action: String, id: String) async throws                    // accept/decline/cancel/block → POST /$id/$action, delete → DELETE /$id; inv .friendshipAction
func searchUsers(handle: String) async throws -> [UserSearchDto]          // key .usersSearch() (handle は都度 fetch。キャッシュは prefix ["users","search"])

// TemplateRepository.swift
func templates(_ query: TemplateSearchQuery, force: Bool = false) async throws -> [TemplateDto]  // key .templates() (prefix; query 別保存は QueryKey(["templates", <hash>]) でも可)
func copyTemplate(id: String, _ input: TemplateCopyInput) async throws -> UserTimetableDto        // inv .templateCopy  ★新規
func publishTimetable(id: String, title: String) async throws -> TemplateDto                       // inv なし (Web usePublishTimetable は invalidate しない)

// IcsImportRepository.swift
func upload(roomId: String, fileData: Data, filename: String) async throws -> IcsUploadResponse   // ★ multipart。inv .icsImport(roomId)
func preview(roomId: String, importId: String, force: Bool = false) async throws -> IcsImportPreview  // key .icsImportPreview
func commit(roomId: String, importId: String) async throws -> IcsImportCommitResult               // inv .icsImport(roomId)
```

- `AppEnvironment` に 5 repository を追加し init 配線 (既存 dayRepository/courseRepository と同様)。

### invalidation マトリクス追加 (`InvalidationMatrix.swift`)

`Mutation` enum に 2 case 追加し `invalidationTargets` を拡張:

| Mutation | 状態 | invalidate prefixes | Web hook 根拠 |
|---|---|---|---|
| `.roomMemberRemove(id)` | **新規** | `rooms`, `roomMembers(id)`, `room(id)` | useRemoveRoomMember |
| `.templateCopy` | **新規** | `user-timetables`, `me` | useCopyTemplate |
| `.roomCreate/.roomUpdate/.roomJoin/.roomLeave/.roomDelete/.roomEvent/.icsImport/.friendshipAction/.friendshipAdd` | 既存 (Phase A) | (現行のまま) | 既存一致確認済 |

- `regenerateInvite` は Web が `room` のみ invalidate。iOS は `.roomUpdate(id)` を流用すると `rooms` も無効化され過剰。厳密一致のため `.roomUpdate(id)` は使わず **`room(id)` のみ直接 invalidate** する専用 case か、`cache.invalidate(prefixes: [.room(id)])` を repository 内で直呼びする。→ `.roomRegenerateInvite(id)` case を足すか、repository 直呼びのいずれか。**repository 直呼び (`[.room(id)]`)** を採用 (matrix を汚さない)。
- iOS は「invalidate = stale フラグ、自動 refetch しない」方針 (Phase B/C 踏襲)。**mutation 後の反映は各 View/VM が明示 reload**:
  - RoomsView: create/join 成功 → `model.load(force:true)`。
  - RoomDetailView: settings 変更 → `onChanged` で room reload。
  - RoomCalendar: 予定追加/ICS commit 成功 → `reload()` (weeks 再取得)。
  - RoomTimetable: 週データは画面表示時 fetch。
  - FriendsView: 各 action 成功 → `load(force:true)`。
- **楽観更新なし** (Web もこれらは invalidation ベース、楽観は today CTA のみ)。`AttendanceOptimistic` は流用しない。

### multipart upload の追加 (`APIClient` / `APIEndpoint`)

現行 `APIClient` は JSON body のみ。ICS upload 用に multipart を追加:

```swift
extension APIClient {
    /// multipart/form-data で単一ファイルを送る。Bearer 付与・401 リフレッシュ・エラーデコードは既存 perform と共通化。
    func upload<T: Decodable>(path: String, fileData: Data, filename: String,
                             fieldName: String = "file", contentType: String = "text/calendar",
                             as type: T.Type) async throws -> T
}
```

- boundary `"Boundary-\(UUID().uuidString)"`、`Content-Type: multipart/form-data; boundary=...`、body に `--boundary\r\nContent-Disposition: form-data; name="file"; filename="<filename>"\r\nContent-Type: text/calendar\r\n\r\n<data>\r\n--boundary--\r\n`。
- `IcsUploadResponse` DTO を追加 (`Core/Models/DTOs.swift`):
  ```swift
  struct IcsUploadResponse: Codable, Equatable {
      struct ImportRef: Codable, Equatable { let id: String }
      let `import`: ImportRef
      let parsedCount: Int
      let dedup: Bool
  }
  ```
- endpoint パス: `POST /api/rooms/\(roomId)/ics-imports` (multipart)。`Endpoints` には multipart 用の別関数は不要 (path 直指定で `APIClient.upload` を呼ぶ)。ファイルは iOS `.fileImporter` の security-scoped URL から `Data(contentsOf:)` で読む (`startAccessingSecurityScopedResource` を忘れない)。5MB 超は 413 が返るので `errorText` に反映。

---

## 使用 DTO / Endpoint / Enum (Phase A resync 済・追加は明記分のみ)

**DTO** (`Core/Models/DTOs.swift`, すべて実装済): `RoomSummaryDto`(+UpcomingEvent), `RoomDto`, `RoomMemberDto`, `RoomEventDto`, `RoomWeekDto`(+Member/Meeting), `CreateRoomInput`, `UpdateRoomInput`, `CreateRoomEventInput`(+Recurrence), `UpdateRoomEventInput`, `FriendshipDto`, `FriendshipUserDto`, `CreateFriendshipInput`, `UserSearchDto`, `TemplateDto`, `TemplateSearchQuery`, `TemplateCopyInput`, `TemplatePublishInput`, `IcsImportDto`, `IcsImportPreview`(+Item), `IcsImportCommitResult`, 各 Response wrapper (`RoomsResponse`/`RoomResponse`/`RoomMembersResponse`/`RoomInviteResponse`/`RoomEventResponse`/`RoomEventsResponse`/`IcsImportsResponse`/`TemplatesResponse`/`TemplateResponse`/`FriendshipsResponse`/`FriendshipResponse`/`UsersSearchResponse`/`UserTimetableResponse`)。
**追加 DTO (本 Phase)**: `IcsUploadResponse` のみ。

**Endpoint** (`Endpoints`, 実装済): `rooms`/`createRoom`/`room`/`updateRoom`/`deleteRoom`/`joinRoom`/`leaveRoom`/`roomMembers`/`roomWeek`/`roomEvents`/`createRoomEvent`/`updateRoomEvent`/`deleteRoomEvent`/`icsImports`/`icsImportPreview`/`commitIcsImport`/`friendships`/`createFriendship`/`friendshipAction`/`deleteFriendship`/`searchUsers`/`templates`/`copyTemplate`/`publishAsTemplate`。
**追加 (本 Phase)**: ICS upload は `APIClient.upload(path:)` 直呼び (path 直書き)、`removeMember` の DELETE `/api/rooms/{id}/members/{userId}` (無ければ `Endpoints.removeRoomMember(id:userId:)` 追加)。

**Enum** (`Core/Models/Enums.swift`, 実装済): `RoomRole`(owner/member), `FriendshipStatus`(pending/accepted/declined/blocked), `RoomEventSource`(manual/icsFile/icsUrl/googleOauth/unknown), `VisibilityMode`(normal/titleMapped/busyOnly)。
**追加 (本 Phase)**: `CalendarEventKind` に `.roomEvent`。`Mutation` に `.roomMemberRemove(id)` / `.templateCopy`。

---

## 挙動仕様 (Reviewer テスト生成の根拠)

### RoomCalendarLogic.buildCalendarEvents

- meeting は `occurrenceId` で dedup (weeks が重複範囲でも 1 件)。roomEvent は `seriesId + occurrenceDate` で dedup。
- meeting: `color = courseColor ?? member.color ?? MemberColor.memberColor(userId)`、`subtitle = member.name ?? handle ?? "No name"`、`ownerId = userId`、`kind == .meeting`。
- roomEvent GOOGLE_OAUTH → `color == "#38bdf8"`、ICS_FILE/ICS_URL → `"#94a3b8"`、MANUAL/unknown → `authorColor`。`ownerId = authorId`、`kind == .roomEvent`、`source` セット。
- 出力は `(date asc, startMinute asc)`。空 weeks → `[]`。member 不明 (members に無い userId) → 名前 "No name"、色 fallback。

### RoomEventTiming.timing

- `startISO="2026-07-01T09:00:00.000Z"` (UTC) → JST で `date="2026-07-01", startMinute=1080` (18:00) となる。★ Web は端末 local(=JST) で分解するため、この JST 固定は JP 前提で Web と一致。テスト fixture は JST 期待値で書く (gotcha `api-test-date-fixtures-must-match-production-normalization`)。
- `+09:00` オフセット付き ISO も同じ壁時計分に分解。

### RoomAvailability.compute

- 18 スロット (9:00–18:00, 30 分)。event が `ownerId==member.userId` かつ `startMinute < slotEnd && endMinute > slotStart` の全スロットを busy。
- `combined[i]` = そのスロットで busy なメンバー人数。`perMember[m].busy[i]` = そのメンバーが busy か。
- members 空 → combined 全 0。ownerId nil のイベントは無視。

### RoomTimetableLogic.buildEvents

- `dow = ((jsWeekday+6)%7)+1`: 日曜(0)→7, 月(1)→1, 土(6)→6。
- startSlot = `startMinute >= s.startMinute && startMinute < s.endMinute` の slot。無ければ `startMinute < s.endMinute` の最初の slot。両方無ければ skip。
- `span` = startSlot 以降で `s.startMinute < endMinute` を満たす連続 slot 数 (最低 1)。
- dedup key `userId:courseId:dow:periodIndex` (週内重複を 1 件に集約)。
- `color = courseColor ?? member.color ?? "#F97316"`、`subtitle = member 名`、`mergeKey = userId:courseId`。
- `displayDays` = `{1,2,3,4,5}` に event の dow を足して昇順ユニーク。
- ★ `RoomWeekDto.Meeting.startMinute/endMinute` は iOS で `Double` → `Int(startMinute)` 化して比較。

### RecurrencePresetLogic (UTC)

- `presetToRRule("weekly", start: 2026-07-01(水))` → `"FREQ=WEEKLY;BYDAY=WE"`。`"weekday"` → `"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"`。`"monthly_bymonthday"` → `"FREQ=MONTHLY;BYMONTHDAY=1"`。`"monthly_byday"` (7/1 = 第1水) → `"FREQ=MONTHLY;BYDAY=1WE"`。`"yearly"` → `"FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=1"`。`"daily"` → `"FREQ=DAILY"`。`"none"/未知` → `nil`。
- `recurrenceToText("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", _)` → `"平日のみ"`。`"FREQ=DAILY"` → `"毎日"`。`nil` → `"繰り返しなし"`。
- `currentPreset`: rrule が presetToRRule のいずれかと一致すれば該当 preset、無ければ `"none"`。

### FriendshipBuckets.split

- `received`: PENDING かつ receiver.id==meId。`sent`: PENDING かつ sender.id==meId。`accepted`: ACCEPTED 全部。`blocked`: BLOCKED かつ sender.id==meId (自分がブロックした側のみ)。
- meId nil → 全バケット空 (受信/送信判定不能)。DECLINED はどのバケットにも入らない。

### DeepLink.parse

- `https://atender.appily.run/rooms/join/ABC` → `.roomJoin("ABC")`。`atender://rooms/join/ABC` → `.roomJoin("ABC")`。`.../friends/add/XYZ` → `.friendAdd("XYZ")`。`https://atender.appily.run/` や未知 path → `nil`。末尾スラッシュ/クエリ付きも許容 (path の連続 3 要素で判定)。

### 画面操作 (統合・XCUITest 観点と重複可)

- **Rooms**: 空 → EmptyState「まだルームに参加していません」。作成シートで名前入力 → 作成 → 一覧に出現。参加シートでコード → 参加成功で RoomDetail へ push。
- **RoomDetail**: 歯車 → 設定シート。トグルで calendar⇄timetable 切替。
- **RoomCalendar**: 既定 day。segmented で month/week/day 切替。AvailabilityBar 開閉でメンバー別バー表示。FAB「+」→ 予定追加シート、「↓」→ ICS ウィザード。予定追加成功でカレンダーに反映 (weeks 再取得)。month のみ FAB 非表示・下部に RoomDayEventList。
- **RoomTimetable**: メンバー色で授業描画。メンバー 0 → 「メンバーがいません」、メンバーあり授業 0 → 「メンバーの時間割がまだありません」。
- **RoomSettings**: owner のみ名前/説明/トグル編集・追放・削除・招待再発行。非 owner は退出のみ、入力 disabled。招待リンクコピーで「コピーしました」。
- **ICS ウィザード**: ファイル選択 → preview (N 件 + 先頭 10) → 取り込む → done (committed/skipped)。5MB 超/パース失敗 → error バナー + 戻る。
- **Friends**: 受信申請「承認/拒否」、送信「取消」、友達「ブロック/解除」、ブロック中「解除」。各 action 後リスト即更新。ハンドル検索 (デバウンス) → 結果 tap で申請。招待リンクコピー。
- **Templates**: 学校/学科/検索/学期フィルタ → 一覧。コピー → 成功トースト。公開 → 成功トースト。
- **ディープリンク**: `atender://rooms/join/<code>` 起動 → ルームタブ + JoinRoomView 着地 → 成功で RoomDetail。`.../friends/add/<code>` → 友達タブ + 申請着地 → `/friends` 相当へ。
- **異常系**: mutation 失敗 → `environment.toastCenter.show("保存できませんでした、もう一度試してください")` 相当、状態は変えず reload で復元。招待コード無効 (410/404) → 着地画面でエラー表示 + 戻るボタン。

---

## テスト基盤

- **ユニット (純粋ロジック)**: XCTest。`apps/ios/AtenderTests/` に:
  - `RoomLogicTests.swift`: RoomCalendarLogic (dedup/色/ソート) / RoomEventTiming (JST 分解) / RoomAvailability (busy 行列) / RoomTimetableLogic (dow・startSlot・span・dedup・displayDays) / RecurrencePresetLogic (preset⇄RRULE・text) / RoomInviteCode / RoomCardLogic / TemplateLogic。
  - `FriendLogicTests.swift`: FriendshipBuckets.split (4 バケット + meId nil) / FriendshipLogic.otherUser。
  - `DeepLinkTests.swift`: parse (Universal Link / custom scheme / 未知)。
  - `InvalidationMatrixTests.swift`: `.roomMemberRemove` / `.templateCopy` の targets 集合一致を追加検証 (既存テストに追随)。
- **配置**: 既存 xcodegen `project.yml` のテストターゲット。新規ファイルを同ターゲットに追加。
- 日付 fixture は本番 JST 正規化に合わせる (gotcha `api-test-date-fixtures-must-match-production-normalization`)。`CalendarRange` は UTC 固定なので日付比較は決定的。RoomEventTiming は JST 固定なので期待値も JST。
- **XCUITest / シミュレータ観点** (視覚は目視):
  - RoomsView: 空 EmptyState / 一覧グリッド / 作成→参加→push。`accessibilityIdentifier`: `rooms-list` / `room-card-<id>` / `room-create-sheet` / `join-by-code-sheet`。
  - RoomDetail: `room-detail-tabs` / `room-settings-sheet`。calendar⇄timetable トグル。
  - RoomCalendar: `room-calendar` / `availability-bar` / `room-fab-event` / `room-fab-ics`。segmented 切替でグリッド差替。
  - RoomTimetable: `room-timetable` メンバー色描画 (seed で複数メンバー時間割)。
  - IcsImportWizard: `ics-wizard` upload→preview→commit の 3 ステップ (seed .ics fixture)。
  - Friends: `friends-list` / `friend-card-<id>` / `add-friend-sheet`。バケット振り分け。
  - Templates: `templates-list` / `template-card-<id>`。コピー/公開トースト。
  - ディープリンク: `xcrun simctl openurl booted "atender://rooms/join/<seedCode>"` で着地→参加を検証。
  - ログインは `ATENDER_UI_TEST_BEARER_TOKEN` 経由。スクショ比較は iOS シミュレータ (`xcrun simctl` / XCUITest snapshot)、chrome-devtools MCP は使わない。
  - **jsdom 相当の制約**: color-mix 近似 (opacity over bgElevated)・グラデ tint は自動ピクセル検証せず目視とする旨を Reviewer に明記。

---

## 不採用案 / スコープ外

- **RoomEventDetailSheet の移植**: 却下。Web で定義のみ・どこからも呼ばれない孤児 (grep 参照 0)。ルーム予定の編集/削除導線は Web に存在しないため写さない (忠実移植 = 無いものは作らない)。
- **RoomCalendar 用に別イベント型を新設**: 却下。既存 `CalendarEvent` に `ownerId`/`source`/`.roomEvent` を後方互換追加し、CalendarMonth/Week/Day/EventTile をそのまま再利用する (重複定義しない)。
- **CalendarDay の "自分" ハードコード維持**: 却下。`event.subtitle` 参照へ一般化 (PersonalCalendar は subtitle="自分" で表示不変、Room はメンバー名)。
- **RoomDayEventList の色を meeting=memberColor/roomEvent=authorColor に厳密分離**: 却下 (軽微)。`event.color` (ソース考慮済) に統一。差は ICS/Google 予定色のみで目視許容。厳密再現が要れば `rawColor` フィールドを足すが本 Phase では不要。
- **RoomEventTiming を端末 tz で分解 (Web dayjs 相当)**: 却下。JP 前提で **JST 固定**にしテスト決定性を確保 (端末 tz 依存の非決定性を避ける)。
- **AvailabilityBar/空き時間をサーバ集計**: スコープ外。Web 同様 **クライアント集計** (単一 week endpoint の raw を合成)。pattern `minimal-social-layer-friend-room` §4 準拠。
- **Google Calendar 連携 (RoomGoogleSyncSection / `/settings/calendar` push / TitleRuleEditor)**: **Phase E**。RoomSettingsSheet から該当セクション/ボタンを除外 (ICS 取込は Phase D で残す)。
- **設定タブ本体 (SettingsView 全面 / ProfileEditSheet 等)**: **Phase E**。テンプレ導線は Phase D スコープの RoomsView から出す (設定側導線は Phase E で追加)。
- **テンプレを独立タブ化**: 却下。ボトムタブ 5 項目不変。Web 同様タブを増やさず push で辿る。
- **RoomEvent の update/delete Repository**: 本 Phase 未実装 (DetailSheet が無いため呼び元なし)。将来編集導線を作る Phase で追加。
- **自動 refetch (staleTime/refetchOnMount)**: スコープ外。Phase B/C 同様「invalidate=stale フラグ + View 明示 reload」に統一。

## 参考 knowledge

`pattern/minimal-social-layer-friend-room` (Friendship/Room モデル・招待リンク・空き時間クライアント集計・status code), `pattern/ics-import-hash-dedup-preview-commit` (2-phase preview/commit・contentHash dedup), `pattern/swiftui-tanstack-query-port-invalidation-cache` (invalidation 移植), `pattern/tanstack-query-invalidation-matrix`, `pattern/calendar-week-pattern-meeting-expansion`, `gotcha/swiftui-multiple-sibling-sheets-only-one-fires` (単一シート集約), `gotcha/design-doc-must-specify-swift-type-signatures`, `gotcha/api-test-date-fixtures-must-match-production-normalization`, `projects/atender/.knowledge/personal-calendar-data-source-meeting-expansion`。
</content>
</invoke>
