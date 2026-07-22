# ホーム画面レイアウト刷新 — 折りたたみドロワー + 出欠 FAB

## 目的 (1-3行)

現ホームは 学期選択 / ルーム選択 / 時間割・カレンダー切替 / 出欠タイル が全部固定表示で初見の情報量が多く時間割が狭い。「開いた瞬間シンプル & 時間割フル、多機能は必要時に呼び出す」へ再構成する。学期+ルーム選択を**上端グラバー付きドロワー**に畳み、出欠を**右下フローティング「^」FAB + せり上がりパネル**に置き換え、時間割/カレンダーグリッドを画面の大半に広げる。

> **地位**: これは個別画面の実装フェーズ設計。視覚言語の正典は `DESIGN.md`。本 doc は §3.7.1 (switcher/segmented をコンテンツ先頭に並べる) から**意図的に逸脱**する — 逸脱の理由と DESIGN.md 更新提案は §「DESIGN.md との関係」に記す (Touri 承認済の方向)。

---

## UI/UX

### 全体レイアウト (self コンテキスト / timetable)

```
┌───────────────────────────────┐
│  ホーム                    ⚙︎  │  ← nav bar (inline title + 歯車 trailing)。既存踏襲・変更なし
├───────────────────────────────┤
│            ▬▬▬                │  ← ★ HomeTopBar: グラバー (常時表示・drag/tap でドロワー開閉)
│      [ 時間割 | カレンダー ]    │  ← segmented (小さく上部に残す)
├───────────────────────────────┤
│                               │
│                               │
│      時間割グリッド (フル)      │  ← HomeBody。画面の大半
│                               │
│                               │
│                          ╭─╮  │  ← ★ AttendanceFab「^」(右下、未記録なし=これだけ)
│                          │^│  │
│                          ╰─╯  │
└───────────────────────────────┘
   ▼ タブバー (native Liquid Glass・変更なし)
```

### ドロワー展開時 (グラバーを下スワイプ / タップ)

```
┌───────────────────────────────┐
│  ホーム                    ⚙︎  │
├───────────────────────────────┤
│            ▬▬▬                │  ← グラバー (drag up / tap で畳む)
│      [ 時間割 | カレンダー ]    │
├───────────────────────────────┤
│  2026 前期  ▾                 │  ← ★ HomeDrawerPanel: SemesterMenu (self時のみ)
│  [自分] [3F実習室] [教養] ＋    │  ← ContextChips (rooms 非空時)
├───────────────────────────────┤
│░░░░░░░ scrim (dim + tap で畳む)░│  ← 半透明スクリム。下の時間割を薄暗く
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└───────────────────────────────┘
```

### 出欠パネル展開時 (未記録あり = 既定展開 / 「^」タップ)

```
┌───────────────────────────────┐
│      時間割グリッド            │  ← グリッドはそのまま (scrim なし・薄く見える)
│                               │
├───────────────────────────────┤
│            ▬▬▬                │  ← ★ AttendancePanel: グラバー (drag down / tap で畳む)
│  次の授業 · 3限 英語 13:00     │  ← now/next 行 (NowNextText 再利用)
│  [ 今日は全出席 (3) ]  ▾       │  ← 一括 CTA (menu 付き)
│  ─────────────────────────    │
│  1限 数学     [出][欠][公]...  │  ← 授業ごとの出欠タイル (TodayAttendanceSheet 再利用)
│  2限 情報     [出][欠][公]...  │  ← 多い場合パネル内 ScrollView
└───────────────────────────────┘
   ▼ タブバー
```

### コンポーネント構成 (新旧マップ)

| 役割 | 旧 (現状) | 新 |
|---|---|---|
| 学期選択 | `SemesterMenu` を VStack 先頭に固定 | `HomeDrawerPanel` 内に移設 (self時のみ) |
| ルーム選択 | `ContextChips` を VStack 2 番目に固定 | `HomeDrawerPanel` 内に移設 (rooms非空時) |
| 時間割/カレンダー切替 | `Picker(.segmented)` を VStack 3 番目 | `HomeTopBar` 内に残す (小さく上部) |
| グリッド | `GeometryReader{HomeBody}` | 変更なし。上に空く分だけフル化 |
| 出欠 | `.safeAreaInset(.bottom){NowNextBarHost}` (固定バー) | `AttendanceFab`(collapsed) / `AttendancePanel`(expanded) を overlay |
| 歯車 (時間割設定) | toolbar trailing | 変更なし |

**新規 View**:
- `HomeTopBar` — グラバー帯 + segmented。ドロワーの drag 検知帯を**兼ねる** (帯はグリッドの外)。
- `HomeDrawerPanel` — SemesterMenu + ContextChips を内包。ドロワー展開時に上からせり出す。
- `AttendanceFab` — 「^」円形 FAB (collapsed 状態)。
- `AttendancePanel` — now/next + 一括CTA + 出欠タイル。せり上がり (expanded 状態)。
- `HomeAttendanceOverlay` — 上 2 つを状態で出し分け、`SelfTodayViewModel` + `TimelineView(.everyMinute)` を所有。

**再利用 (流用可)**:
- グラバー意匠: `Capsule().fill(Color.borderEmphasis).frame(width: 42, height: 5)` (`BottomSheet.sheetChrome` と同一)。
- 出欠タイル本体: `TodayAttendanceSheet(occurrences:onChangeStatus:)` を `AttendancePanel` の ScrollView 本体としてそのまま埋め込む (開き方だけ native `.sheet` → in-place overlay に変える)。
- 高さ実測 PreferenceKey パターン (`BottomSheet` の `SheetContentHeightKey` 方式) — `HomeDrawerPanel` の自然高測定に踏襲。

**流用不可**:
- `BottomSheet` 本体 (`Color.clear` + native `.sheet`) は下端専用・self-presenting。ドロワー/パネルは**カスタム overlay で作る** (§不採用案)。

### 状態管理 (どこに何の state が乗るか)

| state | 所有者 | 型/既定 | 備考 |
|---|---|---|---|
| `context` | `HomeView` | `HomeContext = .self` | 既存。ContextChips が変更 |
| `mode` | `HomeView` | `HomeViewMode = .timetable` | 既存。segmented が変更 |
| `semesterId` / `rooms` / `semesters` | `HomeView` | 既存 | 変更なし |
| **`drawerExpanded`** | `HomeView` | `@State Bool = false` | **新規**。ドロワー開閉。default 畳 |
| `showTimetableSettings` | `HomeView` | 既存 | 歯車。変更なし |
| **`viewModel` (SelfTodayViewModel)** | `HomeAttendanceOverlay` | `@State ...? = nil` | **移設** (旧 `NowNextBarHost` 内)。Home へは上げない (§設計判断) |
| **`attendanceExpanded`** | `HomeAttendanceOverlay` | `@State Bool = false` | **新規**。出欠パネル開閉 |
| **`didApplyDefault`** | `HomeAttendanceOverlay` | `@State Bool = false` | **新規**。既定展開を「その日 1 回だけ」適用するガード |

**★ today VM を Home に上げない設計判断**: 既定展開は `AttendanceSummary.unrecordedCount` から算出でき、その判定に必要な `occurrences` は `SelfTodayViewModel` が持つ。Home 直下で他に today データを要する要素は無いので、VM は `HomeAttendanceOverlay` 内に閉じたまま (旧 `NowNextBarHost` と同じ所有形) で既定展開を決める。Home へ上げる案は churn だけ増え利得が無いため不採用 (§不採用案)。

---

## データモデル

新規の永続データ・DTO 変更は**無い**。既存を参照するのみ。

```swift
// 既存 (Core/Models/DTOs.swift) — 参照のみ
struct TodayResponse: Codable, Equatable { let date: String; var occurrences: [OccurrenceDto] }
struct OccurrenceDto: Codable, Equatable, Identifiable {
    let id: String; /* ... */ let periodIndex: Int
    let startMinute: Int; let endMinute: Int
    var status: AttendanceStatus?      // nil = 未記録
}
struct RoomSummaryDto: Codable, Equatable, Identifiable { let id: String; let name: String; /* ... */ }

// 既存 (Core/Timetable/TodayTimeline.swift) — 参照のみ
enum AttendanceSummary { static func unrecordedCount(_ occurrences: [OccurrenceDto]) -> Int }   // status == nil の件数
enum NowNextText { static func statusLabel(_:)->String?; title(_:)->String?; detail(_:)->String? }
enum TodayTimeline { static func state(occurrences:nowMinute:) -> TodayState }
```

### 新規の純ロジック型 (テスト対象)

```swift
// ── ドロワー開閉ロジック (新規ファイル HomeTopDrawer.swift、internal) ──
enum HomeDrawerSection: Equatable { case semester, contextChips }

enum HomeDrawer {
    static let dragThreshold: CGFloat = 40   // pt。この距離を超えた drag で状態が変わる

    /// ドロワーに表示するセクション。self は学期+chips、room は chips のみ。
    /// chips は rooms が空なら出さない (self でルーム未参加時)。room 文脈では hasRooms は常に true。
    static func sections(context: HomeContext, hasRooms: Bool) -> [HomeDrawerSection] {
        var result: [HomeDrawerSection] = []
        if context == .self { result.append(.semester) }
        if hasRooms { result.append(.contextChips) }
        return result
    }

    /// グラバー帯で完了した drag から、次の開閉状態を決める (純関数)。
    /// - 横優位の drag (abs(width) >= abs(height)) は無視し現状維持 (calendar 月送り誤爆防止)。
    /// - 畳んでいて下方向に閾値超え → 開く。開いていて上方向に閾値超え → 畳む。それ以外は現状維持。
    static func resolve(isExpanded: Bool, translationHeight: CGFloat, translationWidth: CGFloat) -> Bool {
        guard abs(translationHeight) > abs(translationWidth) else { return isExpanded }
        if !isExpanded, translationHeight > dragThreshold { return true }
        if isExpanded, translationHeight < -dragThreshold { return false }
        return isExpanded
    }

    /// タップは開閉トグル。
    static func toggled(_ isExpanded: Bool) -> Bool { !isExpanded }
}

// ── 出欠 FAB/パネルロジック (新規ファイル HomeAttendanceOverlay.swift、internal) ──
enum HomeAttendance {
    static let dragThreshold: CGFloat = 40

    /// 出欠アフォーダンス (FAB/パネル) を出すか。授業が 1 件も無ければ出さない。
    static func isActive(occurrences: [OccurrenceDto]) -> Bool { !occurrences.isEmpty }

    /// その日の today ロード時の初期展開状態。記録すべきものがあれば展開。
    /// (授業なし=空 と 全記録済み=unrecorded 0 を区別。空/全済みは畳)
    static func defaultExpanded(occurrences: [OccurrenceDto]) -> Bool {
        !occurrences.isEmpty && AttendanceSummary.unrecordedCount(occurrences) > 0
    }

    /// パネルのグラバー帯で完了した drag が「畳む」に該当するか (下方向・縦優位・閾値超え)。
    static func shouldCollapse(translationHeight: CGFloat, translationWidth: CGFloat) -> Bool {
        abs(translationHeight) > abs(translationWidth) && translationHeight > dragThreshold
    }
}
```

---

## API / 関数シグネチャ

### HomeView (HomeCore.swift 改修) — body 再構成

```swift
struct HomeView: View {
    // 既存 state + @State private var drawerExpanded = false を追加

    var body: some View {
        ZStack(alignment: .top) {
            // 層1: 常時表示のメインコンテンツ (top bar + グリッド)
            VStack(spacing: 0) {
                HomeTopBar(
                    mode: $mode,
                    isDrawerExpanded: $drawerExpanded
                )
                GeometryReader { proxy in
                    HomeBody(context: context, mode: mode,
                             semesterId: $semesterId,
                             showTimetableSettings: $showTimetableSettings,
                             available: proxy.size.height)
                }
                .frame(maxHeight: .infinity)
            }

            // 層2: ドロワー scrim (展開時のみ・タップで畳む)
            if drawerExpanded {
                Color.black.opacity(0.12).ignoresSafeArea()
                    .transition(.opacity)
                    .onTapGesture { withAnimation(Anim.drawer) { drawerExpanded = false } }
            }

            // 層3: ドロワーパネル (展開時のみ・上からせり出す)
            if drawerExpanded {
                HomeDrawerPanel(
                    sections: HomeDrawer.sections(context: context, hasRooms: HomeChips.isVisible(rooms: rooms)),
                    semesters: semesters, semesterId: $semesterId,
                    chipItems: HomeChips.items(rooms: rooms), context: context,
                    onSelectContext: { context = $0 },
                    onAddRoom: { environment.appRouter.selectedTab = .rooms }
                )
                .offset(y: topBarHeight)          // top bar の直下に置く
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.horizontal, Space.pagePxMobile)
        .navigationTitle("ホーム")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { /* 既存の歯車 (self && timetable 時) をそのまま */ }
        // 出欠 FAB のためのグリッド下端クリアランス (self 文脈では常に 64pt 予約・レイアウトジャンプ防止)
        .safeAreaInset(edge: .bottom) {
            if context == .self { Color.clear.frame(height: 64) }
        }
        // 出欠アフォーダンス (collapsed FAB / expanded panel を内部で出し分け)
        .overlay(alignment: .bottom) {
            if context == .self { HomeAttendanceOverlay() }
        }
        .task { /* 既存の rooms/semesters ロードをそのまま */ }
    }

    private var topBarHeight: CGFloat { 76 }   // グラバー帯(36) + segmented(~36) + spacing(4)
}
```

- `Anim.drawer` / `Anim.attendance` は `.spring(response: 0.35, dampingFraction: 0.86)` を指す定数 (実装は inline literal でよい。逐語一致は要求しない)。
- **★ 重要**: 出欠 overlay/パネルは `.overlay` を **HomeView 直下の ZStack (viewport 固定)** に付ける。グリッドの `ScrollView` の**内側に付けない** (付けるとスクロールで FAB が流れる — architect note §39 の再発防止)。

### HomeTopBar (新規)

```swift
struct HomeTopBar: View {
    @Binding var mode: HomeViewMode
    @Binding var isDrawerExpanded: Bool
    @GestureState private var dragH: CGFloat = 0   // 任意 (rubber-band 用・状態決定には使わない)

    var body: some View {
        VStack(spacing: Space.s1) {
            grabberBand          // 高さ36。tap + drag で isDrawerExpanded を変更
            segmented            // 既存 Picker(.segmented)、frame(maxWidth:.infinity)
        }
    }

    private var grabberBand: some View {
        Capsule().fill(Color.borderEmphasis).frame(width: 42, height: 5)
            .frame(maxWidth: .infinity, minHeight: 36)   // hit area >= 44pt (帯全幅×36 + 上 nav 余白)
            .contentShape(Rectangle())
            .accessibilityIdentifier("home-drawer-grabber")
            .accessibilityAddTraits(.isButton)
            .onTapGesture {
                withAnimation(Anim.drawer) { isDrawerExpanded = HomeDrawer.toggled(isDrawerExpanded) }
            }
            .gesture(
                DragGesture(minimumDistance: 10)
                    .onEnded { v in
                        let next = HomeDrawer.resolve(isExpanded: isDrawerExpanded,
                                                      translationHeight: v.translation.height,
                                                      translationWidth: v.translation.width)
                        withAnimation(Anim.drawer) { isDrawerExpanded = next }
                    }
            )
    }
}
```

### HomeDrawerPanel (新規)

```swift
struct HomeDrawerPanel: View {
    let sections: [HomeDrawerSection]
    let semesters: [SemesterDto]
    @Binding var semesterId: String?
    let chipItems: [ContextChipItem]
    let context: HomeContext
    let onSelectContext: (HomeContext) -> Void
    let onAddRoom: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            ForEach(sections, id: \.self) { section in
                switch section {
                case .semester:      SemesterMenu(semesters: semesters, semesterId: $semesterId)
                case .contextChips:  ContextChips(items: chipItems, selected: context,
                                                  onChange: onSelectContext, onAddRoom: onAddRoom)
                }
            }
        }
        .padding(Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .atenderGlass(in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))   // 下角丸 24
    }
}
```

`SemesterMenu` / `ContextChips` / `HomeChips` は現状のまま (HomeCore.swift に残置)。renderer が VStack 直下からドロワー内へ移るだけで、これらの struct と `HomeChips` の純ロジックは**変更しない** (既存 `HomeChipsTests` を割らない)。

### HomeAttendanceOverlay (新規) — 旧 NowNextBarHost の置換

```swift
struct HomeAttendanceOverlay: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: SelfTodayViewModel?
    @State private var expanded = false
    @State private var didApplyDefault = false

    var body: some View {
        TimelineView(.everyMinute) { context in
            let occ = viewModel?.occurrences ?? []
            Group {
                if HomeAttendance.isActive(occurrences: occ) {
                    if expanded {
                        AttendancePanel(
                            state: TodayTimeline.state(occurrences: occ, nowMinute: SchoolClock.nowMinute(context.date)),
                            occurrences: occ,
                            unrecordedCount: AttendanceSummary.unrecordedCount(occ),
                            pending: viewModel?.pending ?? false,
                            onMarkAllPresent: { Task { await viewModel?.markAll(.present) } },
                            onMarkAll: { s in Task { await viewModel?.markAll(s) } },
                            onChangeStatus: { id, s in Task { await viewModel?.patch(id, status: s) } },
                            onCollapse: { withAnimation(Anim.attendance) { expanded = false } }
                        )
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    } else {
                        AttendanceFab { withAnimation(Anim.attendance) { expanded = true } }
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .padding(.trailing, Space.s5).padding(.bottom, Space.s5)
                    }
                }
            }
            .task(id: SchoolClock.todayString(context.date)) {
                if viewModel == nil { viewModel = SelfTodayViewModel(environment: environment) }
                if TodayTimeline.isStale(loadedDate: viewModel?.today?.date, now: context.date) {
                    await viewModel?.load()
                }
            }
            .onChange(of: viewModel?.today?.date) { _, newDate in
                guard newDate != nil else { return }
                // その日のデータが (再) ロードされた時だけ既定展開を適用。以後の手動開閉は保持。
                expanded = HomeAttendance.defaultExpanded(occurrences: viewModel?.occurrences ?? [])
                didApplyDefault = true
            }
        }
    }
}
```

### AttendanceFab (新規)

```swift
struct AttendanceFab: View {
    let onTap: () -> Void
    var body: some View {
        Button(action: onTap) {
            Image(systemName: "chevron.up")
                .font(.atenderBase).fontWeight(.bold)
                .foregroundStyle(Color.textPrimary)
                .frame(width: 56, height: 56)
                .background(Color.bgElevated)
                .clipShape(Circle())
                .atenderShadow(.card)              // 既存 room FAB と同じ質感
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("cta-expand-toggle")   // UITest 依存の identifier を維持
        .accessibilityLabel("出欠を開く")
    }
}
```

### AttendancePanel (新規)

```swift
struct AttendancePanel: View {
    let state: TodayState
    let occurrences: [OccurrenceDto]
    let unrecordedCount: Int
    let pending: Bool
    let onMarkAllPresent: () -> Void
    let onMarkAll: (AttendanceStatus) -> Void
    let onChangeStatus: (String, AttendanceStatus) -> Void
    let onCollapse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            grabber                                  // drag down / tap で onCollapse
            nowNextLine                              // NowNextText.statusLabel/title/detail (state==.noClass は起きない)
            markAllCTA                               // 「今日は全出席 (N)」borderedProminent + menu
            Divider()
            TodayAttendanceSheet(occurrences: occurrences, onChangeStatus: onChangeStatus)
                .frame(maxHeight: UIScreen.main.bounds.height * 0.5)   // 多授業時は内部 ScrollView
        }
        .padding(Space.s4)
        .atenderGlass(in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))   // 上角丸 24
        .padding(.horizontal, Space.s2)
    }

    private var grabber: some View {
        Capsule().fill(Color.borderEmphasis).frame(width: 42, height: 5)
            .frame(maxWidth: .infinity, minHeight: 28)
            .contentShape(Rectangle())
            .accessibilityIdentifier("attendance-panel-grabber")
            .onTapGesture { onCollapse() }
            .gesture(DragGesture(minimumDistance: 10).onEnded { v in
                if HomeAttendance.shouldCollapse(translationHeight: v.translation.height,
                                                 translationWidth: v.translation.width) { onCollapse() }
            })
    }
    // nowNextLine / markAllCTA は現 NowNextBar の該当部を移植 (longLabel を再利用)
}
```

- `TodayAttendanceSheet` は現状のまま (NowNextBar.swift に残置) 再利用。`.presentationDetents` 等の native sheet 装飾は overlay 化に伴い**呼ばない** (`AttendancePanel` が直接 body を埋め込む)。
- `NowNextBar.actionMenu` の一括 CTA (`borderedProminent` capsule「今日は全出席 (N)」+ menu で欠/公/遅/早) を `markAllCTA` として移植。`longLabel(_:)` は `private func` → **`private` を外して internal 化**し `AttendancePanel` から参照。

---

## 挙動仕様 (Reviewer はここからテスト生成)

曖昧表現なし。ジェスチャー/描画/アニメは実機・シミュレータ手動確認 (§テスト基盤で明記)。純ロジックは #番号で網羅。

### ドロワーのセクション構成 (`HomeDrawer.sections`)

- **#D1**: `context = .self`, `hasRooms = true` のとき → `[.semester, .contextChips]`。
- **#D2**: `context = .self`, `hasRooms = false` のとき → `[.semester]` (ルーム未参加時は chips 非表示、学期のみ)。
- **#D3**: `context = .room(roomId: "r1")`, `hasRooms = true` のとき → `[.contextChips]` (学期は self 概念なので出さない)。
- **#D4**: `context = .room(roomId: "r1")`, `hasRooms = false` のとき → `[]` (理論上のみ。実運用では room 文脈は必ず hasRooms=true)。

### ドロワー開閉ロジック (`HomeDrawer.resolve` / `toggled`)

- **#D5**: 畳 (`isExpanded=false`) + 下方向 drag 60pt (height=+60, width=0) → `true` (開く)。
- **#D6**: 畳 + 下方向 drag 30pt (height=+30) → `false` (閾値40未満、現状維持)。
- **#D7**: 開 (`isExpanded=true`) + 上方向 drag 60pt (height=-60) → `false` (畳む)。
- **#D8**: 開 + 上方向 drag 30pt (height=-30) → `true` (閾値未満、現状維持)。
- **#D9**: 畳 + 横優位 drag (height=+50, width=+120) → `false` (横優位は無視・現状維持。calendar 月送り誤爆防止)。★ これが Researcher 指摘のジェスチャー競合対策の核。
- **#D10**: 開 + 横優位 drag (height=-50, width=+120) → `true` (現状維持)。
- **#D11**: `toggled(false) == true`、`toggled(true) == false` (タップはトグル)。

### 出欠アフォーダンスの活性 (`HomeAttendance.isActive`)

- **#A1**: `occurrences = []` → `false` (授業なし=FAB もパネルも出さない)。
- **#A2**: `occurrences = [1件]` → `true`。

### 既定展開判定 (`HomeAttendance.defaultExpanded`)

- **#A3**: 3 件すべて `status = nil` (未記録) → `true` (既定展開)。
- **#A4**: 3 件すべて `status = .present` (全記録済み・unrecorded 0) → `false` (「^」だけ)。
- **#A5**: 3 件中 1 件 `status = nil`、2 件記録済み → `true` (1 件でも未記録なら展開)。
- **#A6**: `occurrences = []` (授業なし・空) → `false` (空と全記録済みを区別・既定は畳)。★ #A4 と #A6 の返り値は同じ false だが「空」と「全済み」は `isActive` で分岐 (#A1 で空は非表示・#A4 は「^」表示)。

### 出欠パネル畳み drag (`HomeAttendance.shouldCollapse`)

- **#A7**: 下方向 drag 60pt (height=+60, width=0) → `true` (畳む)。
- **#A8**: 下方向 drag 30pt → `false` (閾値未満)。
- **#A9**: 上方向 drag 60pt (height=-60) → `false` (上方向では畳まない)。
- **#A10**: 横優位 drag (height=+50, width=+120) → `false` (横優位無視)。

### 統合挙動 (手動確認・記述仕様)

- **#I1**: self/timetable でホームを開く → ドロワー畳・segmented は上部小・時間割フル・(未記録あり時) 出欠パネル既定展開 / (全記録済み時) 右下「^」のみ。
- **#I2**: グラバーをタップ / 下スワイプ 40pt 超 → 学期picker + ルームchips がせり出し、scrim が下の時間割を薄暗く。
- **#I3**: scrim タップ / グラバー上スワイプ / グラバー再タップ → ドロワー畳。
- **#I4**: ドロワーで別ルーム chip をタップ → `context` 変化。room 文脈では次に開いた時ドロワーは chips のみ (学期非表示)。
- **#I5**: 「^」FAB タップ → 出欠パネルがせり上がり (in-place)。
- **#I6**: パネル内「今日は全出席 (N)」タップ → 全 present 記録。パネルは**自動で畳まない** (既定展開は day-load 時のみ適用・手動状態を尊重)。
- **#I7**: 日付跨ぎ (0:00 通過) で today 再ロード → `.onChange(of: today?.date)` 発火 → 新しい日の未記録状況で既定展開が再評価される。
- **#I8**: room 文脈では出欠 FAB/パネルは出ない (`context == .self` ガード)。既存 `NowNextBarHost` の self 限定と同じ。
- **#I9**: ドロワー展開中でもグリッド `ScrollView` / `CalendarMonth` の月送りは、scrim で覆われるため操作されない (展開中はドロワー操作に専念)。畳んでいる間はグリッド全面が操作可能で、ドロワーの drag 検知は上端グラバー帯 (幅全体×36pt、グリッド外) のみ。

### 異常系

- **#E1**: today ロード失敗 (`viewModel.today = nil`) → `occurrences = []` → `isActive=false` → FAB/パネル非表示 (クラッシュしない)。
- **#E2**: `semesters = []` で `SemesterMenu` → 「学期を選択」表示 (既存挙動、変更なし)。
- **#E3**: ドロワー展開中に `context` が room に変わり `hasRooms` が真のまま → `sections` は `[.contextChips]` に切替 (semester 消える)。パネル高が縮むがクラッシュしない。

---

## テスト基盤

- **フレームワーク**: XCTest (既存 `AtenderTests/`)。純ロジック中心。
- **テスト配置**:
  - 新規 `AtenderTests/HomeDrawerTests.swift` — #D1〜#D11 (`HomeDrawer.sections` / `resolve` / `toggled`)。
  - 新規 `AtenderTests/HomeAttendanceTests.swift` — #A1〜#A10 (`HomeAttendance.isActive` / `defaultExpanded` / `shouldCollapse`)。
  - 既存 `AtenderTests/HomeChipsTests.swift` / `NowNextTextTests.swift` / `TodayTimelineTests.swift` は**変更不要** (`HomeChips` / `NowNextText` / `TodayTimeline` / `AttendanceSummary` のロジックを触らないため。緑のまま)。
- **主要テストパターン**:
  - `OccurrenceDto` 生成は `TodayTimelineTests` の `occurrence(...)` ヘルパと同型 (`status:` を指定して未記録/記録済みを作り分ける)。`RoomSummaryDto` は `HomeChipsTests` の fixture ロード方式 (`roomSummary.json`) を踏襲。
  - `HomeContext` は `.self` / `.room(roomId:)` を直接構築 (Equatable)。
  - drag は `translationHeight` / `translationWidth` に生値 (CGFloat) を渡す純関数呼び出し。`DragGesture` を UI で発火させない。
- **手動確認 (シミュレータ・実機)** — 自動テスト対象外を明記:
  - グラバー drag/tap のドロワー開閉アニメ、せり出し/せり上がりの見た目、scrim の暗さ。
  - **★ Liquid Glass 干渉の実機確認**: `HomeDrawerPanel` / `AttendancePanel` の `.atenderGlass` が `scrollEdgeEffect` と干渉しないか (Researcher 指摘・実機でしか確定しない)。自前不透明背景を敷いていないこと・グラバー/FAB が正しく浮くことを iPhone 16 実機で確認。
  - CalendarMonth モードでドロワーを開閉しても月送り (水平 drag) が壊れないこと (#D9/#D10 のジェスチャー分離の実地確認)。
  - FAB (56pt 円) が時間割グリッド右下端セルのタップを塞がないこと (safeAreaInset 64pt 予約の効き)。
  - UITest `AtenderUITests/ScreenshotFlow.swift`: `cta-expand-toggle` は FAB に残すが、**既定展開時は launch 時点でパネルが開き FAB が不在**になるためフロー (tap→展開) の意味が変わる。ScreenshotFlow はスクショ収集ハーネス (pass/fail ゲートでない) なので破綻はしないが、`06-cta-expanded` の撮り方は追って調整推奨 (本 doc のスコープ外・別タスク)。

---

## 触るファイル確定リスト (grep で参照確認済)

| 種別 | ファイル | 内容 |
|---|---|---|
| **新規** | `Atender/Features/Home/HomeTopDrawer.swift` | `HomeTopBar` / `HomeDrawerPanel` / `enum HomeDrawer` / `enum HomeDrawerSection` |
| **新規** | `Atender/Features/Home/HomeAttendanceOverlay.swift` | `HomeAttendanceOverlay` / `AttendanceFab` / `AttendancePanel` / `enum HomeAttendance` |
| **改修** | `Atender/Features/Home/HomeCore.swift` | `HomeView.body` 再構成 (ZStack 化・drawer/attendance overlay 追加・`@State drawerExpanded` 追加)。`SemesterMenu`/`ContextChips`/`HomeChips`/`HomeBody` は残置・**未変更** |
| **改修** | `Atender/Features/Home/NowNextBar.swift` | `NowNextBar` struct と `NowNextBarHost` struct を**削除**。`SelfTodayViewModel` / `TodayAttendanceSheet` / `shortLabel` は残置。`longLabel(_:)` を `private` → internal 化 (AttendancePanel から参照)。`NowNextText` は Core 側なので無関係 |
| **新規テスト** | `AtenderTests/HomeDrawerTests.swift` | #D1〜#D11 |
| **新規テスト** | `AtenderTests/HomeAttendanceTests.swift` | #A1〜#A10 |
| プロジェクト生成 | `apps/ios/project.yml` 経由 `xcodegen generate` | 新規 .swift が自動でターゲットに入る (glob 構成。手動追加不要) |

**参照グラフ確認済**: `NowNextBarHost` の呼び出し元は `HomeCore.swift:94` の 1 箇所のみ (→ `HomeAttendanceOverlay` に置換)。`NowNextBar` struct は `NowNextBarHost` からのみ参照 (削除で孤児化なし)。`cta-expand-toggle` identifier は `ScreenshotFlow.swift` 2 箇所が依存 (→ `AttendanceFab` で維持)。`TodayAttendanceSheet` / `SelfTodayViewModel` / `SemesterMenu` / `ContextChips` / `HomeChips` は上記以外に外部参照なし (`SemesterOverviewSemesterMenu` は別 struct・無関係)。

---

## DESIGN.md との関係 (逸脱の明示)

- **DESIGN.md §3.7.1 からの意図的逸脱**: §3.7.1 は「switcher (自分/クラス) と segmented を nav bar 下・コンテンツ先頭に、全画面同じ順序で並べる」を全 5 タブ共通で正典化している。本設計は **Home のみ switcher (=ContextChips) + 学期を上端ドロワーに畳み、segmented だけを top bar に残す**。理由: 時間割/カレンダーの表示面積を最大化する Touri 承認済の方向 (本 feature の目的そのもの)。**→ Leader へ: 本設計承認後、DESIGN.md §3.7.1 に「Home は例外: 選択系をドロワーに畳む」旨の追記 (置換規律に従い) を推奨**。他 4 タブ (学期・科目/ルーム/友達/設定) は §3.7.1 のまま。
- **§3.3 影**: `.atenderGlass` を敷く面 (ドロワー/パネル) には `.atenderShadow` を**重ねない** (二重影・Glass 干渉防止・§3.3 の例外規定)。FAB は Glass でなく `bgElevated + .atenderShadow(.card)` (既存 room FAB と同じ・自前カード面なので影可)。
- **§3.1 角丸**: ドロワー/パネル = `Radius.lg` (24、大カード/シート上端)。FAB = `Circle`。グラバー = `Capsule`。
- **§3.2 余白**: パネル内 padding `Space.s4` (16)、セクション間 `Space.s3` (12)。タップ 44pt (グラバー帯 hit area / FAB 56 / chip 44 は既存)。
- **観点通過 (ui-ux-design-perspectives.md §7)**: (1) 視覚階層=グリッド L1・ドロワー/パネル L2 は必要時のみ前面。(4) 状態網羅=授業なし/全済み/未記録あり/ロード失敗を #A1-A6/#E1 で被覆。(5) タップ 44pt。(6) segmented/chips は色以外 (テキスト) でも選択が判る (既存)。

---

## 不採用案

- **native `.sheet` / `presentationDetents` でドロワー・出欠パネルを作る**: 却下。`.sheet` は下端専用で上端ドロワーが作れず、かつ presentation スロットを消費し `SelfTimetableView` の単一 `.sheet` 集約 (activeSheet: MeetingEditModal 等) と衝突する (gotcha/swiftui-multiple-sibling-sheets-only-one-fires)。カスタム `.overlay` + `offset`/`transition` なら slot を消費せず共存できる。
- **`BottomSheet` コンポーネントを流用**: 却下。`Color.clear` + native `.sheet` の self-presenting 実装で下端専用。グラバー意匠と高さ実測 PreferenceKey パターンだけ流用し、本体は流用しない。
- **ドロワーの drag 検知を画面全体に張る**: 却下。グリッドの縦 `ScrollView` と `CalendarMonth` の水平 `DragGesture(minimumDistance:20)` 月送りを壊す (Researcher 指摘・二重競合)。→ 検知を上端グラバー帯 (グリッド外・36pt) に**空間分離**し、`abs(height)>abs(width)` 方向判定を併用 (#D9/#D10)。空間分離により `simultaneousGesture`/`highPriorityGesture` の調停は不要 (領域が交わらない)。将来 hit area をグリッド上に広げるなら `highPriorityGesture` + 方向判定が必須になるが、本設計はそれを避ける。
- **せり上がり/せり出しを `frame(height:)` アニメで作る**: 却下。height アニメは中身の再レイアウトを誘発し破綻しやすい (Researcher 指摘)。`offset(y:)` + `opacity` / `transition(.move(edge:))` を使う。
- **`SelfTodayViewModel` を HomeView に上げる**: 却下。既定展開判定に必要な `occurrences` は VM が持ち、Home 直下で他に today データを要する要素が無い。`HomeAttendanceOverlay` 内に閉じたまま (旧 `NowNextBarHost` と同じ所有形) で既定展開を決められる。上げると churn だけ増える。
- **授業なし (occurrences 空) でも「^」FAB を出す**: 却下。記録対象が無く操作しても空パネルが出るだけでノイズ。既存 `NowNextBar` の `.noClass` 非表示と一貫させ、`isActive=false` で完全非表示 (#A1)。
- **既定展開を live-reactive binding にする (unrecorded==0 で自動畳)**: 却下。ユーザーがパネル内で全出席をタップした直後に勝手に畳むと唐突。既定展開は day-load 時 (`.onChange(of: today?.date)`) の初期値としてのみ適用し、以後の開閉は手動状態を尊重 (#I6)。
- **出欠パネルを safeAreaInset でグリッドを押し上げて表示**: 却下。「せり上がり in-place」+「時間割フル」の意図は、パネルが時間割の**上に一時的に重なる** (overlay) こと。押し上げるとグリッドが恒久的に縮む。collapsed FAB のクリアランス (64pt) だけ safeAreaInset で予約し、expanded パネルは overlay で浮かせる。
