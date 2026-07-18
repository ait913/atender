# Atender — iOS 視覚言語 (DESIGN.md)

> **この文書の地位**: atender iOS ネイティブ版の**視覚言語の正典**。今後の全 UI 設計 (P3 以降) はこれを参照する。
> Muraki/CLAUDE.md 規約「PJ の DESIGN.md があればそちらが正典 (PJ 層 > 汎用層)」に基づき、汎用チェックリスト (`Muraki/knowledge/pattern/ui-ux-design-perspectives.md`) より本書が優先する。汎用層は「正しい (HIG 準拠)」を担保し、本書は「良い (Web と同等の品質)」を担保する。
>
> **これは視覚言語の定義であり、個別画面の実装フェーズ設計 (`.designs/*.md`) ではない。** 機能の増減・IA 変更・プロダクト判断はしない。矛盾があれば §9 で Leader に報告する。

## 目的

UI 刷新 P1/P2 で iOS は HIG 準拠 (SF Pro / semantic color / 標準部品) にはなったが、Web が持つ**視覚的な質 (丸み・余白・奥行き・ポップさ)** を失い「詰め詰めで10年前」になった。本書は Web の**視覚的性格を iOS ネイティブの語彙で再現する規則**を定め、Touri の個別不満を「その場の修正」でなく「再発しない設計原則」に変換する。**Web トークンの 1:1 移植はしない — 性格を移植する。**

---

## 1. Web の視覚的性格 (何を移植するか)

Web (`apps/web/src/styles.css` + 時間割/カレンダーコンポーネント) を実測した結果、「丸めでポップで綺麗」の実体は次の 4 つに要約できる。**これが移植対象**であり、色値やトークン名そのものではない。

| 性格 | Web での実体 (実測) | iOS での写し方 (方針) |
|---|---|---|
| **丸み (ポップ)** | card = radius 18–28px、時間割セル 8px、月カレンダー card 24px、chip 4px。角が大きく柔らかい | `RoundedRectangle(cornerRadius:)` を **`Radius` トークン (§3.1)** で。iOS の `Radius` は既に Web と同値 |
| **奥行き (綺麗)** | `--shadow-card` = 2 層ソフトシャドウ (`0 1px 3px /.08` + `0 4px 16px /.06`)。card が背景から浮く | `.atenderShadow(.card)` を面に敷く (§3.3)。iOS の `AtenderShadow.card` は既に Web と同値 |
| **余白 (呼吸)** | 4px グリッド + `--section-gap-mobile 16px` + card padding 12/16px。要素が窮屈でない | `Space` トークンで一貫適用 (§3.2)。「余白をケチらない」を原則化 |
| **多色のポップさ** | azure accent + 6 色ブランドリング (科目/ルーム色) を**面塗り (15–18% tint)** で使う | 科目色は tint 面 + solid 左バー (§3.5/§3.6)。中立は system semantic のまま |

### 1.1 ★ 核心の発見 — トークンは既に一致している。壊れているのは「適用」

iOS の `Radius.swift` / `Shadow.swift` / `Color+Atender.swift` は Web の値を**既に 1:1 で持っている** (radius 8/10/18/24/28、shadow-card 2 層、accent azure、6 色リング全て一致)。にもかかわらず「10年前」に見えるのは、**トークンの値でなく使い方が Web と違う**から:

- 時間割セルの背景を**透過**で描き (グリッド線が透けて見える)、Web は**不透明 tint** で描く
- グリッド線を**濃い罫線**で描き、Web は**8% の極薄罫線 or 1px gap** で描く
- セル内テキストを**中央寄せ**にし、Web は**上寄せ (`align="top"`)** にする
- ヘッダー / フォント段が**画面ごとにバラバラ**で、Web は同一スケールで統一されている
- 余白が**詰まって**おり、Web は section-gap 16px / card padding を一貫適用

→ **本書の原則は「新しいトークンを作る」ではなく「既存トークンの適用規則を固定する」。** Developer は新規に値を発明せず、本書の適用規則に従う。

---

## 2. iOS 現状の診断 (スクショ差分の言語化)

実機スクショ (iOS 26.5、実データ) を Web の描画ロジックと突き合わせた具体的差分。各行が §3 の原則の根拠になる。

| 画面 | iOS 現状 (スクショ) | Web (ソース実測) | 差の性質 |
|---|---|---|---|
| **時間割セル** (`01-home-timetable`, `E03-room-timetable`) | 科目名が**セルの縦中央**に配置。tint 面が**半透明**でマス目の罫線が透ける。空きセルにも罫線が回り**表組み (table)** に見える | `EventTile` = tint `color-mix(subject 15%, bg-elevated)` = **不透明**、`align="top"` = **上寄せ**、2px 左バー `rounded-full`、radius 8px、title 12px semibold `line-clamp-2`。空きセル = `bg-bg-base` **不透明**でページ地に溶ける | 透過 vs 不透明 / 中央 vs 上寄せ / 罫線が主役 vs 面が主役 |
| **月カレンダー** (`02-home-calendar`) | **全セルに灰色の枠**が回り、完全な**スプレッドシート**。密度が高く「10年前」 | `CalendarMonth` = `rounded-2xl bg-elevated shadow-card` の**白い丸カード**、セルは `gap-px` (1px 隙間・**枠なし**)、`rounded-sm` 日セル、日付**左上**、イベント chip は 18% tint の**不透明ピル** `rounded-4px` | 表組み罫線 vs 枠なし gap 分離。この画面が最も「10年前」の主因 |
| **学期カレンダー** (`C01-semester-overview`) | 出席カレンダーは各日が**枠付きボックス**。カード自体は白角丸 + 影で綺麗 (ここは Web に近い) | 同上 (`CalendarMonth` 系) | カード外殻は良い。内側の日セル枠が過剰 |
| **ヘッダー** (`01` vs `C01` vs `E02`) | **バラバラ**: Home = タイトル無し (switcher が最上部)。学期 = `largeTitle`「学期・科目」。ルーム詳細 = **カスタム丸 back + nav タイトル + さらに本文に大タイトル (重複) + 浮遊 gear** | — (iOS 規約統一が必要) | 見出しスケール・back・gear 配置が画面ごとに不統一 |
| **セグメント** (時間割/カレンダー) | pill 型 segmented。Home とルームで位置・体裁が微妙に違う | Web は `CalendarSegmented` で統一 | 体裁は近いが配置規約が未固定 |
| **タブバー** (全スクショ下部) | 浮遊ピル。アイコンがやや大きく、ラベルとアイコンの間隔が近い | — | Touri 名指し。§3.8 + §10 検証 |

---

## 3. 視覚言語の原則

各原則に **Web 実測値** と **iOS への写し方 (pt / トークン名)** を併記する。数値は Web と iOS 既存トークンから確定しており、Developer は発明しない。

### 3.1 角丸の階層 (Touri 不満: 「Web は丸めでポップ / iOS は10年前」)

Web の 8/10/18/24/28 を iOS の `Radius` トークン (既に同値) に対応させ、**役割で使い分ける**。

| 役割 | Radius トークン | 値 (pt) | 適用対象 |
|---|---|---|---|
| 時間割セル / 小 chip | `Radius.timetableCell` | 8 | 時間割イベントセル、カレンダー月セルのイベント chip |
| ピル / 小コントロール | `Radius.sm` | 10 | セグメント内タブ、丸バッジ、日セル (月カレンダー) |
| **カード (標準)** | `Radius.md` | 18 | 出席率カード、リスト行カード、フォーム面。**「ポップ」の主役** |
| 大カード / カレンダー外殻 | `Radius.lg` | 24 | 月カレンダーの白カード外殻、シート上端 |
| 特大 / hero 面 | `Radius.xl` | 28 | full-bleed hero カード (使用は限定) |
| 完全丸 | `Radius.full` | 9999 | switcher ピル、CTA ボタン、丸アイコンボタン、左バー |

**原則**: card は必ず `Radius.md` (18) 以上。**角丸なし (0) や 4–6pt の小角丸を card に使わない** (それが「10年前」の一因)。標準部品 (`List`/`Form`/`.sheet`) はシステムの角丸に従い、上書きしない。

### 3.2 余白と密度 (Touri 不満: 「変に詰め詰め」)

「詰め詰め」の逆を原則化する。**余白をケチらない。**

| 用途 | Space トークン | 値 (pt) | 規則 |
|---|---|---|---|
| 画面横マージン | `Space.pagePxMobile` | 16 | 全メイン画面の左右。System margin。full-width で端に貼らない |
| セクション間 | `Space.sectionGapMobile` | 16 | カード⇄カード、見出し⇄本文ブロック。**これを下回らない** |
| カード内 padding | `Space.cardPadding` / `cardPaddingLg` | 12 / 16 | 情報密度が高いカードは 12、余裕を見せるカードは 16 |
| 要素間 gap (行内) | `Space.s2` / `s3` | 8 / 12 | ラベル⇄値、アイコン⇄テキスト |
| 隔絶余白 (hero) | `Space.s6`+ | 24+ | 最優先要素 (出席率 %) を孤立させる余白 |

**原則**:
- グリッド (時間割/カレンダー) 以外では、隣接する情報ブロックの間隔が **16pt (`sectionGapMobile`) を下回らない**。
- タップターゲットは **44×44pt** 以上 (汎用層 §2 / HIG)。
- グリッドの内部密度 (§3.6) は例外的に詰めてよいが、**グリッド全体は card として `sectionGap` で周囲から離す**。

### 3.3 影と奥行き (Touri 不満: 「フラットで安っぽい」に直結)

Web の 2 層ソフトシャドウを iOS の `AtenderShadow.card` (既に Web と同値) で再現する。

- **浮くべき面は必ず影を持つ**: 出席率カード、月カレンダーの白カード、リスト行カード、FAB → `.atenderShadow(.card)`。
- light: `0 1px 3px rgba(15,23,42,.08)` + `0 4px 16px rgba(15,23,42,.06)` (§`Shadow.swift` 実装済)。dark: 同ファイルの dark 分岐。
- **フラットな塗り面 (影なし) を card に使わない。** 背景色との差だけで面を分けると「安っぽい」。
- **例外**: 標準部品由来の面 (`List insetGrouped` の行、`.sheet`、Liquid Glass の tab/nav bar) はシステムの奥行き表現に任せ、`.atenderShadow` を**重ねない** (二重影・Liquid Glass 干渉を防ぐ)。影を自前で敷くのは「システム部品でない自前カード面」だけ。

### 3.4 タイポの階層 (Touri 不満: 「フォントサイズの規格を統一して」)

**全メイン画面で同じ見出しスケールを使う**のが本節の核心。iOS built-in text style (Dynamic Type 対応、`Typography.swift` の `atender*` エイリアス) を役割に固定する。

| 役割 | text style (iOS) | atender エイリアス | 用途 |
|---|---|---|---|
| 画面タイトル | `.largeTitle` (34) → スクロールで inline | `atender5xl` | nav bar の large title (§3.7) |
| セクション大見出し / hero 数値 | `.title2` (22) / `.title` (28) | `atender2xl` / `atender3xl` | カード見出し、出席率 % の数値 |
| 強調行タイトル | `.headline` (17 semibold) | `atenderLg` | リスト行の主題、科目名 (詳細) |
| 本文 | `.body` (17) | `atenderBase` | 標準本文 |
| 副次情報 | `.footnote` (13) | `atenderSm` | メタ、日付、"期間 6/5〜8/28" |
| 最小キャプション | `.caption` / `.caption2` | `atenderXs` | 時間割セル内テキスト、カレンダー chip |

**原則**:
- **1 画面のサイズ段は 3 段まで** (汎用層 §1)。見出し / 本文 / 補助。
- **見出しスケールは画面をまたいで一貫**: 「セクション見出し」は全画面 `.title2` (または `.headline`)。ある画面で `.title2`、別画面で `.title3` と使い分けない。
- weight は Regular/Medium/Semibold/Bold のみ。Light/Thin 禁止 (汎用層 §1)。
- **数値の逸脱**: `atender5xl` は 44→34 (iOS text style に 44 の段がないため。既存 revamp doc §3.2 で確定済、踏襲)。hero 数値は `.largeTitle`/`.title` + `.bold` + `.monospacedDigit()` で表す。

### 3.5 色 — azure + 6 色リングの使いどころ

色の**値**は P1/P2 で確定済 (azure accent + 6 色ブランドリング + status 色)。**本書で値は変えない。** 使いどころだけ固定する。

- **中立 (背景/文字/罫線) = system semantic** (`Color.bgBase/textPrimary/borderSubtle` = `.systemGroupedBackground` 等)。これは維持 (規約)。
- **accent (azure) = primary action / 選択状態 / 出席率リングのみ** (汎用層 §3)。塗りボタンは 1 画面 1–2 個。文字でなく**背景**に accent。
- **6 色ブランドリング = 科目色 / ルームイベント色**。使い方は **tint 面 (15–18%) + solid 左バー or ドット** (§3.6)。科目色を「文字色」だけに使わない (色だけで情報を伝えない・汎用層 §3)。
- **status 色 (present/absent/…) = 出席状態バッジ / カレンダーの日状態**のみ。accent と混ぜない。
- **★ AccentColor asset の死に orange 是正 (revamp doc §4.1) が本書の前提。** native TabView / nav bar は asset catalog の `AccentColor` を引くため、azure に是正されていないと選択タブ・back chevron が orange で出る。本書で色を azure と定義する以上、この asset 是正が入っていることを前提とする (詳細は revamp doc §4.1、`Muraki/knowledge/gotcha` の該当ノート)。

### 3.6 ★ 時間割 / カレンダーのマスの描き方 (Touri 名指しの核心)

Touri の 3 つの名指し不満 —「背景が透過」「マス目の線が見える」「テキストが中央」— を Web の描画を正典に是正する。

#### 3.6.1 時間割セル (イベントあり)

Web `EventTile` (density=compact, align=top) の性格を iOS で再現:

| 属性 | Web 実測 | iOS 規則 |
|---|---|---|
| 背景 | `color-mix(in srgb, subject 15%, bg-elevated)` = **不透明** | 科目色を 15% で **不透明な elevated 面 (`Color.bgElevated`) に合成**。半透明で下地を透かさない。**「透過をやめる」** |
| 左バー | `absolute left-1 w-0.5 rounded-full`、solid 科目色 | 幅 **2pt**、`Radius.full`、solid 科目色の縦バー (セル左内側) |
| 角丸 | 8px | `Radius.timetableCell` (8) |
| テキスト配置 | `align="top"` = `items-start` = **上寄せ** | **上寄せ (`.top` / `VStack(alignment:.leading)` を上詰め)**。**「中央をやめて上に」** |
| タイトル | 12px semibold `line-clamp-2 leading-tight` | `.caption`/`.caption2` semibold、2 行まで、tight leading |
| 副題 (教室) | 10px、`color-mix(subject 70%, mixTarget)` | `.caption2`、科目色の濃色 (`eventMixTarget` 合成) |

#### 3.6.2 時間割の空きセルとグリッド線

| 属性 | Web 実測 | iOS 規則 |
|---|---|---|
| 空きセル背景 | `bg-bg-base` = **不透明**、ページ地に溶ける | `Color.bgBase` で**不透明**塗り。透かさない |
| グリッド線 | `border-border-subtle` = `rgba(15,23,42,0.08)` = **8% の極薄** | **`Color.borderSubtle` (= `.separator`) の極薄 hairline**、または **1px gap 分離**。**濃い罫線で表組みにしない。** |
| 外殻 | container `rounded-md overflow-hidden` | グリッド全体を `Radius.md` (18) の card として丸め、`overflow` をクリップ。周囲は `sectionGap` で離す |

**原則**: グリッドは「罫線が主役の表」でなく「**面が主役・線は最小**」。線を引くなら 8% hairline、可能なら gap 分離。

#### 3.6.3 月カレンダー (最も「10年前」だった画面)

Web `CalendarMonth` を正典に、**スプレッドシート枠を全廃**する:

| 属性 | Web 実測 | iOS 規則 |
|---|---|---|
| 外殻 | `rounded-2xl bg-elevated p-2 shadow-card` | `Radius.lg` (24) の白カード + `.atenderShadow(.card)` + 内 padding `Space.s2` (8) |
| セル分離 | `grid-cols-7 gap-px` = **1px の隙間のみ・枠なし** | **セル間 1pt gap のみ。各日セルに border を引かない。** |
| 日セル | `rounded-sm p-0.5 text-left`、border なし | `Radius.sm` (10)、内 padding 2pt、**枠なし** |
| 日付 | **左上**、選択時のみ accent 丸バッジ | **左上寄せ**。中央に置かない。選択日 = accent 丸背景、今日 = accent 文字色 |
| イベント chip | `color-mix(color 18%, bg-elevated)` 不透明ピル `rounded-[4px] truncate` 10px | 18% 不透明 tint ピル、`Radius.timetableCell` 近似 (4–8)、1 行 truncate、`.caption2` |
| 状態ドット | 日付右の 1.5px 丸、`dayStatusColor` | 日付脇の小ドット、status 色 |

**原則**: カレンダーは「白い丸カードの上に、枠のない日セルを gap で並べ、イベントは不透明 tint ピルで置く」。**日セルの個別枠 (table border) は引かない。** これが「詰め詰め10年前」を解く最大のレバー。

### 3.7 ヘッダー規格の統一 (Touri 不満: 「ヘッダーの規格を統一して」)

全画面で nav bar・タイトル・switcher・gear の配置を一貫させる。

#### 3.7.1 トップレベル 5 タブ (ホーム / 学期・科目 / ルーム / 友達 / 設定)

- **標準 nav bar + `.navigationBarTitleDisplayMode(.large)`**。large title = `.largeTitle` (34)、スクロールで inline に遷移 (現在地明示・汎用層 §4)。
- タイトル = そのタブの日本語名 (「ホーム」「学期・科目」「ルーム」「友達」「設定」)。**アプリ名をタイトルにしない** (汎用層 §4)。
- **本文に大タイトルを重複させない** (nav bar の large title が唯一のタイトル)。
- switcher ピル (自分/クラス) と segmented (時間割/カレンダー) は **nav bar の下・スクロールコンテンツの先頭**に、全画面同じ順序で置く。
- 画面固有アクション (gear = 時間割設定 等) は **toolbar trailing** に置く。本文中に浮遊させない。

> ★ **Touri 裁定 (2026-07-18)**: Home は現状タイトル無し (Web も `/` にタイトル無し) だが、**Home に large title「ホーム」を付与し、5 タブ全部を large title で揃える**。Web に無い要素の追加だが、iOS 慣習 + 他 4 タブとの一貫 + Touri の「ヘッダー統一」要望により採用。

#### 3.7.2 詳細画面 (ルーム詳細 / テンプレート / 科目詳細 / 日別詳細)

- **タイトルは 1 つだけ。重複を禁止** (現状 `RoomDetailView` は nav タイトルと本文 header で room 名を 2 回出す — §2 の診断)。
- **★ Touri 裁定 (2026-07-18)**: 重複は **nav bar タイトル (小) を消し、本文 header の大タイトルを残す**方向で解消する。
  - **nav bar は back button のみ** (`.navigationBarTitleDisplayMode(.inline)` + `.navigationTitle("")`、`BackHeaderButton` は revamp doc §4.3 で廃止済のシステム back)。nav にタイトル文言を出さない。
  - **本文 header の大タイトル (room 名) + 副題 (「みんなの予定共有」) + gear を、nav タイトルが消えて空いた分だけ上に詰める。** これが Touri の明示要望 (「小さい方を消して、大文字ルーム名と設定ボタンを上に押し込む」)。
  - **逸脱の明示**: これは「詳細画面は inline nav タイトル」という一般 iOS 慣習からの逸脱。理由は (a) room 名が長く content で大きく見せる価値がある (b) Touri の名指し要望。**プロミネントな content header を持つ詳細画面 (ルーム詳細等) はこのパターン**、header を持たない詳細画面 (テンプレート/科目詳細/日別詳細で content 側に大タイトルが無いもの) は inline nav タイトルを使う。
- switcher / segmented の配置規約はトップレベルと同一。

#### 3.7.3 セクション見出しと学期ピッカー

- 「2026 前期」等の**学期ピッカーは見出し (title) でなく subhead 級のコントロール**として扱う (`.footnote`/`.subheadline` + chevron)。Home と 学期・科目 で同じ体裁。
- カード内見出し (「今日までの出席率」等) は全画面 `.footnote` secondary で統一 (現状踏襲)。

### 3.8 タブバー (Liquid Glass) (Touri 名指し: アイコンが大きい・ラベルが近い)

- ターゲットは native `TabView` + `.tabItem`(`Label`) の Liquid Glass タブバー (revamp doc §4.1)。**アイコンは outline のまま** (5 個中一部だけ fill にすると混在。revamp doc F6 で確定、`calendar.fill` は SF Symbols に不在)。
- **アイコンの point size・ラベルとの間隔は native `TabView` ではシステム所有**であり、`.tabItem` から直接制御できる保証がない。Touri の「アイコン大きい・ラベル近い」を native の枠内で調整できるかは **未確認 → §10 で researcher 検証に回す**。**本書で「調整できる」と断定しない。**
- 検証結果が「native では不可」の場合の判断 (自前タブバー維持で微調整するか / システム値を受容するか) は Touri のプロダクト判断であり、本書では決めない (§9)。

---

## 4. 視覚階層の割当 (汎用層 §7-1)

代表画面での L0–L3 割当。size/weight/余白の段を対応させる。

**ホーム (時間割)**:
| 階層 | 要素 | 表現 |
|---|---|---|
| L0 (隔絶) | 出席 CTA (「今日は全出席」) | full-width 近い塗りボタン、`Radius.full`、画面下部 (親指域)、`.atenderShadow` |
| L1 | 時間割グリッド | card (`Radius.md` + shadow)、面が主役 (§3.6) |
| L2 | switcher / segmented | ピル、`Radius.full`/`.sm` |
| L3 (meta) | 「2026 前期」ピッカー、曜日/時限ラベル | `.footnote`/`.caption` secondary |

**学期・科目 (overview)**:
| 階層 | 要素 | 表現 |
|---|---|---|
| L0 | 出席率 % (hero 数値) | `.largeTitle`/`.title` bold monospacedDigit、周囲 24pt 余白で孤立 |
| L1 | 出席率カード / 月カレンダーカード | `Radius.md`/`lg` + shadow |
| L2 | 未記録アラート (`未記録7件`) | tint 面 (tardy/warn 色) + `Radius.sm` |
| L3 | 「期間 6/5〜8/28」、凡例 | `.footnote` secondary |

---

## 5. 状態の網羅 (汎用層 §7-4)

視覚言語として全画面共通で守る状態表現 (個別画面の実装 doc がここを具体化する):

- **empty**: `ContentUnavailableView`。マスコット資産 (`Image("mascot-hello")`) を custom icon に渡す (資産を捨てない。revamp doc の方針踏襲)。主要タスクへの導線 (Create) を含める。
- **loading**: `.redacted(reason: .placeholder)` によるスケルトン。Web の `Skeleton`/`TimetableGridSkeleton` と同じ「枠だけ先に見せる」性格。
- **error**: 再試行導線付きの軽量メッセージ面。
- **権限なし / 空タブ**: タブを隠さず理由を示す (汎用層 §4)。

---

## 6. アクセシビリティ最低線 (汎用層 §7-5)

- タップターゲット 44×44pt。時間割セル/カレンダー日セルも tap 領域 44pt を確保 (視覚サイズが小さくても hit area を拡張)。
- コントラスト: 本文 4.5:1、大文字/Bold 3:1、非テキスト UI (罫線/選択リング) 3:1。tint 面 (15–18%) 上のテキストは `textPrimary` で 4.5:1 を満たす (Web と同構成)。
- Dynamic Type 200% 拡大耐性: built-in text style 使用で自動対応。時間割セルは `line-clamp`/truncate で崩れない。
- dark 対応: OS 追従 (`prefers-color-scheme` 相当)。手動トグルは既存の theme 設定に従う (本書で新設しない)。

---

## 7. トレーサビリティ — Touri の 8 不満 → 設計原則

P3 の Developer が本書だけで全不満を説明できることを確認する表。

| # | Touri の不満 (生の言葉) | 対応する原則 | 検証可能な帰結 |
|---|---|---|---|
| 1 | 時間割/カレンダーのマスの背景が**透過** | §3.6.1 / §3.6.2 (不透明 tint / 不透明空きセル) | セル背景に alpha 透過を使わない。下地の罫線が透けない |
| 2 | **マス目の線が見えてる** | §3.6.2 / §3.6.3 (8% hairline or gap、月カレンダーは枠全廃) | 月カレンダー日セルに border が無い。時間割の線は 8% 以下 |
| 3 | テキストが**中央に来てる** → 上にして | §3.6.1 (align top) | 時間割セルのテキストが上寄せ |
| 4 | 時間割カレンダーの**デザイン自体が微妙** | §3.1/§3.3/§3.6 (丸み + 影 + 面主役) | グリッドが card 化 (radius 18 + shadow) |
| 5 | iOS が**詰め詰めで10年前** | §3.2 (余白) / §3.6.3 (枠全廃) | section-gap 16pt 遵守、スプレッドシート枠廃止 |
| 6 | タブのアイコンが**でかい** | §3.8 + §10 (researcher 検証) | native の調整可否を確認後に決定 |
| 7 | タブの**文字とアイコンの距離が近い** | §3.8 + §10 (researcher 検証) | 同上 |
| 8 | ヘッダー/フォントサイズの**規格を統一** | §3.4 (タイポ段の画面横断統一) / §3.7 (ヘッダー規格) | 全画面同一見出しスケール、nav bar 規約統一、大タイトル重複排除 |

**#6/#7 は本書だけでは完結しない** (native の調整可否が未確認)。それ以外の 6 件は本書の原則で完全に説明可能。

---

## 8. 不採用案

- **Web トークンを pt に 1:1 移植する**: 却下。中立色/書体は system semantic/built-in text style に明け渡す規約 (CLAUDE.md) に反し、Liquid Glass と干渉する。移植するのは**性格 (丸み/余白/奥行き/密度/配置)** であって値の全量ではない。
- **新しい radius/shadow/color トークンを追加定義する**: 却下。iOS の既存トークンは既に Web と同値 (§1.1)。問題は値でなく適用。新設は正典を二重化する。
- **時間割/カレンダーを自前で凝ったグラフィックにする**: 却下。Web の描画ロジック (不透明 tint + 左バー + 上寄せ + 枠なし gap) が既に「綺麗」の実体。これを iOS 語彙で忠実に写すのが最短。独自の見た目を発明しない。
- **タブアイコン/ラベル間隔を本書で「こう調整する」と確定する**: 却下 (保留)。native `TabView` の制御可否が未確認。憶測で pt を書くと Developer が実装で詰まる。§10 の researcher 検証後に確定する。
- **ヘッダー統一のため Home を含む全画面から大タイトルを排し switcher 起点に揃える**: 不採用寄り (要 Touri 判断)。iOS 慣習では large title 付与が自然。§9 で Leader に上げる。

---

## 9. ★ 既存設計doc (`.designs/20260717-ios-ui-revamp.md`) との矛盾 — Leader 判断へ

本書執筆中に検出した、revamp doc の現行記述と本書の視覚原則が食い違う点。**3 件とも Touri 裁定済 (2026-07-18)。P3 設計doc 更新時に revamp doc へ反映すること。**

1. **ルーム詳細のタイトル重複** — ✅ **裁定済**: **nav タイトルを付けず、本文 header の大タイトルを残して上に詰める** (§3.7.2)。revamp doc §4.3 が `RoomDetailView` に足そうとしている `.navigationTitle(room名)` は**入れない** (nav は back のみ)。revamp doc §4.3 の該当記述を P3 で書き換える。

2. **Home の large title 付与** — ✅ **裁定済**: **付与する**。5 タブ全部を large title で統一 (§3.7.1)。revamp doc §5.1 の Home toolbar にタイトル「ホーム」を確定。

3. **時間割/カレンダーの視覚原則が revamp doc P3 (§5.3) に不在**: revamp doc §5.3 は `TimetableGridPhaseB` の**フォントトークン置換**しか扱っておらず、セル背景の透過/罫線/テキスト配置 (Touri の核心不満) に**言及がない**。矛盾ではないが**欠落**。→ **P3 の §5.3 実装は本書 §3.6 を適用規則として併せ持つ**必要がある。Leader は P3 設計doc更新時に §3.6 を必須参照に含めること。

---

## 10. ★ 要 researcher 検証 (Leader に差し戻す)

本書で憶測を避け、実在確認が要る点:

1. **native `TabView` + `.tabItem`(`Label`) で、iOS 26 Liquid Glass タブバーのアイコン point size / ラベルとアイコンの間隔を制御できるか** (Touri 不満 #6/#7)。
   - 制御 API が存在するか (`.tabItem` の Label に対する font/imageScale、UITabBarAppearance、`.symbolVariant`/`.imageScale` の効き方等)。
   - 制御できない場合、self-drawn タブバー維持で微調整する選択肢の是非 (規約は標準部品回帰を推奨、干渉リスクあり)。
   - **判定基準**: 「native の枠内でアイコンを小さく/ラベルを離せるか」が Yes/No で返ること。No なら Touri のプロダクト判断へ (§9)。

2. (補助) iOS 26 Liquid Glass の nav bar / tab bar が `AccentColor` asset を引く挙動は revamp doc §4.1 で実測済。本書はそれを前提とするのみで再調査不要。

---

## 参照

- Web 正典: `apps/web/src/styles.css`、`components/timetable/{TimetableView,EmptyCell}.tsx`、`components/event-tile/EventTile.tsx`、`components/rooms/calendar/CalendarMonth.tsx`、`components/home/{SelfTimetableView,PersonalCalendar}.tsx`
- iOS トークン: `apps/ios/Atender/Core/DesignSystem/{Radius,Shadow,Space,Typography,Color+Atender,Glass}.swift`
- 汎用層: `Muraki/knowledge/pattern/ui-ux-design-perspectives.md`
- 既存設計: `.designs/20260717-ios-ui-revamp.md`
</content>
</invoke>
