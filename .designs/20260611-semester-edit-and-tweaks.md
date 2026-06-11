# 学期編集 + カレンダー一括上書き + 「あと何限休める」学期全体化 — 3 修正

## 目的 (1-3行)

`20260611-semester-redesign.md` / `20260611-semester-fixes.md` (両者 main マージ済) の上に、運用で見えた 3 つの実害を当てる: (A) 学期の name/日付を後から編集できない、(B) 出席記録済みの日でもカレンダー単日モーダルの一括ボタンを使って上書きしたい、(C)「あと何限休める」が occurrence 射影ベースで実態とズレる (学期全体の許容欠席残枠にしたい)。3 修正は独立。1 設計 doc・1 ブランチ (`feature/semester-edit-and-tweaks`) で扱うが、触るファイルが重ならないよう以下で分離する。

---

## 触るファイル一覧 (修正ごとに分離)

| 修正 | パス | 扱い |
|---|---|---|
| **A** | `packages/shared/src/schemas/semester.ts` | `SemesterUpdateInput` は既存のまま (変更不要)。確認のみ |
| **A** | `apps/api/src/routes/semesters.ts` | PATCH ハンドラに occurrence 増分再生成呼び出しを追加 |
| **A** | `apps/api/src/services/occurrenceGen.ts` | 増分再生成 + 縮小時 delete ヘルパ `reconcileOccurrencesForSemesterDateChange` を新設 |
| **A** | `apps/web/src/components/sheet/SemesterListSheet.tsx` | 各行に編集導線 (インライン編集フォーム) を追加 |
| **A** | `apps/web/src/api/hooks/useSemesters.ts` | `useUpdateSemester` を新設、invalidate を overview/stats/day/today/userTimetables まで拡張 |
| **A** | `apps/web/src/api/queryKeys.ts` | 変更なし (既存キー流用)。確認のみ |
| **B** | `apps/web/src/components/semester/DayDetailSheet.tsx` | `DayBulkAttendanceControl` を `useBulkMarkAttendance` + OVERWRITE に切替、disabled から `unrecordedCount===0` を外す |
| **B** | `apps/web/src/api/hooks/useBulkAttendance.ts` | **流用のみ** (参照、変更なし) |
| **C** | `apps/api/src/services/attendanceStats.ts` | `allowedAbsences` の式を「学期全体ベース」に置換。overall 合算用の生値を返り値に追加 |
| **C** | `apps/api/src/services/semesterOverview.service.ts` | `overall.allowedAbsences` を新定義 (科目別 `(1−r)×D − 消化欠席` 合算 → floor) で再計算 |
| **C** | `apps/web/src/components/semester/AttendanceRateHero.tsx` | `actionText` / `actionColor` の文言・色分岐を新定義に再設計 |
| **C** | `apps/web/src/components/semester/CourseListItem.tsx` | `shortActionText` / `actionColor` の文言・色分岐を新定義に再設計 |

**触らない (厳守)**:
- `mark-all-present` 本体 (`apps/api/src/routes/attendance.ts` / `useMarkAllPresent`) — B で拡張しない
- bulk API 本体 (`apps/api/src/services/attendance.service.ts` / `BulkMarkAttendanceInput`) — B は流用のみ
- 既存の `meeting.service.ts` の `deleteMany({meetingId})→regen` 全消しパターン — A で**流用禁止** (§不採用案)
- toDate 率 (`toDate.effectiveNumerator/Denominator/attendanceRate`) — C は `allowedAbsences` のみ変更、率は不変
- 出欠ルール scope (fixes で修正済)、ホーム CTA、PersonalEvent

---

# 修正A: 学期の編集機能 (name / startDate / endDate を後から変更)

## 採用案: 案2 (増分再生成) + 出席記録保護

Researcher 提示の 3 案のうち **案2 (増分再生成)** を採用。Leader 方針に従い「縮小で記録のある日が範囲外になる」場合の出席記録保護を最優先で設計する。

**確定方針**:
1. **広げる方向**: 新範囲で occurrence を生成。一意制約 `@@unique([meetingId, date, periodOffset])` の P2002 を skip 吸収するため既存行は壊れない (既存 `generateOccurrencesForMeetings` がそのまま使える)。
2. **縮める方向**: 新範囲外になった日の occurrence を delete する。**ただし `AttendanceRecord` を持つ occurrence は delete しない** (`onDelete: Cascade` で出席記録が物理削除されるため)。範囲外でも記録のある occurrence は **DB に温存** (overview の days ループからは見えなくなるだけ。データ損失ゼロ)。
3. **記録のない範囲外 occurrence のみ** delete (空の器なので消しても損失ゼロ、カレンダーがクリーンになる)。

この方針は「縮小をブロック/警告する」UX ではなく「縮小は常に許可、記録は温存」を選ぶ。理由: 警告ダイアログは UX を重くし、温存方式ならデータ損失が原理的に起きない (overview から見えなくても再度範囲を広げれば復活、記録も残る)。

## API: PATCH /api/semesters/:id

既存の PATCH ハンドラ (`semesters.ts:61-79`) に occurrence 再生成呼び出しを追加する。**name のみ変更の場合は再生成しない** (日付が変わらないので occurrence は不変)。

### 変更後のハンドラ挙動 (擬似)

```ts
app.patch("/api/semesters/:id", ..., async (c) => {
  const user = c.get("user");
  const { id } = c.req.valid("param");
  const input = c.req.valid("json");
  const semester = await findSemesterOrThrow(id);
  if (semester.userId !== user.id) throw new AppError(403, "FORBIDDEN", "Forbidden");

  const nextStart = input.startDate ? semesterDateStart(input.startDate) : semester.startDate;
  const nextEnd = input.endDate ? semesterDateEnd(input.endDate) : semester.endDate;
  if (nextStart > nextEnd) throw new AppError(400, "VALIDATION_ERROR", "startDate must be <= endDate");

  const dateChanged =
    nextStart.getTime() !== semester.startDate.getTime() ||
    nextEnd.getTime() !== semester.endDate.getTime();

  const updated = await prisma.semester.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.startDate ? { startDate: nextStart } : {}),
      ...(input.endDate ? { endDate: nextEnd } : {}),
    },
  });

  if (dateChanged) {
    await reconcileOccurrencesForSemesterDateChange({
      semesterId: id,
      userId: user.id,
      newStart: nextStart,
      newEnd: nextEnd,
    });
  }

  return c.json({ semester: semesterDto(updated) });
});
```

- `name` のみの変更 (`dateChanged === false`) → occurrence 再生成は呼ばれない。
- 学期に対する UserTimetable が存在しない場合 (まだ時間割未設定) → reconcile 内部で no-op (occurrence が 0 件)。

## occurrenceGen.ts: 新ヘルパ `reconcileOccurrencesForSemesterDateChange`

```ts
export async function reconcileOccurrencesForSemesterDateChange(args: {
  semesterId: string;
  userId: string;
  newStart: Date;   // JST 00:00:00 snap 済 (semesterDateStart の戻り)
  newEnd: Date;     // JST 00:00:00 snap 済 (semesterDateEnd の戻り)
}): Promise<{ created: number; deletedEmpty: number; preservedWithRecord: number }>
```

### 実装仕様 (Cascade 削除を絶対に起こさない手順)

`prisma.$transaction` 内で以下を順に行う:

1. **対象 UserTimetable を特定**: `userTimetable.findUnique({ where: { userId_semesterId: { userId, semesterId } }, include: { meetings: true } })`。無ければ `{ created: 0, deletedEmpty: 0, preservedWithRecord: 0 }` を返して終了 (時間割未設定の学期)。

2. **増分生成 (広げる方向)**: `generateOccurrencesForMeetings(tx, { userTimetableId, meetings, fromDate: newStart, toDate: newEnd })` を呼ぶ。既存 occurrence は P2002 skip で温存され、新範囲で増えた日の occurrence だけ created される。`created` を受け取る。
   - 注意: 既存 `generateOccurrencesForMeetings` は `fromDate`/`toDate` を受け取り、その範囲を曜日展開する。`newStart`〜`newEnd` 全体を渡してよい (既存日は P2002 skip されるため二重生成にならない)。

3. **縮小方向の delete (記録保護つき)**: 新範囲外の occurrence を、**記録の有無で振り分けてから** 記録なしのみ delete:
   ```ts
   const outOfRange = await tx.meetingOccurrence.findMany({
     where: {
       meeting: { userTimetableId },
       OR: [{ date: { lt: newStart } }, { date: { gt: newEnd } }],
     },
     select: { id: true, attendanceRecord: { select: { id: true } } },
   });
   const deletableIds = outOfRange.filter((o) => o.attendanceRecord == null).map((o) => o.id);
   const preservedWithRecord = outOfRange.length - deletableIds.length;
   let deletedEmpty = 0;
   if (deletableIds.length > 0) {
     const res = await tx.meetingOccurrence.deleteMany({ where: { id: { in: deletableIds } } });
     deletedEmpty = res.count;
   }
   ```
   - **`attendanceRecord != null` の occurrence は `deletableIds` に入らない** → deleteMany の対象外 → Cascade 発火せず出席記録は温存される。これが記録保護の核心。
   - delete は「記録なし occurrence の id を明示列挙」して行う。範囲条件で直接 deleteMany すると記録ありも巻き込むため**禁止**。

4. 戻り値 `{ created, deletedEmpty, preservedWithRecord }`。route 側はこの戻り値を使わない (ログ/将来の Toast 用に返すのみ)。

### なぜ全消し regen を流用しないか

`meeting.service.ts:113-118` の `deleteMany({meetingId})→regen` は occurrence を全削除してから作り直す。`AttendanceRecord.occurrence` が `onDelete: Cascade` なので、これを学期日付変更に流用すると**学期内の全出席記録が物理削除される**。本ヘルパは「範囲外かつ記録なし」だけを id 列挙して delete することで Cascade を完全に回避する (§不採用案で明記)。

## Web: useSemesters.ts に `useUpdateSemester` 新設

```ts
export function useUpdateSemester() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SemesterUpdateInput }) =>
      api<SemesterResponse>(`/api/semesters/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["semesters"] });   // semesters list + overview (prefix)
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["day"] });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["user-timetables"] });
    },
  });
}
```

- `["semesters"]` prefix invalidate は `QK.semesters()` (`["semesters"]`) と `QK.semesterOverview(id)` (`["semesters", id, "overview"]`) の両方をカバーする。
- occurrence 再生成を伴うため stats/day/today/user-timetables まで広げる (occurrence 数が変わると射影・カレンダー・今日画面が変わる)。
- `SemesterUpdateInput` 型は `@atender/shared` から (既存 partial スキーマ)。`apps/web/src/api/hooks/types` 経由で import (既存パターンに合わせる)。

## Web: SemesterListSheet.tsx に編集導線

現状 (`SemesterListSheet.tsx`) は各行が「デフォルト切替ボタン + 削除ボタン」のみ。**各行に「編集」ボタンを追加**し、押すとその行がインライン編集フォーム (name / startDate / endDate の Input + 保存/キャンセル) に切り替わる。

### UI レイアウト

```
通常時 (各行):
┌────────────────────────────────────────────────┐
│ [2026年前期            ]   [編集] [削除]         │ ← 行本体タップ=デフォルト切替 (既存)
│  2026-04-06 - 2026-09-18 / 現在                 │
└────────────────────────────────────────────────┘

編集モード (editingId === semester.id の行のみ展開):
┌────────────────────────────────────────────────┐
│ 学期名: [2026年前期            ]                 │
│ 開始日: [2026-04-06]  終了日: [2026-09-18]       │
│                          [保存]  [キャンセル]    │
└────────────────────────────────────────────────┘
```

### state とフォーム挙動

- `SemesterListSheet` 内に追加: `editingId: string | null`、`editForm: { name: string; startDate: string; endDate: string }`。
- 「編集」ボタン押下 → `setEditingId(semester.id)` + `setEditForm({ name: semester.name, startDate: semester.startDate, endDate: semester.endDate })` (現値プリフィル)。`semester.startDate`/`endDate` は DTO 上 ISO 文字列 (`YYYY-MM-DD`) なので `<Input type="date">` にそのまま入る。
- 「保存」押下 → `update.mutate({ id: editingId, body: diff })`。`body` は**変更されたフィールドのみ** (name/startDate/endDate を現値と比較して差分だけ送る partial)。空文字 name は送らない (バリデーション)。成功で `setEditingId(null)`。
- 「キャンセル」押下 → `setEditingId(null)` (フォーム破棄)。
- 保存ボタン disabled 条件: `update.isPending` または name が空 または `startDate > endDate` (クライアント側で文字列比較。ISO なので辞書順 = 日付順)。
- 別の行を編集中に他行の「編集」を押したら editingId が差し替わる (1 行ずつ編集)。

### props 契約 (Reviewer 描画テスト根拠)

`SemesterListSheet` の props は既存どおり `{ open: boolean; onClose: () => void }` (変更なし)。テストは `@/api/hooks` を vi.mock し、**`useUpdateSemester` をモックに追加** (`{ mutate: vi.fn(), isPending: false }`)。`useSemesters` は `{ data: { semesters: [...] } }`、`useMe` は `{ data: { user: { defaultSemesterId } } }`、`useCreateSemester` / `useDeleteSemester` / `usePatchMe` は `{ mutate: vi.fn() }` を返す。

---

# 修正B: カレンダー単日モーダルの一括ボタンを「入力済みでも有効」に (上書き)

## 確定方針

`DayBulkAttendanceControl` (DayDetailSheet 内ローカル) を **`useBulkMarkAttendance` + OVERWRITE 流用**で実装し直す。mark-all-present は拡張しない (today 画面の楽観更新を壊さないため)。

### mode の出し分け (Leader 委任判断の確定)

ユーザー意図「入力済みでも一括ボタンを使いたい」を「残りを埋めたい場合も、全部変えたい場合もある」と汲み、**未記録の有無で mode を出し分ける**:

- **未記録があるとき (`unrecordedCount > 0`)**: メインボタン `mode: "FILL"` 相当 = 「未記録だけ埋める、記録済みは触らない」。ラベル `全部出席にする (${unrecordedCount})`。
- **全件記録済みのとき (`unrecordedCount === 0`)**: メインボタン `mode: "OVERWRITE"` = 「全部その status で上書き」。ラベル `全部 出席に上書き` (上書きであることを明示)。disabled にしない (ここが今回の本丸)。

▾ メニュー (ABSENT/EXCUSED/TARDY/EARLY_LEAVE) も同じ規則で mode を出し分ける:
- 未記録あり: `全部 {label} (${unrecordedCount})` で FILL。
- 全件記録済み: `全部 {label} に上書き` で OVERWRITE。

> bulk service の FILL は「記録済み skip・未記録のみ upsert」(`attendance.service.ts:63-72`)、OVERWRITE は「休講以外を全件 upsert (記録済みも上書き)」。CANCELLED は対象外 (`BulkMarkAttendanceInput` の status enum に CANCELLED が無い)。休講は mode 問わず skip される。

### disabled 条件 (変更点)

```ts
// before (現状):
const isDisabled = disabled || unrecordedCount === 0 || markAll.isPending;
// after:
const isDisabled = disabled || bulk.isPending;   // ← unrecordedCount===0 を外す
```

`disabled` (時間割全体休講中) は維持。`unrecordedCount === 0` を外すことで全件記録済みでもボタン有効になる。

### 非表示条件 (維持)

DayDetailSheet 側の表示条件 `data.occurrences.length > 0 && timetableSuspension == null` (現 L109-111) は**変更しない**。occurrence 0 件 / 時間割全体休講中は引き続きコントロール非表示。

### 実装 (DayBulkAttendanceControl 書き換え)

```ts
function DayBulkAttendanceControl({ date, occurrenceCount, unrecordedCount, disabled }: {
  date: string;
  occurrenceCount: number;   // ← 休講でない occurrence 総数 (OVERWRITE 件数表示・mode 判定の母数)
  unrecordedCount: number;
  disabled: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const bulk = useBulkMarkAttendance();
  const isDisabled = disabled || bulk.isPending;
  const allRecorded = unrecordedCount === 0;
  const mode = allRecorded ? "OVERWRITE" : "FILL";

  function mark(status: "PRESENT" | "ABSENT" | "EXCUSED" | "TARDY" | "EARLY_LEAVE") {
    bulk.mutate({ dates: [date], status, mode });
    setMenuOpen(false);
  }
  // メインボタン: クリックで mark("PRESENT")。常に enabled (disabled/pending 以外)。
  // ラベル: allRecorded ? "全部 出席に上書き" : `全部出席にする (${unrecordedCount})`
  // ▾ メニュー: BULK_STATUSES を allRecorded で "全部 {label} に上書き" / `全部 {label} (${unrecordedCount})` 切替
  // メニュー補足テキスト: allRecorded
  //   ? `記録済み ${occurrenceCount} 件をすべて上書きします`
  //   : `未記録の ${unrecordedCount} 件のみ。記録済みは変わりません`
}
```

呼び出し元 (DayDetailSheet L110) は `occurrenceCount` を追加で渡す。`occurrenceCount` = 休講でない occurrence 数 = `data.occurrences.filter((o) => !courseSuspendedIds.has(o.courseId)).length`。

### invalidate / 反映

`useBulkMarkAttendance` は `["semesters"]/["stats"]/["day"]/["today"]/["timetable-suspensions"]` を invalidate 済 (既存)。DayDetailSheet は `useDayDetail(date)` = `["day", date]` を読むので一括実行後に即時反映される。bulk hook は**変更しない**。

> 旧 `useMarkAllPresent` の import は DayDetailSheet から**削除し置換** (mark-all-present はこのコンポーネントで使わなくなる)。

### props 契約 (Reviewer 描画テスト根拠)

DayDetailSheet 自体の props 契約は既存どおり `{ date: string | null; semesterId?: string | null; onClose: () => void }` (変更なし)。テストは `@/api/hooks` を vi.mock。**`useMarkAllPresent` のモックは残してよいが (他で参照される可能性)、新たに `useBulkMarkAttendance: vi.fn()` をモックに追加**し `{ mutate: vi.fn(), isPending: false }` を返す。

---

# 修正C: 「あと何限休める」を学期全体ベースに変更

## 新定義 (Leader 確定)

```
あと何限休める = floor((1 − r) × D − 消化済み欠席 + 1e-9)
```

- `r` = 必要出席率 (`requiredAttendanceRate / 100`)
- `D` = 学期全体の有効授業数 = `denominator` = `max(0, totalSessions − denominatorReduction)` (時間割休講 + 科目休講 + SEPARATE_COUNT + REDUCE_DENOMINATOR/CANCELLED を除外済)
- `消化済み欠席` = `fixedDenAll − fixedNumAll` (記録済みのみ集計。ABSENT 寄与 1.0 / HALF_PRESENT 0.5 / PRESENT 0)。**未記録は消化に数えない** (学期全体視点の楽観値)

**ユーザー例検証**: D=15・r=80% → `floor(0.2×15)=3` (許容枠)、確定欠席 2 → `floor(0.2×15 − 2)=floor(1)=1`。「今学期 3 回休める授業で既に 2 回休んでた → あと 1 回」と一致。

率 (toDate rate) は**現状維持** (C は `allowedAbsences` のみ変更)。

## attendanceStats.ts の変更

### `allowedAbsences` の式を置換

現状 (`attendanceStats.ts:156`):
```ts
allowedAbsences: projectedDen === 0 ? null : Math.floor(projectedNum - requiredRate * projectedDen + 1e-9),
```

新式:
```ts
// 既存変数を流用:
//   denominator     = Math.max(0, course.totalSessions - denominatorReduction)   // = D
//   fixedNumAll, fixedDenAll                                                       // 記録済みの num/den 合計
const consumedAbsence = fixedDenAll - fixedNumAll;          // 消化済み欠席
const allowanceRaw = (1 - requiredRate) * denominator - consumedAbsence;  // (1−r)D − 消化欠席
// ...
allowedAbsences: denominator === 0 ? null : Math.floor(allowanceRaw + 1e-9),
```

- `denominator === 0` (有効授業数ゼロ、occurrence 0 件 or 全休講) → `null` (現状 `projectedDen === 0` と等価なケースを `denominator === 0` に置換)。
- `projectedNum` / `projectedDen` は `allowedAbsences` 計算に**使わなくなる**。ただし `overallProjection` で別途使われているため (下記 overall 再設計で置換するまで) コードからは消さず、新たに overall 合算用の生値を追加する。

### overall 合算用の生値を返り値に追加

現状 `computeCourseStatsWithProjection` は `{ courses, overallProjection: { num, den } }` を返す。overall の allowedAbsences を新定義で再計算するには、科目別の `(1−r)×D` と `消化欠席` (または `allowanceRaw` の生値) を合算する必要がある。floor は非線形なので**合算してから floor** する。

返り値を拡張:
```ts
): Promise<{
  courses: CourseStatsDto[];
  overallProjection: { num: number; den: number };          // 既存 (overall の toDate 系で使われていない・将来用に残す。下記参照)
  overallAllowance: { allowanceSum: number; hasDenominator: boolean };  // 追加
}>
```

ループ内で集計:
```ts
let overallAllowanceSum = 0;     // Σ ((1−r)×D − 消化欠席)
let overallHasDenominator = false;
// 各 course 処理の末尾で:
if (denominator > 0) {
  overallHasDenominator = true;
  overallAllowanceSum += (1 - requiredRate) * denominator - (fixedDenAll - fixedNumAll);
}
// 戻り値:
return {
  courses,
  overallProjection: { num: overallProjectionNum, den: overallProjectionDen },
  overallAllowance: { allowanceSum: overallAllowanceSum, hasDenominator: overallHasDenominator },
};
```

> `overallProjection` は現状 `semesterOverview.service.ts:60` の `overall.allowedAbsences` 計算に使われている。C ではこの 60 行目を `overallAllowance` ベースに置換するため `overallProjection` は overview から参照されなくなる。`overallProjection` 自体は他に参照が無ければ削除してよいが、**`computeCourseStats` (薄いラッパ) のシグネチャ互換のため返り値からは消さず残す** (Developer 判断で未使用警告が出るなら overview 側の参照を切り替えた上で削除可。最小変更なら残置)。

## semesterOverview.service.ts の変更

現状 (`semesterOverview.service.ts:30, 60`):
```ts
const { courses, overallProjection } = await computeCourseStatsWithProjection({ ... });
// ...
allowedAbsences: overallProjection.den === 0 ? null : Math.floor(overallProjection.num - requiredRate * overallProjection.den + 1e-9),
```

新:
```ts
const { courses, overallAllowance } = await computeCourseStatsWithProjection({ ... });
// ...
allowedAbsences: overallAllowance.hasDenominator
  ? Math.floor(overallAllowance.allowanceSum + 1e-9)
  : null,
```

- `overall.allowedAbsences` = 科目別 `(1−r)×D − 消化欠席` を合算してから floor (floor 非線形のため科目別 floor の和ではない)。
- `hasDenominator === false` (全科目 D=0) → null。
- `overall.toDate` / `unrecordedCount` / `remainingCount` は不変。

## Web: 表示文言・色分岐の再設計

新定義では `allowedAbsences` は「学期全体の許容欠席残枠」。旧分岐の `allowedAbsences >= remainingCount` (= 残り未来未記録数以上なら「残り全休OK」) は**意味が変わるため再設計**する。新定義の `remainingCount` (未来未記録数) と「学期全体の許容欠席残枠」を比較する意味が無くなった。

### 新分岐 (確定)

`remainingCount` との比較を**廃止**し、`allowedAbsences` の符号と「残り未来コマで全部消費できるか」で 3 分岐する:

| 条件 | Hero 文言 | CourseListItem 短縮文言 | 色 |
|---|---|---|---|
| `allowedAbsences == null` | `データなし` | `—` | `--color-fg-tertiary` |
| `allowedAbsences < 0` | `{requiredRate}% を下回る見込み` | `下回る見込み` | `--color-status-absent` |
| `allowedAbsences >= remainingCount` (残り全コマ休んでも枠が余る) | `残りを全部休んでも {requiredRate}% を維持` | `残り全休OK` | `--color-accent-500` |
| それ以外 (`0 <= allowedAbsences < remainingCount`) | `あと {allowedAbsences}限 休める` | `あと{allowedAbsences}限休める` | Hero=`--color-fg-primary` (数字 accent) / CourseListItem=`--color-fg-tertiary` |

> **"残り全休OK" の閾値の意味**: 新定義の `allowedAbsences` は「学期全体で残り何コマ欠席できるか」。`remainingCount` (未来の未記録コマ数) はこれから出欠が発生しうる最大コマ数。`allowedAbsences >= remainingCount` なら「これから来る授業を全部休んでも必要出席率を維持できる」を意味し「残り全休OK」が成立する。これは旧分岐と式は同形だが、`allowedAbsences` の定義が変わったことで**意味的に正しくなった** (旧: occurrence 射影の余り / 新: 学期全体の許容欠席残枠)。
>
> `allowedAbsences >= 0` だが `< remainingCount` のときは「あと N 限休める」(N = allowedAbsences)。これがユーザー例「あと 1 回休める」に対応する主要表示。

### AttendanceRateHero.tsx の `actionText` / `actionColor`

現状 (L75-87) のロジックは新分岐表の通りに置換。`actionText` の `< 0` 文言を `残り全部出席しても ${requiredRate}% に届きません` から **`${requiredRate}% を下回る見込み`** に変更 (学期全体視点で「残り全部出席」前提が無くなったため)。

```ts
function actionText(allowedAbsences: number | null, remainingCount: number, requiredRate: number) {
  if (allowedAbsences == null) return "データなし";
  if (allowedAbsences < 0) return `${requiredRate}% を下回る見込み`;
  if (allowedAbsences >= remainingCount) return `残りを全部休んでも ${requiredRate}% を維持`;
  return `あと ${allowedAbsences}限 休める`;
}
function actionColor(allowedAbsences: number | null, remainingCount: number) {
  if (allowedAbsences == null) return "var(--color-fg-tertiary)";
  if (allowedAbsences < 0) return "var(--color-status-absent)";
  if (allowedAbsences >= remainingCount) return "var(--color-accent-500)";
  return "var(--color-fg-primary)";
}
```

### CourseListItem.tsx の `shortActionText` / `actionColor`

現状 (L63-75) を新分岐表の通りに置換。文言は `下回る見込み` / `残り全休OK` / `あと{n}限休める` / `—` を維持 (短縮形は変えない、色も維持)。**ロジックは `allowedAbsences` の新定義を受けるだけで分岐構造は同形**なので、CourseListItem 側は実質変更不要 (ただし新定義での挙動が正しいことをテストで確認する)。Hero 側の `< 0` 文言のみ実体変更。

---

# 挙動仕様 (Reviewer テスト根拠)

「今日」は `now` 引数で固定 (実時刻依存禁止)。`requiredAttendanceRate` は明示で渡す。

## (A) 学期編集 — API (apps/api/tests/semesters.test.ts に追記)

`setupCompleteUser` / `createSemester` / `createOccurrence` ヘルパ再利用。occurrence は対象学期の UserTimetable 配下に生成。

1. **name のみ変更**: `PATCH { name: "改名後" }` → 200、`semester.name` 更新。occurrence 数は変わらない (再生成されない)。日付も不変。
2. **日付を広げる (endDate を後ろへ)**: 元 occurrence 5 件 (週1)、endDate を +2 週延長 → `PATCH { endDate: 新終了日 }` → 200。新範囲の曜日該当日に occurrence が**増分生成**される (既存 5 件は温存され重複しない)。`generatedOccurrences` が増える。既存 occurrence の AttendanceRecord は不変。
3. **日付を広げる (startDate を前へ)**: startDate を -1 週 → 前方の曜日該当日に occurrence 追加生成。
4. **日付を縮める (記録なし)**: 元 occurrence 5 件 (全て記録なし)、endDate を縮めて末尾 2 件が範囲外に → `PATCH` 後、範囲外 2 件の occurrence が delete される (`MeetingOccurrence` 行が消える)。AttendanceRecord は元々無いので影響なし。
5. **★日付を縮める (記録のある日が範囲外になる)**: 元 occurrence 5 件、末尾 2 件に **PRESENT/ABSENT の AttendanceRecord** を付与。endDate を縮めて末尾 2 件が範囲外に → `PATCH` 後:
   - 記録のある範囲外 occurrence 2 件は **DB に温存される** (`meetingOccurrence.findMany` で id がまだ存在)。
   - その AttendanceRecord 2 件も**温存される** (`attendanceRecord.findMany` で件数不変 = Cascade 削除が起きていない)。
   - overview の `days` ループは新 endDate までしか回らないので、温存された 2 日はカレンダーに出ない (overview レスポンスの `days` に含まれない)。これがデータ損失ゼロの確認。
6. **日付を縮める (記録あり + 記録なし混在)**: 範囲外 3 件のうち 1 件のみ記録あり → 記録なし 2 件は delete、記録あり 1 件は温存。`deletedEmpty=2`、`preservedWithRecord=1` 相当の結果 (route 戻り値には出ないので occurrence/record の件数で検証)。
7. **時間割未設定の学期**: UserTimetable が無い学期で `PATCH { endDate }` → 200、occurrence 操作なし (no-op)、エラーにならない。
8. **startDate > endDate**: `PATCH { startDate: 終了日より後 }` → 400 VALIDATION_ERROR (既存ガード)。occurrence 変更なし。
9. **他人の学期**: 別ユーザーの semester に PATCH → 403 (既存 #24 と同経路、回帰)。
10. **再度広げると復活が見える**: #5 で縮めた後、endDate を元に戻す `PATCH` → 温存されていた記録あり occurrence 2 件が再び新範囲内になり overview の `days` に再出現し、AttendanceRecord も生きている (温存方式の往復確認)。

## (B) カレンダー単日一括上書き — DayDetailSheet (apps/web/tests/components/DayDetailSheet.test.tsx に追記)

`@/api/hooks` を vi.mock。`useBulkMarkAttendance: vi.fn()` を追加し `{ mutate, isPending: false }` を返す。`useDayDetail` が occurrences を返す。

11. **未記録あり (2 件 null・非休講)**: メインボタン「全部出席にする (2)」が描画され enabled。クリックで `bulk.mutate` が `{ dates: [date], status: "PRESENT", mode: "FILL" }` で呼ばれる。
12. **全件記録済み (status != null)**: メインボタンが「全部 出席に上書き」表示かつ **enabled (disabled でない)**。クリックで `bulk.mutate` が `{ dates: [date], status: "PRESENT", mode: "OVERWRITE" }` で呼ばれる。
13. **▾ メニュー (未記録あり)**: ▾ (`aria-label="一括記録のステータスを選ぶ"`) クリックでメニュー (`role="menu"`) が開き「全部 欠席 (2)」等が出る。「全部 欠席 (2)」クリックで `bulk.mutate` が `{ dates: [date], status: "ABSENT", mode: "FILL" }`。
14. **▾ メニュー (全件記録済み)**: メニュー項目が「全部 欠席 に上書き」等。クリックで `mode: "OVERWRITE"`。
15. **メニュー補足文言**: 未記録ありのとき「未記録の {n} 件のみ。記録済みは変わりません」、全件記録済みのとき「記録済み {n} 件をすべて上書きします」。
16. **時間割全体休講中 (`timetableSuspension != null`)**: 一括コントロール非表示 (DayDetailSheet の表示条件で除外、現 L109)。
17. **occurrence 0 件**: 一括コントロール非表示。
18. **pending 中 (`bulk.isPending: true`)**: メイン/▾ ともに disabled。
19. **既存回帰**: 個別 OccurrenceRow の status クリックで `usePatchAttendance` が呼ばれる既存テスト・休講ボタン (fixes 修正3) が引き続き通る。`useBulkMarkAttendance` モック追加のみで既存アサーション不変。

## (C) あと何限休める = 学期全体ベース — computeCourseStats (apps/api/tests/stats.test.ts に追記)

`requiredAttendanceRate` を明示で渡す。occurrence を `now` で過去/未来に振り分け。totalSessions を明示。

20. **ユーザー例 (Leader 指定)**: totalSessions=15、denominatorReduction=0 → D=15。過去 = PRESENT 8 / ABSENT 2 (消化欠席 = fixedDenAll(10) − fixedNumAll(8) = 2)、未来 5 件未記録、required=80 → `allowedAbsences = floor(0.2×15 − 2 + 1e-9) = floor(3 − 2) = 1`。
21. **欠席ゼロ**: 同 D=15、過去 = PRESENT 5 / ABSENT 0、required=80 → 消化欠席 0 → `floor(0.2×15) = floor(3) = 3`。
22. **denominatorReduction で D が縮む**: totalSessions=15、科目休講 2 日 (denominatorReduction +2) → D=13。過去 = PRESENT 6 / ABSENT 1 (消化欠席 1)、required=80 → `floor(0.2×13 − 1) = floor(2.6 − 1) = floor(1.6) = 1`。SEPARATE_COUNT / REDUCE_DENOMINATOR / CANCELLED も denominatorReduction に入るので D から除外される (既存ロジック)。
23. **HALF_PRESENT 端数 (消化欠席に 0.5)**: D=10、過去 = PRESENT 4 / TARDY 1 (rule HALF_PRESENT, num 0.5/den 1) / ABSENT 1。消化欠席 = fixedDenAll(6) − fixedNumAll(4.5) = 1.5。required=70 → `floor(0.3×10 − 1.5 + 1e-9) = floor(3 − 1.5) = floor(1.5) = 1`。floor が 0.5 端数を吸収。
24. **負値 (既に下回り)**: D=10、過去 = ABSENT 5。消化欠席 5、required=70 → `floor(0.3×10 − 5) = floor(3 − 5) = -2` (負を返す)。
25. **境界ちょうど**: D=10、過去 = ABSENT 3、required=70 → `floor(0.3×10 − 3 + 1e-9) = floor(0 + 1e-9) = 0` (あと 0 限、まだ下回らない)。epsilon で 0 を割らない。
26. **未記録は消化に数えない**: D=15、過去 = PRESENT 5 / 未記録 3 (記録なし)、required=80。消化欠席 = fixedDenAll(5) − fixedNumAll(5) = 0 (未記録は fixedDen に入らない) → `floor(0.2×15 − 0) = 3`。未記録があっても allowedAbsences は減らない (学期全体の楽観値)。
27. **D=0 (occurrence 0 件 or 全休講)**: `denominator === 0` → `allowedAbsences = null`。
28. **回帰**: `toDate` 系 (effectiveNumerator/Denominator/attendanceRate) と全期間 `attendanceRate` / `counts` は C の前後で**不変** (C は allowedAbsences のみ変更)。

## (C-overall) overview 合算 — GET /api/semesters/:id/overview (apps/api/tests/semesters.test.ts or stats に追記)

29. **単一 course**: #20 構成の単一 course → `overall.allowedAbsences = 1` (科目別と一致)。
30. **複数 course の合算 (floor 非線形)**: course1 = (D=10, 消化欠席 0, allowanceRaw=0.2×10=2.4 ※ r=76 で端数)・course2 = (D=10, 消化欠席 0, allowanceRaw=2.4)。**科目別 floor の和** = floor(2.4)+floor(2.4)=2+2=4、**合算 floor** = floor(2.4+2.4)=floor(4.8)=4 …一致するので、floor 非線形が出る値を選ぶ: course1 allowanceRaw=0.6・course2 allowanceRaw=0.6 → 科目別 floor 和 = 0+0=0、合算 floor = floor(1.2)=1。**overall は 1** (合算してから floor)。これで「科目別の和ではない」ことを 1 ケースで確認。
   - 具体構成例: 各 course D=5・required=88 → (1−0.88)×5 = 0.6、消化欠席 0 → allowanceRaw=0.6。2 course で overall = floor(1.2)=1、科目別はそれぞれ floor(0.6)=0。
31. **D=0 課目混在**: 1 course が D=0 (null) でも、他 course が D>0 なら `hasDenominator=true` で overall は計算される (D=0 course は allowanceSum に加算しない)。全 course D=0 のとき `overall.allowedAbsences = null`。

## (C-web) Hero / CourseListItem 文言・色 (apps/web/tests/components/ に追記)

`AttendanceRateHero` props `{ overall, requiredRate }`、`CourseListItem` props `{ stats, requiredRate, onClick }` (既存契約)。

32. **Hero あと N 限 (`allowedAbsences=1, remainingCount=5`)**: 「あと 1限 休める」、色 style `var(--color-fg-primary)`。
33. **Hero 残り全休OK (`allowedAbsences=10, remainingCount=5`、>= remaining)**: 「残りを全部休んでも 70% を維持」、色 `var(--color-accent-500)`。
34. **Hero 下回り (`allowedAbsences=-2`)**: 「70% を下回る見込み」(新文言。**旧「残り全部出席しても…に届きません」ではない**)、色 `var(--color-status-absent)`。
35. **Hero データなし (`allowedAbsences=null`)**: 「データなし」、色 `var(--color-fg-tertiary)`。
36. **CourseListItem あと N 限 (`allowedAbsences=1, remainingCount=5`)**: 「あと1限休める」、色 `var(--color-fg-tertiary)`。
37. **CourseListItem 下回り (`allowedAbsences<0`)**: 「下回る見込み」、色 `var(--color-status-absent)`。
38. **CourseListItem 残り全休OK (`allowedAbsences >= remainingCount`)**: 「残り全休OK」、色 `var(--color-accent-500)`。

## (A-web) SemesterListSheet 編集導線 (apps/web/tests/components/SemesterListSheet.test.tsx 新規)

`@/api/hooks` を vi.mock。`useUpdateSemester: vi.fn()` → `{ mutate: vi.fn(), isPending: false }`。`useSemesters` → `{ data: { semesters: [{ id:"s1", name:"2026年前期", startDate:"2026-04-06", endDate:"2026-09-18" }] } }`。`useMe`/`useCreateSemester`/`useDeleteSemester`/`usePatchMe` をモック。

39. **編集ボタン**: 各学期行に「編集」ボタンが存在する。
40. **編集モード展開**: 「編集」クリックで name/開始日/終了日の Input が現値プリフィルで表示される (name に "2026年前期"、開始日 input value "2026-04-06")。
41. **保存**: name を変更して「保存」クリック → `useUpdateSemester().mutate` が `{ id: "s1", body: { name: <新値> } }` (変更フィールドのみ) で呼ばれる。
42. **キャンセル**: 「キャンセル」クリックで編集フォームが閉じる (Input 非表示)。
43. **保存 disabled**: name を空にすると「保存」ボタン disabled。`startDate > endDate` でも disabled。
44. **既存回帰**: 行本体タップで `usePatchMe` (defaultSemesterId 切替)、「削除」で `useDeleteSemester` が呼ばれる既存挙動が通る。

---

# テスト基盤

- **API**: Vitest + 実 SQLite (`apps/api/vitest.config.ts`)、配置 `apps/api/tests/`。`setupCompleteUser` / `createSemester` / `createOccurrence` (`tests/helpers/`) 再利用。`computeCourseStats` は `now` 固定。
  - `tests/semesters.test.ts` (追記) — (A) 1-10、(C-overall) 29-31
  - `tests/stats.test.ts` (追記) — (C) 20-28
  - occurrence 再生成の挙動は `tests/occurrence-gen.test.ts` の流儀 (P2002 skip 確認) を参考に semesters.test.ts 側で検証
- **Web**: Vitest 2 + jsdom + RTL。配置 `apps/web/tests/{components,lib}/`。
  - `tests/components/DayDetailSheet.test.tsx` (追記) — (B) 11-19。`useBulkMarkAttendance: vi.fn()` をモックに追加
  - `tests/components/AttendanceRateHero.test.tsx` (更新) — (C-web) 32-35。#34 の旧「届きません」文言アサートを新「下回る見込み」に**置換** (仕様変更による期待値更新)
  - `tests/components/CourseListItem.test.tsx` (更新) — (C-web) 36-38。allowedAbsences 新定義での挙動確認 (文言・色は同形)
  - `tests/components/SemesterListSheet.test.tsx` (新規) — (A-web) 39-44
- jsdom の罠 (既知ベースライン、判定除外): `localStorage` 不在 (theme import 系は stub、`Muraki/knowledge/gotcha/jsdom-no-localstorage-in-vitest.md`)、`color-mix`/`calc` 非評価 → **style は生文字列 assert** (色は `var(--color-...)` 文字列一致で検証)。
- **既知ベースライン失敗は判定除外**: api 16 件 (auth/friendship/room 系)、web routes 系 27 件、jsdom localStorage 系。Reviewer はこれらを GREEN 判定の対象外とする。
- `.review.test` 系 (`AttendanceRateHero.review.test.tsx` 等) は Reviewer 生成の別系統。本設計の Reviewer は上記の本体テストファイルに追記/更新する。
- E2E (chrome-devtools MCP) は本修正のテスト範囲外。

---

# 不採用案

- **A: occurrence 全消し → regen を流用** (`meeting.service.ts` の `deleteMany({meetingId})→regen` パターン): `AttendanceRecord.occurrence` が `onDelete: Cascade` のため、occurrence を全削除すると**学期内の全出席記録が物理削除される**。記録あり occurrence を id 列挙で除外して delete する方式に限定 (採用案2)。
- **A: 縮小をブロック/警告ダイアログ** (「N 件の記録が範囲外になります」確認): UX を重くする。温存方式 (記録あり occurrence は範囲外でも DB に残す) ならデータ損失が原理的に起きず、確認なしで安全に縮小できる。再度広げれば復活する (#10)。
- **A: occurrence を触らない (案1、PATCH 配線のみ)**: 日付メタだけ変えると occurrence が陳腐化し、広げた範囲の授業がカレンダー/今日画面に出ない・縮めた範囲外の授業が出続ける。増分再生成で整合させる方が実態に合う。totalSessions ベースの stats は不変なので案1 でも率は壊れないが、カレンダー表示と occurrence がズレるため不採用。
- **A: totalSessions を別途編集可能にする (案3)**: 学期日付編集とは別機能。今回の要望 (name/日付編集) に含まれないため対象外。
- **B: mark-all-present に「記録済みも上書き」モードを追加**: mark-all-present は today 画面の楽観更新 (`useTodayOccurrences`) と密結合。上書きモードを足すと today の挙動 (未記録のみ埋める前提) を壊すリスク。bulk OVERWRITE が `dates=[date]` で単日上書きに完全一致し、`useBulkMarkAttendance` が必要な invalidate を既に持つため流用が最小・安全。
- **B: 常に OVERWRITE 固定**: 未記録だけ埋めたい (記録済みは触りたくない) ケースで、誤って記録済みを全部上書きする事故が起きる。未記録の有無で FILL/OVERWRITE を出し分け、ラベルで「上書きします」を明示する方が意図に沿う。
- **C: occurrence 射影ベースの旧式を維持** (`floor(projectedNum − r×projectedDen)`): projectedDen が occurrence 数 (fixedDen + floating) に依存し「未来未記録を出席仮定した学期末射影」になる。ユーザーは「学期全体で見た許容欠席残枠」を求めており、totalSessions ベース D = `(1−r)×D − 消化欠席` の方が「3 回休める授業であと 1 回」という直感に一致する。
- **C: 消化欠席に `denominator − numerator` を使う**: `numerator` は未記録を含まない全期間分子だが、`denominator = totalSessions − reduction` には未記録分も含まれるため `denominator − numerator` は**未記録を欠席として混入させてしまう**。`fixedDenAll − fixedNumAll` (記録済みのみ) を使い、未記録を消化に数えない (Leader 確定の楽観値)。
- **C: overall を科目別 allowedAbsences の和で出す**: floor は非線形なので `Σ floor(x_i) ≠ floor(Σ x_i)`。科目別 `(1−r)×D − 消化欠席` の生値を合算してから floor する (#30 で検証)。
