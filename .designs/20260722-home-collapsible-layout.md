# ホーム画面レイアウト刷新 — 上部は常時表示に戻し、出欠を FAB + 非モーダル overlay タイル化

## 目的 (1-3行)

固定の下部出欠タイル (`NowNextBar` を `safeAreaInset(.bottom)` で常時占有) が時間割グリッドを恒久的に圧迫していた。これを **右下「^」FAB + せり上がりの非モーダル・非スクリムなコンパクトタイル (overlay)** に置き換え、**固定タイル分のスペースを時間割グリッドに回す**。学期選択 / ルーム選択 / 時間割・カレンダー切替 (segmented) は **従来どおり上部に常時表示** (触らない)。

> **地位**: 個別画面の実装フェーズ設計。視覚言語の正典は `DESIGN.md`。本 doc は §3.7.1 (switcher/segmented をコンテンツ先頭に並べる) に**準拠する** — 上部の選択系は常時表示のまま据え置くため逸脱は無い。

---

## ★ 改訂履歴 (実装 `a810f78` からの差分)

初版 (`cebb813` 設計 → `50d0963` 実装 → `a810f78` テスト) は「上端プルダウン・ドロワー + 全画面スクリム出欠パネル」だった。Touri がシミュレータで確認し、以下を**廃止・変更**した (2026-07-22 確定フィードバック)。本 doc はその改訂版。

| 項目 | 初版 (実装済 `a810f78`) | 本改訂 |
|---|---|---|
| 上部の学期/ルーム/segmented | 上端グラバー付き**ドロワーに畳む** (`HomeTopBar` / `HomeDrawerPanel`) | **廃止**。元どおり VStack 先頭に**常時表示**へ戻す |
| ドロワー開閉ロジック | `enum HomeDrawer` (`sections`/`resolve`/`toggled`)・#D1〜D11 | **全削除**。`HomeTopDrawer.swift` ごと削除 |
| ドロワー scrim | `Color.black.opacity(0.12)` 全面 | **削除** (ドロワー自体が無い) |
| 出欠 展開時 | **全画面・濃いスクリム・モーダル的大パネル** (サマリ + 各コマ出欠ボタン列を `AttendancePanel` に埋め込み) | **非モーダル・非スクリムのコンパクトタイル** (元 `NowNextBar` 相当の高さ) をグリッド上レイヤーに overlay |
| 各コマ詳細記録 | `AttendancePanel` 内に `TodayAttendanceSheet` を埋め込み表示 | **元の導線に復帰**: タイルの「詳細」ボタン → `TodayAttendanceSheet` を native `.sheet` で開く |
| 出欠純ロジック `HomeAttendance` | `isActive`/`defaultExpanded`/`shouldCollapse`・#A1〜A10 | **維持** (不変)。FAB トグル / 既定展開 / 畳み drag の条件はそのまま |
| 右下「^」FAB | あり (`cta-expand-toggle` を付与) | あり。ただし `cta-expand-toggle` は**タイルの詳細ボタンに戻す** (元の導線)。FAB は別 id |

以降の本文は**改訂後の正**。ドロワー関連の記述は残さない。

---

## UI/UX

### 全体レイアウト (self コンテキスト / timetable・出欠タイル展開時 = 未記録あり既定)

```
┌───────────────────────────────┐
│  ホーム                    ⚙︎  │  ← nav bar (inline title + 歯車 trailing)。既存踏襲・変更なし
├───────────────────────────────┤
│  2026 前期  ▾                 │  ← SemesterMenu (self時のみ)。★常時表示 (元どおり)
│  [自分] [3F実習室] [教養] ＋    │  ← ContextChips (rooms 非空時)。★常時表示 (元どおり)
│      [ 時間割 | カレンダー ]    │  ← segmented。★常時表示 (元どおり)
├───────────────────────────────┤
│                               │
│      時間割グリッド (フル)      │  ← HomeBody。固定出欠バーが無い分だけ縦が伸びる
│                               │
│░░ 次の授業 · 3限 英語 13:00 ░░│  ← ★ AttendanceTile: 非スクリム overlay。下のグリッドは
│░░ [今日は全出席(3)▾]     [≡] ░│     暗くならず操作可能。タイルは grid の上に浮くだけ
└───────────────────────────────┘
   ▼ タブバー (native Liquid Glass・変更なし)
```

### 出欠タイル畳み時 (記録済み = 既定 / タイルを下スワイプ)

```
┌───────────────────────────────┐
│  2026 前期  ▾                 │  ← 上部は常時表示のまま (変わらない)
│  [自分] [3F実習室] [教養] ＋    │
│      [ 時間割 | カレンダー ]    │
├───────────────────────────────┤
│                               │
│      時間割グリッド (フル)      │  ← タイルが畳まれ、下端まで広い
│                               │
│                          ╭─╮  │  ← ★ AttendanceFab「^」(右下)。これだけ
│                          │^│  │
│                          ╰─╯  │
└───────────────────────────────┘
   ▼ タブバー
```

- **非モーダル・非スクリム**: タイルが出ていても背後の時間割は暗転せず、そのままスクロール/タップできる。タイルは overlay で「上に一時的に重なる」だけ。全画面パネルにはしない。
- **タイル高さ = 元 `NowNextBar` 相当** (自然高。now/next 行 + CTA 行の 2 行ぶん、`Space.s3` 縦 padding)。`UIScreen.height * 0.5` のような大パネルにはしない。
- **各コマの詳細出欠 (`TodayAttendanceSheet`)** はタイルの「詳細」ボタンから native `.sheet` (medium/large detent) で開く = **元の導線**。タイルに各コマのボタン列は埋め込まない。

### コンポーネント構成 (新旧マップ)

| 役割 | 旧 (元・固定バー時代) | 新 (本改訂) |
|---|---|---|
| 学期選択 | `SemesterMenu` を VStack 先頭に固定 | **変更なし** (VStack 先頭に固定・常時表示) |
| ルーム選択 | `ContextChips` を VStack 2 番目に固定 | **変更なし** (VStack 2 番目・常時表示) |
| 時間割/カレンダー切替 | `Picker(.segmented)` を VStack 3 番目 | **変更なし** (VStack 3 番目・常時表示) |
| グリッド | `GeometryReader{HomeBody}` | 変更なし。固定出欠バーが消えた分フル化 |
| 出欠 | `.safeAreaInset(.bottom){NowNextBarHost}` (固定バー) | `AttendanceFab`(collapsed) / `AttendanceTile`(expanded) を**非スクリム overlay** で出し分け |
| 各コマ詳細 | `NowNextBarHost` の `.sheet` → `TodayAttendanceSheet` | **同じ** (`HomeAttendanceOverlay` の `.sheet` → `TodayAttendanceSheet`) |
| 歯車 (時間割設定) | toolbar trailing | 変更なし |

**新規 View** (全て `HomeAttendanceOverlay.swift`):
- `AttendanceFab` — 「^」円形 FAB (collapsed 状態)。タップでタイル展開。
- `AttendanceTile` — 元 `NowNextBar` 相当のコンパクトタイル (now/next 行 + 一括CTA + 詳細ボタン)。expanded 状態。下スワイプで畳む。
- `HomeAttendanceOverlay` — 上 2 つを `expanded` state で出し分け、`SelfTodayViewModel` + `TimelineView(.everyMinute)` を所有、`TodayAttendanceSheet` の `.sheet` を持つ (旧 `NowNextBarHost` の役割を継承)。

**削除**: `HomeTopBar` / `HomeDrawerPanel` / `enum HomeDrawer` / `enum HomeDrawerSection` (ドロワー廃止)。`HomeTopDrawer.swift` ごと削除。`NowNextBar` struct / `NowNextBarHost` struct (`AttendanceTile` / `HomeAttendanceOverlay` に置換)。

**再利用 (流用可)**:
- `NowNextText.statusLabel/title/detail` (now/next 行の生成) — そのまま。
- `NowNextBar.actionMenu` の一括 CTA (`borderedProminent` capsule「今日は全出席 (N)」+ menu で欠/公/遅/早) を `AttendanceTile.markAllCTA` として移植。`longLabel(_:)` は `private func` → **`private` を外して internal 化**し `AttendanceTile` から参照。
- `TodayAttendanceSheet(occurrences:onChangeStatus:)` — **元のまま native `.sheet` で開く** (残置・変更なし)。
- FAB 意匠: `Color.bgElevated` 円 + `.atenderShadow(.card)` (既存 room FAB と同じ質感)。

**流用不可**:
- `BottomSheet` 本体 (`Color.clear` + native `.sheet`) は self-presenting。overlay タイルには使わない (`.overlay` + `transition` で作る)。

### 状態管理 (どこに何の state が乗るか)

| state | 所有者 | 型/既定 | 備考 |
|---|---|---|---|
| `context` | `HomeView` | `HomeContext = .self` | 既存。ContextChips が変更。**変更なし** |
| `mode` | `HomeView` | `HomeViewMode = .timetable` | 既存。segmented が変更。**変更なし** |
| `semesterId` / `rooms` / `semesters` | `HomeView` | 既存 | 変更なし |
| `showTimetableSettings` | `HomeView` | 既存 | 歯車。変更なし |
| **`viewModel` (SelfTodayViewModel)** | `HomeAttendanceOverlay` | `@State ...? = nil` | 旧 `NowNextBarHost` から継承。Home へは上げない (§設計判断) |
| **`expanded`** | `HomeAttendanceOverlay` | `@State Bool = false` | タイル展開/畳み。day-load 時に `defaultExpanded` で初期化 |
| **`showDetail`** | `HomeAttendanceOverlay` | `@State Bool = false` | 各コマ詳細 `.sheet` の presented フラグ (旧 `NowNextBarHost.showDetail` を継承) |

- **`drawerExpanded` は無い** (ドロワー廃止)。`HomeView` に新規 `@State` を足さない。
- **★ today VM を Home に上げない設計判断**: 既定展開は `AttendanceSummary.unrecordedCount` から算出でき、必要な `occurrences` は `SelfTodayViewModel` が持つ。Home 直下で他に today データを要する要素は無いので VM は `HomeAttendanceOverlay` 内に閉じる (旧 `NowNextBarHost` と同じ所有形)。Home へ上げる案は churn だけ増え利得が無いため不採用 (§不採用案)。

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
enum TodayTimeline {
    static func state(occurrences:nowMinute:) -> TodayState
    static func isStale(loadedDate:now:) -> Bool
}
```

### 新規の純ロジック型 (テスト対象)

**ドロワー関連の純ロジック (`enum HomeDrawer` / `enum HomeDrawerSection`) は廃止・削除。** 出欠ロジックのみ残す (初版から不変)。

```swift
// ── 出欠 FAB/タイルロジック (HomeAttendanceOverlay.swift、internal) ──
enum HomeAttendance {
    static let dragThreshold: CGFloat = 40

    /// 出欠アフォーダンス (FAB/タイル) を出すか。授業が 1 件も無ければ出さない。
    static func isActive(occurrences: [OccurrenceDto]) -> Bool { !occurrences.isEmpty }

    /// その日の today ロード時の初期展開状態。記録すべきものがあれば展開。
    /// (授業なし=空 と 全記録済み=unrecorded 0 を区別。空/全済みは畳)
    static func defaultExpanded(occurrences: [OccurrenceDto]) -> Bool {
        !occurrences.isEmpty && AttendanceSummary.unrecordedCount(occurrences) > 0
    }

    /// タイルで完了した drag が「畳む」に該当するか (下方向・縦優位・閾値超え)。
    static func shouldCollapse(translationHeight: CGFloat, translationWidth: CGFloat) -> Bool {
        abs(translationHeight) > abs(translationWidth) && translationHeight > dragThreshold
    }
}
```

---

## API / 関数シグネチャ

### HomeView (HomeCore.swift 改修) — 元構成に戻し、下端だけ差し替え

**上部 VStack は元 (`5211b48` 時点) と 1:1 同一に戻す。** 変わるのは末尾 2 modifier のみ (`.safeAreaInset(.bottom){NowNextBarHost}` → FAB クリアランス + 非スクリム overlay)。

```swift
struct HomeView: View {
    // 既存 state のまま。★ drawerExpanded は足さない。

    var body: some View {
        VStack(spacing: Space.s3) {
            if context == .self {
                SemesterMenu(semesters: semesters, semesterId: $semesterId)          // 元どおり・常時表示
            }
            if HomeChips.isVisible(rooms: rooms) {
                ContextChips(items: HomeChips.items(rooms: rooms), selected: context, // 元どおり・常時表示
                             onChange: { context = $0 },
                             onAddRoom: { environment.appRouter.selectedTab = .rooms })
                    .padding(.horizontal, -Space.pagePxMobile)
            }
            Picker("表示", selection: $mode) {                                        // 元どおり・常時表示
                Text("時間割").tag(HomeViewMode.timetable)
                Text("カレンダー").tag(HomeViewMode.calendar)
            }
            .pickerStyle(.segmented).frame(maxWidth: .infinity)
            GeometryReader { proxy in
                HomeBody(context: context, mode: mode, semesterId: $semesterId,
                         showTimetableSettings: $showTimetableSettings, available: proxy.size.height)
            }
            .frame(maxHeight: .infinity)
        }
        .padding(.horizontal, Space.pagePxMobile)
        .padding(.top, Space.s3)
        .background(Color.clear)
        .navigationTitle("ホーム")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { /* 既存の歯車 (self && timetable 時) をそのまま */ }
        // ★変更点1: 固定バーをやめ、FAB クリアランスだけ予約 (self は常に 64pt・レイアウトジャンプ防止)
        .safeAreaInset(edge: .bottom) {
            if context == .self { Color.clear.frame(height: 64) }
        }
        // ★変更点2: 出欠アフォーダンスを非スクリム overlay で (collapsed FAB / expanded tile を内部で出し分け)
        .overlay(alignment: .bottom) {
            if context == .self { HomeAttendanceOverlay() }
        }
        .task { /* 既存の rooms/semesters ロードをそのまま */ }
    }
}
```

- `Anim.attendance` は `.spring(response: 0.35, dampingFraction: 0.86)` を指す (inline literal でよい。逐語一致は要求しない)。
- **★ 重要 (architect note §39)**: 出欠 overlay は `.overlay(alignment: .bottom)` を **HomeView 直下 (viewport 固定)** に付ける。グリッドの `ScrollView` の**内側に付けない** (付けると FAB/タイルがスクロールで流れる)。
- **★ 非スクリム**: overlay は `HomeAttendanceOverlay` だけ (dim 用の `Color.black.opacity(...)` 層は**置かない**)。背後のグリッドは暗転せず操作可能。

### HomeAttendanceOverlay (新規) — 旧 NowNextBarHost の置換

```swift
struct HomeAttendanceOverlay: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: SelfTodayViewModel?
    @State private var expanded = false
    @State private var showDetail = false

    var body: some View {
        TimelineView(.everyMinute) { context in
            let occ = viewModel?.occurrences ?? []
            let state = TodayTimeline.state(occurrences: occ, nowMinute: SchoolClock.nowMinute(context.date))
            Group {
                if HomeAttendance.isActive(occurrences: occ) {
                    if expanded {
                        AttendanceTile(
                            state: state,
                            unrecordedCount: AttendanceSummary.unrecordedCount(occ),
                            pending: viewModel?.pending ?? false,
                            onMarkAllPresent: { Task { await viewModel?.markAll(.present) } },
                            onMarkAll: { s in Task { await viewModel?.markAll(s) } },
                            onOpenDetail: { showDetail = true },
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
            }
        }
        .sheet(isPresented: $showDetail) {
            TodayAttendanceSheet(
                occurrences: viewModel?.occurrences ?? [],
                onChangeStatus: { id, s in Task { await viewModel?.patch(id, status: s) } }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}
```

- `.sheet(isPresented: $showDetail)` は**元 `NowNextBarHost` と同じ配置**。元実装でこの `.sheet` は `SelfTimetableView` の `.sheet` 集約と共存して動作していた (別サブツリー) ので、sibling-sheet 競合は起きない (実績あり)。overlay 化しても位置関係は同じ。

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
        .accessibilityIdentifier("attendance-fab")   // ★ 新規 id。UITest は依存しない
        .accessibilityLabel("出欠を開く")
    }
}
```

- **`cta-expand-toggle` は FAB に付けない** (元の導線に戻すため、下記タイルの詳細ボタンに付ける)。

### AttendanceTile (新規) — 元 NowNextBar 相当のコンパクトタイル

```swift
struct AttendanceTile: View {
    let state: TodayState
    let unrecordedCount: Int
    let pending: Bool
    let onMarkAllPresent: () -> Void
    let onMarkAll: (AttendanceStatus) -> Void
    let onOpenDetail: () -> Void
    let onCollapse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            // now/next 行。state==.noClass の日は非表示 (下の CTA 行は必ず残るのでタイルは空にならない)
            if state != .noClass, let status = NowNextText.statusLabel(state) {
                HStack(spacing: Space.s1) {
                    Text(status)
                    if let detail = NowNextText.detail(state) { Text("·"); Text(detail) }
                }
                .font(.caption2).foregroundStyle(Color.textSecondary)
            }
            HStack(spacing: Space.s3) {
                if state != .noClass, let title = NowNextText.title(state) {
                    Text(title).font(.headline).fontWeight(.semibold)
                        .foregroundStyle(Color.textPrimary).lineLimit(2)
                }
                Spacer(minLength: Space.s2)
                markAllCTA                                    // 「今日は全出席 (N)」borderedProminent + menu
                Button(action: onOpenDetail) {                // ★ 元の導線: 各コマ詳細 sheet を開く
                    Image(systemName: "chevron.up")
                        .font(.atenderBase).fontWeight(.bold)
                        .foregroundStyle(Color.textPrimary)
                        .frame(width: 44, height: 44)
                        .background(Color.textPrimary.opacity(0.08)).clipShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("cta-expand-toggle") // ★ 元と同じ id (ScreenshotFlow 依存を維持)
                .accessibilityLabel("各コマの出欠を開く")
            }
        }
        .padding(.vertical, Space.s3).padding(.horizontal, Space.s4)
        .atenderGlass(in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .padding(.horizontal, Space.s4).padding(.bottom, Space.s2)
        // 下スワイプで畳む (grabber は置かない = 元 NowNextBar 相当の見た目)。ボタン以外の面に付く drag。
        .highPriorityGesture(
            DragGesture(minimumDistance: 10).onEnded { v in
                if HomeAttendance.shouldCollapse(translationHeight: v.translation.height,
                                                 translationWidth: v.translation.width) { onCollapse() }
            }
        )
    }

    // markAllCTA は現 NowNextBar.actionMenu の移植 (longLabel を internal 化して参照):
    // Menu { ForEach([.absent,.excused,.tardy,.earlyLeave]) { Button("全部 \(longLabel($0)) (\(unrecordedCount))"){onMarkAll($0)} } }
    //   label: Text(unrecordedCount==0 ? "本日の記録は完了済" : "今日は全出席 (\(unrecordedCount))").lineLimit(1).minimumScaleFactor(0.78)
    //   primaryAction: onMarkAllPresent
    //   .buttonStyle(.borderedProminent).buttonBorderShape(.capsule).frame(minHeight:44)
    //   .disabled(pending || unrecordedCount==0).sensoryFeedback(.success, trigger: unrecordedCount)
}
```

- **★ 詳細ボタンの glyph は元と同じ `chevron.up`** (元の導線をそのまま維持)。ただし FAB も `chevron.up` なので、展開時のタイル内 `^`(=詳細) と畳み時の FAB `^`(=展開) が同じ glyph になる。**この glyph 重複が実機で紛らわしくないかは Touri の sim 確認事項** (§手動確認)。紛らわしければ詳細ボタンを `list.bullet` 等に変える案があるが、初期値は「元の導線維持」を優先し `chevron.up` のまま。
- `TodayAttendanceSheet` は残置・**変更なし**。`.presentationDetents` は `HomeAttendanceOverlay` 側で付与。

---

## 挙動仕様 (Reviewer はここからテスト生成)

曖昧表現なし。ジェスチャー/描画/アニメは実機・シミュレータ手動確認 (§テスト基盤)。純ロジックは #番号で網羅。**ドロワー系 #D1〜D11 は廃止 (テストごと削除)。出欠系 #A1〜A10 は初版から不変で維持。**

### 出欠アフォーダンスの活性 (`HomeAttendance.isActive`)

- **#A1**: `occurrences = []` → `false` (授業なし=FAB もタイルも出さない)。
- **#A2**: `occurrences = [1件]` → `true`。

### 既定展開判定 (`HomeAttendance.defaultExpanded`)

- **#A3**: 3 件すべて `status = nil` (未記録) → `true` (既定でタイル展開)。
- **#A4**: 3 件すべて `status = .present` (全記録済み・unrecorded 0) → `false` (「^」FAB のみ)。
- **#A5**: 3 件中 1 件 `status = nil`、2 件記録済み → `true` (1 件でも未記録なら展開)。
- **#A6**: `occurrences = []` (授業なし・空) → `false`。★ #A4 と #A6 の返り値は同じ false だが「空」と「全済み」は `isActive` で分岐 (#A1 で空は完全非表示・#A4 は「^」FAB を表示)。

### 出欠タイル畳み drag (`HomeAttendance.shouldCollapse`)

- **#A7**: 下方向 drag 60pt (height=+60, width=0) → `true` (畳む)。
- **#A8**: 下方向 drag 30pt → `false` (閾値40未満)。
- **#A9**: 上方向 drag 60pt (height=-60) → `false` (上方向では畳まない)。
- **#A10**: 横優位 drag (height=+50, width=+120) → `false` (横優位無視・グリッド水平スクロール誤爆防止)。

### 統合挙動 (手動確認・記述仕様)

- **#I1**: self/timetable でホームを開く → 上部に SemesterMenu + ContextChips + segmented が**常時表示** (畳まれていない)。その下に時間割グリッドがフル。(未記録あり時) 出欠タイルが**非スクリム overlay** で下端に展開 / (全記録済み時) 右下「^」FAB のみ。
- **#I5**: 「^」FAB タップ → 出欠タイルがせり上がり (in-place・非スクリム)。背後のグリッドは暗転しない。
- **#I6**: タイル内「今日は全出席 (N)」タップ → 全 present 記録。タイルは**自動で畳まない** (既定展開は day-load 時のみ適用・手動状態を尊重)。
- **#I7**: 日付跨ぎ (0:00 通過) で today 再ロード → `.onChange(of: today?.date)` 発火 → 新しい日の未記録状況で `expanded` が `defaultExpanded` により再評価される。
- **#I8**: room 文脈では出欠 FAB/タイルは出ない (`context == .self` ガード)。既存 `NowNextBarHost` の self 限定と同じ。
- **#I9 (元の導線)**: 展開タイルの詳細ボタン (`cta-expand-toggle`・「^」) タップ → `TodayAttendanceSheet` が native `.sheet` (medium/large detent) で開き、各コマの出欠を個別記録できる。閉じるとタイルに戻る。
- **#I10 (畳み)**: 展開タイルを下スワイプ 40pt 超 (縦優位) → タイルが畳まれ「^」FAB に戻る (`shouldCollapse`)。上スワイプ・横優位では畳まない (#A9/#A10)。
- **#I11 (非スクリム・グリッド操作継続)**: タイル展開中でも、タイルが覆っていないグリッド領域はスクロール/タップ可能。`CalendarMonth` の水平月送りも生きる (scrim で塞がないため)。タイルに重なった最下部セルはグリッドをスクロールすれば見える。

### 異常系

- **#E1**: today ロード失敗 (`viewModel.today = nil`) → `occurrences = []` → `isActive=false` → FAB/タイル非表示 (クラッシュしない)。
- **#E2**: `semesters = []` で `SemesterMenu` → 「学期を選択」表示 (既存挙動・変更なし・常時表示のまま)。
- **#E3 (タイルが空にならない)**: `occurrences` 非空だが `state == .noClass` (当日の授業が全て過去 = now/next 無し) かつ未記録あり → `defaultExpanded=true` でタイル展開。タイルは now/next 行を省略するが **CTA 行 (今日は全出席 + 詳細ボタン) は必ず残る**ので、空 overlay + FAB 不在の袋小路にならない。詳細ボタンから未記録分を記録できる。

---

## テスト基盤

- **フレームワーク**: XCTest (既存 `AtenderTests/`)。純ロジック中心。
- **テスト配置**:
  - **削除** `AtenderTests/HomeDrawerTests.swift` — ドロワー廃止に伴い #D1〜D11 ごと削除 (`a810f78` で追加された 84 行)。
  - **維持** `AtenderTests/HomeAttendanceTests.swift` — #A1〜#A10 (`HomeAttendance.isActive` / `defaultExpanded` / `shouldCollapse`)。ロジック不変なので `a810f78` のまま**変更不要**で緑。
  - 既存 `AtenderTests/HomeChipsTests.swift` / `NowNextTextTests.swift` / `TodayTimelineTests.swift` は**変更不要** (`HomeChips` / `NowNextText` / `TodayTimeline` / `AttendanceSummary` のロジックを触らない。緑のまま)。
- **主要テストパターン**:
  - `OccurrenceDto` 生成は `TodayTimelineTests` の `occurrence(...)` ヘルパと同型 (`status:` を指定して未記録/記録済みを作り分ける)。
  - drag は `translationHeight` / `translationWidth` に生値 (CGFloat) を渡す純関数呼び出し。`DragGesture` を UI で発火させない。
- **手動確認 (シミュレータ・実機)** — 自動テスト対象外を明記:
  - 上部 (SemesterMenu / ContextChips / segmented) が元どおり常時表示に戻っていること (ドロワー・グラバーが消えていること)。
  - FAB タップ → タイルせり上がり、下スワイプ → 畳みのアニメ。**タイル展開中に背後グリッドが暗転しない**こと (非スクリム)。
  - **★ glyph 重複**: 畳み時 FAB「^」と展開タイル内の詳細ボタン「^」が同じ glyph で紛らわしくないか (§AttendanceTile 注記)。紛らわしければ詳細ボタン glyph 変更を Touri が判断。
  - **★ Liquid Glass 干渉の実機確認**: `AttendanceTile` の `.atenderGlass` が `scrollEdgeEffect` と干渉しないか (実機でしか確定しない)。自前不透明背景を敷いていないこと・FAB が正しく浮くことを iPhone 16 実機で確認。
  - タイルの下スワイプ畳みが、タイル内の CTA/詳細ボタンのタップと競合しないこと (`highPriorityGesture` + `minimumDistance:10`)。
  - FAB (56pt 円) / 展開タイルが時間割グリッド最下部セルのタップを塞がないこと (グリッドはスクロールで露出。safeAreaInset 64pt 予約の効き)。
  - UITest `AtenderUITests/ScreenshotFlow.swift`: `cta-expand-toggle` は**タイルの詳細ボタンに戻る** (元の導線)。未記録ありの demo seed ではタイルが既定展開 → `cta-expand-toggle` が存在 → `06-cta-expanded` は `TodayAttendanceSheet` を撮る (**元の挙動と一致・追加調整不要**)。ScreenshotFlow は非ゲートのスクショ収集ハーネス。

---

## 触るファイル確定リスト (grep で参照確認済)

| 種別 | ファイル | 内容 |
|---|---|---|
| **削除** | `Atender/Features/Home/HomeTopDrawer.swift` | ドロワー廃止。`HomeTopBar` / `HomeDrawerPanel` / `enum HomeDrawer` / `enum HomeDrawerSection` ごと削除 (`50d0963` で追加されたファイル) |
| **改修** | `Atender/Features/Home/HomeAttendanceOverlay.swift` | 非スクリム・コンパクトタイル化。`AttendancePanel` (全画面/スクリム/TodayAttendanceSheet 埋め込み) → `AttendanceTile` (元 NowNextBar 相当) に。`.sheet(showDetail){TodayAttendanceSheet}` を追加。`HomeAttendance` 純ロジックは不変 |
| **改修** | `Atender/Features/Home/HomeCore.swift` | `HomeView.body` を**元構成に戻す** (VStack 先頭 SemesterMenu+ContextChips+segmented を常時表示)。ZStack/ドロワー/scrim/`@State drawerExpanded`/`topBarHeight` を削除。末尾を `safeAreaInset(64pt clearance)` + `.overlay(.bottom){HomeAttendanceOverlay}` に。`SemesterMenu`/`ContextChips`/`HomeChips`/`HomeBody` は残置・未変更 |
| **改修** | `Atender/Features/Home/NowNextBar.swift` | `NowNextBar` struct と `NowNextBarHost` struct を**削除**。`SelfTodayViewModel` / `TodayAttendanceSheet` / `shortLabel` は残置。`longLabel(_:)` を `private` → internal 化 (`AttendanceTile` から参照)。`NowNextText` は Core 側で無関係 |
| **削除テスト** | `AtenderTests/HomeDrawerTests.swift` | ドロワー廃止に伴い削除 |
| **維持テスト** | `AtenderTests/HomeAttendanceTests.swift` | #A1〜A10 (変更不要) |
| プロジェクト生成 | `apps/ios/project.yml` 経由 `xcodegen generate` | .swift の追加/削除が自動でターゲットに反映 (glob 構成) |

**参照グラフ確認済**: `cta-expand-toggle` identifier は `ScreenshotFlow.swift` 2 箇所が依存 (→ `AttendanceTile` の詳細ボタンで維持)。`home-drawer-grabber` / `attendance-panel-grabber` identifier は `HomeTopDrawer.swift` / 旧 `AttendancefPanel` 内のみで、削除で参照ゼロ (UITest は依存しない)。`TodayAttendanceSheet` / `SelfTodayViewModel` / `SemesterMenu` / `ContextChips` / `HomeChips` は上記以外に外部参照なし。

---

## DESIGN.md との関係

- **§3.7.1 逸脱は撤回**: 初版は「Home のみ switcher/segmented を上端ドロワーに畳む」ことで §3.7.1 (switcher/segmented をコンテンツ先頭に常時並べる) から逸脱していた。**本改訂で上部の選択系は元どおり常時表示に戻る**ため、§3.7.1 との逸脱は無い。**→ Leader へ: 初版で提案していた「DESIGN.md §3.7.1 に Home 例外を追記」は不要 (追記しない)。** DESIGN.md は現状維持。
- **§3.3 影 / Glass**: `.atenderGlass` を敷く面 (`AttendanceTile`) には `.atenderShadow` を**重ねない** (二重影・Glass 干渉防止)。FAB は Glass でなく `bgElevated + .atenderShadow(.card)` (既存 room FAB と同じ・自前カード面なので影可)。← この規則は初版から維持。
- **§3.1 角丸**: タイル = `Radius.md`。FAB = `Circle`。
- **§3.2 余白**: タイル内 padding `Space.s4` (16)、行間 `Space.s2` (8)。タップ 44pt (詳細ボタン 44 / FAB 56 / CTA minHeight 44)。
- **観点通過 (ui-ux-design-perspectives.md §7)**: (1) 視覚階層=グリッド L1・タイル/FAB は L2 で**非スクリム** (L1 を隠さない)。(4) 状態網羅=授業なし/全済み/未記録あり/noClass/ロード失敗を #A1-A6/#E1/#E3 で被覆。(5) タップ 44pt。(6) segmented/chips は色以外 (テキスト) でも選択が判る (既存・常時表示)。

---

## 不採用案

- **★ 上端プルダウン・ドロワー (初版で実装 → 廃止)**: 却下。`50d0963` で実装し Touri がシミュレータで確認したが、(a) 横線グラバーだけでは「何が引き出せるか」の発見性が低い、(b) 学期選択・ルーム選択は常時見えていてよい情報で畳む必要が無い、と実機判断された。→ 上部は元どおり常時表示に戻す。
- **★ 全画面スクリム・モーダル的な大出欠パネル (初版で実装 → 廃止)**: 却下。濃いスクリムで時間割を暗転させ各コマ出欠ボタン列を大パネルに埋め込む形だったが、開いた瞬間に時間割が見えなくなり「開いた瞬間シンプルに時間割」という本 feature の狙いと逆行した (Touri 実機判断)。→ 非スクリムのコンパクトタイル (元 NowNextBar 相当) を overlay し、各コマ詳細は元どおり native `.sheet` (`TodayAttendanceSheet`) に戻す。
- **出欠タイルを safeAreaInset でグリッドを押し上げて表示 (= 元の固定バー)**: 却下。これが元の実装で、固定バーがグリッドを恒久的に縮めていた (本改訂が解消する当の問題)。overlay で「時間割の上に一時的に重なる」+ collapsed FAB のクリアランス (64pt) だけ safeAreaInset で予約する。
- **せり上がりを `frame(height:)` アニメで作る**: 却下。height アニメは中身の再レイアウトを誘発し破綻しやすい。`transition(.move(edge:.bottom))` + `opacity` を使う。
- **`SelfTodayViewModel` を HomeView に上げる**: 却下。既定展開判定に必要な `occurrences` は VM が持ち、Home 直下で他に today データを要する要素が無い。`HomeAttendanceOverlay` 内に閉じたまま (旧 `NowNextBarHost` と同じ所有形) で既定展開を決められる。上げると churn だけ増える。
- **授業なし (occurrences 空) でも「^」FAB を出す**: 却下。記録対象が無く操作しても意味が無い。`isActive=false` で完全非表示 (#A1)。
- **既定展開を live-reactive binding にする (unrecorded==0 で自動畳)**: 却下。ユーザーがタイルで全出席をタップした直後に勝手に畳むと唐突。既定展開は day-load 時 (`.onChange(of: today?.date)`) の初期値としてのみ適用し、以後の開閉は手動状態を尊重 (#I6)。
- **各コマ詳細 (`TodayAttendanceSheet`) をタイルに埋め込む (初版の方式)**: 却下。タイルが「元 NowNextBar 相当のコンパクト」でなくなり大パネル化する。元の導線どおり `.sheet` で開く (詳細は必要時のみ・タイルは軽量に保つ)。
