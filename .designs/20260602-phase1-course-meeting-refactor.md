# Phase 1: 科目(Course)と授業(Meeting)の責務分離 + 共通編集モーダル + 新登録フロー

## 目的

「科目 = 何を学ぶか (名前/先生/総コマ数/色/メモ)」「授業 = いつどこでやるか (曜日/時限/教室)」という責務に分け、教室 (room) を Course から Meeting へ移す。あわせて科目編集・授業登録を共通モーダル 2 種 (CourseEditModal / MeetingEditModal) に集約し、空セルタップ起点の新登録フローを科目選択式へ刷新する。

---

## 現状把握 (Read 済み事実)

実装に入る前に、設計の前提となる「現状こうなっている」を確定させる。Researcher findings と実装が食い違う点があるため明記する。

1. **room は Course 側**: `Course.room` / `TemplateCourse.room` に存在 (schema L226, L292)。Meeting に room はない。
2. **★ `MeetingOccurrence` は room も courseName も持たない**: schema L336-352 を確認。occurrence は `meetingId` / `courseId` / `date` / `periodOffset` / `startMinute` / `endMinute` のみ。**denormalize された room/courseName は存在しない**。Researcher の「occurrence が room/courseName を denormalize 保持」という前提は誤り。
   - `GET /api/today` (today.ts L37-40) は **実行時 join** で `occurrence.course.room` / `occurrence.course.name` を返している。occurrence 自体に room が焼き込まれていない。
   - **帰結**: room を Course→Meeting に移しても、occurrence テーブルの再生成は room の都合では不要。today route の join 元を `occurrence.course.room` → `occurrence.meeting.room` に変えるだけで済む。
3. **科目編集モーダルは既に存在**: `apps/web/src/components/semester/CourseDetailModal.tsx` が `FullScreenModal` ベースで科目編集 (name/teacher/room/color/totalSessions/note) を実装済み。学期タブの「科目一覧」(`SemesterOverview.tsx` L36-46) から `CourseListItem` クリックで開く。room を Meeting に移すとここから room 項目を除去する。
4. **授業登録は BottomSheet ベース**: `MeetingCreateSheet.tsx` が「新規科目インライン作成 (name/teacher/room) + 既存科目選択 (Select) + 曜日 Select + 時限 PeriodChips」を 1 シートで処理。`MeetingDetailSheet.tsx` が詳細表示 + 編集 (科目情報 + 時限 + 曜日を一括編集)。
5. **共通 Sheet 基底**: `apps/web/src/components/sheet/BottomSheet.tsx` (Radix Dialog ベース、`open`/`onClose`/`title`/`children`/`footer` props、z-index 1100/1110 固定、3 経路 close は Radix 自動)。**stackLevel prop はまだ無い** (ネスト時の z-index 制御が未対応)。
6. **編集系の唯一の永続化経路は full PATCH**: `PATCH /api/user-timetables/:id` (userTimetables.ts L78-108) が courses/meetings を **全削除 → 全再作成** し、その後 `generateOccurrencesForUserTimetable` で occurrence を再生成する。`CourseDetailModal` / `MeetingDetailSheet` / `DangerZone` (科目削除) は全てこの full PATCH を呼ぶ。`POST /api/courses` (単発作成) と `POST /api/meetings/bulk` (新規授業作成) のみ個別エンドポイント。**科目/授業の個別 PATCH/DELETE は存在しない**。
7. **PATCH の meeting→course 紐付け**: `meeting.courseId` (既存 id) または `meeting.courseTempId` (新規科目の仮 id) を courseMap で解決 (userTimetables.ts L98-101)。
8. **時間割描画の subtitle 供給元 (room 表示)**: 以下 4 箇所が `course.room` を参照しており、room 移動で **course→meeting 経由参照に変える必要がある**:
   - `SelfTimetableView.tsx` L106: `subtitle: course?.room`
   - `MeetingBlock.tsx` L11: `subtitle={course.room ?? course.teacher}`
   - `DayMeetingCard.tsx` L22: `[course.room, course.teacher]`
   - `MeetingDetailSheet.tsx` L172: 詳細の「教室」Row、L37/48/75/129 のフォーム
9. **shared 型の共有構造**: `CourseDto`/`MeetingDto` は `template.ts` 定義 → `UserTimetableDto` / `TemplateDto` 双方が import (`userTimetable.ts` L2)。`TemplateCreateInput.courses[].room` / `UserTimetablePatchInput.courses[].room` も存在。**room を Course から外すと Template 側にも波及する**。
10. **テスト基盤**: API は Vitest + 実 SQLite test DB (`apps/api/tests/helpers/app.ts`、`setupCompleteUser` が user/timetable/course を作る)。Web は Vitest + RTL + jsdom (`apps/web/tests/`)。

---

## スコープ判断

### Template 側 room の扱い

room を `Course` から外すと Uniform Shape (TemplateCourse と Course が同形) が崩れる。**Phase 1 では Template 側も room を Course→Meeting に移し、Uniform Shape を維持する**。理由:

- `templateCopy.ts` / userTimetables.ts L132-144 (publish-as-template) が Course↔TemplateCourse / Meeting↔TemplateMeeting を 1:1 マッピングしてコピーしている。片側だけ room を移すとコピー処理が壊れる。
- Uniform Shape は schema コメント (L201-204) が明示する設計原則。崩さない。

→ **`TemplateCourse.room` 削除 + `TemplateMeeting.room` 追加** も本 migration に含める。

### 教室入力の単位

room は **Meeting 単位** (曜日×時限の組ごと) に持たせる。同じ科目が「月1限=A教室、水3限=B教室」のように教室違いで開講されるケースに対応できる。`MeetingEditModal` の時限を複数選択 → 連続コマは 1 Meeting にまとまる (`periodsToMeetings`) ため、room は「その登録操作で作られる Meeting 群すべてに同じ値」を入れる (1 シート 1 room)。

---

## データモデル変更

### Prisma schema (`apps/api/prisma/schema.prisma`)

```prisma
model Course {
  // room String?  ← 削除
  // 残り (name, teacher, color, totalSessions, note) は不変
}

model Meeting {
  // ... 既存フィールド
  room String?   // 追加。教室。null 可、最大 30 文字 (DB は文字数制約を持てないので app/Zod 側で max(30))
}

model TemplateCourse {
  // room String?  ← 削除
}

model TemplateMeeting {
  // ... 既存
  room String?   // 追加
}
```

`MeetingOccurrence` は **変更なし** (room を持っていないため。現状把握 §2)。

### Migration ファイル方針

`apps/api/prisma/migrations/` に新規ディレクトリ `20260602xxxxxx_phase1_room_to_meeting/` を作る (既存命名 `<timestamp>_<slug>` に従う)。**`prisma migrate dev --name phase1_room_to_meeting` で自動生成させると Course.room を DROP するだけのデータ破壊 migration になる**ため、生成後に SQL を手編集してデータ移行を埋め込む。SQLite は ALTER COLUMN を持たないため Prisma は table rebuild (`_new` テーブル + copy + rename) を生成する。その rebuild の前後にデータコピー UPDATE を挿入する。

migration SQL の論理順序 (SQLite 向け):

```sql
-- 1. Meeting / TemplateMeeting に room カラム追加 (nullable なので単純 ADD COLUMN)
ALTER TABLE "Meeting" ADD COLUMN "room" TEXT;
ALTER TABLE "TemplateMeeting" ADD COLUMN "room" TEXT;

-- 2. ★ データ移行: 各 Course.room を、その Course に紐づく全 Meeting.room へコピー
UPDATE "Meeting"
SET "room" = (SELECT "Course"."room" FROM "Course" WHERE "Course"."id" = "Meeting"."courseId")
WHERE "room" IS NULL;

UPDATE "TemplateMeeting"
SET "room" = (SELECT "TemplateCourse"."room" FROM "TemplateCourse" WHERE "TemplateCourse"."id" = "TemplateMeeting"."courseId")
WHERE "room" IS NULL;

-- 3. Course / TemplateCourse から room を DROP
--    (Prisma 生成の table-rebuild ブロックをそのまま使う。rebuild 時 room を SELECT 句から除外)
```

**不変条件 (migration 後に成り立つべきこと)**:

- 移行前に `Course.room = X` だった Course に紐づく全 Meeting は、移行後 `Meeting.room = X` を持つ (room が既存だった授業の教室情報がロスしない)。
- `Course.room` が null だった Course の Meeting は `Meeting.room = null` のまま。
- `Course` テーブルに room カラムが存在しない。
- Meeting が 0 件の Course の room は捨てられる (どの Meeting にもコピー先がないため。許容: 授業が無い科目に教室情報は意味を持たない)。

### occurrence 再生成の要否

room の都合では **再生成不要** (occurrence は room を保持しない)。本 migration では occurrence に触れない。今後 occurrence に room を denormalize したくなった場合は別 Phase で扱う (本設計では現状の runtime join 方式を維持)。

---

## shared schema 変更 (`packages/shared/src/schemas/`)

### `template.ts`

```ts
export const CourseDto = z.object({
  id: z.string(),
  name: z.string().max(100),
  teacher: z.string().max(50).nullable(),
  // room: 削除
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  totalSessions: z.number().int().min(1).max(60),
  note: z.string().max(500).nullable(),
});

export const MeetingDto = z.object({
  id: z.string(),
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startPeriodIndex: z.number().int().min(1).max(20),
  periodCount: z.number().int().min(1).max(8).default(1),
  room: z.string().max(30).nullable(),   // 追加
});

// TemplateCreateInput.courses[] から room を削除
// TemplateCreateInput.meetings[] に room: z.string().max(30).optional() を追加
```

### `course.ts`

```ts
export const CourseCreateInput = z.object({
  userTimetableId: z.string(),
  name: z.string().min(1).max(100),
  teacher: z.string().max(50).optional(),
  // room: 削除
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  totalSessions: z.number().int().min(1).max(60).default(15),
  note: z.string().max(500).optional(),
});

// 追加 (科目個別更新用)
export const CourseUpdateInput = z.object({
  name: z.string().min(1).max(100).optional(),
  teacher: z.string().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  totalSessions: z.number().int().min(1).max(60).optional(),
  note: z.string().max(500).nullable().optional(),
});
export type CourseUpdateInput = z.infer<typeof CourseUpdateInput>;
```

### `meeting.ts`

```ts
export const MeetingBulkCreateInput = z.object({
  userTimetableId: z.string(),
  courseId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startPeriodIndexes: z.array(z.number().int().min(1).max(12)).min(1).max(12),
  room: z.string().max(30).optional(),   // 追加 (bulk で作る全 Meeting に同じ room)
});

// 追加 (授業個別更新用)
export const MeetingUpdateInput = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startPeriodIndex: z.number().int().min(1).max(20).optional(),
  periodCount: z.number().int().min(1).max(8).optional(),
  room: z.string().max(30).nullable().optional(),
});
export type MeetingUpdateInput = z.infer<typeof MeetingUpdateInput>;
```

### `userTimetable.ts`

`UserTimetablePatchInput`:
- `courses[]` から `room` を削除
- `meetings[]` に `room: z.string().max(30).optional()` を追加

### 型変更の波及一覧 (Developer が直す箇所)

| ファイル | 変更 |
|---|---|
| `apps/api/src/lib/dto.ts` | `courseDto` から room 除去 / `meetingDto` に room 追加 / `TemplateWithParts` `UserTimetableWithParts` の型から room 移動 |
| `apps/api/src/routes/userTimetables.ts` | full PATCH (L94/101) と publish-as-template (L136/141) で room を course→meeting create に移す |
| `apps/api/src/routes/courses.ts` | `POST /api/courses` の data から room 除去。`PATCH`/`DELETE /api/courses/:id` 追加 (後述) |
| `apps/api/src/routes/today.ts` | L39 `occurrence.course.room` → `occurrence.meeting.room`。include に meeting は既にある |
| `apps/api/src/services/meeting.service.ts` | `createMeetingsBulk` で meeting create に room を渡す |
| `apps/api/src/services/templateCopy.ts` | room を course→meeting コピーに移す (要 Read 確認) |
| `apps/web/src/components/timetable/MeetingBlock.tsx` | `subtitle` を meeting.room 起点に |
| `apps/web/src/components/timetable/DayMeetingCard.tsx` | `course.room` → meeting.room |
| `apps/web/src/components/home/SelfTimetableView.tsx` | L106 subtitle を `m.room` に |
| `apps/web/src/components/semester/CourseDetailModal.tsx` | CourseEditModal へ置換 (後述)。room 項目除去 |
| `apps/web/src/components/timetable/MeetingDetailSheet.tsx` | MeetingEditModal へ置換 (後述) |
| `apps/web/src/components/timetable/MeetingCreateSheet.tsx` | MeetingEditModal へ置換 (削除) |
| `apps/web/src/components/semester/DangerZone.tsx` | room 参照除去 (L23) |
| `apps/web/src/api/hooks/types.ts` | DTO 型変更の追従 (自動) |

---

## API 変更

### 1. `POST /api/meetings/bulk` — room 受け入れ

`MeetingBulkCreateInput.room` を `createMeetingsBulk` が受け、`periodsToMeetings` で生成する全 Meeting に同じ room を焼く。

```ts
// meeting.service.ts createMeetingsBulk 内
const meeting = await tx.meeting.create({
  data: {
    userTimetableId: input.userTimetableId,
    courseId: input.courseId,
    dayOfWeek: input.dayOfWeek,
    startPeriodIndex: group.startPeriodIndex,
    periodCount: group.periodCount,
    room: input.room ?? null,   // 追加
  },
});
```

### 2. 科目個別エンドポイント — 新設する

理由: CourseEditModal は「科目情報だけ」を編集する。full PATCH (全削除→全再作成) を科目編集のたびに走らせると、毎回 occurrence 全再生成が発火し (出席記録は occurrence に FK cascade)、無関係な授業の occurrence まで作り直されて高コスト & 危険。**科目フィールド更新は occurrence に影響しない** (occurrence は course の name/teacher を焼いていない、runtime join) ので、軽量な個別 PATCH で済む。

```
PATCH  /api/courses/:courseId   body: CourseUpdateInput   → { course: CourseDto }
DELETE /api/courses/:courseId                              → { ok: true }
```

- `PATCH`: 所有検証 (course の userTimetable.userId === user.id) → `prisma.course.update`。**occurrence 再生成は呼ばない** (course フィールドは occurrence に焼かれていない)。
- `DELETE`: 所有検証 → `prisma.course.delete`。schema の `onDelete: Cascade` で Meeting → MeetingOccurrence → AttendanceRecord / CourseSuspension が連鎖削除される。occurrence 再生成不要。
- `POST /api/courses` (既存) は room を data から外すのみ。CourseEditModal の「新規作成」はこれを叩く。

### 3. 授業個別エンドポイント — 新設する

理由: MeetingEditModal の「既存授業の編集」で曜日/時限/教室を変える。full PATCH だと全授業を作り直すが、1 授業の編集なら個別が安全。ただし**時限変更は occurrence 再生成が必要** (occurrence は meeting の date/periodOffset に依存)。

```
PATCH  /api/meetings/:meetingId   body: MeetingUpdateInput   → { meeting: MeetingDto }
DELETE /api/meetings/:meetingId                               → { ok: true }
```

- `PATCH`: 所有検証 → 変更内容を判定:
  - **room のみ変更** (dayOfWeek/startPeriodIndex/periodCount 不変): `prisma.meeting.update` のみ。**occurrence 再生成しない** (occurrence は room を持たない)。
  - **曜日/時限変更を含む**: トランザクション内で該当 meeting の occurrence を `deleteMany` → `meeting.update` → `generateOccurrencesForMeeting` で再生成。`PERIOD_CONFLICT` 検査 (同 timetable・同 dayOfWeek の他 meeting と時限が重なる場合 409、bulk と同じロジック)。
    - ★ occurrence 削除で **その授業の既存出席記録 (AttendanceRecord) は失われる**。時限/曜日が変わった授業は別物として扱う方針 (既存 MeetingDetailSheet の full PATCH も同等に occurrence 全削除しているため挙動後退ではない)。
- `DELETE`: 所有検証 → `prisma.meeting.delete` (cascade で occurrence/attendance 削除)。

### 4. occurrence 再生成の発火点 (まとめ)

| 操作 | エンドポイント | occurrence 再生成 |
|---|---|---|
| 科目作成 | `POST /api/courses` | なし (授業がまだ無い) |
| 科目フィールド編集 | `PATCH /api/courses/:id` | **なし** |
| 科目削除 | `DELETE /api/courses/:id` | なし (cascade 削除のみ) |
| 授業作成 | `POST /api/meetings/bulk` | あり (作成分のみ) |
| 授業の room だけ編集 | `PATCH /api/meetings/:id` | **なし** |
| 授業の曜日/時限編集 | `PATCH /api/meetings/:id` | あり (該当 meeting 分を削除→再生成) |
| 授業削除 | `DELETE /api/meetings/:id` | なし (cascade 削除のみ) |
| 時間割一括編集 (設定シート) | `PATCH /api/user-timetables/:id` | あり (全 meeting) |

full PATCH は時間割設定シート (daySlots 含む全体編集) 用に残す。CourseEditModal / MeetingEditModal は個別エンドポイントを叩く。

---

## UI/UX

### コンポーネント構成

```
Sheet 基底 (BottomSheet.tsx) ← stackLevel prop を追加 (ネスト対応、後述)
├── CourseEditModal           [新規] 科目の新規作成 / 既存編集
└── MeetingEditModal          [新規] 授業の新規登録 / 既存編集
        └── (内部から) CourseEditModal を stackLevel=2 で開いて新規科目作成

削除されるもの:
- MeetingCreateSheet.tsx      → MeetingEditModal (mode="create") に統合
- MeetingDetailSheet.tsx      → MeetingDetailSheet は「詳細表示」専用に縮小 or MeetingEditModal へ統合 (下記判断)
- CourseDetailModal の CourseEditSection → CourseEditModal を using
```

**MeetingDetailSheet の扱い**: 現状は「詳細表示 + 編集」を 1 シートで兼ねる。Phase 1 では:
- **詳細表示 (タイル大表示・教室/先生/メモ・削除ボタン)** は `MeetingDetailSheet` に残す (読み取り専用ビューとして価値がある)。
- 「編集」ボタン → `MeetingEditModal` (mode="edit") を開く (詳細シートを閉じ、編集モーダルに遷移)。
- 詳細内の「削除」は `DELETE /api/meetings/:id` を叩く。

### BottomSheet 基底の拡張 (ネスト対応)

現 `BottomSheet` は z-index 1100/1110 固定。CourseEditModal を MeetingEditModal の上に重ねるため `stackLevel?: 1 | 2` prop を追加する (knowledge `modal-sheet-base-component-3way-close` 準拠)。

```ts
export function BottomSheet({
  open, onClose, title, children, footer,
  stackLevel = 1,   // 追加
}: {
  open: boolean; onClose: () => void; title?: string;
  children: ReactNode; footer?: ReactNode;
  stackLevel?: 1 | 2;
}) { /* z-index: stackLevel===2 ? overlay 1120 / content 1130 : 1100 / 1110 */ }
```

overlay/content の `z-[1100]`/`z-[1110]` を stackLevel から算出する値に置換。Radix の focus trap はネストでも各 Dialog が独立して機能する (上に開いた Dialog が focus を奪い、閉じると下に戻る)。

---

### CourseEditModal

**Props**:

```ts
type CourseEditModalProps = {
  open: boolean;
  onClose: () => void;
  timetableId: string;              // 新規作成時の所属 timetable
  course?: CourseDto | null;        // null/undefined = 新規作成, あり = 編集
  stackLevel?: 1 | 2;               // ネスト時 2
  onSaved?: (course: CourseDto) => void;   // 保存成功時に作成/更新後の Course を返す (新規→自動選択用)
};
```

**項目** (room なし):

| 項目 | 入力 | バリデーション |
|---|---|---|
| 科目名 | Input | 必須、1-100 文字。空 trim で保存不可 |
| 先生 | Input | 任意、最大 50 |
| 総コマ数 | Input type=number | 1-60、既定 15 |
| 色 | 色チップ列 (既定 5 色 + `input type=color`) | `#RRGGBB`。既定 `colors[0]` |
| メモ | Textarea | 任意、最大 500 |

**状態遷移**:

- mode 判定: `course` prop の有無。
- 新規: `POST /api/courses` (`useCreateCourse`)。成功 → `onSaved(created.course)` → `onClose`。
- 編集: `PATCH /api/courses/:id` (新規 hook `useUpdateCourse`)。成功 → `onSaved(updated)` → `onClose`。
- 保存ボタンは 科目名空 or pending で disable。

**色選択 UI**: `MeetingDetailSheet` 既存実装 (色チップ 5 個 + 選択 ring) を踏襲。`CourseDetailModal` の `input type=color` も併用可 (チップ + カスタムカラー)。チップ 5 色 = `["#10b981","#60a5fa","#f472b6","#8b5cf6","#f59e0b"]`。

---

### MeetingEditModal

**Props**:

```ts
type MeetingEditModalProps = {
  open: boolean;
  onClose: () => void;
  timetable: UserTimetableDto;       // 科目選択肢・daySlots・既存 meeting (衝突検査) のソース
  mode: "create" | "edit";
  // create 時:
  initialDayOfWeek?: number;         // 空セルタップで確定して渡る曜日
  initialPeriod?: number;            // 空セルの時限
  // edit 時:
  meeting?: MeetingDto | null;       // 編集対象
};
```

**レイアウト (mobile bottom sheet)**:

```
┌──────────────────────────────┐
│ 授業を追加 / 授業を編集     × │  ← title
├──────────────────────────────┤
│ 科目                          │
│ [ ▼ 数学               ]     │  ← Select (既存科目) + 末尾に「＋ 科目を追加」
│                               │
│ 曜日:  月曜日 (固定表示)      │  ← create 時は呼び出し元確定。表示のみ or Select
│                               │
│ 時限 (複数選択で連続コマ)     │
│ [1][2][3][4][5]               │  ← PeriodChips
│ プレビュー: 1-2限             │  ← PeriodChipsPreview
│                               │
│ 教室                          │
│ [ A301              ]        │  ← Input (任意、最大30)
├──────────────────────────────┤
│        [キャンセル] [保存]   │  ← footer
└──────────────────────────────┘
```

**科目ドロップダウン (自由入力廃止)**:

- `timetable.courses` を `<option>` で列挙。先頭/末尾に **「＋ 科目を追加」** option (`value="__add_course__"`)。
- ユーザーが「＋ 科目を追加」を選ぶ → `CourseEditModal` を `stackLevel=2` で開く (MeetingEditModal は開いたまま背後に残る)。
- CourseEditModal で保存 → `onSaved(newCourse)` で MeetingEditModal に新 Course が返る → **Select の値を newCourse.id に自動セット** → CourseEditModal を閉じる → MeetingEditModal の科目欄に新科目が選択済みで表示。
- ★ 旧 `MeetingCreateSheet` の「新規作成 (インライン name/teacher 入力)」方式は**廃止**。科目情報は必ず CourseEditModal 経由。

**曜日**:

- `mode="create"`: 呼び出し元 (空セルタップ) が `initialDayOfWeek` を確定して渡す。モーダル内は**曜日固定表示** (ラベル「月曜日」)。
- `mode="edit"`: `meeting.dayOfWeek` を初期値に、変更可 (Select)。

**時限**: `PeriodChips` (複数選択)。連続選択は `periodsToMeetings` で 1 Meeting に、飛び選択は複数 Meeting に分割 (既存挙動)。`periodCount = timetable.daySlots.length`。

**教室**: Input、任意、最大 30 文字。`mode="edit"` 時は `meeting.room` を初期値に。

**バリデーション**:
- 科目未選択 (`__add_course__` のまま or 空) → 保存不可。
- 時限 0 個 → 保存不可。
- 教室は任意 (空可)。

**保存処理**:

- `mode="create"`: `POST /api/meetings/bulk` に `{ userTimetableId, courseId, dayOfWeek, startPeriodIndexes, room }`。`PERIOD_CONFLICT` (409) を受けたらエラー表示 (衝突時限を文言に)。成功 → onClose。
- `mode="edit"`: `PATCH /api/meetings/:id` に `{ dayOfWeek, startPeriodIndex, periodCount, room }`。
  - ★ 編集 UI で「時限を 3 個選択 → 1個に減らす」など periodCount/start が変わるケースは PATCH 1 本で表現できる範囲 (連続 1 グループ)。**飛び選択で複数 Meeting に分割される編集は edit モードでは許可しない** (1 Meeting = 1 連続コマの編集に限定)。飛び選択したい場合は一旦削除して create し直す導線。UI 上、edit モードでは PeriodChips の選択を「連続範囲のみ」に制約 (非連続を選ぼうとしたら直前の連続範囲をリセット)。

---

### 新登録フロー (空セルタップ起点)

```
時間割の空セル [+] タップ (SelfTimetableView.handleEmptyCellClick)
   ↓ ensureTimetable() で timetable 確保
MeetingEditModal を mode="create", initialDayOfWeek/initialPeriod 付きで open
   ↓
科目を Select で選ぶ ──────────────┐
   or                               │
「＋ 科目を追加」を選ぶ              │
   ↓ CourseEditModal (stackLevel=2) │
   科目名/先生/総コマ/色/メモ 入力  │
   保存 → onSaved(newCourse)        │
   ↓ MeetingEditModal の Select を  │
     newCourse.id に自動セット ──────┘
   ↓
時限を PeriodChips で調整
   ↓
教室を入力 (任意)
   ↓
[保存] → POST /api/meetings/bulk → onClose → 時間割再描画
```

`SelfTimetableView` の `MeetingCreateSheet` を `MeetingEditModal mode="create"` に差し替える。`sheet` state (`{dayOfWeek, period}`) はそのまま流用。

---

## 挙動仕様 (Reviewer テスト根拠)

### データ移行 (migration、API テスト)

1. **room コピー**: Course(room="A301") に Meeting が 2 件紐づくとき、migration 後その 2 Meeting は room="A301" を持つ。
2. **null 保持**: Course(room=null) の Meeting は migration 後 room=null。
3. **Course から room 消失**: migration 後 `Course` に room カラムを SELECT しようとすると存在しない (Prisma client が room を返さない)。
4. **Template も同様**: TemplateCourse(room=X) → 紐づく TemplateMeeting.room=X、TemplateCourse から room 消失。
5. **授業なし科目**: Meeting が 0 件の Course(room="X") は migration 後どこにも room が残らない (許容)。
6. **occurrence 不変**: migration 前後で MeetingOccurrence の行数・内容が変わらない。

### API: room の経路

7. `POST /api/meetings/bulk` に room="B202" を渡すと、生成された全 Meeting が room="B202" を持つ。
8. `POST /api/meetings/bulk` で room 省略時、Meeting.room=null。
9. `GET /api/today` の occurrence レスポンスの room が `occurrence.meeting.room` 由来 (course.room ではなく)。Meeting.room を変えると today の room が追従する。
10. `POST /api/courses` に room を含めても無視される/型エラー (room は CourseCreateInput から除去済み)。

### API: 科目個別エンドポイント

11. `PATCH /api/courses/:id` で name を変えると Course.name が更新され、**MeetingOccurrence は再生成されない** (occurrence 行の id が変わらない、出席記録が保持される)。
12. `PATCH /api/courses/:id` を他人の course に対して呼ぶと 404 (所有検証)。
13. `DELETE /api/courses/:id` で course と紐づく Meeting / MeetingOccurrence / AttendanceRecord / CourseSuspension が cascade 削除される。
14. 認証なし → 401、setup 未完了 → 403 (既存 sessionMiddleware/setupGuard 準拠)。

### API: 授業個別エンドポイント

15. `PATCH /api/meetings/:id` で room のみ変更 → Meeting.room 更新、**occurrence の id・行数が不変** (再生成されない)。
16. `PATCH /api/meetings/:id` で dayOfWeek 変更 → 該当 meeting の occurrence が削除され、新しい曜日で再生成される (occurrence の date が新曜日に変わる)。
17. `PATCH /api/meetings/:id` で時限を既存の他授業と重なる位置に変更 → 409 PERIOD_CONFLICT、Meeting は変更されない。
18. `DELETE /api/meetings/:id` で meeting と occurrence/attendance が cascade 削除、同 course の他 meeting は残る。

### UI: CourseEditModal (RTL)

19. `course` prop なしで開くと「科目を追加」相当のタイトル、保存で `POST /api/courses` が呼ばれる。
20. `course` prop ありで開くと既存値がフォームに入り、保存で `PATCH /api/courses/:id` が呼ばれる。
21. 科目名が空のとき保存ボタンが disabled。
22. 保存成功時 `onSaved` が作成/更新後の course で呼ばれる。
23. room 入力欄が**存在しない**。

### UI: MeetingEditModal (RTL)

24. mode="create" で開くと科目 Select に `timetable.courses` が並び、「＋ 科目を追加」option がある。
25. 「＋ 科目を追加」を選ぶと CourseEditModal が開く (stackLevel=2)。
26. CourseEditModal で科目を保存して onSaved が返ると、MeetingEditModal の科目 Select が新 course の id に自動選択され、CourseEditModal が閉じる。
27. mode="create" 時、曜日は `initialDayOfWeek` で固定表示され Select で変更できない。
28. 時限未選択 or 科目未選択のとき保存 disabled。
29. mode="create" の保存で `POST /api/meetings/bulk` が `{courseId, dayOfWeek, startPeriodIndexes, room}` で呼ばれる。
30. mode="edit" で開くと meeting.room / 時限 / 曜日が初期値に入る。
31. mode="edit" の保存で `PATCH /api/meetings/:id` が呼ばれる。
32. mode="edit" で PeriodChips が連続範囲のみ選択可 (非連続を選ぶと範囲がリセットされる)。
33. room 入力欄が MeetingEditModal に存在する。

### UI: 時間割描画 / 新フロー (RTL)

34. 空セルの [+] タップで MeetingEditModal が mode="create" で開き、その曜日・時限が初期値。
35. 時間割タイルの subtitle が meeting.room を表示する (course.room 参照を残さない)。
36. MeetingDetailSheet の「編集」ボタンで MeetingEditModal (mode="edit") が開く。
37. MeetingDetailSheet の「削除」で `DELETE /api/meetings/:id` が呼ばれる。

### UI: BottomSheet stackLevel (RTL)

38. stackLevel=2 の BottomSheet は stackLevel=1 より高い z-index を持つ (overlay/content とも)。
39. ネストした 2 枚を開いた状態で、上の Sheet を閉じると下の Sheet が残る。

---

## 科目の管理導線 (設計判断)

**結論: 既存の学期タブ「科目一覧」(`SemesterOverview` → `CourseDetailModal`) を主導線として維持し、CourseEditModal を再利用する。**

- `SemesterOverview.tsx` の「科目一覧」(L36-46) は既に全科目を一覧し、`CourseListItem` クリックで `CourseDetailModal` を開く。これが科目管理の自然な置き場。
- `CourseDetailModal` 内の `CourseEditSection` (インライン編集フォーム) を **CourseEditModal を using する形に置換** (または CourseEditModal をそのまま埋め込む)。room 項目を除去。
- 削除は既存 `DangerZone` を維持 (full PATCH → `DELETE /api/courses/:id` に切替推奨だが、Phase 1 では DangerZone を `DELETE /api/courses/:id` を叩くよう変更し occurrence 全再生成を避ける)。
- 時間割設定シート (`TimetableSettingsSheet`) には科目管理を新設しない (daySlots など時間割構造の編集に専念、責務分離)。

理由: 新しい管理画面を増やすと導線が散らかる。既に「学期 = 出席率 + 科目一覧」という文脈で科目を見せている場所があるので、そこに集約するのが最小変更かつ自然 (knowledge `home-aggregated-context-switcher` の集約思想に沿う)。

---

## テスト基盤

### API (Vitest + 実 SQLite test DB)

- 配置: `apps/api/tests/`
- ヘルパ: `tests/helpers/app.ts` (`app`, `prisma`)、`tests/helpers/auth.ts` (`setupCompleteUser` など)、`tests/helpers/http.ts` (`requestJson`, `json`, `expectError`)。
- 既存パターン: `meeting.bulk.test.ts` / `user-timetables.test.ts` / `occurrence-gen.test.ts` を踏襲。
- 新規/更新テストファイル:
  - `tests/meeting.bulk.test.ts` — room 受け入れ (仕様 7,8) を追加
  - `tests/courses.test.ts` — [新規] PATCH/DELETE courses (仕様 11-14)
  - `tests/meetings.test.ts` — [新規] PATCH/DELETE meetings (仕様 15-18)
  - `tests/today.test.ts` — room 供給元変更 (仕様 9)
  - `tests/migration-room.test.ts` または既存 migration 検証相当 — データ移行不変条件 (仕様 1-6)。SQLite test DB は `prisma migrate` 適用済みで立ち上がるため、移行ロジック検証は「migration 適用後の DB で room が Meeting 側にあること」を schema レベルで確認 + 移行 SQL を関数化して単体テスト。
    - ★ 移行 SQL は service 関数 (`migrateCourseRoomToMeeting(tx)`) として切り出し、テストから旧形データを seed → 関数実行 → 不変条件 assert できる形にすることを推奨 (raw migration SQL の直接テストは困難なため)。

### Web (Vitest + RTL + jsdom)

- 配置: `apps/web/tests/components/`
- 既存パターン: `TimetableView.test.tsx` / `EventTile.test.tsx`。`render` + `screen` + `fireEvent`、mutation hook は MSW or mock。
- 新規テストファイル:
  - `tests/components/CourseEditModal.test.tsx` (仕様 19-23)
  - `tests/components/MeetingEditModal.test.tsx` (仕様 24-33)
  - `tests/components/BottomSheet.test.tsx` — stackLevel z-index + ネスト (仕様 38,39)。3 経路 close は基底で 1 セット (knowledge 準拠)。
  - `tests/components/SelfTimetableView.test.tsx` または既存 Home テスト — 空セル→MeetingEditModal、subtitle=meeting.room (仕様 34,35)
- API hook 呼び出しの assert は、`useCreateCourse`/`useUpdateCourse`/`useCreateMeetingsBulk`/`useUpdateMeeting` を mock し、正しい body で呼ばれたかを検証 (既存 mock パターンに従う)。

---

## 新規追加する Web hooks (`apps/web/src/api/hooks/useUserTimetable.ts`)

```ts
useUpdateCourse(courseId)   → PATCH /api/courses/:id    invalidate: userTimetables, today, semesters
useDeleteCourse()           → DELETE /api/courses/:id   invalidate: userTimetables, today, stats, semesters
useUpdateMeeting(meetingId) → PATCH /api/meetings/:id   invalidate: userTimetables, today, stats, semesters
useDeleteMeeting()          → DELETE /api/meetings/:id  invalidate: userTimetables, today, stats, semesters
```

invalidation は既存 `useCreateMeetingsBulk` のキー集合に倣う。

---

## 不採用案

- **room を Meeting でなく MeetingOccurrence に持たせる**: 却下。occurrence は日付展開された大量行で、教室は授業 (曜日×時限) 単位で十分。occurrence に持たせると登録のたびに全 occurrence に書き込みが必要で、現状 occurrence が room を持たない設計とも整合しない。Meeting 単位が最小で正しい粒度。
- **CourseEditModal / MeetingEditModal を 1 つの巨大モーダルに統合 (タブ切替)**: 却下。責務分離の要件に反する。科目と授業は別概念で、別タイミング・別導線 (学期タブ vs 時間割セル) から開かれる。共通化は Sheet 基底レベルで足り、モーダル自体は分ける。
- **科目編集も full PATCH (`PATCH /api/user-timetables/:id`) で賄う**: 却下。全 meeting 削除→再作成→occurrence 全再生成が走り、無関係な授業の出席記録に影響するリスクと無駄なコスト。科目フィールドは occurrence に焼かれていないので個別 PATCH が安全かつ軽量。
- **MeetingEditModal の科目を自由入力 (datalist) のまま残す**: 却下。要望で「選択式ドロップダウン (自由入力廃止)」が確定。自由入力は同名科目の重複作成を招き、責務分離 (科目は一意のマスタ) を崩す。
- **room コピーを app 起動時のバックフィルで行う (migration に含めない)**: 却下。migration に入れないと「Course.room を DROP した瞬間にデータ消失」する。データ移行は migration トランザクション内で完結させる (DROP 前に Meeting へコピー)。
- **新しい科目管理専用画面を追加**: 却下。既存「学期タブ → 科目一覧 → CourseDetailModal」が機能しており、導線を増やすと散らかる。既存に CourseEditModal を再利用する形で集約。
- **MeetingDetailSheet を完全廃止して MeetingEditModal に一本化**: 却下。詳細表示 (大きい時限タイル・教室/先生/メモの読み取りビュー) は編集と別の価値がある。詳細は残し、編集ボタンから MeetingEditModal へ遷移させる。
