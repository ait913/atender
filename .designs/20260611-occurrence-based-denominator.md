# 出席率の母数を occurrence 実数ベースに統一 — totalSessions を母数から外す

## 目的 (1-3行)

出席率の母数 (`denominator`) を、ユーザー手入力の `Course.totalSessions` (デフォルト 15、occurrence 実態と無連動) から **occurrence 実数ベース** (`course.occurrences.length − denominatorReduction`) に統一する。これで全期間率・あと何限休める・今日まで率がすべて「カレンダーに実際に並ぶ授業数」基準になり、「水曜2限×4日=8コマで誰も休んでいないのに『あと4限休める』」のような乖離を解消する。

---

## スコープと前提

- **前提**: `20260611-semester-redesign.md` / `20260611-semester-fixes.md` / `20260611-semester-edit-and-tweaks.md` がすべて main マージ済。現状の `computeCourseStatsWithProjection` は以下になっている (Read 済み事実):
  - `denominator = Math.max(0, course.totalSessions − denominatorReduction)` (`attendanceStats.ts:145`)
  - 全期間率 `attendanceRate = numerator / denominator` (`:166`)
  - `allowanceRaw = (1 − r) × denominator − consumedAbsence` / `allowedAbsences = floor(allowanceRaw + 1e-9)` (`:150,174`)
  - 今日まで率 `toDateNum / (toDateDen + floatingPast)` — **既に occurrence ベース** (`:148,171`)。本設計では変更しない
  - `generatedOccurrences: course.occurrences.length` を既に DTO で返している (`:162`)
- **本設計の核**: `denominator` の定義 1 行を totalSessions ベースから occurrence ベースに置換する。`denominator` を参照する全期間率・あと何限休めるの**式の形は維持**し、`denominator` の中身だけ差し替える。
- 日付正規化は `apps/api/src/lib/tz.ts` の `toIsoDate` を使う (既存方式、occurrence ループは現状のまま)。

### Researcher 確認済みの重要事実 (設計の土台)

1. `course.occurrences.length` = この course に紐づく **MeetingOccurrence 全行数** = fixed + floatingPast + floatingFuture + suspended(休講) の総和。occurrence は `occurrenceGen.ts` が学期日付範囲 × 曜日 × periodCount で生成する。**totalSessions とは一切連動しない**。
2. `denominatorReduction` (現状コード `:104,109,132,135`) = 休講 occurrence (時間割全体 + 科目別) + SEPARATE_COUNT 記録 + REDUCE_DENOMINATOR/CANCELLED 記録、の合計。
3. web 側で `totalSessions` を表示・使用しているのは **`CourseEditModal.tsx` の手入力欄だけ** (`grep` 確認済)。`generatedOccurrences` を表示している箇所は存在しない。CourseListItem / CourseDetailModal / AttendanceRateHero は totalSessions/generatedOccurrences を読んでいない。
4. `totalSessions` の参照箇所 (非テスト): `Course` schema、`TemplateCourse` schema、`stats.ts` (CourseStatsDto)、`template.ts`、`userTimetable.ts`、`course.ts` (CourseCreateInput / CourseUpdateInput)、`courses.ts` (POST/PATCH)、`userTimetables.ts` (full PATCH / copy / publish)、`templates.ts`、`templateCopy.ts`、`dto.ts` (courseDto / 型)、`attendanceStats.ts`。
5. occurrence は学期編集・Meeting 追加・休講で増減する (semester-edit-and-tweaks でマージ済の増分再生成)。

---

## 設計判断の要点 (先に確定)

### 判断 1: `denominator` を occurrence 実数ベースに変える

```
denominator = max(0, course.occurrences.length − denominatorReduction)
```

`course.totalSessions` を母数計算から完全に外す。`denominatorReduction` は現状ロジックそのまま (休講 + SEPARATE + REDUCE/CANCELLED)。

**検算 (なぜ「休講を除く実授業数からルール除外分を引いた値」になるか)**:

`occurrences.length` を occurrence ループ内のカテゴリで分解すると:

```
occurrences.length = suspended + (fixed記録の件数) + floatingPast + floatingFuture
```

`denominatorReduction` の内訳:
- 休講 occurrence は `continue` 前に `denominatorReduction += 1` (`:104,109`) — suspended 件数ぶん
- fixed 記録のうち SEPARATE_COUNT は `denominatorReduction += 1` (`:132`)
- fixed 記録のうち REDUCE_DENOMINATOR / CANCELLED (`weight.den === 0`) は `denominatorReduction += 1` (`:135`)

したがって:

```
denominator = occurrences.length − denominatorReduction
            = (suspended + fixed件数 + floatingPast + floatingFuture) − (suspended + separate件数 + reduceDen件数)
            = (fixed件数 − separate件数 − reduceDen件数) + floatingPast + floatingFuture
            = (分母に効く記録済み occurrence 数) + (未記録過去) + (未記録未来)
```

= 「**休講を除いた実授業数から、SEPARATE / REDUCE / CANCELLED のルール除外分を引いた値**」。これは `fixedDenAll + floatingPast + floatingFuture` (= 現状の `projectedDen`、`:147`) と**完全に一致する** (fixed の num/den は weight.den が 1 の記録のみ加算、separate/reduceDen は加算されないため `fixedDenAll = fixed件数 − separate件数 − reduceDen件数`)。

> **重要な等式**: `occurrences.length − denominatorReduction === projectedDen === fixedDenAll + floatingPast + floatingFuture`。
> よって実装は `course.occurrences.length − denominatorReduction` を直接計算してもよいし、既存の `projectedDen` を流用してもよい (どちらも同値)。**設計の正準定義は `course.occurrences.length − denominatorReduction`** とし、Developer は可読性のためどちらで書いてもよいが、テストはこの等式が成り立つことを 1 ケースで確認する。

### 判断 2: `Course.totalSessions` は Prisma migration で**削除する** (deprecated 残置ではなく物理削除)

母数から外した後、totalSessions は「ユーザーが手入力するが何にも使われない死にフィールド」になる。CourseEditModal の手入力欄を消すと設定手段も消え、schema にだけ列が残る齟齬が生じる。中途半端に残すと将来「これは何の数字か」という混乱を生むため、**Course / TemplateCourse 双方から totalSessions を削除**し、関連スキーマ・DTO・CRUD・テンプレ copy・seed・CourseEditModal をすべて除去する。

不採用案 (deprecated 残置 / 入力を促す UI) は §不採用案で却下理由を記す。

**TemplateCourse からも削除する理由**: Atender は Course ↔ TemplateCourse を Uniform Shape (同形) で扱い (`templateCopy.ts` / `userTimetables.ts` publish-as-template が 1:1 マッピング)、`schema.prisma` コメントも設計原則として明示。片側だけ totalSessions を残すとコピー処理 (`:140` 等) で「コピー元に無いフィールド」を要求して壊れる。occurrence ベース統一で totalSessions が概念ごと不要になる以上、Template 側も同時に消して Uniform Shape を維持する。

### 判断 3: 分母 0 のガードは現状の構造を維持

occurrence 未生成 (時間割未設定 / Meeting 0 件) の course は `occurrences.length = 0`、`denominatorReduction = 0` → `denominator = 0`。現状の `denominator === 0 → attendanceRate = null` / `allowedAbsences = null` ガード (`:166,174`) がそのまま効く。occurrence ベースでも 0 除算は起きない。全休講で `denominator = 0` (occurrences.length === denominatorReduction) のケースも同じガードで null になる。

---

## データモデル (Prisma)

### before

```prisma
model Course {
  id              String  @id @default(cuid())
  userTimetableId String
  name            String
  teacher         String?
  color           String?
  totalSessions   Int        // ← 削除
  note            String?
  // ... relations
}

model TemplateCourse {
  id            String  @id @default(cuid())
  templateId    String
  name          String
  teacher       String?
  color         String?
  totalSessions Int        // ← 削除
  note          String?
  // ... relations
}
```

### after

```prisma
model Course {
  id              String  @id @default(cuid())
  userTimetableId String
  name            String
  teacher         String?
  color           String?
  note            String?
  // ... relations (不変)
}

model TemplateCourse {
  id            String  @id @default(cuid())
  templateId    String
  name          String
  teacher       String?
  color         String?
  note          String?
  // ... relations (不変)
}
```

他のモデルは不変。`MeetingOccurrence` / `AttendanceRecord` には触らない。

### Migration 方針

`apps/api/prisma/migrations/` に新規 migration を `prisma migrate dev --name drop_total_sessions` で生成する。

- **SQLite の DROP COLUMN**: SQLite は `ALTER TABLE DROP COLUMN` を最近のバージョンで直接サポートするが、Prisma は安全のため **table-rebuild** (`_new` テーブル作成 → `INSERT INTO _new SELECT (totalSessions を除く全列)` → `DROP old` → `RENAME`) を生成する。**totalSessions のデータは破棄される (それが目的)**。データ移行 UPDATE は不要 (occurrence 実数が新しい母数なので、totalSessions の値を引き継ぐ先が無い)。
- **up**: `Course` と `TemplateCourse` から totalSessions 列を落とす rebuild ブロック 2 つ。Prisma 自動生成をそのまま使う (手編集不要 — phase1 の room 移行と違いデータコピーが要らない単純 DROP)。
- **down (ロールバック)**: Prisma migrate は down を自動生成しない (forward-only)。**prod の安全性**: 列 DROP は破壊的だが、totalSessions は本設計時点で「どの計算にも使われていない値」なので、DROP しても率・あと何限の算出に影響しない (それらは occurrence ベースに切り替わる)。万一ロールバックが必要な場合は「列を再追加して default 15 で埋める」migration を別途当てれば復旧できる (元の手入力値は失われるが、occurrence ベースに移行済なら totalSessions 値は不要)。
- **適用順序**: コード (occurrence ベース denominator + schema 変更 + DTO 除去) と migration は同一デプロイで入る。Prisma client 再生成 (`prisma generate`) が schema 変更に追従する。
- **prod DB の column drop の安全性**: prod の `Course` 行は totalSessions に手入力値 (多くはデフォ 15) を持つが、本設計のコードは migration 適用後 totalSessions を一切読まない。DROP 時に FK / index への影響なし (totalSessions に index は無い、`schema.prisma` 確認済)。AttendanceRecord / MeetingOccurrence は totalSessions を参照しないので Cascade も発火しない。

---

## shared schema 変更 (`packages/shared/src/schemas/`)

### `course.ts` — totalSessions 除去

```ts
// before
export const CourseCreateInput = z.object({
  userTimetableId: z.string(),
  name: z.string().min(1).max(100),
  teacher: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  totalSessions: z.number().int().min(1).max(60).default(15),   // ← 削除
  note: z.string().max(500).optional(),
});
export const CourseUpdateInput = z.object({
  name: z.string().min(1).max(100).optional(),
  teacher: z.string().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  totalSessions: z.number().int().min(1).max(60).optional(),    // ← 削除
  note: z.string().max(500).nullable().optional(),
});

// after: 上記 2 つから totalSessions 行を削除するのみ。他フィールドは不変。
```

### `template.ts` — CourseDto / TemplateCreateInput.courses[] から totalSessions 除去

```ts
// CourseDto (template.ts:16 付近) から totalSessions: z.number()... を削除
// TemplateCreateInput.courses[] (template.ts:69 付近) から totalSessions を削除
```

`MeetingDto` 等は不変。

### `userTimetable.ts` — UserTimetablePatchInput.courses[] から totalSessions 除去

```ts
// userTimetable.ts:41 付近の courses[].totalSessions を削除
```

### `stats.ts` — CourseStatsDto から totalSessions 除去 (generatedOccurrences は残す)

```ts
export const CourseStatsDto = z.object({
  courseId: z.string(),
  courseName: z.string(),
  teacher: z.string().nullable(),
  // totalSessions: z.number().int(),       ← 削除
  generatedOccurrences: z.number().int(),    // 残す (occurrence 総数。新しい母数の素地)
  counts: z.object({ /* 不変 */ }),
  effectiveNumerator: z.number(),
  effectiveDenominator: z.number(),          // 意味が occurrence ベースに変わるが型・名前は不変
  attendanceRate: z.number().nullable(),
  separateCounts: z.record(...).optional(),
  toDate: z.object({ /* 不変 */ }),
  remainingCount: z.number().int(),
  allowedAbsences: z.number().int().nullable(),
});
```

> `effectiveDenominator` のフィールド名・型は維持する (occurrence ベースに中身が変わるだけ)。`generatedOccurrences` は「occurrence 総数 (休講含む)」のままで、`effectiveDenominator` (休講・除外を引いた値) とは別物。両方残す。

---

## API / 関数シグネチャ

### `computeCourseStatsWithProjection` (apps/api/src/services/attendanceStats.ts)

シグネチャ不変。occurrence ループ (`:100-143`) は**完全に不変** (counts / numerator / denominatorReduction / toDate / floating / fixed の集計は現状のまま)。**戻り値計算 (`:145` 周辺) の `denominator` 定義 1 行のみ変更**。

```ts
// before (:145)
const denominator = Math.max(0, course.totalSessions - denominatorReduction);

// after
const denominator = Math.max(0, course.occurrences.length - denominatorReduction);
// (= projectedDen と同値。判断1の等式参照。Developer は projectedDen を流用してもよい)
```

これに連動して自動的に以下が occurrence ベースになる (式の形は不変):

```ts
attendanceRate = denominator === 0 ? null : numerator / denominator;       // 全期間率 (:166)
allowanceRaw   = (1 - requiredRate) * denominator - consumedAbsence;        // (:150)
allowedAbsences = denominator === 0 ? null : Math.floor(allowanceRaw + 1e-9); // (:174)
overallAllowanceSum += allowanceRaw (denominator > 0 のとき);               // (:153-156)
```

DTO から `totalSessions: course.totalSessions` (`:161`) の行を**削除**。`generatedOccurrences: course.occurrences.length` (`:162`) は残す。

> **整合性の明記 (今日まで率との関係)**: 今日まで率は `toDateNum / (toDateDen + floatingPast)` (`:148,171`) で**変更しない**。今日まで率の分母は「今日までの実授業 (= 記録済み過去 den + 未記録過去)」で、全期間 denominator の部分集合 (未来分 floatingFuture が無いだけ)。本設計後、今日まで率も全期間率も `allowedAbsences` も**すべて occurrence 実数を母数とする**ため、3 指標の母数の考え方が初めて完全に揃う (totalSessions ベースだった全期間率・あと何限だけが浮いていたのを統一)。

### `getSemesterOverview` (apps/api/src/services/semesterOverview.service.ts)

**ロジック変更不要**。`overall.effectiveDenominator` は courses の `effectiveDenominator` 合算 (`:36`)、`overall.attendanceRate` はその除算 (`:51`)、`overall.allowedAbsences` は `overallAllowance.allowanceSum` 合算後 floor (`:59`)。computeCourseStats 内の `denominator` 定義変更が `effectiveDenominator` / `allowanceRaw` / `overallAllowanceSum` に自動伝播するため、overview 側のコードは触らない。

> 確認事項 (Developer): overview は courses の `effectiveDenominator` / `overallAllowance` をそのまま合算しているだけ (独自に totalSessions を参照していない)。`:35-59` を読んで totalSessions 参照が無いことを確認 (Read 済み: 無い)。

### `courses.ts` (POST/PATCH) — totalSessions 除去

```ts
// POST /api/courses (:22-31): data から totalSessions: input.totalSessions を削除
// PATCH /api/courses/:courseId (:43-52): data から ...(input.totalSessions !== undefined ? ...) を削除
```

### `userTimetables.ts` / `templates.ts` / `templateCopy.ts` — totalSessions 除去

| ファイル:行 | 変更 |
|---|---|
| `userTimetables.ts:38` (full PATCH の course create) | `totalSessions: course.totalSessions` を削除 |
| `userTimetables.ts:98` (別経路の course create) | 同上削除 |
| `userTimetables.ts:140` (publish-as-template の templateCourse create) | `totalSessions: course.totalSessions` を削除 |
| `templates.ts:92` (template DTO 組み立て) | totalSessions 出力を削除 |
| `templates.ts:149` (templateCourse create) | totalSessions を削除 |
| `templateCopy.ts:57` (course create) | totalSessions を削除 |

### `dto.ts` — courseDto / 型から totalSessions 除去

```ts
// dto.ts:43 courseDto の引数型から totalSessions を除去
// dto.ts:49 戻り値 totalSessions: course.totalSessions を削除
// dto.ts:67 TemplateWithParts/UserTimetableWithParts 相当の courses[] 型から totalSessions 除去
```

### seed — totalSessions 参照除去

seed スクリプト (存在すれば `prisma/seed.ts` 等) で course/templateCourse 作成時に totalSessions を渡している箇所を削除。Developer は `grep -rn totalSessions prisma/` で確認して除去 (本設計時点の grep では `schema.prisma` のみヒット = seed に totalSessions 参照は無い可能性が高いが、Developer が最終確認)。

---

## UI / Web 変更

### CourseEditModal.tsx — 総コマ数 手入力欄を**削除**

```ts
// 削除対象:
// - form state の totalSessions: "15" (:24)
// - useEffect の totalSessions: String(course?.totalSessions ?? 15) (:34)
// - handleSave の const totalSessions = Math.min(...) (:45) と mutate 引数の totalSessions (:51,63)
// - <Field label="総コマ数"> ... </Field> ブロック全体 (:91-93)
```

after の CourseEditModal は name / teacher / color / note の 4 項目のみ。フォーム state からも totalSessions を除く。

> CLAUDE.md「追記でなく置換」: 「総コマ数」Field と関連 state を**完全削除**。コメントアウトや無効化で残さない (ユーザー混乱の元)。

### 他 web コンポーネント

- CourseListItem / CourseDetailModal / AttendanceRateHero / Stats route: totalSessions / generatedOccurrences を読んでいないため**変更不要**。`stats` 型から totalSessions が消えることで型エラーが出る箇所が無いことを Developer が `tsc` で確認 (grep 上は CourseEditModal 以外に web 表示参照は無い)。

### render テスト対象の props 契約変更

> Reviewer は実装を見ずにこの契約でテストを書く (knowledge `gotcha/design-must-specify-component-prop-contract-for-render-tests` 準拠)。

| コンポーネント | props 契約の変更 |
|---|---|
| **CourseEditModal** | props 不変 (`{ open, onClose, timetableId, course?, stackLevel?, onSaved? }`)。**ただし `course` prop の `CourseDto` 型から totalSessions が消える**。描画上「総コマ数」入力欄が**存在しない**ことがテスト根拠 (回帰: 旧テストで totalSessions 欄を触るアサートは削除) |
| **CourseListItem** | props 不変 (`{ stats: CourseStatsDto, requiredRate, onClick }`)。`stats` から totalSessions が消える。表示は totalSessions を使っていないので**描画アサートは不変** (回帰維持)。テスト fixture の `stats` から totalSessions を除く |
| **AttendanceRateHero** | props 不変 (`{ overall, requiredRate, onJumpToCalendar? }`)。totalSessions 非参照。**変更なし** (fixture も overall に totalSessions を含まないので影響なし) |

---

## 挙動仕様 (Reviewer テスト根拠)

「今日」は `computeCourseStats` の `now` 引数で固定 (実時刻依存禁止)。`requiredAttendanceRate` は明示で渡す。occurrence は `now` を基準に過去/今日/未来へ振り分け。休講は TimetableSuspension / CourseSuspension で作る。**totalSessions は fixture から渡せなくなる (schema から消えるため)** — occurrence の件数で母数が決まる。

### (a) denominator の新定義 — computeCourseStats (API ユニット)

1. **★ユーザー例 (必須)**: 水曜2限 × 4日 = occurrence 8 件 (週1で過去 N / 未来 M は問わず合計 8)、休講 0、誰も休んでいない (PRESENT のみ or 一部未記録)、required 70。
   - `denominator = 8 − 0 = 8`
   - 全 8 件 PRESENT (過去 8) なら `effectiveNumerator = 8`、`effectiveDenominator = 8`、`attendanceRate = 1.0`
   - `allowedAbsences = floor((1 − 0.7) × 8 − 0 + 1e-9) = floor(2.4) = 2` ← **「あと2限休める」。旧 totalSessions=15 ベースの `floor(0.3×15)=4` から正される**
2. **休講 0・記録なし**: occurrence 8 件すべて未記録 (過去 8) → `denominator = 8`、`effectiveNumerator = 0`、`attendanceRate = 0/8 = 0.0`、消化欠席 0 (未記録は fixedDen に入らない) → `allowedAbsences = floor(0.3×8 − 0) = floor(2.4) = 2`。未記録があっても allowedAbsences は学期全体楽観値なので 2 のまま。
3. **休講あり (occurrence 8件・うち休講2件)**: 残り 6 件 PRESENT 5 / ABSENT 1、required 70。
   - `denominatorReduction = 2` (休講 2)
   - `denominator = 8 − 2 = 6`
   - `effectiveNumerator = 5` (PRESENT 5)、`effectiveDenominator = 6`、`attendanceRate = 5/6 ≈ 0.833`
   - 消化欠席 = fixedDenAll(6) − fixedNumAll(5) = 1 → `allowedAbsences = floor(0.3×6 − 1 + 1e-9) = floor(1.8 − 1) = floor(0.8) = 0`
4. **SEPARATE_COUNT 記録あり**: occurrence 6 件 = PRESENT 4 / SEPARATE 記録 1 / 未記録 1、休講 0、required 70。
   - SEPARATE は `denominatorReduction += 1` → `denominatorReduction = 1`
   - `denominator = 6 − 1 = 5` (= PRESENT4 + 未記録1、SEPARATE は分母外)
   - `effectiveNumerator = 4`、`effectiveDenominator = 5`、`attendanceRate = 0.8`
   - SEPARATE は consumedAbsence にも入らない → `allowedAbsences = floor(0.3×5 − 0) = floor(1.5) = 1`
5. **REDUCE_DENOMINATOR / CANCELLED 記録**: occurrence 7 件 = PRESENT 6 / EXCUSED(REDUCE) 1、休講 0、required 70 → `denominatorReduction = 1` (REDUCE)、`denominator = 7 − 1 = 6`、`effectiveNumerator = 6`、`attendanceRate = 1.0`、`allowedAbsences = floor(0.3×6 − 0) = 1`。
6. **occurrence 0 件 (時間割未設定)**: `occurrences.length = 0`、`denominatorReduction = 0` → `denominator = 0` → `attendanceRate = null`、`allowedAbsences = null`、`effectiveNumerator = 0`、`effectiveDenominator = 0`、`generatedOccurrences = 0`。0 除算しない。
7. **全休講 (occurrence 全件が休講)**: occurrence 4 件すべて休講 → `denominatorReduction = 4`、`denominator = 4 − 4 = 0` → `attendanceRate = null`、`allowedAbsences = null`。`counts.suspended = 4`。
8. **★等式の確認**: 任意の課目で `denominator === fixedDenAll + floatingPast + floatingFuture` (= 旧 projectedDen) かつ `denominator === occurrences.length − denominatorReduction` が成り立つ。1 ケース (例: 上記 #3 の構成 occurrences.length=8, denominatorReduction=2, fixedDenAll=6, floatingPast/Future 合計 0 → 8−2=6=6) で両式が一致することをアサート。
9. **学期日付変更で occurrence が増減 → 母数が追従 (仕様)**: occurrence 8 件で `denominator = 8`。学期 endDate を延長して occurrence が 10 件に増えた後 (semester-edit の増分再生成経由) に再計算 → `denominator = 10`。occurrence 数が動けば母数が動くのは仕様 (Touri 合意済)。テストは「occurrence を 8 → 10 件に増やして再 compute すると denominator が 8 → 10 になる」を確認 (occurrence を直接 createOccurrence ヘルパで足して compute を呼び直す形でよい)。
10. **今日まで率は不変 (回帰)**: `toDate.effectiveNumerator` / `toDate.effectiveDenominator` / `toDate.attendanceRate` は本変更前後で値が変わらない (今日まで率は元から occurrence ベース)。`counts` も不変。

### (b) overview 集約 — GET /api/semesters/:id/overview

11. 単一 course #1 (occurrence 8・休講0・全PRESENT) → `overall.effectiveDenominator = 8`、`overall.attendanceRate = 1.0`、`overall.allowedAbsences = 2` (科目別と一致)。
12. 複数 course の `overall.effectiveDenominator` = 各 course の occurrence ベース `effectiveDenominator` の合算。`overall.attendanceRate` = 合算分子 / 合算分母。`overall.allowedAbsences` = 合算 allowanceSum から floor (floor 非線形、既存どおり)。
13. `overall.toDate` / `unrecordedCount` / `remainingCount` は不変 (回帰)。

### (c) CRUD / スキーマ — totalSessions 不在

14. `POST /api/courses` に totalSessions を含めて送っても**無視される / 受け付けられない** (CourseCreateInput から除去済)。totalSessions 無しで送って 201 で course 作成成功。
15. `PATCH /api/courses/:id` に totalSessions を含めて送っても無視され、他フィールド (name 等) は更新される。
16. `GET /api/stats` / overview の course レスポンスに `totalSessions` フィールドが**含まれない**。`generatedOccurrences` は含まれる (occurrence 総数)。
17. **回帰**: 既存の course CRUD テスト (作成・更新・削除・所有検証 404) が totalSessions 抜きで通る。template publish / copy が totalSessions 抜きで通る。

### (d) migration — totalSessions 列の不在

18. migration 適用後、Prisma client で `course.totalSessions` / `templateCourse.totalSessions` にアクセスする型が存在しない (`tsc` で型エラーにならないよう全参照が除去済)。
19. 既存 occurrence / attendanceRecord 行が migration で消えない (totalSessions DROP は Course 列の rebuild のみ、FK 先に影響なし)。SQLite test DB は migrate 適用済で立ち上がるため、`setupCompleteUser` 後に course を作って occurrence を生成し、率が occurrence ベースで出ることを確認 (= migration が壊れていない証跡)。

### (e) CourseEditModal (RTL)

20. CourseEditModal を開くと「総コマ数」入力欄 (type=number の Field) が**存在しない**。name / 先生 / 色 / メモ の入力は存在する。
21. `course` prop なしで「保存」→ `useCreateCourse().mutateAsync` が **totalSessions を含まない** body (`{ userTimetableId, name, teacher?, color, note? }`) で呼ばれる。
22. `course` prop ありで「保存」→ `useUpdateCourse().mutateAsync` が totalSessions を含まない body で呼ばれる。
23. 科目名空で保存ボタン disabled (既存挙動、回帰)。

### (f) CourseListItem (RTL)

24. `stats` (totalSessions を含まない CourseStatsDto) で描画して落ちない。出席率・counts・行動指標が従来どおり描画される (totalSessions を表示に使っていないため見た目は不変)。

---

## テスト基盤

- **API**: Vitest + 実 SQLite (`apps/api/vitest.config.ts`)、配置 `apps/api/tests/`。ヘルパ `tests/helpers/auth.ts` (`setupCompleteUser` / `createOccurrence` / `createSemester`) を再利用。`computeCourseStats` は `now` 固定。
  - `tests/stats.test.ts` (**全面見直し要**) — (a) 1-10, (b) 11-13。**★ここが最大の影響範囲**: 既存 stats テストの多くは `setupCompleteUser` / course fixture で `totalSessions: 15` を指定し、`denominator = 15 − reduction` 前提で期待値 (`attendanceRate` / `allowedAbsences` / `effectiveDenominator`) を立てている。母数が occurrence ベースに変わると**これら期待値がすべて変わる**。下記「テスト移行ガイド」参照。
  - `tests/stats-unrecorded.review.test.ts` — 同様に totalSessions 前提なら occurrence ベースへ期待値更新。
  - `tests/courses.test.ts` (更新) — (c) 14-17。totalSessions を渡す/期待するアサートを削除。
  - `tests/users.test.ts` / `tests/user-timetables.test.ts` / `tests/timetable-templates.test.ts` / `tests/semesters.test.ts` (更新) — fixture / レスポンスから totalSessions を除く。
  - `tests/helpers/auth.ts:124` の course 作成 fixture から `totalSessions: 15` を**削除** (schema から消えるため必須)。
- **Web**: Vitest 2 + jsdom + RTL + msw。配置 `apps/web/tests/{components,routes}/`。
  - `tests/components/CourseEditModal.test.tsx` (更新) — (e) 20-23。「総コマ数」欄を触るアサート削除、create/update body から totalSessions を除く期待に更新。
  - `tests/components/CourseListItem.test.tsx` / `CourseListItem.review.test.tsx` (更新) — (f) 24。fixture の `stats` から totalSessions を除く。
  - `tests/msw/handlers.ts:252,270` の course レスポンス stub から `totalSessions` を削除。
  - `tests/routes/Stats.test.tsx` (更新) — レスポンス fixture から totalSessions を除く。
  - `tests/components/MeetingEditModal.test.tsx` — totalSessions を含む timetable fixture があれば除去。
- jsdom の罠 (既知ベースライン、判定除外): `localStorage` 不在 (theme import 系は stub、`Muraki/knowledge/gotcha/jsdom-no-localstorage-in-vitest.md`)、`color-mix`/`calc` 非評価 → style は生文字列 assert。
- **既知ベースライン失敗は判定除外**: api 16 件 (auth/friendship/room 系)、web routes 系 27 件、jsdom localStorage 系。Reviewer はこれらを GREEN 判定の対象外とする。
- E2E (chrome-devtools MCP) は本設計のテスト範囲外。最終の数値確認 (ユーザー例「あと2限」) は実装後に Leader が Chrome で目視確認。

### ★ テスト移行ガイド (Reviewer 向け — stats.test.ts の期待値再生成)

母数が `totalSessions − reduction` から `occurrences.length − reduction` に変わるため、**totalSessions ベースで期待値を立てている全テストが影響する**。Reviewer は以下の手順で期待値を再生成する:

1. **影響を受けるアサートの種類**:
   - `effectiveDenominator` を直接アサートしているもの → 新値 = `その course の occurrence 総数 − denominatorReduction`
   - `attendanceRate` (= numerator / denominator) → 新分母で再計算
   - `allowedAbsences` (= `floor((1−r)×denominator − 消化欠席 + 1e-9)`) → 新分母で再計算
   - `overall.*` の上記合算
   - **影響を受けないアサート (不変)**: `toDate.*` (元から occurrence ベース)、`counts.*`、`effectiveNumerator`、`generatedOccurrences`、`remainingCount`
2. **新期待値の立て方**: 各テストの fixture が生成する occurrence 件数を数える (= `createOccurrence` を何回呼んだか、または学期日付 × 曜日から `occurrenceGen` が何件生成するか)。そこから休講・SEPARATE・REDUCE/CANCELLED の件数 (`denominatorReduction`) を引いた値が新 `denominator`。
   - 例: 旧 fixture `totalSessions: 15` + occurrence 10 件 (休講 0) + 過去 PRESENT 6/ABSENT 1/未記録 3 で `allowedAbsences` を `floor(0.2×15 − 消化)` で立てていたなら、新値は `denominator = 10`、`allowedAbsences = floor(0.2×10 − 消化)` に置き換える。
3. **totalSessions fixture の除去**: `setupCompleteUser` / course 作成ヘルパから `totalSessions: 15` を消す (schema にフィールドが無くなるため、残すと Prisma が型エラー)。occurrence 件数だけが母数を決めるよう fixture を組む。
4. これは**仕様変更による期待値更新であり回帰失敗ではない**。Reviewer は「occurrence 件数ベースで再計算した値」をアサートする。

---

## 不採用案

- **B: totalSessions を母数に残し、occurrence 実数とどちらを使うかユーザーに選ばせる**: Touri 確定方針は「実数に統一」。選択肢を持たせると母数の意味が二重化し「どちらの数字が正か」の混乱が再発する。一本化する。
- **C: totalSessions を残してデフォルト 15 を occurrence 実数に自動同期 (totalSessions を occurrence 数で上書き)**: totalSessions が単なる occurrence 数のキャッシュになり存在意義が消える。キャッシュは整合バグ (occurrence 増減時の更新漏れ) を生むだけ。母数計算で直接 occurrence を数える方が常に正しい。
- **totalSessions を schema に残して deprecated (未使用) にする**: CourseEditModal の手入力欄を消すと設定手段が無くなり、schema にだけ列が残る。「使われないが残る列」は将来の読み手を惑わせ、Uniform Shape (Course/TemplateCourse 同形) も崩れない代わりに無意味な負債になる。物理削除して概念ごと消す。
- **Course のみ削除し TemplateCourse.totalSessions は残す**: `templateCopy.ts` / publish-as-template が Course ↔ TemplateCourse を 1:1 でマッピングするため、片側だけ列があるとコピー処理が「コピー元に無いフィールド」を要求して壊れる。Uniform Shape を保つため両方同時に削除する。
- **denominator に `course.occurrences.length` をそのまま使う (denominatorReduction を引かない)**: 休講・SEPARATE・REDUCE/CANCELLED が分母に残り、休講した授業まで「出席すべき母数」に算入される。これらは元から分母除外する設計 (judge: `denominatorReduction`)。occurrence 総数からこの除外分を引いた値が正しい母数。
- **新フィールド `effectiveOccurrenceCount` を別途追加して denominator と分ける**: `effectiveDenominator` が既にその役割。occurrence ベースに中身を変えるだけで足り、新フィールドは DTO を太らせるだけ。`generatedOccurrences` (総数) と `effectiveDenominator` (除外後) の 2 つで意味は十分に分かれている。
- **migration でデータ移行 (totalSessions を別テーブルへ退避)**: 退避先で使う予定が無い (occurrence 実数が新しい唯一の母数)。退避は無意味なデータ負債。単純 DROP する。
