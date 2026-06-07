# 時間割の表示曜日設定 (土日対応) + スケルトンローディング

## 目的

- A. 時間割グリッドに表示する曜日をユーザーが選べるようにする (土日含む)。デフォルトは平日 (月〜金)。授業編集の時限選択 (PeriodChips) と同様の複数選択 UI を時間割設定に足す。
- B. カレンダー・時間割・各ページの「読み込み中...」テキスト/Panel を共通スケルトンに置換し、ロード中もレイアウトを保ったプレースホルダを出す。

この 2 機能は独立しているが、どちらも小〜中規模かつ同じ worktree で扱える範囲なので 1 ドキュメントにまとめる。実装ブランチも 1 本で良い。

---

# 機能 A: 時間割の表示曜日設定

## 前提: dayOfWeek の二系統 (重要・設計の中核)

コードベースに 2 つの曜日 convention が併存している。今回の設計はこれを正しく橋渡しすることが肝。

| convention | 値域 | 使用箇所 |
|---|---|---|
| **JS標準 (0=日..6=土)** | 0=日, 1=月, ..., 6=土 | `Meeting.dayOfWeek` (Prisma), `MeetingDto.dayOfWeek` (Zod min0 max6), `MeetingEditModal` の保存値, `TemplateMeeting.dayOfWeek` |
| **表示系 (1=月..7=日)** | 1=月, 2=火, ..., 6=土, 7=日 | `TimetableView.days`, `DAY_LABELS`(`dayOfWeek-1` で引く), `RoomTimetable` が `((day()+6)%7)+1` で変換して渡す値 |

### 現状の暗黙の一致と落とし穴

- 平日 (月=1〜金=5) は **両 convention で同値**。だから今まで `SelfTimetableView` が `Meeting.dayOfWeek` (0..6) を `TimetableView`(1..7想定) へ無変換で渡しても表示が壊れなかった。
- 破綻するのは週末だけ:
  - 日曜は JS標準で `0`、表示系で `7`。
  - 土曜は両系で `6` (偶然一致)。
- つまり **日曜の授業を表示系に渡すと `0` になり、`TimetableView` の日曜列 (`7`) にマッチせず消える**。土日対応を入れる今、ここを必ず直す。

### 本設計で確定する canonical 変換

**TimetableView の `days` および `event.dayOfWeek` は「表示系 1=月..7=日」に統一する** (既存 `RoomTimetable` / `DAY_LABELS` がこの系なので、これを正とする)。

JS標準 (0..6) → 表示系 (1..7) の変換関数を 1 つ用意し、Meeting を TimetableView に渡す全箇所で適用する:

```ts
// apps/web/src/components/timetable/dayConvention.ts (新規)
/** JS標準 0=日..6=土 を 表示系 1=月..7=日 に変換 */
export function jsDowToDisplay(jsDow: number): number {
  return ((jsDow + 6) % 7) + 1; // 0(日)→7, 1(月)→1, ..., 6(土)→6
}
/** 表示系 1=月..7=日 を JS標準 0=日..6=土 に変換 */
export function displayDowToJs(displayDow: number): number {
  return displayDow % 7; // 7(日)→0, 1(月)→1, ..., 6(土)→6
}
```

保存値 (UserTimetable.daysOfWeek) の convention は後述の通り **表示系 1..7** とする (理由: TimetableView にそのまま渡せる / UI の DayChips も表示系で扱える / 「月始まり」の自然順)。

## データモデル

### Prisma (`apps/api/prisma/schema.prisma`)

`UserTimetable` に CSV String フィールドを追加。SQLite + Prisma はスカラー配列 (`Int[]`) 非対応のため、CSV 文字列で持ち app/dto 層で `number[]` に変換する (Researcher 指摘どおり)。

```prisma
model UserTimetable {
  // ... 既存フィールド ...
  daysOfWeek       String             @default("1,2,3,4,5") // 表示系 1=月..7=日 の CSV。デフォルト平日
  // ...
}
```

- 値は **表示系 1..7** の昇順 CSV (例 `"1,2,3,4,5"`、土日込みなら `"1,2,3,4,5,6,7"`)。
- `@default("1,2,3,4,5")` により **既存行・新規行とも平日デフォルト**になる (migration で既存行も埋まる)。

### Migration

`prisma migrate dev --name add_user_timetable_days_of_week` で生成。`@default` 付き NOT NULL カラム追加なので既存行は全て `"1,2,3,4,5"` で埋まる。手書き SQL 不要。occurrence 等の派生データへの影響なし (後述)。

### テンプレート側の扱い (判断: 持たせない)

`TimetableTemplate` / `TemplateMeeting` には **daysOfWeek を追加しない**。理由:
- 表示曜日は「閲覧時の見せ方」であってテンプレの構造データではない。テンプレ共有の本質 (daySlots / courses / meetings) と無関係。
- テンプレ取込 (`copyTemplate`) 時、生成される UserTimetable の `daysOfWeek` は **Prisma default (`"1,2,3,4,5"`) のまま**にする。取り込んだ授業に土日コマがあれば後述の union により自動で土日列が出る (データは隠れない)。
- → Uniform Shape は崩れるが、テンプレは「曜日表示の好み」を共有する場ではないので許容。不採用案に明記。

## shared schema (`packages/shared/src/schemas/userTimetable.ts`)

`UserTimetableDto` と `UserTimetablePatchInput` に `daysOfWeek: number[]` を追加。**公開境界では number[] (表示系 1..7)**、保存は CSV String という変換責務は **API の dto.ts (読み) と route の PATCH ハンドラ (書き)** に置く (shared は number[] のみ知る)。

```ts
const DaysOfWeek = z
  .array(z.number().int().min(1).max(7))
  .min(1)                                   // 最低 1 曜日必須
  .refine((a) => new Set(a).size === a.length, { message: "曜日が重複しています" });

export const UserTimetableDto = z.object({
  // ... 既存 ...
  daysOfWeek: z.array(z.number().int().min(1).max(7)), // 表示系 1=月..7=日
  // ...
});

export const UserTimetablePatchInput = z.object({
  title: z.string().min(1).max(120).optional(),
  daysOfWeek: DaysOfWeek.optional(),
  daySlots: z.array(DaySlotDto).optional(),
  // ... 既存 courses / meetings ...
});
```

- `UserTimetableCreateInput` には **追加しない** (作成時は常に default 平日。設定変更は PATCH 経由のみ)。

## API

### dto.ts (`apps/api/src/lib/dto.ts`)

`userTimetableDto` で CSV → number[] 変換を行う。空文字防御込み。

```ts
export function parseDaysOfWeek(csv: string): number[] {
  return csv
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

export function userTimetableDto(timetable: UserTimetableWithParts) {
  return {
    // ... 既存 ...
    daysOfWeek: parseDaysOfWeek(timetable.daysOfWeek),
    // ...
  };
}
```

`UserTimetableWithParts` 型は `UserTimetable` を含むので `daysOfWeek: string` が自動で型に乗る (追加の型定義不要)。

### route (`apps/api/src/routes/userTimetables.ts`)

PATCH ハンドラのトランザクション内に分岐を追加。number[] → CSV 変換は **route 層**で行う。

```ts
if (input.daysOfWeek) {
  const csv = [...new Set(input.daysOfWeek)].sort((a, b) => a - b).join(",");
  await tx.userTimetable.update({ where: { id }, data: { daysOfWeek: csv } });
}
```

- ソート + 重複除去を保存前に行い、DB には正規化済み CSV だけ入る。
- **occurrence 再生成への影響: なし**。`daysOfWeek` は表示専用設定で、occurrence は `meetings` (曜日=JS標準) と semester 期間から生成される。PATCH ハンドラ末尾の `generateOccurrencesForUserTimetable` は既存どおり呼ばれるが、`daysOfWeek` のみの変更では meetings/daySlots が変わらないため occurrence の中身は不変。**`daysOfWeek` だけの変更で occurrence 再生成が走るのは無駄だが既存挙動を壊さないため許容** (再生成は冪等)。挙動仕様にこの不変性をテストとして明記する。

## UI

### DayChips (新規 `apps/web/src/components/timetable/DayChips.tsx`)

`PeriodChips` を流用元に、月始まり (月火水木金土日) の 7 チップ複数選択。値は **表示系 1..7**。

```ts
export function DayChips({
  value,                       // number[] 表示系 1..7
  onChange,                    // (next: number[]) => void  ソート済みを返す
  disabled,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}): JSX.Element
```

- ラベル: `["月","火","水","木","金","土","日"]` を `dayValue` (1..7) の `index = dayValue-1` で対応。
- 表示順は 1(月)→7(日) の固定。トグルは `PeriodChips` と同じく Set で add/delete し、`onChange([...next].sort((a,b)=>a-b))`。
- スタイル/ARIA は `PeriodChips` 踏襲: `role` は button、`aria-pressed`、`aria-label={`${曜日名}曜日`}` (例 `月曜日`)、選択時 `bg-accent-500 text-fg-on-accent`、非選択 `border-border-default bg-bg-base text-fg-primary`。
- **最低 1 曜日選択必須のバリデーションは呼び出し側 (TimetableSettingsSheet) で行う**。DayChips 自体は 0 件も技術的に許す (UI 制御の責務分離。PeriodChips も同様に件数制約を持たない)。

### TimetableSettingsSheet (`apps/web/src/components/sheet/TimetableSettingsSheet.tsx`)

「名前」フィールドの直下、「時限」セクションの上に「表示する曜日」セクションを追加。

レイアウト (ASCII):
```
┌─ 時間割の設定 ───────────────────────┐
│ 名前    [ 自分の時間割            ]   │
│ ─────────────────────────────────── │
│ 表示する曜日                          │   ← 新規セクション (border-t pt-5)
│  [月][火][水][木][金][土][日]         │   ← DayChips (選択は accent 色)
│ ─────────────────────────────────── │
│ 時限 (5 限)              [+ コマを追加]│   ← 既存
│  ...                                  │
└──────────────────────────────────────┘
```

state / 配線:
- `const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1,2,3,4,5]);`
- `useEffect`(open 時) で `setDaysOfWeek(timetable?.daysOfWeek ?? [1,2,3,4,5]);` を既存初期化群に追加。`handleCancel` でも同様にリセット。
- `handleSave` 内:
  - **バリデーション**: `if (daysOfWeek.length === 0) { setMessage("表示する曜日を1つ以上選んでください"); return; }` を slots バリデーションと同列で追加。
  - 差分検知して PATCH に積む: `if (JSON.stringify([...daysOfWeek].sort((a,b)=>a-b)) !== JSON.stringify([...timetable.daysOfWeek].sort((a,b)=>a-b))) patches.push(patch.mutateAsync({ daysOfWeek }));`
- セクションは `<DayChips value={daysOfWeek} onChange={setDaysOfWeek} disabled={!timetable} />` を `Field`/見出し付きで描画。見出しは既存「時限」セクションと同じ `text-xs font-bold uppercase tracking-wide text-fg-tertiary` トーン (文言「表示する曜日」)。

### SelfTimetableView (`apps/web/src/components/home/SelfTimetableView.tsx`)

2 点の配線変更:

1. **events の dayOfWeek を表示系へ変換** (週末対応の本丸):
   ```ts
   events={display.meetings.map<TimetableEventInput>((m) => {
     // ...既存...
     dayOfWeek: jsDowToDisplay(m.dayOfWeek), // 0..6 → 1..7 に変換 (従来は無変換で渡していた)
     // ...
   })}
   ```
   - `onEventClick` / `handleEmptyCellClick` で受け取る dayOfWeek の扱いに注意:
     - `onEventClick(id)` は id 引数なので影響なし。
     - `onEmptyCellClick(dayOfWeek, period)` の `dayOfWeek` は **表示系 1..7** で渡ってくる (TimetableView 内 `days.map` 由来)。`MeetingEditModal` の `initialDayOfWeek` は **JS標準 0..6** を期待 (Select が `value={index}` で 0..6、保存も 0..6)。よって配線で変換が必要:
       ```ts
       async function handleEmptyCellClick(displayDow: number, period: number) {
         const timetable = await ensureTimetable();
         if (timetable) setSheet({ dayOfWeek: displayDowToJs(displayDow), period });
       }
       ```
     - `today` (getTodayDayOfWeek) は 1..5 を返し `sheet?.dayOfWeek ?? today` のフォールバックに使われている。`getTodayDayOfWeek` は実質 JS標準の平日値 (月=1..金=5、週末は1) を返すので **JS標準として整合**。週末対応のため `getTodayDayOfWeek` を「週末は日曜=0/土曜=6 をそのまま返す」よう変えるかは **本設計では変更しない** (今日が週末でも初期選択が月曜になるだけで実害小。スコープ外)。不採用案に記載。

2. **days を timetable から渡す**:
   ```ts
   <TimetableView
     daySlots={display.daySlots}
     days={resolveDisplayDays(display)}
     events={...}
   />
   ```
   `resolveDisplayDays` は **union ロジック** (次項)。

### RoomTimetable (`apps/web/src/components/rooms/RoomTimetable.tsx`)

`TimetableView` に `days` を渡していない (既定 [1..5])。Room は複数メンバーの合成で「特定の UserTimetable.daysOfWeek」を持たない。方針:
- **Room はメンバー授業から union だけで days を決める** (設定値ソースが無いため)。`events` の `dayOfWeek` (既に表示系 1..7) を集約し、`[1,2,3,4,5] ∪ {events の dayOfWeek}` をソートして渡す。
  ```ts
  const displayDays = useMemo(() => {
    const set = new Set<number>([1,2,3,4,5]);
    for (const e of events) set.add(e.dayOfWeek);
    return [...set].sort((a,b) => a-b);
  }, [events]);
  // <TimetableView days={displayDays} ... />
  ```
- これにより誰かが土日に授業を持てば Room 表示にも土日列が出る (データ非隠蔽)。

### 表示曜日の決定ロジック = union (設定曜日 ∪ 授業のある曜日)

**採用: union (データを隠さない)**。`apps/web/src/components/timetable/dayConvention.ts` に置く:

```ts
import type { UserTimetableDto } from "@atender/shared";

/** 設定曜日 ∪ 授業が存在する曜日 を表示系 1..7 昇順で返す */
export function resolveDisplayDays(tt: { daysOfWeek: number[]; meetings: { dayOfWeek: number }[] }): number[] {
  const set = new Set<number>(tt.daysOfWeek.length ? tt.daysOfWeek : [1, 2, 3, 4, 5]);
  for (const m of tt.meetings) set.add(jsDowToDisplay(m.dayOfWeek)); // meetings は JS標準なので変換
  return [...set].sort((a, b) => a - b);
}
```

- 理由: ユーザーが土曜表示を切ったのに土曜に授業が残っていると、消えた授業に気付けず出欠管理事故になる。授業のある曜日は常に出す。
- `emptyTimetable` (未作成時のプレースホルダ) は `daysOfWeek: [1,2,3,4,5]` を持たせ、`meetings: []` なので結果 [1..5]。`SelfTimetableView` の `emptyTimetable` 定義に `daysOfWeek: [1,2,3,4,5]` を追加する。

## 挙動仕様 (機能 A / Reviewer テスト根拠)

### データモデル / dto (API: Vitest + 実SQLite)

- 正常: 新規 UserTimetable 作成 (POST) → `daysOfWeek` が `[1,2,3,4,5]` (default) で返る。
- 正常: PATCH で `daysOfWeek: [1,2,3,4,5,6,7]` → 取得すると `[1,2,3,4,5,6,7]`。
- 正常: PATCH で `daysOfWeek: [6,1,3]` (順不同) → DB/取得は `[1,3,6]` (昇順正規化)。
- 正常: PATCH で `daysOfWeek: [1,1,2]` (重複) → Zod refine で 400 VALIDATION_ERROR (重複拒否)。あるいは route 正規化前に Zod で弾く想定。テストは 400 を期待。
- 異常: PATCH で `daysOfWeek: []` → 400 (min(1))。
- 異常: PATCH で `daysOfWeek: [0]` or `[8]` → 400 (範囲外)。
- 不変性: meetings/daySlots を変えず `daysOfWeek` のみ PATCH → 既存 occurrence の件数・内容が変わらない (occurrence は再生成されても同一)。
- 既存行 migration: (任意) default で埋まることは migration の `@default` で保証。テスト必須ではない。

### DayChips (Web: Vitest + RTL + jsdom)

- 7 ボタン (月〜日) が月始まり順でレンダリングされる。
- `value={[1,2,3,4,5]}` のとき 月〜金が `aria-pressed=true`、土日が `false`。
- 土ボタン click → `onChange` が `[1,2,3,4,5,6]` (昇順) で呼ばれる。
- 金ボタン (選択済) click → `onChange` が `[1,2,3,4]` で呼ばれる (解除)。
- `disabled` 時、各ボタンが disabled。

### resolveDisplayDays (Web: 純関数ユニット)

- `daysOfWeek=[1..5], meetings=[]` → `[1,2,3,4,5]`。
- `daysOfWeek=[1..5], meetings=[{dayOfWeek:6}]` (土) → `[1,2,3,4,5,6]` (union で土追加)。
- `daysOfWeek=[1..5], meetings=[{dayOfWeek:0}]` (日, JS標準) → `[1,2,3,4,5,7]` (日=7 に変換され追加)。
- `daysOfWeek=[1,3], meetings=[{dayOfWeek:1}]` (月) → `[1,3]` (既に含む、重複しない)。
- `daysOfWeek=[], meetings=[]` → `[1,2,3,4,5]` (空はデフォルト平日)。

### jsDowToDisplay / displayDowToJs (Web: 純関数)

- `jsDowToDisplay`: 0→7, 1→1, 2→2, 3→3, 4→4, 5→5, 6→6。
- `displayDowToJs`: 7→0, 1→1, ..., 6→6。
- 往復: 全 0..6 で `displayDowToJs(jsDowToDisplay(x)) === x`。

### TimetableView 統合 (Web: RTL、既存 TimetableView.test.tsx に追記)

- `days=[1,2,3,4,5,6,7]` → ヘッダに 月火水木金土日 7 列が出る (corner + 7 = 8 ヘッダセル相当)。
- `days=[1,2,3,4,5]` (デフォルト想定) → 5 列、土日ヘッダ無し。
- `event.dayOfWeek=7` (日) + `days` に 7 含む → 日曜列にイベント描画。`days` に 7 無し → 描画されない (既存 filter 挙動)。

### SelfTimetableView 統合 (Web: 既存 SelfTimetableView.test.tsx に追記)

- timetable に土曜 (JS標準 6) の meeting があり `daysOfWeek=[1..5]` でも、土曜列が出てそのイベントが表示される (union + 変換の結合テスト)。
- 日曜 (JS標準 0) の meeting → 日曜列 (表示系 7) にイベントが出る (旧来は消えていたケースの回帰防止)。

---

# 機能 B: スケルトンローディング

## 方針

- 共通プリミティブ `Skeleton` を `apps/web/src/components/ui/Skeleton.tsx` に新設し、`ui/index.ts` から export。
- 用途別スケルトン (カレンダー月 / 時間割グリッド / 出席カレンダー / リスト) を `apps/web/src/components/ui/skeletons/` にまとめる。
- 既存の `<Panel>読み込み中...</Panel>` / "読み込み中..." テキスト / `Today.tsx` のインライン pulse を、用途に合ったスケルトンへ置換。
- 視覚トークン: 既に `Today.tsx` で使われている `animate-pulse rounded-md bg-bg-muted` を踏襲 (Tailwind v4 で `animate-pulse` 利用可・確認済)。色は CSS 変数トークン `bg-bg-muted`。
- レイアウトシフト回避: 各用途スケルトンは実コンテンツと同等の寸法・グリッド構造に寄せる。
- 見た目の最終調整 (寸法・余白の詰め) は実装中に Leader が Chrome スクショ + Codex で詰める前提。本設計では構造・寸法目安・トークンまで定義する。

## 共通プリミティブ Skeleton

`apps/web/src/components/ui/Skeleton.tsx`:

```ts
type SkeletonProps = {
  width?: string;            // 例 "100%", "44px"。未指定なら "100%"
  height?: string;           // 例 "28px"。未指定なら "1rem"
  radius?: string;           // 例 "9999px", "var(--radius-...)"。未指定なら "0.375rem" (rounded-md 相当)
  className?: string;        // 追加クラス (grid 配置等)
  circle?: boolean;          // true で正円 (radius=9999px, width=height)
};
export function Skeleton(props: SkeletonProps): JSX.Element;
```

仕様:
- 描画は単一 `<div>`。クラスに常時 `animate-pulse bg-bg-muted` を含む。`radius` は inline style か、未指定時 `rounded-md`。
- **ARIA 方針**: プリミティブ単体は装飾なので `aria-hidden="true"` を付ける (スクリーンリーダーに読ませない)。
- ロード中であることの通知は **コンテナ側**で行う: 各 loading 分岐の最外要素に `role="status"` + `aria-busy="true"` + `aria-label="読み込み中"` を付与 (視覚的「読み込み中」テキストは消すが、SR には label で伝わる)。用途別スケルトンがこのラッパを内包する。

## 用途別スケルトン (`apps/web/src/components/ui/skeletons/`)

各コンポーネントは `role="status" aria-busy="true" aria-label="読み込み中"` のラッパ div を持ち、中に複数 `Skeleton` を並べる。

| コンポーネント | ファイル | 構造 (寸法目安) | 置換先で何を覆うか |
|---|---|---|---|
| `TimetableGridSkeleton` | `skeletons/TimetableGridSkeleton.tsx` | `days`(default 5) 列 × `rows`(default 5) 行の grid。`grid-template-columns: 44px repeat(cols, 1fr)`。各セル `Skeleton height="100%"`。ヘッダ行 28px。TimetableView と同じ枠 (`rounded-md border`)。props: `{ days?: number; rows?: number; height?: string }` | TimetableView を出す箇所のロード中 |
| `CalendarMonthSkeleton` | `skeletons/CalendarMonthSkeleton.tsx` | 7 列 × 6 行の月グリッド。曜日ヘッダ 7 セル + 42 日セル。各セル正方形 `Skeleton`。`gap-1` | PersonalCalendar / RoomCalendar の月表示ロード中 |
| `AttendanceCalendarSkeleton` | `skeletons/AttendanceCalendarSkeleton.tsx` | SemesterOverview の出席カレンダー相当。月見出し行 (`Skeleton width="40%" height="1.25rem"`) + 7×N グリッド | SemesterOverview ロード中 |
| `ListSkeleton` | `skeletons/ListSkeleton.tsx` | props `{ rows?: number; itemHeight?: string }`。`space-y-2` で行を縦積み、各行 `Skeleton height={itemHeight ?? "56px"} radius="1rem"` | カレンダー選択リスト / 検索結果 / DayDetail 等の一覧ロード中 |
| `TextLineSkeleton` | `skeletons/TextLineSkeleton.tsx` | props `{ width?: string }`。1 行ぶん `Skeleton height="1rem"` | 「読み込み中...」1 行テキストの置換 (GoogleCalendarSection 等) |

`ui/index.ts` には `Skeleton` と上記用途別を re-export (`export * from "./Skeleton"; export * from "./skeletons";` 等。`skeletons/index.ts` を 1 枚作る)。

## 置換マッピング (対象サイトごと)

| ファイル | 現状 | 置換後 |
|---|---|---|
| `home/PersonalCalendar.tsx` L81 | `<Panel>読み込み中...</Panel>` | `<CalendarMonthSkeleton />` (Panel 枠が要るならスケルトンを Panel で包む or スケルトン側に枠) |
| `semester/SemesterOverview.tsx` L22 | `<Panel>読み込み中...</Panel>` | `<AttendanceCalendarSkeleton />` |
| `semester/DayDetailSheet.tsx` L59 | `読み込み中...` テキスト | `<ListSkeleton rows={3} />` |
| `rooms/RoomTimetable.tsx` L81 | `<Panel>読み込み中...</Panel>` | `<TimetableGridSkeleton days={5} rows={5} height={...同じ height 変数...} />` |
| `rooms/RoomCalendar.tsx` L64 | `data.loading && <Panel>読み込み中...</Panel>` | `data.loading && <CalendarMonthSkeleton />` |
| `avatar/GoogleCalendarSection.tsx` L15 | `読み込み中...` テキスト | `<ListSkeleton rows={2} />` (接続状態カードの代替) |
| `avatar/GoogleCalendarSelectorSheet.tsx` L36 | `読み込み中...` テキスト | `<ListSkeleton rows={3} />` |
| `ics-import/IcsImportWizard.tsx` L61 解析中 / L68 プレビュー読み込み中 | テキスト | L61 `<TextLineSkeleton />` か残置 (短時間)、L68 プレビュー一覧は `<ListSkeleton rows={4} />` |
| `today/Today.tsx` L37 | インライン `animate-pulse` 3 枚 | `<ListSkeleton rows={3} itemHeight="7rem" />` に統一 (機能的に同じ。任意置換) |
| `home/SelfTodayCTA.tsx` L33 | `if (today.isLoading) return null;` | 変更しない (Today.tsx と二重表示になるため null のまま維持) |
| `friends/Friends.tsx` | 明示 loading 表示なし (EmptyState は `!isLoading` 条件) | ロード中に EmptyState もリストも出ない空白。`friendships.isLoading` 時 `<ListSkeleton rows={3} />` を追加 |
| `rooms/Rooms.tsx` | 同上 (`!rooms.isLoading` で EmptyState) | `rooms.isLoading` 時 `<ListSkeleton rows={3} />` を追加 |

注: `SelfTodayCTA.tsx` は対象外確定 (Today と同一データを別場所で出すため、ロード中は null のまま重複回避)。`friends`/`rooms` は「ロード中の空白」を埋める新規追加。

## 挙動仕様 (機能 B / Reviewer テスト根拠 / Web: Vitest + RTL + jsdom)

### Skeleton プリミティブ

- デフォルトで `animate-pulse` クラスと `bg-bg-muted` クラスを持つ div を 1 つ描画。
- `aria-hidden="true"` が付く。
- `width="44px" height="28px"` 指定が style に反映される。
- `circle` 指定で `border-radius` が円 (9999px 相当) かつ width=height。

### 用途別スケルトン

- `TimetableGridSkeleton`:
  - ラッパに `role="status"` `aria-busy="true"` `aria-label="読み込み中"`。
  - `days=7` 指定で `grid-template-columns` が `44px repeat(7, ...)` を含む。
  - 内部に複数 `Skeleton` (aria-hidden) が存在。
- `CalendarMonthSkeleton`: ラッパに `aria-busy="true"`、42 + 7 = 49 セル相当 (おおよそ。実装は 6 週固定)。テストは「セル数が 35 以上」程度の緩い検証で可。
- `ListSkeleton`: `rows=3` で 3 つの行 Skeleton。`role="status"`。
- `TextLineSkeleton`: 1 行 Skeleton + `role="status"`。

### 各置換サイトの結合挙動

「loading 中はスケルトンが出て『読み込み中』テキストが消える、ロード完了で実コンテンツに切替」を対象サイトごとに検証。代表ケース (Reviewer は API モックで isLoading を切替):

- `RoomTimetable`:
  - loading=true → `screen.getByRole("status")` が存在、`queryByText("読み込み中...")` が null、TimetableView (グリッド本体) は未描画。
  - loading=false (week.data あり) → TimetableView が描画、`queryByRole("status")` が null。
- `SemesterOverview`:
  - loading → `getByRole("status")` (AttendanceCalendarSkeleton)、`queryByText("読み込み中...")` null。
  - 完了 → 出席カレンダー本体描画。
- `PersonalCalendar`:
  - loading → CalendarMonthSkeleton (`role=status`)、テキスト消失。
- `Friends` / `Rooms`:
  - loading → `ListSkeleton` (`role=status`) が出る。
  - 完了かつ 0 件 → EmptyState、スケルトン無し。
- `GoogleCalendarSection` / `GoogleCalendarSelectorSheet`:
  - loading → スケルトン、「読み込み中...」テキスト消失。

「読み込み中」文字が画面から消えることを各サイトで `queryByText(/読み込み中/)` が null で確認するのが回帰の主眼。

---

# テスト基盤 (共通)

- **API**: Vitest + 実 SQLite。`apps/api/vitest.config.ts` (node env, forks singleFork)。テスト配置 `apps/api/tests/*.test.ts`。ヘルパ `tests/helpers/{app,auth,http}`。機能 A の DB/dto/PATCH は既存 `apps/api/tests/user-timetables.test.ts` に追記。
- **Web**: Vitest + RTL + jsdom。`apps/web/vitest.config.ts` (jsdom, globals, setup `tests/setup.ts`, alias `@`)。テスト配置 `apps/web/tests/components/*.test.tsx`。
  - 純関数 (`dayConvention.ts`, `resolveDisplayDays`) は `apps/web/tests/lib/` か `tests/components/` 配下に新規 (`dayConvention.test.ts`)。
  - `DayChips.test.tsx` 新規。`Skeleton.test.tsx` / `skeletons.test.tsx` 新規。
  - 機能 A 統合は既存 `TimetableView.test.tsx` / `SelfTimetableView.test.tsx` に追記。
  - 機能 B 結合は各対象コンポーネントの新規/既存テストで isLoading を API フックモックで切替 (既存 `DayDetailSheet.test.tsx` 等のモック手法に倣う)。
- **shared**: 型のみ。Zod refine (重複/件数) の単体テストを置くなら `packages/shared` にテスト基盤が無いため **API テスト経由で 400 を確認**する (新規にテスト基盤を作らない)。

---

# 不採用案

## 機能 A

- **保存を Json 型 (`Json` カラム) にする**: SQLite + Prisma で Json は使えるが、`number[]` の格納に対し CSV の方が migration default 指定が素直 (`@default("1,2,3,4,5")`) で、既存行の埋めも自動。Json default は文字列指定が必要で可読性も劣る。→ CSV 採用。
- **保存 convention を JS標準 0..6 にする**: Meeting と揃う利点はあるが、TimetableView (1..7) / DayChips (月始まり) / DAY_LABELS が全て表示系。保存も表示系にすれば UI〜DTO〜DB が 1 系で完結し変換は「Meeting→TimetableView」の 1 箇所だけに局所化できる。→ 表示系 1..7 採用。
- **テンプレに daysOfWeek を持たせる (Uniform Shape)**: テンプレは構造データの共有が目的で、表示曜日は閲覧者の好み。共有すると「他人の平日/土日設定」を押し付ける。取込後は default 平日 + union で十分。→ 不採用。
- **設定厳密 (union しない)**: 設定で土曜を外すと土曜の授業が画面から消え、出欠漏れ事故になる。データ非隠蔽を優先。→ union 採用。
- **getTodayDayOfWeek を週末対応に改修**: 空セルクリック初期曜日のフォールバックが週末でも今日になる改善はあるが、スコープ (表示曜日設定) 外で回帰リスクを増やす。→ 今回は変更しない。
- **RoomTimetable にも設定値を持たせる**: Room は複数 UserTimetable の合成で単一の設定値源が無い。union のみで土日列を出せば足りる。→ Room は union のみ。

## 機能 B

- **react-loading-skeleton 等の外部ライブラリ導入**: 依存追加に対し必要なのは `animate-pulse` の薄いラッパのみ。既に `Today.tsx` が自前 pulse を使っている。自前プリミティブで十分・トークン (`bg-bg-muted`) 統制も効く。→ 自前。
- **全 loading をグローバル Suspense + スピナーに統一**: 既存は TanStack Query の `isLoading` 分岐ベース。Suspense 移行は大改修でスコープ外。各サイト局所置換に留める。→ 不採用。
- **「読み込み中」テキストを残しつつスケルトンも出す**: 二重表現でノイズ。テキストは消し SR には `aria-label` で伝える。→ テキスト除去。
- **SelfTodayCTA をスケルトン化**: Today.tsx と同データを別所で描画するため、ロード中は null 維持が正解 (重複スケルトン回避)。→ 対象外。
