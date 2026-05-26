# Atender Phase 4 — タブ刷新 + Today UX 全面刷新 + ルーム/フレンド新機能 + アバターメニュー化

設計日: 2026-05-26 / Architect: architect subagent
対象 commit: main (redesign 設計は doc 化済だが実装は未着手の状態を前提)
ベース doc: `.designs/20260513-mvp.md` (Phase 1 MVP, schema 完全形) / `.designs/20260515-redesign.md` (Phase 2-3 redesign + 視認性 token)
Pre-design Research: `.knowledge/03-v3-rooms-friends-research.md` (必読)

---

## Executive Summary

Atender のタブ構造を `今日 / 時間割 / みんなの時間割 / 出席率 / マイページ` (5 タブ) から `今日 / 時間割 / ルーム / 友達` (4 タブ) に刷新し、マイページを右上アバターメニューに格納する。同時に Today 画面を Spotify 歌詞風縦スクロール + 全出席ワンタップ CTA に全面差し替え、時間割入力 UX を複数 chip 選択に変更、フレンド・ルーム (共有カレンダー + 空き時間可視化) を新機能として追加する。

**本 doc は Phase 1 MVP (動作実装済) + Phase 2-3 redesign (設計のみ・未実装) + Phase 4 新要件を統合した正本である**。実装は MVP の `apps/web/src/styles.css` (#02040a 黒背景) + `components/ui.tsx` (旧装飾) から、本 doc 1 本だけで Phase 4 完了状態に到達できる粒度で記述する。

### 主要設計判断 (Architect 確定)

1. **タブ 4 個 + 右上アバター**: bottom tab を 4 個に圧縮。`/templates` `/stats` `/me` をタブから外す。`/me` は廃止しアバターメニュー内で完結、`/templates` `/stats` は独立ページとして残置し導線をアバターメニュー配下のリンクに移す (削除しない、★2 推奨 (A))。
2. **Today 全差し替え**: Spotify lyrics scroll で「今のコマ」を画面中央に固定、過去は薄く上に流れ、未来は下に並ぶ。出欠 chip は OccurrenceCard から撤去し、最上部の `今日は全出席 (N 件)` CTA に集約。CTA は展開すると個別時限の修正 UI (出 / 欠 / 遅 / 早 / 公 / 休 / 未) chip group を表示。
3. **redesign 吸収**: Phase 2 (Penmark 系白背景 + emerald accent + Inter+Noto Sans JP) と Phase 3 (focus ring 視認性 / TimetableGrid 罫線 / MeetingBlock 動的 tint) の design token・コンポーネント仕様を本 doc §2-§5 で再掲し正本化。`.designs/20260515-redesign.md` の §2 / §5 / §P3 から逸脱しない範囲で引用 + Phase 4 差分を上乗せ。
4. **時間割入力**: `periodCount: number` (NumberStepper) を廃止し、`startPeriodIndexes: number[]` (Radix ToggleGroup type="multiple") に変更。フロントは選択された period 配列をそのまま POST、Service 層で連続判定して Meeting 群に分割 (★5)。MeetingCreateInput を破壊変更ではなく **新規入力型 MeetingCreateInputV2** を追加し並存させ、`POST /api/meetings/bulk` を新設 (旧 `POST /api/meetings` は維持、新規 UI は bulk を使う)。
5. **Friendship**: 単一テーブル + `FriendshipStatus enum (PENDING/ACCEPTED/DECLINED/BLOCKED)` で一方向式 (Penmark / LINE 流)。`@@unique([senderId, receiverId])` で同一方向の重複防止、逆方向の同時申請は **Service 層で「相手から既に PENDING を貰っていれば即 ACCEPTED に昇格」** で吸収 (★4)。
6. **Room**: `Room` + `RoomMembership` + `RoomEvent` + enum `RoomRole`。招待は `Room.inviteCode` 直書き (cuid)、再発行で旧無効化、TTL 7 日 (`inviteExpiresAt`)。`RoomInvite` テーブル分離は Phase 5 送り (★5 in research)。`RoomMembership.shareTimetable` は **MVP では schema にも追加しない** (常に共有強制、Phase 5 で opt-in 化検討、★6)。
7. **共有カレンダー + 空き時間**: 1 endpoint `GET /api/rooms/:id/week?weekStart=YYYY-MM-DD` で「全メンバーの該当週 Meeting + 全 RoomEvent + members メタ」を一括返却。「みんなの空き時間」はクライアント側で 7 day × N period の boolean matrix を組んで算出 (★8)。
8. **Spotify lyrics scroll**: `scrollIntoView({block:"center", behavior:"smooth"})` + Tailwind `transition-all` で実装。framer-motion 不要。`onWheel` / `onTouchMove` で手動スクロール検知 → auto scroll OFF → 画面下に「今に戻る」FAB 表示 (★7 / ★9)。
9. **テスト基盤**: Vitest + RTL + jsdom (MVP 既存) を維持。**Spotify scroll の `scrollIntoView` は jsdom で no-op のため、これだけ chrome-devtools MCP の E2E に振る** (★7)。

---

## 1. 既存 doc との関係

### 1.1 本 doc が吸収する範囲

| 元 doc | セクション | 本 doc での扱い |
|---|---|---|
| `20260513-mvp.md` §3 Prisma schema | 全 model | **§5 で差分追加** (User 拡張 + 4 model + 2 enum) のみ記述、既存 model は不変 |
| `20260513-mvp.md` §4 API | 全 endpoint | **§6 で新規 endpoint 追加 + Meeting bulk 新設**、既存 endpoint は不変 |
| `20260513-mvp.md` §8 挙動仕様 | 1-164 | **§7 で追番 200- として Phase 4 仕様を追加**、既存 1-164 は不変 |
| `20260513-mvp.md` §9 テスト基盤 | Vitest/RTL/jsdom/MCP | **§9 で踏襲**、Spotify scroll のみ MCP に振る追加規約 |
| `20260515-redesign.md` §2 Design 言語 | カラー / タイポ / 角丸 / Tailwind config | **§2 で全文再掲して正本化** (実装未着手のため本 doc が一次ソースになる) |
| `20260515-redesign.md` §3 ナビゲーション | 5 タブ前提 | **§3 で 4 タブ + 右上アバターに置換**、5 タブ記述は破棄 |
| `20260515-redesign.md` §4 画面別 | Today/Timetable/Templates/Stats/Me | **§4 で Today 完全差し替え、Timetable は入力 UX 差分、Templates/Stats は導線変更のみ、Me は廃止しアバターメニュー化** |
| `20260515-redesign.md` §5 コンポーネント仕様 | 共通レイアウト + sheet + ドメイン | **§5 で踏襲 + 新規コンポーネント (FriendCard / RoomCard / RoomWeekView / TimetableScroll / MainAttendanceCTA / PeriodChips / AvatarMenu) を追加** |
| `20260515-redesign.md` §P3 視認性 token | Input / Field / BottomSheet / TimetableGrid / MeetingBlock / EmptyCell / PeriodLabel | **§2.6 で踏襲して正本化** (実装未着手のため Phase 4 一次ソース) |

### 1.2 本 doc で破壊変更しないもの

- 既存 Prisma model の field 削除 / rename
- 既存 `POST /api/meetings` `PATCH /api/meetings/:id` `DELETE /api/meetings/:id` の入出力 (Phase 4 では bulk endpoint 追加で対応)
- 既存 `MeetingCreateInput` zod schema (新規 UI は MeetingCreateInputV2 / MeetingBulkCreateInput を使う)
- better-auth テーブル (User/Account/Session/Verification) の field
- Coolify デプロイ構成 (2 service: atender-api + atender-web)

### 1.3 ★1 redesign 実装状況の前提

リポジトリは MVP 状態 (`apps/web/src/styles.css` が `#02040a` 黒背景、`components/ui.tsx` が MVP 装飾) のまま。**Phase 4 の Developer 召集時には、本 doc §2 (Design 言語) と §5 (コンポーネント仕様) を最初に実装すること** = 実質 Phase 2-3 + Phase 4 を 1 PR で完遂する。redesign 単独で実装する PR は作らない。

---

## 2. Design 言語 (Phase 2-3 を吸収・正本化)

`20260515-redesign.md` §2 + §P3.2 をベースに、Phase 4 で必要な追加トークン (Friendship 状態 / Room 系) を上乗せ。

### 2.1 カラートークン (`apps/web/src/styles.css`)

```css
:root {
  /* === surface === */
  --color-bg-base:     #FFFFFF;
  --color-bg-muted:    #F7F7F5;
  --color-bg-elevated: #FFFFFF;
  --color-bg-overlay:  rgba(0, 0, 0, 0.45);

  /* === text === */
  --color-text-primary:   #1C1B1F;
  --color-text-secondary: #5F5E64;
  --color-text-tertiary:  #9CA3AF;
  --color-text-on-accent: #FFFFFF;
  --color-text-on-danger: #FFFFFF;

  /* === border === */
  --color-border-subtle:   #E7E5E0;
  --color-border-default:  #D1D5DB;
  --color-border-emphasis: #9CA3AF;

  /* === accent (Penmark 系ミント, Tailwind emerald-*) === */
  --color-accent-50:  #ECFDF5;
  --color-accent-100: #D1FAE5;
  --color-accent-500: #10B981;
  --color-accent-600: #059669;
  --color-accent-700: #047857;

  /* === status (出欠 6 + 未記録) === */
  --color-status-present:   #10B981;
  --color-status-absent:    #E5535B;
  --color-status-excused:   #3B82F6;
  --color-status-tardy:     #F59E0B;
  --color-status-early:     #A855F7;
  --color-status-cancelled: #9CA3AF;
  --color-status-none:      #D1D5DB;

  /* === friendship / room (Phase 4 追加) === */
  --color-friendship-pending:  #F59E0B;  /* amber */
  --color-friendship-accepted: #10B981;  /* emerald */
  --color-friendship-blocked:  #E5535B;  /* red */
  --color-room-event:          #8B5CF6;  /* purple — Meeting と区別 */
  --color-room-availability-empty: #ECFDF5; /* 全員空きセルのハイライト用 */

  /* === radius === */
  --radius-sm:   6px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-full: 9999px;

  /* === shadow === */
  --shadow-card:  0 1px 2px 0 rgba(0, 0, 0, 0.04), 0 1px 3px 0 rgba(0, 0, 0, 0.06);
  --shadow-sheet: 0 -8px 24px rgba(0, 0, 0, 0.10);
  --shadow-popover: 0 4px 12px rgba(0, 0, 0, 0.10), 0 1px 3px rgba(0, 0, 0, 0.06);

  /* === focus ring (Phase 3 規約) === */
  --focus-ring-color: var(--color-accent-500);
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;

  /* === typography === */
  --font-sans:  "Inter", "Noto Sans JP", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono:  ui-monospace, "SFMono-Regular", "Menlo", monospace;
  --text-xs:    12px;
  --text-sm:    14px;
  --text-base:  15px;
  --text-lg:    17px;
  --text-xl:    20px;
  --text-2xl:   24px;
  --text-3xl:   28px;
  --leading-tight:  1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
}

html, body {
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
}
```

**重要**: `--color-friendship-*` / `--color-room-event` / `--color-room-availability-empty` は **Phase 4 で新規追加**。redesign doc には未記述。

### 2.2 Tailwind 設定 (`apps/web/tailwind.config.ts`)

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--color-bg-base)",
          muted: "var(--color-bg-muted)",
          elevated: "var(--color-bg-elevated)",
          overlay: "var(--color-bg-overlay)",
        },
        fg: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          "on-accent": "var(--color-text-on-accent)",
        },
        border: {
          subtle: "var(--color-border-subtle)",
          default: "var(--color-border-default)",
          emphasis: "var(--color-border-emphasis)",
        },
        status: {
          present: "var(--color-status-present)",
          absent: "var(--color-status-absent)",
          excused: "var(--color-status-excused)",
          tardy: "var(--color-status-tardy)",
          early: "var(--color-status-early)",
          cancelled: "var(--color-status-cancelled)",
          none: "var(--color-status-none)",
        },
        friendship: {
          pending: "var(--color-friendship-pending)",
          accepted: "var(--color-friendship-accepted)",
          blocked: "var(--color-friendship-blocked)",
        },
        room: {
          event: "var(--color-room-event)",
          "availability-empty": "var(--color-room-availability-empty)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        sheet: "var(--shadow-sheet)",
        popover: "var(--shadow-popover)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
      },
    },
  },
} satisfies Config;
```

### 2.3 タイポグラフィ / 余白 / 影

redesign §2.2 / §2.3 を踏襲。

- font load: `<link rel="preconnect">` + Google Fonts (`Inter`, `Noto Sans JP`)、`<link>` を `index.html` に直書き
- 見出し: `font-weight: 700` (page title) / `600` (section)
- 本文: `font-weight: 400`、強調は `600`
- 「`::` サフィックス」装飾は **完全廃止** (Phase 4 でも維持)
- radius 用途: `sm=6`=input / `md=12`=card-button-cell / `lg=16`=sheet 上端 / `full`=chip
- shadow 用途: `shadow-card` を全カード、`shadow-sheet` を bottom sheet 上方向、`shadow-popover` を **Phase 4 新規** で `AvatarMenu` ドロップダウン / `RoomEventDetailPopover` に使用
- spacing: Tailwind デフォルト (4px grid)、section 間 `space-y-5` (20px)、Field 間 `space-y-4` (16px)

### 2.4 マスコット

redesign §2.5 を踏襲。

- `mascot-hello-1024.png` 1 種のみ。表情違いは v1.5 送り。
- 配置: Today 挨拶 (56-72px) / 当日授業ゼロ空状態 (180px) / 404 (180px)
- **Phase 4 で新規追加なし** (キャラクター画像は MVP では追加しない、Touri 制約)

### 2.5 アイコン

`lucide-react` を採用 (redesign §3.1)。Phase 4 で使う追加アイコン:

| Icon | 用途 |
|---|---|
| `Home` | 今日タブ |
| `LayoutGrid` | 時間割タブ |
| `Users` | 友達タブ |
| `UsersRound` | ルームタブ (Users と区別) |
| `UserPlus` | フレンド申請 / メンバー追加 |
| `Check` / `X` | 申請 accept / decline |
| `Ban` / `ShieldX` | block |
| `Link2` / `Copy` | 招待リンクコピー |
| `RotateCw` | 招待コード再発行 |
| `Plus` | event 作成 / 空きセル + |
| `ArrowLeft` | TopBar 戻る |
| `MoreVertical` | カード右上メニュー |
| `LogOut` | アバターメニュー / ログアウト |
| `Settings` | アバターメニュー / 設定 |
| `BarChart3` | アバターメニュー / 出席率 |
| `Search` | アバターメニュー / みんなの時間割 |
| `ChevronDown` | CTA 展開 |
| `MapPin` | 「今に戻る」FAB |
| `Calendar` | RoomEvent |

### 2.6 視認性 token (Phase 3 を吸収)

redesign §P3.2 の token 差分を本 doc で正本化する。

| 対象 | 旧 (MVP) | 新 (本 doc 確定) |
|---|---|---|
| Input focus | `focus:ring-2 focus:ring-accent-100` | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 focus-visible:border-accent-500` |
| Input radius | `rounded-sm` (6px) | `rounded-[10px]` |
| Input height/padding | `min-h-11 px-3` | `min-h-12 px-4` |
| Input text weight | `text-base` | `text-base font-medium` |
| Field label weight/color | `font-semibold` / fg-primary | `font-medium` / fg-secondary |
| Field gap (label/input) | `gap-1.5` | `gap-2` |
| Button focus | (ring 系) | 上記 focus 共通規約、destructive のみ `outline-status-absent` |
| BottomSheet header | `min-h-12` text-base, border なし | `min-h-14 px-5 text-lg font-semibold + border-b border-border-subtle` |
| BottomSheet body | `px-4 pb-4` | `px-5 pb-6 pt-1` |
| BottomSheet handle | `w-6` (24px) | `w-8` (32px) |
| Section spacing 内 sheet | (未規定) | section 間 `space-y-5`、Field 間 `space-y-4`、section divider `pt-5 border-t border-border-subtle` |
| Sticky footer in sheet | (未規定) | `sticky bottom-0 -mx-5 px-5 py-3 border-t border-border-subtle bg-bg-elevated` + safe-area padding |
| TimetableGrid gap / 罫線 | `gap-1` / 罫線なし | `gap-0` + コンテナ `border-t border-l border-border-subtle rounded-md overflow-hidden`、各 cell `border-r border-b border-border-subtle` |
| TimetableGrid 1 列目幅 / row 高 | 48px / 64px | 56px / 72px |
| MeetingBlock 背景 | `bg-emerald-50` 固定 | inline style `background: color-mix(in srgb, ${course.color} 12%, white)` |
| MeetingBlock 文字 | 統一 weight | 授業名 `text-sm font-semibold`、教師/教室 `text-xs font-normal text-fg-secondary` |
| EmptyCell border | `border-dashed` | 撤去、`bg-bg-base hover:bg-bg-muted` + hover 時中央 `Plus` icon opacity 0→60 |
| PeriodLabel | 番号のみ | 番号 (text-base font-semibold) + 時刻 2 段 (text-[10px] font-normal fg-tertiary `H:MM-H:MM`) |

これらは **本 doc 1 つで実装する**: Phase 2-3 を別 PR にしない。

---

## 3. ナビゲーション (4 タブ + 右上アバター)

### 3.1 タブ 4 個 (確定)

| # | アイコン | ラベル | route | 役割 |
|---|---|---|---|---|
| 1 | `Home` | 今日 | `/` | Spotify scroll + 全出席 CTA |
| 2 | `LayoutGrid` | 時間割 | `/timetable` | 週グリッド CRUD (入力 chip UX) |
| 3 | `UsersRound` | ルーム | `/rooms` | ルーム一覧 + 詳細 (共有カレンダー + 空き時間) |
| 4 | `Users` | 友達 | `/friends` | 友達一覧 + 申請 + ブロック |

旧 5 タブ案 (`/templates` `/stats` `/me`) は **タブから外す**。

### 3.2 タブから外れたページの行き先

| 旧タブ | 新導線 |
|---|---|
| `/templates` (みんなの時間割) | アバターメニュー > 「みんなの時間割」リンク → 既存 `/templates` ページに遷移 (ページは残置) |
| `/stats` (出席率) | アバターメニュー > 「出席率を見る」リンク → 既存 `/stats` ページに遷移 (ページは残置) |
| `/me` (マイページ) | **route 廃止**。`/me` を踏んだら `/` に redirect。設定機能 (学校 / 学科 / 出欠ルール / 学期 / ログアウト等) は全てアバターメニュー直下の dropdown / drawer 内に詰める。プロフィール詳細編集は `<ProfileEditSheet>` を menu からトリガー |

★2 確定: **(A) `/templates` `/stats` は独立 page として残置、導線をアバターメニュー経由に変更**。理由: 既存ページの実装をそのまま使えて MVP スコープを最小化、Phase 5 で「ルーム内の時間割比較」を追加するときに `/templates` をルーム内へ統合する余地を残せる (★3 の (A) 案と整合)。

### 3.3 ルートツリー (TanStack Router code-defined)

```
__root        (RootLayout: SessionGuard + SetupGuard)
├── /signin   (AuthLayout)
├── /verify   (AuthLayout)
├── /setup    (AuthLayout)
├── /me       → redirect("/")     (旧 route を破棄する受け皿)
└── /         (AppLayout: TopBar + AvatarMenu + Outlet + BottomTab/SideNav)
    ├── /            → Today.tsx
    ├── /timetable   → Timetable.tsx
    ├── /rooms       → Rooms.tsx          (一覧)
    ├── /rooms/$id   → RoomDetail.tsx     (詳細・カレンダー・空き時間)
    ├── /rooms/join/$inviteCode → JoinRoom.tsx (招待リンク経由)
    ├── /friends     → Friends.tsx
    ├── /templates   → Templates.tsx      (タブ外、アバターメニューから到達)
    └── /stats       → Stats.tsx          (タブ外、アバターメニューから到達)
```

`router.tsx` で code-defined route 再定義。MVP の `Home.tsx` / `Settings.tsx` をリネーム (`Today.tsx` / 削除して AvatarMenu に分割)。

### 3.4 レイアウト

#### モバイル (`< 768px`)

```
┌──────────────────────────────┐
│ ロゴ              [Avatar]   │  TopBar (h-12, bg-bg-muted)
│                              │  ← 右上アバター (40x40 rounded-full)
├──────────────────────────────┤
│                              │
│  <Outlet />                  │
│  (scrollable, min-h-dvh-128) │
│                              │
├──────────────────────────────┤
│ 今日 時間割 ルーム 友達       │  BottomTab (h-14 + safe-area)
└──────────────────────────────┘
```

- TopBar: 左ロゴ (Atender, text-lg font-semibold)、右上アバター only (タイトルは各ページ内で大見出しとして表示)
- BottomTab: 4 等分 `flex-1`、各 NavItem `min-h-14`、アクティブ判定 `useRouterState` で `location.pathname`
- アクティブ表現: icon fill + ラベル emerald + 太字 + 上端 2px emerald indicator bar
- 仮想キーボード時: `useIsKeyboardOpen()` (`visualViewport.height < window.innerHeight - 100`) で `hidden`

#### デスクトップ (`>= 768px`)

```
┌──────┬───────────────────────┐
│ Logo │ TopBar     [Avatar]   │
│      ├───────────────────────┤
│ 今日 │                       │
│ 時間 │   <Outlet />          │
│ 割   │   (max-w-[960px])     │
│ ルム │                       │
│ 友達 │                       │
└──────┴───────────────────────┘
```

- 左 SideNav 240px、上端ロゴ + 4 ナビ縦並び。bottom には何も置かない (アバターは TopBar 右上に常駐)
- 右側コンテンツ `max-w-[960px] mx-auto px-6`

#### 認証 / Setup
- `/signin` `/verify` `/setup` は `<AuthLayout>` (bottom tab / sidebar / avatar 全部非表示、上端ロゴだけ small)

### 3.5 右上アバターメニュー

`<AvatarMenu>` は **PC=Radix DropdownMenu / モバイル=Vaul Drawer** の出し分けを `useMediaQuery("(max-width: 767px)")` で行う。

#### Trigger (両プラットフォーム共通)

- 40x40 `rounded-full`、`<img src={me.image ?? fallback}>` または initial circle (name first letter)
- 右上未読バッジ: PENDING friendship count > 0 のとき 16x16 emerald dot を右上に absolute 配置
- 押下時の focus ring: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500`

#### Desktop (Radix `<DropdownMenu>`)

```
                          ┌─────────────────────────┐
[Avatar]  ───tap────▶     │ ● Touri Aida            │
                          │ touri1705@outlook.com   │
                          ├─────────────────────────┤
                          │ 🏫 学校・学科           │
                          │ ⚙ 出欠ルール             │
                          │ 📅 学期管理             │
                          ├─────────────────────────┤
                          │ 📊 出席率を見る         │
                          │ 🔍 みんなの時間割       │
                          ├─────────────────────────┤
                          │ ↩ ログアウト            │
                          └─────────────────────────┘
                          align="end" sideOffset=8
                          shadow-popover rounded-md
```

#### Mobile (Vaul `<Drawer>`)

```
┌──────────────────────────────┐
│      ━                       │  grip handle (w-8 h-1 bg-border-default)
│  ● Touri Aida                │
│  touri1705@outlook.com       │
├──────────────────────────────┤
│  🏫 学校・学科                │
│  ⚙ 出欠ルール                 │
│  📅 学期管理                  │
├──────────────────────────────┤
│  📊 出席率を見る              │
│  🔍 みんなの時間割            │
├──────────────────────────────┤
│  ↩ ログアウト                 │
└──────────────────────────────┘
```

bottom sheet として下から slide-up、backdrop click / ESC / drag-to-dismiss で閉じる。

#### メニュー項目挙動 (両プラットフォーム共通)

| 項目 | 挙動 |
|---|---|
| (header) 名前 + email | non-clickable、`me` を表示 |
| 学校・学科 | `<SchoolDeptEditSheet>` (BottomSheet) を open。中身は SchoolPicker + DepartmentPicker、保存で `PATCH /api/me` |
| 出欠ルール | `<AttendanceRuleSheet>` を open (MVP の 3 status × 5 strategy グリッド) |
| 学期管理 | `<SemesterListSheet>` を open。一覧 + 作成 + 編集 + 削除 |
| 出席率を見る | `useNavigate({ to: "/stats" })` で /stats へ遷移 |
| みんなの時間割 | `useNavigate({ to: "/templates" })` で /templates へ遷移 |
| ログアウト | `POST /api/auth/sign-out` → `queryClient.clear()` → /signin に navigate |

---

## 4. 画面別仕様

### 4.1 Today (`/`, `Today.tsx`) — Spotify lyrics scroll + 全出席 CTA

#### モック (モバイル)

```
┌────────────────────────────────┐
│ Atender              [Avatar]  │  TopBar
├────────────────────────────────┤
│ [🦉] 5月26日(火)               │  挨拶 (sticky スクロールに付いてこない)
│      こんにちは Touri さん     │
│                                │
│ ╔══════════════════════════════╗
│ ║ 今日は全出席 (3 件)       ▾ ║│  MainAttendanceCTA (sticky top)
│ ║                              ║│  default: 一発 CTA
│ ╚══════════════════════════════╝
│                                │  ←展開: 全 occurrence × chip group
│  ┌──────────────────────────┐  │  ←(後述)
│  │ 1限                      │  │
│  │ オペレーティングシステム  │  │  ← past, opacity-30 scale-90
│  │ 305                      │  │
│  └──────────────────────────┘  │
│                                │
│  ┌──────────────────────────┐  │  ← current, opacity-100 scale-105
│  │ ▌ 2限                    │  │    ring-2 ring-accent-500 font-bold
│  │ ▌ プログラミング演習      │  │    画面中央に常駐
│  │ ▌ 401                    │  │
│  └──────────────────────────┘  │
│                                │
│  ┌──────────────────────────┐  │  ← future, opacity-70
│  │ 3限                      │  │
│  │ データベース論            │  │
│  │ 302                      │  │
│  └──────────────────────────┘  │
│  ...                           │
│                                │
│           [↑今に戻る]          │  ← 手動 scroll 時のみ
├────────────────────────────────┤
│ 今日 時間割 ルーム 友達        │
└────────────────────────────────┘
```

#### 構成要素

1. **挨拶ヘッダ** (`<TodayGreeting>`): 静的、最上部 1 回だけ。マスコット 56px + `M月D日(曜)` text-2xl + `こんにちは ${me.name ?? 'こんにちは'}さん` text-sm fg-secondary。`<Today.tsx>` で `<header>` 配置、`overflow-hidden` の scroll 領域より上に置く。

2. **MainAttendanceCTA** (`<MainAttendanceCTA>`): sticky top で挨拶の下に固定。
   - 未記録 N > 0 のとき: `今日は全出席 (N 件)` を primary button (full width)
   - 未記録 0 のとき: `本日の記録は完了済` を success state (チェックアイコン + emerald 文字)、disabled 風
   - 右側に `<ChevronDown>` icon。tap で展開トグル
   - 展開時: 全 occurrence を縦並びで列挙、各行に Course name + period label + `<StatusChipGroup>` (7 chip: 出 / 欠 / 遅 / 早 / 公 / 休 / 未)
   - chip tap → `POST /api/attendance/:occurrenceId` (or 未 = `DELETE`)、optimistic update、エラー時 rollback + toast

3. **TimetableScroll** (`<TimetableScroll>`): Spotify lyrics scroll コンポーネント。
   - 当日の全 `MeetingOccurrence` を `startMinute` 昇順で並べる
   - 連続コマも **occurrence 単位で別カード** (period 2 連続 = 2 カード並ぶ)。Today では「2-3限まとめ表示」しない (Spotify 1 行 = 1 occurrence、redesign の `mergedTitle` 設計は Phase 4 で破棄)
   - 各 OccurrenceLyricCard の表示情報: **何限 / 授業名 / 教室番号** のみ (教師は表示しない、Touri 原文の「3 情報だけ」要望に従う)
   - 時刻は補助情報として period number の下に小さく出す (`text-xs fg-tertiary`、`H:MM-H:MM`)
   - 状態判定:
     - `past`: occurrence.endMinute < now → `opacity-30 scale-90 -translate-y-2`
     - `current`: occurrence.startMinute <= now <= occurrence.endMinute + 5min (5 分グレース) → `opacity-100 scale-105 font-bold ring-2 ring-accent-500 bg-bg-elevated shadow-card`
     - `future`: now < occurrence.startMinute → `opacity-70 scale-100`
     - `between` (休み時間): 直前 occurrence.end < now < 直後 occurrence.start → 直後を `current` 扱い (次のコマを中央表示)、ただし `ring` は出さず `border-l-4 border-accent-500` のみで「次のコマ」感を出す
   - 共通: `transition-all duration-500 ease-out snap-center py-6`
   - container: `<ul>` + `snap-y snap-mandatory overflow-y-auto h-[calc(100dvh-...))]`、`scroll-padding-block: 40% 40%`

4. **auto-scroll**: `useEffect(() => { ... }, [activeIndex, isManualScroll])`
   - `containerRef.current.children[activeIndex].scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" })`
   - `isManualScroll === true` のときは何もしない
   - `useNow(60_000)` (1 分 polling) で current 判定を再計算

5. **手動スクロール検知**: `onWheel` / `onTouchMove` ハンドラで `setIsManualScroll(true)`
   - `scrollIntoView` の smooth scroll 自体は `onWheel` を発火しない (Chromium 系で確認、★7)
   - 念のため `e.deltaY` が 0 でないときだけ flag を立てる (smooth scroll の補間で 0 deltaY が来た場合をスキップ)

6. **「今に戻る」FAB** (`<ReturnToNowFAB>`): `isManualScroll === true` のとき、画面下中央 (bottom-tab の 16px 上) に sticky 表示
   - `<button className="rounded-full bg-accent-500 text-white shadow-card px-4 py-2 inline-flex items-center gap-1.5">` + `<MapPin size={16}/>` + `今に戻る`
   - tap → `setIsManualScroll(false)` → useEffect が auto-scroll を再開

7. **当日授業 0 件** (`<EmptyState>`): マスコット 180px + `今日は授業がありません` + 「時間割を見る」リンクで /timetable へ

8. **未取得 / 失敗**: `useTodayOccurrences()` の `isLoading` で skeleton (3 card placeholder)、`isError` で error state + retry ボタン

#### Today.tsx 構造 (擬似コード)

```tsx
function Today() {
  const { data: me } = useMe();
  const { data: occurrences, isLoading } = useTodayOccurrences();
  const now = useNow(60_000);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [isManualScroll, setIsManualScroll] = useState(false);
  const containerRef = useRef<HTMLUListElement>(null);

  const activeIndex = useMemo(() => {
    if (!occurrences) return -1;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const idx = occurrences.findIndex(
      (o) => o.startMinute <= nowMin && nowMin <= o.endMinute + 5
    );
    if (idx >= 0) return idx;
    const next = occurrences.findIndex((o) => o.startMinute > nowMin);
    return next >= 0 ? next : occurrences.length - 1;
  }, [occurrences, now]);

  useEffect(() => {
    if (isManualScroll) return;
    const el = containerRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
  }, [activeIndex, isManualScroll, prefersReducedMotion]);

  const handleManualScroll = (e: WheelEvent | TouchEvent) => {
    if (("deltaY" in e && e.deltaY !== 0) || "touches" in e) setIsManualScroll(true);
  };

  const unrecorded = occurrences?.filter((o) => o.status == null) ?? [];

  return (
    <div className="flex flex-col h-dvh">
      <TodayGreeting me={me} />
      <MainAttendanceCTA
        unrecordedCount={unrecorded.length}
        occurrences={occurrences ?? []}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      <ul
        ref={containerRef}
        className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-pt-[40%] scroll-pb-[40%]"
        onWheel={handleManualScroll}
        onTouchMove={handleManualScroll}
      >
        {occurrences?.map((o, i) => (
          <OccurrenceLyricCard
            key={o.id}
            occurrence={o}
            state={i < activeIndex ? "past" : i === activeIndex ? "current" : "future"}
          />
        ))}
      </ul>
      {isManualScroll && <ReturnToNowFAB onClick={() => setIsManualScroll(false)} />}
    </div>
  );
}
```

### 4.2 Timetable (`/timetable`, `Timetable.tsx`)

redesign §4.2 ベース + Phase 4 の入力 UX 差分。

#### 画面構造はそのまま (redesign §4.2)

- CSS Grid 週ビュー、空きセル tap で `<MeetingCreateSheet>`、既存セル tap で `<MeetingDetailSheet>` (詳細 + 編集 + 削除)
- 学期切替 select、時限数編集 (`<TimetableSettingsSheet>`)
- redesign §P3 の罫線 / MeetingBlock 動的 tint / PeriodLabel 2 段 を踏襲

#### Phase 4 差分: `<MeetingCreateSheet>` の入力 UX

旧 (redesign §4.2):
- 「連続コマ数 1-8」NumberStepper
- 単一 dayOfWeek + 単一 startPeriodIndex + periodCount

新 (Phase 4):
- 「連続コマ数」NumberStepper を **完全廃止**
- `<PeriodChips>` (Radix ToggleGroup type="multiple") を 1 つ配置、複数の period を選択可能
- 1 sheet 内で 1 dayOfWeek (曜日 select) + N startPeriodIndexes (chip 配列) を入力
- 保存時に backend へ `{ dayOfWeek, startPeriodIndexes: [1,2,4] }` を渡し、Service 層で連続判定 → Meeting 群を一括 INSERT (★5)

```
┌──────────────────────────────┐
│      ━                       │
├──────────────────────────────┤
│  授業を追加            ×     │
├──────────────────────────────┤
│  科目                        │
│  [既存 Course select ▾]      │
│  または [+ 新規作成]          │
│                              │
│  曜日                        │
│  [月 ▾]                      │
│                              │
│  時限 (複数選択可)            │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐    │
│  │1 │ │2 │ │3 │ │4 │ │5 │    │
│  └──┘ └──┘ └──┘ └──┘ └──┘    │  ← Radix ToggleGroup
│  ┌──┐ ┌──┐ ┌──┐                │   選択中: bg-accent-500 text-white
│  │6 │ │7 │ │8 │                │   未選択: border border-border-default
│  └──┘ └──┘ └──┘                │
│                              │
│  選択: 1限・2限・4限          │  ← preview (連続/単独表示)
│  → 1-2限 (2 連続) + 4限 (単独) │
│                              │
├──────────────────────────────┤
│  [キャンセル] [保存]          │  sticky footer
└──────────────────────────────┘
```

#### `<PeriodChips>` 仕様

```tsx
type Props = {
  value: number[];                  // [1, 2, 4]
  onChange: (next: number[]) => void;
  periodCount: number;              // DaySlot 数 (1-12 動的)
  disabled?: boolean;
};

// 構造:
// <ToggleGroup.Root type="multiple" value={value.map(String)} onValueChange={(v) => onChange(v.map(Number).sort())}>
//   {Array.from({length: periodCount}, (_, i) => i + 1).map(p => (
//     <ToggleGroup.Item key={p} value={String(p)} aria-label={`${p}限`}>{p}</ToggleGroup.Item>
//   ))}
// </ToggleGroup.Root>
```

className 規約:
- root: `flex flex-wrap gap-2`
- item 共通: `inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-medium transition`
- 未選択: `border-border-default text-fg-primary bg-bg-base`
- 選択時 (data-state=on): `border-transparent bg-accent-500 text-fg-on-accent`
- focus: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500`
- disabled: `opacity-50 cursor-not-allowed`

#### preview 表示 (連続判定の見える化)

選択値 `[1,2,4]` に対して preview `1-2限 (2 連続) + 4限 (単独)` を表示。

```tsx
function groupPeriods(periods: number[]): Array<{start: number; count: number}> {
  if (periods.length === 0) return [];
  const sorted = [...periods].sort((a, b) => a - b);
  const groups: Array<{start: number; count: number}> = [];
  let start = sorted[0], count = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) count++;
    else { groups.push({ start, count }); start = sorted[i]; count = 1; }
  }
  groups.push({ start, count });
  return groups;
}

function renderPreview(groups) {
  return groups.map((g) =>
    g.count === 1 ? `${g.start}限 (単独)` : `${g.start}-${g.start + g.count - 1}限 (${g.count}連続)`
  ).join(" + ");
}
```

#### `<MeetingDetailSheet>` (既存セル tap)

redesign §4.2 ママ。1 Meeting (= 連続 N 限の塊) を表示 + 編集 + 削除。Phase 4 では編集時も `<PeriodChips>` UX で同じ。`PATCH /api/meetings/:id` は単一 Meeting の startPeriodIndex / periodCount を変えるだけ (旧 schema 維持)。**chip で複数 group に分割する操作は edit では出来ない、create のみ**。

### 4.3 Rooms (`/rooms` + `/rooms/$id`)

#### `/rooms` (一覧)

```
┌────────────────────────────────┐
│ ルーム                [Avatar] │
├────────────────────────────────┤
│ [+ ルームを作成] [リンクで参加]│  ← top action 2 button
├────────────────────────────────┤
│  ┌──────────────────────────┐  │
│  │ ● TC0701 木曜班           │  │
│  │ メンバー 4 人              │  │
│  │ 直近: 5/30 13:00 「打合せ」│  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ ● サークル                 │  │
│  │ メンバー 8 人              │  │
│  └──────────────────────────┘  │
│                                │
│  (まだルームに参加していない時) │
│  [🦉]                          │
│  ルームに参加すると            │
│  友達の時間割と予定が見えます  │
│  [+ ルームを作成]              │
├────────────────────────────────┤
│ 今日 時間割 ルーム 友達        │
└────────────────────────────────┘
```

- `useRooms()` で `GET /api/rooms` を fetch (自分が membership を持つ Room 一覧)
- 各 `<RoomCard>` tap で `/rooms/${id}` へ遷移
- 「+ ルームを作成」 → `<RoomCreateSheet>` (name + description) → `POST /api/rooms`
- 「リンクで参加」 → `<JoinByCodeSheet>` (inviteCode を貼り付ける input) → `POST /api/rooms/join { inviteCode }`
- empty state: 0 件のとき中央にマスコット + 説明 + 「+ ルームを作成」CTA

#### `/rooms/$id` (詳細)

```
┌────────────────────────────────┐
│ ← TC0701 木曜班      [⋮][Avatar]│  TopBar (戻る + メニュー + Avatar)
├────────────────────────────────┤
│ [今週] [みんなの空き] [メンバー] │  inline tab (3 tab)
├────────────────────────────────┤
│  (今週 tab)                    │
│  < 5/26 (月) - 6/1 (日) >      │  week navigator
│  ┌────────────────────────────┐│
│  │   月 火 水 木 金 土 日     ││
│  │ 1 OS    DB                ││  WeekGrid
│  │ 2 OS    DB     [打合せ]   ││  (own Meeting + room event)
│  │ 3       演習              ││
│  │ ...                        ││
│  └────────────────────────────┘│
│                                │
│  [+ 予定を追加]                 │
├────────────────────────────────┤
│  (みんなの空き tab)            │
│  ┌────────────────────────────┐│
│  │   月 火 水 木 金 土 日     ││
│  │ 1 ░░ ▓▓ ██ ░░ ░░ ██ ██    ││  ヒートマップ
│  │ 2 ░░ ▓▓ ▓▓ ██ ░░ ██ ██    ││  (color opacity = 空きメンバー比率)
│  │ ...                        ││  ██ = 全員空き (room-availability-empty bg)
│  └────────────────────────────┘│
│  3/4 人空きセルを表示中 [▾]    │
├────────────────────────────────┤
│  (メンバー tab)                │
│  ● Touri Aida (owner)          │
│  ● Tanaka Hanako               │
│  ● Sato Taro                   │
│  ...                           │
│  [招待リンクをコピー] [再発行] │  owner のみ
│  ［退室］                      │  member のみ
└────────────────────────────────┘
```

3 inline tab (`RoomDetailTab = "week" | "availability" | "members"`) は URL search param `?tab=week` で同期。デフォは `week`。

##### 「今週」tab (RoomWeekView)

- API: `GET /api/rooms/:id/week?weekStart=2026-05-25` 1 回
- レスポンスから week × period の Grid を組む
- セル内表示優先順:
  1. RoomEvent (period 範囲に被るもの) → purple (`bg-room-event` 系) で表示、tap で `<RoomEventDetailSheet>`
  2. 自分の Meeting → MeetingBlock と同じ動的 tint (course.color)
  3. 他メンバーの Meeting → fg-tertiary の薄表示 + 「N 人」バッジ (重なる場合)
- 「+ 予定を追加」 → `<RoomEventCreateSheet>` (title / start / end / isAllDay) → `POST /api/rooms/:id/events`
- 週 navigator: `<` `>` button で前後 1 週、`今週` button で `dayjs().startOf("week")` に戻す

##### 「みんなの空き」tab (RoomAvailabilityHeatmap)

- `GET /api/rooms/:id/week` の同じレスポンスをクライアントで集計
- 7 days × N periods (N = `DaySlot.length` の max。各メンバーの DaySlot 数が違う場合は ★算出ロジック参照) の boolean matrix を組む

```ts
// member.busy[dayOfWeek][periodIndex] = true if Meeting or RoomEvent overlaps
type Member = { userId: string; busy: boolean[][] };

function computeAvailability(members: Member[], days: number, periods: number) {
  const free = Array.from({ length: days }, () => new Int8Array(periods));
  for (let d = 0; d < days; d++) {
    for (let p = 0; p < periods; p++) {
      let count = 0;
      for (const m of members) if (!m.busy[d]?.[p]) count++;
      free[d][p] = count;
    }
  }
  return free; // free[d][p] = 空いている人数 (0..members.length)
}
```

- セルの背景透明度 = `free[d][p] / members.length`、accent-500 のグラデで濃淡
- 全員空きセル (`free === members.length`) は `bg-room-availability-empty` (`#ECFDF5`) + `border border-accent-500` で強調
- セル tap → tooltip / popover で「空き: Touri, Tanaka / 埋まり: Sato」リストを出す (Radix Popover、shadow-popover)
- 「3/4 人空きセルを表示中 [▾]」: filter dropdown で `>=2 人` `>=3 人` `全員` のしきい値変更 (UI 側のみ、再 fetch なし)

##### 期間表示の正規化 (Meeting vs RoomEvent)

- Meeting (相対): `dayOfWeek (0-6) + startPeriodIndex + periodCount` → DaySlot 経由で `startMinute / endMinute` を解決
- RoomEvent (絶対): `start: DateTime / end: DateTime` → JST 換算で `date / startMinute / endMinute` を抽出
- どちらも `(dayOfWeek, period_range)` セットに正規化してから busy matrix に書き込む
- RoomEvent が period grid に収まらない場合 (例: 早朝 / 深夜): availability では除外しつつ WeekGrid 側だけ「+ 終日」「+ N 件」バッジで表示

##### 「メンバー」tab

- `GET /api/rooms/:id/members` (week endpoint と分離、軽量)
- 一覧表示: avatar + name + role (OWNER / MEMBER)
- OWNER 用 action:
  - 「招待リンクをコピー」: `https://${origin}/rooms/join/${room.inviteCode}` を clipboard
  - 「招待コードを再発行」: `POST /api/rooms/:id/invite` → 新 inviteCode 返却、UI に新リンク反映、旧リンクは即座に無効
  - メンバー横の `×` button: `DELETE /api/rooms/:id/members/:userId` (owner のみ、自分は削れない)
  - 「ルーム名を編集」: `<RoomEditSheet>` → `PATCH /api/rooms/:id`
  - 「ルームを削除」: `<ConfirmDialog>` → `DELETE /api/rooms/:id` (cascade で membership / event 全消し)
- MEMBER 用 action:
  - 「退室」: `<ConfirmDialog>` → `POST /api/rooms/:id/leave`
  - 自分の名前以外には menu 出さない

#### `/rooms/join/$inviteCode` (招待リンク経由)

- mount 時に `me` 取得済かチェック。未認証なら `/signin?redirect=/rooms/join/${inviteCode}` へ
- mount 時に `POST /api/rooms/join { inviteCode }` を発行
- 成功 → `/rooms/${roomId}` へ replace navigate (履歴に join URL を残さない)
- 失敗:
  - `404 INVITE_NOT_FOUND` → 「招待リンクが無効です」+ /rooms へ戻るボタン
  - `410 INVITE_EXPIRED` → 「招待リンクの期限が切れています」+ 同上
  - `409 ALREADY_MEMBER` → そのまま `/rooms/${roomId}` へ replace (エラー扱いせず、UX 上は join 成功と同等)

### 4.4 Friends (`/friends`, `Friends.tsx`)

```
┌────────────────────────────────┐
│ 友達                  [Avatar] │
├────────────────────────────────┤
│ [+ 友達を追加]                  │  → <AddFriendSheet>
├────────────────────────────────┤
│  (申請が来ているとき)            │
│  ━━ 受信した申請 (2) ━━         │
│  ┌──────────────────────────┐  │
│  │ ● Tanaka Hanako           │  │
│  │ @tanaka                   │  │
│  │     [承認] [拒否]         │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ ● Sato Taro    [承認][拒否]│  │
│  └──────────────────────────┘  │
│                                │
│  (送信中)                       │
│  ━━ 送信した申請 (1) ━━         │
│  ┌──────────────────────────┐  │
│  │ ● Yamada Ken              │  │
│  │ @yamada    申請中    [取消]│  │
│  └──────────────────────────┘  │
│                                │
│  ━━ 友達 (5) ━━                │
│  ┌──────────────────────────┐  │
│  │ ● Touri Aida              │  │
│  │ @touri              [⋮]   │  │
│  └──────────────────────────┘  │
│  ...                           │
│                                │
│  (empty state)                  │
│  [🦉] まだ友達がいません        │
│  ハンドル検索 or リンクで追加  │
├────────────────────────────────┤
│ 今日 時間割 ルーム 友達        │
└────────────────────────────────┘
```

#### 各セクション

1. **受信した申請** (status=PENDING, receiverId=me): 上部に件数つきで表示、各行 `[承認]` `[拒否]` button
2. **送信した申請** (status=PENDING, senderId=me): 中段、`[取消]` button のみ
3. **友達一覧** (status=ACCEPTED): 下段
4. **ブロック中** (status=BLOCKED, senderId=me): デフォは非表示、「ブロック中 (N) ▾」accordion で展開可
5. 友達横の `[⋮]` menu: 「ブロックする」「友達を解除」

#### `<AddFriendSheet>`

```
┌──────────────────────────────┐
│  友達を追加             ×    │
├──────────────────────────────┤
│  ハンドル検索                 │
│  [@____________________]      │
│  (300ms debounce, 結果リスト) │
│                              │
│  または                       │
│                              │
│  招待リンクを送る             │
│  https://atender.appily.run/  │
│   friends/add/abc123def        │
│  [リンクをコピー]              │
│                              │
│  招待リンクで追加              │
│  [____________] [追加]         │
└──────────────────────────────┘
```

- 「ハンドル検索」: `<input>` + 300ms debounce + `GET /api/users/search?handle=` → 結果 10 件まで `<ul>`、各行 tap で `POST /api/friendships { receiverHandle: "@..." }`
- 「招待リンクを送る」: `https://${origin}/friends/add/${me.inviteCode}` を clipboard
- 「招待リンクで追加」: 招待リンク末尾の inviteCode を input に貼って `POST /api/friendships { receiverInviteCode: "..." }`

#### `/friends/add/$inviteCode` (招待リンク経由、★ route 追加)

```
__root
└── /friends/add/$inviteCode → AddFriendByInviteCode.tsx
```

- mount 時に `me` 取得済かチェック、未認証なら `/signin?redirect=/friends/add/${inviteCode}` へ
- mount 時に `POST /api/friendships { receiverInviteCode: inviteCode }` を発行
- 成功 → `/friends` へ replace navigate + toast「申請を送りました」
- 失敗 (404 USER_NOT_FOUND / 409 ALREADY_FRIEND など) → エラーメッセージ + `/friends` へ戻る button

---

## 5. データモデル (Prisma schema delta)

既存 MVP schema (`apps/api/prisma/schema.prisma`) に **追加のみ**。破壊変更なし。

### 5.1 User model 拡張

```prisma
model User {
  // 既存 fields はそのまま
  id            String    @id
  email         String    @unique
  // ... (省略、MVP doc §3 のまま) ...

  // === Phase 4 追加 ===
  handle      String? @unique         // 検索用 ID (例 "touri")、null 可
  inviteCode  String  @unique @default(cuid())  // 自分の友達招待リンク用 (不変)
  // (handle の null=未設定、ユーザー設定で後付け可)

  // === Phase 4 back-relations ===
  sentFriendships     Friendship[]     @relation("FriendshipSender")
  receivedFriendships Friendship[]     @relation("FriendshipReceiver")
  createdRooms        Room[]           @relation("RoomCreatedBy")
  roomMemberships     RoomMembership[]
  authoredRoomEvents  RoomEvent[]      @relation("RoomEventAuthor")
}
```

`inviteCode` は **migration で既存 User に backfill 必須** (cuid 自動生成は新規 row のみ。Prisma の `@default` は migration では evaluate されない)。

Migration ファイル:

```sql
-- migrations/20260526120000_phase4_init/migration.sql
ALTER TABLE "User" ADD COLUMN "handle" TEXT;
ALTER TABLE "User" ADD COLUMN "inviteCode" TEXT;
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- backfill inviteCode for existing users (cuid like)
UPDATE "User" SET "inviteCode" = lower(hex(randomblob(12))) WHERE "inviteCode" IS NULL;

-- Make inviteCode NOT NULL after backfill
-- SQLite では ALTER COLUMN NOT NULL を直接出来ないので、table 再作成は避け、
-- アプリ層で「inviteCode が null の User は存在しない」前提を維持する
-- (Prisma schema 上は NOT NULL、SQLite 物理上は backfill 済みなので問題なし)
```

`prisma migrate dev --create-only` で生成後、`Migration.sql` を上記内容に手動編集。Reviewer が migration ファイル存在を assert。

### 5.2 Friendship

```prisma
enum FriendshipStatus {
  PENDING
  ACCEPTED
  DECLINED
  BLOCKED
}

model Friendship {
  id         String           @id @default(cuid())
  senderId   String
  sender     User             @relation("FriendshipSender", fields: [senderId], references: [id], onDelete: Cascade)
  receiverId String
  receiver   User             @relation("FriendshipReceiver", fields: [receiverId], references: [id], onDelete: Cascade)
  status     FriendshipStatus @default(PENDING)
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt
  acceptedAt DateTime?

  @@unique([senderId, receiverId])
  @@index([receiverId, status])
  @@index([senderId, status])
}
```

- `senderId != receiverId` は **CHECK 制約は使わず Service 層で validate** (SQLite の CHECK が Prisma で素直に書けないため)
- `BLOCKED` 状態のとき: `senderId = blocker, receiverId = blocked` の意味。逆向きの行 (`blocked → blocker`) は存在しても自動で hide
- 自分を block する行は Service で reject

### 5.3 Room

```prisma
enum RoomRole {
  OWNER
  MEMBER
}

model Room {
  id              String   @id @default(cuid())
  name            String
  description     String?
  inviteCode      String   @unique @default(cuid())
  inviteExpiresAt DateTime?
  createdByUserId String
  createdBy       User     @relation("RoomCreatedBy", fields: [createdByUserId], references: [id], onDelete: Cascade)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  memberships RoomMembership[]
  events      RoomEvent[]

  @@index([createdByUserId])
}

model RoomMembership {
  id       String   @id @default(cuid())
  roomId   String
  room     Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role     RoomRole @default(MEMBER)
  joinedAt DateTime @default(now())

  @@unique([roomId, userId])
  @@index([userId])
  @@index([roomId])
}

model RoomEvent {
  id          String   @id @default(cuid())
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  authorId    String
  author      User     @relation("RoomEventAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  title       String
  description String?
  start       DateTime
  end         DateTime
  isAllDay    Boolean  @default(false)
  color       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([roomId, start])
  @@index([authorId])
}
```

- `Room.inviteCode`: 招待用 unique cuid、再発行は新 cuid で UPDATE
- `Room.inviteExpiresAt`: 7 日後 (`dayjs().add(7, 'day').toDate()`)、null は「期限なし」(Phase 5 で使う、MVP では常に 7 日 set)
- `RoomMembership` の `OWNER` は **Room 作成者 1 人**、Phase 4 では譲渡なし
- `RoomEvent.isAllDay = true` のとき `start` `end` の時刻部分は無視、日付のみ参照

### 5.4 既存 model の back-relation 追加

User に以下を追加 (上記 5.1 で既述):
- `sentFriendships Friendship[] @relation("FriendshipSender")`
- `receivedFriendships Friendship[] @relation("FriendshipReceiver")`
- `createdRooms Room[] @relation("RoomCreatedBy")`
- `roomMemberships RoomMembership[]`
- `authoredRoomEvents RoomEvent[] @relation("RoomEventAuthor")`

他の既存 model (Meeting / Course / DaySlot 等) には back-relation 追加なし。

### 5.5 Index 設計の意図

| Index | 目的 |
|---|---|
| `Friendship @@index([receiverId, status])` | 「自分宛の PENDING 一覧」を取るクエリ |
| `Friendship @@index([senderId, status])` | 「自分が送った PENDING 一覧」を取るクエリ |
| `Friendship @@unique([senderId, receiverId])` | 同方向重複防止 |
| `Room @@index([createdByUserId])` | 「自分が作ったルーム」 (Phase 5 用) |
| `RoomMembership @@index([userId])` | 「自分が参加中のルーム一覧」 |
| `RoomMembership @@unique([roomId, userId])` | 重複参加防止 |
| `RoomEvent @@index([roomId, start])` | 週ビューでの絞り込み (roomId + start range) |

---

## 6. API 追加 (Hono router)

### 6.1 ルート登録 (`apps/api/src/app.ts`)

```ts
// Phase 4 で追加するルート
app.route("/api/friendships", friendshipsRoute);     // 新規
app.route("/api/users", usersRoute);                 // 新規 (search)
app.route("/api/rooms", roomsRoute);                 // 新規
// 既存 route は変更なし
```

### 6.2 共通仕様

- 全 endpoint で MVP §4 共通仕様 (auth middleware / setup guard / Zod validate / error shape) を踏襲
- error response: `{ code: string; message: string; details?: any }` (MVP §4 ママ)
- 認証: better-auth cookie session、未認証は 401 `{ code: "UNAUTHORIZED" }`
- setup 未完了 (User.schoolId or departmentId が null): 403 `{ code: "SETUP_REQUIRED" }`

### 6.3 Friendship endpoints

| Method | Path | 認証 | Body | Response | エラー |
|---|---|---|---|---|---|
| GET | `/api/friendships` | @auth | (query: `?status=PENDING\|ACCEPTED\|DECLINED\|BLOCKED&direction=sent\|received\|all`) | `{ friendships: FriendshipDto[] }` | 401 |
| POST | `/api/friendships` | @auth | `{ receiverHandle?: string; receiverInviteCode?: string; receiverId?: string }` (どれか 1 つ必須) | `{ friendship: FriendshipDto }` (201) | 400 / 401 / 404 (USER_NOT_FOUND) / 409 (ALREADY_FRIEND / SELF_FRIENDSHIP / BLOCKED_BY_RECEIVER) |
| POST | `/api/friendships/:id/accept` | @auth | (none) | `{ friendship: FriendshipDto }` | 401 / 403 (NOT_RECEIVER) / 404 / 409 (NOT_PENDING) |
| POST | `/api/friendships/:id/decline` | @auth | (none) | `{ friendship: FriendshipDto }` | 同上 |
| POST | `/api/friendships/:id/cancel` | @auth | (none) — sender 側からの取消 | `{ ok: true }` | 401 / 403 (NOT_SENDER) / 404 / 409 (NOT_PENDING) |
| POST | `/api/friendships/:id/block` | @auth | (none) — receiver / sender 問わず | `{ friendship: FriendshipDto }` | 401 / 404 |
| DELETE | `/api/friendships/:id` | @auth | (none) — 友達解除 (ACCEPTED → 行削除) | `{ ok: true }` | 401 / 404 |

```ts
// packages/shared/src/schemas/friendship.ts
export const FriendshipStatusEnum = z.enum(["PENDING", "ACCEPTED", "DECLINED", "BLOCKED"]);

export const FriendshipDto = z.object({
  id: z.string(),
  sender: z.object({ id: z.string(), name: z.string().nullable(), handle: z.string().nullable(), image: z.string().nullable() }),
  receiver: z.object({ id: z.string(), name: z.string().nullable(), handle: z.string().nullable(), image: z.string().nullable() }),
  status: FriendshipStatusEnum,
  createdAt: z.string(),       // ISO
  acceptedAt: z.string().nullable(),
});

export const CreateFriendshipInput = z.object({
  receiverHandle: z.string().min(1).optional(),
  receiverInviteCode: z.string().min(1).optional(),
  receiverId: z.string().min(1).optional(),
}).refine(
  (v) => [v.receiverHandle, v.receiverInviteCode, v.receiverId].filter(Boolean).length === 1,
  { message: "exactly one of receiverHandle / receiverInviteCode / receiverId is required" }
);
```

#### Service 層: friendship.service.ts

```ts
async function createFriendship(senderId: string, input: CreateFriendshipInput) {
  const receiver = await resolveReceiver(input);  // handle / inviteCode / id のどれか
  if (!receiver) throw new AppError(404, "USER_NOT_FOUND");
  if (receiver.id === senderId) throw new AppError(409, "SELF_FRIENDSHIP");

  // ★4 双方向重複の吸収:
  // 既存 (senderId, receiverId) 行 / (receiverId, senderId) 行を一括検査
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId, receiverId: receiver.id },
        { senderId: receiver.id, receiverId: senderId },
      ],
    },
  });

  if (existing) {
    if (existing.status === "ACCEPTED") throw new AppError(409, "ALREADY_FRIEND");
    if (existing.status === "BLOCKED") {
      // 相手が自分をブロックしている場合は USER_NOT_FOUND と同じ扱い (相手の存在を露呈しない)
      if (existing.senderId === receiver.id) throw new AppError(404, "USER_NOT_FOUND");
      // 自分が相手をブロックしている場合は解除を先に
      throw new AppError(409, "YOU_BLOCKED_THIS_USER");
    }
    if (existing.status === "PENDING") {
      // 逆方向 (relative-receiver が先に送っていた) なら ACCEPTED に昇格
      if (existing.senderId === receiver.id && existing.receiverId === senderId) {
        return prisma.friendship.update({
          where: { id: existing.id },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        });
      }
      // 同方向 (自分から相手) なら冪等
      if (existing.senderId === senderId) return existing;
    }
    if (existing.status === "DECLINED") {
      // DECLINED は 再申請を許可: 行を update して PENDING に戻す
      return prisma.friendship.update({
        where: { id: existing.id },
        data: { senderId, receiverId: receiver.id, status: "PENDING", acceptedAt: null },
      });
    }
  }

  return prisma.friendship.create({
    data: { senderId, receiverId: receiver.id, status: "PENDING" },
  });
}
```

### 6.4 Users endpoints (search)

| Method | Path | 認証 | Query | Response | エラー |
|---|---|---|---|---|---|
| GET | `/api/users/search` | @auth | `?handle=<str>` (前方一致、min 1, max 30) | `{ users: UserSearchDto[] }` (max 10 件) | 400 / 401 |

```ts
export const UserSearchDto = z.object({
  id: z.string(),
  name: z.string().nullable(),
  handle: z.string().nullable(),
  image: z.string().nullable(),
  friendshipStatus: FriendshipStatusEnum.nullable(),  // 自分との関係
});
```

検索条件:
- `handle ILIKE '${query}%'` (前方一致、case insensitive)
- 自分 + 自分が BLOCKED 行の sender になっているユーザーは除外
- 自分から見た friendship status (sender/receiver どちら向きでも) を `friendshipStatus` に詰めて返す (null = まだ関係なし)

### 6.5 Rooms endpoints

| Method | Path | 認証 | Body / Query | Response | エラー |
|---|---|---|---|---|---|
| GET | `/api/rooms` | @auth, @setup | (none) | `{ rooms: RoomSummaryDto[] }` | 401 / 403 |
| POST | `/api/rooms` | @auth, @setup | `CreateRoomInput` | `{ room: RoomDto }` (201) | 400 / 401 / 403 |
| GET | `/api/rooms/:id` | @auth, @setup | (none) | `{ room: RoomDto }` | 401 / 403 / 404 (NOT_MEMBER) |
| PATCH | `/api/rooms/:id` | @auth, @setup | `UpdateRoomInput` | `{ room: RoomDto }` | 401 / 403 (NOT_OWNER) / 404 |
| DELETE | `/api/rooms/:id` | @auth, @setup | (none) | `{ ok: true }` | 401 / 403 (NOT_OWNER) / 404 |
| POST | `/api/rooms/:id/leave` | @auth, @setup | (none) | `{ ok: true }` | 401 / 403 / 404 / 409 (OWNER_CANNOT_LEAVE) |
| GET | `/api/rooms/:id/members` | @auth, @setup | (none) | `{ members: RoomMemberDto[] }` | 401 / 403 / 404 |
| DELETE | `/api/rooms/:id/members/:userId` | @auth, @setup | (none) | `{ ok: true }` | 401 / 403 (NOT_OWNER) / 404 / 409 (CANNOT_REMOVE_OWNER) |
| POST | `/api/rooms/:id/invite` | @auth, @setup | (none) — 招待コード再発行 | `{ inviteCode: string; inviteExpiresAt: string }` | 401 / 403 (NOT_OWNER) / 404 |
| POST | `/api/rooms/join` | @auth, @setup | `{ inviteCode: string }` | `{ room: RoomDto }` | 400 / 401 / 403 / 404 (INVITE_NOT_FOUND) / 410 (INVITE_EXPIRED) / 409 (ALREADY_MEMBER) |
| GET | `/api/rooms/:id/week` | @auth, @setup | `?weekStart=YYYY-MM-DD` (月曜起算 JST) | `RoomWeekDto` | 400 / 401 / 403 / 404 |
| GET | `/api/rooms/:id/events` | @auth, @setup | `?from=ISO&to=ISO` | `{ events: RoomEventDto[] }` | 400 / 401 / 403 / 404 |
| POST | `/api/rooms/:id/events` | @auth, @setup | `CreateRoomEventInput` | `{ event: RoomEventDto }` (201) | 400 / 401 / 403 / 404 |
| PATCH | `/api/rooms/:id/events/:eventId` | @auth, @setup | `UpdateRoomEventInput` | `{ event: RoomEventDto }` | 400 / 401 / 403 (NOT_MEMBER) / 404 |
| DELETE | `/api/rooms/:id/events/:eventId` | @auth, @setup | (none) | `{ ok: true }` | 401 / 403 / 404 |

#### Zod schemas (`packages/shared/src/schemas/room.ts`)

```ts
export const RoomRoleEnum = z.enum(["OWNER", "MEMBER"]);

export const RoomSummaryDto = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number().int(),
  myRole: RoomRoleEnum,
  upcomingEvent: z.object({
    id: z.string(),
    title: z.string(),
    start: z.string(),     // ISO
  }).nullable(),
  createdAt: z.string(),
});

export const RoomDto = RoomSummaryDto.extend({
  inviteCode: z.string(),
  inviteExpiresAt: z.string().nullable(),  // ISO or null
});

export const RoomMemberDto = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  handle: z.string().nullable(),
  image: z.string().nullable(),
  role: RoomRoleEnum,
  joinedAt: z.string(),
});

export const RoomEventDto = z.object({
  id: z.string(),
  roomId: z.string(),
  authorId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  start: z.string(),     // ISO
  end: z.string(),       // ISO
  isAllDay: z.boolean(),
  color: z.string().nullable(),
  createdAt: z.string(),
});

export const CreateRoomInput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
});

export const UpdateRoomInput = CreateRoomInput.partial();

export const CreateRoomEventInput = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  isAllDay: z.boolean().default(false),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).refine((v) => new Date(v.end) > new Date(v.start), { message: "end must be after start" });

export const UpdateRoomEventInput = CreateRoomEventInput.partial().refine(
  (v) => v.start == null || v.end == null || new Date(v.end) > new Date(v.start),
  { message: "end must be after start" }
);

export const RoomWeekDto = z.object({
  weekStart: z.string(),    // ISO date (00:00 JST 月曜)
  weekEnd: z.string(),      // ISO date (23:59 JST 日曜)
  members: z.array(z.object({
    userId: z.string(),
    name: z.string().nullable(),
    handle: z.string().nullable(),
    image: z.string().nullable(),
    color: z.string(),     // メンバー識別色 (server 側で固定生成、cuid hash の hue から hsl)
  })),
  // 各メンバーの該当週 Meeting (絶対日時化済)
  meetings: z.array(z.object({
    userId: z.string(),
    occurrenceId: z.string(),
    courseId: z.string(),
    courseName: z.string(),
    courseColor: z.string().nullable(),
    date: z.string(),         // ISO date
    startMinute: z.number(),
    endMinute: z.number(),
  })),
  // 該当週の RoomEvent
  roomEvents: z.array(RoomEventDto),
});
```

#### Service 層: room.service.ts (要点)

```ts
async function createRoom(userId: string, input: CreateRoomInput) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.create({
      data: {
        ...input,
        createdByUserId: userId,
        inviteExpiresAt: dayjs().add(7, "day").toDate(),
      },
    });
    await tx.roomMembership.create({
      data: { roomId: room.id, userId, role: "OWNER" },
    });
    return room;
  });
}

async function joinRoomByInviteCode(userId: string, inviteCode: string) {
  const room = await prisma.room.findUnique({ where: { inviteCode } });
  if (!room) throw new AppError(404, "INVITE_NOT_FOUND");
  if (room.inviteExpiresAt && room.inviteExpiresAt < new Date()) {
    throw new AppError(410, "INVITE_EXPIRED");
  }
  const existing = await prisma.roomMembership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId } },
  });
  if (existing) throw new AppError(409, "ALREADY_MEMBER", { roomId: room.id });

  await prisma.roomMembership.create({
    data: { roomId: room.id, userId, role: "MEMBER" },
  });
  return room;
}

async function getRoomWeek(roomId: string, userId: string, weekStart: Date) {
  // 1. membership check
  const membership = await prisma.roomMembership.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!membership) throw new AppError(403, "NOT_MEMBER");

  const weekEnd = dayjs(weekStart).add(7, "day").subtract(1, "ms").toDate();
  const members = await prisma.roomMembership.findMany({
    where: { roomId },
    include: { user: true },
  });

  // 2. 各メンバーの該当週 MeetingOccurrence を一括取得 (defaultSemester の Meeting に絞る)
  const memberIds = members.map((m) => m.userId);
  const occurrences = await prisma.meetingOccurrence.findMany({
    where: {
      date: { gte: weekStart, lte: weekEnd },
      course: {
        userTimetable: {
          userId: { in: memberIds },
        },
      },
    },
    include: {
      meeting: { include: { userTimetable: true } },
      course: true,
    },
  });

  // 3. 該当週の RoomEvent を取得
  const roomEvents = await prisma.roomEvent.findMany({
    where: {
      roomId,
      OR: [
        { start: { gte: weekStart, lte: weekEnd } },
        { end: { gte: weekStart, lte: weekEnd } },
        { AND: [{ start: { lte: weekStart } }, { end: { gte: weekEnd } }] }, // 跨ぎ
      ],
    },
    orderBy: { start: "asc" },
  });

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    members: members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      handle: m.user.handle,
      image: m.user.image,
      color: cuidToHsl(m.userId),
    })),
    meetings: occurrences.map((o) => ({
      userId: o.meeting.userTimetable.userId,
      occurrenceId: o.id,
      courseId: o.courseId,
      courseName: o.course.name,
      courseColor: o.course.color,
      date: o.date.toISOString(),
      startMinute: o.startMinute,
      endMinute: o.endMinute,
    })),
    roomEvents: roomEvents.map(toDto),
  };
}

function cuidToHsl(id: string): string {
  // cuid 末尾 4 文字を hex → hue 0-360 にマップ、saturation 65, lightness 55 固定
  const hue = parseInt(id.slice(-4), 36) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}
```

### 6.6 Meeting bulk create (Phase 4 で新規 UI が使う)

| Method | Path | 認証 | Body | Response | エラー |
|---|---|---|---|---|---|
| POST | `/api/meetings/bulk` | @auth, @setup | `MeetingBulkCreateInput` | `{ meetings: MeetingDto[] }` (201) | 400 / 401 / 403 / 404 / 409 (PERIOD_CONFLICT) |

```ts
// packages/shared/src/schemas/meeting.ts (Phase 4 追加)
export const MeetingBulkCreateInput = z.object({
  userTimetableId: z.string(),
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startPeriodIndexes: z.array(z.number().int().min(1).max(20)).min(1).max(12),
  // periodCount は不要 (連続判定で自動算出)
});
```

Service 層:

```ts
function periodsToMeetings(startPeriodIndexes: number[]): Array<{startPeriodIndex: number; periodCount: number}> {
  if (startPeriodIndexes.length === 0) return [];
  const sorted = [...new Set(startPeriodIndexes)].sort((a, b) => a - b);
  const groups: Array<{startPeriodIndex: number; periodCount: number}> = [];
  let start = sorted[0], count = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) count++;
    else { groups.push({ startPeriodIndex: start, periodCount: count }); start = sorted[i]; count = 1; }
  }
  groups.push({ startPeriodIndex: start, periodCount: count });
  return groups;
}

async function createMeetingsBulk(userId: string, input: MeetingBulkCreateInput) {
  // 1. 既存 Meeting と衝突しないかチェック (1 group ずつ)
  const groups = periodsToMeetings(input.startPeriodIndexes);
  const existing = await prisma.meeting.findMany({
    where: { userTimetableId: input.userTimetableId, dayOfWeek: input.dayOfWeek },
  });
  for (const g of groups) {
    const range = new Set<number>();
    for (let i = 0; i < g.periodCount; i++) range.add(g.startPeriodIndex + i);
    for (const m of existing) {
      for (let i = 0; i < m.periodCount; i++) {
        if (range.has(m.startPeriodIndex + i)) {
          throw new AppError(409, "PERIOD_CONFLICT", { conflictPeriod: m.startPeriodIndex + i });
        }
      }
    }
  }

  // 2. transaction で一括 INSERT + occurrenceGen
  return prisma.$transaction(async (tx) => {
    const created = [];
    for (const g of groups) {
      const meeting = await tx.meeting.create({
        data: {
          userTimetableId: input.userTimetableId,
          courseId: input.courseId,
          dayOfWeek: input.dayOfWeek,
          startPeriodIndex: g.startPeriodIndex,
          periodCount: g.periodCount,
        },
      });
      await generateOccurrencesForMeeting(tx, meeting);
      created.push(meeting);
    }
    return created;
  });
}
```

旧 `POST /api/meetings` は維持 (Phase 4 UI からは呼ばないが、既存テストと互換のため残す)。

---

## 7. 挙動仕様 (Reviewer のテスト根拠)

MVP doc §8 の挙動仕様 1-164 + redesign §P3.4 の 165-193 を踏襲。**Phase 4 はそれらを変更せず、追番 200- として追加**。

### 7.1 ナビゲーション (200-)

200. BottomTab に表示されるタブは 4 個で、左から順に `今日 / 時間割 / ルーム / 友達`。旧 `みんなの時間割 / 出席率 / マイページ` は表示されない。
201. PC (`>= 768px`) SideNav にも同 4 項目が同順序で並ぶ。SideNav の上端にはロゴ、下端にはアバターは出さない (アバターは TopBar 右上)。
202. ユーザーが `/me` に直接アクセスすると、`/` (Today) へ replace navigate される。履歴に `/me` は残らない。
203. ユーザーが `/templates` に直接 URL を叩くと到達可能。タブからは見えないが、ページ自体は表示される。
204. ユーザーが `/stats` に直接 URL を叩くと到達可能 (同上)。
205. 4 タブいずれかをタップすると `useRouterState().location.pathname` が対応する route に切り替わり、BottomTab のアクティブ表現 (icon fill + emerald + 上端 2px indicator) が新タブに移る。
206. ユーザーがログアウトすると、`/signin` に navigate され、`queryClient` の全 cache がクリアされる (`queryClient.clear()` が呼ばれる)。
207. 認証時に `/signin` を踏むと `/` へ replace navigate される (既存 SessionGuard の挙動継続)。

### 7.2 AvatarMenu (210-)

210. TopBar 右上のアバター button は 40x40 `rounded-full`、`<img>` または initial circle (name の先頭 1 文字大文字) を表示する。
211. PENDING で receiverId が自分の Friendship が **1 件以上** ある状態でアバター button をレンダーすると、右上に 16x16 emerald 円 (未読バッジ) が absolute 配置される。0 件のとき非表示。
212. PC (`min-width: 768px`) でアバター button を click すると Radix DropdownMenu が `align="end" sideOffset=8` で開く。
213. モバイル (`max-width: 767px`) でアバター button を tap すると Vaul Drawer が下から slide up する。
214. DropdownMenu / Drawer の header に `me.name` (or fallback `me.email`) + `me.email` が表示される。
215. メニュー項目は 7 項目: `学校・学科`, `出欠ルール`, `学期管理`, `出席率を見る`, `みんなの時間割`, (divider), `ログアウト`。
216. `出席率を見る` を tap → `useNavigate({ to: "/stats" })` が呼ばれる + メニュー閉。
217. `みんなの時間割` を tap → `useNavigate({ to: "/templates" })` + メニュー閉。
218. `ログアウト` を tap → `POST /api/auth/sign-out` (better-auth) → `queryClient.clear()` → `useNavigate({ to: "/signin" })`。
219. backdrop / ESC キー / drag-to-dismiss (mobile のみ) でメニューは閉じる。
220. メニュー open 中に画面回転 / リサイズで PC↔モバイル境界を跨ぐと、現在開いている dropdown/drawer は閉じる (`useMediaQuery` の値が変わったタイミングで cleanup useEffect が isOpen=false に)。

### 7.3 Today: Spotify scroll (230-)

230. `useTodayOccurrences()` が loading 中、TimetableScroll は 3 個の skeleton card を表示する。
231. occurrence が 0 件のとき、`<EmptyState>` (マスコット 180px + メッセージ + 「時間割を見る」link) を表示し、TimetableScroll は表示されない。
232. occurrence が 1 件以上あるとき、各 occurrence は `<OccurrenceLyricCard>` として縦並びでレンダーされる。連続コマも 1 occurrence = 1 card で分離表示 (mergedTitle はしない)。
233. 各 OccurrenceLyricCard の表示要素は **何限 (period 番号) / 授業名 (course.name) / 教室番号 (course.room)** の 3 つ。教師名は表示しない。時刻は補助情報として period 番号下に `text-xs fg-tertiary` で `H:MM-H:MM`。
234. `now` が `occurrence.startMinute <= now <= occurrence.endMinute + 5` の範囲にあるとき、その card に `current` state class (`opacity-100 scale-105 font-bold ring-2 ring-accent-500 bg-bg-elevated shadow-card`) が付与される。
235. `now > occurrence.endMinute + 5` の occurrence card は `past` state (`opacity-30 scale-90 -translate-y-2`)。
236. `now < occurrence.startMinute` の occurrence card は `future` state (`opacity-70 scale-100`)。
237. 当日に current 判定の occurrence がない (休み時間 or 全終了後)、`now > 最終 occurrence.endMinute` なら最後の card を current 扱いし state class を付与。`now < 最初の occurrence.startMinute` なら最初の card を current 扱い。
238. **mount 直後**、activeIndex に対応する card の `scrollIntoView({ behavior: "smooth", block: "center" })` が 1 回だけ呼ばれる (`useEffect` の deps が変わったとき)。
239. **`prefers-reduced-motion: reduce`** が true のユーザー環境では、`scrollIntoView` の `behavior` が `"auto"` になる。
240. activeIndex が変わった (1 分 polling で `useNow` が更新) とき、新しい card に再度 `scrollIntoView({behavior:"smooth", block:"center"})` が呼ばれる (ただし `isManualScroll === true` のときは呼ばれない)。
241. container の `onWheel` イベントが `deltaY !== 0` で発火すると `isManualScroll === true` になる。
242. container の `onTouchMove` イベントが発火すると `isManualScroll === true` になる。
243. `isManualScroll === true` のとき、画面下中央 (bottom-tab の 16px 上) に `<ReturnToNowFAB>` が rendered される。0 件のときは出さない。
244. `<ReturnToNowFAB>` を click すると `isManualScroll === false` になり、useEffect が `scrollIntoView` を再実行する。
245. `prefers-reduced-motion: reduce` 時、`<ReturnToNowFAB>` click の挙動は同じ (behavior が "auto" でスナップ)。
246. **★ E2E ONLY**: `scrollIntoView` の jsdom 上の no-op を回避するため、`scrollIntoView` が呼ばれたことの検証は spy で行い (vitest)、実際のスクロール位置検証は chrome-devtools MCP で行う (§9 参照)。

### 7.4 Today: MainAttendanceCTA (260-)

260. 未記録 occurrence (status === null) が N > 0 件のとき、画面上部に primary button `今日は全出席 (N 件)` が sticky 表示される。
261. N === 0 のとき、CTA は `本日の記録は完了済` の success state (チェックアイコン + emerald 文字、border-emerald) になり、`disabled` 属性が付く。
262. CTA tap (展開トグル) で、CTA 下に全 occurrence の一覧が inline 表示される。各行は course.name + period label + `<StatusChipGroup>` (7 chip)。
263. 7 chip は左から `出 / 欠 / 遅 / 早 / 公 / 休 / 未` (PRESENT/ABSENT/TARDY/EARLY_LEAVE/EXCUSED/CANCELLED/null)。
264. chip tap で対応する `POST /api/attendance/:occurrenceId { status }` を発行。`未` chip tap は `DELETE /api/attendance/:occurrenceId`。
265. mutation は optimistic update。成功で確定、失敗で rollback + toast (`記録に失敗しました`)。
266. 「全出席」 (CTA 本体 tap、展開状態に関係なく primary button 自体の click) は `POST /api/attendance/mark-all-present` を発行。optimistic に全未記録 → PRESENT に変更、失敗で rollback。
267. CTA は展開トグル button と primary 全出席 button の 2 つの click target を持つ。展開トグルは右側の `<ChevronDown>` icon area (44x44 タップターゲット)、primary 部は左側の text area。
268. 展開状態は `useState` で持ち、tab 切替や mount/unmount で初期値は **閉じている** (false)。

### 7.5 Timetable: 入力 chip UX (280-)

280. `<MeetingCreateSheet>` が open しているとき、フォームに `<PeriodChips>` (Radix ToggleGroup type="multiple") が表示される。
281. chip の個数は `userTimetable.daySlots.length` (1-12) と一致する。
282. chip 1 個を click すると `data-state="on"` 属性が付き、`bg-accent-500 text-fg-on-accent` クラスが適用される。
283. 同じ chip を再度 click すると `data-state="off"` になり、選択解除される。
284. 複数 chip 選択時、`<PeriodChips>` の `value` prop は **昇順ソート済 number[]** で渡される。例: `2,4,1` の順で押しても `[1, 2, 4]`。
285. 選択値 `[1,2,4]` のとき、preview として `1-2限 (2 連続) + 4限 (単独)` が `<PeriodChipsPreview>` で表示される。
286. 選択値 0 件のとき、「保存」button が disabled になる。
287. 「保存」button click で `POST /api/meetings/bulk { userTimetableId, courseId, dayOfWeek, startPeriodIndexes: [1,2,4] }` が発行される。
288. backend service は `[1,2,4]` を `[{start:1, count:2}, {start:4, count:1}]` の 2 Meeting に分割して INSERT する。
289. 1 group ずつ既存 Meeting との衝突検査が走り、いずれかが衝突なら **transaction 全体 rollback** + `409 PERIOD_CONFLICT { conflictPeriod: N }` を返す。
290. レスポンス `{ meetings: MeetingDto[] }` には作成された全 Meeting (今回は 2 件) が含まれる。
291. mutation 成功で sheet を close + `["user-timetable", userTimetableId]` `["today", *]` を invalidate。
292. `<MeetingDetailSheet>` (既存 Meeting 編集) では `<PeriodChips>` ではなく、従来通り単一 Meeting の startPeriodIndex / periodCount を編集する UI のまま (`PATCH /api/meetings/:id`)。
293. 入力 chip の `aria-label` は `${p}限` 形式 (例: `3限`)。
294. 連続 chip (連続 period 範囲) の preview は最大 `connectedCount` を表示しても、それを 1 group として扱う (例: [1,2,3] → `1-3限 (3 連続)`)。

### 7.6 Friends (310-)

310. `GET /api/friendships?direction=received&status=PENDING` の結果が 1 件以上あるとき、`/friends` 画面に `受信した申請 (N)` セクションが上部表示される。
311. 同セクション内の各行に `[承認]` `[拒否]` button が表示される。`[承認]` tap で `POST /api/friendships/:id/accept` → `status=ACCEPTED, acceptedAt=now`。
312. `[拒否]` tap で `POST /api/friendships/:id/decline` → `status=DECLINED`。
313. `送信した申請` セクションには `direction=sent & status=PENDING` の Friendship が表示され、各行に `[取消]` button のみ。`POST /api/friendships/:id/cancel` で行が **削除** される (DECLINED にせず、再申請を許す)。
314. `友達` セクションには `status=ACCEPTED` の Friendship が表示される (sender/receiver どちらでも自分が含まれる行)。
315. 友達の各行右端 `[⋮]` menu に `ブロックする` `友達を解除` の 2 項目。
316. `ブロックする` tap → `POST /api/friendships/:id/block` → `status=BLOCKED, senderId=自分, receiverId=相手` に正規化 (sender/receiver 入れ替えてでも自分が sender 側になる)。
317. `友達を解除` tap → `<ConfirmDialog>` → `DELETE /api/friendships/:id` で行削除。
318. `ブロック中` セクションは accordion で **default 折りたたみ**、ヘッダ `ブロック中 (N) ▾` を tap で展開。各行に `[解除]` button、`DELETE /api/friendships/:id` で解除。
319. `<AddFriendSheet>` 内の「ハンドル検索」入力に 1 文字以上入れて 300ms 経過すると `GET /api/users/search?handle=<query>` が発火する。
320. 検索結果リストの各行 tap で `POST /api/friendships { receiverHandle: "..." }` が発行される。
321. 検索結果に表示される User は **自分自身を含まない**。自分から見て BLOCKED 行の sender になっているユーザーも除外。
322. 検索結果の各行に既存 friendshipStatus が表示される (`申請中` / `友達` / `拒否済` / `ブロック中`)、`null` のときは `[追加]` button のみ。
323. 「招待リンクを送る」 area の `[リンクをコピー]` button tap で `https://${window.location.origin}/friends/add/${me.inviteCode}` が clipboard に書き込まれる + toast `リンクをコピーしました`。
324. `/friends/add/$inviteCode` route mount 時、未認証なら `/signin?redirect=/friends/add/${inviteCode}` へ navigate。認証済なら `POST /api/friendships { receiverInviteCode }` → 成功で `/friends` へ replace + toast。
325. 自分の inviteCode で `/friends/add/$inviteCode` を踏むと、API が `409 SELF_FRIENDSHIP` を返す。フロントは toast `自分には申請できません` + `/friends` へ replace。

### 7.7 Friendship Service 層 (340-)

340. `POST /api/friendships` で **receiver が存在しないハンドル / inviteCode / id** を渡すと `404 USER_NOT_FOUND`。
341. receiverId が **自分の id** と同じなら `409 SELF_FRIENDSHIP`。
342. 既存 (自分→相手) の `PENDING` 行があるとき、再度同じ申請を送ると **冪等** (新規行は作らず、既存行をそのまま返す、200)。
343. 既存 (自分→相手) の `ACCEPTED` 行があるとき、`409 ALREADY_FRIEND`。
344. 既存 (相手→自分) の `PENDING` 行があるとき、本 API 呼び出しで自動的に `ACCEPTED` に昇格する (sender/receiver は元のまま保持、`acceptedAt` を now にセット)。レスポンスは 200 で更新後の行。
345. 既存 (相手→自分) の `BLOCKED` 行 (= 相手が自分を block) があるとき、`404 USER_NOT_FOUND` (相手の存在を露呈しない)。
346. 既存 (自分→相手) の `BLOCKED` 行 (= 自分が相手を block) があるとき、`409 YOU_BLOCKED_THIS_USER`。
347. 既存 (自分→相手 or 相手→自分) の `DECLINED` 行があるとき、新 API 呼び出しで `senderId/receiverId/status/acceptedAt` を上書きして `PENDING` に戻す (再申請を許可)。
348. `POST /api/friendships/:id/accept` を呼び出す user が receiverId と一致しないなら `403 NOT_RECEIVER`。
349. `POST /api/friendships/:id/accept` の対象 status が `PENDING` でないなら `409 NOT_PENDING`。
350. `POST /api/friendships/:id/cancel` を呼ぶ user が senderId と一致しないなら `403 NOT_SENDER`。
351. `POST /api/friendships/:id/cancel` の対象 status が `PENDING` でないなら `409 NOT_PENDING`。
352. `POST /api/friendships/:id/block` は sender / receiver のどちらでも呼べる。呼び出し時、行を update して `senderId=自分, receiverId=相手, status=BLOCKED` に正規化。
353. `DELETE /api/friendships/:id` は sender / receiver のどちらでも呼べる。行を物理削除。
354. `GET /api/users/search?handle=touri` は handle 前方一致で最大 10 件。case insensitive。空 query (`handle=`) は `400 BAD_REQUEST`。
355. search 結果の各行に `friendshipStatus` field が含まれる。自分から見て (sender も receiver も区別せず) 既存 Friendship 行があれば status を入れる、なければ null。

### 7.8 Rooms (380-)

380. `GET /api/rooms` は自分が `RoomMembership` を持つ Room を返す (任意の role)。各行に `memberCount` (membership count) と `myRole` が含まれる。
381. `POST /api/rooms { name }` で Room を作成すると、同時に作成者の `RoomMembership { role: "OWNER" }` も 1 行 INSERT される (transaction)。
382. 作成された Room の `inviteCode` は cuid 形式、`inviteExpiresAt` は now から **7 日後** の DateTime。
383. `GET /api/rooms/:id` を **メンバーでない** user が叩くと `404 NOT_MEMBER` (存在を露呈しない、403 ではない)。
384. `PATCH /api/rooms/:id` を OWNER 以外が叩くと `403 NOT_OWNER`。
385. `DELETE /api/rooms/:id` を OWNER 以外が叩くと `403 NOT_OWNER`。OWNER が叩くと cascade で membership / event 全削除。
386. `POST /api/rooms/:id/leave` を OWNER が叩くと `409 OWNER_CANNOT_LEAVE`。MEMBER が叩くと自分の membership 行を削除。
387. `DELETE /api/rooms/:id/members/:userId` を OWNER 以外が叩くと `403 NOT_OWNER`。OWNER が自分自身を指定すると `409 CANNOT_REMOVE_OWNER`。
388. `POST /api/rooms/:id/invite` (招待コード再発行) を OWNER 以外が叩くと `403 NOT_OWNER`。OWNER が叩くと `inviteCode = cuid()`, `inviteExpiresAt = dayjs().add(7,'day')` に UPDATE。レスポンスに新 inviteCode + 期限。
389. 再発行後、**旧 inviteCode** で `POST /api/rooms/join` を叩くと `404 INVITE_NOT_FOUND`。
390. `POST /api/rooms/join { inviteCode }` で対応 Room が無ければ `404 INVITE_NOT_FOUND`、期限切れなら `410 INVITE_EXPIRED`。
391. 既に member だった場合、`409 ALREADY_MEMBER { roomId: string }` を返す (フロントはこれを受けて 200 と同等扱い)。
392. 正常 join で `RoomMembership { role: "MEMBER", joinedAt: now }` が INSERT され、レスポンスに `{ room: RoomDto }` を返す。
393. `/rooms/join/$inviteCode` route mount 時、未認証なら `/signin?redirect=/rooms/join/${inviteCode}` へ navigate。認証済なら `POST /api/rooms/join` を発行 → 成功 / 409 ALREADY_MEMBER で `/rooms/${roomId}` へ replace。404 / 410 でエラー page 表示 + `/rooms` 戻る button。

### 7.9 RoomEvent (410-)

410. `POST /api/rooms/:id/events { title, start, end }` で Room の event を作成。room の **member** であれば誰でも可 (OWNER 限定ではない)。
411. start >= end の入力は `400 BAD_REQUEST { code: "INVALID_RANGE" }`。
412. event の `authorId` は呼び出し user に固定。
413. `PATCH /api/rooms/:id/events/:eventId` は **room member** であれば誰でも編集可 (author 限定ではない、TimeTree 方式)。
414. `DELETE /api/rooms/:id/events/:eventId` は **room member** であれば誰でも削除可 (同上)。
415. event の `start` / `end` を変更したとき、変更後の値も `end > start` を保証する (refine)。
416. `isAllDay: true` のとき、UI 上は `start.toDateString()` の 1 日分として表示 (時刻無視)。`end` も同日内に丸める想定。
417. `color` は `#RRGGBB` 形式の検証あり (`z.string().regex(...)`)、null/undefined 可。null のときは UI 側で `var(--color-room-event)` (#8B5CF6) を使う。

### 7.10 Room week endpoint (430-)

430. `GET /api/rooms/:id/week?weekStart=2026-05-25` は member でないなら `403 NOT_MEMBER`。
431. weekStart は ISO date (`YYYY-MM-DD`) の月曜限定。それ以外は `400 INVALID_WEEK_START`。
432. レスポンスに含まれる `members[].color` は `cuidToHsl(userId)` で生成された `hsl(...)` 文字列。同じ userId なら毎回同じ色。
433. `meetings[]` には該当週 (`weekStart <= date <= weekStart + 6days`) の各 member の `MeetingOccurrence` を absolute 日時化したものが含まれる。`courseName` / `courseColor` も join 済。
434. `roomEvents[]` には該当週内に `start` または `end` が入る、または週を跨ぐ event が含まれる。
435. response の `members` 配列は **OWNER 先頭、それ以外は joinedAt 昇順**。
436. 自分が member なら自分の Meeting も含む (自分を除外しない)。
437. **Phase 4 では `RoomMembership.shareTimetable` は schema に追加しない**ため、共有 opt-out 不可。全 member の Meeting が常に共有される。

### 7.11 RoomWeekView (UI、450-)

450. `<RoomWeekView>` mount 時に `useRoomWeek(roomId, weekStart)` で `GET /api/rooms/:id/week?weekStart=` を fetch。
451. 週 navigator (`<`, `>`, `今週`) で `weekStart` state を 7 日単位で変更、新 query key で再 fetch。
452. WeekGrid に表示される cell は: own Meeting (course color の動的 tint) / 他メンバー Meeting (fg-tertiary 薄表示 + 重なる場合 N 人バッジ) / RoomEvent (purple `var(--color-room-event)`) の 3 種。
453. cell の z-order: RoomEvent > own Meeting > 他メンバー Meeting。同 cell に複数の RoomEvent があれば、authorId 順 (alphabetical) で並べる。
454. RoomEvent cell tap → `<RoomEventDetailSheet>` open。中身: title / description / start-end / author name / [編集] [削除] button。
455. own Meeting cell tap → `useNavigate({ to: "/timetable" })` で時間割画面へ遷移 (Room 内では編集不可)。
456. 他メンバー Meeting cell tap → `<MemberMeetingPopover>` で popover (Radix Popover) を出し、課程名 + 教師 + 教室 + メンバー名を表示。tap で閉じる。

### 7.12 RoomAvailabilityHeatmap (470-)

470. 「みんなの空き」 tab を選ぶと、同 `useRoomWeek` のデータを再利用 (新 fetch なし)。
471. クライアントで以下の matrix を算出する: `members.length × 7days × N_periods` の `busy[member][day][period] = boolean`。N_periods は member それぞれの DaySlot 数の **max**。一人だけ多い period は他者にとって free 扱い。
472. **★8 算出ロジック**: 各 member について:
   - Meeting (定期): 自分の `userTimetable.daySlots` から `periodIndex` → `(startMinute, endMinute)` を解決し、roomWeek の Meeting (absolute occurrence) の `(date, startMinute, endMinute)` を再度 `(dayOfWeek=date.getDay()(0-6) を 月=0 換算で 0-6, periodIndex)` にマップ
   - RoomEvent: `(start, end)` を `(dayOfWeek, period range)` にマップ。「event が period range に被る」判定は `event.start < periodEnd && event.end > periodStart`
473. `free[d][p] = members.filter(m => !m.busy[d][p]).length` を算出。`free[d][p]` の範囲は `0..members.length`。
474. heatmap cell の背景 opacity = `free[d][p] / members.length`、base color は `accent-500`。`free === 0` のとき opacity 0 (or `bg-bg-muted`)、`free === members.length` のとき `bg-room-availability-empty` + `border border-accent-500` で強調。
475. filter dropdown `>= 2 人` `>= 3 人` `全員空き` を選ぶと、しきい値未満のセルは `opacity-20` で薄表示し、しきい値以上だけ強調。
476. cell hover (PC) / tap (mobile) で popover (`<AvailabilityCellPopover>`)、`空き: A, B` / `埋まり: C` のリストを表示。
477. matrix 算出は memoize (`useMemo` with deps `[roomWeek, threshold]`)。

### 7.13 共通エラー / 認証 (490-)

490. `Friendship` `Room` 系 endpoint は全て better-auth cookie session 必須、未認証は `401 UNAUTHORIZED`。
491. setup 未完了 user は `Room` 系 endpoint で `403 SETUP_REQUIRED` (Friendship 系は setup 完了不要 — 友達追加は schoolId/departmentId に依存しない)。
492. 全 POST/PATCH の Zod validation 失敗時は `400 BAD_REQUEST { code: "BAD_REQUEST", details: { fields: [...] } }`。
493. error response の status code は Hono error middleware で `c.json({...}, status)` の **第二引数で必ず明示**する ([gotcha/hono-error-middleware-apperror-status])。
494. Friendship / Room の対象行が存在しない場合は `404` を返す。`Friendship` で他人の id を叩いて 403 / 404 の差を漏らさない。Service 層で「呼び出し user に紐づかない id」は一律 404 とする。
495. `prisma.$transaction` 内でのエラーは外側に伝播して全 rollback。Reviewer は wave error pattern を assert (前半 INSERT 後の後半 throw で前半行が残らない)。

---

## 8. TanStack Query: 集約 + invalidation マトリクス

### 8.1 queryKey 集約 (`apps/web/src/api/queryKeys.ts`)

MVP の文字列リテラル散布を廃止し、本 doc で集約する。

```ts
export const QK = {
  // 既存 (MVP)
  session:        () => ["session"] as const,
  me:             () => ["me"] as const,
  schools:        (q: { q?: string; prefecture?: string; kind?: string }) => ["schools", q] as const,
  departments:    (schoolId: string) => ["departments", schoolId] as const,
  semesters:      () => ["semesters"] as const,
  semester:       (id: string) => ["semesters", id] as const,
  templates:      (q: { schoolId?: string; departmentId?: string; q?: string }) => ["templates", q] as const,
  template:       (id: string) => ["templates", id] as const,
  userTimetables: () => ["user-timetables"] as const,
  userTimetable:  (id: string) => ["user-timetables", id] as const,
  today:          (date?: string) => ["today", date ?? "current"] as const,
  stats:          (semesterId: string) => ["stats", semesterId] as const,
  rules:          (schoolId: string, departmentId: string) => ["rules", schoolId, departmentId] as const,

  // Phase 4 追加
  friendships:    (q: { status?: string; direction?: string } = {}) => ["friendships", q] as const,
  friendshipsPendingCount: () => ["friendships", "pending-count"] as const,
  usersSearch:    (handle: string) => ["users", "search", handle] as const,
  rooms:          () => ["rooms"] as const,
  room:           (id: string) => ["rooms", id] as const,
  roomMembers:    (id: string) => ["rooms", id, "members"] as const,
  roomWeek:       (id: string, weekStart: string) => ["rooms", id, "week", weekStart] as const,
  roomEvents:     (id: string, range: { from?: string; to?: string }) => ["rooms", id, "events", range] as const,
} as const;
```

### 8.2 Mutation → Invalidate マトリクス

| Mutation | Invalidate (本 doc Phase 4 必須) |
|---|---|
| `POST /api/auth/sign-out` | `queryClient.clear()` |
| `PATCH /api/me` | `["me"]`, `["session"]`, (handle 変更時) `["users","search", *]` |
| `POST /api/meetings/bulk` | `["user-timetables", userTimetableId]`, `["today", *]`, `["stats", *]`, (ルームメンバーなら) `["rooms", *, "week", *]` |
| `POST /api/friendships` | `["friendships", *]`, `["friendships","pending-count"]`, `["users","search", *]` |
| `POST /api/friendships/:id/accept` | `["friendships", *]`, `["friendships","pending-count"]` |
| `POST /api/friendships/:id/decline` | `["friendships", *]`, `["friendships","pending-count"]` |
| `POST /api/friendships/:id/cancel` | `["friendships", *]` |
| `POST /api/friendships/:id/block` | `["friendships", *]`, `["users","search", *]` |
| `DELETE /api/friendships/:id` | `["friendships", *]` |
| `POST /api/rooms` | `["rooms"]` |
| `PATCH /api/rooms/:id` | `["rooms"]`, `["rooms", id]` |
| `DELETE /api/rooms/:id` | `["rooms"]`, `["rooms", id]` (remove), all `["rooms", id, *]` (remove) |
| `POST /api/rooms/:id/leave` | `["rooms"]`, `["rooms", id]` (remove), `["rooms", id, "members"]` (remove) |
| `DELETE /api/rooms/:id/members/:userId` | `["rooms", id, "members"]`, `["rooms", id, "week", *]` |
| `POST /api/rooms/:id/invite` | `["rooms", id]` |
| `POST /api/rooms/join` | `["rooms"]`, (受信 roomId に対して) `["rooms", roomId]` |
| `POST /api/rooms/:id/events` | `["rooms", id, "events", *]`, `["rooms", id, "week", *]` |
| `PATCH /api/rooms/:id/events/:eventId` | `["rooms", id, "events", *]`, `["rooms", id, "week", *]` |
| `DELETE /api/rooms/:id/events/:eventId` | `["rooms", id, "events", *]`, `["rooms", id, "week", *]` |
| `POST /api/attendance/:occurrenceId` | `["today", *]`, `["stats", *]` |
| `DELETE /api/attendance/:occurrenceId` | `["today", *]`, `["stats", *]` |
| `POST /api/attendance/mark-all-present` | `["today", *]`, `["stats", *]` |

`*` は wildcard、`queryClient.invalidateQueries({ predicate: q => q.queryKey[0] === "rooms" && q.queryKey[1] === id && q.queryKey[2] === "week" })` 等で実装。

### 8.3 polling 戦略

| Query | refetchInterval |
|---|---|
| `["friendships","pending-count"]` (アバターバッジ用) | 60_000 (1 分) |
| `["today", *]` (Today scroll の active 判定) | クライアント側で `useNow(60_000)` で `now` を更新、API 自体は再 fetch しない (1 hour ごとに focus refetch) |
| `["rooms", *, "week", *]` | manual (window focus / mutation 後) |

push 通知は MVP 範囲外 (Phase 5)。

---

## 9. テスト基盤

### 9.1 Backend (apps/api)

MVP doc §9 を踏襲。

- **Framework**: Vitest 2.x + Hono `app.request()` で HTTP モック
- **DB**: SQLite file-based テンポラリ DB、`vi.beforeEach` で `tmp/test-${random}.db` 作成 + `prisma migrate deploy`
- **app export path**: `apps/api/src/index.ts` に `export const app` を明示 ([gotcha/design-must-specify-app-export-path-for-tests])。**Phase 4 でも維持**
- **session helper**: better-auth の Hono signed cookie format に合わせる ([gotcha/better-auth-test-cookie-must-match-hono-signed-format])。Phase 4 で `Friendship` / `Room` route のテストでも同 helper を使い回す
- **時刻注入**: `friendship.service.ts` / `room.service.ts` の `now?: Date` 引数を Service 関数に追加、テストで過去/未来日を渡せる
- **Hono error middleware**: 401/403/404/409/410 全件で status を `c.json(...)` 第二引数に渡す ([gotcha/hono-error-middleware-apperror-status])
- **PRAGMA foreign_keys**: `PRAGMA foreign_keys=ON` を test setup で確実に有効化 (cascade 削除のテストに必須)

#### Phase 4 で追加するテストファイル

| ファイル | 対象 |
|---|---|
| `apps/api/tests/friendship.test.ts` | POST / accept / decline / cancel / block / DELETE + 全 service 層挙動 (340-355) |
| `apps/api/tests/users.test.ts` | GET /api/users/search の filter / pagination / friendshipStatus |
| `apps/api/tests/room.test.ts` | CRUD + join / leave / member 削除 + invite 再発行 |
| `apps/api/tests/roomEvent.test.ts` | CRUD + author 不問の編集権限 |
| `apps/api/tests/roomWeek.test.ts` | 週分一括取得の境界条件 (週跨ぎ event / 自分含む member / shareTimetable 強制) |
| `apps/api/tests/meeting.bulk.test.ts` | startPeriodIndexes → Meeting 群分割 + 衝突検査 + transaction rollback |

カバレッジ目標 (MVP doc §9.5 を踏襲): services/ 90% 以上、routes/ 80% 以上。

### 9.2 Frontend (apps/web)

MVP doc §9 を踏襲。

- **Framework**: Vitest + React Testing Library + jsdom
- **API モック**: `msw` で `VITE_API_URL` の endpoint を補足
- **Router test**: TanStack Router の memory history を注入 ([gotcha/tanstack-router-factory-test-memory-history])。`/friends/add/$inviteCode`, `/rooms/join/$inviteCode` のテストで必須
- **jsdom 罠**: `getBoundingClientRect()` は 0 ([gotcha/jsdom-getboundingclientrect-zero])。サイズ依存 (Spotify scroll の位置計算) は jsdom で assert しない。**class / data-state / aria-label** ベース
- **scrollIntoView**: jsdom では no-op。`window.HTMLElement.prototype.scrollIntoView = vi.fn()` で spy 化し、「呼ばれた回数 / 引数 ({behavior, block})」だけ assert。実 scroll は MCP に振る

#### Phase 4 で追加するテストファイル

| ファイル | 対象 |
|---|---|
| `apps/web/tests/today.scroll.test.tsx` | activeIndex 算出 / state class 切替 / scrollIntoView spy / 「今に戻る」FAB |
| `apps/web/tests/today.cta.test.tsx` | MainAttendanceCTA の expand トグル / 全出席 mutation optimistic / chip group click |
| `apps/web/tests/periodChips.test.tsx` | 複数選択 / 連続判定 preview / 0 件で disabled / aria-label |
| `apps/web/tests/friends.test.tsx` | 受信/送信/友達/ブロック 4 セクション / chip 操作 / search debounce |
| `apps/web/tests/rooms.test.tsx` | 一覧 / 作成 / 招待リンクで join / 退室 |
| `apps/web/tests/roomDetail.test.tsx` | 3 tab 切替 / WeekView / heatmap 算出 / event CRUD |
| `apps/web/tests/avatarMenu.test.tsx` | PC dropdown / Mobile drawer 出し分け / バッジ表示 / メニュー click 遷移 |

### 9.3 E2E (chrome-devtools MCP)

MVP doc §9.3 を踏襲 ([tool-quirk/chrome-for-testing])。

- **Framework**: chrome-devtools MCP (Chrome for Testing headless, userDataDir: `~/.cache/chrome-devtools-mcp/chrome-profile`)
- **テスト配置**: `apps/web/e2e/<scenario>.e2e.ts` (vitest 独立 script でも可)
- **ローカル起動**: `pnpm -C apps/api dev` + `pnpm -C apps/web dev` 並列、`VITE_API_URL=http://localhost:3000`

#### Phase 4 で必須の E2E シナリオ (★7: jsdom で検証不可)

1. **Spotify scroll auto-scroll**: 当日 occurrence を 5 件 seed → mount → activeIndex card が viewport 中央に表示される (scroll position 検証、`element.getBoundingClientRect().top` が viewport height の 40-60% 範囲内)
2. **手動 scroll → FAB → auto 復帰**: container を `Element.scroll({ top: 0 })` で上にスクロール → `<ReturnToNowFAB>` が表示される → click → active card が中央に戻る
3. **CTA 展開 + chip 個別記録**: CTA tap → 全 occurrence row 表示 → 任意 1 件の `遅` chip tap → optimistic update が見える → polling で確定
4. **Friend 招待リンク経由 add**: User A の `/friends` で招待リンクコピー → 別 browser session の User B で URL を踏む → `POST /api/friendships` 発火 → User A の TopBar アバターに未読バッジ表示
5. **Room 招待リンク経由 join**: User A が room 作成 → invite link copy → User B が URL 踏む → `/rooms/${id}` に着地 → User A の memberCount が 2 に更新
6. **Room week + 空き時間**: 3 メンバー seed (それぞれ異なる時間割) → `/rooms/$id?tab=availability` → heatmap が全員空きセルを highlight
7. **アバターメニュー PC ↔ Mobile**: viewport 800px → dropdown 開く → viewport を 600px に narrow → dropdown が drawer に切り替わる (リサイズ tracking)

E2E ローカル DB は test DB (`DATABASE_URL=file:./tmp/e2e-${random}.db`) を seed script で初期化、テスト完了後削除。

### 9.4 Phase 4 テスト基盤の追加事項

- `apps/api/tests/__helpers__/seedFriendship.ts` / `seedRoom.ts` を新設 (各 entity の factory)
- `apps/api/tests/__helpers__/cuidToHsl.test.ts` を `apps/api/src/lib/cuidToHsl.test.ts` として inline test (Vitest in-source testing)
- MSW handlers `apps/web/tests/__mocks__/handlers.ts` に Phase 4 endpoint 追加 (`friendships/*`, `users/search`, `rooms/*`)

---

## 10. MVP スコープ (Phase 4 で含む / 含まない)

### 10.1 含む

- 4 タブ + 右上アバターメニュー + `/me` redirect 廃止
- Today: Spotify lyrics scroll + MainAttendanceCTA + 「今に戻る」FAB
- Timetable: `<PeriodChips>` multi-select 入力 + `<MeetingBulkCreateInput>` API
- Friends: GET / POST / accept / decline / cancel / block / DELETE + handle search + invite link route
- Rooms: CRUD + join / leave / members + invite code 再発行 + week endpoint + RoomEvent CRUD + invite link route
- 共有カレンダー (RoomEvent) と空き時間 heatmap (クライアント算出)
- redesign §2-§5 + §P3 の design token / コンポーネント (Phase 4 PR 1 本で実装)
- 既存 `/templates` `/stats` の維持 (アバターメニュー経由でアクセス可)
- TanStack Query queryKey 集約 (`apps/web/src/api/queryKeys.ts`)

### 10.2 含まない (Phase 5 以降)

- Web push 通知 / SSE / WebSocket (TanStack Query refetch + polling で代替)
- ルーム内チャット / DM
- 共有カレンダーの繰り返し event / 終日 event の高度な扱い
- ルーム owner 譲渡 / 複数 owner
- `RoomMembership.shareTimetable` opt-in (常に強制共有)
- 招待リンクの複数発行 / 単発招待 (`RoomInvite` テーブル分離)
- QR コード招待
- iPhone ネイティブ (Phase 2 案件、本 Phase 範囲外)
- キャラクター画像追加 (Phase 4 では既存 `mascot-hello-1024.png` のみ使用)
- 高度な空き時間 (15 分単位、time picker での絞り込み)
- フレンドからの直接メッセージ
- Templates 画面のルーム内移管 (★3 案 B、Phase 5 で再評価)
- `/me` の独立タブ復活 (廃止確定、設計判断 §3.2)

### 10.3 既存 schema を破壊しない範囲

- 既存 model / field の削除 / rename なし
- 既存 endpoint の入出力 / status code 不変
- 既存テスト全件は Phase 4 PR で **green を維持** (Reviewer の最初の判定基準)

---

## 11. 実装スコープ (Developer 用)

### 11.1 API 側変更ファイル (apps/api/)

| ファイル | 変更 |
|---|---|
| `prisma/schema.prisma` | User 拡張 + Friendship/Room/RoomMembership/RoomEvent + 2 enum 追加 |
| `prisma/migrations/<timestamp>_phase4_init/migration.sql` | 新規。User backfill 含む |
| `src/routes/friendships.ts` | **新規**: 7 endpoint |
| `src/routes/users.ts` | **新規**: GET /search 1 endpoint |
| `src/routes/rooms.ts` | **新規**: 14 endpoint (CRUD + members + events + week) |
| `src/routes/meetings.ts` | bulk endpoint 1 件追加 (`POST /bulk`)、既存 endpoint は不変 |
| `src/services/friendship.service.ts` | **新規** |
| `src/services/room.service.ts` | **新規** |
| `src/services/meeting.service.ts` | `createMeetingsBulk` 関数 + `periodsToMeetings` util 追加 |
| `src/lib/cuidToHsl.ts` | **新規** (member 識別色生成) |
| `src/app.ts` | 3 route 登録追加 |
| `src/middleware/setupGuard.ts` | (既存) Friendship route はスキップ、Room route のみ適用するように調整 |
| `tests/friendship.test.ts` 他 6 ファイル | **新規** |

### 11.2 Web 側変更ファイル (apps/web/)

**先に redesign 範囲 (Phase 2-3) を実装**してから Phase 4 機能を載せる。

| ファイル | 変更 |
|---|---|
| `src/styles.css` | redesign §2.1 token + Phase 4 追加 token (friendship/room) で全文書き換え |
| `tailwind.config.ts` | redesign §2.4 + Phase 4 追加 colors / shadow |
| `index.html` | Inter+Noto Sans JP preconnect + link、viewport meta `interactive-widget=resizes-content` |
| `src/router.tsx` | 4 タブ + `/me` redirect + `/rooms/*` `/friends/*` route 追加 |
| `src/routes/_root.tsx` | 4 タブの BottomTab + SideNav 出し分け + 右上 AvatarMenu |
| `src/components/layout/AppLayout.tsx` | **新規** (redesign §5.1) |
| `src/components/layout/AuthLayout.tsx` | **新規** |
| `src/components/layout/TopBar.tsx` | **新規**、右上 AvatarMenu slot |
| `src/components/layout/BottomTab.tsx` | **新規**、4 NavItem |
| `src/components/layout/SideNav.tsx` | **新規**、4 NavItem |
| `src/components/avatar/AvatarMenu.tsx` | **新規** (Radix DropdownMenu + Vaul Drawer 切替) |
| `src/components/today/Today.tsx` (旧 Home.tsx を rename) | 全差し替え |
| `src/components/today/TodayGreeting.tsx` | **新規** |
| `src/components/today/MainAttendanceCTA.tsx` | **新規** |
| `src/components/today/TimetableScroll.tsx` | **新規** (実態は Today.tsx 内 ul、共通化したければ別ファイル) |
| `src/components/today/OccurrenceLyricCard.tsx` | **新規** |
| `src/components/today/ReturnToNowFAB.tsx` | **新規** |
| `src/components/timetable/Timetable.tsx` | redesign §4.2 ベース + sheet 入れ替え |
| `src/components/timetable/PeriodChips.tsx` | **新規** (Radix ToggleGroup type=multiple) |
| `src/components/timetable/PeriodChipsPreview.tsx` | **新規** (連続判定 preview) |
| `src/components/timetable/MeetingCreateSheet.tsx` | NumberStepper 撤去、PeriodChips 採用 |
| `src/components/timetable/MeetingBlock.tsx` | redesign §P3.3.9 適用 (動的 tint) |
| `src/components/timetable/EmptyCell.tsx` | redesign §P3.3.10 適用 |
| `src/components/timetable/PeriodLabel.tsx` | **新規** (redesign §P3.3.11) |
| `src/components/timetable/TimetableGrid.tsx` | redesign §P3.3.8 適用 (gap-0 + 罫線) |
| `src/components/rooms/Rooms.tsx` | **新規** (/rooms) |
| `src/components/rooms/RoomDetail.tsx` | **新規** (/rooms/$id) |
| `src/components/rooms/RoomCard.tsx` | **新規** |
| `src/components/rooms/RoomCreateSheet.tsx` | **新規** |
| `src/components/rooms/JoinByCodeSheet.tsx` | **新規** |
| `src/components/rooms/JoinRoom.tsx` | **新規** (/rooms/join/$inviteCode) |
| `src/components/rooms/RoomWeekView.tsx` | **新規** |
| `src/components/rooms/RoomAvailabilityHeatmap.tsx` | **新規** |
| `src/components/rooms/RoomEventCreateSheet.tsx` | **新規** |
| `src/components/rooms/RoomEventDetailSheet.tsx` | **新規** |
| `src/components/rooms/AvailabilityCellPopover.tsx` | **新規** (Radix Popover) |
| `src/components/rooms/MemberMeetingPopover.tsx` | **新規** |
| `src/components/friends/Friends.tsx` | **新規** (/friends) |
| `src/components/friends/FriendCard.tsx` | **新規** |
| `src/components/friends/AddFriendSheet.tsx` | **新規** |
| `src/components/friends/AddFriendByInviteCode.tsx` | **新規** (/friends/add/$inviteCode) |
| `src/components/sheet/BottomSheet.tsx` | redesign §P3.3.6 適用 (handle w-8 / header 強化) |
| `src/components/sheet/SchoolDeptEditSheet.tsx` | (旧 SchoolPickerSheet + DepartmentPickerSheet 合体、AvatarMenu から trigger) |
| `src/components/sheet/AttendanceRuleSheet.tsx` | 既存維持、AvatarMenu から trigger に変更 |
| `src/components/sheet/SemesterListSheet.tsx` | **新規** (AvatarMenu から trigger、CRUD 内包) |
| `src/components/ui/Button.tsx` | redesign §P3.3.5 適用 |
| `src/components/ui/Input.tsx` | redesign §P3.3.1 適用 |
| `src/components/ui/Field.tsx` | redesign §P3.3.3 適用 (required prop 追加) |
| `src/components/ui/NumberStepper.tsx` | redesign §P3.3.4 適用、新規 Sheet では使われないが既存 (時限数編集) で残る |
| `src/api/queryKeys.ts` | **新規** (§8.1) |
| `src/api/hooks/useFriendships.ts` | **新規** |
| `src/api/hooks/useUserSearch.ts` | **新規** |
| `src/api/hooks/useRooms.ts` | **新規** |
| `src/api/hooks/useRoomWeek.ts` | **新規** |
| `src/api/hooks/useRoomEvents.ts` | **新規** |
| `src/api/hooks/useTodayOccurrences.ts` | 既存維持、queryKey 集約 (`QK.today(date)`) に置換 |
| `src/api/hooks/useUserTimetable.ts` | 既存 + bulk endpoint 用 hook 追加 |
| `src/lib/useMediaQuery.ts` | **新規** |
| `src/lib/useNow.ts` | **新規** (`setInterval(..., 60_000)`) |
| `src/lib/usePrefersReducedMotion.ts` | **新規** |
| `src/lib/useIsKeyboardOpen.ts` | **新規** (visualViewport.height で判定) |
| `src/lib/availabilityMatrix.ts` | **新規** (heatmap matrix 算出 + memoize 用 pure func) |
| (削除) `src/components/ui.tsx` | MVP 集約ファイル廃止、各コンポーネントに分割済 |
| (削除) `src/routes/me/*` | `/me` route ファイル群を削除 (redirect 1 行に置き換え) |

### 11.3 packages/shared

| ファイル | 変更 |
|---|---|
| `src/schemas/friendship.ts` | **新規** |
| `src/schemas/room.ts` | **新規** |
| `src/schemas/user.ts` | UserSearchDto 追加 |
| `src/schemas/meeting.ts` | MeetingBulkCreateInput 追加 |
| `src/enums.ts` | FriendshipStatus / RoomRole enum を type literal で export |

### 11.4 依存パッケージ追加

| package | 用途 |
|---|---|
| `@radix-ui/react-dropdown-menu` | AvatarMenu (PC) |
| `@radix-ui/react-toggle-group` | PeriodChips |
| `@radix-ui/react-popover` | AvailabilityCellPopover / MemberMeetingPopover |
| `vaul` | AvatarMenu (Mobile drawer) |
| `lucide-react` | 既存。Phase 4 で追加アイコン使用 |

(既存) `@radix-ui/react-dialog` などは不要 (自前 BottomSheet 維持)。

### 11.5 工数感

- API 側: 5-7 日 (services + routes + tests)
- Web 側: 8-12 日 (redesign 吸収 + Phase 4 新規 + tests)
- E2E (MCP): 1-2 日
- 合計: **2-3 週間** (1 developer 換算)

並列化するなら Friendship 系 / Room 系 / Today 刷新 / redesign 吸収 で 4 worktree に分ける選択肢あり (Touri 判断)。

---

## 12. 不採用案 (検討して却下、再検討ループ防止)

| 案 | 不採用理由 |
|---|---|
| 双方向 Friendship Edge x2 (A→B, B→A の 2 行で持つ) | 整合性管理が複雑 (常に 2 行同時 UPDATE)、1 行 + status enum で十分。Penmark / LINE 流に揃える |
| Friendship `senderId` `receiverId` のペア正規化 (min, max で内部保持) | Penmark 流の一方向式 (sender = 申請者) を採用するので正規化不要。逆方向 PENDING の自動 ACCEPTED 昇格で吸収 (★4) |
| Templates 画面を Phase 4 で廃止 | 既存 schema + 実装が活きているので残置。アバターメニュー経由でアクセス可。Phase 5 でルーム内統合検討 (★2 案 A) |
| Templates 画面をルーム内に統合 (案 B) | MVP で既存 schema を破壊しない方針に反する。Phase 5 で再評価 |
| `/me` を独立タブとして残す | タブ 5 個に戻ると Touri 要望「4 タブ + 右上アバター」に反する |
| 共有カレンダーの繰り返し event (RoomEventRecurrence model) | MVP 範囲外。TimeTree 同等機能は Phase 5 |
| `RoomInvite` テーブル分離 (複数招待リンク / 履歴) | MVP は Room.inviteCode 直書きで十分。Phase 5 で多様化時に分離 |
| `RoomMembership.shareTimetable` opt-in | MVP では全員強制共有。Phase 5 で opt-in 化検討 (★6) |
| OWNER 譲渡 / 複数 OWNER | MVP では作成者 1 人。owner 削除で room ごと cascade |
| サーバ側で「空き時間」計算する endpoint | フィルタリング (人選び) のたびに API 再叩きになる。クライアント計算で十分 (★8) |
| 15 分粒度 (672 slot) の availability | 1 学期分の時間割は period 単位 (84 slot) で十分。15 分単位は RoomEvent との衝突計算が必要なので Phase 5 で再評価 |
| Spotify scroll を framer-motion / motion-one で実装 | CSS transition + scrollIntoView で十分、依存追加コストなし (★9) |
| Spotify scroll で過去 occurrence を `display: none` で DOM 除去 | 1 日の occurrence は 5-10 件、全部 DOM に残して opacity だけ操作で十分 |
| Today: 連続コマを 1 mergedTitle カードで表示 (redesign §4.1 流) | Spotify scroll は occurrence 単位の縦並びが本質。merge すると「次のコマ」感覚が崩れる |
| `MeetingCreateInput` を破壊変更して新 schema に統一 | 既存 endpoint と既存テストを壊す。Phase 4 では `MeetingBulkCreateInput` を別 endpoint (`/bulk`) として追加し並存 |
| MeetingCreateSheet 内で曜日も chip multi-select | 1 sheet で曜日 N × 時限 M を一度に入力すると UX が複雑化。dayOfWeek は単一 select、period のみ multi (★ Touri 原文「複数選択 chip ボタン」は時限のみと解釈) |
| アバターメニューを Headless UI で実装 | Radix UI の方が ARIA 完備 (矢印キー、文字検索)、2026 デファクト |
| アバターメニュー PC / Mobile を同一 component で書く | Radix DropdownMenu と Vaul Drawer は API が違うので、`useMediaQuery` で switch する方が素直 |
| RoomEvent の編集を author 限定にする | TimeTree 方式 (member 誰でも編集) に揃える。MVP は信頼関係前提、Phase 5 で role 拡張時に再検討 |
| Friendship `BLOCKED` 時に逆方向の関係を物理削除 | DECLINED ↔ PENDING ↔ BLOCKED の status 遷移を 1 行で表現する方が DB シンプル。物理削除より UPDATE |
| 招待リンクの QR コード生成 | MVP では URL コピー + LINE 共有で十分。QR は Phase 5 |
| Spotify scroll の active 判定を秒単位 polling | 60s polling で十分 (時限の境界判定は分単位)。秒単位は CPU 浪費 |
| ChromeDevTools MCP で全テストを E2E 化 | jsdom + RTL でカバーできるものはそちらが速い。MCP は scroll / clipboard / 招待リンク跨ぎ session など jsdom 不可分のみに限定 |

---

## 13. Touri 承認段で確認したい論点

(承認ゲート時の議題候補。Architect 視点で迷いどころを列挙、Touri 判断で残置 or 変更)

1. **★ Today カード表示情報**: Spotify card に「教師名」を出さない方針で確定 (Touri 原文「何限・授業名・教室番号 だけ」)。これで OK か。「教師名も出して」になった場合、`<OccurrenceLyricCard>` に 1 行追加 + 状態仕様 233 を更新
2. **CTA 展開時の chip group**: 7 個 (出/欠/遅/早/公/休/未) が混雑する場合、5 個 (出/欠/遅/休/未) に絞る選択肢あり。MVP は 7 個で押す
3. **AvatarMenu の項目**: 7 項目 (学校・学科 / 出欠ルール / 学期管理 / 出席率 / みんなの時間割 / ログアウト) で過不足ないか。`プロフィール編集` (name 変更) を独立項目にするか header 内 inline edit にするかは Phase 5 判断
4. **Room の owner 削除時の挙動**: 現在は cascade で room 自体が消える。「owner 譲渡を実装してから削除」にしたいなら Phase 4 で実装 (3 日工数増)
5. **Friendship `DECLINED` 後の再申請**: 現在は同行を `PENDING` に戻す。これだと「拒否されたのに何度も送れる」 UX 懸念。回数制限 (例: 拒否後 24h はクールダウン) を入れるかは Touri 判断
6. **handle の必須化**: 現在 `handle: String?` で null 許容。検索したいなら setup wizard で「handle を決める」step を追加する選択肢あり。MVP は任意 (search hit しない user が存在しうる)
7. **公開招待リンクの安全性**: `/friends/add/$inviteCode` `/rooms/join/$inviteCode` を SNS で漏らした場合の被害想定。Friendship は 1 度 accept されれば終わり、Room は誰でも join できてしまう。Phase 5 で「招待リンクに承認待ち」を追加検討
8. **RoomEvent の MVP 表現**: 30 分単位の時刻入力 (`<input type="datetime-local">`) で十分か、日付 + period 選択にするか。本設計では `<input type="datetime-local">` (Phase 5 で period 連携)

---

## 14. 既知の罠 (実装で予防)

- **★ scrollIntoView の smooth scroll は jsdom で no-op**: 検証は MCP 経由
- **★ scrollIntoView の smooth scroll 中の onWheel 発火**: Chrome は発火しない、Firefox/Safari は仕様 grey。`isManualScroll` フラグ立つ条件を `deltaY !== 0` で絞れば誤動作回避
- **★ SQLite + Prisma の cascade**: `PRAGMA foreign_keys=ON` を都度確認。Friendship/Room/RoomEvent の cascade は Prisma schema で明示済
- **★ better-auth cookie test 互換**: signed cookie format に揃える ([gotcha/better-auth-test-cookie-must-match-hono-signed-format])
- **★ Hono error middleware の status code**: `c.json({...}, status)` 第二引数必須 ([gotcha/hono-error-middleware-apperror-status])
- **★ TanStack Router test の memory history**: `/friends/add/$inviteCode` 等のテストで必須 ([gotcha/tanstack-router-factory-test-memory-history])
- **★ design-spec implicit error codes**: 全 endpoint の status code を §6 で **必ず明示**してある ([gotcha/design-spec-implicit-vs-explicit-error-codes])
- **★ Prisma migration の null backfill**: User.inviteCode を NOT NULL にする前に SQL で backfill 必須 (§5.1)
- **★ Coolify deploy 時の prisma migrate**: Docker image に migration ファイルを含める ([gotcha/prisma-coolify-dockerfile])。Phase 4 migration ファイルが build context に入ることを Dockerfile で確認
- **★ Coolify 新規 app の `is_force_https_enabled=false`**: 既存 atender-api / atender-web は Phase 1 で設定済の前提だが、Phase 4 で新 service を増やさない方針なので追加対応不要

---

## 15. デプロイ

MVP doc §10 を踏襲。Phase 4 で **新規 service の増設はなし** (atender-api / atender-web の 2 service のまま)。

- Prisma migration: `prisma migrate deploy` を Dockerfile の build step に組み込み (既存)
- 環境変数追加: なし (Phase 4 で外部依存追加なし)
- Resend / Google OAuth 設定: 既存維持

---

(本 doc 終わり)
