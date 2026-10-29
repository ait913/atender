# atender LP v2 — LP としてのページ構成に組み直す (`https://atender.aisaba.net`)

| 版 | 日付 | 内容 |
|---|---|---|
| R0 | 2026-10-30 | 初版。Touri FB「ストア画像を重ねただけでなく、ページとして作って。雰囲気はこれでいい」+ Leader 裁定 1〜9 |

> **正典の関係**: 本 doc は旧 doc `.designs/20261030-landing-page-and-social-image.md` の **§3 (LP の UI/UX: §3-1〜§3-8 のうち §3-1〜§3-7)・§6 の LH・§7-2〜§7-3 の LP 部分** を置き換える。旧 doc の **§2 (素材の判断)・§3-8 (App Store バッジの規約)・§4 (SNS 画像と切り出し)・§5 (Docker / nginx / Coolify)・§6 の LP / SI / ST** はそのまま有効で、本 doc から参照する。
> 雰囲気 (配色トークン・Zen Maru Gothic・散らし図形・マーカー強調・コピー A 案・アテンドくん) は旧 doc §3 / ストア doc §3〜§4 のものを**そのまま使い、新しいトーンを作らない**。
> 1 worktree・1 ブランチ `feature/lp-v2-layout`。挙動 ID: **LV** (LP v2 の HTML / 表示)、**EX** (切り出し。旧 doc の EX1 を本 doc で置換)。

## 0. スコープ

### 0-1. 触るファイル (全列挙)

| パス | 新規 / 変更 | 内容 |
|---|---|---|
| `apps/lp/site/index.html` | 変更 (全置換) | §7 全文 |
| `apps/lp/site/style.css` | 変更 (全置換) | §8 全文 |
| `apps/lp/site/img/mascot-chat.webp` | 新規 (生成物をコミット) | `extract-phones.py` の出力 (§6-2)。403×403 |
| `apps/lp/site/img/mascot-run.webp` | 新規 (生成物をコミット) | 同上。355×355 |
| `mocks/social/extract-phones.py` | 変更 | `mascot()` に 2 行追加 + 定数 1 つ (§6-2) |
| `mocks/social/lp-shots.mjs` | 変更 | lazy 画像を読ませるスクロール段を追加、正典コメントを本 doc に (§10-2) |
| `apps/lp/README.md` | 変更 | 1 行目を §12 の文言に置換 |
| `.designs/20261030-landing-page-and-social-image.md` | 変更 | 先頭に 1 行追記 (§12) |
| `CLAUDE.md` (atender) | 変更 | 「LP / SNS 画像を更新する」の正典の 1 文を置換 (§12) |

**触らないもの**: `apps/lp/nginx.conf` (CSP 含む)・`apps/lp/Dockerfile`・`apps/lp/site/fonts/**`・既存の画像 6 枚 (`hero-phones` / `phone-2..5` / `mascot-hello`)・`app-store-badge-ja.svg`・`wordmark-navy.png`・favicon 類・`robots.txt`・`og-1200x630.png`・`mocks/social/index.html` / `render.mjs` / `render.sh` / `README.md`・`assets/**`・`apps/web/**`・`apps/api/**`・`apps/ios/**`。Coolify の設定 (既存 `atender-lp` を deploy するだけ)。OG / SNS 画像は変更なし。

### 0-2. JS と CSP

v2 も **JS を 1 行も持たない**。nginx の CSP (`default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; …`) は変えない。v2 で新しく使うものと CSP の関係:

| 使うもの | CSP 上の扱い |
|---|---|
| インライン `<svg>` (共感カードのアイコン 3 つ) | DOM の要素であり取得 (fetch) が発生しないので `img-src` の対象外。`fill` / `stroke` は表示属性で、`style` 属性ではない (`style-src` の対象外) |
| `loading="lazy"` | HTML 属性。CSP と無関係 |
| `text-wrap: balance / pretty`、`aspect-ratio`、`color-mix()` | `style.css` 内 (`'self'`) |

## 1. 目的

v1 はストア画像 5 枚を 1:1 で節にした縦積みで、「スライドを重ねただけ」に見えた (Touri FB)。雰囲気はそのままに、LP の定石 (Hero → 共感 → 使い方 → 機能 → 社会的な使い方 → 一覧 → FAQ → CTA) で**読み進めるページ**に組み直す。到達目標は「App Store / Web 版へ 1 タップ」で v1 と変わらない。

## 2. IA — 節の順序と根拠

| # | 節 | 役割 | 根拠 |
|---|---|---|---|
| 1 | Hero | 何のアプリかを 1 画面で言い切り、入手先を出す | 着地直後の最頻タスク = 入手。v1 と同じくバッジを 375×667 の初期表示に入れる |
| 2 | こんなこと、ない？ (共感) | 読み手の困りごとを 3 つ並べ「自分の話だ」と思わせる | Hero のコピーは結論。結論の前提 (困っていること) を次に置くと、続く「使い方」「機能」が答えとして読める |
| 3 | 使い方 (3 ステップ) | 始めるまでの手順を短く見せる | 「面倒そう」という離脱理由を機能の詳細より先に潰す。共感の 3 つと 1:1 に対応させない (対応させると同じ話を 2 回する) — 共感は「困りごと」、使い方は「操作の順」 |
| 4 | 主な機能 (交互 2 カラム × 3) | コピー A 案 2〜4 を見出しに、画面と箇条書きで中身を見せる | 使い方で流れを掴んだ後に、1 機能ずつ画面で確かめる。並びは A 案の番号順 (= ストアの 2〜4 枚目。毎日使う → 不安を消す → 始めるのが楽) |
| 5 | 友達 (帯) | A 案 5。1 人用の機能から「友達と使う」へ視点を変える | 唯一の対人機能なので色帯で節の雰囲気を変え、ページ後半の山にする |
| 6 | できること (一覧) | 機能の網羅 (カレンダー書き出し・新学期の引き継ぎ・ログイン等) | 4・5 で拾わない機能の受け皿。ASC の箇条書きと同文 |
| 7 | よくある質問 | 入手前の確認事項 (料金・対応端末・ログイン・退会) を潰す | CTA の直前に置き、最後の迷いを消してから CTA |
| 8 | 最終 CTA | 読み終えた位置から 1 タップ | v1 の締めの CTA を見出し付きに |
| — | フッター | 法務・サポート・© | v1 と同じリンク先 |

ナビゲーション (ヘッダーのメニュー・アンカー) は置かない (1 ページの縦スクロールで完結。汎用層 §6「長ページ回避は神話」)。ヘッダーはロゴのみ (v1 と同じ)。

## 3. UI/UX の規則

### 3-1. 視覚階層 (汎用層 §7-1)

| 段 | 要素 | 段の作り方 (mobile / ≥960px) |
|---|---|---|
| L0 | Hero の h1「もう出席率で焦らない」 | 900 / 44px・64px。ページで唯一の h1 |
| L1 | 各節の h2、機能行の h3 (`.row-title` = A 案の大見出し)、端末画像 | 900 / 28px・44px。`.row-title` は h3 だが見た目は h2 と同じ段 (A 案は節の主役なので) |
| L2 | 小見出し `.small` (accent)・カード / ステップの h3・App Store バッジ | `.small` 700 / 19px・24px。カード h3 700 / 18px・20px |
| L3 | 補助文・箇条書き・FAQ・フッター・図形・ワードマーク | 500 / 16px・17px。フッター 14px、© 13px |

1 画面に見えるサイズ段は「見出し / 小見出し・カード見出し / 本文」の 3 段 (汎用層 §1)。

### 3-2. 動線 (汎用層 §7-2)

最頻タスク = App Store で入手。Hero のバッジは 375×667 の初期表示に入る (実測: 375px 幅でバッジ下端 429px ≤ 667。320px 幅でも 429px)。同じバッジ + Web 版リンクを最終 CTA にも置く。FAQ の「Web 版」もリンク。タップ数はどこからでも 1。

### 3-3. トークン (旧 doc §3-5 から引き継ぎ + 追加)

引き継ぎ (値を変えない): `--bg` `--glow` `--glow-mid` `--ink` `--accent-600` `--phone-shadow` `--line` `--teal` `--blue` `--indigo` `--violet` `--magenta` `--coral` `--shape-alpha-k` `--font`、マーカー `em.hl` (下 40% に `--hl` 45%)、散らし図形 `.shape` (角丸 28%、不透明度 = alpha × 2)。

| 追加 / 削除 | トークン | 値 | 用途 |
|---|---|---|---|
| 追加 | `--band` | `color-mix(in srgb, #1E96E6 8%, #FFFFFF)` (= `#EDF7FD`) | 友達の帯の背景 (azure の薄い tint) |
| 追加 | `--card-shadow` | `0 8px 24px rgba(48, 65, 91, .06)` | 共感カード |
| 追加 | `--gap` | 64px / ≥960px で 96px | 節の間隔 (裁定 2) |
| 削除 | `--badge-bg` `--badge-fg` | — | v1 の円バッジを v2 では使わない (§13) |

`.stage` (機能行の画像の台) の背景は `color-mix(in srgb, var(--hl) 14%, #FFFFFF)` — 行ごとのマーカー色 (blue / violet / magenta) の tint。実測: blue `#E7EFFF`、violet `#F3ECFE`、magenta `#FFEAF6`。

### 3-4. レイアウトの数値 (裁定 2)

| 項目 | 値 |
|---|---|
| コンテナ | `.wrap` max-width 1120px、左右 padding 20px / ≥960px で 40px (中身の最大幅 1040px) |
| 節の間隔 | 通常の節 `.sec` は上下 padding = `--gap / 2` → 隣り合う節の中身の間 = `--gap` (64 / 96px)。Hero の直後の節は上 padding = `--gap`。帯は上下 margin `--gap / 2` で外側の間隔を揃え、内側は上 padding `--gap`・下 0 (端末が帯の下端で切れる) |
| ブレークポイント | 960px の 1 本 (v1 踏襲)。`@media (min-width: 960px)` |
| 2 カラム | Hero・帯 = `.split` (1fr 1fr、column-gap 48px、端末を下端に揃える)。機能行 = `.row` (1fr 1fr、column-gap 64px、縦中央揃え)、2 行目だけ画像が左 |
| 3 列 | 共感カード・3 ステップ = `repeat(3, minmax(0, 1fr))`、gap 24px (mobile は 1 列、gap 16px) |
| 見出し階層 | h1 = 1 個 (Hero)。h2 = 7 個 (共感・使い方・主な機能・友達・できること・よくある質問・最終 CTA)。h3 = 9 個 (共感カード 3・ステップ 3・機能行 3) |

### 3-5. 散らし図形 (裁定 3)

Hero (`.s1`: teal / blue / indigo) と友達の帯 (`.s5`: magenta / coral / teal) の 2 か所だけ。各 3 個、位置とサイズは v1 の `.shape.a/b/c` と同じ。Hero の `c` だけ `left: 2%; bottom: 8%` に移す (v1 の位置 `left 6% / bottom 18%` は v2 の Hero で App Store バッジの左端に 13px 重なるため — 1280px で実測)。

### 3-6. 画像の配置

| 節 | 画像 | 置き方 |
|---|---|---|
| Hero | `hero-phones.webp` (1200×1110、下端が切れた素材) + `mascot-hello.webp` | 端末を節の下端に揃える (v1 と同じ「画面の外へ続く」)。マスコットは端末画像の左下 (`left: -2%; bottom: 6%; width: 28%`) に重ねる |
| 機能行 ×3 | `phone-2.webp` / `phone-3.webp` / `phone-4.webp` | 角丸 32px の台 `.stage` (aspect-ratio 5:4、`overflow: hidden`) の中で、端末を上 padding 32 / 48px から幅 48% で置き、**台の下端で切る**。`phone-2` (全身の浮いた端末) も同じ幅で置けば下 40% が台の外に出て同じ見え方になる。v1 の「スライドの再現 (大見出しの下に端末 + 図形)」はしない |
| 友達の帯 | `phone-5.webp` + `mascot-chat.webp` | 端末を帯の下端に揃える。マスコット (吹き出し付き) は端末の左上に重ねる: mobile `left: -56px; top: -72px; width: 112px`、PC `left: -136px; top: 48px; width: 168px` |
| 最終 CTA | `mascot-run.webp` | 見出しの上に中央寄せ、幅 112 / 144px |

新しい切り出し (画面だけ・ベゼル無し) は**要らない** — 台で下端を切る置き方なら既存のベゼル付き 4 枚 (`phone-2..5`) で足りる。新規はマスコット 2 ポーズの WebP 化だけ (§6-2)。

### 3-7. 状態 (汎用層 §7-4)

静的ページ。(1) フォント未着 → `font-display: swap` で後続フォント、(2) 画像の失敗 → `alt` (全 `img` に `width`/`height` があり段ずれしない。台 `.stage` は `aspect-ratio` で高さが決まるので画像が来なくても崩れない)、(3) JS 無効 → 影響なし。`loading="lazy"` は header のワードマークと Hero の 3 枚 (端末・マスコット・バッジ) 以外の全画像 (7 個)。

### 3-8. アクセシビリティ (汎用層 §7-5)

| 項目 | 値 |
|---|---|
| tap target | バッジ 48 / 56px 高、Web 版リンク・フッターのリンク・ロゴ `min-height: 44px`。FAQ 内の「Web 版」は文中リンク (WCAG 2.5.8 の inline 例外) |
| コントラスト | 本文 `--ink` / 白 = 10.33:1、`--ink` / `--band` = 9.51:1、`--ink` / `--glow-mid` = 9.72:1。`.small` (`#147FCC`、19px 700 = 大きい文字) / 白 = 4.25:1、/ `--band` = 3.91:1 (大きい文字の 3:1 を満たす)。ステップ番号 白 / `#147FCC` = 4.25:1 (20px 900 = 大きい文字) |
| 装飾 | アイコン `<span class="icon" aria-hidden="true">`、図形 `aria-hidden="true"`、マスコット 3 枚 `alt=""` |
| 見出しと節 | 各 `section` に `aria-labelledby` で h1 / h2 の id |
| ダークモード | 対応しない (`color-scheme: light`、v1 の裁定 5 のまま) |

## 4. ワイヤー

### 4-1. PC (1280px、中身 1040px)

```
┌──────────────────────────────────────────────────────────────┐
│ Atender (ロゴ 150px)                                           │ header 80
├──────────────────────────────────────────────────────────────┤
│ ▢           ░░░░ glow (radial, 60% 85%) ░░░░░░░░░░░       ▢   │
│  出席率、把握してる？                   ╱‾‾‾‾‾‾‾‾‾╲             │ 1. Hero
│  もう[出席率]で                        │ 学期・科目 │  ┌──┐       │  .split 1fr|1fr
│  焦らない                 (h1 64px)    │  91 %     │  │ホ│       │
│  時間割を入れたら、…ワンタップするだけ。 │           │  │ー│       │
│  科目ごとの出席率と、…いつでも分かる。  (◕‿◕)       │  │ム│       │
│  [ App Store ]  Web 版を開く          │ 2026年10月 │  └──┘       │
│  対象: 専門学校・大学の学生            │  ○ ○ ● ●  │             │
│ ▢                                     ▔▔▔▔▔▔ (節の下端で切れる)    │
├──────────────────────────────────────────────────────────────┤  96
│                     こんなこと、ない？ (h2 44px)                  │ 2. 共感
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │  3 列 gap 24
│  │ [%]          │  │ [▦]          │  │ [⌨]          │            │
│  │ 出席率、     │  │ あと何回…    │  │ 時間割の入力、│            │
│  │ いま何%？    │  │ 毎回計算してる│  │ 毎学期だるい │            │
│  │ 本文 2 行    │  │ 本文 2 行    │  │ 本文 2 行    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│          この 3 つを片付けたくて、Atender を作りました。           │
├──────────────────────────────────────────────────────────────┤  96
│                      3 ステップで始める (small)                   │ 3. 使い方
│                           使い方 (h2)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │  glow-mid の面
│  │ (1)          │  │ (2)          │  │ (3)          │            │
│  │ 時間割を登録 │  │ 授業が終わったら│ │ 出席率と、あと│           │
│  │ 本文         │  │ ワンタップで出欠│ │ 何回休めるか… │           │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
├──────────────────────────────────────────────────────────────┤  96
│                         主な機能 (h2)                            │ 4. 機能
│  授業おわったら                ┌───────── stage (blue tint) ─┐     │  .row 1fr|1fr
│  [ワンタップ]で                │        ╭──────╮             │     │  gap 64
│  出席完了  (h3 44px)           │        │ ホーム │             │     │
│  補助文 1 行                   │        │ 時間割 │             │     │
│  ■ 出席・遅刻・欠席・公欠…     │        │       │             │     │
│  ■ 全部出た日は…              └────────┴───────┴─────────────┘     │
│  ■ 次の授業の時間と教室…                    (台の下端で切る)       │
│                                                         96      │
│  ┌──── stage (violet) ────┐   あと何回休める？                      │  2 行目は反転
│  │      ╭──────╮          │   [科目ごと]に                          │
│  │      │ 科目一覧│        │   すぐ分かる                             │
│  └──────┴──────┴──────────┘   補助文 + ■ × 3                       │
│                                                         96      │
│  時間割の入力、だるい？        ┌──── stage (magenta) ────┐          │
│  [同じ学科]のを               │      ╭──────╮           │          │
│  そのまま使う                 │      │公開時間割│         │          │
│  補助文 + ■ × 2              └──────┴──────┴───────────┘          │
├──────────────────────────────────────────────────────────────┤  48 (margin)
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ band (#EDF7FD、全幅) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ 5. 友達
│▓ ▢                                       ╭──────╮           ▢ ▓│  .split
│▓  次の空きコマ、誰いる？            (…)◕‿◕│ 9:41  │              ▓│
│▓  友達の[時間割]を                        │ルームの│              ▓│
│▓  重ねて見る (h2 44px)                    │ 時間割 │              ▓│
│▓  補助文 3 行                             │       │              ▓│
│▓ ▢                                       │       │              ▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┴───────┴▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ (帯の下端で切る)
├──────────────────────────────────────────────────────────────┤  96
│                        できること (h2)                           │ 6. 一覧
│      ■ 時間割の登録 (…)                ■ ワンタッチ出欠 (…)         │  2 列 max 960
│      ■ 出席率の追跡 (…)                ■ カレンダー書き出し (…)     │
│      ■ 友達・ルーム (…)                ■ 新学期の引き継ぎ          │
│      ■ ログイン: Apple / Google、…                               │
├──────────────────────────────────────────────────────────────┤  96
│                       よくある質問 (h2)                          │ 7. FAQ
│          ─────────────────────────────────────────              │  max 760 中央
│          無料で使える？                                          │
│          無料で使えます。                                        │
│          ─────────────────────────────────────────              │
│          (× 4 問)                                               │
├──────────────────────────────────────────────────────────────┤  48 + 48
│                            (◕‿◕)ﾉ  (run 144px)                 │ 8. 最終 CTA
│                             まずは                              │  glow (50% 100%)
│                        時間割を入れてみる                         │
│                   [ App Store ]  Web 版を開く                    │
│                     対象: 専門学校・大学の学生                     │
├──────────────────────────────────────────────────────────────┤
│ プライバシーポリシー  利用規約  サポート                           │ footer
│ © 2026 Atender                                                  │
└──────────────────────────────────────────────────────────────┘
```

### 4-2. スマホ (375px、中身 335px)

```
┌───────────────────────────┐
│ Atender                   │ header 64
├───────────────────────────┤
│ 出席率、把握してる？        │ 1. Hero (縦)
│ もう[出席率]で             │  h1 44px
│ 焦らない                   │
│ 時間割を入れたら、…(4 行)  │
│ [App Store] Web 版を開く  │ ← バッジ下端 429px
│ 対象: …                   │
│   ╱‾‾‾‾‾‾‾╲  ┌─┐          │  hero-phones max 560
│ (◕‿◕)91 %  │ │ホ│         │
│   ▔▔▔▔▔▔▔▔▔ └─┘          │  (節の下端で切る)
├───────────────────────────┤ 64
│     こんなこと、ない？      │ 2. 共感 (1 列)
│ ┌───────────────────────┐ │
│ │ [%] 出席率、いま何%？   │ │  カード ×3 gap 16
│ │ 本文                    │ │
│ └───────────────────────┘ │
│ (× 3)                      │
│ この 3 つを片付けたくて、   │
│ Atender を作りました。      │
├───────────────────────────┤ 64
│    3 ステップで始める       │ 3. 使い方 (1 列)
│         使い方              │
│ ┌───────────────────────┐ │
│ │ (1) 時間割を登録        │ │
│ └───────────────────────┘ │
│ (× 3)                      │
├───────────────────────────┤ 64
│         主な機能            │ 4. 機能 (テキスト → 台)
│ 授業おわったら              │  各行 gap 32、行間 48
│ [ワンタップ]で              │  (2 行目も テキスト → 台 の順)
│ 出席完了 (h3 28px)          │
│ 補助文 / ■ × 3             │
│ ┌──── stage 335×268 ────┐ │
│ │      ╭─────╮           │ │
│ │      │ホーム│           │ │
│ └──────┴─────┴──────────┘ │
│ (× 3)                      │
├───────────────────────────┤ 32 (margin)
│▓▓▓▓▓▓ band ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ 5. 友達 (縦)
│▓ 次の空きコマ、誰いる？    ▓│
│▓ 友達の[時間割]を          ▓│
│▓ 重ねて見る                ▓│
│▓ 補助文 4 行               ▓│
│▓ (…)◕‿◕                   ▓│  マスコット 112 (端末左上)
│▓      ╭──────╮            ▓│  端末 220
│▓      │ルーム │            ▓│
│▓▓▓▓▓▓▓┴──────┴▓▓▓▓▓▓▓▓▓▓▓▓│ (帯の下端で切る)
├───────────────────────────┤ 64
│        できること           │ 6. 一覧 (1 列)
│ ■ … (7 行)                 │
├───────────────────────────┤ 64
│        よくある質問          │ 7. FAQ
│ ─────────────────────     │
│ 無料で使える？              │
│ 無料で使えます。            │
│ (× 4)                      │
├───────────────────────────┤ 32 + 32
│         (◕‿◕)ﾉ (112)       │ 8. 最終 CTA
│          まずは             │
│     時間割を入れてみる       │
│  [App Store] Web 版を開く   │
│   対象: …                  │
├───────────────────────────┤
│ プライバシーポリシー 利用規約 │ footer
│ サポート                    │
│ © 2026 Atender             │
└───────────────────────────┘
```

## 5. 確定テキスト

全角 / 半角・記号を含めてこのとおり。**コピー A 案 (★) は一字も変えない** (ストア doc §3-1)。`/` は `<br>`、`[ ]` は `em.hl`。

### 5-1. 節ごと

| 節 | 要素 | テキスト | 出典 |
|---|---|---|---|
| Hero | `.small` | 出席率、把握してる？ | ★ A 案 1 |
| | h1 | もう[出席率]で / 焦らない | ★ A 案 1 |
| | `.lead` | 時間割を入れたら、あとは授業のあとにワンタップするだけ。 / 科目ごとの出席率と、あと何回休めるかがいつでも分かる。 | 新規 (v1 の ASC の 1 文は 3 行になるので 2 文 2 行に。ASC の文は `meta description` / `og:description` に残る) |
| | バッジ alt / リンク | App Store からダウンロード / Web 版を開く | v1 |
| | `.target` | 対象: 専門学校・大学の学生 | v1 (ASC の対象行) |
| 共感 | h2 | こんなこと、ない？ | 新規 |
| | カード 1 h3 / p | 出席率、いま何%？ / 出たか休んだかは覚えてるのに、率になると急に分からない。 | 新規 |
| | カード 2 h3 / p | あと何回休めるか、毎回計算してる / 欠席の上限も遅刻の数え方も、科目ごとに違ってややこしい。 | 新規 |
| | カード 3 h3 / p | 時間割の入力、毎学期だるい / 同じ学科のみんなが、同じ時間割をそれぞれ打ち込んでる。 | 新規 |
| | `.bridge` | この 3 つを片付けたくて、Atender を作りました。 | 新規 (作った動機の一言。売り文句にしない) |
| 使い方 | `.small` / h2 | 3 ステップで始める / 使い方 | 新規 |
| | 1 h3 / p | 時間割を登録 / 同じ学科の公開時間割があれば、選んで取り込むだけ。なければ自分で作れます。 | 新規 (裁定の文言) |
| | 2 h3 / p | 授業が終わったらワンタップで出欠 / 出席・遅刻・欠席・公欠から選ぶだけ。全部出た日は「今日は全出席」でまとめて付けられます。 | 新規。「今日は全出席」は iOS `HomeAttendanceOverlay.swift:172` の実ラベル |
| | 3 h3 / p | 出席率と、あと何回休めるかが分かる / 科目ごとの必要出席率・欠席上限・遅刻の換算に合わせて計算します。 | 新規 (build 21 の `Course` の 3 項目) |
| 機能 | h2 | 主な機能 | 新規 |
| 行 1 (`.s2` blue) | `.small` / h3 | 授業おわったら / [ワンタップ]で / 出席完了 | ★ A 案 2 |
| | `.lead` | ホームの時間割から、終わった授業に出欠を付けるだけ。 | 新規 |
| | 箇条書き | 出席・遅刻・欠席・公欠の 4 つから選ぶ / 全部出た日は「今日は全出席」でまとめて記録 / 次の授業の時間と教室もホームに出る | 新規 (最後は iOS `TodayTimeline.swift` の「次の授業」) |
| 行 2 (`.s3` violet、反転) | `.small` / h3 | あと何回休める？ / [科目ごと]に / すぐ分かる | ★ A 案 3 |
| | `.lead` | 科目ごとの出席率と、あと何回休めるかが一覧で見える。 | 新規 |
| | 箇条書き | 必要出席率・欠席上限・遅刻の換算は科目ごとに設定できる / 休講や振替も計算に入る / 学期全体の出席率もひと目で分かる | 新規 (ASC「出席率の追跡 (…休講・振替)」と hero 画面の「今日までの出席率」) |
| 行 3 (`.s4` magenta) | `.small` / h3 | 時間割の入力、だるい？ / [同じ学科]のを / そのまま使う | ★ A 案 4 |
| | `.lead` | 学校と学科を選ぶと、同じ学科の人が公開した時間割が出てくる。選んで取り込めば登録は終わり。 | 新規 |
| | 箇条書き | 自分の時間割も「みんなの時間割で公開」で同じ学科の人に渡せる / 新学期は前の学期から引き継げる | 新規。「みんなの時間割で公開」は iOS `TimetableSettingsSheet.swift:72` の実ラベル |
| 友達の帯 (`.s5` coral) | `.small` / h2 | 次の空きコマ、誰いる？ / 友達の[時間割]を / 重ねて見る | ★ A 案 5 |
| | `.lead` | 友達とルームを作ると、みんなの時間割が 1 つの表に重なる。空きコマがかぶる人もすぐ見つかるし、授業変更もルームで確認できる。 | 新規 (ASC「友達・ルーム (時間割の共有、授業変更の確認)」) |
| できること | h2 + 7 行 | v1 と同文 (§7 の HTML) | ASC description |
| FAQ | h2 | よくある質問 | 新規 |
| | Q1 / A1 | 無料で使える？ / 無料で使えます。 | 事実確認: `apps/web/public/terms.html:51`「…の機能を無料で提供します」 |
| | Q2 / A2 | Android や PC でも使える？ / iOS アプリは iPhone (iOS 17 以降) 向けです。Android や PC からは [Web 版]を使ってください。iOS アプリと同じアカウントで使えます。 | `apps/ios/project.yml` `deploymentTarget iOS "17.0"`、`apps/web/public/support.html:60`「iOSアプリと同じアカウントで使えます」 |
| | Q3 / A3 | ログインは何でできる？ / Apple・Google・メールアドレスの 3 つから選べます。 | iOS `AuthView.swift` と Web `SignIn.tsx:82-98` の 3 ボタン (Apple / Google / メールで続ける) |
| | Q4 / A4 | アカウントを消したい / iOS アプリか Web 版の「設定」→「その他」→「アカウントを削除」から消せます。データはすぐに削除され、元には戻せません。 | `support.html:68`・`terms.html:70` |
| 最終 CTA | h2 | まずは / 時間割を入れてみる | 新規 (誘導の一言。新しいキャッチにしない) |
| | バッジ / リンク / `.target` | Hero と同じ | v1 |
| フッター | リンク | プライバシーポリシー / 利用規約 / サポート (v1 と同じ URL) | v1 |
| | `.copy` | © 2026 Atender | 新規 (v1 にも atender-web にも © 表記は無い。「既存に合わせる」対象が無いので最小の形にした) |

### 5-2. 文言の規則 (検証用)

- 禁止語: 「サボれる」「単位」「留年」「保証」「必ず」「No.1」「最強」「圧倒的」— `index.html` の本文に 0 件 (LV9)
- FAQ に入れなかった項目: 対応する iOS の最低バージョン以外の端末要件、データの移行、学校の公式連携 — 事実を確認できないので書かない

## 6. 画像

### 6-1. 使う画像の一覧 (10 ファイル、`img` 要素は 11 個)

| ファイル | 寸法 | 節 | `loading` | 由来 |
|---|---|---|---|---|
| `wordmark-navy.png` | 877×196 | header | (eager) | 既存 |
| `hero-phones.webp` | 1200×1110 | Hero | (eager) | 既存 |
| `mascot-hello.webp` | 400×400 | Hero | (eager) | 既存 |
| `app-store-badge-ja.svg` | 109×40 (viewBox) | Hero / 最終 CTA | Hero は eager、最終 CTA は lazy | 既存 |
| `phone-2.webp` | 517×1104 | 機能行 1 | lazy | 既存 |
| `phone-3.webp` | 720×1228 | 機能行 2 | lazy | 既存 |
| `phone-4.webp` | 720×1228 | 機能行 3 | lazy | 既存 |
| `phone-5.webp` | 720×1228 | 帯 | lazy | 既存 |
| `mascot-chat.webp` | 403×403 | 帯 | lazy | **新規** |
| `mascot-run.webp` | 355×355 | 最終 CTA | lazy | **新規** |

表示密度: 機能行の端末は表示幅 = 台の 48% (PC 238px / 375px 幅で 161px)。`phone-2` (原寸 517px) は PC で 2.17 倍、`phone-3/4` (720px) は 3.0 倍 — Retina (2 倍) を満たす。`mascot-chat` は PC 168px で 2.4 倍、`mascot-run` は PC 144px で 2.47 倍。

### 6-2. `mocks/social/extract-phones.py` への追加

元は `apps/web/public/character/` の PNG (透過、背景 alpha 0 を実測)。切り抜き・縮小はしない (原寸のまま WebP 化)。

```python
# 定数の並び (MASCOT の直後) に追加
CHARACTER = ROOT / 'apps/web/public/character'
```

```python
# mascot() を置換
def mascot():
    save(Image.open(MASCOT).convert('RGBA'), 'mascot-hello', 400)
    save(Image.open(CHARACTER / 'mascot-chat.png').convert('RGBA'), 'mascot-chat')
    save(Image.open(CHARACTER / 'mascot-run.png').convert('RGBA'), 'mascot-run')
```

docstring の正典に `.designs/20261030-landing-page-v2-layout.md §6-2 (マスコット 2 ポーズ)` を 1 行足す。`save()` は width 省略で原寸保存 (既存の挙動)。出力は WebP `quality=88, method=6` (既存の `save()`)。Architect が scratchpad で同じ処理を実走: `mascot-chat.webp` 403×403 13,652 byte、`mascot-run.webp` 355×355 11,896 byte。

## 7. `apps/lp/site/index.html` (全文)

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#FFFFFF">
<title>Atender — もう出席率で焦らない</title>
<meta name="description" content="Atender は、学生が自分の時間割を登録し、授業ごとの出欠をワンタッチで記録して、科目ごとの出席率を追いかけるためのアプリです。">
<link rel="canonical" href="https://atender.aisaba.net/">
<meta name="apple-itunes-app" content="app-id=6790604371">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Atender">
<meta property="og:locale" content="ja_JP">
<meta property="og:url" content="https://atender.aisaba.net/">
<meta property="og:title" content="Atender — もう出席率で焦らない">
<meta property="og:description" content="Atender は、学生が自分の時間割を登録し、授業ごとの出欠をワンタッチで記録して、科目ごとの出席率を追いかけるためのアプリです。">
<meta property="og:image" content="https://atender.aisaba.net/og-1200x630.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="もう出席率で焦らない — Atender の出席率画面と時間割画面">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/fonts/zenmaru.css">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header wrap">
  <a class="logo" href="/"><img src="/img/wordmark-navy.png" alt="Atender" width="877" height="196"></a>
</header>
<main>
  <section class="hero s1" aria-labelledby="hero-title">
    <span class="shape a" aria-hidden="true"></span><span class="shape b" aria-hidden="true"></span><span class="shape c" aria-hidden="true"></span>
    <div class="wrap split">
      <div class="text">
        <p class="small">出席率、把握してる？</p>
        <h1 id="hero-title">もう<em class="hl">出席率</em>で<br>焦らない</h1>
        <p class="lead">時間割を入れたら、あとは授業のあとにワンタップするだけ。<br>科目ごとの出席率と、あと何回休めるかがいつでも分かる。</p>
        <div class="cta">
          <a class="store-badge" href="https://apps.apple.com/jp/app/id6790604371"><img src="/img/app-store-badge-ja.svg" alt="App Store からダウンロード" width="109" height="40"></a>
          <a class="web-link" href="https://atender.appily.run">Web 版を開く</a>
        </div>
        <p class="target">対象: 専門学校・大学の学生</p>
      </div>
      <figure class="hero-visual">
        <img class="phones" src="/img/hero-phones.webp" alt="Atender の学期・科目画面 (今日までの出席率 91%) とホーム画面の時間割" width="1200" height="1110">
        <img class="mascot" src="/img/mascot-hello.webp" alt="" width="400" height="400">
      </figure>
    </div>
  </section>

  <section class="sec pains" aria-labelledby="pains-title">
    <div class="wrap">
      <h2 id="pains-title" class="center">こんなこと、ない？</h2>
      <!-- アイコン: Lucide v1.64.0 (ISC License, https://lucide.dev) -->
      <ul class="cards">
        <li class="card c1">
          <span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg></span>
          <h3>出席率、いま何%？</h3>
          <p>出たか休んだかは覚えてるのに、率になると急に分からない。</p>
        </li>
        <li class="card c2">
          <span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg></span>
          <h3>あと何回休めるか、毎回計算してる</h3>
          <p>欠席の上限も遅刻の数え方も、科目ごとに違ってややこしい。</p>
        </li>
        <li class="card c3">
          <span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/></svg></span>
          <h3>時間割の入力、毎学期だるい</h3>
          <p>同じ学科のみんなが、同じ時間割をそれぞれ打ち込んでる。</p>
        </li>
      </ul>
      <p class="bridge">この 3 つを片付けたくて、Atender を作りました。</p>
    </div>
  </section>

  <section class="sec steps-sec" aria-labelledby="steps-title">
    <div class="wrap">
      <p class="small center">3 ステップで始める</p>
      <h2 id="steps-title" class="center">使い方</h2>
      <ol class="steps">
        <li class="step">
          <span class="num" aria-hidden="true">1</span>
          <h3>時間割を登録</h3>
          <p>同じ学科の公開時間割があれば、選んで取り込むだけ。なければ自分で作れます。</p>
        </li>
        <li class="step">
          <span class="num" aria-hidden="true">2</span>
          <h3>授業が終わったらワンタップで出欠</h3>
          <p>出席・遅刻・欠席・公欠から選ぶだけ。全部出た日は「今日は全出席」でまとめて付けられます。</p>
        </li>
        <li class="step">
          <span class="num" aria-hidden="true">3</span>
          <h3>出席率と、あと何回休めるかが分かる</h3>
          <p>科目ごとの必要出席率・欠席上限・遅刻の換算に合わせて計算します。</p>
        </li>
      </ol>
    </div>
  </section>

  <section class="sec features" aria-labelledby="features-title">
    <div class="wrap">
      <h2 id="features-title" class="center">主な機能</h2>
      <div class="row s2">
        <div class="text">
          <p class="small">授業おわったら</p>
          <h3 class="row-title"><em class="hl">ワンタップ</em>で<br>出席完了</h3>
          <p class="lead">ホームの時間割から、終わった授業に出欠を付けるだけ。</p>
          <ul class="points">
            <li>出席・遅刻・欠席・公欠の 4 つから選ぶ</li>
            <li>全部出た日は「今日は全出席」でまとめて記録</li>
            <li>次の授業の時間と教室もホームに出る</li>
          </ul>
        </div>
        <figure class="stage">
          <img src="/img/phone-2.webp" alt="ホーム画面: 今週の時間割と「今日は全出席」ボタン" width="517" height="1104" loading="lazy">
        </figure>
      </div>
      <div class="row reverse s3">
        <div class="text">
          <p class="small">あと何回休める？</p>
          <h3 class="row-title"><em class="hl">科目ごと</em>に<br>すぐ分かる</h3>
          <p class="lead">科目ごとの出席率と、あと何回休めるかが一覧で見える。</p>
          <ul class="points">
            <li>必要出席率・欠席上限・遅刻の換算は科目ごとに設定できる</li>
            <li>休講や振替も計算に入る</li>
            <li>学期全体の出席率もひと目で分かる</li>
          </ul>
        </div>
        <figure class="stage">
          <img src="/img/phone-3.webp" alt="学期・科目画面: 科目ごとの出席率と「あと N 回休める」" width="720" height="1228" loading="lazy">
        </figure>
      </div>
      <div class="row s4">
        <div class="text">
          <p class="small">時間割の入力、だるい？</p>
          <h3 class="row-title"><em class="hl">同じ学科</em>のを<br>そのまま使う</h3>
          <p class="lead">学校と学科を選ぶと、同じ学科の人が公開した時間割が出てくる。選んで取り込めば登録は終わり。</p>
          <ul class="points">
            <li>自分の時間割も「みんなの時間割で公開」で同じ学科の人に渡せる</li>
            <li>新学期は前の学期から引き継げる</li>
          </ul>
        </div>
        <figure class="stage">
          <img src="/img/phone-4.webp" alt="公開時間割の一覧: 同じ学校・学科の時間割を選んで取り込む" width="720" height="1228" loading="lazy">
        </figure>
      </div>
    </div>
  </section>

  <section class="band s5" aria-labelledby="friends-title">
    <span class="shape a" aria-hidden="true"></span><span class="shape b" aria-hidden="true"></span><span class="shape c" aria-hidden="true"></span>
    <div class="wrap split">
      <div class="text">
        <p class="small">次の空きコマ、誰いる？</p>
        <h2 id="friends-title">友達の<em class="hl">時間割</em>を<br>重ねて見る</h2>
        <p class="lead">友達とルームを作ると、みんなの時間割が 1 つの表に重なる。空きコマがかぶる人もすぐ見つかるし、授業変更もルームで確認できる。</p>
      </div>
      <figure class="band-visual">
        <img class="mascot" src="/img/mascot-chat.webp" alt="" width="403" height="403" loading="lazy">
        <img class="phone" src="/img/phone-5.webp" alt="ルームの時間割: 友達のコマが重なって表示される" width="720" height="1228" loading="lazy">
      </figure>
    </div>
  </section>

  <section class="sec list" aria-labelledby="list-title">
    <div class="wrap">
      <h2 id="list-title" class="center">できること</h2>
      <ul class="can">
        <li>時間割の登録 (学校と学科の公開テンプレから引き継ぎ)</li>
        <li>ワンタッチ出欠 (出席/遅刻/欠席/公欠)</li>
        <li>出席率の追跡 (必要出席率までの残り回数、休講・振替)</li>
        <li>カレンダー書き出し (iPhone のカレンダーへ)</li>
        <li>友達・ルーム (時間割の共有、授業変更の確認)</li>
        <li>新学期の引き継ぎ</li>
        <li>ログイン: Apple / Google、アカウント削除可</li>
      </ul>
    </div>
  </section>

  <section class="sec faq-sec" aria-labelledby="faq-title">
    <div class="wrap">
      <h2 id="faq-title" class="center">よくある質問</h2>
      <dl class="faq">
        <div class="qa">
          <dt>無料で使える？</dt>
          <dd>無料で使えます。</dd>
        </div>
        <div class="qa">
          <dt>Android や PC でも使える？</dt>
          <dd>iOS アプリは iPhone (iOS 17 以降) 向けです。Android や PC からは <a href="https://atender.appily.run">Web 版</a>を使ってください。iOS アプリと同じアカウントで使えます。</dd>
        </div>
        <div class="qa">
          <dt>ログインは何でできる？</dt>
          <dd>Apple・Google・メールアドレスの 3 つから選べます。</dd>
        </div>
        <div class="qa">
          <dt>アカウントを消したい</dt>
          <dd>iOS アプリか Web 版の「設定」→「その他」→「アカウントを削除」から消せます。データはすぐに削除され、元には戻せません。</dd>
        </div>
      </dl>
    </div>
  </section>

  <section class="closing" aria-labelledby="closing-title">
    <div class="wrap">
      <img class="mascot" src="/img/mascot-run.webp" alt="" width="355" height="355" loading="lazy">
      <h2 id="closing-title">まずは<br>時間割を入れてみる</h2>
      <div class="cta">
        <a class="store-badge" href="https://apps.apple.com/jp/app/id6790604371"><img src="/img/app-store-badge-ja.svg" alt="App Store からダウンロード" width="109" height="40" loading="lazy"></a>
        <a class="web-link" href="https://atender.appily.run">Web 版を開く</a>
      </div>
      <p class="target">対象: 専門学校・大学の学生</p>
    </div>
  </section>
</main>
<footer class="site-footer">
  <div class="wrap">
    <nav aria-label="法務とサポート">
      <a href="https://atender.appily.run/privacy.html">プライバシーポリシー</a>
      <a href="https://atender.appily.run/terms.html">利用規約</a>
      <a href="https://atender.appily.run/support">サポート</a>
    </nav>
    <p class="copy">© 2026 Atender</p>
  </div>
</footer>
</body>
</html>
```

補足:
- 「できること」のログイン行 (`Apple / Google`) は ASC description の原文なので変えない (メールが抜けているのは ASC 側の文。FAQ の A3 が正しい 3 つを言う)。ASC の説明文を直すのは次の版 (1.0.2) の作業 (§11)
- Lucide のアイコンは `lucide-static@1.64.0/icons/{percent,calculator,keyboard}.svg` の中身 (2026-10-30 に unpkg で取得) から `class` / `width` / `height` / `xmlns` を落としたもの。サイズは CSS (`.icon svg`) で決める

## 8. `apps/lp/site/style.css` (全文)

```css
:root {
  color-scheme: light;
  --bg: #FFFFFF;
  --glow: color-mix(in srgb, #1E96E6 18%, #FFFFFF);
  --glow-mid: color-mix(in srgb, #1E96E6 6%, #FFFFFF);
  --band: color-mix(in srgb, #1E96E6 8%, #FFFFFF);
  --ink: #30415B;
  --accent-600: #147FCC;
  --phone-shadow: rgba(15, 23, 42, .28);
  --line: rgba(48, 65, 91, .08);
  --card-shadow: 0 8px 24px rgba(48, 65, 91, .06);
  --teal: #56D8C3; --blue: #568CFC; --indigo: #8F7EFC; --violet: #A978FA; --magenta: #FC6ABF; --coral: #FD728E;
  --shape-alpha-k: 2;
  --gap: 64px;
  --font: "Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font); font-weight: 500; -webkit-font-smoothing: antialiased; }
img { display: block; max-width: 100%; height: auto; }
a { color: inherit; }
a:focus-visible { outline: 3px solid var(--accent-600); outline-offset: 3px; border-radius: 6px; }
figure { margin: 0; }

.wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; }
.site-header { height: 64px; display: flex; align-items: center; }
.logo { display: inline-flex; align-items: center; min-height: 44px; }
.logo img { width: 120px; }

/* 見出しの段: h1 (hero) > h2 (各節) = h3.row-title (機能の A 案) > h3 (カード・ステップ) */
.small { margin: 0 0 .5rem; font-size: 1.1875rem; line-height: 1.4; font-weight: 700; letter-spacing: .04em; color: var(--accent-600); }
h1, h2, .row-title { margin: 0; font-weight: 900; line-height: 1.25; color: var(--ink); }
h1 { font-size: 2.75rem; line-height: 1.2; letter-spacing: .035em; }
h2, .row-title { font-size: 1.75rem; letter-spacing: .025em; }
h3 { margin: 0; font-size: 1.125rem; line-height: 1.5; font-weight: 700; text-wrap: balance; }
p, li, dd { text-wrap: pretty; }
.center { text-align: center; }
em.hl { font-style: normal; background: linear-gradient(transparent 60%, color-mix(in srgb, var(--hl) 45%, transparent) 60%); padding: 0 .04em; }
.s1 { --hl: var(--teal); } .s2 { --hl: var(--blue); } .s3 { --hl: var(--violet); } .s4 { --hl: var(--magenta); } .s5 { --hl: var(--coral); }
.lead { margin: 1rem 0 0; font-size: 1rem; line-height: 1.7; max-width: 34em; }
.target { margin: 1rem 0 0; font-size: .875rem; line-height: 1.6; }

.cta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-top: 1.75rem; }
.store-badge { display: inline-block; padding: 0; line-height: 0; }
.store-badge img { height: 48px; width: auto; }
.web-link { display: inline-flex; align-items: center; min-height: 44px; font-size: 1rem; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }

/* 節の間隔: 通常の節は上下に --gap の半分ずつ (隣り合う節の中身の間 = --gap) */
.sec { padding: calc(var(--gap) / 2) 0; }
.hero + .sec { padding-top: var(--gap); }

/* 1. Hero */
.hero { position: relative; overflow: hidden; isolation: isolate; padding-top: 24px;
  background: radial-gradient(ellipse at 60% 85%, var(--glow) 0, var(--glow-mid) 35%, var(--bg) 67%); }
.hero .wrap, .band .wrap { position: relative; z-index: 1; }
.hero-visual { position: relative; max-width: 560px; margin: 40px auto 0; }
.hero-visual .phones { width: 100%; filter: drop-shadow(4px 11px 16px var(--phone-shadow)); }
.hero-visual .mascot { position: absolute; left: -2%; bottom: 6%; width: 28%; }

/* 2. 共感 */
.cards { margin: 32px 0 0; padding: 0; list-style: none; display: grid; gap: 16px; }
.card { padding: 24px; border-radius: 24px; background: var(--bg); border: 1px solid var(--line); box-shadow: var(--card-shadow); }
.card p { margin: .5rem 0 0; font-size: 1rem; line-height: 1.7; }
.icon { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; margin-bottom: 16px; border-radius: 28%;
  background: color-mix(in srgb, var(--c) 18%, #FFFFFF); color: color-mix(in srgb, var(--c) 55%, #30415B); }
.icon svg { width: 24px; height: 24px; }
.c1 { --c: var(--teal); } .c2 { --c: var(--violet); } .c3 { --c: var(--magenta); }
.bridge { margin: 32px 0 0; text-wrap: balance; text-align: center; font-size: 1.0625rem; line-height: 1.7; font-weight: 700; }

/* 3. 使い方 */
.steps { margin: 32px 0 0; padding: 0; list-style: none; display: grid; gap: 16px; }
.step { padding: 24px; border-radius: 24px; background: var(--glow-mid); }
.step p { margin: .5rem 0 0; font-size: 1rem; line-height: 1.7; }
.num { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; margin-bottom: 16px; border-radius: 50%;
  background: var(--accent-600); color: #FFFFFF; font-size: 1.25rem; font-weight: 900; line-height: 1; }

/* 4. 機能 (交互 2 カラム) */
.row { display: grid; gap: 32px; margin-top: 48px; }
.points { margin: 1.25rem 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.points li { position: relative; padding-left: 26px; font-size: 1rem; line-height: 1.7; }
.points li::before { content: ""; position: absolute; left: 0; top: .5em; width: 12px; height: 12px; border-radius: 28%; background: var(--hl); }
.stage { position: relative; overflow: hidden; aspect-ratio: 5 / 4; border-radius: 32px; padding-top: 32px;
  display: flex; justify-content: center; align-items: flex-start; background: color-mix(in srgb, var(--hl) 14%, #FFFFFF); }
.stage img { width: 48%; flex: none; filter: drop-shadow(0 12px 24px rgba(15, 23, 42, .16)); }

/* 5. 友達 (帯) */
.band { position: relative; overflow: hidden; isolation: isolate; margin: calc(var(--gap) / 2) 0; padding-top: var(--gap); background: var(--band); }
.band-visual { position: relative; width: min(220px, 100% - 112px); margin: 104px auto 0; }
.band-visual .phone { width: 100%; filter: drop-shadow(7px 17px 27px var(--phone-shadow)); }
.band-visual .mascot { position: absolute; z-index: 2; left: -56px; top: -72px; width: 112px; }

/* 6. できること */
.can { margin: 32px auto 0; max-width: 960px; padding: 0; list-style: none; display: grid; gap: 12px; }
.can li { position: relative; padding-left: 28px; font-size: 1rem; line-height: 1.7; }
.can li::before { content: ""; position: absolute; left: 0; top: .45em; width: 14px; height: 14px; border-radius: 28%; background: var(--c); }
.can li:nth-child(6n+1) { --c: var(--teal); } .can li:nth-child(6n+2) { --c: var(--blue); } .can li:nth-child(6n+3) { --c: var(--indigo); }
.can li:nth-child(6n+4) { --c: var(--violet); } .can li:nth-child(6n+5) { --c: var(--magenta); } .can li:nth-child(6n+6) { --c: var(--coral); }

/* 7. FAQ */
.faq { margin: 32px auto 0; max-width: 760px; }
.qa { padding: 20px 0; border-top: 1px solid var(--line); }
.qa:last-child { border-bottom: 1px solid var(--line); }
.faq dt { font-size: 1.0625rem; line-height: 1.6; font-weight: 700; }
.faq dd { margin: .5rem 0 0; font-size: 1rem; line-height: 1.7; }
.faq dd a { text-decoration: underline; text-underline-offset: 3px; }

/* 8. 最終 CTA */
.closing { padding: calc(var(--gap) / 2) 0 var(--gap); text-align: center;
  background: radial-gradient(ellipse at 50% 100%, var(--glow) 0, var(--glow-mid) 40%, var(--bg) 75%); }
.closing .mascot { width: 112px; margin: 0 auto 16px; }
.closing .cta { justify-content: center; }

/* フッター */
.site-footer { padding: 24px 0 48px; border-top: 1px solid var(--line); }
.site-footer nav { display: flex; flex-wrap: wrap; gap: 0 24px; }
.site-footer a { display: inline-flex; align-items: center; min-height: 44px; font-size: .875rem; text-decoration: underline; text-underline-offset: 3px; }
.copy { margin: 8px 0 0; font-size: .8125rem; line-height: 1.6; }

/* 散らし図形 (hero と帯だけ) */
.shape { position: absolute; z-index: 0; width: var(--size); height: var(--size); border-radius: 28%; background: var(--c); opacity: calc(var(--alpha) * var(--shape-alpha-k)); }
.shape.a { left: 3%; top: 12%; --size: 28px; --alpha: .14; }
.shape.b { right: 4%; top: 30%; --size: 20px; --alpha: .18; }
.shape.c { left: 6%; bottom: 18%; --size: 36px; --alpha: .12; }
.hero .shape.c { left: 2%; bottom: 8%; }
.s1 .a { --c: var(--teal); }    .s1 .b { --c: var(--blue); }    .s1 .c { --c: var(--indigo); }
.s5 .a { --c: var(--magenta); } .s5 .b { --c: var(--coral); }   .s5 .c { --c: var(--teal); }

@media (min-width: 960px) {
  :root { --gap: 96px; }
  .wrap { padding: 0 40px; }
  .site-header { height: 80px; }
  .logo img { width: 150px; }
  .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 48px; align-items: end; }
  .split .text { align-self: center; padding-bottom: var(--gap); }
  .small { font-size: 1.5rem; margin-bottom: .75rem; }
  h1 { font-size: 4rem; }
  h2, .row-title { font-size: 2.75rem; }
  h3 { font-size: 1.25rem; }
  .lead { font-size: 1.0625rem; line-height: 1.8; }
  .store-badge img { height: 56px; }
  .hero { padding-top: 64px; }
  .hero-visual { max-width: none; margin-top: 0; }
  .hero-visual .phones { filter: drop-shadow(6px 16px 25px var(--phone-shadow)); }
  .cards, .steps { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin-top: 48px; }
  .card, .step { padding: 32px; }
  .row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 64px; align-items: center; margin-top: var(--gap); }
  .row.reverse .stage { order: -1; }
  .stage { padding-top: 48px; }
  .band-visual { width: 280px; margin-top: 0; }
  .band-visual .phone { filter: drop-shadow(8px 21px 32px var(--phone-shadow)); }
  .band-visual .mascot { left: -136px; top: 48px; width: 168px; }
  .shape.a { --size: 44px; } .shape.b { --size: 32px; } .shape.c { --size: 56px; }
  .can { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 32px; }
  .closing .mascot { width: 144px; }
}
```

## 9. 数値の検算と逸脱理由

Architect が §7・§8 をそのまま scratchpad に置き、puppeteer-core 24 + Google Chrome で 320 / 375 / 1280px を実走した値。

| 項目 | 値 | 検算 / 理由 |
|---|---|---|
| 横スクロール | 320 / 375 / 1280 で `scrollWidth === clientWidth` | 帯のマスコットは 320px で x 20〜132 (画面内)。帯・Hero は `overflow: hidden` |
| Hero バッジ下端 | 375px: 429px、320px: 429px、1280px: 504px | ≤ 667 (lp-shots の既存条件)。v1 は 407px — 補助文が 2 文 4 行 (mobile) になり 22px 下がった |
| ページ全高 | 375px: 7,321px、1280px: 5,655px | v1 より長い (共感・使い方・FAQ が増えた)。汎用層 §6「関連性があり整理されていればスクロールする」 |
| 見出しの改行 | h1 2 行、A 案の h2 / h3 は全て `<br>` の 2 行 (h3 の高さ 70 / 110px = 2 × line-height) | 最長行 7 字「友達の時間割を」: mobile 28px × 7 × 1.025 = 201px < 280px (320px 幅の中身)。PC 44px × 7 × 1.025 = 316px < 列幅 488px ((1040 − 64) / 2) |
| h2 の最長 | 「こんなこと、ない？」9 字 | mobile 28 × 9 × 1.025 = 258px < 280px。h2 を v1 の 36px (A 案用) でなく 28px にした理由: 36px だと 9 字で 332px となり 320px 幅で折れる |
| h2「まずは時間割を入れてみる」 | `<br>` で「まずは」/「時間割を入れてみる」(9 字) | 1 行 12 字だと mobile で 344px になり 335px を超える |
| 台 `.stage` の端末 | PC: 台 488×390、端末幅 234px、見える高さ 342px | phone-3/4 は 234 × 1228/720 = 399px → 下 57px が切れる。phone-2 は 234 × 1104/517 = 500px → 下 158px (= 本体下部と下ベゼル) が切れる → 3 枚とも「画面の上 2/3 が見えて下が台の外」で揃う |
| 帯の端末 | PC 280px、mobile 220px | PC で 320px にすると時間割より下の白い画面が 70px 増え、空白が目立った (実走で比較) |
| 節の間隔 | 96 / 64px | 裁定 2。v1 の節ごとの `border-top` (罫線) はやめ、余白だけで区切る (汎用層 §2「余白はグルーピングの主手段」) |
| 機能行の間隔 | PC 96px (`--gap`)、mobile 48px | mobile で 64px にすると「台 → 次の行の小見出し」が節の切れ目と区別できない。行は節の中なので一段詰める |
| 落ち影 | Hero は v1 の値のまま (表示幅も v1 と同じ)。帯の端末は v1 の直立端末の値 (mobile `7px 17px 27px` / PC `8px 21px 32px`) を据え置き | 旧 doc §3-6 の規則 (ストアの影 × 表示幅 / 原寸 1070) どおりなら帯は 220/1070 = 0.21・280/1070 = 0.26 倍で、差は 1〜6px。目視で区別できないので値を増やさない。台の中の端末はストアの見せ方でないので弱い `0 12px 24px rgba(15,23,42,.16)` |
| `text-wrap: balance / pretty` | Chrome 114+ / 117+、Safari 17.5+ (balance)、Safari 26 (pretty) | 未対応のブラウザでは通常の折り返しになるだけ (表示が壊れない)。日本語の見出しで最後の 1 字だけ次行に落ちる孤立を防ぐ |

## 10. 挙動仕様

### 10-1. LV (LP v2 の HTML / 表示)

配信の挙動 (LP1〜LP7) は旧 doc §6 のまま。LP7 の「参照するローカル資源が全て 200」には新規 2 ファイル (`/img/mascot-chat.webp` `/img/mascot-run.webp`) が含まれる。

- **LV1** `<html lang="ja">`、`<title>` = `Atender — もう出席率で焦らない`、`meta description` / `og:*` / `twitter:card` / `apple-itunes-app` が §7 と完全一致 (v1 から不変)
- **LV2** `h1` はちょうど 1 個、`<br>` を除いたテキスト `もう出席率で焦らない`、`h1 em.hl` = `出席率`
- **LV3** `h2` はちょうど 7 個、`<br>` を除いたテキストが順に `こんなこと、ない？` / `使い方` / `主な機能` / `友達の時間割を重ねて見る` / `できること` / `よくある質問` / `まずは時間割を入れてみる`。`h2 em.hl` は 1 個で `時間割`
- **LV4** `h3` はちょうど 9 個。順に `出席率、いま何%？` / `あと何回休めるか、毎回計算してる` / `時間割の入力、毎学期だるい` / `時間割を登録` / `授業が終わったらワンタップで出欠` / `出席率と、あと何回休めるかが分かる` / `ワンタップで出席完了` / `科目ごとにすぐ分かる` / `同じ学科のをそのまま使う`。`h3.row-title em.hl` は順に `ワンタップ` / `科目ごと` / `同じ学科`
- **LV5** `.small` は 6 個で順に `出席率、把握してる？` / `3 ステップで始める` / `授業おわったら` / `あと何回休める？` / `時間割の入力、だるい？` / `次の空きコマ、誰いる？` (全角「？」「、」込み)。A 案 1〜5 の小見出し・大見出しが §5-1 の★と一字一句一致
- **LV6** `<script>` 0 個、`style` 属性を持つ要素 0 個、`fonts.googleapis.com` / `fonts.gstatic.com` / `http://` を含む文字列 0 件 (`https://` の外部 URL は旧 doc LP7 の 5 つ + `meta` の `https://atender.aisaba.net/…` + コメントの `https://lucide.dev` のみ)
- **LV7** 全 `img` (11 個) が `width`・`height`・`alt` 属性を持つ。`alt=""` はマスコット 3 個 (`mascot-hello` / `mascot-chat` / `mascot-run`) だけ。`loading="lazy"` は 7 個 (`phone-2` / `phone-3` / `phone-4` / `mascot-chat` / `phone-5` / `mascot-run` / 最終 CTA のバッジ) で、Hero 内の `img` と header のロゴには付かない
- **LV8** 320 / 375 / 1280px で `document.documentElement.scrollWidth === clientWidth`
- **LV9** 375px で `.hero .store-badge` の `getBoundingClientRect().bottom` ≤ 667 (スクロール 0 の状態で)
- **LV10** 320 / 375 / 1280px で全画像を読ませた後 (§10-2 のスクロール段)、全 `img` が `complete && naturalWidth > 0`
- **LV11** `document.fonts.check('900 44px "Zen Maru Gothic"', 'もう出席率で')` が true
- **LV12** ≥960px で: `.hero .split` / `.band .split` / `.row` の計算後 `grid-template-columns` が 2 列。2 行目の `.row.reverse` の `.stage` の左端 < `.text` の左端、1・3 行目は逆。`.cards` と `.steps` が 3 列。959px 以下では全て 1 列
- **LV13** 本文の禁止語 (§5-2) が `index.html` に 0 件: `grep -c -e サボ -e 単位 -e 留年 -e 保証 -e 必ず -e 最強 -e 圧倒的 apps/lp/site/index.html` が 0
- **LV14** `.shape` は 6 個で、全て `.hero` か `.band` の子 (他の節に 0 個)
- **LV15** `index.html` に `class="badge"` (v1 の円バッジ) と `class="sec feature` (v1 の節) が 0 件

### 10-2. `mocks/social/lp-shots.mjs` の変更

v2 は Hero 以外の画像を `loading="lazy"` にしたので、既存の lp-shots は**そのままだと必ず落ちる**: `networkidle0` の時点で画面外の lazy 画像は読み込まれておらず `complete === false` (Architect が実走: 375px で 7 個全部が「読み込み失敗」と判定。`fullPage` のスクショを撮った後も false のまま)。`document.fonts.ready` の直後に次の段を足す:

```js
    // loading="lazy" の画像を全部読ませる (v2 で Hero 以外を lazy にした。スクロールしないと complete が false のまま)
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); }
      window.scrollTo(0, 0);
      await Promise.all(Array.from(document.images).map(i => i.decode().catch(() => {})));
    });
```

- `decode()` の失敗は握りつぶし、判定は既存の `complete && naturalWidth > 0` に任せる (壊れた画像は decode が reject し、そのまま `brokenImages` に入る)
- バッジ位置 (LV9) はスクロールを 0 に戻した後に測るので既存の式のまま
- 2 行目のコメントの正典を `.designs/20261030-landing-page-v2-layout.md §10` に置換
- Architect が scratchpad で実走: 3 幅とも `broken: []`、バッジ下端 428.9px (375)。負のコントロール: `mascot-run.webp` を退避すると 3 幅とも `broken: ["/img/mascot-run.webp"]` になる

### 10-3. EX (切り出し。旧 doc の EX1 を置換)

- **EX1** `python3 -I mocks/social/extract-phones.py` の標準出力が次の 8 行と一致: `hero-phones.webp 1200x1110` / `phone-2.webp 517x1104` / `phone-3.webp 720x1228` / `phone-4.webp 720x1228` / `phone-5.webp 720x1228` / `mascot-hello.webp 400x400` / `mascot-chat.webp 403x403` / `mascot-run.webp 355x355`
- 旧 EX2 (phone-3/4 のバッジ縁の上書き) はそのまま有効
- 既存 6 枚は再生成してもバイト一致する想定だが、一致しなくても (Pillow の版差) コミットしない — `git status` で既存 6 枚に差分が出たら `git checkout -- apps/lp/site/img/<既存>` で戻し、新規 2 枚だけを足す

## 11. テスト基盤と Developer の完了条件 (Reviewer は skip — 静的ページ・文言・スタイルのみ。CLAUDE.md ワークフロー 9)

### 11-1. 基盤

- HTTP / docker は旧 doc §7-1 のまま (`docker build -t atender-lp:local apps/lp` → 本番と同じオプションで `docker run -p 18080:8080 …` → `curl`)
- ブラウザ: `mocks/social/lp-shots.mjs` (puppeteer-core + `/Applications/Google Chrome.app`、`mocks/store/shoot.mjs` の `launchChrome`)。**`mocks/store/node_modules` が無い** (2026-10-30 時点。iCloud 退避後の未 install) ので、先に `npm ci --prefix mocks/store` を 1 回
- 撮影前に `nohup caffeinate -d -u -t 1800 > /dev/null 2>&1 &` (旧 doc §7-1)
- Chrome の `--headless --screenshot --window-size=375,…` は使わない — headless のウィンドウ幅に下限があり (実測で約 500px)、375px では右側が切れた画像になる。必ず puppeteer の `setViewport` で撮る

### 11-2. 完了条件 (全部満たしたら Leader に報告)

1. `python3 -I mocks/social/extract-phones.py` が EX1 の 8 行を出し、`git status` で増えた画像が `mascot-chat.webp` / `mascot-run.webp` の 2 つだけ (§10-3)
2. `docker build -t atender-lp:local apps/lp` が通り、本番と同じ `docker run` で旧 doc の LP1〜LP7 が通る (LP7 に新規 2 画像を含む)
3. `node mocks/social/lp-shots.mjs` が exit 0 (= LV8・LV9・LV10・LV11) で `.tmp/lp-shots/{320,375,1280}.png` を書く
4. **375 と 1280 のフルページスクショを Leader に渡す** (パスを報告に書く)。渡す前に Read で目視: 見出しの改行位置が §5-1 の `/` どおり / 機能行の端末が台の下端で切れている / 2 行目だけ画像が左 (1280) / 帯の端末が帯の下端で切れ、マスコットが端末の左上に乗る / 図形が Hero と帯にしかない
5. LV1〜LV7・LV12〜LV15 を `index.html` への grep と puppeteer の `evaluate` で確認 (使い捨てのスクリプトは scratchpad に置き、コミットしない)
6. `git status` で §0-1 の表に無いファイルが増えていない

## 12. 正典の置換 (Developer がブランチ内で)

1. **旧 doc の先頭** (`# atender LP …` の直後、版表の前) に 1 行追記:
   `> **LP のレイアウト (§3-1〜§3-7・§6 の LH・§7-2〜§7-3 の LP 部分) は .designs/20261030-landing-page-v2-layout.md が正典。** 本 doc の §2・§3-8・§4・§5・§6 の LP / SI / EX2 / ST は引き続き有効。`
2. **`apps/lp/README.md` の 1 行目**を置換:
   `正典はレイアウト・文言が [.designs/20261030-landing-page-v2-layout.md](../../.designs/20261030-landing-page-v2-layout.md)、配信 (Docker / nginx / Coolify) が [.designs/20261030-landing-page-and-social-image.md](../../.designs/20261030-landing-page-and-social-image.md) §5。`
3. **atender `CLAUDE.md`「LP / SNS 画像を更新する」**の先頭の文 `正典は \`.designs/20261030-landing-page-and-social-image.md\` §6 (挙動) と \`mocks/social/README.md\`。` を置換:
   `正典は LP のレイアウト・文言が \`.designs/20261030-landing-page-v2-layout.md\`、配信と SNS 画像が \`.designs/20261030-landing-page-and-social-image.md\` (§4〜§6) と \`mocks/social/README.md\`。`
   (同じ節の残りの文はそのまま。「端末画像は … extract-phones.py で作り直し」はマスコット 2 枚も同じスクリプトで出るので文言の変更不要)
4. `nginx.conf` / `Dockerfile` の先頭コメント (旧 doc §5 を指す) は配信の正典として正しいので変えない

デプロイは承認・マージ後に Leader が既存 `atender-lp` (`vfua50qbir3df0auz1xcduad`) を deploy (POST) するだけ。Coolify の設定変更なし。

## 13. 後続 (今回やらない)

- ASC description のログイン行 (`Apple / Google`) にメールを足す — 1.0.2 の版作成時 (旧 doc §9 の `marketingUrl` 差し替えと同時)。直したら LP の「できること」も同文に揃える
- ストア画像を 1.0.2 で作り直したら、`extract-phones.py` の定数を引き直す (旧 doc §4-1)。機能行の台は端末の上 2/3 を見せる前提なので、新しいスクショでも画面の要点が上 2/3 にあるかを確かめる

## 14. 不採用案

- **v1 の構成 (ストア画像 5 枚を 1:1 で節にした縦積み)**: 全節が「小見出し + 大見出し + 端末 + 図形」の同じ型の繰り返しで、ページとしての流れ (困りごと → 手順 → 機能 → 迷いの解消 → 入手) が無い。Touri FB で却下
- **機能行をスライドの再現にする (大見出しの下に端末、周りに図形・円バッジ)**: v1 と同じ見え方に戻る (裁定 1)。円バッジの文言は箇条書きの 1 行目に吸収した
- **スクロールアニメ・カルーセル・FAQ の開閉を JS で**: CSP (`default-src 'none'`、`script-src` なし) と「素の HTML」の方針 (旧 doc §10)。FAQ は 4 問で全文表示が最短 (汎用層 §6: 大半を読むなら accordion より全文)
- **FAQ を `<details>` で畳む**: JS 不要で CSP 上は使えるが、4 問・回答 1〜2 文なら開閉の操作の方がコスト。全文表示にした
- **画面だけの切り出し (ベゼル無し) を新たに作る**: 台の下端で切る置き方ならベゼル付きの既存 4 枚で同じ見え方になる。切り出しを増やすと 1.0.2 でストア画像を作り直すときの定数が増える
- **アイコンを画像ファイル (SVG を `/img/` に置く) にする**: `img` だと `currentColor` が効かず、色をカードごとに変えるのに 3 色 × 3 ファイルが要る。インライン SVG なら CSS 変数で塗れて、CSP にも触れない (§0-2)
- **アイコンの代わりにマスコットの 5 ポーズを共感カードに使う**: 困りごと (ネガティブ) にキャラの笑顔が乗って文意とずれる。マスコットは Hero (hello)・帯 (chat)・最終 CTA (run) の 3 か所に絞った (idea / laptop は使わない)
- **ヘッダーに App Store バッジ / アンカーメニュー**: Hero のバッジが初期表示に入るので重複。アンカーは 8 節の 1 ページでは要らない (旧 doc §3-2 と同じ判断)
- **共感カードの 3 つを機能行と 1:1 に対応させる**: 同じ話を「困りごと」「機能」で 2 回読ませることになる。共感は感情、使い方は手順、機能は画面、と役割を分けた (§2)
- **節ごとの `border-top` 罫線 (v1)**: 節の背景が白で連続するので、罫線より余白 96px で区切る方が軽い。帯と最終 CTA は面の色で区切れる
- **h2 を v1 の 36 / 52px のまま使う**: 「こんなこと、ない？」(9 字) が 320px で折れる。A 案の大見出しも 28 / 44px に揃え、ページ全体の段を h1 > h2 = 機能 h3 > カード h3 の 3 段にした
- **最終 CTA の見出しを A 案 1 の再掲 (「もう出席率で焦らない」)**: h1 と同じ文が 2 回出ると、ページ内検索・読み上げで見出しが重複する。「まずは時間割を入れてみる」は行動の誘導で、新しいキャッチではない
