# atender build 17 — カレンダー画面の統一 (個人/ルーム) + 罫線化 + 月スライド + モーダルタイトル

> 対象: `apps/ios` (主) / `apps/api` (追加 1 箇所のみ)
> 前提 main: `858c018` (build 16 出荷済 / iOS ユニット **566 GREEN 0 RED** / `AtenderUITests` 10 本)
> デザイン正典: `DESIGN.md`。本 doc の裁定で古くなる記述は本 doc §9 のとおり **置換済** (追記でない)

---

## 0. スコープ

| | 触る | 触らない |
|---|---|---|
| iOS | ホームの 4 経路 (自分×時間割 / 自分×カレンダー / ルーム×時間割 / ルーム×カレンダー)、`RoomDetailView`、月カレンダーの描画、モーダルヘッダー規格 | 学期・科目タブの `AttendanceCalendar` (§3.7 に理由)、友達、設定、認証、EventKit 同期の中身 |
| API | `GET /api/rooms/:id/week` に **optional query 1 個**を足すだけ (additive) | それ以外の route / schema / migration |
| 別設計 | — | **ルームタブの廃止** (本設計はその下地を作るだけで、廃止はしない) |

**用語**: 本 doc で「殻 (shell)」= 月ヘッダー / スクロール設定 / ページング / 日別シートの提示 / 読み込み状態、つまり `CalendarMonth` (セル描画) の**外側**全部を指す。

---

## 1. 目的

1. 月カレンダーを**時間割グリッドと同じ表**にする (曜日ヘッダーの灰色帯 + セル罫線)。DESIGN.md の「月カレンダーは罫線全廃」裁定 (2026-07-2x) を**撤回**する。
2. 日セル内の予定 chip から 2pt 左縦線を消し、**塗りだけ**にする。
3. 月切り替えを**指追従のスライド**にし、読み込み中に skeleton で全体が消えるのをやめる。
4. **個人とルームでカレンダー画面の実装を 1 個にする** (Touri: 「基本的にひとつの万能な機能として作ってそれを使い回す」)。個人側で直したバグがルームに残る非対称を構造的に消す。
5. モーダルのタイトルが iOS 26 で `予…` に潰れるのを直す (`.principal` へ移す)。

---

## 2. 統一の実体 — 何が既に共通で、何がフォークしているか

実測 (Leader):

- **`CalendarMonth` (日セルの描画) は既に共通**。build 14/15/16 のセル修正は個人・ルーム両方に効いている。
- **`TimetableGrid` (時間割グリッド) も既に共通**。
- フォークしているのは **「殻」だけ**:

| 観点 | 個人 (`PersonalCalendar`) | ルーム (`RoomCalendar`) | 本設計の帰結 |
|---|---|---|---|
| 縦 ScrollView | `scrollClipDisabled` **なし** + 負マージン + `contentMargins` | **`.scrollClipDisabled()` あり** (`RoomDetailView.swift:185`) ← レイヤーバグ残存 | `.atenderPageScroll()` 1 個に統一 (§4.6) |
| 月ヘッダー | `CalendarMonthHeader` (32pt / title3 bold / 丸 chevron) | **`PeriodNav`** (別部品 / `atenderSm` / `minWidth 138`) ← `<` `>` がセグメントに重なる | `CalendarMonthHeader` に統一、`PeriodNav` は**削除** |
| 追加操作 | 日セル長押し (FAB は build 13 で廃止) | **FAB 2 個が残存** | 長押しに統一、ICS はヘッダーの accessory へ (§3.4) |
| `available` (行高) | 渡す | **渡していない** (常に 86pt 固定) | 両方渡す |
| 読み込み | Skeleton 2 枚 | Skeleton 1 枚 | 初回のみ skeleton、以降は前月を残す (§3.5) |
| 学期文脈 | UI で選んだ `semesterId` | **各メンバーの `defaultSemesterId` or 作成日が最新** (`room.service.ts:313-324`) ← ルームの時間割が空になる原因 | 同じ `semesterId` を流す (§5.4) |

→ **統一とは「`CalendarMonth` の外側を 1 個の部品にして、データ源と機能をオプションで注入する」こと。**

---

## 3. UI/UX

### 3.1 画面の構造 (個人・ルーム共通)

```
┌ NavigationStack (タブ or ルーム詳細が持つ)
│  nav bar : [学期メニュー]              「ホーム」            [歯車 (自分×時間割のみ)]
├─ ContextChips (自分 / ルーム…)          ← Home のみ・既存
├─ Picker(.segmented)  時間割 | カレンダー ← Home / ルーム詳細で **同じ部品** (§3.6)
│
└─ CalendarScreen  ── 統一の殻 ───────────────────────────────
   ├ CalendarSyncBanner            (個人のみ / 失敗・未許可時のみ描画)
   ├ CalendarMonthHeader           高さ 44pt
   │   [2026年7月] [⚠]  ───────  [accessory] [ ‹ ] [ › ]
   │    title3 bold  同期警告        ICS 等   32pt円/44pt hit
   └ ┌ カード面 (bgElevated + Radius.lg + shadow) ── 固定・スライドしない ──┐
     │  CalendarWeekdayHeader   月 火 水 木 金 土 日   ← bgMuted の帯・固定  │
     │ ┌ 横ページング ScrollView (paging) ───────────────────────────┐ │
     │ │  CalendarMonth (6行 × 7列 / 罫線あり)   ← ここだけが横に滑る    │ │
     │ └─────────────────────────────────────────────────────────┘ │
     └───────────────────────────────────────────────────────────┘
```

★ **カードの外殻 (面 + 角丸 + 影) と曜日ヘッダー帯はページャの外側**に置く。理由は 2 つ:

1. 横 ScrollView の clip 境界がカードの縁と一致すると、**カードの影が左右で切れる** (build 14 で Touri から挙がった FB と同じ形。`knowledge/role/architect.md` §40)。外殻を外に出すと clip は外殻の内側で起き、影は外殻の外に落ちるので切れない。
2. 曜日ヘッダーは全月で同一。滑らせる意味がなく、滑らせるとラベルが揺れて読みにくい。時間割グリッドもヘッダー帯は固定。

### 3.2 罫線と曜日ヘッダー帯 (要望 1) — 時間割グリッドの実装を正典として移植

移植元は `TimetableGridPhaseB.swift` の `background(...)` (実測):

| 要素 | 時間割の実装 | 月カレンダーで採る値 |
|---|---|---|
| 下地 | `Rectangle().fill(Color.bgElevated)` | カード面 = `Color.bgElevated` |
| 曜日ヘッダー帯 | `Rectangle().fill(Color.bgMuted)` | `Color.bgMuted` の帯、高さ `CalendarMonthLayout.weekdayHeaderHeight` (26) |
| 罫線 (縦) | `Rectangle().fill(Color.borderSubtle).frame(width: 1)` | 同左 (`AtenderGridLine`) |
| 罫線 (横) | `Rectangle().fill(Color.borderSubtle).frame(height: 1)` | 同左 |
| ヘッダーと本文の境界線 | **無い** (帯の色差だけで分ける) | **無い** (同じ) |
| 外周の枠 | **無い** (角丸でクリップ) | **無い** (同じ) |

規則 (これが罫線の全定義):

- **縦罫線**: 列境界 6 本。列 0 以外の日セルが自分の **leading** に 1pt 引く。本文 6 行を貫く。曜日ヘッダー帯の中には**引かない**。
- **横罫線**: 行境界 5 本。行 0 以外の日セルが自分の **top** に 1pt 引く。
- 罫線は `.overlay` で描き、**レイアウト幅/高さを消費しない** (= タップ領域を削らない)。
- 色 / 太さは `AtenderGridLine` (§4.1) の単一定義。時間割も同じ定数を使う。

**列間 gap は 0 にする** (`CalendarMonthLayout.columnSpacing`: `Space.s0_5` → `0`)。罫線が分離線になるので gap は不要で、gap を残すと「線 + 溝」の二重分離になる。

**カードの横 padding を 0 にする** (`.padding(Space.s2)` を廃止)。グリッドがカードの縁まで届き、時間割グリッドと同じ見え方になる。

#### 3.2.1 44×44pt タップ領域の検算 (DESIGN.md §3.2 / §6)

列幅 = (画面幅 − `Space.pagePxMobile` × 2) ÷ 7、罫線は overlay なので減算しない。

| 画面幅 | 旧 (page16 + card padding 8 + gap 2) | **新 (page16 + padding 0 + gap 0)** |
|---|---|---|
| 375 (SE3 / 13 mini) | (375−32−16−12)/7 = **45.00** | (375−32)/7 = **49.00** |
| 393 (iPhone 16) | 45.00 → 実測 143/3 ≒ 47.67 | (393−32)/7 = **51.57** |

行高 = `max(70, (available − 26) / 6)` ≥ 70。→ **どの対応端末でも 44×44 を満たす** (旧より +4.0pt 広い)。
これにより DESIGN.md §3.2 の例外規定「7 列グリッドを内包するカードの横 padding は `Space.s2`」は**月カレンダーには不要**になる (学期の出席カレンダーには残す。§9)。

### 3.3 予定 chip の左縦線を消す (要望 2)

`CalendarDayEventChip`:

- **削除**: `.overlay(alignment: .leading) { Capsule().fill(Color(hexString: event.color)).frame(width: 2) }`
- **維持**: 面 = `Color.opaqueTint(hex: event.color, ratio: Color.surfaceTintRatio, base: .bgElevated)` (不透明 tint、`surfaceTintRatio` = 0.42)、`Radius` 4、高さ 14、`.caption2` semibold、`Color.textPrimary`、1 行 truncate。
- **調整**: 左バーが消えた分の内側左余白を `padding(.leading, 5)` → `padding(.leading, 4)` にし、左右対称 (4/4) にする。

**時間割セル (`EventTile`) の 2pt 左バーは残す** (DESIGN.md §3.6.1 は不変)。理由: chip は高さ 14pt で、2pt バー + 5pt 余白が視覚幅の 1/3 を食い「線が主役」になるのに対し、時間割タイルは高さ ≥ 44pt でバーが情報として読める。かつ chip 側は tint 面 (42%) だけで科目色が十分に判別できる。→ §11 に不採用案として明記。

### 3.4 月ヘッダー (統一 + accessory スロット)

```
[ 2026年7月 ] [⚠] [⟳] ─────────── [accessory] [ ‹ ] [ › ]
  .title3 bold  |    |                            32pt円 / 44pt hit
                |    └ 再読込中のみ ProgressView (§3.5)
                └ 同期警告 (個人のみ / CalendarSyncWarningButton)
```

- 高さ **44pt** (旧 32pt から変更)。chevron は視覚 32pt 円のまま、`.frame(width: 44, height: 44)` + `.contentShape(Rectangle())` で **hit area 44×44** を確保する (DESIGN.md §6)。
  - build 13 の「ヘッダーが縦幅を取る」FB との整合: あの時の 44pt 行は「44pt の `PeriodNav` + 44×44 の『+』ボタン + 常設バナー」の合計に対する不満で、`+` は build 13 で廃止済・バナーは失敗時のみ描画になっている。かつ行高は `available` から算出されるため、ヘッダーが 12pt 増えても行高は最大 2pt/行しか縮まない (下限 70pt で止まる)。
- `accessory` は **ViewBuilder スロット**。個人 = 空 (`EmptyView`)、ルーム = **ICS 取り込みボタン** (`arrow.down.doc`、chevron と同じ 32pt 円 / 44pt hit、`accessibilityIdentifier("room-ics-import")`、`accessibilityLabel("カレンダーを取り込む")`)。
- `‹` `›` は窓の端 (§3.5) で `.disabled(true)` + `opacity 0.3`。押しても何も起きない状態を作らない。

### 3.5 月めくり (要望 3)

**採る形** (researcher 実測に基づく。`Muraki/knowledge/library/swiftui-nested-horizontal-paging-ios26.md`):

```swift
ScrollView(.horizontal) {
    LazyHStack(spacing: 0) {
        ForEach(months, id: \.self) { month in
            CalendarMonth(...)
                .containerRelativeFrame(.horizontal)   // GeometryReader を使わない
        }
    }
    .scrollTargetLayout()
}
.scrollTargetBehavior(.paging)
.scrollPosition(id: $visibleMonth)
.scrollIndicators(.hidden)
```

- **窓は広く取り、index のリセットを一切書かない**。`months` = 起点月 ±24 ヶ月 = **49 ページ**を最初から並べる。
- **起点月** = 画面が最初に現れた時点の `SchoolClock.todayString()` の月 (`originMonth` として注入。テスト可能にするため `CalendarScreen` の引数)。
- 窓の端では paging が止まる (実測)。ヘッダーの `‹` `›` も端で disabled になる (§3.4)。±24 ヶ月 = 前後 4 年で、学期単位のアプリとして十分。
- `CalendarMonth` の自前 `DragGesture(minimumDistance: 20)` による月送りは **削除**する (ページャと競合するため)。
- 触覚は `.sensoryFeedback(.selection, trigger: visibleMonth)` をページャに付ける (旧: `CalendarMonth` の `anchor`)。

**`TabView(.page)` を採らない理由** (§11 にも記載): `.page` は縦 `ScrollView` の中で**高さ 0 に潰れる**ため `.frame(height:)` が必須で、高さの定義が `CalendarMonthLayout.contentHeight` と呼び出し側の 2 箇所に分かれる。Dynamic Type でセル内容が伸びたときに固定高がクリップし、逆に `.frame` を落とすと**無言で高さ 0** になる。`ScrollView(.horizontal)` + `containerRelativeFrame` は内容の自然高を取るのでこの分岐が要らない。
※ Leader ブリーフの「月は 5 週と 6 週で高さが変わる」は**本コードベースには当てはまらない** (`CalendarMonth` は常に 42 セル = 6 行固定)。採用理由をそこに置かず、上記の「高さの二重定義」に置く。

#### 読み込み中の見せ方 (「一瞬消えて描画される」の解消)

| 状態 | 描画 |
|---|---|
| まだ 1 度も読めていない (`hasEverLoaded == false`) | Skeleton (現行どおり。ヘッダ 40pt + 本体 360pt) |
| 1 度でも読めていて、可視月が未取得 or 再取得中 | **グリッドを消さない**。日付・曜日・今日・選択日は描き、予定 chip とドットだけが無い状態で出す。月ヘッダーに `ProgressView`。skeleton には**しない** |
| 取得済 | 通常描画 |
| 可視月が失敗、かつ過去に何か読めている | 直前の内容を残したまま、ヘッダーの `ProgressView` 位置に**再試行ボタン** (`arrow.clockwise`、`accessibilityLabel("再読み込み")`) |
| 初回から失敗 | 現行どおり `Panel` + 「再試行」 |

**★ この規則は「月をめくったとき」だけでなく、`semesterId` が変わったときにも同じく適用される。** 学期メニューで別学期を選んだ瞬間・アプリ起動直後に既定学期が確定した瞬間のどちらも、既に読めているグリッドを消してはいけない (`setSemester` は payload を捨てず stale 印だけを付ける。#B30 / #B30a / #B30b)。

**先読み**: 可視月の取得が完了したら、`Task(priority: .utility)` で **前後 1 ヶ月**を `force: false` で取りに行く (窓外はスキップ)。既に取得済 / 取得中の月は何もしない。

### 3.6 タブ (セグメント) の統一

`RoomDetailView` の自前カプセル `tabPicker` (`Button` 2 個 + `Capsule`) を**削除**し、Home と同じ `Picker(.segmented)` にする。

- 列挙は `HomeViewMode` を共用 (`.timetable` / `.calendar`)。`RoomDetailView.RoomDetailTab` は削除。
- ラベルと順序を Home と一致させる: **「時間割」→「カレンダー」**。
- 既定選択も一致させて `.timetable` にする (ルーム詳細はこれまで `.calendar` 既定だった)。Touri の要望 4 は「タブ自体の実装も違うのでは」なので、既定値の差も残さない。
- `accessibilityIdentifier("room-detail-tabs")` は維持する (既存 UI テストのフック)。
- 新規部品 `CalendarModePicker(selection:)` を 1 個作り、`HomeView` と `RoomDetailView` の両方がそれを使う。

### 3.7 統一しないもの (理由付き)

- **学期・科目タブの `AttendanceCalendar`**: 罫線化しない・`CalendarScreen` に載せない。あれは**円形バッジの格子**であり、日セルに予定 chip を積む「表」ではない (出席ステータスを円の塗り分割 + グリフで見せる / 複数選択モードを持つ / セル間 3pt gap + 円の外周 stroke が既に分離線)。ここに 1pt の直線罫線を足すと円と直線が二重に境界を主張する。DESIGN.md に §3.6.4 として明文化した (§9)。
- **時間割画面 (`SelfTimetableView` / `RoomTimetable`) の殻の全面統合**: しない。グリッド本体 (`TimetableGrid`) は既に共通で、残る差は「自分 = セルをタップして授業を作る/編集する」「ルーム = 読み取り専用のマージ表示」という**相互作用の違い**であり、殻に 6 個のクロージャを注入する形にすると 2 つのアダプタより長くなる。ただし**実害があった非対称 (縦 ScrollView 設定) は潰す**: `SelfTimetableView.swift:161` の `.scrollClipDisabled()` は個人カレンダーで撤去したのと同じ形のバグ源なので、両者を `.atenderPageScroll()` (§4.6) に統一する。

---

## 4. データモデル / 型 (Swift)

### 4.1 罫線トークン (新規 `Atender/Core/DesignSystem/GridLine.swift`)

```swift
import SwiftUI

/// 時間割グリッドと月カレンダーが共有する罫線の単一定義。
/// ★ 太さ・色をここ以外に書かない (「時間割と完全に揃える」= 定義が 1 個であること)
enum AtenderGridLine {
    static let width: CGFloat = 1
    static var color: Color { Color.borderSubtle }   // = .separator (light/dark 両対応)
}
```

`TimetableGridPhaseB.swift` の罫線 (`frame(width: 1)` / `frame(height: 1)` / `fill(Color.borderSubtle)`) もこの定数に差し替える。

### 4.2 レイアウト定数 (`Atender/Core/Timetable/CalendarMonthLayout.swift`)

```swift
enum CalendarMonthLayout {
    static let minRowHeight: CGFloat = 70
    static let weekdayHeaderHeight: CGFloat = 26
    static let rowCount: Int = 6
    static let columnCount: Int = 7
    static let columnSpacing: CGFloat = 0      // ← Space.s0_5 (2) から変更。罫線が分離を担う
    static let rowSpacing: CGFloat = 0         // 不変

    static func rowHeight(available: CGFloat) -> CGFloat   // 不変
    static func contentHeight(available: CGFloat) -> CGFloat // 不変
    static func columnWidths(...) -> [CGFloat]             // 不変 (本番未使用。§10 参照)

    // ★ 削除: cardChromeHeight / gridAvailable(available:)
    //   カードの内側 padding が 0 になったので差し引く chrome が無い
}
```

### 4.3 月データのストア (新規 `Atender/Core/Data/CalendarMonthStore.swift`)

```swift
@MainActor
@Observable
final class CalendarMonthStore<Extra> {

    struct Payload {
        var events: [CalendarEvent]
        var daySummaries: [String: AttendanceDaySummary]
        /// 文脈固有の生データ。個人 = [PersonalEventOccurrenceDto] / ルーム = [RoomWeekDto]
        var extra: Extra
    }

    struct Request: Equatable {
        let monthFirst: String    // "yyyy-MM-01"
        let rangeStart: String    // グリッド 42 日の先頭 (= 月初を含む週の月曜)
        let rangeEnd: String      // rangeStart + 41 日
        let semesterId: String?
        let force: Bool
    }

    typealias Loader = @MainActor (Request) async throws -> Payload

    private(set) var payloads: [String: Payload] = [:]
    private(set) var loading: Set<String> = []
    private(set) var failed: Set<String> = []
    private(set) var stale: Set<String> = []
    private(set) var visibleMonth: String
    private(set) var semesterId: String?

    init(visibleMonth: String, semesterId: String?, loader: @escaping Loader)

    // ---- 読み取り (すべて副作用なし) ----
    func payload(_ monthFirst: String) -> Payload?
    func isLoading(_ monthFirst: String) -> Bool
    func hasFailed(_ monthFirst: String) -> Bool
    var hasEverLoaded: Bool { get }              // payloads.isEmpty == false

    // ---- 書き込み ----
    func setVisible(_ monthFirst: String, prefetch: [String]) async
    func ensureLoaded(_ monthFirst: String, force: Bool = false) async
    func setSemester(_ id: String?) async
    func invalidateAll()
    func refreshVisible() async
}
```

呼び出し契約: すべて `@MainActor`。`Loader` も `@MainActor` (repository が `@MainActor` のため)。

### 4.4 窓の純関数 (新規 `Atender/Core/Timetable/CalendarWindow.swift`)

```swift
enum CalendarWindow {
    static let radiusMonths: Int = 24

    /// origin を中心に ±radius ヶ月の monthFirst を昇順で返す。要素数は 2*radius+1
    static func months(origin: String, radius: Int = radiusMonths) -> [String]

    /// monthFirst が窓に含まれるか
    static func contains(_ monthFirst: String, origin: String, radius: Int = radiusMonths) -> Bool

    /// from から months ヶ月動いた先。窓外なら nil
    static func step(from: String, by months: Int, origin: String, radius: Int = radiusMonths) -> String?

    /// 先読み対象 (前後 1 ヶ月のうち窓内のもの)。昇順
    static func neighbors(of monthFirst: String, origin: String, radius: Int = radiusMonths) -> [String]
}
```

すべて `CalendarRange.monthFirst` / `CalendarRange.addMonths` で実装する (自前の日付計算を書かない)。

### 4.5 殻 (新規 `Atender/Features/Calendar/CalendarScreen.swift`)

```swift
struct CalendarScreenOptions: Equatable {
    var identifier: String
    var showsSyncBanner: Bool
    var showsSyncWarningGlyph: Bool
    var allowsLongPressCreate: Bool

    static let personal = CalendarScreenOptions(
        identifier: "personal-calendar",
        showsSyncBanner: true, showsSyncWarningGlyph: true, allowsLongPressCreate: true)
    static let room = CalendarScreenOptions(
        identifier: "room-calendar",
        showsSyncBanner: false, showsSyncWarningGlyph: false, allowsLongPressCreate: true)
}

struct CalendarDaySheetContext {
    let date: String
    let path: Binding<NavigationPath>
    let onChanged: () async -> Void   // 保存/削除後: 可視月を force 再取得 + 全月 stale
    let onClose: () -> Void
}

struct CalendarScreen<Extra, DaySheet: View, HeaderAccessory: View>: View {
    // ★ @State を持つので **明示 init が必須**。暗黙 memberwise init は private に落ちる
    init(store: CalendarMonthStore<Extra>,
         options: CalendarScreenOptions,
         available: CGFloat,
         originMonth: String,
         @ViewBuilder daySheet: @escaping (CalendarDaySheetContext) -> DaySheet,
         @ViewBuilder headerAccessory: @escaping () -> HeaderAccessory)
}

extension CalendarScreen where HeaderAccessory == EmptyView {
    init(store:options:available:originMonth:daySheet:)   // accessory 省略版
}
```

内部 `@State`: `visibleMonth: String?` / `selectedDate: String` / `activeDate: String?` / `dayPath: NavigationPath`。

### 4.6 縦スクロール規格 (新規 `Atender/Core/DesignSystem/PageScroll.swift`)

```swift
extension View {
    /// タブ本文の縦 ScrollView の唯一の規格。
    /// - `scrollClipDisabled` は **付けない** (付けるとスクロール中の中身が
    ///   ContextChips / セグメントの上に描かれる = build 13 の実機 FB)
    /// - 代わりに ScrollView を画面幅いっぱいに広げ、インセットを contentMargins で
    ///   中身側に戻す。こうしないとクリップ境界がカードの縁と一致し、カードの影が
    ///   左右だけ切れる (build 14 の実機 FB)
    func atenderPageScroll() -> some View {
        self.scrollBounceBehavior(.basedOnSize)
            .padding(.horizontal, -Space.pagePxMobile)
            .contentMargins(.horizontal, Space.pagePxMobile, for: .scrollContent)
    }
}
```

適用先: `CalendarScreen` の縦 ScrollView / `SelfTimetableView` の ScrollView / `RoomTimetable` の ScrollView。

### 4.7 更新される既存 View のシグネチャ

```swift
// Atender/Features/Calendar/CalendarMonth.swift (PersonalCalendar.swift から分離・新規ファイル)

/// 1 ヶ月ぶんの日セル格子。**カード外殻・曜日ヘッダー・月送りは持たない** (殻の責務)
struct CalendarMonth: View {
    let anchor: String                                  // その月の任意日
    let selectedDate: String
    let events: [CalendarEvent]
    let daySummaries: [String: AttendanceDaySummary]
    var available: CGFloat? = nil                       // nil = 行高 86pt
    let onSelectDate: (String) -> Void
    var onLongPressDate: ((String) -> Void)? = nil
    // ★ 削除: onChangeAnchor / 内部の DragGesture / .padding(Space.s2) /
    //         .background(bgElevated) / .clipShape / .atenderShadow / 曜日ヘッダー行
}

/// 曜日ラベルの帯。時間割グリッドのヘッダー帯と同じ bgMuted
struct CalendarWeekdayHeader: View {}   // 引数なし

enum CalendarGrid {
    /// 曜日ヘッダーと日セルが共有する列定義 (別々に幅を計算しない)
    static var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(minimum: 0), spacing: CalendarMonthLayout.columnSpacing),
              count: CalendarMonthLayout.columnCount)
    }
}

struct CalendarMonthHeader<Accessory: View>: View {
    let monthFirst: String
    let showsSyncWarning: Bool
    let canGoPrevious: Bool
    let canGoNext: Bool
    let state: State                  // .idle / .refreshing / .retryable
    let onStep: (Int) -> Void         // -1 / +1
    let onRetry: () -> Void
    init(monthFirst:showsSyncWarning:canGoPrevious:canGoNext:state:onStep:onRetry:
         @ViewBuilder accessory: @escaping () -> Accessory)

    enum State: Equatable { case idle, refreshing, retryable }
}
extension CalendarMonthHeader where Accessory == EmptyView { init(...) }   // accessory 省略版

/// 表示モード切替。Home / ルーム詳細で共用
struct CalendarModePicker: View {
    @Binding var selection: HomeViewMode
    var identifier: String = "home-mode-picker"
}
```

```swift
// Atender/Features/Rooms/RoomTimetable.swift (RoomDetailView.swift から分離)
struct RoomTimetable: View {
    let roomId: String
    var semesterId: String? = nil      // ← 追加 (学期文脈。nil = 従来動作)
    let available: CGFloat
}

// Atender/Features/Rooms/RoomCalendar.swift (RoomDetailView.swift から分離)
struct RoomCalendar: View {
    let roomId: String
    var semesterId: String? = nil
    let available: CGFloat            // ← 必須化 (旧: optional で常に nil = 行高 86pt 固定)
}

// Atender/Features/Calendar/PersonalCalendar.swift
struct PersonalCalendar: View {
    let semesterId: String?
    let available: CGFloat
}
```

### 4.8 ルーム時間割の学期解決 (`RoomTimetableLogic`)

```swift
/// 優先順: (1) UI で選ばれた学期 (2) ユーザーの既定学期 (3) 先頭 (4) defaultSlots
/// ★ 第 1 引数は default 付きなので、既存の呼び出し
///   `resolveDaySlots(defaultSemesterId:timetables:)` はそのままコンパイルできる
static func resolveDaySlots(preferredSemesterId: String? = nil,
                            defaultSemesterId: String?,
                            timetables: [UserTimetableDto]) -> [DaySlotDto]
```

---

## 5. API / 関数シグネチャ

### 5.1 iOS: Endpoints / Repository

```swift
// Atender/Core/Networking/APIEndpoint.swift
static func roomWeek(id: String, weekStart: String, semesterId: String? = nil) -> APIEndpoint {
    .init(path: "/api/rooms/\(id)/week", method: .get,
          query: compactQuery(["weekStart": weekStart, "semesterId": semesterId]))
}

// Atender/Core/Data/RoomRepositories.swift
func roomWeek(id: String, weekStart: String, semesterId: String? = nil, force: Bool = false) async throws -> RoomWeekDto
// キャッシュキー: QueryKey(["rooms", id, "week", weekStart, semesterId ?? "-"])
//  → 既存の invalidation prefix ["rooms", id, "week"] にそのまま含まれる
```

### 5.2 個人カレンダーの loader

```swift
// PersonalCalendar が構築する CalendarMonthStore<[PersonalEventOccurrenceDto]>.Loader
{ request in
    async let occurrencesTask = environment.personalEventRepository
        .personalEvents(from: request.rangeStart, to: request.rangeEnd)
    async let timetablesTask  = environment.timetableRepository.userTimetables(force: request.force)
    async let semestersTask   = environment.semesterRepository.semesters(force: request.force)
    let occurrences = try await occurrencesTask
    let timetables  = try await timetablesTask
    let semesters   = try await semestersTask

    var events: [CalendarEvent] = []
    var summaries: [String: AttendanceDaySummary] = [:]
    if let semesterId = request.semesterId,
       let timetable = timetables.first(where: { $0.semesterId == semesterId }),
       let semester  = semesters.first(where: { $0.id == semesterId }) {
        // 出席オーバーレイの失敗は握り潰す (予定は見えるべき。現行踏襲)
        let overview = try? await environment.semesterRepository
            .semesterOverview(id: semesterId, force: request.force)
        summaries = Dictionary((overview?.days ?? []).map { ($0.date, $0) },
                               uniquingKeysWith: { _, last in last })
        events += MeetingExpansion.expandUserTimetable(
            meetings: timetable.meetings, courses: timetable.courses, daySlots: timetable.daySlots,
            rangeStart: request.rangeStart, rangeEnd: request.rangeEnd,
            semesterStart: semester.startDate, semesterEnd: semester.endDate,
            statusByDate: summaries.mapValues(\.status))
    }
    events += PersonalEventDisplay.calendarEvents(occurrences: occurrences)
    return .init(events: events.sorted(by: CalendarEventOrder.byDateThenStart),
                 daySummaries: summaries, extra: occurrences)
}
```

`CalendarEventOrder.byDateThenStart` は新規の共有比較子 (`date` 昇順 → `startMinute` 昇順 → `id` 昇順)。個人・ルーム両方の loader が使う。

### 5.3 ルームカレンダーの loader

```swift
// RoomCalendar が構築する CalendarMonthStore<[RoomWeekDto]>.Loader
{ request in
    let starts = CalendarRange.weekStartsFor(.month, anchor: request.monthFirst)  // 6 週
    var weeks: [RoomWeekDto] = []
    for start in starts {
        weeks.append(try await environment.roomRepository.roomWeek(
            id: roomId, weekStart: start, semesterId: request.semesterId, force: request.force))
    }
    weeks.sort { $0.weekStart < $1.weekStart }
    return .init(events: RoomCalendarLogic.buildCalendarEvents(weeks: weeks),
                 daySummaries: [:],          // ★ ルームは出席ドットを持たない (§7)
                 extra: weeks)
}
```

★ `force` は **明示的な再取得のときだけ true**。現行の「月を変えるたび `force: true`」はキャッシュを無効化していたので廃止する。

### 5.4 API: ルーム週に学期文脈を渡す (additive)

**問題** (コード実測): `getRoomWeek` は各メンバーの時間割を「`defaultSemesterId` に一致するもの、無ければ**作成日が最新**」で選ぶ (`room.service.ts:313-324`)。個人タブは UI で選んだ学期を見るので、**同じ画面の 2 タブが別の学期を表示する**。既定学期が未設定で最新の時間割が空だと、ルームの時間割が空表示になる。

**変更** (`apps/api`):

```ts
// src/routes/rooms.ts
const WeekQuery = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  semesterId: z.string().min(1).optional(),        // ← 追加
});
// handler: getRoomWeek(userId, roomId, day, { semesterId: c.req.valid("query").semesterId })

// src/services/room.service.ts
export async function getRoomWeek(
  userId: string, roomId: string, weekStart: Date,
  options: { semesterId?: string } = {},            // ← 追加 (default 付きなので他の呼び出しは無変更)
)
```

`selectedByUser` の決定規則を次のとおりにする (優先度が高い順、**先に決まったら上書きしない**):

1. `timetable.userId === userId` かつ `options.semesterId` が指定されていて `timetable.semesterId === options.semesterId` → 採用 (**閲覧者のみ**。他メンバーの学期 ID は閲覧者の学期 ID と対応しないので適用しない)
2. `timetable.semesterId === そのユーザーの defaultSemesterId` → 採用
3. どれも無ければ `createdAt desc` の先頭 (= 現行の初期値)

**互換性**: query は zod の非 strict object なので旧クライアントの省略は従来どおり動く。`semesterId` を送らない = 規則 1 が発火しない = 現行と完全に同じ。**破壊的変更なし → `MIN_IOS_BUILD` は 12 のまま据え置き。**

---

## 6. 挙動仕様

Reviewer はここだけを根拠にテストを書く。#番号はテスト名に含めること。

### 6.1 罫線とヘッダー帯 (`CalendarMonth` / `CalendarWeekdayHeader`) — P1

- **#B1** `CalendarMonthLayout.columnSpacing == 0`。
- **#B2** (テストは書かない / §10.1 の削除で担保) `CalendarMonthLayout` から `cardChromeHeight` と `gridAvailable(available:)` を消す。Swift では「シンボルが無いこと」をテストで表明できない (参照した瞬間にコンパイルが通らない) ので、`testU7*` 2 本の削除がそのまま担保になる。Reviewer はこれを検証する新規テストを**書かない**。
- **#B3** `AtenderGridLine.width == 1`。`AtenderGridLine.color` は `Color.borderSubtle` と等しい。
- **#B4** `CalendarWeekdayHeader` を幅 345 / scale 3 で単体レンダしたとき、**ラベル文字が無い x 位置** (x = 345 × i/7 の ±1px、i=1…6) の pixel が `UIColor.tertiarySystemGroupedBackground` (= `Color.bgMuted`) を light trait で解決した RGBA と一致する。
- **#B5** `CalendarWeekdayHeader` の高さが `CalendarMonthLayout.weekdayHeaderHeight` (26) と一致する。
- **#B6** `CalendarMonth(anchor: "2026-07-01", selectedDate: "1970-01-01", events: [], daySummaries: [:], onSelectDate: {_ in})` を幅 345 / scale 3 でレンダしたとき、**行 0 の垂直中央 y** の走査線で、列境界 x = 345 × i/7 (i=1…6) を中心とする ±1px の 3 pixel のうち**少なくとも 1 つ**が、同じ走査線の x = 345 × (i+0.75)/7 の pixel と異なる (= 縦罫線が引かれている)。
- **#B7** (#B6 の対照 / 計測が無力でないことの証明) 同じ走査線で x = 345 × (i+0.55)/7 と x = 345 × (i+0.75)/7 の pixel は**一致する** (素の面同士は同色を返す)。
- **#B8** 同じレンダで、行 0 と行 1 の境界 y = 86 (available 未指定 → 行高 86) を中心とする ±1px のうち少なくとも 1 つが、同じ x での y = 43 の pixel と異なる (= 横罫線が引かれている)。
- **#B9** `CalendarMonth` の描画に**外周の枠は無い**: 描画画像の**最上行・最下行・最左列・最右列**の全 pixel に `borderSubtle` を light trait で解決した色が現れない (画像サイズはレンダ結果から取る。`CalendarMonth` は行高 86 × 6 行 = 516pt を要求するので提案高 500 より高い画像が返る)。
- **#B10** `CalendarMonth` を単体レンダしたときの**幅は提案幅と一致** (345)、かつ予定 0 件の日と 3 件の日が同じ行にあっても幅・高さが変わらない (既存 #R4 の維持)。

### 6.2 予定 chip の左縦線 (`CalendarDayEventChip`) — P1

- **#B11** `CalendarDayEventChip(event:)` を `color = "#FF00FF"` でレンダしたとき、chip の左端 6px (= 2pt @scale3) の全 pixel に **`#FF00FF` の生色が現れない**。
- **#B12** (#B11 の対照) 同条件の `EventTile(title:color:"#FF00FF")` をレンダすると、左端 6px に `#FF00FF` の生色が**現れる** (= 時間割の左バーは維持されている / 計測が有効)。
- **#B13** `CalendarDayEventChip` の面の色が `Color.opaqueTint(hex: "#FF00FF", ratio: Color.surfaceTintRatio, base: .bgElevated)` と一致する (chip 中央の pixel で判定)。

### 6.3 窓の純関数 (`CalendarWindow`) — P3

- **#B14** `months(origin: "2026-07-01")` の要素数は 49、先頭 `"2024-07-01"`、末尾 `"2028-07-01"`、昇順、重複なし。全要素が `"yyyy-MM-01"` 形式。
- **#B15** `months(origin: "2026-07-15")` は `months(origin: "2026-07-01")` と等しい (origin は月に正規化される)。
- **#B16** `contains("2026-07-01", origin: "2026-07-01") == true` / `contains("2024-06-01", origin: "2026-07-01") == false` / `contains("2028-08-01", origin: "2026-07-01") == false`。
- **#B17** `step(from: "2026-07-01", by: 1, origin: "2026-07-01") == "2026-08-01"` / `step(from: "2028-07-01", by: 1, origin: "2026-07-01") == nil` / `step(from: "2024-07-01", by: -1, origin: "2026-07-01") == nil`。
- **#B18** `neighbors(of: "2026-07-01", origin: "2026-07-01") == ["2026-06-01", "2026-08-01"]`。窓の端では 1 個だけ: `neighbors(of: "2028-07-01", origin: "2026-07-01") == ["2028-06-01"]`。
- **#B19** `radius: 0` を渡すと `months` は 1 要素、`neighbors` は空配列 (クラッシュしない)。
- **#B20** 年跨ぎ: `step(from: "2026-12-01", by: 1, origin: "2026-07-01") == "2027-01-01"` / `step(from: "2027-01-01", by: -1, origin: "2026-07-01") == "2026-12-01"`。

### 6.4 月データのストア (`CalendarMonthStore`) — P2 / P3

すべて fake loader (呼ばれた `Request` を記録し、指定の `Payload` か `Error` を返す) で検証する。

- **#B21** 初期状態: `payloads` 空 / `hasEverLoaded == false` / `payload(m) == nil` / `isLoading(m) == false`。
- **#B22** `ensureLoaded(m)` は loader を 1 回呼び、成功後 `payload(m) != nil` / `hasEverLoaded == true` / `isLoading(m) == false` / `hasFailed(m) == false`。
- **#B23** 同じ月に `ensureLoaded(m)` を 2 回続けて呼んでも loader は **1 回**しか呼ばれない (キャッシュ済はスキップ)。
- **#B24** `ensureLoaded(m, force: true)` は既に取得済でも loader を呼び、`Request.force == true` で渡す。
- **#B25** loader が throw したとき: `hasFailed(m) == true` / `isLoading(m) == false` / **`payload(m)` は変化しない** (直前の内容が残る)。
- **#B26** 失敗した月に `ensureLoaded(m)` を再度呼ぶと loader が**再び呼ばれる** (失敗はキャッシュしない)。
- **#B27** `setVisible("2026-08-01", prefetch: ["2026-07-01", "2026-09-01"])` は `visibleMonth == "2026-08-01"` にし、**3 ヶ月ぶんの loader 呼び出し**を起こす。可視月の呼び出しが**先**に完了する (記録順の先頭が可視月)。
- **#B28** `setVisible(m, prefetch: [])` は可視月だけを読む。
- **#B29** `Request` の `rangeStart` は `CalendarRange.monthGridRange(anchorMonthFirst: m).start`、`rangeEnd` は同 `.end` と一致する。`monthFirst` は `CalendarRange.monthFirst(m)`。
- **#B30** `setSemester("s2")` は **`payloads` を残したまま**全月を stale にし (`stale = Set(payloads.keys)`)、`failed` をクリアして可視月を読み直す。以後の `Request.semesterId == "s2"`。★ `payloads.removeAll()` は**してはいけない** (下記 #B30a の理由)。
- **#B30a** `setSemester` の**前後で `hasEverLoaded` が false に落ちない**。`hasEverLoaded` は `payloads.isEmpty == false` で導出されるため、全消しすると false に戻り `CalendarScreenLogic.body` が `.skeleton` に落ちる (= §3.5 の「グリッドを消さない」規則と要望 3 に違反する)。テスト: 1 月分を `ensureLoaded` して `hasEverLoaded == true` にした後 `setSemester("s2")` を呼び、**その直後に `hasEverLoaded == true` のまま**であること。
- **#B30b** `setSemester` 直後の `body(hasEverLoaded:payloadExists:failed:)` は `.grid` (`.skeleton` ではない)。**学期を切り替えても、グリッドは表示されたまま新しい学期のデータに差し替わる**。同じ規則が**アプリ起動直後**にも効く: `HomeView.task` の `applyDefaultSemester` が `nil` → 実 ID を書いた瞬間に `setSemester` が走るため、ここで全消しするとカレンダーを開いた直後にグリッドが一瞬消える。
- **#B31** `setSemester` に**同じ値**を渡したときは何も起きない (loader 呼び出し 0 回、`payloads` 保持)。
- **#B32** `invalidateAll()` は `payloads` を**残したまま** 全月を stale にする。直後の `ensureLoaded(m)` は loader を呼ぶ (`force` は false)。
- **#B33** `refreshVisible()` は可視月を `force: true` で読み直し、他の月を stale にする。
- **#B34** 取得中に同じ月へ `ensureLoaded` が再入しても loader は 1 回だけ (`isLoading` によるガード)。

### 6.5 画面の殻 (`CalendarScreen`) — P2 / P3

`CalendarScreen` は View なので、判定は (a) 状態→描画の写像を担う純関数 (b) XCUITest で行う。(a) 用に次を切り出す:

```swift
enum CalendarScreenLogic {
    enum Body: Equatable { case skeleton, grid, error }          // 何を描くか
    static func body(hasEverLoaded: Bool, payloadExists: Bool, failed: Bool) -> Body
    static func headerState(payloadExists: Bool, loading: Bool, failed: Bool) -> CalendarMonthHeader.State
}
```

- **#B35** `body(hasEverLoaded: false, payloadExists: false, failed: false) == .skeleton`。
- **#B36** `body(hasEverLoaded: false, payloadExists: false, failed: true) == .error`。
- **#B37** `body(hasEverLoaded: true, payloadExists: false, failed: false) == .grid` (★ 読み込み中でも skeleton にしない = 要望 3 の核心)。
- **#B38** `body(hasEverLoaded: true, payloadExists: false, failed: true) == .grid` (★ 失敗しても直前の画面を消さない。エラーはヘッダーに出す)。
- **#B39** `body(hasEverLoaded: true, payloadExists: true, failed: false) == .grid`。
- **#B40** `headerState(payloadExists: true, loading: true, failed: false) == .refreshing`。
- **#B41** `headerState(payloadExists: true, loading: false, failed: true) == .retryable`。
- **#B42** `headerState(payloadExists: true, loading: false, failed: false) == .idle`。
- **#B43** `CalendarScreenOptions.personal` は `showsSyncBanner == true` / `showsSyncWarningGlyph == true` / `allowsLongPressCreate == true` / `identifier == "personal-calendar"`。
- **#B44** `CalendarScreenOptions.room` は `showsSyncBanner == false` / `showsSyncWarningGlyph == false` / `allowsLongPressCreate == true` / `identifier == "room-calendar"`。

XCUITest (`AtenderUITests`、`localhost:8787` 稼働前提):

- **#B45** ホーム→カレンダーで、月グリッドの日セルを左スワイプすると月ヘッダーのテキストが**次の月**に変わる。**1 スワイプで 2 ヶ月飛ばない** (月名を毎回読む。前 2 回 / 後 2 回の計 4 スワイプで検証する。1 回では 2 段飛びを検出できない)。
- **#B46** #B45 のスワイプ中・直後に、日セルが 1 つも存在しない瞬間が無い (スワイプ後 0.3 秒以内に日番号ラベルを持つ button が 1 個以上存在する)。
- **#B47** ルームのカレンダーに **`room-fab-event` / `room-fab-ics` が存在しない**。代わりに `room-ics-import` がヘッダーに存在する。
- **#B48** ルーム詳細で `room-detail-tabs` が存在し、既定で「時間割」が選択され、「カレンダー」をタップすると月グリッドが出る。
- **#B49** ルームの日セル長押しで日別シートが `予定を追加` の editor まで開く (個人と同じ経路)。

### 6.6 モーダルタイトル (`ModalHeader`) — P1

実装の形 (`ModalHeader.swift`):

```swift
enum ModalHeader {
    static var titleFont: Font { .atender2xl.weight(.bold) }
    static let titleMinimumScaleFactor: CGFloat = 0.5     // 新設 (0.75 から変更)
}
// ModalHeaderModifier の titleItem:
//   ToolbarItem(placement: .principal) { Text(title).font(...).lineLimit(1)
//       .minimumScaleFactor(ModalHeader.titleMinimumScaleFactor).accessibilityAddTraits(.isHeader) }
//   ★ .atenderPlainToolbarBackground() は **付けない** (.principal に glass カプセルは元々付かない)
//   ★ fixedSize() / layoutPriority は **付けない**
```

- **#B50** `ModalHeader.titleFont == Font.atender2xl.weight(.bold)` (不変)。
- **#B51** `ModalHeader.titleMinimumScaleFactor == 0.5`。
- **#B52** (XCUITest / ★ placement が leading に戻ったら必ず落ちる本命の判定) 個人カレンダーの日セル長押しで開くモーダルのタイトル `予定を追加` を `app.staticTexts` で掴み、その **frame.width が 60pt 以上**、かつ **frame.midX が画面幅の 0.5 ± 0.08 の範囲**にある。`topBarLeading` に戻すと iOS 26 では幅 31pt / 左端寄りになるので両方の assert が落ちる。
- **#B53** (XCUITest) 同モーダルで `app.staticTexts["予定を追加"].exists` (5 文字が省略されず全部出ている)。
- **#B54** (XCUITest) ルームのヘッダー `room-ics-import` から開くモーダルで `app.staticTexts["カレンダーを取り込む"].exists` (10 文字。iOS 26 の `.principal` は 247pt 使えるので等倍で入る)。
- **#B55** モーダルタイトルの文言規約: 新規タイトルは **12 文字以内**を目安、**19 文字を上限**とする (iOS 26.5 実測: `.lineLimit(1).minimumScaleFactor(0.5)` で 19 文字まで全文表示、20 文字以上で `…`)。現行の 24 箇所の最長は「カレンダーを取り込む」(10 文字) で全て範囲内。

### 6.7 ルーム時間割の学期文脈 — P2

Swift 側:

- **#B56** `RoomTimetableLogic.resolveDaySlots(preferredSemesterId: "s2", defaultSemesterId: "s1", timetables: [tt(s1), tt(s2)])` は **s2 の daySlots** を返す。
- **#B57** `resolveDaySlots(preferredSemesterId: "s9", defaultSemesterId: "s1", timetables: [tt(s1), tt(s2)])` は (s9 が無いので) **s1** を返す。
- **#B58** `resolveDaySlots(defaultSemesterId: "s1", timetables: [tt(s1)])` (第 1 引数省略) は従来どおり **s1**。既存呼び出しがコンパイルできる。
- **#B59** `resolveDaySlots(preferredSemesterId: nil, defaultSemesterId: nil, timetables: [])` は `RoomTimetableLogic.defaultSlots`。
- **#B60** `Endpoints.roomWeek(id: "r1", weekStart: "2026-07-27", semesterId: "s2")` の query は `weekStart` と `semesterId` の 2 つ。`semesterId: nil` のときは `weekStart` のみ (キーごと落ちる)。

API 側 (`apps/api/tests`):

- **#A1** `GET /api/rooms/:id/week?weekStart=…&semesterId=<存在する自分の学期>` は、**その学期の**時間割から `recurringMeetings` を組む。閲覧者の `defaultSemesterId` が別学期を指していても上書きされる。
- **#A2** `semesterId` を**省略**したときの `recurringMeetings` は変更前と同一 (defaultSemesterId 一致 → 無ければ `createdAt desc` の先頭)。
- **#A3** `semesterId` に**閲覧者が持たない学期 ID** を渡しても 400 にならず、規則 2/3 にフォールバックする。
- **#A4** `semesterId` は**他メンバーの時間割選択に影響しない** (`showMemberTimetables: true` のルームで、他メンバーの `recurringMeetings` が `semesterId` 指定の有無で変わらない)。
- **#A5** 未知の query キー (例 `?foo=1`) は従来どおり無視される (zod の非 strict object)。

### 6.8 版数 — P1

- **#B61** `apps/ios/project.yml` が `CFBundleVersion: "17"` を含む。`CFBundleShortVersionString: "1.0"` は不変。
- **#B62** `MIN_IOS_BUILD (= 12) <= CFBundleVersion (= 17)` (既存 `testV2` の維持)。
- **#B63** `Atender/Info.plist` は手編集しない (`xcodegen generate` の出力に任せる)。

---

## 7. 機能対応表 — UI を捨てていない証明

### 7.1 ルーム側だけが持っていた機能 (7 件)

| # | 機能 | build 17 での行き先 | 状態 |
|---|---|---|---|
| 1 | ICS 取り込み (`IcsImportWizard` / `IcsTitleRuleEditorSheet`) | FAB → **月ヘッダーの accessory ボタン** (`room-ics-import`) | 移設・機能不変 |
| 2 | ルーム予定の作成・編集 (`RoomEventEditorContent`) | 日別シート (`RoomDaySheet`) の `＋ 予定を追加` と**日セル長押し**の 2 経路 | 維持 (FAB は移設) |
| 3 | メンバー色分け + 名前 subtitle (`RoomCalendarLogic.memberName`) | ルーム loader (`buildCalendarEvents`) が生成し `CalendarEvent.subtitle`/`color` に載る | 維持 (無変更) |
| 4 | マージ表示 (`mergeKey` による束ね) | `RoomTimetableLogic.buildRecurringEvents` / `TimetableCoalesce` | 維持 (無変更) |
| 5 | マスキング (`showMemberTimetables` / `visibilityMode`) | サーバ側。クライアントは触らない | 維持 (無変更) |
| 6 | メンバー時間割マージ | `RoomTimetable` (ファイル移動のみ) | 維持 |
| 7 | `AvailabilityBar` (空き時間バー) | **呼び出し元 0 の孤児のまま**。`Features/Rooms/AvailabilityBar.swift` に切り出して保全する | 保全・報告 (§10) |

### 7.2 個人側だけが持っていた機能 — ルームで有効にするか

| # | 機能 | ルームで | 理由 |
|---|---|---|---|
| 1 | 出席ステータスのドット | **無効** | 出席は個人の記録。ルームは他人の予定のマージであり、自分の出欠を他人の予定の上に重ねる意味がない。ルーム loader は `daySummaries: [:]` を返す |
| 2 | EventKit 同期バナー / 警告グリフ | **無効** | 書き出し対象は「自分の予定・授業」(`.designs/20260723-calendar-eventkit-sync-and-redesign.md`)。ルームは他メンバーの予定を含むので端末カレンダーへ書き出さない |
| 3 | 長押しで予定作成 | **有効** | ルームは既に持っている。統一後も両方で有効 |
| 4 | 学期連動 (`semesterId`) | **有効 (時間割のみ)** | §5.4。ルームカレンダーは日付ベースの occurrence なので学期に依存しない |
| 5 | 出席オーバーレイ (`HomeAttendanceOverlay`) | **無効** | Home 側の `.self` 限定オーバーレイ。カレンダー画面の一部ではない (現行どおり) |

### 7.3 削除するもの

| 対象 | 理由 | 最後の本番参照 |
|---|---|---|
| `PeriodNav` (View) | 唯一の caller は `RoomCalendar`。`CalendarMonthHeader` に統一。`.day`/`.week` 分岐は build 11「日/週表示を廃止」裁定の残骸で、既にどこからも到達しない | `RoomDetailView.swift:147` → P2 で消える。テスト 0 件 |
| `RoomDetailView.RoomDetailTab` | `HomeViewMode` に統合 (§3.6) | `RoomDetailView.swift:33` → P2 |
| `RoomCalendar` の FAB 2 個 + `.overlay(alignment:.bottomTrailing)` | 機能は §7.1 の #1/#2 に移設済 | `RoomDetailView.swift:187-219` → P2 |
| `CalendarMonthLayout.cardChromeHeight` / `gridAvailable(available:)` | カード内側 padding が 0 になり差し引く chrome が無い | `PersonalCalendar.swift:316` → P1 |
| `CalendarMonth` の `onChangeAnchor` + `DragGesture` | ページャに置き換え。残すと競合する | `PersonalCalendar.swift:190` / `RoomDetailView.swift:170` → P3 |

---

## 8. ファイル配置 (「実装が散っている」の是正)

ホームの 4 経路のうち 2 つが**ルーム詳細画面のファイルに間借り**している状態を解消する。

| 新規/移動 | パス | 中身 |
|---|---|---|
| 新規 | `Atender/Core/DesignSystem/GridLine.swift` | `AtenderGridLine` |
| 新規 | `Atender/Core/DesignSystem/PageScroll.swift` | `View.atenderPageScroll()` |
| 新規 | `Atender/Core/Data/CalendarMonthStore.swift` | `CalendarMonthStore<Extra>` |
| 新規 | `Atender/Core/Timetable/CalendarWindow.swift` | `CalendarWindow` |
| 新規 | `Atender/Features/Calendar/CalendarMonth.swift` | `CalendarMonth` / `CalendarWeekdayHeader` / `CalendarGrid` / `CalendarDayEventChip` / `CalendarMonthHeader` (← `PersonalCalendar.swift` から移動) |
| 新規 | `Atender/Features/Calendar/CalendarScreen.swift` | `CalendarScreen` / `CalendarScreenOptions` / `CalendarScreenLogic` / `CalendarDaySheetContext` / `CalendarMonthPager` / `CalendarModePicker` |
| 縮小 | `Atender/Features/Calendar/PersonalCalendar.swift` | `PersonalCalendarViewModel` + `PersonalCalendar` (殻のアダプタ) のみ。`PeriodNav` は削除 |
| 新規 | `Atender/Features/Rooms/RoomCalendar.swift` | `RoomCalendar` (← `RoomDetailView.swift` から移動) |
| 新規 | `Atender/Features/Rooms/RoomTimetable.swift` | `RoomTimetable` (← 同上) |
| 新規 | `Atender/Features/Rooms/AvailabilityBar.swift` | `AvailabilityBar` + `BarRow` (← 同上。孤児のまま保全) |
| 縮小 | `Atender/Features/Rooms/RoomDetailView.swift` | `RoomDetailViewModel` + `RoomDetailView` のみ |

`project.yml` の `sources: [Atender]` はディレクトリ丸ごとなので、**ファイル追加/移動に project.yml の変更は不要** (`xcodegen generate` を走らせるだけ)。

---

## 9. DESIGN.md への置換 (本 doc の実行と同時に反映済)

「追記でなく置換」(Muraki/CLAUDE.md)。実施した置換:

| 節 | 旧 | 新 |
|---|---|---|
| §2 診断表 (月カレンダー行) | 「表組み罫線 vs 極薄 hairline。この画面が最も『10年前』の主因」 | 是正の方向が「罫線全廃」でなく「**時間割と同じ 1pt `borderSubtle` + 曜日ヘッダー帯**」であることを注記 (build 17 裁定) |
| §3.2 例外規定 | 「月カレンダー / 学期の出席カレンダーの**横** padding は `Space.s2`」 | **学期の出席カレンダーのみ**の例外に縮小。月カレンダーは padding 0 で 49.0pt (375pt 端末) |
| §3.6.2 グリッド線の原則 | 「線を引くなら 8% hairline、可能なら **gap 分離**」 | 「線は `AtenderGridLine` (`borderSubtle` 1pt) の単一定義。**gap 分離は使わない**」 |
| §3.6.3 セル分離 | 「**罫線を引かない (hairline 全廃)**。列間のみ 2pt gap。列幅は `EqualColumnsLayout` が…」 | 罫線の 4 規則 (縦 6 本 / 横 5 本 / ヘッダー境界なし / 外周なし) + `LazyVGrid` (`EqualColumnsLayout` は build 15 で撤回済) |
| §3.6.3 日セル | 「枠なし・角丸なし」 | 「セル自身は枠を持たず、**leading / top の罫線を overlay で引く**。罫線はレイアウトを消費しない」 |
| §3.6.3 外殻 | 「`Space.s2` の内側 padding」 | 「内側 padding 0 (グリッドがカードの縁まで届く)。曜日ヘッダー帯とカード外殻はページャの外側」 |
| §3.6.3 イベント | 「不透明 tint 面 + **2pt solid 左バー**」 | 「不透明 tint 面のみ。**左バーは持たない** (時間割セル §3.6.1 の 2pt 左バーは維持)」 |
| §3.6.3 高さ算出 | `gridAvailable(available:)` 経由 | `CalendarMonthLayout.rowHeight(available:)` 直接 |
| §3.6.4 (新設) | — | 学期の出席カレンダー = 円形バッジ格子。**罫線化の対象外**である理由 |
| §3.7.4 モーダルタイトル | 「`topBarLeading` + `sharedBackgroundVisibility(.hidden)` + 左寄せ + `minimumScaleFactor(0.75)`」 | 「**`.principal` (中央)** + `.lineLimit(1).minimumScaleFactor(0.5)`。`sharedBackgroundVisibility` は不要、`fixedSize()` は禁止」 |
| §7 検収表 #2 | 「月カレンダーは枠全廃 / 日セルに border が無い」 | 「時間割と同じ 1pt `borderSubtle` の内側罫線 + `bgMuted` の曜日ヘッダー帯。外周枠は無い」 |
| §7 検収表 #5 | 「§3.6.3 (枠全廃) / スプレッドシート枠廃止」 | 「§3.2 (余白) / §3.6.3 (面が主役・線は 1pt の内側罫線のみ)」 |
| §8 不採用案 | — | 3 件追加: gap 分離 / `TabView(.page)` / `topBarLeading` の大タイトル |

★ 旧 §3.6.3 L163「罫線全廃」と §4 L239 / §8 L288「内側は hairline」は**既に矛盾していた**。本置換で hairline (= 1pt `borderSubtle`) 側に一本化し、矛盾を解消した。

---

## 10. テスト基盤

- **ユニット**: 既存 `AtenderTests` (XCTest)。ベースライン **566 GREEN / 0 RED** (`.knowledge/known-failures.md` が正典)。
  実行: `/opt/homebrew/bin/xcodegen generate` → `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'`
- **UI**: `AtenderUITests` 10 本 + `ScreenshotFlow` 6。`localhost:8787` の API + `scripts/seed-demo-user.ts` のデモデータが前提 (停止時の失敗は「環境依存」)。
- **API**: `apps/api` の Vitest (`pnpm exec vitest run`)。ベースライン 17 failed (台帳 A1-A8 / B1-B5 / Magic Link 4) と集合一致であること。
- **新規テストの置き場所**:
  - `AtenderTests/B17CalendarGridRenderTests.swift` — #B4/#B6-#B13 (ImageRenderer + pixel 読み)
  - `AtenderTests/B17CalendarWindowTests.swift` — #B14-#B20
  - `AtenderTests/B17CalendarMonthStoreTests.swift` — #B21-#B34 (fake loader)
  - `AtenderTests/B17CalendarScreenLogicTests.swift` — #B35-#B44
  - `AtenderTests/B17ModalTitleTests.swift` — #B50-#B51
  - `AtenderUITests/B17ModalTitleUITests.swift` — #B52-#B54
  - `AtenderUITests/B17CalendarPagerUITests.swift` — #B45-#B49
  - `AtenderTests/RoomLogicTests.swift` に追記 — #B56-#B60
  - `apps/api/tests/room.test.ts` に追記 — #A1-#A5

### 10.1 意図的に壊れる既存テスト (**5 件**)

| テスト | フェーズ | 処置 |
|---|---|---|
| `BuildVersionTests.testV1BundleVersionIs16` | P1 | `17` に更新 (メソッド名も `testV1BundleVersionIs17`) |
| `CalendarLayoutTests.testU7GridAvailableSubtractsCardChrome` | P1 | **削除** (`cardChromeHeight` / `gridAvailable` が消えるため) |
| `CalendarLayoutTests.testU7GridAvailableNeverGoesNegative` | P1 | **削除** (同上) |
| `CalendarLayoutTests.testG17ToG20FormulasUnchanged` | P1 | `gridAvailable` を参照する 1 行を**削除** (シンボルが消えるためコンパイル不能。他の assert は残す) |
| `CalendarLayoutTests.testG16GridConstants` | P1 | `columnSpacing == Space.s0_5` (= 2) の 1 行を **`== 0` に置換** (#B1 の「列間 gap 0 / 分離は 1pt 罫線」と両立しない)。**緩めるのではなく厳密な新しい値に更新する** |

★ **当初 doc は「3 件」と書いていたが実測は 5 件だった。** 追加の 2 件は Architect の監査漏れ (下の「壊れないことを確認した既存テスト」で `columnSpacing` / `gridAvailable` を**リテラル値で assert している**テストを見落とした) であり、Developer の実装に非は無い。

**壊れないことを確認した既存テスト** (Reviewer が「なぜ緑のままか」を調べ直さずに済むように):

- `CalendarMonthRenderTests` #R1-#R4 / `B16CalendarSelectionRenderTests`: すべて**差分の対**での判定なので、罫線追加・chip の左バー削除・カード外殻の移動では invariant が壊れない。`CalendarMonth` の引数名も維持する (`anchor` / `selectedDate` / `events` / `daySummaries` / `onSelectDate`)。`onChangeAnchor` は default 付きで呼ばれていないので削除しても call site は無傷。
- `CalendarLayoutTests` の `columnWidths` 系 (#G1-#G8): 「等幅 / pixel 境界 / 非溢れ」の **invariant のみ**を見るメソッドは spacing 0 で緑。★ ただし**リテラル値を assert している 2 メソッドは例外で壊れる** (`testG16GridConstants` の `columnSpacing == 2` / `testG17ToG20FormulasUnchanged` の `gridAvailable` 参照)。上の表に処置を記載。
- `PersonalCalendarLogicTests` (#U6, 6 メソッド): `PersonalCalendarLogic.monthChanged` は本番から呼ばれなくなるが**関数は残す** (純関数 + テスト済。孤児化の事実は §10.2 に報告)。
- `RoomLogicTests` の `resolveDaySlots` 系: 新引数に default があるので既存呼び出しがそのままコンパイルできる。
- `DesignTokenTests` / `B16SymbolAndTokenTests`: `CalendarMonthLayout` のトークンを参照していない (grep 0 件)。
- `B16NavTrailingUITests` の `app.staticTexts["予定を追加"]` / `["予定を編集"]`: toolbar の placement を変えても `Text` は `staticText` として出る。`app.buttons["カレンダー"]` (segmented のセグメント) も不変。

### 10.2 孤児化の報告 (削除しない)

- `AvailabilityBar` / `BarRow`: build 16 以前から呼び出し元 0。**残す** (§7.1 #7)。消すかは「作った UI を捨てるか」のプロダクト判断で Architect の裁量外。
- `CalendarMonthLayout.columnWidths` (+ テスト 10 メソッド): build 15 の `EqualColumnsLayout` 撤回で本番未使用。**残す**。
- `PersonalCalendarLogic.monthChanged` (+ テスト 6 メソッド): P3 で本番未使用になる。**残す**。

### 10.3 検証手順 (実機ゲートの前に必ず通す)

1. `xcodegen generate` → ユニット全走 → **569 前後 GREEN / 0 RED** (566 − 2 削除 + 新規)。件数を `.knowledge/known-failures.md` に記録する。
2. `apps/api` の Vitest → 失敗集合がベースラインと**完全一致** (`diff` exit 0)。
3. `xcodebuild test -scheme AtenderUITests` (API 起動済) → `ScreenshotFlow` で `01-home-timetable` / `02-home-calendar` / `E02-room-detail` / `E03-room-timetable` を取り、**罫線・ヘッダー帯・chip の左バー無し**を目視。
4. TestFlight (build 17) で Touri が実機確認 — **最終ゲート**。

---

## 11. フェーズ (依存順・各フェーズ単独でマージ可能)

### P1 — 見た目と規格 (`feature/b17-grid-and-modal-title`)

内容: §3.2 罫線 + ヘッダー帯 / §3.3 chip の左バー削除 / §4.1 `AtenderGridLine` (時間割側の差し替え含む) / §4.2 レイアウト定数 / §6.6 モーダルタイトルを `.principal` へ / `project.yml` を `"17"` へ / **DESIGN.md の置換** (§9)。

- `CalendarMonth` / `CalendarWeekdayHeader` / `CalendarGrid` / `CalendarDayEventChip` / `CalendarMonthHeader` を `Features/Calendar/CalendarMonth.swift` へ切り出す (中身の統一は P2)。
- この時点で `PersonalCalendar` / `RoomCalendar` は**それぞれ**カード外殻と曜日ヘッダーを描く (まだ 2 箇所)。見た目は両方とも新仕様になる。
- テスト: #B1-#B13, #B50-#B55, #B61-#B63。壊れる 3 件を処置。
  - ★ #B54 (ルームの ICS モーダル) は P1 時点ではまだ **FAB `room-fab-ics`** から開く。P2 でヘッダーの `room-ics-import` に移るので、P1 では前者の identifier で書き、P2 で後者に差し替える。
- 単独マージ可: 機能は変わらず見た目とタイトル位置だけが変わる。

### P2 — 殻の統一 (`feature/b17-unify-calendar-shell`)

内容: §4.3 `CalendarMonthStore` / §4.5 `CalendarScreen` / §4.6 `atenderPageScroll` / §3.6 `CalendarModePicker` / §8 ファイル配置 / §5.4 学期文脈 (API + client) / §7 の機能移設。

- `PersonalCalendar` / `RoomCalendar` は `CalendarScreen` を構成するだけのアダプタになる。
- `RoomCalendar` に `available` を渡す (HomeBody / RoomDetailView 両方)。
- `HomeView` の toolbar から `if context == .self` を外し、**ルーム文脈でも学期メニューを出す** (歯車は `.self × .timetable` のまま)。
- `SelfTimetableView` / `RoomTimetable` の縦 ScrollView を `.atenderPageScroll()` に統一 (`scrollClipDisabled` を撤去)。
- 月めくりはこの時点では**まだ従来の chevron のみ** (ページャは P3)。`CalendarMonthHeader` の `canGoPrevious/canGoNext` はこのフェーズでは常に `true`。
- テスト: #B21-#B34, #B35-#B44, #B47-#B49, #B56-#B60, #A1-#A5。
- ★ **API を含むので、このフェーズが main に入ったら `atender-api` を Coolify にデプロイする** (uuid `tq2lgr4eh6t80r3tkqjbpu7o`)。ただし iOS が `semesterId` を送らない限り挙動は不変なので、デプロイ順序の制約は無い。

### P3 — 月スライド (`feature/b17-month-pager`)

内容: §3.5 ページャ / §4.4 `CalendarWindow` / 先読み / skeleton 全消しの廃止 / `CalendarMonth` の `DragGesture` と `onChangeAnchor` の削除 / ヘッダー chevron の窓端 disabled。

- テスト: #B14-#B20, #B45-#B46, #B30/#B30a/#B30b、および #B37/#B38 が実挙動として効いていることを #B46 で確認。
- 単独マージ可: P2 の殻の中の月コンテナを差し替えるだけ。
- ★ **設計の自己矛盾 (実装後の Claude 側レビューで発見・本 doc で修正済)**: 当初 #B30 は `setSemester` で `payloads` を全消しすると書いており、§3.5 の「1 度でも読めていたらグリッドを消さない」と正面衝突していた。実装は #B30 に忠実だったため**学期を切り替えると skeleton 全消しが復活**していた。設計docの中で「原則を書いた節」と「挙動仕様の 1 行」が食い違うと、Reviewer は挙動仕様側からテストを起こすので 2LLM 突合でも表面化しない。**原則を変えたら挙動仕様を全部 grep して突合すること。**

---

## 12. 不採用案

- **3 ページのローリングウィンドウ + めくったら index を中央に戻す**: 却下。researcher が iOS 26.5 の XCUITest で実測し、**1 スワイプで 2 ヶ月飛ぶ**のを `ScrollView`+`scrollPosition` 方式で 2/2 回、`TabView(.page)` 方式でも 1/3 回再現した。`Transaction.disablesAnimations` を入れても直りきらない (リセットとページング減速が別ランループで競合する)。窓を広く取って reset を捨てると両方式とも 2/2 回で 1 スワイプ = 1 ヶ月になる。
- **`TabView(.page)` を採る**: 却下。縦 `ScrollView` の中で `.frame(height:)` が無いと**高さ 0 に潰れる** (実測 0.0pt)。高さの定義が `CalendarMonthLayout.contentHeight` と呼び出し側の 2 箇所に分かれ、Dynamic Type でセルが伸びたときにクリップし、`.frame` を落とすと無言で消える。`containerRelativeFrame(.horizontal)` + `.scrollTargetBehavior(.paging)` は内容の自然高を取るのでこの分岐が要らない。指追従の UX は同一 (どちらも実測で 1 スワイプ = 1 ヶ月)。※ `GeometryReader` でページ幅を測る書き方は高さ 10pt に潰れるので**使わない**。
- **月カードごとページャに載せる (カード外殻も一緒に滑らせる)**: 却下。横 ScrollView の clip 境界がカードの縁と一致し、**カードの影が左右だけ切れる** (build 14 の実機 FB と同じ形)。`scrollClipDisabled` で逃がすと隣の月のカードが枠外に見える。外殻と曜日ヘッダーを静的に置き、中身だけ滑らせる形なら両方起きない。
- **`fixedSize()` でモーダルタイトルの幅を稼ぐ**: 却下。iOS 26.5 実測で幅 329pt になり、**back / close ボタンの下に潜り込んで重なる**。`layoutPriority(1)` は `.principal` では無効。効くのは `.lineLimit(1)` + `.minimumScaleFactor(0.5)` だけ。
- **モーダルタイトルを `topBarLeading` (左寄せ) のまま大きくする**: 却下。iOS 26 実測で leading item の幅バジェットは **31pt** しかなく、24pt bold のテキストは 2 文字 (`カ…`) に潰れて glass カプセルに閉じ込められる。これが要望 5 の症状そのもの。`.principal` は 247pt (iOS 26.5) / 277pt (iOS 18.2) 使える。
- **`.principal` に `sharedBackgroundVisibility(.hidden)` を付ける**: 却下 (不要)。実測で `.principal` には glass カプセルが**元々付かない** (付けた版と付けない版のスクショ・実測幅がともに一致)。付けても害はないが、効かない modifier を規格に残すと次の読者が「これが効いている」と誤読する。
- **月カレンダーのセル分離を gap (溝) で行う** (2026-07-2x の「罫線全廃」裁定): **撤回**。Touri 裁定 (2026-07-30)「時間割と完全に揃える」。gap 分離は (a) 溝が見えるためには gutter に色が要り結局は太い線になる (b) 当月外の背景色差が唯一の分離線になり当月外だけが灰色の塊で目立つ、という問題を抱えていた。
- **時間割セル (`EventTile`) の 2pt 左バーも消す**: 却下。要望 2 は「日付セル内の予定タイル」を名指ししている。時間割タイルは高さ ≥ 44pt でバーが情報として読め、tint 面だけだと連続コマの区切りが弱くなる。chip (高さ 14pt) とは条件が違う。
- **ルーム用に別のカレンダーコンポーネントを維持する**: 却下。Touri が明示的に禁止 (「基本的にひとつの万能な機能として作ってそれを使い回す実装にしたい。アプリ全体で」)。実際、個人で直した `scrollClipDisabled` / 月ヘッダー / FAB 廃止の 3 件がルームに未反映のまま 4 ビルド残っていた。
- **学期・科目タブの `AttendanceCalendar` も `CalendarScreen` に載せる**: 却下。あれは円形バッジの格子 + 複数選択モードで、日セルに予定 chip を積む表ではない。共通化すると `CalendarScreen` に「円モード」という分岐が生えて、統一の目的 (実装を 1 個にする) が壊れる。DESIGN.md §3.6.4 で対象外を明文化した。
- **時間割画面にも `CalendarScreen` 相当の殻を作る**: 却下 (今回は)。グリッド本体 `TimetableGrid` は既に共通で、残る差は「自分 = 編集可能 / ルーム = 読み取り専用」という相互作用の違い。殻に 6 個のクロージャを注入する形は 2 つのアダプタより長くなる。実害のあった非対称 (縦 ScrollView 設定) は `.atenderPageScroll()` で潰す。
- **窓の端に近づいたら月を継ぎ足す (無限スクロール)**: 却下。**先頭への継ぎ足しは researcher が測っていない** (測ったのは「49 ページを最初から並べる」形のみ)。`scrollPosition(id:)` を保ったまま先頭に要素を足したときの挙動は未知で、まさに 2 ヶ月飛びと同じ類型の競合を招きうる。±24 ヶ月 (前後 4 年) は学期単位のアプリとして十分。
- **月ヘッダーの `‹` `›` をページャ導入と同時に廃止する** (Apple / Google / TimeTree の月ビューはスワイプのみ): 却下。VoiceOver とスワイプを知らない利用者の唯一の導線を、Touri の裁定なしに消さない。窓端では `.disabled` にして「押しても何も起きない」を作らないことで両立させる。
- **ヘッダーの chevron を 32pt hit のまま据え置く** (build 13 の「縦幅を取る」FB を優先): 却下。DESIGN.md §6 の 44×44pt に例外を作ると、次に同じ議論を再演する。行高は `available` から算出されるので、ヘッダー +12pt の代償は行高 −2pt/行 (下限 70pt) にとどまる。
- **`CalendarMonthStore` を非ジェネリックにし、Payload に `personalOccurrences` と `roomEvents` の両方を持たせる**: 却下。「統一した部品」が 2 つの文脈の生データを両方抱えることになり、3 つ目の文脈が来るたびにフィールドが増える。`Extra` 1 個のジェネリックなら型で分離でき、`CalendarScreen` 自身は `Extra` を読まない (日別シートの builder に渡すだけ)。
- **`personalEvents` / `roomWeek` を月単位の新エンドポイントに置き換えて先読みを軽くする**: 却下 (今回は)。API 追加は破壊的でないとはいえ本設計のスコープ (見た目 + 統一) を超える。先読みは `Task(priority: .utility)` + 既存 `QueryClient` キャッシュ (隣接月は境界週を共有する) で足りる。必要になったら別設計で。
