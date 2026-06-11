# 学期・科目ページ 追加修正4点 — 未記録=欠席扱い + 一括入力 + 休講保存ボタン + 主役色オレンジ化

## 目的 (1-3行)

`20260611-semester-redesign.md` で作り直した学期・科目ページに、運用で見えた4つの実害を当てる: (1)「あと何限休める」が過去未記録を出席仮定して甘い + 未記録の警告が弱い、(2) カレンダー単日モーダルに一括入力が無くホームと操作が非対称、(3) 休講トグルだけ UI が浮いている、(4) 高出席率時にページが緑一色でタブのアクセント (オレンジ) とズレる。再設計の構造・DTO・テスト基盤はそのまま上に乗せる。

---

## スコープと前提

- **前提**: `20260611-semester-redesign.md` (本日 main マージ済) の上に乗る。`computeCourseStatsWithProjection` / `toDate` / `remainingCount` / `allowedAbsences` / `CourseStatsDto.toDate` / `SemesterOverviewDto.overall.{toDate,unrecordedCount,remainingCount,allowedAbsences}` / `User.requiredAttendanceRate` / `AttendanceRateHero` / `CourseListItem` / `rateColor` は**既に存在する**。本設計はその一部の**計算定義の変更**と**表示の追加/置換**を行う。
- 日付正規化は `apps/api/src/lib/tz.ts` の `toIsoDate` / `dateStringToJstDay` を使う (既存方式踏襲)。
- **重要な方針転換**: 再設計時の knowledge `pattern/attendance-to-date-rate-and-allowed-absences.md` は「未記録(過去)は楽観射影で出席仮定」と定義していた。本修正でこれを **「未記録(過去)は欠席扱い (分母に残し分子から除外)」へ置換**する。knowledge も本設計確定後に置換更新する (CLAUDE.md「方針が変わったら追記でなく置換」)。

### 触る範囲

| パス | 扱い |
|---|---|
| `apps/api/src/services/attendanceStats.ts` | `computeCourseStatsWithProjection` の `toDate` 分母計算と `projectedNum` 計算を変更 (修正1) |
| `apps/web/src/lib/attendanceRateColor.ts` | 達成バンドの戻り色を緑→オレンジへ (修正4) |
| `apps/web/src/components/semester/AttendanceRateHero.tsx` | 未記録の目立つバナー追加 + `actionColor` 緑→オレンジ寄せ (修正1, 4) |
| `apps/web/src/components/semester/CourseListItem.tsx` | 未記録の目立つ表示追加 + `actionColor` 緑→オレンジ寄せ (修正1, 4) |
| `apps/web/src/components/semester/DayDetailSheet.tsx` | 一括入力 split button 追加 + 休講チェックボックス→ボタン置換 (修正2, 3) |
| `apps/web/src/api/hooks/` | `useMarkAllPresent` を semester 文脈で再利用 (新規 hook は作らない) |

### 触らない範囲 (厳守)

- ホーム側 `components/today/MainAttendanceCTA.tsx` / `useTodayOccurrences.ts` の `useMarkAllPresent` 本体 — **読んで参考にするが改変しない** (DayDetailSheet から既存 hook をそのまま呼ぶ)
- カレンダーの `lib/dayStatusVisual.ts` (日別ステータスの緑✓/赤✗) — 修正4対象外。意味色 + 凡例付きなので変えない
- bulk API 系 (`POST /api/attendance/bulk` / `useBulkMarkAttendance` / `BulkEditSheet`) — 複数日一括は別系統。DayDetailSheet の単日一括は **mark-all-present** を使う
- `packages/shared` のスキーマ — **新フィールド追加は不要** (既存 `MarkAllPresentInput` / `counts.unrecorded` / `toDate` で足りる)
- 全期間 `attendanceRate` / `effectiveNumerator` / `effectiveDenominator` / `counts` (回帰維持)

---

## 修正1: 未記録=欠席扱い + 未記録の目立つ表示

### 1-A. 計算定義の変更 (`attendanceStats.ts`)

`computeCourseStatsWithProjection` の occurrence ループ内・戻り値計算を変更する。**現状コード (再設計後) との差分のみ記す**。

#### 現状 (再設計マージ後、L100-135 抜粋)

```ts
const record = occurrence.attendanceRecord;
if (!record) {
  if (occurrenceDate <= todayIso) {
    counts.unrecorded += 1;
    floatingPast += 1;          // ← 過去未記録
  } else {
    floatingFuture += 1;
  }
  continue;
}
// ... 記録あり: toDate には date<=today のみ num/den 加算 (現状、未記録は toDateDen に入らない)
// ...
const projectedNum = fixedNumAll + floatingPast + floatingFuture;   // ← 過去未記録を出席仮定 (num+1)
const projectedDen = fixedDenAll + floatingPast + floatingFuture;
```

#### 変更後 (Leader 確定方針)

過去未記録 (`floatingPast`) を「欠席相当」(num に入れない / den に入れる) として扱う。`floatingFuture` は従来どおり出席仮定 (num/den 両方+1)。

```ts
// ループ部は不変 (floatingPast / floatingFuture のカウントはそのまま)。
// 戻り値計算のみ変更:

const projectedNum = fixedNumAll + floatingFuture;                 // ← floatingPast を分子から除外
const projectedDen = fixedDenAll + floatingPast + floatingFuture;  // ← 分母には残す (不変)
```

`toDate` も未記録を分母に加算する (分子には入れない):

```ts
toDate: {
  effectiveNumerator: toDateNum,                          // 不変 (記録済みのみ)
  effectiveDenominator: toDateDen + floatingPast,         // ← 過去未記録を分母に加算
  attendanceRate: (toDateDen + floatingPast) === 0
    ? null
    : toDateNum / (toDateDen + floatingPast),
},
remainingCount: floatingFuture,                            // 不変
allowedAbsences: projectedDen === 0
  ? null
  : Math.floor(projectedNum - requiredRate * projectedDen + 1e-9),  // 式は不変、projectedNum の中身が変わる
```

`overallProjectionNum` / `overallProjectionDen` の集計も新 `projectedNum` / `projectedDen` を加算する (合算射影が自動で新定義に追従)。`getSemesterOverview` 側 (`semesterOverview.service.ts`) の `overall.allowedAbsences` / `overall.toDate` は **既存どおり合算値から再計算**しており、computeCourseStats の新定義をそのまま受けるので**ロジック変更不要** (ただし `overall.toDate.effectiveDenominator` が courses の新 `toDate.effectiveDenominator` 合算であることをテストで確認する。再設計が「courses の toDate 分子分母合算」で実装済なら自動追従)。

> 確認事項 (Developer): `semesterOverview.service.ts` が `overall.toDate` を「courses の `toDate.effectiveNumerator/Denominator` の合算」で組んでいるなら変更不要。もし overview 側が独自に未記録を集計し直していたら、courses の新定義に合わせて修正する。`overall.unrecordedCount` (= Σ counts.unrecorded) は不変。

#### 全期間 `attendanceRate` との整合

全期間 `attendanceRate` = `numerator / (totalSessions − denominatorReduction)` は**現状維持** (主表示は `toDate` なので未記録の影響を受けない設計)。`allowedAbsences` (occurrence ベース射影) と全期間率は別系統の分母を使うため数値は一致しないことがある — これは再設計の「判断1」で許容済の仕様。本修正で矛盾は増えない (`allowedAbsences` が厳しくなる方向の変更のみ)。

### 1-B. 未記録の目立つ表示 (`AttendanceRateHero` / `CourseListItem`)

現状は控えめ。Leader 方針「もっとしっかり分かりやすく」に従い、**未記録がある時だけ警告色のバナー/バッジを強めに出す**。色は `--color-status-tardy` (amber 系の警告色) を使う。

#### AttendanceRateHero (今日まで出席率タイル) — before / after

**before** (現状: 右上に薄い「未記録 N」チップのみ):

```
┌────────────────────────────────────────┐
│ 今日までの出席率              未記録 3   │ ← 薄い chip (tardy 15%)
│ 87%   41.5 / 48限                       │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▒▒▒▒▒                  │
│ あと 11限 休める ・ 残り 52限            │
└────────────────────────────────────────┘
```

**after** (未記録ありを警告バナーで明示 + 記録導線):

```
┌────────────────────────────────────────┐
│ 今日までの出席率                         │
│ 87%   41.5 / 48限                       │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▒▒▒▒▒                  │
│ あと 11限 休める ・ 残り 52限            │
│ ┌────────────────────────────────────┐ │ ← UnrecordedBanner (unrecordedCount>0 のみ)
│ │ ⚠ 未記録 3 件 — 記録して  [カレンダーへ]│ │   bg tardy 15% / 左 border tardy / text tardy
│ └────────────────────────────────────┘ │   "カレンダーへ" は onJumpToCalendar?() があれば表示
└────────────────────────────────────────┘
```

仕様 (AttendanceRateHero への追加):
- `overall.unrecordedCount > 0` のとき、カード下部 (行動指標行の下) に **UnrecordedBanner** を表示。`=== 0` のとき何も出さない (旧チップは**削除し置換**)。
- バナー: `mt-3 flex items-center gap-2 rounded-2xl px-3 py-2`、`style={{ background: "color-mix(in srgb, var(--color-status-tardy) 15%, transparent)", color: "var(--color-status-tardy)", borderLeft: "3px solid var(--color-status-tardy)" }}`。
- 左に `<AlertTriangle className="h-4 w-4" />` (lucide)。
- テキスト: `未記録 {overall.unrecordedCount} 件 — 記録して` (`text-xs font-bold`)。
- 右端に「カレンダーへ」ボタン (任意): 新 prop `onJumpToCalendar?: () => void` が渡されていれば `<button type="button" aria-label="カレンダーへ移動">` を表示しクリックで呼ぶ。**省略可** (prop 未指定ならボタン非表示、バナー本体は出る)。SemesterOverview からカレンダーへの scrollIntoView などは実装側で任意。

#### CourseListItem (科目一覧の各タイル) — before / after

**before** (現状: 3行目に「未N」をテキスト混在):

```
┌────────────────────────────────────┐
▌ オペレーティングシステム      92%    │
▌ ▓▓▓▓▓▓▓▓▓▓▓▓│▒▒▒                  │
▌ 出11 欠1 未1 ・ あと3限休める        │ ← 「未1」が他と同じ色で埋もれる
└────────────────────────────────────┘
```

**after** (未記録ありを警告色バッジで分離):

```
┌────────────────────────────────────┐
▌ オペレーティングシステム  ⚠1  92%    │ ← 科目名の右に未記録バッジ (unrecorded>0 のみ)
▌ ▓▓▓▓▓▓▓▓▓▓▓▓│▒▒▒                  │
▌ 出11 欠1 ・ あと3限休める            │ ← 「未N」は3行目から除去 (バッジに移動)
└────────────────────────────────────┘

(未記録 0 件のとき: バッジなし、3行目も従来どおり)
┌────────────────────────────────────┐
▌ データベース                  64%    │
▌ ▓▓▓▓▓▓▓▓│▒▒▒▒▒▒▒                  │
▌ 出7 欠4 ・ 下回る見込み              │
└────────────────────────────────────┘
```

仕様 (CourseListItem への変更):
- 1行目の科目名と率の間 (科目名の直後) に、`stats.counts.unrecorded > 0` のとき **未記録バッジ**を表示。`=== 0` で非表示。
- バッジ: `inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold`、`style={{ background: "color-mix(in srgb, var(--color-status-tardy) 18%, transparent)", color: "var(--color-status-tardy)" }}`、`<AlertTriangle className="h-3 w-3" />` + `{stats.counts.unrecorded}`。`aria-label={\`未記録 ${stats.counts.unrecorded} 件\`}`。
- 3行目の `未{counts.unrecorded}` は**削除**(バッジへ移動)。3行目は `出{present} 欠{absent}` + 区切り「・」+ 行動指標 のみに置換。

> 旧チップ/旧「未N」テキストは**削除して置換** (CLAUDE.md「追記でなく置換」)。両方残すと未記録が二重表示になる。

---

## 修正2: DayDetailSheet に一括入力 split button

ホーム `MainAttendanceCTA` の split button パターンに揃える。**既存 `useMarkAllPresent` hook をそのまま再利用** (新 hook・新 API は作らない)。`mark-all-present` は date 単位で「未記録の occurrence のみ status upsert (記録済みは skip)」なので、DayDetailSheet が保持する `date` だけで呼べる。

### 配置と構成

DayDetailSheet の「授業 (N)」セクション見出しの直下、OccurrenceRow 一覧の**上**に `<DayBulkAttendanceControl>` を 1 つ置く。occurrence が 0 件 / 時間割全体休講中のときは非表示。

```
┌─────────────────────────────────────────────┐
│ 2026年6月3日 (水)                        [×] │
├─────────────────────────────────────────────┤
│ [この日を休講にする]  理由:[________]        │ ← 修正3 (後述)
├─────────────────────────────────────────────┤
│ 授業 (3)                                      │
│ ┌─────────────────────────────────────────┐ │ ← DayBulkAttendanceControl (新規, split button)
│ │ 全部出席にする (2)            [▾]         │ │   メイン=PRESENT 一括 / ▾=他ステータス
│ └─────────────────────────────────────────┘ │   "(2)" = 未記録件数。0 なら disabled + "記録済み"
│   ▾ メニュー (open 時):                       │
│   ┌──────────────────────┐                   │
│   │ 全部 欠席 (2)         │                   │
│   │ 全部 公欠 (2)         │                   │
│   │ 全部 遅刻 (2)         │                   │
│   │ 全部 早退 (2)         │                   │
│   └──────────────────────┘                   │
│ ┌─ OccurrenceRow × 3 (既存、個別記録) ──────┐ │
│ │ 1限 OS   [未][出][欠][公][遅][早][休]      │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### DayBulkAttendanceControl (新規、DayDetailSheet 内ローカルコンポーネント)

```ts
type DayBulkAttendanceControlProps = {
  date: string;                 // DayDetailSheet が保持する ISO date
  unrecordedCount: number;      // data.occurrences のうち status==null かつ休講でないものの件数
  disabled: boolean;            // 時間割全体休講中なら true
};
```

- 内部で `useMarkAllPresent(onErrorToast)` を呼ぶ (`onErrorToast` は DayDetailSheet が持つ Toast、無ければ no-op 関数を渡す)。
- メインボタン: `variant={unrecordedCount===0 ? "secondary" : "primary"}`、ラベル `unrecordedCount===0 ? "記録済み" : \`全部出席にする (${unrecordedCount})\``。クリックで `markAll.mutate({ date, status: "PRESENT" })`。
- ▾ ボタン (split の右側): `aria-label="一括記録のステータスを選ぶ"` / `aria-haspopup="menu"` / `aria-expanded={menuOpen}`。クリックでメニュー開閉。
- メニュー (`role="menu"`): `BULK_STATUSES = ["ABSENT","EXCUSED","TARDY","EARLY_LEAVE"]` を `role="menuitem"` で並べ、ラベル `全部 {statusLongLabels[status]} ({unrecordedCount})`。クリックで `markAll.mutate({ date, status })` + メニュー閉じ。
- `disabled` (休講中) または `unrecordedCount===0` のとき、メイン/▾ ともに disabled。
- mutation pending 中は disabled。
- **既に記録済みの occurrence は上書きされない** (mark-all-present は未記録のみ) — これは UI 上「全部出席にする (N)」の N が未記録件数であることで暗黙に伝わる。加えてメニュー上部に補足テキスト `text-[10px] text-fg-tertiary` 1 行「未記録の {unrecordedCount} 件のみ。記録済みは変わりません」を表示。

### invalidate / 反映

`useMarkAllPresent` の `onSuccess` は `["stats"] / ["semesters"] / ["day"]` を invalidate 済 (既存)。DayDetailSheet は `useDayDetail(date)` = `["day", date]` を読むので、一括実行後に **occurrence の status が即時更新される** (再 fetch)。**hook 本体は変更しない**。

> 共通化の判断: `MainAttendanceCTA` の split button は keyboard 検知 / fixed bar / ExpandedPanel と密結合 (L43-52, L92-170)。共通コンポーネント抽出は密結合を切り出すコストが見合わないため、**DayBulkAttendanceControl を DayDetailSheet 内に新規実装**する (split button の見た目・aria はホームを踏襲)。`BULK_STATUSES` の定数のみ `MainAttendanceCTA` から import するか、`labels.ts` 近傍に定数を置いて共有してよい (Developer 判断、ただし値は `["ABSENT","EXCUSED","TARDY","EARLY_LEAVE"]` 固定)。

---

## 修正3: 休講チェックボックス → 保存ボタン

現状 (`DayDetailSheet.tsx` L62-84): `<input type="checkbox">` の `onChange` で即時 `handleTimetableToggle()`。他項目 (科目休講・予定追加) は Button 主体でチェックボックスだけ浮いている。

### before / after

**before**:

```
┌─────────────────────────────────────────────┐
│ この日を休講にする (時間割全体)      [☑]     │ ← checkbox 即時実行
│ 理由: [____________]                         │
└─────────────────────────────────────────────┘
```

**after** (未休講時):

```
┌─────────────────────────────────────────────┐
│ この日を休講にする (時間割全体)               │
│ 理由: [____________] (任意)                  │
│                          [この日を休講にする] │ ← Button (primary)
└─────────────────────────────────────────────┘
```

**after** (休講中):

```
┌─────────────────────────────────────────────┐
│ 休講中: <理由>                                │
│                              [休講を解除]     │ ← Button (ghost/secondary)
└─────────────────────────────────────────────┘
```

### 仕様

- `<input type="checkbox">` と、それを囲む `<label>` を**削除**。
- 未休講時 (`timetableSuspension == null`): 見出し `この日を休講にする (時間割全体)` (text-sm font-bold) + `Input` (reason、placeholder「理由 (任意)」、maxLength 100) + `Button variant="primary" size="sm"`「この日を休講にする」。クリックで `createTimetableSuspension.mutateAsync({ date, reason: reason.trim() || undefined })` → 成功で `setReason("")`。
- 休講中時 (`timetableSuspension != null`): `休講中{reason ? \`: ${reason}\` : ""}` (text-xs font-bold、`text-status-cancelled`) + `Button variant="ghost" size="sm"`「休講を解除」。クリックで `deleteTimetableSuspension.mutateAsync(timetableSuspension.id)`。
- `disabled`: 該当 mutation の `isPending` 中。
- hook (`useCreateTimetableSuspension(date)` / `useDeleteTimetableSuspension(date)`) は**流用** (`handleTimetableToggle` のロジックを 2 つのボタン onClick に分割)。
- `handleTimetableToggle` 関数は削除し、`handleSuspend` / `handleUnsuspend` (または各 onClick インライン) に置換。

> CLAUDE.md「追記でなく置換」: 旧 checkbox UI と `handleTimetableToggle` は完全に削除する。新 Button を別途追加して checkbox を残してはいけない。

---

## 修正4: rate/progress の主役色を緑 → オレンジ

### rateColor の変更 (`lib/attendanceRateColor.ts`)

緑の正体は達成バンド (`pct >= requiredRate`) が `--color-status-present` (#34D399 緑) を返すこと。これを **`--color-accent-500` (#F97316 オレンジ)** に変える。

#### before

```ts
export function rateColor(pct: number | null, requiredRate: number): string {
  if (pct == null) return "var(--color-fg-tertiary)";
  if (pct >= requiredRate) return "var(--color-status-present)";       // 緑
  if (pct >= requiredRate - 10) return "var(--color-status-tardy)";    // amber #FFC93C
  return "var(--color-status-absent)";                                  // 赤
}
```

#### after

```ts
export function rateColor(pct: number | null, requiredRate: number): string {
  if (pct == null) return "var(--color-fg-tertiary)";
  if (pct >= requiredRate) return "var(--color-accent-500)";           // オレンジ #F97316
  if (pct >= requiredRate - 10) return "var(--color-status-absent)";   // ← 警告バンドを赤に寄せる (識別性確保)
  return "var(--color-status-absent)";                                  // 赤
}
```

#### 識別性の判断 (Leader 提起への回答)

オレンジ accent-500 (#F97316) と amber tardy (#FFC93C) は色相が近接し、達成 (オレンジ) と警告 (amber) が並ぶと見分けにくい。**警告バンド (`requiredRate-10 <= pct < requiredRate`) の色を amber から赤 (`--color-status-absent` #FF5C7A) に変更**する。これで 2 バンド構成になり「必要率以上 = オレンジ (主役色)」「必要率未満 = 赤 (危険)」と明快に二分される。中間の amber を廃することで accent と紛れない。

- 達成 (`pct >= requiredRate`): **オレンジ** (主役色、タブと一致)
- 未達 (`pct < requiredRate`): **赤** (達成まで 10pt 以内かどうかに関わらず危険として赤)

> これは「警告バンドの色を微調整して識別性を確保」という Leader 委任判断の具体化。3 バンド (オレンジ/amber/赤) は accent と amber が紛れるため 2 バンドに簡素化する。requiredRate-10 の境界閾値自体は残すが両側とも赤になるので実質 1 閾値。**`requiredRate - 10` の中間分岐は残すが戻り色を absent に統一** (将来 amber を別用途で復活させやすいよう構造は保つ)。

### actionColor の変更 (Hero / CourseListItem)

`AttendanceRateHero.actionColor` (L68-73) と `CourseListItem.actionColor` (L54-59) の「`allowedAbsences >= remainingCount`」(残り全休 OK) 分岐が `--color-status-present` (緑) を返す。これを **`--color-accent-500` (オレンジ)** に寄せて統一する。

#### Hero actionColor before / after

```ts
// before
if (allowedAbsences >= remainingCount) return "var(--color-status-present)";  // 緑
// after
if (allowedAbsences >= remainingCount) return "var(--color-accent-500)";      // オレンジ
```

CourseListItem の `actionColor` も同様 (`>= remainingCount` の戻り値を `--color-accent-500` へ)。`< 0` (下回り) の `--color-status-absent` は維持。`null`/通常の `fg-tertiary`/`fg-primary` は維持。

### カレンダー日セルは不変

`lib/dayStatusVisual.ts` の出席=緑✓ / 欠席=赤✗ / 休講=suspended は**変更しない** (意味色 + 凡例付き)。修正4のスコープは AttendanceRateHero / CourseListItem の rate 大数字・%・プログレスバー・色バー・行動指標色のみ。

---

## API / 関数シグネチャ (変更分)

### `computeCourseStatsWithProjection` (apps/api/src/services/attendanceStats.ts)

シグネチャ不変。戻り値の `CourseStatsDto` の以下フィールドの**値の定義**が変わる:

```ts
// 変更されるフィールド (型は不変):
toDate.effectiveDenominator   // = toDateDen + floatingPast (過去未記録を分母に加算)
toDate.attendanceRate         // = toDateNum / (toDateDen + floatingPast)  (分母0で null)
allowedAbsences               // = floor((fixedNumAll+floatingFuture) - r*(fixedDenAll+floatingPast+floatingFuture) + 1e-9)

// 不変:
toDate.effectiveNumerator     // = toDateNum (記録済みのみ)
remainingCount                // = floatingFuture
counts.unrecorded             // = 過去未記録件数
effectiveNumerator / effectiveDenominator / attendanceRate / counts (全期間系、回帰)
```

`overallProjection` (合算射影) も新 `projectedNum`/`projectedDen` を加算するため、`getSemesterOverview` の `overall.allowedAbsences` / `overall.toDate` が自動で新定義に追従する。

### `rateColor` (apps/web/src/lib/attendanceRateColor.ts)

シグネチャ不変 `(pct: number | null, requiredRate: number) => string`。戻り色マッピングのみ変更 (§修正4)。

### コンポーネント props 契約 (Reviewer の描画テスト根拠)

> knowledge `gotcha/design-must-specify-component-prop-contract-for-render-tests` 準拠。Reviewer は実装を見ずにこの契約でテストを書く。

#### AttendanceRateHero

```ts
type AttendanceRateHeroProps = {
  overall: SemesterOverviewDto["overall"];   // toDate{effectiveNumerator,effectiveDenominator,attendanceRate}, unrecordedCount, remainingCount, allowedAbsences を含む
  requiredRate: number;                       // % 整数
  onJumpToCalendar?: () => void;              // ← 新規・任意。未記録バナーの「カレンダーへ」ボタン用
};
```

#### CourseListItem

```ts
type Props = {
  stats: CourseStatsDto;       // counts.unrecorded, counts.present, counts.absent, toDate.attendanceRate, allowedAbsences, remainingCount, courseName を含む
  requiredRate: number;        // % 整数
  onClick: () => void;         // 既存どおり CourseDetailModal を開く
};
```

#### DayBulkAttendanceControl (DayDetailSheet 内ローカル / テスト対象は親 DayDetailSheet 経由)

```ts
type DayBulkAttendanceControlProps = {
  date: string;
  unrecordedCount: number;
  disabled: boolean;
};
```

DayDetailSheet 自体の props 契約は既存どおり `{ date: string | null; semesterId?: string | null; onClose: () => void }` (変更なし)。Reviewer は既存テスト同様 `@/api/hooks` を vi.mock し、**`useMarkAllPresent` をモックリストに追加**する (返り値 `{ mutate, isPending: false }`)。

---

## 挙動仕様 (Reviewer テスト根拠)

「今日」は `now` 引数で固定 (実時刻依存禁止)。既存ヘルパ `setupCompleteUser` / `createOccurrence` を再利用。`requiredAttendanceRate` はデフォ 70。日付は ISO、`now` のデフォは既存テスト同様 `2026-06-08T03:00:00Z` 系で固定し、過去/今日/未来を `date` で制御。

### (a) 未記録=欠席扱いの計算 — computeCourseStats (API ユニット)

数値例の前提: 1 科目、occurrence を `now` で過去/未来に振り分け、requiredAttendanceRate=70。

1. **基本例 (Leader 指定)**: 過去 occurrence 10 件 = PRESENT 6 / ABSENT 1 / 未記録 3、未来 5 件 (全未記録)、required 70%。
   - `toDate.effectiveNumerator = 6` (PRESENT 6)
   - `toDate.effectiveDenominator = 7 + 3 = 10` (記録済 7 = PRESENT6+ABSENT1、+ 過去未記録 3)
   - `toDate.attendanceRate = 6/10 = 0.6` (未記録を分母に入れるので率が下がる)
   - `counts.unrecorded = 3`、`remainingCount = 5`
   - `allowedAbsences`: projectedNum = fixedNumAll(6) + floatingFuture(5) = 11、projectedDen = fixedDenAll(7) + floatingPast(3) + floatingFuture(5) = 15 → `floor(11 − 0.7×15 + 1e-9) = floor(0.5) = 0`
2. **未記録なしとの対比 (回帰確認)**: 同じ過去 10 件で PRESENT 9 / ABSENT 1 / 未記録 0、未来 5 → `toDate = {9, 10, 0.9}`、allowedAbsences = floor((9+5) − 0.7×15) = floor(3.5) = 3。未記録が無いと従来どおり。
3. **未記録だけで率が下がる**: 過去 4 件 = PRESENT 4 / 未記録 0 → `toDate = {4,4,1.0}`。同じ過去に未記録を 1 足す (PRESENT4 / 未記録1、過去 5 件) → `toDate = {4,5,0.8}`。未記録 1 件で率 1.0→0.8。
4. **境界=今日当日**: occurrence date == todayIso かつ未記録 → `counts.unrecorded` に入り `toDate.effectiveDenominator` に加算される (過去未記録扱い)。date == todayIso かつ記録あり → 通常どおり toDateNum/Den に算入。date > todayIso (未来) の未記録 → `remainingCount` に入り toDate 分母には**入らない**。
5. **HALF_PRESENT 端数**: 過去 = PRESENT 6 / TARDY 1 (rule HALF_PRESENT) / 未記録 2、未来 8、totalSessions 17、required 70。
   - `toDate.effectiveNumerator = 6.5`、`toDate.effectiveDenominator = 7(記録済) + 2(未記録) = 9`、rate = 6.5/9 ≈ 0.722
   - allowedAbsences: projectedNum = fixedNumAll(6.5) + floatingFuture(8) = 14.5、projectedDen = fixedDenAll(7) + floatingPast(2) + floatingFuture(8) = 17 → floor(14.5 − 0.7×17 + 1e-9) = floor(14.5 − 11.9) = floor(2.6) = 2。floor が 0.5 端数を吸収。
6. **負値 (未記録で下回る)**: 過去 = PRESENT 5 / 未記録 5、未来 0、required 70 → projectedNum = 5、projectedDen = 5 + 5 + 0 = 10 → floor(5 − 7) = −2 (負を返す)。`toDate = {5, 10, 0.5}`。
7. **REDUCE_DENOMINATOR / CANCELLED**: weight.den=0 のため fixedDen/toDateDen に入らない。過去 = PRESENT 6 / EXCUSED 1(REDUCE) / 未記録 0、未来 0 → `toDate = {6, 6, 1.0}` (EXCUSED は分母除外、未記録 0 なので加算なし)。
8. **SEPARATE_COUNT**: separateCounts に計上、toDate/射影どちらにも入らない (未記録の新定義の影響を受けない)。
9. **休講除外**: 時間割全体休講 or 科目別休講の日の occurrence は `counts.suspended` で continue され、未記録カウント (floatingPast) にも入らない → toDate 分母にも射影にも入らない。未来休講も remainingCount に入らない。
10. **occurrence 0 件 course**: `toDate = {0, 0, null}`、remainingCount 0、allowedAbsences null。
11. **回帰**: 全期間 `effectiveNumerator` / `effectiveDenominator` / `attendanceRate` / `counts` は本変更前後で**不変** (例 1 の course で effectiveDenominator = totalSessions − denominatorReduction が従来値のまま)。

### (b) overview 集約 — GET /api/semesters/:id/overview

12. `overall.toDate.effectiveDenominator` = courses の新 `toDate.effectiveDenominator` (未記録込み) の合算。`overall.toDate.attendanceRate` = 合算分子 / 合算分母。例 1 の単一 course 構成で `overall.toDate = {6, 10, 0.6}`。
13. `overall.allowedAbsences` = 合算射影 (ΣprojectedNum, ΣprojectedDen) から `floor(ΣprojNum − 0.7×ΣprojDen + 1e-9)`。例 1 単一 course なら 0。複数 course でも科目別 allowedAbsences の和ではなく合算射影から計算 (floor 非線形)。
14. `overall.unrecordedCount` = Σ counts.unrecorded (不変、例 1 で 3)。`overall.remainingCount` = Σ remainingCount (例 1 で 5)。

### (c) rateColor (Web pure — apps/web/tests/lib/attendanceRateColor.test.ts 書き換え)

15. `rateColor(null, 70)` → `"var(--color-fg-tertiary)"`。
16. `rateColor(70, 70)` → `"var(--color-accent-500)"` (達成 = オレンジ。**緑ではない**)。
17. `rateColor(92, 70)` → `"var(--color-accent-500)"`。
18. `rateColor(69, 70)` → `"var(--color-status-absent)"` (未達 = 赤。**amber tardy ではない**)。
19. `rateColor(65, 70)` (requiredRate-10 以上だが未満) → `"var(--color-status-absent)"` (赤。旧仕様の amber ではない)。
20. `rateColor(50, 70)` → `"var(--color-status-absent)"`。
21. requiredRate 連動: `rateColor(90, 90)` → accent-500、`rateColor(89, 90)` → absent。**戻り値に `--color-status-present` (緑) が一切現れない**こと。

### (d) AttendanceRateHero (RTL)

props 契約 §API 参照。

22. `overall.toDate = {6, 10, 0.6}`, requiredRate=70 → 「60」「%」「6 / 10限」が描画され、大数字の color style が `var(--color-accent-500)` でない (0.6<0.7 なので赤 `var(--color-status-absent)`)。
23. `overall.toDate = {41.5, 48, 0.864...}`, required 70 → 「86」描画、color style に `var(--color-accent-500)` (達成)。
24. `unrecordedCount: 3` → 「未記録 3 件 — 記録して」テキストを含む警告バナーが描画される。`AlertTriangle` 由来の svg を含む。
25. `unrecordedCount: 0` → 「未記録」を含むテキストが**存在しない** (バナー非表示)。
26. `onJumpToCalendar` を渡し `unrecordedCount>0` → 「カレンダーへ」ボタンが存在しクリックで `onJumpToCalendar` が 1 回呼ばれる。`onJumpToCalendar` 未指定 + `unrecordedCount>0` → バナーは出るが「カレンダーへ」ボタンは無い。
27. `allowedAbsences: 11, remainingCount: 52` → 「あと 11限 休める」、その色 style が `var(--color-accent-500)` でない (通常 fg-primary)。
28. `allowedAbsences: 60, remainingCount: 52` (>= remaining) → 「残りを全部休んでも 70% を維持」、色 style が `var(--color-accent-500)` (オレンジ。**緑ではない**)。
29. `allowedAbsences: -2` → 「残り全部出席しても 70% に届きません」、色 `var(--color-status-absent)`。
30. progress bar の width style に `60%` 相当、marker の left style に `70%` 相当の文字列 (jsdom は style 生文字列 assert)。
31. `toDate.attendanceRate: null` → 「—」表示、落ちない。

### (e) CourseListItem (RTL)

32. `stats.counts.unrecorded = 1` → 科目名の隣に未記録バッジ (AlertTriangle svg + 「1」、`aria-label="未記録 1 件"`) が描画される。3行目に「未1」テキストが**無い**。
33. `stats.counts.unrecorded = 0` → 未記録バッジ非表示。3行目は「出{n} 欠{n}」+ 行動指標のみ。
34. `stats.toDate.attendanceRate = 0.92, requiredRate = 70` → 「92」が `var(--color-accent-500)` style (オレンジ)。`0.64` → `var(--color-status-absent)` (赤)。
35. 「出{present} 欠{absent}」が counts から描画される (「未」は 3 行目から消えている)。
36. クリックで `onClick` が 1 回呼ばれる。
37. `allowedAbsences >= remainingCount` → 行動指標「残り全休OK」の色 style が `var(--color-accent-500)` (オレンジ)。`< 0` → 「下回る見込み」が `var(--color-status-absent)`。

### (f) DayDetailSheet 一括入力 (RTL)

既存テスト同様 `@/api/hooks` を vi.mock。**`useMarkAllPresent` をモックに追加** (`{ mutate, isPending: false }`)。`useDayDetail` は occurrences を返す。

38. occurrence 2 件 (両方 status null)・非休講 → 「全部出席にする (2)」ボタンが描画される。クリックで `markAll.mutate` が `{ date, status: "PRESENT" }` で呼ばれる。
39. ▾ ボタン (`aria-label="一括記録のステータスを選ぶ"`) クリックでメニュー (`role="menu"`) が開き、「全部 欠席 (2)」「全部 公欠 (2)」「全部 遅刻 (2)」「全部 早退 (2)」の menuitem が出る。「全部 欠席 (2)」クリックで `markAll.mutate` が `{ date, status: "ABSENT" }` で呼ばれる。
40. occurrence 全件記録済み (status != null) → メインボタンが「記録済み」表示かつ disabled、▾ も disabled。
41. 時間割全体休講中 (`timetableSuspension != null`) → 一括コントロールが非表示 (または disabled)。`disabled=true` で render される。
42. occurrence 0 件 → 一括コントロール非表示。
43. メニュー上部に「未記録の {n} 件のみ。記録済みは変わりません」補足テキストが出る。

### (g) DayDetailSheet 休講ボタン (RTL)

44. `timetableSuspension == null` → 「この日を休講にする」ボタンが描画される。**checkbox (`type="checkbox"`) は存在しない**。クリックで `createTimetableSuspension.mutateAsync` が `{ date, reason: undefined }` (理由空時) で呼ばれる。
45. 理由 Input に「健康診断」を入力して「この日を休講にする」クリック → `createTimetableSuspension.mutateAsync` が `{ date, reason: "健康診断" }` で呼ばれる。
46. `timetableSuspension != null` → 「休講中」テキストと「休講を解除」ボタンが出る。「休講を解除」クリックで `deleteTimetableSuspension.mutateAsync` が `timetableSuspension.id` で呼ばれる。「この日を休講にする」ボタンは出ない。
47. pending 中 (`isPending: true`) → 該当ボタン disabled。

### (h) 既存回帰

48. DayDetailSheet 既存テスト (#28 系: 休講中の OccurrenceRow disabled、個別 status クリックで `usePatchAttendance`) が**引き続き通る** (一括コントロール追加・休講ボタン化が既存 OccurrenceRow / 個別記録を壊さない)。モック追加 (`useMarkAllPresent`) のみで既存アサーションは不変。

---

## テスト基盤

- **API**: Vitest + 実 SQLite (`apps/api/vitest.config.ts`)、配置 `apps/api/tests/`。`computeCourseStats` を `now` 固定で呼ぶ既存 `statsScenario` ヘルパ (`tests/stats.test.ts`) を再利用・拡張。
  - `tests/stats.test.ts` (追記) — (a) 1-11, (b) 12-14。**未記録を含む `toDate` / `allowedAbsences` の数値例は既存テストの計算前提が変わる**: 既に未記録を含む `toDate` をアサートしている既存テストがあれば、新定義 (分母に未記録加算) に**値を更新する** (これは仕様変更による期待値更新であり、回帰失敗ではない)。Developer は該当既存アサートを新値へ置換。全期間 `effectiveNumerator/Denominator` 系のアサート (#11) は不変。
- **Web**: Vitest 2 + jsdom + RTL。配置 `apps/web/tests/{components,lib}/`。
  - `tests/lib/attendanceRateColor.test.ts` (書き換え) — (c) 15-21。**緑 (`--color-status-present`) を期待する旧アサートをオレンジ (`--color-accent-500`) / 赤 (`--color-status-absent`) に置換**。
  - `tests/components/AttendanceRateHero.test.tsx` (追記/更新) — (d) 22-31。未記録バナー・色変更分を追加、緑期待の旧アサートを更新。
  - `tests/components/CourseListItem.test.tsx` (追記/更新) — (e) 32-37。未記録バッジ・「未N」除去・色変更分。
  - `tests/components/DayDetailSheet.test.tsx` (追記) — (f) 38-43, (g) 44-47, (h) 48。`vi.mock("@/api/hooks")` のモックオブジェクトに `useMarkAllPresent: vi.fn()` を追加し、`mockHooks` で `{ mutate: vi.fn(), isPending: false }` を返す。
- jsdom の罠 (既知ベースライン、判定除外): `localStorage` 不在 (theme import 系は stub 必須、`Muraki/knowledge/gotcha/jsdom-no-localstorage-in-vitest.md`)、`color-mix`/`calc` は評価されないため **style は生文字列 assert** (色は `var(--color-...)` の文字列一致で検証)。
- **既知ベースライン失敗は判定除外**: api auth/friendship/room 系 20 件、web routes 系 27 件、jsdom localStorage 系。Reviewer はこれらを GREEN 判定の対象外とする。
- E2E (chrome-devtools MCP) は本修正のテスト範囲外。最終の見た目 (オレンジ化・バナー) は実装中に Leader が Chrome スクショで確認 (色変更は目視確認向き)。

---

## 不採用案

- **未記録を `toDate` 分母に入れず据え置き (再設計の判断2を維持)**: 「未記録があると率が下がって実態を反映」という Leader 要望に反する。記録忘れで率が下がるのは UX 上不利だが、未記録警告バナー/バッジを強化して「下がっている = 記録しろ」と能動的に促す設計で補う。Leader 確定方針。
- **`allowedAbsences` で過去未記録を出席仮定のまま (再設計の判断3を維持)**: 「あと何限休める」が甘く出て休みすぎる。未記録を欠席扱いにして保守的に出す方が安全側 (記録すれば実態に補正される)。Leader 確定方針。
- **未記録を「欠席」と完全に同一視 (counts.absent に合算)**: 未記録は「まだ記録していない」状態であり「欠席した」とは意味が違う。率計算上は欠席相当 (分母+分子据置) にするが、`counts` 上は `unrecorded` のまま分けてバッジで「記録して」と促す。意味論を潰さない。
- **DayDetailSheet 一括に新 API `POST /api/attendance/bulk` (複数日) を使う**: bulk は dates 配列前提で単日に過剰。`mark-all-present` が date 単位・未記録のみ・記録済み skip で要件に完全一致。新 hook/新 API 不要で既存をそのまま呼ぶのが最小。
- **MainAttendanceCTA の split button を共通コンポーネント抽出**: keyboard 検知・fixed bar・ExpandedPanel と密結合 (170 行)。抽出コストが DayDetailSheet 用の薄い split button を新規実装するコストを上回る。`BULK_STATUSES` 定数のみ共有。
- **mark-all-present に「記録済みも上書き」モードを追加**: 単日詳細では個別 OccurrenceRow で 1 限ずつ直せる。一括は「未記録をまとめて埋める」用途に限定し、上書きは BulkEditSheet (複数日) の OVERWRITE モードに委ねる。API を増やさない。
- **休講を Button ではなく Switch (toggle) コンポーネントに**: トグルは即時実行で「理由を入れてから確定」のフローと相性が悪い (Switch ON 後に理由を入れる順序が不自然)。Button なら理由入力→確定の順序が明示的。他項目 (科目休講・予定) も Button なので統一。
- **rateColor を 3 バンド (オレンジ/amber/赤) 維持**: accent-500 (#F97316) と tardy (#FFC93C) が色相近接で達成/警告が紛れる。2 バンド (オレンジ = 達成 / 赤 = 未達) に簡素化し、accent と被る amber を rate 表示から外す。amber は未記録バナー専用に残す (用途が分離して紛れない)。
- **カレンダー日セルの出席色もオレンジに統一**: 日セルは「✓出席=緑 / ✗欠席=赤」の意味色で凡例付き (`dayStatusVisual.ts`)。緑✓は普遍的な「OK」の直感で、率の主役色 (達成度) とは別レイヤー。混ぜると凡例が壊れる。修正4 スコープ外。
