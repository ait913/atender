---
title: App Store スクショ画像 設計前リサーチ — Bloom の HTML パイプライン再現手順 / atender 訴求素材 / ASC 現状と要件
category: library
project: atender
tags: [app-store, screenshots, html-render, puppeteer, bloom, asc-api, marketing-copy]
created: 2026-10-29
sources:
  - projects/bloom/mocks/store/{index.html,render.mjs,render.sh,vendor-fonts.py,package.json}
  - projects/bloom/.designs/20261009-onboarding-v2-and-store-shots.md §5
  - projects/bloom/assets/store/0.2.1/slide-{1..4}.png (実画像を Read)
  - https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications (curl + tag strip, 2026-10-29)
  - ASC API 実 GET (app 6790604371, 読み取りのみ。書き込みなし)
---

## Context

atender (build 21 / 1.0.1) の App Store スクショを、Bloom と同じ「HTML を puppeteer で 1 枚ずつ PNG に落とす」方式で作る前調査。コードは変更していない。Bloom 側は PJ の作業ツリーを直接読んだ (未コミット差分の有無は未確認)。

## A. Bloom パイプライン (再現手順)

### A-1. ファイル構成 (`projects/bloom/mocks/store/`、移植対象)

| ファイル | 役割 | 移植 |
|---|---|---|
| `index.html` (12KB、単一) | `COPY` (文言+素材パス) / `TUTORIAL` / `FONTS` + CSS + 描画 JS。`?slide=N&font=zen` で 1 枚描く | コピーして `COPY` を atender 用に書き換え。`TUTORIAL`・`page=tutorial` 分岐・`lock.svg` は不要なので捨てる |
| `render.mjs` | puppeteer-core で `index.html?slide=N&font=F` を開き `dataset.ready==='true'` を待って `screenshot({clip:0,0,1290,2796})`。出力 `out/<font>/slide-N.png`。引数 `node render.mjs [font=zen] [slides=1,2,3,4] [store|tutorial]` | そのまま (サイズ定数 `W,H` を 1320×2868 に変えるか否かは Architect 裁定) |
| `render.sh` | `npm i` (無ければ) → フォント CSS 無ければ `vendor-fonts.py` → `node render.mjs` → `sips` で寸法表示。引数 `[font] [slides]` | そのまま。既定 `SLIDES="1,2,3,4"` は枚数に合わせて直す |
| `vendor-fonts.py` | Google Fonts の woff2 を `fonts/<key>/NNN.woff2` に取り込み `fonts/<key>.css` を書く (ネット要。`python3 -I`) | そのまま。atender は `FONTS` に使うフォントだけ残す |
| `fonts/` | 35MB (zen だけで 363 ファイル = unicode-range 分割) | 使うフォント 1 種だけ取り込む |
| `wordmark.png` | 透過 PNG 1200×420、`.wordmark` (250×88、左上 88,115) に `object-fit:contain` | atender は `wordmark-navy.png` / `wordmark-white.png` (後述) |
| `shots/` | 素材スクショ (端末画面全体、crop しない)。git に入れない | 新規に撮る |
| `package.json` | 依存は `puppeteer-core ^24.43.1` だけ | `npm i` (node_modules 54MB。puppeteer-core は Chrome を同梱しない) |

### A-2. 実行環境 (★ 設計の前提)

- **Chrome for Testing は使えない**: 148 はこの Mac で起動後 CDP が無応答 (`knowledge/tool-quirk/headless-chrome-screenshot-hang-macos.md`)。`render.mjs` は既定で `/Applications/Google Chrome.app` を使う (puppeteer が一時プロファイルを作るのでユーザープロファイルは汚れない)。`CHROME=cft` で CfT を試せる。今日の時点で CfT は `~/.cache/chrome-devtools-mcp/browsers/chrome/mac_arm-148.0.7778.97`、Google Chrome は存在 (`ls` 確認)
- `chrome --screenshot` は macOS で終了しない → CDP 駆動 (render.mjs) 一択。フォントはネットでなくローカル woff2 (`--virtual-time-budget` + Web フォントでハング)
- backdrop-filter を多用するとタイムアウト (`knowledge/gotcha/headless-screenshot-backdrop-filter-timeout.md`)。Bloom の HTML は使っていない
- ローカル目視は `python3 -m http.server` で `index.html?slide=N` (Bloom doc は file:// 不可と書くが、render.mjs は `file://` で通っている)

### A-3. レイアウト言語化 (キャンバス 1290×2796。`assets/store/0.2.1/slide-1..4.png` を目視)

共通:
- 背景はほぼ黒 (`#010207`) + 右下寄りの青黒い radial gradient (`#131a28 → #060912 → #010207`)。散らし要素は半透明の六角形 (銀 `#C9CDD6` と琥珀 `#FFB454` が 2 個、座標固定・乱数なし。Bloom ブランドの図形)
- 左上 (x=88, y=115) にワードマーク 250×88。その下 y=292 から見出しブロック (幅 1114): 上に「小見出し」60px/700 (例「いつものグループに」)、下に「大見出し」120px/900 (Zen Kaku Gothic New 900、行高 1.2、letter-spacing .025em、`\n` で 2 行まで)。文字色 `#E6E8EE`、白文字
- 端末モック: `.phone` = 画面比 1179:2556、角丸 = 幅×0.17、銀グラデのベゼル (CSS 描画)、ダイナミックアイランド描画、影つき。素材スクショは `object-fit:cover` で全画面のまま入れる (ステータスバー 9:41・電波・電池フルに固定して撮影)
- 端末は幅 1030px・x=130・y=1025 で**下端が画面外に切れる** (下 1/3 を切って画面が大きく見える構図)
- 吹き出し「バッジ」: 直径 382 の銀色円 (`#C9CDD6`、文字は暗色 39px/700、3 行)、右 66px・上 650px。見出しと端末の間の右側

スライドごと:
1. **ペア構図 (1・2 枚目が連続した 2580px 幅の 1 枚絵を 1290 で切る)**: 1 枚目は左に見出し「いつものグループに / 会う予定が生まれるSNS」(ペアなので 146px)、端末 (幅 1500px) を **-8° 傾けて** 右へはみ出させ、2 枚目への導線にする。2 枚目は見出し「近くにいたら / 集まる？」、傾いた端末の続きと、小さい直立端末 (幅 490、角丸 83) を右下に重ねる
2. 3 枚目: 「今なにしてる？ / 写真・動画を送る」+ 直立端末 (ホーム) + バッジ「リアクションとコメントで盛り上がろう」
3. 4 枚目: 「集まるときは / ビーコンを立てる」+ 直立端末 (ビーコン作成シート) + バッジ「集合中だけみんなの場所がわかる」
- 訴求構造 = **1 枚 1 メッセージ、疑問/状況の小見出し → 動詞の大見出し → 補足バッジ**。説明文は書かず、画面そのもので語る

### A-4. 素材スクショの撮り方 (Bloom)

- Flutter 側の shot driver (`shot.json` に `{"mode":"demo","scenario":"hero_group_map"}` や `{"mode":"live","loginAs":"dev:mina","route":...,"sheet":"beacon-picker"}`) でデモデータを描き、ステータスバーを 9:41 に固定 (§4-3 override)。iPhone 17 Pro (1206×2622) を想定し `cover` で 1179×2556 に吸収。**実ユーザーの投稿・dev の実データは使わない** (プライバシー、Touri 2026-10-09)。投稿サムネは Codex imagegen で生成して合成
- atender には shot driver が無い。代替 = 下記 B-4 (seed + bearer 注入 + `xcrun simctl io screenshot` / UITest の `ScreenshotFlow`)

### A-5. ASC 差し替え (Bloom 設計 doc §5-3 の手順、そのまま使える)

`appStoreVersionLocalizations` → `appScreenshotSets` (`APP_IPHONE_67`) → 既存 `DELETE` → `POST /v1/appScreenshots` (fileName/fileSize) → 応答の `uploadOperations` へ `PUT` (offset/length 分割、`requestHeaders` 付与) → `PATCH uploaded:true + sourceFileChecksum(md5)` → `assetDeliveryState COMPLETE` まで poll → セット relationships で並び確定。`Muraki/scripts/asc.py` は `call(method, path, body)` が `(status, json)` のタプルを返すだけで**アップロード補助は無い** (使い捨てスクリプトを書く)。編集可能な版状態は `PREPARE_FOR_SUBMISSION` / `DEVELOPER_REJECTED` のみ。

## B. atender の材料

### B-1. 訴求点 (事実: 設計 doc `20261029-build21-*.md` §0 / CLAUDE.md / seed)

学生にとっての価値 (機能 → 価値):
1. **ワンタッチ出欠**: ホームの「今日の出欠」CTA から 1 タップで出席/欠席などを記録 (複数ステータス、公欠 EXCUSED は build 18)
2. **「あと N 回休める」(build 21 新)**: 科目ごとに必要出席率・欠席上限回数・遅刻 N 回で欠席 1 回を設定でき、率と回数の**厳しい方**で残りを出す。ユーザー単位の必要出席率 (既定 70%、seed は 80%) は従来から
3. **出席率の見える化**: 学期・科目タブの出席率リング + 学期カレンダー (日ごとの出欠 multi-status、授業変更=振替対応)
4. **公開時間割の取り込み (build 21 新)**: 学校+学科で公開された時間割を、オンボーディング / 設定の学校・学科変更 / 学期作成から提案・取り込み。再入力ゼロ。公開テンプレの量産も止めた
5. **iPhone カレンダーへ時間割を書き出し (残した機能)**: 専用カレンダー + 差分更新。休講・公欠は除外、連続コマは結合 (build 21 でカレンダー読み込み・個人予定は撤去)
6. **ルーム / 友達**: ルームで友達の時間割を重ねて見る (ホームの context chip)。QR・リンクで参加。友達タブ
7. 時間割: 6 色の科目カラー (tint 面)、授業変更、学期ロールオーバー
- 対象: 専門学校・大学。iPhone 専用 (iOS 17+)。**カレンダー機能全般 (個人予定/ICS/Google) は撤去済みなので訴求しない** (Touri の指示リストの「学期カレンダー」は出席カレンダーのこと)
- ★ 法令・出席要件の言い回しは断定を避ける (`07c6742` の knowledge: 日本の出席要件は率が基準、回数は運用上の翻訳)。「単位が取れる」「留年しない」等の保証表現は避ける

### B-2. ブランド資産

| 資産 | 値 / パス |
|---|---|
| accent (azure) | light `#1E96E6` (accent500) / dark `#3DA9F0`。600 `#147FCC`、700 `#0F6399`。tint は `rgba(30,150,230,.10/.18)`。`apps/ios/Atender/Core/DesignSystem/Color+Atender.swift`、`apps/web/src/styles.css`。ASC/画像でも値を変えない (CLAUDE.md) |
| 6 色リング | マスコットのリングが原典: ティール / 青 / 紫 / ピンク / コーラル (+ もう 1 ティール)。**コード上の値は `Color+Atender.swift` の ring 定義を Architect が引くこと (今回未抽出)**。seed の科目色は `#3B82F6 #10B981 #F59E0B #EF4444 #8B5CF6` |
| App Icon | `apps/ios/Atender/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` = **白地に 6 色リング** (中心は抜き) |
| マスコット | `apps/ios/.../Assets.xcassets/mascot-hello.imageset/mascot-hello-1024.png` (白い丸いボディに 6 色リング・手を振る 3D 風、透過、1024²。ストア画像に使える唯一の高解像度)。Web には `apps/web/public/character/mascot-{chat 403,idea 406,laptop 313,run 355}.png` もあるが**小さい (300-400px)**ので 1290 幅に拡大すると荒れる。新ポーズが要るなら Codex imagegen (`knowledge/tool-quirk/codex-cli-imagegen-tool.md`、アニメ調禁止) |
| ワードマーク | `Assets.xcassets/wordmark.imageset/wordmark-navy.png` / `wordmark-white.png`、ロゴマーク `logo-mark(@2x).png` (寸法未確認) |
| フォント | アプリは Google Sans Medium Latin のみ同梱 (`Resources/Fonts/`、日本語はシステム = ヒラギノ)。ストア画像の日本語見出し用フォントはアプリに規定なし → Architect 裁定 (Bloom は Zen Kaku Gothic New 900。ポップ系は M PLUS Rounded 1c / Zen Maru Gothic / Dela Gothic One 等が候補。Google Fonts 経由、OFL) |
| デザイン言語 | `DESIGN.md` §0 「多色のポップさ: azure + 6 色を 15-18% tint 面で」、角丸 18-28、中立はシステム色。`knowledge/pattern/aisaba-design-language.md` は Web 系の言語 (今回は DESIGN.md が正典で足りる) |

### B-3. ASC の現状 (2026-10-29 実 GET)

- アプリ ID `6790604371`。App Store version は **`1.0` のみ (READY_FOR_SALE)**、`1.0.1` はまだ無い (build 21 は TestFlight 配布のみ)。ja ローカライズ `bfb01c50-…`
- 既存スクショ: `APP_IPHONE_67` セットに **5 枚** (`atender-01..05.png`、全て **1320×2868**、COMPLETE。2026-10-09 提出分 = 時間割ホーム / 出席率 / カレンダー / 授業詳細 / 友達)
- ★ **既存 5 枚のうち「カレンダー」は build 21 で撤去した個人カレンダー画面の可能性が高い (未確認、画像は未取得)**。公開中の 1.0 の画像は 1.0.1 を作った版に引き継がれる/編集できる (版作成後に差し替える)。1.0 (公開中) には付けられない
- 差し替えの前提: 新しい App Store version `1.0.1` を作る (`POST /v1/appStoreVersions`)、`PREPARE_FOR_SUBMISSION` の間に A-5 の手順

### B-4. 素材撮影 (atender)

- `apps/api/scripts/seed-demo-user.ts` が user (デモ太郎、必要出席率 80、時間割 4 科目、1 科目に `maxAbsences 4 / tardiesPerAbsence 3`)・友達 (佐藤花子/鈴木一郎)・ルーム「情報処理科 2年A組」・公開テンプレ (同級生) まで作る。bearer `demo-bearer-token-ios-resync-0001`。`SIMCTL_CHILD_ATENDER_UI_TEST_BEARER_TOKEN=… xcrun simctl launch <UDID> net.appily.atender` → `xcrun simctl io <UDID> screenshot out.png`
- ★ seed の名前・科目は素朴 (「デモ太郎」「村木先生」「英語」)。**ストア用は名前・科目名・出席率の数字を見栄えするデモデータに差し替える seed が要る** (実ユーザーデータ禁止は Bloom と同じ)。村木先生は Touri 周辺の実名の可能性 → 変更推奨
- 1320×2868 = iPhone 17 Pro Max の実寸。`ScreenshotFlow.swift` は撮影名 (`01-home-timetable` `C01-semester-overview` `E03-room-timetable` `E04-friends` 等) を持つが、build 21 で撤去した画面の名前も残っている。API は AI が起動すると turn 終了で kill される (CLAUDE.md)
- 撮影は light で。dark は `simctl ui … appearance` を明示。ステータスバーは `simctl status_bar <UDID> override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3` (未実行、Bloom の 9:41 固定に相当する標準手段。要実測)
- 共有環境注意: `xcrun simctl list devices booted` を先に見る

### B-5. Apple 要件 (公式、2026-10-29 取得)

- 1 デバイスサイズあたり**最低 1 枚、最大 10 枚**、.jpeg/.jpg/.png
- iPhone 6.9" 相当 (Dynamic Island 大画面) の受理サイズ: **1260×2736 / 1290×2796 / 1320×2868** (縦。横はその逆)。これらが無いと 6.5" 系 (1284×2778 / 1242×2688) が必須。ASC API の enum は `APP_IPHONE_67` を流用 (`knowledge/library/app-store-connect-api-full-submission-2026.md`)。**Bloom の 1290×2796 も atender 既存の 1320×2868 もどちらも通る**
- iPhone 専用ビルド (`TARGETED_DEVICE_FAMILY=1`) なので iPad セットは不要

## Architect が決めるべき点

1. **サイズ**: 1290×2796 (Bloom 流用、`W,H` 変更不要・端末モックの比率 1179:2556 とほぼ一致) か 1320×2868 (素材実寸、既存と揃う)。推奨: 1320×2868 に統一 (素材を cover で縮めない)。どちらでも ASC は受理
2. **枚数**: Bloom は 4 枚 (1・2 枚目が連続ペア)。ASC は最大 10。推奨 5-6 枚 (出欠 / あと N 回 / 公開時間割 / ルーム / 書き出し / 出席率+学期カレンダー)
3. **背景の方向**: Bloom は黒基調 + 六角形 (Bloom ブランド)。atender は DESIGN.md が「多色ポップ + azure」なので**白〜azure 基調 + 6 色リング/科目色 tint**が整合 (Bloom を「まるまる参考」はレイアウト = 見出し位置・端末の切り方・バッジ、色味は atender ブランドに置換、が自然。Touri 確認事項)
4. **どの画面を撮るか**: 機能 1 つ = 1 画面 (A-3 の「1 枚 1 メッセージ」)。ホーム (今日の出欠 CTA 展開) / 科目詳細 or 学期タブ (「あと N 回休める」) / 公開時間割の取り込み提案 / ルームの時間割重ね / 書き出し先の iPhone カレンダー (Atender 専用カレンダーの画面は simctl の Calendar.app 撮影になる。難しければ設定シートで代替) / 出席率リング
5. **コピーの方向性** (学生向けポップ、疑問/状況の小見出し + 動詞の大見出し): 例「今日の授業は / ワンタップで出席」「あと何回 / 休める？がすぐ分かる」「同じ学科の時間割 / 見つけて即コピー」「友達と / 空きコマを重ねる」「時間割がそのまま / iPhone カレンダーに」。出席要件に関する保証表現は避ける (B-1)
6. **ワードマークの有無**: Bloom は全枚左上に常設。atender は `wordmark-navy/white.png` あり。背景色に合わせて navy/white を選ぶ。入れるなら 1 枚目のみ or 全枚 (Touri 確認)
7. **マスコット**: 1024² の `mascot-hello` のみ高解像度。バッジ位置に置く、端末横から顔を出す、など。入れるなら配置を設計に明記
8. **フォント**: B-2 の通り日本語見出しフォントを 1 つ指定。ローカル woff2 取り込み必須 (A-2)
9. **デモデータ**: 見栄えするストア専用 seed (名前/科目/出席率) の仕様。実名・実データ不可
10. 公開中 1.0 の既存 5 枚 (カレンダー画面を含む可能性) を 1.0.1 でどう差し替えるか (全置換推奨)

## How to apply

Bloom の `mocks/store/` から `index.html` `render.mjs` `render.sh` `vendor-fonts.py` `package.json` だけをコピーする (fonts/・node_modules・shots・out は持ち込まない)。`atender/mocks/store/` を置き場にするなら atender の `.gitignore` に `out/` `shots/` `node_modules/` `fonts/` を足す案も設計で決める。
