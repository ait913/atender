---
title: Atender Modal / Bottom Sheet 実装 BP (React 19 + Tailwind v4, 2025-2026)
category: pattern
project: atender
tags: [ui, modal, bottom-sheet, portal, accessibility, react19, tailwind-v4, radix-dialog, vaul, inert, dvh, safe-area, scroll-lock]
created: 2026-05-27
sources:
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/  (WAI-ARIA APG Modal Dialog)
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block  (MDN Containing block)
  - https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert  (MDN inert)
  - https://web.dev/articles/inert  (web.dev inert guide)
  - https://www.radix-ui.com/primitives/docs/components/dialog  (Radix Dialog)
  - https://www.radix-ui.com/primitives/docs/guides/animation  (Radix Animation guide)
  - https://github.com/emilkowalski/vaul  (Vaul, unmaintained 表明)
  - https://vaul.emilkowal.ski/api  (Vaul API ref)
  - https://github.com/borabaloglu/vaul-base  (vaul-base, Base UI port)
  - https://github.com/theKashey/react-remove-scroll  (react-remove-scroll)
  - npm registry — vaul@1.1.2, @radix-ui/react-dialog@1.1.15, react-remove-scroll@2.7.2 (2026-05-27 確認)
  - https://tailwindcss.com/blog/tailwindcss-v4  (Tailwind v4)
  - https://stripearmy.medium.com/i-fixed-a-decade-long-ios-safari-problem-0d85f76caec0  (iOS scroll lock)
  - https://medium.com/@tharunbalaji110/understanding-mobile-viewport-units-a-complete-guide-to-svh-lvh-and-dvh-0c905d96e21a  (svh/lvh/dvh)
  - [[pattern/modal-sheet-base-component-3way-close]]
  - [[pattern/form-modal-readability-bp]]
---

## Context

Atender redesign で Modal / Bottom Sheet を作り直す。React 19 + Tailwind v4 で、既存 OMATASE-demo の知見 ([[pattern/modal-sheet-base-component-3way-close]]) と入力モーダル視認性 BP ([[pattern/form-modal-readability-bp]]) を引き継ぎつつ、2025-2026 の確立された一次情報で再検証する。Architect が `<Sheet>` 基底コンポーネントの設計に直接使えるレベルまで落とす。

## What

### 1. なぜ React Portal (`createPortal(node, document.body)`) が必須か

`position: fixed` は本来 viewport を containing block にするが、**祖先のいずれかが以下のプロパティを持つと、その祖先が containing block を作り、fixed が "viewport ではなく祖先" に対して固定される**。MDN 「Containing block」の規定:

- `transform`: `none` 以外 (`translate-z-0` / `transform-gpu` を含む)
- `perspective`: `none` 以外
- `filter`: `none` 以外 (`blur-*`, `brightness-*`)
- `backdrop-filter`: `none` 以外 ★ Tailwind v4 では `backdrop-blur-*` が多用される
- `rotate` / `scale` / `translate` (個別 longhand 含む)
- `contain`: `layout` / `paint` / `strict` / `content`
- `will-change`: 上記いずれかを含む値
- `content-visibility`: `auto`

Atender のような **モバイル向け UI** は `backdrop-blur` を header / nav に多用しがちで、これが祖先にあるだけで bottom sheet の `position: fixed; bottom: 0` が壊れる。**回避策は Portal で `document.body` 直下にレンダリングすることのみ** (CSS で逃げられない)。`createPortal` か Radix の `<Dialog.Portal container={document.body}>` を必ず使う。

### 2. WAI-ARIA modal の必須要件 (APG 2025)

APG の Modal Dialog pattern が要求する 7 点:

1. ルート要素に `role="dialog"` + `aria-modal="true"` (両方視覚遮蔽 + プログラム遮蔽が実装されている前提)
2. ラベル: `aria-labelledby` で可視タイトルを参照 (or `aria-label`)
3. オプション: `aria-describedby` で短い説明文を参照
4. 開く瞬間に **dialog 内のフォーカス可能要素 (先頭) にフォーカス移動**
5. **Tab / Shift+Tab で外に出ない (focus trap)**
6. **Escape で close**
7. 閉じた瞬間に **呼び出し元のトリガー要素にフォーカスを戻す (restore focus)**

加えて 2024-2025 で確立した補助要件:

- ダイアログ外コンテンツを **`inert` 属性で完全無効化** (focus / click / find-in-page / a11y tree から除外)。`aria-hidden="true"` だけでは click と focus は通る
- close 経路は **overlay tap / Escape / 明示 close button** の 3 経路 (HIG / M3 / 既存 [[pattern/modal-sheet-base-component-3way-close]])

### 3. body scroll lock の正解 (iOS Safari 2025)

`document.body { overflow: hidden }` だけでは **iOS Safari は body の overflow を無視** してドラッグスクロール可能。実用解は 3 つ:

| 解 | 仕組み | デメリット |
|---|---|---|
| **`react-remove-scroll`** (推奨) | `RemoveScroll` ラッパー内側のスクロールだけ通し外側を `pointer-events / touch-action` で殺す。Radix UI も内部で使用 | none (Radix Dialog 採用なら自動で入る) |
| `position: fixed; top: -${scrollY}px` ハック | body 自体を fixed 化 + close 時に scrollY 復元 | iOS で**スクロール位置がリセットされて見える瞬間がある**、accessibility focus がズレる |
| `overflow:hidden; overscroll-behavior:none` | デスクトップ + Android では十分 | iOS で漏れる (decade-long bug) |

**Atender の結論**: `<Sheet>` 基底は内部で `react-remove-scroll` を使う (`@radix-ui/react-dialog` を採用するなら自動で組み込まれるので追加 install 不要)。`react-remove-scroll` は 2.7.2 で React 19 peer 対応済み (npm 確認)。Radix Dialog 1.1.15 が内部で `^2.6.3` を pin。

### 4. モバイル bottom sheet ライブラリ比較 (2026-05 時点)

| ライブラリ | 最新版 | React 19 peer | ベース | drag/swipe | snap points | safe-area | メンテ |
|---|---|---|---|---|---|---|---|
| **Vaul** | 1.1.2 (2024-12) | OK peerDeps | Radix Dialog 1.1.1 ラッパー | yes | yes (snapPoints + activeSnapPoint) | 自前 CSS 必要 | **作者 unmaintained 表明** |
| **vaul-base** | (no release, src のみ) | 不明 | Base UI Dialog | yes | partial | partial | port、stars 111 |
| **Radix Dialog** + CSS | 1.1.15 (現役) | OK | 単体 | no (自前) | no | partial | 現役 |
| **@react-aria/dialog** | 3.x (現役) | OK | React Aria | no | no | partial | Adobe |
| 自前 (Radix Dialog + CSS keyframes + 手書き drag) | - | OK | - | 任意 | 任意 | 任意 | 自分次第 |

**Atender 推奨**: drag-to-dismiss が要らない MVP では **Radix Dialog 1.1.15 + Tailwind v4 CSS keyframes** が最も持続可能。drag/snap が要件化したら Vaul を諦観しつつ採用 (内部 Radix なので Radix Dialog 1.1.x ライン上で動く、将来 vaul-base 移行も可)。

★ Vaul は npm peerDeps で React 19 を許容し (npm 確認 2026-05-27)、内部実装は Radix Dialog なので「動くが新機能 PR は止まる」状態。代替の `vaul-base` は Base UI port で正式 release 未発行 (commits 32, stars 111)、本番投入は時期尚早。

**Vaul の主要 props** (公式 API ref より):

- `open` / `onOpenChange` / `defaultOpen` / `modal` (true) / `container` (document.body)
- `direction`: `bottom` (default) / `top` / `left` / `right`
- `dismissible` (true) / `handleOnly` (false) / `repositionInputs` (true)
- `snapPoints`: 配列 (`['148px', '355px', 1]` 等) / `activeSnapPoint` / `setActiveSnapPoint`
- `fadeFromIndex`: backdrop が fade in し始める snap index
- `snapToSequentialPoint`
- 構成: `Drawer.Root` / `Trigger` / `Portal` / `Overlay` / `Content` / `Title` / `Description` / `Handle` / `Close`
- `shouldScaleBackground` は公式 API page 未掲載 (旧 prop、削除済の可能性)

### 5. safe-area-inset と dvh の使い分け

iOS の Home Indicator / 切り欠きを避けるため bottom sheet の **下端 padding に `env(safe-area-inset-bottom)` を加算必須**。Tailwind v4 は `pb-[env(safe-area-inset-bottom)]` で書ける (任意値構文)。

高さ単位は **`dvh` (Dynamic Viewport Height)** が 2025 主流:

- `100vh` = アドレスバー隠れた時の大きい方 → 下端が address bar に隠れる
- `100svh` (Small) = 常に小さい方 → 上に余白が出る
- `100dvh` (Dynamic) = 現在の表示領域に追従 → 推奨だが**スクロールでアドレスバーが伸縮するたび `100dvh` が変動して bottom sheet がガタつく**

**Atender の運用**:

- bottom sheet の **`max-height` = `min(85dvh, 720px)`** にして dynamic 追従を抑制 (85% 制限で address bar 伸縮の影響を緩衝)
- 全画面モーダルが必要なら `height: 100dvh` (受容)
- 「snap point に `1` を渡してフル展開」する Vaul パターンは `dvh` ガタつきを許容できる時のみ

### 6. PC 中央モーダル / Mobile 下端 sheet を切り替える BP

**CSS only パターン** (推奨、JS 切替なし):

```css
/* base: bottom sheet (mobile-first) */
.sheet {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  border-radius: 1rem 1rem 0 0;
  max-height: min(85dvh, 720px);
  padding-bottom: env(safe-area-inset-bottom);
}

/* >= md: centered modal */
@media (min-width: 768px) {
  .sheet {
    inset: 50% auto auto 50%;
    bottom: auto;
    transform: translate(-50%, -50%);
    border-radius: 1rem;
    max-width: 32rem;
    max-height: 85dvh;
  }
}
```

Tailwind v4 で書くと:

```html
<div class="fixed inset-x-0 bottom-0 max-h-[min(85dvh,720px)] rounded-t-2xl pb-[env(safe-area-inset-bottom)]
            md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2
            md:max-w-md md:rounded-2xl md:max-h-[85dvh]">
```

★ `md:-translate-*` は **祖先に transform を入れるので、この sheet を Portal で body 直下に置くこと**。さもないと内部の `position: fixed` 子要素 (内蔵 tooltip 等) が transform の影響を受ける (1 で述べた containing block 罠が再発)。

**JS 切替パターン** (Vaul + Radix Dialog のハイブリッド): `useMediaQuery('(min-width: 768px)')` で desktop は `<Dialog>` / mobile は `<Drawer>` をスイッチ。コード量増、Atender MVP では非推奨。

### 7. footer 固定問題 (sticky bottom-0 が壊れる典型)

bottom sheet 内に「保存 / キャンセル」のボタン footer を置くと、**スクロール時に footer が消える / モバイルキーボードに隠れる** 事故が起きる。原因と対策:

| 壊れ方 | 原因 | 対策 |
|---|---|---|
| footer が消える | `sticky bottom-0` が **親の高さに依存** するのに親 (sheet content) が height auto | 親を `flex flex-col` + `max-h` 制限、body を `flex-1 overflow-y-auto`、footer を `shrink-0` |
| キーボードで footer が viewport 外 | iOS の virtual keyboard が viewport を変えない (visualViewport は変わる) | input focus 時に `window.visualViewport.height` を sheet の `--vvh` に反映、もしくは Vaul の `repositionInputs: true` を使う |
| スクロールしても footer に押し負ける | sheet content が `100dvh` ベタ + footer absolute | grid template-rows / flex 構造に統一 |

**確立パターン (flex)**:

```tsx
<Sheet>
  <div class="flex max-h-[min(85dvh,720px)] flex-col">
    <header class="shrink-0 border-b px-5 py-3"> ... </header>
    <main class="flex-1 overflow-y-auto px-5 py-4"> ... </main>
    <footer class="shrink-0 border-t px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]"> ... </footer>
  </div>
</Sheet>
```

**grid 版** (より宣言的):

```html
<div class="grid max-h-[85dvh] grid-rows-[auto_1fr_auto]">
  <header>...</header>
  <main class="overflow-y-auto">...</main>
  <footer>...</footer>
</div>
```

### 8. inert + focus return の React 19 実装

React 19 で `inert` は **boolean attribute として直接受け付ける** (`<div inert={modalOpen}>...`)。19 未満は string 強制で `<div {...(modalOpen ? {inert: ''} : {})}>` だった。

```tsx
export function useModalShell(open: boolean) {
  const triggerRef = useRef<HTMLElement | null>(null);

  // open 直前に focus 元を覚える
  const openWith = (trigger: HTMLElement | null) => {
    triggerRef.current = trigger ?? document.activeElement as HTMLElement;
  };

  // close 後に focus を戻す
  useEffect(() => {
    if (!open && triggerRef.current) {
      triggerRef.current.focus({ preventScroll: true });
      triggerRef.current = null;
    }
  }, [open]);

  return { openWith };
}
```

**ただし Radix Dialog を使うなら自動**。Radix Dialog は `onCloseAutoFocus` でトリガー要素に focus を戻すまでが標準動作。`inert` も Dialog.Content の sibling に自動付与される (内部実装 `aria-hidden` + `react-focus-scope`)。**自前で書くのは Radix 不採用時のみ**。

### 9. CSS-only アニメーション (Tailwind v4 + Radix data-state)

Radix は open/close で `data-state="open" / "closed"` を要素に付ける。Tailwind v4 で **`@theme` に `--animate-*` と `@keyframes` を定義** すれば framer-motion 不要:

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --animate-overlay-in: overlay-in 200ms ease-out;
  --animate-overlay-out: overlay-out 150ms ease-in;
  --animate-sheet-in: sheet-in 250ms cubic-bezier(0.32, 0.72, 0, 1);
  --animate-sheet-out: sheet-out 200ms ease-in;
  --animate-dialog-in: dialog-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
  --animate-dialog-out: dialog-out 150ms ease-in;
}

@keyframes overlay-in   { from { opacity: 0 } to { opacity: 1 } }
@keyframes overlay-out  { from { opacity: 1 } to { opacity: 0 } }
@keyframes sheet-in     { from { transform: translateY(100%) } to { transform: translateY(0) } }
@keyframes sheet-out    { from { transform: translateY(0) }    to { transform: translateY(100%) } }
@keyframes dialog-in    { from { opacity: 0; transform: translate(-50%, -48%) scale(0.96) }
                          to   { opacity: 1; transform: translate(-50%, -50%) scale(1) } }
@keyframes dialog-out   { from { opacity: 1; transform: translate(-50%, -50%) scale(1) }
                          to   { opacity: 0; transform: translate(-50%, -48%) scale(0.96) } }
```

```html
<Dialog.Overlay class="fixed inset-0 bg-black/40
                       data-[state=open]:animate-overlay-in
                       data-[state=closed]:animate-overlay-out" />
```

★ **`animation-fill-mode: forwards` 相当が重要**。closed の終端状態 (opacity 0 / translateY 100%) が保持されないと unmount 待ちの間に画面が一瞬戻る。Radix は unmount を suspend するので「animation 終端 = closed 状態」で OK だが、明示するなら `forwards`:

```css
@keyframes sheet-out { from { transform: translateY(0) } to { transform: translateY(100%) } }
.sheet-exit { animation: sheet-out 200ms forwards; }
```

### ★ Atender BottomSheet 雛形 (React 19 + Tailwind v4 + Radix Dialog)

Vaul を**まずは採用せず**、Radix Dialog + CSS で出す。drag-to-dismiss が要件化したら最後に Vaul を貼り替え (Vaul も内部 Radix なので API 互換高い)。

```tsx
// src/client/components/Sheet.tsx
import * as Dialog from '@radix-ui/react-dialog';
import { useMediaQuery } from '@/lib/useMediaQuery';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** stack 用 z-index */
  stackLevel?: 1 | 2;
}

export function Sheet({
  open, onOpenChange, title, description, children, footer, stackLevel = 1,
}: SheetProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const z = stackLevel === 2 ? 1110 : 1100;
  const zOverlay = z - 1;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ zIndex: zOverlay }}
          className="fixed inset-0 bg-black/40
                     data-[state=open]:animate-overlay-in
                     data-[state=closed]:animate-overlay-out"
        />
        <Dialog.Content
          style={{ zIndex: z }}
          aria-describedby={description ? 'sheet-desc' : undefined}
          className={[
            // mobile: bottom sheet
            'fixed inset-x-0 bottom-0 flex flex-col',
            'max-h-[min(85dvh,720px)] rounded-t-2xl bg-white',
            'pb-[env(safe-area-inset-bottom)]',
            'data-[state=open]:animate-sheet-in',
            'data-[state=closed]:animate-sheet-out',
            // desktop: centered dialog
            'md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
            'md:max-w-md md:rounded-2xl md:max-h-[85dvh]',
            'md:data-[state=open]:animate-dialog-in',
            'md:data-[state=closed]:animate-dialog-out',
            // focus ring (WCAG 1.4.11)
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
          ].join(' ')}
        >
          {/* mobile drag handle (visual only - not draggable yet) */}
          {!isDesktop ? (
            <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-slate-300" />
          ) : null}

          {/* header (3-way close 対応: ESC/overlay は Radix 自動、× は明示) */}
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3 min-h-14">
            <Dialog.Title className="text-base font-semibold text-slate-900">{title}</Dialog.Title>
            <Dialog.Close
              data-testid="sheet-close"
              aria-label="閉じる"
              className="grid h-11 w-11 place-items-center rounded-full hover:bg-slate-100
                         focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <span aria-hidden>×</span>
            </Dialog.Close>
          </header>

          {description ? (
            <Dialog.Description id="sheet-desc" className="px-5 pt-3 text-sm text-slate-600">
              {description}
            </Dialog.Description>
          ) : null}

          {/* body scroll 領域 */}
          <main className="flex-1 overflow-y-auto px-5 py-4">{children}</main>

          {/* sticky footer */}
          {footer ? (
            <footer className="shrink-0 border-t border-slate-200 px-5 py-3
                               pb-[max(env(safe-area-inset-bottom),12px)]">
              {footer}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**この雛形で満たされている要件**:

- Portal で `document.body` 直下 (祖先 transform/backdrop-filter 罠回避) — Radix 自動
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (`Dialog.Title`) + `aria-describedby` — Radix 自動
- focus trap + initial focus + restore focus — Radix `react-focus-scope` 自動
- 外部 inert / aria-hidden — Radix `aria-hidden` 自動 (`modal=true` 時)
- Escape close + overlay tap close + × button — 3 経路 ([[pattern/modal-sheet-base-component-3way-close]])
- body scroll lock (iOS Safari 含む) — Radix 内部 `react-remove-scroll@^2.6.3` 自動
- mobile bottom sheet / desktop centered modal の CSS-only 切替 (`md:` で transform 反転)
- `safe-area-inset-bottom` 加算
- `max-height: min(85dvh, 720px)` で dvh ガタつき緩衝
- flex 構造で header / body / footer 分離 (footer 押し負け回避)
- focus ring 3:1 (WCAG 1.4.11) — `outline-emerald-500`
- Tailwind v4 `@theme` の `--animate-*` で CSS-only アニメ (framer-motion 不要)
- `data-testid="sheet-close"` (Reviewer テストの 3 経路 assert に対応)

## Why

- **Portal は CSS では救えない**: containing block 仕様は仕様、jQuery 時代の常識を更新せず祖先 transform を放置すると bottom sheet が消える事故が起きる
- **WAI-ARIA APG を Radix Dialog が肩代わり**: 自前実装すると 7 要件のどれかを落とす。React 19 で `inert` が boolean 受容になっても、`react-focus-scope` 相当の循環 Tab 制御は重い (自前で書くな)
- **Vaul の判断**: 作者 unmaintained 表明 (2024-12 以降の commit ほぼ無) を **drag-to-dismiss が要件化するまで採用しない**。MVP の Atender に drag は不要。要件化したら採用 (内部 Radix 互換のため貼り替え小)
- **dvh ガタつき緩衝**: 100dvh ベタは iOS で address bar 伸縮のたびに layout reflow が走り bottom sheet が震える。`min(85dvh, 720px)` で物理上限を当てて緩衝
- **Tailwind v4 の `@theme`**: アニメ utility を design token 化できる → 全 Sheet で共通の motion を強制でき、個別 Sheet の差異を抑える ([[pattern/modal-sheet-base-component-3way-close]] の規約強制力を Tailwind 側にも持たせる)

## How to apply

1. Atender 初手で `<Sheet>` を `src/client/components/Sheet.tsx` に置く ([[pattern/modal-sheet-base-component-3way-close]] の規約遵守)
2. `@radix-ui/react-dialog@^1.1.15` を install (react-remove-scroll は trans deps で入る)
3. Tailwind v4 `app/globals.css` に `@theme { --animate-* }` + `@keyframes` を追加
4. 個別 Sheet (ScheduleEditSheet 等) は全て `<Sheet>` を using、close 経路を直接書かない
5. Reviewer は `<Sheet>` 基底に対して **ESC / overlay tap / × button の 3 経路 + focus restore + body scroll lock** をまとめてテスト、個別 Sheet では再検証しない
6. drag-to-dismiss が要件化したら `<Sheet>` 内部を Vaul に貼り替え (Drawer.Root の direction='bottom' + snapPoints)

**やってはいけない (再掲)**:

- `<Sheet>` 祖先に `backdrop-blur` / `transform-gpu` を入れて Portal を使わない
- `100vh` ベタ書き (dvh または `min(Ndvh, Npx)`)
- body scroll lock を自前 `position: fixed` ハックで実装
- footer を absolute / sticky で直書き (flex / grid 構造に統一)
- focus ring を `*-100` 系の薄い tint で済ます ([[pattern/form-modal-readability-bp]])
- Vaul を MVP で先取り採用 (unmaintained コストを取らない)
