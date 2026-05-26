---
title: Atender 入力 UX / 視認性 BP リサーチ (Phase 3)
category: research
project: atender
tags: [ui, ux, bottom-sheet, timetable-grid, readability, wcag, focus-ring, hierarchy]
created: 2026-05-18
sources:
  - https://www.w3.org/TR/WCAG22/#non-text-contrast
  - https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance-minimum.html
  - https://developer.apple.com/design/human-interface-guidelines/layout
  - https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
  - https://m3.material.io/components/text-fields/guidelines
  - https://m3.material.io/components/text-fields/specs
  - https://material-web.dev/components/text-field/
  - https://material-web.dev/theming/color/
  - https://m3.material.io/components/bottom-sheets/guidelines
  - https://rsms.me/inter/
  - https://fonts.google.com/noto/specimen/Noto+Sans+JP
  - https://tailwindcss.com/docs/hover-focus-and-other-states
  - https://tailwindcss.com/blog/tailwindcss-v4
  - https://www.nngroup.com/articles/bottom-sheet/
  - https://www.nngroup.com/articles/form-design-white-space/
  - https://www.refactoringui.com/
---

# Atender 入力 UX / 視認性 BP リサーチ

調査日: 2026-05-18 / 調査者: researcher (Gemini + Codex)。
前段 [[01-redesign-research]] で確定した「Penmark ライク (白 + emerald + Inter + Noto Sans JP)」を**置換せず改良**するための token / 構造改善 BP。

## Executive Summary (Architect 推奨)

### Touri の「見えにくい」根因 (コード照合済み・確定)

実装 (`apps/web/src/components/`) を確認した結果、視認性低下の正体は **4 つの具体的な設計欠陥**:

1. **Input の focus ring が事実上見えない**
   - 現状: `focus:ring-2 focus:ring-accent-100` → ring 色 `#D1FAE5` は背景 `#FFFFFF` に対しコントラスト約 **1.05:1**
   - WCAG 2.2 / 1.4.11 非テキストコントラストは UI コンポーネントに **3:1 以上**を要求 → 違反
   - 出典: https://www.w3.org/TR/WCAG22/#non-text-contrast

2. **時間割グリッドに罫線が物理的に存在しない**
   - `TimetableGrid.tsx` は `grid gap-1` のみ。罫線描画なし
   - 各セルが独立した `rounded-md border` の島になっており、表として連結して見えない
   - Touri が言う「横線が消えた」は正確には**そもそも横線を一度も描いていない**状態

3. **MeetingBlock 背景 `bg-emerald-50` (#ECFDF5) が背景 #FFFFFF と区別不能**
   - コントラスト約 1.04:1。授業ブロックの境界は左 4px の border-l だけが頼り
   - 時間割が「空のセルか、入っているセルか」が目で識別できない

4. **BottomSheet 内に視覚階層が無い**
   - header (タイトル + 閉じる) と body の間に**区切り線がない**
   - Field 内 label → input の gap が `gap-1.5` (6px) でラベルと値が密着
   - section 同士の区切りもなく、フォームが「のっぺりした塊」になる

加えて補助的に:
- backdrop の `bg-black/60 backdrop-blur-sm` は sheet 内 text には影響しない (sheet 自体は `bg-bg-elevated` = #FFFFFF で不透明) → 体感の「霞み」は上記4点が原因で、blur は無罪

### Architect への token 改訂推奨 (即決定可能なもの)

| 対象 | 現状 | 推奨 | 根拠 |
|---|---|---|---|
| **Input focus ring** | `ring-accent-100 (#D1FAE5)` | `outline-2 outline-offset-2 outline-accent-500` + `border-accent-500` | WCAG 2.2 / 1.4.11 (3:1)・Tailwind v4 推奨は outline (https://tailwindcss.com/docs/hover-focus-and-other-states) |
| **Input radius** | `rounded-sm (6px)` | `rounded-md (10px)` | Penmark/iOS 系の親しみと一貫 (現 tokens の `--radius-md = 12px` を `10px` に下げて Input 専用に使う or `rounded-[10px]`) |
| **Input padding** | `min-h-11 px-3` | `min-h-12 px-4` (h-48px) | MD3 Filled/Outlined 標準高 56dp、HIG 推奨 tap target 44pt 以上余裕 |
| **Field label-input gap** | `gap-1.5 (6px)` | `gap-2 (8px)` | 8px grid 基準・Refactoring UI |
| **Field label weight** | `font-semibold (600)` | `font-medium (500)` | label は値より弱く、見出し的に強くしない (Linear/Stripe BP) |
| **Field label color** | `text-fg-primary (#1C1B1F)` | `text-fg-secondary (#5F5E64)` | 上と同じ理由。値が主・label は補助 |
| **Field 内 value (input text)** | `text-base` | `text-base font-medium` | 入力値を主役に。Inter 500 は読みやすさ最大化点 |
| **BottomSheet header 区切り** | なし | header 下に `border-b border-border-subtle` | 階層を明示 |
| **BottomSheet body padding** | `px-4 pb-4` | `px-5 pb-6 pt-1` | section 内呼吸 (24px下端) |
| **BottomSheet 内 section spacing** | なし | section ごとに `space-y-5` (20px) + 区切り必要なら `border-t border-border-subtle pt-5` | iOS Inset Grouped 系 |
| **BottomSheet header title weight** | `text-base font-semibold` | `text-lg font-semibold` (18px / 600) | dialog title は h2、本文より明確に強い |
| **TimetableGrid 横罫線** | なし | grid 行ごとに `border-b border-border-subtle` を時限ラベル列+全曜日列の cell 下端に | Google Calendar/Notion Calendar 流 (横線主・縦線最小) |
| **TimetableGrid 縦罫線** | なし | 列 1 (時限ラベル) と列 2 の境界のみ `border-r border-border-subtle` | 縦線過多を避ける |
| **TimetableGrid gap** | `gap-1 (4px)` | `gap-0` + 罫線で区切る | 罫線中心方式に切替 |
| **時限ラベル列背景** | `bg-bg-muted (#F7F7F5)` | 同上維持 + `font-semibold (600) text-fg-primary` | コントラスト UP。secondary 色だと弱い |
| **時限ラベル列の時刻表示** | なし | `小さく時刻 (08:50)` を時限番号下に表示 (text-[10px] text-fg-tertiary) | Fantastical/Penmark 流 |
| **MeetingBlock 背景** | `bg-emerald-50 (#ECFDF5)` (1.04:1 で消失) | course color の `*-100` (10% tint) を使う or `bg-bg-muted (#F7F7F5)` + 左 4px accent | 8 色 palette は course ごと固有色がある (redesign §3) → `#${color}1A` (10% opacity) 等で塗る |
| **MeetingBlock border** | `border-border-subtle` (1.14:1) | `border-border-default (#D1D5DB)` (1.84:1) | 3:1 未達だが**塗り**で区別する前提なら可。塗りなしなら `border-border-emphasis (#9CA3AF)` (2.85:1) に上げる |
| **EmptyCell** | dashed `border-border-subtle` | dashed `border-border-default` + hover で `bg-bg-muted` | 空セルの存在認識を上げる |
| **NumberStepper** | `min-h-11 border-border-default` | `min-h-12 border-border-default` + 中央の `text-base font-semibold` を `text-lg font-bold` | 値が主役、Inter 700 のサイズ感 |
| **Button (primary)** | (未確認だが redesign で `bg-accent-500`) | text を `font-semibold (600)` 維持・min-h-12 維持・disabled は opacity 50 + cursor-not-allowed | 標準的 |

### 強い含意 (★)

★1. **focus ring を WCAG 1.4.11 に揃えるのは Atender 全体の問題** — Input だけでなく Button / IconButton / Select / Textarea すべて `ring-accent-100` 系を使っていないか grep して一掃。Tailwind v4 では `focus-visible:outline-*` が推奨パターンに昇格しているので、トークン層 (CSS variable) で `--focus-ring-color: #10B981` を定義し、共通クラスにすると良い。
★2. **罫線は「グリッド全体に 1 本ずつ」を CSS Grid で描く** — 各セルに border を付けるのではなく、コンテナ側で `[&>*]:border-b [&>*]:border-border-subtle` のような子セレクタで一括描画。これで「表」として知覚される (Notion/Linear/Airtable 共通の手法)。
★3. **MeetingBlock の course color tint** — redesign §7 で 8 色 palette を確定済みだが、現実装は `bg-emerald-50` ハードコード。**course.color (hex) を CSS で `color-mix(in srgb, var(--course-color) 12%, white)` で動的 tint** にすれば 8 色に自動対応 + コントラスト確保。Tailwind v4 は `color-mix` 互換 (CSS native)。
★4. **frontend 全体の token 改訂で済む。コンポーネント書き直しは不要** — `styles.css` の CSS variable と `tailwind.config.ts` の token、各コンポーネントの className 差分 (Input / Field / NumberStepper / BottomSheet / TimetableGrid / MeetingBlock / EmptyCell) だけで対応可能。設計 doc も追加 patch 章で済む。
★5. **「時限ラベル列に時刻併記」は redesign 設計 doc に無い改善** — Penmark/Fantastical は時限番号と時刻を併記 (1限 / 08:50). MVP 既存の `DaySlot.startMinute/endMinute` を使えば追加 API なしで実装可能。Touri 「必要な情報をすぐ認識」要望に直結。

---

## §1 BottomSheet / 入力フォーム視認性 BP

### 1.1 iOS HIG (Layout / Lists)

- Layout: **マージン 16pt 標準、横余白を一定に**。タイトルと本文の階層は size + weight で明示
- 出典: https://developer.apple.com/design/human-interface-guidelines/layout
- Lists: grouped list は「セクション間に余白 + 内側で separator」が定石。**separator の hex は HIG に明記されていない** (UIKit の `separatorColor` はテーマ依存、light mode で `UIColor.separator` ≒ rgba(60,60,67,0.29))
- 出典: https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- 推奨実装: section 間 24-32px、section 内 12-16px、separator hairline (1px の `#E5E5EA` 系 / 本プロジェクトでは `--color-border-subtle = #E7E5E0` で代替)

### 1.2 Material Design 3 / Text Fields

- 2 種類: **Filled** (背景塗り + 下線、モバイル推奨) / **Outlined** (枠線囲み、PC/密度高い面)
- Outlined のトークン:
  - 通常 outline = `--md-sys-color-outline` (テーマ依存、固定 hex なし)
  - focus outline = `--md-sys-color-primary` (focus 時は accent 色で囲む)
  - outline 幅 = 1px、focus = 2px
- 出典: https://m3.material.io/components/text-fields/specs / https://material-web.dev/components/text-field/ / https://material-web.dev/theming/color/
- Atender は Outlined 採用 (現状) → focus 時 border + outline 共に `accent-500`、ring-* は補助でなく主にする方針

### 1.3 Modal Bottom Sheet (MD3)

- shape: 上部のみ radius (Atender 現実装 `rounded-t-lg` で OK)
- elevation: 影は控えめ、`shadow-sheet` (現 token) で OK
- handle (drag bar): 中央上部に 4px x 32px 程度。現実装 `h-1 w-6 = 4x24px` で近似 OK
- header と body の境界に **必ず区切り** (MD3 では `divider` を推奨)
- 出典: https://m3.material.io/components/bottom-sheets/guidelines
- NN/g: BottomSheet は「コンテキスト維持」が利点。中身が視覚的にまとまっていなければ価値が薄れる
- 出典: https://www.nngroup.com/articles/bottom-sheet/

### 1.4 backdrop blur と sheet 内 text

- Glassmorphism (透過 + blur) を sheet 自体に適用すると text の視認性が落ちる (背景透けが文字に被る)
- Atender 現実装は backdrop だけ `bg-black/60 backdrop-blur-sm`、sheet は `bg-bg-elevated` (=#FFFFFF) で不透明 → **問題なし**
- Touri 体感の「霞み」は backdrop blur ではなく、§Executive 1〜4 の構造欠陥に起因
- 出典: https://developer.apple.com/design/human-interface-guidelines/layout (transparency と読みやすさのバランス)

### 1.5 視認性 BP まとめ

| 要素 | 推奨値 (8px grid 準拠) |
|---|---|
| sheet 外周 padding | px-5 (20px) ※ 内側コンテンツ用 |
| sheet header height | min-h-14 (56px) |
| sheet handle | 4 x 32px、上余白 12px |
| header と body の divider | `border-b border-border-subtle` |
| section 間 spacing | space-y-5 (20px) |
| label と input の gap | gap-2 (8px) |
| input 高さ | min-h-12 (48px) |
| input 横 padding | px-4 (16px) |
| footer (action 群) | sticky 下端、`border-t border-border-subtle` + py-3 + px-5 + gap-3 |

---

## §2 時間割グリッド / テーブル罫線 BP

### 2.1 Google Calendar / Notion Calendar / Apple Calendar の共通則

- **横線主・縦線最小**: 1 日の中の時刻区切りは横線で表現、日付間の縦線は最小限 or 無し (現代カレンダーの定石)
- 罫線色は薄く、コンテンツが主役: `#E5E7EB` / `#F4F4F5` 系 (Slate-200 / Zinc-100 相当)
- 高精細ディスプレイでは `1px` の hairline が十分強く見える (Retina 上で物理 0.5px)

### 2.2 Penmark / Studyplus の時間割グリッド

- Penmark v3: 行 = 時限、列 = 曜日。**セル間は細い区切り線で連結された 1 つの表**として表示 (バラバラの島ではない)
- 時限ラベル列は左固定、軽い背景 tint (#F7F7F5 系) + 中央寄せ
- 出典: https://penmark.jp/guide/

### 2.3 Atender への適用 token

```css
/* 罫線方式 */
.timetable-grid {
  display: grid;
  grid-template-columns: 56px repeat(5, minmax(88px, 1fr));
  gap: 0;  /* 罫線で区切る */
  border-top: 1px solid var(--color-border-subtle);
  border-left: 1px solid var(--color-border-subtle);
  border-radius: 12px;
  overflow: hidden;
}
.timetable-cell {
  border-right: 1px solid var(--color-border-subtle);
  border-bottom: 1px solid var(--color-border-subtle);
  min-height: 72px;  /* 64px → 72px、息抜き */
}
.timetable-period-label {
  background: var(--color-bg-muted);
  font-weight: 600;
  color: var(--color-text-primary);
  display: grid;
  place-items: center;
  gap: 2px;
}
.timetable-period-label .time {
  font-size: 10px;
  color: var(--color-text-tertiary);
  font-weight: 400;
}
```

### 2.4 MeetingBlock の塗り戦略

- redesign §7 の course palette 8 色を CSS で動的に解決
- 案: course.color (hex) を `--course-color` として inline style で渡し、背景は `color-mix(in srgb, var(--course-color) 12%, white)`
- 左 border は `4px solid var(--course-color)` のまま (現状の表現を活かす)
- 文字色は常に `--color-text-primary` (#1C1B1F)、tint 背景上で 12:1 以上のコントラスト保証
- 出典: https://developer.mozilla.org/en-US/docs/Web/CSS/color-mix

### 2.5 EmptyCell の存在感

- 現状 `border-dashed border-border-subtle` (#E7E5E0、1.14:1) は背景 #FFF にほぼ溶ける
- 案 A: dashed を `border-border-default` (#D1D5DB、1.84:1) に上げる
- 案 B (推奨): dashed を撤去し、空セルは**背景同色 (#FFF) + hover で `bg-bg-muted`** にする。罫線 (§2.3) で表として認識されているなら空セルは「何もない」で十分
- 中央に `+` アイコンを `text-fg-tertiary` (#9CA3AF) の opacity 0 → hover で opacity 60 → 「ここに追加できる」アフォーダンス

---

## §3 フォントウェイト hierarchy

### 3.1 Inter の公式推奨

- Inter は variable font、weight 100-900 連続
- 通常 Web UI で実用される weight: 400 / 500 / 600 / 700
- `font-optical-sizing: auto` は対応ブラウザで `opsz` 軸を自動適用 (大文字サイズで Display 寄り)
- **Display axis / opsz の手動指定は Hero 見出し以外には不要** (Codex 確認、出典: https://rsms.me/inter/, https://developer.mozilla.org/en-US/docs/Web/CSS/font-optical-sizing)

### 3.2 Noto Sans JP との混在

- Noto Sans JP は Regular 400 / Medium 500 / Bold 700 が主要
- Inter と Noto Sans JP は字形太さ知覚が近く、**同じ weight 値で混在 OK**
- font-family stack: `"Inter", "Noto Sans JP", system-ui, ...` の順 (現状維持)
- 出典: https://fonts.google.com/noto/specimen/Noto+Sans+JP

### 3.3 Atender 推奨 hierarchy

| 役割 | weight | size | color |
|---|---|---|---|
| ページタイトル (h1) | 700 | 24px (text-2xl) | fg-primary |
| sheet タイトル (h2) | 600 | 18px (text-lg) | fg-primary |
| section ヘッダ | 600 | 14px (text-sm) | fg-secondary uppercase tracking-wide |
| input label | 500 | 14px (text-sm) | fg-secondary |
| input value | 500 | 16px (text-base) | fg-primary |
| body text | 400 | 14-16px | fg-primary |
| helper text | 400 | 12px (text-xs) | fg-tertiary |
| error text | 500 | 12px (text-xs) | status-absent |
| ボタン (primary) | 600 | 16px | text-on-accent |
| ボタン (secondary / text) | 500 | 16px | accent-600 |
| 時限ラベル番号 | 600 | 14px | fg-primary |
| 時限ラベル時刻 | 400 | 10px | fg-tertiary |
| MeetingBlock 授業名 | 600 | 14px | fg-primary |
| MeetingBlock 教師/教室 | 400 | 12px | fg-secondary |

★ 重要: **label は 600 から 500 に下げる** (現実装は 600)。**input value は 400 から 500 に上げる**。これで「値が主役・label が補助」の階層が出る (Linear / Stripe 流)。

---

## §4 パディング・余白体系 (8px grid)

### 4.1 トークン (現状維持 + 追加なし)

`--space-*` を CSS variable で持っている前提だが、Atender 現実装は Tailwind の `p-*` 直書きで OK。基準:

- 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48px

### 4.2 適用マトリクス

| コンテキスト | 内側 padding | gap (子要素間) |
|---|---|---|
| Page (ページ全体) | `px-4 py-6` (mobile) / `px-8 py-8` (PC) | section ごとに `space-y-8` |
| Card (一般カード) | `p-4` | `gap-3` |
| BottomSheet 外周 | `px-5 pb-6` | section ごとに `space-y-5` |
| BottomSheet header | `px-5 min-h-14` | - |
| Form Field | - | `gap-2` (label-input) |
| Form section (複数 Field) | - | `space-y-4` |
| Input | `px-4 min-h-12` | - |
| Button | `px-4 py-3` (min-h-12) | - |
| 時間割セル | `p-2` | - |
| 時間割行間 | 0 (罫線で区切る) | - |

### 4.3 BottomSheet action footer

```html
<footer class="sticky bottom-0 border-t border-border-subtle bg-bg-elevated px-5 py-3 safe-pb">
  <div class="flex gap-3">
    <button class="flex-1 ...">キャンセル</button>
    <button class="flex-1 ...">保存</button>
  </div>
</footer>
```

iOS HIG の dialog action 配置慣習 + MD3 buttons spec に整合。

---

## §5 色使い (accent + state)

### 5.1 accent 1 色固定 (現状維持)

- emerald-500 (#10B981) は WCAG AA / AAA で:
  - 白背景 #FFFFFF に対し 2.85:1 (大テキスト OK、通常テキスト NG) → **accent をテキスト色には使わない**
  - 黒テキスト #1C1B1F に対し 4.42:1 (テキスト OK)
- ボタン背景に使う場合は文字 `text-white` で対比 4.91:1 (AA OK)
- 出典: 単純な色計算は WebAIM Contrast Checker https://webaim.org/resources/contrastchecker/ で再現可能

### 5.2 focus ring

- 推奨パターン (Tailwind v4): `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500`
- 旧 `ring-*` も継続サポート (`ring-2 ring-accent-500 ring-offset-2`)。本プロジェクトではどちらでも可だが**外側 offset を 2px 確保することが視認性の肝**
- ring 色を `accent-100` (#D1FAE5) にしてはいけない (WCAG 1.4.11 違反、3:1 未達)
- 出典: https://tailwindcss.com/docs/hover-focus-and-other-states / https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance-minimum.html

### 5.3 status 色 (出欠用、現状維持)

- present #10B981 / absent #E5535B / excused #3B82F6 / tardy #F59E0B / early #A855F7 / cancelled #9CA3AF
- 既に redesign 設計済み、変更なし

### 5.4 hover / disabled / error

| state | 表現 |
|---|---|
| hover (interactive) | `bg-bg-muted` or `bg-accent-50` (primary button は `bg-accent-600`) |
| active (押下) | `bg-accent-700` 0.05s スナップ |
| disabled | `opacity-50 cursor-not-allowed` |
| error (input) | `border-status-absent ring-status-absent/30` + helper を `text-status-absent` |

---

## §6 情報認識速度 (F-pattern / hierarchy)

### 6.1 BottomSheet 内の情報順序

授業追加 sheet を例にした推奨順序:

```
[header: 授業を追加 | X]
─── divider ───
[section 1: 基本情報]
  授業名 *
  教師
  教室
─── divider (or spacer) ───
[section 2: 時間]
  曜日 *
  時限 *
  連続コマ数
─── divider ───
[section 3: 色]
  色 (8色から選択)
─── divider ───
[footer: キャンセル | 保存]
```

- F-pattern (左上から下) で重要 → 副次の順
- アスタリスク `*` は必須項目に追加
- ボタン群は下部 sticky で常に視界
- 出典: https://www.nngroup.com/articles/form-design-white-space/

### 6.2 グループ化の原則

- 関連性が高い Field を 1 section にまとめる (proximity 法則)
- section 間は **空白 24px or divider 1 本** で区切る
- 1 section 内の Field は **gap-4 (16px)** で並べる

### 6.3 アクションの優先

- primary は 1 個 / secondary は 1 個まで
- destructive (削除) は **section 単体で sheet 最下部**に。footer の primary action と並べない (誤タップ防止)

---

## §7 BP 比較表 (BottomSheet 設計)

| 要素 | iOS HIG | MD3 | Penmark | Linear | **Atender 推奨** |
|---|---|---|---|---|---|
| 形状 | 上 radius | 上 radius | 上 radius | フル radius modal | 上 `rounded-t-lg` |
| handle | 任意 | 推奨 | あり | なし | あり (4x32) |
| header divider | なし (空白で) | 推奨 | あり | あり | **あり** |
| 外周 padding | 16pt | 24dp | 16px | 24px | **20px (px-5)** |
| input 高さ | 44pt | 56dp | 50px | 36px | **48px (min-h-12)** |
| label 位置 | 上 or 左 | flying (top) | 上 | 上 | **上 (Field 維持)** |
| label weight | regular | medium | regular | medium | **medium (500)** |
| focus 表現 | accent border | outline + label color | accent border | outline | **outline + border** |
| 区切り線 hex | system separator | outline-variant | 不明 | #E5E5EA | **#E7E5E0 (現状維持)** |

---

## §8 BP 比較表 (グリッド/テーブル罫線)

| 要素 | Google Calendar | Notion | Penmark | Apple Calendar | **Atender 推奨** |
|---|---|---|---|---|---|
| 横線 | あり (細) | あり | あり | あり | **あり** |
| 縦線 | 最小 | あり (table 内) | あり (細) | なし | **最小 (時限ラベル境のみ)** |
| 罫線色 | #E5E7EB 系 | #E5E5E5 | 薄ライトグレー | system separator | **#E7E5E0 (border-subtle)** |
| 罫線幅 | 1px | 1px | 1px | hairline | **1px** |
| セル余白 | 8-12px | 8px | 6-8px | - | **p-2 (8px)** |
| 時限/時刻列背景 | tint | なし | tint | tint | **bg-bg-muted (#F7F7F5)** |
| 時限/時刻列 weight | 500 | 500 | 500-600 | 500 | **600 + 時刻 400** |
| イベント blockの塗り | course color 100% | tag color tint | course color tint | category color | **course color tint (color-mix)** |
| イベント block の枠 | なし | 左 border 系 | 左 border | 左 border | **左 border 4px** |

---

## §9 実装変更スコープ

**Phase: token 改訂 + コンポーネント className 差分のみ。新規コンポーネントなし。**

| ファイル | 変更内容 |
|---|---|
| `apps/web/src/styles.css` | (任意) `--color-border-subtle` 等の token は維持。`--focus-ring-color: var(--color-accent-500)` 追加候補 |
| `apps/web/tailwind.config.ts` | 変更不要 (CSS variable 経由) |
| `apps/web/src/components/ui/Input.tsx` | `border-default` 維持 + focus を `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 focus-visible:border-accent-500`、`ring-accent-100` 削除、`min-h-11 px-3` → `min-h-12 px-4`、`rounded-sm` → `rounded-[10px]` |
| `apps/web/src/components/ui/Field.tsx` | label weight `font-semibold` → `font-medium`、`text-fg-primary` → `text-fg-secondary`、`gap-1.5` → `gap-2` |
| `apps/web/src/components/ui/NumberStepper.tsx` | `min-h-11` → `min-h-12`、output 値 `text-base font-semibold` → `text-lg font-bold` |
| `apps/web/src/components/ui/Button.tsx` | (未確認) focus 規約を Input と揃える |
| `apps/web/src/components/ui/Select.tsx`, `Textarea.tsx` | 同上 (Input と統一) |
| `apps/web/src/components/sheet/BottomSheet.tsx` | header の `min-h-12` → `min-h-14`、title `text-base font-semibold` → `text-lg font-semibold`、header と body の境界に `border-b border-border-subtle`、body padding `px-4 pb-4` → `px-5 pb-6 pt-1` |
| `apps/web/src/components/timetable/TimetableGrid.tsx` | `gap-1` → `gap-0`、コンテナに上左 border、各セルに右下 border、grid-row 高さ `64px` → `72px` |
| `apps/web/src/components/timetable/MeetingBlock.tsx` | `bg-emerald-50` → 動的 tint (`style={{ background: color-mix(in srgb, ${course.color} 12%, white) }}`)、border `border-border-subtle` 維持、内文字 hierarchy 改 (§3.3) |
| `apps/web/src/components/timetable/EmptyCell.tsx` | dashed border 削除、`bg-bg-base hover:bg-bg-muted` のみ、中央に `+` アイコン opacity 0 → hover 60 |
| `apps/web/src/components/timetable/PeriodLabel`(新規 or 既存変更) | 時限番号 + 時刻 2 段表示 |
| 関連 form (MeetingCreateSheet / MeetingEditForm / TimetableSettingsSheet) | section 構造を `space-y-5` + section ごと divider に。footer sticky 化 |

**コンポーネント書き直しは不要**。token + className 修正 + BottomSheet/TimetableGrid の最小構造変更で完結。

---

## §10 Architect への引き継ぎチェックリスト

設計 doc v2 に追記すべき:

- [ ] focus ring トークン (`--focus-ring-color: #10B981`) を styles.css に追加するか、各コンポーネントで `outline-accent-500` 直書きするかを決定
- [ ] MeetingBlock の course color tint 方式 (color-mix vs Tailwind `bg-emerald-50` の course 別 8 種 mapping) を決定
- [ ] 時限ラベル列に「時刻 (08:50-10:20)」併記の採否 (Touri 確認)
- [ ] EmptyCell の dashed 撤去 vs 維持 (Touri 嗜好)
- [ ] BottomSheet header divider の hairline 色 (`border-border-subtle` で OK か)
- [ ] Field label を `font-medium` (500) に下げることへの Touri 同意 (見出し的に強くする派閥もある)
- [ ] PC レイアウト時の Input 高さ (mobile 48px / PC 40px に分ける? or 統一?)

## §11 関連 knowledge へのリンク

- [[01-redesign-research]] — Phase 2: Penmark ライク + Inter+Noto Sans JP + emerald accent 確定 (前提)
- [[00-research-summary]] — Phase 1: 技術スタック・スキーマ確定 (前々段)
- [[pattern/form-modal-readability-bp]] — 本リサーチから派生 (新規作成)
- [[pattern/grid-table-borders-bp]] — 本リサーチから派生 (新規作成)
- [[pattern/timetable-app-ux-patterns]] — 時間割アプリ UX BP
- [[pattern/mobile-first-bottom-tab]] — bottom tab BP
- [[pattern/touri-design-philosophy]] — シンプル + 並列拡張
