# カレンダー実機不具合の是正 (罫線ズレ / タップ / 青点)

対象コミット: `main = 27453d2` (build 13 配布済)。次ビルド = **14**。
正典: `DESIGN.md` (§8 で置換を実施)。Web 正典: `apps/web/src/components/rooms/calendar/CalendarMonth.tsx`。

## 目的

build 12/13 のカレンダー刷新で実機に出た 4 点 —「表の線がズレる」「押せるセルと押せないセルがある」「タッチしづらい」「学期カレンダーの青点が不要」— を、その場のパッチでなく**再発しない構造**に落として潰す。

---

## 0. スコープ

| 区分 | 対象 |
|---|---|
| **触る (iOS)** | `Core/Timetable/CalendarMonthLayout.swift` / `Core/DesignSystem/EqualColumnsLayout.swift` (新規) / `Features/Calendar/PersonalCalendar.swift` / `Features/SemesterOverview/SemesterLogic.swift` / `Features/SemesterOverview/SemesterOverviewComponents.swift` / `Features/SemesterOverview/SemesterOverviewView.swift` / `project.yml` |
| **触る (Web)** | `src/components/semester/AttendanceCalendar.tsx` / `src/components/semester/SemesterOverview.tsx` |
| **触る (docs)** | `DESIGN.md` §3.2 / §3.6.3 |
| **触らない (明示)** | `apps/api/**` (§7 参照) / `apps/web/src/lib/personalEventDays.ts` とその test (§7) / `apps/web/src/components/rooms/calendar/CalendarMonth.tsx` / `apps/web/src/components/home/PersonalCalendar.tsx` (§9-B) / `Features/Rooms/RoomDetailView.swift` / `Features/Home/SelfTimetableView.swift` (§5) / 既存テストファイル (§10) |

`CalendarMonth` は **home (`PersonalCalendar`) と room detail (`RoomCalendar`) の共有部品**。本設計の §1〜§3 の変更は**両 caller に波及する** (視覚規則なので波及させてよい)。prop 契約・寸法契約は変更しない (`available: CGFloat? = nil` のまま)。

**backend 変更なし** → Coolify デプロイ不要。`MIN_IOS_BUILD = 12` は据え置き (12 ≤ 14 ✓)。

---

## 1. 罫線ズレの是正 — 月グリッド (`CalendarMonth`)

### 1.1 何が起きていたか (確定事実)

`PersonalCalendar.swift:451` の `.frame(maxWidth: .infinity)` に `minWidth: 0` が無い。SwiftUI の flexible frame は minWidth 省略時、**子の intrinsic 最小幅が下限として残る**。日付行が `HStack { Text(24pt); Spacer(); dots }` で、ドット 2 個で最小幅 52pt / 3 個で 60pt に達し、iPhone 16 の 1 列 49.286pt を超過。行合計が 376pt (親 345pt) になり HStack が中央寄せで溢れ、両端 15.5pt が切れる。セルが自分の上辺・左辺に 0.5pt hairline を描く方式 (`:456-466`) なので、**行ごとに縦線の x がズレる**。

### 1.2 対処 (3 つを同時に入れる。1 つでも欠けると再発する)

| # | 対処 | 効く理由 |
|---|---|---|
| A | **ドットを日付数字の下へ移す** | 日付行の intrinsic 最小幅が 60pt → **24pt** になり、横幅の奪い合いが構造的に消える (Touri 裁定) |
| B | **罫線を全廃し、列間 2pt の gap で分ける** | 「ズレて見える線」自体を無くす。Web `CalendarMonth` (`grid-cols-7 gap-px`・罫線ゼロ) と DESIGN.md `:254` 検収表に一致 (Touri 裁定) |
| C | **列幅を `EqualColumnsLayout` が device pixel に丸めて配分する** | 子の intrinsic 幅を**一切参照しない**ので、将来セル内に何を足しても溢れない。かつ配分規則が純関数になりユニットテストで固定できる |

C を入れる理由: A だけでも今は直るが、**「セルに何かを足すと壊れる」構造は残る** (実際 build 11 のタイル化 + build 12 の 3 ドット化の掛け算で壊れた)。`Layout` は提案幅を自分で割るので、子が何を要求しても配分は変わらない。

### 1.3 新規: `EqualColumnsLayout` (`Core/DesignSystem/EqualColumnsLayout.swift`)

```swift
import SwiftUI

/// N 列の等幅レイアウト。**子の intrinsic 幅を一切参照せず**、親から提案された幅を
/// device pixel に丸めて配分する。
/// 背景: `.frame(maxWidth: .infinity)` は minWidth 省略時に子の最小幅を下限として残すため
/// 等幅の保証にならない (Muraki/knowledge/gotcha/swiftui-hstack-equal-columns-need-minwidth-zero)
struct EqualColumnsLayout: Layout {
    var spacing: CGFloat
    var displayScale: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let total = resolvedWidth(proposal: proposal, subviews: subviews)
        let widths = CalendarMonthLayout.columnWidths(
            totalWidth: total, columns: subviews.count, spacing: spacing, displayScale: displayScale
        )
        var height: CGFloat = 0
        for (index, subview) in subviews.enumerated() {
            let width = index < widths.count ? widths[index] : 0
            height = max(height, subview.sizeThatFits(
                ProposedViewSize(width: width, height: proposal.height)
            ).height)
        }
        return CGSize(width: total, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let widths = CalendarMonthLayout.columnWidths(
            totalWidth: bounds.width, columns: subviews.count, spacing: spacing, displayScale: displayScale
        )
        var x = bounds.minX
        for (index, subview) in subviews.enumerated() {
            let width = index < widths.count ? widths[index] : 0
            subview.place(
                at: CGPoint(x: x, y: bounds.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: width, height: bounds.height)
            )
            x += width + spacing
        }
    }

    private func resolvedWidth(proposal: ProposedViewSize, subviews: Subviews) -> CGFloat {
        if let width = proposal.width, width.isFinite, width > 0 { return width }
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        return ideal * CGFloat(subviews.count) + spacing * CGFloat(max(0, subviews.count - 1))
    }
}
```

**呼び出し契約**: `Layout` の要求メソッドは nonisolated。本 struct は MainActor 隔離された値を触らないので `@MainActor` を付けない。`displayScale` は View 側で `@Environment(\.displayScale)` から読んで渡す (Layout は Environment を読めない)。`Cache` は `Void` の既定実装に任せる (`makeCache` は書かない)。

### 1.4 `CalendarMonthLayout` の追加・変更 (`Core/Timetable/CalendarMonthLayout.swift`)

```swift
enum CalendarMonthLayout {
    static let minRowHeight: CGFloat = 70     // ← 60 から変更 (§1.6 の内訳)
    static let weekdayHeaderHeight: CGFloat = 26   // 変更なし
    static let rowCount: Int = 6                   // 変更なし
    static let columnCount: Int = 7                // 追加
    static let columnSpacing: CGFloat = Space.s0_5 // 追加 = 2
    static let rowSpacing: CGFloat = 0             // 追加 = 0 (行間 gap は置かない。§9-E)

    // rowHeight / cardChromeHeight / gridAvailable / contentHeight は**式を変えない**

    /// device pixel に丸めた等幅列。余り px は先頭列から 1px ずつ配る。
    /// 返り値の要素数は必ず `columns`。合計 + spacing*(columns-1) <= totalWidth。
    static func columnWidths(totalWidth: CGFloat,
                             columns: Int = columnCount,
                             spacing: CGFloat = columnSpacing,
                             displayScale: CGFloat) -> [CGFloat] {
        guard columns > 0 else { return [] }
        guard totalWidth.isFinite, totalWidth > 0, displayScale > 0 else {
            return Array(repeating: 0, count: columns)
        }
        let content = max(0, totalWidth - spacing * CGFloat(columns - 1))
        let totalPx = Int((content * displayScale).rounded(.down))
        let base = totalPx / columns
        let remainder = totalPx % columns
        return (0..<columns).map { index in
            CGFloat(base + (index < remainder ? 1 : 0)) / displayScale
        }
    }
}

enum CalendarDayStyle {
    // 既存 emphasis(...) は変更なし

    /// 当月外の日はイベント chip / ステータスドットを描かない (Web `CalendarMonth` と同一規則)
    static func showsDayContent(date: String, monthFirst: String) -> Bool {
        CalendarRange.monthFirst(date) == monthFirst
    }
}
```

`CalendarMonthLayout.swift` は現在 `import CoreGraphics` のみ。`Space` は同一モジュール内 (`Core/DesignSystem/Space.swift`、同じく CoreGraphics のみ) なので追加 import は不要。

### 1.5 `CalendarMonth.monthGrid` の書き換え (`PersonalCalendar.swift:342-378`)

`CalendarMonth` に `@Environment(\.displayScale) private var displayScale` を追加。

```swift
@ViewBuilder
private func monthGrid(dates: [String], eventMap: [String: [CalendarEvent]], monthFirst: String, rowHeight: CGFloat) -> some View {
    let content = VStack(spacing: CalendarMonthLayout.rowSpacing) {
        EqualColumnsLayout(spacing: CalendarMonthLayout.columnSpacing, displayScale: displayScale) {
            ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                Text(label)
                    .font(.atenderXs)
                    .fontWeight(.bold)
                    .lineLimit(1)
                    .foregroundStyle(weekdayColor(index: index, outsideMonth: false))
                    .frame(minWidth: 0, maxWidth: .infinity)
                    .frame(height: CalendarMonthLayout.weekdayHeaderHeight)
            }
        }
        ForEach(0..<CalendarMonthLayout.rowCount, id: \.self) { row in
            EqualColumnsLayout(spacing: CalendarMonthLayout.columnSpacing, displayScale: displayScale) {
                ForEach(0..<CalendarMonthLayout.columnCount, id: \.self) { column in
                    let date = dates[row * CalendarMonthLayout.columnCount + column]
                    dayCell(date, events: eventMap[date] ?? [], monthFirst: monthFirst, rowHeight: rowHeight)
                }
            }
        }
    }

    content
        .padding(Space.s2)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .atenderShadow(.card)
}
```

- 旧構造の内側 `VStack(spacing: 0) { ForEach(rows) }` は**廃止** (外側 1 段に畳む)。ヘッダーと 6 行が同じ `spacing: rowSpacing (= 0)` で並ぶので幾何は等価。
- `dayCell` の引数 `column:` は**削除**する (縦罫線が無くなり不要)。

### 1.6 `dayCell` の書き換え (`PersonalCalendar.swift:380-474`)

```swift
private func dayCell(_ date: String, events: [CalendarEvent], monthFirst: String, rowHeight: CGFloat) -> some View {
    let emphasis = CalendarDayStyle.emphasis(
        date: date, todayString: SchoolClock.todayString(),
        selectedDate: selectedDate, monthFirst: monthFirst
    )
    let showsContent = CalendarDayStyle.showsDayContent(date: date, monthFirst: monthFirst)
    let marks = showsContent
        ? Array(AttendanceDayVisual.dayVisual(summary: daySummaries[date], isFuture: false).marks.prefix(3))
        : []
    let visibleEvents = showsContent ? events : []
    let overflow = visibleEvents.count > 2
    let visibleCount = overflow ? 1 : 2

    return Button { onSelectDate(date) } label: {
        VStack(alignment: .leading, spacing: 3) {
            VStack(spacing: 2) {                       // ← 日付数字 + その真下にドット
                Text(String(Int(date.suffix(2)) ?? 0))
                    .font(.atenderSm)
                    .fontWeight(emphasis == .today ? .bold : .semibold)
                    .foregroundStyle(dayNumberColor(date: date, emphasis: emphasis))
                    .frame(width: 24, height: 24)
                    .background(emphasis == .today ? Color.accent500 : Color.clear)
                    .overlay {
                        if emphasis == .selected { Circle().stroke(Color.accent500, lineWidth: 1.5) }
                    }
                    .clipShape(Circle())
                HStack(spacing: 2) {
                    ForEach(marks, id: \.kind) { mark in
                        Circle().fill(mark.dotColor).frame(width: 6, height: 6)
                    }
                }
                .frame(width: 24, height: 6)           // ← marks が空でも常に 6pt 確保 (行間で chip の y を揃える)
            }
            VStack(alignment: .leading, spacing: 3) {
                ForEach(Array(visibleEvents.prefix(visibleCount))) { event in
                    // 中身 (font/tint/左バー/radius/simultaneousGesture) は現行のまま
                }
                if overflow {
                    Text("+\(visibleEvents.count - visibleCount)")
                        .font(.caption2).fontWeight(.semibold)
                        .foregroundStyle(Color.textTertiary)
                        .padding(.horizontal, 3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .clipped()
        }
        .padding(.horizontal, 3)
        .padding(.vertical, 2)
        .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        .frame(height: rowHeight)
        // ★ 背景塗りが無くなったので contentShape が唯一の当たり判定。絶対に消さない
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .conditional(onLongPressDate != nil) { view in
        view.onLongPressGesture(minimumDuration: 0.4) { onLongPressDate?(date) }
    }
}
```

**削除する行** (現行 `:390-405`, `:449-466`):
- `HStack { Text; Spacer(); dots }` と `.frame(height: 24)` → 上記の縦 `VStack(spacing: 2)` に置換
- `.frame(height: max(44, rowHeight))` → `.frame(height: rowHeight)` (rowHeight は常に 70 以上)
- `.background(emphasis == .outsideMonth ? Color.bgMuted : Color.bgElevated)` → **削除** (§9-C)
- `.overlay(alignment: .top) { Rectangle()...height: 0.5 }` → **削除**
- `.overlay(alignment: .leading) { if column > 0 { Rectangle()...width: 0.5 } }` → **削除**
- 外側の `.clipped()` (`:466`) → **削除** (クリップする対象が無い)。chip 領域の内側 `.clipped()` は**残す**

**`minRowHeight` 60 → 70 の内訳** (縦 padding 2×2 + 数字 24 + 2 + ドット 6 + 3 + chip 14 + 3 + chip 14 = 70)。

---

## 2. 学期カレンダー — 押せる/押せないの見分け + タップ領域

### 2.1 「押せないセル」の確定した唯一の条件

researcher の実測 (126 点タップ / 死に領域 0 件) により、**通常タップで無効なセルは存在しない**。無効化は `SemesterOverviewComponents.swift:147` の `selectionMode && !inSemester` **のみ**。問題は「無効であることが**不透明度だけ**で示され、当月外・有効 (0.40) と当月・無効 (0.25) が判別不能」かつ「**同じ灰色が通常モードでは押せて複数選択では押せない**」= モードで意味が反転していること。

### 2.2 対処: 複数選択モードでは学期範囲外セルを**空セル**にする

不透明度をこれ以上いじらない。**「描かれていない = 押せない」**という反転しない規則に置き換える。

| モード | 学期内 | 学期外 |
|---|---|---|
| 通常 | 通常描画・押せる (日別シート) | **通常描画・押せる** (現行どおり。変更なし) |
| 複数選択 | 通常描画・押せる (トグル) | **完全な空セル** (数字も丸もグリフも枠も無し・非活性・VoiceOver 非公開) |

当月外の 0.40 減光は**両モードとも維持**する (「別の月」の意味であり、両モードで押せるので意味が反転しない)。無効を示す 0.25 は**廃止**する。

`SemesterLogic.swift` の `SemesterCalendarGrid` に追加:

```swift
extension SemesterCalendarGrid {
    /// 複数選択モードで学期範囲外の日は「空セル」にする。
    /// 押せないことを不透明度でなく「不在」で示す (通常モードでは常に false = 現行踏襲)
    static func isBlanked(iso: String, startDate: String, endDate: String, selectionMode: Bool) -> Bool {
        guard selectionMode else { return false }
        return !(startDate <= iso && iso <= endDate)
    }
}
```

`dayCell(_ iso:)` の先頭で分岐:

`dayCell` を `@ViewBuilder private func dayCell(_ iso: String) -> some View` に変え (`AnyView` による型消去はしない)、`if/else` で分岐する:

```swift
@ViewBuilder
private func dayCell(_ iso: String) -> some View {
    if SemesterCalendarGrid.isBlanked(iso: iso, startDate: startDate, endDate: endDate, selectionMode: selectionMode) {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .accessibilityHidden(true)
    } else {
        // 現行の Button ツリー (下記の削除を適用したもの)
    }
}
```

既存の `let disabled = selectionMode && !inSemester` と `.disabled(disabled)` / `.opacity(... * (disabled ? 0.25 : 1))` は**削除**し、`.opacity(inMonth ? 1 : 0.4)` だけを残す。

### 2.3 タップ領域 44pt (375pt 端末)

現行の実効セル幅 = `(W - 32[page] - 32[card padding] - 18[spacing 3×6]) / 7`。
W=393 → 44.43pt (可)、**W=375 (SE3 / 13 mini) → 41.86pt (HIG 44pt 未達)**。

**カードの横 padding を `Space.s4`(16) → `Space.s2`(8) に下げる**。縦は 16 のまま。カード内の非グリッド要素 (月ヘッダー / チップ行 / 凡例) は内側で `+Space.s2` して**実効 16pt を維持**する。

新実効セル幅 = `(W - 32 - 16 - 18) / 7`:

| 端末幅 | セル一辺 |
|---|---|
| 375 (SE3 / 13 mini) | **44.14** ✓ |
| 393 (iPhone 16) | 46.71 ✓ |
| 402 (16 Pro) | 47.99 ✓ |
| 430 / 440 (Max) | 52.00 / 53.43 ✓ |

寸法を純関数に固定し、View がその定数を使う (定数を動かせばテストが落ちる):

```swift
// SemesterLogic.swift
enum SemesterCalendarMetrics {
    static let cardHorizontalPadding: CGFloat = Space.s2   // 8
    static let cardVerticalPadding: CGFloat = Space.s4     // 16
    static let innerInset: CGFloat = Space.s2              // 非グリッド要素の追い padding (実効 16pt)
    static let gridSpacing: CGFloat = 3
    static let columnCount: Int = 7
    static let minTapTarget: CGFloat = 44

    /// 画面幅から日セルの一辺 (= 正方形なので tap 領域の縦横) を求める
    static func dayCellSide(screenWidth: CGFloat, pageMargin: CGFloat = Space.pagePxMobile) -> CGFloat {
        let content = screenWidth - pageMargin * 2 - cardHorizontalPadding * 2
            - gridSpacing * CGFloat(columnCount - 1)
        return max(0, content) / CGFloat(columnCount)
    }
}
```

`AttendanceCalendar` 側の反映:
- `private let columns = Array(repeating: GridItem(.flexible(), spacing: SemesterCalendarMetrics.gridSpacing), count: SemesterCalendarMetrics.columnCount)`
- `LazyVGrid(columns: columns, spacing: SemesterCalendarMetrics.gridSpacing)`
- 外側 `.padding(Space.s4)` → `.padding(.vertical, SemesterCalendarMetrics.cardVerticalPadding).padding(.horizontal, SemesterCalendarMetrics.cardHorizontalPadding)`
- 月ヘッダー `HStack` / チップ `HStack` / `legend` にそれぞれ `.padding(.horizontal, SemesterCalendarMetrics.innerInset)`

**LazyVGrid は据え置く** (`.flexible()` の列幅はコンテナ幅から決まり子を参照しないので、§1 の等幅問題は起きない)。子の intrinsic 幅は最大でも `glyphs` 2 個 (`AttendanceDayVisual.glyphs` が `prefix(2)`) = 12×2 + 2 = **26pt** で、最小列幅 44.14pt を下回るため `minWidth: 0` の追加も不要 (実測でなくコードで確定)。

---

## 3. 青点の削除 (iOS + Web + 凡例)

「予定がある日」を示す右上の 8pt accent 円を **iOS・Web の両方から削除**する。凡例からも削る。チェックマークは同じ topTrailing スロットを `if selected { ... } else if eventDates { ... }` で排他共有しているだけなので、**else-if 枝を消してもチェックマークは無傷**。

### iOS `SemesterOverviewComponents.swift`

削除するもの (すべて `AttendanceCalendar` 内):
1. `:78` `@Environment(AppEnvironment.self) private var environment` — 用途は `loadEventDots()` のみ
2. `:80` `@State private var eventDates: Set<String> = []`
3. `:131-133` `.task(id: "\(anchor):\(semesterId ?? "")") { await loadEventDots() }`
4. `:188-193` `else if eventDates.contains(iso) { Circle()... }` (**else 枝のみ**。`if selected { checkmark }` は残す)
5. `:293-299` `loadEventDots()`
6. `:278` `Text("− / 破線 = 未記録 ・ ● = 予定")` → **`Text("− / 破線 = 未記録")`**
7. `let semesterId: String?` prop — 用途は 3 の `.task(id:)` キーのみ

### iOS `AttendanceCalendar` の新しい公開 prop 契約

```swift
AttendanceCalendar(
    days: [AttendanceDaySummary],
    startDate: String,          // "YYYY-MM-DD"
    endDate: String,            // "YYYY-MM-DD"
    today: String,              // "YYYY-MM-DD"
    selectionMode: Bool,
    selectedDates: Set<String>,
    onSelectDay: (String) -> Void,
    onToggleSelectionMode: () -> Void,
    onToggleDate: (String) -> Void
)
```
`semesterId` を削除。`@Environment(AppEnvironment.self)` への依存も消えるため、**`AttendanceCalendar` は環境注入なしで単体レンダリングできる純 View になる** (副次的な利得)。
`SemesterOverviewView.swift:62` の `semesterId: semesterId,` を削除。

### Web `apps/web/src/components/semester/AttendanceCalendar.tsx`

削除: `:5` `usePersonalEvents` import / `:7` `personalEventDates` import / `:14` `semesterId?: string | null` / `:27` 分割代入の `semesterId` / `:40-43` `usePersonalEvents({...})` / `:44-47` `eventDates` memo / `:110` `const hasEvent` / `:138` `{hasEvent ? <span ... /> : null}` / `:211` 凡例の `<span>...予定</span>`。
`gridStart` / `gridEnd` は `cells` (`:48-49`) が使い続けるので**残す**。
`SemesterOverview.tsx:65` の `semesterId={semesterId}` を削除。

---

## 4. `.scrollClipDisabled()` の扱い

`SemesterOverviewView.swift:85` の `.scrollClipDisabled()` を **削除する**。

判断根拠:
- build 13 (`8c03844`) が `PersonalCalendar` から外した理由は「スクロール中の中身がチップ / ピッカーの**上**に描画される」= 上方向のはみ出し。学期画面の ScrollView は上に兄弟を持たないので**その症状は起きない**。ここは「同じ理由だから外す」ではない。
- 外す本当の理由は**当たり判定**。UIKit は `clipsToBounds = false` にしても bounds 外の点を hit test しない。`SemesterOverviewView` の `ScrollView` は `ZStack` (safe area 内) の中にあり、その frame が**タブバー帯の上端で終わっているか、画面下端まで伸びているか**は実測できていない。前者なら「見えているのにタップがタブバーに取られるセル」が実在し、それは Touri の逐語「選択できるところとできないところある」と一致する。**外せばどちらのモデルでも死に領域は生じない** (自分側を頑健にする)。
- この 1 行は `c0b8ad2 style(ios): カード影の左右切れ修正` で入った。外すと**カード影が左右で切れる可能性がある** — ただし page margin 16pt に対して `AtenderShadow.card` の blur は 16pt なので、切れるのは減衰しきった外縁のみ、という見立て。**これは目視で確定させる** (§6 手動ゲート #M4)。切れが視認できた場合は「影の切れ」と「押せないセルのリスク復活」を天秤にかけるプロダクト判断になるので **Leader にエスカレーションする** (勝手に戻さない)。

`RoomDetailView.swift:185` / `SelfTimetableView.swift:161` の `.scrollClipDisabled()` は **触らない**。理由: 実機 FB が無い画面に、未実測の仮説に基づく変更を広げない。ルームカレンダーは同じ機構を持つので**フォローアップ候補として §11 に記録**する。

---

## 5. データモデル

**変更なし。** 新規スキーマ・DTO・API・Prisma migration は無い。`AttendanceDaySummary` / `PersonalEventOccurrenceDto` / `CalendarEvent` はいずれも形を変えない。

---

## 6. API / 関数シグネチャ (新規・変更のみ)

| 場所 | シグネチャ | 備考 |
|---|---|---|
| `CalendarMonthLayout` | `static let minRowHeight: CGFloat` | 60 → **70** |
| 〃 | `static let columnCount: Int` | 新規 = 7 |
| 〃 | `static let columnSpacing: CGFloat` | 新規 = `Space.s0_5` (2) |
| 〃 | `static let rowSpacing: CGFloat` | 新規 = 0 |
| 〃 | `static func columnWidths(totalWidth: CGFloat, columns: Int = columnCount, spacing: CGFloat = columnSpacing, displayScale: CGFloat) -> [CGFloat]` | 新規 |
| `CalendarDayStyle` | `static func showsDayContent(date: String, monthFirst: String) -> Bool` | 新規 |
| `EqualColumnsLayout` | `struct EqualColumnsLayout: Layout { var spacing: CGFloat; var displayScale: CGFloat }` | 新規ファイル |
| `SemesterCalendarGrid` | `static func isBlanked(iso: String, startDate: String, endDate: String, selectionMode: Bool) -> Bool` | 新規 |
| `SemesterCalendarMetrics` | `static func dayCellSide(screenWidth: CGFloat, pageMargin: CGFloat = Space.pagePxMobile) -> CGFloat` + 定数 6 個 | 新規 enum |
| `CalendarMonth.dayCell` | `private func dayCell(_ date: String, events: [CalendarEvent], monthFirst: String, rowHeight: CGFloat) -> some View` | 引数 `column: Int` を削除 |
| `AttendanceCalendar` | §3 の prop 契約 | `semesterId` を削除 |
| Web `AttendanceCalendar` | `Props` から `semesterId?: string \| null` を削除 | 他 prop は不変 |

`CalendarMonth` の公開 prop (`anchor` / `selectedDate` / `events` / `daySummaries` / `available` / `onSelectDate` / `onChangeAnchor` / `onSelectEvent` / `onLongPressDate`) は**一切変更しない**。

---

## 7. `personalEvent.service.ts` の `source` フィルタについて

researcher は「`listPersonalEvents` に `source` フィルタが無く、`source=EVENTKIT` (iPhone 標準カレンダーのミラー) も全部青点になる」= 青点がほぼ全日に付く真因、と特定した。

**本設計では `apps/api` を変更しない。** 理由:
- 青点を消すので、このフィルタは青点のためには不要になる。
- 同じ `personalEvents(from:to:)` は**ホームの個人カレンダー (iOS `PersonalCalendarViewModel.load` / Web `PersonalCalendar.tsx:53`) が予定 chip の描画に使っている**。ここで EventKit ミラーを除外すると、build 10 で入れた EventKit 双方向同期の**取り込み側 (iPhone 標準カレンダーの予定を Atender に見せる) が機能しなくなる** — 意図した挙動を壊す。
- したがって「フィルタを足す」は青点削除の付随作業ではなく、独立したプロダクト判断。**やらない。**

Web の `apps/web/src/lib/personalEventDays.ts` の `personalEventDates()` は、本変更で**本番の呼び出し元が 0 になる**。`apps/web/tests/lib/personalEventDays.test.ts:98-107` にテストが乗っている純関数なので**削除しない** (孤児化した事実だけ §11 に記録)。

---

## 8. `DESIGN.md` の置換 (追記でなく置換)

grep 済み。月カレンダーの罫線・セル背景に言及しているのは **`:162` と `:163` の 2 行だけ**。`:254` (§7 検収表「月カレンダーは枠全廃 / 日セルに border が無い」) は本設計と**既に整合しているので変更しない** (むしろ `:162` が `:254` と矛盾していたのが今回のバグの土壌)。§3.6.2 の `:150` は**時間割**の規定なので対象外。

### 置換 1 — `DESIGN.md:162` (§3.6.3 表「セル分離」行)

| before | after |
|---|---|
| `| セル分離 | TimeTree 風 hairline (`Color.borderSubtle` = `.separator` の 0.5pt)。週行上辺 + 列間。濃い罫線で表組みにしない |` | `| セル分離 | **罫線を引かない (hairline 全廃)。** 列間のみ `Space.s0_5` (2pt) の gap で分ける (行間 gap は 0)。列幅は `EqualColumnsLayout` が提案幅を device pixel に丸めて配分し、子の intrinsic 幅を参照しない。Web `CalendarMonth` (`grid-cols-7 gap-px`・罫線ゼロ・`min-w-0`) が正典。§7 検収表 #2「月カレンダーは枠全廃」と一致させる |` |

### 置換 2 — `DESIGN.md:163` (§3.6.3 表「日セル」行)

| before | after |
|---|---|
| `| 日セル | 枠なし・角丸なし。当月 `bgElevated` / 当月外 `bgMuted`。日付左上。曜日色 (…)。今日=accent 塗り丸、選択=accent アウトライン丸。高さ `max(44, rowHeight)` |` | `| 日セル | 枠なし・角丸なし・**背景塗りなし** (カード面 `bgElevated` が透ける。当月外の `bgMuted` は**廃止** — gap 分離では背景色の差が唯一の分離線になり、当月外だけが灰色の塊で目立つため)。日付は左上、**その真下にステータスドット** (6pt・最大 3 個・24pt 幅に中央寄せ・marks が空でも 6pt を常時確保)。**当月外は日付数字のみ** (イベント chip / ドットを描かない。Web `CalendarMonth` と同一)。曜日色 (…)。今日=accent 塗り丸、選択=accent アウトライン丸。高さ `CalendarMonthLayout.rowHeight` (最小 70pt) |` |

(「曜日色 (日=`#E5484D` / 土=`#0091FF` / 平日=`textPrimary`、当月外は 0.38 不透明度)」の部分は原文のまま維持)

### 追記 1 — `DESIGN.md` §3.2 の「原則」箇条書き末尾

§3.2 は現在 card padding を 12/16 と規定しており、§2.3 の 8pt 化はそのままでは逸脱になる。方向を変える置換ではなく**例外の明示**なので追記する:

> - **例外 (7 列グリッドを内包するカード)**: 月カレンダー / 学期の出席カレンダーの**横** padding は `Space.s2` (8)。理由は §6 の 44×44pt タップ規定で、横 16pt だと 375pt 端末 (SE3 / 13 mini) の日セルが 41.9pt となり満たせないため (縦は 16pt 維持)。カード内の非グリッド要素 (月ヘッダー・凡例など) は内側で +8pt して実効 16pt を保つ。

**報告用サマリ**: 「`:162` の hairline 規定を消して gap 分離 + `EqualColumnsLayout` に置換」「`:163` の当月外 `bgMuted` と `max(44, rowHeight)` を消して、背景塗りなし + ドットを数字の下 + 当月外は数字のみ + 最小 70pt に置換」「§3.2 に 7 列グリッドカードの横 padding 例外を追記」。

---

## 9. 挙動仕様

Reviewer はここからテストを生成する。**§9-A〜§9-D はユニットテストで到達できる。§9-E は到達できない (手動ゲート)。** 明確に分けてある。

### 9-A. 月グリッドの列幅 (`CalendarMonthLayout.columnWidths` / iOS ユニット)

| # | 条件 | 期待 |
|---|---|---|
| G1 | `totalWidth=345, columns=7, spacing=0, displayScale=3` | 要素数 7。先頭 6 個が `148/3 = 49.3333…`、最後が `147/3 = 49.0`。合計 = 345.0 |
| G2 | `totalWidth=333, columns=7, spacing=2, displayScale=3` (iPhone 16 で card padding 8 の実値) | 要素数 7。先頭 5 個が `143/3`、残り 2 個が `142/3`。`合計 + 2*6 <= 333` |
| G3 | 任意の `totalWidth ∈ {320, 333, 345, 361, 375, 392, 408}` × `displayScale ∈ {2, 3}` | 全要素の**最大 - 最小 <= 1/displayScale** (等幅性)。全要素 `w` について `w * displayScale` が整数 (誤差 1e-6 以内) = **device pixel に乗る** |
| G4 | 同上 | `widths.reduce(0,+) + spacing*(columns-1) <= totalWidth + 1e-6` (親を溢れない) |
| G5 | `totalWidth <= 0` / `.infinity` / `.nan` のいずれか | 要素数は `columns` のまま、全要素 0 |
| G6 | `columns = 0` | `[]` (空配列。クラッシュしない) |
| G7 | `displayScale = 0` | 全要素 0 (ゼロ除算しない) |
| G8 | `spacing * (columns-1) > totalWidth` (例: `totalWidth=5, spacing=2, columns=7`) | 全要素 0 (負幅を返さない) |

### 9-B. 月グリッドのセル内容規則 (`CalendarDayStyle.showsDayContent` / iOS ユニット)

| # | 条件 | 期待 |
|---|---|---|
| G9 | `date="2026-07-15", monthFirst="2026-07-01"` | `true` |
| G10 | `date="2026-06-30", monthFirst="2026-07-01"` | `false` |
| G11 | `date="2026-08-01", monthFirst="2026-07-01"` | `false` |
| G12 | `date="2026-07-01", monthFirst="2026-07-01"` (境界) | `true` |
| G13 | `date="2026-07-31", monthFirst="2026-07-01"` (境界) | `true` |
| G14 | パース不能な文字列 (`date=""`) | クラッシュせず `false` |

### 9-C. 行高 (`CalendarMonthLayout` / iOS ユニット)

| # | 条件 | 期待 |
|---|---|---|
| G15 | — | `minRowHeight == 70` |
| G16 | — | `rowSpacing == 0` かつ `columnSpacing == Space.s0_5` (= 2) かつ `columnCount == 7` |
| G17 | `rowHeight(available: 700)` | `(700 - 26) / 6` (**式は不変**。既存 #CA1 が緑のまま) |
| G18 | `rowHeight(available: 300)` | `minRowHeight` (= 70) |
| G19 | `contentHeight(available: 700)` | `26 + rowHeight(700)*6` (**式は不変**。既存 #CA3 が緑のまま) |
| G20 | `gridAvailable(available: 600)` | `584` (**不変**。既存 #U7 が緑のまま) |

### 9-D. 学期カレンダー (iOS ユニット)

| # | 条件 | 期待 |
|---|---|---|
| S1 | `isBlanked(iso:"2026-06-03", start:"2026-06-05", end:"2026-06-25", selectionMode:false)` | `false` (通常モードでは常に描画・押せる) |
| S2 | `isBlanked(iso:"2026-06-03", start:"2026-06-05", end:"2026-06-25", selectionMode:true)` | `true` |
| S3 | `isBlanked(iso:"2026-06-26", …, selectionMode:true)` | `true` (終了日の翌日) |
| S4 | `isBlanked(iso:"2026-06-05", …, selectionMode:true)` | `false` (開始日ちょうど = 学期内) |
| S5 | `isBlanked(iso:"2026-06-25", …, selectionMode:true)` | `false` (終了日ちょうど = 学期内) |
| S6 | `isBlanked(iso:"2026-06-15", …, selectionMode:true)` | `false` |
| S7 | `dayCellSide(screenWidth: 375)` | `>= 44`。厳密値 `(375-32-16-18)/7 = 44.142857…` (誤差 1e-3) |
| S8 | `screenWidth ∈ {375, 393, 402, 430, 440}` すべて | `dayCellSide >= SemesterCalendarMetrics.minTapTarget` (= 44) |
| S9 | — | `cardHorizontalPadding == Space.s2` かつ `cardVerticalPadding == Space.s4` かつ `gridSpacing == 3` かつ `columnCount == 7` |
| S10 | `dayCellSide(screenWidth: 0)` | `0` (負を返さない) |
| S11 | — | `AttendanceDayVisual.glyphs` は最大 2 件 (`prefix(2)`) — 学期セルの子 intrinsic 幅が 26pt を超えないことの根拠 |

### 9-E. Web (vitest + React Testing Library / `apps/web/tests/components/`)

`AttendanceCalendar` を `selectionMode` 有無でレンダリングして DOM を検査する。**Web は DOM を直接見られるので、iOS で手動ゲートになる項目の多くがここでは自動化できる。**

| # | 条件 | 期待 |
|---|---|---|
| W1 | 通常モード (`selectionMode=false`) でレンダリング | `bg-accent-500` かつ `rounded-full` の 8px 絶対配置 span (旧青点) が **DOM に 1 つも無い**。`getAllByLabelText` で引いた全セル配下に `h-2 w-2 rounded-full bg-accent-500` を持つ要素が 0 件 |
| W2 | 同上 | 凡例に文字列 **「予定」が含まれない**。「未記録」は含まれる。「出席/欠席/公欠/遅刻・早退/休講」の 5 語も含まれる (既存 C9 の非退行) |
| W3 | `selectedDates` に日を入れてレンダリング | その日のセル配下に `Check` アイコン (`left-1 top-1` の accent 丸) が**存在する** (青点削除でチェックマークを壊していない) |
| W4 | `selectionMode=false, startDate="2026-06-05"` で 6月3日 | `getByLabelText("6月3日")` が `<button>` で、`disabled` 属性なし (既存 C8-c の非退行) |
| W5 | `selectionMode=true, startDate="2026-06-05", endDate="2026-06-25"` で 6月3日 | **`getByLabelText("6月3日")` が存在しない** (`queryByLabelText` が `null`)。グリッドの子要素数は通常モードと**同じ** (空 div に置き換わるだけでレイアウトが崩れない) |
| W6 | 同上で 6月15日 (学期内) | `<button>` として存在し、クリックで `onToggleDate("2026-06-15")` が呼ばれる |
| W7 | 同上で 6月26日 (endDate の翌日) | 存在しない |
| W8 | 同上で 6月25日 (endDate ちょうど) | 存在し、押せる |
| W9 | `selectionMode=true` の全セル | `disabled` 属性を持つ `<button>` が**1 つも無い** (無効ボタンという表現自体を廃止した) |
| W10 | `usePersonalEvents` を mock せずにレンダリング | エラーにならない (コンポーネントがこの hook を呼ばなくなった)。※ 既存テストの mock は残っていても無害 |
| W11 | props に `semesterId` を渡さずにレンダリング | 正常に描画される (prop 契約から消えた) |

### 9-F. ユニットテストで**到達できない**項目 (手動ゲート / スクショ)

以下は「ユニット緑のまま実機で出た」今回のバグと同じ層にある。**Developer は実装後に自分で 1 回通し、結果を報告する。** シミュレータ手順は `CLAUDE.md`「iOS をシミュレータで動作確認」、スクショ収集は `AtenderUITests/ScreenshotFlow.swift`。

| # | 手順 | 合格条件 |
|---|---|---|
| M1 | iPhone 16 (393pt) と **iPhone SE (3rd gen) (375pt)** の両方でホーム → カレンダーを開き `02-home-calendar` を撮る | 縦線・横線が**1 本も無い**。曜日ラベルの中心と各列の日付数字の x が**目視で揃っている**。土日列が見切れていない |
| M2 | 同上で、予定を 3 件以上持つ日と 0 件の日が同じ行に並ぶ月を表示 | どの行でも日付数字の x 位置が揃う (行ごとにズレない)。ドットは日付数字の**真下**にあり、横幅を食っていない |
| M3 | 同上で当月外の日 (グリッド先頭・末尾) を見る | 灰色の背景ブロックが無い。日付数字だけが薄く出る。イベント chip とドットが描かれていない |
| M4 | 学期・科目タブを開き、出席率カード / 出席カレンダー / 科目カードの**左右端の影**を拡大して見る (`.scrollClipDisabled()` 削除の副作用確認) | 影が画面端で不自然に断ち切られていない。★**切れていたら Leader にエスカレーション** (§4) |
| M5 | 学期カレンダーで「複数選択」を押す | 学期範囲外の日が**完全に消える** (数字も丸も残らない)。残っている日は全部押せて、押すとカウントが増える |
| M6 | 同状態でカレンダーを画面最下部までスクロールし、**最下行のセル**を 3 通りのスクロール位置 (セルが画面上部 / 中央 / タブバー直上) でタップ | 3 通りとも反応する (= scrollClipDisabled 由来の死に領域が無い) |
| M7 | SE (375pt) で学期カレンダーの日セルを 7 列 × 上下端まで順にタップ | 全部反応する。指で押して隣のセルに誤爆しない |
| M8 | ホームのカレンダーで日付セルを **0.5 秒押して離す** | 予定作成シートだけが開く。日別シートに上書きされない。★ 上書きされたら `Button` + `onLongPressGesture` の二重発火なので**フォローアップとして報告** (本設計では直さない) |
| M9 | 学期カレンダーの日セルを通常モードでタップ | 右上に青い点が無い。チェックマークは複数選択で選ぶと出る |

---

## 10. テスト基盤

| レイヤ | フレームワーク | 配置 | 実行 |
|---|---|---|---|
| iOS ユニット | XCTest (`@testable import Atender`) | `apps/ios/AtenderTests/` | `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'` |
| Web ユニット/DOM | Vitest + @testing-library/react | `apps/web/tests/components/`, `apps/web/tests/lib/` | `pnpm --filter @atender/web test` |
| iOS UI (スクショ) | XCUITest | `apps/ios/AtenderUITests/ScreenshotFlow.swift` | `CLAUDE.md`「全画面・全モーダルのスクショ収集」 |

新規テストの置き場所 (既存の命名・配置に従う):
- §9-A / §9-B / §9-C → **`apps/ios/AtenderTests/CalendarLayoutTests.swift` に追記** (既存の `#CA1`〜`#U8` と同じファイル。ケース ID は `[calendar-defects #G1]` 形式)
- §9-D → **`apps/ios/AtenderTests/SemesterLogicTests.swift` に追記** (`SemesterCalendarGrid` / `SemesterCalendarMetrics` の置き場所と対応)
- §9-E → **`apps/web/tests/components/AttendanceCalendar.defects.test.tsx` を新規作成** (既存 `AttendanceCalendar.test.tsx` / `.review.test.tsx` は触らない)

**既存テストへの影響 (自分で数え直した結果)**:
- `CalendarLayoutTests` の `#CA1`〜`#CA4` / `#U7` / `#U8`: **全部緑のまま**。`minRowHeight` は定数参照で書かれており 60 をハードコードしていない。`rowHeight` / `contentHeight` / `gridAvailable` の**式を変えない**設計にしたので `#CA1`(700→112.33) / `#CA3` / `#U8`(626→100) も不変。→ `rowSpacing = 0` を選んだ理由の 1 つ (§12 の「行間にも gap を入れる」案なら 3 本壊れていた)
- iOS テストで `CalendarMonth` / `AttendanceCalendar` を構築しているものは **0 件** (grep 済)。View の prop 契約変更で壊れる iOS テストは無い
- Web: `apps/web/tsconfig.json` の `include` は `["src", "vite.config.ts", "tailwind.config.ts"]` で **tests を型検査しない**。vitest も esbuild で型を見ない。したがって既存 `AttendanceCalendar.test.tsx:35` / `.review.test.tsx:56` が `semesterId` を渡し続けても**落ちない**。既存テストファイルは**触らない**
- Web `personalEventDays.test.ts`: 対象関数を残すので**緑のまま**
- **意図的に壊すテスト: 0 件。**

**Developer の完了条件**: `xcodegen generate` → ビルド成功 → `xcodebuild test` 全緑 (現行 480 本 + 追加分) → `pnpm --filter @atender/web test` 全緑 → §9-F の M1〜M9 を実行して結果を報告 → `project.yml` の `CFBundleVersion` を `"14"` に更新。

---

## 11. 報告事項 (Leader へ。本設計では実施しない)

1. **`personalEventDates` (`apps/web/src/lib/personalEventDays.ts`) が本番呼び出し元 0 になる。** 純関数でテストが乗っているので残す。消すかどうかは別判断。
2. **`RoomDetailView.swift:185` / `SelfTimetableView.swift:161` に `.scrollClipDisabled()` が残る。** §4 と同じ機構の死に領域リスクを抱えている可能性があるが、実機 FB が無いので触らない。M6 で学期側が「効いた」と判定できたら、同じ対処をルームカレンダーにも広げる価値がある。
3. **`Button` + `.onLongPressGesture` の二重発火疑い** (M8)。実測未了。
4. **`apps/api` の `listPersonalEvents` に `source` フィルタが無い** (§7)。青点削除により不要になるが、将来「EventKit ミラーを除外して表示する」要望が出たときの起点として記録。

---

## 12. 不採用案

- **`.frame(minWidth: 0, maxWidth: .infinity)` だけで済ませる (custom Layout を作らない)**: 却下。ドットを下に移した今なら確かに直るが、「セルに固定幅の子を足すと溢れる」構造がそのまま残る。実際そのやり方で build 11 → build 12 の 2 段階の変更が掛け算になって壊れた。かつ**等幅であることをユニットテストで固定できない** (View の実測が要る)。`Layout` にすると配分規則が純関数になり §9-A で固定できる。
- **列幅を `GeometryReader` + `@State` で測って `.frame(width:)` に流す**: 却下。2 パスになり初回フレームで幅 0 → 再レイアウトのちらつきが出る。`Layout` は提案幅を同期で受け取れる。
- **`LazyVGrid(columns: [.flexible(minimum: 0)])` に置き換える**: 却下。researcher 実測でセルが列枠を超えて隣と重なる (`minimum: 0` は列幅の下限を下げるだけで子の溢れを止めない)。
- **hairline を 0.5pt から `1/displayScale` に変えて残す**: 却下。太さのばらつきは直るが、Touri 裁定 (「罫線は廃止して隙間で分ける」) と DESIGN.md `:254` 検収表 (「月カレンダーは枠全廃」) の両方に反する。線を細くしても「表組み」の性格は消えない。
- **gap を色付きの gutter (`bgMuted` 等) で描き、セルを `bgElevated` で塗る**: 却下。それは「太い罫線」を別名で再導入するのと同じ。Web 正典は `gap-px` + **セル背景なし**で、罫線も gutter 色も持たない。
- **当月外セルの `bgMuted` を残したまま gap 分離にする**: 却下。罫線が消えると**背景色の差だけが唯一の分離線**になり、当月外の 5〜12 セルが灰色の塊として月頭・月末にだけ現れて最も目立つ要素になる。当月外は Web と同じく「日付数字を薄くする + chip/ドットを描かない」で示す。
- **行間にも gap を入れる (`rowSpacing = 2`)**: 却下。`rowHeight` / `contentHeight` の式が変わり `CalendarLayoutTests` の `#CA1` / `#CA3` / `#U8` の 3 本を壊す。列と違って行はセル内の余白 (chip 領域の下が 40pt 前後空く) で十分読めるので、壊す価値がない。
- **複数選択モードの無効セルを「斜線 (ハッチング)」や「破線枠」で示す**: 却下。破線枠は**未記録 (`visual.dashed`)** に既に割り当てられている視覚言語で、衝突する。斜線は新しい描画語彙を発明することになり、DESIGN.md §8「独自の見た目を発明しない」に反する。
- **複数選択モードでも学期範囲外を押せるようにして、一括操作側で無視する**: 却下。「押せたのに何も起きない」は無効表示より悪い。
- **学期カレンダーを月内の日だけ表示する (前後月の日をグリッドから外す)**: 却下。通常モードでは前後月の日も日別シートを開ける現行機能があり、それを落とすことになる。空セル化は**複数選択モードに限定**する。
- **ホームの月カレンダーのドット位置変更を Web にも適用する**: 却下。Web は `grid-cols-7` + `min-w-0` + `shrink-0` で溢れが構造的に起きず、セルも `min-h-24` と広い。今回の縦積みは **iOS 固有のレイアウト事故への対処**であって機能変更ではない。CLAUDE.md「iOS はネイティブ優先 / apps/web はデザインの正典ではない」に従い、**機能 (どのマークがどの日に出るか) の一致だけを保つ**。
- **`apps/api` の `listPersonalEvents` に `source` フィルタを足す**: 却下。§7 のとおり、ホームの個人カレンダーが同じエンドポイントで EventKit ミラーを**意図的に**表示している。青点を消せばフィルタは不要。
- **`RoomDetailView` / `SelfTimetableView` の `.scrollClipDisabled()` も同時に外す**: 却下 (今回は)。実機 FB が無く、`.scrollClipDisabled()` の当たり判定への影響は本設計でも未実測 (M6 で初めて測る)。M6 の結果を見てから広げる。
- **ドット行を「marks があるときだけ」表示して 6pt を節約する**: 却下。同じ行の中でドットの有無によって chip の y がズレ、グリッド全体が波打つ。6pt を常時確保して揃える方を採る。
