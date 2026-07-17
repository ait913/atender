---
title: iOS UI 刷新 — 事前リサーチの確定事実と、やることリスト
category: pattern
project: atender
tags: [ios, ui, liquid-glass, design, version-management]
created: 2026-07-17
sources:
  - Researcher 4本 (2026-07-17, session 8fc8aad2) — Liquid Glass / 現状UI棚卸し / TimeTree / バージョン管理
  - Muraki/knowledge/library/swiftui-liquid-glass-ios26.md
  - Muraki/knowledge/library/ios-glanceable-surfaces-availability.md
  - Muraki/knowledge/gotcha/xcodegen-info-plist-regenerated-every-run.md
---

## Context

Touri の要望 (2026-07-17):

> 現状廉価Webアプリみたいなデザイン。タブとか Apple の部品 (ガラスのやつ) を使えるやつはどんどん使って欲しい。
> 一番は「シンプルな操作と情報認知を実現する UI/UX 設計」「スムースな操作」。
> メイン機能は「時間割」と「カレンダー」だから、ホームはとにかくこれを大きく出したい。
> ユースケース: 投稿しながら・教室移動しながら次の授業のコマを確認 / 友達と会話しながらみんなの時間割を確認。
> 学生が合間合間に使うアプリ。情報量多いと使われなくなる。
> Web版は一旦現状で放置。今後 Web と iOS で仕様が隔離していくこともあるから、
> Web/iOS/バックエンドのバージョンと対応関係も管理したい。

**スコープ確認済**: ホーム + 時間割/カレンダー優先 (デザインシステム土台 + ホーム・時間割・カレンダーを作り込む。
学期・ルーム・友達・設定は土台に追従する最小改修のみ)。

**設計 doc は未着手** (Architect 未召集)。本書は Architect に渡す材料。

## What — 確定事実

### ★ 1. deployment target は 17 据え置き。26 に上げない

**Liquid Glass の自動適用は deployment target でなく「リンクした SDK」で決まる** (実証済)。
同一コードを target 17 と 26 でビルドし iOS 26.5 シミュレータで実行 → **スクショがピクセル一致**
(差分 800px / 299万px = 0.027%)。Apple 一次ソースも `UIDesignRequiresCompatibility` の条件を
"apps **linking against the latest SDKs**" と記述。

→ **Atender は既に SDK 26.5 リンク + 互換キー不在 = 今日すでに iOS 26 端末で Glass が出る状態。**
出ていないのは**標準部品を避けているから**。Apple 公式が「tab bars / toolbars の自前背景は
Liquid Glass と干渉する」と名指しで警告している。

- target 26 に上げると **iPhone install base の 21% を失う** (Apple 公式 2026-06 実測: iOS 26=79% / 18=14% / それ以前=7%)。
  得るのは `if #available` シムの削除だけ
- iOS 26 非対応機: iPhone XR / XS / XS Max (A12) を恒久喪失
- **構造的な崖は 26 でなく 18** — `Tab(value:role:)` / `TabRole.search` / `.tabViewStyle(.sidebarAdaptable)` は **iOS 18.0+**。
  `.tabBarMinimizeBehavior` / `.tabViewBottomAccessory` が iOS 26.0+
- 旧 `.tabItem` API でもガラスタブバーは出る (実測)。急ぐ理由なし
- 詳細な API 表: `Muraki/knowledge/library/swiftui-liquid-glass-ios26.md`

### ★ 2. 最大の欠落は「今」がないこと

`Features/` 全体で `isToday` / `currentPeriod` / `nextClass` が **grep 0 件**。
`TimetableGridPhaseB.swift` は曜日ラベルを固定配列で描くだけで、**今日の列も現在のコマもハイライトしない**。

→ **主ユースケース「次の授業のコマを確認」はそもそも未実装。**
データは `OccurrenceDto` (startMinute/periodIndex) に既にあり、不足は表示ロジックだけ。**最大の勝ち筋**。

### ★ 3.「TimeTree 参考に」は既に達成済み

TimeTree は 2026-01 のリニューアルで「カレンダー中心」→「個人を軸に複数カレンダーを俯瞰 +
ホーム上部にフィルタ」へ移行。`HomeCore.swift` の `ContextChips` + `HomeViewModeTabs` は**まさにそれ**。
素直に寄せると「現状維持」が結論になる。

**不満の正体は構造でなく (a) 次の授業が分からない (b) クロームが画面の 41% を占めること。**

参考: TimeTree のボトムナビは **3項目** (Atender は 5)。ただし HIG に固定上限は無い (「3-5」は慣習値)。

### ★ 4. 「廉価Webアプリ感」の物理的実体 = px→pt の 1:1 移植

Web の Tailwind 値をそのまま pt にした結果、**全部が 1 段小さい**:

| | 現状 | HIG / iOS 標準 |
|---|---|---|
| タップ領域 | 40 / 38 / 36 / 34 / 30pt が散在 | **44pt** 以上 |
| 本文 (`atenderBase`) | **14pt** | **17pt** |
| 実使用の最小フォント | **8pt** (時間割の開始時刻 `TimetableGridPhaseB.swift:177`)、**9pt** (月セルのイベント名 `PersonalCalendar.swift:277`) | **11pt** |
| ページ余白 (`pagePxMobile`) | 12 | 16 |

44pt を満たすのは `monthButton`(44) / CTA 主ボタン(48) / `AuthProviderButton`(44) / タブ項目(48) のみ。

### ★ 5. ネイティブ部品の再発明 (使用 0 箇所のものばかり)

| 現状の自前実装 | file | 標準代替 |
|---|---|---|
| `BottomTabBar` (HStack+Button, `.ultraThinMaterial`) | `App/BottomTabBar.swift` | **`TabView`** ← Glass が効かない元凶 |
| `MainTabView` の `Group`+`switch` | `App/MainTabView.swift:39` | `TabView` の selection |
| `HomeViewModeTabs` (時間割\|カレンダー) | `HomeCore.swift:157` | `Picker(.segmented)` |
| `HomeSemesterPicker` (Button + 自前 BottomSheet) | `HomeCore.swift:187` | `Menu` |
| `EmptyState` | `Components/EmptyState.swift` | **`ContentUnavailableView`** (iOS 17+、使用 0) |
| `SettingsSection`/`SettingsRow` | `Features/Settings/SettingsSection.swift` | `List(.insetGrouped)` + `Section` (`List` 使用 0) |
| `AuthProviderButton(.apple)` | `Components/AuthProviderButton.swift` | **`SignInWithAppleButton`** (使用 0) |
| `Skeleton` | `Components/Skeleton.swift` | `.redacted(.placeholder)` (使用 0) |
| `LabeledInput` | `Components/LabeledInput.swift` | `Form` + `TextField` (`Form`/`GroupBox` 使用 0) |
| `BottomSheet` と `SheetScaffold` | 両方 | **ほぼ逐語のコピーが2本**存在 (11箇所 vs 10箇所、使い分けの規則性なし) |
| `Chip` / `StatusDot` | | **死にコード** (参照 0) |

- **全 5 タブが `.navigationBarHidden(true)`** — NavigationStack を張っておきながら nav bar を隠している
- `UIScreen.main` を **4 箇所**使用 → **iOS 26 で deprecated** (`TimetableGridPhaseB.swift:17`, `SelfTodayCTA.swift:165`, `BottomSheet.swift:37`, `RoomDetailView.swift:386`)

### ★ 6. `BackHeaderButton` の存在理由は config バグ

`Atender.xcodeproj/project.pbxproj` → `developmentRegion = en`、ビルド済 Info.plist も
`CFBundleDevelopmentRegion = **en**` (実測)。`.lproj` はリポジトリに 0 個。

**UI 文字列は全部ベタ書き日本語なのに、バンドルは「英語アプリ」として出荷されている。**
だから system back が "Back" になり、それを避けるため `BackHeaderButton` が自作された。

→ **`ja` を development language にすれば標準 back が「戻る」になり、この自前部品と
`.toolbar(.hidden)` の連鎖が解ける。** ネイティブ回帰の障害が 1 つ自動で消える。
`SignInWithAppleButton` を避けた理由も同根の可能性 (未確認)。

### ★ 7. ホームのクロームが画面の 41%

`Space.selfTtChrome = 352` (`Space.swift:32`)。グリッド高 = `max(320, 画面高 - 352)`。
iPhone 16 (852pt) で本体 500pt / クローム 352pt。**iPhone SE (667pt) では 320pt に clamp されて溢れる**。

積み上げ (時間割モード):
1. `ContextChips` 40pt — ルーム 0 個のユーザーにも常に `[自分][+]` が出る
2. `HomeViewModeTabs` 42pt
3. `HomeSemesterPicker` 36pt — **親子2経路に二重定義** (`HomeCore.swift:51` と `SelfTimetableView.swift:132`)
4. `TimetableGrid` ← 本体
5. `SelfTodayCTA` 下端固定 ~162pt (展開すると画面の 36% を覆う)
6. `BottomTabBar` 64+34pt

### ★ 8. スムースさの欠落は計測可能

`Atender/` 配下の grep 実測:
- **haptics: 0 箇所** (`.sensoryFeedback` / `UIImpactFeedbackGenerator` 等すべて) ← ワンタッチ出欠がコア機能なのに
- **ジェスチャ: 0 箇所** (`DragGesture` / `swipeActions` 等) ← カレンダーの月送りにスワイプ無し、週スワイプ無し
- **遷移アニメ: 0 箇所** (`matchedGeometryEffect` / `contentTransition` / `.symbolEffect`)
  → タブ・モード・コンテキスト切替・月送り・CTA 展開が**全部瞬間差し替え**
- `.refreshable`: 1 箇所のみ (`SemesterOverviewView.swift:80`)

Web に無いから移植されなかった = 移植の必然。`.sensoryFeedback` は iOS 17 で入る。

### ★ 9. Inter は日本語に効いていない

`Typography.swift:5` は `Font.custom("Inter-*")` のみ。**Inter に日本語グリフは無い**ので
日本語は Hiragino にフォールバック。**Inter が効いているのは数字と英字だけ。**
`NotoSansJP-VariableFont_wght.ttf` は `Info.plist` / `project.yml` に登録されているが
**コードから一度も参照されていない** = 完全な死荷重。

### ★ 10. 「一瞥」の本命はウィジェット (Live Activity ではない)

- `Button(intent:)` = インタラクティブウィジェット は **iOS 17.0** で素で使える
- 競合 **Penmark が既にウィジェット出席登録を実装済** (App Store 説明文に明記) = 学生の期待値
- **HIG は Live Activity を「a few hours」の有界な進行中タスク向けと定義**。「終日ずっと次の授業を出す」は設計意図から外れる
- 詳細: `Muraki/knowledge/library/ios-glanceable-surfaces-availability.md`

### ★ 11. バージョン管理は要望より小さくて済む

**非対称性が鍵**: Web と API は**同一 commit から同時デプロイ** (両 Coolify app が `ait913/atender` の
main HEAD からビルドしているのを実測)。ズレても reload で自己修復。**iOS だけ TestFlight ビルドが
端末に無期限に residual する。**

→ **管理すべきは API × iOS build の 1 次元だけ。3成果物 × 3 の表は最初から不要。**

現状の実測: git tag **0 個** / CI **無し** (`.github/` 自体が無い) / `/healthz` は版数を返さない /
`/v1` prefix 無し / iOS 側に版数意識ゼロ (`CFBundleVersion` 読み取りも互換チェックも 0 箇所)。

推奨 (最小構成):
1. `project.yml` を iOS 版数の唯一正典と宣言 (下記 ★12)
2. **iOS が毎リクエストに `X-Atender-Client: ios/<build>` を送る** ← **唯一「今やらないと後で不可能」**。
   既に端末に入っているビルドにヘッダは後付けできない
3. `GET /version` → `{ commit: SOURCE_COMMIT, minIOSBuild, latestIOSBuild }`。
   **Coolify は `SOURCE_COMMIT` をランタイム env に default で注入するのでインフラ変更ゼロ**
4. `MIN_IOS_BUILD` を API の定数 1 個で持つ ← **これが compat matrix の実体**
5. iOS 起動時に `/version` を見て `build < minIOSBuild` なら更新催促のブロッキング画面

**採番は手動のまま。自動化するのは「事実の申告」だけ** (commit SHA の露出 / client 版数の送信 / 起動時チェック)。

**不採用** (設計 doc の「不採用案」に使う):
- `/v1` URL prefix — 外部コンシューマがいて移行を強制できない時の道具。client は 2 つとも自分のもの
- changesets / semantic-release / release-please — 全パッケージ `private: true` で publish 先も changelog 読者もゼロ。
  CFBundleVersion は semver ですらない。CI が 1 つも無いリポジトリに Actions + conventional commits を入れて整数 1 個を上げることになる
- API/Web に semver — 読む consumer が存在しない。版数は既に `SOURCE_COMMIT` として存在
- Firebase Remote Config — 整数 1 個のために SDK + Google 依存
- Markdown の compat matrix 表 — 間違っても何も壊れないので腐ったことに誰も気付けない
- Siren — App Store の公開版数しか見ず「この build は今の API と喋れるか」に答えない

**★ ただし本命の穴は版数ではない**: `Core/Models/DTOs.swift` = **953 行の手書き Swift DTO** が
Zod schema を鏡写ししていて codegen も契約テストも 0。API が field 名を変えても
**iOS はビルドもテストも通り、実機の decode で初めて落ちる**。**版数を付けてもこの drift は検出できない。**
別テーマとして扱う (最小案: shared の Zod から生成した JSON fixture を Swift の `Codable` decode テストに食わせる契約テスト)。

### ★ 12. 手順書のバグ 2 件 (設計を待たず直せる)

1. **CLAUDE.md の「`Atender/Info.plist` の `CFBundleVersion` をインクリメント」は誤り。**
   XcodeGen は Info.plist を毎回生成する ("Plists are created on disk on every generation of the project")
   ので、必須手順の `xcodegen generate` が手編集を黙って巻き戻す。**正典は `project.yml` 一択。**
   詳細: `Muraki/knowledge/gotcha/xcodegen-info-plist-regenerated-every-run.md`
2. `CFBundleDevelopmentRegion = en` (上記 ★6)

## テストのベースライン

**commit `3078d66` / iPhone 16 (iOS 18.2) で 174 tests, 0 failures を実測** (2026-07-17)。
台帳 `.knowledge/known-failures.md` の「174 GREEN / 0 RED」と一致。

### 刷新で意図的に壊れる 9 件 (設計 doc に明記すること)

- `DesignTokenTests.swift:7` — **`Space.selfTtChrome == 352`**, `Space.tabBarHeight == 64` を assert。**ホームのレイアウトを変えた瞬間に赤**
- `NavigationTests.swift:7` — `MainTab.allCases.count == 5` + 5 タブのラベルと SF Symbol 名
- `TypographyRegistrationTests.swift:7,34` — `Inter-*` 5 種の登録 + `UIAppFonts` に 7 ファイル実在
- `HomeChipsTests.swift` (3 本) — `HomeChips.items(rooms:)` が `[self, ...rooms]` を返し先頭ラベルが `"自分"`

### ★ 見落とすと事故る 5 件 — 「ロジックテスト」の顔をした色結合

台帳にこの類型で焼かれた実績あり (`315d542` のリブランドが本番の色だけ変えテストを置き去りにした)。**同じ地雷が今も埋まっている**:

| テスト | ベタ書きされている値 |
|---|---|
| `MeetingExpansionTests.testOutputWithinPalette` | パレット 6 色の hex `#12B172,#56D8C3,#568CFC,#A978FA,#FC6ABF,#FD728E` |
| `SelfTimetableViewModelTests.testEventInputsColorFallbackWhenCourseMissing` | `#1E96E6` |
| `RoomLogicTests` (3 本) | `#38bdf8` / `#94a3b8` / `#F97316` |

**正しい書き方の実例** (刷新後はこの流儀を踏襲): `CalendarEventDisplayTests` / `SemesterOverviewDisplayLogicTests` は
`Color.statusPresent` などトークン名で比較しており hex に依存しない。

### 検証ハーネス

`AtenderUITests/ScreenshotFlow.swift` (215 行) が token 注入で全画面/全モーダルのスクショを
attachment 化する。**刷新の before/after 比較にそのまま使える**。手順は `projects/atender/CLAUDE.md`。

## ★ 未解決のバグ (UI 刷新と分離して先に潰す)

> ホームからもルームタブからもグループの時間割とカレンダーが見れない (Touri 報告 2026-07-17)

**未解明。** ローカル API が起動せず本番経路プローブに到達できなかった (原因は環境: 下記)。

両経路 (ホームのルームチップ / ルームタブ → `RoomDetailView`) は同じ `RoomTimetable` / `RoomCalendar`
(`Features/Rooms/RoomDetailView.swift:122,367`) を描くので、共通原因は `load()` か API 側。
`RoomTimetable.load()` は**全例外を `catch { loadError = true }` で潰す**ので、画面表示で切り分けられる:

| 表示 | 意味 |
|---|---|
| 「時間割を読み込めませんでした」 | API エラー (403/404/decode 失敗) |
| 「メンバーの時間割がまだありません」 | API は通り events が空 |
| 「メンバーがいません」 | `week.members` が空 |
| 灰色の箱 / 真っ白 | ローディング固着 or 高さ 0 |

**関連する既知の API 実装バグ** (`.knowledge/known-failures.md` の裁定待ち 8 件のうち):
- **A1**: 非メンバーの `GET /api/rooms/:id` が設計の 404 でなく **403** を返す
- **A6/A7**: `zValidator` が raw ZodError を素通しし `ErrorResponse` 契約を破る → クライアントが実エラーを握り潰す

## やること (順序は Touri 指定)

### 0. 環境復旧 — ✅ 完了 (2026-07-17 検証済)

`~/Documents` が iCloud 同期対象で node_modules 等が evict されており、API 起動・ビルド・テストが
無言でハングしていた。**`known-failures.md` の「harness の癖」9 ヶ月分は全部これが原因。**
同期 OFF → node_modules 全削除 (660,606 ファイル) → Finder でローカルへ移動、まで完了。

検証結果 (2026-07-17):
- iCloud 側 `Documents` は空 (残骸は `.DS_Store` のみ)、`FXICloudDriveDocuments = 0` で同期 OFF
- `pnpm install` → **3.7s で完了** (以前は無言ハング。evict 原因の裏付け)
- `better-sqlite3` は node v25.9.0 でも native module ロード OK (ABI 問題なし。CLAUDE.md 記載の Node 20 前提から乖離しているが実害なし)
- API 起動 → `GET /healthz` → `{"ok":true,"db":true}`

**判明した恒久的な穴**: postinstall フックが無いため、node_modules 作り直し後は `prisma generate` が別途必要。
忘れると `SyntaxError: @prisma/client does not provide an export named 'PrismaClient'` が出る —
**コードのバグに見えるが未生成なだけ**。CLAUDE.md「主要ワークフロー」に手順として追記済。

### 1. バグ修正 — ルームの時間割/カレンダーが見えない

シミュレータで再現 → 表示内容で切り分け → 修正。**UI 刷新と分離して先に**
(刷新でホーム周辺を大きく触るので、バグを抱えたまま被せると原因帰属が絡まる)。

### 2. バージョン実装

上記 ★11 の最小構成。**`X-Atender-Client` ヘッダだけは後付け不能なので必ず入れる。**

### 3. UI 改善

Researcher の材料は本書で揃っている。**Architect 召集 → 設計 doc → ユーザー承認ゲート**の順。

優先順 (効果 / コスト):
1. **「今」の実装** — 今日の列 + 現在コマのハイライト + 「次の授業」の常設表示。データは既にある
2. **デザイントークンを HIG 基準へ引き直す** — 本文 17 / 最小 11 / タップ 44。個別画面より先にここ
3. **`BottomTabBar` 廃止 → native `TabView`** — Glass もタブバー最小化もここで一気に効く
4. **`ja` ローカライズ設定** — `BackHeaderButton` と `.toolbar(.hidden)` の連鎖が解ける
5. **`selfTtChrome = 352` を削る** — 上 3 段のコントロールを統合・遅延開示
6. **`AmbientBackground` を外す** — 放射グラデ + blur は Web の手法。Glass は背後の実コンテンツを屈折させて成立するので濁る
7. **haptics / ジェスチャ / 遷移アニメを入れる** — `.sensoryFeedback` は iOS 17 で入る
8. 標準部品への回帰 (`ContentUnavailableView` / `List` / `SignInWithAppleButton` / `.redacted`)
9. `UIScreen.main` 4 箇所の始末 (iOS 26 deprecated)
10. ウィジェット (`Button(intent:)`) — 「移動中・数秒」の本命

## Why

「廉価Webアプリみたい」の原因は**プロジェクト規約そのもの**だった。

## ★ 規約の撤回が必要 (承認ゲートで正式化)

`projects/atender/CLAUDE.md` の現規約:

> **iOS は Web の忠実移植**。スマホ独自の簡略化・IA 改変・タブ構成の再発明を**しない**
> デザインは `apps/web/src/styles.css` のトークン (light/dark) を **1:1 で移植。スマホ用に色・余白・角丸を変えない**

**今回の要望はこの規約の全面撤回にあたる。** Liquid Glass 採用 = 色・余白・角丸をシステムに明け渡すこと。
「1:1 移植」と「ネイティブ部品積極採用」は両立しない。Researcher 3 人が独立に同じ指摘をした。

**設計 doc 確定時に CLAUDE.md を置換すること** (追記でなく置換。Muraki「仕様マークダウンの編集規律」)。

なお **タブ 5 項目の IA は変えなくてよい** — ホーム/学期・科目/ルーム/友達/設定 のまま native TabView に載る。
`ContextChips` (自分/ルーム切替) も**発想は正しい** (「友達と会話しながらみんなの時間割」に直接対応)。
変えるべきは chrome の厚みと質感であって IA ではない。

## How to apply

Architect 召集時にこのファイルを渡す。Researcher の再召集は不要 (材料は揃っている)。
設計 doc に必ず含める:
- 上記「壊れるテスト 9 件 + 色結合 5 件」を**意図的に壊す**と明記 → Reviewer が新設計から再生成する前提
- 書体方針の決定 (SF Pro に寄せる / Noto を実際に使う / Inter を数字専用に限定) — `TypographyRegistrationTests` 2 本が直結
- `if #available(iOS 26, *)` シムの置き場所 (target 17 のまま Glass 専用 API を隔離)
