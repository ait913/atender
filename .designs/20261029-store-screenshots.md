# atender 1.0.1 — App Store スクリーンショット (HTML → PNG、5 枚)

| 版 | 日付 | 内容 |
|---|---|---|
| R0 | 2026-10-29 | 初版。Leader 裁定 (配置 = Bloom 移植 / 色 = atender ブランド / 1320×2868 / 5 枚) を受けて執筆 |

> 調査: `.knowledge/11-store-screenshots-research.md`。移植元: `projects/bloom/mocks/store/` と `projects/bloom/.designs/20261009-onboarding-v2-and-store-shots.md` §5、完成画像 `projects/bloom/assets/store/0.2.1/slide-{1..4}.png` (Architect が実物を目視済み)。
> 挙動 ID: **SS** (ストア画像の HTML / render)、**SD** (ストア用デモ seed)、**SF** (撮影の UITest)。

## 0. スコープ

### 0-1. 触るファイル

| パス | 新規 / 変更 | 内容 |
|---|---|---|
| `mocks/store/index.html` | 新規 (Bloom からコピーして改変) | §4・§5-1 |
| `mocks/store/render.mjs` | 新規 (同上) | §5-2 |
| `mocks/store/render.sh` | 新規 (同上) | §5-3 |
| `mocks/store/vendor-fonts.py` | 新規 (同上) | `FONTS` を `zenmaru` 1 件だけにする (§4-4) |
| `mocks/store/package.json` / `package-lock.json` | 新規 (同上) | `name` を `"atender-store"` に、`description` を本 doc の §6 のコマンドに置換。依存 (`puppeteer-core ^24.43.1`) は変えない |
| `mocks/store/.gitignore` | 新規 (Bloom と同内容) | `fonts/` `out/` `node_modules/` `shots/` `.chrome-profile.*` |
| `mocks/store/README.md` | 新規 | 本 doc §6 のコマンド列と「正典は本 doc」の 1 行 |
| `apps/api/scripts/seed-store-demo.ts` | 新規 | §5-4 (既存 `seed-demo-user.ts` の作法から派生、別ユーザー・別 token) |
| `apps/ios/AtenderUITests/StoreShotsFlow.swift` | 新規 | §5-5 (素材 5 枚を撮る UITest) |
| `assets/store/1.0.1/slide-{1..5}.png` | 新規 (生成物をコミット) | 提出用の完成画像 |

**触らないもの**: アプリ本体 (`apps/ios/Atender/**`、`apps/web/**`、`apps/api/src/**`)、既存 `seed-demo-user.ts`、既存 UITest、ブランド資産 (`Assets.xcassets` はパス参照するだけでコピーしない)。Bloom 側のファイル (コピー元として読むだけ)。ASC の 1.0.1 版作成とスクショ差し替え (別作業)。

### 0-2. Bloom から持ち込まないもの

`TUTORIAL` 配列と `page=tutorial` 分岐 (`index.html` / `render.mjs` の第 3 引数)、`lock.svg`、`wordmark.png`、`fonts/` `node_modules/` `shots/` `out/` の中身、六角形 (Bloom ブランドの図形)、黒の配色 (dark テーマとしてだけ残す、§4-2)。

## 1. 目的

App Store の 1.0.1 で、build 21 で消えたカレンダー画面を含む旧スクショ 5 枚を差し替える。学生が「出欠を付ける手間がない」「あと何回休めるか分かる」を最初の 2 枚で掴めるよう、Bloom で承認済みの構図 (見出し → 端末 → バッジ) をそのまま使い、色と文言を atender に置き換える。

## 2. 訴求の整理 (6 候補 → 5 枚)

| # | 訴求 (1 枚 1 メッセージ) | 画面 | 構図 |
|---|---|---|---|
| 1 | **出席率がひと目で分かる** (出席率ヒーロー + 学期の出席カレンダー) | 学期・科目タブの上端 | ペア左: 傾いた大端末 (2 枚目へはみ出す) |
| 2 | **ワンタップで出欠** | ホーム (時間割 + 下端の出欠タイル展開) | ペア右: 傾いた端末の続き + 小さい直立端末 |
| 3 | **科目ごとに「あと N 回休める」** (build 21) | 学期・科目タブの科目一覧 | 直立端末 + バッジ |
| 4 | **同じ学科の公開時間割をそのまま取り込む** (build 21) | 時間割の設定 → 公開時間割 | 直立端末 + バッジ |
| 5 | **友達の時間割を重ねて空きコマが分かる** (ルーム) | ホームのルーム chip → ルームの時間割 | 直立端末 + マスコット |

**落とした候補: 「iPhone カレンダーに書き出し」**。理由 3 つ:
1. atender 側の画面は設定のトグル 1 行で、画面そのものが価値を語れない (Bloom の「説明文を書かず画面で語る」構造に乗らない)。価値が見えるのは iOS のカレンダー.app で、他アプリの画面を主役にした枚は App Store の「アプリの使用中を示す」趣旨から外れる
2. build 21 でカレンダー機能 (個人予定・ICS・Google) を撤去した直後に「カレンダー」を訴求すると、撤去した機能があると誤読される
3. 残り 5 つは「毎日使う (1・2)」「不安を消す (3)」「始めるのが楽 (4)」「友達と使う (5)」で役割が重ならない。書き出しは説明文 (ASC の description、本 doc の範囲外) で触れれば足りる

**順序の理由**: ストアの検索結果に出るのは先頭 3 枚。1・2 は毎日の価値 (出席率と出欠) で、ペア構図の連続感で 3 枚目まで横スクロールさせる。3 は build 21 の新機能で差別化。4 は導入の障壁 (時間割の手入力) を消す。5 は友達と使う理由で締める。

**1 と 3 は同じタブだが別メッセージ**: 1 = 学期全体の出席率 (ヒーローの「今日までの出席率 NN%」と出席カレンダーの色)、3 = 科目ごとの残り回数 (科目一覧の行末「あと1回休める」)。画面の上端と科目一覧で写る部品も重ならない。

**ペア構図で 1 と 2 の画面を Bloom と同じ位置関係に置く理由**: 傾いた大端末は画面の**上半分しか写らない** (§4-5 の数値で端末上端から約 56%)。ホームの出欠タイルは画面下端にあるので傾いた端末では写らない。上端に価値 (出席率の数字) がある学期・科目タブを傾いた端末に、全体が縮小で写る小さい直立端末にホーム (下端の「今日は全出席 (N)」まで写る) を置く。

## 3. コピー (A 案 / B 案)

### 3-1. 文言

`[ ]` は A 案の強調 (マーカー線、§4-3)。`\n` は大見出しの改行。B 案は強調なし。

| # | A 案 小見出し | A 案 大見出し | B 案 小見出し | B 案 大見出し | バッジ (A/B 共通) |
|---|---|---|---|---|---|
| 1 | 出席率、把握してる？ | もう[出席率]で\n焦らない | 今日までの出席率 | 出席率が\nひと目で分かる | なし |
| 2 | 授業おわったら | [ワンタップ]で\n出席完了 | 今日の出欠は | ワンタップで\n記録できる | なし |
| 3 | あと何回休める？ | [科目ごと]に\nすぐ分かる | 科目ごとの欠席上限 | 残りの休める回数を\n自動で計算 | 欠席上限も\n遅刻の換算も\n科目ごとに |
| 4 | 時間割の入力、だるい？ | [同じ学科]のを\nそのまま使う | 同じ学科の公開時間割 | 取り込むだけで\n時間割が完成 | 学校と学科を\n選ぶだけ |
| 5 | 次の空きコマ、誰いる？ | 友達の[時間割]を\n重ねて見る | ルームで共有 | 友達との空きコマが\nすぐ分かる | なし (マスコット) |

**推奨: A 案**。Touri の指示「学生向けにポップ」に対し、A は小見出しを学生の口語の問いかけ (「把握してる？」「だるい？」「誰いる？」) にし、大見出しで答える (Bloom の「疑問/状況 → 動詞」構造と同じ)。B は機能名の説明で、ストアの他の時間割アプリと語彙が被る。

**避けた表現**: 「単位が取れる」「留年しない」等の保証 (出席要件は学校ごとで、アプリは計算するだけ — `.knowledge` の出席要件ノート)。「サボれる」(学校・保護者の目に触れる App Store で、アプリが欠席を勧める読みになる)。マーケ語 (「革新的」「最高の」「完璧」)。

### 3-2. 文字数の制約 (レイアウトから導出。文言を差し替えるときもこれを守る)

数え方: `[` `]` `\n` を除いた文字数。句読点・記号も 1 字。

| 対象 | 上限 | 理由 (§4-5 の数値) |
|---|---|---|
| 小見出し | 12 字 | 61px × 1.04 (letter-spacing .04em) × 12 = 761px < 見出し幅 1140px。12 を超えると問いかけが長くなりすぎる (Leader 指定) |
| 大見出し 1 行 (ペア = 1・2 枚目) | 7 字 | 149px × 1.035 × 7 = 1080px ≤ 1140px |
| 大見出し 1 行 (3〜5 枚目) | 9 字 | 123px × 1.025 × 9 = 1135px ≤ 1140px |
| 大見出し 2 行目 (3・4 枚目) | 6 字 | 2 行目の y 範囲 (560〜708px) がバッジ (y 667〜) と重なる。行の右端 = 90 + 126.1 × n が バッジ左端 861 未満 → n ≤ 6 |
| 大見出し 2 行目 (5 枚目) | 5 字 | マスコットの可視部の左端 830px。90 + 126.1 × 5 = 720 < 830 (6 字は 847 で重なる) |
| 大見出しの行数 | 2 行 | 3 行目は端末の上端と重なる |
| バッジ | 1 行 7 字 × 3 行 | 内径 391 − 52 × 2 = 287px ÷ (40 × 1.025) = 7.0 字 |

§3-1 の全セルはこの表を満たす (Architect が 1 セルずつ数えた)。

## 4. UI/UX (レイアウト仕様)

### 4-1. キャンバスとスケールの規則

- キャンバス **1320×2868** (iPhone 6.9"、ASC `APP_IPHONE_67` で受理。既存の公開中 5 枚と同寸)。ペア構図は **2640×2868** を 1320 ずつ切る (Bloom と同じ `transform: translateX(-(slide-1)*1320px)`)
- Bloom (1290×2796) の値の換算は **数値置換** (CSS に換算後の値を直接書く)。規則: 横方向の位置・幅・フォントサイズ・角丸・影の x/blur は **×1320/1290** (1.02326)、縦方向の位置・影の y は **×2868/2796** (1.02575)、四捨五入して整数 px。下表は scratchpad のスクリプトで実走した値
- `transform: scale()` を使わない理由は §10

### 4-2. 色トークン (CSS 変数、`:root` = light / `[data-theme="dark"]` = dark)

値は全て `apps/ios/Atender/Core/DesignSystem/Color+Atender.swift` と wordmark 画像の実測から。**新しい色を発明しない** (DESIGN.md §3.5)。

| 変数 | light (既定) | dark (`?theme=dark`) | 用途 |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#010207` | 地 |
| `--glow` | `color-mix(in srgb, #1E96E6 18%, #FFFFFF)` | `#131a28` | 背景の radial の中心色 |
| `--glow-mid` | `color-mix(in srgb, #1E96E6 6%, #FFFFFF)` | `#060912` | radial の 35% 地点 |
| `--ink` | `#30415B` (wordmark-navy の最頻色を実測) | `#E6E8EE` | 大見出し |
| `--accent-600` | `#147FCC` | `#3DA9F0` (accent dark) | 小見出し |
| `--badge-bg` | `#147FCC` | `#147FCC` | バッジの地 (白文字で 4.25:1。500 `#1E96E6` は 3.2:1 なので 600) |
| `--badge-fg` | `#FFFFFF` | `#FFFFFF` | バッジ文字 |
| `--phone-shadow` | `rgba(15,23,42,.28)` | `rgba(0,0,0,.6)` | 端末の落ち影 (Bloom `#0009`) |
| `--screen-bg` | `#FFFFFF` | `#0B0D14` | 端末画面の下地 (画像が無いときだけ見える) |
| `--wordmark` | `url` ではなく JS で切替: light = `wordmark-navy.png`、dark = `wordmark-white.png` | | |
| `--shape-alpha-k` | `2` | `1` | 散らし図形の不透明度の倍率 (§4-6) |

ブランドリング 6 色 (散らし図形・強調マーカーに使う。`Color+Atender.swift` の `brand*`):
`teal #56D8C3` / `blue #568CFC` / `indigo #8F7EFC` / `violet #A978FA` / `magenta #FC6ABF` / `coral #FD728E`。

キャンバス背景: `radial-gradient(ellipse at 55% 82%, var(--glow) 0, var(--glow-mid) 35%, var(--bg) 67%)` (Bloom と同じ形・同じ位置、色だけ置換)。

コントラスト (実測): `--ink` / 白 = 10.33:1、`--accent-600` / 白 = 4.25:1 (61px 太字 = 大きい文字の 3:1 を満たす)、白 / `--badge-bg` = 4.25:1。

### 4-3. 見出し・ワードマーク・バッジ・マスコット

| 要素 | Bloom (1290×2796) | atender (1320×2868) |
|---|---|---|
| `.wordmark` | 250×88、left 88 / top 115、`wordmark.png` | **340×76**、left 90 / top 118、`object-fit: contain`。画像 = `../../apps/ios/Atender/Assets.xcassets/wordmark.imageset/wordmark-navy.png` (877×196、四隅透過、字形 bbox (16,16)-(861,180) を実測)。幅 340 は 877:196 の比で高さ 76 になる値 |
| `.heading` | left 88 / top 292 / 幅 1114 | left **90** / top **300** / 幅 **1140**。ペア右は left **1410** (= 1320 + 90) |
| `.small` | 60px / 700 / lh 1.4 / ls .04em / mb 26 | **61px** / 700 / lh 1.4 / ls .04em / mb **27**。色 `--accent-600` |
| `h1, h2` | 120px / 900 / lh 1.2 / ls .025em | **123px** / 900 / lh 1.2 / ls .025em。色 `--ink` |
| `.pair h1, .pair h2` | 146px / ls .035em | **149px** / ls .035em |
| `em.hl` (A 案の強調) | なし | `font-style: normal; background: linear-gradient(transparent 60%, color-mix(in srgb, var(--hl) 45%, transparent) 60%); padding: 0 .04em;` `--hl` は slide ごと: 1 teal / 2 blue / 3 violet / 4 magenta / 5 coral |
| `.badge` | 382 円、right 66 / top 650、padding 51、39px/700、銀地 | **391** 円、right **68** / top **667**、padding **52**、**40px**/700、lh 1.55、`white-space: pre-line`、地 `--badge-bg` / 文字 `--badge-fg`、`border: 2px solid #FFFFFF`、`box-shadow: 0 20px 67px rgba(20,127,204,.30)` |
| `.mascot` (5 枚目だけ) | なし | `position:absolute; width: 470px; right: 40px; top: 600px; z-index: 4`。画像 = `../../apps/ios/Atender/Assets.xcassets/mascot-hello.imageset/mascot-hello-1024.png` (1024²、透過、可視 bbox (43,123)-(981,899) を実測 → 表示上の可視部は x 830〜1260 / y 656〜1013 で、見出し 2 行目 (≤5 字なら右端 720) と端末上端 (1051) の間に収まる) |

見出しの縦位置 (実走): 小見出し 300〜385 + 余白 27 → 大見出し 1 行目 412〜560、2 行目 560〜708 (lh 147.6)。

ワードマークを全枚の左上に置く (Bloom と同じ)。Leader のブリーフでは「ワードマークは無い」だったが、`Assets.xcassets/wordmark.imageset/` に navy / white の 2 枚が実在する (§12)。App Icon をテキスト横に置く案は不採用 (§10)。

### 4-4. フォント

- **Zen Maru Gothic** (Google Fonts、OFL)。大見出し 900、小見出し・バッジ 700、`FONTS = { zenmaru: { family: 'Zen Maru Gothic', weight: 900, query: 'Zen+Maru+Gothic:wght@500;700;900' } }`
- 選定理由: (1) 丸ゴシックで DESIGN.md §1 の「丸み (ポップ)」と同じ性格。(2) Bloom の Zen Kaku Gothic New と同じ Zen ファミリーで字幅・字面が近く、Bloom のレイアウト (見出し幅 1114 に 120px で 9 字) がそのまま成り立つ。(3) 900 がある (M PLUS Rounded 1c も 900 があるが、ひらがなの字面が小さく 2 行の見出しで漢字との凹凸が目立つ)
- `vendor-fonts.py zenmaru` で `fonts/zenmaru/NNN.woff2` + `fonts/zenmaru.css` に取り込む (クエリは 2026-10-29 に HTTP 200 / `@font-face` 366 件を確認)。HTML は `fonts/zenmaru.css` だけを読む (ネット経由の Web フォントは headless Chrome をハングさせる — `knowledge/tool-quirk/headless-chrome-screenshot-hang-macos.md`)
- `?font=` パラメタと他の 3 フォントは削る (選択肢を残すと「どれで出したか」が出力名から分からなくなる)

### 4-5. 端末モックと構図 (数値)

端末は **CSS 描画** (Bloom と同じ。画像のフレームではない): `.phone` = 角丸 `calc(var(--width) * .17)`、padding `calc(var(--width) * .024)`、Bloom の銀〜黒の linear-gradient ベゼル、`.screen` の内側角丸 `calc(var(--width) * .148)` + 黒縁 `calc(var(--width) * .009)`、`.island` (top 1.45% / 幅 28% / 高さ 3.35%)。ベゼル・島・グラデーションは Bloom の値を**そのまま**使う (light の白地でも実機の黒チタンに見えるので置換しない)。変えるのは次の 3 点だけ:

- `aspect-ratio: 1320 / 2868` (素材が 6.9" の実寸なので `cover` で切れない。Bloom の 1179/2556 は 17 Pro の比)
- 落ち影 `box-shadow: 0 0 0 3px #050609, 0 0 0 5px #727783, 26px 67px 102px var(--phone-shadow), inset 0 0 0 4px #c9cdd655`
- `.screen` の背景 `var(--screen-bg)`

| クラス | Bloom | atender | 写る範囲 (実走) |
|---|---|---|---|
| `.phone.shared` (1 枚目、2 枚目へ続く) | 幅 1500、left 405 / top 985、`rotate(-8deg)`、origin 50% 0 | 幅 **1535**、left **414** / top **1010**、`rotate(-8deg)`、origin 50% 0 | 端末高さ 3335 のうちキャンバス内は上端から約 1858px (≒ 画面上端 56%) |
| `.phone.floating` (2 枚目) | 幅 490、left 1988 / top 1635、角丸 83 | 幅 **501**、left **2034** / top **1677**、角丸 **85** | 高さ 1088、下端 2765 < 2868 で全体が写る |
| `.phone.straight` (3〜5 枚目) | 幅 1030、left 130 / top 1025 | 幅 **1054**、left **133** / top **1051** | 高さ 2290、キャンバス内 1817px = 画面上端 79%。左右中央 ((1320 − 1054) / 2 = 133) |

**連続構図 (1・2 枚目の傾き) は使う**。Leader 裁定「配置は Bloom をそのまま移植」に従う。これがストアの横スクロールで 2 枚目以降を見させる仕掛けで、atender でも同じ効果が要る。

### 4-6. 散らし図形 (Bloom の六角形の置き換え)

- 形: **角丸の正方形** (`border-radius: 28%`、時間割のコマの形)。幅 = 高さ = `--size`
- 座標・大きさ・不透明度は Bloom の `cells` 15 件を §4-1 の規則で換算した値 (実走)。色は `i % 6` でブランド 6 色 (teal, blue, indigo, violet, magenta, coral の順)、不透明度 = Bloom の alpha × `--shape-alpha-k` (light は白地で薄すぎるので 2 倍、dark は Bloom と同じ 1 倍)

```js
const cells = [
  [51, 836, 70, .14], [201, 943, 44, .24], [1097, 746, 68, .18],
  [1200, 934, 104, .12], [86, 1590, 54, .18], [38, 2339, 94, .10],
  [1233, 2452, 73, .19], [1359, 898, 50, .17], [2394, 650, 75, .20],
  [2517, 810, 48, .24], [2353, 1149, 115, .10], [2553, 1385, 58, .15],
  [1944, 1477, 54, .22], [2476, 2800, 96, .12], [1463, 2718, 78, .15]
];
// 単独スライドは x < 1320 のものだけ描く (Bloom の x < 1290 を置換)
```

### 4-7. スライドごとの組み立て

```
1 (ペア左)                         2 (ペア右)
┌─────────────────┐┌─────────────────┐
│ Atender           ││ Atender           │
│ 小見出し           ││ 小見出し           │
│ 大見出し 1         ││ 大見出し 1         │
│ 大見出し 2         ││ 大見出し 2         │
│        ▢           ││  ▢           ▢    │
│      ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲     │
│     ╱ 学期・科目 (-8°)    ╲    ┌──┐│
│    ╱ 出席率 NN%  カレンダー │   │ホ│ │
│   │                      ││   │ー│ │
│   │                      ││   │ム│ │
└─────────────────┘└─────────┴──┴┘

3・4 (直立 + バッジ)               5 (直立 + マスコット)
┌─────────────────┐┌─────────────────┐
│ Atender           ││ Atender           │
│ 小見出し           ││ 小見出し           │
│ 大見出し 1         ││ 大見出し 1         │
│ 大見出し2   (バッジ)││ 大見出し2  (マスコ │
│            (  ○  )││            ット)  │
│  ┌──────────┐  ││  ┌──────────┐  │
│  │ 9:41      │  ││  │ ルームの    │  │
│  │ 画面      │  ││  │ 時間割      │  │
│  │ (下 21% は │  ││  │            │  │
└──┴─画面外───┴─┘└──┴──────────┴─┘
```

| slide | 素材 (`COPY` のパス) | 端末 | バッジ | マスコット | `--hl` |
|---|---|---|---|---|---|
| 1 | `shots/s1-semester.png` (`shot`) | `shared` | なし | なし | teal |
| 2 | `shots/s2-home.png` (`subshot`) | `floating` (+ 1 の `shared` の続き) | なし | なし | blue |
| 3 | `shots/s3-courses.png` | `straight` | あり | なし | violet |
| 4 | `shots/s4-templates.png` | `straight` | あり | なし | magenta |
| 5 | `shots/s5-room.png` | `straight` | なし | あり | coral |

### 4-8. 視覚階層 (汎用層 §7-1)

L0 = 大見出し (123/149px 900、1 枚で唯一の最大要素)。L1 = 端末の画面 (面積最大だが見出しの下)。L2 = 小見出し (61px、accent)・バッジ。L3 = ワードマーク・散らし図形。1 枚のサイズ段は 3 段 (大見出し / 小見出し / バッジ)。

### 4-9. 撮影する画面とデモデータの状態

全て light 外観、ステータスバー 9:41 / 電波 4 本 / 電池 100% (§6)、シミュレータ iPhone 16 Pro Max (1320×2868)、デモ seed (§5-4) の `みなと` で撮る。**撮影日は平日 (月〜金)**。

| 素材 | 画面と状態 | 写っているべきもの |
|---|---|---|
| `s1-semester.png` | 学期・科目タブ、スクロール位置は上端 | 学期名「2026 後期」(撮影月による、§5-4)、出席率ヒーロー (「今日までの出席率」+ 大きい % + 「あと N限 休める」)、出席カレンダー (過去 7 週の日が出席 = 緑 / 欠席 = 赤 / 遅刻 = 黄の円) |
| `s2-home.png` | ホームタブ、context = 自分、起動直後 | 時間割グリッド (8 科目、6 色、月〜金 × 1〜4限、空きコマ 5 つ)、下端の出欠タイルが**展開**して「今日は全出席 (N)」(今日の授業は全部未記録なので `defaultExpanded` = true) |
| `s3-courses.png` | 学期・科目タブ、「科目一覧」の見出しが画面の上 30% 以内に来るまで上スクロール | 科目一覧の行末に「あと1回休める」(データベース)・「あと2回休める」(Webデザイン / セキュリティ)・「あと3回休める」・「あと4回休める」が混ざって並ぶ |
| `s4-templates.png` | ホーム → 時間割の設定 (歯車) → 「公開時間割から取り込む」 | 「生わさび専門学校 › 情報処理科」、公開時間割のカード 2 枚 (「情報処理科 2年 後期 Aクラス」8科目・週15コマ・18人が使用 / 「… Bクラス」・9人が使用) |
| `s5-room.png` | ホーム → context chip「生わさび」 | ルームの時間割: みなと・ゆい・はるとのコマが重なり (1 マスに最大 2 枚)、全員が空いているマス (月4・火4・水3・水4・金4) が白く抜ける |

## 5. データモデル / 関数シグネチャ

### 5-1. `index.html` の `COPY`

```ts
type Slide = {
  small: string;          // 小見出し (§3-2 の上限)
  large: string;          // 大見出し。\n で改行、[...] で強調 (A 案のみ)
  shot: string;           // 端末の画像 (slide 2 は '')
  subshot?: string;       // slide 2 の floating 端末の画像
  badge: string;          // '' = バッジなし。\n で改行
  mascot?: boolean;       // slide 5 だけ true
  hl: string;             // 強調色 (ブランドリングの hex)
};
const COPY_SETS: { a: Slide[]; b: Slide[] };   // §3-1 の表を一字も変えずに写す。shot/badge/mascot/hl は a と b で同じ
const DEFAULT_COPY = 'a';                         // Touri が承認ゲートで B を選んだら 'b' に置換
window.COPY_SETS = COPY_SETS;                      // render.mjs と Reviewer が読む
```

URL パラメタ: `?slide=1..5` (範囲外は 1)、`?theme=light|dark` (既定 light、他の値は light)、`?copy=a|b` (既定 `DEFAULT_COPY`、他の値は既定)。`<html>` に `data-theme` を付ける。

強調の描画: `large` を `/\[([^\]]+)\]/` で分割し、括弧内を `<em class="hl">`、それ以外をテキストノードで組む (`innerHTML` を使わない)。`--hl` を canvas に設定。

ready の合図 (Bloom の `dataset.ready` を拡張):
1. `fonts/zenmaru.css` の load を待ち、`document.fonts.load('900 124px "Zen Maru Gothic"', <全スライドの small+large+badge>)` → `dataset.fontLoaded = 'true'|'false'`
2. `document.images` 全てを `img.decode()` (失敗は捕まえる) → 読み込めなかった画像の `src` (ページ相対) を配列にして `dataset.missing = JSON.stringify([...])` (無ければ `'[]'`)
3. `dataset.ready = 'true'`

### 5-2. `render.mjs`

```
node render.mjs [slides=1,2,3,4,5] [theme=light] [copy=a]
```

- `W = 1320, H = 2868`、`setViewport({ width: W, height: H, deviceScaleFactor: 1 })`、`screenshot({ clip: { x: 0, y: 0, width: W, height: H } })`
- URL: `index.html?slide=N&theme=T&copy=C` (file://)
- 出力: `out/<copy>-<theme>/slide-N.png` (例 `out/a-light/slide-1.png`)。ディレクトリは `mkdirSync({recursive:true})`
- Chrome: 既定 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (puppeteer の一時プロファイル、ユーザーのプロファイルに触れない)。`CHROME=cft` で Chrome for Testing、`CHROME=<path>` で任意。Chrome for Testing 148 は CDP 無応答なので既定にしない (Bloom と同じ、`knowledge/tool-quirk/headless-chrome-screenshot-hang-macos.md`)
- 各スライドで `dataset.fontLoaded !== 'true'` または `dataset.missing !== '[]'` なら、そのスライドの PNG を**書かずに** `console.error` に理由を出し、全スライド処理後に `process.exit(1)` (Bloom は fontLoaded をログに出すだけで、フォント無し・素材欠けの画像を黙って出せた)
- 成功時は 1 行 `<path> (fontLoaded=true)` を出す (Bloom と同形式)
- `theme` / `copy` が `light|dark` / `a|b` 以外なら usage を出して exit 2

### 5-3. `render.sh`

```
bash render.sh [theme=light] [copy=a] [slides=1,2,3,4,5]
```
`set -euo pipefail`、`cd` 自分のディレクトリ → `node_modules/puppeteer-core` が無ければ `npm i --no-audit --no-fund` → `fonts/zenmaru.css` が無ければ `python3 -I vendor-fonts.py zenmaru` → `node render.mjs "$SLIDES" "$THEME" "$COPY"` → `sips -g pixelWidth -g pixelHeight out/"$COPY-$THEME"/slide-*.png` で寸法表示 (Bloom の `grep | paste` 整形はそのまま)。

### 5-4. ストア用デモ seed `apps/api/scripts/seed-store-demo.ts`

```ts
export type StoreDemoSeedResult = {
  userId: "store-demo-user";
  bearerToken: "store-demo-bearer-token-0001";
  semesterId: string;
  semesterName: string;      // "2026 後期" 等
  roomId: string;
  templateIds: [string, string];   // [Aクラス, Bクラス]
  today: string;             // YYYY-MM-DD (プロセス TZ。撮影マシンは Asia/Tokyo)
};
export async function seedStoreDemo(opts?: { now?: Date }): Promise<StoreDemoSeedResult>;
// ファイル末尾: 直接実行されたときだけ main() (import.meta.url === pathToFileURL(process.argv[1]).href)。
// main は seedStoreDemo() の結果を JSON で stdout に出して exit 0。STORE_DEMO_WEEKEND は exit 2、その他の例外は exit 1。
```

`prisma` は既存 seed と同じく `../src/db` から import。日付は既存 seed と同じく `dayjs(now)` のプロセス TZ で `startOf("day")`。`today = dayjs(now).startOf("day")`。

**ガード (何も書き込む前に判定)**:
- `process.env.NODE_ENV === "production"` → `throw new Error("STORE_DEMO_REFUSED_PRODUCTION")`
- `process.env.DATABASE_URL` が `file:` で始まらない → `throw new Error("STORE_DEMO_REQUIRES_SQLITE_FILE_DB")`
- `today.day()` が 0 (日) か 6 (土) → `throw new Error("STORE_DEMO_WEEKEND")` (今日の授業が無いと素材 2 の出欠タイルが出ない)

**掃除 (冪等)**: `timetableTemplate.deleteMany({ where: { authorUserId: { in: [ゆい, はると] } } })` → `user.deleteMany({ where: { id: { in: ["store-demo-user", "store-demo-yui", "store-demo-haruto"] } } })` (時間割・出欠・ルーム・会員・友達・session は cascade)。学校・学科は消さない (次の upsert で再利用)。**`demo-user-ios` 系 (既存 seed) の行には触れない**。

**学校・学科**: `school.findFirst({ where: { name: "生わさび専門学校", mextCode: null } })`、無ければ `create({ name: "生わさび専門学校", kind: "VOCATIONAL_SCHOOL" })`。学科は `department.upsert({ where: { schoolId_name: { schoolId, name: "情報処理科" } }, ... })`。

**学期** (3 ユーザー共通の値、各自に 1 行ずつ):
- 名前: 月 m・年 y (`today`) で `4 ≤ m ≤ 9` → `"${y} 前期"`、`m ≥ 10` → `"${y} 後期"`、`m ≤ 3` → `"${y-1} 後期"`。term (`前期`/`後期`) は同じ規則
- `startDate = today − 49 日` (00:00)、`endDate = today + 77 日` (endOf day)。過去 49 日 = 各曜日ちょうど 7 回
- 各ユーザーの `defaultSemesterId` に設定

**ユーザー**:

| id | name | handle | email | 備考 |
|---|---|---|---|---|
| `store-demo-user` | みなと | `minato` | `store-demo@atender.local` | `requiredAttendanceRate: 80`、学校・学科を設定、`emailVerified: true` |
| `store-demo-yui` | ゆい | `yui` | `store-demo-yui@atender.local` | 同上 (rate は既定) |
| `store-demo-haruto` | はると | `haruto` | `store-demo-haruto@atender.local` | 同上 |

友達: みなと → ゆい / みなと → はると を `ACCEPTED` (acceptedAt = now)。
Session: `{ id: "store-demo-session", userId: "store-demo-user", token: "store-demo-bearer-token-0001", expiresAt: now + 365 日 }`。

**時限** (3 人とも同じ、`daysOfWeek: "1,2,3,4,5"`): 1限 9:00–10:30 / 2限 10:40–12:10 / 3限 13:00–14:30 / 4限 14:40–16:10 (分で 540/630, 640/730, 780/870, 880/970)。時間割の title = `${semesterName} 時間割`。

**みなとの科目** (色は `CourseEditModal` のパレット `#12B172 #56D8C3 #568CFC #A978FA #FC6ABF #FD728E` から。教員名・教室は架空):

| 科目 | 色 | 教員 | コマ (曜は 1=月) | 教室 | maxAbsences | tardiesPerAbsence | 欠席させる授業回 | 遅刻させる授業回 | 期待の行末表示 |
|---|---|---|---|---|---|---|---|---|---|
| Java演習 | `#568CFC` | 小林先生 | 月1-2 (2コマ連続)、木1 | PC1 | 5 | 3 | index 1 | index 2, 4 | あと4回休める |
| データベース | `#A978FA` | 田中先生 | 火3、金3 | PC2 | 4 | null | index 1, 3, 5 | なし | あと1回休める |
| ネットワーク | `#56D8C3` | 森先生 | 月3、水2 | 305 | 4 | null | なし | なし | あと4回休める |
| Webデザイン | `#FC6ABF` | 石井先生 | 火1-2 (2コマ連続) | PC3 | 3 | 3 | index 1 | index 2, 4 | あと2回休める |
| セキュリティ | `#12B172` | 岡田先生 | 水1、金2 | 301 | 4 | null | index 1, 3 | なし | あと2回休める |
| ビジネス英語 | `#FD728E` | 上田先生 | 木2 | 201 | 4 | null | なし | なし | あと4回休める |
| 卒業制作 | `#56D8C3` | 西村先生 | 木3-4 (2コマ連続) | PC1 | 3 | null | なし | なし | あと3回休める |
| キャリア講座 | `#A978FA` | 西村先生 | 金1 | 大教室 | 3 | null | なし | なし | あと3回休める |

- 全科目 `requiredAttendanceRate: null` (科目の率を設定すると `limitedBy` が率に寄り、回数が科目の上限から読めなくなる)
- 「授業回」= 科目の過去 occurrence を日付で束ねたもの (`attendanceStats.ts` の `lessons` と同じ単位。2コマ連続は 1 回)。日付昇順に index 0 から振る。**欠席・遅刻は授業回の全コマに同じ status を付ける**。それ以外の過去授業回は `PRESENT`。今日以降は記録しない (今日の授業は未記録 = 素材 2 の「今日は全出席 (N)」)
- 期待表示の導出 (Reviewer 用): 欠席回数 + floor(遅刻回数 / tardiesPerAbsence) を maxAbsences から引く。例 Webデザイン = 3 − (1 + floor(2/3)) = 2。残り授業回は全科目 ≥ 11 なので「残り全休OK」にならない
- **遅刻は tardiesPerAbsence を持つ科目 (Java演習・Webデザイン) にだけ付ける**。換算の無い科目の遅刻は既定ルール `tardyStrategy = HALF_PRESENT` で 0.5 回の欠席になり (`attendanceStats.ts` の `lessonWeight`)、行末の回数が 1 減って表の値と合わなくなる
- 埋まるマス (15 コマ): 月1,2,3 / 火1,2,3 / 水1,2 / 木1,2,3,4 / 金1,2,3。空き: 月4・火4・水3・水4・金4
- `generateOccurrencesForUserTimetable` で occurrence を作ってから出欠を付ける (既存 seed と同じ)

**ゆい・はるとの科目** (出欠は付けない):

| ユーザー | 科目 (色) | コマ |
|---|---|---|
| ゆい | Java演習 (`#568CFC`) | 月1-2、木1 |
| ゆい | データベース (`#A978FA`) | 火3、金3 |
| ゆい | CGデザイン (`#FC6ABF`) | 水2 |
| はると | ネットワーク (`#56D8C3`) | 月3 |
| はると | セキュリティ (`#12B172`) | 水1 |
| はると | 卒業制作 (`#56D8C3`) | 木3-4 |
| はると | キャリア講座 (`#A978FA`) | 金1 |

→ ルームでは月1-2・月3・火3・水1・水2・木1・木3-4・金1・金3 が 2 枚、他の埋まりマスは 1 枚、空き 5 マスは全員空き (1 マス最大 2 枚。3 枚並ぶと 6.9" でも 1 枚 23pt 幅で科目名が読めない)。

**ルーム**: `{ name: "生わさび", description: "情報処理科 2年の仲間", createdByUserId: みなと, showMemberTimetables: true }`、会員 = みなと (OWNER)・ゆい・はると (MEMBER)。RoomEvent は作らない (build 21 でカレンダー撤去済み)。

**公開時間割** (2 件、`schoolId`/`departmentId` = 生わさび/情報処理科、`isPublic: true`、`year: 2`、`term` = 学期の term、`daysOfWeek: "1,2,3,4,5"`):

| title | author | copyCount | description | 中身 |
|---|---|---|---|---|
| `情報処理科 2年 ${term} Aクラス` | ゆい | 18 | `Aクラスの${term}の時間割` | みなとの 4 時限・8 科目 (名前・色・教員)・15 コマ (曜・限・連続・教室) をそのまま写す |
| `情報処理科 2年 ${term} Bクラス` | はると | 9 | `Bクラスの${term}の時間割` | 同じ 8 科目。コマは A の火曜と木曜を入れ替えたもの (火 ↔ 木) |

### 5-5. 撮影 UITest `apps/ios/AtenderUITests/StoreShotsFlow.swift`

```swift
@MainActor
final class StoreShotsFlow: XCTestCase {
    // launchEnvironment["ATENDER_UI_TEST_BEARER_TOKEN"] = "store-demo-bearer-token-0001"
    func testCaptureStoreShots()
}
```

既存 `ScreenshotFlow.swift` の `snap` / `tapButton` の作法を踏襲 (`XCTAttachment(screenshot: XCUIScreen.main.screenshot())`、`lifetime = .keepAlways`、名前は下表)。`continueAfterFailure = false` (1 枚でも辿れなければ止める。ScreenshotFlow の「失敗しても撮り続ける」は検証用で、ストア素材では誤った画面を素材にする)。

| 手順 | 操作 | 待つもの (≤10 秒、無ければ `XCTFail`) | attachment 名 |
|---|---|---|---|
| 1 | `app.launch()` | `cta-expand-toggle` が存在 (出欠タイル展開済み) | — |
| 2 | 1 秒待つ | — | `s2-home` |
| 3 | タブ「学期・科目」を tap | staticText「今日までの出席率」 | — |
| 4 | 2 秒待つ | — | `s1-semester` |
| 5 | staticText「科目一覧」の `frame.minY` が画面高 × 0.3 を下回るまで `app.swipeUp()` (最大 4 回、超えたら XCTFail) → 1 秒待つ | — | `s3-courses` |
| 6 | タブ「ホーム」→ ボタン「時間割の設定」→ `timetable-settings-import-template` を tap | identifier が `template-card-` で始まる要素 | — |
| 7 | 2 秒待つ | — | `s4-templates` |
| 8 | `app.terminate()` → `app.launch()` → ボタン (label CONTAINS「生わさび」) を tap | `room-timetable` | — |
| 9 | 2 秒待つ | — | `s5-room` |

`xcresulttool export attachments` の manifest で名前を引き、`mocks/store/shots/<名前>.png` にコピーする (§6 手順 6)。`simctl io screenshot` を使わない理由は §10。

## 6. パイプライン (コマンド列)

atender ルート (`projects/atender/`) で。Touri の手元のターミナルで実行する (AI の背景プロセスの API はターン終了で kill される — CLAUDE.md)。

```sh
# 0. 一度だけ: 撮影専用シミュレータ (共有の端末を汚さない)
xcrun simctl create "Atender Store 6.9" com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max com.apple.CoreSimulator.SimRuntime.iOS-26-5
#    → 出力の UDID を以下 $SIM に入れる

# 1. API + seed (平日に実行)
cd apps/api
pnpm exec prisma generate
pnpm exec tsx watch --env-file=.env src/index.ts            # 別ターミナルで起動したまま
pnpm exec tsx --env-file=.env scripts/seed-store-demo.ts    # → JSON (bearerToken: store-demo-bearer-token-0001)

# 2. シミュレータの外観とステータスバー
xcrun simctl boot $SIM
xcrun simctl ui $SIM appearance light
xcrun simctl status_bar $SIM override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3

# 3. ディスプレイスリープ対策 (headless 撮影の全滅を防ぐ — knowledge/gotcha/macos-display-sleep-blocks-headless-screenshot.md)
nohup caffeinate -d -u -t 1800 > /dev/null 2>&1 &

# 4. 素材 5 枚を撮る (main の最新で。build 22 のホーム行高変更を含めた見た目で撮る)
cd ../ios
/opt/homebrew/bin/xcodegen generate
xcodebuild test -project Atender.xcodeproj -scheme AtenderUITests \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:AtenderUITests/StoreShotsFlow/testCaptureStoreShots \
  -resultBundlePath build/store-shots.xcresult > build/store-shots.log 2>&1
#    出力は tail/grep にパイプしない (CLAUDE.md)。結果は build/store-shots.log の末尾で見る

# 5. attachment を書き出し
xcrun xcresulttool export attachments --path build/store-shots.xcresult --output-path build/store-shots

# 6. 名前を復元して mocks/store/shots/ へ (manifest.json の suggestedHumanReadableName → exportedFileName)
python3 -I - <<'PY'
import json, shutil, pathlib
src = pathlib.Path('build/store-shots'); dst = pathlib.Path('../../mocks/store/shots'); dst.mkdir(parents=True, exist_ok=True)
for test in json.loads((src / 'manifest.json').read_text()):
    for a in test.get('attachments', []):
        name = a['suggestedHumanReadableName'].split('_')[0]   # "s1-semester_0_<uuid>.png" 等 → "s1-semester"
        if name in {'s1-semester', 's2-home', 's3-courses', 's4-templates', 's5-room'}:
            shutil.copyfile(src / a['exportedFileName'], dst / f'{name}.png')
PY
sips -g pixelWidth -g pixelHeight ../../mocks/store/shots/*.png   # 全て 1320×2868 であること
xcrun simctl status_bar $SIM clear

# 7. 合成 (比較用に 4 通り。承認ゲートで Touri が見る)
cd ../../mocks/store
bash render.sh light a ; bash render.sh light b ; bash render.sh dark a ; bash render.sh dark b

# 8. Touri が選んだ組 (推奨 a-light) を提出用に置く
mkdir -p ../../assets/store/1.0.1
cp out/a-light/slide-{1,2,3,4,5}.png ../../assets/store/1.0.1/
```

- manifest の `suggestedHumanReadableName` の形式は xcresulttool の版で変わり得る。手順 6 で 5 枚が揃わなかったら manifest.json を開いて区切りを合わせる (名前の先頭が attachment 名であることは変わらない)
- `mocks/store/shots/` と `out/` は git に入れない (`.gitignore`)。コミットするのは `assets/store/1.0.1/slide-*.png` と `mocks/store/` のソース一式だけ
- ステータスバーの override は手順 4 の撮影 (XCUIScreen) にも効く。手順 6 の後で `s*.png` の左上が 9:41 になっていなければ止めて Leader に報告する (撮り方を変える判断が要る)

## 7. 挙動仕様 (Reviewer 用、軽量)

ストア画像そのものは Touri の目視 (承認ゲート) が最終判定。自動検証は「出力の形」と「seed の数値」だけ。

### SS (HTML / render)

- **SS1** `node render.mjs 1,2,3,4,5 light a` (shots/ に 5 枚あり) で `out/a-light/slide-{1..5}.png` が 5 枚でき、全て PNG・**1320×2868** (`sips` か PNG ヘッダの IHDR)
- **SS2** 同じく `dark b` → `out/b-dark/slide-{1..5}.png` が 5 枚、1320×2868
- **SS3** `index.html` を puppeteer で開いて `window.COPY_SETS` を読むと、`a` と `b` がそれぞれ 5 要素で、`small` / `large` / `badge` が §3-1 の表と完全一致 (`\n` と `[ ]` を含めて)。`a[i].shot` と `b[i].shot`、`badge`、`mascot`、`hl` は同じ値
- **SS4** §3-2 の文字数の上限を `COPY_SETS` の全要素が満たす (`[` `]` `\n` を除いて数える)
- **SS5** `?slide=3&copy=a` の DOM: `h1` のテキストが `科目ごとにすぐ分かる` (改行は pre-line の `\n`)、`h1 em.hl` が 1 個でテキスト `科目ごと`。`?copy=b` では `em.hl` が 0 個
- **SS6** `?slide=5` の DOM に `.mascot` の img が 1 個、`.badge` が 0 個。`?slide=3` と `?slide=4` は `.badge` 1 個・`.mascot` 0 個。`?slide=1` と `?slide=2` は両方 0 個
- **SS7** `?slide=1` と `?slide=2` の `.canvas` は幅 2640 (`.pair`)、`slide=2` は `translateX(-1320px)`。`slide=3..5` は幅 1320
- **SS8** `?theme=dark` で `<html data-theme="dark">`、ワードマークの img の `src` が `wordmark-white.png` で終わる。既定 (パラメタ無し / `theme=foo`) は `light` で `wordmark-navy.png`
- **SS9** `shots/s3-courses.png` を一時的に退避して `node render.mjs 3` → exit code 1、`out/a-light/slide-3.png` が**作られない** (事前に消しておく)、stderr に `shots/s3-courses.png` を含む
- **SS10** `fonts/zenmaru.css` を一時的に退避して `node render.mjs 1` → exit code 1、`slide-1.png` が作られない
- **SS11** `node render.mjs 1 sepia` → exit code 2
- **SS12** `git check-ignore -q mocks/store/shots/s1-semester.png mocks/store/out/a-light/slide-1.png mocks/store/fonts/zenmaru.css mocks/store/node_modules/x` が全て ignored (exit 0)、`git ls-files mocks/store/shots mocks/store/out mocks/store/fonts` が空
- **SS13** `assets/store/1.0.1/slide-{1..5}.png` が存在し全て 1320×2868 (実画像は撮影後に置かれるので、Reviewer の時点で無ければ SKIP と明記して報告)

SS1〜SS11 は素材の代わりに 1320×2868 の単色 PNG 5 枚を `shots/` に作って走らせてよい (テストの後で消す)。

### SD (seed)

`apps/api/tests/store-demo-seed.test.ts` (vitest、既存 `tests/setup.ts` の DB)。`now = new Date("2026-10-28T01:00:00.000Z")` (水曜、JST 10:00 / UTC でも水曜) を渡す。

- **SD1** `seedStoreDemo({ now })` が返す `bearerToken` で `GET /api/me` が 200、user.name `みなと`、schoolName `生わさび専門学校`、departmentName `情報処理科`
- **SD2** `semesterName` が `2026 後期`。学期の startDate が 2026-09-09、endDate が 2027-01-13 (プロセス TZ の日付で比較)
- **SD3** `computeCourseStats({ semesterId, userId, requiredAttendanceRate: 80, now })` の各科目の `allowedAbsenceLessons` が §5-4 の表: Java演習 4 / データベース 1 / ネットワーク 4 / Webデザイン 2 / セキュリティ 2 / ビジネス英語 4 / 卒業制作 3 / キャリア講座 3。全科目 `limitedBy === "count"`
- **SD4** 今日 (2026-10-28 水) の みなとの occurrence は 水1・水2 の 2 件で、どちらも AttendanceRecord が無い
- **SD5** `getRoomWeek(みなとの userId, roomId, 今週の月曜 2026-10-26)` の `members` が 3 人、`recurringMeetings` が **21** 件 (meeting 行数。下の注)
- **SD6** `GET /api/timetable-templates?schoolId&departmentId` (みなとの token) に Aクラス (copyCount 18) と Bクラス (copyCount 9) が含まれ、両方 courses 8 件・meetings の periodCount 合計 15
- **SD7** 冪等: 2 回続けて呼んだ後、`store-demo-*` ユーザー 3、みなとの course 8、ルーム「生わさび」(createdBy みなと) 1、ゆい・はると著の template 2、school 名「生わさび専門学校」1、session token 1
- **SD8** 既存行に触れない: 呼ぶ前に作った `demo-user-ios` (と その session) が呼んだ後も存在する
- **SD9** `now` が土曜 (`2026-10-31T01:00:00.000Z`) → `STORE_DEMO_WEEKEND` で reject、`store-demo-user` が作られていない (事前に掃除した状態から)
- **SD10** `DATABASE_URL` を `postgresql://x` に一時差し替え → `STORE_DEMO_REQUIRES_SQLITE_FILE_DB` で reject (DB に触れる前)

> SD5 の件数: meeting 行 (2コマ連続は 1 行) は みなと = Java 2 (月・木) + DB 2 + ネット 2 + Web 1 + セキュ 2 + 英語 1 + 卒制 1 + キャリア 1 = **12**、ゆい = Java 2 + DB 2 + CG 1 = **5**、はると = ネット 1 + セキュ 1 + 卒制 1 + キャリア 1 = **4** → **21**。
>
> SD4 の補足: 2026-10-28 (水) の みなとのコマは セキュリティ 水1 と ネットワーク 水2。

### SF (撮影 UITest)

自動テストとしては走らせない (dev API とストア seed が要る)。Reviewer は `StoreShotsFlow.swift` が §5-5 の attachment 名 5 つをちょうど 1 回ずつ使い、token が `store-demo-bearer-token-0001` であることを grep で確認するだけ。

## 8. テスト基盤

- API: vitest (`apps/api/vitest.config.ts`、`tests/**/*.test.ts`、`tests/setup.ts`)。新規 `apps/api/tests/store-demo-seed.test.ts` (SD1〜SD10)。`pnpm --filter api exec vitest run tests/store-demo-seed.test.ts`
- HTML / render: Node の使い捨てスクリプトか `node --test` を `mocks/store/` で (puppeteer-core は同ディレクトリの依存)。SS1〜SS12。Chrome は `/Applications/Google Chrome.app` (Chrome for Testing は CDP 無応答)。撮影前に `caffeinate -d -u` (ディスプレイスリープで captureScreenshot が全滅)
- iOS: 追加の自動テストなし (SF は grep 確認のみ)
- ベースライン: 本変更はアプリ本体に触れないので known-failures の照合対象外。API は新規テストファイル 1 本だけ

## 9. Touri 判断点 (承認ゲート)

1. **コピー A / B** — 推奨 A (ポップ)。手順 7 の 4 通りの出力 (`out/{a,b}-{light,dark}/`) を並べて選ぶ
2. **白基調 / 黒基調** — 推奨 light (atender のブランドは白地 + azure + 6 色。黒は Bloom の色)。`?theme=dark` で同じ構図の黒版を出せる
3. **マスコット** — 推奨: 5 枚目に置く (1 枚目はペア構図の傾いた端末が右半分を占め、置き場が無い)。無しにするなら slide 5 の `mascot: false` + バッジ「メンバーは QR で招待」等を追加 (文言は別途)
4. **落とした訴求 (カレンダー書き出し)** の扱い — 推奨: 画像では落とし、ASC の説明文で触れる

## 10. 不採用案

- **`transform: scale()` で Bloom の 1290×2796 を 1320×2868 に拡大**: 縦横の倍率が違う (1.0233 / 1.0258) ので一律の scale ではキャンバスが埋まらないか、はみ出す。非等倍 scale は文字が歪む。素材も 1320×2868 の実寸を一度縮めてから拡大することになる
- **1290×2796 で出す (Bloom の CSS を無改変)**: ASC は受理するが、既存の公開中 5 枚 (1320×2868) と寸法が変わり、素材 (16 Pro Max の実寸) を `cover` で縮める
- **黒基調 (Bloom の配色そのまま) を既定にする**: Bloom のブランド色で、atender の DESIGN.md (白地 + azure + 6 色 tint) と App Icon (白地にリング) と合わない。`?theme=dark` の切替としてだけ残す
- **六角形の散らし**: Bloom の地図セルの形で atender に意味が無い。時間割のコマの角丸正方形に置換
- **App Icon + 「Atender」テキストを左上に**: ワードマーク画像が実在する (navy / white)。アイコンを並べると左上の要素が 2 つになり、Bloom の「ワードマーク 1 つ」の構図から外れる
- **ワードマークを 1 枚目だけに置く**: Bloom は全枚に置いている (ストアで個別に拡大表示されたときもブランドが分かる)。踏襲
- **`xcrun simctl io screenshot` で素材を撮る (Leader 案)**: simctl は画面遷移 (タブ切替・スクロール・シート) を操作できない。5 画面中 4 画面が遷移の先にあり、手で操作すると状態 (スクロール位置・展開) が再現しない。既存 `ScreenshotFlow.swift` と同じ XCUITest で辿って XCUIScreen で撮る (ステータスバー override は XCUIScreen の撮影にも効く。効いていなければ §6 の末尾の規則で止める)
- **既存 `seed-demo-user.ts` を流用**: 科目名・人名が素朴で (「デモ太郎」「英語」)、実在しうる教員名 (村木先生) を含み、UI テスト用の状態 (終了学期・退会用ユーザー・個人予定) と混ざる。別ユーザー・別 token で独立させ、既存 UI テストの前提を壊さない
- **科目ごとの必要出席率も設定して「率と回数の厳しい方」を見せる**: 行末が「下回る見込み」/「あと N回」と混在し、どの基準で出た数字か画像から読めない。回数だけにして行末の表記を揃える
- **iPhone 17 Pro Max (既存のシミュレータ) で撮る**: 同寸 (1320×2868) で撮れるが、Leader 指定が 16 Pro Max で、共有のシミュレータは他の作業と状態 (ログイン・status_bar) を取り合う。撮影専用端末を作る
- **3 枚目を科目詳細モーダルにする**: 「基準: 欠席 4 回まで」と履歴の数は出るが「あと N 回」の答えが画面に無い。科目一覧の行末が答えそのもの
- **4 枚目をオンボーディングの「同じ学科の時間割が見つかりました」にする**: 未セットアップのユーザーが要り、seed とログイン状態が増える。設定からの公開時間割一覧で「学校 › 学科」とカードが同じく写る

## 11. 申し送り (Leader 宛)

- ワードマークは実在する (`apps/ios/Atender/Assets.xcassets/wordmark.imageset/wordmark-{navy,white}.png`、877×196、透過)。ブリーフの「無い」を置換して全枚の左上に使った
- iPhone 16 Pro Max のシミュレータはこの Mac に無い (17 Pro Max だけ)。§6 手順 0 で撮影専用に作る (runtime iOS 26.5 は存在確認済み)
- 撮影は `simctl io screenshot` でなく XCUITest + XCUIScreen (§10)。ステータスバーの override はそのまま使う
- seed は平日にしか走らない (土日は exit 2)。撮影は平日に行う
- CLAUDE.md の build 22 (ホームの行高変更) が main に入ってから撮る (素材 2・5 の時間割の見た目が変わるため)
- 素材の撮り直し・再生成の手順は本 doc §6 が正典。採用が決まったら atender の CLAUDE.md「主要ワークフロー」に「ストア画像を作り直す」の 1 項目 (本 doc へのポインタ) を足すと別セッションで再発明しない
