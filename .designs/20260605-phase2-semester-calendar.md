# Phase 2 — 学期・科目カレンダーの実用化 (日クリック編集 + 視覚改善 + 月移動拡大)

## 目的 (1-3行)

学期・科目タブの `AttendanceCalendar` を「見るだけ」から「触って編集できる」カレンダーに昇格させる。
日セルをタップしてその日の出席編集・休講設定 (時間割全体 / 科目別)・個人イベント管理を 1 つの BottomSheet で完結させ、出席状況の視覚的判別性と月移動の操作性を上げる。

---

## スコープと前提

- Phase 1 (main マージ済) が前提。room は Meeting 側、`PATCH/DELETE /api/courses/:id` `/api/meetings/:id`、BottomSheet の `stackLevel` (1|2)、CourseEditModal / MeetingEditModal は既存。
- 既存 `GET /api/today?date=YYYY-MM-DD` は**任意日対応済**(`apps/api/src/routes/today.ts` 確認済、test §8 #40 が過去日取得をカバー)。
- 既存 `CourseSuspension` (courseId + date) + `GET/POST/DELETE /api/courses/:courseId/suspensions` は維持。分母除外の意味論は knowledge `pattern/course-suspension-denominator-reduction` 準拠。
- 日付正規化は `apps/api/src/lib/tz.ts` の `dateStringToJstDay` / `toIsoDate` (Asia/Tokyo, 00:00:00 スナップ) を必ず使う。新規日付列も同方式。

### 本設計が「やらないこと」

- 個人イベントの繰り返し (単発のみ)。
- 個人イベントを room / 友人に共有 (個人スコープのみ)。
- 個人イベントを出席率に算入 (完全に別ストリーム)。
- AttendanceCalendar のピクセル完璧な見た目調整 (色トークン対応・凡例・レイアウト方針までを本設計で定義し、最終調整は実装中に Leader が Chrome スクショ + Codex レビューで詰める)。

---

## データモデル (Prisma)

`apps/api/prisma/schema.prisma` に 2 モデル追加。migration は `prisma migrate dev --name phase2_timetable_suspension_personal_event` で 1 本作成 (SQLite)。

### 1. TimetableSuspension (時間割全体の休講)

```prisma
model TimetableSuspension {
  id              String        @id @default(cuid())
  userTimetableId String
  userTimetable   UserTimetable @relation(fields: [userTimetableId], references: [id], onDelete: Cascade)
  date            DateTime      // JST 00:00:00 正規化 (dateStringToJstDay)
  reason          String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@unique([userTimetableId, date])
  @@index([userTimetableId])
  @@index([date])
}
```

`UserTimetable` 側に逆リレーション追加:

```prisma
model UserTimetable {
  // ... 既存
  timetableSuspensions TimetableSuspension[]
}
```

- **スコープ判断**: UserTimetable 単位 (= 1 user × 1 semester) を採用。Semester 単位ではない。理由は不採用案参照。
- **意味論**: その日の `userTimetableId` 配下の**全 occurrence を分母から除外**(= 既存 CourseSuspension と同列だが粒度が時間割全体)。`CourseSuspension` より広い網。両方ある日付は二重に除外せず 1 回だけ除外する (実装は「除外判定を `if` で先に return/continue」で自然に冪等)。

### 2. PersonalEvent (個人イベント・単発)

```prisma
model PersonalEvent {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  semesterId  String?
  semester    Semester? @relation("SemesterPersonalEvents", fields: [semesterId], references: [id], onDelete: SetNull)
  date        DateTime  // JST 00:00:00 正規化。開催日
  title       String
  isAllDay    Boolean   @default(true)
  startMinute Int?      // isAllDay=false のとき必須。0:00 からの分 (例 540 = 9:00)
  endMinute   Int?      // isAllDay=false のとき必須。startMinute <= endMinute
  color       String?   // "#RRGGBB"。null は UI 既定色
  note        String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([userId, date])
  @@index([semesterId])
}
```

`User` 側に `personalEvents PersonalEvent[]`、`Semester` 側に `personalEvents PersonalEvent[] @relation("SemesterPersonalEvents")` を追加。

- **semesterId の役割**: 学期カレンダー (SemesterOverview) で「この学期に紐づくイベント」を絞り込むため任意で保持。Home の PersonalCalendar は学期範囲でも引けるよう、取得は `date` レンジ + 任意 `semesterId` フィルタの両対応 (下記 API)。`onDelete: SetNull` で学期削除時もイベントは残す。
- **時刻モデル**: `isAllDay=true` のとき startMinute/endMinute は null。`isAllDay=false` のとき両方必須・`startMinute <= endMinute`。検証は Zod schema (下記) と service の二重で行う。

---

## shared schema 追加

`packages/shared/src/schemas/` に 2 ファイル追加し、`packages/shared/src/index.ts` に `export * from` を 2 行追加。enums 追加は**なし**(AttendanceStatus は既存 6 種で足りる)。

### `schemas/timetableSuspension.ts`

```ts
import { z } from "zod";

export const TimetableSuspensionDto = z.object({
  id: z.string(),
  userTimetableId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TimetableSuspensionCreateInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(100).optional(),
});

export type TimetableSuspensionDto = z.infer<typeof TimetableSuspensionDto>;
export type TimetableSuspensionCreateInput = z.infer<typeof TimetableSuspensionCreateInput>;
```

### `schemas/personalEvent.ts`

```ts
import { z } from "zod";

export const PersonalEventDto = z.object({
  id: z.string(),
  semesterId: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string(),
  isAllDay: z.boolean(),
  startMinute: z.number().int().nullable(),
  endMinute: z.number().int().nullable(),
  color: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const timeRefine = (v: { isAllDay: boolean; startMinute?: number | null; endMinute?: number | null }) => {
  if (v.isAllDay) return true;
  if (v.startMinute == null || v.endMinute == null) return false;
  return v.startMinute >= 0 && v.endMinute <= 1440 && v.startMinute <= v.endMinute;
};

export const PersonalEventCreateInput = z
  .object({
    semesterId: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    title: z.string().min(1).max(100),
    isAllDay: z.boolean().default(true),
    startMinute: z.number().int().min(0).max(1440).nullable().optional(),
    endMinute: z.number().int().min(0).max(1440).nullable().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    note: z.string().max(500).optional(),
  })
  .refine(timeRefine, { message: "time range required when not all-day" });

// PATCH 部分更新 (挙動仕様 #21 準拠)。送られたフィールドだけ更新。
// isAllDay を true にした場合は startMinute/endMinute を null に戻す (service 側で強制)。
// isAllDay=false にする/のままで時刻を送る場合は timeRefine 同等の検証を適用。
export const PersonalEventUpdateInput = PersonalEventCreateInput.partial();

export type PersonalEventDto = z.infer<typeof PersonalEventDto>;
export type PersonalEventCreateInput = z.infer<typeof PersonalEventCreateInput>;
export type PersonalEventUpdateInput = z.infer<typeof PersonalEventUpdateInput>;
```

### `schemas/day.ts` (日詳細集約 DTO)

```ts
import { z } from "zod";
import { OccurrenceDto } from "./attendance.js";
import { CourseSuspensionDto } from "./course.js"; // 既存
import { TimetableSuspensionDto } from "./timetableSuspension.js";
import { PersonalEventDto } from "./personalEvent.js";

export const DayDetailDto = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurrences: z.array(OccurrenceDto),
  // その日のみに該当する科目別休講 (date 一致分だけ)
  courseSuspensions: z.array(CourseSuspensionDto),
  // その日の時間割全体休講 (あれば 1 件、なければ null)
  timetableSuspension: TimetableSuspensionDto.nullable(),
  personalEvents: z.array(PersonalEventDto),
});

export type DayDetailDto = z.infer<typeof DayDetailDto>;
```

### AttendanceDaySummary.status の拡張

`schemas/semester.ts` の `AttendanceDaySummary.status` enum に **`HAS_PERSONAL_EVENT` は追加しない**(イベントは出席集計と無関係、status はあくまで出席判定)。既存 6 値 (`ALL_PRESENT` / `HAS_ABSENT` / `HAS_TARDY` / `ALL_SUSPENDED` / `PARTIAL_UNRECORDED` / `NO_CLASS`) を維持。時間割全体休講の日は `ALL_SUSPENDED` に分類される (下記 service)。

---

## API 追加・変更

### A. 時間割全体休講 CRUD — 新 route `apps/api/src/routes/timetableSuspensions.ts`

active な UserTimetable (`findActiveUserTimetable(user.id)`) に対して操作。`userTimetableId` を URL に持たせず、active timetable 暗黙とする (today / attendance と同じ流儀)。

```
GET    /api/timetable-suspensions?from=YYYY-MM-DD&to=YYYY-MM-DD
       → { suspensions: TimetableSuspensionDto[] }   (date asc、from/to 省略時は全件)
POST   /api/timetable-suspensions  { date, reason? }
       → 201 { suspension }   (409 DUPLICATE if [userTimetableId, date] 衝突)
DELETE /api/timetable-suspensions/:id
       → { ok: true }
```

service `apps/api/src/services/timetableSuspension.service.ts`:
- `listTimetableSuspensions({ userId, from?, to? })`
- `createTimetableSuspension({ userId, input })` — active timetable が無ければ 403 `SETUP_REQUIRED`。date は `dateStringToJstDay(input.date).startOfDay`。P2002 → 409 `DUPLICATE`。
- `deleteTimetableSuspension({ userId, id })` — 所有チェック (`userTimetable.userId === userId`)、無ければ 404。
- 認可: active timetable 経由なので `userId` 一致が自動担保。`:id` 削除時は `findFirst({ where: { id, userTimetable: { userId } } })` で assert。

### B. 個人イベント CRUD — 新 route `apps/api/src/routes/personalEvents.ts`

```
GET    /api/personal-events?from=YYYY-MM-DD&to=YYYY-MM-DD&semesterId=...
       → { events: PersonalEventDto[] }   (date asc, then startMinute asc nulls first)
POST   /api/personal-events  PersonalEventCreateInput
       → 201 { event }
PATCH  /api/personal-events/:id  PersonalEventUpdateInput
       → { event }   (404 if 他人 or 不在)
DELETE /api/personal-events/:id
       → { ok: true }
```

service `apps/api/src/services/personalEvent.service.ts`:
- list: `where: { userId, date: { gte, lte }?, semesterId? }`。from/to は `dateStringToJstDay` で範囲化。semesterId 指定時は AND。
- create: `userId` は session、`date` 正規化、`isAllDay` false 時は startMinute/endMinute 保存、true 時は null 強制。`color` は `#RRGGBB` or null。
- update: 所有チェック後、全フィールド置換 (input にある値で上書き、`isAllDay=true` なら start/end を null に戻す)。
- delete: 所有チェック後 delete。
- 認可: 全操作で `event.userId === currentUserId` を assert (`findFirst({ where: { id, userId } })`)。

### C. 日詳細集約 — 新 route `apps/api/src/routes/day.ts`

日詳細シートが叩く読み取り専用集約 endpoint を**新設する**(判断: 既存 `/today?date=` だけだと休講3種・イベントを別々に N 本叩くことになり、シート開閉のたびに waterfall + 整合性ずれが起きる。1 本に集約して TanStack Query 1 キーで管理する)。

```
GET /api/day/:date    (:date = YYYY-MM-DD)
    → DayDetailDto
```

service `apps/api/src/services/dayDetail.service.ts` (`getDayDetail({ userId, date })`):
1. active UserTimetable を取得。無ければ `{ date, occurrences: [], courseSuspensions: [], timetableSuspension: null, personalEvents: [...] }` (イベントは timetable 非依存で返す)。
2. occurrences: `today.ts` と同形のマッピング (= `OccurrenceDto`)。その日の `meeting.userTimetableId === timetable.id` を範囲 `[startOfDay, endOfDay]` で取得。
3. courseSuspensions: その日付に一致する `CourseSuspension`(courseId が timetable 配下) を返す。
4. timetableSuspension: `findUnique({ userTimetableId_date })` の結果 (null 可)。
5. personalEvents: `userId` + その日付の `PersonalEvent`。
6. **occurrence の status はそのまま返す**(休講判定は service が status を書き換えない。UI 側が timetableSuspension / courseSuspensions と突き合わせて「休講中」と表示する。理由: occurrence の AttendanceRecord は保持され、休講解除で即復活させたいため。下記「休講と出席記録の関係」)。

### D. 既存 attendance / today は変更なし

`POST/DELETE /api/attendance/:occurrenceId`、`GET /api/today?date=` はそのまま使う。日詳細シートの出席編集はこの既存 API を叩く。

---

## stats / overview service への反映

### attendanceStats.ts (`computeCourseStats`)

`include` に各 course の `userTimetable.timetableSuspensions` を持たせる代わりに、timetable レベルで 1 回取得した `timetableSuspendedDates: Set<string>` を全 course 共通で使う。

```ts
const timetableSuspendedDates = new Set(
  timetable.timetableSuspensions.map((s) => toIsoDate(s.date)),
);
// course ループ内、suspendedDates (course 別) チェックの「前」に:
for (const occurrence of course.occurrences) {
  const occurrenceDate = toIsoDate(occurrence.date);
  if (timetableSuspendedDates.has(occurrenceDate)) {
    counts.suspended += 1;
    denominatorReduction += 1;
    continue;                       // ★ 時間割全体休講を最優先で分母除外
  }
  if (suspendedDates.has(occurrenceDate)) {   // 既存: 科目別休講
    counts.suspended += 1;
    denominatorReduction += 1;
    continue;
  }
  // ... 既存ロジック (AttendanceRecord 評価)
}
```

`timetable.include` に `timetableSuspensions: true` を追加。
- **二重休講** (時間割全体 + 科目別が同日同 course): 最初の `if` で continue するので `suspended` は 1 回だけ +1。分母除外も 1 回 (冪等)。

### semesterOverview.service.ts (`buildDaySummaries` / `classifyDay`)

`timetable.include` に `timetableSuspensions: true` を追加。各 occurrence を `byDate` に積む前に時間割全体休講を判定:

```ts
const timetableSuspendedDates = new Set(timetable.timetableSuspensions.map((s) => toIsoDate(s.date)));
// occurrence ループ:
if (timetableSuspendedDates.has(dateIso)) list.push({ status: "SUSPENDED" });
else if (suspendedDates.has(dateIso)) list.push({ status: "SUSPENDED" });   // 既存 (科目別)
else if (!occurrence.attendanceRecord) list.push({ status: "UNRECORDED" });
else list.push({ status: occurrence.attendanceRecord.status });
```

`classifyDay` は変更なし (`ALL_SUSPENDED` 判定が時間割全体休講にも自然に効く: その日の全 occurrence が SUSPENDED になるため)。

- **時間割全体休講だが occurrence が 0 件の日** (祝日等で元々授業なし): `byDate` に何も積まれず `NO_CLASS` のまま。これは仕様 (出席対象が無いので休講表示しても無意味)。

### 個人イベントは集計に一切混ぜない

`PersonalEvent` は computeCourseStats / buildDaySummaries のどちらにも入れない。出席率・day status に無関係。

---

## UI / UX

### 1. AttendanceCalendar (`apps/web/src/components/semester/AttendanceCalendar.tsx`) 改修

#### (a) 月移動ボタン拡大

- 現状 `h-7 w-7` → **`h-11 w-11`** (44px = タップターゲット最小) に拡大。アイコンも `text-base` → `text-xl`。
- `aria-label`「前の月」「次の月」を付与 (現状なし)。
- 月ラベルは中央維持、ボタンは左右端。

#### (b) 状態の視覚再設計 (色トークン対応・凡例)

セルは「日付数字 + ステータス背景塗り + マーカー」の 3 要素。マーカー 1 文字だけだと判別性が低いので**セル全体の薄塗り背景**を追加する。状態 → トークン対応表 (CSS 変数は既存 `--color-status-*` を流用、最終色値は実装中に調整):

| status | 意味 | 背景 (薄塗り) | マーカー | 凡例ラベル |
|---|---|---|---|---|
| `ALL_PRESENT` | 全出席済 | `--color-status-present` 12% | ○ | 出席 |
| `HAS_ABSENT` | 欠席あり | `--color-status-absent` 16% | × | 欠席あり |
| `HAS_TARDY` | 遅刻/早退あり | `--color-status-tardy` 16% | △ | 遅刻・早退 |
| `ALL_SUSPENDED` | 休講 (科目別 or 時間割全体) | `--color-status-cancelled` 14% | ／ | 休講 |
| `PARTIAL_UNRECORDED` | 一部未記録 | `--color-status-none` 10% | · | 未記録あり |
| `NO_CLASS` | 授業なし | なし | (なし) | (凡例非表示) |

- 薄塗りは `background: color-mix(in srgb, var(--color-status-xxx) NN%, var(--color-bg-elevated))` で実装 (既存 CalendarMonth が同方式)。
- マーカー色は既存 `markerColor()` を維持しつつ、`markerColor` / 薄塗り% を 1 つの `statusVisual(status) => { bg, marker, markerColor }` pure 関数に集約 (テスト容易化)。`apps/web/src/lib/dayStatusVisual.ts` に切り出す。
- **個人イベント有り**の日: ステータス背景とは別に、セル右上に小ドット (色 = イベント色 or 既定 accent)。複数あってもドットは 1 個 (件数は出さない)。day status と直交。日詳細データは overview には含まれないため、AttendanceCalendar は別途 `usePersonalEvents(from, to)` で当月分を取得しドット表示する。
- 凡例は `NO_CLASS` を除く 5 状態を表示。イベントドットの凡例も 1 つ追加 (「● 予定」)。

#### (c) 日セルクリック → 詳細シート起動

- 各セルを `<button>` 化 (現状 `<div>`)。`onClick={() => onSelectDay(iso)}`、`aria-label={cell.format("M月D日")}`。
- `AttendanceCalendar` に props 追加: `onSelectDay: (date: string) => void`。`SemesterOverview` が受けて `DayDetailSheet` を開く。
- 学期範囲外の日 (`startDate` 前 / `endDate` 後) もクリック可能だが、occurrences 空でイベントのみ編集可能とする (休講トグルは active timetable があれば可)。

### 2. DayDetailSheet (新規, `apps/web/src/components/semester/DayDetailSheet.tsx`)

`BottomSheet` (stackLevel=1) を using。props: `{ date: string | null; onClose: () => void }`。`date` が null なら閉じ。

データ取得: `useDayDetail(date)` (新 hook、`GET /api/day/:date`)。

レイアウト (上から):

```
┌─────────────────────────────────────────────┐
│  2026年5月13日 (水)                      [×] │  ← title
├─────────────────────────────────────────────┤
│  [toggle] この日を休講にする (時間割全体)      │  ← timetableSuspension トグル
│          理由: [____________] (任意)          │
├─────────────────────────────────────────────┤
│  授業 (3)                                     │  ← occurrences セクション
│  ┌─────────────────────────────────────────┐ │
│  │ 1限 OS  ●出 ○欠 ○公 ○遅 ○早 ○休  [科目休講]│ │  ← inline status 選択 (segmented)
│  └─────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────┐ │
│  │ 2限 OS  (休講中 — 時間割全体)              │ │  ← 休講中は status 選択を disable + バッジ
│  └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│  予定 (1)                          [+ 追加]   │  ← personalEvents セクション
│  ┌─────────────────────────────────────────┐ │
│  │ ● 終日 バイト          [編集] [削除]       │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

#### 挙動

- **時間割全体休講トグル**: ON で `POST /api/timetable-suspensions {date, reason}`、OFF で対応 `DELETE`。トグル ON 中は授業セクションの各 occurrence の status 選択を **disable + 「休講中 (時間割全体)」バッジ**表示 (AttendanceRecord は消さない)。reason 入力はトグル ON 時のみ表示。
- **occurrence 出席編集**: 各授業行に 6 状態の segmented (出/欠/公/遅/早/休) + 「未記録」状態。選択で `POST /api/attendance/:occurrenceId {status}`、未記録に戻すで `DELETE`。`CANCELLED` (休講) は個別 occurrence の休講 (既存意味論)。
- **科目別休講**: 各授業行末の `[科目休講]` ボタンで、その occurrence の course に対し `POST /api/courses/:courseId/suspensions {date}` (= 既存 API、courseId は occurrence.courseId、date はシートの日付)。既に科目別休講登録済なら「科目休講中」バッジ + 解除ボタン (`DELETE /api/courses/:courseId/suspensions/:id`、id は `courseSuspensions` から date 一致で引く)。科目別休講中も status 選択は disable。
- **優先順位の表示**: 時間割全体休講 > 科目別休講 > 個別 status。バッジは上位のものだけ出す。
- **予定 (個人イベント)**: 一覧 (終日 / 時刻表示)。`[+ 追加]` / `[編集]` で `PersonalEventEditModal` を stackLevel=2 で開く。`[削除]` で `DELETE /api/personal-events/:id` (確認なしで即削除、TanStack Query で楽観 invalidate)。
- 全 mutation 成功後、`QK.dayDetail(date)` / `QK.semesterOverview(...)` / `QK.stats(...)` / `QK.personalEvents(...)` / `QK.today(date)` を invalidate (出席率・カレンダー塗りを即反映)。

### 3. PersonalEventEditModal (新規, `apps/web/src/components/semester/PersonalEventEditModal.tsx`)

`CourseEditModal` に倣う。`BottomSheet` (stackLevel=2)。props: `{ open, onClose, date, event?: PersonalEventDto | null, semesterId?: string | null, onSaved? }`。

フィールド:
- タイトル (`Input`, required, max 100)
- 日付 (`Input type="date"`, 既定 = シートの date、変更可)
- 終日トグル (`isAllDay`, 既定 true)
- 終日 OFF 時: 開始時刻 / 終了時刻 (`Input type="time"` → 分換算で startMinute/endMinute)
- 色 (CourseEditModal と同じカラーパレット + color input)
- メモ (`Textarea`, max 500)

保存: `event` あれば `PATCH /api/personal-events/:id`、なければ `POST /api/personal-events`(`semesterId` を渡す)。保存後 `onClose` + 親で `QK.personalEvents` / `QK.dayDetail` invalidate。

### 4. SemesterOverview (`apps/web/src/components/semester/SemesterOverview.tsx`) 改修

- `AttendanceCalendar` に `onSelectDay` を渡す。
- `const [dayDetailDate, setDayDetailDate] = useState<string | null>(null)` を追加。
- `<DayDetailSheet date={dayDetailDate} onClose={() => setDayDetailDate(null)} />` を末尾に追加。

### 5. CourseSuspensionSection の扱い

**残す**(CourseDetailModal 内の「科目の休講日まとめ管理」UI として価値がある)。DayDetailSheet は「日起点」、CourseSuspensionSection は「科目起点」で同じ `CourseSuspension` を操作する двух入口。両者は同 API・同 query key (`QK.courseSuspensions`) を共有するので、片方の操作はもう片方に invalidate 経由で反映される。重複実装ではなく入口違い。

### 6. Home の PersonalCalendar 反映

`apps/web/src/lib/meetingExpansion.ts` の `CalendarEvent` union には既に `PersonalEvent` (kind:"personal") バリアントが存在する (room 由来想定だが型は流用可)。Home 個人カレンダーに個人イベントと時間割全体休講を反映:

- **個人イベント**: `PersonalCalendar` で `usePersonalEvents(range.start, range.end, semesterId)` を追加取得し、`PersonalEvent` (kind:"personal") に変換して `events` にマージ。`expandUserTimetable` 出力 (meeting) と concat → 既存の `eventsByDate` / `CalendarMonth` がそのまま描画 (CalendarMonth は kind 非依存で `eventColor`/`eventTitle` を使う)。`calendarEventDisplay.ts` の `eventColor`/`eventTitle` は personal を既に処理済 (確認済)。
- **時間割全体休講**: `usePersonalCalendar` 系で `useSemesterOverview` の `statusByDate` を既に持っている。時間割全体休講日は overview 側で `ALL_SUSPENDED` になるため、`CalendarMonth` の status ドットが既存ロジックで「休講」を表示する。**追加実装不要**(overview service の変更が自動的に効く)。

---

## 挙動仕様 (Reviewer テスト根拠)

### (a) 任意日の出席編集

1. ある occurrence に `POST /api/attendance/:id {status:"ABSENT"}` → AttendanceRecord が upsert され status=ABSENT。
2. 同 occurrence に再度 `POST {status:"PRESENT"}` → 既存 record が update され status=PRESENT (重複行を作らない)。
3. `DELETE /api/attendance/:id` → record 削除、`GET /api/today?date=` の該当 occurrence.status が null に戻る。
4. 他人の occurrence に `POST` → 404 NOT_FOUND。
5. 過去日 occurrence でも (1)-(3) が同様に動作する。

### (b) 時間割全体休講の作成/解除と分母除外・status

6. `POST /api/timetable-suspensions {date:"2026-05-13"}` → 201、`GET /api/day/2026-05-13` の `timetableSuspension` が非 null。
7. 同日同 timetable に再 `POST` → 409 DUPLICATE。
8. 時間割全体休講が有る日の全 occurrence は、computeCourseStats で `counts.suspended` に計上され**分母から除外** (effectiveDenominator が休講 occurrence 数だけ減る)。AttendanceRecord の有無に関わらず分母除外される。
9. semesterOverview の該当日 `status` が `ALL_SUSPENDED` になる (その日の occurrence が他に無い限り)。
10. `DELETE /api/timetable-suspensions/:id` → 解除後、computeCourseStats で当該日 occurrence が通常評価に戻る (record があればその status、無く過去日なら unrecorded で分母に再算入)。AttendanceRecord は休講中も保持されていたため、解除で即復活する。
11. 他人の timetable suspension id を `DELETE` → 404。
12. 時間割全体休講日に occurrence が 0 件 → overview status は `NO_CLASS` のまま (休講表示しない)。

### (c) 科目別休講との二重休講

13. 同日に時間割全体休講 + 科目別休講が両方ある course の occurrence: `counts.suspended` は **1 回だけ** +1、分母除外も 1 回 (二重カウントしない)。
14. 時間割全体休講のみ解除し科目別休講が残る場合: その course の当該日 occurrence は依然 suspended (科目別休講で除外継続)、他 course は通常評価に戻る。

### (d) 個人イベント CRUD と表示

15. `POST /api/personal-events {date, title, isAllDay:true}` → 201、startMinute/endMinute は null。
16. `POST {isAllDay:false, startMinute:540, endMinute:630}` → 201、時刻保持。
17. `POST {isAllDay:false}` で start/end 欠落 → 400 VALIDATION_ERROR。
18. `POST {isAllDay:false, startMinute:700, endMinute:600}` (start > end) → 400。
19. `GET /api/personal-events?from&to` → date 範囲内のみ返す、date asc。
20. `GET ...&semesterId=X` → semesterId 一致のみ。
21. `PATCH /api/personal-events/:id {title:"new"}` → 更新。`isAllDay:true` に変えると start/end が null に戻る。
22. 他人の event を `PATCH`/`DELETE` → 404。
23. `DELETE /api/personal-events/:id` → 削除、以後 GET に出ない。
24. **個人イベントは computeCourseStats / semesterOverview の出席率・day status に一切影響しない** (イベントのみある日の status は NO_CLASS or 既存判定のまま)。
25. Home PersonalCalendar が当月レンジで個人イベントを meeting と並べて描画する (kind:"personal" として `eventTitle`/`eventColor` 経由)。

### (e) 休講日の出席記録の扱い

26. 出席記録 (PRESENT) 済の occurrence にその日の時間割全体休講を後から付けても、AttendanceRecord は削除されない (DB に残る)。集計上は suspended 優先で分母除外。
27. 休講解除すると、保持されていた AttendanceRecord (PRESENT) が再び有効になり分子に算入される。
28. DayDetailSheet 上で休講トグル ON 中、その日の occurrence の status 選択 UI は disable される (記録の誤操作防止)。ただし DB の record は触らない。

### (f) 日詳細集約 API

29. `GET /api/day/:date` が occurrences / courseSuspensions (その日分) / timetableSuspension (null 可) / personalEvents を 1 レスポンスで返す。
30. active timetable が無いユーザーでも personalEvents は返る (occurrences は空配列)。
31. `:date` が不正形式 → 400 (route param regex or service で検証)。

---

## テスト基盤

- **API**: Vitest + 実 SQLite (`apps/api/vitest.config.ts`)。配置 `apps/api/tests/`。ヘルパ `tests/helpers/auth.ts` の `setupCompleteUser` / `createOccurrence` / `createSemester` を再利用。新規:
  - `tests/timetable-suspensions.test.ts` — (b)(c) の API レイヤ + 認可。
  - `tests/personal-events.test.ts` — (d) CRUD + 検証 + 認可。
  - `tests/day-detail.test.ts` — (f) 集約レスポンス。
  - `tests/stats.test.ts` (既存に追記) — (b)8/10, (c)13/14, (e)26/27 の分母除外ロジック。
  - `tests/semesters.test.ts` (既存に追記、overview) — (b)9/12 の day status。
  - パターン: `app.request(path, { method, headers:{Cookie}, body })` → `json(res)` で assert (既存 today.test.ts 流儀)。
- **Web**: Vitest + RTL + jsdom (`apps/web/vitest.config.ts`)。配置 `apps/web/tests/`。新規:
  - `tests/lib/dayStatusVisual.test.ts` — `statusVisual()` の pure 関数マッピング (6 status × bg/marker)。
  - `tests/components/DayDetailSheet.test.tsx` — レンダリング、休講トグル disable 連動、segmented 選択が mutation を呼ぶ (api client mock)。
  - `tests/components/PersonalEventEditModal.test.tsx` — CourseEditModal.test.tsx に倣う。終日 ⇔ 時刻切替で start/end の出現、保存 payload。
  - `tests/components/AttendanceCalendar.test.tsx` — 月移動ボタンの aria-label / サイズ class、日セルクリックで `onSelectDay` 発火、status 別 bg class。
- jsdom の制約 (calc/dvh 非評価) は style 生文字列 assert で回避 (knowledge `single-screen-compressed-timetable` 参照)。

---

## 不採用案

- **TimetableSuspension を Semester 単位で持つ**: 1 semester に複数 UserTimetable が将来生まれる設計余地 (現状 `@@unique([userId, semesterId])` で 1:1 だが) を考えると、休講は「その時間割の運用」に属する概念。Semester 単位だと time table 削除/再生成で意味がずれる。UserTimetable 単位を採用。
- **時間割全体休講を「全 Course に CourseSuspension を bulk insert」で表現**: knowledge でも反例として挙がっている。course 追加/削除で整合性が崩れ、「時間割全体休講」という 1 つの意思を N 行に分散させると解除も N 件 delete になる。専用 1 行モデルが正しい。
- **occurrence の status を service 側で休講中は CANCELLED に書き換えて返す**: AttendanceRecord を破壊すると休講解除で記録が復元できない。status は素のまま返し、UI が休講と突き合わせて表示する方式を採用 ((e)26/27)。
- **日詳細を `/today?date=` + suspensions + events の 3 本立てでフロント集約**: waterfall + キャッシュ整合性の管理コスト増。`GET /api/day/:date` 1 本に集約。
- **AttendanceDaySummary に `HAS_PERSONAL_EVENT` status 追加**: 出席判定 (status) とイベント有無は直交概念。status を汚すと classifyDay の優先順位が複雑化。イベントは別ドット (セル右上) で表現。
- **PersonalEvent に繰り返し (RRULE) を持たせる**: 要望は単発確定。RoomEvent の recurrence/override 機構は重い。単発に限定し、必要になれば別 Phase で拡張。
- **個人イベントを RoomEvent に "自分専用 room" として相乗り**: room メンバーシップ・可視性・ICS/Google 同期の機構を個人イベントに巻き込むのは過剰。独立した薄い PersonalEvent を新設。
