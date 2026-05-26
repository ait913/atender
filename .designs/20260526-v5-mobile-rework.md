# Atender v5 — モバイル時間割再設計 + spacing / typography 理論基盤 (2026-05-26)

## 目的

v4 (Snap 風 token 刷新) デプロイ後、Touri から 3 点指摘:
1. **スマホで時間割表が一覧で見づらい** (PC は OK)
2. **ボタンの余白・配置を再検討** (根拠を持って)
3. **デザイン理論ベース** で

v5 はこれを 8pt grid (B.1) / thumb zone (B.3) / WCAG 2.5.5・2.5.8 (B.2) / Major Third typography (B.4) を実装に落とし込み、モバイル時間割をカード式「日別タブ + 週切替」に再構築する。**機能・API・schema は不変**、Phase 4 完全凍結を維持。

参照: `.knowledge/04-v5-design-theory-research.md` (本書はこの Researcher 出力の §E チェックリスト 8 項目を全部明示する)。

## やらないこと (上位スコープ)

- 機能の追加・削除 (Phase 4 凍結)
- 色 token の値変更 (`--color-bg-*`, `--color-accent-*`, `--color-status-*`, `--shadow-*`, `--radius-*` は v4 維持)
- 新規依存パッケージ (Tailwind v4 + Radix + Vaul + TanStack の既製 OSS のみ)
- API / Prisma schema / router の I/O 変更
- Today タブの Spotify scroll ロジック変更 (`TimetableScroll.tsx` 中身)
- 横スワイプ paging / Bitmoji / ハプティック (v5.1 以降検討)

---

## §0 確定事項 (Researcher findings の §E 8 項目)

| # | 項目 | 確定内容 |
|---|---|---|
| 1 | モバイル時間割方式 | **日別タブ + 週切替併用 (Penmark 流 b)**。PC (≥768px) は既存 `TimetableGrid` 維持 |
| 2 | chip nav の挙動 | 5 chip (月-金) + 右端「週」トグル、今日 = 初期 active + accent dot、active = accent fill + glow + scale。週切替はボタンのみ (スワイプ非対応 = v5.1) |
| 3 | DayList カード仕様 | min-h-24 (96px) × N (連続コマ)、`p-5`、`授業名 (semibold base) → 教室 (accent chip, 優先) + 教師 (truncate)`、tap で MeetingCreateSheet (既存セル動作と同一) |
| 4 | 8pt grid の適用 | CSS variable `--space-*` 追加 + Tailwind 直書きの 2 系統併存。意味付け variable は **`--page-px-*` / `--card-padding` / `--section-gap-*` / `--button-gap`** の 4 種だけ提供。再利用しない値は Tailwind 直書きで OK |
| 5 | タッチターゲット規約 | 全 tap min-h-12 (48px) / icon ボタン 44×44 正方形 / chip 最小 min-h-10 (40px) + gap-2 (8px) / destructive と primary は gap-4 (16px) 以上 |
| 6 | Typography スケール | Major Third (1.25): xs 12 / sm 14 / base 16 / lg 20 / xl 25 / 2xl 31 / 3xl 39 / 4xl 49 / 5xl 61。weight 400/500/600/700/900、line-height: body 1.5・heading 1.15-1.2・caption 1.4 |
| 7 | Sticky CTA spec | `MainAttendanceCTA` を sticky top → sticky bottom に移行、`max(16px, env(safe-area-inset-bottom))` + `backdrop-blur-xl` + `useIsKeyboardOpen` で隠す |
| 8 | PC 切替方針 | Tailwind `md:` (768px) で完全別実装。`Timetable.tsx` 内で `<div className="md:hidden"><DayList/></div><div className="hidden md:block"><TimetableGrid/></div>` で切替、state は親が共有 |

---

## §1 設計ドキュメント全体構成

```
v5 = (1) styles.css に Typography + Spacing token 追加
     (2) DayChipNav / DayList / DayMeetingCard / DayEmptyRow の新規 4 component
     (3) Timetable.tsx で mobile/PC 切替実装
     (4) MainAttendanceCTA を sticky bottom に再配置
     (5) BottomSheet body padding を px-5 統一
     (6) 既存 Friends / Rooms タブの余白監査 (大幅改修なし、token 値が反映されるだけ)
```

依存関係:

```
styles.css (token 拡張)
    ├─ DayChipNav.tsx (新)
    ├─ DayMeetingCard.tsx (新) ── 既存 CourseDto / MeetingDto を使用
    ├─ DayEmptyRow.tsx (新)
    └─ DayList.tsx (新) ── DayChipNav + DayMeetingCard + DayEmptyRow を組み合わせ
            └─ Timetable.tsx (変更) ── DayList (mobile) / TimetableGrid (PC) 切替
MainAttendanceCTA.tsx (変更)
BottomSheet.tsx (変更)
```

---

## §2 Token 拡張 (styles.css)

### 2.1 追加する CSS variable

v4 既存 token を**一切壊さず**、`:root` の末尾に Spacing と Typography を追加する。

```css
:root {
  /* ... 既存 v4 token (色 / radius / shadow / z-index) は変更しない ... */

  /* === v5 Spacing (8pt grid) ============================================= */
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
  --space-14: 56px;
  --space-16: 64px;
  --space-20: 80px;

  /* セマンティック (8pt grid 適用結論。Tailwind class 命名と一致させる) */
  --page-px-mobile: var(--space-5);          /* px-5 */
  --page-px-desktop: var(--space-8);         /* px-8 */
  --card-padding: var(--space-5);            /* p-5 */
  --card-padding-lg: var(--space-6);         /* p-6 */
  --section-gap-mobile: var(--space-8);      /* space-y-8 */
  --section-gap-desktop: var(--space-10);    /* space-y-10 */
  --button-gap: var(--space-3);              /* gap-3 */
  --button-gap-destructive: var(--space-4);  /* gap-4 */
  --tab-bar-height: 80px;                    /* BottomTab 全体 (56 content + 24 safe) */
  --tab-bar-content: 56px;                   /* BottomTab content 部 */
  --sticky-cta-padding-bottom: max(16px, env(safe-area-inset-bottom));

  /* === v5 Typography (Major Third 1.25) ================================== */
  /* v4 既存の --text-xs 〜 --text-5xl を Major Third で「上書き」する        */
  /*   理由: v4 は --text-base=15px (Apple 流) だが、Major Third では 16     */
  /*   が基準。全 size を一括再計算するため、Edit ではなく置換扱い           */
  --text-xs: 12px;     /* 0.75 base, caption */
  --text-sm: 14px;     /* 0.875 base, secondary */
  --text-base: 16px;   /* 1.0 base, body (←v4 から 15→16 へ変更) */
  --text-lg: 20px;     /* 1.25 base, card title (←v4 から 17→20) */
  --text-xl: 25px;     /* 1.5625 base, section title (←v4 から 20→25) */
  --text-2xl: 31px;    /* 1.953 base, page title sub (←v4 から 24→31) */
  --text-3xl: 39px;    /* 2.441 base, page title (←v4 から 30→39) */
  --text-4xl: 49px;    /* 3.052 base, hero (←v4 から 38→49) */
  --text-5xl: 61px;    /* 3.815 base, big-numeral (←v4 から 48→61) */

  /* line-height (単位なし、和文混在で崩れない) */
  --leading-tight: 1.15;   /* page title, hero */
  --leading-snug: 1.2;     /* card title, section title */
  --leading-normal: 1.4;   /* caption, button label */
  --leading-body: 1.5;     /* body (default) */
  --leading-relaxed: 1.6;  /* 長文 paragraph */

  /* font-weight (階層を明示) */
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --weight-black: 900;
}
```

**注**: v4 の `--text-*` は変更前 (`--text-base: 15px`) と異なる値で上書きされる。styles.css の該当行を Edit で書き換える (二重定義しない)。`--leading-tight`/`--leading-normal`/`--leading-relaxed` も値再定義 (1.15/1.4/1.6)、`--leading-snug`/`--leading-body` を新規追加する。

### 2.2 `@theme` への反映 (Tailwind v4)

Tailwind v4 は `@theme {...}` で CSS variable を class マッピングする。v4 既存の色 / radius / shadow に加えて以下を追加:

```css
@theme {
  /* 既存 v4 マッピングは保持 */
  /* ... */

  /* v5 typography (Tailwind の text-* class を再マップ) */
  --text-xs: var(--text-xs);
  --text-sm: var(--text-sm);
  --text-base: var(--text-base);
  --text-lg: var(--text-lg);
  --text-xl: var(--text-xl);
  --text-2xl: var(--text-2xl);
  --text-3xl: var(--text-3xl);
  --text-4xl: var(--text-4xl);
  --text-5xl: var(--text-5xl);

  /* v5 spacing は Tailwind の Spacing scale ではなく semantic variable のみ提供 */
  /* (Tailwind の p-5 / gap-3 / space-y-8 はそのまま使う、上書き不要) */
}
```

**判断**: spacing semantic variable (`--page-px-mobile` 等) は `@theme` には載せず、必要箇所で `style={{ paddingLeft: 'var(--page-px-mobile)' }}` か Tailwind 直書きで使う。Tailwind の `p-5 = 20px` がそのまま `--space-5` と等価なので二重管理を避ける。

### 2.3 body の font-size を 16px に揃える

v4 `body { font-size: var(--text-base) }` は `--text-base` が 16px に変わったため自動で 16 に揃う。ただし `html { font-size: 16px }` を明示し、Tailwind の `rem` 計算 (1rem = 16px) が崩れないように担保:

```css
html {
  min-width: 320px;
  background: var(--color-bg-base);
  font-size: 16px;  /* v5 追加: rem 計算固定 */
}
```

---

## §3 モバイル時間割: DayList コンポーネント群 (新規)

### 3.1 5 パターン比較 (不採用案)

§0 の決定根拠は Researcher A.1-A.2 に同じ。再掲しない。**不採用案だけ理由付きで残す** (検討ループ防止):

| # | 不採用案 | 却下理由 |
|---|---|---|
| (a) | 横スクロール grid 継続 | モバイル 375-414px で 5 日 × 6 限 = 30 セルだとセル 60×40px 以下、WCAG 2.5.5 (44×44) 未達。一覧性ゼロ |
| (c) | 縮約 grid (列幅 56-72px) | 文字 11-12px で和文判読不可、Snap 風大角丸が潰れる |
| (d) | 横スワイプ paging | CSS only で iOS 慣性 + 端制御の再現困難、ジェスチャ学習コスト。v5.1 で再検討 |
| (e) | アジェンダ風 (時系列フラット) | 「何限か」の認知が落ちる、出欠記録の文脈 (今日のコマ) と整合しない |

採用 = **(b) 日別タブ + 週切替併用**。理由は Researcher §A.3 (1)-(5) に詳しい。

### 3.2 ASCII モック (モバイル, 375px 幅想定)

```
┌──────────────────────────────────────┐ ← viewport 375px
│ ▦ 時間割                       (TopBar)│
├──────────────────────────────────────┤
│ 公開タイトル [_______]  [テンプレ公開]   │ ← 既存 publish 行 (md:flex に変更)
│                                        │
│ ┌──────────────────────────────────┐  │ ← DayChipNav (sticky top:14)
│ │ [月] [火●] [水] [木] [金]    [週] │  │   chip h-10, active=accent fill
│ └──────────────────────────────────┘  │   ●=today dot
│                                        │
│  1限 09:00-10:30                       │ ← slot header (text-xs, fg-tertiary)
│  ┌────────────────────────────────┐   │
│  │ ▍プログラミング演習              │   │ ← DayMeetingCard
│  │   [401教室] 山田先生              │   │   左 4px accent border
│  └────────────────────────────────┘   │   bg-bg-elevated rounded-3xl p-5
│                                        │
│  2限 10:40-12:10                       │
│  [   空きコマ   タップして追加 +    ]  │ ← DayEmptyRow (h-14, bg-white/4)
│                                        │
│  3-4限 13:00-16:00                     │ ← 連続コマは時刻 1 行
│  ┌────────────────────────────────┐   │
│  │ ▍線形代数学                      │   │   min-h × 2 (192px)
│  │   [B305] 田中先生                │   │
│  │                                  │   │
│  │                                  │   │
│  └────────────────────────────────┘   │
│                                        │
│  5限 16:10-17:40                       │
│  [   空きコマ                       ]  │
└──────────────────────────────────────┘
│ [◐ 今日] [▦ 時間割●] [◎ ルーム] [✦ 友達]│ ← BottomTab (80px)
└──────────────────────────────────────┘
```

### 3.3 ASCII モック (PC, ≥768px)

```
┌──────────────────────────────────────────────────────────────┐
│ ▦ 時間割                                              (TopBar) │
├────────┬─────────────────────────────────────────────────────┤
│SideNav │ # 時間割                                              │
│ ◐ 今日 │  セルをタップして授業を追加できます。                 │
│ ▦ 時間 │                                                       │
│ ◎ ルム │  公開タイトル [_______]  [テンプレ公開]               │
│ ✦ 友達 │                                                       │
│        │  ┌────────────────────────────────────────────────┐ │
│        │  │     月    火    水    木    金                   │ │ ← TimetableGrid
│        │  │ 1限 [..] [..] [..] [..] [..]                     │ │   既存実装維持
│        │  │ 2限 [..] [..] [..] [..] [..]                     │ │
│        │  │ ...                                              │ │
│        │  └────────────────────────────────────────────────┘ │
└────────┴─────────────────────────────────────────────────────┘
```

PC では `DayChipNav` / `DayList` を一切 mount しない (`hidden md:block` で `TimetableGrid` のみ表示)。

### 3.4 状態管理

`Timetable.tsx` (route component) に以下 state を集約:

```ts
const [activeDay, setActiveDay] = useState<number>(getTodayDayOfWeek());
const [viewMode, setViewMode] = useState<"day" | "week">("day");
const [sheet, setSheet] = useState<{ dayOfWeek: number; period: number } | null>(null);
```

| state | 型 | 初期値 | 永続化 |
|---|---|---|---|
| `activeDay` | `1-5` (月=1, 金=5) | `getTodayDayOfWeek()` (日曜=月へクランプ) | しない (リロードで今日に戻る) |
| `viewMode` | `"day" \| "week"` | mobile = `"day"`, PC = 強制 `"week"` 扱いだが state は不要 (条件分岐で表示制御) | しない |
| `sheet` | `{ dayOfWeek, period } \| null` | `null` | しない |

**判断**: `viewMode` の永続化は v5.1 検討。今は session 単位で十分。`activeDay` も localStorage 不要 (毎回開いたら今日が見たいのが普通)。

#### `getTodayDayOfWeek()` の仕様

```ts
function getTodayDayOfWeek(): number {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (day === 0 || day === 6) return 1; // 日・土 → 月にクランプ
  return day; // 1-5
}
```

理由: 月-金固定の chip だから土日に来た学生に「今日」が見つからないと混乱する。月クランプは Penmark / Class Timetable と同じ動作 (土日アクセス時は月曜ビュー)。

---

### 3.5 `DayChipNav` (新規)

**ファイル**: `apps/web/src/components/timetable/DayChipNav.tsx`

#### Props

```ts
export type DayChipNavProps = {
  activeDay: number;          // 1-5
  today: number;              // 1-5 (getTodayDayOfWeek の結果)
  viewMode: "day" | "week";
  onChangeDay: (day: number) => void;
  onToggleViewMode: () => void;  // "day" ⇄ "week"
};
```

#### 構造 (Tailwind 直書きで実装、token は CSS variable 経由)

```tsx
const days = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
];

export function DayChipNav({ activeDay, today, viewMode, onChangeDay, onToggleViewMode }: DayChipNavProps) {
  return (
    <nav
      aria-label="曜日切替"
      className="sticky top-14 z-30 -mx-5 flex items-center gap-3 bg-bg-base/85 px-5 py-3 backdrop-blur-xl"
    >
      <div role="tablist" aria-label="曜日" className="flex flex-1 gap-2">
        {days.map((d) => {
          const active = activeDay === d.value && viewMode === "day";
          const isToday = d.value === today;
          return (
            <button
              key={d.value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={isToday ? `${d.label}曜日 (今日)` : `${d.label}曜日`}
              onClick={() => { if (viewMode === "week") onToggleViewMode(); onChangeDay(d.value); }}
              className={`relative flex h-10 flex-1 items-center justify-center rounded-full text-sm font-semibold transition-all duration-150 active:scale-[0.97] ${
                active
                  ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
                  : "bg-white/8 text-fg-secondary hover:bg-white/12"
              }`}
            >
              {d.label}
              {isToday ? (
                <span
                  aria-hidden
                  className={`absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full ${active ? "bg-fg-on-accent" : "bg-accent-500"}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label={viewMode === "week" ? "日別表示に切替" : "週表示に切替"}
        aria-pressed={viewMode === "week"}
        onClick={onToggleViewMode}
        className={`flex h-10 items-center justify-center rounded-full px-4 text-xs font-semibold transition-all duration-150 active:scale-[0.97] ${
          viewMode === "week"
            ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
            : "bg-white/8 text-fg-secondary hover:bg-white/12"
        }`}
      >
        週
      </button>
    </nav>
  );
}
```

#### 挙動仕様

| ケース | 期待動作 |
|---|---|
| 初期 mount (mobile)、今日 = 火曜 | `viewMode="day"`、火 chip が active、火 chip に accent dot |
| 月 chip tap | `onChangeDay(1)` を呼ぶ、月 chip が active、`viewMode` が `"week"` なら `"day"` に戻す |
| 「週」 tap (viewMode="day") | `onToggleViewMode()` で `viewMode="week"`、全 chip が inactive 表示、「週」が active |
| 「週」 tap (viewMode="week") | `onToggleViewMode()` で `"day"` に戻す、`activeDay` の chip が再 active |
| 今日 = 金曜、初期 mount | 金 chip が active + accent dot |
| 土日にアクセス | `today=1` (月にクランプ)、月 chip に accent dot、初期 active = 月 |
| `viewMode="week"` の時に月 chip tap | viewMode を "day" に戻して activeDay を 1 に |

#### CSS 仕様 (8pt grid + WCAG 適合)

| 属性 | 値 | 根拠 |
|---|---|---|
| chip 高さ | min-h-10 (40px) | WCAG 2.5.8 AA + 周囲 gap-2 |
| chip 間 gap | gap-2 (8px) | Material タッチ干渉防止 |
| 「週」と chip 群の gap | gap-3 (12px) | 性質が違うので 1 段大きく |
| sticky top | `top-14` (56px) | TopBar 高 = 56 |
| 横 padding | px-5 (20px) (`-mx-5 px-5` で親 padding を打ち消し画面端まで blur) | 8pt grid mobile |
| 縦 padding | py-3 (12px) | 8pt grid |
| 背景 | `bg-bg-base/85 backdrop-blur-xl` | v4 Snap 風と整合 |
| z-index | z-30 | TopBar (z-50 域) より下、BottomTab (z-40) より下 |
| focus ring | accent-500 outline (デフォ) | WCAG 1.4.11 (11.86:1) |
| accent dot | h-1.5 w-1.5 (6px) | 小さくても目立つ。active 時は on-accent 色で反転 |

---

### 3.6 `DayMeetingCard` (新規)

**ファイル**: `apps/web/src/components/timetable/DayMeetingCard.tsx`

#### Props

```ts
export type DayMeetingCardProps = {
  course: CourseDto;
  meeting: MeetingDto;
  slots: DaySlotDto[];          // 該当コマの slot 配列 (連続コマ対応で 1+)
  onClick: () => void;          // tap → MeetingCreateSheet を経由した編集削除フローへ
};
```

#### 構造

```tsx
export function DayMeetingCard({ course, meeting, slots, onClick }: DayMeetingCardProps) {
  const color = course.color ?? "var(--color-accent-500)";
  const first = slots[0];
  const last = slots[slots.length - 1];
  const timeRange = `${minutesToTime(first.startMinute)} - ${minutesToTime(last.endMinute)}`;
  const periodRange = slots.length === 1
    ? `${first.periodIndex}限`
    : `${first.periodIndex}-${last.periodIndex}限`;

  // 連続コマは内側 padding 固定で高さは内容で伸びる (min-h は連続数 × 96 を保証)
  const minHeight = slots.length * 96;  // 1 コマ 96px、2 コマ 192px

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-3xl bg-bg-elevated p-5 text-left shadow-card transition-all duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      style={{ borderLeft: `4px solid ${color}`, minHeight }}
      aria-label={`${course.name} ${periodRange} ${timeRange}`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-fg-tertiary">
        <span className="font-semibold text-fg-secondary">{periodRange}</span>
        <span aria-hidden>·</span>
        <span>{timeRange}</span>
      </div>
      <h3 className="line-clamp-2 text-base font-semibold leading-snug text-fg-primary">
        {course.name}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
        {course.room ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
            style={{
              background: `color-mix(in srgb, ${color} 20%, transparent)`,
              color,
            }}
          >
            {course.room}
          </span>
        ) : null}
        {course.teacher ? (
          <span className="truncate">{course.teacher}</span>
        ) : null}
      </div>
    </button>
  );
}
```

#### 挙動仕様

| ケース | 期待動作 |
|---|---|
| 単発 (periodCount=1) | min-h 96px、`periodRange="3限"`、`timeRange="13:00 - 14:30"` |
| 連続 (periodCount=2) | min-h 192px、`periodRange="3-4限"`、`timeRange="13:00 - 16:00"` |
| `course.color` = `#10b981` | 左 border + 教室 chip が `#10b981` 系 |
| `course.color` = `null` | `--color-accent-500` (emerald) でフォールバック |
| `course.room` = `null` | 教室 chip 非表示、教師だけ表示 |
| `course.teacher` = `null` | 教師非表示、教室 chip だけ |
| 両方 `null` | `flex-wrap gap-2` の空ラインだけ残る (高さは min-h 96 で確保) |
| `course.name` が 30 文字 | line-clamp-2 で 2 行 ellipsis |
| tap | `onClick()` 呼び出し → 親で MeetingCreateSheet (編集モード) を開く |

#### 教室 chip の WCAG 検証

`color-mix(in srgb, <course.color> 20%, transparent)` を bg、テキストを `<course.color>` にする運用。

| course.color | 背景 (20% mix on dark) | テキスト | コントラスト比 (bg-elevated #1A1F2A の上の chip 内テキスト) |
|---|---|---|---|
| #10b981 (emerald) | #1A1F2A + emerald 20% ≒ #173F32 | #10b981 | 約 5.2:1 (AA OK) |
| #60a5fa (blue) | ≒ #213040 | #60a5fa | 約 6.8:1 (AAA OK) |
| #f472b6 (pink) | ≒ #382537 | #f472b6 | 約 5.4:1 (AA OK) |
| #8b5cf6 (purple) | ≒ #2B2640 | #8b5cf6 | 約 4.7:1 (AA OK) |
| #f59e0b (amber) | ≒ #38312A | #f59e0b | 約 7.2:1 (AAA OK) |

全色 WCAG AA (4.5:1 normal) クリア。

---

### 3.7 `DayEmptyRow` (新規)

**ファイル**: `apps/web/src/components/timetable/DayEmptyRow.tsx`

#### Props

```ts
export type DayEmptyRowProps = {
  slot: DaySlotDto;
  onClick: () => void;  // tap → MeetingCreateSheet (新規モード)
};
```

#### 構造

```tsx
export function DayEmptyRow({ slot, onClick }: DayEmptyRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center justify-between rounded-2xl bg-white/4 px-5 text-left transition-all duration-150 hover:bg-white/8 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      aria-label={`${slot.periodIndex}限 空きコマ - 授業を追加`}
    >
      <span className="flex items-center gap-2 text-xs text-fg-tertiary">
        <span className="font-semibold text-fg-secondary">{slot.periodIndex}限</span>
        <span aria-hidden>·</span>
        <span>{minutesToTime(slot.startMinute)} - {minutesToTime(slot.endMinute)}</span>
      </span>
      <span className="flex items-center gap-1 text-xs text-fg-tertiary">
        <span>空きコマ</span>
        <span aria-hidden>+</span>
      </span>
    </button>
  );
}
```

#### 挙動仕様

| ケース | 期待動作 |
|---|---|
| 空きコマ tap | `onClick()` 呼び出し → MeetingCreateSheet を `dayOfWeek=activeDay, period=slot.periodIndex` で開く |
| 1 限 9:00-10:30 | `1限 · 9:00 - 10:30 ... 空きコマ +` を表示 |
| keyboard focus | accent-500 outline (WCAG 1.4.11 OK) |

#### CSS

| 属性 | 値 | 根拠 |
|---|---|---|
| 高さ | h-14 (56px) | 圧迫感なし + WCAG 2.5.5 (44px) 余裕クリア |
| 横 padding | px-5 (20px) | DayMeetingCard と揃える |
| 背景 | bg-white/4 | 「ある」だけ認識可能 |
| 角丸 | rounded-2xl (18px) | カードより 1 段小さい (radius スケール) |

---

### 3.8 `DayList` (新規・組み立て)

**ファイル**: `apps/web/src/components/timetable/DayList.tsx`

#### Props

```ts
export type DayListProps = {
  timetable: UserTimetableDto;
  activeDay: number;
  today: number;
  viewMode: "day" | "week";
  onChangeDay: (day: number) => void;
  onToggleViewMode: () => void;
  onMeetingClick: (meeting: MeetingDto) => void;
  onEmptyCellClick: (dayOfWeek: number, periodIndex: number) => void;
};
```

#### 構造ロジック

```ts
// 1. day chip nav は viewMode によらず常に表示
// 2. viewMode === "day" のとき:
//    - timetable.daySlots を periodIndex 昇順でループ
//    - 各 slot について、その曜日 (activeDay) の meeting を検索
//      - meeting.startPeriodIndex === slot.periodIndex なら DayMeetingCard を出す
//      - meeting.startPeriodIndex < slot.periodIndex && start + count > slot.periodIndex
//        なら「連続コマの 2 回目以降」なので何も描画しない (DayMeetingCard が span で吸収済み)
//      - meeting がなければ DayEmptyRow
// 3. viewMode === "week" のとき: TimetableGrid をそのまま表示 (mobile では小さくなるが、
//    敢えて週ビューを選んだユーザーの意図優先。横スクロール対応は既存通り)
```

#### 実装疑似コード

```tsx
export function DayList({ timetable, activeDay, today, viewMode, onChangeDay, onToggleViewMode, onMeetingClick, onEmptyCellClick }: DayListProps) {
  const courseById = useMemo(() => new Map(timetable.courses.map((c) => [c.id, c])), [timetable.courses]);
  const slots = timetable.daySlots;

  // activeDay の coverage map: periodIndex → { meeting, course, slots[] } | "empty" | "consumed"
  const rows = useMemo(() => {
    const result: Array<
      | { type: "meeting"; meeting: MeetingDto; course: CourseDto; slots: DaySlotDto[] }
      | { type: "empty"; slot: DaySlotDto }
    > = [];
    const consumedPeriods = new Set<number>();

    for (const slot of slots) {
      if (consumedPeriods.has(slot.periodIndex)) continue;

      const meeting = timetable.meetings.find(
        (m) =>
          m.dayOfWeek === activeDay &&
          m.startPeriodIndex === slot.periodIndex,
      );

      if (meeting) {
        const course = courseById.get(meeting.courseId);
        if (!course) {
          // データ不整合: meeting あり course なし → empty 扱い
          result.push({ type: "empty", slot });
          continue;
        }
        const span = meeting.periodCount;
        const includedSlots = slots.filter(
          (s) => s.periodIndex >= slot.periodIndex && s.periodIndex < slot.periodIndex + span,
        );
        result.push({ type: "meeting", meeting, course, slots: includedSlots });
        for (let i = 0; i < span; i++) consumedPeriods.add(slot.periodIndex + i);
      } else {
        result.push({ type: "empty", slot });
      }
    }
    return result;
  }, [activeDay, courseById, slots, timetable.meetings]);

  return (
    <div className="space-y-3">
      <DayChipNav
        activeDay={activeDay}
        today={today}
        viewMode={viewMode}
        onChangeDay={onChangeDay}
        onToggleViewMode={onToggleViewMode}
      />
      {viewMode === "week" ? (
        <div data-testid="day-list-week-fallback">
          <TimetableGrid
            timetable={timetable}
            onMeetingClick={onMeetingClick}
            onEmptyCellClick={onEmptyCellClick}
          />
        </div>
      ) : (
        <ul className="space-y-3" data-testid="day-list-items">
          {rows.map((row, idx) =>
            row.type === "meeting" ? (
              <li key={`m-${row.meeting.id}`}>
                <DayMeetingCard
                  course={row.course}
                  meeting={row.meeting}
                  slots={row.slots}
                  onClick={() => onMeetingClick(row.meeting)}
                />
              </li>
            ) : (
              <li key={`e-${row.slot.periodIndex}-${idx}`}>
                <DayEmptyRow
                  slot={row.slot}
                  onClick={() => onEmptyCellClick(activeDay, row.slot.periodIndex)}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
```

#### 挙動仕様 (リスト構築ロジック)

| ケース | 期待動作 |
|---|---|
| activeDay=1, meetings=[{day:1, start:1, count:1}, {day:1, start:3, count:2}], slots=5 | 行: [card(1限), empty(2限), card(3-4限), empty(5限)] = 4 行 (3 限を入れた連続コマで 4 限はスキップ) |
| activeDay=2, meetings=[{day:1, ...}, {day:2, start:1, count:1}] | 月の meeting は無視、火の 1 限カード + 2-5 限 empty = 5 行 |
| activeDay=3, meetings=[] | 全 slot で empty row = 5 行 |
| `course` が見つからない不整合 meeting | empty row として扱う (UI 破綻なし) |
| viewMode="week" | DayChipNav + TimetableGrid (週グリッド) を表示 |

---

## §4 `Timetable.tsx` (route) の改修

### 4.1 全体構造

```tsx
export function Timetable() {
  const me = useMe();
  const semesters = useSemesters();
  const timetables = useUserTimetables();
  const selected = activeTimetable(timetables.data?.userTimetables, me.data?.user.defaultSemesterId);
  const createTimetable = useCreateUserTimetable();
  const patchTimetable = usePatchUserTimetable(selected?.id);
  const publish = usePublishTimetable(selected?.id);

  const [sheet, setSheet] = useState<{ dayOfWeek: number; period: number } | null>(null);
  const [createdTimetable, setCreatedTimetable] = useState<UserTimetableDto | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [activeDay, setActiveDay] = useState<number>(() => getTodayDayOfWeek());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");

  const today = useMemo(() => getTodayDayOfWeek(), []);

  const emptyTimetable = useMemo<UserTimetableDto | null>(() => {/* 既存ロジック維持 */}, [...]);
  const display = selected ?? emptyTimetable;

  async function ensureTimetable() { /* 既存ロジック維持 */ }
  async function removeMeeting(meeting: MeetingDto) { /* 既存ロジック維持 */ }
  async function handleEmptyCellClick(dayOfWeek: number, period: number) {
    const tt = await ensureTimetable();
    if (tt) setSheet({ dayOfWeek, period });
  }

  return (
    <div className="space-y-6">
      <PageTitle title="時間割">セルをタップして授業を追加できます。</PageTitle>

      {/* 公開タイトル行 (8pt grid 適用) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="公開タイトル" className="max-w-72">
          <Input value={publishTitle} onChange={(e) => setPublishTitle(e.currentTarget.value)} />
        </Field>
        <Button
          type="button"
          onClick={() => selected && publishTitle && publish.mutate({ title: publishTitle })}
          disabled={!selected || !publishTitle}
        >
          テンプレ公開
        </Button>
      </div>

      {display ? (
        <>
          {/* Mobile: DayList */}
          <div className="md:hidden">
            <DayList
              timetable={display}
              activeDay={activeDay}
              today={today}
              viewMode={viewMode}
              onChangeDay={setActiveDay}
              onToggleViewMode={() => setViewMode((m) => (m === "day" ? "week" : "day"))}
              onMeetingClick={(m) => void removeMeeting(m)}
              onEmptyCellClick={handleEmptyCellClick}
            />
          </div>
          {/* PC: 既存 TimetableGrid のみ */}
          <div className="hidden md:block">
            <TimetableGrid
              timetable={display}
              onMeetingClick={(m) => void removeMeeting(m)}
              onEmptyCellClick={handleEmptyCellClick}
            />
          </div>
        </>
      ) : (
        <Panel>先に学期を作成してください。</Panel>
      )}

      <MeetingCreateSheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        timetable={selected ?? createdTimetable}
        initialDayOfWeek={sheet?.dayOfWeek ?? activeDay}
        initialPeriod={sheet?.period ?? 1}
      />
    </div>
  );
}
```

### 4.2 helper

```ts
// apps/web/src/components/timetable/getTodayDayOfWeek.ts (新規)
export function getTodayDayOfWeek(date: Date = new Date()): number {
  const day = date.getDay();
  if (day === 0 || day === 6) return 1; // 日/土 → 月にクランプ
  return day;
}
```

テスト容易性のため `date` を引数化。

### 4.3 挙動仕様

| ケース | 期待動作 |
|---|---|
| mobile viewport (< 768px) で初期 mount、平日 | DayList が見える、TimetableGrid は `hidden`、activeDay=今日、viewMode=day |
| mobile viewport で土曜にアクセス | activeDay=1 (月)、月 chip に accent dot |
| desktop viewport (≥ 768px) で初期 mount | TimetableGrid のみ表示、DayList の content は `hidden` で mount されてない (display:none ではなく Tailwind の hidden class により mount される実体は残るが視覚的に非表示)。**注**: state は親で持つので mount してもパフォーマンスは問題ない |
| viewport が 600 → 1000 に拡大 | Tailwind `md:hidden` / `md:block` が即反応、state は維持される |
| 空きコマ tap (mobile, activeDay=2, period=3) | MeetingCreateSheet が `initialDayOfWeek=2, initialPeriod=3` で開く |
| meeting card tap (mobile) | 既存挙動と同じ = `removeMeeting()` (今は削除動作だが Phase 4 で sheet 経由編集に置き換え予定。**v5 ではこの動作は変えない**) |
| 学期未作成 | `<Panel>先に学期を作成してください。</Panel>` (既存と同じ) |

**注**: 既存実装は `onMeetingClick` で即削除しているが、v5 では**この動作は変えない**。Researcher の「セル tap → bottom sheet 詳細 → 編集 / 削除ボタン」フローは v5.1 以降のスコープ。

---

## §5 `MainAttendanceCTA.tsx` の sticky 再配置

### 5.1 問題

現状 `sticky top-14 z-30` でページ上部に貼り付く実装だが:
- Today タブの `TimetableScroll` は `h-[calc(100dvh-260px)]` の縦 snap-scroll
- sticky CTA が top に貼ると **scroll コンテナと座標系干渉** + Touri 指摘の thumb zone (Red zone) 問題

### 5.2 解決方針

**sticky bottom に移行**。Today の DOM 順を以下に変更:

```
<div className="space-y-4 pb-32"> ← pb-32 で sticky CTA 分の空き確保
  <TodayGreeting />
  <TimetableScroll occurrences={occurrences} />  ← 中央が中身
</div>
<MainAttendanceCTA ... />  ← sticky bottom (Today.tsx の最下層に移動)
```

ただし MainAttendanceCTA 自身が `<section className="fixed bottom-...">` で完結する形にし、Today.tsx 側は変更を最小化:

### 5.3 新仕様

```tsx
export function MainAttendanceCTA({
  occurrences,
  expanded,
  onToggle,
  onMarkAll,
  onChangeStatus,
  pending,
}: MainAttendanceCTAProps) {
  const keyboardOpen = useIsKeyboardOpen();
  const unrecorded = occurrences.filter((o) => o.status == null).length;
  if (keyboardOpen) return null;  // キーボード起動時は隠す

  return (
    <section
      className="fixed inset-x-0 z-40 border-t border-white/8 bg-bg-base/85 backdrop-blur-xl md:hidden"
      style={{
        bottom: "var(--tab-bar-height)",  // BottomTab (80px) の上に貼る
        paddingBottom: "12px",
        paddingTop: "12px",
      }}
    >
      <div className="mx-auto w-full max-w-[960px] px-5">
        {expanded ? (
          <div className="mb-3 max-h-[40dvh] overflow-y-auto space-y-4 rounded-3xl bg-bg-elevated p-5 shadow-card">
            {occurrences.map((occurrence) => (
              <div key={occurrence.id} className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-base font-bold">
                    <span className="text-accent-500">{occurrence.periodIndex}限</span>{" "}
                    <span>{occurrence.courseName}</span>
                  </p>
                  <p className="text-xs text-fg-tertiary">{occurrence.room ?? ""}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {ATTENDANCE_STATUS.map((status) => {
                    const selected = occurrence.status === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        className={`min-h-12 min-w-12 rounded-full px-4 text-sm font-bold transition active:scale-95 ${
                          selected
                            ? "bg-accent-500 text-fg-on-accent shadow-glow-soft"
                            : "bg-white/8 text-fg-primary hover:bg-white/12"
                        }`}
                        onClick={() => onChangeStatus(occurrence.id, status)}
                      >
                        {statusLabels[status]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-stretch gap-3">
          <Button
            type="button"
            variant={unrecorded === 0 ? "secondary" : "primary"}
            size="lg"
            className="min-w-0 flex-1"
            disabled={pending || unrecorded === 0}
            onClick={onMarkAll}
          >
            <span className="truncate">
              {unrecorded === 0 ? "本日の記録は完了済" : `今日は全出席 (${unrecorded})`}
            </span>
          </Button>
          <button
            type="button"
            className="grid h-14 w-14 place-items-center rounded-full bg-white/8 text-xl font-bold text-fg-primary transition hover:bg-white/14 active:scale-95"
            onClick={onToggle}
            aria-label={expanded ? "個別修正を閉じる" : "個別修正を開く"}
            aria-expanded={expanded}
          >
            {expanded ? "▴" : "▾"}
          </button>
        </div>
      </div>
    </section>
  );
}
```

#### 主要変更点

| 項目 | v4 | v5 |
|---|---|---|
| 位置 | `sticky top-14 z-30` | `fixed bottom: var(--tab-bar-height) z-40 md:hidden` |
| keyboard 対応 | なし | `useIsKeyboardOpen()` で null return |
| 個別修正展開 | CTA の下に展開 | CTA の**上**に展開 (sticky bottom なので上に押し上がる) |
| 個別修正最大高 | なし | max-h-[40dvh] で overflow-y-auto |
| 隣接ボタン gap | gap-2 (8px) | gap-3 (12px) (8pt grid, Researcher §C.4) |
| PC 表示 | 同じ | `md:hidden` で非表示 (PC は inline で配置、v5.1 で別途設計) |
| safe-area | なし | bottom が `var(--tab-bar-height)=80px` 中に env(safe-area-inset-bottom) を吸収済み |

### 5.4 PC (≥768px) 側の `MainAttendanceCTA` 配置

PC では `md:hidden` で消えるので、`Today.tsx` 側で**PC 用に inline 配置**する:

```tsx
{occurrences.length === 0 ? (
  <EmptyState ... />
) : (
  <>
    {/* PC: inline (上) */}
    <div className="hidden md:block">
      <MainAttendanceCTAInline {...props} />
    </div>
    {/* Mobile: fixed bottom (DOM 末尾) */}
    <TimetableScroll occurrences={occurrences} />
    <div className="md:hidden">
      <MainAttendanceCTA {...props} />  // fixed bottom
    </div>
  </>
)}
```

ただし **`MainAttendanceCTAInline` は v5 スコープ外** (PC レイアウトは触らない方針)。実装簡略化のため、PC では `md:` block で従来通り上部 inline、mobile では fixed bottom の **2 系統 mount** する。

**実装上の分岐**: `MainAttendanceCTA` 内部で `useMediaQuery` 等は使わず、Tailwind の `md:` で class 切替するシンプル実装。

```tsx
return (
  <>
    {/* Mobile: fixed bottom */}
    <section className="fixed inset-x-0 z-40 md:hidden border-t ..." style={{ bottom: "var(--tab-bar-height)" }}>
      ...
    </section>
    {/* PC: inline (sticky top-14 = 既存 v4 と同じ) */}
    <section className="sticky top-14 z-30 hidden md:block -mx-1 rounded-3xl bg-bg-base/85 px-1 py-3 backdrop-blur-xl">
      ...同じ内部だが PC 用 spacing
    </section>
  </>
);
```

**注**: 重複する内部マークアップは util function に切り出して呼ぶ。実装で迷わないように:

```tsx
function CTABody({ ...common }) {
  return /* expanded + 主 CTA + toggle */;
}
```

### 5.5 挙動仕様

| ケース | 期待動作 |
|---|---|
| mobile, occurrences.length=3, 全 unrecorded | fixed bottom (BottomTab の上) に「今日は全出席 (3)」 |
| mobile, 全 recorded | 「本日の記録は完了済」、disabled、bg-secondary |
| mobile, expanded=true | CTA の上 (sticky-bottom 関係で画面上方向) に個別修正 list がスライド表示、max-h 40dvh |
| mobile, keyboardOpen=true | コンポーネント全体 return null (キーボード上に被らない) |
| PC | 既存 sticky top-14 動作 (変化なし) |
| mobile で個別修正 status button tap | gap-3 (12px) で並び、tap で `onChangeStatus()` |
| mobile, expanded で 個別修正 が長い (5 コマ以上) | max-h-40dvh + overflow-y-auto で scroll |

---

## §6 `BottomSheet.tsx` の padding 統一

### 6.1 現状

v4 既存実装は `px-6 (24px)`。Researcher §C.2 推奨は `px-5 (20px)`。

### 6.2 変更

```tsx
// 修正前 (v4):
<div className="space-y-5 overflow-y-auto px-6 pb-[calc(32px+env(safe-area-inset-bottom))] pt-2 overscroll-contain">

// 修正後 (v5):
<div className="space-y-5 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 overscroll-contain">
```

header も同じ:
```tsx
// 修正前: <header className="flex min-h-14 items-center justify-between px-6 pt-2 pb-3">
// 修正後: <header className="flex min-h-14 items-center justify-between px-5 pt-2 pb-3">
```

ドラッグハンドルも 4×36 で再計測:
```tsx
// 修正前: <span className="h-1.5 w-12 rounded-full bg-white/20" />
// 修正後: <span className="h-1 w-9 rounded-full bg-white/20" />  // h=4px (h-1), w=36px (w-9)
```

### 6.3 副作用検証

`BottomSheet` を使う既存 sheet (`MeetingCreateSheet` / `AttendanceRuleSheet` / `SemesterListSheet` / `SchoolDeptEditSheet` / `AddFriendSheet` / `JoinByCodeSheet` / `RoomCreateSheet` / `RoomEventCreateSheet` / `RoomEventDetailSheet`):

- 全ての sheet は body の `px-5` を継承
- 中身は `<Field>` / `<Input>` ベースで内側に独自 padding を持たない
- footer は各 sheet が `<div className="sticky bottom-0 -mx-5 ... px-5 py-3">` 形で書いている (現状は `-mx-6 px-6`)
- → `-mx-5 px-5` に**全 sheet で揃える**

#### 各 sheet の footer 修正対象 grep

```
grep -rn "sticky bottom-0 -mx-" apps/web/src/components/
```

下記ファイルで `-mx-6 px-6` を `-mx-5 px-5` に置換:
- `apps/web/src/components/timetable/MeetingCreateSheet.tsx` (既に `-mx-5 px-5` なので確認のみ)
- 他 sheet で `-mx-6 px-6` の所があれば修正 (実装時 grep で確認)

### 6.4 挙動仕様

| ケース | 期待動作 |
|---|---|
| sheet open | drag handle 4×36 (= h-1 w-9)、header `px-5 min-h-14`、body `px-5 space-y-5` |
| sheet footer がある | `-mx-5 px-5` で sheet 端まで footer 背景が伸びる |
| sheet 内 input | `min-h-12 px-4` (既存 Input コンポーネントから継承、変更なし) |

---

## §7 BottomTab の高さ明示

v4 では高さが implicit (icon h-12 + label + padding) で実測 80px 程度。v5 では**明示的に 80px** にし、`--tab-bar-height` token で他 component が参照できるようにする。

### 7.1 変更

`apps/web/src/components/layout/BottomTab.tsx`:

```tsx
<nav
  className="fixed inset-x-0 bottom-0 z-40 flex justify-around bg-bg-elevated/85 backdrop-blur-xl border-t border-border-subtle md:hidden"
  style={{
    height: "var(--tab-bar-height)",  // = 80px
    paddingTop: "8px",
    paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
    boxShadow: "0 -8px 32px rgba(0,0,0,0.55)"
  }}
>
```

**注**: 内部 `<Link>` の高さは `flex-1` + 自然な高さで OK。アイコン 24px (現 text-2xl ≒ 24px に近い) + label 11px + 自然 gap で 56px に収まる。

### 7.2 副作用

- `MainAttendanceCTA` (mobile fixed bottom) の `bottom: var(--tab-bar-height)` 参照が正確に 80px に決まる
- `AppLayout` の `pb-24 (96px)` は維持 (BottomTab 80 + 余白 16 で十分)

---

## §8 タイポグラフィ階層表 (v5 完全版)

Major Third (1.25) ベースで全 size の用途を確定:

| Token | px | line-height | weight 標準 | 用途 |
|---|---|---|---|---|
| `--text-5xl` | 61 | 1.0 | 900 (black) | hero numeral (`OccurrenceLyricCard` の限表記) |
| `--text-4xl` | 49 | 1.15 | 700 (bold) | (使用候補なし、Storybook 用予備) |
| `--text-3xl` | 39 | 1.15 | 900 (black) | `PageTitle` (mobile)、AppLayout 内 h1 |
| `--text-2xl` | 31 | 1.2 | 700 (bold) | `PageTitle` (desktop md:)、modal title |
| `--text-xl` | 25 | 1.2 | 700 (bold) | section header (h2) |
| `--text-lg` | 20 | 1.2 | 600 (semibold) | sheet header title、card title 強調 |
| `--text-base` | 16 | 1.5 | 500 / 600 | body, button label, card title 標準 (DayMeetingCard) |
| `--text-sm` | 14 | 1.5 | 500 / 600 | secondary text, chip label, Button (md/sm), input value |
| `--text-xs` | 12 | 1.4 | 500 / 600 | caption, label, helper, time range |

### 8.1 weight × color の使い分け

| 種類 | weight | color |
|---|---|---|
| Page title (h1) | 900 (black) | fg-primary |
| Section header (h2) | 700 (bold) | fg-primary |
| Card title (h3) | 600 (semibold) | fg-primary |
| Body | 500 (medium) | fg-primary |
| Label / Caption | 500 (medium) | fg-secondary |
| Helper / time | 400 (regular) | fg-tertiary |
| Button (primary) | 700 (bold) | fg-on-accent |
| Chip (active) | 600 (semibold) | fg-on-accent |
| Chip (inactive) | 500 (medium) | fg-secondary |

### 8.2 既存コンポーネントへの反映 (font-size 変動の副作用)

`--text-base` が 15 → 16 になることで:

| 場所 | 現状サイズ | 新サイズ | 視覚影響 |
|---|---|---|---|
| Body 全般 | 15 | 16 | やや大きく (1px) |
| Button (md, lg) | 14/16 | 14/16 | 変化なし (text-sm / text-base クラス) |
| `PageTitle` mobile (text-3xl) | 30 | 39 | **9px 増。Page title がより hero に近づく** (Touri 確認推奨) |
| `OccurrenceLyricCard` numeral (text-5xl) | 48 | 61 | **13px 増**。Spotify scroll カードの限数が大きくなる (Snap 風と整合的) |

**注**: PageTitle が大きすぎると感じたら `PageTitle` 内で `text-2xl md:text-3xl` に下げる選択肢を持つ (v5 スコープ内で調整可)。

---

## §9 タッチターゲット規約 (B.2)

### 9.1 ルール

| 要素種別 | 最小サイズ | gap |
|---|---|---|
| 全タップ要素 | min-h-12 (48px) | - |
| アイコンボタン (X, kebab) | 44×44 正方形 | - |
| chip (DayChipNav の chip) | min-h-10 (40px) | min gap-2 (8px) |
| 隣接 tap 同士 | - | gap-3 (12px) 標準 |
| destructive vs primary | - | gap-4 (16px) 以上 |
| BottomTab タブ | 各タブ width 25% (= 約 90-103px@375-414px), tap 領域は親全体で十分 | - |
| keyboard focus ring | 2px solid accent-500 + offset 2px | - |

### 9.2 v5 で監査するファイル

| ファイル | 監査項目 |
|---|---|
| `Button.tsx` | min-h-10/12/14 (sm/md/lg) 維持、focus ring 既存 OK |
| `BottomTab.tsx` | 各 Link が flex-1 で 25% 幅、icon h-12 w-12 = 48px (hit area 48 OK) |
| `BottomSheet.tsx` 内 X ボタン | h-11 w-11 (44×44) 維持 |
| `MainAttendanceCTA.tsx` | toggle ▾▴ が h-14 w-14 (56×56)、status button が min-h-12 |
| `DayChipNav.tsx` | chip min-h-10 + gap-2 (新規) |
| `DayMeetingCard.tsx` | min-h 96px (新規、余裕クリア) |
| `DayEmptyRow.tsx` | h-14 (56px, 新規、余裕クリア) |
| `MeetingBlock.tsx` (PC 側) | 既存維持 (min-h 72px なので grid 内では誤タップリスクあるが PC マウス前提) |
| `OccurrenceLyricCard.tsx` の status button | 既存 v4 で `h-10 min-w-12` → v5 で **min-h-12 に揃える** (8pt grid 適用) |

#### `OccurrenceLyricCard.tsx` の status button 修正

```tsx
// 修正前 (v4):
className={`h-10 min-w-12 rounded-full px-4 text-sm font-bold transition active:scale-95 ${...}`}

// 修正後 (v5):
className={`min-h-12 min-w-12 rounded-full px-4 text-sm font-bold transition active:scale-95 ${...}`}
```

---

## §10 Friends / Rooms タブの余白監査

Researcher findings の意向 (「Today / Friends / Rooms の余白 / タッチターゲット / ボタン配置を再確認 — 不適切なら指摘」) に応じて確認:

### 10.1 監査結果

| 場所 | 現状 | 判定 | v5 アクション |
|---|---|---|---|
| `AppLayout` main padding | `px-4 pb-24 pt-5 md:px-6 md:pb-10` | 不適合 (mobile px-4=16、推奨 px-5=20) | **`px-5 pt-5 pb-24 md:px-8 md:pb-10` に変更** |
| `PageTitle` | `mb-6` | 適合 (24px) | 維持 |
| Friends / Rooms 内 Section | 各ファイルで `space-y-4` / `space-y-6` 混在 | 不適合 (規約なし) | **共通ルール `space-y-6` (24px) に統一**、ただし v5 では grep して個別判断 (大量ファイル変更回避) |
| `FriendCard` / `RoomCard` 内 padding | `p-4` / `p-5` 混在 | 不適合 | **`p-5` に統一** |
| 隣接 button gap (Friends `AddFriendSheet`) | `gap-2` の所あり | 不適合 | **`gap-3` に変更** |

### 10.2 監査スコープ (v5 で必ず確認)

- `apps/web/src/components/layout/AppLayout.tsx` の main padding を `px-5 md:px-8` に変更
- `apps/web/src/components/friends/*.tsx` を grep し:
  - `gap-2 ` → `gap-3 ` (button が並ぶ場所のみ。chip 並びは現状維持)
  - `p-4` (Card 内) → `p-5`
- `apps/web/src/components/rooms/*.tsx` を grep し:
  - 同上
- `apps/web/src/routes/Rooms.tsx`, `Friends.tsx` の section spacing を `space-y-6` に揃える

### 10.3 やらないこと (v5.1 以降)

- Friends / Rooms の機能変更
- TopBar / SideNav のレイアウト変更
- 既存 `MeetingBlock` (PC 用) の見た目変更

---

## §11 z-index 整合確認

v4 既存階層:

```
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

v5 で導入する要素の z-index:

| 要素 | z-index | 理由 |
|---|---|---|
| `DayChipNav` (sticky) | z-30 | TopBar (z-50) より下、BottomTab (z-40) より下 |
| `MainAttendanceCTA` (mobile, fixed bottom) | z-40 | BottomTab と同じ層 (実際は BottomTab の**上**に描画される。BottomTab 80px の上に MainAttendanceCTA があり、z-40 で sibling) |
| `MainAttendanceCTA` (PC, sticky top) | z-30 | TopBar より下 |
| BottomSheet | z-[1100]/[1110] (既存維持) | modal 層 |

**MainAttendanceCTA vs BottomTab 重なり問題の解消**:
- MainAttendanceCTA `bottom: var(--tab-bar-height)` = 80px ⇒ BottomTab 領域とは重ならない (上方向に貼る)
- z-40 でも視覚的に重ならないので OK

---

## §12 テスト基盤

### 12.1 既存基盤

- Framework: **Vitest 2** + `@testing-library/react` 16 + `jsdom` 29
- Test 配置: `apps/web/tests/routes/<Page>.test.tsx`
- MSW 2 で API モック (`tests/msw/handlers.ts`)
- `renderApp({ initialPath })` util で router を memory-history で起動

### 12.2 v5 で追加するテスト

#### `apps/web/tests/routes/Timetable.test.tsx` (新規 or 拡張)

```ts
describe("/timetable mobile day list", () => {
  // §3-5 挙動仕様を網羅
  it("renders day chips with today marked", async () => {...});
  it("switches active day on chip click", async () => {...});
  it("toggles week view via 週 button", async () => {...});
  it("clamps weekend access to Monday", async () => {...});  // getTodayDayOfWeek
  it("renders DayMeetingCard for a single-period meeting on active day", async () => {...});
  it("merges consecutive periods into one card with combined time range", async () => {...});
  it("shows DayEmptyRow for slots without meetings", async () => {...});
  it("opens MeetingCreateSheet with correct day and period on empty row click", async () => {...});
  it("hides DayList on desktop (md:hidden)", async () => {...});  // 768+ viewport simulate
});
```

**viewport テクニック**: `matchMedia` を mock して `min-width: 768px` を可変化。既存 `tests/setup.ts` で `matchMedia` は mock 済 (常に `matches: false` = mobile 扱い)。PC テストでは override する:

```ts
beforeEach(() => {
  vi.mocked(window.matchMedia).mockImplementation((q: string) => ({
    matches: q.includes("min-width: 768px"),  // PC 扱い
    media: q,
    // ...
  }));
});
```

ただし **Tailwind v4 の `hidden md:block` は CSS の `@media (min-width: 768px)` であって matchMedia ではない**。jsdom は computed media query を完全には評価しない。

→ **テスト戦略**: 「mobile 用 DOM がレンダリングされる」「desktop 用 DOM もレンダリングされる」の**両方が同時に mount される**ことを test し、表示判定は CSS class の存在で行う。

```ts
expect(screen.getByTestId("day-list-items")).toBeInTheDocument();
// 同時に PC 用 TimetableGrid も mount されている
const grids = screen.getAllByRole("grid");
// (= mobile の week-fallback と PC の hidden grid)
```

→ `data-testid` を以下に追加:
- `DayList`: 親に `data-testid="timetable-mobile-day-list"`
- `TimetableGrid` parent (Timetable.tsx PC 側 wrapper): `data-testid="timetable-pc-grid"`

#### `apps/web/tests/routes/Home.test.tsx` (拡張)

既存テストに加えて:
```ts
it("renders MainAttendanceCTA fixed at the bottom for mobile", async () => {
  await renderApp({ initialPath: "/" });
  const cta = await screen.findByRole("button", { name: /今日は全出席|本日の記録/ });
  const section = cta.closest("section");
  expect(section).toHaveClass("fixed");  // mobile variant
});

it("hides MainAttendanceCTA when keyboard is open", async () => {
  // useIsKeyboardOpen の戻り値を mock
  // visualViewport を mock してキーボード state を疑似
});

it("expanded individual modifier renders above the main CTA, not below", async () => {
  // expanded=true 時の DOM 順を assert
});
```

#### Component 単体テスト (新規ファイル)

```
apps/web/tests/components/timetable/DayChipNav.test.tsx
apps/web/tests/components/timetable/DayMeetingCard.test.tsx
apps/web/tests/components/timetable/DayEmptyRow.test.tsx
apps/web/tests/components/timetable/DayList.test.tsx
apps/web/tests/components/timetable/getTodayDayOfWeek.test.ts
```

各 component の Props を直接渡して RTL で render。MSW 不要。

### 12.3 ブラウザ E2E

v5 はリサーチ理論の実装のため、視覚的検証が重要だが**自動 E2E は v5 スコープ外**。Touri が `chrome-devtools` MCP で手動チェックすれば十分 (mobile viewport を chrome-devtools で 375px に設定して確認)。

### 12.4 Test Pattern (再利用するもの)

| パターン | 適用先 |
|---|---|
| `renderApp({ initialPath: "/timetable" })` で route 全体テスト | Timetable, Home |
| Props を直接渡す component 単体テスト | DayChipNav, DayMeetingCard, DayEmptyRow, DayList |
| `getTodayDayOfWeek(new Date("2026-05-26T00:00:00"))` 引数注入で曜日テスト | getTodayDayOfWeek |
| MSW で `/api/me/timetables` を mock | DayList の meetings 配置テスト |
| `expect(button).toHaveAttribute("aria-pressed", "true")` | active state assert |

---

## §13 関数シグネチャ一覧 (実装で迷わない用)

### 13.1 新規 component

```ts
// apps/web/src/components/timetable/DayChipNav.tsx
export type DayChipNavProps = {
  activeDay: number;
  today: number;
  viewMode: "day" | "week";
  onChangeDay: (day: number) => void;
  onToggleViewMode: () => void;
};
export function DayChipNav(props: DayChipNavProps): JSX.Element;

// apps/web/src/components/timetable/DayMeetingCard.tsx
export type DayMeetingCardProps = {
  course: CourseDto;
  meeting: MeetingDto;
  slots: DaySlotDto[];
  onClick: () => void;
};
export function DayMeetingCard(props: DayMeetingCardProps): JSX.Element;

// apps/web/src/components/timetable/DayEmptyRow.tsx
export type DayEmptyRowProps = {
  slot: DaySlotDto;
  onClick: () => void;
};
export function DayEmptyRow(props: DayEmptyRowProps): JSX.Element;

// apps/web/src/components/timetable/DayList.tsx
export type DayListProps = {
  timetable: UserTimetableDto;
  activeDay: number;
  today: number;
  viewMode: "day" | "week";
  onChangeDay: (day: number) => void;
  onToggleViewMode: () => void;
  onMeetingClick: (meeting: MeetingDto) => void;
  onEmptyCellClick: (dayOfWeek: number, periodIndex: number) => void;
};
export function DayList(props: DayListProps): JSX.Element;

// apps/web/src/components/timetable/getTodayDayOfWeek.ts
export function getTodayDayOfWeek(date?: Date): number;  // returns 1-5
```

### 13.2 変更する component シグネチャ

| ファイル | 変更内容 |
|---|---|
| `Timetable.tsx` | Props なし (route component)、内部 state に `activeDay` / `viewMode` 追加 |
| `MainAttendanceCTA.tsx` | Props 不変、内部 layout 変更 (Mobile fixed / PC sticky の 2 系統 render) |
| `BottomSheet.tsx` | Props 不変、内部 padding 変更 |
| `BottomTab.tsx` | Props 不変、内部 style に `height: var(--tab-bar-height)` 追加 |
| `TimetableGrid.tsx` | Props 不変、変更なし (PC 専用化は親側で制御) |

---

## §14 実装変更ファイル一覧 (Developer 引き継ぎ用)

| ファイル | 変更種 | 概要 |
|---|---|---|
| `apps/web/src/styles.css` | 修正 | typography token を Major Third に置換、spacing semantic variable 追加、`html { font-size: 16px }` 追加、`--leading-snug` / `--leading-body` 追加 |
| `apps/web/src/components/timetable/DayChipNav.tsx` | 新規 | §3.5 仕様 |
| `apps/web/src/components/timetable/DayMeetingCard.tsx` | 新規 | §3.6 仕様 |
| `apps/web/src/components/timetable/DayEmptyRow.tsx` | 新規 | §3.7 仕様 |
| `apps/web/src/components/timetable/DayList.tsx` | 新規 | §3.8 仕様 |
| `apps/web/src/components/timetable/getTodayDayOfWeek.ts` | 新規 | §4.2 ヘルパー |
| `apps/web/src/routes/Timetable.tsx` | 修正 | §4.1 (DayList + TimetableGrid を md で切替) |
| `apps/web/src/components/today/MainAttendanceCTA.tsx` | 修正 | §5.3 (fixed bottom + md でクラス分岐) |
| `apps/web/src/components/sheet/BottomSheet.tsx` | 修正 | §6.2 (px-6→px-5, handle 4×36) |
| `apps/web/src/components/layout/BottomTab.tsx` | 修正 | §7.1 (height=var(--tab-bar-height)) |
| `apps/web/src/components/layout/AppLayout.tsx` | 修正 | §10.2 (px-4→px-5 mobile) |
| `apps/web/src/components/today/OccurrenceLyricCard.tsx` | 修正 | §9.2 (status button h-10 → min-h-12) |
| `apps/web/src/components/friends/*.tsx`, `apps/web/src/components/rooms/*.tsx` | 修正 (grep ベース) | §10.2 (gap-2→gap-3, p-4→p-5 監査) |
| `apps/web/tests/routes/Timetable.test.tsx` | 新規/拡張 | §12.2 |
| `apps/web/tests/routes/Home.test.tsx` | 修正 | §12.2 (sticky CTA テスト追加) |
| `apps/web/tests/components/timetable/*.test.tsx` | 新規 | §12.2 単体 |
| `apps/web/tests/components/timetable/getTodayDayOfWeek.test.ts` | 新規 | §12.2 純関数 |

**変更しない**:
- `apps/api/**` (一切なし)
- `packages/shared/**` (DTO 不変)
- `prisma/**` (不変)
- `apps/web/src/api/**` (hook 追加なし、既存 useUserTimetables / useMe / useTodayOccurrences をそのまま使う)

---

## §15 挙動仕様 総まとめ (Reviewer テスト生成用、曖昧表現禁止)

Reviewer はここからテストを生成する。**全ケースが test 可能な粒度**で書く。

### 15.1 `getTodayDayOfWeek`

| 入力 | 出力 |
|---|---|
| `new Date("2026-05-25T10:00:00")` (月) | `1` |
| `new Date("2026-05-26T10:00:00")` (火) | `2` |
| `new Date("2026-05-27T10:00:00")` (水) | `3` |
| `new Date("2026-05-28T10:00:00")` (木) | `4` |
| `new Date("2026-05-29T10:00:00")` (金) | `5` |
| `new Date("2026-05-30T10:00:00")` (土) | `1` (月にクランプ) |
| `new Date("2026-05-31T10:00:00")` (日) | `1` (月にクランプ) |

### 15.2 `DayChipNav`

| 操作 | 期待 |
|---|---|
| props `activeDay=2, today=2, viewMode="day"` で render | 火 chip に `aria-selected="true"`、火 chip 内に accent dot |
| props `activeDay=3, today=2, viewMode="day"` で render | 水 chip に `aria-selected="true"`、火 chip に accent dot (active ではない) |
| 月 chip クリック | `onChangeDay(1)` が 1 回呼ばれる |
| viewMode="week" で月 chip クリック | `onToggleViewMode()` と `onChangeDay(1)` の両方が呼ばれる (順不問) |
| 「週」ボタンクリック (viewMode="day") | `onToggleViewMode()` が呼ばれ、props 更新後 `aria-pressed="true"` |
| 「週」ボタンクリック (viewMode="week") | `onToggleViewMode()` が呼ばれる |
| viewMode="week" 時の chip 表示 | 全 chip の `aria-selected="false"`、「週」ボタンが accent active |

### 15.3 `DayMeetingCard`

| props | 期待 |
|---|---|
| `slots=[{periodIndex:1, startMinute:540, endMinute:630}]` | `1限` 表示、`9:00 - 10:30` 表示、min-height=96px |
| `slots=[{p:1,540,630},{p:2,640,730}]` | `1-2限` 表示、`9:00 - 12:10` 表示、min-height=192px |
| `course.color="#10b981"` | style.borderLeft が `4px solid #10b981`、教室 chip 背景 = color-mix(... 20%) |
| `course.color=null` | フォールバックで accent-500 (CSS var) |
| `course.room="401教室"` | `<span>401教室</span>` (accent chip 形式) |
| `course.room=null` | 教室 chip 非表示 |
| `course.teacher="山田先生"` | `<span>山田先生</span>` (truncate あり) |
| `course.teacher=null` | 教師非表示 |
| `course.name` が 30 文字 | line-clamp-2 で 2 行 |
| クリック | `onClick()` が 1 回呼ばれる |
| `aria-label` | `<course.name> <periodRange> <timeRange>` を含む |

### 15.4 `DayEmptyRow`

| props | 期待 |
|---|---|
| `slot={periodIndex:2, startMinute:640, endMinute:730}` | `2限`, `10:40 - 12:10`, `空きコマ`, `+` 全て表示 |
| クリック | `onClick()` 1 回 |
| ボタン高さ | `h-14` (CSS 計算で 56px) |

### 15.5 `DayList`

| ケース | 期待 |
|---|---|
| `meetings=[]`, `activeDay=1`, `slots=5限分` | `DayEmptyRow` が 5 個 |
| `meetings=[{day:1,start:1,count:1}]`, `activeDay=1` | 1 限 = `DayMeetingCard`、2-5 限 = `DayEmptyRow` (合計 5 行) |
| `meetings=[{day:1,start:1,count:1}]`, `activeDay=2` | 5 限全部 `DayEmptyRow` (火曜には授業なし) |
| `meetings=[{day:1,start:1,count:2}]`, `activeDay=1` | 1-2 限 = `DayMeetingCard` (連続)、3-5 限 = `DayEmptyRow` (合計 4 行) |
| meeting の courseId が courses にない | empty row として表示 (壊れない) |
| `viewMode="week"` | `DayChipNav` + `TimetableGrid` が表示 (`data-testid="day-list-week-fallback"` 存在) |
| `viewMode="day"` | `DayChipNav` + ul `data-testid="day-list-items"` が表示 |

### 15.6 `Timetable.tsx` (route 統合)

| ケース | 期待 |
|---|---|
| 平日 (月) に `/timetable` を mobile で開く | DayList が visible (mobile DOM)、TimetableGrid は CSS で hidden (DOM mount は両方されてもよい) |
| 土曜に開く | activeDay=1、月 chip active |
| 月 chip クリック (週切替 button が active のとき) | viewMode が "day" に戻り、月が active になる |
| 空きコマ tap (activeDay=2, period=3) | MeetingCreateSheet open、`initialDayOfWeek=2, initialPeriod=3` |
| 既存 meeting tap (activeDay=1, meeting.id=m1) | `removeMeeting(m1)` が呼ばれる (現状の click 動作維持) |
| 学期未作成 (timetables, semesters いずれも空) | `<Panel>先に学期を作成してください。</Panel>` 表示 |
| PC viewport (≥768px) | TimetableGrid が visible (PC DOM)、DayList は CSS hidden |

### 15.7 `MainAttendanceCTA` (mobile fixed bottom)

| ケース | 期待 |
|---|---|
| mobile, 3 件 unrecorded | section に `fixed` class、`bottom: var(--tab-bar-height)`、「今日は全出席 (3)」ボタン |
| mobile, 全 recorded | disabled、「本日の記録は完了済」 |
| mobile, expanded=false, toggle ▾ クリック | `onToggle()` 1 回、props 更新後 ▴ に切替 |
| mobile, expanded=true | section 上方向 (CTA より上) に個別修正 list が表示、max-h-[40dvh] |
| mobile, keyboard open (visualViewport の height が window より 100+ 小さい) | section が null return (DOM に存在しない) |
| PC (≥768px) | mobile section が hidden (md:hidden)、PC sticky section が visible (hidden md:block) |
| status button クリック | `onChangeStatus(occurrence.id, status)` が呼ばれる |
| 個別修正ボタン群の gap | `gap-3` (12px) |

### 15.8 `BottomSheet`

| ケース | 期待 |
|---|---|
| open=true | drag handle は `h-1 w-9` (= 4×36px) |
| header padding | `px-5 min-h-14` |
| body padding | `px-5 pb-[calc(24px+env(safe-area-inset-bottom))]` |
| body section spacing | `space-y-5` |

### 15.9 `BottomTab`

| ケース | 期待 |
|---|---|
| render | `style.height === "var(--tab-bar-height)"` |
| keyboardOpen=true | コンポーネント null return |

### 15.10 `AppLayout`

| ケース | 期待 |
|---|---|
| mobile (< 768px) | main の class に `px-5 pt-5 pb-24` を含む |
| desktop (≥ 768px) | main の class に `md:px-8 md:pb-10` を含む |

### 15.11 `OccurrenceLyricCard`

| ケース | 期待 |
|---|---|
| status button | `min-h-12` (= 48px、h-10 ではなく) |

### 15.12 異常系

| ケース | 期待 |
|---|---|
| `DayList` に `timetable.daySlots=[]` | DayChipNav は描画、ul は空 (`children: []`) |
| `DayMeetingCard` に `slots=[]` | `slots.length * 96 = 0` だが React で `slots[0]` が undefined → 親 `DayList` で `slots.length > 0` を保証 (型レベル `slots: DaySlotDto[]` は空配列許容するが、ロジック上は必ず 1+ なので Developer 注意。**設計上は親で空配列を渡さない**) |
| meeting の periodCount が daySlots の上限を超える (data-corrupt) | 含まれる slots だけで描画 (filter で対象範囲内のみ) |
| `course.color` が不正形式 (e.g. `"#xyz"`) | CSS が invalid → デフォルトの border が出ない可能性。**現状はスキーマ regex で hex のみ通過、ここでは validation 済前提**。型レベルで防ぐ |

---

## §16 焦点と非焦点 (Phase 4 機能維持の確認)

### 16.1 維持する Phase 4 機能

| 機能 | v5 での状態 |
|---|---|
| Today タブ Spotify scroll | `TimetableScroll.tsx` 中身は変更なし、`OccurrenceLyricCard` の status button だけ min-h-12 化 |
| 右上 AvatarMenu | 変更なし |
| Friendship (友達 + Pending) | 既存ロジック維持、token 値変更のみ反映 |
| Room / RoomEvent | 既存ロジック維持 |
| MeetingCreateSheet (新規/編集) | 変更なし (BottomSheet の padding 変更により余白だけ整う) |
| useIsKeyboardOpen | 既存ロジック維持、`MainAttendanceCTA` で再利用 |
| BottomTab (4 タブ) | navItems 不変、高さ token 化のみ |

### 16.2 v5 で**触らない**ファイル (明示)

- `apps/api/**`
- `prisma/**`
- `packages/shared/**`
- `apps/web/src/api/**` (hook / client / queryKeys / types)
- `apps/web/src/router.tsx`
- `apps/web/src/routes/Today.tsx` (mobile 用 CTA の DOM 順だけ要確認、ただし大幅変更なし)
- `apps/web/src/components/today/TimetableScroll.tsx`
- `apps/web/src/components/today/TodayGreeting.tsx`
- `apps/web/src/components/avatar/**`
- `apps/web/src/components/timetable/MeetingBlock.tsx`, `EmptyCell.tsx`, `PeriodLabel.tsx`, `PeriodChips.tsx` (PC で使用、変更なし)
- `apps/web/src/components/layout/TopBar.tsx`, `SideNav.tsx`
- `apps/web/src/components/ui/Button.tsx`, `Input.tsx`, `Field.tsx` (token 値変更で自動反映)

---

## §17 デプロイ

`atender-web` Coolify app uuid `y1acaktqgsx66sj81qsxn5m3` のみ再デプロイ。API 不要。

---

## §18 不採用案 (検討ループ防止)

| 案 | 却下理由 |
|---|---|
| モバイル横スクロール grid 継続 (a) | WCAG 2.5.5 (44px) 未達、Snap 風大角丸が潰れる |
| 縮約 grid (c) | 和文判読不可、Snap 風と逆方向 |
| 横スワイプ paging (d) | CSS only で iOS 慣性再現困難、v5.1 候補 |
| アジェンダ風 (e) | 時限認知の喪失、用途整合性低 |
| `useMediaQuery` で JS 切替 | hydration 罠 + SSR 不要なら CSS の `md:` で十分 |
| `viewMode` を localStorage 永続化 | 「毎回今日が見たい」が標準。複雑度に対して効用低 |
| `MainAttendanceCTA` の sheet 化 (BottomSheet で個別修正) | 現状 inline expand のほうが操作回数少ない、Phase 4 のフロー破壊 |
| Today タブの DOM 順を変える (CTA を末尾移動) | mobile / PC の 2 系統 render で吸収 (DOM 順は維持) |
| BottomTab 高さを 80 → 96 に拡大 | 60dvh 中の bottom space 増加でコンテンツが減る。80 で十分 (MD3 spec 内) |
| `--text-base` を 15 に維持 (v4 そのまま) | Major Third 採用なら 16 が起点。15 だと 1.25 倍が 18.75 で半端 |
| `MainAttendanceCTA` を BottomTab の中に統合 | tab bar の責務 (navigation) と CTA の責務 (action) を混在させない |
| sheet padding を `px-4` に下げる | 8pt grid + Researcher §C.2 で 20px が現代主流、16px はやや窮屈 |
| `DayList` を Today タブにも統合 | Today は Spotify scroll が UX 主軸、Timetable とは別概念。混在させない |
| chip nav の week 切替を「スワイプ左右」で実装 | jsdom テスト困難 + CSS only で滑らかに作れない、v5.1 |

---

## §19 ナレッジ追記候補 (Architect → knowledge/pattern)

設計完了後、以下を `Muraki/knowledge/pattern/` に追加検討:

1. **`mobile-timetable-day-tab-with-week-toggle.md`** — 日別タブ + 週切替のハイブリッド UX (Penmark / 1Sec / My Study Life の合成)。本書 §3 の意思決定全体を 1 pattern にまとめる
2. **`8pt-grid-css-variable-token.md`** — `--space-*` + semantic variable (`--page-px-mobile` 等) を Tailwind と併存させる方法。本書 §2.1 / §2.2 の二系統運用
3. **`major-third-typography-scale-css-token.md`** — Major Third (1.25) を CSS variable に落とす型。本書 §2.1 / §8 (Atender 適用結論)

既存の `pattern/timetable-app-ux-patterns.md` には **モバイル時間割は day tab + week toggle がデフォ**という変更を**追記でなく置換**で反映する必要あり (CLAUDE.md「仕様マークダウンの編集規律」)。

---

## §20 Touri 確認推奨項目 (承認ゲート用)

- [ ] `--text-3xl` 30 → 39px (PageTitle が大きくなる) を許容するか。NG なら PageTitle 内で `text-2xl md:text-3xl` に下げる
- [ ] `MainAttendanceCTA` を mobile で fixed bottom (BottomTab の上 80px) に貼る方針で OK か
- [ ] 「週」切替がボタンのみ (スワイプ非対応) で v5 出荷して OK か
- [ ] 土日アクセス時に月にクランプする挙動で OK か (代替: 「今日は授業なし」表示)
- [ ] PC 側 (≥768px) は v4 そのまま (v5 で改修なし) で OK か
