# iOS UI 刷新 — ネイティブ回帰と「今」の実装

## 目的

「廉価 Web アプリみたいなデザイン」の物理的原因 (px→pt の 1:1 移植 + 標準部品の再発明) を取り除き、iOS の標準部品と Liquid Glass に乗せる。
同時に、主ユースケース「次の授業を確認する」に対応する**「今」の表示を新設する** (現状 grep 0 件 = 未実装)。

---

## 0. スコープと前提

### 対象

**ホーム / 時間割 / カレンダー**を作り込む。その土台となる**デザイントークンとアプリシェル**は全画面に波及する。
学期・科目 / ルーム / 友達 / 設定は**土台に追従する最小改修のみ** (トークンの再定義に伴う自動変化 + nav bar 復活 + 関数名の置換)。

### 対象外 (理由付き)

| 項目 | 理由 |
|---|---|
| **ウィジェット** (`Button(intent:)`) | 新 target + App Group + AppIntent の追加 = ビルド基盤の変更であり、1 機能 = 1 設計 doc に反する。findings ★10 のとおり価値は高いので**次の設計 doc** に送る。本設計の `SchoolClock` / `TodayTimeline` (§7.1-7.2) はそのまま widget 側で再利用できる形にしてある |
| **Web (`apps/web`)** | 1 ファイルも変更しない |
| **`BottomSheet` / `SheetScaffold` の重複統合** | 21 箇所の呼び出しを持つ横断リファクタで、本設計のどの要望にも紐付かない。**新規シートは native `.sheet` + `presentationDetents`** と定め、既存の 2 実装は据え置く |
| **`List` / `Form` への回帰 (設定・入力画面)** | 設定はスコープ外。`ContentUnavailableView` / `.redacted` は §6.3 で導入する |
| **DTO 契約テスト** | 版数管理 doc §10 が別テーマとして切り出し済 |
| **`MemberColor.palette` / 科目色 / status 色 / accent の値** | **本設計は色の「値」を一切変えない** (§9.3 の地雷回避) |

### 前提 (P)

- **P1: `feature/version-management` が先に着地する。** 本設計は `RootView.swift` / `project.yml` を触るので衝突する。
  **本 doc 執筆中に同ブランチが `f4da366` としてコミットされた** (未マージ)。§4.4 の目標状態は**その実物と突合済**で、`RootView` の着地形 (version gate 分岐 + `.task` 2 本 + `AmbientBackground()` + `?? .light`) は §4.4 の前提どおり。Developer は §4.4 の形を作れば順序に関係なく正しくなる
- **P2: iOS ベースラインは 183 GREEN / 0 RED** (`.knowledge/known-failures.md`、`eb96e8a` 時点)。**未分類の失敗 0**。
  ただし `f4da366` がテストを追加しているので、**P1 のマージ後にベースラインを測り直してから着手すること** (件数だけの台帳は failure を隠す — 台帳の教訓)
- **P3: main は `970e52d`。** 本 doc の「現状」の記述・行番号・grep 結果はこの commit 時点のもの。
  `2ddd1f8` → `970e52d` の差分は knowledge の訂正のみで **iOS コードは 1 行も動いていない**ことを確認済 (Space.swift の `selfTtChrome = 352` / `tabBarHeight = 64`、`project.yml` に `developmentLanguage` 無し、`RootView` の `AmbientBackground()` 1 箇所 — すべて doc 完成時点で再確認)

---

## 1. ★ 規約の撤回 (承認ゲートの本体)

本設計は `projects/atender/CLAUDE.md` の現規約と**両立しない**。Liquid Glass / 標準部品の採用は「色・余白・角丸をシステムに明け渡す」ことであり、「1:1 移植」の定義上不可能。

**Leader は承認後に以下の置換を行うこと** (追記でなく置換 — Muraki「仕様マークダウンの編集規律」)。

### 1.1 「プロジェクト要約」節

置換前:
> iOS ネイティブ版 (`apps/ios`) は **Web の忠実移植** (同一デザインシステム・同一 IA・全機能) を進行中。

置換後:
> iOS ネイティブ版 (`apps/ios`) は **IA と機能を Web と共有しつつ、見た目と操作は iOS ネイティブ** (Apple HIG / 標準部品 / Liquid Glass)。

### 1.2 「規約・やらないこと」節

置換前 (3 行のブロック全体):
> - **iOS は Web の忠実移植**。スマホ独自の簡略化・IA 改変・タブ構成の再発明を**しない**。Web (`apps/web`) の画面構成・ナビ・デザイントークン・全機能をそのまま写す。設計時は必ず `apps/web` の実装を正典として参照する
>   - ボトムタブ = Web `navItems.ts` の5項目 (ホーム/学期・科目/ルーム/友達/設定)。**Today/Timetable/Stats は独立画面ではない** (Web でも `/today` 無し・`/timetable`→`/`・`/stats`→`/semester`)。「今日の出欠」「時間割」は Home 内、「出席率」は 学期・科目。iOS でこれらを別タブに作らない
>   - デザインは `apps/web/src/styles.css` のトークン (light/dark) を 1:1 で移植。スマホ用に色・余白・角丸を変えない

置換後:
> - **iOS はネイティブ優先**。見た目・操作・部品は Apple HIG に従う。`apps/web` は**デザインの正典ではない**
>   - **IA と機能は Web と共有する** (ここは不変)。ボトムタブ = 5項目 (ホーム/学期・科目/ルーム/友達/設定)。**Today/Timetable/Stats は独立画面ではない** (Web でも `/today` 無し・`/timetable`→`/`・`/stats`→`/semester`)。「今日の出欠」「時間割」は Home 内、「出席率」は 学期・科目。iOS でこれらを別タブに作らない。iOS 独自機能の追加・Web 機能の削除は設計 doc で明示的に決める
>   - **中立の見た目はシステムに明け渡す**: 中立色 (背景/文字/罫線) は semantic system color、書体は built-in text style (本文 17pt / 最小 11pt)、タップ領域 44pt。`styles.css` のトークンを pt に移植しない
>   - **ブランド資産は Web と共有し続ける**: accent (azure) / status 色 / 科目カラーパレット / キャラクター画像。**これらの色の値を iOS 側で勝手に変えない**
>   - 標準部品を自前で再発明しない (`TabView` / `Picker` / `Menu` / `ContentUnavailableView` / `List` / `SignInWithAppleButton` / `.sheet`)。自前背景は Liquid Glass と干渉する
>   - 詳細: `.designs/20260717-ios-ui-revamp.md`

### 1.3 変わらないもの (誤読防止)

- **IA (タブ 5 項目・タブ名・タブの中身)** — Leader 確認済。native `TabView` に**そのまま**載せる
- **`ContextChips` の発想** (自分/ルーム切替) — 「友達と会話しながらみんなの時間割」に直接対応。**廃止しない**。変えるのは厚み (§5.2)
- **色の値・キャラクター** — §9.3

---

## 2. 設計の土台 (Architect が本日実測した事実)

設計判断が丸ごと乗っている事実は、**findings を信じずに自分で再現した** (Researcher の実測条件と本設計の条件の差分を潰すため)。環境: Xcode 26.6 / **iOS SDK 26.5 が唯一の SDK** / iPhone 16 (iOS 18.2) シミュレータ。

| # | 事実 | 確認方法 |
|---|---|---|
| **F1** | `project.yml` に `options.developmentLanguage: ja` を足すと `developmentRegion = ja` / `knownRegions = (Base, ja)` / **build setting `DEVELOPMENT_LANGUAGE = ja`** になる (現状は `en`)。生成される Info.plist は `CFBundleDevelopmentRegion = $(DEVELOPMENT_LANGUAGE)` なので `ja` に解決される | scratch コピーで xcodegen 2.45.4 を実走 + `xcodebuild -showBuildSettings` |
| **F2** | **`.lproj` を 1 つも足さずに、UIKit の "Back" が「戻る」になる。** `Bundle.main.localizations == ["ja"]` / `preferredLocalizations == ["ja"]` / `developmentLocalization == "ja"` / `Bundle(for: UIViewController.self).localizedString(forKey:"Back") == "戻る"` | シミュレータで実機テスト実行。**負の対照も実施**: `developmentLanguage` を外すと同じ assert が `en` / `"Back"` になる = この assert には牙がある |
| **F3** | **`CalendarRange.todayString()` は毎日 00:00〜08:59 JST の 9 時間、API と違う日付を返す** (UTC カレンダーのため)。JST 08:00 → iOS `"2026-07-16"` / API `"2026-07-17"`。API は `apps/api/src/lib/tz.ts` で `APP_TZ = "Asia/Tokyo"` 固定 | シミュレータで JST 00:30/08:00/08:59/09:00/23:00 の 5 点を実測。09:00 以降のみ一致 |
| **F4** | 同じ原因で **`nowMinute` を `CalendarRange.utcCalendar` で出すと JST 08:00 が `1380` になる** (正しくは `480`。1限 = 540) | 同上 |
| **F5** | **`DayConvention.todayDayOfWeekJs` は土 (weekday=7) も日 (weekday=1) も `1` (=月) を返す。** かつ**この関数は本番コードから 1 箇所も呼ばれていない** (定義とテストのみ) | 実測 + `grep -rn todayDayOfWeekJs Atender/` |
| **F6** | **`calendar.fill` は存在しない** (`UIImage(systemName:)` が nil)。`graduationcap.fill` / `person.2.fill` / `person.crop.circle.fill` / `gearshape.fill` は存在する | シミュレータで 25 個の symbol 名を実測 |
| **F7** | `if #available(iOS 26.0, *)` で隔離した `glassEffect(_:in:)` / `Glass.tint(_).interactive()` / `tabBarMinimizeBehavior(_:)` / `tabViewBottomAccessory(content:)` は、**deployment target 17.0 のまま型検査を通る**。`sensoryFeedback` / `TimelineView(.everyMinute)` / `contentTransition(.numericText())` / `ContentUnavailableView` (マスコット画像を custom icon にした形) / `Picker(.segmented)` / `Menu(primaryAction:)` / `List(.insetGrouped)` / `.redacted` / `.safeAreaInset` / `.presentationDetents` / `ToolbarItem(.principal)` / `.scrollBounceBehavior(.basedOnSize)` / `.scrollTargetBehavior(.paging)` は**ガード無しで** target 17.0 を通る | `swiftc -typecheck -sdk iphonesimulator26.5 -target arm64-apple-ios17.0-simulator` で 4 本のプローブを実走 |
| **F8** | **`UIScreen.main` は iOS 26.0 で deprecated だが、target 17 では警告が出ない** (deprecation は deployment target 基準)。Apple の警告文自体が `view.window.windowScene.screen` を代替として名指しする。**`UIWindowScene.screen` は target 17 / 26 のどちらでも無警告** | 同プローブを target 17.0 と 26.0 の両方で型検査し、警告の有無を比較 |

### F3 / F4 / F5 の帰結 — 「今」は既存の時計の上に建てられない

3 つとも**本設計が新規に依存する**部分であり、findings には無い。放置して「今」を実装すると:

- **F3**: 朝 9 時前 (= Touri が名指しした「教室移動しながら」の時間帯) に**今日の列を昨日に当てる**
- **F3 の既存バグ**: `RoomTimetable.load()` は `mondayOf(CalendarRange.todayString())` を使う → **月曜の 9 時前はルームの時間割が「先週」を読む**。刷新と無関係に今日そこにあるバグ
- **F5**: 土日に「今日の列」を**月曜に当てる**

→ **§7.1 `SchoolClock` を新設し、`CalendarRange.todayString()` は削除する** (「今日」は時計の責務であり、日付文字列代数 (`CalendarRange`) の責務ではない。UTC カレンダーを持つモジュールに today を置いたことがバグの原因そのもの)。
→ **`DayConvention.todayDayOfWeekJs` は削除する** (§9.2)。「週末は月曜」を返す関数を「今日の列」ロジックの隣に残すのは罠。

### F1 / F2 の帰結 — `BackHeaderButton` は消せる

findings ★6 の主張 (「`ja` にすれば標準 back が『戻る』になる」) は**実証された**。しかも `.lproj` は不要。
→ `BackHeaderButton` (2 箇所で使用: `RoomDetailView.swift:39` / `TemplatesView.swift:22`) と `.toolbar(.hidden)` の連鎖を解ける (§4.3)。

### F6 の帰結 — タブアイコンは outline のまま

HIG は tab bar に filled variant を推奨するが、**ホームタブに使う `calendar` に fill 変種が存在しない**。
5 個中 4 個だけ fill にすると混在する。→ **現行 5 個の symbol 名を変えない**。`NavigationTests` は緑のまま (§9.2)。
**逸脱理由**: fill 統一は SF Symbols 側の欠落により原理的に不可能。混在よりは outline 統一を採る。

---

## 3. デザイントークン (Phase 1 の中身)

「廉価 Web アプリ感」の実体はここ。**個別画面より先にトークンを引き直す** (findings 優先順 #2 を採用)。

### 3.1 書体 — **SF Pro (system) に寄せる**

findings が「決めろ」と名指しした 3 択のうち **(a) SF Pro に寄せる** を採る。

**根拠**:
1. **Inter は日本語に効いていない** (findings ★9)。UI の大半が日本語 = 既に実質 Hiragino。Inter が効いているのは数字と英字だけ
2. → **家族の切替は日本語テキストにとって視覚的にほぼ no-op**。リスクが小さい。**本当の見た目の変化はサイズ (14→17) であって家族ではない**
3. Inter (Latin) と Hiragino (JP) の混植は 1 文字列内でベースラインとウェイトがズレる = 「廉価」の一因
4. HIG §1: iOS は built-in text style を使う (Dynamic Type + アクセシビリティサイズが自動で効く)。`Font.custom` はそれを捨てている
5. SF Pro + Hiragino Sans は Apple が組んだ既定ペア

**実装**:

| 項目 | 変更 |
|---|---|
| `Font.atender(_ size:_ weight:)` | **削除** (`Font.custom("Inter-*")` の入口)。呼び出し 17 箇所は §3.2 の表で変換 |
| `Font.interPostScriptName(for:)` | **削除** |
| `project.yml` `UIAppFonts` | `Inter-*.ttf` 5 件と `NotoSansJP-VariableFont_wght.ttf` を**削除**。**`GoogleSans-Medium-Latin.ttf` は残す** |
| `Resources/Fonts/` の `.ttf` | 上と同じ 6 ファイルを**削除** (未登録の ttf を .app に同梱する意味がない) |

**`GoogleSans-Medium-Latin.ttf` を残す理由**: `AuthProviderButton.swift:102` が `Font.custom("GoogleSans-Medium", size: 17, relativeTo: .body)` で**現に使っている**。Google のサインインボタンのブランド規約を満たすための資産 (`knowledge/library/signin-button-branding-google-apple-2026.md`)。ここを巻き込むと規約違反になる。

**NotoSansJP を消す理由**: `project.yml` / `Info.plist` に登録されているが**コードから 1 度も参照されていない** (`grep -rn NotoSans Atender/` のヒットは Info.plist のみ)。かつ可変フォントの PostScript 名は `NotoSansJP-Thin` のみで、名前参照すると日本語がヘアラインで出る罠付き (`gotcha/swiftui-font-custom-silent-fallback-hides-missing-uiappfonts.md`)。完全な死荷重。

### 3.2 フォントトークンの再定義

**トークン名は変えない。値だけ差し替える。**
理由: `atenderXs`..`atender5xl` は 207 箇所で使われているが、名前は**スケール上の位置**を表しており (xs < sm < base < lg < xl < 2xl < 3xl)、その意味は差し替え後も真。207 箇所の機械的リネームは 1 ピクセルも変えずにリスクだけ増やす。

```swift
// apps/ios/Atender/Core/DesignSystem/Typography.swift (全面置換)
import SwiftUI

extension Font {
    static var atenderXs: Font { .caption2 }     // 11
    static var atenderSm: Font { .footnote }     // 13
    static var atenderBase: Font { .body }       // 17  ← 14 から昇格 (これが最大の見た目変化)
    static var atenderLg: Font { .headline }     // 17 semibold
    static var atenderXl: Font { .title3 }       // 20
    static var atender2xl: Font { .title2 }      // 22
    static var atender3xl: Font { .title }       // 28
    static var atender5xl: Font { .largeTitle }  // 34
}

enum Leading {                                    // 現状のまま (呼び出し側の変更なし)
    static let tight: CGFloat = 1.1
    static let snug: CGFloat = 1.2
    static let normal: CGFloat = 1.4
    static let body: CGFloat = 1.4
    static let relaxed: CGFloat = 1.5
}
```

- `atender4xl` は**削除** (使用 0 箇所)
- **数値の逸脱**: `atender5xl` は 44 → 34。iOS の text style に 44 の段が無いため。hero 数値は `.largeTitle` + `.fontWeight(.bold)` で表す
- **`.fontWeight(.black)` を使っている箇所は `.bold` に落とす** (HIG §1: Black/Heavy は段として使わない。Regular/Medium/Semibold/Bold の 4 つで組む)

**`Font.atender(size:weight:)` 呼び出し 17 箇所の変換表** (生成規則: **8/9/10/11 → `.caption2` / 12 → `.caption` / 17 → `.headline`**。weight 指定は `.fontWeight(_:)` として残す):

| file:line | 現状 | 変換後 |
|---|---|---|
| `Components/AuthProviderButton.swift:101` | `.atender(17, .semibold)` | `.headline` |
| `Components/AuthProviderButton.swift:103` | `.atender(17, .semibold)` | `.headline` |
| `Settings/SettingsSection.swift:33` | `.atender(11, .semibold)` | `.caption2` + `.fontWeight(.semibold)` |
| `Calendar/PersonalCalendar.swift:277` | `.atender(9, .semibold)` | `.caption2` + `.fontWeight(.semibold)` |
| `Calendar/PersonalCalendar.swift:287` | `.atender(9, .bold)` | `.caption2` + `.fontWeight(.bold)` |
| `Calendar/PersonalCalendar.swift:351` | `.atender(9)` | `.caption2` |
| `Home/SelfTodayCTA.swift:143` | `.atender(12, .bold)` | `.caption` + `.fontWeight(.bold)` (§5.4 で移設) |
| `Timetable/TimetableGridPhaseB.swift:143` | `.atender(12, .semibold)` | `.caption` + `.fontWeight(.semibold)` |
| `Timetable/TimetableGridPhaseB.swift:149` | `.atender(10, .medium)` | `.caption2` + `.fontWeight(.medium)` |
| `Timetable/TimetableGridPhaseB.swift:155` | `.atender(10)` | `.caption2` |
| `Timetable/TimetableGridPhaseB.swift:174` | `.atender(12, .bold)` | `.caption` + `.fontWeight(.bold)` |
| `Timetable/TimetableGridPhaseB.swift:177` | `.atender(8)` | `.caption2` + `.monospacedDigit()` |
| `SemesterOverview/SemesterOverviewComponents.swift:112` | `.atender(10, .bold)` | `.caption2` + `.fontWeight(.bold)` |
| `SemesterOverview/SemesterOverviewComponents.swift:244` | `.atender(10, .bold)` | `.caption2` + `.fontWeight(.bold)` |
| `Rooms/RoomsView.swift:143` | `.atender(11, .bold)` | `.caption2` + `.fontWeight(.bold)` |
| `Rooms/RoomDetailView.swift:275` | `.atender(10)` | `.caption2` |
| `Rooms/RoomDetailView.swift:319` | `.atender(10, .bold)` | `.caption2` + `.fontWeight(.bold)` |
| `Rooms/RoomDetailView.swift:347` | `.atender(10, .bold)` | `.caption2` + `.fontWeight(.bold)` |

**`AuthProviderButton` を触ることの意味** (先に断っておく): これは**認証画面のフォント指定 1 行 × 2**であり、認証ロジックには一切触れない。かつラベルは「Appleでサインイン」等の日本語で、Latin 部分 (`Apple`) が Inter → SF Pro になるだけ。**Apple のブランド規約は SF を求めるので、これは是正である。** `.headline` は現行の `Font.custom(_, 17, relativeTo: .body)` と同じく Dynamic Type に追従する (17 semibold)。

### 3.3 中立色 → semantic system color

**有彩色 (accent / status / brand palette) は 1 つも触らない。中立色だけをシステムに明け渡す。**

根拠 (HIG §3): dark palette は light の単純反転ではない。iOS は base / elevated の 2 セットを持ち sheet・popover で自動昇格する。**カスタム背景色はこの奥行きを壊す**。Liquid Glass は背後の実コンテンツと system material に協調して初めて成立する。

```swift
// apps/ios/Atender/Core/DesignSystem/Color+Atender.swift (中立色のみ置換)
static let bgBase      = Color(uiColor: .systemGroupedBackground)
static let bgMuted     = Color(uiColor: .tertiarySystemGroupedBackground)
static let bgElevated  = Color(uiColor: .secondarySystemGroupedBackground)
static let bgOverlay   = Color(uiColor: .systemFill)          // 自前スクリム用。native .sheet は自前スクリムを使わない

static let textPrimary   = Color(uiColor: .label)
static let textSecondary = Color(uiColor: .secondaryLabel)
static let textTertiary  = Color(uiColor: .tertiaryLabel)
static let textOnAccent  = Color.white                          // 変更なし
static let textOnDanger  = Color.white                          // 変更なし

static let borderSubtle   = Color(uiColor: .separator)
static let borderDefault  = Color(uiColor: .separator)
static let borderEmphasis = Color(uiColor: .opaqueSeparator)
static let borderSettings = Color(uiColor: .separator)
```

**触らないもの** (= §9.3 の地雷を踏まないため): `accent50/100/500/600/700` / `accentGradient` / `status*` / `friendship*` / `roomEvent` / `roomAvailabilityEmpty` / `eventMixTarget` / `brand*` / `MemberColor.palette` / `forStatus` / `forDayStatus` / `forFriendship` / `forRate` / `Color.dynamic(dark:light:)` ヘルパ / `UIColor(hex:)` ヘルパ。

### 3.4 `AmbientBackground` の削除

`Core/DesignSystem/AmbientBackground.swift` を**ファイルごと削除**。参照は `RootView.swift:10` の 1 箇所のみ。

理由 (findings ★8): 放射グラデ + `blur(radius: 60)` は Web の手法。**Liquid Glass は背後の「実コンテンツ」を屈折させて成立するので、全面に敷いたぼかしグラデの上では濁る。** system background に置き換える (§3.3 で `bgBase` が `.systemGroupedBackground` になるので、`RootView` は背景指定を持たなくてよい)。

### 3.5 `Space` の整理

**4pt グリッド (`s0_5`..`s20`) は維持する** — 良い土台であり、Web 由来という理由だけで壊す必要はない。削除するのは**画面寸法を先読みする定数**だけ:

| token | 処遇 | 理由 |
|---|---|---|
| `selfTtChrome` (352) | **削除** | §5.3。グリッドが画面高を知る必要をなくす |
| `roomTtChromeTop` (168) | **削除** | 同上 (使用 1 箇所) |
| `roomTtChromeBottom` (64) | **削除** | 使用 0 箇所 (死にトークン) |
| `tabBarHeight` (64) | **削除** | タブバーの高さはシステムの所有物になる。使用 9 箇所は §4.2 で処理 |
| `tabBarContent` (48) | **削除** | `BottomTabBar` 専用 (使用 1 箇所)。同ファイルごと削除 |
| `topbarHeightMobile` (48) | **維持** | `FullScreenModal.swift:37` が使う (スコープ外) |
| `topbarHeightDesktop` (56) | **削除** | 使用 0 箇所 |
| `pagePxDesktop` (24) / `pagePadding` | **削除** | 使用 0 箇所 |
| `pagePxMobile` (12) | **16 に変更** | HIG のシステムマージン。使用 12 箇所は値の変更のみで追従 |

**逸脱なし**: `pagePxMobile` 12 → 16 は HIG のシステムマージンに合わせる (ui-ux-design-perspectives §2)。

### 3.6 `ScreenMetrics` (F8 の帰結)

```swift
// apps/ios/Atender/Core/DesignSystem/ScreenMetrics.swift (新規)
import UIKit

/// UIScreen.main は iOS 26.0 で deprecated (代替として Apple が windowScene.screen を名指し)。
/// deployment target 17 では警告が出ないため、放置すると 26 に上げた日に一斉に噴く。
enum ScreenMetrics {
    static var height: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.screen.bounds.height ?? 0
    }
}
```

**`UIScreen.main` 4 箇所の処遇** (3 つは構造的に消え、残る 1 つだけがこのヘルパを使う):

| site | 処遇 |
|---|---|
| `TimetableGridPhaseB.swift:17` | **消滅** — `GeometryReader` の `available` に置換 (§5.3) |
| `RoomDetailView.swift:386` | **消滅** — 同上 (`height:` 引数を渡さなくなる) |
| `SelfTodayCTA.swift:165` | **消滅** — 展開パネルが `.sheet` + `presentationDetents` になる (§5.4) |
| `BottomSheet.swift:37` | **`ScreenMetrics.height` に置換** (1 行。BottomSheet 自体はスコープ外のまま) |

---

## 4. アプリシェル (Phase 2 の中身)

### 4.1 `BottomTabBar` 廃止 → native `TabView`

**これが Liquid Glass の元凶。** Apple 公式が「tab bars / toolbars の自前背景は Liquid Glass と干渉する」と名指しで警告しており、`BottomTabBar` は `.background(.ultraThinMaterial)` + `.background(Color.bgElevated.opacity(0.85))` で真正面から抵触している。

- `App/BottomTabBar.swift` を**ファイルごと削除**
- `App/MainTabView.swift` を `TabView(selection:)` + `.tabItem` に置換

**`Tab(value:role:)` を使わない理由**: iOS 18.0+。deployment target 17 では使えない。**旧 `.tabItem` API でも Liquid Glass のタブバーは出る** (SDK リンクで決まるため — `knowledge/library/swiftui-liquid-glass-ios26.md`)。

```swift
// apps/ios/Atender/App/MainTabView.swift (全面置換)
struct MainTabView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var bindableRouter = router
        TabView(selection: $bindableRouter.selectedTab) {
            NavigationStack(path: $bindableRouter.homePath) { HomeView() }
                .tabItem { Label(MainTab.home.label, systemImage: MainTab.home.symbol) }
                .tag(MainTab.home)

            NavigationStack(path: $bindableRouter.semesterPath) { SemesterOverviewView() }
                .tabItem { Label(MainTab.semester.label, systemImage: MainTab.semester.symbol) }
                .tag(MainTab.semester)

            NavigationStack(path: $bindableRouter.roomsPath) {
                RoomsView().navigationDestination(for: RoomsRoute.self) { /* 現状のまま */ }
            }
            .tabItem { Label(MainTab.rooms.label, systemImage: MainTab.rooms.symbol) }
            .tag(MainTab.rooms)

            NavigationStack(path: $bindableRouter.friendsPath) {
                FriendsView().navigationDestination(for: FriendsRoute.self) { /* 現状のまま */ }
            }
            .tabItem { Label(MainTab.friends.label, systemImage: MainTab.friends.symbol) }
            .tag(MainTab.friends)

            NavigationStack(path: $bindableRouter.settingsPath) { SettingsView() }
                .tabItem { Label(MainTab.settings.label, systemImage: MainTab.settings.symbol) }
                .tag(MainTab.settings)
        }
        .tabBarMinimizeOnScroll()          // §4.5 のシム (iOS 26+ でのみ効く)
        .sensoryFeedback(.selection, trigger: router.selectedTab)
    }
}
```

**消える仕掛け** (すべてシステムが担う):
- `ZStack(alignment: .bottom)` + 自前 `BottomTabBar` の重ね
- **キーボード表示時にタブバーを隠す `keyboardVisible` の監視 2 本** (`keyboardWillShow/Hide` + `.animation`) — システムの tab bar は自動で退避する
- `.ignoresSafeArea(.keyboard, edges: .bottom)`
- `MainTab` の `enum` / `label` / `symbol` / `allCases` は**そのまま**。`AppRouter` も**そのまま** (§9.2: `NavigationTests` は緑のまま)

`App/PlaceholderViews.swift` の `HomePlaceholderView` / `SemesterPlaceholderView` は間に 1 枚挟むだけの中継なので、上のとおり `HomeView()` / `SemesterOverviewView()` を直接呼ぶ。
**`RoomsPlaceholderView` / `FriendsPlaceholderView` / `PlaceholderScreen` / `TopBar` は死にコード** (grep で参照 0 を確認済) → `PlaceholderViews.swift` を**ファイルごと削除**。

### 4.2 `Space.tabBarHeight` を使っている 9 箇所

タブバーの高さはシステムの所有物になるので、**自前で下パディングを積むのをやめる**。native `TabView` は各タブの content に safe area inset を自動で入れる。

| file:line | 現状 | 処遇 |
|---|---|---|
| `App/BottomTabBar.swift:44` | `.frame(minHeight: Space.tabBarHeight)` | ファイルごと削除 |
| `App/PlaceholderViews.swift:36` | `.padding(.bottom, Space.tabBarHeight)` | ファイルごと削除 |
| `Components/Toast.swift:38` | `.padding(.bottom, Space.tabBarHeight + Space.s4)` | **`.padding(.bottom, Space.s4)` に変更** (Toast は `RootView` の `ZStack` にいるので safe area 外。タブバー分は system が入れないため `Space.s16` の実測退避が要る → **`.padding(.bottom, Space.s16)`**) |
| `Features/Settings/SettingsView.swift:39` | `.padding(.bottom, Space.tabBarHeight)` | **削除** (system の inset に任せる) |
| `Features/Home/SelfTodayCTA.swift:107` | `.padding(.bottom, Space.tabBarHeight + safeAreaBottom())` | §5.4 で `safeAreaInset` になり消滅 |
| `Features/SemesterOverview/SemesterOverviewView.swift:21` | `.padding(.bottom, Space.tabBarHeight + Space.s3)` | **`.padding(.bottom, Space.s3)`** |
| `Features/SemesterOverview/SemesterOverviewView.swift:78` | `.padding(.bottom, Space.s6 + Space.tabBarHeight)` | **`.padding(.bottom, Space.s6)`** |
| `Features/Rooms/RoomDetailView.swift:208` | `.padding(.bottom, Space.tabBarHeight + Space.s6)` | **`.padding(.bottom, Space.s6)`** |
| `Features/Rooms/RoomDetailView.swift:386` | `height:` 引数の一部 | §5.3 で消滅 |

**`Toast` だけ例外な理由**: `ToastOverlay()` は `RootView` の `ZStack` 直下にいて `TabView` の外なので、システムの tab bar inset を受け取らない。ここだけは実測退避 (`Space.s16` = 64) が要る。**これは「タブバーの高さの決め打ち」が 1 箇所だけ残るということ**であり、ズレたらトーストがタブバーに重なる (機能影響なし・美観のみ)。

### 4.3 nav bar の復活 + `BackHeaderButton` 廃止

**全 5 タブが `NavigationStack` を張った上で nav bar を隠している** (findings ★5) = Liquid Glass の nav bar と scroll edge effect を丸ごと捨てている状態。

`ja` 化 (F1/F2) で標準 back が「戻る」になるので、自前 back を持つ理由が消える:

| file:line | 現状 | 処遇 |
|---|---|---|
| `Features/Home/HomeCore.swift:65` | `.navigationBarHidden(true)` | **削除** → §5.1 の toolbar を持つ |
| `Features/SemesterOverview/SemesterOverviewView.swift:25` | `.navigationBarHidden(true)` | **削除** + `.navigationTitle("学期・科目")` |
| `Features/Settings/SettingsView.swift:42` | `.navigationBarHidden(true)` | **削除** + `.navigationTitle("設定")` |
| `Features/Rooms/RoomDetailView.swift:54` | `.toolbar(.hidden, for: .navigationBar)` + `.navigationBarBackButtonHidden(true)` (:53) | **両方削除** + `.navigationTitle(room?.name ?? "ルーム")` + `.navigationBarTitleDisplayMode(.inline)` |
| `Features/Rooms/TemplatesView.swift:50` | `.toolbar(.hidden, for: .navigationBar)` | **削除** + `.navigationTitle("テンプレート")` |
| `App/PlaceholderViews.swift:39` | `.navigationBarHidden(true)` | ファイルごと削除 |

- `Core/DesignSystem/Components/BackHeaderButton.swift` を**ファイルごと削除**。呼び出しは `RoomDetailView.swift:39` と `TemplatesView.swift:22` の 2 箇所 (**grep で確定済**) — 行ごと削除する (system back が代わる)
- `RoomsView` / `FriendsView` は既に nav bar を隠していない。`.navigationTitle` の有無を確認し、無ければ付ける
- **`project.yml` に `options.developmentLanguage: ja` を追加** (F1)

### 4.4 `RootView` の目標状態 (P1 との合流点)

`feature/version-management` が同じファイルを触る。**マージ後にこうなっていること**を目標状態として定義する (どちらが先に入っても、Developer はこの形を作れば正しい):

```swift
// apps/ios/Atender/App/RootView.swift
var body: some View {
    ZStack {
        //  AmbientBackground() を削除 (§3.4)。背景は system に任せる
        Group {
            if case let .blocked(minBuild) = environment.versionStore.state {     // ← version-management 由来
                VersionGateView(currentBuild: environment.versionStore.currentBuild, minBuild: minBuild)
            } else {
                switch environment.authStore.state {
                case .unknown:   splash
                case .signedOut: AuthView()
                case .signedIn:
                    if environment.authStore.me?.setupStatus.isComplete == false { SetupFlowView() }
                    else { MainTabView().environment(environment.appRouter) }
                }
            }
        }
        ToastOverlay()
    }
    .task { await environment.authStore.bootstrap() }                             // ← version-management 由来
    .task { await environment.versionStore.check() }                              // ← version-management 由来
    .onOpenURL { /* 現状のまま */ }
    .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { /* 現状のまま */ }
    .onChange(of: canNavigate) { /* 現状のまま */ }
    .preferredColorScheme((ThemePreference(rawValue: themePreference) ?? .auto).colorScheme)   // ← .light から .auto へ (§4.6)
}
```

**本設計が `RootView` に対して行う変更は 3 つだけ**: (1) `AmbientBackground()` の行を消す (2) `?? .light` → `?? .auto` (3) `@AppStorage` の既定値を `.auto` に。それ以外の行は version-management の成果物をそのまま残す。

**`project.yml` の分掌**: 本設計は `options.developmentLanguage` と `UIAppFonts` のみ触る。**`CFBundleVersion` には触らない** (version-management の領分。整数 1 個を巡ってマージで殴り合わないため)。TestFlight 配布時に Leader が別途上げる。

### 4.5 `if #available(iOS 26, *)` シムの置き場所 (findings が「決めろ」と名指し)

**`Core/DesignSystem/Glass.swift` に `View` extension として集約する。アプリ本体に `#available` を書かない。**

```swift
// apps/ios/Atender/Core/DesignSystem/Glass.swift (新規)
import SwiftUI

/// Liquid Glass は iOS 26.0+。deployment target は 17 のまま (26 に上げると iPhone の 21% を失う)。
/// ★ ここが #available の唯一の置き場所。Feature 層に #available を書かないこと。
///   分散すると「26 で何が変わるか」がコードベース全体に散り、シムを外す日に追えなくなる。
///
/// ★ 分岐してよいのは「質感」だけ。機能・レイアウト・IA を OS 版数で分けない (§11 の不採用案を参照)。
extension View {
    /// 浮くコントロール (コンテンツの上に乗る面) にガラスを敷く。
    /// iOS 26 未満では ultraThinMaterial にフォールバックする (= 現状の質感)。
    @ViewBuilder
    func atenderGlass(in shape: some Shape) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }

    /// スクロールに応じてタブバーを縮める (iOS 26.0+)。未満では何もしない。
    @ViewBuilder
    func tabBarMinimizeOnScroll() -> some View {
        if #available(iOS 26.0, *) {
            self.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            self
        }
    }
}
```

**F7 で型検査済** (target 17.0 でコンパイルが通ること)。

**ガラスをどこに敷くか — 規則**:
> **Liquid Glass は「コンテンツの上に浮くコントロール」にだけ敷く。コンテンツ自体には敷かない。**

| 面 | ガラス | 手段 |
|---|---|---|
| タブバー | ○ | **システム自動** (native `TabView` にした時点。`atenderGlass` は呼ばない) |
| nav bar / toolbar | ○ | **システム自動** (`.navigationBarHidden` を外した時点) |
| sheet | ○ | **システム自動** (native `.sheet`) |
| **NowNextBar** (§5.4) | ○ | **`atenderGlass` を使う唯一の自前面** |
| 時間割セル / カレンダーセル / カード / Panel | **×** | これらは**コンテンツ**。Apple はガラスの多用を明確に戒めている |

`GlassEffectContainer` / `glassEffectID` / `glassEffectUnion` は**使わない** (近接する複数のガラスを融合させる道具。ガラス面が 1 つしかないので出番がない。使わない API をシムに置かない)。

### 4.6 ダークモードの既定を OS 追従へ

現状 `RootView.swift:6` の `@AppStorage("atender.theme")` の既定が `ThemePreference.light` で、**`.preferredColorScheme(.light)` により OS のダークモード設定を上書きしている**。

HIG §3: 「アプリ内独自の appearance 切替 UI を作らない — OS 設定に従う」。かつ **§3.3 で中立色を system semantic に移す以上、light 固定はその意味 (自動で dark に転ぶこと) を殺す。**

- **既定値を `.auto` に変更** (`@AppStorage("atender.theme") private var themePreference = ThemePreference.auto.rawValue` + `?? .auto`)
- **`ThemePreference` の enum と設定 UI (ライト/ダーク/自動) は残す** — 削除は「作った UI を捨てるか」というプロダクト判断であり Architect の裁量ではない。設定はスコープ外
- **これはユーザーに見える挙動変化**: 一度も設定を触っていないダークモード利用者のアプリが、更新後にダークになる。**意図した変化**だが Touri の裁定余地がある → §12

---

## 5. ホーム / 時間割 / カレンダー / 「今」 (Phase 3 の中身 — 本命)

### 5.1 「ホームは時間割とカレンダーを大きく」の具体形 (findings が「決めろ」と名指し)

**答え: 3 段のコントロール行を nav bar 1 段に畳み、外側 `ScrollView` を捨て、グリッドに画面高を数えさせるのをやめる。**

現状の積み上げ (findings ★7) と処遇:

| # | 現状 | 高さ | 処遇 |
|---|---|---|---|
| 1 | `ContextChips` | 40 | **rooms が 0 個なら出さない** (§5.2)。出すときは 44 |
| 2 | `HomeViewModeTabs` (自前) | 42 | **nav bar の principal へ** → `Picker(.segmented)` (§5.2) |
| 3 | `HomeSemesterPicker` (自前・**親子 2 経路に二重定義**) | 36 | **nav bar の leading へ** → `Menu` (§5.2)。二重定義も解消 |
| 4 | `TimetableGrid` | 本体 | §5.3 |
| 5 | `SelfTodayCTA` (展開時 画面の 36%) | ~162 | **`NowNextBar` 2 行 + 詳細は `.sheet`** (§5.4) |
| 6 | `BottomTabBar` | 64+34 | **system TabView** (§4.1) + スクロールで最小化 (iOS 26) |

**`Space.selfTtChrome = 352` は「数を減らす」のではなく「概念ごと消す」**: §5.3 のとおりグリッドが `GeometryReader` から実際の利用可能高を受け取るようになるので、**画面高からクロームを引き算する必要が最初から無くなる**。

### 5.2 `HomeView` の構造

```
┌─ nav bar (system / Liquid Glass) ────────────────────────┐
│ [2026 前期 ⌄]   [ 時間割 | カレンダー ]           [⚙︎]   │
└──────────────────────────────────────────────────────────┘
│ [自分] [3年A組] [サークル] [+]        ← rooms が 1 個以上のときだけ (44pt)
├──────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│                 HomeBody (利用可能高を全部使う)           │
│                                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ 次の授業 · 13:00 · A302                                   │  ← NowNextBar (safeAreaInset)
│ 3限 英語                    [今日は全出席 (2)]  [⌃]      │     glass capsule
└──────────────────────────────────────────────────────────┘
┌─ tab bar (system / Liquid Glass / スクロールで最小化) ────┐
│  ホーム   学期・科目   ルーム   友達   設定               │
└──────────────────────────────────────────────────────────┘
```

**nav bar の 3 スロット** (各 1 目的。F7 で型検査済):

| placement | 中身 | 表示条件 |
|---|---|---|
| `.topBarLeading` | `Menu` — label = `Text(現在の学期名).lineLimit(1)` + `Image(systemName: "chevron.down")`、`.frame(maxWidth: 120, alignment: .leading)`。中身は `Picker("学期", selection: $semesterId)` に全学期 | `context == .self` |
| `.principal` | `Picker("表示", selection: $mode)` + `.pickerStyle(.segmented)` + `.frame(maxWidth: 200)`。segment = 「時間割」「カレンダー」 | **常時** |
| `.topBarTrailing` | `Button { showTimetableSettings = true } label: { Image(systemName: "gearshape") }` | `context == .self && mode == .timetable` |

- **`.navigationBarTitleDisplayMode(.inline)`** かつ `.navigationTitle("")` — `.principal` を使うとタイトルは表示されないため。large title は縦を食うので使わない (**逸脱理由**: HIG は large title でのワインドファインディングを推す。ここは segmented picker が現在地を示し、かつ「時間割を大きく」が最優先要望なので inline を採る)
- **学期 Menu を残す理由**: 学期切替は極めて低頻度 (学期に 1 回) なので HIG §5 的には二次階層送りが筋だが、**機能削除は Touri のプロダクト判断**なので削らない。常設 36pt の行 → nav bar の 1 スロットに畳むことで、低頻度に見合ったコストにする

**`ContextChips`**:
- **`rooms.isEmpty` のときは行ごと出さない。** ルームが 0 個のユーザーに `[自分][+]` を常時見せるのは、機能ゼロの 40pt。`+` はルームタブと重複した導線であり、失っても到達不能にはならない
- `rooms` が 1 個以上なら現状どおり `[自分][ルーム…][+]`。**1 タップ切替は維持する** — 「友達と会話しながらみんなの時間割を確認」に直接対応する最頻ジェスチャだから (ui-ux-design-perspectives §5「対等なコンテキストを数個往復 → context chip」)
- チップ高 `40 → 44` (HIG のタップ領域)。`+` ボタンも `40×40 → 44×44`
- `HomeChips.items(rooms:)` の**契約は変えない** (§9.2: `HomeChipsTests` 3 本は緑のまま)。可視判定は新関数 `HomeChips.isVisible(rooms:)` として足す

**削除するもの**: `HomeViewModeTabs` (自前セグメント、`HomeCore.swift:157-187`) / `HomeSemesterPicker` (自前 Button + BottomSheet、`HomeCore.swift:189-257`)。
**二重定義の解消**: `HomeSemesterPicker` は `HomeCore.swift:51` と `SelfTimetableView.swift:132` の**親子 2 経路**で描かれていた。学期 Menu は **`HomeView` の toolbar 1 箇所だけ**になる。`SelfTimetableView` からは学期ピッカーと ⚙︎ ボタンが消え、グリッドとシートだけになる。

**`HomeView` の state** (公開契約):

```swift
struct HomeView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var context: HomeContext = .self
    @State private var mode: HomeViewMode = .timetable
    @State private var semesterId: String?
    @State private var didApplyDefaultSemester = false
    @State private var rooms: [RoomSummaryDto] = []
    @State private var semesters: [SemesterDto] = []       // ← 新規 (HomeSemesterPicker から移管)
    @State private var showTimetableSettings = false       // ← 新規 (⚙︎ が toolbar へ出たため)
}
```

`HomeView.task` は現状の rooms/me の読み込みに加え、`semesterRepository.semesters()` を読む (旧 `HomeSemesterPicker.load()` の移管。キャッシュ優先 → force 無しの順も現状どおり)。

**`SelfTimetableView` の prop 契約** (描画テストのため明記):

```swift
struct SelfTimetableView: View {
    @Binding var semesterId: String?
    @Binding var showSettings: Bool        // ← 新規。HomeView の toolbar の ⚙︎ が立てる
    let available: CGFloat                 // ← 新規。GeometryReader が測った利用可能高 (§5.3)
}
```

**`HomeBody` の prop 契約**:

```swift
struct HomeBody: View {
    let context: HomeContext
    let mode: HomeViewMode
    @Binding var semesterId: String?
    @Binding var showTimetableSettings: Bool
    let available: CGFloat                 // ← 新規
}
```

**外側 `ScrollView` の廃止**: 現状 `HomeView` は全体を 1 枚の `ScrollView` で包み `.padding(.bottom, 128)` している。**グリッドが `ScrollView` の中にいる = 高さが無限に与えられる = だから自分で画面高を計算するしかなかった。** これが `selfTtChrome` の構造的な原因。外側 `ScrollView` を外し、`GeometryReader` が測った高さを `HomeBody` に渡す。`.padding(.bottom, 128)` は `safeAreaInset` が自動で担う (§5.4)。

```swift
// HomeView.body の骨格
GeometryReader { proxy in
    VStack(spacing: 0) {
        if HomeChips.isVisible(rooms: rooms) {
            ContextChips(...).frame(height: 44)
        }
        HomeBody(context: context, mode: mode, semesterId: $semesterId,
                 showTimetableSettings: $showTimetableSettings,
                 available: proxy.size.height - (HomeChips.isVisible(rooms: rooms) ? 44 : 0))
    }
}
.safeAreaInset(edge: .bottom) {
    if context == .self { NowNextBarHost() }
}
.toolbar { /* 上表の 3 スロット */ }
```

### 5.3 時間割グリッド — 画面高を数えるのをやめる + 「今」を描く

```swift
// apps/ios/Atender/Core/Timetable/TimetableGridLayout.swift (新規)
enum TimetableGridLayout {
    /// 1 コマは HIG のタップ領域 (44pt) を下回らない
    static let minRowHeight: CGFloat = 44
    static let headerHeight: CGFloat = 28

    static func rowHeight(available: CGFloat, rowCount: Int) -> CGFloat
    static func contentHeight(available: CGFloat, rowCount: Int) -> CGFloat
    static func currentPeriodIndex(daySlots: [DaySlotDto], nowMinute: Int) -> Int?
}
```

**生成規則** (手計算した総和を doc に書かない):
- `rowHeight(available:rowCount:)` = `rowCount <= 0 ? minRowHeight : max(minRowHeight, (available - headerHeight) / CGFloat(rowCount))`
- `contentHeight(available:rowCount:)` = `headerHeight + rowHeight(...) * CGFloat(rowCount)`

**帰結**: コマ数が少なければグリッドは**利用可能高をちょうど埋め** (`contentHeight == available`)、多ければ `44 × コマ数` に膨らんで**内部スクロールする**。`ScrollView` + `.scrollBounceBehavior(.basedOnSize)` で包むので、収まるときはバウンスもしない。**iPhone SE で溢れる問題** (現状は 320 に clamp して溢れっぱなし) がこれで解ける。

**`TimetableGrid` の prop 契約**:

```swift
struct TimetableGrid: View {
    let daySlots: [DaySlotDto]
    let events: [TimetableEventInput]
    var days: [Int] = [1, 2, 3, 4, 5]
    var onEventTap: ((String) -> Void)?
    var onEmptyCellTap: ((_ displayDayOfWeek: Int, _ periodIndex: Int) -> Void)?
    var available: CGFloat                     // ← height: CGFloat? を置換。GeometryReader 由来
    var todayDisplayDay: Int?                  // ← 新規。nil = 今日の列を描かない
    var currentPeriodIndex: Int?               // ← 新規。nil = 現在コマを描かない
}
```

- **`height: CGFloat?` を削除し `available: CGFloat` を必須にする** — 呼び出し側 (`SelfTimetableView` / `RoomTimetable`) が必ず `GeometryReader` の実測値を渡す。`UIScreen.main` は消える (F8)
- `EmptyCell` は `rowHeight >= 44` になるのでタップ領域を満たす

**「今」の描画** (findings ★2「最大の勝ち筋」):

| 要素 | 規則 |
|---|---|
| **今日の列** | `todayDisplayDay` が `days` に含まれるとき、その列の背景に `Color.accent500.opacity(0.06)` を敷き、曜日ヘッダのラベルを `Color.accent500` + `.fontWeight(.bold)` にする。含まれないとき (= 土日、または `days` に無い曜日) は**何も描かない** |
| **現在のコマ** | `currentPeriodIndex` に一致する行の `PeriodLabelCell` を `Color.accent500` 背景 + `Color.textOnAccent` 文字にする |
| **今 (交点)** | 今日の列 **かつ** 現在のコマのセルに、`RoundedRectangle(cornerRadius: Radius.timetableCell).stroke(Color.accent500, lineWidth: 2)` を重ねる |
| アニメーション | `.animation(.smooth, value: currentPeriodIndex)` |

`todayDisplayDay` / `currentPeriodIndex` は**グリッドが自分で計算しない**。呼び出し側が `SchoolClock` + `TimetableGridLayout.currentPeriodIndex(daySlots:nowMinute:)` から渡す (テスト可能性のため。グリッドは純粋な描画に保つ)。

**`currentPeriodIndex(daySlots:nowMinute:)` の規則**: `daySlots` を `periodIndex` 昇順にし、**最初に** `startMinute <= nowMinute && nowMinute < endMinute` を満たす slot の `periodIndex`。無ければ `nil`。`isBreak` の slot も対象に含む (休み時間も「今」の一部であり、グリッドはそれを行として描いているため)。

**`RoomTimetable` の追従** (最小改修): `TimetableGrid(..., height: max(360, UIScreen.main.bounds.height - Space.roomTtChromeTop - Space.tabBarHeight))` → `available` を `GeometryReader` から渡す形に。`RoomDetailView` の `Group` に `.frame(maxHeight: .infinity)` を付けて残り高を与える。**ルームの時間割には `todayDisplayDay` を渡し、`currentPeriodIndex` も渡す** (メンバーの時間割でも「今」は同じ意味を持つ)。

### 5.4 `NowNextBar` — 「次の授業」の常設表示 + 出欠

`SelfTodayCTA` / `MainAttendanceCTA` (`Features/Home/SelfTodayCTA.swift`) を**全面置換**。

**レイアウト** (2 行):

```
┌────────────────────────────────────────────────────────┐
│ 次の授業 · 13:00 · A302                                 │  L2: .caption2 / secondary
│ 3限 英語                     [今日は全出席 (2)]  [⌃]    │  L0: .headline / L2: 44pt の行
└────────────────────────────────────────────────────────┘
   ↑ atenderGlass(in: RoundedRectangle(cornerRadius: Radius.md))
     .padding(.horizontal, Space.s4) — full-width にしない (HIG §2)
```

- **高さは書かない (規則で決まる)**: 「meta 1 行 (`.caption2`) + 44pt のアクション行 + 上下 `Space.s3`」。Dynamic Type で伸びる
- **`safeAreaInset(edge: .bottom)` で `HomeView` に付ける** — スクロールするコンテンツ (カレンダー) の safe area が自動で詰まるので、`.padding(.bottom, 128)` のような決め打ちが要らなくなる
- **`context == .self` のとき、時間割/カレンダーの両モードで出す** (現状は時間割モードのみ)。「今」は表示モードでなく「今日」の属性なので、モードで出し分ける理由がない。ルームコンテキストでは**出さない** (ルームに出欠はない)
- **`state == .noClass` のときはバーごと出さない**

**コンポーネント契約**:

```swift
// apps/ios/Atender/Features/Home/NowNextBar.swift (新規)

/// 状態を持たない描画専用。Reviewer はここを props で叩ける。
struct NowNextBar: View {
    let state: TodayState
    let unrecordedCount: Int
    let pending: Bool
    let onMarkAllPresent: () -> Void
    let onMarkAll: (AttendanceStatus) -> Void
    let onOpenDetail: () -> Void
}

/// ViewModel + TimelineView + sheet を持つ。HomeView が置くのはこれ。
struct NowNextBarHost: View { }
```

**アクション部** — 自前スプリットボタンを標準の `Menu(primaryAction:)` に置換 (F7 で型検査済):

```swift
Menu {
    ForEach([AttendanceStatus.absent, .excused, .tardy, .earlyLeave]) { status in
        Button("全部 \(longLabel(status)) (\(unrecordedCount))") { onMarkAll(status) }
    }
} label: {
    Text(unrecordedCount == 0 ? "本日の記録は完了済" : "今日は全出席 (\(unrecordedCount))")
} primaryAction: {
    onMarkAllPresent()
}
.buttonStyle(.borderedProminent)
.buttonBorderShape(.capsule)
.frame(minHeight: 44)
.disabled(pending || unrecordedCount == 0)
.sensoryFeedback(.success, trigger: unrecordedCount)
```

これで消えるもの: 自前の `menuOpen` ポップオーバー (`offset(y: -58)` + `zIndex(2)`) / `chevron.up.chevron.down` の分割ボタン / 自前のキーボード監視 2 本。

**ラベル文字列を変えない**: 「今日は全出席 (N)」と `accessibilityIdentifier("cta-expand-toggle")` は**現状の文字列のまま**にする。`AtenderUITests/ScreenshotFlow.swift` がこの 2 つを掴んでいる (`tapButton("今日は全出席 (1)")` / `app.buttons["cta-expand-toggle"]`)。ハーネスはソフトタップなので RED にはならないが、黙って `ok=false` のスクショを撮り続ける = **before/after 比較という刷新で一番効く道具が壊れる**。

**詳細パネル → native sheet**:

```swift
.sheet(isPresented: $showDetail) {
    TodayAttendanceSheet(occurrences: ..., onChangeStatus: ...)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
}
```

- 現状の `expandedPanel` (`ScrollView` + `AttendancePanelHeightKey` の `PreferenceKey` 実測 + `UIScreen.main.bounds.height * 0.36` の cap) を**まるごと捨てる**。`presentationDetents` がシステム側で同じことをする
- `⌃` ボタン (`cta-expand-toggle`) がこれを開く。44×44
- 中身 (コマごとの 6 ステータスボタン) は現状のロジックのまま。ステータスボタンは `minHeight: 40 → 44`

### 5.5 カレンダーを大きく

```swift
// apps/ios/Atender/Core/Timetable/CalendarMonthLayout.swift (新規)
enum CalendarMonthLayout {
    static let minRowHeight: CGFloat = 56
    static let weekdayHeaderHeight: CGFloat = 26
    static let rowCount: Int = 6
    static let agendaHeight: CGFloat = 200

    static func rowHeight(available: CGFloat) -> CGFloat
    static func contentHeight(available: CGFloat) -> CGFloat
}
```

**生成規則**:
- `rowHeight(available:)` = `max(minRowHeight, (available - weekdayHeaderHeight - agendaHeight) / CGFloat(rowCount))`
- `contentHeight(available:)` = `weekdayHeaderHeight + rowHeight(available:) * CGFloat(rowCount)`

- 現状のセル高**固定 86** を廃止 → 利用可能高から算出。**クローム削減分がそのままカレンダーの大きさになる**
- `DayAgendaPanel` は残す (機能削除はしない) が `.frame(height: CalendarMonthLayout.agendaHeight)` + 内部スクロール
- 全体を `ScrollView` + `.scrollBounceBehavior(.basedOnSize)` で包む → 収まれば動かず、iPhone SE のように溢れればスクロールする
- **月セルのイベント名は 9pt → `.caption2` (11pt)**。行が入る数は減るが、9pt は HIG の最小 11pt を割っており「読めない情報」は情報ではない。`prefix(3)` は `prefix(2)` に下げる (**逸脱理由**: 11pt に上げた分、3 件表示は 56pt の最小セルに収まらない。溢れた件数は既存の `+N` 表示が担う)

**今日のセル** (現状 today の指標が無い):

```swift
// apps/ios/Atender/Core/Timetable/CalendarDayStyle.swift (新規)
enum CalendarDayEmphasis: Equatable { case selected, today, outsideMonth, normal }

enum CalendarDayStyle {
    /// 優先順位: selected > today > outsideMonth > normal
    static func emphasis(date: String, todayString: String, selectedDate: String, monthFirst: String) -> CalendarDayEmphasis
}
```

| emphasis | 描画 |
|---|---|
| `.selected` | 数字を `Color.textOnAccent`、背景に `Circle().fill(Color.accent500)` (現状のまま) |
| `.today` | 数字を `Color.accent500` + `.fontWeight(.bold)`、背景円なし |
| `.outsideMonth` | 数字を `Color.textTertiary`、セル背景 `Color.bgMuted.opacity(0.45)` (現状のまま) |
| `.normal` | 数字を `Color.textPrimary` (現状のまま) |

**月送りスワイプ** (findings ★8: ジェスチャ 0 箇所):
- `CalendarMonth` に `DragGesture(minimumDistance: 20)` を付け、`onEnded` で `value.translation.width` が **`< -50` なら翌月 / `> 50` なら前月**。それ以外は何もしない
- `.sensoryFeedback(.selection, trigger: anchor)`
- 縦スクロール (`ScrollView`) と競合しないよう、`DragGesture` は**水平成分が垂直成分より大きいときだけ**採用する: `abs(value.translation.width) > abs(value.translation.height)`

---

## 6. 動き・標準部品 (Phase 4 の中身)

### 6.1 Haptics (`.sensoryFeedback` は iOS 17.0+ = ガード不要。F7 で確認済)

| 契機 | feedback | 場所 |
|---|---|---|
| タブ切替 | `.selection` | `MainTabView` — `trigger: router.selectedTab` |
| 表示モード切替 (時間割⇄カレンダー) | `.selection` | `HomeView` — `trigger: mode` |
| コンテキスト切替 (自分⇄ルーム) | `.selection` | `HomeView` — `trigger: context` |
| 月送り (スワイプ / ボタン) | `.selection` | `CalendarMonth` — `trigger: anchor` |
| 一括出席の記録完了 | `.success` | `NowNextBar` — `trigger: unrecordedCount` |
| 個別ステータス変更 | `.impact(weight: .light)` | `TodayAttendanceSheet` — `trigger:` 変更カウンタ |

**haptics と遷移アニメはユニットテストで観測できない。** Reviewer に単体テストを求めない (§9.4)。検証は `ScreenshotFlow` と手動スモーク。

### 6.2 遷移アニメ (findings ★8: 0 箇所 = 全部が瞬間差し替え)

| 対象 | 手段 |
|---|---|
| 表示モード切替 | `HomeBody` に `.id(mode)` + `.transition(.opacity)`、`HomeView` に `.animation(.snappy(duration: 0.22), value: mode)` |
| コンテキスト切替 | 同上 (`value: context`) |
| 現在コマのハイライト移動 | `.animation(.smooth, value: currentPeriodIndex)` (§5.3) |
| 「今日は全出席 (N)」の N | `.contentTransition(.numericText())` + `.monospacedDigit()` |
| 月送り | `.animation(.snappy(duration: 0.22), value: anchor)` |

`matchedGeometryEffect` は**使わない** (§11)。

### 6.3 標準部品への回帰 (スコープ内のもののみ)

| 現状 | 置換 | 備考 |
|---|---|---|
| `EmptyState` (自前) | **`ContentUnavailableView`** | ★ **マスコット (`Image("mascot-hello")`) を捨てない**。`ContentUnavailableView` の `label:` に `Label { Text(title) } icon: { Image("mascot-hello").resizable().scaledToFit() }` を渡せば、HIG 準拠の余白・文字サイズを得たままキャラクターが残る (**F7 で型検査済**)。呼び出し 3 箇所 |
| `Skeleton` (自前) | **`.redacted(reason: .placeholder)`** | 呼び出し 10 箇所。**スコープ内 (Home / 時間割 / カレンダー) の 4 箇所だけ**置換し、`Skeleton` 自体は残す (残り 6 箇所はスコープ外の画面) |
| `Chip` / `StatusDot` | **ファイルごと削除** | **grep で参照 0 を確認済** (`Chip(` の 3 ヒットは `selfChip(` の誤検出)。死にコード |
| `AuthProviderButton(.apple)` → `SignInWithAppleButton` | **やらない** | §11。認証画面の変更であり、ブランド規約を満たすよう設計済の資産を壊すリスクに対して本設計の要望と無関係 |

---

## 7. データモデル / 関数シグネチャ

DTO は**追加も変更もしない**。`OccurrenceDto` (`startMinute` / `endMinute` / `periodIndex` / `courseName` / `room` / `status`) と `DaySlotDto` に必要なものは全部ある (findings ★2「データは既にある」)。**新規は純粋ロジック 5 本のみ。**

### 7.1 `SchoolClock` — 「今」の唯一の時計 (F3 / F4 の帰結)

```swift
// apps/ios/Atender/Core/Timetable/SchoolClock.swift (新規)
import Foundation

/// ★ API (apps/api/src/lib/tz.ts) は APP_TZ = "Asia/Tokyo" 固定で「今日」を決める。
///   クライアントが別の暦で「今日」を決めるとサーバと食い違う。
///   実測: CalendarRange (UTC 暦) は毎日 00:00〜08:59 JST の 9 時間、API と違う日付を返していた。
///   したがって「今」はデバイスのロケールでなく **JST で決める** (サーバとの整合が正義)。
enum SchoolClock {
    static let timeZone = TimeZone(identifier: "Asia/Tokyo")!

    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        c.locale = Locale(identifier: "ja_JP")
        return c
    }()

    /// 0:00 からの経過分 (JST)。DaySlotDto.startMinute と同じ土俵。
    static func nowMinute(_ now: Date = Date()) -> Int

    /// JST の今日 (yyyy-MM-dd)。API の TodayResponse.date と同じ土俵。
    static func todayString(_ now: Date = Date()) -> String

    /// 表示曜日 1=月 … 7=日 (TimetableGrid.days と同じ土俵)。週末を月曜に丸めない。
    static func displayDay(_ now: Date = Date()) -> Int
}
```

**`CalendarRange.todayString()` は削除する。** 置換規則: `grep -rn 'CalendarRange.todayString()' Atender/` の全ヒットを `SchoolClock.todayString()` に置換する。
`2ddd1f8` 時点のヒットは 11 箇所: `Settings/SemesterListSheet.swift:116` / `Calendar/PersonalCalendar.swift:8,9` / `SemesterOverview/CourseDetailModal.swift:92` / `Home/SelfTodayCTA.swift:25` / `SemesterOverview/SemesterOverviewComponents.swift:79` / `Rooms/RoomDetailView.swift:126,127,399` / `SemesterOverview/SemesterLogic.swift:131` / `Setup/SetupFlowView.swift:153`。

**`CalendarRange` の他の関数 (`parse` / `yyyyMMdd` / `addDays` / `mondayOf` / `monthFirst` / `format` / `utcCalendar` …) は触らない。** これらは「日付文字列の代数」であり UTC 暦で閉じているのが正しい (`"2026-07-17"` を UTC 正午として扱い、足し算して文字列に戻す)。**壊れていたのは代数ではなく「今日が何日か」を代数モジュールに聞いていたこと。**

### 7.2 `TodayTimeline` — 「次の授業」の純粋ロジック

```swift
// apps/ios/Atender/Core/Timetable/TodayTimeline.swift (新規)

enum TodayState: Equatable {
    /// 今日のコマが 0 件 (休日・授業なし)
    case noClass
    /// 授業前 or 休み時間。どちらもユーザーの問い (「次は何時から」) の答えは同じなので分けない
    case upcoming(next: OccurrenceDto)
    /// 授業中。next は最終コマなら nil
    case inClass(current: OccurrenceDto, next: OccurrenceDto?)
    /// 今日の全授業が終了
    case finished(last: OccurrenceDto)
}

enum TodayTimeline {
    static func state(occurrences: [OccurrenceDto], nowMinute: Int) -> TodayState

    /// 端末を開きっぱなしで日付をまたいだ場合の検出。loadedDate が nil なら true (未ロード = 要ロード)
    static func isStale(loadedDate: String?, now: Date = Date()) -> Bool
}

enum NowNextText {
    static func statusLabel(_ state: TodayState) -> String?   // 「授業中」「次の授業」「本日終了」/ noClass は nil
    static func title(_ state: TodayState) -> String?
    static func detail(_ state: TodayState) -> String?
}

enum AttendanceSummary {
    static func unrecordedCount(_ occurrences: [OccurrenceDto]) -> Int
}
```

**`state(occurrences:nowMinute:)` の規則** (曖昧さを残さないため全分岐を定義):

1. `occurrences` を `(startMinute, endMinute, id)` の昇順にソートする (**入力順に依存しない**)
2. `occurrences` が空 → `.noClass`
3. `current` = ソート後**最初に** `startMinute <= nowMinute && nowMinute < endMinute` を満たす要素
4. `next` = ソート後**最初に** `startMinute > nowMinute` を満たす要素
5. `current != nil` → `.inClass(current: current!, next: next)`
6. `current == nil && next != nil` → `.upcoming(next: next!)`
7. それ以外 → `.finished(last:)`。`last` = **`endMinute` が最大**の要素 (同値なら `startMinute` が最大、なお同値なら `id` が最大)

**境界** (端点の扱いを明文化): コマが `540..630` と `640..730` のとき
- `nowMinute == 540` → `.inClass` (開始丁度は「授業中」)
- `nowMinute == 630` → `.upcoming(next: 2限)` (**終了丁度は「授業中」でない**。`now < endMinute` が false)
- `nowMinute == 631..639` → `.upcoming(next: 2限)` (休み時間)
- `nowMinute == 730` → `.finished(last: 2限)`

**`isStale(loadedDate:now:)`** = `loadedDate == nil || SchoolClock.todayString(now) != loadedDate!`

**`NowNextText` の規則**:

| state | statusLabel | title | detail |
|---|---|---|---|
| `.noClass` | `nil` | `nil` | `nil` |
| `.upcoming(next)` | `"次の授業"` | `"\(next.periodIndex)限 \(next.courseName)"` | 下の join 規則 (`start` のみ) |
| `.inClass(current, _)` | `"授業中"` | `"\(current.periodIndex)限 \(current.courseName)"` | 下の join 規則 (`start–end`) |
| `.finished(last)` | `"本日終了"` | `"今日の授業は終わりました"` | `nil` |

**detail の join 規則**: `[時刻, room]` から `nil` と空文字を除いて `" · "` で連結する。
時刻は `.upcoming` が `TimeFormatting.minutesToTime(next.startMinute)`、`.inClass` が `"\(minutesToTime(current.startMinute))–\(minutesToTime(current.endMinute))"`。
`room` が `nil` / 空なら時刻のみ。両方無ければ `nil` (行を描かない)。

### 7.3 レイアウトの純粋ロジック

§5.3 `TimetableGridLayout` / §5.5 `CalendarMonthLayout` / §5.5 `CalendarDayStyle` / §5.2 `HomeChips.isVisible(rooms:)`。

### 7.4 `NowNextBarHost` の配線 (日付またぎの扱い)

```swift
TimelineView(.everyMinute) { context in
    let state = TodayTimeline.state(occurrences: viewModel.occurrences,
                                    nowMinute: SchoolClock.nowMinute(context.date))
    NowNextBar(state: state, unrecordedCount: AttendanceSummary.unrecordedCount(viewModel.occurrences), ...)
        .task(id: SchoolClock.todayString(context.date)) {
            if TodayTimeline.isStale(loadedDate: viewModel.today?.date, now: context.date) {
                await viewModel.load()
            }
        }
}
```

`TimelineView(.everyMinute)` が毎分再評価する → `SchoolClock.todayString(context.date)` は日付が変わった瞬間に別値になる → `.task(id:)` が再発火し `load()` が走る。**初回表示でも `.task(id:)` は発火するので、初期ロードもこれ 1 本で足りる** (`SelfTodayCTA` の現状の `.task` は不要になる)。

---

## 8. 挙動仕様

Reviewer はここからテストを生成する。`#` 番号をテスト名に含めること (例: `[ui-revamp #N4]`)。

### 8.1 時計 (`SchoolClock`) — C

すべて `Date` を注入して決定的に検証する (`Date()` の既定引数に頼らない)。

- **#C1**: `todayString` — JST `2026-07-17 08:00` → `"2026-07-17"`。**★ 現行 `CalendarRange.todayString()` は同じ瞬間に `"2026-07-16"` を返す (実測 F3)。この 1 本が回帰の要**
- **#C2**: `todayString` — JST `2026-07-17 00:00` / `08:59` / `09:00` / `23:59` → すべて `"2026-07-17"`
- **#C3**: `todayString` — JST `2026-07-17 23:59` の 1 分後 (`2026-07-18 00:00`) → `"2026-07-18"`
- **#C4**: `nowMinute` — JST `00:00` → `0` / `08:00` → `480` / `09:00` → `540` / `23:59` → `1439`
- **#C5**: `displayDay` — 2026-07-13(月) → `1` / 07-17(金) → `5` / **07-18(土) → `6`** / **07-19(日) → `7`**。**週末を月曜に丸めない** (削除する `todayDayOfWeekJs` との違いがここ)
- **#C6**: `SchoolClock.timeZone.identifier == "Asia/Tokyo"` かつ、デバイスの `TimeZone.current` に**依存しない** — テストは TZ を変えても同じ結果になること (`SchoolClock.calendar.timeZone` が固定であることの確認)
- **#C7**: `CalendarRange.parse` / `addDays` / `mondayOf` / `monthFirst` / `format` の既存の挙動は**不変** (既存テストが緑のまま)

### 8.2 「今」のロジック (`TodayTimeline`) — N

コマ: 1限 `540..630` / 2限 `640..730` / 3限 `780..870` を基本形とする。

- **#N1**: `occurrences` が空 → `.noClass` (nowMinute に関わらず)
- **#N2**: `nowMinute = 480` (1限前) → `.upcoming(next: 1限)`
- **#N3**: `nowMinute = 540` (1限開始丁度) → `.inClass(current: 1限, next: 2限)` — **境界: 開始丁度は授業中**
- **#N4**: `nowMinute = 600` (1限の途中) → `.inClass(current: 1限, next: 2限)`
- **#N5**: `nowMinute = 630` (1限終了丁度) → `.upcoming(next: 2限)` — **境界: 終了丁度は授業中でない**
- **#N6**: `nowMinute = 635` (1限と2限の間) → `.upcoming(next: 2限)`
- **#N7**: `nowMinute = 735` (2限と3限の間) → `.upcoming(next: 3限)`
- **#N8**: `nowMinute = 800` (最終コマ中) → `.inClass(current: 3限, next: nil)` — **最終コマの next は nil**
- **#N9**: `nowMinute = 870` (最終コマ終了丁度) → `.finished(last: 3限)`
- **#N10**: `nowMinute = 1400` (全授業終了後) → `.finished(last: 3限)`
- **#N11**: `occurrences` が**入力順バラバラ** (3限, 1限, 2限) でも #N2〜#N10 と同じ結果 (ソートが効いている)
- **#N12**: コマが 1 件だけ (`540..630`) で `nowMinute = 400` → `.upcoming` / `600` → `.inClass(current:, next: nil)` / `700` → `.finished`
- **#N13**: 重なるコマ (`540..630` と `540..730`) で `nowMinute = 600` → `current` は `(start, end, id)` 昇順の先頭 = `540..630` の方
- **#N14**: `isStale(loadedDate: nil, now:)` → `true`
- **#N15**: `isStale(loadedDate: "2026-07-17", now: JST 2026-07-17 08:00)` → `false` (★ UTC 暦だと `true` になり毎朝 9 時前に無限リロードする。#C1 と同根)
- **#N16**: `isStale(loadedDate: "2026-07-17", now: JST 2026-07-18 00:00)` → `true`
- **#N17**: `AttendanceSummary.unrecordedCount` — `status == nil` の件数。全部記録済なら `0`、空配列なら `0`

### 8.3 「今」の文言 (`NowNextText`) — L

- **#L1**: `.noClass` → statusLabel / title / detail すべて `nil`
- **#L2**: `.upcoming(next: 3限 英語 780分 room "A302")` → statusLabel `"次の授業"` / title `"3限 英語"` / detail `"13:00 · A302"`
- **#L3**: `.inClass(current: 1限 情報デザイン 540..630 room "B201", next: 2限)` → statusLabel `"授業中"` / title `"1限 情報デザイン"` / detail `"09:00–10:30 · B201"`
- **#L4**: `room == nil` の `.upcoming` → detail は時刻のみ (`"13:00"`)。**` · ` の余りが出ない**
- **#L5**: `room == ""` の `.upcoming` → #L4 と同じ (空文字も落とす)
- **#L6**: `.finished(last:)` → statusLabel `"本日終了"` / title `"今日の授業は終わりました"` / detail `nil`

### 8.4 グリッドのレイアウト (`TimetableGridLayout`) — G

- **#G1**: `rowHeight(available: 500, rowCount: 5)` → `(500-28)/5 = 94.4`
- **#G2**: `rowHeight(available: 200, rowCount: 6)` → **`44`** (最小に張り付く。`(200-28)/6 ≈ 28.7 < 44`)
- **#G3**: `rowHeight(available: 500, rowCount: 0)` → `44` (0 除算しない)
- **#G4**: `contentHeight(available: 500, rowCount: 5)` → `28 + 94.4*5 = 500` — **収まるときは available ちょうど (= スクロールしない)**
- **#G5**: `contentHeight(available: 200, rowCount: 6)` → `28 + 44*6 = 292` — **溢れるときは available を超える (= スクロールする)**
- **#G6**: `rowHeight` は常に `>= 44` (HIG のタップ領域。available をどれだけ小さくしても)
- **#G7**: `currentPeriodIndex(daySlots: [1限 540..630, 2限 640..730], nowMinute: 600)` → `1`
- **#G8**: 同 `nowMinute: 635` (コマ間) → `nil`
- **#G9**: 同 `nowMinute: 630` (終了丁度) → `nil` / `nowMinute: 640` (開始丁度) → `2`
- **#G10**: `daySlots` が空 → `nil`
- **#G11**: `isBreak == true` の slot も対象になる (`daySlots: [休み 630..640]`, `nowMinute: 635` → その `periodIndex`)
- **#G12**: `daySlots` が `periodIndex` 降順で渡されても #G7 と同じ (ソートが効いている)

### 8.5 カレンダー — CA

- **#CA1**: `CalendarMonthLayout.rowHeight(available: 700)` → `(700-26-200)/6 ≈ 79.0`
- **#CA2**: `rowHeight(available: 300)` → **`56`** (最小に張り付く)
- **#CA3**: `contentHeight(available: 700)` → `26 + rowHeight*6`
- **#CA4**: `rowHeight` は常に `>= 56`
- **#CA5**: `CalendarDayStyle.emphasis` — 選択日かつ今日 → `.selected` (**selected が today に勝つ**)
- **#CA6**: 今日かつ非選択かつ当月 → `.today`
- **#CA7**: 今日かつ非選択かつ**当月外** (前月末尾のセルが今日) → `.today` (**today が outsideMonth に勝つ**)
- **#CA8**: 非選択・非今日・当月外 → `.outsideMonth`
- **#CA9**: 非選択・非今日・当月 → `.normal`
- **#CA10**: 選択日かつ当月外 → `.selected`

### 8.6 ホーム — H

- **#H1**: `HomeChips.isVisible(rooms: [])` → `false`
- **#H2**: `HomeChips.isVisible(rooms: [room1])` → `true`
- **#H3**: `HomeChips.items(rooms:)` の既存契約は**不変** — 先頭が `.selfChip(label: "自分")`、以降が入力順の room (既存 `HomeChipsTests` 3 本が緑のまま)

### 8.7 ローカライズ / フォント / シェル — S

- **#S1**: `Bundle.main.preferredLocalizations == ["ja"]` — **★ 負の対照**: `project.yml` から `developmentLanguage: ja` を外すと `["en"]` になることを確認済 (F2)。この assert には牙がある
- **#S2**: `Bundle.main.object(forInfoDictionaryKey: "CFBundleDevelopmentRegion") as? String == "ja"`
- **#S3**: `Bundle(for: UIViewController.self).localizedString(forKey: "Back", value: "?", table: nil) == "戻る"` — **システムの back が日本語になる = `BackHeaderButton` が不要になったことの直接証拠**
- **#S4**: `UIFont(name: "GoogleSans-Medium", size: 17) != nil` — Google サインインボタンのブランド資産が生きている
- **#S5**: `UIFont(name: "ThisFontIsNotRegistered-XYZ", size: 14) == nil` — **負の対照** (assert が vacuous でないこと)
- **#S6**: `UIFont(name: "Inter-Regular", size: 14) == nil` / `Inter-Bold` / `Inter-SemiBold` / `Inter-Medium` / `Inter-Black` もすべて `nil` — **Inter が登録解除されたことの証明**。誰かが `UIAppFonts` に戻したら落ちる
- **#S7**: `UIFont(name: "NotoSansJP-Thin", size: 14) == nil` — Noto も登録解除
- **#S8**: `UIAppFonts` の全エントリが (a) パスを含まない (b) バンドル内に実在する — **既存の不変条件テストをそのまま維持** (件数のマジックナンバーでは書かない)
- **#S9**: `MainTab.allCases.count == 5` + 5 タブの label と symbol が現状のまま (既存 `NavigationTests` が緑のまま。F6)
- **#S10**: `MainTab.allCases` の全 symbol が `UIImage(systemName:) != nil` — **F6 で `calendar.fill` の不在に刺されたので、symbol 名の実在を機械的に守る**

### 8.8 UI の状態網羅 (ui-ux-design-perspectives §7-4)

| 画面/部品 | loading | empty | error | 権限なし |
|---|---|---|---|---|
| ホーム (時間割) | `.redacted(.placeholder)` を敷いたグリッド | 学期未作成 → `ContentUnavailableView("先に学期を作成してください")` | 現状どおり `Panel` | — |
| ホーム (カレンダー) | `.redacted(.placeholder)` | `ContentUnavailableView("この学期の時間割がありません")` | `ContentUnavailableView("カレンダーを読み込めませんでした")` | — |
| `NowNextBar` | **バーを出さない** (`occurrences` 未ロード = `.noClass` 相当) | `.noClass` → **バーを出さない** | ロード失敗 → **バーを出さない** (現状の `today = nil` と同じ。ホームを壊さない) | — |
| `ContextChips` | rooms 未ロード → 出さない (`isVisible([]) == false`) | 同左 | 同左 | — |
| ルーム時間割 | `.redacted` | `ContentUnavailableView` (現状の EmptyState と同文言) | `Panel` (現状のまま) | 現状のまま |

**`NowNextBar` が「出ない」ことでローディング/エラーを表現する理由**: このバーは**補助情報**であり、失敗してホームの主機能 (時間割) を壊してはならない。現状の `SelfTodayCTA` も `today = nil` で `Color.clear.frame(height: 0)` を返しており、フェイルオープンの方針は同じ。

---

## 9. テスト基盤 / 既存テストへの影響

### 9.1 基盤

- **フレームワーク**: XCTest
- **配置**: `apps/ios/AtenderTests/` に以下を新規追加
  - `SchoolClockTests.swift` (#C1〜#C7)
  - `TodayTimelineTests.swift` (#N1〜#N17)
  - `NowNextTextTests.swift` (#L1〜#L6)
  - `TimetableGridLayoutTests.swift` (#G1〜#G12)
  - `CalendarLayoutTests.swift` (#CA1〜#CA10)
  - `LocalizationTests.swift` (#S1〜#S3)
  - `HomeChipsTests.swift` に **#H1/#H2 を追記** (既存 3 本は触らない)
  - `TypographyRegistrationTests.swift` を **全面書き換え** (#S4〜#S8)
  - `NavigationTests.swift` に **#S10 を追記** (既存は触らない)
- **実行**: `/opt/homebrew/bin/xcodegen generate` → `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'`
- **ベースライン**: **183 GREEN / 0 RED** (`.knowledge/known-failures.md`、`eb96e8a`)。**未分類 0**
- **スクショ検証**: `AtenderUITests/ScreenshotFlow.swift` (`xcodebuild test -scheme AtenderUITests ... -resultBundlePath run.xcresult` → `xcrun xcresulttool export attachments`)。**刷新の before/after 比較の本体**。§5.4 のとおりラベルと accessibilityIdentifier を保存するので、ハーネスは無改修で動く

**`Date` の注入**: `SchoolClock` / `TodayTimeline` の全関数は `Date` を引数で受ける (既定引数 `Date()` は本番用)。**テストは既定引数を使わない** — 使うと「テストを走らせた時刻」に依存して深夜に落ちる。

**★ Reviewer への必須指示**:
1. **#C1 と #N15 を必ず書くこと。** これが「今」の土台が JST であることの唯一の防波堤であり、**現行実装ならこの 2 本は落ちる** (実測 F3)。落ちなければテストが間違っている
2. **#S1 / #S5 / #S6 の負の対照を省略しないこと。** `Font.custom` は解決失敗を無言でシステムフォントに落とすので、正の assert だけでは vacuous pass する (`gotcha/swiftui-font-custom-silent-fallback-hides-missing-uiappfonts.md`)。**検証は `UIFont(name:)` で書く。`Font.custom` を検証に使わない**
3. **レイアウト定数をテストにベタ書きするな** — `44` / `56` / `28` は `TimetableGridLayout.minRowHeight` 等の**トークンを参照して**書く。ベタ書きすると `DesignTokenTests` が `Space.selfTtChrome == 352` を焼き込んで刷新で全滅したのと同じ構図を作る
4. **haptics / 遷移アニメ / Liquid Glass の見た目にユニットテストを書かない** (§9.4)

### 9.2 意図的に壊すテスト

**findings は「9 件」と見積もっていたが、実際に本設計が壊すのは 3 本 (2 ファイル) だけ。** 残りは契約を保つ設計にしたので緑のまま。

| # | テスト | 壊れる理由 | Reviewer の再生成方針 |
|---|---|---|---|
| 1 | `DesignTokenTests.testSpacingAndRadiusTokens` | `Space.selfTtChrome` と `Space.tabBarHeight` を**削除する**ので**コンパイルが通らない** (assert が落ちるのではない) | 該当 2 行を削除。`Radius.full == 9999` と `Space.s20 == 80` の 2 行は**そのまま維持** (これらのトークンは残る)。**削除したトークン名を新しい定数で assert し直さない** — 「消えた」ことはコンパイラが保証する |
| 2 | `TypographyRegistrationTests.testRegisteredFontPostScriptNamesResolveWithUIFont` | `Font.interPostScriptName` を削除 + Inter/Noto を登録解除 | **#S4〜#S7 に全面書き換え**。「Inter が**無い**こと」を assert する側に反転させる |
| 3 | `TypographyRegistrationTests.testUIAppFontsPlistContainsBundledFontFiles` | `UIAppFonts` が 7 件 → 1 件 | **#S8**。`expectedFontFiles` を `["GoogleSans-Medium-Latin.ttf"]` に。**「全エントリがパス無し + バンドル内に実在」の不変条件ループは価値が高いのでそのまま残す** |

**加えて削除するテスト 1 本**:

| テスト | 理由 |
|---|---|
| `DayConventionTests.testTodayDayOfWeekJsRoundsWeekendToMonday` | 検証対象の `DayConvention.todayDayOfWeekJs` を**削除する**ため。**この関数は本番コードから 1 箇所も呼ばれていない** (F5: 定義とテストのみ = テストのためだけに生きている死にコード)。かつ「土日は月曜」という仕様は §5.3 の「今日の列」と**正面から矛盾する** — 隣に残せば Developer が誤って掴む罠になる。`DayConventionTests` の他のテスト (`jsToDisplay` / `displayToJs` / `resolveDisplayDays`) は**そのまま維持** |

**緑のまま (findings の見積もりから外れるもの、理由付き)**:

| テスト | findings の見積もり | 本設計での実際 | 理由 |
|---|---|---|---|
| `NavigationTests` (5 タブ + label + symbol) | 壊れる | **緑** | IA を変えない (Leader 確認済) + **F6 により symbol 名も変えない** (`calendar.fill` が存在しないので fill 統一は不可能)。native `TabView` は `MainTab.label` / `.symbol` をそのまま `.tabItem` に渡す |
| `HomeChipsTests` (3 本) | 壊れる | **緑** | `HomeChips.items(rooms:)` の契約を変えない。可視判定は**新関数** `isVisible(rooms:)` として足す (既存関数に条件を混ぜない) |
| `SelfTimetableViewModelTests` の `eventInputs` 系 | — | **緑** | ViewModel のロジックを変えない (学期ピッカーと ⚙︎ は View 層の移設のみ) |

### 9.3 ★ 見落とすと事故る 5 件 — 「ロジックテスト」の顔をした色結合

台帳にこの類型で焼かれた実績がある (`315d542` のリブランドが**本番の色だけ変えてテストを置き去りにし**、2 件が 9 ヶ月ベースラインに埋もれた)。**同じ地雷が今も埋まっている**:

| テスト | ベタ書きされている値 |
|---|---|
| `MeetingExpansionTests.testOutputWithinPalette` | `#12B172,#56D8C3,#568CFC,#A978FA,#FC6ABF,#FD728E` |
| `SelfTimetableViewModelTests.testEventInputsColorFallbackWhenCourseMissing` | `#1E96E6` |
| `RoomLogicTests` (3 本 / `sourceColor` と `color`) | `#38bdf8` / `#94a3b8` / `#F97316` |

**本設計はこれらの hex 値を 1 つも変えないので、5 件は全部緑のまま。**
→ **Developer への指示**: **色の「値」を触るな。** §3.3 の中立色の置換対象は `bg*` / `text*` (ただし `textOnAccent`/`textOnDanger` を除く) / `border*` の**それだけ**。`MemberColor.palette` / `accent*` / `status*` / `brand*` / `SelfTimetableView` のフォールバック `#1E96E6` / `RoomCalendarLogic.sourceColor` の値に**ついで掃除で手を出さない**。ハードコード hex をトークンに寄せたくなるが、それは本設計の要望と無関係で、この 5 件を無言で壊す。

**新しく書くコードの流儀**: 色は**必ずトークン名で比較する** (`Color.statusPresent` 等)。`CalendarEventDisplayTests` / `SemesterOverviewDisplayLogicTests` が正しい実例。

### 9.4 テストしないもの (Reviewer に求めない)

| 対象 | 理由 | 代わりの検証 |
|---|---|---|
| Liquid Glass が出ていること | `glassEffect` の描画結果を XCTest から観測する API が無い。SDK リンクで自動適用される部分 (tab bar / nav bar / sheet) は**そもそもアプリのコードに現れない** | iOS 26.5 シミュレータでの `ScreenshotFlow` (§10 の検証手順) |
| haptics (`.sensoryFeedback`) | 発火を観測する公開 API が無い | 実機手動 |
| 遷移アニメ | 同上 | `ScreenshotFlow` + 手動 |
| クロームが何 pt 減ったか | **導出値を doc に焼くと errata になる** (§5.1 は規則だけを書いてある)。`contentHeight == available` (#G4) がレイアウトの本質的な不変条件で、そちらは機械的に検証できる | #G4 / #CA3 + スクショ |

---

## 10. 実装順序 (フェーズ)

**findings の優先順から 1 点だけ組み替えた。根拠を書く。**

findings は **「今」の実装を #1** に置いていた (「最大の勝ち筋」)。本設計は **「今」の UI を Phase 3** に置き、**「今」のロジックを Phase 1** に前倒しする。

**根拠**: 「今」の UI (`NowNextBar`) は `SelfTodayCTA` を置換するが、`SelfTodayCTA` はクロームの最大要素 (~162pt) であり、**その下端の構造は Phase 2 の native `TabView` 化で作り替わる** (自前 `tabBarHeight` パディング → `safeAreaInset`)。先に UI を作れば Phase 2 で作り直しになる。
一方**「今」のロジック** (`SchoolClock` / `TodayTimeline` / `NowNextText` / `currentPeriodIndex`) は UI から完全に独立しており、いつ書いても捨てない。**しかも `SchoolClock` は既存バグ (F3: 朝 9 時前の日付ズレ / 月曜朝のルーム時間割が先週になる) の修正を含むので、単独で価値がある。**
→ **勝ち筋の中身 (ロジック + バグ修正) は最速で確定させ、その皮 (UI) だけを構造が固まった後に被せる。**

| Phase | 内容 | 独立性 / 理由 |
|---|---|---|
| **P1 土台** | §3 全部 (書体 / フォントトークン / 中立色 / `AmbientBackground` 削除 / `Space` 整理 / `ScreenMetrics`) + §7.1 `SchoolClock` + §7.2 `TodayTimeline`・`NowNextText`・`AttendanceSummary` + §5.3 `TimetableGridLayout` + §5.5 `CalendarMonthLayout`・`CalendarDayStyle` + `project.yml` の `developmentLanguage`/`UIAppFonts` | **ビルド基盤に効く** (`project.yml` + xcodegen + フォント登録)。全画面に波及するが機械的。**新規ロジックは全部ここで、UI 無しで、テスト付きで着地する** |
| **P2 シェル** | §4 全部 (native `TabView` / `BottomTabBar`・`PlaceholderViews` 削除 / nav bar 復活 / `BackHeaderButton` 削除 / `RootView` / Glass シム / dark 既定) | P1 の `ja` 設定に依存 (back が「戻る」になって初めて `BackHeaderButton` を消せる)。**`RootView` / `project.yml` で version-management と合流する点** (§4.4) |
| **P3 ホーム** | §5 全部 (nav bar への畳み込み / `ContextChips` 条件表示 / グリッドが available を受け取る / 「今」の描画 / `NowNextBar` / カレンダー拡大) | **本命。** P2 のシェルに乗る。**「今」の UI とクローム再編は同じ場所 (`SelfTodayCTA` → `NowNextBar`) を触るので分けない** |
| **P4 仕上げ** | §6 全部 (haptics / ジェスチャ / 遷移アニメ / `ContentUnavailableView` / `.redacted` / `Chip`・`StatusDot` 削除 / `BottomSheet` の `ScreenMetrics` 置換) | P3 の構造が固まった後。**単体で RED になっても本体は動く** = 最後に置くのが安全 |

**認証の再ゲート**: いずれのフェーズも**認証ロジックに触れない**。P1 が `AuthProviderButton` の**フォント指定 2 行**に触るのみ (§3.2)。`SignInWithAppleButton` への置換は**やらない** (§11)。

**推奨マージ順**: `feature/version-management` → P1 → P2 → P3 → P4。

### 10.1 実装後の必須検証 (doc の注記は実行されないが、これは実行される)

**★ 本設計の中心的な主張は「native 部品にすると Liquid Glass が出る」だが、ユニットテストはそれを 1 ミリも検証しない** (§9.4)。したがって検証を成果物の中に置く:

1. **P2 完了時**: `ScreenshotFlow` を **iOS 26.5 シミュレータ**で走らせる
   `xcodebuild test -project Atender.xcodeproj -scheme AtenderUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=26.5' -resultBundlePath glass.xcresult`
   → `01-home-timetable` のタブバーが**すりガラス状で背後のコンテンツが透けている**こと。**P2 前の同じスクショと比較する** (before は現行 main で 1 回撮っておく)
   - **判定が成功/失敗で違う値になるか**: タブバーの背景が「不透明な `bgElevated` 85%」から「背後が屈折して見えるガラス」に変わる = **目視で区別可能**。変わっていなければ native 化が効いていない
2. **P2 完了時**: 同じフローを **iOS 18.2** でも走らせる → **タブバーが普通に出ていること** (ガラスは出ない = 正しい。21% のユーザーの体験)
3. **P3 完了時**: iPhone SE (小画面) と iPhone 16 の両方で `01-home-timetable` を撮り、**グリッドが溢れずに収まっている**こと (#G4/#G5 の実地確認)
4. **P1 完了時**: **negative control** — `project.yml` から `developmentLanguage: ja` を一時的に外して `xcodegen generate` → **#S1/#S2/#S3 が赤くなること**を確認してから戻す。「GREEN は修正が作った」と言い切るため (F2 で Architect が実施済の手順をそのまま踏む)

---

## 11. 不採用案

### 11.1 本設計で検討して却下したもの

| 案 | 却下理由 |
|---|---|
| **`.tabViewBottomAccessory` に「次の授業」を載せる** | iOS 26.0+。**主機能を OS 版数で割ることになり、iPhone の 21% (iOS 18 = 14% / それ以前 = 7%) に「次の授業」が出なくなる。** 加えて全タブに出るので「ホームの要素」という IA と食い違う。**分岐してよいのは質感だけで、機能・レイアウト・IA は分けない** (§4.5)。`NowNextBar` を `safeAreaInset` でホームに置けば全 OS で同一に動き、ガラスかどうかだけが `atenderGlass` で落ちる |
| **deployment target を 26 に上げる** | iPhone install base の 21% を失い、得るのは `#available` シム (§4.5 の 20 行) の削除だけ。**Liquid Glass は SDK リンクで決まるので target 17 のままでも出る** (実証済) |
| **`Tab(value:role:)` / `.tabViewStyle(.sidebarAdaptable)`** | iOS 18.0+。target 17 では使えない。**旧 `.tabItem` でもガラスタブバーは出る**ので急ぐ理由がない。構造的な崖は 26 でなく 18 |
| **フォントトークン (`atenderXs`..`atender5xl`) をリネームする** | 207 箇所の機械的リネーム。名前は**スケール上の位置**を表しており差し替え後も真 (xs < sm < base < …)。**1 ピクセルも変えずにリスクだけ増える** |
| **`Font.atender(_:_:)` を `.system(size:weight:)` に置換して残す** | `Font.system(size:)` は Dynamic Type に追従しない。現状の `Font.custom(_, size:, relativeTo: .body)` は追従しているので、**これは機能後退**。text style に寄せる (§3.2) |
| **`AuthProviderButton(.apple)` → `SignInWithAppleButton`** | findings ★5 が挙げているが、(a) **認証画面の変更** = CLAUDE.md のエスカレーション対象で、本設計の要望 (ホーム/時間割/カレンダー) と無関係 (b) 現行のボタン群は Apple と Google の**両ブランド規約を満たすよう寸法まで実測して設計された資産** (`knowledge/library/signin-button-branding-google-apple-2026.md`)。標準部品に替えると Google 側との視覚的統一 (塗り/高さ/角丸/ロゴ枠/ラベル左端) が崩れる。**「標準部品だから正しい」が成り立たない唯一の場所**。別テーマとして扱う |
| **`Skeleton` を全廃して `.redacted` に統一** | 呼び出し 10 箇所のうち 6 箇所がスコープ外の画面。**スコープ外の画面を「ついでに」書き換えると、本設計の RED の原因帰属が絡まる**。スコープ内 4 箇所のみ置換し、`Skeleton` 自体は残す |
| **`BottomSheet` / `SheetScaffold` の重複統合** | 21 箇所の呼び出しを持つ横断リファクタ。本設計のどの要望にも紐付かない。**新規シートは native `.sheet` を使う**と定めれば重複は増えない |
| **`matchedGeometryEffect` でモード切替を繋ぐ** | 時間割グリッドとカレンダーは**要素の対応関係が存在しない** (5×N のコマ ↔ 42 個の日セル)。繋ぐ対象がないところに `matchedGeometryEffect` を使うと、意味のない変形アニメになる。`.opacity` で十分 |
| **`GlassEffectContainer` / `glassEffectID` / `glassEffectUnion`** | 近接する**複数の**ガラス面を融合させる道具。本設計のガラス面は `NowNextBar` の 1 つだけ。**使わない API をシムに置かない** |
| **ダークモードのトグル自体を削除する** (HIG は OS 追従を求める) | 「作った UI を捨てるか」は**プロダクト判断で Architect の裁量ではない**。既定値を `.auto` に変える (§4.6) だけで HIG の実害 (OS 設定の無視) は消える |
| **`ContextChips` を廃止して nav bar の `Menu` に畳む** | 40pt は消えるが、**「友達と会話しながらみんなの時間割を確認」が 1 タップ → 2 タップになる**。Touri が名指しした最頻ユースケースの interaction cost を上げてまで取る 40pt ではない。ルームが 0 個のとき**だけ**消す (§5.2) |
| **`ContextChips` を `Picker(.segmented)` にする** | ルーム数が可変 (0〜N) で、segmented は要素数が増えると各セグメントが潰れる。`+` (追加導線) も segment に混ぜると「navigation に action を混ぜる」ことになる (HIG §4) |
| **`.navigationTitle` に large title を使う** | 34pt + 余白で縦を大きく食う。「時間割とカレンダーを大きく」が最優先要望であり、**現在地は選択タブと segmented picker が示している**。`.inline` を採る |
| **`DayAgendaPanel` を廃止してカレンダーを最大化する** | 「大きく」は最大化された。**選択日の予定リストという機能の削除はプロダクト判断**。200pt に抑えて残す (§5.5) |
| **`CalendarRange` 全体を JST 暦に変える** | `parse`/`addDays`/`mondayOf` は「日付**文字列**の代数」であり、UTC 暦で閉じて round-trip するのが正しい設計。**壊れていたのは代数ではなく「今日が何日か」を代数モジュールに聞いていたこと。** 暦ごと変えると 11 箇所の round-trip 全部を再検証する羽目になり、直す対象を取り違える |
| **`SchoolClock` を `Calendar.current` (デバイスのロケール) で作る** | 大半のユーザーでは JST と一致するが、**API が `APP_TZ = "Asia/Tokyo"` で「今日」を決めている**以上、クライアントが別の暦で決めるとサーバと食い違う (それが F3 のバグの構造そのもの)。**サーバとの整合を正義に採る**。海外の学校への対応が必要になったら API 側の `APP_TZ` から一緒に直す話 |
| **`DayConvention.todayDayOfWeekJs` を「週末は nil」に修正して再利用** | シグネチャ (`-> Int`) を変えることになり、既存テストも結局書き換わる。**かつこの関数は本番から 1 箇所も呼ばれていない** (F5) ので、「修正して再利用」する既存資産が実在しない。新設して消す方が短い |
| **`Space` の 4pt グリッド (`s0_5`..`s20`) を捨てる** | Web 由来ではあるが、4pt グリッドは HIG に反しない (HIG に 8pt グリッドの明文は**無い** — `ui-ux-design-perspectives` §2)。**「Web 由来」は却下理由にならない。** 実害があるのは画面寸法を先読みする定数だけ (§3.5) |
| **タブアイコンを filled variant に統一する** (HIG 推奨) | **`calendar.fill` が存在しない** (F6 実測)。5 個中 4 個だけ fill にすると混在する。outline 統一を採る |

### 11.2 findings が挙げていた不採用案 (再掲・本設計でも不採用)

| 案 | 却下理由 |
|---|---|
| **Live Activity で「次の授業」を出す** | HIG は Live Activity を「a few hours」の**有界な進行中タスク**向けと定義する。「終日ずっと次の授業を出す」は設計意図から外れる。「一瞥」の本命は**ウィジェット** (`Button(intent:)` は iOS 17.0 で素で使える) であり、それは別 doc (§0) |
| **TimeTree に素直に寄せる** | TimeTree は 2026-01 に「カレンダー中心」→「個人軸 + ホーム上部にフィルタ」へ移行済で、`ContextChips` + `HomeViewModeTabs` は**まさにそれ**。寄せると「現状維持」が結論になる。**不満の正体は構造でなく (a) 次の授業が分からない (b) クロームが 41%** であり、本設計はその 2 つを直している |
| **ボトムナビを 3 項目に減らす** (TimeTree は 3) | HIG にタブ数の固定上限は**無い** (「3-5」は旧 HIG / MD3 由来の慣習値)。**IA は変えないと Leader が確定済** |

---

## 12. エスカレーション事項 (Leader → Touri)

| # | 事項 | Architect の推奨 |
|---|---|---|
| 1 | **★ 規約の全面撤回** (§1)。「iOS は Web の忠実移植」「トークンを 1:1 で移植」を捨てる。これが承認ゲートの本体 | **撤回する。** Liquid Glass 採用と 1:1 移植は定義上両立しない。ただし **IA・機能・ブランド色・キャラクターは Web と共有し続ける** (§1.3) ので、捨てるのは「見た目の移植」だけ |
| 2 | **ダークモードの既定が light → auto に変わる** (§4.6)。一度も設定を触っていないダークモード利用者のアプリが、更新後にダークになる | **auto にする。** HIG は OS 設定への追従を求めており、中立色を system semantic に移す (§3.3) 以上、light 固定はその意味を殺す。トグル自体は残すので、ライト固定したいユーザーは設定で戻せる |
| 3 | **本文が 14pt → 17pt になる** (§3.2)。**全画面のレイアウトが動く。** 情報量は 1 画面あたり減る | **上げる。** 「廉価 Web アプリ感」の物理的実体がこれ。Touri の「情報量多いと使われなくなる」とも方向が一致する。ただし**スコープ外の画面 (設定・友達・学期) でも文字が大きくなる**ので、崩れは `ScreenshotFlow` で洗う必要がある |
| 4 | **月セルの予定表示が 3 件 → 2 件に減る** (§5.5)。9pt → 11pt に上げた分の玉突き | **減らす。** 9pt は HIG の最小 11pt を割っており「読めない情報」は情報ではない。溢れは既存の `+N` 表示が担う |
| 5 | **`Font.atender(17,.semibold)` の削除が認証画面 (`AuthProviderButton`) に触れる** (§3.2)。CLAUDE.md「設計が認証に触れる」に形式上該当 | **やる。** 認証ロジックには触れず、**フォント指定 2 行のみ**。かつ Apple のブランド規約は SF を求めるので Inter → SF は**是正**。ラベルは日本語なので視覚的にはほぼ no-op (Inter に日本語グリフが無いため既に Hiragino) |
| 6 | **既存バグ 2 件を本設計が巻き込んで直す** (F3): (a) 毎朝 00:00〜08:59 JST に iOS が API と違う日付を使う (b) **月曜の 9 時前にルームの時間割が「先週」を読む** | **直す。** 「今」を作る以上、土台の時計が 9 時間ズレている状態の上には建てられない。**刷新と無関係に今日そこにあるバグ**なので、Touri が「UI だけ触って」と考えている場合は認識を合わせたい |
| 7 | **`ContextChips` が rooms 0 個のとき消える** (§5.2)。ルーム追加の `+` 導線もホームから消える (ルームタブは残る) | **消す。** 機能ゼロの 40pt。到達不能にはならない |

---

## 13. 変更ファイル一覧 (スコープ境界)

### 新規

| path | Phase |
|---|---|
| `apps/ios/Atender/Core/Timetable/SchoolClock.swift` | P1 |
| `apps/ios/Atender/Core/Timetable/TodayTimeline.swift` (`TodayState` / `TodayTimeline` / `NowNextText` / `AttendanceSummary`) | P1 |
| `apps/ios/Atender/Core/Timetable/TimetableGridLayout.swift` | P1 |
| `apps/ios/Atender/Core/Timetable/CalendarMonthLayout.swift` (`CalendarMonthLayout` / `CalendarDayEmphasis` / `CalendarDayStyle`) | P1 |
| `apps/ios/Atender/Core/DesignSystem/ScreenMetrics.swift` | P1 |
| `apps/ios/Atender/Core/DesignSystem/Glass.swift` | P2 |
| `apps/ios/Atender/Features/Home/NowNextBar.swift` (`NowNextBar` / `NowNextBarHost` / `TodayAttendanceSheet`) | P3 |
| `apps/ios/AtenderTests/{SchoolClock,TodayTimeline,NowNextText,TimetableGridLayout,CalendarLayout,Localization}Tests.swift` | 各 Phase |

### 削除 (**1 ファイルずつ参照元を grep して確定済**)

| path | 参照元 |
|---|---|
| `apps/ios/Atender/Core/DesignSystem/AmbientBackground.swift` | `RootView.swift:10` の 1 箇所のみ |
| `apps/ios/Atender/App/BottomTabBar.swift` | `MainTabView.swift:81` の 1 箇所のみ |
| `apps/ios/Atender/App/PlaceholderViews.swift` | `HomePlaceholderView`/`SemesterPlaceholderView` は `MainTabView` の 2 箇所 (直接呼びに置換)。**`RoomsPlaceholderView`/`FriendsPlaceholderView`/`PlaceholderScreen`/`TopBar` は参照 0** |
| `apps/ios/Atender/Core/DesignSystem/Components/BackHeaderButton.swift` | `RoomDetailView.swift:39` / `TemplatesView.swift:22` の 2 箇所 (行ごと削除、system back が代わる) |
| `apps/ios/Atender/Core/DesignSystem/Components/Chip.swift` | **参照 0** (`Chip(` の 3 ヒットは `selfChip(` の誤検出) |
| `apps/ios/Atender/Core/DesignSystem/Components/StatusDot.swift` | **参照 0** |
| `apps/ios/Atender/Resources/Fonts/Inter-{Regular,Medium,SemiBold,Bold,Black}.ttf` | `UIAppFonts` のみ (コードは `Font.interPostScriptName` 経由 → 削除) |
| `apps/ios/Atender/Resources/Fonts/NotoSansJP-VariableFont_wght.ttf` | `UIAppFonts` のみ。**コードからの参照 0** |

**★ `GoogleSans-Medium-Latin.ttf` は削除しない** — `AuthProviderButton.swift:102` が現に使用中。

### 主な変更

| path | 変更点 | Phase |
|---|---|---|
| `apps/ios/project.yml` | `options.developmentLanguage: ja` 追加 / `UIAppFonts` を GoogleSans 1 件に。**`CFBundleVersion` は触らない** | P1 |
| `Core/DesignSystem/Typography.swift` | 全面置換 (§3.2) | P1 |
| `Core/DesignSystem/Color+Atender.swift` | 中立色のみ置換 (§3.3)。**有彩色は 1 つも触らない** | P1 |
| `Core/DesignSystem/Space.swift` | §3.5 の表 | P1 |
| `Core/Timetable/TimetableLogic.swift` | `CalendarRange.todayString()` と `DayConvention.todayDayOfWeekJs` を削除。**それ以外は不変** | P1 |
| `Core/DesignSystem/Components/BottomSheet.swift` | `UIScreen.main` → `ScreenMetrics.height` (1 行) | P4 |
| `App/MainTabView.swift` | 全面置換 (§4.1) | P2 |
| `App/RootView.swift` | 3 点のみ (§4.4)。**version-management との合流点** | P2 |
| `Features/Home/HomeCore.swift` | `HomeView` 再構成 / `HomeViewModeTabs`・`HomeSemesterPicker` 削除 / `HomeChips.isVisible` 追加 | P3 |
| `Features/Home/SelfTimetableView.swift` | 学期ピッカーと ⚙︎ を除去 / `available`・`showSettings` を受け取る | P3 |
| `Features/Home/SelfTodayCTA.swift` | **`NowNextBar.swift` に置換して削除** | P3 |
| `Features/Timetable/TimetableGridPhaseB.swift` | `available` / `todayDisplayDay` / `currentPeriodIndex` を受け取る。`UIScreen.main` 除去 | P3 |
| `Features/Calendar/PersonalCalendar.swift` | 月グリッドの高さ / today セル / スワイプ | P3 |
| `Features/Rooms/RoomDetailView.swift` | nav bar 復活 / `BackHeaderButton` 除去 / `RoomTimetable` の `available` / `todayString` 置換 | P2, P3 |
| `Features/{Settings,SemesterOverview,Rooms,Friends,Setup}/*` | **土台追従の最小改修のみ** — `Space.tabBarHeight` パディング除去 (§4.2) / `Font.atender(size:)` 変換 (§3.2) / `todayString` 置換 (§7.1) / `.navigationBarHidden` 除去 (§4.3) | P1, P2 |

### 触らないもの

- `apps/web` / `apps/api` / `packages/shared` — **1 ファイルも変更しない**
- `Atender/Info.plist` (生成物。`project.yml` が正典 — `gotcha/xcodegen-info-plist-regenerated-every-run.md`)
- version-management が新規追加する `Core/Version/` / `Features/Version/` / `Core/Networking/*`
- 色の**値** (§9.3)
- `AtenderUITests/ScreenshotFlow.swift` (§5.4 でラベルと identifier を保存するので無改修で動く)
