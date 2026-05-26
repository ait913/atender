# Atender v4 — Snap 風 design 刷新 (2026-05-26)

## Executive Summary

Phase 4 (v3) で白背景 + 線ベース UI に刷新したが、Touri から「線ベース不可、モーダル裏に行く、Snapchat 風で作り直し」と方針転換。**機能 (今日/時間割/ルーム/友達/Spotify scroll/Friendship/Room/RoomEvent) は完全凍結**、`styles.css` のデザイントークン + 主要コンポーネントの class 構成 + z-index 階層整理のみ実施。

API / Prisma schema / router / route component の I/O は不変。

## 採用したコンセプト

1. **濃いダーク基調**: `#0B0E14` (黒すぎず、深ネイビー寄り)。aisaba 流 grad は廃し、Snap 風の沈んだフラット面 + radial glow
2. **鮮やか単一アクセント**: emerald `#10EB99` (明度上げ)、glow shadow と組み合わせて「光るボタン」表現
3. **大角丸**: `--radius-lg: 24px` / `--radius-xl: 28px`、ボタンは `rounded-full` (pill)
4. **強い影 + glow**: `--shadow-card`, `--shadow-glow`, `--shadow-glow-soft`
5. **大型タッチターゲット**: ボタン min-h 48-56px、アイコンボタン 44-48px
6. **線を最小化**: border は半透明白 (4-12%)、主に面色 (`bg-white/6` 等) で区切る
7. **z-index 階層を CSS variable で集約管理**

## デザイントークン (styles.css の :root)

```css
/* 背景・面 */
--color-bg-base: #0B0E14;
--color-bg-muted: #14181F;
--color-bg-elevated: #1A1F2A;
--color-bg-overlay: rgba(0, 0, 0, 0.72);

/* テキスト */
--color-text-primary: #F5F6F8;
--color-text-secondary: rgba(245, 246, 248, 0.66);
--color-text-tertiary: rgba(245, 246, 248, 0.42);
--color-text-on-accent: #04140C;

/* accent */
--color-accent-500: #10EB99;
--color-accent-600: #34F2A6;
--color-accent-700: #6EF7BD;

/* 角丸 */
--radius-sm: 10px; --radius-md: 18px; --radius-lg: 24px; --radius-xl: 28px;

/* shadow */
--shadow-card: 0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.30);
--shadow-sheet: 0 -16px 48px rgba(0,0,0,0.65), 0 -2px 8px rgba(0,0,0,0.40);
--shadow-popover: 0 12px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.40);
--shadow-glow: 0 0 24px rgba(16,235,153,0.45), 0 0 48px rgba(16,235,153,0.20);
--shadow-glow-soft: 0 0 16px rgba(16,235,153,0.28);
```

既存のセマンティック token 名 (bg-base, bg-muted, bg-elevated, accent-500, status-*, friendship-*, room-*) は **完全保持**。値だけ刷新したので、全コンポーネントが参照する class (`bg-bg-base`, `text-accent-500` 等) は一切書き換え不要。

## z-index 階層 (Touri の「モーダル裏に行く」問題の解消)

```css
--z-base: 0;
--z-card-hover: 10;
--z-bottom-tab: 40;
--z-top-bar: 50;
--z-fab: 60;
--z-popover: 100;
--z-dropdown: 110;
--z-sheet-backdrop: 1000;
--z-sheet-content: 1010;
--z-modal-backdrop: 1100;
--z-modal-content: 1110;
--z-toast: 1200;
```

実装では Tailwind の `z-50` 系を捨て、**arbitrary value で直接 1100/1110 を入れる**運用:
- BottomSheet (overlay 全体): `z-[1100]` (backdrop) + `z-[1110]` (content)
- AvatarMenu PC dropdown: `z-[1100]` (close 用ボタン) + `z-[1110]` (menu)
- BottomTab: `z-40` 維持 (modal の下に潜る)
- TopBar: `z-30` 維持

## 主要コンポーネントの差分

| コンポーネント | 旧 (Phase 4) | 新 (v4) |
|---|---|---|
| `BottomSheet` | `z-50`, `rounded-t-lg`, border 区切り | `z-[1100]/[1110]`, `rounded-t-[28px]`, backdrop-blur, slide-up animation, X ボタンを円形大 |
| `BottomTab` | border-t + 文字 active | 透明背景 + backdrop-blur + active icon は accent bg + glow + scale-up |
| `TopBar` | border-b bg-muted/95 | `bg-bg-base/70` + backdrop-blur-xl + safe-area inset top |
| `AvatarMenu` trigger | `bg-accent-100 text-accent-700` 控えめ | `bg-accent-500 text-fg-on-accent` + glow shadow |
| `AvatarMenu` menu | `rounded-md border` | `rounded-3xl` + shadow-popover + line 区切りを `h-px bg-white/8` に |
| `Button` | `rounded-md border` | `rounded-full` pill + glow on primary + active scale-97 |
| `Input/Select/Textarea` | `border bg-elevated` | `bg-white/6` (線なし) + focus shadow-glow-soft + `rounded-2xl` |
| `Field` label | `text-sm font-medium text-secondary` | `text-xs font-bold uppercase tracking-wide text-tertiary` |
| `Panel` | `border border-subtle` | border 削除、`rounded-3xl` + shadow-card |
| `EmptyState` | border 付き | border 削除、`bg-white/4` |
| `OccurrenceLyricCard` | border + status を accent-50 chip | 大数字 (5xl) 限表記、左 dot で state 可視化、current は scale-105 + shadow-glow |
| `MainAttendanceCTA` | min-h-12 small button | min-h-14 大、accent + glow on primary、個別修正展開時の chip も pill + active scale |
| `FriendCard` | 普通の row | 左に gradient avatar (id hash で色決定) + 大文字名 |
| `RoomCard` | border + chip | gradient overlay 背景 (id hash 色) + glow dot |

## アニメーション (CSS only)

```css
@keyframes sheet-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes overlay-fade-in { from { opacity: 0; } to { opacity: 1; } }
```

BottomSheet 開閉、AvatarMenu トグル、ボタン active scale (`active:scale-97`)、Today カードの state 遷移 (`transition-all duration-500`)。

framer-motion / motion ライブラリ追加なし。

## やらなかったこと (将来検討)

- 左右スワイプタブ遷移 (Snap らしさのキモだが時間コスト大、Phase 5 検討)
- Bitmoji 風キャラクター生成 (既存 mascot は今のところ未使用)
- ライト/ダーク切替 (Snap も常時ダーク基調なので不要、`color-scheme: dark` 固定)
- ハプティック (Web Vibration API、iPhone 移行時)

## ファイル変更一覧

実装で触ったファイル:

- `apps/web/src/styles.css` — design token + z-index variable + animation 全面書き換え
- `apps/web/src/components/sheet/BottomSheet.tsx` — z-index, rounded, animation
- `apps/web/src/components/layout/{BottomTab,TopBar}.tsx` — backdrop-blur + 大 icon active 表現
- `apps/web/src/components/layout/navItems.ts` — icon 字形変更
- `apps/web/src/components/avatar/AvatarMenu.tsx` — z-[1100] + pill avatar trigger
- `apps/web/src/components/ui/{Button,Input,Field,EmptyState}.tsx` — pill / 線なし / 大ラベル
- `apps/web/src/components/today/{OccurrenceLyricCard,MainAttendanceCTA}.tsx` — Spotify scroll カードを Snap 風大型
- `apps/web/src/components/friends/FriendCard.tsx` — gradient avatar
- `apps/web/src/components/rooms/RoomCard.tsx` — gradient overlay + glow dot

機能ファイル (route component, API hook, schema) は一切触らず、token 切替だけで広く色味が変わる構造を意図。

## デプロイ

`atender-web` の Coolify app uuid `y1acaktqgsx66sj81qsxn5m3` のみ再デプロイで反映。API (`atender-api` uuid `tq2lgr4eh6t80r3tkqjbpu7o`) は触らないので不要。
