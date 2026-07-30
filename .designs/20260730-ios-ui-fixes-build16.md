# iOS UI 修正 6 件 (build 16)

> 対象: `apps/ios` (SwiftUI) + `apps/web/public/character` (画像資産のみ)
> デザイン正典: `DESIGN.md`。本 doc の確定に合わせて **DESIGN.md 側も置換する** (§8 に置換リスト)
> 前提リサーチ: `Muraki/knowledge/library/swiftui-ios26-toolbar-glass-and-button-roles.md` / `library/swiftui-button-hit-area-measurement.md`

## 目的

実機 FB 6 件を「その場の修正」でなく規格として直す。(a) iOS 26 が toolbar item へ自動で付ける glass カプセルを外す、(b) カレンダー選択日を TimeTree 型のセル塗りにする、(c) 予定 chip の当たり判定を消し **日セル → 日別シート → 編集** の経路を personal/room で共通部品にする、(d) 全モーダルのヘッダーを `< タイトル ✕` の 1 行 (Apple 標準部品) に統一する、(e) 友達/ルームの重複見出しと全幅ボタンを nav bar trailing のアイコンに移す、(f) マスコットの alpha 破損 (ダークで穴が開く) を原画から再切り出しで直す。

---

## 0. スコープとフェーズ

### 0.1 フェーズ (依存順。各フェーズ単独で `main` にマージ可能)

| P | 内容 | 依存 | 触るファイル |
|---|---|---|---|
| **P1** | マスコット再切り出し (§3.6) + `CFBundleVersion` 16 | なし | `tools/mascot-recut.py` (新規)、`Assets.xcassets/mascot-hello.imageset/mascot-hello-1024.png`、`apps/web/public/character/*.png` (5)、`apps/ios/project.yml` |
| **P2** | ToolbarContent シム + 学期セレクト (§3.1) + 友達/ルーム trailing (§3.5) | なし | `Glass.swift`、`HomeCore.swift`、`FriendsView.swift`、`RoomsView.swift` |
| **P3** | モーダルヘッダー規格 (§3.4) を 3 chrome × 24 呼び出しに適用 | P2 (シム) | `Glass.swift`、`ModalHeader.swift` (新規)、`BottomSheetDetent.swift` (新規)、`BottomSheet.swift`、`SheetScaffold.swift`、`FullScreenModal.swift` |
| **P4** | 選択日のセル塗り (§3.2) + chip 非タッチ + 共通日別シート (§3.3) | P3 (ModalHeader / `navigationPath`) | `CalendarMonthLayout.swift`、`Color+Atender.swift`、`PersonalCalendar.swift`、`PersonalDaySheet.swift`、`CalendarDaySheet.swift` (新規)、`CalendarDaySheetLogic.swift` (新規)、`RoomDaySheet.swift` (新規)、`RoomDetailView.swift`、`RoomSheets.swift`、`RoomLogic.swift` |

`MIN_IOS_BUILD` は**据え置き** (wire 互換を壊す変更はゼロ)。backend デプロイ不要。

### 0.2 非スコープ (今回触らない)

- **ルームタブの廃止** (別設計doc)。ただし §3.5 の trailing 化は移設しやすい形を選ぶ (§3.5.3)
- `fix/ics-esm-import` ブランチ
- 月移動ヘッダーの二重実装 (`CalendarMonthHeader` = personal / `PeriodNav` = room)。共通化の余地はあるが今回の要望に含まれない
- `AvailabilityBar` (呼び出し元 0 の孤児。§9.3 で報告のみ)
- タブバー・大タイトル (DESIGN.md §3.8 / §3.7.1 で確定済)

---

## 1. 現状の実測 (この doc を書いた時点の main = `86c6b9d`)

| 事実 | 実測 |
|---|---|
| 学期セレクト | `HomeCore.swift:138-175` `SemesterMenu`。既に `Text + chevron.down` で `.foregroundStyle` も明示済。カプセルは iOS 26 の toolbar 側が描いている |
| 学期・科目タブの学期ピッカー | `SemesterOverviewSemesterMenu` (`SemesterOverviewView.swift:217`) は**コンテンツ内**に置かれており toolbar ではない → カプセルは付かない = §3.1 の対象外 |
| 選択日 | `PersonalCalendar.swift:412-416` `Circle().stroke(accent500, 1.5)`。`CalendarDayStyle.emphasis` が `.selected` を `.today` より優先 |
| 予定 chip | `PersonalCalendar.swift:445-450` `.contentShape(Rectangle())` + `.simultaneousGesture(TapGesture())`。personal は `onSelectEvent == nil` なので**タップを食って何も起きない** |
| モーダル chrome | `BottomSheet` (9 呼び出し) / `SheetScaffold` (14 呼び出し) / **`FullScreenModal` (1 呼び出し)** = **3 種 24 箇所**。タイトルは前 2 者が `.atenderLg`、`FullScreenModal` が `.atenderBase` 中央寄せ。★ ブリーフの「23 箇所」は `FullScreenModal` を数えていない |
| `FullScreenModal` の `<` | `chevron.left` も `xmark` も**同じ dismiss** を呼ぶ (機能重複) |
| 友達/ルーム | `FriendsView.swift:44` `Text("友達")` + 全幅ボタン、`RoomsView.swift:82` `Text("ルーム")` + 2 ボタン + `Button("みんなの時間割")` |
| マスコット | iOS = `mascot-hello` 1 枚。web = `public/character/*.png` 5 枚。**web アプリが参照しているのは `mascot-hello-1024.png` の 1 枚だけ** (`apps/web/src/components/ui/EmptyState.tsx:23`)、他 4 枚は現状**未参照** |
| 版数 | `project.yml:49` `CFBundleVersion: "15"` |
| iOS テスト | 台帳の記録は **398 GREEN / 0 RED** (`3939509`, 2026-07-29)。以後 build 14 の `+37` 等が加算済。★ CLAUDE.md の「157 GREEN 基準」は陳腐化しており本 doc で数値の正典としない (§7.1) |

---

## 2. UI/UX 全体像

```
┌─ ホーム ──────────────────────────┐   ┌─ 友達 ───────────────────────┐
│ 2026 前期 ⌄            [⚙]        │   │       友達          [👤+]    │  ← nav bar trailing
│  ↑カプセル無しの素テキスト (§3.1)  │   ├──────────────────────────────┤
├───────────────────────────────────┤   │ 受信した申請 (1)             │  ← 重複見出し削除
│ [自分][情報処理科] [+]            │   │ ...                          │
│ ┌─時間割─┬─カレンダー─┐           │   └──────────────────────────────┘
│ 月 火 水 木 金 土 日               │   ┌─ ルーム ─────────────────────┐
│ ...                               │   │      ルーム            [+⌄]  │  ← +⌄=作成/リンクで参加
│ ░░░ ← 選択日はセル全高グレー(§3.2) │   ├──────────────────────────────┤
│ ⑮  ← 今日は accent 塗り丸 (併存)  │   │ [ルームカード] ...           │
│ ▁▁▁ ← chip はタップ不可 (§3.3)    │   └──────────────────────────────┘
└───────────────────────────────────┘
        │ 日セル tap                        │ 日セル 長押し
        ▼                                   ▼
┌─ 日別シート (BottomSheet) ─────────┐   同じシートを editor から開く
│ ══                                 │
│  7月15日 (水)              (✕)     │  ← §3.4: タイトル 2xl bold / ✕ = Button(role:.close)
│ ─────────────────────────────────  │
│ 授業 (2)                           │
│ │ プログラミング演習  9:00-10:30   │  ← タップ不可
│ 予定 (1)                           │
│ │ バイト  18:00-22:00        ›     │  ← タップ → push
│ [＋ 予定を追加]                    │
└────────────────────────────────────┘
        │ push (NavigationStack)
        ▼
┌────────────────────────────────────┐
│ ══                                 │
│ (‹)  予定を編集            (✕)     │  ← ‹ = system back (iOS 26) / 自前 chevron (〜25)
│ ─────────────────────────────────  │
│ タイトル / 日時 / 繰り返し / 色 …  │
│ [保存] [削除]                      │
└────────────────────────────────────┘
```

**状態の置き場所**

| state | 置き場所 | 理由 |
|---|---|---|
| `activeDayDate: String?` (どの日のシートが開いているか) | `PersonalCalendar` / `RoomCalendar` の `@State` | 画面が持つ「開閉」。シート側は date を受け取るだけ |
| `dayPath: NavigationPath` (list ⇄ editor) | 同上 `@State` (BottomSheet と CalendarDaySheet の両方に `Binding` で渡す) | `NavigationStack` は `BottomSheet` が所有するので path は**その外側**に置かないと共有できない。長押し起動 (最初から editor) も初期 path で表現できる |
| 実測高 (`contentHeight` / `footerHeight` / `chromeHeight`) | `BottomSheet` の `@State` | 既存踏襲 (§3.4.4) |
| 編集フォームの入力値 | `PersonalEventEditorContent` / `RoomEventEditorContent` の `@State` | 既存踏襲 |

---

## 3. 設計

### 3.1 学期セレクトを「テキストだけ」にする (要望 1)

#### 3.1.1 `#available` の置き場所 — ToolbarContent 用シムを `Glass.swift` に置く

`ToolbarContent` は `View` ではないので既存の `atenderGlass()` シムには入らない。`Glass.swift` の規約「★ ここが `#available` の唯一の置き場所。Feature 層に `#available` を書かない」を守るため、**`Glass.swift` に ToolbarContent 用シムを追加する** (Feature 層と `ModalHeader.swift` には `#available` を書かない)。

```swift
// Atender/Core/DesignSystem/Glass.swift に追記
extension ToolbarContent {
    /// iOS 26 が toolbar item に自動で付ける glass カプセルを外し、素の中身にする。
    /// iOS 25 以下にカプセルは存在しないので何もしない (pixel diff 0 / researcher 実測)。
    @ToolbarContentBuilder
    func atenderPlainToolbarBackground() -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            self.sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}
```

- `sharedBackgroundVisibility(_:)` は `extension ToolbarContent` の iOS 26.0+ API、引数は素の `Visibility` (researcher が swiftinterface で逐語確認)
- `@ToolbarContentBuilder` + `#available` の組は iOS 17.0 target で typecheck 済 (researcher)。`ToolbarContentBuilder` は `buildLimitedAvailability` を持つ
- **`.buttonStyle(.plain)` は使わない** (完全に無効。素の版と screenshot が md5 一致)

#### 3.1.2 `SemesterMenu` の変更 (`HomeCore.swift`)

```swift
// HomeView.body の toolbar
if context == .self {
    ToolbarItem(placement: .topBarLeading) {
        SemesterMenu(semesters: semesters, semesterId: $semesterId)
    }
    .atenderPlainToolbarBackground()          // ★ 追加
}
```

`SemesterMenu` 本体:

- **`HStack { Menu {...}; Spacer() }` の外側 `HStack` と `Spacer()` を削除**し、`Menu` を直接 body にする (toolbar item 内の `Spacer` は幅を無駄に取る)
- ラベルの色は **設計で確定** (OS 依存を消す。iOS 26=label 黒 / iOS 18=accent 青になる問題):
  - 学期名: `.font(.subheadline).fontWeight(.semibold).foregroundStyle(Color.textSecondary)` (現状維持)
  - chevron: `.font(.caption2).foregroundStyle(Color.textTertiary)` (現状維持)
  - `Menu` 自体に `.tint(Color.textSecondary)` を**追加** (明示指定していない部分が accent に落ちるのを潰す)
- `.accessibilityIdentifier("home-semester-menu")` を追加 (現状は無いので実機/UITest から掴めない)

### 3.2 カレンダー選択日をセル全高のグレー塗りにする (要望 2)

#### 3.2.1 スタイル判定を 2 系統に分ける (純関数)

現行 `CalendarDayStyle.emphasis` は `selected > today` の優先順位を持つため、**今日を選択すると accent 丸が消える**。要望は「グレー背景 + accent 丸の併存」なので、`selected` を emphasis から外し、独立した述語にする。

```swift
// Atender/Core/Timetable/CalendarMonthLayout.swift (既存ファイル、import は CoreGraphics のまま)

enum CalendarDayEmphasis: Equatable {
    case today
    case outsideMonth
    case normal
    // ★ .selected は廃止 (選択はセル背景で表す。§3.2.2)
}

enum CalendarDayStyle {
    /// 日付数字の見せ方。Priority: today > outsideMonth > normal
    /// ★ selectedDate は受け取らない (選択は emphasis ではなくセル背景で表す)
    static func emphasis(date: String, todayString: String, monthFirst: String) -> CalendarDayEmphasis {
        if date == todayString { return .today }
        if CalendarRange.monthFirst(date) != monthFirst { return .outsideMonth }
        return .normal
    }

    /// セル全高のグレー塗りを敷くか。当月内外を問わない (選択直後に anchor が動くため区別する意味がない)
    static func isSelected(date: String, selectedDate: String) -> Bool {
        !date.isEmpty && date == selectedDate
    }

    /// 当月外の日はイベント chip / ステータスドットを描かない (変更なし)
    static func showsDayContent(date: String, monthFirst: String) -> Bool { ... }
}
```

#### 3.2.2 塗りの値と形

```swift
// Atender/Core/DesignSystem/Color+Atender.swift に追記
/// 月カレンダーの選択日のセル塗り (§3.6.3)。tertiarySystemGroupedBackground。
static let calendarSelectedDay = Color.bgMuted
```

- **なぜ `bgMuted` (= `tertiarySystemGroupedBackground`) か**: (a) semantic system color なので CLAUDE.md「中立の見た目はシステムに明け渡す」に従う (自前 hex を持ち込まない) (b) カード面が `bgElevated` (= `secondarySystemGroupedBackground`) であり、`tertiary` はその**上に載る想定でシステムが設計した同族の 1 段**なので、light (#FFF の上に #F2F2F7) / dark (#1C1C1E の上に #2C2C2E) の両方で「カード面の 1 段だけ濃い影」として成立する (c) 半透明 fill (`systemFill`) と違い**不透明**なので、DESIGN.md §3.6.1「透過をやめる」と整合する
- **新規トークン値は作らない** (DESIGN.md §8)。上記は既存 semantic への別名で、「選択日の塗り」という役割名を 1 箇所に集めるためだけに置く。強さを調整したくなったときの変更点もここ 1 行
- 形: `RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)` (DESIGN.md §3.1 が「日セル (月カレンダー)」に `Radius.sm` = 10 を割り当てている)
- **今日の accent 塗り丸は変更しない**。今日かつ選択の日は「グレーのセル + accent 丸」が併存する

#### 3.2.3 適用位置 (順序が唯一のリスク)

`PersonalCalendar.swift` の `dayCell` 末尾。researcher が 4 バリアント × 9 点タップ + 長押しで「背景を敷いてもタップ判定は壊れない」を実測済。**効くのは `.frame(height:)` との順序だけ**。

```swift
        .padding(.horizontal, 3)
        .padding(.vertical, 2)
        .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        .frame(height: rowHeight)                                  // ← 既存: サイズ確定
        .background(                                               // ★ 追加はここ (L467 と L469 の間)
            CalendarDayStyle.isSelected(date: date, selectedDate: selectedDate)
                ? Color.calendarSelectedDay : Color.clear,
            in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
        )
        .contentShape(Rectangle())                                 // ← 既存: 当たり判定
        .conditional(onLongPressDate != nil) { ... }               // ← 既存
        .onTapGesture { onSelectDate(date) }                       // ← 既存
```

`.frame(height:)` **より前**に置くと塗りが intrinsic 高さになる (視覚バグ)。逆順を書かないこと。

#### 3.2.4 accent アウトライン丸の削除

`dayCell` の `.overlay { if emphasis == .selected { Circle().stroke(...) } }` (L412-416) を**削除**。`dayNumberColor` の `case .selected` も削除 (enum から消えるので網羅性でコンパイラが検出する)。

### 3.3 予定 chip の非タッチ化と「日セル → 日別シート」の共通部品化 (要望 3)

#### 3.3.1 chip 非タッチ化

`PersonalCalendar.swift` の chip (L428-451) から次を**削除**する:

- `.contentShape(Rectangle())` (L445)
- `.simultaneousGesture(TapGesture().onEnded { ... })` (L446-450)

さらに chip を並べる `VStack` (L427-462) に **`.allowsHitTesting(false)`** を付ける (意図を型/修飾子として残し、将来 chip に gesture が足されても親のタップを食わないようにする)。

`CalendarMonth` から **`onSelectEvent` prop を削除**する (producer が消えるため。`RoomCalendar` の唯一の呼び出しも削除)。personal / room の**両方**で chip はタップ不可になる。

chip 自体を独立 View に切り出す:

```swift
// CalendarDaySheet.swift または PersonalCalendar.swift 内
/// 月カレンダー日セルの予定 chip。★ 意図的に「タップ不可」— 閉包を一切受け取らない
struct CalendarDayEventChip: View {
    let event: CalendarEvent
    var body: some View { /* 現行 L429-444 の描画をそのまま移設 */ }
}
```

API に閉包が無いこと自体が「非タッチ」の契約になる (§7.3 で検証範囲を明記)。

#### 3.3.2 共通部品の切り分け

Touri 指示「そもそも実装は同じもの、部品を使って共通にして欲しい」に対して、**共通化するのは「日セル → 日別シート(一覧) → 編集 の操作経路と器」**、**画面固有にするのは「一覧に何を出すか」と「編集フォームの中身」**とする。

| 層 | 名前 | 置き場所 | personal | room |
|---|---|---|---|---|
| 純ロジック | `CalendarDaySheetLogic` / `CalendarDayEditorTarget` / `CalendarDaySection` / `CalendarDayRow` | `Core/Timetable/CalendarDaySheetLogic.swift` (新規) | 共通 | 共通 |
| 器 (View) | `CalendarDaySheet<Editor>` + `CalendarDayRowView` | `Features/Calendar/CalendarDaySheet.swift` (新規) | 共通 | 共通 |
| アダプタ | `PersonalDaySheet` | `Features/Calendar/PersonalDaySheet.swift` (書き換え) | ○ | — |
| アダプタ | `RoomDaySheet` | `Features/Rooms/RoomDaySheet.swift` (新規) | — | ○ |
| フォーム | `PersonalEventEditorContent` (既存) / `RoomEventEditorContent` (新規=抽出) | 既存 / `RoomSheets.swift` | ○ | ○ |

#### 3.3.3 ルーム側の経路の変更点

| 操作 | 現行 | build 16 |
|---|---|---|
| 日セル tap | 選択日が変わるだけ (シート無し) | **日別シート (一覧) を開く** |
| 日セル 長押し | 何も起きない (`onLongPressDate` を渡していない) | **日別シートを editor から開く (新規作成)** |
| chip tap | `RoomEventEditSheet` を直接開く | **不可** (§3.3.1) |
| FAB「予定を追加」 | `RoomEventCreateSheet` | **日別シートを editor から開く** (`selectedDate` に対して。長押しと同一経路) |
| FAB「ICS 取り込み」 | `IcsImportWizard` | 変更なし |
| 予定の編集 | chip 直タップ | **日別シート一覧の行タップ → push** |

`RoomEventCreateSheet` / `RoomEventEditSheet` は呼び出し元 0 になるので**削除**し、中身を `RoomEventEditorContent` に移す。UI 要素は 1 つも失わない (§9.3 に対応表)。

### 3.4 モーダルヘッダー規格 (要望 4)

#### 3.4.1 満たす制約と解

| 制約 | 解 |
|---|---|
| `<` タイトル `✕` が 1 行 | sheet 内 `NavigationStack` の nav bar 1 行に 3 つの ToolbarItem を並べる |
| タイトルは `.atender2xl` bold | `ToolbarItem(placement: .topBarLeading)` に `Text` を置き、`.atenderPlainToolbarBackground()` でカプセルを消す。inline nav title (~17pt semibold) は**使わない** |
| `<` は Apple 標準部品 | `NavigationStack` に push した先で**システムの back** が出る (iOS 26 = 円形 glass chevron。`.navigationTitle` 無しでも出ることを researcher が iOS 26.5 で実測) |
| `✕` は Apple 標準部品 | `ToolbarItem(placement: .topBarTrailing) { Button(role: .close) { } }` (iOS 26 の toolbar 内では円形 glass の ✕ になる) |
| 全モーダル共通 | `BottomSheet` / `SheetScaffold` / `FullScreenModal` の 3 chrome が同じ modifier を使う → 24 呼び出し側は**無変更** |

iOS 17〜25 のフォールバック:

- `✕` → 現行の自前丸 ✕ (36pt / `textPrimary.opacity(0.08)` 円)
- `<` → **システム back を隠して自前 chevron 丸**にする。理由は、`.navigationTitle("")` の親から push すると **iOS 25 以下のシステム back のラベルが英語 "Back" になる** (このアプリは `.lproj` を持たない。`Muraki/knowledge/gotcha/ios-japanese-ui-shipped-as-english-bundle.md`)。日本語 UI に英語が出るのを避ける
- iOS 26 では**隠さない** (システムの円形 glass back をそのまま使う = 要望「Apple 標準部品」)

#### 3.4.2 `Glass.swift` に追加する OS 分岐 (ModalHeader.swift には `#available` を書かない)

```swift
// Atender/Core/DesignSystem/Glass.swift に追記
enum AtenderModalToolbar {
    static let closeIdentifier = "sheet-close"      // 既存 UITest の掴み所を維持
    static let backIdentifier = "sheet-back"

    /// iOS 26 は NavigationStack のシステム back をそのまま使う。25 以下は自前に差し替える
    static var usesSystemBack: Bool {
        if #available(iOS 26.0, *) { return true }
        return false
    }

    @ToolbarContentBuilder
    static func close(action: @escaping () -> Void) -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            ToolbarItem(placement: .topBarTrailing) {
                Button(role: .close, action: action)
                    .accessibilityIdentifier(closeIdentifier)
                    .accessibilityLabel("閉じる")
            }
        } else {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: action) { AtenderLegacyGlyphButtonLabel(symbol: "xmark") }
                    .accessibilityIdentifier(closeIdentifier)
                    .accessibilityLabel("閉じる")
            }
        }
    }

    /// iOS 25 以下用の自前 back (26 では呼ばない)
    static func legacyBack(action: @escaping () -> Void) -> some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button(action: action) { AtenderLegacyGlyphButtonLabel(symbol: "chevron.left") }
                .accessibilityIdentifier(backIdentifier)
                .accessibilityLabel("戻る")
        }
    }
}

/// iOS 25 以下の自前丸ボタンのラベル (現行 BottomSheet の ✕ と同寸)
struct AtenderLegacyGlyphButtonLabel: View {
    let symbol: String
    var body: some View {
        Image(systemName: symbol)
            .font(.atenderSm.weight(.bold))
            .foregroundStyle(Color.textPrimary)
            .frame(width: 36, height: 36)
            .background(Color.textPrimary.opacity(0.08), in: Circle())
            .contentShape(Circle())
    }
}
```

`Button(role: .close, action:)` はラベル省略 init (`iOS 26.0+`、`Label == DefaultButtonLabel`)。researcher が SDK 26.5 で実在確認済。**`.buttonStyle(.glass)` は付けない** (toolbar 内では付けないほうが円形 ✕ になる)。

#### 3.4.3 `ModalHeader.swift` (新規)

```swift
// Atender/Core/DesignSystem/Components/ModalHeader.swift
import SwiftUI

enum ModalHeader {
    /// ★ 全モーダル共通のタイトル書体 (DESIGN.md §3.7.4)
    static var titleFont: Font { .atender2xl.weight(.bold) }
}

private struct ModalHeaderModifier: ViewModifier {
    let title: String?
    let showsBack: Bool
    let onBack: (() -> Void)?
    let onClose: () -> Void

    func body(content: Content) -> some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(showsBack && !AtenderModalToolbar.usesSystemBack)
            .toolbar {
                legacyBackItem
                titleItem
                AtenderModalToolbar.close(action: onClose)
            }
    }

    @ToolbarContentBuilder
    private var legacyBackItem: some ToolbarContent {
        if showsBack, !AtenderModalToolbar.usesSystemBack, let onBack {
            AtenderModalToolbar.legacyBack(action: onBack)
        }
    }

    @ToolbarContentBuilder
    private var titleItem: some ToolbarContent {
        if let title {
            ToolbarItem(placement: .topBarLeading) {
                Text(title)
                    .font(ModalHeader.titleFont)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .accessibilityAddTraits(.isHeader)
            }
            .atenderPlainToolbarBackground()
        }
    }
}

extension View {
    /// モーダルの 1 段目 (タイトル + 閉じる)
    func atenderModalHeader(title: String?, onClose: @escaping () -> Void) -> some View {
        modifier(ModalHeaderModifier(title: title, showsBack: false, onBack: nil, onClose: onClose))
    }
    /// モーダル内で push した 2 段目 (戻る + タイトル + 閉じる)
    func atenderModalDetailHeader(title: String?, onBack: @escaping () -> Void, onClose: @escaping () -> Void) -> some View {
        modifier(ModalHeaderModifier(title: title, showsBack: true, onBack: onBack, onClose: onClose))
    }
}
```

- toolbar item の左→右の順序は**宣言順**。iOS 26 は `[システム back] [タイトル] … [✕]`、iOS 25 以下は `[自前 back] [タイトル] … [✕]` になる
- `.sharedBackgroundVisibility(.hidden)` はタイトル item にだけ付ける。**back / ✕ には付けない** (本物のボタンなので glass のままが HIG 準拠)
- 自前丸ボタンは 36pt だが、toolbar の行が 44pt 高を確保するのでタップ領域は HIG を満たす (現行と同条件)

#### 3.4.4 ★ detent 実測 (`BottomSheet` の PreferenceKey) をどう担保するか

**問題**: 現行 `BottomSheet` は `headerHeight + contentHeight + footerHeight` を `PreferenceKey` で実測して `.height()` detent にスナップしている (`Components/BottomSheet.swift:34-41`)。ヘッダを nav bar に置き換えると `headerHeight` が測れず (システム描画)、`guard headerHeight > 0` に落ちて **全シートが `[.medium, .large]` に退行**する。

**決定**: ヘッダの実測を「**自前ヘッダの高さ**」から「**コンテンツ上端の y (= chrome 高)**」に変える。コンテンツには既に `GeometryReader` の背景が付いているので、**同じ reader から 2 つの preference を出す**だけで済む。

```swift
// Atender/Core/DesignSystem/Components/BottomSheetDetent.swift (新規)
import SwiftUI

enum BottomSheetSpace { static let name = "atender.bottomSheet.root" }

struct SheetContentHeightKey: PreferenceKey {
    static var defaultValue: CGFloat { 0 }
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
struct SheetFooterHeightKey: PreferenceKey { /* 同上 */ }
/// ★ 旧 SheetHeaderHeightKey を置換。値は「シート最上端からコンテンツ上端までの距離」
struct SheetChromeHeightKey: PreferenceKey { /* 同上 */ }

enum BottomSheetDetent {
    static let minHeight: CGFloat = 180
    static let maxScreenRatio: CGFloat = 0.92
    static let bottomInset: CGFloat = 8
    /// chrome 実測の上限 (grabber 25pt + nav bar 44pt ≈ 69pt。Dynamic Type 拡大の余裕を見て 160 で頭打ち)
    static let maxChromeHeight: CGFloat = 160

    /// 実測値の健全化。非有限・非正は 0 (= 未測定) に、過大は上限に丸める
    static func clampChrome(_ raw: CGFloat) -> CGFloat {
        guard raw.isFinite, raw > 0 else { return 0 }
        return min(raw, maxChromeHeight)
    }

    /// 返り値 nil = 未測定 (呼び出し側 detents にフォールバック)
    /// isPushed = true (editor を push 中) は中身を実測できないので画面比の上限を返す
    static func fittedHeight(chrome: CGFloat, content: CGFloat, footer: CGFloat,
                             screenHeight: CGFloat, isPushed: Bool) -> CGFloat? {
        guard screenHeight > 0 else { return nil }
        let ceiling = screenHeight * maxScreenRatio
        if isPushed { return ceiling }
        guard chrome > 0, content > 0 else { return nil }
        return min(max(chrome + content + footer + bottomInset, minHeight), ceiling)
    }
}
```

`BottomSheet` 側:

```swift
private var fittedDetents: Set<PresentationDetent> {
    guard let height = BottomSheetDetent.fittedHeight(
        chrome: chromeHeight, content: contentHeight, footer: footerHeight,
        screenHeight: UIScreen.main.bounds.height,
        isPushed: !(navigationPath?.wrappedValue.isEmpty ?? true)
    ) else { return detents }
    return [.height(height)]
}

private func sheetChrome() -> some View {
    VStack(spacing: 0) {
        Capsule()                                   // grabber (現行のまま)
            .fill(Color.borderEmphasis)
            .frame(width: 42, height: 5)
            .padding(.top, Space.s2)
            .padding(.bottom, Space.s3)
        NavigationStack(path: navigationPath ?? $ownPath) {
            VStack(spacing: 0) {
                ScrollView {
                    content()
                        .padding(.horizontal, Space.s5)
                        .padding(.bottom, Space.s5)
                        .background(
                            GeometryReader { proxy in
                                Color.clear
                                    .preference(key: SheetContentHeightKey.self, value: proxy.size.height)
                                    .preference(key: SheetChromeHeightKey.self,
                                                value: proxy.frame(in: .named(BottomSheetSpace.name)).minY)
                            }
                        )
                }
                footer()
                    .padding(Space.s5)
                    .background(Color.bgElevated)
                    .background(GeometryReader { proxy in
                        Color.clear.preference(key: SheetFooterHeightKey.self, value: proxy.size.height)
                    })
            }
            .background(Color.bgElevated)
            .atenderModalHeader(title: title, onClose: dismiss)
        }
    }
    .background(Color.bgElevated)
    .coordinateSpace(.named(BottomSheetSpace.name))
    .onPreferenceChange(SheetContentHeightKey.self) { contentHeight = $0 }
    .onPreferenceChange(SheetFooterHeightKey.self) { footerHeight = $0 }
    .onPreferenceChange(SheetChromeHeightKey.self) { chromeHeight = BottomSheetDetent.clampChrome(max(chromeHeight, $0)) }
}
```

- **なぜ `max` で溜めるか**: reader はコンテンツ側 (= ScrollView の中) にあるので、スクロールすると `minY` が減る。`max` で「静止時の値」に張り付かせる。上に引っ張って増える方向は `clampChrome` の上限と、そもそも overflow 時は天井 (92%) が支配するので影響しない
- **`.scrollBounceBehavior(.basedOnSize)` を `BottomSheet` の `ScrollView` に付ける** (内容が収まるときはバウンドしない = `minY` が動かない)
- **push 中は実測しない**: 押した先の preference が `NavigationStack` を越えて伝播するかは SwiftUI の保証が無いので賭けない。`isPushed` のときは無条件に画面高 92% にする (フォームは元々スクロールする長さなので、hug より確実に「入力欄が出せる」ほうを採る)
- **失敗時の挙動を先に決めておく**: `chromeHeight` が 0 のままなら `[.medium, .large]` (= 実測導入前の挙動) に落ちるだけで、シートは出る。壊れ方が「潰れる」ではなく「hug しない」に限定される

#### 3.4.5 `SheetScaffold` / `FullScreenModal`

```swift
// SheetScaffold: stored property は増やさない (private property を足すと memberwise init が private になり 14 呼び出しが壊れる)
var body: some View {
    VStack(spacing: 0) {
        Capsule()... // 現行のまま
        NavigationStack {                     // ★ path 不要 (push しない)
            VStack(spacing: 0) {
                ScrollView { content().padding(.horizontal, Space.s5).padding(.bottom, Space.s5) }
                footer().padding(Space.s5).background(Color.bgElevated)
            }
            .background(Color.bgElevated)
            .atenderModalHeader(title: title, onClose: { isPresented = false })
        }
    }
    .background(Color.bgElevated)
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.hidden)
    .presentationBackground(Color.bgElevated)
}
```

`FullScreenModal`: `fullScreenCover` の中身を `NavigationStack { ... .atenderModalHeader(title:onClose:) }` にし、**自前の `HStack` ヘッダ (chevron.left + 中央タイトル + xmark) を丸ごと削除**する。`chevron.left` と `xmark` が同じ dismiss を呼んでいた重複が解消され、タイトルは 2xl bold 左寄せに揃う。

### 3.5 友達 / ルームタブのヘッダー (要望 5)

#### 3.5.1 友達

- `FriendsView.swift:43-47` の `HStack { Text("友達"); Spacer(); AtenderButton("友達を追加") }` を**削除** (VStack の第 1 要素が `content(model)` になる)
- toolbar を追加:

```swift
.toolbar {
    ToolbarItem(placement: .topBarTrailing) {
        Button { addOpen = true } label: { Image(systemName: "person.badge.plus") }
            .accessibilityLabel("友達を追加")
            .accessibilityIdentifier("friends-add")
    }
}
```

`.atenderPlainToolbarBackground()` は**付けない** (本物のボタンは glass のままが HIG 準拠)。`person.badge.plus` は SF Symbols に実在 (SDK の `symbol_order.plist` で確認済)。

#### 3.5.2 ルーム

- `RoomsView.swift:79-96` の `header` プロパティを**削除**し、`body` の `VStack` から `header` の呼び出しを削除
- toolbar を追加 (**trailing は 1 item のみ**):

```swift
.toolbar {
    ToolbarItem(placement: .topBarTrailing) {
        Menu {
            Button("ルームを作成") { activeSheet = .create }
            Button("リンクで参加") { activeSheet = .join }
        } label: {
            Image(systemName: "plus")
        }
        .accessibilityLabel("ルームを追加")
        .accessibilityIdentifier("rooms-add")
    }
}
```

**「みんなの時間割」(`TemplatesView`) への導線は本 build で落とす** (Touri 裁定 2026-07-30)。行き先はルームタブ廃止の設計doc で決める。虫眼鏡 (`magnifyingglass`) の ToolbarItem は**作らない** — ルームタブ自体が無くなる前提で、いま置き場所を決めても移設のたびに作り直すことになるため。`RoomsRoute.templates` / `TemplatesView` のコードは**削除しない** (廃止設計で移設する資産。§9.4)。

- 空状態 (`EmptyState(actionTitle: "ルームを作成")`) は**残す** (DESIGN.md §5「空状態に主要タスクへの導線を含める」)

#### 3.5.3 ルームタブ廃止 (別 doc) への備え

上記 toolbar ブロックは `RoomsView` の `body` 末尾に**独立した `.toolbar { }` 1 ブロック**として置く。廃止時はこのブロックを移設先の画面へ丸ごと移せばよく、`activeSheet` / `router.roomsPath` 以外の依存を持たせない。**`header` 由来のレイアウト (VStack / spacing) に紐づける実装にしないこと。**

### 3.6 マスコット再切り出し (要望 6)

#### 3.6.1 原因 (確定)

現行資産は「白背景を落とす」際に**外周に連結した白かどうかを区別せずに白画素を全部抜いた**ため、輪の内側 (顔まわり) の白まで透明になっている。ダークモードで背景が透けて「キャラに穴が開く」。実測:

| ファイル | 画素 | 穴の個数 | 穴の総面積 | 最大の穴 |
|---|---|---|---|---|
| `mascot-hello-1024.png` (iOS/web 共通の実体) | 1024² | 1326 | 52,527 px (5.009%) | **30,159 px** |
| `mascot-chat.png` | 403² | 88 | 4,063 px (2.502%) | 2,647 px |
| `mascot-idea.png` | 406² | 58 | 5,589 px (3.391%) | 4,777 px |
| `mascot-laptop.png` | 313² | 55 | 1,638 px (1.672%) | 1,061 px |
| `mascot-run.png` | 355² | 57 | 794 px (0.630%) | 360 px |

「穴」の定義 = **画像外周に連結しない `alpha == 0` の 4-連結成分**。

#### 3.6.2 原画と切り出し窓 (Architect が実測して確定)

原画: `/Users/touri/Documents/Creatives/Developments/ProjectsData/Atender/ChatGPT Image 2026年7月9日 15_48_03.png` (1536×1024 / RGB / 白背景 / 5 ポーズ)。**`.tmp/mascot/` の画像は別キャラ (旧ノート型) なので使わない。**

ポーズ ↔ 窓の対応は、既存 web 資産 5 枚を 48×48 グレースケールに落として原画の連結成分と突合して確定した (chat=平均絶対差 2.9 / run=6.0 / laptop=9.3 / idea=19.5 で一意に決まる)。

| 名前 | x0 | x1 | y0 | y1 | shadowTop | 出力 |
|---|---|---|---|---|---|---|
| `mascot-hello-1024` | 420 | 1120 | 0 | 515 | 483 | 1024 |
| `mascot-chat` | 0 | 420 | 540 | 1024 | 850 | 403 |
| `mascot-run` | 420 | 780 | 540 | 1024 | 846 | 355 |
| `mascot-laptop` | 780 | 1115 | 540 | 1024 | 866 | 313 |
| `mascot-idea` | 1115 | 1536 | 540 | 1024 | 850 | 406 |

- **下段の窓は `y0 = 540` から始める** (500 ではない)。hello の接地影が **row 507 まで伸びており**、`y0 = 500` にすると run / laptop の出力上端に hello の影の帯が混入する (Architect が実測して踏んだ)
- **`shadowTop` は定数として設計が与える** (導出しない)。ブリーフの「行幅プロファイルの段差」規則は hello (row 483 で 260→300) では効くが、**laptop では最大の段差が +5px しかなく検出できない** (5 ポーズ全部で検証した)。x 方向の広がり (extent) の段差でも laptop は決まらない。したがって「機械的な規則」は存在しないと判断し、窓と同様に**人間が決めた定数**として表に置く。Developer は再導出しない
- 出力の一辺は**現行ファイルと同値**にする (framing とサイズを変えず、直す対象を alpha と影だけに限定するため)

#### 3.6.3 スクリプト (`tools/mascot-recut.py`、新規。Architect が実行して検証済)

```python
#!/usr/bin/env python3
"""Atender マスコットを原画シートから再切り出しする (alpha 破損の是正 + 接地影の除去)。
usage: python3 tools/mascot-recut.py <sheet.png> <outdir>
requires: opencv-python, pillow, numpy
"""
import sys, cv2, numpy as np
from PIL import Image

WHITE_MIN = 246       # これより明るい画素を「白」とみなす
FADE_PX = 6           # 脚の下端フェード幅
DROP_PX = 2           # 脚の下端の切り捨て
FEATHER_SIGMA = 0.7   # alpha の 1px フェザー (白背景の anti-alias の代替)
PAD = 48              # 正方 canvas の余白 (native px)

# name, x0, x1, y0, y1 (シート上の窓), shadowTop (この絶対行から下は接地影), out (出力の一辺)
POSES = [
    ("mascot-hello-1024",  420, 1120,   0,  515, 483, 1024),
    ("mascot-chat",          0,  420, 540, 1024, 850,  403),
    ("mascot-run",         420,  780, 540, 1024, 846,  355),
    ("mascot-laptop",      780, 1115, 540, 1024, 866,  313),
    ("mascot-idea",       1115, 1536, 540, 1024, 850,  406),
]

def foreground(rgb):
    """白背景を落とす。★外周に連結した白だけを背景とし、輪の内側の白は前景に残す"""
    white = (rgb.min(axis=2) > WHITE_MIN).astype(np.uint8)
    _, lab = cv2.connectedComponents(white, connectivity=4)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    return ~(np.isin(lab, list(border)) & (white == 1))

def cut(rgb, fg, x0, x1, y0, y1, shadow_top, out):
    win = rgb[y0:y1, x0:x1]
    m = fg[y0:y1, x0:x1]
    top = shadow_top - y0
    keep = m.copy()
    keep[top:, :] = False
    alive = m[top - 1, :].copy()           # 影帯の 1 行上で立っている列 = 脚
    for y in range(top, m.shape[0]):
        col = alive & m[y, :]
        keep[y, col] = True
        alive = col
        if not col.any():
            break
    a = keep.astype(np.uint8) * 255
    ys = np.where((a > 0).any(axis=1))[0]
    bottom = int(ys.max())
    for i in range(DROP_PX):
        a[bottom - i, :] = 0
    b = bottom - DROP_PX
    for i in range(FADE_PX):
        y = b - i
        if y < 0:
            break
        a[y, :] = (a[y, :].astype(np.float32) * (i + 1) / (FADE_PX + 1)).astype(np.uint8)
    a = cv2.GaussianBlur(a, (0, 0), FEATHER_SIGMA)
    ys, xs = np.where(a > 0)
    ay0, ay1, ax0, ax1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop_rgb, crop_a = win[ay0:ay1, ax0:ax1], a[ay0:ay1, ax0:ax1]
    h, w = crop_a.shape
    side = max(h, w) + PAD
    canvas = np.zeros((side, side, 4), np.uint8)
    oy, ox = (side - h) // 2, (side - w) // 2
    canvas[oy:oy + h, ox:ox + w, :3] = crop_rgb
    canvas[oy:oy + h, ox:ox + w, 3] = crop_a
    return Image.fromarray(canvas).resize((out, out), Image.LANCZOS)

def holes(img):
    """外周に連結しない alpha==0 の 4-連結成分 (= 穴) → (個数, 総面積, 最大面積)"""
    a = np.array(img)[..., 3]
    t = (a == 0).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(t, connectivity=4)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    hs = [int(stats[i][4]) for i in range(1, n) if i not in border]
    return len(hs), sum(hs), (max(hs) if hs else 0)

if __name__ == "__main__":
    sheet, outdir = sys.argv[1], sys.argv[2]
    rgb = np.array(Image.open(sheet).convert("RGB"))
    fg = foreground(rgb)
    for name, x0, x1, y0, y1, st, out in POSES:
        img = cut(rgb, fg, x0, x1, y0, y1, st, out)
        path = f"{outdir}/{name}.png"
        img.save(path)
        c, tot, mx = holes(img)
        print(f"{name}: {out}x{out} holes={c} total={tot} ({tot / (out * out) * 100:.4f}%) max={mx} -> {path}")
```

Architect 実行時の出力 (Developer はこれと一致することを確認する):

```
mascot-hello-1024: 1024x1024 holes=15 total=32 (0.0031%) max=5
mascot-chat: 403x403 holes=55 total=109 (0.0671%) max=30
mascot-run: 355x355 holes=47 total=119 (0.0944%) max=20
mascot-laptop: 313x313 holes=45 total=115 (0.1174%) max=17
mascot-idea: 406x406 holes=51 total=126 (0.0764%) max=15
```

#### 3.6.4 差し替え先

| 出力 | 差し替え先 |
|---|---|
| `mascot-hello-1024.png` | `apps/ios/Atender/Assets.xcassets/mascot-hello.imageset/mascot-hello-1024.png` **と** `apps/web/public/character/mascot-hello-1024.png` (同一ファイル) |
| `mascot-chat.png` / `mascot-idea.png` / `mascot-laptop.png` / `mascot-run.png` | `apps/web/public/character/` |

- `apps/web/dist/` はビルド生成物なので触らない
- `Contents.json` は変更不要 (ファイル名同一)
- web の 4 枚は現状**未参照**だが、将来使ったときに同じ穴を再導入しないよう今なおす

#### 3.6.5 受入基準 (機械判定可能)

「穴 0」は**成立しない基準**である: 承認済の参考出力 (`recut-final-mascot-hello-1024.png`) 自体に 16 個 / 27px の穴がある。LANCZOS 拡大の undershoot が alpha 端で 0 に張り付くため、**1〜30px の微小な穴は必ず残る**。よって基準は面積で切る:

- **(A) 面積 64px 以上の穴が 0 個** — 修正後の最大は 30px、現行の最大は 360〜30,159px (**12〜1000 倍の余裕**)
- **(B) 穴の総面積が全画素の 0.2% 以下** — 修正後は最大 0.1174%、現行は 0.630〜5.009%
- **(C) 6 ファイルすべてで A/B を満たす** (iOS 1 + web 5)

---

## 4. データモデル / 型

すべて iOS 内部型。**wire (DTO / API) の変更はゼロ。**

```swift
// Atender/Core/Timetable/CalendarDaySheetLogic.swift (新規、SwiftUI 非依存)

/// 日別シートで開く editor の宛先。NavigationStack の path 要素になるので Hashable
enum CalendarDayEditorTarget: Hashable {
    case create(date: String)                  // date = "yyyy-MM-dd"
    case edit(rowId: String, date: String)     // rowId の解釈は画面ごと (§4.1)
}

/// シートを開く意図
enum CalendarDayIntent: Equatable {
    case view      // 日セル tap
    case create    // 日セル 長押し / room の FAB
}

/// 一覧の 1 行 (View に渡す前に確定させる。色は hex 文字列のまま)
struct CalendarDayRow: Identifiable, Equatable {
    let id: String
    let colorHex: String
    let title: String
    let detail: String                          // "9:00-10:30" / "終日" 等
    let meta: String?                           // 場所 / メンバー名。nil で行を出さない
    let showsRecurrence: Bool
    let editorTarget: CalendarDayEditorTarget?  // nil = タップ不可 (授業行)
}

struct CalendarDaySection: Identifiable, Equatable {
    let id: String                              // "meetings" / "events" / "members"
    let title: String                           // "授業 (2)"
    let rows: [CalendarDayRow]
    let emptyText: String?                      // nil なら rows が空のときセクションを出さない
}
```

`rowId` の規約 (画面ごとの解釈):

| 画面 | `rowId` | 解決先 |
|---|---|---|
| personal | `PersonalEventOccurrenceDto.id` = `"\(seriesId):\(occurrenceDate)"` | `occurrences.first { $0.id == rowId }` |
| room | `CalendarEvent.id` = `"room:\(seriesId):\(occurrenceDate)"` | `RoomCalendarLogic.parseRoomEventKey(rowId)` → `weeks.flatMap(\.roomEvents).first { $0.seriesId == k.seriesId && $0.occurrenceDate == k.occurrenceDate }` |

---

## 5. API / 関数シグネチャ

### 5.1 純関数 (単体テスト対象)

```swift
// CalendarMonthLayout.swift
enum CalendarDayStyle {
    static func emphasis(date: String, todayString: String, monthFirst: String) -> CalendarDayEmphasis
    static func isSelected(date: String, selectedDate: String) -> Bool
    static func showsDayContent(date: String, monthFirst: String) -> Bool          // 変更なし
}

// CalendarDaySheetLogic.swift
enum CalendarDaySheetLogic {
    /// シートを開くときの初期 path。.create のときだけ editor から始める
    static func initialPath(intent: CalendarDayIntent, date: String) -> [CalendarDayEditorTarget]

    /// personal 用。meetings は CalendarEvent (kind == .meeting のみを渡す前提。他 kind は無視する)
    static func personalSections(date: String,
                                 meetings: [CalendarEvent],
                                 occurrences: [PersonalEventOccurrenceDto]) -> [CalendarDaySection]

    /// room 用。events はその日の CalendarEvent 全件 (kind で振り分ける)
    static func roomSections(date: String, events: [CalendarEvent]) -> [CalendarDaySection]

    /// editor ページのタイトル
    static func editorTitle(_ target: CalendarDayEditorTarget) -> String   // "予定を追加" / "予定を編集"
}

// RoomLogic.swift
enum RoomCalendarLogic {
    /// "room:<seriesId>:<occurrenceDate>" を分解する。形が違えば nil
    static func parseRoomEventKey(_ id: String) -> (seriesId: String, occurrenceDate: String)?
}

// BottomSheetDetent.swift  (§3.4.4 に全文)
enum BottomSheetDetent {
    static func clampChrome(_ raw: CGFloat) -> CGFloat
    static func fittedHeight(chrome: CGFloat, content: CGFloat, footer: CGFloat,
                             screenHeight: CGFloat, isPushed: Bool) -> CGFloat?
}
```

`personalSections` の生成規則:

1. `meetings` が空でなければ `id: "meetings"` / `title: "授業 (n)"` / 各行 `detail = PersonalDaySheetFormat.timeRange(startMinute:endMinute:)` / `meta = nil` / `showsRecurrence = false` / `editorTarget = nil` / `id = event.id` / `colorHex = event.color`。空なら**セクションを出さない** (`emptyText = nil`)
2. 常に `id: "events"` / `title: "予定 (n)"` / `emptyText: "予定はありません"`。各行 `id = occurrence.id` / `colorHex = occurrence.color ?? "#8b5cf6"` / `title = occurrence.title` / `detail = PersonalDaySheetFormat.occurrenceTime(occurrence)` / `meta = occurrence.location` / `showsRecurrence = occurrence.isRecurringOccurrence` / `editorTarget = .edit(rowId: occurrence.id, date: date)`
3. 並び順は引数の順序をそのまま使う (呼び出し側が既にソート済)

`roomSections` の生成規則:

1. 常に `id: "events"` / `title: "予定 (n)"` / `emptyText: "予定はありません"` — `events.filter { $0.kind == .roomEvent }` から。各行 `detail = PersonalDaySheetFormat.timeRange(...)` / `meta = event.subtitle` (作成者名) / `showsRecurrence = false` / `editorTarget = .edit(rowId: event.id, date: date)`
2. `events.filter { $0.kind == .meeting }` が空でなければ `id: "members"` / `title: "メンバーの授業 (n)"` / `editorTarget = nil` / `meta = event.subtitle`
3. 上記以外の kind (`.personal` 等) は**捨てる**

### 5.2 共通 View の公開契約

```swift
// Features/Calendar/CalendarDaySheet.swift (新規)
struct CalendarDaySheet<Editor: View>: View {
    let date: String
    let sections: [CalendarDaySection]
    let addTitle: String?                        // nil = 追加ボタンを出さない
    @Binding var path: NavigationPath
    let onClose: () -> Void
    @ViewBuilder var editor: (CalendarDayEditorTarget) -> Editor
    // 生成: CalendarDaySheet(date:sections:addTitle:path:onClose:) { target in ... }
}

/// 一覧の行 (personal / room 共通の見た目)
struct CalendarDayRowView: View {
    let row: CalendarDayRow
    let onTap: (() -> Void)?                     // nil = 非タップ (Button で包まない)
}

/// 月カレンダー日セルの予定 chip。★ 閉包を一切受け取らない = タップ不可
struct CalendarDayEventChip: View {
    let event: CalendarEvent
}
```

`CalendarDaySheet.body` の構成 (確定):

```swift
VStack(alignment: .leading, spacing: Space.s4) {
    ForEach(sections) { section in
        VStack(alignment: .leading, spacing: Space.s2) {
            Text(section.title).font(.footnote).foregroundStyle(Color.textSecondary)
            if section.rows.isEmpty {
                if let emptyText = section.emptyText {
                    Text(emptyText).font(.footnote).foregroundStyle(Color.textTertiary)
                }
            } else {
                ForEach(section.rows) { row in
                    CalendarDayRowView(row: row, onTap: row.editorTarget.map { target in { path.append(target) } })
                }
            }
        }
    }
    if let addTitle {
        AtenderButton(title: addTitle, variant: .primary) { path.append(CalendarDayEditorTarget.create(date: date)) }
            .accessibilityIdentifier("day-sheet-add")
    }
}
.accessibilityIdentifier("calendar-day-sheet")
.navigationDestination(for: CalendarDayEditorTarget.self) { target in
    ScrollView {
        editor(target).padding(.horizontal, Space.s5).padding(.bottom, Space.s5)
    }
    .background(Color.bgElevated)
    .atenderModalDetailHeader(
        title: CalendarDaySheetLogic.editorTitle(target),
        onBack: { if !path.isEmpty { path.removeLast() } },
        onClose: onClose
    )
}
```

`CalendarDayRowView` の見た目は現行 `PersonalDaySheet.row` を踏襲 (`bgMuted` 面 + `Radius.md` + 幅 2pt の色 Capsule + `minHeight: 44`)。room 側の行の見た目が personal に揃う (現行の色 15% tint 面は廃止) = 意図した統一。

### 5.3 アダプタ

```swift
// Features/Calendar/PersonalDaySheet.swift (全面書き換え)
struct PersonalDaySheet: View {
    let date: String
    let meetings: [CalendarEvent]
    let occurrences: [PersonalEventOccurrenceDto]
    @Binding var path: NavigationPath
    let onChanged: () async -> Void
    let onClose: () -> Void
}
// enum Mode / struct EditorTarget / private func row / private func section は削除
// PersonalDaySheetFormat は据え置き (DayDetailSheet が使用中)

// Features/Rooms/RoomDaySheet.swift (新規)
struct RoomDaySheet: View {
    let roomId: String
    let date: String
    let events: [CalendarEvent]                  // その日の CalendarEvent 全件
    let resolveRoomEvent: (String) -> RoomEventDto?   // rowId → DTO (RoomCalendar が weeks から解決)
    @Binding var path: NavigationPath
    let onChanged: () async -> Void
    let onClose: () -> Void
}

// Features/Rooms/RoomSheets.swift (RoomEventCreateSheet / RoomEventEditSheet を置換)
struct RoomEventEditorContent: View {
    let roomId: String
    let defaultDate: String
    let event: RoomEventDto?                     // nil = 新規
    let onSaved: () async -> Void
    let onDeleted: () async -> Void
    init(roomId: String, defaultDate: String, event: RoomEventDto?,
         onSaved: @escaping () async -> Void, onDeleted: @escaping () async -> Void)  // @State 初期化のため明示 init
}
```

`RoomEventEditorContent` は現行 2 シートの中身を 1:1 で移す (§9.3 の対応表)。保存/削除ボタンは**content の中**に置く (push 先には footer スロットが無い)。削除の `confirmationDialog` も移す。

### 5.4 呼び出し側 (`PersonalCalendar` / `RoomCalendar`)

```swift
// PersonalCalendar
@State private var activeDate: String?
@State private var dayPath = NavigationPath()
// enum PersonalCalendarSheet は削除 (date + path で表現できる)

private var daySheetBinding: Binding<Bool> {
    Binding(get: { activeDate != nil }, set: { if !$0 { activeDate = nil } })
}

// CalendarMonth の callback
onSelectDate: { date in
    let needsReload = PersonalCalendarLogic.monthChanged(anchor: model.anchor, date: date)
    model.selectDate(date)
    dayPath = NavigationPath(CalendarDaySheetLogic.initialPath(intent: .view, date: date))
    if needsReload {
        Task { await model.load(semesterId: semesterId); activeDate = date }
    } else {
        activeDate = date
    }
},
onLongPressDate: { date in
    model.selectDate(date)
    dayPath = NavigationPath(CalendarDaySheetLogic.initialPath(intent: .create, date: date))
    activeDate = date
}

// sheetHost
BottomSheet(title: PersonalDaySheetFormat.heading(date),
            isPresented: daySheetBinding,
            navigationPath: $dayPath) {
    PersonalDaySheet(date: date,
                     meetings: model.events(semesterId: semesterId).filter { $0.date == date && $0.kind == .meeting },
                     occurrences: model.occurrences(on: date),
                     path: $dayPath,
                     onChanged: { await model.load(semesterId: semesterId) },
                     onClose: { activeDate = nil })
}
```

★ 現行 `sheetHost` の `meetings` 引数は `filter { $0.date == date ? $0.kind == .meeting : false }` という三項演算で書かれている。等価な `&&` 形に直す (挙動は同じ)。

`RoomCalendar` も同型 (`activeDayDate` / `dayPath`)。FAB「予定を追加」は `dayPath = NavigationPath(initialPath(intent: .create, date: selectedDate)); activeDayDate = selectedDate` にする。`RoomCalSheet` enum は `.ics` のみ残す。

---

## 6. 挙動仕様

Reviewer はここからテストを作る。「見た目」項目のうち単体で検証できないものは §7.3 に分類を書く。

### 6.1 学期セレクト (§3.1)

- **#S1** iOS 26 で `SemesterMenu` を載せた `ToolbarItem` に glass カプセルが描かれない (素のテキスト + chevron) — 実機確認 (§7.3-b)
- **#S2** iOS 25 以下で `atenderPlainToolbarBackground()` を通した ToolbarItem の描画が、通していないときと変わらない (researcher が pixel diff 0 を実測) — 実機確認
- **#S3** 学期名の色は OS を問わず `Color.textSecondary`、chevron は `Color.textTertiary` (accent 青にならない) — 実機確認
- **#S4** 学期が 0 件のとき、ラベルは `"学期を選択"` (現行維持)
- **#S5** メニューから学期を選ぶと `semesterId` が更新され、選択中の項目に `checkmark` が付く (現行維持)
- **#S6** `context == .room` のとき toolbar に学期セレクトを出さない (現行維持)

### 6.2 選択日のセル塗り (§3.2)

- **#C1** `emphasis(date: "2026-07-17", todayString: "2026-07-17", monthFirst: "2026-07-01")` == `.today`
- **#C2** `emphasis(date: "2026-06-30", todayString: "2026-06-30", monthFirst: "2026-07-01")` == `.today` (today は outsideMonth に勝つ)
- **#C3** `emphasis(date: "2026-06-30", todayString: "2026-07-17", monthFirst: "2026-07-01")` == `.outsideMonth`
- **#C4** `emphasis(date: "2026-07-16", todayString: "2026-07-17", monthFirst: "2026-07-01")` == `.normal`
- **#C5** `isSelected(date: "2026-07-15", selectedDate: "2026-07-15")` == `true`
- **#C6** `isSelected(date: "2026-07-15", selectedDate: "2026-07-16")` == `false`
- **#C7** `isSelected(date: "", selectedDate: "")` == `false` (空文字は選択扱いにしない)
- **#C8** `isSelected` は当月外の日でも `true` を返す (`date == selectedDate` だけで決まる)
- **#C9** `Color.calendarSelectedDay` == `Color.bgMuted` (== `Color(uiColor: .tertiarySystemGroupedBackground)`)
- **#C10** `CalendarDayEmphasis` に `selected` ケースが存在しない (`.selected` を書いたコードはコンパイルできない)
- **#C11** 選択日を変えると `CalendarMonth` の描画が変わる (オフスクリーン描画の対で検証: `selectedDate` を A→B にすると PNG が変わる / 同じなら変わらない)
- **#C12** 今日を選択した日は「グレーのセル塗り」と「accent 塗り丸」が併存する — 描画差分で「`selectedDate == today` の描画」≠「`selectedDate` が他日の描画」かつ ≠「`todayString` が別日の描画」
- **#C13** 選択日にアウトラインの `Circle().stroke` を描かない — 実機/スクショ確認 (§7.3-b)

### 6.3 chip 非タッチ化 (§3.3.1)

- **#H1** `CalendarMonth` の init に `onSelectEvent` が無い (渡すコードはコンパイルできない)
- **#H2** `CalendarDayEventChip` の init は `event` のみを取る (閉包を渡すコードはコンパイルできない)
- **#H3** chip の上をタップすると**その日の日別シートが開く** (chip がタップを食わない) — 実機確認 (§7.3-c)
- **#H4** chip の描画は変わらない (色 tint 面 + 2pt 左バー + `Radius` 4 + 1 行 truncate + 最大 2 行 + 超過時 `+N`)。オフスクリーン描画で「chip を持つ日の描画」が非空であること (既存 #R1 の対で担保済)

### 6.4 共通日別シート (§3.3.2 / §5)

path とセクション:

- **#D1** `initialPath(intent: .view, date: "2026-07-15")` == `[]`
- **#D2** `initialPath(intent: .create, date: "2026-07-15")` == `[.create(date: "2026-07-15")]`
- **#D3** `editorTitle(.create(date:))` == `"予定を追加"` / `editorTitle(.edit(rowId:date:))` == `"予定を編集"`
- **#D4** `personalSections` は `meetings` が空のとき `"meetings"` セクションを含めない
- **#D5** `personalSections` は `meetings` が 2 件のとき `title == "授業 (2)"`、各行の `editorTarget == nil`
- **#D6** `personalSections` は `occurrences` が空でも `"events"` セクションを返し、`rows.isEmpty` かつ `emptyText == "予定はありません"`
- **#D7** `personalSections` の予定行は `editorTarget == .edit(rowId: "<seriesId>:<occurrenceDate>", date: date)`
- **#D8** `personalSections` の予定行は `color == nil` のとき `colorHex == "#8b5cf6"`
- **#D9** `personalSections` の予定行は `isRecurringOccurrence == true` のとき `showsRecurrence == true`
- **#D10** `roomSections` は `.roomEvent` を `"events"`、`.meeting` を `"members"` に振り分け、`.personal` を捨てる
- **#D11** `roomSections` の `"members"` 行は `editorTarget == nil`、`meta == event.subtitle`
- **#D12** `roomSections` は `.meeting` が 0 件なら `"members"` セクションを出さない
- **#D13** `parseRoomEventKey("room:abc:2026-07-15")` == `("abc", "2026-07-15")`
- **#D14** `parseRoomEventKey("meeting:xyz")` / `("room:abc")` / `("")` は `nil`
- **#D15** `parseRoomEventKey("room:abc:def:2026-07-15")` は `("abc", "def:2026-07-15")` (`maxSplits: 2` = occurrenceDate 側に `:` を残す。現行 `resolveRoomEvent` と同じ分解)

画面挙動 (§7.3-c: XCUITest / 実機):

- **#D16** personal で日セルを tap → 日別シートが開き、ヘッダのタイトルが `"7月15日 (水)"` 形式
- **#D17** personal で日セルを長押し → 同じシートが **editor** から開く (`<` が出ている)
- **#D18** 予定の行を tap → editor が push され、`<` で一覧に戻る
- **#D19** editor で保存すると一覧に戻り、一覧が更新されている (`onChanged` → 再取得)
- **#D20** `✕` を押すとシート全体が閉じる (editor を push 中でも 1 回で閉じる)
- **#D21** room で日セルを tap → 日別シートが開く (現行は選択が変わるだけ)
- **#D22** room で日セルを長押し / FAB「予定を追加」→ editor から開く
- **#D23** room の予定行 tap → `RoomEventEditorContent` が push され、保存/削除が現行と同じ結果になる
- **#D24** room の「メンバーの授業」行は tap しても何も起きない
- **#D25** 月が変わる日 (当月外) を tap したときは、再取得後にシートが開く (personal の現行挙動を維持)

### 6.5 モーダルヘッダー (§3.4)

- **#M1** `ModalHeader.titleFont` == `Font.atender2xl.weight(.bold)`
- **#M2** 全 24 呼び出しがヘッダ引数を変えずにコンパイルできる (`BottomSheet(title:isPresented:...)` / `SheetScaffold(title:isPresented:...)` / `FullScreenModal(title:isPresented:...)` のシグネチャは `navigationPath` 追加を除いて不変)
- **#M3** `BottomSheet` / `SheetScaffold` / `FullScreenModal` の `title` が nav bar 左に 2xl bold で 1 行に出る — 実機確認
- **#M4** iOS 26 で `✕` が円形 glass の xmark として出て、押すと閉じる — 実機確認 + `app.buttons["sheet-close"]` が存在すること
- **#M5** iOS 25 以下で `✕` が自前の丸 xmark として出て、押すと閉じる — 実機確認
- **#M6** push した先で iOS 26 は**システムの円形 back**、25 以下は**自前 chevron 丸**が出る。どちらも押すと一覧に戻る — 実機確認
- **#M7** `<` が英語 "Back" と表示されない (25 以下でシステム back を隠す) — 実機確認
- **#M8** 1 段目 (push していない状態) には `<` が出ない
- **#M9** `FullScreenModal` から `chevron.left` が消え、`✕` だけが残る (両方 dismiss だった重複の解消)
- **#M10** `clampChrome(0)` == 0 / `clampChrome(-5)` == 0 / `clampChrome(.nan)` == 0 / `clampChrome(69)` == 69 / `clampChrome(500)` == 160
- **#M11** `fittedHeight(chrome: 0, content: 300, footer: 0, screenHeight: 800, isPushed: false)` == `nil` (未測定 → 呼び出し側 detents)
- **#M12** `fittedHeight(chrome: 69, content: 0, footer: 0, screenHeight: 800, isPushed: false)` == `nil`
- **#M13** `fittedHeight(chrome: 69, content: 200, footer: 60, screenHeight: 800, isPushed: false)` == `337` (69+200+60+8)
- **#M14** `fittedHeight(chrome: 69, content: 20, footer: 0, screenHeight: 800, isPushed: false)` == `180` (下限)
- **#M15** `fittedHeight(chrome: 69, content: 2000, footer: 0, screenHeight: 800, isPushed: false)` == `736` (800×0.92 の上限)
- **#M16** `fittedHeight(chrome: 0, content: 0, footer: 0, screenHeight: 800, isPushed: true)` == `736` (push 中は実測不要で上限)
- **#M17** `fittedHeight(..., screenHeight: 0, isPushed: true)` == `nil`
- **#M18** 短いシート (例: 授業の詳細) が内容高に hug する (下に大きな余白が出ない) — 実機確認 (§7.3-b)。**hug しない場合の劣化は「`[.medium, .large]` になる」だけで、シートが出ない/潰れることはない**

### 6.6 友達 / ルームの nav trailing (§3.5)

- **#N1** 友達画面の本文に `Text("友達")` が存在しない (nav title のみ)
- **#N2** 友達画面の nav bar trailing に `person.badge.plus` ボタンがあり、押すと `AddFriendSheet` が開く (`friends-add`)
- **#N3** 友達画面から全幅の「友達を追加」ボタンが消えている
- **#N4** ルーム画面の本文に `Text("ルーム")` が存在しない
- **#N5** ルーム画面の nav bar trailing にあるのは `plus` メニュー (`rooms-add`) **1 個だけ** (虫眼鏡は置かない)
- **#N6** ルーム画面のどこにも「みんなの時間割」への導線が無い (本 build では導線なし。`rooms-templates` の identifier も存在しない)
- **#N7** `plus` メニューに「ルームを作成」「リンクで参加」の 2 項目があり、それぞれ対応するシートが開く
- **#N8** ルームが 0 件のときの `EmptyState` の「ルームを作成」導線は残っている
- **#N9** `person.badge.plus` / `plus` が `UIImage(systemName:)` で nil にならない (symbol 実在)

### 6.7 マスコット (§3.6)

- **#A1** 6 ファイルすべてで「面積 64px 以上の穴」が 0 個 (穴 = 外周に連結しない `alpha == 0` の 4-連結成分)
- **#A2** 6 ファイルすべてで穴の総面積が全画素の 0.2% 以下
- **#A3** ★ **負のコントロール**: 読み込んだ画像の中心付近に半径 20px の透明な円を打ち込むと、#A1 の判定が**必ず落ちる** (判定が無力でないことの証明)
- **#A4** 各ファイルの寸法が現行と同じ (1024/403/355/313/406 の正方)
- **#A5** `UIImage(named: "mascot-hello")` が nil でない (asset catalog から解決できる)
- **#A6** 接地影 (キャラ下の灰色の楕円) が無い — 目視確認 (§7.3-b)
- **#A7** ダークモードで顔まわり・輪の内側が白で塗られている (黒が透けない) — 実機確認

### 6.8 版数

- **#V1** `project.yml` の `CFBundleVersion` == `"16"`、`CFBundleShortVersionString` == `"1.0"` (据え置き)
- **#V2** `MIN_IOS_BUILD` (`apps/api/src/lib/clientVersion.ts`) は変更しない
- **#V3** `Atender/Info.plist` を手編集しない (`xcodegen generate` が再生成する)

---

## 7. テスト基盤

### 7.1 実行

```sh
cd apps/ios
/opt/homebrew/bin/xcodegen generate
xcodebuild test -project Atender.xcodeproj -scheme Atender \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'
```

- フレームワーク: XCTest (`AtenderTests`)。web/API のテストは**触らない** (今回 API 変更ゼロ)
- ★ **ベースラインは自分で測る**。台帳 (`.knowledge/known-failures.md` iOS 節) の記録は 398 GREEN / 0 RED (`3939509`, 2026-07-29) で、以後 build 14 の `+37` 等が加算されている。CLAUDE.md の「157 GREEN 基準」は陳腐化しているので信用しない。着手時に 1 回走らせて実数を台帳に記録する
- ★ 資産差し替え (P1) の後にテストが不自然に落ちたら **DerivedData を消して再実行**する (`gotcha/stale-deriveddata-false-red-after-resource-deletion.md`)
- iOS 26 側の目視は `xcrun simctl create "iPhone 16" ... iOS-26-5` で作った sim を使う (台帳「iOS 26.5 の iPhone 16 は既定で存在しない」)

### 7.2 テストの置き場所

| ファイル | 内容 |
|---|---|
| `AtenderTests/CalendarLayoutTests.swift` (既存を改訂) | #C1〜#C10 |
| `AtenderTests/CalendarMonthRenderTests.swift` (既存に追加) | #C11 / #C12 / #H4 (ImageRenderer の対比較) |
| `AtenderTests/CalendarDaySheetLogicTests.swift` (新規) | #D1〜#D15 |
| `AtenderTests/BottomSheetDetentTests.swift` (新規) | #M1 / #M10〜#M17 |
| `AtenderTests/MascotAlphaTests.swift` (新規) | #A1〜#A5 |
| `AtenderTests/DesignTokenTests.swift` (既存に追加) | #C9 / #N9 |

**#A1 の実装方法**: リポジトリのソースファイルを直接読む。`#filePath` から repo root を出す (`URL(fileURLWithPath: #filePath)` に `deletingLastPathComponent()` を 4 回 = `AtenderTests` → `apps/ios` → `apps` → root)。`UIImage(contentsOfFile:)` → `CGImage` を既知フォーマット (`CGImageAlphaInfo.premultipliedLast`) の bitmap context に描いて alpha を取り出し、外周から transparent 画素を BFS で塗って、届かなかった `alpha == 0` 画素の連結成分面積を数える。**アセットカタログのコンパイル結果ではなくソース PNG を測る** (6 ファイルを同一手順で見られる / 我々が管理しているのはソース側)。

### 7.3 何が担保でき、何が実機確認か

| 分類 | 対象 | 根拠 |
|---|---|---|
| **(a) 単体テストで担保** | #C1〜#C10, #D1〜#D15, #M1, #M10〜#M17, #A1〜#A5, #N9, #V1 | 純関数 / 定数 / ファイル |
| **(a') オフスクリーン描画で担保** | #C11, #C12, #H4 | `ImageRenderer` の PNG 等値。★ 「変わらないこと」だけでなく「同じ内容を別の日に足すと変わること」の**対**で書く (`pattern/offscreen-render-diff-pair-for-negative-drawing.md`)。`CalendarMonth` は `AppEnvironment` 不要でレンダリングできる (既存 `CalendarMonthRenderTests` が実証) |
| **(b) スクショ / 目視のみ** | #S1〜#S3, #C13, #M3〜#M7, #M18, #A6, #A7 | **toolbar の glass カプセル・`ButtonRole.close` の描画・detent の hug は UI 層のシステム描画で、単体テストから観測できない。** iOS 26.5 sim + iOS 18.2 sim の 2 本でスクショを撮って目視する |
| **(c) 当たり判定 / 遷移 (実機 or XCUITest)** | #H3, #D16〜#D25, #N2, #N6, #N7 | ★ XCUITest の tap は当たらなくても失敗しない (`gotcha/screenshot-byte-identity-conflates-noop-tap-with-lost-harness.md`)。**「タップした結果 `calendar-day-sheet` が存在する」を assert する形にする** (スクショの byte 一致で判定しない)。`AtenderUITests/ScreenshotFlow.swift` は寛容な収集ハーネスなので、ここに足す場合も判定は `waitForExistence` で書く |

**(c) の最小手順 (Touri の実機確認用)**:
1. ホーム → カレンダー → **予定 chip の真上をタップ** → その日の日別シートが開く (#H3)
2. 同じ日を**長押し** → editor から開く。`<` を押して一覧に戻る (#D17/#D18)
3. `✕` で閉じる (#D20)
4. ルーム → ルーム詳細 → カレンダー → 日セル tap → 日別シート → 予定行 tap → 編集 → 保存 (#D21/#D23)
5. 友達タブの右上 `person.badge.plus` → `AddFriendSheet` / ルームタブの右上 `+` メニュー → 「ルームを作成」「リンクで参加」の各シート (#N2/#N7)

---

## 8. DESIGN.md の置換 (Architect が本 doc と同時に実施)

grep して拾った該当箇所と処置。**追記でなく置換。**

| # | 場所 | 現行 | 処置 |
|---|---|---|---|
| 1 | §3.6.3 日セル行 | 「今日=accent 塗り丸、選択=accent アウトライン丸」 | 「今日=accent 塗り丸 / **選択=セル全高を `Color.calendarSelectedDay` (= `bgMuted` = `tertiarySystemGroupedBackground`) で `Radius.sm` 塗り**。今日かつ選択は両方描く」に**置換**。当月外の `bgMuted` 廃止と矛盾しない理由 (単一セルの能動的な強調であり、当月外の一括塗りとは役割が違う) を 1 行添える |
| 2 | §3.7.3 学期ピッカー | 体裁のみ規定 (色の指定が無い) | 色を明記して**置換**: 学期名 `textSecondary` / chevron `textTertiary` / `Menu` に `.tint(textSecondary)`。**toolbar に置く場合は iOS 26 の自動 glass カプセルを `sharedBackgroundVisibility(.hidden)` で外し素のテキストにする** (Touri 裁定 2026-07-30) |
| 3 | §3.7.2 見出し | 「詳細画面 (ルーム詳細 / テンプレート / 科目詳細 / **日別詳細**)」 | 見出しから「日別詳細」を外し、末尾に「**シートとして出す詳細 (日別シート・フォーム系) は §3.7.4 のモーダルヘッダー規格に従う。本節はタブの `NavigationStack` に push される画面の規約**」を足して**置換** |
| 4 | §3.7 の直後 | (無い) | **§3.7.4「モーダル / シートのヘッダー規格」を新設** (既存に競合記述が無いので新規節): `< タイトル ✕` を nav bar 1 行に。タイトル = `.atender2xl` bold 左寄せ (`sharedBackgroundVisibility(.hidden)`)。`✕` = `Button(role: .close)` を `ToolbarItem` に (iOS 26) / 自前丸 ✕ (〜25)。`<` = sheet 内 `NavigationStack` の system back (iOS 26) / 自前 chevron 丸 (〜25、システム back のラベルが英語になるため隠す)。**`BottomSheet` / `SheetScaffold` / `FullScreenModal` の 3 chrome で共通**。旧規格 (`.atenderLg` タイトル + 自前丸 ✕) は本節で廃止 |
| 5 | §3.4 タイポ表 | `atenderLg` = 「リスト行の主題、科目名 (詳細)」 | モーダルのタイトルが 2xl になったことを反映し、`atender2xl` の用途に「**モーダル/シートのヘッダータイトル (§3.7.4)**」を追記 (行の置換) |
| 6 | §8 不採用案 | — | 2 件追記: 「**選択日を accent アウトライン丸で示す**」= 却下 (今日の accent 丸と競合し、今日を選ぶと今日が消える。TimeTree 型のセル塗りに変更 / Touri 裁定 2026-07-30)、「**モーダルの `<` / `✕` を自前描画する**」= 却下 (iOS 26 に標準部品が実在。`ButtonRole.close` + `NavigationStack` の system back を使う) |
| 7 | §7 トレーサビリティ #2 | 「月カレンダー日セルに border が無い」 | **変更しない** (今回入れるのは border ではなく背景塗りなので主張は真のまま)。§3.6.3 側の 1 行で誤読を防ぐ (上記 #1) |

DESIGN.md 以外: `CLAUDE.md` の「ユニットテスト: … (157 GREEN 基準)」は陳腐化しているので**台帳参照に置換**する (§7.1)。

---

## 9. 壊れる / 消える既存資産

### 9.1 壊れるテスト = 6 件 (すべて `AtenderTests/CalendarLayoutTests.swift`)

`CalendarDayStyle.emphasis` から `selectedDate` 引数と `.selected` ケースが消えるため**コンパイルエラーになる**。これは事故ではなく「選択日の見せ方」の裁定変更 (2026-07-30) の反映なので、テスト側を書き換える。

| 現行テスト | 現行の期待 | 改訂後 |
|---|---|---|
| `testCA5SelectedWinsOverToday` | `.selected` | **削除** → #C1 (`.today`) と #C5 (`isSelected == true`) の 2 本に分割 |
| `testCA6TodayInCurrentMonth` | `.today` | 引数から `selectedDate` を外すだけ (#C1) |
| `testCA7TodayWinsOverOutsideMonth` | `.today` | 同 (#C2) |
| `testCA8OutsideMonthWhenNotSelectedOrToday` | `.outsideMonth` | 同 (#C3) |
| `testCA9NormalCurrentMonthDay` | `.normal` | 同 (#C4) |
| `testCA10SelectedWinsForOutsideMonth` | `.selected` | **削除** → #C3 (`.outsideMonth`) + #C8 (`isSelected == true`) |

**壊れないもの** (設計で壊さずに済ませた):

- `CalendarMonthRenderTests` の #R1〜#R4: `CalendarMonth(anchor:selectedDate:events:daySummaries:onSelectDate:)` の呼び出し形を保つ (`onSelectEvent` は default nil の付加 prop だったので削除しても呼び出し側は無変更)。#R1〜#R3 は 2 つの描画で `selectedDate` が同一なので、選択日の塗りが両方に等しく入り byte 等値の判定は保たれる
- `showsDayContent` 系 (#G9〜#G14) は無変更
- `SheetScaffold` の 14 呼び出し / `BottomSheet` の 9 呼び出し / `FullScreenModal` の 1 呼び出し: シグネチャを保つので無変更 (`SheetScaffold` に **private stored property を足さない**のが条件。足すと memberwise init が private になり 14 箇所が壊れる)
- `AtenderUITests/ScreenshotFlow.swift`: `"閉じる"` のラベルを新 `✕` にも付けるので現行の `tapButton("閉じる")` が生きる

### 9.2 削除するコード

| 対象 | 理由 |
|---|---|
| `PersonalDaySheet.Mode` / `.EditorTarget` / `private func row` / `private func section` / `editorContent` の自前 back | 共通部品に置換 (§3.3.2) |
| `PersonalCalendarSheet` enum | `activeDate: String?` + `dayPath` で表現 |
| `CalendarMonth.onSelectEvent` prop | producer が消える (§3.3.1) |
| `CalendarDayEmphasis.selected` / `dayNumberColor` の `case .selected` / 選択アウトラインの `.overlay` | §3.2 |
| `RoomEventCreateSheet` / `RoomEventEditSheet` | `RoomEventEditorContent` + 共通シートに置換 (§9.3) |
| `RoomDayEventList` | **今回の変更以前から呼び出し元 0** の孤児で、役割は共通日別シートが引き継ぐ |
| `FullScreenModal` の自前ヘッダ `HStack` | §3.4.5 |
| `SheetHeaderHeightKey` | `SheetChromeHeightKey` に置換 |

### 9.3 「UI を捨てていない」ことの対応表 (room 予定フォーム)

| 現行 | 移設先 |
|---|---|
| `RoomEventCreateSheet` の `LabeledInput("タイトル")` / `DatePicker("開始"/"終了")` / `RecurrencePicker` / `Picker("表示モード")` / 「保存」 | `RoomEventEditorContent` (`event == nil`) にそのまま |
| `RoomEventEditSheet` の同上 + 「削除」+ `confirmationDialog("予定を削除しますか？")` | `RoomEventEditorContent` (`event != nil`) にそのまま |
| `RoomEventEditSheet.parseISO` / `iso` / `save` / `delete` | `RoomEventEditorContent` に移設 (ロジック無変更) |
| シートの開閉 (`isPresented = false`) | `onSaved` / `onDeleted` の後に呼び出し側が path を pop (§5.2 の editor ページ) |

### 9.4 孤児化の報告 (Architect 判断で消さないもの)

- `AvailabilityBar` / `BarRow` (`RoomDetailView.swift:333-406`): **今回の変更前から呼び出し元 0**。ルームの「空き時間」表示という**機能**であり、捨てるかはプロダクト判断なので触らない。`RoomAvailability.compute` にはテストがある。→ Leader に報告のみ
- `PeriodNav`: room が使用中 (残す)
- **`TemplatesView` / `RoomsViewModel` 外の `RoomsRoute.templates`: 本 build で到達不能になる** (§3.5.2 の裁定)。実測した経路は以下:

  | 経路 | 実測 |
  |---|---|
  | `RoomsRoute.templates` を push する producer | **`RoomsView.swift:91` の 1 箇所だけ** (`Button("みんなの時間割")`)。§3.5.2 でこの `header` を削除するので producer が 0 になる |
  | `navigationDestination` の consumer | `MainTabView.swift:57-58` (`case .templates: TemplatesView()`)。**残す** (route enum も残すので、移設時は push を 1 行書くだけで復活する) |
  | deep link | `Core/DeepLink.swift` は `roomJoin` / `friendAdd` の 2 ケースのみ。**templates への deep link 経路は存在しない** → deep link で到達できるという逃げ道は無い |

  → **`TemplatesView` (画面) は孤児になるが、「公開時間割テンプレ」という機能自体は死なない**: `TimetableSettingsSheet.swift:218` が `timetableRepository.templates(query:)` を別経路で叩いており、時間割設定シートからのテンプレ検索・適用は生きている。`TemplatesView` は「学校 → 学科 → 一覧」のブラウズ画面としてのみ到達不能になる。コードは削除しない (廃止設計で移設する資産)。→ Leader / ルームタブ廃止 doc に申し送り

---

## 10. 不採用案

| 案 | 却下理由 |
|---|---|
| **`.buttonStyle(.plain)` で toolbar の glass を消す** | **完全に無効**。researcher が iOS 26.5 実機で撮ったスクショが素の版と md5 一致。カプセルは Button の style ではなく toolbar 側が item を包む共有背景なので style では触れない |
| `.toolbarBackground(.hidden, for: .navigationBar)` で消す | バー全体の背景の API で、item のカプセルとは無関係 (researcher 確認) |
| `ToolbarItem(placement: .principal)` に逃げる (カプセルが付かない) | 有効だが**中央寄せ**になる。学期セレクトは左端が Touri のスケッチ |
| **`ButtonRole.back` を使う** | **存在しない** (`type 'ButtonRole' has no member 'back'` をコンパイルで実証)。back を標準部品で出す道は sheet 内 `NavigationStack` の push だけ |
| `Button(role: .close)` に `.buttonStyle(.glass)` を付ける | 本文では「Close」という文字ボタンになる。toolbar item に素で置いたときだけ円形 ✕ になる (researcher の実機表) |
| モーダルの `<` / `✕` を自前描画のまま 2xl タイトルだけ直す | Touri の明示要望「`<` と `X` は Apple 標準部品」に反する |
| inline nav title (`.navigationTitle(...)`) をモーダルのタイトルに使う | ~17pt semibold 中央固定で **2xl bold にできない**。要望「本文大字と同じ 2xl bold」を満たせない |
| `BottomSheet` / `SheetScaffold` を 1 コンポーネントに統合する | 今回の要望はヘッダー規格の統一であり、detent 戦略 (実測 hug vs `[.medium,.large]`) が違う 2 つを 1 つにするのは 24 呼び出し全体の挙動変更になる。ヘッダーだけを 1 つの modifier で共有すれば要望は満たせる。統合は別 doc |
| `BottomSheet` に `NavigationStack` を入れず、editor を `stackLevel: 2` の別シートで出す (現行 `DayDetailSheet` 方式) | `<` が出せない (別シートには back の概念が無い)。Touri のスケッチは `< 予定を追加 X` |
| push 先の高さも `PreferenceKey` で実測して detent を hug させる | `NavigationStack` を越えて preference が伝播する保証が SwiftUI に無い。**「実測できたつもりで実は 0」= フォームが潰れる**方向に倒れるので、push 中は無条件に画面 92% を採る (§3.4.4) |
| nav bar 高を定数 44pt として detent に足す | Dynamic Type 拡大でバーが伸びると外れる。コンテンツ上端の y を測れば実物に追従する |
| **chip のタップを room だけ残す** | 「同じ部品が画面によって当たり判定が違う」状態が残り、personal 側の「タップを食うのに何も起きない」バグと同じ構造 (呼び出し側次第で挙動が変わる) を再生産する。room も日別シート経由に寄せれば経路が 1 本になる |
| chip に `onSelectEvent` を残したまま personal だけ `.allowsHitTesting(false)` を付ける | 同上。prop が残る限り「room では chip がタップできる」ドキュメントと実装の分岐が残る |
| **ルーム trailing に虫眼鏡で「みんなの時間割」を出す** | **Touri 裁定 2026-07-30 で却下**。ルームタブ自体を廃止するので行き先が変わる。いま置き場所を決めても移設のたびに作り直しになるため、本 build では導線を持たせない (§3.5.2)。`TemplatesView` のコードは残す (§9.4) |
| ルームの trailing を `+` メニューに集約し「みんなの時間割」も項目として入れる | `+` は「追加」の記号で、`TemplatesView` への遷移 (閲覧) は追加ではない。押した先に画面遷移が混ざると `+` の意味が壊れる。上の裁定により導線自体を持たないので、この案も採らない |
| 「みんなの時間割」をコンテンツ内のリンクとして残す | 見出し行と一緒に消す指示。かつルームタブ廃止時に移設先が無くなる |
| **マスコットを現行 PNG から inpaint で修復する** | Leader が試行して**失敗**。穴 (55,029px) が輪の内側の白と重なっており、目・口のような「本来黒い部分」と穴を区別できない。修復すると顔が潰れる |
| マスコットを生成し直す (Codex Images) | 5 ポーズの同一性が保証できない。原画シートが手元にあり、そこから切り出せば**キャラは完全に同一**になる |
| 「穴が 0 px」を受入基準にする | 承認済の参考出力自体が 16 個 / 27px の穴を持つ (LANCZOS の undershoot)。**達成不能な基準**なので面積で切る (§3.6.5) |
| 影帯の開始行を行幅プロファイルの段差で自動検出する | hello (row 483 / +40px) では効くが **laptop は最大段差 +5px** で検出不能。x 方向 extent の段差でも決まらない (5 ポーズ全部で検証)。窓と同じ「設計が与える定数」にする |
| 下段 4 ポーズを「連結成分の大きい順」で取る | `idea` の電球の光線が別成分に切れており落ちる (実測)。窓 (列バンド) で取れば付属パーツが残る |
| 再切り出し後の framing を承認済 PNG (`recut-final-…`) に合わせる | あの PNG はキャラが canvas の 82.5% で、**現行出荷物 (89.5%) より小さい**。framing を変えると `ContentUnavailableView` / web の見た目が変わる。今回直すのは alpha と影だけなので `PAD=48` (= 90.5%、現行とほぼ同じ) を採る |

---

## 11. リスクと実機確認事項

| # | リスク | 兆候 | 逃げ道 |
|---|---|---|---|
| R1 | `BottomSheet` の chrome 実測 (`minY`) が 0 のまま | 全シートが `[.medium, .large]` に戻り、短いシートに大きな余白 | 挙動は退行するがシートは出る。`clampChrome`/`fittedHeight` は純関数なのでテストで切り分け可。次善は §3.4.4 の probe をコンテンツ側から `ScrollView` 側に移す |
| R2 | nav bar の material が `bgElevated` のシート面と段差に見える | ヘッダ帯が別色に見える | まず**システムに任せる** (CLAUDE.md「中立はシステムに明け渡す」)。段差が気になった時だけ `.toolbarBackground(.hidden, for: .navigationBar)` を検討 (DESIGN.md の改訂事項として上げる) |
| R3 | sheet 内 `NavigationStack` の system back が iOS 26 で出ない | push しても `<` が無い | researcher が iOS 26.5 実機で「`.navigationTitle` 無しでも system back だけ出る」を実測済。出ない場合は `AtenderModalToolbar.usesSystemBack` を `false` 固定にして自前 back に一本化 (1 行) |
| R4 | 2xl bold のタイトルが長いと nav bar で切れる | 「カレンダーを取り込む」等が省略される | `lineLimit(1)` + `minimumScaleFactor(0.75)` を入れてある。それでも足りなければタイトル文言を短くする (DESIGN.md 改訂事項) |
| R5 | 選択日のグレーが light モードで弱い (#FFF の上に #F2F2F7) | 「選択が分からない」 | 変更点は `Color.calendarSelectedDay` の 1 行。`Color.bgOverlay` (`systemFill`) に上げられる |
| R6 | `.allowsHitTesting(false)` を付けた chip で長押しが効かなくなる | 長押しで editor が開かない | 長押しは親セルの modifier なので影響しない (researcher の 9 点タップ + 長押し実測)。実機で 1 回確認する |
| R7 | 再切り出し PNG のライブラリ差 (cv2/Pillow の版) で出力が変わる | 穴の数値が §3.6.3 の出力と一致しない | 受入は絶対値でなく閾値 (面積 64px / 0.2%) で切ってある。Architect 検証環境は cv2 4.12.0 / Pillow 11.3.0 / numpy 2.2.6 |

**実機確認 (Touri) — build 16 の受入**: #S1〜#S3 / #C13 / #H3 / #D16〜#D25 / #M3〜#M7 / #M18 / #A6 / #A7 (§7.3 の (b)(c))。iOS 26 実機 1 台と iOS 18.2 sim の 2 経路で見る。

---

## 参照

- `DESIGN.md` §3.1 / §3.2 / §3.4 / §3.6.3 / §3.7 / §5 / §8
- `Muraki/knowledge/library/swiftui-ios26-toolbar-glass-and-button-roles.md` (sharedBackgroundVisibility / ButtonRole.close / back の実態)
- `Muraki/knowledge/library/swiftui-button-hit-area-measurement.md` (背景を敷いても当たり判定は壊れない)
- `Muraki/knowledge/pattern/offscreen-render-diff-pair-for-negative-drawing.md` (#C11/#C12/#H4 の書き方)
- `Muraki/knowledge/pattern/swiftui-bottomsheet-content-fit-detent.md` (置換対象の元パターン)
- `Muraki/knowledge/pattern/os-version-split-texture-not-function.md` (分岐してよいのは質感だけ)
- `Muraki/knowledge/gotcha/ios-japanese-ui-shipped-as-english-bundle.md` (system back が "Back" になる)
- `Muraki/knowledge/gotcha/screenshot-byte-identity-conflates-noop-tap-with-lost-harness.md` (#H3 の書き方)
- `Muraki/knowledge/gotcha/stale-deriveddata-false-red-after-resource-deletion.md` (P1 の後)
- `Muraki/knowledge/gotcha/xcodegen-info-plist-regenerated-every-run.md` (#V3)
- `.knowledge/known-failures.md` (ベースライン)
</content>
</invoke>
