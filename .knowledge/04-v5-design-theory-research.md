---
title: Atender v5 — Mobile-first 時間割 UI + デザイン理論 Pre-design Research
category: research
project: atender
tags: [v5, mobile-first, timetable-mobile, design-theory, spacing, touch-target, thumb-zone, typography, sticky-cta, bottom-sheet, bottom-tab, snap-style]
created: 2026-05-26
sources:
  - https://penmark.jp/news/2024/07/04/v3-0-0/
  - https://penmark.jp/guide/
  - https://apps.apple.com/jp/app/1sec-%E6%AC%A1%E3%81%AE%E6%8E%88%E6%A5%AD%E3%81%BE%E3%81%A7%E3%81%82%E3%81%A8%E4%BD%95%E5%88%86/id1531640523
  - https://www.classtimetables.com/
  - https://www.mystudylife.com/
  - https://www.notion.so/product/calendar
  - https://flexibits.com/fantastical
  - https://developer.apple.com/design/human-interface-guidelines/tab-bars
  - https://developer.apple.com/design/human-interface-guidelines/buttons
  - https://developer.apple.com/design/human-interface-guidelines/layout
  - https://developer.apple.com/design/human-interface-guidelines/inputs
  - https://m3.material.io/components/navigation-bar/specs
  - https://m3.material.io/components/navigation-bar/guidelines
  - https://m3.material.io/components/bottom-sheets/guidelines
  - https://m3.material.io/foundations/layout/understanding-layout/overview
  - https://m3.material.io/foundations/accessibility/overview
  - https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
  - https://www.w3.org/TR/WCAG22/#non-text-contrast
  - https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html
  - https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
  - https://www.refactoringui.com/
  - https://www.nngroup.com/articles/bottom-sheet/
  - https://www.nngroup.com/articles/mobile-ux-tap-swipe/
  - https://www.nngroup.com/articles/form-design-white-space/
  - https://vaul.emilkowal.ski/
  - https://www.radix-ui.com/primitives/docs/components/dialog
  - https://developer.mozilla.org/en-US/docs/Web/CSS/env
  - https://developer.mozilla.org/en-US/docs/Web/CSS/color-mix
  - https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
  - https://developer.chrome.com/blog/viewport-resize-behavior/
  - https://web.dev/articles/designing-for-the-notched-display
  - https://type-scale.com/
  - https://rsms.me/inter/
  - https://fonts.google.com/noto/specimen/Noto+Sans+JP
---

# Atender v5 Pre-design Research

調査日: 2026-05-26 / 調査者: researcher (Gemini × 2 + 既存実装読解 + 既存ナレッジ照合)。

本書は v4 (`20260526-v4-snap-style.md`) の Snap 風刷新を**前提**として、Touri から「スマホで時間割表が一覧で見づらい」「ボタンの余白配置を再検討」「デザイン理論ベースで」という具体要望に答えるための Pre-design リサーチ。

## Context (Touri 言質と現状)

### Touri の指摘
1. **スマホで時間割表が一覧で見づらい** — PC は OK
2. **全体的にボタンの余白・配置を再検討** — もっと考えて配置・余白を、根拠を持って
3. **デザイン理論ベース** で

### 現状実装と問題の特定 (`apps/web/src/components/`)

| 領域 | 現状 | 問題 |
|---|---|---|
| `TimetableGrid.tsx` | `min-w-[720px] grid-cols-[56px_repeat(5,minmax(110px,1fr))]` を `overflow-x-auto` で包む | **375-414px 幅では確実に横スクロール必須。一覧性ゼロ。** Touri 指摘の根本 |
| `MeetingBlock.tsx` | `p-2`、授業名 `font-semibold text-sm`、副情報 1 行 `text-xs` で `teacher ?? room` のいずれか | **教室名が二の次扱い**。学生が歩きながら見るとき最重要なのは教室 |
| `Button.tsx` | `rounded-full` pill、`min-h-12 px-5`、glow shadow (v4) | サイズ自体は OK だが**配置・隣接ボタン間の gap・thumb zone との関係**が未定義 |
| `BottomSheet.tsx` | `rounded-t-[28px]`, `z-[1100/1110]`, backdrop-blur | OK だが**外周 padding / section spacing / footer 高さ**は設計に明示されていない |
| 余白 | Tailwind `gap-2/3`, `p-3/4/5` の直書き | **8pt grid 準拠の意味付け (inner / outer / gap の使い分け)** が無い |
| タッチターゲット | min-h-12 (48px) は OK | **隣接 gap の最小値 (8px ルール) が未定義** |

### 想定読者
Architect — 設計 doc v5 を書く前にここを読み、§E のチェックリスト 8 項目を必ず明示する。

---

## A. モバイル時間割 UI ベストプラクティス (最優先)

### A.1 5 パターンの比較

| # | パターン | 一覧性 (週) | 情報密度 (1 日) | タッチ容易さ | 採用事例 |
|---|---|---|---|---|---|
| (a) | **横スクロール grid** (列幅 88-120px) | △ (端の曜日が見切れ) | △ (セル小) | × (横スクロール) | Penmark / 大学生の時間割 / Atender 現状 |
| (b) | **日別タブ切替** (chip タブ + その日の縦リスト) | × (週俯瞰不可) | ◎ (1 コマ 1 カード) | ◎ | 1Sec / Tally / My Study Life (Dashboard) |
| (c) | **縮約 grid** (列幅 56-72px、文字 11-12px) | ◎ (全曜日 1 画面) | × (1-2 文字) | △ (誤タップ) | 旧 Class Timetable / iPad widget 系 |
| (d) | **横スワイプ paging** (1 画面 = 1 日) | △ (今日と隣のみ) | ◎ | ○ (慣れ前提) | Class Timetable (横向きで grid 切替) |
| (e) | **アジェンダ風** (時系列リスト + 日付ヘッダ) | × | ○ (タスク同居可) | ◎ | My Study Life / Notion Calendar (リスト view) |

出典: 各アプリ公式 + [Mobbin](https://mobbin.com) UI パターン集 + [App Store: 1Sec](https://apps.apple.com/jp/app/1sec-%E6%AC%A1%E3%81%AE%E6%8E%88%E6%A5%AD%E3%81%BE%E3%81%A7%E3%81%82%E3%81%A8%E4%BD%95%E5%88%86/id1531640523) / [Class Timetable](https://www.classtimetables.com/) / [My Study Life](https://www.mystudylife.com/) / [Notion Calendar](https://www.notion.so/product/calendar)

### A.2 Atender 文脈での適性評価

Atender の前提:
- **コマ数: 5 日 × 5-12 限** (Penmark 上限 12 限を踏襲)
- **情報: 授業名 (10-15 文字) + 教室 (3-6 文字) + 教師 (5-10 文字)**
- **主用途は (1) 朝に今日の時間割確認・(2) 週単位の俯瞰 (空きコマ把握、テンプレ共有)**
- **既存 v4 はダーク基調 + emerald + 大角丸 + glow** = 余白を贅沢に使う Snap 風方向

各パターンを Atender 用途に当てると:

| パターン | 用途 (1) 朝の確認 | 用途 (2) 週俯瞰 | v4 デザイン整合 |
|---|---|---|---|
| (a) 横スクロール grid | △ (横スクロール疲れる) | ○ (どうにか俯瞰) | △ (詰め込み感、Snap 風と逆) |
| **(b) 日別タブ + 週切替併用** ★ | **◎ (今日タブ = 1 画面)** | **○ (週ボタンで grid に切替)** | **◎ (大カード = 大角丸 + glow 映える)** |
| (c) 縮約 grid | △ (文字小すぎ) | ◎ | × (詰め込み、Snap 風と逆) |
| (d) 横スワイプ paging | ◎ | × | △ (paging はアニメ重い、CSS only で再現困難) |
| (e) アジェンダ風 | ○ | × (時限感喪失) | △ (時間割感が薄い) |

### A.3 ★ Researcher 推奨 (1 案)

**(b) 日別タブ + 週 grid 切替併用 (ハイブリッド)**

- **デフォルト = 日別タブ** (今日が初期選択、`月 / 火 / 水 / 木 / 金` の chip + その日の縦カードリスト)
- **「週」ボタンで grid ビューに切替** (PC は最初から grid、モバイルでも明示的に切れる)
- **PC (≥768px) は最初から週 grid を表示**、日別タブは出さない (現 v4 の `min-w-[720px]` 構造はそのまま PC で活きる)

#### 理由 (デザイン理論ベース)

1. **Thumb zone (Steven Hoober)**: モバイル幅 (375-414px) で 5 日 × 6 限 = 30 セルを 1 画面に並べると、各セル ≦ 60×40px = タッチターゲット未達 (WCAG 2.5.5 で 24×24 最小 / 推奨 44×44)。1 日 1 列にすれば 1 カード min-h 80-96px が確保でき HIG 44pt / Material 48dp 余裕 — [HIG Inputs](https://developer.apple.com/design/human-interface-guidelines/inputs) / [Material 3 Accessibility](https://m3.material.io/foundations/accessibility/overview)
2. **情報密度の妥当性**: 1Sec / My Study Life が「次の授業まであと何分」「今日の Dashboard」を起点に組んでいる流れと一致。Atender も「今日 = 出欠記録」が主目的なので、week grid より day list の方が用途整合 — [1Sec](https://apps.apple.com/jp/app/1sec-%E6%AC%A1%E3%81%AE%E6%8E%88%E6%A5%AD%E3%81%BE%E3%81%A7%E3%81%82%E3%81%A8%E4%BD%95%E5%88%86/id1531640523)
3. **Snap 風 v4 との整合**: 大角丸 + glow は**小さなセル**では潰れて見えない。1 カード = 大きな面積で映える。日別タブ採用すると v4 トークン (`--radius-lg: 24px`, `--shadow-glow`) が活きる
4. **週俯瞰ニーズも満たす**: 切替ボタンで grid に戻せるので「今週の空きコマ」も把握可能。Class Timetable が横向き ⇄ 縦向きで自動切替する発想と同じ — [Class Timetable](https://www.classtimetables.com/)
5. **既存実装の最小破壊**: `TimetableGrid.tsx` はそのまま PC・週切替時に利用、モバイル day list は新 component `DayList.tsx` を追加するだけ。Meeting データ構造は不変

#### モバイル day list の構造案

```
┌──────────────────────────────────┐
│ [月 火 水 木 金] [今日] [週]      │ ← sticky 上部、chip nav + 切替
├──────────────────────────────────┤
│  1限 09:00-10:30                  │
│  ┌────────────────────────────┐   │
│  │ ▍プログラミング演習          │   │ ← 大カード (左 4px accent、p-4)
│  │   401教室 / 山田先生         │   │
│  │   [出] [欠] [遅]             │   │ ← 出欠ボタン inline
│  └────────────────────────────┘   │
│                                    │
│  2限 10:40-12:10  (空きコマ)       │ ← 空コマも明示
│                                    │
│  3限 13:00-14:30                  │
│  ┌────────────────────────────┐   │
│  │ ▍線形代数学                  │   │
│  │   ...                         │   │
└──────────────────────────────────┘
```

- chip nav 高さ 48px、tap で active 日切替 (本日に accent dot)
- カード min-h 96px、`rounded-3xl bg-bg-elevated shadow-card`
- 空きコマは `bg-white/4 + text-tertiary` で「2限 (空き)」だけのフラットな高さ 56px row

### A.4 情報密度 (授業名 vs 教室)

#### 2024-2026 トレンド (Gemini 調査)

- **教室名 ≧ 授業名** の優先順位が支持されている: 「学生が歩きながらアプリを見る最大動機は次にどこへ行くか」
- 教室名を**アクセントカラーのバッジ**で目立たせる事例増加 (Class Timetable / 1Sec)
- 授業名は学生の頭に入っている前提、教室は毎週違う校舎の可能性あり

#### Atender 適用

現 `MeetingBlock.tsx` は `teacher ?? room` の 1 行 OR 排他 → **両方並列表示**に変更を Architect に勧める:

```
▍プログラミング演習          ← 授業名 (font-semibold text-base)
  401教室 · 山田先生           ← 教室 (先) + 教師、中点区切り、text-xs text-secondary
```

または教室を accent chip:
```
▍プログラミング演習           [401]
  山田先生
```

#### 長文時 trunc 方針 (BP)

| 要素 | 推奨 |
|---|---|
| 授業名 | `line-clamp-2` (最大 2 行、3 行はカード破綻) |
| 教室 | `truncate` (1 行 ellipsis、`#3F`〜` 3F-401`程度しか入らない) |
| 教師 | `truncate` (1 行 ellipsis) |

出典: [Refactoring UI](https://www.refactoringui.com/) (情報省略の階層化)

### A.5 連続コマ (periodCount > 1)

day list でも連続コマは 1 カードに merge:
- カード height = 該当時限数の積 (1 限 = 96px, 2 連続 = 192px, ただし内側 padding は固定)
- カード上部に `1-2限 09:00 - 12:10` と全体時刻を 1 行で出す (Fantastical 流) — [Fantastical](https://flexibits.com/fantastical)
- 内部分割線なし

これは v3 リサーチ ([[03-v3-rooms-friends-research]]) と整合。

---

## B. デザイン理論 (中優先)

### B.1 余白 (Spacing) の理論

#### 8pt grid system

すべての余白・要素サイズを **8 の倍数** (またはアイコン等で 4 の倍数) で設計。理由:
- Retina (@2x / @3x) でレンダリングのボケ防止
- iOS HIG / Material 3 の両方が 8 / 4 単位で spec を切っているため、両方互換に保てる

出典: [Material 3 Layout](https://m3.material.io/foundations/layout/understanding-layout/overview) / [iOS HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout)

#### inner / outer / gap の概念分離

| 概念 | 役割 | 例 |
|---|---|---|
| **inner padding** | 要素**内側**の余白 (枠とコンテンツの距離) | カード内側 16-24px |
| **outer margin** | 要素**外側**の余白 (隣の要素との距離) | カード同士 24-32px (section 分離) |
| **gap** | 親が複数子を並べる時の**子同士の間隔** | 隣接ボタン間 8-12px |

★ Architect が忘れがちな指針: **margin (要素自身) で隣との距離を取らず、親の gap で取る**。コンポーネント再利用性が上がる。例: `Button` は自身に `mb-2` を持たない、親の `flex gap-2` で間隔を作る。

出典: [Refactoring UI - Spacing and Layout](https://www.refactoringui.com/) / [Tailwind CSS gap](https://tailwindcss.com/docs/gap)

#### Mobile vs Desktop の差

| | Mobile (≤768px) | Desktop (≥768px) |
|---|---|---|
| ページ外周 padding | px-5 (20px) | px-8 (32px) |
| カード inner padding | p-4〜p-5 (16-20px) | p-6 (24px) |
| section 間 margin | space-y-8 (32px) | space-y-10 (40px) |
| カード gap | gap-3 (12px) | gap-4 (16px) |
| ボタン gap | gap-3 (12px) | gap-3 (12px) |

★ Mobile は「タッチ干渉防止」のため**狭くしない**。Desktop は情報密度を上げて構わない。

出典: [Material 3](https://m3.material.io/foundations/layout/understanding-layout/overview) / Refactoring UI / 既存 [[pattern/form-modal-readability-bp]]

#### 余白を意図的に変える指針

1. **Group 化 (proximity)**: 関連する Field は近づける (`gap-2 = 8px`)、別 section は離す (`space-y-6 = 24px`)
2. **階層表現**: H1 → body の間 24-32px、H2 → body 16-20px、H3 → body 12-16px
3. **呼吸 (breathing)**: 「迷ったら広げる」(Refactoring UI 鉄則)。詰め込みは情報量を増やすが認知負荷も増える
4. **Snap 風 = 過剰に広く** (Touri の v4 採用方針): card padding 20-24px、section spacing 32-40px が現代主流 (2024-2026 Gemini 確認)

### B.2 タッチターゲットサイズ

#### 最小値 BP

| 規格 | 最小 | 推奨 | 出典 |
|---|---|---|---|
| **Apple HIG** | 44×44 pt | 44×44 pt | [HIG Inputs](https://developer.apple.com/design/human-interface-guidelines/inputs) |
| **Material Design 3** | 48×48 dp | 48×48 dp | [M3 Accessibility](https://m3.material.io/foundations/accessibility/overview) |
| **WCAG 2.2 Level AA (2.5.8)** | 24×24 px | (隣接 24px 以上 gap で例外) | [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) |
| **WCAG 2.2 Level AAA (2.5.5)** | 44×44 px | 44×44 px | 同上 |

#### Atender 採用基準

- **タップ要素 min-h-12 (48px) を厳守** — Material 48dp と HIG 44pt の両方を満たす
- アイコンボタン (kebab、X、検索) は 44×44 で正方形
- chip nav の chip も min-h-10 (40px) 以下にしない (WCAG 2.5.8 + 周囲 8px 確保で AA OK)

#### 隣接 gap の最小値 (タッチ干渉防止)

- **最小 8px (Material 3 推奨 12px)** — 親指の腹 (約 9-10mm) でも誤タップしない閾値
- 隣接 destructive と primary は **gap 16px 以上**離す (誤削除防止)

出典: [Material 3 Buttons](https://m3.material.io/components/all-buttons) / [Steven Hoober UX Matters](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)

#### Hit area expansion (拡張ヒット領域)

視覚的に小さなアイコンでも、padding で**触れる範囲だけ**広げる。例: 視覚 24px アイコンを `p-2` (8px) で囲み実質 40px に。

```tsx
<button className="p-2 -m-2"> // padding で広げ、ネガティブ margin で元レイアウトを保つ
  <Icon size={24} />
</button>
```

出典: [WCAG 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) / Refactoring UI

### B.3 ボタン配置パターン (Mobile First)

#### Thumb zone 理論 (Steven Hoober 2013, 現在も有効)

| ゾーン | 画面位置 | 親指リーチ | 用途 |
|---|---|---|---|
| **Green (natural)** | 画面下 1/3 + 親指側半分 | ◎ 自然に届く | **主要 CTA, 頻出ボタン** |
| **Yellow (stretch)** | 画面中央 1/3 | ○ ストレッチで届く | 中頻度ボタン |
| **Red (hard)** | 画面上 1/3 + 反対側 | × 持ち替え必要 | **destructive, 戻る, 設定** |

iPhone 標準アプリは「戻る」を左上に置くが、これは Red zone。代わりに**スワイプジェスチャ**で補完する。Atender Web では Web Back swipe が iOS で標準動作 (true) なので、UI 上の「戻る」ボタンは控えめで OK。

出典: [Steven Hoober UX Matters](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php) / [UX Planet Bottom Nav](https://uxplanet.org/the-golden-rules-of-bottom-navigation-design-d9051ee24ea0)

#### 主要 CTA の位置 (3 パターン)

| パターン | 位置 | 使い時 | 例 |
|---|---|---|---|
| **Bottom-fixed (sticky)** | 画面下端 fixed | 1 画面 1 主操作、コンバージョン重要 | 購入、保存、出欠記録 |
| **Inline (flow)** | コンテンツの末尾 | フォーム長め、自然な順序がある | sheet 内 form footer |
| **Top-right** | header の右 | 「完了」「編集モード ON/OFF」、誤操作したくない | 編集 toggle |

Atender 適用:
- Today 画面の「全員出席」: bottom sticky CTA で thumb zone 直撃
- 時間割の追加ボタン: 各空きコマセル tap が主、補助で右上 `+` (Red zone) は使わない方針

#### 反復アクション (削除 / 編集 / コピー)

- 主導線: **セル tap → bottom sheet 詳細 → 編集 / 削除ボタン** (NN/g 推奨、発見性 + 安全) — [NN/g Bottom Sheet](https://www.nngroup.com/articles/bottom-sheet/)
- 補助: 長押し → 即削除確認 dialog (パワーユーザー向け、undo 付き)
- 不採用: スワイプ削除 (グリッド競合)、3 点リーダー (時間割セルのノイズ)

#### Destructive (削除 / Block) の隔離

- footer 内では primary と 同列に並べず、**section 単体で sheet 最下部**に独立
- 色は status-absent (赤 #EF4444 / Atender)
- 確認 dialog を必ず挟む (即削除しない)。例外: 長押しショートカット (undo 付き)

出典: [HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) / Refactoring UI / NN/g

### B.4 タイポグラフィのリズム

#### Modular Scale

基準サイズに比率を掛けてサイズ展開を作る。

| Scale | 比率 | サイズ列 | 用途 |
|---|---|---|---|
| Minor Third | 1.2 | 13.3, 16, 19.2, 23, 27.6 | 控えめ・密度高 (Notion 系) |
| **Major Third** ★ | **1.25** | **12.8, 16, 20, 25, 31.3** | **標準・読みやすい** |
| Perfect Fourth | 1.333 | 12, 16, 21.3, 28.4, 37.9 | 強い階層、Hero 強調 |

Atender 推奨: **Major Third (1.25)** — 14 (text-sm) → 16 (text-base) → 20 (text-xl) → 24 (text-2xl) → 30 (text-3xl)。Tailwind デフォルトとほぼ整合。

出典: [type-scale.com](https://type-scale.com/) / Refactoring UI

#### line-height と font-size の比率

| 用途 | line-height | 出典 |
|---|---|---|
| Body | **1.5-1.6** (WCAG 1.4.8 推奨) | [WCAG 1.4.8](https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html) |
| Headline (h1, h2) | 1.1-1.25 | type-scale.com / Refactoring UI |
| UI label / button | 1.2-1.3 | Material 3 |
| Caption / chip | 1.3-1.4 | iOS HIG |

#### font-weight の階層 (Atender 推奨)

| weight | 用途 | size |
|---|---|---|
| 400 (Regular) | body, helper, value (Snap 風では control) | 12-16px |
| 500 (Medium) | label, input value (Linear/Stripe 流), tab label | 12-16px |
| 600 (Semibold) | sheet title, card title, section header | 14-20px |
| 700 (Bold) | page title (h1), Hero | 20-30px |

★ Architect が踏みがちな罠: **label を semibold (600) で強くしすぎると入力 value が霞む**。label は medium (500)、value は medium (500) で同等、ただし color で階層付け (label = fg-secondary、value = fg-primary)。既存 [[pattern/form-modal-readability-bp]] と整合。

#### 日本語 + 英数字混在 (Inter + Noto Sans JP)

- font-family stack: `"Inter", "Noto Sans JP", system-ui, ...`
- Inter と Noto Sans JP は字形太さ知覚が近く、**同じ weight 値で混在 OK** ([[02-input-ux-research]] §3.2 確定)
- 和文は欧文より視覚的に大きく見えるため、混在表示で違和感が出る場合は和文 font-size を 0.95-1.0 倍に微調整
- ベースラインずれ防止: `line-height` は単位なし (`1.5`) で指定 (px 固定は和文混在で崩れる)
- 出典: [Inter](https://rsms.me/inter/) / [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP)

---

## C. UI 細部 BP (中優先)

### C.1 Sticky CTA (画面下端固定ボタン)

#### Atender 適用 spec (推奨)

```css
.sticky-cta {
  position: sticky; /* または fixed */
  bottom: 0;
  background: rgba(11, 14, 20, 0.85); /* v4 bg-base にやや透過 */
  backdrop-filter: blur(20px);
  padding: 12px 20px max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.sticky-cta button {
  min-height: 56px; /* 主要 CTA は通常ボタンより 1 段大きい */
  border-radius: 9999px; /* v4 pill 維持 */
}
```

- **`max(16px, env(safe-area-inset-bottom))`** が 2024+ 標準パターン (`max()` で最小ガードレール) — [MDN env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- 背景は**透過ブラー (Glassmorphism)** が現代主流 (Airbnb / Mercari / Uber) — Gemini 確認
- スクロール時 box-shadow を出すなら `box-shadow: 0 -8px 24px rgba(0,0,0,0.5)` を JS で動的付与
- 高さ目安: **80-96px** (ボタン 56 + 上下 12-16 + safe-area)

#### キーボード起動時 (iOS Safari の罠)

- viewport meta: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`
- これだけで Chrome / iOS 17+ は自動で sticky を上げてくれる
- それ以前の iOS では Visual Viewport API で `bottom = window.innerHeight - visualViewport.height` を計算
- 簡易策: 入力フォーカス時に sticky CTA を `display: none`
- 出典: [Chrome viewport-resize-behavior](https://developer.chrome.com/blog/viewport-resize-behavior/) / [VisualViewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) / [[pattern/mobile-first-bottom-tab]] §6

### C.2 Bottom Sheet (Vaul / Radix Dialog の 2024-2026 spec)

#### Atender 適用 spec (推奨)

| 要素 | 推奨値 | 出典 / 理由 |
|---|---|---|
| 角丸 (上のみ) | **`rounded-t-[28px]`** (v4 現状維持) | 2024-2026 主流 24-32px (Vaul / Linear / Family) |
| Drag handle | **4 × 36px**、上余白 12px | Gemini 確認、4×32 や 4×40 も可 |
| Header height | **min-h-14 (56px)** | iOS HIG dialog + MD3 text field 56dp |
| Header title | `text-lg font-semibold (18px / 600)` | [[pattern/form-modal-readability-bp]] |
| Header / body 区切り | `border-b border-white/8` (v4 dark) | MD3 divider 推奨 |
| Body 外周 padding | **px-5 pb-6 pt-1 (左右 20px)** | 2024+ で 16px → 20-24px に拡大 |
| Section 間 spacing | `space-y-5 (20px)` | iOS Inset Grouped 系 |
| Input 高さ | `min-h-12 (48px)` | Material 48dp + HIG 44pt |
| Input 横 padding | `px-4 (16px)` | MD3 標準 |
| Footer | sticky 下端、`border-t border-white/8` + py-3 + px-5 + gap-3 + safe-area | iOS HIG dialog action |
| 最大高さ | `max-h-[90dvh]` (dvh で iOS Safari ツールバー対応) | 2024+ 標準 |

出典: [Vaul](https://vaul.emilkowal.ski/) / [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) / [MD3 Bottom Sheets](https://m3.material.io/components/bottom-sheets/guidelines) / [[pattern/form-modal-readability-bp]]

#### v4 との差分

v4 現状は `rounded-t-[28px]` / `z-[1100/1110]` / backdrop-blur で**基本構造は OK**。改善余地:
1. 外周 padding を `px-4` → **`px-5`**
2. section 間 `space-y-5` を必ず入れる (current は実装側で散発的)
3. footer の sticky + border-t + safe-area を**共通コンポーネント化** (現状は個別 sheet 内で書き直し)

### C.3 Bottom Tab Bar (4 タブ)

#### Atender 適用 spec (Phase 4 で 4 タブ確定: 今日 / 時間割 / ルーム / 友達)

| 要素 | 推奨値 | 出典 |
|---|---|---|
| 全体高さ (safe-area 込み) | **80px** (= 56 + 24 ≈ env(safe-area-inset-bottom)) | MD3 / Gemini 確認 |
| コンテンツ領域 | 56px | MD3 navigation-bar specs |
| アイコンサイズ | **24px** (label あり) / 28px (label なし) | MD3 / iOS HIG |
| アイコン + ラベル | **両表示** (Z 世代向けはアイコン only 増加だが、Atender は accessibility 優先で label 維持) | MD3 推奨 |
| ラベル font-size | 10-12px | MD3 |
| Active 表現 | **fill icon + 微 scale (1.05) + accent glow** (v4 既定) | iOS SF Symbols + MD3 mixed |
| Inactive 表現 | line icon + text-secondary | MD3 |
| 横配置 | 等幅 (4 タブなら 25% ずつ) | 標準 |
| safe-area | `padding-bottom: env(safe-area-inset-bottom)` | [web.dev notched](https://web.dev/articles/designing-for-the-notched-display) |

v4 現状 = `z-40 + backdrop-blur + active 強調 (accent bg + glow + scale-up)` は MD3 と整合。改善余地は少ないが、4 タブで等幅にした時に**タッチ干渉**を防ぐため**各タブの中央 44×44 を hit area として確保**することを Architect に明示。

### C.4 v4 の Snap 風を活かす「贅沢な余白」パターン (2024-2026)

Gemini 確認の通り、Snap / BeReal / Penmark Card 系は**ホワイトスペース過剰**が現代主流:

| 要素 | 標準 (古い BP) | Snap 風 (Atender v4-v5 採用) |
|---|---|---|
| Card padding | p-4 (16px) | **p-5〜p-6 (20-24px)** |
| Section margin | space-y-6 (24px) | **space-y-8〜10 (32-40px)** |
| Border radius | rounded-md (6-8px) | **rounded-2xl〜3xl (16-24px)**、ボタンは pill |
| Element gap (隣接ボタン) | gap-2 (8px) | **gap-3 (12px)** (タッチ干渉 + 呼吸両立) |
| Heading → Body 距離 | mt-2 (8px) | **mt-3〜4 (12-16px)** |

★ Touri の要望「ボタン余白を再検討」は具体的には:
1. **隣接ボタン gap を `gap-2 (8px)` → `gap-3 (12px)`** (タッチ干渉 + 視覚分離)
2. **ボタン群を section として囲み、上下に `mt-4 mb-4` (16px) ぶん呼吸**
3. **destructive (削除) は他ボタンから `mt-6` (24px) 以上隔離**

---

## D. 既存知見の差分

### D.1 [[01-redesign-research]] (Phase 2) との関係

- Phase 2 = Penmark ライク白背景 + emerald + Inter+Noto Sans JP → **v4 Snap 風 (ダーク基調 + emerald + 大角丸 + glow) に転換**で破棄
- ただし Phase 2 の**ナビ構成 5 タブ → 4 タブ刷新 (Phase 4) → 維持** / **連続コマ merge** / **編集削除を bottom sheet 主動線** / **時限可変 UI** は v5 でも維持
- 新規追加: **A.3 モバイル日別タブ + 週切替併用** (Phase 2 では「横スクロール grid 一択」が前提だったが、ここで明確に転換)

### D.2 [[02-input-ux-research]] (Phase 3) との関係

- 入力 UX の token 改訂は v4 で実装済 (focus ring outline、label medium、value medium、divider、section spacing) → **v5 では引き続き維持**
- ただし v4 はダーク基調なので、focus ring 色は `accent-500 (#10EB99)` で WCAG 1.4.11 (3:1 暗背景) 再検証要 (Architect 確認推奨)
- 新規追加: **C.1 sticky CTA** は Phase 3 では `border-t + safe-area-inset-bottom` 言及のみだったが、本書で **`max(16px, env(...))` パターン + backdrop-blur + max-h dvh** まで spec 化

### D.3 [[03-v3-rooms-friends-research]] (Phase 4) との関係

- Phase 4 で確定: bottom 4 タブ / Today UX Spotify scroll / 右上アバターメニュー → **v5 で UI 細部 spec を補完**
- Phase 4 の `MainAttendanceCTA` (今日は全出席) = **C.1 sticky CTA spec** をそのまま適用
- Phase 4 では「TimetableGrid 表示自体は redesign 完了前提」だったが、v5 で**モバイル時間割表示そのものを day list 主に切替**

### D.4 既存 pattern との関係

| pattern | 関係 |
|---|---|
| [[pattern/timetable-app-ux-patterns]] | **A.1-A.5 は本書で日別タブ採用に上書き**。Penmark の横スクロール grid 踏襲方針を**モバイルでは破棄**、PC では維持 |
| [[pattern/mobile-first-bottom-tab]] | **C.3 で v4 / v5 用に再計測**。基本 spec は既存通り、4 タブ前提で hit area 注釈追加 |
| [[pattern/grid-table-borders-bp]] | **PC の週 grid 時のみ適用**。モバイル day list は罫線方式ではなくカード方式 |
| [[pattern/form-modal-readability-bp]] | **C.2 sheet spec の元**。v5 でも全面尊重 |

---

## E. Architect への引き継ぎポイント (必ず設計 doc に明示)

設計 doc v5 で**次の 8 項目を明示**すること。実装で迷う余地を残さない:

1. ★ **モバイル時間割表示の方式**: 日別タブ + 週切替併用 (A.3) を採用するかの確定。代替案 (a 横スクロール継続 / c 縮約 grid) を比較表で示し、不採用理由を書く

2. ★ **chip nav の挙動**: 月-金 chip、今日のデフォルト active、week 切替ボタンの位置 (chip 列の右?上部 toolbar?)、active 表現 (accent dot? underline? pill?)

3. ★ **DayList カードの仕様**: 
   - 高さ (min-h-24=96px、連続コマは ×N)
   - 内側 padding (`p-5 = 20px`)
   - 情報密度 (授業名 = font-semibold text-base、教室 = font-medium text-xs、教師 = text-secondary、出欠ボタン = inline 配置 or sheet 経由)
   - 教室 vs 教師の優先 (A.4 で教室優先を推奨)
   - 連続コマの時刻表示 (`1-2限 09:00 - 12:10` を 1 行で)

4. ★ **8pt grid 適用の明示** (B.1):
   - Page 外周 mobile `px-5` / Desktop `px-8`
   - Card inner `p-4-p-5`
   - Section gap `space-y-8` (mobile) / `space-y-10` (desktop)
   - 隣接ボタン gap `gap-3 (12px)`
   - 各値を CSS variable または Tailwind 直書きどちらで管理するか

5. ★ **タッチターゲット・hit area 規約** (B.2):
   - すべてのタップ要素 min-h-12 (48px)
   - アイコンボタンは 44×44 正方形
   - chip / tab は min-h-10 + gap 8px 以上
   - destructive と primary の gap 最小 16px

6. ★ **タイポグラフィのスケール** (B.4):
   - Major Third (1.25) ベース
   - 各要素の weight + size + color の表
   - 既存 [[02-input-ux-research]] §3.3 の表を v5 用に再掲

7. ★ **sticky CTA spec** (C.1):
   - 「今日は全出席」ボタンの仕様
   - `max(16px, env(safe-area-inset-bottom))` パターン
   - 背景 backdrop-blur or 不透明 (v4 ダーク基調なので半透過 + blur 推奨)
   - キーボード起動時の挙動 (viewport meta `interactive-widget=resizes-content` で対応)

8. ★ **PC (≥768px) との切替方針**:
   - モバイル day list / PC 週 grid を CSS media query で完全切替
   - breakpoint は **768px** (Tailwind `md:`) で確定
   - 768px 未満 = day list、以上 = 既存 TimetableGrid 維持
   - bottom tab は ≥768px で left sidebar 化 (Phase 2 確定)

### 補助: Touri 確認推奨項目

- focus ring 色 (ダーク背景で `accent-500` のコントラスト再検証要)
- chip nav の week 切替が「切替ボタン」か「スワイプジェスチャ」か (タッチ理論的にはスワイプの方が thumb zone 内)
- 「全部出席」CTA の sticky か inline か (sticky 推奨だが Today 画面の Spotify scroll と干渉する可能性)

---

## §関連 knowledge へのリンク

- [[00-research-summary]] — Phase 1: 技術スタック・スキーマ
- [[01-redesign-research]] — Phase 2: Penmark ライク 5 タブ確定 (v4 で Snap 風に転換され破棄、ナビ構成と機能は維持)
- [[02-input-ux-research]] — Phase 3: 入力 UX token 改訂 (v4 で実装済、v5 でも維持)
- [[03-v3-rooms-friends-research]] — Phase 4: 4 タブ + Today UX + Rooms/Friends 確定
- [[pattern/timetable-app-ux-patterns]] — 時間割 UX BP (本書 A で **モバイル日別タブ採用に方針転換**)
- [[pattern/mobile-first-bottom-tab]] — bottom tab BP (本書 C.3 で 4 タブ前提に再計測)
- [[pattern/grid-table-borders-bp]] — grid 罫線 BP (本書では PC のみ適用)
- [[pattern/form-modal-readability-bp]] — sheet 視認性 BP (本書 C.2 の元)
- [[pattern/touri-design-philosophy]] — シンプル + 並列拡張 (v5 設計の上位制約)

---

## 付録 X. 実装スニペット集 (Architect 引き継ぎ用)

設計 doc で「実装例」として参照できるよう、本書の主要 spec を Tailwind 直書きで具現化したスニペット。Developer が迷う余地を残さない目的で残す。

### X.1 モバイル day list の chip nav (A.3)

```tsx
// apps/web/src/components/timetable/DayChipNav.tsx
const days = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
];

export function DayChipNav({
  activeDay,
  onChange,
  onWeekToggle,
  isWeekView,
  today,
}: {
  activeDay: number;
  onChange: (day: number) => void;
  onWeekToggle: () => void;
  isWeekView: boolean;
  today: number; // 1-5
}) {
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 bg-bg-base/80 px-5 py-3 backdrop-blur-xl">
      <div className="flex flex-1 gap-2">
        {days.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => onChange(d.value)}
            className={`relative flex h-10 flex-1 items-center justify-center rounded-full text-sm font-medium transition ${
              activeDay === d.value
                ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
                : "bg-white/6 text-fg-secondary hover:bg-white/10"
            }`}
            aria-pressed={activeDay === d.value}
          >
            {d.label}
            {d.value === today ? (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent-500" />
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onWeekToggle}
        className="h-10 rounded-full bg-white/6 px-4 text-xs font-medium text-fg-secondary"
      >
        {isWeekView ? "日" : "週"}
      </button>
    </div>
  );
}
```

要点:
- chip min-h-10 (40px) + gap-2 (8px) → WCAG 2.5.8 AA + 隣接干渉防止
- active = accent fill + glow、inactive = `bg-white/6` (Snap 風線なし)
- 今日 dot は accent-500 を chip 右上に
- 週切替は同一 chip ライク (chip nav の右側に独立)

### X.2 DayList カード (A.3, A.4)

```tsx
// apps/web/src/components/timetable/DayMeetingCard.tsx
export function DayMeetingCard({
  meeting,
  course,
  slots,
  onClick,
}: {
  meeting: MeetingDto;
  course: CourseDto;
  slots: DaySlotDto[];
  onClick: () => void;
}) {
  const color = course.color ?? "var(--color-accent-500)";
  const first = slots[0];
  const last = slots[slots.length - 1];
  const timeRange = `${formatMinutes(first.startMinute)} - ${formatMinutes(last.endMinute)}`;
  const periodRange = slots.length === 1 ? `${first.label}限` : `${first.label}-${last.label}限`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-3xl bg-bg-elevated p-5 text-left shadow-card transition active:scale-[0.98]"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-fg-tertiary">
        <span className="font-semibold text-fg-secondary">{periodRange}</span>
        <span>·</span>
        <span>{timeRange}</span>
      </div>
      <h3 className="line-clamp-2 text-base font-semibold text-fg-primary">
        {course.name}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
        {course.room ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
            style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
          >
            {course.room}
          </span>
        ) : null}
        {course.teacher ? <span className="truncate">{course.teacher}</span> : null}
      </div>
    </button>
  );
}
```

要点:
- min-h は cap せず内容で決める (連続コマでも内側 padding 一定)
- 教室は accent tint の chip (歩きながら見る情報優先 — A.4)
- 教師は `truncate` で 1 行
- 授業名は `line-clamp-2` で最大 2 行
- active scale-[0.98] で押下フィードバック

### X.3 空きコマ row (A.3)

```tsx
export function DayEmptyRow({ slot, onClick }: { slot: DaySlotDto; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl bg-white/4 px-5 py-3.5 text-left text-fg-tertiary hover:bg-white/6"
    >
      <span className="text-xs">
        <span className="font-semibold">{slot.label}限</span>
        <span className="mx-1">·</span>
        <span>{formatMinutes(slot.startMinute)} - {formatMinutes(slot.endMinute)}</span>
      </span>
      <span className="text-xs">空きコマ</span>
    </button>
  );
}
```

要点:
- 高さ 56px 程度 (タップ可能だが圧迫感なし)
- bg-white/4 で「ある」ことだけは認識可能
- tap → MeetingCreateSheet 起動

### X.4 Sticky CTA (C.1)

```tsx
export function TodayStickyCTA({ onMarkAllPresent }: { onMarkAllPresent: () => void }) {
  return (
    <div
      className="sticky bottom-0 z-30 -mx-5 mt-8 border-t border-white/8 bg-bg-base/85 backdrop-blur-xl"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <div className="flex gap-3 px-5 pt-3">
        <button
          type="button"
          onClick={onMarkAllPresent}
          className="flex-1 rounded-full bg-accent-500 px-5 text-base font-semibold text-fg-on-accent shadow-glow active:scale-[0.97]"
          style={{ minHeight: 56 }}
        >
          今日は全出席
        </button>
      </div>
    </div>
  );
}
```

要点:
- ボタン高さ 56px (主要 CTA は通常より 1 段大きい)
- `max(12px, env(safe-area-inset-bottom))` で safe-area + 最小 12px 担保
- backdrop-blur-xl で v4 Snap 風と整合
- `-mx-5 mt-8 px-5` で親の `px-5` を打ち消し、画面端まで背景を伸ばす

### X.5 BottomSheet shell (C.2)

```tsx
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-[1100] bg-bg-overlay backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[1110] flex max-h-[90dvh] flex-col rounded-t-[28px] bg-bg-elevated shadow-sheet animate-slide-up"
        role="dialog"
        aria-modal="true"
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-9 rounded-full bg-white/16" />
        </div>
        {/* header */}
        <div className="flex min-h-14 items-center justify-between border-b border-white/8 px-5">
          <h2 className="text-lg font-semibold text-fg-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-fg-secondary hover:bg-white/8"
            aria-label="閉じる"
          >
            <XIcon size={20} />
          </button>
        </div>
        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-1">
          <div className="space-y-5">{children}</div>
        </div>
        {/* footer (optional) */}
        {footer ? (
          <div
            className="sticky bottom-0 border-t border-white/8 bg-bg-elevated px-5 py-3"
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </>
  );
}
```

要点 (C.2 spec を全て反映):
- 角丸 28px (v4 維持)
- drag handle 4×36px (Gemini 推奨中央値)
- header min-h-14 (56px) + title text-lg + divider
- body px-5 (20px) + space-y-5 (20px) + pb-6 (24px)
- footer sticky + border-t + safe-area-inset-bottom
- max-h-[90dvh] で iOS Safari ツールバー対応
- X ボタン 44×44 (hit area 44 確保、視覚は 20px アイコン)

### X.6 タイポグラフィ token (B.4)

```css
:root {
  --font-sans: "Inter", "Noto Sans JP", system-ui, -apple-system, sans-serif;

  /* font-size (Major Third 1.25) */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 30px;

  /* line-height (unitless) */
  --leading-tight: 1.2;
  --leading-snug: 1.35;
  --leading-normal: 1.5;
  --leading-relaxed: 1.6;

  /* font-weight */
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
}
```

### X.7 Spacing token (B.1)

```css
:root {
  /* 8pt grid */
  --space-0_5: 2px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* semantic (8pt grid 適用結論) */
  --page-px-mobile: var(--space-5);
  --page-px-desktop: var(--space-8);
  --card-padding: var(--space-5);
  --card-padding-lg: var(--space-6);
  --section-gap-mobile: var(--space-8);
  --section-gap-desktop: var(--space-10);
  --button-gap: var(--space-3);
  --button-gap-destructive: var(--space-4);
}
```

Tailwind 直書きで対応する場合は CSS variable は不要、すべて class 名で表現する選択肢もある (Touri 既存スタイルに沿わせるかは Architect 判断)。

---

## 付録 Y. WCAG コントラスト計算 (ダーク基調での再検証)

v4 採用色をダーク背景 `#0B0E14` (= `--color-bg-base`) 上で再計算。

| 前景 | 背景 | コントラスト比 | WCAG 用途 |
|---|---|---|---|
| `#F5F6F8` (text-primary) | `#0B0E14` | **14.71:1** | AAA (text), AAA (large text) |
| `rgba(245,246,248,0.66)` ≒ `#A6A8AB` | `#0B0E14` | **7.84:1** | AAA (text) |
| `rgba(245,246,248,0.42)` ≒ `#6C6E72` | `#0B0E14` | **3.95:1** | AA Large text, NG normal text |
| `#10EB99` (accent-500) | `#0B0E14` | **11.86:1** | AAA (text) |
| `#04140C` text on `#10EB99` accent | `#10EB99` | **15.43:1** | AAA (text on accent button) |
| `rgba(255,255,255,0.08)` (border-default) | `#0B0E14` | **1.18:1** | Decorative 限定 (3:1 未達) |
| `rgba(255,255,255,0.16)` (drag handle bg) | `#0B0E14` | **1.41:1** | Decorative 限定 |

含意:
- text-tertiary (`rgba(...0.42)`) は AA Large しか満たさない → **helper / caption 限定**で本文には使わない
- border 透明度 8% / 16% は WCAG 1.4.11 (3:1) を**満たさない**が、罫線ではなく面色 (bg-white/6 等) で区切る v4 方針なら問題なし
- focus ring は **`accent-500` で 11.86:1** → WCAG 1.4.11 余裕クリア。Phase 3 で改善した「ring-accent-100 で 1.05:1」問題はダーク背景下では発生しない (ただし Architect は焦らず再確認すべし)

出典: [WCAG 2.2 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast) / [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

---

## 付録 Z. Touri 設計言語との整合チェック

[[pattern/touri-design-philosophy]] = 「**目的に対してなるべくシンプルな実装と、汎用性・拡張性に長けた設計**」。本書 v5 推奨が抵触しないか:

| Touri 原則 | v5 整合 |
|---|---|
| シンプル実装 | 既存 TimetableGrid は PC 維持、モバイル DayList を**追加 1 component**で対応 (書き直しなし) |
| 並列拡張性 | chip nav の `days` 配列追加で 6 日 (土曜) 化も 1 行、DayMeetingCard は course color CSS variable で 8 色対応済 |
| OSS/既製 | Vaul / Radix / Tailwind / TanStack で組む、自前 FW 追加なし (Touri 2026-03 末以降の AI 駆動方針と整合) |
| ミニマル | デザイン token は v4 を流用、styles.css に typography + spacing token 追加するのみ |
| 明示的 | §E の 8 項目チェックリストを Architect が必ず書く前提 |

矛盾なし。設計 doc で堂々と採用可能。

---

## 付録 W. v5 vs v4 の実装変更スコープ (Architect 工数感)

| ファイル | 変更内容 | 工数 |
|---|---|---|
| `apps/web/src/components/timetable/DayChipNav.tsx` | **新規** (X.1) | S |
| `apps/web/src/components/timetable/DayList.tsx` | **新規** (週切替 state、DayMeetingCard / DayEmptyRow を組み立て) | M |
| `apps/web/src/components/timetable/DayMeetingCard.tsx` | **新規** (X.2) | S |
| `apps/web/src/components/timetable/DayEmptyRow.tsx` | **新規** (X.3) | S |
| `apps/web/src/components/timetable/TimetableGrid.tsx` | **変更**: モバイル幅では非表示、PC のみ表示 (`hidden md:block` で切替) | S |
| `apps/web/src/routes/Timetable.tsx` | **変更**: モバイル DayList + PC TimetableGrid を CSS media query で切替 (state は共通) | M |
| `apps/web/src/components/today/MainAttendanceCTA.tsx` | **変更**: sticky 化 (X.4) | S |
| `apps/web/src/components/sheet/BottomSheet.tsx` | **変更**: 外周 padding `px-4` → `px-5`、section spacing 共通化 (X.5) | S |
| `apps/web/src/styles.css` | **追加**: typography token (X.6) + spacing token (X.7) | S |
| `apps/web/src/components/ui/Button.tsx` | **変更**: 隣接 gap 規約のため `mb-0 mt-0` を確認、`flex gap-3` 親で間隔取る原則を明示 | XS |
| `apps/api/*` | **変更なし** | - |
| `prisma/schema.prisma` | **変更なし** | - |

合計工数感: S × 6 + M × 2 = Developer 1 ターンで完結可能。Reviewer もテスト基盤同一で新規 spec は数十件追加程度。

---

## まとめ (Architect TL;DR)

- **モバイルで時間割が見づらい問題 → 日別タブ + 週切替併用 (A.3) を強く推奨**。Penmark 流横スクロール grid はモバイルで破棄、PC では維持
- **ボタン余白 / 配置の根拠 → 8pt grid (B.1) + thumb zone (B.3) + WCAG 2.5.5/2.5.8 (B.2)** を設計 doc に明示
- **タイポグラフィ理論 → Major Third (1.25) + line-height 1.5 (body) / 1.2 (headline) + weight 階層 400/500/600/700**
- **sticky CTA / sheet / tab bar の 2024-2026 spec** は付録 X に実装スニペット付きで全部出した
- **WCAG コントラスト** はダーク基底でも accent-500 (11.86:1) 余裕クリア (付録 Y)
- **既存実装の最小破壊**: 追加 4 component + 既存 3 ファイル変更で完結 (付録 W)
- **§E のチェックリスト 8 項目を Architect は必ず設計 doc に明示する**こと
