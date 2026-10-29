# atender LP (`https://atender.aisaba.net`) + SNS 用 16:9 画像

> **LP のレイアウト (§3-1〜§3-7・§6 の LH・§7-2〜§7-3 の LP 部分) は .designs/20261030-landing-page-v2-layout.md が正典。** 本 doc の §2・§3-8・§4・§5・§6 の LP / SI / EX2 / ST は引き続き有効。

| 版 | 日付 | 内容 |
|---|---|---|
| R0 | 2026-10-30 | 初版。Leader 裁定 1〜8 を受けて執筆 |

> 正典 (見た目・コピー): `.designs/20261029-store-screenshots.md` §3〜§4。本 doc は**新しいトーンを発明しない** — 色・フォント・散らし図形・コピー A 案はそこから写す。
> 1 worktree・1 ブランチ `feature/landing-page`。挙動 ID: **LP** (LP の配信)、**LH** (LP の HTML)、**SI** (SNS 画像)、**EX** (端末の切り出し)。

## 0. スコープ

### 0-1. 触るファイル (全列挙)

| パス | 新規 / 変更 | 内容 |
|---|---|---|
| `apps/lp/Dockerfile` | 新規 | §5-1 全文 |
| `apps/lp/nginx.conf` | 新規 | §5-2 全文 |
| `apps/lp/README.md` | 新規 | 「正典は本 doc」の 1 行 + §6 のコマンド列 |
| `apps/lp/site/index.html` | 新規 | §3-4 全文 |
| `apps/lp/site/style.css` | 新規 | §3-5 全文 |
| `apps/lp/site/robots.txt` | 新規 | 2 行: `User-agent: *` / `Allow: /` |
| `apps/lp/site/favicon.ico` `favicon-16.png` `favicon-32.png` `apple-touch-icon.png` | 新規 (コピー) | `apps/web/public/` の同名ファイルをバイト一致でコピー |
| `apps/lp/site/img/wordmark-navy.png` | 新規 (コピー) | `apps/web/public/wordmark-navy.png` (877×196) |
| `apps/lp/site/img/app-store-badge-ja.svg` | 新規 (ダウンロード) | §3-6。sha256 `988fe0a48015c5a56dac88172487a1f5cda96340b34d80fd94312d02e9f67865` (2026-10-30 取得) |
| `apps/lp/site/img/hero-phones.webp` `phone-2.webp` `phone-3.webp` `phone-4.webp` `phone-5.webp` `mascot-hello.webp` | 新規 (生成物をコミット) | `mocks/social/extract-phones.py` の出力 (§4-1) |
| `apps/lp/site/og-1200x630.png` | 新規 (生成物をコミット) | `mocks/social/render.sh` の出力 (§4-3) |
| `apps/lp/site/fonts/zenmaru.css` + `apps/lp/site/fonts/zenmaru/000.woff2`〜`365.woff2` | 新規 (vendoring をコミット) | `python3 -I mocks/store/vendor-fonts.py zenmaru --out apps/lp/site/fonts` の出力 (366 ファイル、計 7.0 MB を実測。ブラウザは `unicode-range` で使う字のスライスだけ取る) |
| `mocks/social/extract-phones.py` | 新規 | §4-1 |
| `mocks/social/index.html` | 新規 | §4-2 (1920×1080 の canvas) |
| `mocks/social/render.mjs` | 新規 | §4-3 |
| `mocks/social/render.sh` | 新規 | §4-3 |
| `mocks/social/lp-shots.mjs` | 新規 | §7-2 (Developer の完了条件用の LP スクショ + 崩れ検査) |
| `mocks/social/README.md` | 新規 | 「正典は本 doc」の 1 行 + §6 のコマンド列 |
| `mocks/social/.gitignore` | 新規 | `out/` の 1 行 |
| `mocks/store/shoot.mjs` | 新規 | §4-4 (Chrome 起動・ready 待ち・撮影の共通部。store と social が共用) |
| `mocks/store/render.mjs` | 変更 | Chrome 起動と撮影を `shoot.mjs` の呼び出しに置換 (§4-4)。引数・出力・終了コードは不変 |
| `mocks/store/vendor-fonts.py` | 変更 | `--out <dir>` を追加 (§4-5)。引数なしの既定動作は不変 |
| `assets/social/1.0.1/hero-1920x1080.png` `og-1200x630.png` | 新規 (生成物をコミット) | §4-3 |
| `CLAUDE.md` (atender) | 変更 | §8 の 2 か所 |

**触らないもの**: `apps/web/**` (`og-default-1200x630.png` も据え置き)、`apps/api/**`、`apps/ios/**`、`pnpm-workspace.yaml`、ルートの `package.json` / `pnpm-lock.yaml` / `.dockerignore`、`assets/store/**` (読むだけ)、`mocks/store/index.html` (読むだけ。§4-1 の定数の出どころ)。DNS / Cloudflare Tunnel (触らない — `knowledge/library/cloudflare-tunnel-2026.md` 2026-10-30 節)。ASC (§9)。

### 0-2. pnpm workspace との関係

`pnpm-workspace.yaml` の `apps/*` は **`package.json` を持つディレクトリだけ**をパッケージとして拾う。`apps/lp/` には `package.json` を置かない (ビルドが無いので要らない) — これで workspace にも lockfile にも入らない。`mocks/social/` も `package.json` を持たない (puppeteer-core は `mocks/store/node_modules` のものを `shoot.mjs` 経由で使う、§4-4)。

## 1. 目的

App Store の外から atender を知った人 (SNS・口コミ・検索) が着地する公式ページを `https://atender.aisaba.net` に置き、App Store / Web 版へ 1 タップで送る。同時に SNS 告知用の 16:9 画像を作る。見た目とコピーは承認済みのストア画像 (1.0.1) をそのまま使い、新しいトーンを作らない。

## 2. 素材の判断 — 端末画像をどこから取るか (裁定 3)

### 2-1. 比較

| 案 | 中身 | 長所 | 致命傷 |
|---|---|---|---|
| A. スライド PNG をそのまま並べる | `slide-N.png` (1320×2868) を `<img>` で 5 枚 | 作業ゼロ | 見出しが画像の中 (HTML の h1/h2 と二重になるか、見出しが検索・読み上げから消える)。縦長 2.2:1 なので PC の横レイアウトで 1 枚が画面の 2 倍の高さ。1 枚 0.75 MB × 5 |
| **B. スライドから端末だけを透過で切り出す (採用)** | `mocks/store/index.html` の CSS の端末座標から角丸マスクを作り、PIL で切り抜いて WebP | 再撮影不要・平日制約なし。端末の見た目 (ベゼル・傾き・浮いた端末) がストアと 1 px も違わない。HTML 側で見出しを本物の文字で組める。5 枚 + hero で計 290 KB (実測) | 1.0.1 のスライドの構図に縛られる (1 枚目の画面は傾いた端末の上半分しか無い → hero はペア構図の端末 2 台をまとめて 1 枚にする)。3・4 枚目はバッジの縁が上ベゼルに 12 px 掛かる → 5 枚目の同じ画素で埋める (§4-1、実走で確認済み) |
| C. StoreShotsFlow で再撮影して CSS 端末で描く | §6 (store doc) の手順で `shots/` を作り直す | 構図が自由・最高画質 | seed は平日のみ・API を Touri のターミナルで立てる・シミュレータ・撮影の 30 分前後。今回の要求 (ストア画像の感じで良い) に対して過剰。撮り直した画面は 1.0.1 のストア画像と微妙に違う (日付・出欠) ので「ストアと同じ」がかえって崩れる |

**決定: B**。LP と SNS 画像の両方を B の切り出し物 (6 ファイル) だけで組む。C は「ストア画像を作り直すとき」に一緒にやる (そのときは §4-1 の定数を新しい `index.html` から引き直す)。

### 2-2. 切り出しの実走結果 (Architect が scratchpad で実行して目視)

| 出力 | 元 | 元の座標 (px、スライド座標) | 出力寸法 (WebP) | サイズ |
|---|---|---|---|---|
| `hero-phones.webp` | slide-1 + slide-2 を横に連結 (2640×2868) | 傾いた端末 (`.phone.shared`) と浮いた端末 (`.phone.floating`) の外形の和。bbox (447, 929)-(2543, 2868) | 1200×1110 (2096×1939 を縮小) | 85 KB |
| `phone-2.webp` | slide-2 | 浮いた端末の全体。bbox (706, 1669)-(1223, 2773) | 517×1104 (原寸) | 37 KB |
| `phone-3.webp` `phone-4.webp` `phone-5.webp` | slide-3/4/5 | 直立端末の上 79%。bbox (125, 1043)-(1195, 2868) | 720×1228 (1070×1825 を縮小) | 46 / 38 / 41 KB |

`hero-phones` は「学期・科目 (今日までの出席率 91%)」の傾いた端末の上半分 + ホームの浮いた端末で、ストアの 1・2 枚目の連続構図をそのまま 1 枚にしたもの。下端はスライドの下端 (y 2868) で水平に切れている → 配置では必ず**下端を枠の下端に揃えて**「画面の外へ続く」見せ方にする (ストアと同じ)。`phone-3/4/5` も同様に下端が切れている。`phone-2` だけは全体が写っている (下端に余白を置ける)。

## 3. LP の UI/UX

### 3-1. 視覚階層 (汎用層 §7-1)

| 段 | 要素 | 段の作り方 |
|---|---|---|
| L0 | hero の大見出し「もう出席率で焦らない」 | 900 / 44px (mobile)・64px (≥960)。ページで唯一の h1 |
| L1 | 各節の大見出し (h2) + 端末画像 | 900 / 36px・52px。画像は面積最大だが見出しの下か横 |
| L2 | 小見出し (accent)・App Store バッジ・円バッジ | 700 / 19px・24px |
| L3 | 補助文・対象・フッター・散らし図形・ワードマーク | 500 / 16px・17px、フッター 14px |

サイズ段は見出し / 小見出し / 本文の 3 段 (ストアと同じ)。

### 3-2. 動線 (汎用層 §7-2)

最頻タスク = 「App Store で入手」。hero の App Store バッジは 375×667 (iPhone SE) の初期表示に入る (上端からの位置: header 64 + 余白 24 + 小見出し 27 + 8 + 大見出し 106 + 20 + 補助文 3 行 82 + 28 = 359px、下端 407px < 667px)。同じバッジ + Web 版リンクを末尾 (§3-3 の 7) にも置き、読み終えた位置から 1 タップ。ナビゲーションは置かない (1 ページの縦スクロールで完結、§5 の「1 画面完結」)。

### 3-3. セクション構成 (ストアの 1〜5 枚目に 1:1)

| # | 節 | 小見出し | 大見出し (`<br>` で改行、[ ] は `em.hl`) | 補助文 (ASC 1.0.1 description からの抜き出し、一字一句) | 画像 | 円バッジ / マスコット | `--hl` |
|---|---|---|---|---|---|---|---|
| 1 | hero | 出席率、把握してる？ | もう[出席率]で / 焦らない | Atender は、学生が自分の時間割を登録し、授業ごとの出欠をワンタッチで記録して、科目ごとの出席率を追いかけるためのアプリです。 | `hero-phones.webp` | なし | teal `#56D8C3` |
| 2 | 出欠 | 授業おわったら | [ワンタップ]で / 出席完了 | ワンタッチ出欠 (出席/遅刻/欠席/公欠) | `phone-2.webp` | なし | blue `#568CFC` |
| 3 | 残り回数 | あと何回休める？ | [科目ごと]に / すぐ分かる | 出席率の追跡 (必要出席率までの残り回数、休講・振替) | `phone-3.webp` | 円バッジ「欠席上限も / 遅刻の換算も / 科目ごとに」 | violet `#A978FA` |
| 4 | 公開時間割 | 時間割の入力、だるい？ | [同じ学科]のを / そのまま使う | 時間割の登録 (学校と学科の公開テンプレから引き継ぎ) | `phone-4.webp` | 円バッジ「学校と学科を / 選ぶだけ」 | magenta `#FC6ABF` |
| 5 | ルーム | 次の空きコマ、誰いる？ | 友達の[時間割]を / 重ねて見る | 友達・ルーム (時間割の共有、授業変更の確認) | `phone-5.webp` | マスコット | coral `#FD728E` |
| 6 | できること | (なし) | できること | ASC の「■ できること」6 項目 + ログイン行 (§3-4 の HTML のとおり) | なし | なし | — |
| 7 | 締めの CTA | (なし) | (なし) | なし | App Store バッジ + 「Web 版を開く」 | なし | — |

- 小見出し・大見出し・円バッジの文言はストア doc §3-1 A 案を**一字も変えずに**写す (全角の「？」「、」を含む)
- 補助文は ASC description の該当行。行頭の「・」と「■」は落とし、括弧内は原文どおり (半角括弧・スラッシュ)
- 「Web 版を開く」「対象: 専門学校・大学の学生」「App Store からダウンロード」(バッジの alt) はリンクのラベルと ASC の対象行で、キャッチコピーではない
- 落とした訴求 (カレンダー書き出し・新学期の引き継ぎ) は 6 の「できること」にだけ出る (ストア doc §2 と同じ扱い)

### 3-4. `apps/lp/site/index.html` (全文)

JS なし・`style` 属性なし (CSP `style-src 'self'` で inline style は効かない、§5-2)。

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
  <section class="sec hero s1">
    <span class="shape a" aria-hidden="true"></span><span class="shape b" aria-hidden="true"></span><span class="shape c" aria-hidden="true"></span>
    <div class="wrap grid">
      <div class="text">
        <p class="small">出席率、把握してる？</p>
        <h1>もう<em class="hl">出席率</em>で<br>焦らない</h1>
        <p class="lead">Atender は、学生が自分の時間割を登録し、授業ごとの出欠をワンタッチで記録して、科目ごとの出席率を追いかけるためのアプリです。</p>
        <div class="cta">
          <a class="store-badge" href="https://apps.apple.com/jp/app/id6790604371"><img src="/img/app-store-badge-ja.svg" alt="App Store からダウンロード" width="109" height="40"></a>
          <a class="web-link" href="https://atender.appily.run">Web 版を開く</a>
        </div>
        <p class="target">対象: 専門学校・大学の学生</p>
      </div>
      <figure class="visual bleed hero-visual">
        <img src="/img/hero-phones.webp" alt="Atender の学期・科目画面 (今日までの出席率 91%) とホーム画面の時間割" width="1200" height="1110">
      </figure>
    </div>
  </section>

  <section class="sec feature s2">
    <span class="shape a" aria-hidden="true"></span><span class="shape b" aria-hidden="true"></span><span class="shape c" aria-hidden="true"></span>
    <div class="wrap grid">
      <div class="text">
        <p class="small">授業おわったら</p>
        <h2><em class="hl">ワンタップ</em>で<br>出席完了</h2>
        <p class="lead">ワンタッチ出欠 (出席/遅刻/欠席/公欠)</p>
      </div>
      <figure class="visual floating">
        <img class="phone" src="/img/phone-2.webp" alt="ホーム画面: 今週の時間割と「今日は全出席」ボタン" width="517" height="1104">
      </figure>
    </div>
  </section>

  <section class="sec feature reverse s3">
    <span class="shape a" aria-hidden="true"></span><span class="shape b" aria-hidden="true"></span><span class="shape c" aria-hidden="true"></span>
    <div class="wrap grid">
      <div class="text">
        <p class="small">あと何回休める？</p>
        <h2><em class="hl">科目ごと</em>に<br>すぐ分かる</h2>
        <p class="lead">出席率の追跡 (必要出席率までの残り回数、休講・振替)</p>
      </div>
      <figure class="visual bleed has-badge">
        <p class="badge">欠席上限も<br>遅刻の換算も<br>科目ごとに</p>
        <img class="phone" src="/img/phone-3.webp" alt="学期・科目画面: 科目ごとの出席率と「あと N 回休める」" width="720" height="1228">
      </figure>
    </div>
  </section>

  <section class="sec feature s4">
    <span class="shape a" aria-hidden="true"></span><span class="shape b" aria-hidden="true"></span><span class="shape c" aria-hidden="true"></span>
    <div class="wrap grid">
      <div class="text">
        <p class="small">時間割の入力、だるい？</p>
        <h2><em class="hl">同じ学科</em>のを<br>そのまま使う</h2>
        <p class="lead">時間割の登録 (学校と学科の公開テンプレから引き継ぎ)</p>
      </div>
      <figure class="visual bleed has-badge">
        <p class="badge">学校と学科を<br>選ぶだけ</p>
        <img class="phone" src="/img/phone-4.webp" alt="公開時間割の一覧: 同じ学校・学科の時間割を選んで取り込む" width="720" height="1228">
      </figure>
    </div>
  </section>

  <section class="sec feature reverse s5">
    <span class="shape a" aria-hidden="true"></span><span class="shape b" aria-hidden="true"></span><span class="shape c" aria-hidden="true"></span>
    <div class="wrap grid">
      <div class="text">
        <p class="small">次の空きコマ、誰いる？</p>
        <h2>友達の<em class="hl">時間割</em>を<br>重ねて見る</h2>
        <p class="lead">友達・ルーム (時間割の共有、授業変更の確認)</p>
      </div>
      <figure class="visual bleed has-mascot">
        <img class="mascot" src="/img/mascot-hello.webp" alt="" width="400" height="400">
        <img class="phone" src="/img/phone-5.webp" alt="ルームの時間割: 友達のコマが重なって表示される" width="720" height="1228">
      </figure>
    </div>
  </section>

  <section class="sec list">
    <div class="wrap">
      <h2>できること</h2>
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

  <section class="sec closing">
    <div class="wrap">
      <div class="cta">
        <a class="store-badge" href="https://apps.apple.com/jp/app/id6790604371"><img src="/img/app-store-badge-ja.svg" alt="App Store からダウンロード" width="109" height="40"></a>
        <a class="web-link" href="https://atender.appily.run">Web 版を開く</a>
      </div>
      <p class="target">対象: 専門学校・大学の学生</p>
    </div>
  </section>
</main>
<footer class="site-footer wrap">
  <nav aria-label="法務とサポート">
    <a href="https://atender.appily.run/privacy.html">プライバシーポリシー</a>
    <a href="https://atender.appily.run/terms.html">利用規約</a>
    <a href="https://atender.appily.run/support">サポート</a>
  </nav>
</footer>
</body>
</html>
```

### 3-5. `apps/lp/site/style.css` (全文)

数値の根拠: 色・図形・見出しの比率はストア doc §4-2〜§4-6、余白は 4/8px の段 (汎用層 §2)、文字は rem (`1rem = 16px`、ブラウザの文字サイズ設定を尊重)。ブレークポイントは **960px の 1 本**。

```css
:root {
  color-scheme: light;
  --bg: #FFFFFF;
  --glow: color-mix(in srgb, #1E96E6 18%, #FFFFFF);
  --glow-mid: color-mix(in srgb, #1E96E6 6%, #FFFFFF);
  --ink: #30415B;
  --accent-600: #147FCC;
  --badge-bg: #147FCC;
  --badge-fg: #FFFFFF;
  --phone-shadow: rgba(15, 23, 42, .28);
  --line: rgba(48, 65, 91, .08);
  --teal: #56D8C3; --blue: #568CFC; --indigo: #8F7EFC; --violet: #A978FA; --magenta: #FC6ABF; --coral: #FD728E;
  --shape-alpha-k: 2;
  --font: "Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font); font-weight: 500; -webkit-font-smoothing: antialiased; }
img { display: block; max-width: 100%; height: auto; }
a { color: inherit; }
a:focus-visible { outline: 3px solid var(--accent-600); outline-offset: 3px; border-radius: 6px; }

.wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; }
.site-header { height: 64px; display: flex; align-items: center; }
.logo { display: inline-flex; align-items: center; min-height: 44px; }
.logo img { width: 120px; }

.sec { position: relative; overflow: hidden; isolation: isolate; border-top: 1px solid var(--line);
  background: radial-gradient(ellipse at 55% 82%, var(--glow) 0, var(--glow-mid) 35%, var(--bg) 67%); }
.sec.hero { border-top: 0; }
.sec.reverse { background: radial-gradient(ellipse at 45% 82%, var(--glow) 0, var(--glow-mid) 35%, var(--bg) 67%); }
.sec .wrap { position: relative; z-index: 1; }

.small { margin: 0 0 .5rem; font-size: 1.1875rem; line-height: 1.4; font-weight: 700; letter-spacing: .04em; color: var(--accent-600); }
h1, h2 { margin: 0; font-weight: 900; line-height: 1.2; color: var(--ink); }
h1 { font-size: 2.75rem; letter-spacing: .035em; }
h2 { font-size: 2.25rem; letter-spacing: .025em; }
em.hl { font-style: normal; background: linear-gradient(transparent 60%, color-mix(in srgb, var(--hl) 45%, transparent) 60%); padding: 0 .04em; }
.s1 { --hl: var(--teal); } .s2 { --hl: var(--blue); } .s3 { --hl: var(--violet); } .s4 { --hl: var(--magenta); } .s5 { --hl: var(--coral); }
.lead { margin: 1.25rem 0 0; font-size: 1rem; line-height: 1.7; max-width: 34em; }
.target { margin: 1rem 0 0; font-size: .875rem; line-height: 1.6; }

.cta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-top: 1.75rem; }
.store-badge { display: inline-block; padding: 0; line-height: 0; }
.store-badge img { height: 48px; width: auto; }
.web-link { display: inline-flex; align-items: center; min-height: 44px; font-size: 1rem; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }

.hero { padding-top: 24px; }
.feature { padding-top: 64px; }
.visual { position: relative; margin: 40px auto 0; }
.hero-visual { max-width: 560px; }
.visual.bleed { margin-bottom: 0; }
.visual.floating { width: min(220px, 100% - 48px); margin-bottom: 64px; }
.visual.has-badge, .visual.has-mascot, .visual.bleed:not(.hero-visual) { width: min(280px, 100% - 48px); }
.visual .phone { width: 100%; filter: drop-shadow(7px 17px 27px var(--phone-shadow)); }
.visual.floating .phone { filter: drop-shadow(11px 29px 44px var(--phone-shadow)); }
.hero-visual img { filter: drop-shadow(4px 11px 16px var(--phone-shadow)); }

.has-badge { padding-top: 148px; }
.badge { position: absolute; top: 0; right: -24px; z-index: 2; width: 156px; height: 156px; margin: 0; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; text-align: center;
  background: var(--badge-bg); color: var(--badge-fg); border: 2px solid #FFFFFF; box-shadow: 0 8px 28px rgba(20, 127, 204, .30);
  font-size: 1.1875rem; font-weight: 700; line-height: 1.45; letter-spacing: .025em; }
.has-mascot { padding-top: 124px; }
.mascot { position: absolute; top: 0; right: -20px; z-index: 2; width: 150px; }

.list { padding: 64px 0; }
.can { margin: 1.5rem 0 0; padding: 0; list-style: none; display: grid; gap: 12px; }
.can li { position: relative; padding-left: 28px; font-size: 1rem; line-height: 1.7; }
.can li::before { content: ""; position: absolute; left: 0; top: .45em; width: 14px; height: 14px; border-radius: 28%; background: var(--c); }
.can li:nth-child(6n+1) { --c: var(--teal); } .can li:nth-child(6n+2) { --c: var(--blue); } .can li:nth-child(6n+3) { --c: var(--indigo); }
.can li:nth-child(6n+4) { --c: var(--violet); } .can li:nth-child(6n+5) { --c: var(--magenta); } .can li:nth-child(6n+6) { --c: var(--coral); }
.closing { padding: 64px 0; text-align: center; }
.closing .cta { justify-content: center; margin-top: 0; }

.site-footer { padding: 32px 20px 48px; border-top: 1px solid var(--line); }
.site-footer nav { display: flex; flex-wrap: wrap; gap: 0 24px; }
.site-footer a { display: inline-flex; align-items: center; min-height: 44px; font-size: .875rem; text-decoration: underline; text-underline-offset: 3px; }

.shape { position: absolute; z-index: 0; width: var(--size); height: var(--size); border-radius: 28%; background: var(--c); opacity: calc(var(--alpha) * var(--shape-alpha-k)); }
.shape.a { left: 3%; top: 12%; --size: 28px; --alpha: .14; }
.shape.b { right: 4%; top: 30%; --size: 20px; --alpha: .18; }
.shape.c { left: 6%; bottom: 18%; --size: 36px; --alpha: .12; }
.s1 .a { --c: var(--teal); }    .s1 .b { --c: var(--blue); }    .s1 .c { --c: var(--indigo); }
.s2 .a { --c: var(--blue); }    .s2 .b { --c: var(--indigo); }  .s2 .c { --c: var(--violet); }
.s3 .a { --c: var(--indigo); }  .s3 .b { --c: var(--violet); }  .s3 .c { --c: var(--magenta); }
.s4 .a { --c: var(--violet); }  .s4 .b { --c: var(--magenta); } .s4 .c { --c: var(--coral); }
.s5 .a { --c: var(--magenta); } .s5 .b { --c: var(--coral); }   .s5 .c { --c: var(--teal); }

@media (min-width: 960px) {
  .wrap { padding: 0 40px; }
  .site-header { height: 80px; }
  .logo img { width: 150px; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 48px; align-items: end; }
  .grid .text { align-self: center; padding-bottom: 96px; }
  .reverse .grid .visual { order: -1; }
  .small { font-size: 1.5rem; margin-bottom: .75rem; }
  h1 { font-size: 4rem; }
  h2 { font-size: 3.25rem; }
  .lead { font-size: 1.0625rem; line-height: 1.8; }
  .store-badge img { height: 56px; }
  .hero { padding-top: 64px; }
  .feature { padding-top: 96px; }
  .visual { margin-top: 0; }
  .hero-visual { max-width: none; width: 100%; }
  .visual.floating { width: 280px; margin-bottom: 96px; }
  .visual.has-badge, .visual.has-mascot, .visual.bleed:not(.hero-visual) { width: 340px; }
  .visual .phone { filter: drop-shadow(8px 21px 32px var(--phone-shadow)); }
  .visual.floating .phone { filter: drop-shadow(14px 36px 55px var(--phone-shadow)); }
  .hero-visual img { filter: drop-shadow(6px 16px 25px var(--phone-shadow)); }
  .has-badge { padding-top: 200px; }
  .badge { width: 208px; height: 208px; right: -48px; font-size: 1.5625rem; }
  .has-mascot { padding-top: 168px; }
  .mascot { width: 200px; right: -40px; }
  .shape.a { --size: 44px; } .shape.b { --size: 32px; } .shape.c { --size: 56px; }
  .list { padding: 96px 0; }
  .can { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 32px; }
  .closing { padding: 96px 0; }
  .site-footer { padding: 32px 40px 48px; }
}
```

### 3-6. 数値の検算と逸脱理由

| 項目 | 値 | 検算 / 理由 |
|---|---|---|
| 大見出しの 1 行幅 | h1 最長 6 字「もう出席率で」、h2 最長 7 字「友達の時間割を」 | mobile: 6×44×1.035 = 273px、7×36×1.025 = 258px。320px 幅 (内側 280px) でも折り返さない。PC: 6×64×1.035 = 397px、7×52×1.025 = 373px < 列幅 496px ((1120−80−48)/2) |
| 小見出し 19px / 700 | accent-600 `#147FCC` / 白 = 4.25:1 | 太字 18.66px 以上 = WCAG の大きい文字 (3:1) で合格。**17px にしない理由**: 4.5:1 未満の色なので大きい文字の側に置く |
| 円バッジ 156px / 19px (mobile)、208px / 25px (PC) | 白 / `#147FCC` = 4.25:1 (大きい文字) | 最長行 6 字「遅刻の換算も」× 3 行の外接: mobile 117×83px → 半対角 71.6 < 78、PC 154×109px → 半対角 94.3 < 104。ストアの 391px/40px 比 (9.8) をそのまま縮めると mobile で 186px (画面幅の 50%) になるので、文字ブロックの外接円に詰めた |
| 円バッジ / マスコットの位置 | 端末の上に `padding-top` = バッジ径 − 8 (マスコットは可視部下端 − 8) | ストア §4-3 と同じ「バッジの下端が端末上端に 8px 掛かる」関係。マスコットの可視 bbox 下端 = 幅 × 899/1024 (ストア doc §4-3 の実測) |
| 端末の幅 `min(280px, 100% − 48px)` | 320px 幅でバッジ右端 = 20 + 24 + 232 + 24 = 300 ≤ 320 | 280px 固定だと 320px 幅でバッジが 4px はみ出す |
| 落ち影 | ストアの `26px 67px 102px` (スライド座標、全端末共通) × (表示幅 / 切り出しの原寸幅)、四捨五入 | 規則: 倍率 = 表示幅 ÷ 原寸幅 (hero 2096 / phone-2 517 / phone-3〜5 1070)。hero: mobile 335/2096 = 0.16 → `4px 11px 16px`、PC 516/2096 = 0.246 → `6px 16px 25px`。直立: mobile 280/1070 = 0.26 → `7px 17px 27px`、PC 340/1070 = 0.318 → `8px 21px 32px`。浮いた端末: mobile 220/517 = 0.43 → `11px 29px 44px`、PC 280/517 = 0.54 → `14px 36px 55px`。SNS (§4-2) は 860/2096 = 0.41 → `11px 27px 42px` |
| ダークモード | 対応しない (`color-scheme: light`) | 裁定 5。ストア画像が白基調で、端末画像も light 外観で撮られている |
| 本文 16px / 17px | 汎用層 §1 の Web 本文 14–16px | PC は読み物として 17px (日本語の補助文が 1 行 30 字前後に収まる) |
| tap target | バッジ 48/56px 高、Web 版リンク・フッター・ロゴ `min-height: 44px` | 汎用層 §2 |

### 3-7. 状態 (汎用層 §7-4)

静的ページなので状態は 3 つ: (1) フォント未着 → `font-display: swap` (Google の CSS に入っている) で `--font` の後続 (ヒラギノ丸ゴ等) を先に描く、(2) 画像の読み込み失敗 → `alt` が出る (全 `img` に `width`/`height` があるので段ずれしない)、(3) JS 無効 → 影響なし (JS を持たない)。empty / 権限なし は存在しない。

### 3-8. App Store バッジ

- 入手元: Apple Marketing Tools — `https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/ja-jp` (2026-10-30 に HTTP 200 `image/svg+xml` 9,880 byte、`viewBox="0 0 108.85157 40"`)。`curl -sS -L -o apps/lp/site/img/app-store-badge-ja.svg <URL>` で取得し、`shasum -a 256` が §0-1 の値と一致することを確かめる (違えば Apple が版を更新している → そのまま使ってよいが、Leader に値を報告)
- 規約 (`developer.apple.com/app-store/marketing/guidelines/`): 画面上の最小高さ 40px (本設計 48/56px)、周囲の余白はバッジ高さの 1/4 以上 (隣の「Web 版を開く」との gap 20px ≥ 48/4 = 12px)、改変しない (色・比率をいじらない — CSS は `height` だけ指定し `width: auto`)

## 4. SNS 画像と素材の生成

### 4-1. `mocks/social/extract-phones.py`

```
python3 -I mocks/social/extract-phones.py      # 引数なし。パスはスクリプトの位置から解決
```

- 入力: `assets/store/1.0.1/slide-{1..5}.png` (1320×2868)、`apps/ios/Atender/Assets.xcassets/mascot-hello.imageset/mascot-hello-1024.png`
- 出力: `apps/lp/site/img/{hero-phones,phone-2,phone-3,phone-4,phone-5,mascot-hello}.webp` (`WEBP`, `quality=88`, `method=6`)
- 依存: Pillow (WebP 対応ビルド。この Mac の `python3 -I` で 11.3.0 / `features.check('webp') == True` を確認済み)
- 定数は `mocks/store/index.html` の CSS から取る (下表)。**スライドを作り直して `index.html` の端末の CSS が変わったら、この表を引き直す**

| 定数 | 値 | `mocks/store/index.html` の出どころ |
|---|---|---|
| `W, H` | 1320, 2868 | canvas |
| `RING` | 5 | `.phone` の `box-shadow: 0 0 0 3px …, 0 0 0 5px …` (外形を 5px 外へ広げる) |
| 傾いた端末 | 幅 1535、left 414、top 1010、角丸 `1535 × .17`、回転 −8° (原点 = 上辺中央 (1181.5, 1010)) | `.phone.shared` |
| 浮いた端末 | 幅 501、left 2034 (ペア座標。slide-2 では 714)、top 1677、角丸 85 | `.phone.floating` |
| 直立端末 | 幅 1054、left 133、top 1051、角丸 `1054 × .17` | `.phone.straight` |
| 端末の高さ | 幅 × 2868 / 1320 | `aspect-ratio: 1320 / 2868` |

処理 (Architect が scratchpad で実走して上の §2-2 の寸法を得た手順。`SS = 4` 倍で角丸を描いて LANCZOS で縮小し、縁をアンチエイリアス):

```python
#!/usr/bin/env python3
"""ストア画像 (assets/store/1.0.1/slide-N.png) から端末部分を透過で切り出し、LP 用 WebP にする。
正典: .designs/20261030-landing-page-and-social-image.md §4-1。定数は mocks/store/index.html の .phone.* から。"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'assets/store/1.0.1'
MASCOT = ROOT / 'apps/ios/Atender/Assets.xcassets/mascot-hello.imageset/mascot-hello-1024.png'
OUT = ROOT / 'apps/lp/site/img'
W, H = 1320, 2868
RING = 5
SS = 4


def load(n):
    return Image.open(SRC / f'slide-{n}.png').convert('RGBA')


def rr(size, box, radius):
    w, h = size
    m = Image.new('L', (w * SS, h * SS), 0)
    x0, y0, x1, y1 = box
    ImageDraw.Draw(m).rounded_rectangle((x0 * SS, y0 * SS, x1 * SS, y1 * SS), radius=radius * SS, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def save(im, name, width=None):
    if width is not None and im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(OUT / f'{name}.webp', 'WEBP', quality=88, method=6)
    print(f'{name}.webp {im.width}x{im.height}')


def hero():
    pair = Image.new('RGBA', (2 * W, H))
    pair.paste(load(1), (0, 0))
    pair.paste(load(2), (W, 0))
    pw = 1535
    ph = pw * H / W
    t = rr((2 * W, H + 2000), (414 - RING, 1010 - RING, 414 + pw + RING, 1010 + ph + RING), pw * .17 + RING)
    t = t.rotate(8, resample=Image.BICUBIC, center=(414 + pw / 2, 1010)).crop((0, 0, 2 * W, H))  # CSS rotate(-8deg) = 画面上で反時計回り = PIL の +8
    fw = 501
    fh = fw * H / W
    f = rr((2 * W, H), (2034 - RING, 1677 - RING, 2034 + fw + RING, 1677 + fh + RING), 85 + RING)
    mask = ImageChops.lighter(t, f)
    pair.putalpha(mask)
    save(pair.crop(mask.getbbox()), 'hero-phones', 1200)


def floating():
    fw = 501
    fh = fw * H / W
    im = load(2)
    m = rr((W, H), (714 - RING, 1677 - RING, 714 + fw + RING, 1677 + fh + RING), 85 + RING)
    im.putalpha(m)
    save(im.crop(m.getbbox()), 'phone-2')


def straight(n, donor=None):
    im = load(n)
    if donor is not None:
        # 3・4 枚目は円バッジ (下端 y 1058) の縁と影が上ベゼルに掛かる。バッジの無い 5 枚目の同じ行で置き換える
        # (y 1046〜1085 はベゼルと黒縁だけで画面は y 1086 から。5 枚目のマスコットの可視部は y 1013 で終わる)
        im.paste(donor.crop((128, 1046, 1192, 1086)), (128, 1046))
    sw = 1054
    sh = sw * H / W
    m = rr((W, H + 400), (133 - RING, 1051 - RING, 133 + sw + RING, 1051 + sh + RING), sw * .17 + RING).crop((0, 0, W, H))
    im.putalpha(m)
    save(im.crop(m.getbbox()), f'phone-{n}', 720)


def mascot():
    save(Image.open(MASCOT).convert('RGBA'), 'mascot-hello', 400)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    hero()
    floating()
    s5 = load(5)
    straight(3, s5)
    straight(4, s5)
    straight(5)
    mascot()
```

期待される標準出力 (実走値): `hero-phones.webp 1200x1110` / `phone-2.webp 517x1104` / `phone-3.webp 720x1228` / `phone-4.webp 720x1228` / `phone-5.webp 720x1228` / `mascot-hello.webp 400x400`。

**残る見え方**: 3・4 枚目の端末の画面上端 (ステータスバー付近) にはバッジの影の薄い青が残る。ストア画像そのままの見え方なので消さない。

### 4-2. `mocks/social/index.html` — 1920×1080 の構図

パラメタなし。`mocks/store/index.html` の作法 (ready の合図・欠け画像の検出) を踏襲し、素材は LP のコミット済みファイルを相対パスで読む (social 側にフォントや画像を持たない)。

```
1920×1080
┌──────────────────────────────────────────────────────────────┐
│  Atender (120,96 300×67)                ▢        ▢    ▢       │
│                                     ▢                         │
│  出席率、把握してる？ (120,300)               ╱‾‾‾‾‾‾‾‾╲      ▢  │
│  もう出席率で                               ╱ 学期・科目 ╲       │
│  焦らない      (h1 392〜670)               │ 91%        │┌──┐  │
│                                          │            ││ホ│  │
│  [App Store バッジ] (120,760 h96)          │            ││ー│  │
│                                          │            │└──┘  │
│ ▢            ▢                ▢           │ (下端で切れる)        │
└──────────────────────────────────────────────────────────────┘
       OG (1200×630) = y 36〜1044 を 0.625 倍 (§4-3)
```

| 要素 | CSS (全て `position: absolute`、px) |
|---|---|
| `html, body` | `margin:0; width:1920px; height:1080px; overflow:hidden; background:#FFFFFF` |
| `.canvas` | `width:1920px; height:1080px; position:relative; overflow:hidden; isolation:isolate; background: radial-gradient(ellipse at 72% 82%, var(--glow) 0, var(--glow-mid) 35%, var(--bg) 67%)`。glow の中心を 55% → 72% に寄せるのは端末を右に置くため (ストアは端末が中央) |
| 色トークン | §3-5 の `:root` と同じ値 (`--bg` `--glow` `--glow-mid` `--ink` `--accent-600` `--phone-shadow` `--shape-alpha-k: 2`) |
| `.wordmark` | `<img src="../../apps/lp/site/img/wordmark-navy.png">`、`left:120px; top:96px; width:300px; height:67px; object-fit:contain` |
| `.heading` | `left:120px; top:300px; width:820px; z-index:3` |
| `.small` | `margin:0 0 22px; font-size:50px; line-height:1.4; font-weight:700; letter-spacing:.04em; color:var(--accent-600)` → y 300〜370。10 字 × 50 × 1.04 = 520px |
| `h1` | `margin:0; font-size:116px; line-height:1.2; font-weight:900; letter-spacing:.035em; color:var(--ink); white-space:pre-line` → 1 行目 y 392〜531、2 行目 531〜670。6 字 × 116 × 1.035 = 720px < 820 |
| 文言 | 小見出し `出席率、把握してる？`、大見出し `もう[出席率]で\n焦らない` (ストア A 案 1 枚目)。`[ ]` を `<em class="hl">` に分割する処理はストアと同じ (`textContent` で組み、`innerHTML` を使わない)。`--hl: #56D8C3` |
| `em.hl` | ストアと同じ (`linear-gradient(transparent 60%, color-mix(in srgb, var(--hl) 45%, transparent) 60%)`, `padding:0 .04em`) |
| `.store-badge` | `<img src="../../apps/lp/site/img/app-store-badge-ja.svg">`、`left:120px; top:760px; height:96px; width:auto` (= 261px) → 下端 856 |
| `.phones` | `<img src="../../apps/lp/site/img/hero-phones.webp">`、`right:80px; bottom:0; width:860px; height:auto` (→ 860×795.5、左端 980・上端 284.5)、`z-index:2; filter: drop-shadow(11px 27px 42px var(--phone-shadow))` |
| `.shape` | ストアと同じ角丸正方形 (`border-radius:28%`、不透明度 = alpha × `--shape-alpha-k`)、`z-index:0`。座標 `[x, y, size, alpha]` と色 (`i % 6` で teal, blue, indigo, violet, magenta, coral): `[1010,120,64,.18]` `[1180,210,40,.24]` `[1700,130,96,.12]` `[1840,360,52,.18]` `[70,930,72,.14]` `[560,900,48,.22]` `[880,980,88,.10]` `[1500,60,44,.20]` |
| フォント | `<link rel="stylesheet" href="../../apps/lp/site/fonts/zenmaru.css">` だけ (ネット経由の Web フォントは headless Chrome をハングさせる — ストア doc §4-4) |

**干渉の検算**: 見出しの右端 120 + 720 = 840 < 端末の左端 980。バッジの下端 856 < OG の下端 1044。図形 `[880,980,88]` の右端 968 < 980、`[1840,360,52]` の左端 1840 = 端末の右端 1840 (接するだけ)。ワードマークの上端 96 > OG の切り落とし 36 (OG 上での余白 37.5px)。

**ready の合図** (ストア doc §5-1 と同じ形): `fonts/zenmaru.css` の load → `Promise.all([document.fonts.load('900 116px "Zen Maru Gothic"', 大見出し), document.fonts.load('700 50px "Zen Maru Gothic"', 小見出し)])` が両方 1 件以上 → `dataset.fontLoaded = 'true'` (それ以外 `'false'`)。`document.images` を全部 `decode()` し、失敗した `src` を `dataset.missing` (JSON 配列) に。最後に `dataset.ready = 'true'`。

### 4-3. `mocks/social/render.mjs` / `render.sh`

```
node mocks/social/render.mjs          # 引数なし。引数があれば usage を出して exit 2
bash mocks/social/render.sh           # 依存の用意 → 生成 → 寸法表示 → 配布先へコピー
```

`render.mjs`:
- `launchChrome()` (§4-4) → `newPage()` → `setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })`
- URL = `index.html` の file URL
- `capture(page, url, { file: out/hero-1920x1080.png, clip: { x: 0, y: 0, width: 1920, height: 1080 } })`
- `capture(page, url, { file: out/og-1200x630.png, clip: { x: 0, y: 36, width: 1920, height: 1008, scale: 0.625 } })` → 1200×630 (1920 × .625 = 1200、1008 × .625 = 630。puppeteer-core 24.43.1 の `ScreenshotClip.scale` を d.ts で確認済み)
- OG を 1920×1080 から切る理由: 1.905:1 (X の `summary_large_image` 推奨の 1.91:1 にほぼ一致) を同じ HTML から作り、構図を 2 つ持たない。上下 36px (3.3%) を落とす — 要素は全て y 96〜1044 の内側
- どちらかが `false` なら最後に `process.exit(1)`
- 出力ディレクトリ `out/` は `mkdirSync({ recursive: true })`

`render.sh` (`set -euo pipefail`、自分のディレクトリへ `cd`):
1. `test -d ../store/node_modules/puppeteer-core || (cd ../store ; npm i --no-audit --no-fund)`
2. `test -f ../../apps/lp/site/fonts/zenmaru.css || { echo "apps/lp/site/fonts が無い (vendor-fonts.py --out で作る)" >&2 ; exit 1 ; }`
3. `test -f ../../apps/lp/site/img/hero-phones.webp || python3 -I extract-phones.py`
4. `node render.mjs`
5. `sips -g pixelWidth -g pixelHeight out/*.png | grep -E "png|pixel" | paste - - -`
6. `mkdir -p ../../assets/social/1.0.1 ; cp out/hero-1920x1080.png out/og-1200x630.png ../../assets/social/1.0.1/ ; cp out/og-1200x630.png ../../apps/lp/site/og-1200x630.png`

### 4-4. `mocks/store/shoot.mjs` (共通部) と `render.mjs` の置換

```js
// mocks/store/shoot.mjs
export const GOOGLE_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export function findChrome(): string;                  // 現 render.mjs の findChrome をそのまま移す (Chrome for Testing の探索)
export async function launchChrome(): Promise<Browser>; // CHROME=cft → findChrome()、CHROME=<path> → そのパス、未設定 → GOOGLE_CHROME。
                                                        // launch オプションは現 render.mjs と同一 (headless:true, timeout:15000, args 3 つ)
export async function capture(page, url, { file, clip }): Promise<boolean>;
  // goto(url, {waitUntil:'load'}) → waitForFunction(dataset.ready === 'true', {timeout:30000})
  // → fontLoaded !== 'true' || missing !== '[]' なら console.error(`${file}: 書き出し中止 (fontLoaded=${fontLoaded}, missing=${missing})`) して false
  // → screenshot({ path: file, clip }) → console.log(`${file} (fontLoaded=true)`) → true
  // 例外は console.error(`${file}: 書き出し失敗`, error) して false
```

`mocks/store/render.mjs` は引数検査・`out` の作成・viewport (1320×2868) を残し、起動を `launchChrome()`、各スライドの処理を `capture(page, url, { file, clip: { x:0, y:0, width:1320, height:2868 } })` に置き換える。ストア doc §7 の SS1〜SS11 の挙動 (出力パス・ログの形式・終了コード 0/1/2) は不変。`puppeteer-core` の import は `shoot.mjs` だけが持つ (Node は bare specifier を import する側のファイルの位置から解決するので、`mocks/social/render.mjs` が `../store/shoot.mjs` を import すれば `mocks/store/node_modules` が使われる)。

### 4-5. `mocks/store/vendor-fonts.py` の `--out`

`python3 -I vendor-fonts.py zenmaru --out <dir>`: `--out` があればその次の引数を出力先 (`Path(...).resolve()`) にし、`<dir>/zenmaru.css` と `<dir>/zenmaru/NNN.woff2` を書く。無ければ従来どおり `mocks/store/fonts/`。CSS 内の参照は従来どおり `url(zenmaru/NNN.woff2)` (CSS からの相対) なので、LP では `/fonts/zenmaru.css` → `/fonts/zenmaru/NNN.woff2` になる。`--out` の後に値が無ければ usage を出して exit 2。

## 5. 配信 (Docker / nginx / Coolify)

### 5-1. `apps/lp/Dockerfile` (全文)

```dockerfile
# atender LP。正典: .designs/20261030-landing-page-and-social-image.md §5
# 1.31-alpine = minor 固定 + patch 自動追従 (nwasabi-hp と同じ取引。2026-10-30 に Docker Hub でタグ実在を確認)
FROM nginxinc/nginx-unprivileged:1.31-alpine
# 配信範囲 = site/ の中身だけ。docroot はベースイメージの /usr/share/nginx/html (50x.html 同梱) でなく自前のディレクトリ
COPY site/ /var/www/site/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
```

build context は `apps/lp/` (Coolify の `base_directory: "/apps/lp"`、§5-3)。リポジトリ全体を context にしない理由は §10。

### 5-2. `apps/lp/nginx.conf` (全文)

Architect が scratchpad で同等の image を作り、Coolify と同じ `--read-only --tmpfs /tmp:… --cap-drop ALL …` で起動して §6 の LP1〜LP6 を全部確認済み (2026-10-30)。

```nginx
# atender LP (https://atender.aisaba.net)。正典: .designs/20261030-landing-page-and-social-image.md §5
server {
    # Coolify の in-container healthcheck は localhost を ::1 に解決することがあるので dual-stack
    listen 8080;
    listen [::]:8080;
    server_name _;

    # 自前の docroot。ベースイメージの /usr/share/nginx/html (50x.html 同梱) は参照しない
    root /var/www/site;
    charset utf-8;
    server_tokens off;
    absolute_redirect off;

    gzip on;
    gzip_types text/css text/plain image/svg+xml;

    # add_header は server 階層だけに置く (location に 1 つでも書くとここが継承されなくなる)
    add_header Content-Security-Policy "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok";
    }

    location = / {
        expires -1;
        try_files /index.html =404;
    }

    # 法務・サポートは Web 版の正本へ (LP に複製しない)。将来 ASC の URL を aisaba.net に寄せるための入口
    location ~ ^/(privacy|terms|support)(\.html)?$ {
        return 302 https://atender.appily.run/$1.html;
    }

    location /fonts/ {
        expires 30d;
        try_files $uri =404;
    }

    location /img/ {
        expires 7d;
        try_files $uri =404;
    }

    location / {
        try_files $uri =404;
    }
}
```

- `/privacy` を **302** にする理由: ASC の `marketingUrl` / `supportUrl` を次の版で `atender.aisaba.net` に寄せたとき (§9)、法務の正本を移さずに済む。301 にしない理由: 永続キャッシュされると、将来法務を LP 側に移したときに戻せない
- `try_files $uri` だけにする理由: `/img/` のようなディレクトリと未知パスを 404 に揃える (`$uri/` を足すと 403 になる)

### 5-3. Coolify の作成手順 (Leader が実行。設計承認後、`feature/landing-page` を main にマージした後)

前提: `$COOLIFY_API_BASE` / `$COOLIFY_API_TOKEN` (appily SKILL)。Bash で `&&` を使わない。

```sh
# 0. 参照: atender-web の実設定を見て、下の値と一致することを確かめる (違えば atender-web の実値に合わせる)
curl -sS -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$COOLIFY_API_BASE/applications/xxg31wshj6rhjmnffju1bg5r" \
  | jq '{custom_docker_run_options, limits_memory, destination: .destination.network}'
#    期待: "--cap-drop ALL --security-opt no-new-privileges=true --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --pids-limit 256" / "512m" / "dst-atender-web"

# 1. destination を作る
curl -sS -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" -H "Content-Type: application/json" \
  "$COOLIFY_API_BASE/servers/gr24emlhaecs4tfw0f4gzoct/destinations" \
  -d '{"name":"dst-atender-lp","network":"dst-atender-lp"}'
#    → 応答の uuid を DST に。422 / 403 なら UI の Servers → Destinations → New で同名を作り uuid を拾う

# 2. app を作る (instant_deploy は false。設定を全部入れてから deploy する)
curl -sS -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" -H "Content-Type: application/json" \
  "$COOLIFY_API_BASE/applications/public" -d '{
    "project_uuid":"nkaqu9lx6xewvzsvkadnmjcf",
    "server_uuid":"gr24emlhaecs4tfw0f4gzoct",
    "environment_name":"production",
    "environment_uuid":"a10ciubapu564fjtznsd794z",
    "destination_uuid":"'"$DST"'",
    "git_repository":"https://github.com/ait913/atender",
    "git_branch":"main",
    "build_pack":"dockerfile",
    "base_directory":"/apps/lp",
    "dockerfile_location":"/Dockerfile",
    "ports_exposes":"8080",
    "name":"atender-lp",
    "domains":"https://atender.aisaba.net",
    "instant_deploy":false
  }'
#    → 応答の uuid を APP に。409 (domain conflict) なら止めて Leader → Touri (force_domain_override は使わない)

# 3. 即 PATCH (Cloudflare 配下の必須 + 実行時の制限 + healthcheck)
curl -sS -X PATCH -H "Authorization: Bearer $COOLIFY_API_TOKEN" -H "Content-Type: application/json" \
  "$COOLIFY_API_BASE/applications/$APP" -d '{
    "is_force_https_enabled":false,
    "custom_docker_run_options":"--cap-drop ALL --security-opt no-new-privileges=true --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --pids-limit 256",
    "limits_memory":"512m",
    "health_check_enabled":true,
    "health_check_path":"/healthz",
    "health_check_port":"8080",
    "health_check_host":"localhost",
    "health_check_method":"GET",
    "health_check_scheme":"http",
    "health_check_return_code":200,
    "health_check_interval":10,
    "health_check_timeout":5,
    "health_check_retries":3,
    "health_check_start_period":5
  }'

# 4. 確認してから deploy
curl -sS -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$COOLIFY_API_BASE/applications/$APP" \
  | jq '{name, fqdn, base_directory, dockerfile_location, ports_exposes, is_force_https_enabled, limits_memory, custom_docker_run_options, destination: .destination.network}'
curl -sS -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$COOLIFY_API_BASE/deploy?uuid=$APP&force=false"
#    → deployment_uuid の status を GET $COOLIFY_API_BASE/deployments/<deployment_uuid> で finished まで待つ

# 5. 外から確認
curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" --max-time 10 https://atender.aisaba.net/
```

5 の結果での分岐 (**fqdn ダンスの判断基準**):

| 結果 | 判断 | 次の手 |
|---|---|---|
| `200` | 成功 | §6 の LP1〜LP7 を本番 URL で流す |
| `301/302/307/308` で `redirect_url` が `https://atender.aisaba.net/` (自分自身) | Coolify の HTTPS 強制ループ | appily SKILL「新規アプリ作成標準フロー」6 の fqdn ダンス: `domains:""` → deploy force → `https://atender.aisaba.net/` が `404` (body `404 page not found`) を確認 → `{"domains":"https://atender.aisaba.net","is_force_https_enabled":false}` → deploy force → 200 |
| `404` で body が `404 page not found` (Traefik の素の本文) かつ app の status が `running:healthy` | Traefik に router が無い (aisaba.net を dockerfile app の fqdn に入れた初の例 — 研究 findings) | `GET /applications/$APP` の `custom_labels` を base64 デコードし `Host(\`atender.aisaba.net\`)` があるか見る。無ければ fqdn ダンスを 1 回。それでも 404 なら止めて Touri |
| `404` で body が nginx の 404 HTML | コンテナまで届いている (LP の `/` だけが壊れている) | イメージの中身 (`site/index.html` の有無) を疑う。設定の問題ではない |
| `502` / `503` | Traefik → コンテナの port 不一致 or 起動失敗 | `custom_labels` の `loadbalancer.server.port` が 8080 か、app の status / logs |

完了後: atender の CLAUDE.md「デプロイ / 外部リソース」に `atender-lp: <APP>` を書く (§8)。

## 6. 挙動仕様

### LP (配信。ローカルは `docker run` した `http://127.0.0.1:18080`、本番は `https://atender.aisaba.net`)

- **LP1** `GET /` → 200、`Content-Type: text/html; charset=utf-8`、`Cache-Control: no-cache`、`Content-Security-Policy` が §5-2 の文字列と完全一致、`X-Content-Type-Options: nosniff`
- **LP2** `GET /healthz` → 200、本文 `ok`、`text/plain`。コンテナ内の `wget -q -O- http://localhost:8080/healthz` と `http://[::1]:8080/healthz` の両方で `ok`
- **LP3** `GET /privacy` `/privacy.html` → 302、`Location: https://atender.appily.run/privacy.html`。`/terms` `/terms.html` → `…/terms.html`、`/support` `/support.html` → `…/support.html`。302 応答にも CSP ヘッダが付く (`always`)
- **LP4** `GET /nope` `/img/` `/fonts/` `/Dockerfile` `/nginx.conf` `/README.md` `/50x.html` → 404
- **LP5** `GET /og-1200x630.png` → 200、`image/png`、1200×630
- **LP6** `GET /img/hero-phones.webp` → 200、`image/webp`、`Cache-Control: max-age=604800`。`GET /fonts/zenmaru.css` → 200、`text/css`、`Cache-Control: max-age=2592000`。`GET /fonts/zenmaru/000.woff2` → 200、`font/woff2`
- **LP7** `index.html` と `style.css` が参照するローカル資源 (`src` / `href` / `url()`) が全て 200。外部 URL は次の 5 つだけ: `https://apps.apple.com/jp/app/id6790604371`、`https://atender.appily.run`、`…/privacy.html`、`…/terms.html`、`…/support` (+ meta の `https://atender.aisaba.net/…`)

### LH (HTML)

- **LH1** `<html lang="ja">`、`<title>` が `Atender — もう出席率で焦らない`、`og:image` が `https://atender.aisaba.net/og-1200x630.png`、`twitter:card` が `summary_large_image`、`apple-itunes-app` が `app-id=6790604371`
- **LH2** `h1` はちょうど 1 個でテキスト `もう出席率で焦らない` (`<br>` を除いて)、`h1 em.hl` のテキスト `出席率`。`h2` はちょうど 5 個で、順に `ワンタップで出席完了` / `科目ごとにすぐ分かる` / `同じ学科のをそのまま使う` / `友達の時間割を重ねて見る` / `できること`。2〜5 節の `h2 em.hl` のテキストは順に `ワンタップ` / `科目ごと` / `同じ学科` / `時間割`
- **LH3** `.small` は 5 個で §3-3 の小見出しと完全一致 (全角「？」「、」込み)。`.badge` は 2 個で `<br>` を改行とみなしたテキストが `欠席上限も\n遅刻の換算も\n科目ごとに` と `学校と学科を\n選ぶだけ`
- **LH4** `<script>` 要素 0 個、`style` 属性を持つ要素 0 個、`fonts.googleapis.com` / `fonts.gstatic.com` を含む文字列 0 件
- **LH5** 全 `img` が `width`・`height`・`alt` 属性を持つ (マスコットだけ `alt=""`)
- **LH6** 375px 幅と 1280px 幅で `document.documentElement.scrollWidth === document.documentElement.clientWidth` (横スクロールが出ない)。320px 幅でも同じ
- **LH7** 375px 幅で App Store バッジ (hero) の `getBoundingClientRect().bottom` ≤ 667
- **LH8** フォント: 表示後に `document.fonts.check('900 44px "Zen Maru Gothic"', 'もう出席率で')` が true (375px)

### SI (SNS 画像)

- **SI1** `bash mocks/social/render.sh` → exit 0、`mocks/social/out/hero-1920x1080.png` (1920×1080) と `og-1200x630.png` (1200×630) ができ、`assets/social/1.0.1/` と `apps/lp/site/og-1200x630.png` にコピーされている (3 か所の og はバイト一致)
- **SI2** `apps/lp/site/fonts/zenmaru.css` を一時的に退避して `node mocks/social/render.mjs` → exit 1、stderr に `書き出し中止 (fontLoaded=false` を含む
- **SI3** `apps/lp/site/img/hero-phones.webp` を一時的に退避して `node mocks/social/render.mjs` → exit 1、stderr の `missing=` に `hero-phones.webp` を含む
- **SI4** `node mocks/social/render.mjs x` → exit 2

### EX (切り出し)

- **EX1** `python3 -I mocks/social/extract-phones.py` の標準出力が §4-1 の 6 行 (寸法込み) と一致
- **EX2** `phone-{3,4,5}.webp` の画素 (0, 0) と (719, 0) が alpha 0 (角丸の外)。`phone-3.webp` と `phone-4.webp` の画素 (620, 8) が alpha 255 かつ B − R < 30 (実測: パッチ後 (68,70,74)、パッチなしだと (116,180,226) で B − R = 110 = バッジの縁)。負のコントロール: `straight(3, s5)` の `donor` を外して走らせると (620, 8) が B − R ≥ 30 になる

### store の回帰

- **ST1** `mocks/store/render.mjs` の置換前後で、単色ダミー `shots/` (1320×2868 の PNG 5 枚) から出した `out/a-light/slide-{1..5}.png` がバイト一致 (置換前を `git stash` で取っておく)。テスト後にダミー `shots/` と `out/` を消す
- **ST2** `python3 -I mocks/store/vendor-fonts.py zenmaru` (引数 `--out` なし) が従来どおり `mocks/store/fonts/zenmaru.css` を書く

## 7. テスト基盤と Developer の完了条件 (Reviewer は skip — 裁定 7)

### 7-1. 基盤

- HTTP: `docker build -t atender-lp:local apps/lp` → `docker run -d --name atender-lp-local -p 18080:8080 --cap-drop ALL --security-opt no-new-privileges=true --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --pids-limit 256 atender-lp:local` → `curl` で LP1〜LP7。終わったら `docker rm -f atender-lp-local`
- ブラウザ: puppeteer-core + `/Applications/Google Chrome.app` (`mocks/store/shoot.mjs` の `launchChrome`)。chrome-devtools MCP (Chrome for Testing) でもよいが、CfT 148 は CDP 無応答の既知事象がある (`knowledge/tool-quirk/headless-chrome-screenshot-hang-macos.md`)。撮影前に `nohup caffeinate -d -u -t 1800 > /dev/null 2>&1 &` (ディスプレイスリープで撮影が全滅する — `knowledge/gotcha/macos-display-sleep-blocks-headless-screenshot.md`)

### 7-2. `mocks/social/lp-shots.mjs`

```
node mocks/social/lp-shots.mjs [baseUrl=http://127.0.0.1:18080/]
```
- 幅 320 / 375 / 1280 (高さ 800、`deviceScaleFactor: 2`) でそれぞれ `goto(baseUrl, {waitUntil:'networkidle0'})` → `document.fonts.ready` → `fullPage: true` で `projects/atender/.tmp/lp-shots/<幅>.png` (`.tmp/` は atender の `.gitignore` 済み) を書く
- 各幅で LH6 (scrollWidth)・全 `img` の `complete && naturalWidth > 0`・LH8 (`document.fonts.check`) を評価し、1 つでも偽なら理由を stderr に出して最後に exit 1。375 では LH7 も評価
- `launchChrome` は `../store/shoot.mjs` から import

### 7-3. 完了条件 (全部満たしたら Leader に報告)

1. `python3 -I mocks/social/extract-phones.py` が EX1 の出力を出す
2. `bash mocks/social/render.sh` が SI1 を満たす (2 画像が出る)。SI2〜SI4 も確認
3. Mac の Docker で `docker build -t atender-lp:local apps/lp` が通り、§7-1 の `docker run` で LP1〜LP7 が通る
4. `node mocks/social/lp-shots.mjs` が exit 0 で `.tmp/lp-shots/{320,375,1280}.png` を書く。**375 と 1280 の 2 枚を Read で目視**し、見出しの改行位置 (§3-3 の `/` の位置)・バッジとマスコットが端末の右上に乗る・端末の下端が節の下端で切れる、を確認
5. ST1・ST2
6. LH1〜LH5 を `index.html` に対する grep / puppeteer の evaluate で確認
7. `git status` で §0-1 の表に無いファイルが増えていない (`mocks/social/out/` は ignore 済み)

## 8. atender CLAUDE.md の変更 (Developer がブランチ内で)

1. 「主要ワークフロー」に節を追加:
   `### LP / SNS 画像を更新する` — 正典は本 doc §6 (挙動) と `mocks/social/README.md`。文言・レイアウトは `apps/lp/site/index.html` / `style.css` を直接編集。端末画像はストア画像 (`assets/store/<版>/`) から `python3 -I mocks/social/extract-phones.py` で作り直し、SNS / OG 画像は `bash mocks/social/render.sh`。ストア画像を作り直して端末の CSS 座標が変わったら extract-phones.py の定数を引き直す。デプロイは Coolify の `atender-lp` を deploy (POST)
2. 「デプロイ / 外部リソース」に `- LP URL: https://atender.aisaba.net (health: GET /healthz)` と `- atender-lp: <Coolify 作成後に Leader が記入>` を追加

## 9. 後続 (今回やらない)

- **ASC の `marketingUrl` を `https://atender.aisaba.net` に** — READY_FOR_SALE の 1.0.1 は編集不可。次の版 (1.0.2) の作成時に `appStoreVersionLocalizations` の `marketingUrl` を差し替える。同時に `supportUrl` を `https://atender.aisaba.net/support` (LP の 302 → appily.run) に寄せるかは 1.0.2 で決める
- **X の見え方の確認** — X の Card Validator は 2026 時点で廃止されている可能性がある。代わりに X の投稿作成画面に `https://atender.aisaba.net` を貼ってカードのプレビューを目視 (Touri)。LINE / Slack / Discord の展開も同時に見る
- **SNS 画像の別案** (機能別 3 枚等) は、要望が出たら `mocks/social/index.html` に `?scene=` を足す形で拡張する

## 10. 不採用案

- **スライド PNG をそのまま並べる (§2-1 A)**: 見出しが画像の中になり、HTML の見出しと二重か、検索・読み上げから消える。縦長 2.2:1 で PC の横レイアウトに乗らない
- **再撮影して CSS 端末で描く (§2-1 C)**: 平日・API・シミュレータ・30 分の手作業に対し、得るのは構図の自由だけ。1.0.1 のストア画像とも画面の中身がずれる
- **スライドを CSS の `clip-path` でその場で切り抜く**: 1 枚 0.75 MB の原画を 5 枚とも配ることになり (切り出し WebP は計 290 KB)、3・4 枚目のバッジの縁がベゼルに残る
- **Google Fonts の CDN を読む (atender-web と同じ)**: LP の外部リクエストを 0 にして CSP を `'self'` だけで閉じたい (解析タグを入れない方針と同じ理由)。SNS 画像の headless 撮影もローカルのフォントが要るので、vendoring は一度で両方に効く
- **`pyftsubset` で使う字だけのサブセット (計 100 KB 程度)**: 文言を変えるたびに作り直しが要り、忘れると無い字だけ別フォントで描かれる (見落としやすい)。`unicode-range` のスライスならブラウザは使う字の分だけ取るので転送量の差は小さい。リポジトリが 7 MB 増えるのは受け入れる (→ Leader 判断点 1)
- **OG を別 HTML (1200×630 専用レイアウト) で作る**: 構図が 2 つになり文言・配置の変更が片方に漏れる。16:9 の上下 36px を落とすだけで 1.905:1 になる
- **16:9 (1200×675) をそのまま `og:image` にする**: X のカードは 1.91:1 で上下が切られ、どこが切れるかを自分で決められない
- **SNS 画像を直立端末 3 台 (機能 3 つ) にする**: 見出しが 1 つしか置けない 16:9 で 3 機能を並べると 1 枚 1 メッセージ (ストア doc §2) が崩れる。hero のコピーと出席率の画面の 1 組にした
- **`render.mjs` を social 側に丸ごと複製**: Chrome の起動・ready 待ち・欠け検出が 2 か所に分かれ、CfT の回避策などの修正が片方に漏れる。`shoot.mjs` に寄せた
- **Coolify の `base_directory: "/"` (atender-web と同じ)**: LP はリポジトリの他の部分を何も使わない。ルートを context にすると Mac でのローカル build で `apps/ios/build/` (xcarchive) 等を毎回 Docker に送る。配信範囲は Dockerfile の `COPY site/` で定義しているので context を絞っても範囲の定義はリポジトリ内に残る (`pattern/static-site-serve-scope-as-copy-not-config.md` と矛盾しない)
- **LP を `apps/web` (Vite SPA) のルートとして作る**: ホストが違い (`atender.appily.run`)、SPA の fallback で未知パスが 200 になり、React を背負う。裁定 1 どおり別 app
- **`lp.atender.aisaba.net`**: wildcard DNS / Universal SSL は第 1 レベルまで (`pattern/flat-subdomain-naming-under-wildcard-dns.md`)
- **`/privacy` 等を 404 にする**: ASC の URL を aisaba.net に寄せる次の版で入口が要る。302 で正本 (appily.run) を 1 か所に保つ
- **`/privacy` 等を 301 にする**: 永続キャッシュされ、法務の正本を移したときに戻せない
- **最小 JS (スムーズスクロール・ナビ等)**: 1 ページの縦スクロールで要らない。JS を持たなければ CSP を `script-src` なし (`default-src 'none'`) で閉じられる
- **ダークモード**: 裁定 5。端末画像が light 外観
- **ルートの `.dockerignore` を LP 用に書き換える**: context を `apps/lp` にしたので不要。atender-web / api の build に影響させない
