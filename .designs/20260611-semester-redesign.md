# 学期・科目ページ全面再設計 — 今日まで出席率 + 複数日一括訂正 + 「あと N 限休める」

## 目的 (1-3行)

学期・科目タブを「学期全体の見込み率を眺めるページ」から「**今日までの実績**を確認し、**過去の記録をカレンダーから一括訂正**し、**あと何限休めるか**で行動判断できるページ」に作り替える。視覚 (マーカー/余白/タップターゲット) も TimeTree 風 dark + orange のまま実用密度に引き上げる。

---

## スコープと前提

- Phase 1 (`20260602-phase1-course-meeting-refactor.md`) / Phase 2 (`20260605-phase2-semester-calendar.md`) は main マージ済が前提。DayDetailSheet・PersonalEventEditModal・休講 2 層 (CourseSuspension / TimetableSuspension)・`GET /api/day/:date` は既存のまま使う。
- 日付正規化は `apps/api/src/lib/tz.ts` の `dateStringToJstDay` / `toIsoDate` を必ず使う (Asia/Tokyo 00:00:00 スナップ)。

### 並行設計との境界 (厳守)

並行して「UI 小修正」設計が走る。**本設計が触ってよい範囲**:

| 範囲 | 扱い |
|---|---|
| `apps/web/src/components/semester/` 配下 | 本設計が全面改修 (DayDetailSheet / PersonalEventEditModal / CourseDetailModal は**変更しない**) |
| `apps/api/src/services/attendanceStats.ts` / `semesterOverview.service.ts` | 本設計が改修 |
| `apps/api/src/routes/attendance.ts` / `packages/shared/src/schemas/attendance.ts` | **新エンドポイント/新スキーマの追記のみ**。`mark-all-present` と既存 `POST/DELETE /api/attendance/:occurrenceId` の本体は触らない |
| `apps/api/src/routes/timetableSuspensions.ts` + service | bulk 2 endpoint を追記 |
| `apps/web/src/components/ui/skeletons/` | **新規ファイル追加のみ** (`SemesterOverviewSkeleton.tsx`)。既存スケルトンファイルは編集禁止 (並行設計が触る)。`skeletons/index.ts` は export 1 行の追記のみ可 |
| `components/today/MainAttendanceCTA.tsx`, `rooms/calendar/PeriodNav.tsx` | **触らない** (並行設計の領分) |
| `apps/web/src/styles.css` | CSS 変数 `--color-status-suspended` の**追記のみ** |
| User モデル / `me.ts` (schema+route) / `components/settings/` | 必要出席率設定の追加 |

### 本設計が「やらないこと」

- 必要出席率の科目別設定 (全体で 1 つ、要望どおり)
- 個人イベントの出席率算入 (Phase 2 の決定を維持)
- 既存 `SemesterOverviewDto.overall` / `CourseStatsDto` の既存フィールドの削除・意味変更 (Stats ページ等が参照。追加のみ)
- mark-all-present の bulk 統合 (並行設計と衝突。別物のまま)

---

## 設計判断の要点 (先に確定させる)

### 判断 1: 「今日まで」の分母は occurrence ベース

`course.totalSessions` (ユーザー申告の学期総回数) では「今日までに何回実施されたか」が原理的に分からない。新規フィールドは全て **MeetingOccurrence の実日付ベース**で数える。既存の `effectiveDenominator` (totalSessions ベース、学期全体見込み) は後方互換のため**そのまま残すが、UI の主表示からは外す**。両者の数字は一致しないことがある (申告 15 回 vs 生成 14 回など) — これは仕様であり、UI は新フィールドのみ表示するため混在しない。

### 判断 2: 未記録は「今日まで出席率」の分母に入れない

今日まで出席率 = **記録済み occurrence のみ**で算出 (`分子/分母とも記録の重みの合計`)。未記録を 0 点扱いで分母に入れると「記録し忘れただけで率が暴落」し信頼を失う。未記録は `未記録 N` チップで別出しして記録を促す。

### 判断 3: 「あと N 限休める」は楽観射影 (未記録・未来は出席仮定)

未記録 (過去) と未来の occurrence を「全部出席する」と仮定した学期末射影に対し、必要出席率を割らずに積める欠席数を整数で返す。未記録の楽観仮定は「未来は出席する」仮定と同じ性質で一貫する。

### 判断 4: 必要出席率は `User.requiredAttendanceRate Int @default(70)` (% 整数)

Float (0.7) は比較誤差の温床。% 整数 1–100、デフォルト 70。

---

## データモデル (Prisma)

`apps/api/prisma/schema.prisma` の User に 1 カラム追加。migration は `prisma migrate dev --name semester_redesign_required_attendance_rate` で 1 本 (SQLite、単純 ADD COLUMN、データ移行不要 — default 70 が全既存行に効く)。

```prisma
model User {
  // ... 既存
  requiredAttendanceRate Int @default(70)   // 必要出席率 (%)。1-100。全科目共通
}
```

他のモデル変更なし。bulk API は既存テーブル (AttendanceRecord / TimetableSuspension) への一括書き込みのみ。

---

## shared schema 変更 (`packages/shared/src/schemas/`)

### `stats.ts` — CourseStatsDto に追記 (既存フィールド不変)

```ts
export const CourseStatsDto = z.object({
  // ... 既存フィールド全て不変 (courseId, courseName, teacher, totalSessions,
  //     generatedOccurrences, counts, effectiveNumerator, effectiveDenominator,
  //     attendanceRate, separateCounts?)

  // ▼ 追加: 今日まで (occurrence ベース、記録済みのみ)
  toDate: z.object({
    effectiveNumerator: z.number(),          // 0.5 刻みあり (HALF_PRESENT)
    effectiveDenominator: z.number(),
    attendanceRate: z.number().nullable(),   // 分母 0 のとき null
  }),
  // ▼ 追加: 残り (date > today、休講除外、記録なし)
  remainingCount: z.number().int(),
  // ▼ 追加: あと何限休めるか (負あり。射影分母 0 のとき null)
  allowedAbsences: z.number().int().nullable(),
});

export const StatsResponse = z.object({
  semesterId: z.string(),
  requiredAttendanceRate: z.number().int(),  // 追加
  courses: z.array(CourseStatsDto),
});
```

※ 今日までの未記録数は既存 `counts.unrecorded` がそのまま「date <= today の未記録数」なので新設しない。

### `semester.ts` — SemesterOverviewDto に追記

```ts
export const SemesterOverviewDto = z.object({
  // ... 既存不変
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // 追加: サーバ判定の今日 (JST)
  requiredAttendanceRate: z.number().int(),           // 追加
  overall: z.object({
    effectiveNumerator: z.number(),                   // 既存
    effectiveDenominator: z.number(),                 // 既存
    attendanceRate: z.number().nullable(),            // 既存
    // ▼ 追加 (courses の合算)
    toDate: z.object({
      effectiveNumerator: z.number(),
      effectiveDenominator: z.number(),
      attendanceRate: z.number().nullable(),
    }),
    unrecordedCount: z.number().int(),                // Σ counts.unrecorded
    remainingCount: z.number().int(),                 // Σ remainingCount
    allowedAbsences: z.number().int().nullable(),     // 合算射影から再計算 (科目別の和ではない)
  }),
  days: z.array(AttendanceDaySummary),                // 既存不変 (status enum 変更なし)
  courses: z.array(CourseStatsDto),
});
```

### `attendance.ts` — 末尾に追記のみ (既存スキーマ不変)

```ts
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const BulkMarkAttendanceInput = z.object({
  dates: z.array(IsoDate).min(1).max(62),
  status: z.enum(["PRESENT", "ABSENT", "EXCUSED", "TARDY", "EARLY_LEAVE"]), // CANCELLED 不可 (休講は専用 op)
  mode: z.enum(["FILL", "OVERWRITE"]).default("FILL"),
});

export const BulkMarkAttendanceResponse = z.object({
  upsertedCount: z.number().int(),
  skippedExistingCount: z.number().int(),   // FILL で記録済みをスキップした数
  skippedSuspendedCount: z.number().int(),  // 休講日 (時間割全体/科目別) でスキップした数
  noOccurrenceDates: z.array(IsoDate),      // occurrence が 0 件だった日 (入力順でなく date asc)
});

export const BulkClearAttendanceInput = z.object({
  dates: z.array(IsoDate).min(1).max(62),
});

export const BulkClearAttendanceResponse = z.object({
  deletedCount: z.number().int(),
});

export type BulkMarkAttendanceInput = z.infer<typeof BulkMarkAttendanceInput>;
export type BulkMarkAttendanceResponse = z.infer<typeof BulkMarkAttendanceResponse>;
export type BulkClearAttendanceInput = z.infer<typeof BulkClearAttendanceInput>;
export type BulkClearAttendanceResponse = z.infer<typeof BulkClearAttendanceResponse>;
```

### `timetableSuspension.ts` — 末尾に追記

```ts
export const BulkTimetableSuspensionInput = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(62),
  reason: z.string().max(100).optional(),
});

export const BulkTimetableSuspensionResponse = z.object({
  createdCount: z.number().int(),
  skippedCount: z.number().int(),   // 既に休講登録済みだった日数 (409 にしない)
});

export const BulkTimetableSuspensionRemoveInput = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(62),
});

export const BulkTimetableSuspensionRemoveResponse = z.object({
  removedCount: z.number().int(),
});

export type BulkTimetableSuspensionInput = z.infer<typeof BulkTimetableSuspensionInput>;
export type BulkTimetableSuspensionResponse = z.infer<typeof BulkTimetableSuspensionResponse>;
export type BulkTimetableSuspensionRemoveInput = z.infer<typeof BulkTimetableSuspensionRemoveInput>;
export type BulkTimetableSuspensionRemoveResponse = z.infer<typeof BulkTimetableSuspensionRemoveResponse>;
```

### `me.ts` — MeResponseDto / MeUpdateInput に追記

```ts
// MeResponseDto.user に追加:
requiredAttendanceRate: z.number().int(),

// MeUpdateInput に追加 (部分更新パターン維持):
requiredAttendanceRate: z.number().int().min(1).max(100).optional(),
```

`apps/api/src/routes/me.ts` の `getMeResponse` / PATCH ハンドラに同名フィールドを通す (既存 `defaultSemesterId` と同じ扱い)。

---

## API / 関数シグネチャ

### A. 出席一括 — `apps/api/src/routes/attendance.ts` に追記

**route 登録順序: 既存 `POST /api/attendance/:occurrenceId` より前に登録する** (mark-all-present と同じ前例。param route に食われるのを防ぐ)。

```
POST /api/attendance/bulk
  middleware: sessionMiddleware, setupGuard
  body: BulkMarkAttendanceInput
  200 → BulkMarkAttendanceResponse
  400 VALIDATION_ERROR: dates 空 / 63 件以上 / 形式不正 / status=CANCELLED
  403 SETUP_REQUIRED: active timetable なし
```

実装仕様 (service 関数 `bulkMarkAttendance` を `apps/api/src/services/attendance.service.ts` に新設):

```ts
export async function bulkMarkAttendance(args: {
  userId: string;
  input: BulkMarkAttendanceInput;
}): Promise<BulkMarkAttendanceResponse>
```

1. `findActiveUserTimetable(userId)`。なければ 403。
2. dates を `dateStringToJstDay(d).startOfDay` で正規化し **Set で重複除去**。
3. `prisma.$transaction` 内で:
   - 対象 occurrence: `meetingOccurrence.findMany({ where: { date: { in: normalizedDates }, meeting: { userTimetableId } }, include: { attendanceRecord: true } })`
   - その期間の TimetableSuspension / CourseSuspension を取得し、休講日 Set を構築 (時間割全体は日付単位、科目別は courseId×日付単位)。
   - 各 occurrence:
     - 休講該当 (時間割全体 or 当該 course の科目別) → `skippedSuspendedCount += 1`、書き込まない。
     - `mode === "FILL"` かつ record あり → `skippedExistingCount += 1`。
     - それ以外 → `attendanceRecord.upsert` (create: `{ occurrenceId, userId, status }` / update: `{ status }`。**note は触らない**: update に note を含めない) → `upsertedCount += 1`。
4. `noOccurrenceDates` = 入力 dates のうち occurrence が 1 件もなかった日 (date asc ソート)。
5. transaction 失敗時は全体 rollback (部分適用は発生しない)。

```
POST /api/attendance/bulk-clear
  middleware: sessionMiddleware, setupGuard
  body: BulkClearAttendanceInput
  200 → BulkClearAttendanceResponse
```

- `attendanceRecord.deleteMany({ where: { userId, occurrence: { date: { in: normalizedDates }, meeting: { userTimetableId } } } })`。休講中かどうかは問わず削除する (記録を消すのは常に安全)。戻り値 `deletedCount = result.count`。

### B. 休講一括 — `apps/api/src/routes/timetableSuspensions.ts` に追記

```
POST /api/timetable-suspensions/bulk
  body: BulkTimetableSuspensionInput
  200 → BulkTimetableSuspensionResponse
  403 SETUP_REQUIRED
POST /api/timetable-suspensions/bulk-remove
  body: BulkTimetableSuspensionRemoveInput
  200 → BulkTimetableSuspensionRemoveResponse
```

service (`timetableSuspension.service.ts` に追記):

```ts
export async function bulkCreateTimetableSuspensions(args: {
  userId: string; input: BulkTimetableSuspensionInput;
}): Promise<BulkTimetableSuspensionResponse>
// $transaction: 既存 [userTimetableId, date] を findMany で先取り → 未登録日だけ createMany。
// 既登録日は skippedCount (単日 API の 409 と違い bulk は冪等)。

export async function bulkRemoveTimetableSuspensions(args: {
  userId: string; input: BulkTimetableSuspensionRemoveInput;
}): Promise<BulkTimetableSuspensionRemoveResponse>
// deleteMany({ where: { userTimetableId, date: { in: normalizedDates } } })。removedCount = count。
// 登録のない日は黙ってスキップ (count に含まれない)。
```

route 登録順: `/api/timetable-suspensions/bulk` / `/bulk-remove` を `DELETE /:id` より前に登録。

### C. stats / overview service の変更

#### `computeCourseStats` (attendanceStats.ts) — シグネチャ変更

```ts
export async function computeCourseStats(args: {
  semesterId: string;
  userId: string;
  requiredAttendanceRate: number;   // 追加 (% 整数)。呼び出し元が User から取得して渡す
  now?: Date;
}): Promise<CourseStatsDto[]>
```

既存 occurrence ループに以下を追加 (既存の counts / numerator / denominatorReduction ロジックは不変):

```ts
// ループ内で集計する追加変数 (course ごと):
let toDateNum = 0;        // date <= todayIso の記録済み weight.num 合計 (separate 除く)
let toDateDen = 0;        // 同 weight.den 合計
let floatingPast = 0;     // date <= todayIso かつ record なし (= counts.unrecorded と同値)
let floatingFuture = 0;   // date >  todayIso かつ record なし
let fixedNumAll = 0;      // 全期間の記録済み weight.num (未来の事前記録も含む)
let fixedDenAll = 0;      // 同 weight.den
// 休講 (時間割全体/科目別) で continue した occurrence はどの変数にも入れない (既存どおり)
// separate (SEPARATE_COUNT) の record は toDate/fixed の num/den どちらにも入れない (既存の分母除外と同義)
```

戻り値の追加フィールド:

```ts
const projectedNum = fixedNumAll + floatingPast + floatingFuture;   // 未記録・未来を出席仮定
const projectedDen = fixedDenAll + floatingPast + floatingFuture;
const r = args.requiredAttendanceRate / 100;
return {
  // ... 既存
  toDate: {
    effectiveNumerator: toDateNum,
    effectiveDenominator: toDateDen,
    attendanceRate: toDateDen === 0 ? null : toDateNum / toDateDen,
  },
  remainingCount: floatingFuture,
  allowedAbsences: projectedDen === 0 ? null
    : Math.floor(projectedNum - r * projectedDen + 1e-9),   // 負もそのまま返す
};
```

`allowedAbsences` の意味: 「これから (未来の floating を) x 限休んでも、残り全部出席すれば学期末に必要出席率以上を保てる」最大の x。ABSENT は num −1 / den ±0 なので `x ≤ projectedNum − r×projectedDen` から floor。epsilon 1e-9 は浮動小数の境界誤差吸収 (例: 70% ちょうどで floor が 1 ズレるのを防ぐ)。

#### `getSemesterOverview` (semesterOverview.service.ts)

1. `prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { requiredAttendanceRate: true } })` で取得し `computeCourseStats` に渡す。
2. 戻り値に追加:
   - `today: toIsoDate(new Date())`
   - `requiredAttendanceRate`
   - `overall.toDate` = courses の `toDate.effectiveNumerator/Denominator` 合算 (rate は合算後に計算)
   - `overall.unrecordedCount` = Σ `counts.unrecorded`
   - `overall.remainingCount` = Σ `remainingCount`
   - `overall.allowedAbsences`: 各 course の射影値 (projectedNum/projectedDen) を**合算してから** `floor(ΣprojNum − r×ΣprojDen + 1e-9)`。科目別 allowedAbsences の和ではない (floor の非線形性)。実装は computeCourseStats が内部射影値を持つため、`computeCourseStats` から `{ courses, overallProjection: { num, den } }` を返す形にリファクタしてよい — その場合 `GET /api/stats` 側は `courses` と `requiredAttendanceRate` のみ使う。
3. `buildDaySummaries` / `classifyDay` は**変更なし**。

#### `GET /api/stats` route

User から `requiredAttendanceRate` を取得 → `computeCourseStats` に渡す → レスポンス root に `requiredAttendanceRate` を追加。

### D. Web hooks 追加

```ts
// apps/web/src/api/hooks/useBulkAttendance.ts (新規)
export function useBulkMarkAttendance(): UseMutationResult<BulkMarkAttendanceResponse, Error, BulkMarkAttendanceInput>
export function useBulkClearAttendance(): UseMutationResult<BulkClearAttendanceResponse, Error, BulkClearAttendanceInput>

// apps/web/src/api/hooks/useTimetableSuspensions.ts (追記)
export function useBulkCreateTimetableSuspensions(): UseMutationResult<BulkTimetableSuspensionResponse, Error, BulkTimetableSuspensionInput>
export function useBulkRemoveTimetableSuspensions(): UseMutationResult<BulkTimetableSuspensionRemoveResponse, Error, BulkTimetableSuspensionRemoveInput>
```

4 つとも成功時 invalidate: `["semesters"]` (overview 含む) / `["stats"]` / `["day"]` / `["today"]` / `["timetable-suspensions"]` (prefix invalidate。`QK` の既存キー構造に一致)。

`usePatchMe` (既存) は `requiredAttendanceRate` を含む PATCH に流用。成功時 invalidate に `["semesters"]` / `["stats"]` を追加する (必要出席率変更で allowedAbsences が変わるため。既存の `["me"]` invalidate は維持)。

---

## UI/UX

### ページレイアウト

#### モバイル (< md)

```
┌────────────────────────────────────────┐
│ 2026年前期 ▾          期間 4/6 〜 9/18  │ ← header (既存 HomeSemesterPicker)
├────────────────────────────────────────┤
│ 今日までの出席率              未記録 3   │ ← AttendanceRateHero (p-4)
│ 87%   41.5 / 48限                       │   大数字 text-5xl + 分数
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▒▒▒▒▒  ←必要70%線     │   progress bar h-2.5 + marker
│ あと 11限 休める ・ 残り 52限            │   行動指標 (text-sm font-bold)
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │ ← AttendanceCalendar (full width)
│ │ ‹    2026年 6月    ›               │ │   chevron h-11 w-11 (lucide)
│ │           [今日]  [☑ 複数選択]      │ │   toolbar 行
│ │ 日 月 火 水 木 金 土                │ │
│ │ 31  1✓  2✓  3✕  4✓  5⊘  6        │ │   セル: 日付 + 状態アイコン
│ │  7  8✓  9🕐 10✓ 11(今日) 12  13    │ │   bg 薄塗り 20-26%
│ │ ...                                │ │
│ │ ✓出席 ✕欠席 🕐遅刻 ⊘休講 ⋯未記録 ●予定│ │   凡例 (lucide アイコン)
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ 科目一覧                                │
│ ┌────────────────────────────────────┐ │ ← CourseListItem (v2)
│ ▌ オペレーティングシステム      92%    │ │   左端 色バー w-1
│ ▌ ▓▓▓▓▓▓▓▓▓▓▓▓│▒▒▒                  │ │   progress + 必要率 marker
│ ▌ 出11 欠1 未1 ・ あと3限休める        │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ ▌ データベース                  64%    │ │   64% < 70% → absent 色
│ ▌ ▓▓▓▓▓▓▓▓│▒▒▒▒▒▒▒                  │ │
│ ▌ 出7 欠4 未0 ・ 必要出席率を下回る見込み│ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘

選択モード中 (画面下、タブバーの上に固定):
┌────────────────────────────────────────┐
│ 3日選択中      [一括操作]  [キャンセル]  │ ← BulkActionBar
└────────────────────────────────────────┘
```

#### デスクトップ (md+, max-w-[920px])

```
┌──────────────────────────────────────────────────────┐
│ 2026年前期 ▾                        期間 4/6 〜 9/18  │
├──────────────────────────────────────────────────────┤
│ 今日までの出席率  87%  41.5/48限  ▓▓▓▓▓│▒▒  あと11限休める │ ← hero 横並び 1 行
├───────────────────────────┬──────────────────────────┤
│  AttendanceCalendar       │  科目一覧 (1 カラム縦積み) │
│  (1.15fr ≒ 54%)           │  (1fr)                    │
│                           │  CourseListItem × N       │
└───────────────────────────┴──────────────────────────┘
```

旧 `grid md:grid-cols-[1fr_1.4fr]` (率カード | カレンダー) を廃止。hero を全幅 1 行目に出し、2 行目を `md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]` (カレンダー | 科目一覧)。モバイルではカレンダーが**全幅**になり、旧 1.4fr カラム制約より一回り大きくなる (これが「サイズ拡大」の本体)。

### コンポーネント構成と props 契約

> Reviewer は実装を見ずにテストを書く。**以下の props 契約が描画テストの根拠** (knowledge `gotcha/design-must-specify-component-prop-contract-for-render-tests` 準拠)。

```
components/semester/
├── SemesterOverview.tsx        [改修] レイアウト + 選択モード state 保持
├── AttendanceRateHero.tsx      [新規] OverallRateCard.tsx を置換 (旧ファイル削除)
├── AttendanceCalendar.tsx      [全面改修]
├── CourseListItem.tsx          [全面改修]
├── BulkActionBar.tsx           [新規]
├── BulkEditSheet.tsx           [新規]
├── CourseDetailModal.tsx       [不変] タップ詳細は現状同様
├── DayDetailSheet.tsx          [不変]
└── PersonalEventEditModal.tsx  [不変]
lib/
├── dayStatusVisual.ts          [v2 置換]
└── attendanceRateColor.ts      [新規 pure]
ui/skeletons/
└── SemesterOverviewSkeleton.tsx [新規。既存ファイルは触らない]
settings/
└── RequiredRateSheet.tsx       [新規] + Settings.tsx に Row 1 行追記
```

#### SemesterOverview.tsx (state 配置)

```ts
// 保持する state (全てこのコンポーネント):
semesterId: string | null            // 既存
openCourseId: string | null          // 既存
dayDetailDate: string | null         // 既存
selectionMode: boolean               // 新規
selectedDates: Set<string>           // 新規 (ISO date)
bulkSheetOpen: boolean               // 新規
```

- ローディング: `<SemesterOverviewSkeleton />` (旧 AttendanceCalendarSkeleton の使用をやめる。旧ファイル自体は削除しない)。
- 選択モード解除 (`キャンセル` / 一括操作成功 / 学期切替) で `selectedDates` をクリア。
- `overview.data.today` / `requiredAttendanceRate` を子に渡す。

#### AttendanceRateHero.tsx

```ts
type AttendanceRateHeroProps = {
  overall: SemesterOverviewDto["overall"];   // 拡張後の overall (toDate 等を含む)
  requiredRate: number;                       // % 整数
};
```

表示仕様:
- タイトル「今日までの出席率」(text-sm font-bold text-fg-secondary)。
- 大数字: `Math.round(overall.toDate.attendanceRate * 100)`、null なら「—」。色は `rateColor(pct, requiredRate)`。text-5xl font-black tabular-nums。
- 分数: `{toDate.effectiveNumerator} / {toDate.effectiveDenominator}限` (0.5 刻みは `41.5` 表記そのまま)。
- progress bar: 高さ h-2.5、rounded-full、`width: {pct}%` の inline style。バー色 = 大数字と同色。バー上に必要率 marker (`left: {requiredRate}%` の縦線 w-0.5、`--color-fg-tertiary`)。
- `overall.unrecordedCount > 0` のとき右上に「未記録 {n}」チップ (bg tardy 15%、text-status-tardy、text-xs font-bold)。0 のとき非表示。
- 行動指標行 (text-sm font-bold):
  - `allowedAbsences == null` → 「データなし」(text-fg-tertiary)
  - `allowedAbsences < 0` → 「残り全部出席しても {requiredRate}% に届きません」(text-status-absent)
  - `allowedAbsences >= remainingCount` → 「残りを全部休んでも {requiredRate}% を維持」(text-status-present)
  - それ以外 → 「あと {allowedAbsences}限 休める」(text-fg-primary、数字は accent-500)
  - 併記: 「残り {remainingCount}限」(text-xs text-fg-tertiary)
- カード: rounded-3xl bg-bg-elevated p-4 shadow-card。md では大数字+分数を左、bar+指標を右の横並び (flex)。

#### lib/attendanceRateColor.ts (pure、テスト対象)

```ts
export function rateColor(pct: number | null, requiredRate: number): string {
  if (pct == null) return "var(--color-fg-tertiary)";
  if (pct >= requiredRate) return "var(--color-status-present)";
  if (pct >= requiredRate - 10) return "var(--color-status-tardy)";
  return "var(--color-status-absent)";
}
```

CourseListItem の旧 `pctColor` (80/60 ハードコード) はこれに置換。

#### CourseListItem.tsx (v2)

```ts
type Props = {
  stats: CourseStatsDto;       // 拡張後
  requiredRate: number;        // % 整数
  onClick: () => void;         // 既存どおり CourseDetailModal を開く
};
```

表示仕様 (1 行 = 1 カード、md でも 1 カラム縦積み — 旧 md:grid-cols-2 廃止):
- 左端に色バー (w-1 rounded-full、`stats` には色がないため **`courseColor` は出さない** — 代わりにバー色 = `rateColor(...)`)。
- 1 行目: 科目名 (truncate text-sm font-bold) + 右端に今日まで率 `{pct}%` (text-2xl font-black、`rateColor`)。rate は `stats.toDate.attendanceRate` 由来。null は「—」。
- 2 行目: progress bar (h-1.5、`width:{pct}%`、必要率 marker `left:{requiredRate}%`)。
- 3 行目 (text-xs text-fg-tertiary tabular-nums): 「出{counts.present} 欠{counts.absent} 未{counts.unrecorded}」+ 区切り「・」+ 行動指標 (Hero と同じ 4 分岐文言の短縮形: 「あと{n}限休める」/「下回る見込み」(absent色)/「残り全休OK」(present色)/「—」)。
- teacher 表示は 3 行目に出さない (情報過多)。詳細は CourseDetailModal。
- タップで `onClick` (現状同様)。

#### AttendanceCalendar.tsx (v2)

```ts
type Props = {
  days: AttendanceDaySummary[];
  startDate: string;                       // 学期開始 ISO
  endDate: string;                         // 学期終了 ISO
  today: string;                           // SemesterOverviewDto.today
  semesterId?: string | null;
  onSelectDay: (date: string) => void;     // 通常モード: 日タップ → DayDetailSheet
  selectionMode: boolean;
  selectedDates: ReadonlySet<string>;
  onToggleSelectionMode: () => void;       // 「複数選択」ピル
  onToggleDate: (date: string) => void;    // 選択モード: 日タップで選択トグル
};
```

- **初期月**: `useState(() => clampMonth(dayjs(), startDate, endDate))`。`clampMonth(d, s, e)` = `d` の月が学期範囲より前なら開始月、後なら終了月、範囲内ならその月 (`startOf("month")` で返す)。学期内の今日 → **今月が開く**。
- **ヘッダ**: `<ChevronLeft />` / `<ChevronRight />` (lucide、h-5 w-5) を h-11 w-11 の丸ボタンに。`aria-label="前の月"` / `"次の月"`。境界月で disabled (既存ロジック維持)。中央に `YYYY年 M月` (text-base font-bold に拡大)。
- **ツールバー行** (ヘッダ直下、flex justify-end gap-2):
  - 「今日」ピル: anchor 月 ≠ 今日の月のときのみ表示。クリックで `clampMonth(dayjs(), ...)` へ。
  - 「複数選択」ピル: `onToggleSelectionMode`。選択モード中は accent 塗り (`bg-accent-500 text-fg-on-accent`) + ラベル「選択中」。`aria-pressed={selectionMode}`。
- **コンテナ**: rounded-3xl bg-bg-elevated **p-3** (旧 p-2.5)。セル grid `gap-1.5` (旧 gap-1)。
- **セル** (`<button>`、`aria-label={cell.format("M月D日")}`):
  - 日付数字: **text-sm** font-bold (旧 text-[11px])。
  - 状態表示: 数字の下に **lucide アイコン h-4 w-4** (旧 1 文字マーカー text-[12px])。`statusVisual` v2 の `icon` 名 → コンポーネント対応: `check→Check, x→X, clock→Clock, ban→Ban, minus→Minus`。
  - bg 薄塗り: `statusVisual` v2 の `bg` (濃度を 12-16% → 20-26% に増)。
  - **未来日** (`iso > today`): `status !== "ALL_SUSPENDED"` なら状態表示なし (undefined を渡したのと同じ中立描画)。休講だけは未来でも表示。
  - **今日**: ring-1 ring-accent-500/60 で常時マーク。
  - 未記録日 (`PARTIAL_UNRECORDED`、過去のみ): `border border-dashed` (`--color-status-tardy` 40%) で「やり残し」を可視化。
  - イベントドット: 右上 h-2 w-2 (旧 1.5) bg-accent-500。既存 `usePersonalEvents` 取得方式維持。
  - **選択モード**: タップで `onToggleDate(iso)`。選択中セルは `ring-2 ring-accent-500` + 左上に塗りつぶし check バッジ (h-4 w-4 rounded-full bg-accent-500 + Check h-3 w-3 白)。学期範囲外 (`iso < startDate || iso > endDate`) のセルは選択モード中 disabled。
  - 通常モード: タップで `onSelectDay(iso)` (既存。範囲外も可、既存仕様維持)。
- **凡例**: 1 文字記号をやめ、lucide アイコン (h-3.5 w-3.5、各状態色) + ラベル。`✓出席 / ✕欠席あり / 🕐遅刻・早退 / ⊘休講 / (破線枠)未記録あり / ●予定` の 6 項目。

#### lib/dayStatusVisual.ts (v2 — 全置換)

```ts
export type DayVisualIcon = "check" | "x" | "clock" | "ban" | "minus" | null;

export type DayVisual = {
  bg: string;          // "" = 塗りなし
  icon: DayVisualIcon;
  iconColor: string;
  dashed: boolean;     // 未記録の破線枠
};

export function statusVisual(
  status: AttendanceDaySummary["status"] | undefined,
  opts?: { future?: boolean },
): DayVisual
```

マッピング (テスト根拠):

| status | future | bg (color-mix 濃度) | icon | iconColor | dashed |
|---|---|---|---|---|---|
| ALL_PRESENT | false | `--color-status-present` 20% | check | `--color-status-present` | false |
| HAS_ABSENT | false | `--color-status-absent` 26% | x | `--color-status-absent` | false |
| HAS_TARDY | false | `--color-status-tardy` 24% | clock | `--color-status-tardy` | false |
| ALL_SUSPENDED | true/false | `--color-status-suspended` 20% | ban | `--color-status-suspended` | false |
| PARTIAL_UNRECORDED | false | `--color-status-none` 12% | minus | `--color-fg-tertiary` | **true** |
| 上記 4 種 (SUSPENDED 以外) | **true** | `""` | null | `--color-status-none` | false |
| NO_CLASS / undefined | — | `""` | null | `--color-status-none` | false |

bg は既存方式 `color-mix(in srgb, var(--color-status-xxx) NN%, var(--color-bg-elevated))`。

**styles.css 追記** (両テーマブロック + `@theme` マッピング、追記のみ):

```css
/* dark */  --color-status-suspended: #94A3B8;
/* light */ --color-status-suspended: #64748B;
```

(`--color-status-cancelled` 白30% は OccurrenceDto status=CANCELLED 用に既存のまま残す。日セルの休講表示は新 suspended 色を使う。)

#### BulkActionBar.tsx

```ts
type Props = {
  count: number;            // selectedDates.size
  onOpenSheet: () => void;  // 「一括操作」
  onCancel: () => void;     // 選択モード解除
};
```

- `fixed inset-x-3 bottom-20 z-50 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[480px]`、rounded-2xl bg-bg-elevated shadow-card p-3、flex items-center justify-between。
- 左: 「{count}日選択中」(text-sm font-bold)。
- 右: `Button variant="primary"` 「一括操作」(count === 0 で disabled) + `Button variant="ghost"` 「キャンセル」。

#### BulkEditSheet.tsx

```ts
type Props = {
  open: boolean;
  onClose: () => void;
  dates: string[];               // 選択日 ISO、date asc ソート済
  semesterId?: string | null;    // 予定一括追加に使用
  onDone: () => void;            // いずれかの操作成功後 (親が選択解除 + sheet close)
};
```

`BottomSheet` (stackLevel=1)、title=「{dates.length}日に一括適用」。4 セクション:

```
┌─────────────────────────────────────────────┐
│ 6/3, 6/10, 6/17 の3日に一括適用          [×] │
├─────────────────────────────────────────────┤
│ 出席を一括登録                                │
│  [出] [欠] [公] [遅] [早]    ← status ピル選択 │
│  [toggle] 記録済みも上書きする (既定 OFF)      │
│  [この内容で登録]                             │
├─────────────────────────────────────────────┤
│ 未記録に戻す                                  │
│  [選択日の記録をすべて削除]                    │
├─────────────────────────────────────────────┤
│ 休講                                          │
│  理由: [____________] (任意)                  │
│  [休講にする]   [休講を解除]                  │
├─────────────────────────────────────────────┤
│ 予定                                          │
│  タイトル: [____________]                     │
│  [選択日すべてに終日予定を追加]                │
└─────────────────────────────────────────────┘
```

挙動:
- **出席一括**: status 未選択時は登録ボタン disabled。実行 → `useBulkMarkAttendance({ dates, status, mode: overwrite ? "OVERWRITE" : "FILL" })`。成功 → Toast「{upsertedCount}件 記録しました{skippedExistingCount>0 ? ` (記録済み ${n}件 スキップ)` : ""}{skippedSuspendedCount>0 ? ` (休講日 ${n}件 スキップ)` : ""}」→ `onDone()`。
- **未記録に戻す**: `useBulkClearAttendance({ dates })` → Toast「{deletedCount}件 削除しました」→ `onDone()`。
- **休講にする**: `useBulkCreateTimetableSuspensions({ dates, reason: trim || undefined })` → Toast「{createdCount}日 休講登録{skippedCount>0 ? ` (${n}日 登録済み)` : ""}」→ `onDone()`。
- **休講を解除**: `useBulkRemoveTimetableSuspensions({ dates })` → Toast「{removedCount}日 解除しました」→ `onDone()`。
- **予定追加**: タイトル空で disabled。**新 API は作らない** — 既存 `POST /api/personal-events` を date ごとに `Promise.allSettled` でファンアウト (`{ date, title, isAllDay: true, semesterId }`)。全成功 → Toast「{n}日に予定を追加しました」→ `onDone()`。一部失敗 → Toast「{成功数}件 追加、{失敗数}件 失敗しました」、sheet と選択は**維持** (リトライ可能に)。`["personal-events"]` を invalidate。
- mutation pending 中は当該ボタン disabled。API エラー (4xx/5xx) は sheet 内にエラーテキスト表示、選択維持。

#### SemesterOverviewSkeleton.tsx (新規、`apps/web/src/components/ui/skeletons/`)

```ts
export function SemesterOverviewSkeleton(): JSX.Element   // props なし
```

- ルート: `role="status" aria-busy="true" aria-label="読み込み中"` (既存スケルトンの流儀)。
- 構造 = 再設計後ページの再現: ① hero ブロック (rounded-3xl 内に幅 40% 高 1.25rem + 幅 100% 高 0.625rem の Skeleton 2 本)、② カレンダーブロック (ヘッダ行 + `grid grid-cols-7 gap-1.5` × 42 セル aspect-square)、③ 科目リスト 4 行 (高 4rem の Skeleton カード)。
- `skeletons/index.ts` に `export * from "./SemesterOverviewSkeleton";` を**追記** (並行設計と同ファイルだが追記 1 行のみ。コンフリクト時は両 export を残す)。

#### RequiredRateSheet.tsx (新規、`apps/web/src/components/settings/`)

```ts
type Props = { open: boolean; onClose: () => void };
```

- `BottomSheet` (stackLevel=1)、title「必要出席率」。
- 内部で `useMe()` から現在値、`usePatchMe()` で保存。
- UI: `NumberStepper` (既存 ui。`value` / `onChange` / `min={1}` / `max={100}` / `label="必要出席率"`) + 単位「%」表示 + クイック設定チップ `[60] [66] [70] [80]` (タップで value セット) + 説明文「全科目共通。出席率の色分けと『あと何限休めるか』の基準になります」。
- footer: `Button` 「保存」 → `usePatchMe().mutate({ requiredAttendanceRate: value })` → 成功で onClose。pending 中 disabled。
- `Settings.tsx` の `SettingsSection title="出席"` に `SettingsRow label="必要出席率" trailing={<span>{me.data?.user.requiredAttendanceRate}%</span>} onClick={() => setSheet("requiredRate")}` を追記 (sheet state union に `"requiredRate"` 追加)。

### 操作フロー (複数日一括訂正)

```
学期タブ → カレンダー右上「複数選択」タップ
  → 選択モード ON (ピルが「選択中」accent 塗りに)
  → 日セルをタップで選択トグル (ring + check バッジ)。月をまたいで選択可
  → 画面下 BulkActionBar「N日選択中 [一括操作] [キャンセル]」
  → [一括操作] → BulkEditSheet
  → 操作実行 → Toast → 選択解除 + 選択モード OFF + カレンダー/率 即時反映 (invalidate)
  ([キャンセル] → 選択解除 + 選択モード OFF)
```

通常モードの単日タップ → DayDetailSheet は完全に現状維持。

---

## 挙動仕様 (Reviewer テスト根拠)

### (a) 今日まで出席率の境界 — computeCourseStats (API ユニット)

前提セットアップ: course (totalSessions=15) に occurrence 15 件 (週1、過去 8 / 今日 0 / 未来 7 など `now` 引数で制御)。`requiredAttendanceRate: 70` を渡す。

1. 過去 8 件中 PRESENT 6 / ABSENT 1 / 未記録 1、未来 7 件 → `toDate = { effectiveNumerator: 6, effectiveDenominator: 7, attendanceRate: 6/7 }`。未記録は分母に入らない。`counts.unrecorded = 1`、`remainingCount = 7`。
2. 同条件の `allowedAbsences`: projectedNum = 6+0(ABSENT)+1+7 = 14、projectedDen = 7+1+7 = 15 → `floor(14 − 0.7×15) = floor(3.5) = 3`。
3. **今日当日の occurrence は分母に入る**: `now` = occurrence 当日 (date <= todayIso)。記録があれば toDate に算入、なければ `counts.unrecorded` に入り toDate には入らない。
4. **未来日の事前記録**: date > today の occurrence に PRESENT 記録 → toDate には入らない (toDate は date <= today のみ)。allowedAbsences の射影には固定値 (num1/den1) として入り、floating から外れる (`remainingCount` に数えない)。
5. **HALF_PRESENT の端数**: TARDY 1 件 (rule: HALF_PRESENT)、PRESENT 6、過去 7 実施・未来 8 → toDate = { 6.5, 7, 6.5/7 }。allowedAbsences = floor((6.5+8) − 0.7×15 + 1e-9) = floor(14.5 − 10.5) = 4。
6. **REDUCE_DENOMINATOR / CANCELLED 記録**: weight.den=0 → toDate の分母にも射影分母にも入らない。EXCUSED (rule: REDUCE_DENOMINATOR) 1 + PRESENT 6 の過去 7 件 → toDate = { 6, 6, 1.0 }。
7. **SEPARATE_COUNT**: separateCounts に計上され (既存)、toDate / 射影のどちらの分子分母にも入らない。
8. **休講除外**: 時間割全体休講 or 科目別休講の日の occurrence は toDate / remainingCount / 射影の全てから除外 (既存の suspended continue が新変数にも効く)。未来の休講日は `remainingCount` に入らない。
9. **境界ちょうど**: 全 10 件 PRESENT 7 / ABSENT 3 で required 70% → projectedNum=7, projectedDen=10 → allowedAbsences = floor(7 − 7 + 1e-9) = 0 (「あと 0 限」、まだ下回ってはいない)。
10. **下回り**: PRESENT 6 / ABSENT 4 (全 10 件、未来 0) → allowedAbsences = floor(6 − 7) = −1 (負を返す)。`toDate.attendanceRate = 0.6`。
11. occurrence 0 件の course → toDate = { 0, 0, null }、remainingCount 0、allowedAbsences null。
12. 既存フィールド (`effectiveNumerator` / `effectiveDenominator` / `attendanceRate` / `counts`) は本変更前後で値が変わらない (回帰)。

### (b) overview 集約 — GET /api/semesters/:id/overview

13. レスポンスに `today` (JST の今日、YYYY-MM-DD) と `requiredAttendanceRate` (User の値、未設定ユーザーは 70) が含まれる。
14. `overall.toDate` は courses の toDate 分子分母の合算で、rate は合算後の除算。`overall.unrecordedCount` = Σ counts.unrecorded、`overall.remainingCount` = Σ remainingCount。
15. `overall.allowedAbsences` は科目別 allowedAbsences の和ではなく合算射影から floor した値 (例: 2 科目で projected (7, 10) と (6.5, 10)、required 70 → floor(13.5 − 14) = −1。科目別の和なら 0 + (−1) = −1 と一致する例を避け、floor 非線形が出る値でテスト: (7.4, 10)+(7.4, 10) → 科目別 floor(0.4)+floor(0.4)=0、合算 floor(0.8)=0 …省略可。最低限「合算射影で計算される」ことを 1 ケースで確認)。
16. `GET /api/stats` レスポンス root に `requiredAttendanceRate` が含まれる。

### (c) 必要出席率設定 — /api/me

17. `GET /api/me` の `user.requiredAttendanceRate` が返る (新規ユーザー = 70)。
18. `PATCH /api/me { requiredAttendanceRate: 80 }` → 200、以後 GET で 80。他フィールドは不変 (部分更新)。
19. `PATCH { requiredAttendanceRate: 0 }` / `{ requiredAttendanceRate: 101 }` / `{ requiredAttendanceRate: 70.5 }` → 400 VALIDATION_ERROR。
20. 必要出席率を 70→90 に変えると、同じ記録状態で overview の `allowedAbsences` が減る (連動)。

### (d) 出席一括 API — POST /api/attendance/bulk

21. dates 3 日 (各 2 occurrence、全て未記録) + `{ status: "PRESENT", mode: "FILL" }` → `upsertedCount: 6`、全 occurrence に PRESENT record。
22. FILL: 6 件中 2 件に既存 ABSENT record → `upsertedCount: 4, skippedExistingCount: 2`、既存 ABSENT は**変更されない**。
23. OVERWRITE: 同条件 → `upsertedCount: 6, skippedExistingCount: 0`、既存 ABSENT が PRESENT に上書き。**既存 record の note は保持される** (update に note を含めない)。
24. 休講日スキップ: dates のうち 1 日が時間割全体休講 (occurrence 2 件) → その 2 件は `skippedSuspendedCount: 2`、record は作られない。科目別休講も同様 (該当 course の occurrence のみスキップ)。
25. occurrence が 1 件もない日を含む → その日は `noOccurrenceDates` に入る (date asc)。エラーにはならない。
26. dates 重複 (`["2026-06-03","2026-06-03"]`) → 二重 upsert されない (dedupe)。
27. `status: "CANCELLED"` → 400。dates 63 件 → 400。dates 空 → 400。日付形式不正 → 400。
28. 他人の timetable の occurrence は対象外 (active timetable 経由でスコープ。別ユーザーで同日に occurrence があっても書かれない)。
29. 認証なし → 401。active timetable なし → 403 SETUP_REQUIRED。
30. bulk 後、`GET /api/semesters/:id/overview` の day status / toDate が反映されている (例: 全部 PRESENT にした日は ALL_PRESENT)。

### (e) 記録一括削除 — POST /api/attendance/bulk-clear

31. dates 2 日 (record 3 件) → `deletedCount: 3`、以後 day detail で status null。
32. record のない日を含めても エラーにならず count に影響しない。
33. 休講中の日の record も削除できる。

### (f) 休講一括 — /api/timetable-suspensions/bulk, /bulk-remove

34. dates 3 日 (全て未登録) → `createdCount: 3, skippedCount: 0`、各日が `GET /api/day/:date` で timetableSuspension 非 null、reason 反映。
35. 3 日中 1 日が登録済み → `createdCount: 2, skippedCount: 1`、**409 にならない** (単日 POST と異なる)。
36. bulk-remove: 登録済み 2 日 + 未登録 1 日 → `removedCount: 2`。
37. bulk 登録後、overview の該当日 status が ALL_SUSPENDED、computeCourseStats で分母除外 (既存 Phase 2 仕様 #8 と同じ経路)。
38. active timetable なし → 403。dates 0 件 / 63 件 → 400。

### (g) AttendanceRateHero (RTL)

props 契約: `{ overall, requiredRate }` (§UI 参照)。

39. `overall.toDate = { 41.5, 48, 41.5/48 }` → 「86」「%」「41.5 / 48限」が描画される (86 = round(86.45))。
40. `allowedAbsences: 11, remainingCount: 52` → テキスト「あと 11限 休める」。
41. `allowedAbsences: -2` → 「残り全部出席しても 70% に届きません」(requiredRate=70 のとき)。
42. `allowedAbsences: 60, remainingCount: 52` (>= remaining) → 「残りを全部休んでも 70% を維持」。
43. `unrecordedCount: 3` → 「未記録 3」チップ表示。`0` → 非表示。
44. progress bar の inline style に `width: 86%` 相当、marker に `left: 70%` 相当の文字列が入る (jsdom は計算しないので style 文字列 assert)。
45. `toDate.attendanceRate: null` → 「—」表示、落ちない。

### (h) CourseListItem v2 (RTL)

46. `stats.toDate.attendanceRate = 0.92, requiredRate = 70` → 「92」が present 色 style で描画。`0.64` → absent 色。`0.66`(= required−10 以上) → tardy 色 (`rateColor` の 3 閾値)。
47. 「出{n} 欠{n} 未{n}」が counts から描画される。
48. クリックで `onClick` が 1 回呼ばれる。
49. `rateColor` pure 関数: `(null, 70) → fg-tertiary` / `(70, 70) → present` / `(69.9…→69, 70) → tardy` / `(59, 70) → absent` / `(95, 90) → present` (requiredRate 連動、80/60 ハードコードが消えている)。

### (i) AttendanceCalendar v2 (RTL)

props 契約は §UI のとおり。

50. **初期月**: `today="2026-06-11"`, 学期 2026-04-06〜2026-09-18 → ヘッダが「2026年 6月」(学期開始月ではない)。
51. **clamp**: today が学期終了後 (例 today=2026-10-01) → 終了月 9 月が開く。学期開始前 → 開始月。
52. 月移動ボタン: `aria-label="前の月"` / `"次の月"` のボタンが存在し、class に `h-11 w-11` を含む。開始月で前ボタン disabled、終了月で次ボタン disabled。
53. 「今日」ボタン: 前月に移動すると現れ、クリックで今日の月に戻る。今日の月表示中は存在しない。
54. 「複数選択」ピル: クリックで `onToggleSelectionMode` が呼ばれる。`selectionMode=true` のとき `aria-pressed="true"`。
55. 通常モード: 日セル (aria-label「6月3日」) クリックで `onSelectDay("2026-06-03")`。
56. 選択モード: 同セルクリックで `onToggleDate("2026-06-03")` が呼ばれ、`onSelectDay` は呼ばれない。
57. 選択モードで `selectedDates` に含まれる日のセルに選択スタイル (ring class) + check バッジが付く。
58. 選択モードで学期範囲外の日セルは disabled。
59. 未来日 (`iso > today`) で status=ALL_PRESENT 相当のデータでも状態アイコン・bg が出ない。status=ALL_SUSPENDED は未来日でもアイコン (ban) と bg が出る。
60. `statusVisual` v2 pure 関数: §UI の表の全行 (7 ケース + future 分岐) を網羅。`statusVisual("ALL_PRESENT", { future: true })` → `{ bg: "", icon: null, dashed: false }`。`statusVisual("PARTIAL_UNRECORDED")` → `dashed: true`。

### (j) BulkActionBar / BulkEditSheet (RTL)

61. BulkActionBar: `count=3` で「3日選択中」、「一括操作」クリックで `onOpenSheet`、「キャンセル」で `onCancel`。`count=0` で「一括操作」disabled。
62. BulkEditSheet: status ピル未選択時「この内容で登録」disabled。「欠」を選び実行 → bulk mutation が `{ dates, status: "ABSENT", mode: "FILL" }` で呼ばれる (api client mock)。上書きトグル ON → `mode: "OVERWRITE"`。
63. 「休講にする」実行 → `{ dates, reason: undefined }` (理由空時) / 理由入力時はその文字列で呼ばれる。「休講を解除」→ bulk-remove が `{ dates }` で呼ばれる。
64. 「選択日の記録をすべて削除」→ bulk-clear が `{ dates }` で呼ばれる。
65. 予定追加: タイトル空で disabled。タイトル入力して実行 → `POST /api/personal-events` 相当の mutation が dates の件数分、各 `{ date, title, isAllDay: true, semesterId }` で呼ばれる。
66. 操作成功後 `onDone` が 1 回呼ばれる。

### (k) SemesterOverview 統合 / Skeleton / Settings (RTL)

67. ローディング中 `SemesterOverviewSkeleton` が描画される (`role="status"`、grid-cols-7 セル群を含む)。
68. ページに「今日までの出席率」見出しが出る。「全体の出席率」という文言は存在しない。
69. RequiredRateSheet: 開くと現在値が NumberStepper に表示され、チップ「80」タップ → 値 80、「保存」→ `usePatchMe` mutation が `{ requiredAttendanceRate: 80 }` で呼ばれる。
70. Settings の「出席」セクションに「必要出席率」Row があり、trailing に現在値「70%」が出る。

---

## テスト基盤

- **API**: Vitest + 実 SQLite (`apps/api/vitest.config.ts`)。配置 `apps/api/tests/`。ヘルパ `tests/helpers/auth.ts` (`setupCompleteUser` / `createOccurrence` / `createSemester`) を再利用。`computeCourseStats` の `now` 引数で「今日」を固定してテストする (実時刻依存禁止)。
  - `tests/stats.test.ts` (追記) — (a) 1-12, (b) 14-16
  - `tests/semesters.test.ts` (追記) — (b) 13
  - `tests/users.test.ts` or `tests/me` 相当 (追記) — (c) 17-20
  - `tests/attendance.test.ts` (追記) — (d) 21-30, (e) 31-33。**mark-all-present の既存テストは変更しない**
  - `tests/timetable-suspensions.test.ts` (追記) — (f) 34-38
- **Web**: Vitest 2 + jsdom + RTL + msw 2.14。配置 `apps/web/tests/{components,lib,routes}/`。
  - `tests/lib/dayStatusVisual.test.ts` (全面書き換え — v2 マッピング、(i) 60)
  - `tests/lib/attendanceRateColor.test.ts` (新規 — (h) 49)
  - `tests/components/AttendanceRateHero.test.tsx` (新規 — (g))
  - `tests/components/CourseListItem.test.tsx` (新規 — (h) 46-48)
  - `tests/components/AttendanceCalendar.test.tsx` (全面書き換え — (i) 50-59)
  - `tests/components/BulkEditSheet.test.tsx` / `BulkActionBar.test.tsx` (新規 — (j))
  - `tests/components/SemesterOverviewSkeleton.test.tsx` (新規 — (k) 67。**既存 `skeletons.test.tsx` には追記しない**: 並行設計が触るため別ファイル)
  - `tests/routes/Settings.test.tsx` (追記 — (k) 69-70)
- jsdom の罠: `localStorage` 不在 (`Muraki/knowledge/gotcha/jsdom-no-localstorage-in-vitest.md` — theme 系を import するテストは stub 必須)、color-mix/calc は評価されないため **style は生文字列 assert** (knowledge `single-screen-compressed-timetable` 流儀)。
- E2E (chrome-devtools MCP) は本設計のテスト範囲に含めない (RTL + API テストで挙動仕様を網羅できる)。最終的な見た目の詰めは実装中に Leader が Chrome スクショで確認する (Phase 2 と同方式)。

---

## 不採用案

- **「今日まで」分母を totalSessions (申告値) ベースで按分**: 申告値には実施日が紐づかず「今日までに何回あったか」を導けない。occurrence 実日付ベース一択。既存 totalSessions ベース率は後方互換でフィールド維持のみ。
- **未記録を欠席 (0 点) 扱いで今日まで分母に算入**: 記録忘れ 2-3 日で率が見かけ上暴落し、数字への信頼を失う。未記録チップ + 破線セルで「記録して」と促す方が行動につながる。
- **allowedAbsences で未記録を欠席仮定 (悲観)**: 「未来は出席する」仮定と非対称になり、未記録が増えるほど指標が壊れる。楽観で統一し、確定は記録で行う。
- **必要出席率を Float (0.0-1.0) カラム**: 0.7 の二進表現誤差が floor 境界 (仕様 #9) を狂わせる。Int % + epsilon で決定的に。
- **必要出席率を科目ごとに設定**: 要望が「全体で 1 つ」と確定。User 直カラム最小構成。
- **bulk を from/to 範囲指定**: カレンダー複数選択は飛び日 (毎週月曜だけ等) が主用途。`dates[]` 列挙が UI と 1:1 で対応する。上限 62 で暴走防止。
- **bulk 出席に CANCELLED を許可**: 休講は TimetableSuspension の専用 op があり、二重の表現手段は記録の意味論を濁す。API レベルで拒否。
- **bulk の部分失敗を許容 (best-effort)**: SQLite + Prisma $transaction で all-or-nothing にできるのに途中状態を返す理由がない。スキップ (記録済み/休講/授業なし) は「失敗」ではなく結果カウントで返す。
- **個人イベントの bulk API 新設**: 出席率に無関係な単発イベントのために endpoint を増やさない。既存 POST のクライアントファンアウト (Promise.allSettled + 失敗数 Toast) で足りる。失敗時も選択を保持しリトライ可能。
- **長押しで選択モード開始**: Web では long-press が標準ジェスチャでなくスクロールと誤爆する。明示の「複数選択」トグルピル + aria-pressed が確実。
- **日ステータスを enum 拡張 (UPCOMING 追加) でサーバ側から未来表現**: AttendanceDaySummary.status の enum 変更は classifyDay / 既存テスト / Home の statusByDate に波及。クライアントが `today` フィールドと比較して描画を抑制する方が変更面が小さい。
- **DayDetailSheet を複数日対応に拡張**: 単日詳細 (occurrence 個別編集・イベント編集) と複数日一括 (同一操作の適用) は操作モデルが別物。1 シートに混ぜると Phase 2 で作った単日フローが壊れる。BulkEditSheet を別に立てる。
- **旧 OverallRateCard を改修して残す**: 表示要素 (progress bar / 行動指標 / チップ) がほぼ総入れ替えで、旧 19 行に継ぎ足すより AttendanceRateHero として作り直す方が明快。ファイルは削除。
