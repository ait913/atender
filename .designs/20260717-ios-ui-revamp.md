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
| **`MemberColor.palette` / 科目色 / status 色 / accent の値** | **本設計はコードが描く色の「値」を一切変えない** (§9.3 の地雷回避)。**唯一の例外は `AccentColor.colorset` の是正** (§4.1) — 新しい色を決めるのではなく、**2026-07-09 の azure 決定 (`7ac596f`) から取り残された未移行の残骸を決定済の値へ追いつかせる**もの。**現在この asset を読む消費者は 0 なので、既存のピクセルは 1 つも変わらない** |

### 前提 (P) — **2026-07-17 更新: P1 は着地済 (`4dfd3a9`)**

- **P1: `feature/version-management` は着地済** (`60a127e`)。`RootView.swift` / `project.yml` の衝突懸念は解消。
  §4.4 の目標状態は着地後の実物と突合済 — `RootView` の現状は version gate 分岐 + `.task` 2 本 + `?? .light`。**`AmbientBackground()` の行は本設計 P1 で既に除去済**であり、**§4.6 (ダーク既定の `.auto` 化) は 2026-07-17 に Touri が撤回した**。→ **P2 は `RootView.swift` を 1 行も触らない** (§4.4)
- **P2: iOS ベースラインは 263 GREEN / 0 RED** (`4dfd3a9` = 本設計 P1 のマージ、2026-07-17 実測)。**未分類の失敗 0**。
  内訳: 201 (version-management 着地時) + P1 の新規 62 = 263。
  - ★ **各フェーズ着手前にベースラインを測り直すこと。** 件数だけを信じない (`Executed N tests, with M failures` の M まで読む — 台帳の教訓)
  - ★ **台帳 `.knowledge/known-failures.md` の iOS 節が正典** (2026-07-17 に Leader が実走記録付きで 263 へ更新済)。本節の数値は執筆時点のスナップショットなので、**食い違ったら台帳を採る**
  - ★ **資源 (フォント / アセット / `Info.plist` のキー) を削除・変更したフェーズの検証は `-derivedDataPath` で隔離して測る。** 共有 DerivedData の増分ビルドは古い登録状態のまま走り**偽の RED** を出す (P1 で実際に踏んだ)。詳細は台帳の同名節 / `Muraki/knowledge/gotcha/stale-deriveddata-false-red-after-resource-deletion.md`
- **P3: main は `4dfd3a9`** (本設計 P1 のマージ済)。
  - **§3 (デザイントークンの土台) と §7.1/§7.2/§5.3・§5.5 の純粋ロジックは実装済。** これらの節は**実装指示ではなく着地済の契約の記述**として読む
  - §4 (P2) / §5 (P3) の「現状」記述・file:line は **`4dfd3a9` で全件 re-grep して一致を確認済** (2026-07-17)。P1 は `Space` の 4 トークン削除 / `pagePxMobile` 12→16 / `Typography` 全面置換 / 中立色置換 / `AmbientBackground.swift` 削除 / `SchoolClock` 新設 + `todayString` 11 箇所置換を行ったが、**P2/P3 が触る行の行番号を動かしていない** (例外は §3.6 表の `SelfTodayCTA.swift:165` → **:166**、訂正済)

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
| `Font.atender(_ size:_ weight:)` | **削除** (`Font.custom("Inter-*")` の入口)。呼び出し **18 箇所**は §3.2 の表で変換 |
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

**`Font.atender(size:weight:)` 呼び出し 18 箇所の変換表** (生成規則: **8/9/10/11 → `.caption2` / 12 → `.caption` / 17 → `.headline`**。weight 指定は `.fontWeight(_:)` として残す):

**★ P1 で実施済** (`4dfd3a9` 時点で `Font.atender(` の残存 0 箇所)。以下は着地済の変換記録。

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

**★ ダーク既定の撤回 (§4.6) との整合** — **既定が `.light` のままでも本節の価値は落ちない。**
当初 §12-#2 で「light 固定は semantic color の意味を殺す」と書いたが、**これは言い過ぎだった**。semantic color の効能を分解すると、撤回で失われるのは 1 つだけ:

| semantic color の効能 | 既定 `.light` でも効くか |
|---|---|
| **Increased Contrast** (アクセシビリティ設定) への自動追従 | **効く** — appearance とは独立した trait |
| Liquid Glass との協調 (system material が前提とする背景) | **効く** — light でもガラスは system background の上で成立する |
| grouped background の階層 (base / secondary / tertiary) | **効く** — light でも 3 段は別の値を持つ |
| ユーザーが設定で `.dark` を選んだとき、**正しい** dark palette が出る | **効く** — トグルは残る (§4.6) |
| OS のダークモード設定に**自動で**追従する | **効かない** — ★ ここだけが撤回で失われる (Touri 裁定) |

→ 失われたのは**「自動追従」だけ**。**かつ `.dark` が設定から到達可能である限り、semantic color の dark 側の値は死にコードではない。**
→ これは §11「ダークモードのトグル自体を削除する」の却下理由を**弱めるのでなく強める**: 撤回後、**トグルは dark への唯一の経路**になった。

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

### 3.4 `AmbientBackground` の削除 — **P1 で実施済**

`Core/DesignSystem/AmbientBackground.swift` を**ファイルごと削除**。参照は `RootView.swift:10` の 1 箇所のみ。

**★ P1 で完了** (`4dfd3a9`): ファイル削除 + `RootView` から `AmbientBackground()` の行を除去。
**本設計が `RootView` に対して行う変更はこれで全部** — 本節と §4.4 は当初 `RootView.swift:10` の同じ 1 行を両方が要求していたが、その行は P1 が消した。残っていた §4.4 の (2)(3) は **2026-07-17 に Touri が撤回** (§4.6)。**P2 の Developer は `RootView.swift` を 1 行も触らない。**

理由 (findings ★8): 放射グラデ + `blur(radius: 60)` は Web の手法。**Liquid Glass は背後の「実コンテンツ」を屈折させて成立するので、全面に敷いたぼかしグラデの上では濁る。** system background に置き換える (§3.3 で `bgBase` が `.systemGroupedBackground` になるので、`RootView` は背景指定を持たなくてよい)。

### 3.5 `Space` の整理

**4pt グリッド (`s0_5`..`s20`) は維持する** — 良い土台であり、Web 由来という理由だけで壊す必要はない。削除するのは**画面寸法を先読みする定数**だけ。

**★ トークンの削除は「最後の本番参照が消えるフェーズ」でしか行えない。** 定数を先に消せばコンパイルが通らない。したがって §3 は**「P1 で全部消す」ではない** — 下表の「削除 Phase」は参照元から機械的に決まる。

| token | 処遇 | 最後の本番参照 | 削除 Phase |
|---|---|---|---|
| `roomTtChromeBottom` (64) | 削除 | **無し** (死にトークン) | **P1 済** |
| `topbarHeightDesktop` (56) | 削除 | **無し** | **P1 済** |
| `pagePxDesktop` (24) / `pagePadding` | 削除 | **無し** | **P1 済** |
| `pagePxMobile` (12) | **16 に変更** | (使用 12 箇所は値の変更のみで追従) | **P1 済** |
| `topbarHeightMobile` (48) | **維持** | `FullScreenModal.swift:37` (スコープ外) + `PlaceholderViews.swift:52` (P2 でファイルごと削除) → **P2 後も `FullScreenModal` が残るので維持** | — |
| `tabBarContent` (48) | 削除 | `BottomTabBar.swift:35` → §4.1 で**ファイルごと削除** | **P2** |
| `tabBarHeight` (64) | 削除 | **本番 9 箇所** (§4.2 の表)。**うち 7 箇所は P2 で外れるが、`SelfTodayCTA.swift:107` (§5.4) と `RoomDetailView.swift:389` (§5.3) が P3 まで残る** | **P3** |
| `selfTtChrome` (352) | 削除 | `TimetableGridPhaseB.swift:17` → §5.3 | **P3** |
| `roomTtChromeTop` (168) | 削除 | `RoomDetailView.swift:389` → §5.3 | **P3** |

**★ `tabBarHeight` が P2 で消えない理由** (P2 の Developer が消そうとして詰まらないように): §4.2 の 9 行のうち 2 行 (`SelfTodayCTA.swift:107` / `RoomDetailView.swift:389`) は §5.4 / §5.3 = **P3 の作業**で消える。
→ **P2 では `Space.tabBarHeight` の定義を残したまま、§4.2 の他 7 箇所のパディングだけを外す。定義の削除は P3。**
これは `selfTtChrome` / `roomTtChromeTop` も同じ構図 (どちらも §5.3 = P3 が最後の参照を消す)。**§3.5 で消えるトークンのうち P1 で消せるのは「本番参照が最初から 0 だった 4 つ」だけ。**

**逸脱なし**: `pagePxMobile` 12 → 16 は HIG のシステムマージンに合わせる (ui-ux-design-perspectives §2)。

### 3.6 `ScreenMetrics` (F8 の帰結)

```swift
// apps/ios/Atender/Core/DesignSystem/ScreenMetrics.swift (新規) — P1 で着地済
import UIKit

/// UIScreen.main は iOS 26.0 で deprecated (代替として Apple が windowScene.screen を名指し)。
/// deployment target 17 では警告が出ないため、放置すると 26 に上げた日に一斉に噴く。
enum ScreenMetrics {
    /// ★ @MainActor 必須。UIApplication.shared は @MainActor 隔離なので、
    ///   nonisolated static var から触ると strict concurrency で 4 件のエラーになる:
    ///   "main actor-isolated static property 'height' can not be referenced from a nonisolated context"
    @MainActor
    static var height: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.screen.bounds.height ?? 0
    }
}
```

**呼び出し契約**: `ScreenMetrics.height` は **`@MainActor` からしか読めない**。設計が名指しした唯一の消費者 `BottomSheet.swift:37` は SwiftUI の `View` = 既に `@MainActor` なので**実害ゼロ**。将来 nonisolated な文脈から画面高が要るとなったら、それは `ScreenMetrics` の穴ではなく**呼び出し側が View 層の値を非 UI 文脈へ引きずり出している**サインなので、`@MainActor` を外して回避しない。

**値の契約** (`@MainActor` の有無で変わらない): 最初の `UIWindowScene` の `screen.bounds.height`。window scene が無ければ **`0`** (クラッシュ・負値にしない)。

**`UIScreen.main` 4 箇所の処遇** (3 つは構造的に消え、残る 1 つだけがこのヘルパを使う):

| site | 処遇 | Phase |
|---|---|---|
| `TimetableGridPhaseB.swift:17` | **消滅** — `GeometryReader` の `available` に置換 (§5.3) | P3 |
| `RoomDetailView.swift:389` | **消滅** — 同上 (`height:` 引数を渡さなくなる) | P3 |
| `SelfTodayCTA.swift:166` | **消滅** — 展開パネルが `.sheet` + `presentationDetents` になる (§5.4) | P3 |
| `BottomSheet.swift:37` | **`ScreenMetrics.height` に置換** (1 行。BottomSheet 自体はスコープ外のまま) | P4 |

**★ `ScreenMetrics` は P1 で新設したが、消費者が付くのは P4 (`BottomSheet`)。** P1〜P3 の間は本番参照 0 のまま存在する (テストのみが叩く) — これは意図した状態。

---

## 4. アプリシェル (Phase 2 の中身)

### 4.1 `BottomTabBar` 廃止 → native `TabView`

**これが Liquid Glass の元凶。** Apple 公式が「tab bars / toolbars の自前背景は Liquid Glass と干渉する」と名指しで警告しており、`BottomTabBar` は `.background(.ultraThinMaterial)` + `.background(Color.bgElevated.opacity(0.85))` で真正面から抵触している。

- `App/BottomTabBar.swift` を**ファイルごと削除**
- `App/MainTabView.swift` を `TabView(selection:)` + `.tabItem` に置換

**`Tab(value:role:)` を使わない理由**: iOS 18.0+。deployment target 17 では使えない。**旧 `.tabItem` API でも Liquid Glass のタブバーは出る** (SDK リンクで決まるため — `knowledge/library/swiftui-liquid-glass-ios26.md`)。

#### ★ native 化はブランド accent を orange に退行させる — asset を是正して止める

**2026-07-17: P2 実装で Developer が実測 → Leader が現物確認 → Architect が re-grep と `actool` 実走で確定。**

自前 `BottomTabBar` は `Color.accent500` (azure) を**明示描画**していた (`BottomTabBar.swift:17,30`)。**native 部品はそれを引かず、asset catalog の `AccentColor` を引く** (`project.yml:71` の `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: AccentColor`)。両者は一致していない:

| | `AccentColor.colorset` (現状) | `Color.accent500` (コード) |
|---|---|---|
| light | **`#F97316`** (orange) | `#1E96E6` (azure) |
| dark | **`#F97316`** (orange) | `#3DA9F0` (azure) |

**この orange は死に資産。** `7ac596f` (2026-07-09「水色(azure)配色へ刷新」) が `Color+Atender.swift` の `accent*` から `0xF97316` / `0xEA580C` を消したが、**同じコミットが asset catalog を触っていない** — `git log -- AccentColor.colorset` の最終更新は足場コミット `ad12e5a` のままで、**一度も移行されていない**。当時これが露呈しなかったのは、**この asset を読む消費者が 1 つも無かった**から (**現在も 0** — `Color.accentColor` / `Color("AccentColor")` は grep で 0 件。`.accent` のヒットは全て `Color.accent` = `accent500` のエイリアス)。**native `TabView` と nav bar がその最初の消費者になる。**

**決定: `.tint` を足すのではなく、`AccentColor.colorset` 自体を azure に是正する。**

**§0「本設計はコードが描く色の『値』を一切変えない」と衝突しない理由** (2 点):
1. **これは「変更」でなく「是正」。** accent = azure という**ブランド決定は `7ac596f` で既に下りている**。asset はその決定から取り残された残骸であり、保持している値は*同じコミットがコードから削除した当の hex*。azure を入れるのは新しい色を決める行為ではなく、**決定済の状態へ asset を追いつかせる**行為
2. **既存のピクセルが 1 つも変わらない。** 今この asset を読む消費者は 0 なので、是正しても**現行 UI の見た目は不変**。値が効き始めるのは P2 が native 部品を入れた瞬間で、そこで初めて「azure が出るか orange が出るか」が決まる

**なぜ `.tint` でないか**:
- **`.tint` は漏れを追いかける手当てになる。** P2 は `TabView` だけでなく **nav bar も 5 画面で復活させる** (§4.3)。system back / toolbar も `AccentColor` を引くので、**`TabView` への `.tint` 1 個では back の chevron が orange のまま残る**
- **根を残すので再発する。** §0 が次の doc に送った**ウィジェット target** は新しい root であり、`.tint` を撒く運用ではそこで orange が蘇る。asset は「このアプリの accent」の**単一の定義**であり、そこを直すのが構造的
- **`RootView` に `.tint` を置く案も採らない** — §4.6 の撤回で **P2 は `RootView` を 1 行も触らない**と確定したため、ここへの再拡大になる。かつ**正典が 2 つ (asset と `.tint`) 並ぶ**状態を作る

**変更内容**: `apps/ios/Atender/Assets.xcassets/AccentColor.colorset/Contents.json` を、`Color.accent500` の `dynamic(dark: 0x3DA9F0, light: 0x1E96E6)` と**同じ light/dark ペア**にする。**8-bit hex 表記を使う** (float に丸めるとコード側の hex との対応が読めなくなる)。
★ **Architect が `actool` で実走検証済** — この JSON をコンパイルし `assetutil --info` で `AccentColor [(any)] -> #1E96E6` / `[UIAppearanceDark] -> #3DA9F0` が焼かれることを確認 (`0x` 表記が hex として解釈され、float に誤読されないことの実証)。

```json
{
  "colors" : [
    {
      "color" : {
        "color-space" : "srgb",
        "components" : { "alpha" : "1.000", "blue" : "0xE6", "green" : "0x96", "red" : "0x1E" }
      },
      "idiom" : "universal"
    },
    {
      "appearances" : [ { "appearance" : "luminosity", "value" : "dark" } ],
      "color" : {
        "color-space" : "srgb",
        "components" : { "alpha" : "1.000", "blue" : "0xF0", "green" : "0xA9", "red" : "0x3D" }
      },
      "idiom" : "universal"
    }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
```

**★ ついで掃除の禁止 (§9.3 の延長)**: 是正するのは **`AccentColor.colorset` の 1 ファイルだけ**。`#F97316` はコードベースに**まだ他にも存在するが、それらは accent ではなく「科目・メンバーの色」= トークン系統が違う**もので、**触ると §9.3 の 5 件が壊れる**:

| site | 正体 |
|---|---|
| `Rooms/RoomLogic.swift:179` (`meeting.courseColor ?? member?.color ?? "#F97316"`) | 科目色のフォールバック。**`RoomLogicTests.swift:334` が `"#F97316"` を assert している** |
| `Timetable/MeetingSheets.swift:179,191` (`course?.color ?? "#F97316"`) | 同上 |
| `Friends/FriendsView.swift:163` | メンバー色グラデのパレット |
| `AtenderTests/Fixtures/*.json` / `DTODecodingTests.swift:254` | フィクスチャの科目色 |

→ **これらは 1 文字も触らない。** 「orange を全部消す」は本設計の作業ではない。**accent の orange (asset) と 科目色の orange (コード) は別物。**

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

**★ `TabView` に `.tint(...)` を書かないこと。** accent の正典は `AccentColor` asset 1 つ (上記)。`.tint` を足すと正典が 2 つになり、asset 側の orange が温存されて nav bar / 将来のウィジェットで再発する。**選択タブが azure になるのは asset 是正の帰結であって、`.tint` の帰結ではない。**

`App/PlaceholderViews.swift` の `HomePlaceholderView` / `SemesterPlaceholderView` は間に 1 枚挟むだけの中継なので、上のとおり `HomeView()` / `SemesterOverviewView()` を直接呼ぶ。
**`RoomsPlaceholderView` / `FriendsPlaceholderView` / `PlaceholderScreen` / `TopBar` は死にコード** (grep で参照 0 を確認済) → `PlaceholderViews.swift` を**ファイルごと削除**。

### 4.2 `Space.tabBarHeight` を使っている 9 箇所

タブバーの高さはシステムの所有物になるので、**自前で下パディングを積むのをやめる**。native `TabView` は各タブの content に safe area inset を自動で入れる。

**★ P2 で外れるのは下表の 7 箇所。`Space.tabBarHeight` の*定義*は P3 まで残す** — 残り 2 箇所 (`SelfTodayCTA.swift:107` / `RoomDetailView.swift:389`) が P3 の作業 (§5.4 / §5.3) で消えるまで、定義を消すとコンパイルが通らない (§3.5)。

| file:line | 現状 | 処遇 | Phase |
|---|---|---|---|
| `App/BottomTabBar.swift:44` | `.frame(minHeight: Space.tabBarHeight)` | ファイルごと削除 (§4.1) | **P2** |
| `App/PlaceholderViews.swift:36` | `.padding(.bottom, Space.tabBarHeight)` | ファイルごと削除 (§4.1) | **P2** |
| `Components/Toast.swift:38` | `.padding(.bottom, Space.tabBarHeight + Space.s4)` | **`.padding(.bottom, Space.s16)` に変更** (下の「Toast だけ例外な理由」を参照。`Space.s4` ではない) | **P2** |
| `Features/Settings/SettingsView.swift:39` | `.padding(.bottom, Space.tabBarHeight)` | **行ごと削除** (system の inset に任せる) | **P2** |
| `Features/SemesterOverview/SemesterOverviewView.swift:21` | `.padding(.bottom, Space.tabBarHeight + Space.s3)` | **`.padding(.bottom, Space.s3)`** | **P2** |
| `Features/SemesterOverview/SemesterOverviewView.swift:78` | `.padding(.bottom, Space.s6 + Space.tabBarHeight)` | **`.padding(.bottom, Space.s6)`** | **P2** |
| `Features/Rooms/RoomDetailView.swift:208` | `.padding(.bottom, Space.tabBarHeight + Space.s6)` | **`.padding(.bottom, Space.s6)`** | **P2** |
| `Features/Home/SelfTodayCTA.swift:107` | `.padding(.bottom, Space.tabBarHeight + safeAreaBottom())` | §5.4 で `safeAreaInset` になり消滅 (**P2 では触らない**) | **P3** |
| `Features/Rooms/RoomDetailView.swift:389` | `height:` 引数の一部 | §5.3 で消滅 (**P2 では触らない**) | **P3** |

**`Space.tabBarContent` (48) は P2 で定義ごと削除できる** — 唯一の参照 `BottomTabBar.swift:35` が同フェーズでファイルごと消えるため。

**`Toast` だけ例外な理由**: `ToastOverlay()` は `RootView` の `ZStack` 直下にいて `TabView` の外なので、システムの tab bar inset を受け取らない。ここだけは実測退避 (`Space.s16` = 64) が要る。**これは「タブバーの高さの決め打ち」が 1 箇所だけ残るということ**であり、ズレたらトーストがタブバーに重なる (機能影響なし・美観のみ)。

### 4.3 nav bar の復活 + `BackHeaderButton` 廃止

**全 5 タブが `NavigationStack` を張った上で nav bar を隠している** (findings ★5) = Liquid Glass の nav bar と scroll edge effect を丸ごと捨てている状態。

`ja` 化 (F1/F2) で標準 back が「戻る」になるので、自前 back を持つ理由が消える:

| file:line | 現状 | 処遇 |
|---|---|---|
| `Features/Home/HomeCore.swift:65` | `.navigationBarHidden(true)` | **削除** → §5.1 の toolbar を持つ |
| `Features/SemesterOverview/SemesterOverviewView.swift:25` | `.navigationBarHidden(true)` | **削除** + `.navigationTitle("学期・科目")` |
| `Features/Settings/SettingsView.swift:42` | `.navigationBarHidden(true)` | **削除** + `.navigationTitle("設定")` |
| `Features/Rooms/RoomDetailView.swift:54` | `.toolbar(.hidden, for: .navigationBar)` + `.navigationBarBackButtonHidden(true)` (:53) | **両方削除** + `.navigationTitle(model?.room?.name ?? "ルーム")` + `.navigationBarTitleDisplayMode(.inline)`。**★ 併せて §4.7 (溢れ止め) を同フェーズで行う**。**★ この inline タイトルの room 名は P3 で `.navigationTitle("")` に置換する (裁定1・§5.6。本文 header の大タイトルと重複するため)** — `.navigationBarTitleDisplayMode(.inline)` 自体は維持 |
| `Features/Rooms/TemplatesView.swift:50` | `.toolbar(.hidden, for: .navigationBar)` + **`.navigationBarBackButtonHidden(true)` (:49)** | **両方削除** + `.navigationTitle("テンプレート")` |
| `App/PlaceholderViews.swift:39` | `.navigationBarHidden(true)` | ファイルごと削除 |

- `Core/DesignSystem/Components/BackHeaderButton.swift` を**ファイルごと削除**。呼び出しは `RoomDetailView.swift:39` と `TemplatesView.swift:22` の 2 箇所 (**`4dfd3a9` で再 grep して確定済**) — 行ごと削除する (system back が代わる)
- **★ `.navigationBarBackButtonHidden(true)` を消し忘れると、自前 back を消した画面が「戻れない画面」になる。** `RoomDetailView:53` と `TemplatesView:49` の**両方**にある (上表)。`.toolbar(.hidden)` だけ外して満足しないこと — nav bar は出るが back ボタンだけが無い状態になる
- `RoomsView` / `FriendsView` は既に nav bar を隠していない。`.navigationTitle` の有無を確認し、無ければ付ける
- **`project.yml` に `options.developmentLanguage: ja` を追加** (F1)
- **★ `RoomDetailView` の accessor は `model?.room` (`@State private var model: RoomDetailViewModel?`)。** `room?.name` という property は**存在しない** (旧版の本表はそう書いていた — 逐語で書くとコンパイルが通らない)。`header` (:69) が `model?.room?.name` を使っているのが実例
- **★ nav bar の system back / toolbar は `AccentColor` asset を引く** → §4.1 の asset 是正が入っていないと **back の chevron が orange で出る**。§4.1 と本節は同じ P2 なので順序は問わないが、**両方入って初めて azure になる**

### 4.4 `RootView` の目標状態

`feature/version-management` は着地済 (`60a127e`)。**`AmbientBackground()` の除去は本設計 P1 が実施済** (`4dfd3a9`)。
**★ §4.6 の撤回により、下の目標状態は `4dfd3a9` の現状と完全に一致する — P2 で `RootView` に加える変更は無い**:

```swift
// apps/ios/Atender/App/RootView.swift
var body: some View {
    ZStack {
        //  AmbientBackground() は P1 で除去済 (§3.4)。背景は system に任せる
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
    .preferredColorScheme((ThemePreference(rawValue: themePreference) ?? .light).colorScheme)  // ← 現状のまま (§4.6 は撤回済)
}
```

**本設計が `RootView` に対して行う変更は当初 3 つだったが、(2)(3) は撤回された。残るのは P1 で完了済の (1) だけ**:

| # | 変更 | Phase |
|---|---|---|
| 1 | `AmbientBackground()` の行を消す (§3.4) | **P1 済** (`4dfd3a9`) |
| 2 | ~~`.preferredColorScheme(... ?? .light)` → `?? .auto`~~ | **撤回済** (2026-07-17 Touri 裁定 — §4.6) |
| 3 | ~~`@AppStorage("atender.theme")` の既定値を `.auto.rawValue` に~~ | **撤回済** (同上) |

→ **★ P2 の Developer は `RootView.swift` を 1 行も触らない。** ファイルごと変更対象外。
**★ P2 の実装で既に (2)(3) を入れている場合は差し戻すこと。** `4dfd3a9` 時点の実物 = `RootView.swift:6` が `= ThemePreference.light.rawValue` / 末尾の `.preferredColorScheme` が `?? .light` — **この 2 行が正しい最終形**。

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

### 4.6 ダークモードの既定 — ★ **`.light` のまま据え置く (2026-07-17 Touri 裁定で撤回)**

**当初の設計**: 既定を `.light` → `.auto` に変え、OS のダークモード設定に追従させる (HIG §3「アプリ内独自の appearance 切替 UI を作らない — OS 設定に従う」)。
**撤回**: **2026-07-17 に Touri が取り下げた。既定は `.light` のまま。P2 はテーマ関連のコードを 1 行も触らない。**

#### 撤回の理由 — 「2 行」ではなく「3 ファイル」だったから

P2 実装中に Developer が実測、Leader が現物で確認。当初の §4.4 / 本節は「`RootView.swift:6` の `@AppStorage` 既定値と `:58` の `?? .light` を `.auto` に = **2 行**」で届くとしていた。**これは誤りだった。** `atender.theme` の `@AppStorage` は**同じ既定値 `.light` を持つ 3 箇所**に散っている:

| file:line | 役割 |
|---|---|
| **`Atender/AtenderApp.swift:6` / `:14` / `:19`** | `WindowGroup` 直下 = **`RootView` の外側**で `.preferredColorScheme` を適用。**★ 外側が勝つので、ここが実効値を決めている** |
| `Atender/App/RootView.swift:6` / `:58` | 当初の設計が名指ししていた場所。**外側の `AtenderApp` が既に適用済なので、ここを直しても効かない** |
| `Atender/Features/Settings/SettingsView.swift:6` | 設定 UI の選択表示。直さないと本体が dark でも「ライト」が選択表示される不整合が残る |

同一 sim での A/B: **設計どおり `RootView` だけ直す → LIGHT のまま / `AtenderApp` も直して初めて DARK。**
→ 届けるには **§0 が「設定はスコープ外」と定めた `SettingsView` と、本設計が一度も言及していない `AtenderApp` へのスコープ拡大**が要る。**Touri は「それに見合わない」と判断。**

#### 据え置き後も成立すること (§3.3 との整合)

- **`SettingsView` のトグル (ライト/ダーク/自動) は残る** → ユーザーは**設定から `.dark` を選べる**。選べば `.preferredColorScheme(.dark)` が効き、§3.3 の semantic color は**正しい dark 値で解決する**。**dark palette は死にコードではない**
- **§3.3 (中立色 → semantic system color、P1 実施済) の価値は落ちない。** 失われるのは**「OS 設定への自動追従」だけ**で、Increased Contrast 追従 / Liquid Glass との協調 / grouped 階層 / dark 選択時の正しい解決は全部生きている (内訳は §3.3 の表)
- **§12-#2 の「light 固定は semantic color の意味を殺す」という当初の推奨根拠は言い過ぎだった** — 殺されるのは自動追従のみ。§3.3 を巻き戻す理由にはならない

**逸脱** (HIG §3 に対して): 「アプリ内 appearance 切替を持ち、かつ OS 設定に従わない」状態が残る。**理由**: 是正に要するスコープ (3 ファイル / うち 2 つは本設計のスコープ外) が価値に見合わないと Touri が裁定した (2026-07-17)。

#### ★ 将来この既定を直すときの注意 (同じ穴を踏まないため)

**`grep -rn 'atender.theme' apps/ios/` で 3 箇所を全部拾ってから直す。** `RootView` だけ直して sim で確認すると「変わらない」ので**実装が間違っている**と誤診する (実際にそうなった)。実効値を決めているのは**最も外側の `.preferredColorScheme`** = `AtenderApp.swift:14`。
**副次的な事実**: この重複により **`RootView.swift:58` の `.preferredColorScheme` は現在も効いていない (死んだ行)**。本設計では**触らない** — 撤去は別テーマ。

### 4.7 ★ `RoomDetailView` の溢れ止め (§5.3 から P2 へ前倒し — 2026-07-17 Touri 裁定)

**P2 を単独で `main` にマージすると、この画面だけが操作不能になる。** CLAUDE.md「**`main` は常にマージ可能・デプロイ可能**」に抵触するため、§5.3 (P3) のうち**この画面を壊さないための最小分だけ**を P2 に前倒しする。

#### 実測された壊れ方

Developer が発見 → Leader が 2 経路で再現 → Architect が本日 re-grep で確認:

- **`RoomDetailView` は body に `ScrollView` を 1 つも持たない** VStack 構成 (`RoomDetailView.swift:37-58`)。**主要画面で唯一の例外** — `SettingsView` / `SemesterOverviewView` / `RoomsView` / `FriendsView` はいずれも 1 箇所持つ (`grep -c ScrollView` で確認済)
- P2 が **nav bar を復活させ (44pt / §4.3)** + **native tab bar の safe area inset (~83pt / §4.1)** を入れると可用高が減り、`Group` (:42-48) 内の固定高コンテンツ (`TimetableGrid` は `.frame(height: max(360, …))` = iPhone 16 で 620pt) が入り切らず溢れる → **`tabPicker` (カレンダー/時間割、`:94`、`accessibilityIdentifier("room-detail-tabs")`) がバーの下に潜ってタップ不能**
- 2 つの独立した撮影経路 (XCTAttachment / `simctl io screenshot`) で同一に再現。**連続スクショが byte-identical = その間の tap が no-op だった証拠**

#### P2 でやること

**`RoomDetailView` の 2 つのタブ内容 (`RoomCalendar` / `RoomTimetable`) に、それぞれ自前の `ScrollView` を持たせる。** `RoomDetailView` 側の `header` (:66) / `tabPicker` (:94) は**スクロールの外に固定で残す** (構造は現状のまま)。

**★ `RoomDetailView.body` の `Group` (:42-48) を `ScrollView` で包んではいけない。** 一見それが最小に見えるが、**`RoomCalendar` の FAB が壊れる** — 下記「FAB の罠」参照。

```swift
// (1) apps/ios/Atender/Features/Rooms/RoomDetailView.swift  body の骨格 (P2 完了時)
//     ★ ScrollView は足さない。§4.3 の nav bar 対応だけ。
var body: some View {
    VStack(alignment: .leading, spacing: Space.s3) {
        //  BackHeaderButton { dismiss() } (:39) は §4.3 で削除済 (system back が代わる)
        header
        tabPicker                                      // ← スクロールの外 = 常にタップ可能
        Group {
            if tab == .calendar { RoomCalendar(roomId: roomId) }
            else { RoomTimetable(roomId: roomId) }
        }
    }
    .padding(Space.pagePxMobile)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Color.bgBase)
    //  .navigationBarBackButtonHidden(true) (:53) / .toolbar(.hidden, for: .navigationBar) (:54) は §4.3 で削除
    .navigationTitle(model?.room?.name ?? "ルーム")
    .navigationBarTitleDisplayMode(.inline)
    // .task (:55) / .sheet (:59) は現状のまま
}

// (2) RoomCalendar (:122) — VStack を ScrollView で包む。★ .overlay (FAB) は ScrollView の「外」に置く
var body: some View {
    // let events / eventMap / dayEvents は現状のまま
    ScrollView {
        VStack(spacing: Space.s3) { /* 現状の中身をそのまま */ }
    }
    .scrollBounceBehavior(.basedOnSize)                // 収まるときはバウンスしない (F7 で target 17 を通ることを確認済)
    .accessibilityIdentifier("room-calendar")          // 現状のまま (ScreenshotFlow が掴む)
    .overlay(alignment: .bottomTrailing) {             // ★ ScrollView に対する overlay = viewport 固定で浮く
        if viewMode != .month { /* FAB 2 つ。現状のまま */ }
    }
    // .task / .sheet は現状のまま
}

// (3) RoomTimetable (:367) — Group を ScrollView で包む
var body: some View {
    ScrollView {
        Group { /* 現状の中身をそのまま (Skeleton / Panel / EmptyState / TimetableGrid) */ }
    }
    .scrollBounceBehavior(.basedOnSize)
    .accessibilityIdentifier("room-timetable")         // 現状のまま
    .task { await load() }
}
```

**なぜ `tabPicker` をスクロールの外に固定するか**: 壊れの本体は「**ピッカーに触れない**」ことなので、**ピッカーをスクロール領域に入れない**のが最短で確実な保証になる。スクロールするのは各タブの中身だけで、ピッカーはコンテンツが何 pt でも不変。

#### ★ FAB の罠 (`Group` ごと包むと踏む)

`RoomCalendar` は **`.overlay(alignment: .bottomTrailing)` で FAB 2 つ** (`room-fab-ics` / `room-fab-event`、`:180-208`) を自分の `VStack` に付けている。

- **`RoomDetailView` の `Group` を `ScrollView` で包むと、この overlay はスクロールする*コンテンツ*に付いたまま**になり、**FAB がスクロールで流れて消える** (= 浮いているべきボタンが浮かなくなる機能後退)
- **`RoomCalendar` の内側で `VStack` だけを `ScrollView` に入れ、`.overlay` を `ScrollView` に対して付ける**と、overlay は **viewport (可視領域) に固定**されるので FAB は浮いたまま
- **ついでに現状のバグも直る**: 今の overlay は「溢れた VStack の下端」に付いているので、**FAB は既に画面外side に落ちている**。ScrollView 化で初めて正しい位置に来る
- `.padding(.bottom, Space.tabBarHeight + Space.s6)` (`:208`) → **`.padding(.bottom, Space.s6)`** は §4.2 の表のとおり P2 で行う。ScrollView は safe area を尊重するので、system tab bar の分は自動で退く

**★ この画面だけ `ScrollView` が 2 つになる** (タブごとに 1 つ) が、**同時に表示されるのは 1 つだけ**なので「1 画面 1 スクロール」の実質は保たれる。`RoomDetailView` 自身は 0 個のまま。

#### ★ P2 で `TimetableGrid` の prop 契約を触らないこと

前倒しの範囲は「**壊れを出さないための最小**」に限る。P3 の作り込みを引きずり込まない:

- `TimetableGrid` の `height: CGFloat?` は **P2 では現状のまま**。`available: CGFloat` への必須化は **P3** (§5.3)
- **理由**: `TimetableGrid` は **`SelfTimetableView.swift:137` と `RoomDetailView.swift:389` の 2 箇所から呼ばれる共有部品** (grep 済)。P2 で prop を必須化すると **`SelfTimetableView` (= P3 の `HomeView` 再構成の一部) を P2 に道連れにする**
- **帰結**: P2 の間、グリッド高は `max(360, UIScreen.main.bounds.height - Space.roomTtChromeTop - Space.tabBarHeight)` = **クロームの実態と対応しない数値**のまま残る。**`ScrollView` の中にいるので無害** (溢れてもスクロールするだけ)。P3 の §5.3 が `available` を渡して概念ごと消す

#### ★ P2 で消せるトークンは増えない

`RoomDetailView.swift:389` を**触らない**ので、そこが最後の参照である **`Space.roomTtChromeTop` と `Space.tabBarHeight` の定義は P2 では消せない**。§3.5 の表 (両方 **P3**) は**変更なしが正しい**。`UIScreen.main` の 1 件 (:386) が消えるのも **P3** のまま (§3.6)。

---

## 5. ホーム / 時間割 / カレンダー / 「今」 (Phase 3 の中身 — 本命)

### 5.1 「ホームは時間割とカレンダーを大きく」の具体形 (findings が「決めろ」と名指し)

**答え (DESIGN.md §3.7.1 に従う。★ 旧稿の「3 段を nav bar の principal/leading に畳む」案は DESIGN.md 承認で撤回): large title「ホーム」を出し、switcher (ContextChips) と segmented (時間割/カレンダー) を nav bar の下・コンテンツ先頭に置き、gear を toolbar trailing に上げる。外側 `ScrollView` を捨て、グリッド/カレンダーが自分の `GeometryReader` から利用可能高を受け取る (画面高の引き算をやめる)。**

> ★ **DESIGN.md との整合 (2026-07-18)**: 旧稿は「縦を食わないよう segmented を `.principal`・学期を `.topBarLeading` に畳み、`.inline` タイトル」にしていたが、**DESIGN.md §3.7.1 (正典) は「large title + switcher/segmented を nav bar の下・コンテンツ先頭」を全 5 タブ共通で規定**しており、旧稿と食い違う。**PJ 層 > 汎用層で DESIGN.md を採り、本節と §5.2 を書き換えた** (Touri 裁定: Home に large title「ホーム」を付与し 5 タブ統一)。large title は Web に無い要素だが iOS 慣習 + ヘッダー統一要望で採用 (DESIGN.md §3.7.1)。

現状の積み上げ (findings ★7) と処遇:

| # | 現状 | 高さ | 処遇 |
|---|---|---|---|
| 1 | `ContextChips` | 40 | **rooms が 0 個なら出さない** (§5.2)。出すときは 44。nav bar の下・コンテンツ先頭 (§3.7.1) |
| 2 | `HomeViewModeTabs` (自前, `HomeCore.swift:156-186`) | 42 | **削除 → native `Picker(.segmented)` を nav bar の下・コンテンツ先頭に置く** (§5.2、DESIGN.md §3.7.1)。**`.principal` には置かない** (large title と併用不可) |
| 3 | `HomeSemesterPicker` (自前 BottomSheet, `HomeCore.swift:188-256`・**親子 2 経路に二重定義**) | 36 | **削除 → native `Menu` を subhead 体裁 (§3.7.3) でコンテンツ先頭に置く** (§5.2)。二重定義も解消 |
| 4 | `TimetableGrid` | 本体 | §5.3 (+ **DESIGN.md §3.6 のマス描画**) |
| 5 | `SelfTodayCTA` (展開時 画面の 36%) | ~162 | **`NowNextBar` 2 行 + 詳細は `.sheet`** (§5.4) |
| 6 | `BottomTabBar` | 64+34 | **system TabView** (§4.1、**P2 済**) + スクロールで最小化 (iOS 26) |

**`Space.selfTtChrome = 352` は「数を減らす」のではなく「概念ごと消す」**: §5.3 のとおりグリッド/カレンダーが自分の `GeometryReader` から実際の利用可能高を受け取るようになるので、**画面高からクロームを引き算する必要が最初から無くなる**。large title と 3 つのコントロール行の高さは可変 (Dynamic Type) なので、**HomeView が定数で引き算せず、`HomeBody` を包む `GeometryReader` が残り高を測る** (手計算した総和を doc に焼かない — architect note の「導出値でなく生成規則」)。

### 5.2 `HomeView` の構造 (DESIGN.md §3.7.1 / §3.7.3 準拠)

```
┌─ nav bar (system / Liquid Glass) ────────────────────────┐
│  ホーム                                          [⚙︎]    │  ← large title「ホーム」(§3.7.1) / gear は toolbar trailing
│                                                          │     large title はスクロールで inline に遷移
├──────────────────────────────────────────────────────────┤
│  2026 前期 ⌄                    ← 学期ピッカー (subhead 体裁・§3.7.3)。context==.self のみ
│  [自分] [3年A組] [サークル] [+] ← ContextChips (switcher)。rooms 1 個以上のみ・44pt
│  [ 時間割 | カレンダー ]         ← segmented Picker (§3.7.1)。常時
├──────────────────────────────────────────────────────────┤
│                                                          │
│                 HomeBody (残り高を全部使う)               │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ 次の授業 · 13:00 · A302                                   │  ← NowNextBar (safeAreaInset)
│ 3限 英語                    [今日は全出席 (2)]  [⌃]      │     glass capsule (§5.4)
└──────────────────────────────────────────────────────────┘
┌─ tab bar (system / Liquid Glass / スクロールで最小化) ────┐
│  ホーム   学期・科目   ルーム   友達   設定               │  ← P2 済
└──────────────────────────────────────────────────────────┘
```

**ヘッダー規格 (DESIGN.md §3.7.1)**:

- **`.navigationTitle("ホーム")` + `.navigationBarTitleDisplayMode(.large)`** — large title = `.largeTitle` (34)、スクロールで inline に遷移。**アプリ名でなくタブ名「ホーム」**。**本文に大タイトルを重複させない** (nav の large title が唯一のタイトル)。→ **★ 旧稿の `.inline` + `.navigationTitle("")` + `.principal` セグメントは撤回** (DESIGN.md §3.7.1 が全 5 タブ large title を規定)。
- **`.principal` / `.topBarLeading` にコントロールを置かない** — large title と principal は視覚的に競合する。segmented と学期ピッカーは **nav bar の下・コンテンツ先頭** に置く。
- **toolbar は trailing の gear 1 スロットだけ** (F7 で型検査済):

| placement | 中身 | 表示条件 |
|---|---|---|
| `.topBarTrailing` | `Button { showTimetableSettings = true } label: { Image(systemName: "gearshape") }` (44×44) | `context == .self && mode == .timetable` |

**コンテンツ先頭のコントロール行** (nav bar の下・上から順に。全画面同じ順序 §3.7.1):

| 行 | 部品 | 体裁 | 表示条件 |
|---|---|---|---|
| 1 | **学期ピッカー** | native `Menu` — label = `HStack { Text(現在の学期名).font(.subheadline).fontWeight(.semibold).foregroundStyle(Color.textSecondary); Image(systemName:"chevron.down").font(.caption2).foregroundStyle(Color.textTertiary) }`。中身は `ForEach(semesters)` の `Button`。**subhead 級・低強調 (§3.7.3 の L3 meta)**。self-drawn `BottomSheet` を native `Menu` に置換 (§0 標準部品回帰) | `context == .self` |
| 2 | **ContextChips** (switcher) | 下記「`ContextChips`」 | `HomeChips.isVisible(rooms:)` (rooms 1 個以上) |
| 3 | **segmented** (時間割/カレンダー) | `Picker("表示", selection: $mode) { Text("時間割").tag(HomeViewMode.timetable); Text("カレンダー").tag(HomeViewMode.calendar) }.pickerStyle(.segmented)` + `.frame(maxWidth: 240)` | **常時** |

- **学期ピッカーを残す理由 / subhead に落とす理由**: 学期切替は極めて低頻度 (学期に 1 回) だが、**機能削除は Touri のプロダクト判断**なので削らない。DESIGN.md §3.7.3 に従い「見出しでなく subhead 級コントロール」として最小強調で置く (旧稿の `.atenderBase` 17 bold から降格)。
- **`.principal` に畳まない逸脱の撤回**: 旧稿は縦節約のため principal/leading に畳んだが、DESIGN.md §3.7.1 が全 5 タブ large title + コントロール下置きを正典化したので**それに揃える** (ヘッダー統一が Touri の名指し要望 #8)。

**`ContextChips`** (DESIGN.md §3.7.1 の switcher):
- **`rooms.isEmpty` のときは行ごと出さない。** ルームが 0 個のユーザーに `[自分][+]` を常時見せるのは、機能ゼロの 40pt。`+` はルームタブと重複した導線であり、失っても到達不能にはならない
- `rooms` が 1 個以上なら現状どおり `[自分][ルーム…][+]`。**1 タップ切替は維持する** — 「友達と会話しながらみんなの時間割を確認」に直接対応する最頻ジェスチャだから (ui-ux-design-perspectives §5「対等なコンテキストを数個往復 → context chip」)
- チップ高 `40 → 44`、`+` ボタン `40×40 → 44×44` (HIG のタップ領域、`HomeCore.swift:108,121` の `.frame(height: 40)` / `.frame(width:40,height:40)` を 44 に)
- `HomeChips.items(rooms:)` の**契約は変えない** (§9.2: `HomeChipsTests` 3 本は緑のまま)。可視判定は新関数 `HomeChips.isVisible(rooms:)` として足す

**削除するもの**: `HomeViewModeTabs` (自前セグメント、`HomeCore.swift:156-186`) / `HomeSemesterPicker` (自前 Button + BottomSheet、`HomeCore.swift:188-256`)。
**二重定義の解消**: `HomeSemesterPicker` は `HomeCore.swift:51` (calendar モード時のみ) と `SelfTimetableView.swift:132-135` (timetable モード時) の**親子 2 経路**で描かれていた。学期 `Menu` は **`HomeView` のコンテンツ先頭 1 箇所だけ**になり、self の両モードで共有する。`SelfTimetableView` からは学期ピッカー (`:132-136`) と ⚙︎ ボタン (`settingsButton` `:165-180`) が消え、グリッドとシートだけになる。

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

`HomeView.task` は現状の rooms/me の読み込み (`HomeCore.swift:65-74`) に加え、`semesterRepository.semesters()` を読んで `semesters` を埋める (旧 `HomeSemesterPicker.load()` `:247-255` の移管。キャッシュ優先 → force 無しの順も現状どおり)。**`semesterId` の既定適用 (`applyDefaultSemester`) は現状のまま**。

**`SelfTimetableView` の prop 契約** (描画テストのため明記):

```swift
struct SelfTimetableView: View {
    @Binding var semesterId: String?
    @Binding var showSettings: Bool        // ← 新規。HomeView の toolbar の ⚙︎ が立てる → activeSheet = .settings を開く
    let available: CGFloat                 // ← 新規。HomeBody 経由で HomeView の GeometryReader から。ScrollView + TimetableGrid(available:) に渡す
}
```

**`HomeBody` の prop 契約**:

```swift
struct HomeBody: View {
    let context: HomeContext
    let mode: HomeViewMode
    @Binding var semesterId: String?
    @Binding var showTimetableSettings: Bool
    let available: CGFloat                 // ← 新規。HomeView の GeometryReader が測った残り高
}
```

**利用可能高の測り方 (★ 定数で引き算しない)**: large title と 3 つのコントロール行の高さは Dynamic Type で可変。**HomeView は `HomeBody` を `GeometryReader` で包み、その `proxy.size.height` を `available` として渡す** (コントロール行が intrinsic 高を取った後の残りを `GeometryReader` が自動で測る)。旧稿の `proxy.size.height - (chips ? 44 : 0)` は学期ピッカー行と segmented 行を数え落とすので**採らない**。`HomeBody` は受けた `available` を `SelfTimetableView` / `PersonalCalendar` / `RoomTimetable` に渡す (§5.3 / §5.5)。

**外側 `ScrollView` の廃止**: 現状 `HomeView` は全体を 1 枚の `ScrollView` (`HomeCore.swift:41`) で包み `.padding(.bottom, 128)` (`:57`) している。**グリッドが `ScrollView` の中にいる = 高さが無限に与えられる = だから自分で画面高を計算するしかなかった。** これが `selfTtChrome` の構造的な原因。外側 `ScrollView` を外し、`GeometryReader` が測った高さを `HomeBody` に渡す。`.padding(.bottom, 128)` は `safeAreaInset` が自動で担う (§5.4)。**現状 `HomeCore.swift:60-62` の `SelfTodayCTA()` overlay も削除** (§5.4 の `NowNextBarHost` を `safeAreaInset` へ)。

```swift
// HomeView.body の骨格
VStack(spacing: Space.s3) {
    if context == .self {
        SemesterMenu(semesters: semesters, semesterId: $semesterId)   // 行 1 (§3.7.3 subhead)
    }
    if HomeChips.isVisible(rooms: rooms) {
        ContextChips(...)                                             // 行 2 (44pt)
    }
    Picker("表示", selection: $mode) {                                // 行 3 (segmented)
        Text("時間割").tag(HomeViewMode.timetable)
        Text("カレンダー").tag(HomeViewMode.calendar)
    }
    .pickerStyle(.segmented)
    .frame(maxWidth: 240)
    GeometryReader { proxy in
        HomeBody(context: context, mode: mode, semesterId: $semesterId,
                 showTimetableSettings: $showTimetableSettings,
                 available: proxy.size.height)
    }
    .frame(maxHeight: .infinity)                                      // 残り高を占有
}
.padding(.horizontal, Space.pagePxMobile)
.navigationTitle("ホーム")
.navigationBarTitleDisplayMode(.large)
.safeAreaInset(edge: .bottom) {
    if context == .self { NowNextBarHost() }
}
.toolbar {
    ToolbarItem(placement: .topBarTrailing) {
        if context == .self && mode == .timetable {
            Button { showTimetableSettings = true } label: { Image(systemName: "gearshape") }
                .accessibilityLabel("時間割の設定")
        }
    }
}
```

- **★ ラベル文字列を変えない (ScreenshotFlow 依存)**: segmented のセグメントは `Text("時間割")` / `Text("カレンダー")` のまま、gear は `.accessibilityLabel("時間割の設定")` のまま。`AtenderUITests/ScreenshotFlow.swift` が `tapButton("カレンダー")`(`:41`) / `tapButton("時間割")`(`:46,202`) / `tapButton("時間割の設定")`(`:58`) で掴む。native `Picker(.segmented)` のセグメントは XCUITest で `app.buttons[ラベル]` として拾えるので無改修で動くが、**ラベルを変えると before/after 比較が黙って壊れる** (§5.4 の CTA ラベル保存と同じ理由)。`ContextChips` の `accessibilityIdentifier("context-chips")`(`HomeCore.swift:129`) も維持。
- **timetable モードは外側スクロール無し** = large title は展開したまま (親指域で操作)。**calendar モードは §5.5 の `ScrollView` が nav に付くので large title がスクロールで inline に縮む** (§3.7.1 の想定挙動)。この非対称は許容 (grid は available をちょうど埋めるので外側スクロール不要)。
- **`context == .room` のとき** switcher は残す (ルーム切替のため) が、学期ピッカーと gear は self 専用なので出さない。room の body は `RoomTimetable` / `RoomCalendar` (§0 の最小追従。§5.3 で `RoomTimetable` が `available` を受ける)。

### 5.3 時間割グリッド — 画面高を数えるのをやめる + マスを描き直す + 「今」を描く

**この節は 3 つを同時に行う: (A) DESIGN.md §3.6 のマス描画 (Touri 名指しの核心) / (B) 利用可能高を受け取る / (C) 「今」を描く。**

#### 5.3.0 ★ マスの描き方 (DESIGN.md §3.6.1 / §3.6.2 の必須適用)

Touri の名指し不満「背景が透過」「マス目の線が見える」「テキストが中央」を、Web の描画を正典に是正する。**対象は `TimetableGridPhaseB.swift` の `EventTile` / `TimetableGrid.background` / 外殻。** `TimetableGrid` は `SelfTimetableView` (ホーム) と `RoomTimetable` (ルーム詳細) の共有部品なので、ここの是正は**両方に自動で波及する** (DESIGN.md §3.6 は全画面共通の視覚規則なので望ましい)。

**(a) `EventTile` — 不透明 tint / 2pt 左バー / 上寄せ** (DESIGN.md §3.6.1):

| 属性 | 現状 (`TimetableGridPhaseB.swift`) | P3 規則 (pt / color) |
|---|---|---|
| 背景 | `:165` `.background(Color(hexString: color).opacity(0.16))` = **半透明** (下地の罫線が透ける) | **不透明化**: `.background(Color.opaqueTint(hex: color, ratio: 0.15, base: .bgElevated))` (下記ヘルパ)。alpha 透過を使わない。ratio = Web の 15% |
| 左バー | `:133-135` `Capsule().fill(Color(hexString: color)).frame(width: 3)` | 幅 **2pt** (`.frame(width: 2)`)。`Capsule()` (= `Radius.full`)、solid 科目色。※現状 3pt を 2pt に |
| 角丸 | `:166` `Radius.timetableCell` (8) | **変更なし** (既に正しい) |
| テキスト配置 | `content` の `HStack(spacing: Space.s2)` は既定 `.center` 垂直整列 + `EventTile.body :128` の `.frame(maxWidth:.infinity, maxHeight:.infinity)` = **セル内で上下中央** | **上寄せ**: `content` の `HStack` を `HStack(alignment: .top, spacing: Space.s2)` に。`EventTile.body :128` の frame を `.frame(maxWidth:.infinity, maxHeight:.infinity, alignment: .topLeading)` に。**中央をやめて上に** |
| タイトル | `:143` `.caption` (12) semibold `lineLimit(2)` | **変更なし** (既に正しい) |
| 副題 (教室) | `:148-152` `.caption2` + `Color.textSecondary` | 色を **科目色の濃色**へ: `.foregroundStyle(Color.opaqueTint(hex: color, ratio: 0.70, base: .eventMixTarget))` (DESIGN.md §3.6.1 の「科目色 70% を eventMixTarget に合成」。`eventMixTarget` は `Color+Atender.swift:61` に既存)。font は `.caption2` のまま |

**★ 不透明合成ヘルパの新設** (`Color+Atender.swift` に **additive** で追加。既存の有彩色トークンは 1 つも触らない — §9.3):

```swift
// apps/ios/Atender/Core/DesignSystem/Color+Atender.swift (末尾に追加)
extension Color {
    /// 科目色 hex を ratio(0..1) で不透明な base 面に合成する。
    /// Web の color-mix(in srgb, subject ratio%, base) 相当。★ 半透明にしない = 下地の罫線を透かさない。
    /// dynamic(base が light/dark で変わる)を保つため UIColor(dynamicProvider:) で trait ごとに解決して混ぜる。
    static func opaqueTint(hex: String, ratio: CGFloat, base: Color) -> Color {
        let subject = UIColor(Color(hexString: hex))
        let baseColor = UIColor(base)
        return Color(UIColor { traits in
            let s = subject.resolvedColor(with: traits)
            let b = baseColor.resolvedColor(with: traits)
            var sr: CGFloat = 0, sg: CGFloat = 0, sb: CGFloat = 0, sa: CGFloat = 0
            var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
            s.getRed(&sr, green: &sg, blue: &sb, alpha: &sa)
            b.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
            let r = ratio
            return UIColor(red: sr * r + br * (1 - r),
                           green: sg * r + bg * (1 - r),
                           blue: sb * r + bb * (1 - r),
                           alpha: 1)      // ★ 常に alpha=1 (不透明)
        })
    }
}
```

- **既存の `Color.mix(hex:with:ratio:)` (`TimetableLogic.swift:392`) は使わない** — 中身が `.opacity(...)` = 半透明を返すので Touri 不満 #1 を再生産する。参照 0 (grep 済) なので放置してよいが、`EventTile` / 月カレンダー chip はこの `opaqueTint` を使う。
- **ヘルパは additive。色の「値」は変えていない** (§9.3 の禁止と衝突しない) — 変えるのは*合成方法* (透過 → 不透明) であり、パレット hex・`accent*`・`status*` は 1 つも触らない。`Color.opaqueTint` は `UIColor(dynamicProvider:)` を返すので light/dark 追従は保たれる (F8 系の型検査対象。Developer は `swiftc -typecheck` で確認)。

**(b) グリッド線と空きセル — 罫線を消す** (DESIGN.md §3.6.2):

| 属性 | 現状 (`TimetableGridPhaseB.swift`) | P3 規則 |
|---|---|---|
| 空きセル背景 | `EmptyCell :199` `.background(Color.bgBase)` = 不透明 | **変更なし** (既に不透明。Web どおりページ地に溶ける) |
| グリッド線 | `background(...) :61-62` 各空きセルに `.overlay(alignment:.top){Rectangle borderSubtle 1px}` + `.overlay(alignment:.leading){Rectangle borderSubtle 1px}` = **全セルに縦横の罫線 = 表組み** | **★ この 2 行の `.overlay` を両方削除する。** 罫線を引かず、空きセル (`bgBase`) を地に溶かし、event tile の不透明 tint 面と header/時限ラベル (`bgMuted`) だけで構造を見せる = **「面が主役・線は最小」** (Web の gap 分離相当)。**濃い罫線で表組みにしない** (Touri 不満 #2) |
| 外殻 | `:31-32` `.clipShape(Radius.md)` + `.overlay(stroke borderSubtle 1px)` | **stroke を外し `.atenderShadow(.card)` に**: `.clipShape(RoundedRectangle(cornerRadius: Radius.md, style:.continuous))` + `.atenderShadow(.card)` (DESIGN.md §4 の L1「グリッド = card (Radius.md + shadow)」)。周囲は `Space.sectionGapMobile`(16) で離す (VStack spacing は既に `Space.s3`=12 だが、§3.2 の下限 16 を満たすため grid 周りは `Space.s4` 相当を確保) |

> ★ **セル背景 = 不透明** / **罫線 = 削除 (gap 分離)** / **テキスト = 上寄せ** — この 3 点が Touri 名指し #1/#2/#3 の直接の帰結。Reviewer は「EventTile の background に alpha 透過が無い」「`.overlay` 罫線が 0 本」「HStack alignment が `.top`」を実装 grep でなくスクショで確認する (§9.4: 描画は目視、§10.1)。

#### 5.3.1 レイアウト (available を受け取る)

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

- **`height: CGFloat?` を削除し `available: CGFloat` を必須にする** — 呼び出し側が必ず `GeometryReader` 由来の実測値を渡す。**ホーム経路**: `SelfTimetableView` が prop で受けた `available` (HomeView の `GeometryReader` → `HomeBody` → `SelfTimetableView`) をそのまま渡す。**ルーム経路**: `RoomTimetable` が自分の body を包む `GeometryReader` の `proxy.size.height` を渡す。どちらも `UIScreen.main` は消える (F8)
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

**`RoomTimetable` の追従** (**P3**): 現状 `RoomTimetable` (`RoomDetailView.swift:369`) は `ScrollView { … TimetableGrid(daySlots:events:days:height: max(360, UIScreen.main.bounds.height - Space.roomTtChromeTop - Space.tabBarHeight)) }` (`:380`/`:389`)。→ **`RoomTimetable` の body を `GeometryReader { proxy in … }` で包み、`§4.7 で入れた ScrollView を外し`** (グリッドが `TimetableGridLayout` で内部スクロールを持つため二重スクロールになる)、`TimetableGrid(daySlots: daySlots, events: events, days: RoomTimetableLogic.displayDays(events: events), available: proxy.size.height, todayDisplayDay: SchoolClock.displayDay(), currentPeriodIndex: TimetableGridLayout.currentPeriodIndex(daySlots: daySlots, nowMinute: SchoolClock.nowMinute()))` を渡す形に。これで `:389` の `UIScreen.main` / `Space.roomTtChromeTop` / `Space.tabBarHeight` が**同時に**消える (§3.5 / §3.6)。**ルームの時間割にも `todayDisplayDay` / `currentPeriodIndex` を渡す** (メンバーの時間割でも「今」は同じ意味を持つ)。ホーム経由 (`HomeBody` の `.room` context) で `RoomTimetable` を出すときも `available` は `HomeBody` の `GeometryReader` から来る → `RoomTimetable(roomId:, available:)` を prop 化する。
**★ `RoomCalendar` 側の `ScrollView` (§4.7) は P3 でも残す** — §5.5 の `CalendarMonthLayout` (動的高) はホームの `PersonalCalendar` を対象にした節であり、`RoomCalendar` の高さ制御は本設計のスコープ外 (§0「ルームは土台に追従する最小改修のみ」)。**FAB の overlay もそこに付いたまま**にする。**ただし `RoomCalendar` が月表示で使う `CalendarMonth` は共有部品なので、§5.5 の §3.6.3 マス描画 (不透明 chip / 枠なし / today) は `RoomCalendar` にも波及する** (視覚規則の全画面共通化 = 望ましい)。**波及するのはマス描画だけで、動的高 (`available`) は渡さない** (下記 §5.5 の optional prop で room は nil = 固定 86 のまま)。

**★ ただし `RoomDetailView` が「溢れて操作不能」になるのは P2。** P2 単独マージを壊さないための**最小の手当てだけ**を前倒し済 → **§4.7** を参照。**本節 (grid の prop 契約変更) は P3 のまま。**

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

### 5.5 カレンダーを大きく + 月カレンダーを描き直す

**この節も (A) DESIGN.md §3.6.3 のマス描画 / (B) 動的高 / (C) today セル / (D) スワイプ を同時に行う。** 対象は `PersonalCalendar.swift` の `CalendarMonth` (`:229-302`) と `content` (`:123-165`)。

#### 5.5.0 ★ 月カレンダーのマス (DESIGN.md §3.6.3 の必須適用 — 最も「10年前」だった画面)

Web `CalendarMonth` を正典に、**スプレッドシート枠を全廃**する:

| 属性 | 現状 (`PersonalCalendar.swift`) | P3 規則 (pt / color) |
|---|---|---|
| 外殻 | `:253-255` `.background(Color.bgElevated)` + `Radius.md` (18) + `.overlay(stroke borderSubtle 1px)` | **白カード化**: `.padding(Space.s2)` (内 8) → `.background(Color.bgElevated)` → `.clipShape(RoundedRectangle(cornerRadius: Radius.lg, style:.continuous))` (**24**) → `.atenderShadow(.card)`。**stroke overlay は削除** (影で浮かせる。DESIGN.md §3.6.3) |
| セル分離 | `:242` 曜日 HStack `spacing: 0` / `:247` `LazyVGrid(columns: [GridItem(.flexible(), spacing: 0)], spacing: 0)` = 隙間なし + 罫線 | **1pt gap のみ**: `LazyVGrid` の `GridItem(.flexible(), spacing: 1)` + `LazyVGrid(..., spacing: 1)`。**各日セルに border を引かない** |
| 罫線 | `dayCell :297-298` `.overlay(alignment:.top){borderSubtle 1px}` + `.overlay(alignment:.leading){borderSubtle 1px}` | **★ この 2 行の `.overlay` を両方削除** (Touri 不満 #2。DESIGN.md §3.6.3「各日セルに border を引かない」) |
| 日セル | `dayCell :294-296` `.padding(4)` + `.frame(height: 86)` 固定 + `.background(inMonth ? bgElevated : bgMuted.opacity(0.45))` | 内 padding **2pt** (`.padding(2)`)、高さは §5.5.1 の `CalendarMonthLayout` から算出 (固定 86 廃止)、`.clipShape(RoundedRectangle(cornerRadius: Radius.sm, style:.continuous))` (**10**)。背景は §5.5「今日のセル」の `CalendarDayStyle` に従う (inMonth = bgElevated=カード地に溶ける / outsideMonth = bgMuted.opacity(0.45)) |
| 日付 | `:262-269` 左上・選択時 accent 丸 | **左上のまま** (既に正しい)。選択 = accent 丸背景 / **今日 = accent 文字色 (§5.5「今日のセル」で追加)** |
| イベント chip | `:275-284` `.background(Color(hexString: event.color).opacity(0.18))` = **半透明** + `Radius 4` + `.caption2` + `prefix(3)` | **不透明化**: `.background(Color.opaqueTint(hex: event.color, ratio: 0.18, base: .bgElevated))` (§5.3.0 のヘルパ)。`Radius 4` は維持 (DESIGN.md 4–8 の範囲)。font `.caption2` は維持 (P1 で 9pt→caption2 済)。**`prefix(3)` → `prefix(2)`** に下げ、`+N` 閾値 (`:286` `events.count > 3` → `> 2`) も合わせる (11pt に上げた分 3 件は 56pt 最小セルに収まらない。溢れは `+N` が担う) |
| 状態ドット | `:271-273` 日付右の丸 6pt `dayStatusColor` | **変更なし** (既に正しい) |

**原則 (DESIGN.md §3.6.3)**: 「白い丸カードの上に、枠のない日セルを 1pt gap で並べ、イベントは不透明 tint ピルで置く」。**日セルの個別枠 (table border) は引かない。** これが「詰め詰め10年前」を解く最大のレバー。

**★ 日番号の生存保証 (P3 Reviewer YELLOW の是正、2026-07-18。Reviewer + codex + Leader 一致)**:
`minRowHeight 56 / prefix(2) / 11pt` だけでは「番号 + chip 2個」の総高が行高を超え、**内容が隣週に溢れて日番号が上週の chip に覆われる** (実測: デモ月曜=2件で iPhone 16 でも発生)。動的高・Dynamic Type・ローカライズで再発するので**寸法の引き上げ (minRowHeight) を主対策にしない**。日セルの構造で守る:

- **日セルは「固定トップ行 (日番号) + 下部イベント領域」の 2 段に分ける。** 日番号の行は**高さを予約**し、イベント chip と**絶対に重ならない** (同一 VStack に number と chip を並べて競合させない)。
- **イベント領域だけに `prefix(2)` / `+N` / clip を適用**し、**日セルは自身の `frame(height:)` に `.clipped()`** して隣週へ描画を漏らさない。番号は clip 対象の外 (トップ固定行) に置くので必ず生存する。
- `minRowHeight` の再計算 (番号行 + chip 上限 + gap が収まる実寸) は**補助**として併用してよいが、単独対策にはしない。
- `+N` 閾値は上記構造の下でイベント領域が溢れる件数に合わせる (`prefix(2)` なら 3 件目から `+N`)。

**★ `CalendarMonth` は共有部品** (`PersonalCalendar.swift:151` ホーム / `RoomDetailView.swift:163` ルーム) → 上のマス描画は**両方に波及する** (望ましい)。**動的高 (`available`) だけは optional prop にしてホーム専用にする**:

```swift
struct CalendarMonth: View {
    let anchor: String
    let selectedDate: String
    let events: [CalendarEvent]
    let statusByDate: [String: AttendanceDayStatus]
    var available: CGFloat? = nil       // ← 新規。nil = 固定 86 (ルーム経路)。値あり = CalendarMonthLayout で算出 (ホーム)
    let onSelectDate: (String) -> Void
}
```

- ホーム (`PersonalCalendar`) は `available` を渡す。ルーム (`RoomDetailView:163`) は**渡さない (nil)** → 固定 86 のまま = §0「ルームは最小追従」。
- 日セル高 = `available.map { CalendarMonthLayout.rowHeight(available: $0) } ?? 86`。

#### 5.5.1 レイアウト (動的高)

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

- 現状のセル高**固定 86** を廃止 → 利用可能高から算出 (§5.5.0 の `available` optional prop 経由)。**クローム削減分がそのままカレンダーの大きさになる**
- **`PersonalCalendar` の prop 契約**: `PersonalCalendar(semesterId: String?, available: CGFloat)` — `available` は `HomeBody` (§5.2) が `HomeView` の `GeometryReader` から渡す。`content` の月表示で `CalendarMonth(anchor:selectedDate:events:statusByDate:available: available, onSelectDate:)` として渡す
- `DayAgendaPanel` (`:375-406`) は残す (機能削除はしない) が `.frame(height: CalendarMonthLayout.agendaHeight)` (200) + 内部スクロール
- **`content` (`:138-163`) の月表示を `ScrollView { … }.scrollBounceBehavior(.basedOnSize)` で包む** → 収まれば動かず、iPhone SE のように溢れればスクロールする。`available` は `ScrollView` の**外**から (= HomeBody 由来) 受け取るので viewport 高であり、`CalendarMonthLayout.rowHeight(available:)` に正しく効く (ScrollView の内側で測ると無限高になる罠を避ける)
- **月セルのイベント名の件数**: font は既に `.caption2` (11pt。P1 で `:277` の 9pt→caption2 済) なので**フォントは触らない**。**`prefix(3)` (`:275`) → `prefix(2)`**、`+N` 閾値 (`:286` `events.count > 3`) → `> 2` に下げる (**逸脱理由**: 11pt では 3 件が 56pt 最小セルに収まらない。溢れた件数は `+N` 表示が担う)。詳細は §5.5.0 のイベント chip 行

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

### 5.6 ルーム詳細のタイトル重複解消 (Touri 裁定 1 / DESIGN.md §3.7.2・§9-1)

**現状の重複** (`RoomDetailView.swift`、main `a337ea0` で確認): P2 が付けた **nav bar の inline タイトル `:52` `.navigationTitle(model?.room?.name ?? "ルーム")`** と、本文 header の**大タイトル `:68` `Text(model?.room?.name ?? "ルーム").font(.atender2xl).fontWeight(.bold)`** が room 名を**2 回**出している (DESIGN.md §2 の診断)。

**P3 で解消 (DESIGN.md §3.7.2 のプロミネント content header パターン)**: **nav bar のタイトル文言を消し、本文 header の大タイトル + gear を残す。**

| 対象 | 現状 | P3 の変更 |
|---|---|---|
| nav bar タイトル | `:52` `.navigationTitle(model?.room?.name ?? "ルーム")` | **`.navigationTitle("")` に置換** (P2 で足した room 名を撤回。nav は back のみ)。`:53` `.navigationBarTitleDisplayMode(.inline)` は**維持** |
| 本文 header 大タイトル | `:65-91` `header` (`:68` room 名 `.atender2xl` bold / `:81-89` gear `gearshape.fill`) | **維持** (これが唯一のタイトルになる)。gear も本文 header に残す |
| 上に詰める | `body` は `VStack(alignment:.leading, spacing: Space.s3)` (`:38`) で header が先頭。nav タイトル文言が消えて inline バーが back だけになった分、header が視覚的に上へ来る | **構造変更なし**。nav の room 名が消えることで重複が解け、大タイトルが「上に押し込まれた」ように見える (Touri の明示要望「小さい方を消して、大文字ルーム名と設定ボタンを上に」) |

- **逸脱の明示** (DESIGN.md §3.7.2): 「詳細画面は inline nav タイトル」という一般 iOS 慣習からの逸脱。理由は (a) room 名が長く content で大きく見せる価値がある (b) Touri の名指し要望。**プロミネントな content header を持つ詳細画面 (ルーム詳細) はこのパターン**。header を持たない詳細画面 (テンプレート/科目詳細/日別詳細で content 側に大タイトルが無いもの) は **inline nav タイトルを使う** (= §4.3 の `TemplatesView` 等は現状の inline タイトルのまま。本裁定はルーム詳細だけ)。
- **★ §4.3 (P2) の該当記述を撤回するのはこの 1 行だけ**: §4.3 の表は P2 で `.navigationTitle(model?.room?.name ?? "ルーム")` を足したが、P3 で `.navigationTitle("")` に置換する (nav は back のみ)。`.navigationBarTitleDisplayMode(.inline)` / `BackHeaderButton` 撤去 / 溢れ止め (§4.7) は**維持** (それらは P2 で正しく着地済)。
- **テスト影響**: nav タイトル文言の有無を assert する既存テストは無い (`RoomDetailView` は `room-detail-tabs` identifier で掴まれるが nav タイトルは掴まれていない)。Reviewer は §10.1 のスクショで「nav バーに room 名が出ていない・本文 header に大タイトルが 1 つだけ」を目視確認する。

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

**★ P1 で実施済** (`4dfd3a9`)。11 箇所 (`Settings/SemesterListSheet.swift:116` / `Calendar/PersonalCalendar.swift:8,9` / `SemesterOverview/CourseDetailModal.swift:92` / `Home/SelfTodayCTA.swift:25` / `SemesterOverview/SemesterOverviewComponents.swift:79` / `Rooms/RoomDetailView.swift:126,127,399` / `SemesterOverview/SemesterLogic.swift:131` / `Setup/SetupFlowView.swift:153`) は全て `SchoolClock.todayString()` に置換され、`CalendarRange.todayString` の残存は 0。
**P2/P3 で新しく「今日」が要る箇所を書くときは `SchoolClock.todayString()` を使う。** `CalendarRange` に today を戻さない (F3 のバグの構造そのもの)。

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

**★ 標本時刻の規律 (時刻依存の挙動すべてに適用)**: **日付だけを書いた標本は禁止。必ず「時刻まで」指定する。**
F3 の症状は **00:00〜08:59 JST の 9 時間**だけに出る。正午 (JST 12:00 = UTC 03:00) を標本に選ぶと**日付も曜日も UTC 暦と一致してしまう**ため、JST 暦を UTC 暦に戻す変異体を**検出できない** = テストが無害に緑になる。
→ **JST の「今日」「曜日」に依存する assert は、必ず 00:00〜08:59 の窓に標本を 1 点以上置く。** 昼の標本だけで構成された時計テストは、**最も危険な窓が唯一の無検出窓**になる。

- **#C1**: `todayString` — JST `2026-07-17 08:00` → `"2026-07-17"`。**★ 現行 `CalendarRange.todayString()` は同じ瞬間に `"2026-07-16"` を返す (実測 F3)。この 1 本が回帰の要**
- **#C2**: `todayString` — JST `2026-07-17 00:00` / `08:59` / `09:00` / `23:59` → すべて `"2026-07-17"`
- **#C3**: `todayString` — JST `2026-07-17 23:59` の 1 分後 (`2026-07-18 00:00`) → `"2026-07-18"`
- **#C4**: `nowMinute` — JST `00:00` → `0` / `08:00` → `480` / `09:00` → `540` / `23:59` → `1439`
- **#C5**: `displayDay` — **標本時刻を必ず書く**。JST `2026-07-13 12:00`(月) → `1` / `07-17 12:00`(金) → `5` / **`07-18 12:00`(土) → `6`** / **`07-19 12:00`(日) → `7`**。**週末を月曜に丸めない** (削除する `todayDayOfWeekJs` との違いがここ)
- **#C5b**: `displayDay` の**早朝境界** — ★ **#C5 の昼の標本だけでは UTC 暦への変異を検出できない** (JST 12:00 = UTC 03:00 で曜日が変わらない)。`displayDay` は §5.3 の「今日の列」を決める関数であり、F3 の症状 (「月曜の 9 時前にルームの時間割が先週を読む」) は**まさにこの窓**で出る。以下を必須とする:
  - JST `2026-07-13 08:00` (月) → `1` — UTC では日曜 23:00 なので、UTC 暦なら `7` を返して落ちる
  - JST `2026-07-13 00:00` (月) → `1`
  - JST `2026-07-18 00:30` (土) → `6` — UTC では金曜 15:30 なので、UTC 暦なら `5`
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

### 8.6.1 マス描画ヘルパ (`Color.opaqueTint`) — T (§5.3.0 / §5.5.0)

**Touri 名指し #1「背景が透過」の唯一の機械的防波堤。** `Color.opaqueTint` の返り値を `UIColor(_:)` に通し、light/dark trait で `resolvedColor(with:)` して RGBA 成分で検証する (`UIColor(Color.accent500)` の round-trip が dynamic を保つことは §8.7 #S11 で確認済の経路)。

- **#T1**: `UIColor(Color.opaqueTint(hex: "#FF0000", ratio: 0.15, base: .bgElevated))` を light/dark どちらの trait で解決しても **alpha == 1.0** (`accuracy: 0.001`)。**★ これが「透過をやめた」ことの証拠** — 現行 `EventTile` の `.opacity(0.16)` はここで alpha≈0.16 になり落ちる
- **#T2**: `ratio: 0` → base の色そのもの (`opaqueTint(hex:"#FF0000", ratio:0, base:.bgElevated)` の RGB == `UIColor(Color.bgElevated)` の RGB、light/dark 各 trait で `accuracy: 0.01`)
- **#T3**: `ratio: 1` → subject の色そのもの (`opaqueTint(hex:"#FF0000", ratio:1, base:.bgElevated)` の RGB == `(1,0,0)` `accuracy: 0.01`)。**#T2/#T3 は #T1 が vacuous でない (ratio が実際に効いている) ことの対照**
- **#T4**: base が dynamic (`bgElevated` は light/dark で別値) のとき、`opaqueTint(..., base: .bgElevated)` の light 解決値と dark 解決値が**互いに異なる** — ヘルパが `UIColor(dynamicProvider:)` を潰していない (light/dark 追従を殺していない) こと
- **★ hex をベタ書きした期待値で「特定の色」を検証しない** (§9.3)。検証する不変条件は「alpha=1」「ratio の端点で base/subject に一致」「dynamic が保たれる」であって、混色結果の具体 hex ではない

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
- **#S11**: **`AccentColor` asset と `Color.accent500` が同じ色であること** (§4.1、**P2 で追加**)。`UIColor(named: "AccentColor")` を light / dark の `UITraitCollection` で `resolvedColor(with:)` し、`UIColor(Color.accent500)` を同じ trait で解決したものと **RGBA 成分で比較** (`XCTAssertEqual(_:_:accuracy: 0.001)`)。
  - **★ hex をテストにベタ書きしない。** `#1E96E6` と書くと「asset とコードが一致している」でなく「asset が特定の hex である」を検証することになり、**次のリブランドで §9.3 と同じ置き去りが起きる**。**検証すべき不変条件は「2 つの正典が一致していること」**
  - **★ これが `7ac596f` の再発防止そのもの**: あのコミットは `Color+Atender.swift` だけ azure にして asset を orange のまま残した。このテストがあれば当時落ちていた
  - **API は Architect が typecheck 済** (`-target arm64-apple-ios17.0-simulator`)。`UIColor(Color.accent500)` の round-trip が dynamic を保たない環境に当たった場合のみ、`Color.accent500` 側も `UIColor { traits in ... }` として直接組み直してよい (hex のベタ書きに逃げない)
- **#S12**: **#S11 の負の対照** — `UIColor(named: "AccentColor")!` の light 解決値と dark 解決値が**互いに異なる**こと。**これが無いと #S11 は vacuous になり得る** (両 trait が同じ値に解決されていても #S11 は緑になる)。現状の asset は light/dark とも `#F97316` = **この対照は今は落ちる**。**是正後に初めて両方緑になる**

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
  - `ScreenMetricsTests.swift` (§3.6 の値の契約。**P1 で着地済** — `@MainActor` 付きのテストクラスになる)
  - `HomeChipsTests.swift` に **#H1/#H2 を追記** (既存 3 本は触らない)
  - `ColorTintTests.swift` (#T1〜#T4、**P3**。`Color.opaqueTint` の alpha=1 / ratio 端点 / dynamic 保持)
  - `TypographyRegistrationTests.swift` を **全面書き換え** (#S4〜#S8)
  - `NavigationTests.swift` に **#S10 を追記** (既存は触らない)
  - `DesignTokenTests.swift` に **#S11/#S12 を新メソッド `testAccentColorAssetMatchesToken` として追記** (**P2**。既存 2 メソッドは触らない — `testSpacingAndRadiusTokens` の 2 行削除は P3 / §9.2 #1)
- **実行**: `/opt/homebrew/bin/xcodegen generate` → `xcodebuild test -project Atender.xcodeproj -scheme Atender -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.2'`
- **ベースライン**: **263 GREEN / 0 RED** (`4dfd3a9` = 本設計 P1 のマージ、2026-07-17 実測)。**未分類 0**。
  内訳: 201 (version-management 着地時) + P1 の新規 62。
  ★ **`.knowledge/known-failures.md` は 201 (`3c9e85b`) のままで P1 分が未反映** — 台帳を数値の正典として引かず、**着手前に自分で測り直す** (§0 前提 P2)
- **スクショ検証**: `AtenderUITests/ScreenshotFlow.swift` (`xcodebuild test -scheme AtenderUITests ... -resultBundlePath run.xcresult` → `xcrun xcresulttool export attachments`)。**刷新の before/after 比較の本体**。§5.4 のとおりラベルと accessibilityIdentifier を保存するので、ハーネスは無改修で動く

**`Date` の注入**: `SchoolClock` / `TodayTimeline` の全関数は `Date` を引数で受ける (既定引数 `Date()` は本番用)。**テストは既定引数を使わない** — 使うと「テストを走らせた時刻」に依存して深夜に落ちる。

**★ Reviewer への必須指示**:
1. **#C1 と #N15 を必ず書くこと。** これが「今」の土台が JST であることの唯一の防波堤であり、**現行実装ならこの 2 本は落ちる** (実測 F3)。落ちなければテストが間違っている
2. **#S1 / #S5 / #S6 の負の対照を省略しないこと。** `Font.custom` は解決失敗を無言でシステムフォントに落とすので、正の assert だけでは vacuous pass する (`gotcha/swiftui-font-custom-silent-fallback-hides-missing-uiappfonts.md`)。**検証は `UIFont(name:)` で書く。`Font.custom` を検証に使わない**
3. **レイアウト定数をテストにベタ書きするな** — `44` / `56` / `28` は `TimetableGridLayout.minRowHeight` 等の**トークンを参照して**書く。ベタ書きすると `DesignTokenTests` が `Space.selfTtChrome == 352` を焼き込んで刷新で全滅したのと同じ構図を作る
4. **haptics / 遷移アニメ / Liquid Glass の見た目にユニットテストを書かない** (§9.4)

### 9.2 意図的に壊すテスト

**findings は「9 件」と見積もっていたが、実際に本設計が壊すのは 3 本 (2 ファイル) だけ。** 残りは契約を保つ設計にしたので緑のまま。

**★ どのフェーズで壊れるかは「削除するトークンの最後の参照が消えるフェーズ」に従う** (§3.5)。下表の Phase 列を守ること。

| # | テスト | 壊れる Phase | 壊れる理由 | Reviewer の再生成方針 |
|---|---|---|---|---|
| 1 | `DesignTokenTests.testSpacingAndRadiusTokens` | **P3** | `Space.selfTtChrome` (:11) と `Space.tabBarHeight` (:10) を**削除する**ので**コンパイルが通らない** (assert が落ちるのではない)。**★ 両トークンとも削除は P3** — `selfTtChrome` は `TimetableGridPhaseB.swift:17` (§5.3)、`tabBarHeight` は `SelfTodayCTA.swift:107` (§5.4) と `RoomDetailView.swift:389` (§5.3) が最後の参照を握っている。したがって **P1 でも P2 でも本テストは緑のまま**が正しい (P1 実測で緑を確認済) | 該当 2 行を削除。`Radius.full == 9999` と `Space.s20 == 80` の 2 行は**そのまま維持** (これらのトークンは残る)。**削除したトークン名を新しい定数で assert し直さない** — 「消えた」ことはコンパイラが保証する |
| 2 | `TypographyRegistrationTests.testRegisteredFontPostScriptNamesResolveWithUIFont` | **P1 済** | `Font.interPostScriptName` を削除 + Inter/Noto を登録解除 | **#S4〜#S7 に全面書き換え**。「Inter が**無い**こと」を assert する側に反転させる |
| 3 | `TypographyRegistrationTests.testUIAppFontsPlistContainsBundledFontFiles` | **P1 済** | `UIAppFonts` が 7 件 → 1 件 | **#S8**。`expectedFontFiles` を `["GoogleSans-Medium-Latin.ttf"]` に。**「全エントリがパス無し + バンドル内に実在」の不変条件ループは価値が高いのでそのまま残す** |

**加えて削除するテスト 1 本** (**P1 済**):

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
→ **Developer への指示**: **コード中の色の「値」を触るな。** §3.3 の中立色の置換対象は `bg*` / `text*` (ただし `textOnAccent`/`textOnDanger` を除く) / `border*` の**それだけ**。`MemberColor.palette` / `accent*` / `status*` / `brand*` / `SelfTimetableView` のフォールバック `#1E96E6` / `RoomCalendarLogic.sourceColor` の値に**ついで掃除で手を出さない**。ハードコード hex をトークンに寄せたくなるが、それは本設計の要望と無関係で、この 5 件を無言で壊す。

**★ `AccentColor.colorset` の是正 (§4.1) はこの禁止と衝突しない** — 混同すると事故るので境界を明示する:

| | 触る | 理由 |
|---|---|---|
| `Assets.xcassets/AccentColor.colorset/Contents.json` | **○ 是正する** (P2) | **accent** の系統。`7ac596f` の azure 決定から取り残された未移行の残骸。**参照するテストは無く、消費者も現在 0** なので既存の 5 件に影響しない |
| `RoomLogic.swift:179` / `MeetingSheets.swift:179,191` の `?? "#F97316"` | **× 触らない** | **科目・メンバー色**の系統 (accent ではない)。**`RoomLogicTests:334` が `"#F97316"` を assert している** |
| `FriendsView.swift:163` の `#F97316` | **× 触らない** | メンバー色グラデのパレット |
| `AtenderTests/Fixtures/*.json` の `#f97316` | **× 触らない** | フィクスチャの科目色 |

→ **`#F97316` という文字列で grep して一括置換するな。** **accent の orange (asset 1 ファイル) と 科目色の orange (コード 4 箇所 + フィクスチャ) は別のトークン系統**であり、後者は今も現役の正しい値。**「orange を全部消す」は本設計の作業ではない。**

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

**★ 「§N 全部を Phase X」という割り当ては誤り** (P1 の実装で判明)。**削除対象のトークン・ファイルは「最後の本番参照が消えるフェーズ」でしか消せない**ので、§3.5 の `Space` 整理は P1・P2・P3 に**またがる**。下表は節単位でなく**作業単位**で書く。

| Phase | 内容 | 独立性 / 理由 |
|---|---|---|
| **P1 土台** ✅ **着地済 (`4dfd3a9`)** | §3.1 書体 / §3.2 フォントトークン (呼び出し 18 箇所の変換) / §3.3 中立色 / §3.4 `AmbientBackground` 削除 (+ `RootView` の該当行) / **§3.5 のうち「本番参照 0 の 4 トークン削除 + `pagePxMobile` 12→16」だけ** / §3.6 `ScreenMetrics` 新設 (消費者は P4) + §7.1 `SchoolClock` + §7.2 `TodayTimeline`・`NowNextText`・`AttendanceSummary` + §5.3 `TimetableGridLayout` + §5.5 `CalendarMonthLayout`・`CalendarDayStyle` + `project.yml` の `developmentLanguage`/`UIAppFonts` | **ビルド基盤に効く** (`project.yml` + xcodegen + フォント登録)。全画面に波及するが機械的。**新規ロジックは全部ここで、UI 無しで、テスト付きで着地する** |
| **P2 シェル** | §4 全部 — native `TabView` (§4.1) + **`AccentColor.colorset` の azure 是正 (§4.1)** / `BottomTabBar`・`PlaceholderViews` 削除 / nav bar 復活 + `BackHeaderButton` 削除 (§4.3) / Glass シム (§4.5) / **§4.7 `RoomDetailView` の溢れ止め (§5.3 から前倒し)** + **§3.5 のうち `Space.tabBarContent` の定義削除** + **§4.2 の 7 箇所のパディング除去 (`tabBarHeight` の*定義*は残す)** + **#S11/#S12 (§8.7)**。**★ `RootView` は 1 行も触らない (§4.4 / §4.6 撤回)** | P1 の `ja` 設定に依存 (back が「戻る」になって初めて `BackHeaderButton` を消せる)。**§4.7 が無いと `RoomDetailView` が操作不能のままマージされる** = 「`main` は常にデプロイ可能」に抵触 |
| **P3 ホーム** | §5 全部: **large title「ホーム」+ 学期/switcher/segmented をコンテンツ先頭へ (§5.2、DESIGN.md §3.7.1)** / `ContextChips` 条件表示 / グリッドが available を受け取る = **`TimetableGrid` の prop 契約変更 (`height`→`available`) と §4.7 の `ScrollView` 撤去** / **★ DESIGN.md §3.6 のマス描画 = `EventTile`/グリッド線 (§5.3.0) + 月カレンダー (§5.5.0)** + **`Color.opaqueTint` ヘルパ新設 (additive)** / 「今」の描画 / `NowNextBar` (§5.4) / カレンダー拡大 (§5.5) / **ルーム詳細のタイトル重複解消 (§5.6、裁定1)** + **§3.5 のうち `Space.tabBarHeight`・`selfTtChrome`・`roomTtChromeTop` の定義削除** (§5.3/§5.4 が最後の参照を消した後) + **`DesignTokenTests` の 2 行削除** (§9.2 #1) | **本命。** P2 のシェルに乗る。**「今」の UI とクローム再編は同じ場所 (`SelfTodayCTA` → `NowNextBar`) を触るので分けない**。**`TimetableGrid` / `CalendarMonth` / `EventTile` は `SelfTimetableView`(ホーム) と `RoomDetailView`(ルーム) の共有部品なので、prop 契約とマス描画の変更は両呼び出し側が揃うこのフェーズで行う** (マス描画は両方に波及 = DESIGN.md §3.6 の全画面共通化で望ましい) |
| **P4 仕上げ** | §6 全部 (haptics / ジェスチャ / 遷移アニメ / `ContentUnavailableView` / `.redacted` / `Chip`・`StatusDot` 削除) + **`BottomSheet.swift:37` の `UIScreen.main` → `ScreenMetrics.height`** (§3.6 で新設したヘルパに初めて消費者が付く) | P3 の構造が固まった後。**単体で RED になっても本体は動く** = 最後に置くのが安全 |

**トークン削除の一覧は §3.5 の表が正典** (Phase 列付き)。本表と食い違ったら §3.5 を採る。

**認証の再ゲート**: いずれのフェーズも**認証ロジックに触れない**。P1 が `AuthProviderButton` の**フォント指定 2 行**に触るのみ (§3.2、**実施済**)。`SignInWithAppleButton` への置換は**やらない** (§11)。

**推奨マージ順**: ~~`feature/version-management`~~ (着地済 `60a127e`) → ~~P1~~ (着地済 `4dfd3a9`) → **P2** → P3 → P4。

### 10.1 実装後の必須検証 (doc の注記は実行されないが、これは実行される)

**★ 本設計の中心的な主張は「native 部品にすると Liquid Glass が出る」だが、ユニットテストはそれを 1 ミリも検証しない** (§9.4)。したがって検証を成果物の中に置く:

1. **P2 完了時**: `ScreenshotFlow` を **iOS 26.5 シミュレータ**で走らせる
   `xcodebuild test -project Atender.xcodeproj -scheme AtenderUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=26.5' -resultBundlePath glass.xcresult`
   → `01-home-timetable` のタブバーが**すりガラス状で背後のコンテンツが透けている**こと。**P2 前の同じスクショと比較する** (before は現行 main で 1 回撮っておく)
   - **判定が成功/失敗で違う値になるか**: タブバーの背景が「不透明な `bgElevated` 85%」から「背後が屈折して見えるガラス」に変わる = **目視で区別可能**。変わっていなければ native 化が効いていない
2. **P2 完了時**: 同じフローを **iOS 18.2** でも走らせる → **タブバーが普通に出ていること** (ガラスは出ない = 正しい。21% のユーザーの体験)
2b. **★ P2 完了時: accent の退行チェック** (§4.1)。`01-home-timetable` の**選択タブのピクセル**を実測する。
   - **判定が成功/失敗で違う値になるか**: **なる** — 是正済なら `#1E96E6` (azure) / 未是正なら **`#F97316` (orange)**。この 2 値は目視でも判別可能で、**実際に未是正の P2 実装で `#F97316` が観測されている** (2026-07-17)
   - **nav bar の back も見る** — `03-room-detail` の back chevron。`TabView` にだけ `.tint` を当てた場合、**タブは azure・back は orange** になる。**両方 azure でなければ asset を直していない**
   - ユニット側は #S11/#S12 が同じ不変条件を機械的に守る (§8.7)
2c. **★ P2 完了時: `RoomDetailView` の操作可能チェック** (§4.7)。**この画面が P2 で壊れたのを実測で見つけた経緯があるので、目視でなくタップで確かめる**。
   - `ScreenshotFlow` で `room-detail-tabs` (`RoomDetailView.swift:94` の `accessibilityIdentifier`) の**両タブを実際にタップし、前後のスクショが変わること**を確認する
   - **★ 「タップした」でなく「タップが効いた」を見る**: XCUITest の tap は**当たらなくても失敗しない** (ソフトタップ)。壊れていた時の症状は**連続スクショが byte-identical** だった。→ **カレンダー→時間割の切替でスクショの byte 差分が出ることを判定条件にする**。`app.buttons["room-detail-tabs"].isHittable` も併せて見る
   - **FAB も見る** (§4.7「FAB の罠」): `room-fab-event` が**カレンダーの週/日表示で浮いたまま**であること。`.overlay` を `ScrollView` の内側に付けてしまうと**スクロールで流れて消える**ので、**スクロールした後のスクショで FAB が同じ位置にいる**ことを確認する
   - iPhone 16 と **iPhone SE (小画面)** の両方で行う。SE の方が可用高が小さく、溢れが先に出る
3. **P3 完了時**: iPhone SE (小画面) と iPhone 16 の両方で `01-home-timetable` を撮り、**グリッドが溢れずに収まっている**こと (#G4/#G5 の実地確認)
3b. **★ P3 完了時: マス描画の是正 (DESIGN.md §3.6 / Touri 名指し #1-#3)** — ユニットは #T が alpha=1 を守るが、見た目は目視。`01-home-timetable` / `02-home-calendar` / `E03-room-timetable` を撮り、**before (P2 スクショ) と比較**:
   - **時間割セル**: 背景が**不透明** (下地のグリッド線が透けない) / セル内テキストが**上寄せ** / 左バーが細く (2pt) / 空きセルに**縦横の罫線が無い** (表組みに見えない)
   - **月カレンダー** (`02-home-calendar`): **白い丸カード (Radius 24 + 影)** の上に、**枠のない日セル**が gap で並ぶ / イベント chip が**不透明** / 今日のセルが accent 文字色 / スプレッドシート枠が消えている
   - **判定が成功/失敗で違う値になるか**: なる — P2 スクショはセル背景が半透明で罫線が全面に回り、月カレンダーは灰枠のスプレッドシート。是正後は罫線が消え面が主役になる。**目視で明確に区別可能** (Touri の 3 不満の直接確認)
3c. **★ P3 完了時: ヘッダー規格 (裁定2・裁定1)** — `01-home-timetable` に **large title「ホーム」**が出ていること。`03-room-detail` (ルーム詳細) の **nav バーに room 名が出ておらず** (back のみ)、**本文 header に大タイトルが 1 つだけ** + gear が上部にあること (§5.6。重複が消えている)
4. **P1 の negative control** — `project.yml` から `developmentLanguage: ja` を一時的に外して `xcodegen generate` → **#S1/#S2/#S3 が赤くなること**を確認してから戻す。「GREEN は修正が作った」と言い切るため (F2 で Architect が実施済の手順をそのまま踏む)
   **★ P1 は既にマージ済 (`4dfd3a9`)。この手順の実施記録が無い場合は P2 の着手前に行う** — `ja` 化は P2 の `BackHeaderButton` 削除の前提 (back が「戻る」にならないまま自前 back を消すと英語の "Back" が出る)

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
| **ダークモードのトグル自体を削除する** (HIG は OS 追従を求める) | 「作った UI を捨てるか」は**プロダクト判断で Architect の裁量ではない**。**★ 2026-07-17 の §4.6 撤回で却下理由が強まった**: 既定が `.light` に据え置かれた結果、**トグルは dark への唯一の経路**になった。消せば §3.3 で semantic color に移した中立色の **dark 側の値が到達不能な死にコードになる**。(旧版はここで「既定を `.auto` にすれば HIG の実害は消える」と書いていたが、**その前提は撤回された**) |
| **`.tint(Color.accent500)` を `TabView` に付けて accent の退行を止める** (§4.1) | **漏れを追いかける手当てで、根 (`AccentColor` asset の orange) が残る。** (a) P2 は nav bar も 5 画面で復活させ、system back / toolbar も asset を引くので **`TabView` の `.tint` 1 個では back が orange のまま** (b) `RootView` に置く案は §4.6 撤回で「**P2 は `RootView` を 1 行も触らない**」と確定したためスコープ再拡大になる (c) **正典が 2 つ (asset と `.tint`) 並ぶ** (d) §0 が次の doc に送った**ウィジェット target** は新しい root なので、そこで orange が再発する。→ **asset を是正する** (§4.1)。「相手側の設定で回避する」でなく「自分側 = 単一の定義を正す」 |
| **`#F97316` を grep して一括で azure に置換する** | **accent の orange と 科目色の orange は別のトークン系統。** 科目色側 (`RoomLogic.swift:179` 等 4 箇所 + フィクスチャ) は**今も現役の正しい値**で、`RoomLogicTests:334` が assert している。一括置換は §9.3 の 5 件を無言で壊す。**是正対象は `AccentColor.colorset` の 1 ファイルだけ** |
| **§5.3 (グリッドが `available` を受け取る) を丸ごと P2 に前倒しする** (`RoomDetailView` の溢れを直すため) | **`TimetableGrid` は `SelfTimetableView` と `RoomDetailView` の共有部品**なので、prop 契約 (`height:` → `available:`) を P2 で変えると **`SelfTimetableView` = P3 の `HomeView` 再構成を P2 に道連れにする**。前倒しは「**壊れを出さないための最小**」に限り、**タブ内容への `ScrollView` (§4.7)** で止める |
| **`RoomDetailView.body` の `Group` を `ScrollView` で包む** (§4.7 の一見最小な案) | **`RoomCalendar` の FAB (`.overlay`) がスクロールする*コンテンツ*側に付いたままになり、浮かずに流れて消える。** overlay を `ScrollView` の外に置くには、FAB の state (`viewMode` / `activeSheet`) を持つ `RoomCalendar` の内側で包むしかない。→ **タブ内容ごとに `ScrollView` を持たせる** (§4.7)。「1 枚で済む」は**行数の最小であって、壊さない最小ではない** |
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
| 2 | ~~**ダークモードの既定が light → auto に変わる** (§4.6)~~ → **★ 撤回済 (2026-07-17 Touri 裁定)。既定は `.light` のまま。P2 はテーマ関連を 1 行も触らない** | ~~auto にする~~ → **撤回。** 理由: 設計は「`RootView` の 2 行」で届くとしていたが、**実測で `@AppStorage("atender.theme")` は 3 ファイルに散在**し (`AtenderApp.swift` が `RootView` の**外側**で `.preferredColorScheme` を適用しており、そちらが勝つ)、届けるには**スコープ外の `SettingsView` と未言及の `AtenderApp`** への拡大が要る。**Touri が「それに見合わない」と裁定。** ★ 当時の私の推奨根拠「light 固定は semantic color の意味を殺す」は**言い過ぎだった** — 殺されるのは *OS 設定への自動追従* だけで、Increased Contrast 追従 / Glass 協調 / grouped 階層 / **設定で `.dark` を選んだときの正しい解決**は全部生きている (§3.3 の表)。**§3.3 (P1 済) を巻き戻す必要は無い。** 詳細と再発防止は §4.6 |
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
| `apps/ios/Atender/Core/Timetable/SchoolClock.swift` | P1 ✅ |
| `apps/ios/Atender/Core/Timetable/TodayTimeline.swift` (`TodayState` / `TodayTimeline` / `NowNextText` / `AttendanceSummary`) | P1 ✅ |
| `apps/ios/Atender/Core/Timetable/TimetableGridLayout.swift` | P1 ✅ |
| `apps/ios/Atender/Core/Timetable/CalendarMonthLayout.swift` (`CalendarMonthLayout` / `CalendarDayEmphasis` / `CalendarDayStyle`) | P1 ✅ |
| `apps/ios/Atender/Core/DesignSystem/ScreenMetrics.swift` | P1 ✅ (**消費者が付くのは P4** — §3.6) |
| `apps/ios/Atender/Core/DesignSystem/Glass.swift` | P2 |
| `apps/ios/Atender/Features/Home/NowNextBar.swift` (`NowNextBar` / `NowNextBarHost` / `TodayAttendanceSheet`) | P3 |
| `apps/ios/AtenderTests/{SchoolClock,TodayTimeline,NowNextText,TimetableGridLayout,CalendarLayout,Localization}Tests.swift` | 各 Phase |

### 削除 (**1 ファイルずつ参照元を grep して確定済**)

| path | 参照元 | Phase |
|---|---|---|
| `apps/ios/Atender/Core/DesignSystem/AmbientBackground.swift` | `RootView.swift:10` の 1 箇所のみ | P1 ✅ |
| `apps/ios/Atender/Resources/Fonts/Inter-{Regular,Medium,SemiBold,Bold,Black}.ttf` | `UIAppFonts` のみ (コードは `Font.interPostScriptName` 経由 → 削除) | P1 ✅ |
| `apps/ios/Atender/Resources/Fonts/NotoSansJP-VariableFont_wght.ttf` | `UIAppFonts` のみ。**コードからの参照 0** | P1 ✅ |
| `apps/ios/Atender/App/BottomTabBar.swift` | `MainTabView.swift:81` の 1 箇所のみ | P2 |
| `apps/ios/Atender/App/PlaceholderViews.swift` | `HomePlaceholderView`/`SemesterPlaceholderView` は `MainTabView` の 2 箇所 (直接呼びに置換)。**`RoomsPlaceholderView`/`FriendsPlaceholderView`/`PlaceholderScreen`/`TopBar` は参照 0** | P2 |
| `apps/ios/Atender/Core/DesignSystem/Components/BackHeaderButton.swift` | `RoomDetailView.swift:39` / `TemplatesView.swift:22` の 2 箇所 (行ごと削除、system back が代わる)。**`.navigationBarBackButtonHidden(true)` (`RoomDetailView:53` / `TemplatesView:49`) も一緒に外す** (§4.3) | P2 |
| `apps/ios/Atender/Core/DesignSystem/Components/Chip.swift` | **参照 0** (`Chip(` の 3 ヒットは `selfChip(` の誤検出) | P4 |
| `apps/ios/Atender/Core/DesignSystem/Components/StatusDot.swift` | **参照 0** (ヒットは同ファイル内の `#Preview` のみ) | P4 |
| `apps/ios/Atender/Features/Home/SelfTodayCTA.swift` | `NowNextBar.swift` に置換 (§5.4) | P3 |

**★ `GoogleSans-Medium-Latin.ttf` は削除しない** — `AuthProviderButton.swift:102` が現に使用中。

### 主な変更

| path | 変更点 | Phase |
|---|---|---|
| `apps/ios/project.yml` | `options.developmentLanguage: ja` 追加 / `UIAppFonts` を GoogleSans 1 件に。**`CFBundleVersion` は触らない** | P1 ✅ |
| `Core/DesignSystem/Typography.swift` | 全面置換 (§3.2) | P1 ✅ |
| `Core/DesignSystem/Color+Atender.swift` | 中立色のみ置換 (§3.3)。**有彩色は 1 つも触らない** | P1 ✅ |
| `Core/DesignSystem/Space.swift` | **§3.5 の表 (Phase 列付き)。3 フェーズにまたがる** — P1: 参照 0 の 4 トークン削除 + `pagePxMobile` 12→16 ✅ / P2: `tabBarContent` / P3: `tabBarHeight`・`selfTtChrome`・`roomTtChromeTop` | **P1 ✅, P2, P3** |
| `Core/Timetable/TimetableLogic.swift` | `CalendarRange.todayString()` と `DayConvention.todayDayOfWeekJs` を削除。**それ以外は不変** | P1 ✅ |
| `Core/DesignSystem/Components/BottomSheet.swift` | `UIScreen.main` → `ScreenMetrics.height` (1 行)。**`ScreenMetrics.height` は `@MainActor` だが `BottomSheet` は View なので追加対応不要** (§3.6) | P4 |
| `App/MainTabView.swift` | 全面置換 (§4.1) | P2 |
| `Assets.xcassets/AccentColor.colorset/Contents.json` | **`#F97316` (orange) → azure に是正** (light `#1E96E6` / dark `#3DA9F0` = `Color.accent500` と同ペア)。`7ac596f` から取り残された未移行の残骸。**native `TabView` / nav bar が最初の消費者になるので P2 で直す** (§4.1) | **P2** |
| `App/RootView.swift` | **★ 触らない。** `AmbientBackground()` 除去は P1 で完了済 (§3.4)。**P2 に予定していた 2 点 (`?? .auto` + `@AppStorage` 既定値) は撤回済** (§4.4 / §4.6) | P1 ✅ のみ |
| `Features/Home/HomeCore.swift` | `HomeView` 再構成 = **large title「ホーム」+ 学期 `Menu`(subhead)/`ContextChips`/`Picker(.segmented)` をコンテンツ先頭へ / gear を toolbar trailing へ (§5.2)** / `HomeViewModeTabs`(`:156-186`)・`HomeSemesterPicker`(`:188-256`) 削除 / `HomeChips.isVisible` 追加 / 外側 `ScrollView`(`:41`) 撤去 → `GeometryReader` で `HomeBody` に available を渡す / `ContextChips` 高 40→44 | P3 |
| `Features/Home/SelfTimetableView.swift` | 学期ピッカー(`:132-136`) と ⚙︎(`settingsButton :165-180`) を除去 / `showSettings` binding + `available: CGFloat` を受け取り `.settings` シートを開く / グリッド部を `ScrollView { TimetableGrid(available: available, …) }.scrollBounceBehavior(.basedOnSize)` に (available は HomeBody 経由で prop) | P3 |
| `Features/Home/SelfTodayCTA.swift` | **`NowNextBar.swift` に置換して削除** | P3 |
| `Features/Timetable/TimetableGridPhaseB.swift` | **§3.6.1/§3.6.2 マス描画 (§5.3.0): `EventTile` 背景を `opaqueTint` で不透明化(`:165`) / 左バー 3→2pt(`:135`) / テキスト上寄せ(`content` HStack `.top` + `body :128` frame `.topLeading`) / 空きセル罫線 `.overlay` 2 本削除(`:61-62`) / 外殻 stroke(`:32`)→`.atenderShadow(.card)`** + `available` / `todayDisplayDay` / `currentPeriodIndex` を受け取り `UIScreen.main`(`:17`) 除去 (§5.3.1) + 「今」の描画 | P3 |
| `Features/Calendar/PersonalCalendar.swift` | **§3.6.3 マス描画 (§5.5.0): `CalendarMonth` 外殻 → 白カード `Radius.lg`+shadow / セル罫線 `.overlay` 2 本削除(`:297-298`) / gap 1pt / 日セル `Radius.sm`+padding 2 / event chip を `opaqueTint` で不透明化(`:283`) / `prefix(3)`→`prefix(2)`(`:275,286`)** + `available` optional prop + 月グリッドの動的高 / today セル (`CalendarDayStyle`) / スワイプ / `content`(`:138-163`) を `ScrollView` 包み | P3 |
| `Core/DesignSystem/Color+Atender.swift` | **`Color.opaqueTint(hex:ratio:base:)` を末尾に additive 追加 (§5.3.0)。既存トークンは 1 つも触らない (§9.3)** | P3 |
| `Features/Rooms/RoomDetailView.swift` | **P2**: nav bar 復活 + `BackHeaderButton` 除去 (§4.3) + **溢れ止め = `RoomCalendar` / `RoomTimetable` に各 1 つ `ScrollView` を入れる (§4.7、★ FAB の `.overlay` は `ScrollView` の外)** + §4.2 の `:208` パディング。**P3**: **nav タイトル `:52` を `.navigationTitle("")` に置換 (§5.6・裁定1。本文 header の大タイトルと重複解消)** + `RoomTimetable`(`:369`) を `GeometryReader` 包みにして `available` を受け取り `:389` の `ScrollView`/`UIScreen.main`/`Space.roomTtChromeTop`/`Space.tabBarHeight` を撤去 (§5.3) + `CalendarMonth`(`:163`) はマス描画のみ波及 (available は渡さない)。`todayString` 置換は P1 済 | P2, P3 |
| `Features/{Settings,SemesterOverview,Rooms,Friends,Setup}/*` | **土台追従の最小改修のみ** — `Space.tabBarHeight` パディング除去 (§4.2) / `Font.atender(size:)` 変換 (§3.2) / `todayString` 置換 (§7.1) / `.navigationBarHidden` 除去 (§4.3) | P1, P2 |

### 触らないもの

- `apps/web` / `apps/api` / `packages/shared` — **1 ファイルも変更しない**
- `Atender/Info.plist` (生成物。`project.yml` が正典 — `gotcha/xcodegen-info-plist-regenerated-every-run.md`)
- version-management が新規追加する `Core/Version/` / `Features/Version/` / `Core/Networking/*`
- **コード中**の色の**値** (§9.3) — **`AccentColor.colorset` の是正 (§4.1) だけが例外**。`#F97316` の他 4 箇所 (科目・メンバー色) は**別系統なので触らない**
- `Atender/AtenderApp.swift` / `Features/Settings/SettingsView.swift` のテーマ設定 — **§4.6 撤回によりスコープ外**
- `AtenderUITests/ScreenshotFlow.swift` (§5.4 でラベルと identifier を保存するので無改修で動く)
