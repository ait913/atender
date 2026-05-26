---
title: Atender Redesign UI/UX Research (Phase 2)
category: research
project: atender
tags: [ui, ux, redesign, mobile-first, bottom-tab, timetable-grid, japanese-naming, design-language]
created: 2026-05-15
sources:
  - https://penmark.jp/news/2024/07/04/v3-0-0/
  - https://penmark.jp/guide/
  - https://penmark.jp/news/2023/12/11/ios17-widget/
  - https://help.penmark.jp/hc/ja/articles/4711177136153
  - https://www.appbank.net/2024/04/10/iphone-application/2740924.php
  - https://good-apps.jp/articles/890/
  - https://developer.apple.com/design/human-interface-guidelines/tab-bars
  - https://m3.material.io/components/navigation-bar/guidelines
  - https://m3.material.io/components/navigation-bar/specs
  - https://m3.material.io/components/floating-action-button/guidelines
  - https://m3.material.io/components/menus/overview
  - https://web.dev/articles/designing-for-the-notched-display
  - https://developer.mozilla.org/en-US/docs/Web/CSS/env
  - https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
  - https://developer.chrome.com/blog/viewport-resize-behavior/
  - https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
  - https://developer.apple.com/design/human-interface-guidelines/context-menus
  - https://m3.material.io/foundations/interaction/gestures
  - https://www.nngroup.com/articles/mobile-ux-tap-swipe/
  - https://www.nngroup.com/articles/bottom-sheet/
  - https://www.nngroup.com/articles/inline-editing-forms/
  - https://linear.app/method/ui
  - https://www.notion.so/design
  - https://www.notion.so/calendar
  - https://flexibits.com/fantastical
  - https://mystudylife.com/
  - https://app-liv.jp/lifestyle/scheduler/1673/
  - https://www.mext.go.jp/b_menu/toukei/mext_01087.html
  - https://prtimes.jp/main/html/rd/p/000000034.000047440.html
  - https://recruit-productdesign.jp/
---

# Atender Redesign UI/UX Research

調査日: 2026-05-15 / 調査者: researcher (Gemini + WebSearch)。
前段の [[00-research-summary]] (技術スタック・スキーマ・iPhone 移行戦略) と独立した **UX 全面改訂用のリサーチ**。

## Executive Summary (Architect への推奨 1 枚)

### 設計判断の結論

| 課題 | 推奨 |
|---|---|
| **新 design 言語** | **案 B: Penmark ライク (Soft & Youthful)** — `#FFFFFF` 背景 + **ミントグリーン accent `#10B981` または Penmark 同色 `#00C2A0`** + `Inter` (英数) + `Noto Sans JP` (和文) + 角丸 `12px` + 控えめ shadow `0 4px 12px rgba(0,0,0,0.05)`。MVP 既存の黒+emerald は**完全に廃棄**、`Atender::` 装飾 (`PageTitle title="Timetable::"`) も廃棄 |
| **ナビ構成** | **bottom tab 5 個 (モバイル) / left sidebar 5 項目 (PC ≥768px)**: `今日 / 時間割 / みんなの時間割 / 出席率 / マイページ`。各タブにアイコン + ラベル両方表示 (iOS HIG/MD3 推奨)。`safe-area-inset-bottom` 対応必須 |
| **時間割エディタ UX** | **空きセル tap → bottom sheet で授業追加 / 入っているセル tap → bottom sheet で授業詳細 (編集 + 削除ボタン) / セル長押し → 即削除確認 dialog (パワーユーザー向けショートカット)**。連続コマは **「セル merge / 内部分割線消去」+ 左 4px accent border** で表現 (Notion Calendar 系) |
| **時限可変** | 時限数を**ユーザー設定 (1-12 限、Penmark 上限 12 を踏襲)**。各時限の開始終了時刻も 1 分単位編集可。時間割画面の右上歯車 → bottom sheet `時間割設定` |
| **テンプレ検索** | **学校名 typeahead (debounce 300ms) → 学科 typeahead (フリー入力 + 既存 dropdown) → 結果カードリスト**。検索 API はサーバ側 `LIKE` (FTS5 は Phase 2)。学校マスタは文科省 CSV を seed |
| **日本語命名** | `今日 / 時間割 / みんなの時間割 / 出席率 / マイページ`、操作は `追加 / 編集 / 削除 / 保存 / キャンセル`。`::` 装飾廃止 |
| **編集削除導線** | Penmark 流の **「セル tap → bottom sheet 詳細 → 編集 / 削除」** が主導線。**長押しは sub** (誤操作リスクを抑える) |
| **変更スコープ** | **Web 全画面再実装** (`apps/web/src/routes/*` + `components/*` 全て)。API 側は変更ほぼなし (時限可変・時刻保存は既に `DaySlot` に対応済、UI 漏れだけが原因) |

### ★ 強い含意 (Architect が見落とさないこと)

★1. **「ユーザーが時限数 / 時刻を設定する画面」が MVP 設計 §5 では UI 言及されていない**。`DaySlot` schema は対応していたが UI 漏れ ([[gotcha/design-must-specify-app-export-path-for-tests]] と同じ「schema 対応済・UI 漏れ」パターン)。redesign では **「時間割画面の右上歯車 → bottom sheet で時限数 + 各時限時刻を直接編集」** を必須実装項目に明示すること。

★2. **連続コマ UI** は MVP 設計 §3 で `Meeting.periodCount` + `MeetingOccurrence` 多重生成まで通っているが、Timetable.tsx の cell 描画で「`startPeriodIndex` 以上・`startPeriodIndex + periodCount` 未満の cell に同じ授業名を描く」だけで**連続を視覚表現していない** (1限と2限が別 cell で同じ内容、境界線残る)。redesign では **CSS Grid `grid-row: span N`** で 1 つの背景塗りカードとして描画し、内部分割線を消す実装を明示。

★3. **キャッシュ問題は TanStack Query の invalidation 漏れ**。MVP の `usePatchUserTimetable` 等が optimistic update / `queryClient.invalidateQueries({ queryKey: [...] })` を正しく出していない可能性。redesign 設計 doc に **「mutation 成功時の invalidate 対象 queryKey 一覧」** を表で明示すること (Reviewer がテスト生成しやすい)。

★4. **Penmark の「セル tap → 詳細画面遷移」を踏襲しない**。Penmark は別画面遷移だが、Atender は **bottom sheet 表示**を推奨 (2024-2026 トレンド、NN/g 出典)。理由: コンテキスト維持・モーション軽量・スワイプ閉じが直感的。

★5. **mobile FAB は不採用**。bottom tab + FAB は MD3 で許容されるが、Atender は「空きセル tap で追加」が主導線なので FAB は冗長。Home 画面 (今日) の「すべて出席」ボタンは FAB ではなく **下部 sticky CTA** で実装。

### Touri 設計言語との整合

[[pattern/touri-design-philosophy]] の「シンプル + 並列拡張」とは整合する:
- design tokens (色・spacing) は CSS custom properties で 1 ファイルにまとめ、ダーク化や別アクセント色への切り替えを property 値変更だけで対応可
- bottom tab 項目は配列 1 つで定義 (`type` フィールドで discriminate)、追加削除は 1 行追記
- 時間割セル描画は「`grid-row: span N` のカード」を **1 つの component** で表現、連続コマ・単発コマで挙動分岐させない (Uniform Shape)

[[pattern/aisaba-design-language]] (黒+`::`) は **不採用**。理由は本書 §7 で詳述。

---

## §1 Penmark UX 詳細 (主要参考)

[Penmark v3 アップデート公式](https://penmark.jp/news/2024/07/04/v3-0-0/) と関連ソースから抽出。Atender の最大の参照対象。

### ナビゲーション
- **bottom tab 5 個 (2024-07 v3 以降)**: `時間割 / カレンダー / トーク / 掲示板 / マイページ`
- 旧 `ToDo` タブは「カレンダー」に統合、SNS 機能を「トーク (chat)」「掲示板 (board)」に分離
- 出典: https://penmark.jp/news/2024/07/04/v3-0-0/

### 時間割エディタ
- 行 = 時限、列 = 曜日のグリッド
- セル tap → **授業詳細画面 (別画面遷移)**
- **連続コマは縦に merge した 1 つの大きなブロック**として描画 (内部分割線なし)
- 出典: https://penmark.jp/guide/

### 時限数
- **ユーザー編集可、最大 12 限**
- 「表示情報の設定」内の「時限」項目で追加削除
- 出典: https://penmark.jp/guide/

### 時間設定
- 各時限の開始終了時刻を **1 分単位で個別編集可能**
- 大学ごとの標準時刻 preset があり、自動入力後に手動微調整可
- 出典: https://penmark.jp/guide/

### Home 画面
- 垂直リスト形式で「1限 / 2限 ...」の授業カードが時限順に並ぶ
- 各カード: 時限番号 + 時間帯 + 授業名 + 教室 + **クイック出欠ボタン (出 / 欠 / 遅)**
- 出典: https://www.appbank.net/2024/04/10/iphone-application/2740924.php

### 出欠記録
- Home の授業カード上の `[出][欠][遅]` ボタン 1 tap
- iOS 17 interactive widget からアプリを開かず記録可
- 出典: https://penmark.jp/news/2023/12/11/ios17-widget/

### 追加・編集・削除
- 追加: 空きセル tap または右上 `+` ボタン
- 編集: セル tap → 詳細画面 → 右上「編集」(鉛筆アイコン) → 編集画面
- 削除: 編集画面の最下部に「削除」ボタン
- 出典: https://penmark.jp/guide/

### 配色
- 背景: 白 `#FFFFFF`
- アクセント: ミントグリーン `~#2ECC71` (= `#00C2A0` 系)
- 文字: ダークグレー (真っ黒回避、`#1A1A1A` 程度)
- 日本語 fonts: OS 標準 (iOS Hiragino Sans / Android Yu Gothic) + 見出しは bold
- 出典: https://penmark.jp/

### 学校・授業検索
- 初回設定で大学名を選択
- **シラバス連携**で講義名・教員名から検索 → 結果選択で時間割自動補完
- 公式提供のシラバス DB を持つ (Atender 個人開発では再現困難 → 学校マスタ + 自由入力に留める)
- 出典: https://good-apps.jp/articles/890/

### Penmark との差別化 (Atender の方針)
- **シラバス連携は持たない** (Atender は学校・学科テンプレ共有で代替)
- **トーク / 掲示板 SNS 機能なし** (出席率トラッキングに集中、Touri 個人開発の規模適正)
- **編集削除導線**は別画面遷移ではなく **bottom sheet** で短縮 (2024-2026 トレンド)
- **連続コマの merge 表現は踏襲**

---

## §2 ナビゲーション設計

### bottom tab vs drawer

iOS HIG / Material Design 3 共通の推奨は **3-5 個の bottom tab**。
- 2 個以下: tab ではなく segmented control が適切
- 6 個以上: 「More」ドロワーに格納、または drawer 形式に切替
- 出典: https://developer.apple.com/design/human-interface-guidelines/tab-bars / https://m3.material.io/components/navigation-bar/guidelines

### Atender 推奨タブ構成 (5 個)

| # | ラベル (日本語) | アイコン候補 (lucide / heroicons) | 役割 |
|---|---|---|---|
| 1 | **今日** | `calendar-check` / `home` | 今日の時間割 + ワンタッチ出欠 + 出席率サマリ |
| 2 | **時間割** | `layout-grid` / `table` | 週間時間割表 (グリッド)、編集モード |
| 3 | **みんなの時間割** | `search` / `users` | テンプレ public 検索・コピー |
| 4 | **出席率** | `bar-chart-2` / `pie-chart` | Course ごとの出席率統計 |
| 5 | **マイページ** | `user` / `settings` | アカウント・設定・学校学科変更 |

- **アイコン + ラベル両方表示** (MD3 / iOS HIG 推奨)
- アクティブ表現: **ミントグリーンの fill アイコン + ラベル太字 + 上に 2px の indicator bar**
- 非アクティブ: line アイコン + ラベル通常 weight + ダークグレー文字
- タッチターゲット: タブ全体 56px 高さ (WCAG 2.2 `target-size-minimum` を上回る)
- 出典: https://m3.material.io/components/navigation-bar/specs / https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

### PC (≥768px) のレイアウト

- bottom tab を **left sidebar (240px 幅)** に変換
- 上から: ロゴ → 5 項目縦並び → 下端にユーザーアバター + ログアウト
- メインエリアは sidebar の右、max-width 1280px 中央寄せ

### safe area 対応 (PWA / iOS Safari)

```css
.bottom-tab {
  position: fixed;
  bottom: 0;
  width: 100%;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--bg-card);
  border-top: 1px solid var(--border-subtle);
}
```

- viewport meta: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`
- 出典: https://web.dev/articles/designing-for-the-notched-display / https://developer.mozilla.org/en-US/docs/Web/CSS/env

### 仮想キーボード問題

- iOS Safari で `position: fixed` 要素はキーボード表示時に浮き上がる事故あり
- 対策: **入力フィールドにフォーカスが当たった瞬間 bottom tab を `display: none`** にする (簡易) / または Visual Viewport API で `bottom: 0` を維持
- Chrome: `<meta name="viewport" content="interactive-widget=resizes-content">` で自動調整可
- 出典: https://developer.chrome.com/blog/viewport-resize-behavior/

---

## §3 時間割エディタ UX

### 操作モデル (推奨)

| 操作 | 期待動作 |
|---|---|
| **空きセル tap** | Bottom sheet (高さ ~60vh) で「授業追加」フォーム表示。`dayOfWeek` / `startPeriodIndex` はセル選択で自動入力済。残り: 授業名 / 教師 / 教室 / 連続コマ数 / 色 |
| **入っているセル tap** | Bottom sheet で「授業詳細」表示。下部に `編集` / `削除` ボタン |
| **入っているセル長押し** | (オプション) 即削除確認 dialog (`このコマを削除しますか? 削除 / キャンセル`)。誤操作のリスクを抑えるためトーストで undo を出す |
| **右上 `+` ボタン** | 同じ追加 bottom sheet (曜日・時限は未指定で開く) |
| **右上 歯車** | bottom sheet で「時間割設定」(時限数 / 各時限時刻 / 学期切替) |

bottom sheet の根拠: NN/g「Bottom Sheets: Definition and UX Guidelines」(出典: https://www.nngroup.com/articles/bottom-sheet/) で、モバイル モーダル代替として最も推奨。コンテキスト維持・スワイプで閉じる直感性・実装も `<dialog>` + transform で軽量。

### 連続コマの視覚表現

**推奨: CSS Grid `grid-row: span N` の 1 カード**

```html
<div class="grid grid-cols-[60px_repeat(5,1fr)] grid-rows-[auto_repeat(N,minmax(64px,1fr))]">
  <button
    class="rounded-xl p-2 text-left bg-emerald-100 border-l-4 border-emerald-500"
    style="grid-column: 2; grid-row: 3 / span 2;"
  >
    <strong>プログラミング演習</strong>
    <span class="text-xs text-gray-600">09:00 - 12:10</span>
    <span class="text-xs">山田先生 / 401</span>
  </button>
</div>
```

- **カード背景は淡い色塗り (pastel `bg-emerald-100`)**
- **左 4px の濃い accent border** (Google Calendar / Outlook 流、出典: Notion Calendar / https://www.notion.so/calendar)
- **時刻は連続コマ全体の `開始 - 終了` を 1 行で表示** (Fantastical 流、出典: https://flexibits.com/fantastical)
- セル間 gap = 4px。連続コマ内部にはギャップなし
- 配色は科目ごとに **8 色 palette** から選択 (emerald / sky / amber / rose / violet / cyan / orange / pink、すべて Tailwind `*-100` 背景 + `*-500` border)

### 時限可変 UI

時間割画面右上の歯車アイコン → bottom sheet `時間割設定`:

```
時間割設定
---
時限数:  [-] 5 [+]   (1-12)

時間帯:
1限  [09:00] - [10:30]
2限  [10:40] - [12:10]
3限  [13:00] - [14:30]
...

[ 標準時刻に戻す ]   [ 保存 ]
```

- 時刻入力は `<input type="time">` で OS native picker 任せ
- 「標準時刻に戻す」は学校テンプレが持つデフォルトに復元
- 保存時に DaySlot 一括 update (既存 API `PATCH /api/user-timetables/:id` で `daySlots` 配列を送る)

### 連続コマで欠ける edge case

- セル merge により、たとえば「2 限固定の授業を 3 連続コマに変更する」とき、3 限・4 限の他の授業と衝突。衝突検知ロジック: 編集 form の保存時にサーバ側 validation で 409 を返し、UI で「3-4 限に他の授業があります」エラー表示
- API は MVP 設計 §4 の `POST /meetings` で `409 PERIOD_CONFLICT` を返す前提を踏襲、UI に明示

---

## §4 編集・削除導線 (まとめ)

NN/g + MD3 ベース ([[gotcha]] 観点込み):

| パターン | Atender 採否 | 理由 |
|---|---|---|
| 長押し → コンテキストメニュー | △ (補助のみ) | 発見性が低い、誤操作リスクあり。「即削除確認」だけショートカットとして残す |
| スワイプ削除 | × | グリッドではスクロールと競合、実装複雑 |
| **tap で bottom sheet 詳細** | ◎ **主導線** | 発見性高・安全・実装軽量 (NN/g 推奨) |
| ホバー隠しアクション | × | タッチ非対応、モバイル first 違反 |
| 3 点リーダー (kebab) 常時表示 | × | 時間割セルは情報密度が高く、ノイズになる |
| インライン編集 | × | 閲覧 vs 編集の意図区別が曖昧、削除位置に困る |

- 出典: https://www.nngroup.com/articles/mobile-ux-tap-swipe/ / https://www.nngroup.com/articles/bottom-sheet/ / https://www.nngroup.com/articles/inline-editing-forms/

---

## §5 テンプレ検索 UX

### 推奨フロー

```
[みんなの時間割] タブ
---
学校を選ぶ           ← typeahead, debounce 300ms

   選択中: 北海道情報大学
   学科:   情報メディア学科 ▼  ← 同校の既存テンプレから抽出
   学期:   前期 ▼
---
検索結果 12 件

2026年度 前期 (公開: 2026-04-08)
Author: anonymous
5限 / 月-金 / 21コマ
                       [この時間割を使う]
...
```

### 学校選択 (typeahead)

- 入力 debounce **300ms** (Penmark / 楽天学割など主要日本市場アプリの BP、出典: https://prtimes.jp/main/html/rd/p/000000034.000047440.html)
- API: `GET /api/schools?q=<query>&prefecture=<optional>`
- 結果カード: 「学校名 / 種別 (大学/短大/専門学校/高校) / 都道府県」
- 表記揺れ対策: MVP は `name LIKE '%<q>%' OR name_kana LIKE '%<q>%'` (kana 検索で「とうだい」→「東京大学」をヒット)
- 学校マスタは文科省 CSV (令和7年12月版) を seed (前段 [[00-research-summary]] §7 確定)
- 出典: https://www.mext.go.jp/b_menu/toukei/mext_01087.html

### 学科選択

- 文科省データに**学科は含まれない** ([[00-research-summary]] §7)
- 同校のテンプレが既に登録した学科名を `DISTINCT` で出し、ユーザーはそこから選ぶか自由入力
- 入力後 server で「同校 + 同学科名」テンプレを集める

### 結果カード情報

- 学期名 (例: `2026年度 前期`)
- 公開日 (`最終更新` でなく `公開` を表示、見やすい)
- 時限数 + 曜日 + コマ数 (例: `5限 / 月-金 / 21コマ`)
- author は MVP では `anonymous` 表示 (将来 opt-in 化)
- 「この時間割を使う」ボタン → deep copy mutation → 自分の時間割タブに遷移

### フォールバック (新設校)

- 検索 0 件のとき: 「該当が見つかりません。[ 自分で時間割を作る ]」ボタン → 時間割タブの空状態へ遷移
- ★ 「学校を追加リクエスト」フォームは MVP に入れない (運用負荷)

---

## §6 日本語命名規則

### Penmark / Studyplus の語彙 (参考)

[Penmark help](https://help.penmark.jp/) / [Studyplus help](https://koneta.nifty.com/koneta_detail/1141008011246_1.htm) より:
- Penmark v3: `時間割 / カレンダー / トーク / 掲示板 / マイページ`
- Studyplus: `タイムライン / 勉強記録 / 分析 / コミュニティ / マイページ`
- 追加: `+` 単独ボタン、または「授業を追加」
- 削除: `削除` (赤文字強調)
- 編集: `編集`
- 保存: `保存` (編集時) / `完了` (フロー終了)

### Atender 推奨命名

| 役割 | 日本語 | 理由 |
|---|---|---|
| Home → | **今日** | 「ホーム」より具体的、Touri の「今日の時間割 + 出欠」用途に直結。Penmark は「時間割」をホームにしてるが、Atender は出欠中心なので「今日」が正解 |
| Timetable → | **時間割** | 一択 |
| Templates → | **みんなの時間割** | 「テンプレ」「共有」より日本語学生に馴染む |
| Stats → | **出席率** | 「統計」「分析」より目的直結。Touri 自身が「出席率追跡」を目的に挙げている |
| Settings / Profile → | **マイページ** | 設定単体ではなくアカウント情報・学校学科変更を含むため、Penmark / Studyplus に倣う |
| 新規追加 | **追加** または **+** | + アイコンは右上 / FAB 風で使うときアイコンのみ、modal 内では「追加」 |
| 削除 | **削除** (赤文字) | 一択 |
| 編集 | **編集** | 一択 |
| 保存 | **保存** | 「完了」「OK」より行為が明確 |
| キャンセル | **キャンセル** | 「閉じる」より戻れる感が出る |
| ワンタッチ出欠 | **出 / 欠 / 遅** | Penmark 流の 3 文字単漢字、最も短く視認性高い |
| すべて出席 | **全部出席** または **一括出席** | Touri が違和感ない方を選んで OK、MVP 設計上は明示すること |

### `::` 装飾の廃止

- 既存 MVP の `PageTitle title="Timetable::"` (apps/web/src/routes/Timetable.tsx:73) は **全廃**
- aisaba/portfolio 用視覚言語 [[pattern/aisaba-design-language]] を学生向けアプリに持ち込まない (Touri 明示判断)
- 新フォーマット: シンプルに `<h1 className="text-2xl font-bold">時間割</h1>` のみ

---

## §7 新 design 言語の選定 (案 B 採用)

### 比較 (3 案)

| 軸 | 案 A: Notion ライク | **案 B: Penmark ライク ★推奨** | 案 C: iOS Native ライク |
|---|---|---|---|
| 背景 | `#FFFFFF` | `#FFFFFF` | `#F2F2F7` (system gray 6) |
| アクセント | 無彩色のみ | **ミントグリーン `#10B981` または `#00C2A0`** | 動的 (科目別) |
| 角丸 | 4px (鋭角) | **12px (親しみ)** | 10px |
| シャドウ | なし (border のみ) | **控えめ `0 4px 12px rgba(0,0,0,0.05)`** | 非常に控えめ |
| Typography | `Inter` | **`Inter` + `Noto Sans JP`** | `SF Pro` (iOS), `Inter` (Web) |
| 文字色 | `#37352F` | **`#1A1A1A`** (真っ黒回避) | `#000000` |
| トーン | clinical (道具) | **playful (親しみ)** | utility |
| 学生市場適合 | △ 堅い印象 | **◎ 王道** | ○ 安定だが独自性なし |

(出典: Linear Method UI / Notion Design / Penmark brand / Cron / Doist Design System、本書冒頭 sources 参照)

### 採用案 B の詳細トークン

```css
:root {
  /* surface */
  --bg-base: #FFFFFF;
  --bg-elevated: #FFFFFF;
  --bg-muted: #F9FAFB;
  --bg-overlay: rgba(0, 0, 0, 0.45);

  /* text */
  --text-primary: #1A1A1A;
  --text-secondary: #6B7280;
  --text-tertiary: #9CA3AF;
  --text-on-accent: #FFFFFF;

  /* border */
  --border-subtle: #E5E7EB;
  --border-default: #D1D5DB;
  --border-emphasis: #9CA3AF;

  /* accent (mint) */
  --accent-50: #ECFDF5;
  --accent-100: #D1FAE5;
  --accent-500: #10B981;
  --accent-600: #059669;
  --accent-700: #047857;

  /* status colors (出欠用) */
  --status-present: #10B981;   /* emerald */
  --status-absent: #EF4444;    /* red */
  --status-tardy: #F59E0B;     /* amber */
  --status-excused: #6366F1;   /* indigo */
  --status-cancelled: #9CA3AF; /* gray */
  --status-early: #F97316;     /* orange */

  /* course palette (8 色, *-100 背景 + *-500 border) */
  --course-1: emerald;
  --course-2: sky;
  --course-3: amber;
  --course-4: rose;
  --course-5: violet;
  --course-6: cyan;
  --course-7: orange;
  --course-8: pink;

  /* radius */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* shadow */
  --shadow-card: 0 4px 12px rgba(0, 0, 0, 0.05);
  --shadow-sheet: 0 -8px 24px rgba(0, 0, 0, 0.08);

  /* spacing (8px grid) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
}
```

### マスコット (既存 character images)

- 既存の Codex 生成画像 (Notebook 系) は **採用案 B と整合**
- 配色は cool (青系・緑系) よりノートの紙白 + 線画なので新背景白とよく合う
- Home の挨拶エリア・404・空状態 (空き時間割など) で活用

---

## §8 PWA + iOS 移行戦略との整合

[[pattern/web-first-capacitor-later-design]] に従い、Phase 2 で SwiftUI ネイティブ移行 (MVP 設計 doc §12)。

### redesign が SwiftUI 移行を妨げない理由

- **bottom tab + bottom sheet** は SwiftUI の `TabView` + `.sheet(isPresented:)` に 1:1 で対応
- **CSS Grid の時間割表現**は SwiftUI `Grid` + `gridCellColumns(_:)` で再現可能 (iOS 16+)
- **アイコン (lucide / heroicons)** は SwiftUI に持ち込む際 `SF Symbols` の対応シンボルに差し替え (例: `calendar-check` → `calendar.badge.checkmark`)
- **タイポグラフィ** `Inter` + `Noto Sans JP` は iOS で `Inter` を bundle、`Noto Sans JP` は OS 同梱の `Hiragino Sans` に fallback (iOS 16+ で同等の縦組み品質)

### PWA install (将来オプション)

- `manifest.json` で `display: standalone` + `theme_color: #10B981` (accent)
- iOS 17+ の home screen 追加で apple-mobile-web-app-capable 適用
- ただし PWA Push 通知は iOS の信頼性課題で本格依存しない (MVP 設計 §6 で除外確定)

---

## §9 既存 MVP からの変更スコープ

| 領域 | 変更 |
|---|---|
| `apps/api/src/routes/*` | **変更ほぼなし**。`DaySlot` `Meeting` のスキーマと CRUD は既存通り (時限可変・連続コマは既に対応済) |
| `apps/api/prisma/schema.prisma` | **変更なし**。`DaySlot.label / startMinute / endMinute` は既に user-configurable |
| `apps/web/src/routes/*.tsx` | **全画面再実装**。Home / Timetable / Templates / Stats / Settings (→ MyPage) を新 design + 新ナビ + 新 UX で書き直す |
| `apps/web/src/components/ui.tsx` | **全廃 + 再構築**。Button / Field / Panel / PageTitle は新 design token に合わせて書き直し、`PageTitle` は廃止 |
| `apps/web/src/components/` (新規) | `BottomTab`, `BottomSheet`, `TimetableGrid`, `MeetingCard`, `CourseEditor`, `TimeSlotEditor`, `SchoolPicker`, `AttendanceQuickActions`, `Mascot` |
| `apps/web/src/styles.css` | **全置換**。design token CSS custom properties + base styles |
| `apps/web/index.html` | `viewport-fit=cover` + `theme-color` 追加 |
| TanStack Query hooks | **invalidate 戦略を表で明示** (★3 含意)、optimistic update 強化 |
| 設計 doc | `.designs/<YYYYMMDD>-redesign-v2.md` で **§5 UX を全面書き直し**。§3 schema は変更なし、§4 API も変更なし (時限可変は既存)、§5 UX のみ全面差し替え |

**ざっくり工数感**: Architect の設計 doc 作り直し 1 ターン → Developer 召集 1-2 ターン (frontend のみ) → Reviewer 1 ターン。新規 component は ~10 個程度、画面は 5 個 + login/verify/setup の既存 3 個。

---

## §10 Architect が決めること (このリサーチで不確定)

1. **accent color の最終決定**: ミントグリーン `#10B981` (Tailwind emerald-500) か `#00C2A0` (Penmark 系) か。Touri 確認推奨。redesign 設計 doc で 1 つに固定
2. **科目カラー palette**: 8 色案を提示したが、Touri 嗜好で 6 色に絞るのもアリ
3. **「全部出席」ボタンの配置**: Home の sticky 下部 CTA か、各授業カードの右の `[出][欠][遅]` の後ろに `[全]` を追加か
4. **マスコット表示位置**: Home 挨拶エリアのみか、空状態画面 (時間割が空、テンプレが 0 件等) にも出すか
5. **ダーク mode 対応**: MVP に入れるかどうか (CSS custom properties で容易だが Touri が必要か判断)
6. **bottom tab vs 上部 nav (PC)**: PC では sidebar 推奨だが、シンプルさ優先で上部 nav に統一する選択肢もある

---

## §11 関連 knowledge へのリンク

- [[00-research-summary]] — 技術スタック・スキーマ・iPhone 移行戦略 (前段)
- [[pattern/touri-design-philosophy]] — シンプル + 並列拡張 (整合)
- [[pattern/aisaba-design-language]] — Portfolio 系視覚言語 (★ 今回不採用)
- [[pattern/web-first-capacitor-later-design]] — Web 先行→ハイブリッド戦略
- [[pattern/timetable-app-ux-patterns]] — 時間割アプリ UX BP (本リサーチで新規作成)
- [[pattern/mobile-first-bottom-tab]] — モバイル bottom tab BP (本リサーチで新規作成)
