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
| **丸み (ポップ)** | card = radius 18–28px、時間割セル 8px、chip 4px。角が大きく柔らかい | `RoundedRectangle(cornerRadius:)` を **`Radius` トークン (§3.1)** で。月カレンダー外殻もカードとして `Radius.lg` (§3.6.3) |
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
| **月カレンダー** (`02-home-calendar`) | **全セルに灰色の枠**が回り、完全な**スプレッドシート**。密度が高く「10年前」 | `CalendarMonth` = カード外殻 (`Radius.lg` + shadow) の中に TimeTree 風 hairline、日付**左上**、イベント chip は不透明 tint の細バー `rounded-4px` | **濃い罫線 + 全セルの枠**が問題であって「線があること」ではない。★ **是正の方向は build 17 (2026-07-30) で確定: 罫線全廃ではなく「時間割グリッドと同じ 1pt `borderSubtle` の内側罫線 + `bgMuted` の曜日ヘッダー帯」** (§3.6.3)。中間期の「罫線全廃 + gap 分離」裁定は撤回済 |
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
| 大カード / シート上端 | `Radius.lg` | 24 | 大きな情報面、シート上端、**月カレンダー外殻** (§3.6.3) |
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
- グリッドの内部密度 (§3.6) は例外的に詰めてよいが、**月カレンダー (§3.6.3) を含むグリッド全体は card として `sectionGap` で周囲から離す**。
- **例外 (7 列グリッドを内包するカード)**: **学期の出席カレンダー (§3.6.4)** の**横** padding は `Space.s2` (8) + grid spacing 3。理由は §6 の 44×44pt タップ規定で、横 16pt だと 375pt 端末 (SE3 / 13 mini) の日セルが 44pt を満たせないため (縦は 16pt 維持)。カード内の非グリッド要素 (月ヘッダー・凡例など) は内側で +8pt して実効 16pt を保つ。
  - **月カレンダー (§3.6.3) はこの例外に含まれない** (2026-07-30 build 17)。グリッドがカードの縁まで届く (内側 padding **0**) ので、日セル幅 = (画面幅 − 32) ÷ 7 = **49.0pt** (375pt 端末) となり、例外なしで 44pt を満たす。罫線は `.overlay` で描きレイアウト幅を消費しない。

### 3.3 影と奥行き (Touri 不満: 「フラットで安っぽい」に直結)

Web の 2 層ソフトシャドウを iOS の `AtenderShadow.card` (既に Web と同値) で再現する。

- **浮くべき面は必ず影を持つ**: 出席率カード、リスト行カード、月カレンダー外殻 (§3.6.3)、FAB → `.atenderShadow(.card)`。
- light: `0 1px 3px rgba(15,23,42,.08)` + `0 4px 16px rgba(15,23,42,.06)` (§`Shadow.swift` 実装済)。dark: 同ファイルの dark 分岐。
- **フラットな塗り面 (影なし) を card に使わない。** 背景色との差だけで面を分けると「安っぽい」。
- **例外**: 標準部品由来の面 (`List insetGrouped` の行、`.sheet`、Liquid Glass の tab/nav bar) はシステムの奥行き表現に任せ、`.atenderShadow` を**重ねない** (二重影・Liquid Glass 干渉を防ぐ)。影を自前で敷くのは「システム部品でない自前カード面」だけ。

### 3.4 タイポの階層 (Touri 不満: 「フォントサイズの規格を統一して」)

**全メイン画面で同じ見出しスケールを使う**のが本節の核心。iOS built-in text style (Dynamic Type 対応、`Typography.swift` の `atender*` エイリアス) を役割に固定する。

| 役割 | text style (iOS) | atender エイリアス | 用途 |
|---|---|---|---|
| 画面タイトル | `.navigationBarTitleDisplayMode(.inline)` (~17 semibold・中央) | (system) | nav bar の inline title。large title は使わない (§3.7、2026-07-21 裁定) |
| セクション大見出し / hero 数値 | `.title2` (22) / `.title` (28) | `atender2xl` / `atender3xl` | カード見出し、出席率 % の数値、**モーダル/シートのヘッダータイトル (§3.7.4)** |
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
| グリッド線 | `border-border-subtle` = `rgba(15,23,42,0.08)` = **8% の極薄** | **`AtenderGridLine`** (= `Color.borderSubtle` (`.separator`) / 太さ **1pt**) の内側罫線。**濃い罫線で表組みにしない。** |
| 外殻 | container `rounded-md overflow-hidden` | グリッド全体を `Radius.md` (18) の card として丸め、`overflow` をクリップ。周囲は `sectionGap` で離す |

**原則**: グリッドは「罫線が主役の表」でなく「**面が主役・線は最小**」。

- 線の**太さと色は `AtenderGridLine` の単一定義**とし、時間割グリッドと月カレンダー (§3.6.3) が同じ定数を使う。個々の View に `1` や `borderSubtle` をベタ書きしない。
- 引くのは**内側の罫線だけ** (列境界・行境界)。**外周の枠は引かない** (カードの角丸クリップが縁を作る)。
- ヘッダー帯と本文の境界にも線を引かない (`bgMuted` → `bgElevated` の色差が境界になる)。
- **gap 分離は使わない** (2026-07-30 build 17 裁定)。溝が分離線として見えるには gutter に色が必要で、結局は太い線を引くのと同じになる。

#### 3.6.3 月カレンダー (personal / room 共通)

**2026-07-29 Touri 裁定により、月カレンダーは「タイル (カード) の中」に収める** (2026-07-23 の full-bleed 裁定は**撤回**)。要望の逐語は「タイルの中に入れて欲しい。今は横幅いっぱいになってると思うから。中の UI はそのままでいい」。personal (Home) と room (ルーム詳細) の両方に適用し、`CalendarMonth` は**単一スタイル**とする (`CalendarMonthChrome` enum は廃止)。

> **★ Touri 裁定 (2026-07-30 / build 17)**: 「時間割と完全に揃える」。**曜日ヘッダーに `bgMuted` の帯を敷き、日セルに罫線を引く**。2026-07-2x の「罫線全廃 + gap 分離」裁定は**撤回**。旧裁定は §4 / §8 の「内側は hairline」という記述と**既に矛盾していた**ので、本裁定で罫線側に一本化して矛盾ごと解消する。

| 属性 | 規則 |
|---|---|
| 外殻 | `Color.bgElevated` + `Radius.lg` (24) + `.atenderShadow(.card)`、**内側 padding は 0** (グリッドがカードの縁まで届く。時間割グリッドと同じ)。祖先の `Space.pagePxMobile` (16pt) page margin の**内側**に収まる。負マージン・幅拡張・`offset` を使わない。**外殻と曜日ヘッダー帯は月ページャの外側に固定で置く** (中身だけが横に滑る。カードごと滑らせると横 ScrollView の clip 境界がカードの縁と一致し、影が左右で切れる) |
| 曜日ヘッダー | `Color.bgMuted` の帯 (高さ `CalendarMonthLayout.weekdayHeaderHeight` = 26)。日セルと**同一の列定義** (`CalendarGrid.columns`) を共有し、列とラベルの x を必ず揃える。帯の中には縦罫線を引かない |
| セル分離 | **`AtenderGridLine` (`borderSubtle` 1pt) の内側罫線** (§3.6.2)。縦 6 本 (列境界) = 列 0 以外の日セルが leading に、横 5 本 (行境界) = 行 0 以外の日セルが top に、それぞれ `.overlay` で引く。**罫線はレイアウト幅/高さを消費しない** (タップ領域を削らない)。列間 gap・行間 gap は **0**。**外周の枠は引かない**。ヘッダー帯と本文の間にも線を引かない。列配分は標準の `LazyVGrid` に任せる (`EqualColumnsLayout` は build 15 で撤回済) |
| 日セル | セル自身は枠も角丸も持たず・**平常時は背景塗りなし** (カード面 `bgElevated` が透ける。当月外の `bgMuted` は**廃止**のまま — 当月外という受動的な状態を一括で灰色に塗ると、罫線とは別の「もう 1 本の分離線」に見えるため。当月外は日付数字の不透明度 0.38 だけで表す)。日付は左上、**その真下にステータスドット** (6pt・最大 3 個・24pt 幅に中央寄せ・marks が空でも 6pt を常時確保)。**当月外は日付数字のみ** (イベント chip / ドットを描かない。Web `CalendarMonth` と同一)。曜日色 (日=`#E5484D` / 土=`#0091FF` / 平日=`textPrimary`、当月外は 0.38 不透明度)。**今日=accent 塗り丸 / 選択日=セル全高を `Color.calendarSelectedDay` (= `bgMuted` = `tertiarySystemGroupedBackground`) で `Radius.sm` 塗り**。今日かつ選択の日は**両方描く** (グレーのセル + accent 丸)。高さ `CalendarMonthLayout.rowHeight` (最小 70pt) |

> **★ Touri 裁定 (2026-07-30)**: 選択日は accent アウトライン丸を**廃止**し、TimeTree の月ビュー同様「セル列を薄いグレーで塗る」形にする (アウトライン丸は今日の accent 丸と競合し、今日を選ぶと今日が消えていた)。**当月外の `bgMuted` 廃止 (上表) と矛盾しない**: あちらは「当月外という受動的な状態を一括で灰色に塗る」ため分離線として誤読されたのに対し、こちらは**ユーザーの操作で 1 セルだけが動く能動的な強調**であり、役割が違う。塗りは semantic system color のみ (自前 hex を持ち込まない)。`Color.calendarSelectedDay` はカード面 `bgElevated` (= `secondarySystemGroupedBackground`) の 1 段上に載る同族色なので light/dark 双方で「カード面の一段濃い影」として成立する。強さを変えるときの単一の変更点でもある。
| イベント | 不透明 tint 面 (`surfaceTintRatio`・base=`bgElevated`) + `textPrimary`、`Radius` 4、高さ 14、`.caption2` semibold、1 行 truncate、最大 2 行、超過は chip 1 個 + `+N`。★ **左バーは持たない** (2026-07-30 build 17 Touri 裁定)。高さ 14pt の chip では 2pt バー + 内側余白が視覚幅の 1/3 を占めて「線が主役」になり、科目色は tint 面 (42%) だけで判別できるため。**時間割セル (§3.6.1) の 2pt 左バーは維持する** (高さ ≥ 44pt でバーが情報として読め、連続コマの区切りにも効く) |
| 高さ算出 | `CalendarMonthLayout.rowHeight(available:)` を直接使う。カード内側 padding が 0 になったので差し引く chrome は無い (`gridAvailable` / `cardChromeHeight` は build 17 で廃止) |
| 月送り | 横スワイプ (`ScrollView(.horizontal)` + `.scrollTargetBehavior(.paging)` + `containerRelativeFrame(.horizontal)`) で 1 スワイプ = 1 ヶ月。窓は起点月 ±24 ヶ月を最初から並べ、**index のリセットを書かない** (3 ページのローリング + リセットは実測で 2 ヶ月飛ぶ)。月ヘッダーの `‹` `›` は窓端で `.disabled`。読み込み中に skeleton へ差し替えず、直前の月グリッドを残す |

**月カレンダーは §3.3「浮くべき面は必ず影を持つ」の対象**である (2026-07-23 の除外規定は撤回)。時間割セル (§3.6.1) や他のカード面の影規定は不変。

**月カレンダーの画面 (殻) は personal / room で 1 個** (`CalendarScreen`)。データ源と文脈オプション (同期バナー / 同期警告グリフ / ヘッダー accessory / 日別シート) を注入して使い分ける。ルーム専用の別コンポーネントを作らない (2026-07-30 Touri 裁定)。

#### 3.6.4 学期の出席カレンダー (`AttendanceCalendar`) — 罫線化の対象外

学期・科目タブの出席カレンダーは **円形バッジの格子**であり、§3.6.3 の「表」とは別の部品である。**罫線を引かない**し `CalendarScreen` にも載せない。理由:

- 日セルが正方 → 円で、出席ステータスを**円の塗り分割 + グリフ**で見せる (予定 chip を積む面ではない)。
- セル間 3pt gap + 円の外周 `borderSubtle` stroke が既に分離を担っており、直線罫線を足すと円と直線が二重に境界を主張する。
- 複数選択モード (`selectionMode`) という月カレンダーに無い相互作用を持つ。

寸法規定は `SemesterCalendarMetrics` (card 横 padding `Space.s2` / grid spacing 3 / 44pt 下限) が正典で、§3.2 の例外規定はこの部品に対してのみ生きている。

### 3.7 ヘッダー規格の統一 (Touri 不満: 「ヘッダーの規格を統一して」)

全画面で nav bar・タイトル・switcher・gear の配置を一貫させる。

#### 3.7.1 トップレベル 5 タブ (ホーム / 学期・科目 / ルーム / 友達 / 設定)

- **標準 nav bar + `.navigationBarTitleDisplayMode(.inline)`**。inline title = 中央・コンパクト・太字 (~17pt semibold)。**large title は使わない** (上部の縦スペースを食うため)。
- タイトル = そのタブの日本語名 (「ホーム」「学期・科目」「ルーム」「友達」「設定」)。**アプリ名をタイトルにしない** (汎用層 §4)。
- **本文に大タイトルを重複させない** (nav bar の inline title が唯一のタイトル)。
- switcher ピル (自分/クラス) と segmented (時間割/カレンダー) は **nav bar の下・スクロールコンテンツの先頭**に、全画面同じ順序で置く。
- 画面固有アクション (gear = 時間割設定 等) は **toolbar trailing** に置く。inline title と同じ行の右側に並ぶ。本文中に浮遊させない。

> ★ **Touri 裁定 (2026-07-21、2026-07-18 の large title 裁定を反転)**: 大タイトル (デカ文字) をやめ、**5 タブ全部を inline の中央コンパクト太字タイトル + 歯車右**にする。理由は「デカ文字が上部スペースを食い、時間割/カレンダーの表が狭くなる」ため。inline なら省スペースで、かつタイトルと歯車が同じ横一行に並ぶ (2026-07-19 の「タイトルと設定ボタンを同じ LINE に」要望も同時に満たす)。旧 large title 裁定 (2026-07-18) は本裁定で撤回。

#### 3.7.2 詳細画面 (ルーム詳細 / テンプレート / 科目詳細)

- **タイトルは 1 つだけ。重複を禁止** (現状 `RoomDetailView` は nav タイトルと本文 header で room 名を 2 回出す — §2 の診断)。
- **★ Touri 裁定 (2026-07-18)**: 重複は **nav bar タイトル (小) を消し、本文 header の大タイトルを残す**方向で解消する。
  - **nav bar は back button のみ** (`.navigationBarTitleDisplayMode(.inline)` + `.navigationTitle("")`、`BackHeaderButton` は revamp doc §4.3 で廃止済のシステム back)。nav にタイトル文言を出さない。
  - **本文 header の大タイトル (room 名) + 副題 (「みんなの予定共有」) + gear を、nav タイトルが消えて空いた分だけ上に詰める。** これが Touri の明示要望 (「小さい方を消して、大文字ルーム名と設定ボタンを上に押し込む」)。
  - **逸脱の明示**: これは「詳細画面は inline nav タイトル」という一般 iOS 慣習からの逸脱。理由は (a) room 名が長く content で大きく見せる価値がある (b) Touri の名指し要望。**プロミネントな content header を持つ詳細画面 (ルーム詳細等) はこのパターン**、header を持たない詳細画面 (テンプレート/科目詳細で content 側に大タイトルが無いもの) は inline nav タイトルを使う。
- switcher / segmented の配置規約はトップレベルと同一。
- **本節は「タブの `NavigationStack` に push される画面」の規約**である。**シートとして出す詳細 (日別シート・フォーム系モーダル) は §3.7.4 のモーダルヘッダー規格に従う。**

#### 3.7.3 セクション見出しと学期ピッカー

- 「2026 前期」等の**学期ピッカーは見出し (title) でなく subhead 級のコントロール**として扱う (`.footnote`/`.subheadline` + chevron)。Home と 学期・科目 で同じ体裁。
- **色は設計で確定させる (OS 依存にしない)**: 学期名 = `.subheadline` semibold + `Color.textSecondary`、chevron (`chevron.down`) = `.caption2` + `Color.textTertiary`、`Menu` に `.tint(Color.textSecondary)`。**明示しないと iOS 26 は label 色 (黒)・iOS 18 は accent (青) で描かれ、OS で色が変わる** (実機実測)。
- **toolbar に置く場合 (Home) は「ボタンでなくテキストだけ」**: iOS 26 は toolbar item に自動で glass カプセルを付けるので、`ToolbarItem { ... }.sharedBackgroundVisibility(.hidden)` (iOS 26.0+) で外して素のテキスト + chevron にする (Touri 裁定 2026-07-30)。`.buttonStyle(.plain)` は**無効**、`.toolbarBackground` は**無関係** (どちらも実機で確認済)。iOS 25 以下はカプセルが存在しないので素の `ToolbarItem` のまま (pixel diff 0)。
- カード内見出し (「今日までの出席率」等) は全画面 `.footnote` secondary で統一 (現状踏襲)。

#### 3.7.4 モーダル / シートのヘッダー規格

**全モーダル共通**。`BottomSheet` / `SheetScaffold` / `FullScreenModal` の 3 chrome が同一の modifier を使い、呼び出し側 (24 箇所) は `title` を渡すだけにする。

- **`< タイトル ✕` を nav bar の 1 行に置く** (Touri 裁定 2026-07-30、スケッチ準拠)。シートの中身を `NavigationStack` で包み、そこの toolbar に 3 つの item を並べる。
- **タイトル = `.atender2xl` bold・中央** (`ToolbarItem(placement: .principal)`)。inline nav title (~17pt semibold) は**使わない** — 本文の大字と同じ段に揃えるため。修飾子は **`.lineLimit(1)` + `.minimumScaleFactor(0.5)` のみ**。
  - ★ **`topBarLeading` は使わない (2026-07-30 build 17 裁定)**。iOS 26 は leading item に**幅 31pt しか与えず**、24pt bold の日本語は 2 文字 (`カ…`) に潰れて glass カプセルに閉じ込められる (実機実測)。`.principal` は **247pt (iOS 26.5) / 277pt (iOS 18.2)** 使える。
  - `.principal` には glass カプセルが**元々付かない**ので `sharedBackgroundVisibility(.hidden)` は**付けない** (実測で付けた版と同一)。
  - **`fixedSize()` は禁止** — 幅 329pt になって back / close ボタンの下に潜り込む (実測)。`layoutPriority` は `.principal` では無効。
  - **文言は 12 文字以内を目安、19 文字が上限** (`minimumScaleFactor(0.5)` 併用時の実測。20 文字以上で `…` になる)。`.navigationTitle` を併記しても `.principal` が勝つ。
- **`✕` = Apple 標準部品**: `ToolbarItem(placement: .topBarTrailing) { Button(role: .close) { } }` (iOS 26.0+。toolbar 内では円形 glass の ✕ になる。`.buttonStyle(.glass)` は付けない)。iOS 25 以下は自前の丸 ✕ (36pt / `textPrimary.opacity(0.08)`)。
- **`<` = Apple 標準部品**: シート内 `NavigationStack` に push したときの**システム back** (iOS 26 = 円形 glass chevron。`.navigationTitle` を付けなくても出る)。`ButtonRole.back` は**存在しない**。iOS 25 以下はシステム back のラベルが英語 "Back" になる (`.lproj` を持たないため) ので**隠して自前 chevron 丸**に差し替える。
- **モーダル内の 2 階層 (一覧 → 編集) は `NavigationStack` の push で表す** (別シートを重ねない)。`✕` は push 中も同じ位置に出て、1 回でモーダル全体を閉じる。
- 旧規格 (`.atenderLg` タイトル + 自前 `HStack` ヘッダ + 自前丸 ✕、`FullScreenModal` の中央 `.atenderBase` タイトル + 重複する `chevron.left`) は**本節で廃止**。
- グラバー (42×5 の Capsule) は nav bar の**上**に残す (`presentationDragIndicator(.hidden)` + 自前)。`BottomSheet` の detent 実測は「自前ヘッダ高」ではなく「**シート最上端からコンテンツ上端までの距離**」を測る形に変える (グラバー + nav bar を一括で拾う)。

### 3.8 タブバー (Liquid Glass) (Touri 名指し: アイコンが大きい・ラベルが近い)

- ターゲットは native `TabView` + `.tabItem`(`Label`) の Liquid Glass タブバー (revamp doc §4.1)。**アイコンは outline のまま** (5 個中一部だけ fill にすると混在。revamp doc F6 で確定、`calendar.fill` は SF Symbols に不在)。
- **★ 確定 (2026-07-18、researcher 調査 + Leader 実機プローブ + Touri 裁定)**: iOS 26 Liquid Glass タブバーは**アイコンの point size もラベル間隔もシステム所有**で、`UITabBarAppearance` の override は**丸ごと無視される** (実機で `iconColor=.systemRed`/ラベル 12pt 下げが無視されるのをピクセル実測で確認。詳細 `Muraki/knowledge/library/swiftui-liquid-glass-ios26.md`)。
- Touri の「アイコン大きい・ラベル近い」(#6/#7) は **iOS 26 のシステムメトリクスでバグではない**。制御するには Liquid Glass を捨てる (自前タブバー) しかなく、**Touri は Liquid Glass を優先する裁定 (2026-07-18)**。→ **タブアイコン/間隔は native のシステム値を受容する。P3/P4 で調整しない。**

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
| L1 | 出席率カード / 月カレンダー | 出席率カードは `Radius.md` + shadow。月カレンダーも `Radius.lg` + shadow のカード。内側は `AtenderGridLine` の 1pt 罫線 (§3.6.3) |
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
| 2 | **マス目の線が見えてる** | §3.6.2 / §3.6.3 (`AtenderGridLine` = `borderSubtle` 1pt の**内側**罫線に統一) | 時間割と月カレンダーが**同じ定数**で線を引く。外周の枠は無い。濃い罫線・セルごとの枠は無い ★ build 17 で「枠全廃」から「時間割と完全に揃える」へ裁定変更 |
| 3 | テキストが**中央に来てる** → 上にして | §3.6.1 (align top) | 時間割セルのテキストが上寄せ |
| 4 | 時間割カレンダーの**デザイン自体が微妙** | §3.1/§3.3/§3.6 (丸み + 影 + 面主役) | グリッドが card 化 (radius 18 + shadow) |
| 5 | iOS が**詰め詰めで10年前** | §3.2 (余白) / §3.1 (丸み) / §3.3 (影) / §3.6.3 (面が主役・線は 1pt の内側罫線のみ) | section-gap 16pt 遵守、card は `Radius.md` 以上 + 影、濃い罫線・全セル枠は無い |
| 6 | タブのアイコンが**でかい** | §3.8 (✅ 解決: システム所有・Glass 優先で受容) | native 制御不能を実測確定、Touri 裁定で不調整 |
| 7 | タブの**文字とアイコンの距離が近い** | §3.8 (✅ 解決: 同上) | 同上 |
| 8 | ヘッダー/フォントサイズの**規格を統一** | §3.4 (タイポ段の画面横断統一) / §3.7 (ヘッダー規格) | 全画面同一見出しスケール、nav bar 規約統一、大タイトル重複排除 |

**#6/#7 は「直さない」で解決** (iOS 26 のシステム所有メトリクスで native 制御不能、Touri が Liquid Glass 優先を裁定)。残り 6 件は本書の原則で実装に落ちる。

---

## 8. 不採用案

- **Web トークンを pt に 1:1 移植する**: 却下。中立色/書体は system semantic/built-in text style に明け渡す規約 (CLAUDE.md) に反し、Liquid Glass と干渉する。移植するのは**性格 (丸み/余白/奥行き/密度/配置)** であって値の全量ではない。
- **新しい radius/shadow/color トークンを追加定義する**: 却下。iOS の既存トークンは既に Web と同値 (§1.1)。問題は値でなく適用。新設は正典を二重化する。
- **時間割/カレンダーを自前で凝ったグラフィックにする**: 却下。確定裁定 (不透明 tint + 上寄せ + 時間割セルの 2pt 左バー + 月カレンダーの**カード外殻 + 内側 1pt 罫線 + `bgMuted` ヘッダー帯**) が既に「綺麗」の実体。これを iOS 語彙で忠実に写すのが最短。独自の見た目を発明しない。
- **タブアイコン/ラベル間隔を本書で「こう調整する」と確定する**: 却下 (保留)。native `TabView` の制御可否が未確認。憶測で pt を書くと Developer が実装で詰まる。§10 の researcher 検証後に確定する。
- **トップレベル 5 タブに large title を使う**: 却下 (2026-07-21 Touri 裁定)。デカ文字が上部の縦スペースを食い、時間割/カレンダーの表が狭くなる。`.inline` の中央コンパクト太字 + 歯車右に統一する (§3.7.1)。
- **選択日を accent アウトライン丸で示す** (§3.6.3 の旧規定): 却下 (2026-07-30 Touri 裁定)。今日の accent 塗り丸と競合し、**今日を選ぶと今日が消える**。TimeTree の月ビュー同様「選択セルを薄いグレーで塗る」に変更し、今日の丸と併存させる。
- **モーダルの `<` / `✕` を自前描画する** (§3.7.4 の旧実装): 却下。iOS 26 に標準部品が実在する (`Button(role: .close)` を toolbar item に置くと円形 glass の ✕、sheet 内 `NavigationStack` の push でシステム back)。自前描画は「標準部品を自前で再発明しない」規約 (CLAUDE.md) に反する。**ただし `ButtonRole.back` は存在しない**ので、back は必ず `NavigationStack` の push で得る。
- **toolbar item の glass カプセルを `.buttonStyle(.plain)` で消す**: 却下。**無効**であることを実機で確認済 (素の版とスクリーンショットが md5 一致)。カプセルは Button の style ではなく toolbar 側が item を包む共有背景なので、`sharedBackgroundVisibility(.hidden)` (iOS 26.0+) だけが効く。
- **月カレンダーのセル分離を gap (溝) で行う / 罫線を全廃する** (§3.6.3 の旧規定): 却下 (2026-07-30 build 17 Touri 裁定「時間割と完全に揃える」)。(a) 溝が分離線として見えるには gutter に色が必要で、結局は太い線を引くのと同じになる。(b) gap 分離下では背景色の差が唯一の分離線になり、当月外の `bgMuted` が灰色の塊として最も目立ってしまう。(c) 同じ表を持つ時間割グリッドと分離の方式が食い違い、「実装が違う」状態が残る。
- **モーダルタイトルを `topBarLeading` に置いて左寄せにする** (§3.7.4 の旧規定): 却下。iOS 26 は leading item に**幅 31pt しか与えない**ため 24pt bold の日本語が 2 文字に潰れる (実機実測)。`.principal` (247pt) へ移す。
- **月カレンダーの月送りを `TabView(.page)` で作る**: 却下。縦 `ScrollView` の中で `.frame(height:)` が無いと**高さ 0 に潰れる**ため高さの定義が 2 箇所に分かれ、Dynamic Type でクリップする。`ScrollView(.horizontal)` + `.scrollTargetBehavior(.paging)` + `containerRelativeFrame(.horizontal)` は内容の自然高を取る。加えて「3 ページ + index を中央に戻す」実装は**実測で 1 スワイプ 2 ヶ月飛ぶ**ので、窓を広く取って reset を書かない (`Muraki/knowledge/library/swiftui-nested-horizontal-paging-ios26.md`)。

---

## 9. ★ 既存設計doc (`.designs/20260717-ios-ui-revamp.md`) との矛盾 — Leader 判断へ

本書執筆中に検出した、revamp doc の現行記述と本書の視覚原則が食い違う点。**3 件とも Touri 裁定済 (2026-07-18)。P3 設計doc 更新時に revamp doc へ反映すること。**

1. **ルーム詳細のタイトル重複** — ✅ **裁定済**: **nav タイトルを付けず、本文 header の大タイトルを残して上に詰める** (§3.7.2)。revamp doc §4.3 が `RoomDetailView` に足そうとしている `.navigationTitle(room名)` は**入れない** (nav は back のみ)。revamp doc §4.3 の該当記述を P3 で書き換える。

2. **Home のタイトル** — ✅ **裁定済 (2026-07-21 に反転、本項を置換)**: **large title は使わず、5 タブ全部を `.inline` の中央コンパクト太字タイトル + 歯車右**にする (§3.7.1)。revamp doc §5.1 の Home toolbar にタイトル「ホーム」を `.navigationBarTitleDisplayMode(.inline)` で確定。2026-07-18 の「large title で統一」裁定は撤回済。

3. **時間割/カレンダーの視覚原則が revamp doc P3 (§5.3) に不在**: revamp doc §5.3 は `TimetableGridPhaseB` の**フォントトークン置換**しか扱っておらず、セル背景の透過/罫線/テキスト配置 (Touri の核心不満) に**言及がない**。矛盾ではないが**欠落**。→ **P3 の §5.3 実装は本書 §3.6 を適用規則として併せ持つ**必要がある。Leader は P3 設計doc更新時に §3.6 を必須参照に含めること。

---

## 10. ★ 要 researcher 検証 (Leader に差し戻す)

1. ~~native `TabView` でタブアイコン size / ラベル間隔を制御できるか~~ → ✅ **解決済 (2026-07-18)**: 制御不能を researcher 調査 + Leader 実機プローブで確定、Touri は Liquid Glass 優先を裁定。§3.8 に反映。**残る要検証項目は無い。**

(補助) iOS 26 Liquid Glass の nav bar / tab bar が `AccentColor` asset を引く挙動は revamp doc §4.1 で実測済。本書はそれを前提とするのみ。

---

## 参照

- Web 正典: `apps/web/src/styles.css`、`components/timetable/{TimetableView,EmptyCell}.tsx`、`components/event-tile/EventTile.tsx`、`components/rooms/calendar/CalendarMonth.tsx`、`components/home/{SelfTimetableView,PersonalCalendar}.tsx`
- iOS トークン: `apps/ios/Atender/Core/DesignSystem/{Radius,Shadow,Space,Typography,Color+Atender,Glass}.swift`
- 汎用層: `Muraki/knowledge/pattern/ui-ux-design-perspectives.md`
- 既存設計: `.designs/20260717-ios-ui-revamp.md`
</content>
</invoke>
