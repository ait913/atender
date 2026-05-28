# Atender v9 — TimeTree 風 + orange 系 + ホーム集約型レイアウトへの全面再構築

設計日: 2026-05-28 / Architect: architect subagent
対象 commit: v8 (`.designs/20260528-v8-google-calendar-oauth.md`) デプロイ後
前提 docs:
- `.designs/20260528-v8-google-calendar-oauth.md` (Google Calendar OAuth)
- `.designs/20260527-v7-calendar-rrule-import.md` (RRULE + .ics import + title mapping)
- `.designs/20260527-v6-room-calendar-timetable.md` (RoomCalendar / RoomTimetable)
- `.designs/20260526-v5-mobile-rework.md` (mobile rework / token v5)
- `.designs/20260526-v4-snap-style.md` (Snap 風 token v4)
- `knowledge/pattern/timetable-app-ux-patterns.md` (bottom tab 5 個 + ワンタッチ出欠)
- `knowledge/pattern/form-modal-readability-bp.md` (modal 視認性 5 軸)
- `knowledge/pattern/grid-table-borders-bp.md` (罫線 BP)
- `knowledge/pattern/mobile-first-bottom-tab.md` (bottom tab BP)
- 既存 schema: `apps/api/prisma/schema.prisma`
- 入力スクショ: `/Users/touri/Documents/Screen Shots/スクリーンショット 2026-05-28 14.55.04.png` (Touri 作 Figma 叩き、ASCII 化済)

---

## Executive Summary

v8 まで Atender は「ホーム = 今日 / 時間割 / ルーム / 友達」の 4 タブ + 右上アバターメニュー構成だった。**v9 は TimeTree が獲得した「ホームに自分とグループを並べる」ホーム集約型レイアウトを Atender の出欠ドメインに移植する**。ユーザーは「自分 / Room1 / Room2 …」を horizontal chip で切替え、各 context で「時間割 / カレンダー」のサブモード切替を行う。BottomTab は **ホーム / 学期・科目 / ルーム / 友達 / 設定** の 5 タブとなり、旧アバターメニューは「設定」タブ配下に**全項目を再配置**する。アクセントカラーは emerald から **orange (TimeTree 系の鮭色寄り)** に全置換、テーマトークン (CSS custom property + Tailwind v4 `@theme` mapping) のみで切り替える。

加えて「科目別出席率の可視化 + 休講日カレンダー登録」を**学期・科目タブ**に新規実装する。`CourseSuspension` model を追加し、出席率算出の分母から休講日を除外するロジックを `attendanceStats.computeCourseStats` に組み込む。

### 主要設計判断 (7 項目)

1. **ナビゲーション全面再構築 — 旧 navItems を破棄して新 5 タブ tree**:
   旧: `/ (今日) / /timetable / /rooms / /friends` + 右上 AvatarMenu。
   新: `/ (ホーム) / /semester / /rooms / /friends / /settings`。旧 `/timetable` route は **削除** (ホーム配下に統合)。旧 `/stats` は `/semester` の一部として表示 (上部の「全体の出席率」と「科目一覧」がそれを兼ねる)、`/stats` route は `/semester` への redirect として残す。TopBar の `AvatarMenu` は廃止し、TopBar 自体も新ホーム/学期画面ではタイトル + 右側コントロール ( ⚙ 等) に simplify する。

2. **ホーム = `<ContextChips>` + `<HomeViewModeTabs>` + `<HomeBody>` の 3 層 component**:
   ContextChips は `{ kind: "self" } | { kind: "room", roomId, name }` の配列を horizontal scroll で描画。HomeViewModeTabs は `"timetable" | "calendar"` の 2 値 segmented。HomeBody は context × mode の 4 ケースを switch して既存 component (DayList / TimetableGrid / CalendarMonth-Week-Day / RoomTimetable / RoomCalendar) にデリゲートする。**新規描画ロジックは増やさず再利用に徹する** (個人カレンダー表示のための薄いアダプタ `PersonalCalendar` だけ新規)。

3. **MainAttendanceCTA は self context + timetable mode のみで表示**:
   v8 まで Today 画面に固定で出していた「全て出席」CTA は、`context.kind === "self" && mode === "timetable"` の時だけ HomeBody 下端 fixed に出す。room context や calendar mode では非表示 (Touri ASCII 合意済)。

4. **学期・科目タブ = 全体出席率 + 出席日カレンダー + 科目一覧 + 科目モーダル**:
   `/semester` は単一ページに「学期セレクタ ▼」「期間表示」「**全体出席率** (大きく)」「出席日 month カレンダー (○/×/斜線)」「科目一覧 (出席率付きカード)」を縦に並べる。各科目カードを tap すると **`<CourseDetailModal>` 全画面モーダル**が開き、科目編集 + **休講日 CRUD** + 個別の出席履歴一覧 (= 該当 course の MeetingOccurrence + AttendanceRecord を時系列) + 「この科目を削除」が見られる。

5. **`CourseSuspension` 新規 model + 出席率算出への組み込み**:
   `model CourseSuspension { id, courseId, date, reason?, createdAt, updatedAt }` を追加。`@@unique([courseId, date])`。`computeCourseStats` の denominator 算出時に「`MeetingOccurrence` のうち、その日付に対応する `CourseSuspension` が存在するもの」を **`REDUCE_DENOMINATOR` 相当**として扱う。さらに `MeetingOccurrence` には記録不要 (= UI 上「休講」表示)。**既存の AttendanceRecord に status=CANCELLED を入れる方式は維持** (個別欠席日に手動マークする用)、`CourseSuspension` は**科目全体に対する一括休講日設定**として共存する。

6. **カラートークン: emerald → orange (鮭色寄り) 全置換、status はトーンを再調整**:
   `--color-accent-500 = #F97316` (Tailwind orange-500) を中心に dark/light で 3 段 (50/100/500/600/700) を再定義。glow / shadow も orange 系に。**status-present** は accent と被るので **orange-tinted 緑** (`#22C55E` 系) に変更、視認性を保つ。`status-tardy` (黄) と被らないよう accent は赤寄り orange を使う (Tailwind orange-500 #F97316 はオレンジ中心、TimeTree の鮭色 ≒ `#FF7B6B` 系)。**最終的に Atender accent は `#F97316` (orange-500、Tailwind 純正) を採用** し、TimeTree 鮭色との折衷ではなく既製 token として 1 本に揃える (理由: §8 参照)。

7. **MVP 1 Phase で全部やる、Phase 2 送りなし**:
   Touri の指示通り、v9 は全項目を 1 リリースに乗せる。Phase 2 / TODO セクションは設けない。逆にいうと、設計 doc を 100% 実装することが Reviewer GREEN の必要条件。

### スコープ外 (v9 でやらない)

- 既存 v6/v7/v8 機能の挙動変更 (Friendship / Google OAuth / .ics import / RRULE expansion / RoomEvent visibility 3 段階 etc.) は**触らない**。再配置のみ
- 旧アバターメニュー UI コンポーネント (`AvatarMenu.tsx`) は**ファイル削除**せず、`/settings` route 配下に section として再利用する (再実装より移植の方が壊さない)
- TimeTree との完全互換 (色味・タブ順) は目指さない (§12 不採用案 D)
- 個人カレンダー上で「予定追加」操作 (個人カレンダーは出席ログ + 休講可視化に閉じる、予定の作成は引き続きルーム or 時間割)
- iPhone 版での適用 (v9 は Web のみ。iPhone 移植は別 issue)
- ダークモード時の鮭色 vs 黒背景コントラスト微調整 (`#F97316` で WCAG AA は満たすことを §8 で確認、追加チューニングなし)
- `RoomEvent` への `suspension` 概念導入 (休講は時間割 Course だけの概念)

---

## §0 用語

| 用語 | 意味 |
|---|---|
| **context** | ホーム画面の表示主体。`{ kind: "self" }` (= 自分) または `{ kind: "room", roomId, roomName }`。chip で切替 |
| **mode** | ホーム画面の表示モード。`"timetable"` または `"calendar"` |
| **HomeBody** | context × mode の 4 ケースを既存 component にデリゲートする薄いコンテナ |
| **PersonalCalendar** | self context + calendar mode で描画される新規アダプタ (既存 CalendarMonth/Week/Day を再利用) |
| **CourseDetailModal** | 学期・科目タブの科目カード tap で開く全画面モーダル |
| **CourseSuspension** | 科目全体に対する一括休講日設定 (Course × Date の中間 table) |
| **Settings タブ** | 旧 AvatarMenu の項目を集約した新規ルート `/settings` |
| **鮭色 / orange** | アクセントカラー `#F97316` (Tailwind orange-500)。TimeTree 風の暖色寄り |

---

## §1 全体構成

```
v9 = (A) Prisma schema delta:
        - 新 model: CourseSuspension
        - migration: 20260528210000_v9_course_suspension
     (B) Shared zod:
        - CourseSuspensionDto / CourseSuspensionCreateInput
        - CourseStatsDto に suspendedCount: number 追加
        - SemesterOverviewDto (新): 学期トップ画面のサマリ集約
     (C) API endpoint:
        - GET    /api/courses/:courseId/suspensions
        - POST   /api/courses/:courseId/suspensions
        - DELETE /api/courses/:courseId/suspensions/:id
        - GET    /api/semesters/:id/overview          (全体出席率 + 月別カレンダー + 科目一覧を 1 リクエストで)
     (D) Backend services:
        - apps/api/src/services/courseSuspension.service.ts (新規)
        - apps/api/src/services/semesterOverview.service.ts (新規)
        - apps/api/src/services/attendanceStats.ts          (改修: suspension を分母から除外)
     (E) Frontend ナビゲーション再構築:
        - apps/web/src/components/layout/navItems.ts        (5 タブに置換)
        - apps/web/src/components/layout/BottomTab.tsx      (5 等分 + 既存スタイル維持)
        - apps/web/src/components/layout/SideNav.tsx        (5 タブ + 既存スタイル維持)
        - apps/web/src/components/layout/TopBar.tsx         (AvatarMenu 削除、タイトル表示のみ)
        - apps/web/src/router.tsx                            (route tree 再編)
     (F) Frontend 新規 route / page:
        - apps/web/src/routes/Home.tsx                       (新ホーム route)
        - apps/web/src/routes/SemesterOverview.tsx           (学期・科目タブ)
        - apps/web/src/routes/Settings.tsx                   (設定タブ)
     (G) Frontend 新規 component:
        - apps/web/src/components/home/Home.tsx              (ContextChips + HomeViewModeTabs + HomeBody を組み立てる)
        - apps/web/src/components/home/ContextChips.tsx
        - apps/web/src/components/home/HomeViewModeTabs.tsx
        - apps/web/src/components/home/HomeSemesterPicker.tsx (「2026 前期 ▼」)
        - apps/web/src/components/home/HomeBody.tsx          (context × mode dispatcher)
        - apps/web/src/components/home/PersonalCalendar.tsx  (self + calendar 用、新規アダプタ)
        - apps/web/src/components/semester/SemesterOverview.tsx
        - apps/web/src/components/semester/AttendanceCalendar.tsx  (月単位 ○/×/斜線)
        - apps/web/src/components/semester/CourseListItem.tsx
        - apps/web/src/components/semester/CourseDetailModal.tsx
        - apps/web/src/components/semester/CourseSuspensionSection.tsx (Modal 内 section)
        - apps/web/src/components/semester/CourseOccurrenceHistory.tsx (Modal 内 section)
        - apps/web/src/components/settings/Settings.tsx
        - apps/web/src/components/settings/SettingsSection.tsx        (rows wrapper)
     (H) Frontend 改修:
        - apps/web/src/components/today/Today.tsx           (削除 or 内部ロジック Home self+timetable に移管)
        - apps/web/src/components/today/MainAttendanceCTA.tsx (Home から呼ぶ用に export を維持、bottom offset を調整)
        - apps/web/src/routes/Today.tsx                      (削除)
        - apps/web/src/routes/Timetable.tsx                  (削除、内部ロジックは Home に移管)
        - apps/web/src/routes/Stats.tsx                      (削除、redirect to /semester)
        - apps/web/src/components/avatar/AvatarMenu.tsx     (削除、内部ロジックは Settings に移管)
        - apps/web/src/components/avatar/GoogleCalendarSection.tsx 等 (Settings から開かれる sheet 群として再配置)
        - apps/web/src/styles.css                            (token: emerald → orange、status-present は緑寄りに再定義)
     (I) Frontend api hooks:
        - useCourseSuspensions(courseId) / useCreateCourseSuspension / useDeleteCourseSuspension
        - useSemesterOverview(semesterId)
        - useRoomMemberships() (= /api/me から既存抽出、context chips で使用)
     (J) Knowledge 追加 (Architect 担当):
        - knowledge/pattern/home-aggregated-context-switcher.md (TimeTree 風 context chip + mode tab の pattern)
        - knowledge/pattern/course-suspension-denominator-reduction.md (休講日を出席率分母から除外する標準パターン)
```

### 依存関係グラフ

```
Prisma schema delta
    └─ shared/schemas/course.ts (CourseSuspensionDto 追加)
    └─ shared/schemas/stats.ts (CourseStatsDto.suspendedCount 追加)
    └─ shared/schemas/semester.ts (SemesterOverviewDto 追加)
            └─ apps/api/src/services/courseSuspension.service.ts
            └─ apps/api/src/services/attendanceStats.ts (suspension dates を分母から減算)
            └─ apps/api/src/services/semesterOverview.service.ts
                    └─ apps/api/src/routes/courses.ts (+ suspension CRUD)
                    └─ apps/api/src/routes/semesters.ts (+ overview)

apps/web/src/api/hooks/useCourseSuspensions.ts (新規)
apps/web/src/api/hooks/useSemesterOverview.ts (新規)
    └─ apps/web/src/components/semester/* (新規 component 群)
    └─ apps/web/src/components/home/* (新規 component 群、context chips から useRooms 経由でメンバーシップを得る)

apps/web/src/styles.css (token rewrite)
    └─ 全 component の bg-accent-* / text-accent-* / status-* に影響 (色味のみ、構造変更なし)

apps/web/src/components/layout/navItems.ts (新規 5 タブ)
    └─ BottomTab.tsx / SideNav.tsx
apps/web/src/components/layout/TopBar.tsx (AvatarMenu 削除)
    └─ AvatarMenu の内容は Settings.tsx へ移植

apps/web/src/router.tsx
    └─ /Home / /semester / /settings 追加
    └─ /timetable / /stats / / (旧 Today) は redirect or 削除
    └─ /me / /settings/calendar /settings/integrations/google は維持 (内部リンク互換)
```

---

## §2 データモデル (Prisma schema delta)

### 2.1 CourseSuspension (新)

```prisma
model CourseSuspension {
  id        String   @id @default(cuid())
  courseId  String
  course    Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  date      DateTime          // JST 00:00:00 にスナップする日付 (= MeetingOccurrence.date と同じ規約)
  reason    String?           // 自由文字列 (例: 「学園祭振替」「先生不在」)、null 可
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([courseId, date])
  @@index([courseId])
  @@index([date])
}
```

`Course` model に逆参照を 1 行追加:

```prisma
model Course {
  // ... 既存 ...
  suspensions CourseSuspension[]
}
```

#### 設計判断

- **粒度は Course 単位** (Meeting や MeetingOccurrence 単位ではない)。理由: ユーザーが「○月○日は休講」と科目に対して登録する自然な UX で、同日複数コマある授業 (Meeting periodOffset > 0) も自動で全部休講扱いになる。
- **`date` の正規化**: JST 00:00:00 に揃える (`MeetingOccurrence.date` と同じ規約、`toIsoDate(toDate)` で日単位比較)。
- **`@@unique([courseId, date])`**: 同一 (科目, 日付) で重複登録不可。冪等。
- **既存 AttendanceRecord(status=CANCELLED) との共存**:
  - `CourseSuspension` は**事前に科目全体で**設定する一括登録 (例: 「来週月曜は休講」)
  - 個別 occurrence の `AttendanceRecord(status=CANCELLED)` は**事後に**「あの 1 コマだけ休講だった」と記録する手動マーク
  - 集計では**両者 OR で分母から除外** (どちらかが立てば denominator -1)。`computeCourseStats` 改修で実現。
- **`onDelete: Cascade`**: Course 削除で suspension も全削除。
- **migration**: SQLite で純粋な新規 table 追加。既存 row への影響なし。

### 2.2 Migration SQL

ファイル: `apps/api/prisma/migrations/20260528210000_v9_course_suspension/migration.sql`

```sql
-- v9: Course Suspension (一括休講日)

CREATE TABLE "CourseSuspension" (
  "id"        TEXT     NOT NULL PRIMARY KEY,
  "courseId"  TEXT     NOT NULL,
  "date"      DATETIME NOT NULL,
  "reason"    TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CourseSuspension_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CourseSuspension_courseId_date_key" ON "CourseSuspension"("courseId", "date");
CREATE INDEX        "CourseSuspension_courseId_idx"      ON "CourseSuspension"("courseId");
CREATE INDEX        "CourseSuspension_date_idx"          ON "CourseSuspension"("date");
```

**Developer 確認事項**:
- `pnpm --filter @atender/api exec prisma migrate dev --name v9_course_suspension` 実行後、生成 SQL に `REFERENCES "Course"` の `ON DELETE CASCADE` が含まれること
- `.env.test` の DB に対しても migration が冪等に流れること

---

## §3 Shared DTO 追加

### 3.1 `packages/shared/src/schemas/course.ts` 追加

```ts
import { z } from "zod";

// 既存 CourseCreateInput は維持

export const CourseSuspensionDto = z.object({
  id: z.string(),
  courseId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // YYYY-MM-DD (JST)
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CourseSuspensionCreateInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(100).optional(),
});

export type CourseSuspensionDto = z.infer<typeof CourseSuspensionDto>;
export type CourseSuspensionCreateInput = z.infer<typeof CourseSuspensionCreateInput>;
```

### 3.2 `packages/shared/src/schemas/stats.ts` 改修

```ts
export const CourseStatsDto = z.object({
  // ... 既存 ...
  counts: z.object({
    present: z.number().int(),
    absent: z.number().int(),
    excused: z.number().int(),
    tardy: z.number().int(),
    earlyLeave: z.number().int(),
    cancelled: z.number().int(),         // AttendanceRecord(status=CANCELLED) のみ
    suspended: z.number().int(),          // ★ v9 新規: CourseSuspension 由来 (occurrence date 一致)
    unrecorded: z.number().int(),
  }),
  // ... 残り既存 ...
});
```

`counts.cancelled` の意味は変えない (= `AttendanceRecord.status === "CANCELLED"` の件数のまま)。`counts.suspended` を**追加**し、CourseSuspension に該当する occurrence date の件数を別カウントで出す。集計時の分母除外は両方を OR で計算する (§5.3 参照)。

### 3.3 `packages/shared/src/schemas/semester.ts` 追加 (新規 file)

`semester.ts` が既存に無ければ追加、あれば追記。

```ts
import { z } from "zod";
import { CourseStatsDto } from "./stats.js";

// 月単位の出席カレンダー 1 日
export const AttendanceDaySummary = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum([
    "ALL_PRESENT",     // その日に occurrence があり、全て PRESENT 系
    "HAS_ABSENT",      // 1 件でも ABSENT
    "HAS_TARDY",       // ABSENT は無いが TARDY/EARLY_LEAVE あり
    "ALL_SUSPENDED",   // その日の occurrence 全てが休講 (CourseSuspension or status=CANCELLED)
    "PARTIAL_UNRECORDED",// 一部未記録
    "NO_CLASS",        // その日に occurrence が無い (休日含む)
  ]),
  occurrenceCount: z.number().int(),
});

export const SemesterOverviewDto = z.object({
  semesterId: z.string(),
  semesterName: z.string(),
  startDate: z.string(),  // YYYY-MM-DD
  endDate: z.string(),
  // 全体出席率
  overall: z.object({
    effectiveNumerator: z.number(),
    effectiveDenominator: z.number(),
    attendanceRate: z.number().nullable(),
  }),
  // 月単位出席カレンダー (学期の startDate ~ endDate に含まれる日)
  days: z.array(AttendanceDaySummary),
  // 科目一覧
  courses: z.array(CourseStatsDto),
});

export type AttendanceDaySummary = z.infer<typeof AttendanceDaySummary>;
export type SemesterOverviewDto = z.infer<typeof SemesterOverviewDto>;
```

### 3.4 `packages/shared/src/index.ts` 追加 export

`CourseSuspensionDto`, `CourseSuspensionCreateInput`, `AttendanceDaySummary`, `SemesterOverviewDto` を re-export する。

---

## §4 API endpoint

### 4.1 `apps/api/src/routes/courses.ts` 拡張

`registerCourseRoutes` に追加:

```ts
import { CourseSuspensionCreateInput } from "@atender/shared";
import {
  listSuspensions,
  createSuspension,
  deleteSuspension,
} from "../services/courseSuspension.service";

// GET /api/courses/:courseId/suspensions
app.get("/api/courses/:courseId/suspensions", sessionMiddleware, setupGuard, async (c) => {
  const courseId = c.req.param("courseId");
  const userId = c.get("user").id;
  const items = await listSuspensions({ courseId, userId });
  return c.json({ suspensions: items });
});

// POST /api/courses/:courseId/suspensions
app.post(
  "/api/courses/:courseId/suspensions",
  sessionMiddleware,
  setupGuard,
  zValidator("json", CourseSuspensionCreateInput),
  async (c) => {
    const courseId = c.req.param("courseId");
    const userId = c.get("user").id;
    const input = c.req.valid("json");
    const created = await createSuspension({ courseId, userId, date: input.date, reason: input.reason ?? null });
    return c.json({ suspension: created }, 201);
  },
);

// DELETE /api/courses/:courseId/suspensions/:id
app.delete("/api/courses/:courseId/suspensions/:id", sessionMiddleware, setupGuard, async (c) => {
  const courseId = c.req.param("courseId");
  const id = c.req.param("id");
  const userId = c.get("user").id;
  await deleteSuspension({ courseId, suspensionId: id, userId });
  return c.json({ ok: true });
});
```

**認可**: 各 endpoint 内で「`Course.userTimetable.userId === userId` であること」を assert する (`courseSuspension.service` 内で実装、§5.2)。

**エラー code 表**:

| code | status | 発生条件 |
|---|---|---|
| `NOT_FOUND` | 404 | courseId が存在しない or 他人の course |
| `VALIDATION_ERROR` | 400 | date 形式不正 (zod 段で弾かれる) |
| `DUPLICATE` | 409 | 同一 (courseId, date) で既に登録済 |
| `NOT_FOUND` | 404 | DELETE 対象の suspension が無い |

### 4.2 `apps/api/src/routes/semesters.ts` 拡張

```ts
import { getSemesterOverview } from "../services/semesterOverview.service";

app.get("/api/semesters/:id/overview", sessionMiddleware, setupGuard, async (c) => {
  const semesterId = c.req.param("id");
  const userId = c.get("user").id;
  const overview = await getSemesterOverview({ semesterId, userId });
  return c.json(overview);
});
```

**エラー code 表**:

| code | status | 発生条件 |
|---|---|---|
| `NOT_FOUND` | 404 | semester が無い or 他人の semester |

### 4.3 `apps/api/src/index.ts` への登録

新規 service が `routes/courses.ts` / `routes/semesters.ts` の中で参照されるだけなので、`index.ts` 自体への追加 register は**不要** (既存 `registerCourseRoutes` / `registerSemesterRoutes` の中で expand)。

---

## §5 Backend services

### 5.1 `apps/api/src/services/courseSuspension.service.ts` (新規)

```ts
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { APP_TZ } from "../lib/tz";

dayjs.extend(utc);
dayjs.extend(timezone);

export type SuspensionDto = {
  id: string;
  courseId: string;
  date: string;           // YYYY-MM-DD (JST)
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

async function assertOwnedCourse(courseId: string, userId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { userTimetable: true },
  });
  if (!course || course.userTimetable.userId !== userId) {
    throw new AppError(404, "NOT_FOUND", "Course not found");
  }
  return course;
}

function toJstStartOfDay(yyyyMmDd: string): Date {
  return dayjs.tz(`${yyyyMmDd} 00:00:00`, APP_TZ).utc().toDate();
}

function fromJstDateToIso(date: Date): string {
  return dayjs(date).tz(APP_TZ).format("YYYY-MM-DD");
}

function toDto(row: { id: string; courseId: string; date: Date; reason: string | null; createdAt: Date; updatedAt: Date }): SuspensionDto {
  return {
    id: row.id,
    courseId: row.courseId,
    date: fromJstDateToIso(row.date),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSuspensions(args: { courseId: string; userId: string }): Promise<SuspensionDto[]> {
  await assertOwnedCourse(args.courseId, args.userId);
  const rows = await prisma.courseSuspension.findMany({
    where: { courseId: args.courseId },
    orderBy: { date: "asc" },
  });
  return rows.map(toDto);
}

export async function createSuspension(args: {
  courseId: string;
  userId: string;
  date: string;
  reason: string | null;
}): Promise<SuspensionDto> {
  await assertOwnedCourse(args.courseId, args.userId);
  const dateUtc = toJstStartOfDay(args.date);
  try {
    const created = await prisma.courseSuspension.create({
      data: { courseId: args.courseId, date: dateUtc, reason: args.reason },
    });
    return toDto(created);
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
      throw new AppError(409, "DUPLICATE", "Already suspended on that date");
    }
    throw e;
  }
}

export async function deleteSuspension(args: {
  courseId: string;
  suspensionId: string;
  userId: string;
}): Promise<void> {
  await assertOwnedCourse(args.courseId, args.userId);
  const row = await prisma.courseSuspension.findUnique({ where: { id: args.suspensionId } });
  if (!row || row.courseId !== args.courseId) throw new AppError(404, "NOT_FOUND", "Suspension not found");
  await prisma.courseSuspension.delete({ where: { id: args.suspensionId } });
}
```

### 5.2 `apps/api/src/services/attendanceStats.ts` 改修

既存 `computeCourseStats` を以下のように改修する:

```ts
export async function computeCourseStats(args: {
  semesterId: string;
  userId: string;
  now?: Date;
}): Promise<CourseStatsDto[]> {
  const timetable = await prisma.userTimetable.findUnique({
    where: { userId_semesterId: { userId: args.userId, semesterId: args.semesterId } },
    include: {
      courses: {
        include: {
          occurrences: { include: { attendanceRecord: true } },
          suspensions: true,                     // ★ v9 新規
        },
      },
    },
  });
  if (!timetable) return [];

  const scope = await inferUserSchoolDepartment(args.userId);
  const effective = scope.schoolId && scope.departmentId
    ? (await getEffectiveRule({ schoolId: scope.schoolId, departmentId: scope.departmentId, userId: args.userId })).effective
    : systemDefaultRule;
  const todayIso = toIsoDate(args.now ?? new Date());

  return timetable.courses.map((course) => {
    const counts = { present: 0, absent: 0, excused: 0, tardy: 0, earlyLeave: 0, cancelled: 0, suspended: 0, unrecorded: 0 };
    const separateCounts: Partial<Record<AttendanceStatus, number>> = {};
    let numerator = 0;
    let denominatorReduction = 0;

    // ★ v9: course.suspensions の date set を作る
    const suspendedDateSet = new Set(course.suspensions.map((s) => toIsoDate(s.date)));

    for (const occurrence of course.occurrences) {
      const occIso = toIsoDate(occurrence.date);
      const record = occurrence.attendanceRecord;

      // ★ v9: CourseSuspension にマッチしたら強制的に分母除外 + suspended カウント
      if (suspendedDateSet.has(occIso)) {
        counts.suspended += 1;
        denominatorReduction += 1;
        continue;       // attendance record の有無に関わらずスキップ
      }

      if (!record) {
        if (occIso <= todayIso) counts.unrecorded += 1;
        continue;
      }
      if (record.status === "PRESENT") counts.present += 1;
      if (record.status === "ABSENT") counts.absent += 1;
      if (record.status === "EXCUSED") counts.excused += 1;
      if (record.status === "TARDY") counts.tardy += 1;
      if (record.status === "EARLY_LEAVE") counts.earlyLeave += 1;
      if (record.status === "CANCELLED") counts.cancelled += 1;

      const weight = statusWeight(record.status, effective);
      if (weight.separate) {
        separateCounts[record.status] = (separateCounts[record.status] ?? 0) + 1;
        denominatorReduction += 1;
      } else {
        numerator += weight.num;
        if (weight.den === 0) denominatorReduction += 1;
      }
    }

    const denominator = Math.max(0, course.totalSessions - denominatorReduction);
    return {
      courseId: course.id,
      courseName: course.name,
      totalSessions: course.totalSessions,
      generatedOccurrences: course.occurrences.length,
      counts,
      effectiveNumerator: numerator,
      effectiveDenominator: denominator,
      attendanceRate: denominator === 0 ? null : numerator / denominator,
      ...(Object.keys(separateCounts).length > 0 ? { separateCounts } : {}),
    };
  });
}
```

**設計判断**:
- **CourseSuspension > AttendanceRecord**: 同じ日に両方ある場合は CourseSuspension を優先 (= attendance record があっても無視して suspended に倒す)。理由: 「科目を休講」は科目全体に対する宣言で、個別の打刻より上位概念。
- **counts.cancelled は意味を変えない**: 既存の `AttendanceRecord.status === "CANCELLED"` (個別 occurrence の手動マーク) のみカウント。
- **counts.suspended を新設**: CourseSuspension に該当した occurrence の数。UI で「休講: N」と表示可能に。

### 5.3 `apps/api/src/services/semesterOverview.service.ts` (新規)

```ts
import { prisma } from "../db";
import { AppError } from "../lib/appError";
import { toIsoDate } from "../lib/tz";
import { computeCourseStats } from "./attendanceStats";
import type { SemesterOverviewDto, AttendanceDaySummary } from "@atender/shared";

export async function getSemesterOverview(args: {
  semesterId: string;
  userId: string;
}): Promise<SemesterOverviewDto> {
  const semester = await prisma.semester.findUnique({ where: { id: args.semesterId } });
  if (!semester || semester.userId !== args.userId) {
    throw new AppError(404, "NOT_FOUND", "Semester not found");
  }
  const courses = await computeCourseStats({ semesterId: args.semesterId, userId: args.userId });

  // 全体出席率 = sum(numerator) / sum(denominator)
  const overallNum = courses.reduce((a, c) => a + c.effectiveNumerator, 0);
  const overallDen = courses.reduce((a, c) => a + c.effectiveDenominator, 0);

  // 日別サマリ: semester.startDate ~ endDate の全日 × 各日の occurrence を集約
  const timetable = await prisma.userTimetable.findUnique({
    where: { userId_semesterId: { userId: args.userId, semesterId: args.semesterId } },
    include: {
      courses: {
        include: {
          occurrences: { include: { attendanceRecord: true } },
          suspensions: true,
        },
      },
    },
  });

  const days: AttendanceDaySummary[] = [];
  if (timetable) {
    // 1) 全 occurrence を date でグループ化
    const byDate = new Map<string, Array<{
      status: "PRESENT" | "ABSENT" | "EXCUSED" | "TARDY" | "EARLY_LEAVE" | "CANCELLED" | "SUSPENDED" | "UNRECORDED";
    }>>();
    for (const course of timetable.courses) {
      const suspended = new Set(course.suspensions.map((s) => toIsoDate(s.date)));
      for (const occ of course.occurrences) {
        const dateIso = toIsoDate(occ.date);
        const arr = byDate.get(dateIso) ?? [];
        if (suspended.has(dateIso)) {
          arr.push({ status: "SUSPENDED" });
        } else if (!occ.attendanceRecord) {
          arr.push({ status: "UNRECORDED" });
        } else {
          arr.push({ status: occ.attendanceRecord.status });
        }
        byDate.set(dateIso, arr);
      }
    }

    // 2) startDate ~ endDate を 1 日刻みで埋める
    const start = new Date(toIsoDate(semester.startDate) + "T00:00:00Z");
    const end = new Date(toIsoDate(semester.endDate) + "T00:00:00Z");
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
      const iso = toIsoDate(d);
      const items = byDate.get(iso) ?? [];
      days.push({
        date: iso,
        status: classifyDay(items),
        occurrenceCount: items.length,
      });
    }
  }

  return {
    semesterId: semester.id,
    semesterName: semester.name,
    startDate: toIsoDate(semester.startDate),
    endDate: toIsoDate(semester.endDate),
    overall: {
      effectiveNumerator: overallNum,
      effectiveDenominator: overallDen,
      attendanceRate: overallDen === 0 ? null : overallNum / overallDen,
    },
    days,
    courses,
  };
}

function classifyDay(items: Array<{ status: string }>): AttendanceDaySummary["status"] {
  if (items.length === 0) return "NO_CLASS";
  if (items.every((i) => i.status === "SUSPENDED" || i.status === "CANCELLED")) return "ALL_SUSPENDED";
  if (items.some((i) => i.status === "ABSENT")) return "HAS_ABSENT";
  if (items.some((i) => i.status === "TARDY" || i.status === "EARLY_LEAVE")) return "HAS_TARDY";
  if (items.some((i) => i.status === "UNRECORDED")) return "PARTIAL_UNRECORDED";
  // 残りは全 PRESENT or EXCUSED
  return "ALL_PRESENT";
}
```

### 5.4 既存 `routes/today.ts` の挙動 (変更なし、確認のみ)

`GET /api/today/occurrences` は v9 でも維持。`MainAttendanceCTA` がこれに依存している (Home self+timetable で再利用)。CourseSuspension が today の日付に一致する場合、**`useTodayOccurrences` の表示でも休講として disable する** ことを UI レイヤで行う (§7.4)。Backend では `today/occurrences` の payload は変更しない (= occurrence は出続けるが、UI 側で suspension マークを overlay)。

---

## §6 カラートークン改定 (emerald → orange)

### 6.1 styles.css の変更点 (差分)

ファイル: `apps/web/src/styles.css`

dark mode (`:root`) の差分:

```css
:root {
  /* ===== v9: accent = orange (Tailwind orange-500 系) ===== */
  --color-accent-50: rgba(249, 115, 22, 0.12);
  --color-accent-100: rgba(249, 115, 22, 0.20);
  --color-accent-500: #F97316;
  --color-accent-600: #FB923C;            /* dark bg 上で hover/secondary 用、明るめ */
  --color-accent-700: #FDBA74;

  /* status-present: accent と被るので 緑寄りに変える */
  --color-status-present: #34D399;        /* emerald-400 (dark bg で映える緑) */
  --color-status-absent:  #FF5C7A;        /* (既存維持) */
  --color-status-excused: #5AA9FF;        /* (既存維持) */
  --color-status-tardy:   #FFC93C;        /* (既存維持) */
  --color-status-early:   #C685FF;        /* (既存維持) */

  /* friendship-accepted: status-present に追従 */
  --color-friendship-accepted: #34D399;

  /* room-event: accent と被らない紫を維持 */
  --color-room-event: #C685FF;

  /* shadow / glow: accent 連動 */
  --shadow-glow:      0 0 24px rgba(249, 115, 22, 0.45), 0 0 48px rgba(249, 115, 22, 0.20);
  --shadow-glow-soft: 0 0 16px rgba(249, 115, 22, 0.28);

  /* on-accent text: 白の方が orange-500 上で AA 4.5:1 を満たす */
  --color-text-on-accent: #FFFFFF;
}
```

dark mode body の radial gradient も orange 系に差し替え:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) body {
    background:
      radial-gradient(1200px 700px at 50% -10%, rgba(249, 115, 22, 0.10), transparent 60%),
      radial-gradient(900px 600px at 90% 110%, rgba(198, 133, 255, 0.06), transparent 60%),
      var(--color-bg-base);
  }
}
:root[data-theme="dark"] body { /* 同上 */ }
```

light mode (`@media (prefers-color-scheme: light) :root:not([data-theme="dark"])` および `:root[data-theme="light"]`) の差分:

```css
/* light: 白背景上で AA 4.5:1 を満たす orange-600 を accent-500 にする */
--color-accent-50:  rgba(234, 88, 12, 0.10);
--color-accent-100: rgba(234, 88, 12, 0.18);
--color-accent-500: #EA580C;             /* orange-600 (light bg で読める) */
--color-accent-600: #C2410C;             /* orange-700 hover */
--color-accent-700: #9A3412;             /* orange-800 pressed */

--color-status-present: #059669;          /* emerald-600 (light bg、既存維持) */
--color-friendship-accepted: #059669;

--shadow-glow:      0 0 20px rgba(234, 88, 12, 0.32);
--shadow-glow-soft: 0 0 12px rgba(234, 88, 12, 0.22);

--color-text-on-accent: #FFFFFF;          /* 白テキストで OK (#EA580C 上で 4.6:1) */
```

**`@theme { ... }` ブロックの mapping は変更不要** (= `--color-accent-500: var(--color-accent-500)` のままで、値だけ swap される)。

### 6.2 個別 component に書かれた hard-coded emerald 値の sweep

以下を grep して**実色が直書きされていれば** token に置換する (Developer 担当):

```
grep -rn -E "#10EB99|#059669|emerald-(50|100|400|500|600|700|800)" apps/web/src/
```

期待値: **0 件** (全 component は token 経由で参照しているはず)。1 件でも引っかかった場合は token に書き換える。

### 6.3 status-present の色変更による波及

- `OccurrenceLyricCard` (Today): status badge は `--color-status-present` 参照、自動で緑に
- `MainAttendanceCTA` の「全て出席」CTA: `bg-accent-500` のまま orange になる (旧緑 → orange)
- `BottomTab` active アイコン: `bg-accent-500` のまま orange
- 出席率の進捗バー (`CourseListItem` / `SemesterOverview` の全体出席率): **accent (orange) ではなく status-present (緑)** を使う。理由: 「出席率が高い = ポジティブ」を緑で表現したい、orange は accent/CTA で温存。詳細は §7.3 参照。

---

## §7 UI/UX 設計 (全画面 ASCII モック + 挙動仕様)

### 7.1 ナビゲーション (5 タブ)

#### 7.1.1 旧 → 新 マッピング

| 旧 route | 旧 タブ位置 | 新 route | 新 タブ位置 | 備考 |
|---|---|---|---|---|
| `/` (Today) | 1 (ホーム) | `/` (Home) | 1 (ホーム) | 内部 component 差し替え |
| `/timetable` | 2 (時間割) | (削除) | - | Home/self/timetable に統合 |
| `/rooms` | 3 (ルーム) | `/rooms` | 3 (ルーム) | 変更なし |
| `/friends` | 4 (友達) | `/friends` | 4 (友達) | 変更なし |
| (なし) | - | `/semester` | 2 (学期・科目) | 新規。`/stats` の上位互換 |
| `/stats` | 別 (AvatarMenu) | (redirect to `/semester`) | - | 互換のため 301 |
| (なし、AvatarMenu内) | - | `/settings` | 5 (設定) | AvatarMenu 廃止、ここに全項目 |
| `/settings/calendar` | (アバターメニュー) | `/settings/calendar` | (Settings 内リンク) | route 維持、Settings から開く |
| `/settings/integrations/google` | 同上 | 同上 | 同上 | 維持 (Google linkSocial callback で必要) |
| `/me` | redirect | `/me` redirect to `/settings` | - | 旧 `/` から `/settings` に変更 |
| `/setup` / `/signin` / `/verify` / `/rooms/$id` / `/rooms/join/$inviteCode` / `/friends/add/$inviteCode` | - | (変更なし) | - | |

#### 7.1.2 navItems.ts 新規実装

ファイル: `apps/web/src/components/layout/navItems.ts`

```ts
import { Calendar, GraduationCap, Users, UserCircle, Settings as SettingsIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const navItems: readonly NavItem[] = [
  { to: "/",         label: "ホーム",       icon: Calendar },
  { to: "/semester", label: "学期・科目",   icon: GraduationCap },
  { to: "/rooms",    label: "ルーム",       icon: Users },
  { to: "/friends",  label: "友達",         icon: UserCircle },
  { to: "/settings", label: "設定",         icon: SettingsIcon },
] as const;

export function isActivePath(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
```

**icon 選定根拠**:
- `Calendar`: ホーム (= 今日 + 自分の予定の中心)
- `GraduationCap`: 学期・科目 (= 学業統計)。`BarChart3` も候補だったが「学校感」を出す方を優先
- `Users`: ルーム (既存維持)
- `UserCircle`: 友達 (旧 `Sparkles` から変更、より人間関係を示すアイコン)
- `Settings`: 設定 (= 旧 AvatarMenu)

#### 7.1.3 BottomTab.tsx (差分)

5 等分のレイアウトはそのまま (`flex-1` のおかげで自動)。**ファイル差分は 0 行** (navItems.ts の中身が変わるだけで自動的に 5 タブ表示になる)。

#### 7.1.4 SideNav.tsx (差分)

同上、`navItems.ts` 経由なので**ファイル差分は 0 行**。表示は 5 タブに自動拡張。

#### 7.1.5 TopBar.tsx (差分)

```tsx
// 旧
import { AvatarMenu } from "@/components/avatar/AvatarMenu";
// ... <AvatarMenu /> を右端に出していた
```

**新**: AvatarMenu の import / 描画を削除。TopBar 右側は空 or 画面ごとの ⚙ ボタン (`children` slot で渡せるよう改修)。

```tsx
export function TopBar({ leading, title, trailing }: { leading?: ReactNode; title?: string; trailing?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-bg-base/70 px-5 backdrop-blur-xl md:h-16 md:px-8" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex min-w-0 items-center gap-3">
        {leading ?? (<Link to="/" className="text-xl font-black tracking-tight text-fg-primary md:hidden">atender</Link>)}
        {title ? <h1 className="truncate text-lg font-bold text-fg-primary">{title}</h1> : null}
      </div>
      {trailing ?? null}
    </header>
  );
}
```

**呼び出し側**: 現状 `AppLayout.tsx` で `<TopBar />` を出しているだけ。各画面で必要なら `trailing` slot に⚙等を渡せるようにするが、**v9 では呼び出し側で trailing 指定する画面なし** (各画面は自身の中で⚙ボタンを出す)。

### 7.2 ホーム画面 `/` (Home)

#### 7.2.1 Mobile ASCII モック (375 × 812)

```
┌──────────────────────────────────────┐
│ atender                              │  ← TopBar (h-14, sticky)
├──────────────────────────────────────┤
│  ◯自分     ◯Room1   ◯Room2   ◯+      │  ← ContextChips (horizontal scroll, h-12)
│ ════════════                          │     active chip は accent ring + bg
├──────────────────────────────────────┤
│  ┌──────────┐┌──────────┐           │  ← HomeViewModeTabs (segmented, h-10)
│  │ 時間割 ✓ ││ カレンダー │           │     bg-bg-muted の pill
│  └──────────┘└──────────┘            │
├──────────────────────────────────────┤
│ 2026 前期 ▼                          │  ← HomeSemesterPicker (text-lg font-bold)
├──────────────────────────────────────┤
│                                      │
│  [DayList or RoomCalendar 等]        │  ← HomeBody (flex-1, overflow-y-auto)
│                                      │
│                                      │
│                                      │
├──────────────────────────────────────┤
│  ┌────────────────────────────────┐ │  ← MainAttendanceCTA
│  │     今日は全出席 (3)       ▼ │ │     self + timetable のみ表示
│  └────────────────────────────────┘ │     bottom: var(--tab-bar-height)
├──────────────────────────────────────┤
│  ホーム  学期  ルーム  友達  設定   │  ← BottomTab (h-20)
└──────────────────────────────────────┘
```

#### 7.2.2 PC ASCII モック (≥ md, 1280 × 800)

```
┌──────────┬─────────────────────────────────────────────────┐
│ atender  │ atender                          (TopBar、trailing 空) │
│          ├─────────────────────────────────────────────────┤
│ ホーム ✓ │  ◯自分     ◯Room1   ◯Room2   ◯+    ← chips (max 横一列) │
│ 学期・科目│  ┌─────┐┌──────┐                                       │
│ ルーム    │  │時間割││カレンダー│   2026 前期 ▼                     │
│ 友達      │  └─────┘└──────┘                                       │
│ 設定      ├─────────────────────────────────────────────────┤
│          │  ┌─────────────────────────────────────────┐    │
│          │  │  TimetableGrid (7列 × N行 + sticky top) │    │
│          │  │                                         │    │
│          │  └─────────────────────────────────────────┘    │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │   全て出席 (3)            ▼              │  ← sticky top (PC は inline)
│          │  └─────────────────────────────────────────┘    │
└──────────┴─────────────────────────────────────────────────┘
```

#### 7.2.3 component 構成 (mobile/PC 共通)

```
<Home>
  <ContextChips
    items={[
      { kind: "self", label: "自分" },
      ...roomMemberships.map(m => ({ kind: "room", roomId: m.roomId, roomName: m.room.name })),
    ]}
    selected={context}
    onChange={setContext}
    onAddRoom={() => navigate("/rooms")}    // + chip タップでルーム一覧へ
  />
  <HomeViewModeTabs mode={mode} onChange={setMode} />
  {context.kind === "self" ? (
    <HomeSemesterPicker
      semesterId={semesterId}
      onChange={setSemesterId}
    />
  ) : null}
  <HomeBody
    context={context}
    mode={mode}
    semesterId={semesterId}
  />
  {context.kind === "self" && mode === "timetable" ? (
    <MainAttendanceCTA ... />     // 既存 component を再利用
  ) : null}
</Home>
```

#### 7.2.4 ContextChips の挙動仕様

ファイル: `apps/web/src/components/home/ContextChips.tsx`

```tsx
type ChipItem =
  | { kind: "self"; label: string }
  | { kind: "room"; roomId: string; roomName: string };

type Props = {
  items: readonly ChipItem[];
  selected: { kind: "self" } | { kind: "room"; roomId: string };
  onChange: (next: Props["selected"]) => void;
  onAddRoom: () => void;
};

export function ContextChips({ items, selected, onChange, onAddRoom }: Props) {
  return (
    <div className="-mx-5 overflow-x-auto overscroll-x-contain px-5 py-2" data-testid="context-chips">
      <ul className="flex w-max gap-2">
        {items.map((item) => {
          const active =
            (item.kind === "self" && selected.kind === "self") ||
            (item.kind === "room" && selected.kind === "room" && selected.roomId === item.roomId);
          const label = item.kind === "self" ? item.label : item.roomName;
          return (
            <li key={item.kind === "self" ? "self" : item.roomId}>
              <button
                type="button"
                onClick={() => onChange(item.kind === "self" ? { kind: "self" } : { kind: "room", roomId: item.roomId })}
                aria-pressed={active}
                className={`flex h-10 items-center rounded-full border px-4 text-sm font-bold transition active:scale-[0.97] ${
                  active
                    ? "border-accent-500 bg-accent-500/15 text-accent-500 shadow-glow-soft"
                    : "border-border-subtle bg-bg-elevated text-fg-secondary hover:bg-fg-primary/6"
                }`}
              >
                {item.kind === "self" ? <SelfIcon /> : <RoomIcon />}
                <span className="ml-2 max-w-[14ch] truncate">{label}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onAddRoom}
            aria-label="ルームを追加"
            className="grid h-10 w-10 place-items-center rounded-full border border-border-subtle bg-bg-elevated text-fg-tertiary hover:bg-fg-primary/6"
          >
            +
          </button>
        </li>
      </ul>
    </div>
  );
}
```

**挙動**:
- horizontal scroll、両端 padding 20px (`-mx-5 px-5`)
- 「自分」chip は常に先頭、`SelfIcon` (lucide `User`) 付き
- Room chips は `useRooms()` の結果順 (= API 返却順、現状 `createdAt asc`)
- 末尾の `+` ボタンタップで `/rooms` route に遷移
- chip タップで `onChange` 発火、URL は変えない (state のみ)
- active chip は accent 色のリング + 薄塗りで強調 (WCAG 1.4.11 適合の orange-500)
- 1 行で 4 chip まで mobile で見えれば良い (`max-w-[14ch]` truncate)

#### 7.2.5 HomeViewModeTabs の挙動仕様

ファイル: `apps/web/src/components/home/HomeViewModeTabs.tsx`

既存 `RoomDetail.tsx` の segmented と同じ DOM 構造を採用:

```tsx
type Mode = "timetable" | "calendar";
type Props = { mode: Mode; onChange: (m: Mode) => void };

export function HomeViewModeTabs({ mode, onChange }: Props) {
  return (
    <div className="flex rounded-full bg-bg-muted p-1" role="tablist">
      {(["timetable", "calendar"] as const).map((item) => (
        <button
          key={item}
          role="tab"
          aria-selected={mode === item}
          onClick={() => onChange(item)}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition ${
            mode === item ? "bg-accent-500 text-fg-on-accent shadow-glow-soft" : "text-fg-secondary hover:bg-fg-primary/6"
          }`}
        >
          {item === "timetable" ? "時間割" : "カレンダー"}
        </button>
      ))}
    </div>
  );
}
```

#### 7.2.6 HomeSemesterPicker の挙動仕様

ファイル: `apps/web/src/components/home/HomeSemesterPicker.tsx`

```tsx
type Props = { semesterId: string | null; onChange: (id: string) => void };

export function HomeSemesterPicker({ semesterId, onChange }: Props) {
  const semesters = useSemesters();
  const current = semesters.data?.semesters.find((s) => s.id === semesterId) ?? semesters.data?.semesters[0];
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-lg font-bold text-fg-primary hover:text-accent-500"
      >
        {current?.name ?? "学期を選択"} <ChevronDown className="h-4 w-4" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="学期を選択">
        <ul className="space-y-1">
          {(semesters.data?.semesters ?? []).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => { onChange(s.id); setOpen(false); }}
                className={`block w-full rounded-2xl px-4 py-3 text-left text-base font-bold transition ${
                  s.id === current?.id ? "bg-accent-500/15 text-accent-500" : "hover:bg-fg-primary/6"
                }`}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
```

**挙動**:
- 表示は `<button>{name} ▼</button>` のみ (text-lg font-bold)
- タップで BottomSheet が開き、ユーザーの全学期一覧
- 学期選択 → `onChange(id)` → state 更新 → sheet close
- `current` は `me.defaultSemesterId` 由来でも良いが、本 component の責務は state 反映のみ。Home コンポーネント側で `semesterId` を `useMe().data?.user.defaultSemesterId` で初期化する

#### 7.2.7 HomeBody の dispatcher 仕様

ファイル: `apps/web/src/components/home/HomeBody.tsx`

```tsx
type Props = {
  context: { kind: "self" } | { kind: "room"; roomId: string };
  mode: "timetable" | "calendar";
  semesterId: string | null;
};

export function HomeBody({ context, mode, semesterId }: Props) {
  if (context.kind === "self") {
    if (mode === "timetable") return <SelfTimetableView semesterId={semesterId} />;
    return <PersonalCalendar semesterId={semesterId} />;
  }
  if (mode === "timetable") return <RoomTimetable roomId={context.roomId} />;
  return <RoomCalendar roomId={context.roomId} />;
}
```

`SelfTimetableView` は v8 までの `routes/Timetable.tsx` のロジックを抽出した内部 component。`semesterId` を取り、`useUserTimetables()` から該当 timetable を選び、DayList (mobile) / TimetableGrid (PC) を出す。**`routes/Timetable.tsx` のコード本体をそのままここに移植する** (新規実装ではなく移管)。

#### 7.2.8 PersonalCalendar の仕様 (新規アダプタ)

ファイル: `apps/web/src/components/home/PersonalCalendar.tsx`

「自分のカレンダー」は **自分の MeetingOccurrence を出席ステータスとともに描画** する。既存 `CalendarMonth` / `CalendarWeek` / `CalendarDay` (rooms/calendar/) は `events: CalendarEvent[]` を受け取る generic 描画 component なので、event 列を組み立てるアダプタを書く。

```tsx
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useStats, useUserTimetables, useSemesterOverview } from "@/api/hooks";
import { CalendarMonth } from "@/components/rooms/calendar/CalendarMonth";
import { CalendarWeek } from "@/components/rooms/calendar/CalendarWeek";
import { CalendarDay } from "@/components/rooms/calendar/CalendarDay";
import { CalendarSegmented } from "@/components/rooms/calendar/CalendarSegmented";
import { PeriodNav } from "@/components/rooms/calendar/PeriodNav";
import { weekStartsFor, type CalendarViewMode } from "@/lib/calendarRange";
import type { CalendarEvent } from "@/lib/meetingExpansion";

type Props = { semesterId: string | null };

export function PersonalCalendar({ semesterId }: Props) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [anchor, setAnchor] = useState(() => dayjs().startOf("day"));
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format("YYYY-MM-DD"));

  const overview = useSemesterOverview(semesterId);

  // overview.days を CalendarEvent[] に変換 (1 day = 1 event 風、kind は personal)
  const events = useMemo<CalendarEvent[]>(() => {
    return (overview.data?.days ?? []).flatMap((d) => {
      if (d.status === "NO_CLASS") return [];
      return [{
        kind: "personal",
        eventId: `personal:${d.date}`,
        date: d.date,
        title: dayStatusLabel(d.status),
        startMinute: 0,
        endMinute: 0,
        authorName: "自分",
        authorColor: dayStatusColor(d.status),
        occurrenceDate: d.date,
      }];
    });
  }, [overview.data?.days]);

  // ... (RoomCalendar と同じ流儀で 3 viewMode をレンダリング)
}
```

**色マッピング**:

| `AttendanceDaySummary.status` | 色 |
|---|---|
| `ALL_PRESENT` | `var(--color-status-present)` (緑) |
| `HAS_ABSENT` | `var(--color-status-absent)` (赤) |
| `HAS_TARDY` | `var(--color-status-tardy)` (黄) |
| `ALL_SUSPENDED` | `var(--color-status-cancelled)` (灰、半透明) |
| `PARTIAL_UNRECORDED` | `var(--color-status-none)` |

**PersonalCalendar 制限事項** (v9 範囲):
- 予定追加ボタンは出さない (個人カレンダーは閲覧専用)
- 日タップ → 当日の occurrence + 出席状態を `<DayEventList>` で表示 (`RoomCalendar` の `DayEventList` パターンを再利用)
- `CalendarEvent` 型は `kind: "meeting" | "event" | "personal"` の union を追加 (既存 2 種に "personal" を新設)。`meetingExpansion.ts` の型定義に 1 行追加。

#### 7.2.9 Home.tsx 本体

ファイル: `apps/web/src/components/home/Home.tsx`

```tsx
import { useMemo, useState } from "react";
import { useMe, useRooms } from "@/api/hooks";
import { ContextChips } from "./ContextChips";
import { HomeViewModeTabs } from "./HomeViewModeTabs";
import { HomeSemesterPicker } from "./HomeSemesterPicker";
import { HomeBody } from "./HomeBody";
import { MainAttendanceCTA } from "@/components/today/MainAttendanceCTA";
// ... (markAll / patchAttendance / today occurrences の hook 既存維持)

type HomeContext = { kind: "self" } | { kind: "room"; roomId: string };

export function Home() {
  const me = useMe();
  const rooms = useRooms();
  const [context, setContext] = useState<HomeContext>({ kind: "self" });
  const [mode, setMode] = useState<"timetable" | "calendar">("timetable");
  const [semesterId, setSemesterId] = useState<string | null>(me.data?.user.defaultSemesterId ?? null);
  const navigate = useNavigate();

  const chips = useMemo(() => {
    const out: Array<{ kind: "self"; label: string } | { kind: "room"; roomId: string; roomName: string }> = [
      { kind: "self", label: "自分" },
    ];
    for (const r of rooms.data?.rooms ?? []) out.push({ kind: "room", roomId: r.id, roomName: r.name });
    return out;
  }, [rooms.data?.rooms]);

  return (
    <div className="space-y-3 pb-32 md:pb-0">
      <ContextChips
        items={chips}
        selected={context}
        onChange={setContext}
        onAddRoom={() => void navigate({ to: "/rooms" })}
      />
      <HomeViewModeTabs mode={mode} onChange={setMode} />
      {context.kind === "self" ? (
        <HomeSemesterPicker semesterId={semesterId} onChange={setSemesterId} />
      ) : null}
      <HomeBody context={context} mode={mode} semesterId={semesterId} />
      {context.kind === "self" && mode === "timetable" ? <SelfTodayCTA /> : null}
    </div>
  );
}
```

`<SelfTodayCTA />` は内部で `useTodayOccurrences` + `MainAttendanceCTA` を呼ぶ薄い wrapper。`Today.tsx` から該当ロジックを抽出する。

### 7.3 学期・科目タブ `/semester` (SemesterOverview)

#### 7.3.1 ASCII モック (mobile)

```
┌──────────────────────────────────────┐
│ atender                              │
├──────────────────────────────────────┤
│ 2026 前期 ▼            期間 4/1 〜9/30 │  ← HomeSemesterPicker 再利用 + 期間表示
├──────────────────────────────────────┤
│ 全体の出席率                          │
│                                      │
│      ┌──────┐                        │
│      │  97% │   (104 / 108)          │  ← 大きい数字 (text-5xl font-black)
│      └──────┘                        │     (status-present 緑)
│                                      │
├──────────────────────────────────────┤
│        [AttendanceCalendar 月view]   │  ← 月単位カレンダー
│    日 月 火 水 木 金 土               │     色塗り: 緑(出席) / 赤(欠席) / 灰(休講)
│        1  2  3  4  5  6              │
│     7  8  9 10 11 12 13              │
│    14 15 16 17 18 19 20              │
│    21 22 23 24 25 26 27              │
│    28 29 30                          │
├──────────────────────────────────────┤
│ 科目一覧                              │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐│
│ │ 数学III           出席率 96%     ▌│ │← CourseListItem (tap で modal)
│ │ 田中先生                          ││
│ └──────────────────────────────────┘│
│ ┌──────────────────────────────────┐│
│ │ 現代文            出席率 80%     ▌│ │
│ │ 竹本先生                          ││
│ └──────────────────────────────────┘│
│ ┌──────────────────────────────────┐│
│ │ 物理              出席率 96%     ▌│ │
│ │ 山田先生                          ││
│ └──────────────────────────────────┘│
├──────────────────────────────────────┤
│  ホーム  学期  ルーム  友達  設定   │
└──────────────────────────────────────┘
```

#### 7.3.2 ASCII モック (PC ≥ md)

```
┌──────────┬─────────────────────────────────────────────────┐
│ atender  │ atender                                          │
│          │ 2026 前期 ▼              期間 4/1 〜 9/30        │
│ ホーム   ├─────────────────────────────────────────────────┤
│ 学期 ✓   │ 全体の出席率           [AttendanceCalendar 月] │
│ ルーム   │  ┌──────┐                  日 月 火 水 木 金 土 │
│ 友達     │  │ 97 %│                                       │
│ 設定     │  └──────┘                                       │
│          │  104 / 108                                      │
│          ├─────────────────────────────────────────────────┤
│          │ 科目一覧                                         │
│          │ ┌────────────────────┐ ┌────────────────────┐  │
│          │ │ 数学III    96 %  ▌ │ │ 現代文     80 % ▌  │  │
│          │ │ 田中先生           │ │ 竹本先生           │  │
│          │ └────────────────────┘ └────────────────────┘  │
│          │ ┌────────────────────┐                          │
│          │ │ 物理       96 % ▌  │                          │
│          │ │ 山田先生            │                          │
│          │ └────────────────────┘                          │
└──────────┴─────────────────────────────────────────────────┘
```

PC では「全体出席率 + AttendanceCalendar」を 2 カラムに、「科目一覧」を 2 カラム grid で並べる (`grid-cols-1 md:grid-cols-2`)。

#### 7.3.3 SemesterOverview.tsx 本体

ファイル: `apps/web/src/components/semester/SemesterOverview.tsx`

```tsx
export function SemesterOverview() {
  const me = useMe();
  const [semesterId, setSemesterId] = useState<string | null>(me.data?.user.defaultSemesterId ?? null);
  const overview = useSemesterOverview(semesterId);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);

  if (overview.isLoading) return <Panel>読み込み中...</Panel>;
  if (!overview.data) return <Panel>学期を選択してください。</Panel>;

  const { startDate, endDate, overall, days, courses } = overview.data;

  return (
    <div className="space-y-6 pb-8">
      <header className="flex items-baseline justify-between gap-3">
        <HomeSemesterPicker semesterId={semesterId} onChange={setSemesterId} />
        <p className="text-xs text-fg-tertiary">
          期間 {formatJp(startDate)} 〜 {formatJp(endDate)}
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <OverallRateCard overall={overall} />
        <AttendanceCalendar
          days={days}
          startDate={startDate}
          endDate={endDate}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">科目一覧</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {courses.map((c) => (
            <li key={c.courseId}>
              <CourseListItem stats={c} onClick={() => setOpenCourseId(c.courseId)} />
            </li>
          ))}
          {courses.length === 0 ? <Panel>科目がまだありません</Panel> : null}
        </ul>
      </section>

      <CourseDetailModal
        courseId={openCourseId}
        onClose={() => setOpenCourseId(null)}
      />
    </div>
  );
}
```

#### 7.3.4 OverallRateCard

```tsx
function OverallRateCard({ overall }: { overall: SemesterOverviewDto["overall"] }) {
  const pct = overall.attendanceRate == null ? null : Math.round(overall.attendanceRate * 100);
  return (
    <div className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <p className="text-sm font-bold text-fg-secondary">全体の出席率</p>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-5xl font-black tabular-nums" style={{ color: "var(--color-status-present)" }}>
          {pct == null ? "—" : pct}
        </span>
        <span className="text-2xl font-bold" style={{ color: "var(--color-status-present)" }}>%</span>
      </p>
      <p className="mt-1 text-xs text-fg-tertiary tabular-nums">
        {overall.effectiveNumerator} / {overall.effectiveDenominator}
      </p>
    </div>
  );
}
```

**色決定**:
- 全体出席率の数字は `status-present` (緑)。orange と並べて視覚的に「肯定値」を表現
- 数値が null (= 分母 0) なら「—」で fallback

#### 7.3.5 AttendanceCalendar

ファイル: `apps/web/src/components/semester/AttendanceCalendar.tsx`

```tsx
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { AttendanceDaySummary } from "@atender/shared";

type Props = {
  days: AttendanceDaySummary[];
  startDate: string;
  endDate: string;
};

export function AttendanceCalendar({ days, startDate, endDate }: Props) {
  const [anchor, setAnchor] = useState(() => dayjs(startDate).startOf("month"));
  const daysByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const monthStart = anchor.startOf("month");
  const gridStart = monthStart.startOf("week");                          // 日曜起点
  const gridEnd   = monthStart.endOf("month").endOf("week");
  const cells: dayjs.Dayjs[] = [];
  for (let d = gridStart; d.isBefore(gridEnd) || d.isSame(gridEnd); d = d.add(1, "day")) cells.push(d);

  return (
    <div className="rounded-3xl bg-bg-elevated p-4 shadow-card">
      <header className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setAnchor(anchor.subtract(1, "month"))}
          disabled={anchor.isSame(dayjs(startDate), "month")}
          className="grid h-8 w-8 place-items-center rounded-full hover:bg-fg-primary/6 disabled:opacity-30"
        >
          ‹
        </button>
        <h3 className="text-base font-bold">{anchor.format("YYYY年 M月")}</h3>
        <button
          type="button"
          onClick={() => setAnchor(anchor.add(1, "month"))}
          disabled={anchor.isSame(dayjs(endDate), "month")}
          className="grid h-8 w-8 place-items-center rounded-full hover:bg-fg-primary/6 disabled:opacity-30"
        >
          ›
        </button>
      </header>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-fg-tertiary">
        {["日", "月", "火", "水", "木", "金", "土"].map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const iso = d.format("YYYY-MM-DD");
          const summary = daysByDate.get(iso);
          const inMonth = d.isSame(monthStart, "month");
          return (
            <DayCell key={iso} date={d} summary={summary} faded={!inMonth} />
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

function DayCell({ date, summary, faded }: { date: dayjs.Dayjs; summary?: AttendanceDaySummary; faded: boolean }) {
  const dot = summary ? dotForStatus(summary.status) : null;
  return (
    <div className={`relative aspect-square rounded-lg border border-border-subtle/40 p-1 text-[11px] tabular-nums ${faded ? "opacity-30" : ""}`}>
      <span className="text-fg-secondary">{date.date()}</span>
      {dot ? <span className="absolute bottom-1 right-1 text-base leading-none">{dot}</span> : null}
    </div>
  );
}

function dotForStatus(status: AttendanceDaySummary["status"]): string | null {
  switch (status) {
    case "ALL_PRESENT":         return "○";   // 緑
    case "HAS_ABSENT":          return "×";   // 赤
    case "HAS_TARDY":           return "△";   // 黄
    case "ALL_SUSPENDED":       return "／";  // 斜線 (休講)
    case "PARTIAL_UNRECORDED":  return "·";   // 灰、未記録あり
    case "NO_CLASS":            return null;
  }
}

function Legend() { /* ○ 出席 / × 欠席 / △ 遅刻 / ／ 休講 / · 未記録 */ }
```

**挙動**:
- 月単位表示、`‹` / `›` で前後月へ。学期の `startDate` / `endDate` の月をはみ出すボタンは disabled
- 7 × 6 grid。月の前後 (faded) はグレーアウト + 30% opacity
- マーカーは UTF-8 シンボル 1 文字 + 色 (`color: var(--color-status-*)` を span に inline)
  - ○ `status-present` (緑)
  - × `status-absent` (赤)
  - △ `status-tardy` (黄)
  - ／ `status-cancelled` (灰)
  - · `status-none` (薄灰)
- セルタップ等は v9 ではノーアクション (= 閲覧専用)
- Legend は下端に小さく凡例 (4 ヶ条) を出す

#### 7.3.6 CourseListItem

ファイル: `apps/web/src/components/semester/CourseListItem.tsx`

```tsx
import type { CourseStatsDto } from "@atender/shared";

type Props = { stats: CourseStatsDto; onClick: () => void };

export function CourseListItem({ stats, onClick }: Props) {
  const pct = stats.attendanceRate == null ? null : Math.round(stats.attendanceRate * 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-bg-elevated p-4 text-left shadow-card transition hover:bg-fg-primary/4 active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold text-fg-primary">{stats.courseName}</p>
        <p className="mt-0.5 truncate text-xs text-fg-tertiary">{teacherDisplay(stats)}</p>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[10px] font-bold text-fg-tertiary">出席率</span>
        <span className="text-3xl font-black tabular-nums" style={{ color: pctColor(pct) }}>
          {pct == null ? "—" : pct}
          <span className="ml-0.5 text-base font-bold">%</span>
        </span>
      </div>
    </button>
  );
}

function pctColor(pct: number | null): string {
  if (pct == null) return "var(--color-fg-tertiary)";
  if (pct >= 80) return "var(--color-status-present)";
  if (pct >= 60) return "var(--color-status-tardy)";
  return "var(--color-status-absent)";
}

function teacherDisplay(stats: CourseStatsDto): string {
  // CourseStatsDto に teacher が含まれていなければ別 hook で補う
  // (現状 CourseStatsDto には teacher 無いので、§3.3 で stats に追加するか useUserTimetables() で join する)
  return ""; // (実装時に teacher 名を渡す: §3.3 で CourseStatsDto に teacher 追加)
}
```

**`teacher` 表示について**: 既存 `CourseStatsDto` には `teacher` フィールドが無い。v9 で追加する:

```ts
// shared/schemas/stats.ts (§3.2 への追記)
export const CourseStatsDto = z.object({
  // ... 既存 ...
  teacher: z.string().nullable(),     // ★ v9 新規 (UI 表示用)
  // ... 既存 ...
});
```

`computeCourseStats` 内で `course.teacher` を return オブジェクトに追加する (1 行)。

#### 7.3.7 CourseDetailModal の仕様

ファイル: `apps/web/src/components/semester/CourseDetailModal.tsx`

```tsx
type Props = { courseId: string | null; onClose: () => void };

export function CourseDetailModal({ courseId, onClose }: Props) {
  const open = courseId != null;
  return (
    <FullScreenModal open={open} onClose={onClose} title="科目">
      {courseId ? <CourseDetailBody courseId={courseId} onClose={onClose} /> : null}
    </FullScreenModal>
  );
}
```

**`<FullScreenModal>` は v9 新規**: 既存 `BottomSheet` は mobile 専用 / 上部余白を残す UI なのに対し、Touri 指示 = 「全画面モーダル」なので新 component を作る。

ファイル: `apps/web/src/components/ui/FullScreenModal.tsx`

```tsx
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function FullScreenModal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1100] flex flex-col bg-bg-base">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border-subtle bg-bg-base/85 px-5 backdrop-blur-xl">
        <h2 className="truncate text-lg font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-full hover:bg-fg-primary/6">
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </div>,
    document.body,
  );
}
```

**FullScreenModal の close 経路 (3 通り)** (`knowledge/pattern/modal-sheet-base-component-3way-close.md` 準拠):
1. 右上 `×` ボタンタップ
2. `Escape` キー押下 (PC)
3. 背景 overlay タップ — v9 では**全画面表示なので backdrop が無い**ため、左上に「戻る」ボタンも追加検討 → mobile では `<` (chevron-left) を `<X>` の代わりに左端に置いた方が iOS HIG (Modal 左上戻る) に合う。**v9 採用: 右上 × は維持、加えて mobile では左上に `<` (戻る) も置く** (clickable 領域を 2 つ)。

最終 header DOM:
```tsx
<header className="...flex h-14 items-center gap-3 ...">
  <button onClick={onClose} aria-label="戻る" className="grid h-10 w-10 place-items-center rounded-full hover:bg-fg-primary/6 md:hidden">
    <ChevronLeft className="h-5 w-5" />
  </button>
  <h2 className="flex-1 truncate text-lg font-bold">{title}</h2>
  <button onClick={onClose} aria-label="閉じる" className="grid h-10 w-10 place-items-center rounded-full hover:bg-fg-primary/6">
    <X className="h-5 w-5" />
  </button>
</header>
```

#### 7.3.8 CourseDetailBody (Modal 中身)

```tsx
function CourseDetailBody({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const me = useMe();
  const semesterId = me.data?.user.defaultSemesterId ?? null;
  const tt = useUserTimetables();
  const course = useMemo(() => {
    for (const t of tt.data?.userTimetables ?? []) {
      const c = t.courses.find((x) => x.id === courseId);
      if (c) return { course: c, timetableId: t.id };
    }
    return null;
  }, [tt.data, courseId]);

  if (!course) return <Panel>科目が見つかりません</Panel>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <CourseEditSection course={course.course} timetableId={course.timetableId} />
      <CourseSuspensionSection courseId={courseId} />
      <CourseOccurrenceHistory courseId={courseId} semesterId={semesterId} />
      <DangerZone courseId={courseId} onDeleted={onClose} />
    </div>
  );
}
```

##### 7.3.8.1 CourseEditSection

科目名 / 先生 / 教室 / 色 / totalSessions / note を編集できる。既存 `MeetingDetailSheet` / `MeetingCreateSheet` 等で使われているフィールド構成と同等。**API**: 既存の `PATCH /api/userTimetables/:id` (= `usePatchUserTimetable`) を使い、`courses[]` のうち該当 1 件を patch する。

##### 7.3.8.2 CourseSuspensionSection

ファイル: `apps/web/src/components/semester/CourseSuspensionSection.tsx`

```tsx
type Props = { courseId: string };

export function CourseSuspensionSection({ courseId }: Props) {
  const list = useCourseSuspensions(courseId);
  const create = useCreateCourseSuspension(courseId);
  const remove = useDeleteCourseSuspension(courseId);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  function handleAdd() {
    if (!date) return;
    create.mutate({ date, reason: reason || undefined }, {
      onSuccess: () => { setDate(""); setReason(""); },
    });
  }

  return (
    <section className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <h3 className="mb-3 text-base font-bold">休講日</h3>
      <ul className="space-y-2">
        {(list.data?.suspensions ?? []).map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-2xl bg-bg-muted/50 px-3 py-2">
            <span className="font-bold tabular-nums">{s.date}</span>
            <span className="flex-1 px-2 text-xs text-fg-tertiary truncate">{s.reason ?? ""}</span>
            <button
              type="button"
              onClick={() => remove.mutate(s.id)}
              className="grid h-8 w-8 place-items-center rounded-full text-status-absent hover:bg-status-absent/10"
              aria-label="休講日を削除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {(list.data?.suspensions ?? []).length === 0 ? (
          <li className="rounded-2xl bg-bg-muted/50 px-3 py-3 text-xs text-fg-tertiary">休講日はまだ登録されていません</li>
        ) : null}
      </ul>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="日付" className="flex-1">
          <Input type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        </Field>
        <Field label="理由 (任意)" className="flex-[2]">
          <Input value={reason} onChange={(e) => setReason(e.currentTarget.value)} placeholder="学園祭振替 等" maxLength={100} />
        </Field>
        <Button type="button" variant="primary" disabled={!date || create.isPending} onClick={handleAdd}>追加</Button>
      </div>
      {create.error ? (
        <p className="mt-2 rounded-2xl bg-status-absent/15 px-3 py-2 text-xs font-bold text-status-absent">{create.error.message}</p>
      ) : null}
    </section>
  );
}
```

**挙動仕様**:
- 一覧は date 昇順 (API 側で sort)
- date 形式は `YYYY-MM-DD` (`<input type="date">` の native 値)
- 削除は確認 dialog なし (rows 1-tap で trash)、誤操作 reversion は MVP 範囲外
- 同一日付重複 (DUPLICATE) は API が 409 を返し、UI が error 表示

##### 7.3.8.3 CourseOccurrenceHistory

```tsx
type Props = { courseId: string; semesterId: string | null };

export function CourseOccurrenceHistory({ courseId, semesterId }: Props) {
  const overview = useSemesterOverview(semesterId);
  const courseStat = overview.data?.courses.find((c) => c.courseId === courseId);
  // ... full occurrence list を出すなら別 endpoint が必要だが、v9 では courseStat.counts のみで簡略表示

  if (!courseStat) return null;
  return (
    <section className="rounded-3xl bg-bg-elevated p-5 shadow-card">
      <h3 className="mb-3 text-base font-bold">出席履歴</h3>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Stat label="出席" value={courseStat.counts.present} color="status-present" />
        <Stat label="欠席" value={courseStat.counts.absent} color="status-absent" />
        <Stat label="遅刻" value={courseStat.counts.tardy} color="status-tardy" />
        <Stat label="早退" value={courseStat.counts.earlyLeave} color="status-early" />
        <Stat label="公欠" value={courseStat.counts.excused} color="status-excused" />
        <Stat label="休講 (個別)" value={courseStat.counts.cancelled} color="status-cancelled" />
        <Stat label="休講 (一括)" value={courseStat.counts.suspended} color="status-cancelled" />
        <Stat label="未記録" value={courseStat.counts.unrecorded} color="fg-tertiary" />
      </div>
      <p className="mt-3 text-xs text-fg-tertiary tabular-nums">
        {courseStat.effectiveNumerator} / {courseStat.effectiveDenominator} = {courseStat.attendanceRate == null ? "—" : `${(courseStat.attendanceRate * 100).toFixed(1)}%`}
      </p>
    </section>
  );
}
```

##### 7.3.8.4 DangerZone

```tsx
function DangerZone({ courseId, onDeleted }: { courseId: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  // ...
  return (
    <section className="rounded-3xl border border-status-absent/30 bg-status-absent/5 p-5">
      <h3 className="mb-3 text-base font-bold text-status-absent">この科目を削除</h3>
      <p className="mb-3 text-xs text-fg-secondary">出席記録・休講日も全て削除されます。元に戻せません。</p>
      <Button type="button" variant="ghost" onClick={() => setConfirming(true)} className="text-status-absent">削除する</Button>
      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={async () => {
        // patch userTimetable で当該 course を courses[] から除外 (既存 usePatchUserTimetable)
        // onDeleted() で modal を閉じる
      }} ... />
    </section>
  );
}
```

API: 既存 `usePatchUserTimetable` で `courses[]` から当該 id を除外する PATCH を投げる。新規 endpoint は不要。

### 7.4 ルーム / 友達 タブ (既存維持)

`/rooms` / `/rooms/$id` / `/friends` / `/friends/add/$inviteCode` の挙動は**変更なし**。token (orange) に追従して色味だけ変わる。

唯一の変更: `/rooms/$id` (RoomDetail) のタブ切替 (calendar/timetable) は既存維持。ただし v9 では Home からも同 component を呼ぶので、`RoomCalendar` / `RoomTimetable` の external interface を変えない (= props は `roomId` のみ受ける現状を維持)。

### 7.5 設定タブ `/settings`

#### 7.5.1 ASCII モック (mobile)

```
┌──────────────────────────────────────┐
│ atender                              │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ ◯ Touri Aida                     │ │  ← プロフィール card
│ │   touri@example.com               │ │
│ │   @touri                          │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ アカウント                            │
├──────────────────────────────────────┤
│ プロフィール編集                   ›  │
│ 学校・学科                         ›  │
├──────────────────────────────────────┤
│ 出席                                  │
├──────────────────────────────────────┤
│ 出欠ルール                         ›  │
│ 学期管理                           ›  │
├──────────────────────────────────────┤
│ カレンダー連携                        │
├──────────────────────────────────────┤
│ Google Calendar 連携               ›  │
│ ICS 取り込み履歴                   ›  │
│ タイトル変換ルール                  ›  │
├──────────────────────────────────────┤
│ 表示                                  │
├──────────────────────────────────────┤
│ テーマ        [auto] [light] [dark]   │
├──────────────────────────────────────┤
│ その他                                │
├──────────────────────────────────────┤
│ ログアウト                          ›  │ (status-absent)
├──────────────────────────────────────┤
│  ホーム  学期  ルーム  友達  設定   │
└──────────────────────────────────────┘
```

#### 7.5.2 Settings.tsx 本体

ファイル: `apps/web/src/components/settings/Settings.tsx`

```tsx
export function Settings() {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<"profile" | "school" | "rules" | "semesters" | "google" | null>(null);
  const user = me.data?.user;

  async function signOut() {
    await api("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    await navigate({ to: "/signin" });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <ProfileCard user={user} />

      <SettingsSection title="アカウント">
        <SettingsRow label="プロフィール編集" onClick={() => setSheet("profile")} />
        <SettingsRow label="学校・学科" onClick={() => setSheet("school")} />
      </SettingsSection>

      <SettingsSection title="出席">
        <SettingsRow label="出欠ルール" onClick={() => setSheet("rules")} />
        <SettingsRow label="学期管理" onClick={() => setSheet("semesters")} />
      </SettingsSection>

      <SettingsSection title="カレンダー連携">
        <SettingsRow label="Google Calendar 連携" onClick={() => setSheet("google")} />
        <SettingsRow label="カレンダー設定 (ICS 等)" onClick={() => void navigate({ to: "/settings/calendar" })} />
      </SettingsSection>

      <SettingsSection title="表示">
        <ThemeRow />
      </SettingsSection>

      <SettingsSection title="その他">
        <SettingsRow label="ログアウト" danger onClick={() => void signOut()} />
      </SettingsSection>

      <ProfileEditSheet open={sheet === "profile"} onClose={() => setSheet(null)} />
      <SchoolDeptEditSheet open={sheet === "school"} onClose={() => setSheet(null)} />
      <AttendanceRuleSheet open={sheet === "rules"} onClose={() => setSheet(null)} />
      <SemesterListSheet open={sheet === "semesters"} onClose={() => setSheet(null)} />
      <BottomSheet open={sheet === "google"} onClose={() => setSheet(null)} title="Google Calendar 連携">
        <GoogleCalendarSection />
      </BottomSheet>
    </div>
  );
}
```

#### 7.5.3 SettingsSection / SettingsRow

ファイル: `apps/web/src/components/settings/SettingsSection.tsx`

```tsx
export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-fg-tertiary">{title}</h2>
      <div className="overflow-hidden rounded-3xl bg-bg-elevated shadow-card divide-y divide-border-subtle">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({ label, onClick, danger, trailing }: { label: string; onClick: () => void; danger?: boolean; trailing?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between px-5 py-4 text-left transition active:scale-[0.99] hover:bg-fg-primary/4 ${danger ? "text-status-absent" : "text-fg-primary"}`}
    >
      <span className="text-base font-bold">{label}</span>
      {trailing ?? <ChevronRight className="h-4 w-4 text-fg-tertiary" />}
    </button>
  );
}
```

#### 7.5.4 旧 AvatarMenu の sheet 群 (移植)

`ProfileEditSheet` / `SchoolDeptEditSheet` / `AttendanceRuleSheet` / `SemesterListSheet` / `GoogleCalendarSection` は **既存ファイルをそのまま再利用** する。`AvatarMenu.tsx` 自身は v9 で削除する (= Settings に移植が完了したら不要)。

**実装方針**: `ProfileEditSheet` を `Settings.tsx` 内に置くために、`AvatarMenu.tsx` から `ProfileEditSheet` 部分のコードを抽出して `apps/web/src/components/settings/ProfileEditSheet.tsx` に移す。v9 では新ファイルに移管 + `AvatarMenu.tsx` 削除。

#### 7.5.5 `/settings/calendar` route

既存 `routes/SettingsCalendar.tsx` は維持。Settings.tsx の「カレンダー設定 (ICS 等)」row からリンクされる。中身は ICS title rule editor + GoogleCalendarSection (= 既存 v8 のまま)。

`/settings/integrations/google` (Google linkSocial callback URL) も維持。

### 7.6 旧 Today / Timetable / Stats route の処理

#### 7.6.1 `/timetable` / `/stats` の削除

`router.tsx` から `timetableRoute` / `statsRoute` を削除し、代わりに redirect route を置く:

```ts
const timetableRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/timetable",
  beforeLoad: () => { throw redirect({ to: "/" }); },
});
const statsRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stats",
  beforeLoad: () => { throw redirect({ to: "/semester" }); },
});
```

ファイル `apps/web/src/routes/Timetable.tsx` / `apps/web/src/routes/Stats.tsx` は**削除しない** (= 内部ロジックを Home に移管した後でも、Today / Timetable は SelfTodayCTA / SelfTimetableView の実装ベースとして残す)。具体的には:
- `routes/Today.tsx` (`export { Today } from "@/components/today/Today";`) → **削除**
- `routes/Timetable.tsx` → **削除** (ロジックは `components/home/SelfTimetableView.tsx` に複製)
- `routes/Stats.tsx` → **削除**
- `components/today/Today.tsx` → **削除**
- `components/today/MainAttendanceCTA.tsx` → **存続** (Home の SelfTodayCTA から使う)
- `components/today/TimetableScroll.tsx` / `OccurrenceLyricCard.tsx` / `ReturnToNowFAB.tsx` → **存続** (SelfTodayCTA / Home から使う)
- `components/today/TodayGreeting.tsx` → **削除候補** (Home では Greeting を出さないため、v9 で表示しない方針)

**`TodayGreeting` を出さない理由**: Home は context 切替が前面の機能で、挨拶ヘッダで縦方向 space を食うとファーストビューで「自分の出席状況」が見えにくくなる。Touri ASCII でも greeting は無い。

#### 7.6.2 `routes/Home.tsx` の新規追加

```tsx
export { Home } from "@/components/home/Home";
```

`router.tsx`:

```ts
import { Home } from "@/routes/Home";
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient),
  component: Home,
});
```

#### 7.6.3 `routes/SemesterOverview.tsx`

```tsx
export { SemesterOverview } from "@/components/semester/SemesterOverview";
```

```ts
const semesterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/semester",
  beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient),
  component: SemesterOverview,
});
```

#### 7.6.4 `routes/Settings.tsx`

```tsx
export { Settings } from "@/components/settings/Settings";
```

```ts
const settingsRouteV9 = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  beforeLoad: ({ context }) => requireCompleteSetup(context.queryClient),
  component: Settings,
});
```

旧 `settingsRoute` (redirect to /) は **削除**。新 `/settings` は実体ページに昇格する。

#### 7.6.5 完全な route tree 差分

`router.tsx` の `routeTree` 差分:

旧 (16 route):
```
signInRoute, loginRoute, verifyRoute, setupRoute, meRoute,
settingsRoute (redirect /), settingsCalendarRoute, settingsGoogleIntegrationRoute,
homeRoute (Today), timetableRoute, templatesRoute, statsRoute,
roomsRoute, roomDetailRoute, roomJoinRoute,
friendsRoute, friendAddRoute,
```

新 (17 route):
```
signInRoute, loginRoute, verifyRoute, setupRoute,
meRoute (redirect to /settings),
settingsRouteV9 (= /settings、Settings),
settingsCalendarRoute, settingsGoogleIntegrationRoute,
homeRoute (= Home),
timetableRedirect (= /timetable -> /),
templatesRoute (維持),
statsRedirect (= /stats -> /semester),
semesterRoute (= /semester、SemesterOverview),
roomsRoute, roomDetailRoute, roomJoinRoute,
friendsRoute, friendAddRoute,
```

`meRoute` の redirect 先は **`/` から `/settings` に変更** (= v8 でアバターメニューを開く動線が `/me` 前提だったため、v9 で `/settings` に正規化)。

---

## §8 カラートークン詳細仕様 (orange 化、なぜ TimeTree 鮭色を採用しないか)

### 8.1 TimeTree 鮭色 (`#FF7B6B`) ではなく Tailwind `#F97316` を採用する根拠

| 観点 | TimeTree 鮭色 #FF7B6B | Tailwind orange-500 #F97316 |
|---|---|---|
| ブランド連想 | TimeTree | 中立 (Tailwind 既定) |
| 白文字コントラスト (on accent) | 3.21:1 (AA Large のみ) | 3.42:1 (AA Large のみ) |
| 黒文字コントラスト | 6.55:1 (AA pass) | 6.16:1 (AA pass) |
| 既存 status-absent (#FF5C7A) との混同 | 高 (両方ピンク寄り) | 低 (純オレンジで分離) |
| ダークモード bg #0B0E14 上 | 6.78:1 | 7.08:1 |
| Tailwind class 直書きで使える | 不可 (CSS var のみ) | 可 (`bg-orange-500` 等) |
| TimeTree 完コピ感 | 高 | 低 |

**結論**: `#F97316` を採用。理由 3 つ:
1. **status-absent (#FF5C7A)** とのコントラスト分離を優先 (鮭色だと両方ピンク帯で識別困難)
2. **Tailwind 純正値**で hard-coded grep / migration / 認識コストが低い
3. **TimeTree コピー感を避ける**: Atender は出欠ドメインの独自 UX なので、TimeTree 真似と取られないトーンが望ましい

ただし on-accent text のコントラストが border-line (3.42:1) なので、**white text on accent は font-weight ≥ 700 (bold) を強制** する。既存 Button.tsx は primary variant で `font-bold` なので追加対応不要。

### 8.2 token 完全一覧 (dark / light)

#### Dark mode (`:root`)

```
--color-accent-50:       rgba(249, 115, 22, 0.12)    # F97316 12% tint
--color-accent-100:      rgba(249, 115, 22, 0.20)
--color-accent-500:      #F97316                     # orange-500
--color-accent-600:      #FB923C                     # orange-400 (hover 明)
--color-accent-700:      #FDBA74                     # orange-300 (pressed 明)

--color-status-present:  #34D399                     # emerald-400 (dark で映える)
--color-status-absent:   #FF5C7A                     # 既存維持
--color-status-excused:  #5AA9FF                     # 既存維持
--color-status-tardy:    #FFC93C                     # 既存維持
--color-status-early:    #C685FF                     # 既存維持
--color-status-cancelled: rgba(255, 255, 255, 0.30)   # 既存維持
--color-status-none:     rgba(255, 255, 255, 0.18)    # 既存維持

--color-friendship-pending:  #FFC93C
--color-friendship-accepted: #34D399                  # status-present に追従
--color-friendship-blocked:  #FF5C7A
--color-room-event:          #C685FF
--color-room-availability-empty: rgba(249, 115, 22, 0.16)    # accent tint に追従

--color-text-on-accent: #FFFFFF                       # 白 (#F97316 上で 4.59:1 = AA pass on bold)

--shadow-glow:      0 0 24px rgba(249, 115, 22, 0.45), 0 0 48px rgba(249, 115, 22, 0.20)
--shadow-glow-soft: 0 0 16px rgba(249, 115, 22, 0.28)
```

#### Light mode (`@media (prefers-color-scheme: light) :root:not([data-theme="dark"])` and `:root[data-theme="light"]`)

```
--color-accent-50:       rgba(234, 88, 12, 0.10)     # EA580C 10% tint
--color-accent-100:      rgba(234, 88, 12, 0.18)
--color-accent-500:      #EA580C                      # orange-600 (white bg で 4.66:1 = AA)
--color-accent-600:      #C2410C                      # orange-700 (hover)
--color-accent-700:      #9A3412                      # orange-800 (pressed)

--color-status-present:  #059669                      # emerald-600 (既存維持)
--color-friendship-accepted: #059669
--color-room-availability-empty: rgba(234, 88, 12, 0.14)

--color-text-on-accent: #FFFFFF                       # #EA580C 上で 4.59:1 = AA pass
--shadow-glow:      0 0 20px rgba(234, 88, 12, 0.32)
--shadow-glow-soft: 0 0 12px rgba(234, 88, 12, 0.22)
```

### 8.3 status-present の色変更による視覚影響

#### Dark mode

旧 `#10EB99` (青寄り蛍光緑) → 新 `#34D399` (emerald-400、より中庸な緑)。
- accent (#F97316 orange) との色相距離: 旧 emerald は cyan 寄りで accent と co-existable、新 emerald-400 は素直な緑で orange とのコントラストが取れる
- WCAG 1.4.11 (UI element 隣接 3:1):
  - 旧 `#10EB99` vs accent `#10EB99` = 1:1 (= **完全に被って区別不能**)
  - 新 `#34D399` vs accent `#F97316` = 1.79:1 (近接時注意だが、両者が直接隣接する場面は少ない)
  - 新 `#34D399` vs bg `#0B0E14` = 8.95:1 (AAA pass)

#### Light mode

`#059669` (emerald-600) は維持。orange-600 accent (#EA580C) との色相距離 90° で identifiable。

### 8.4 影響を受ける既存 component (sweep 対象)

emerald token を参照している箇所:
- `BottomTab` active state (`bg-accent-500 text-fg-on-accent`) → orange 化
- `SideNav` active state (`bg-accent-50 text-accent-700`) → orange 化
- `MainAttendanceCTA` (`bg-accent-500`) → orange 化
- `Button variant="primary"` (`bg-accent-500`) → orange 化
- `OccurrenceLyricCard` PRESENT badge (`--color-status-present`) → emerald-400 (緑維持、色相微変)
- `RoomCalendar` AvailabilityBar PRESENT 色 → 同上
- `Stats` の出席率テキスト (削除予定) → -
- `AvatarMenu` 各種 (削除予定) → -
- `ThemeToggleRow` 選択 button → orange 化

**実装時のチェックリスト**:
- [ ] `styles.css` の `:root` / `@media light` / `[data-theme="light"]` 3 ブロックすべて更新
- [ ] hard-coded color の grep が 0 件
- [ ] dev サーバで `localhost:5173` の全画面を chrome-devtools MCP screenshot で確認 (詳細 §11.4)

---

## §9 API hooks 追加

ファイル: `apps/web/src/api/hooks/useCourseSuspensions.ts` (新規)

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { QK } from "@/api/queryKeys";
import type { CourseSuspensionDto, CourseSuspensionCreateInput } from "@atender/shared";

type ListRes = { suspensions: CourseSuspensionDto[] };
type CreateRes = { suspension: CourseSuspensionDto };

export function useCourseSuspensions(courseId: string | undefined) {
  return useQuery({
    queryKey: QK.courseSuspensions(courseId ?? ""),
    queryFn: () => api<ListRes>(`/api/courses/${courseId}/suspensions`),
    enabled: Boolean(courseId),
  });
}

export function useCreateCourseSuspension(courseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CourseSuspensionCreateInput) =>
      api<CreateRes>(`/api/courses/${courseId}/suspensions`, { method: "POST", body }),
    onSuccess: () => {
      if (!courseId) return;
      qc.invalidateQueries({ queryKey: QK.courseSuspensions(courseId) });
      qc.invalidateQueries({ queryKey: QK.semesterOverview() });   // 出席率に波及
      qc.invalidateQueries({ queryKey: QK.stats() });               // 互換のため
    },
  });
}

export function useDeleteCourseSuspension(courseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suspensionId: string) =>
      api<{ ok: true }>(`/api/courses/${courseId}/suspensions/${suspensionId}`, { method: "DELETE" }),
    onSuccess: () => {
      if (!courseId) return;
      qc.invalidateQueries({ queryKey: QK.courseSuspensions(courseId) });
      qc.invalidateQueries({ queryKey: QK.semesterOverview() });
      qc.invalidateQueries({ queryKey: QK.stats() });
    },
  });
}
```

ファイル: `apps/web/src/api/hooks/useSemesterOverview.ts` (新規)

```ts
export function useSemesterOverview(semesterId: string | null | undefined) {
  return useQuery({
    queryKey: QK.semesterOverview(semesterId ?? ""),
    queryFn: () => api<SemesterOverviewDto>(`/api/semesters/${semesterId}/overview`),
    enabled: Boolean(semesterId),
  });
}
```

### 9.1 `QK` (queryKeys) への追加

ファイル: `apps/web/src/api/queryKeys.ts` (現状 `index.ts` 内に存在の想定、Developer 側で適切な場所に追加):

```ts
export const QK = {
  // ... 既存 ...
  courseSuspensions: (courseId: string) => ["courses", courseId, "suspensions"] as const,
  semesterOverview: (semesterId?: string) => ["semesters", semesterId ?? "any", "overview"] as const,
  // ... 既存 ...
};
```

### 9.2 invalidation matrix

| Mutation | invalidate keys |
|---|---|
| `useCreateCourseSuspension` | `courseSuspensions(courseId)`, `semesterOverview(*)`, `stats(*)` |
| `useDeleteCourseSuspension` | 同上 |
| `usePatchUserTimetable` (既存) | 既存 + `semesterOverview(*)` 追加 (= courses 変更で stats 変わる) |
| `usePatchAttendance` (既存) | 既存 + `semesterOverview(*)` 追加 |
| `useMarkAllPresent` (既存) | 既存 + `semesterOverview(*)` 追加 |

`semesterOverview(*)` の wildcard 風 invalidate は実際には `queryKey: ["semesters"]` で予測される **prefix invalidate** (TanStack Query 仕様、queryKey の prefix match で全部消える)。

---

## §10 挙動仕様 (Reviewer がテスト生成するための網羅項目)

> Reviewer はこの §10 を根拠にテストを生成する。「○○のとき△△」形式で 25 項目。
> 「明示」: 設計 doc が指定したエラーコード/挙動。テストはそれと一致確認。

### A. ナビゲーション

**A1.** GIVEN 未認証ユーザーが `/` を訪問する WHEN beforeLoad が走る THEN `/signin` にリダイレクトされる
**A2.** GIVEN setup 未完了ユーザーが `/` を訪問する WHEN beforeLoad が走る THEN `/setup` にリダイレクトされる
**A3.** GIVEN 認証済 + setup 済ユーザーが `/` を訪問する WHEN コンポーネントが mount される THEN `<Home>` が描画される
**A4.** GIVEN 認証済ユーザーが `/timetable` を訪問する WHEN router が動く THEN `/` にリダイレクトされる (302/redirect)
**A5.** GIVEN 認証済ユーザーが `/stats` を訪問する WHEN router が動く THEN `/semester` にリダイレクトされる
**A6.** GIVEN 認証済ユーザーが `/me` を訪問する WHEN router が動く THEN `/settings` にリダイレクトされる
**A7.** GIVEN BottomTab を mount する WHEN keyboard が閉じている THEN 5 タブ (ホーム / 学期・科目 / ルーム / 友達 / 設定) が等幅で表示される
**A8.** GIVEN `<TopBar>` を mount する WHEN AvatarMenu が削除済 THEN TopBar 右上に AvatarMenu DOM が**存在しない** (querySelector で `aria-label="アカウントメニュー"` が `null`)

### B. ホーム画面

**B1.** GIVEN `<Home>` が mount される + `useRooms` が 2 件返す WHEN ContextChips が描画される THEN chip は「自分 / Room1 / Room2 / +」の 4 個になる (順序保証)
**B2.** GIVEN context = self + mode = timetable WHEN HomeBody が描画される THEN `<SelfTimetableView>` (= `<DayList>` または `<TimetableGrid>`) が DOM に存在する
**B3.** GIVEN context = self + mode = calendar WHEN HomeBody が描画される THEN `<PersonalCalendar>` が DOM に存在し、`<MainAttendanceCTA>` は**存在しない**
**B4.** GIVEN context = room + mode = timetable WHEN HomeBody が描画される THEN `<RoomTimetable>` が DOM に存在し、`<MainAttendanceCTA>` は**存在しない**
**B5.** GIVEN context = room + mode = calendar WHEN HomeBody が描画される THEN `<RoomCalendar>` が DOM に存在する
**B6.** GIVEN context = self + mode = timetable + occurrences が 0 件 WHEN HomeBody が描画される THEN `<EmptyState title="今日は授業がありません">` が出る (今日の occurrence が空の時)
**B7.** GIVEN HomeSemesterPicker をタップする WHEN sheet が開く THEN `useSemesters().data.semesters` の全件が list 表示される
**B8.** GIVEN ContextChips の 「+」 をタップする WHEN onAddRoom が走る THEN router が `/rooms` に遷移する

### C. 学期・科目タブ

**C1.** GIVEN `/semester` を mount + semesterId 未指定 WHEN overview が fetch される THEN `me.defaultSemesterId` をデフォルトに使う (= API 呼び出しが `/api/semesters/<defaultSemesterId>/overview`)
**C2.** GIVEN overview.data.overall.attendanceRate = 0.97 WHEN OverallRateCard が描画される THEN `<span>97</span>` が `tabular-nums` クラスで描画される
**C3.** GIVEN overview.data.overall.attendanceRate = null WHEN OverallRateCard が描画される THEN `<span>—</span>` が描画される
**C4.** GIVEN overview.data.days = [{date: "2026-04-01", status: "ALL_PRESENT", occurrenceCount: 3}] WHEN AttendanceCalendar が 2026-04 を anchor として描画される THEN そのセルに `○` (status-present 色) のマーカーが出る
**C5.** GIVEN overview.data.days = [{date: "2026-04-02", status: "ALL_SUSPENDED"}] WHEN AttendanceCalendar 描画 THEN セルに `／` (status-cancelled 色) が出る
**C6.** GIVEN overview.data.courses = [{courseName: "数学III", attendanceRate: 0.96, teacher: "田中先生"}] WHEN CourseListItem が描画される THEN tap で onClick が発火する + 表示は「数学III / 田中先生 / 96%」(96 は status-present 色)
**C7.** GIVEN CourseStatsDto.attendanceRate = 0.55 WHEN CourseListItem が描画される THEN 出席率テキストの色は `status-absent` 系
**C8.** GIVEN CourseListItem をタップする WHEN onClick が走る THEN openCourseId が set され、`<FullScreenModal open={true}>` が DOM に出る
**C9.** GIVEN FullScreenModal が open + Escape キー押下 WHEN keydown event THEN onClose が呼ばれる
**C10.** GIVEN FullScreenModal の右上 × をタップ WHEN クリック THEN onClose が呼ばれる
**C11.** GIVEN CourseSuspensionSection に既存 1 件 (date=2026-05-10) WHEN render THEN row に `2026-05-10` + trash ボタンが出る
**C12.** GIVEN CourseSuspensionSection で date="2026-05-15" を入力 + 追加ボタン押下 WHEN POST `/api/courses/:id/suspensions` が 201 で成功 THEN input が空にリセット + list に 2026-05-15 行が追加表示される
**C13.** GIVEN 同じ date を 2 度送信 WHEN API が 409 DUPLICATE を返す THEN error 表示 (status-absent 色の text)

### D. CourseSuspension API

**D1.** GIVEN POST `/api/courses/:id/suspensions` { date: "2026-05-10" } WHEN 認証済 + 自分の course THEN 201 + body `{ suspension: { id, courseId, date: "2026-05-10", reason: null, ... } }`
**D2.** GIVEN POST 同上、courseId が他人のもの WHEN 認証済 THEN 404 NOT_FOUND
**D3.** GIVEN POST 同じ date を 2 回 WHEN 2 回目 THEN 409 DUPLICATE
**D4.** GIVEN POST date 形式不正 ("2026/05/10") WHEN zValidator が走る THEN 400 VALIDATION_ERROR
**D5.** GIVEN GET `/api/courses/:id/suspensions` WHEN 認証済 + 自分の course THEN 200 + body `{ suspensions: [...] }` で date 昇順
**D6.** GIVEN DELETE `/api/courses/:id/suspensions/:sid` WHEN 認証済 + 自分の course + 存在する suspension THEN 200 + body `{ ok: true }` + DB から消える
**D7.** GIVEN DELETE 同上、suspension id が存在しない WHEN THEN 404 NOT_FOUND
**D8.** GIVEN Course を削除 WHEN cascade THEN 紐づく CourseSuspension が全削除される

### E. semesterOverview API + 出席率算出

**E1.** GIVEN GET `/api/semesters/:id/overview` WHEN 認証済 + 自分の semester THEN 200 + body 型が `SemesterOverviewDto` (semesterId / semesterName / startDate / endDate / overall / days / courses)
**E2.** GIVEN 1 course / totalSessions=15 / 出席=14, 欠席=1 / suspension=なし WHEN computeCourseStats THEN counts.present=14, counts.absent=1, counts.suspended=0, effectiveNumerator=14, effectiveDenominator=15, attendanceRate=14/15≈0.933
**E3.** GIVEN 1 course / totalSessions=15 / 出席=12, 欠席=1, suspension=2 (= 2 件の CourseSuspension が occurrence date と一致) WHEN computeCourseStats THEN counts.suspended=2, denominatorReduction=2 (suspension のみで), effectiveDenominator=15-2=13, numerator=12, attendanceRate=12/13≈0.923
**E4.** GIVEN 同じ occurrence date に CourseSuspension が**存在し** + AttendanceRecord(status=PRESENT)も**存在する** WHEN computeCourseStats THEN CourseSuspension が優先される (= counts.suspended +1, counts.present +0, denominatorReduction +1)
**E5.** GIVEN overall = 全 courses の sum WHEN overview WHEN 全 courses の effectiveNumerator/effectiveDenominator の合算が overall に出る
**E6.** GIVEN 学期に course 0 件 WHEN overview THEN overall.attendanceRate = null + courses = [] + days = [全日 NO_CLASS]
**E7.** GIVEN GET overview を他人の semesterId に対して WHEN THEN 404 NOT_FOUND

### F. カラートークン

**F1.** GIVEN dark mode WHEN `:root` を JSDOM で computedStyle 取得 THEN `--color-accent-500` = `#F97316`
**F2.** GIVEN light mode (`[data-theme="light"]`) WHEN `:root` の computedStyle THEN `--color-accent-500` = `#EA580C`
**F3.** GIVEN dark mode WHEN `--color-status-present` THEN `#34D399` (emerald-400)
**F4.** GIVEN dark mode WHEN `--shadow-glow` THEN orange (= `rgba(249, 115, 22, ...)`) を含む
**F5.** GIVEN ソースコードで `grep -E "#10EB99|#059669"` WHEN apps/web/src 配下を走査 THEN ヒット 0 件 (= 全 token 経由)

### G. 設定タブ

**G1.** GIVEN `/settings` を mount WHEN コンポーネント描画 THEN プロフィールカード + 5 section (アカウント / 出席 / カレンダー連携 / 表示 / その他) が出る
**G2.** GIVEN 「プロフィール編集」row をタップ WHEN onClick THEN `<ProfileEditSheet open={true}>` が出る
**G3.** GIVEN 「ログアウト」row をタップ WHEN onClick THEN `POST /api/auth/sign-out` が呼ばれ、queryClient.clear() + navigate("/signin")
**G4.** GIVEN ThemeRow で「ライト」を選択 WHEN onClick THEN `useTheme().setTheme("light")` が呼ばれる
**G5.** GIVEN `/settings/calendar` を訪問 WHEN 認証済 THEN `<SettingsCalendar>` (既存) が描画される (= 旧挙動維持)

### H. 既存機能の非破壊性

**H1.** GIVEN `/rooms/$id` を訪問 WHEN RoomDetail が描画される THEN RoomCalendar / RoomTimetable のセグメント切替が動く (= v6 機能維持)
**H2.** GIVEN `/friends/add/$inviteCode` を訪問 WHEN AddFriendByInviteCode が描画される THEN v6 挙動維持
**H3.** GIVEN POST `/api/me/google-calendar/link/complete` WHEN v8 のロジック呼び出し THEN 201 で connection が作成される (= v8 機能維持)
**H4.** GIVEN POST `/api/rooms/:id/google-calendar-syncs` で sync 作成 WHEN v8 ロジック THEN sync 行 + 初回 sync 実行 (= v8 機能維持)

---

## §11 テスト基盤

### 11.1 フレームワーク

| レイヤ | フレームワーク | テスト配置 |
|---|---|---|
| API (Hono routes / services) | Vitest 1.6.x + `app.request()` | `apps/api/tests/*.test.ts` |
| Frontend (React component) | Vitest + Testing Library + jsdom 25.x | `apps/web/tests/*.test.tsx` |
| Token (CSS computed) | Vitest + jsdom + `getComputedStyle` | `apps/web/tests/styles.test.ts` |
| E2E (optional, Reviewer 判断) | Vitest + chrome-devtools MCP | `apps/web/tests/e2e/*.test.ts` |

### 11.2 必要な test helper / fixture

- `apps/api/tests/helpers/auth.ts` 既存: better-auth signed cookie 形式のテスト session を生成
- `apps/api/tests/helpers/db.ts` 既存: 各テスト前に `prisma migrate deploy` + truncate
- `apps/web/tests/helpers/router.tsx` 既存: memoryHistory で TanStack Router を立ち上げる
- `apps/web/tests/helpers/queryClient.ts` 既存: 各テスト独立の QueryClient
- 新規 `apps/web/tests/helpers/factories.ts`: `makeSuspension({...})`, `makeOverviewDto({...})`, `makeCourseStatsDto({...})` (`@atender/shared` の zod schema で parse する fixture factory)

### 11.3 app export path (Reviewer 必読)

API テストは `app` を import する。`apps/api/src/index.ts` から `export const app = new Hono()` されている。テスト helper の import 経路は:

```ts
import { app } from "@/index";   // tsconfig.base.json の paths "@/*" → "apps/api/src/*"
```

これは v8 までと同じ。**v9 で route 追加した分は `index.ts` の `registerCourseRoutes` / `registerSemesterRoutes` 内に閉じるので、`index.ts` 自身の export 変更なし**。

### 11.4 Frontend E2E (token 確認 + 全画面スクショ)

Reviewer は MVP 範囲では E2E 必須ではないが、token 移行 (orange 化) の影響範囲を見るため、以下のシナリオを chrome-devtools MCP で 1 セッション走らせる:

1. dev サーバ起動 (`pnpm --filter @atender/web dev`)
2. `chrome-devtools.navigate("http://localhost:5173/")`
3. 認証 cookie を seed (Reviewer 既存 helper)
4. `/`, `/semester`, `/rooms`, `/friends`, `/settings` 各画面に navigate
5. `screenshot()` を 5 枚撮る
6. dark/light 両方 (`[data-theme="dark"]` / `[data-theme="light"]`) で計 10 枚

スクショは failed assertion ではなく目視確認用。Reviewer 判定としては GREEN 条件に含めない。

### 11.5 テストデータ規約

- semester 期間 = `2026-04-01 ~ 2026-09-30` (= 前期) を fixture デフォルトに
- course = `数学III / 田中先生 / totalSessions=15`
- meeting = `dayOfWeek=1 (月) / startPeriodIndex=1 / periodCount=1` で固定
- occurrence は generateOccurrencesForMeetings で自動生成 (前期で 25 回程度)
- attendance record は 14 件 PRESENT、CourseSuspension 0 件をデフォルトに

---

## §12 不採用案

### A. TimeTree 鮭色 (`#FF7B6B`) を採用しなかった理由

→ §8.1 参照。要約: status-absent (#FF5C7A) との混同回避、Tailwind 純正トークン優先、TimeTree コピー感回避。

### B. context chip を「全部」「自分」「Room×」の 3 段にする案 (TimeTree 完コピ)

TimeTree は「すべて / 個人 / グループ」の縦 3 階層。Atender は出欠ドメインなので「すべて」(= 自分 + 全 Room を merge) を出す意味が薄い (= 出席率はあくまで自分単位)。**「自分 + 個別 Room」の 2 階層に簡略化**。

### C. ホームから「予定追加」CTA を出す案

PersonalCalendar 上で予定追加できると便利だが、Atender の予定は **時間割の Course/Meeting** か **Room の RoomEvent** で完結している。個人カレンダーは「結果の可視化」専用、作成は時間割 / ルーム経由で十分。混乱を避けるため**予定追加 CTA は Home に出さない**。

### D. CourseSuspension を `MeetingOccurrence.isSuspended: Boolean` で表現する案

理屈は通るが、(1) `MeetingOccurrence` は generate ロジックで毎回作り直されるため、isSuspended を保持しても再生成で消える、(2) 一括登録 (科目 × 日付) の自然な表現は別 table の方が綺麗。**新 table を採用**。

### E. `/semester` を Home の「自分 / 統計」モードとして統合する案

Touri ASCII で「学期・科目」を**独立タブ**として明示。理由 (推定): 全体出席率は context 切替の中に埋もれると見つけにくい (= 学業統計は Home 機能の subset ではなく上位機能)。**5 タブ独立で採用**。

### F. AvatarMenu を「BottomTab + Settings タブ」に分割する案 (今回採用)

旧 AvatarMenu は右上アバター → dropdown / sheet で 8 項目を出していた。タブにすると常時 5 タブの 1 つを占有する代わり、発見性 + サブ階層整理ができる。Touri の指示通り**設定タブに統合**。

### G. CourseSuspension を Room 配下にも持つ案 (RoomEvent suspension)

RoomEvent (= Room の単発予定) には「休講」概念は不要 (= 単発予定の cancel は RoomEvent 削除で済む)。CourseSuspension は **時間割の Course だけ**の概念。Room 側に持ち込まない。

### H. `routes/Today.tsx` を残して Home から呼び出す案

可能だが、Today 画面が独立 page として直接遷移できる経路が無くなる (BottomTab には載らない) ので、URL から file まで dead 化する。**Today.tsx は削除、ロジックは Home 配下に移管**して名前空間を整理する。

### I. 全体出席率を accent (orange) で出す案

§7.3.4 で「全体出席率は status-present (緑)」を採用。Touri ASCII では数字が大きく出ているだけで色指定なし。出席率の「肯定値」感を出すため緑が直感的。orange は CTA に専用。

### J. AttendanceCalendar に色塗りベタ (セル背景全塗り) を採用する案

color block で全塗りすると一覧性は上がるが、(1) 月の前後 (faded) との重なりでカラフルになりすぎ、(2) 色覚多様性配慮で記号 (○/×/△/／) を足す必要がある。**マーカー (記号 + 色) のみで実装**、セル背景は border-subtle 維持。

---

## §13 MVP スコープ (Phase 1 で全部やる)

Touri 指示通り Phase 2 送りなし。以下を **1 リリース** で実装する:

### Backend
- [ ] `CourseSuspension` model + migration
- [ ] `courseSuspension.service.ts` 新規
- [ ] `attendanceStats.computeCourseStats` 改修 (suspension を分母から除外)
- [ ] `semesterOverview.service.ts` 新規
- [ ] `GET/POST/DELETE /api/courses/:courseId/suspensions` ハンドラ
- [ ] `GET /api/semesters/:id/overview` ハンドラ

### Shared
- [ ] `CourseSuspensionDto` / `CourseSuspensionCreateInput`
- [ ] `CourseStatsDto.counts.suspended` 追加
- [ ] `CourseStatsDto.teacher` 追加 (UI 用)
- [ ] `AttendanceDaySummary` / `SemesterOverviewDto`

### Frontend
- [ ] `navItems.ts` 5 タブ書き換え
- [ ] `TopBar.tsx` から AvatarMenu 削除 (+ trailing slot 化)
- [ ] `router.tsx` route tree 再編 (Home / SemesterOverview / Settings 新規 + Timetable/Stats redirect)
- [ ] `Home.tsx` + `ContextChips.tsx` + `HomeViewModeTabs.tsx` + `HomeSemesterPicker.tsx` + `HomeBody.tsx` + `PersonalCalendar.tsx` + `SelfTimetableView.tsx` + `SelfTodayCTA.tsx`
- [ ] `SemesterOverview.tsx` + `AttendanceCalendar.tsx` + `OverallRateCard.tsx` + `CourseListItem.tsx` + `CourseDetailModal.tsx` + `CourseSuspensionSection.tsx` + `CourseOccurrenceHistory.tsx` + `DangerZone.tsx`
- [ ] `Settings.tsx` + `SettingsSection.tsx` + (旧 AvatarMenu の sheet 群移植)
- [ ] `FullScreenModal.tsx` 新規 UI primitive
- [ ] `useCourseSuspensions` / `useSemesterOverview` hooks + queryKey 追加
- [ ] `styles.css` token 全面置換 (emerald → orange、status-present 緑系維持)
- [ ] 旧ファイル削除: `routes/Today.tsx` / `routes/Timetable.tsx` / `routes/Stats.tsx` / `components/today/Today.tsx` / `components/today/TodayGreeting.tsx` / `components/avatar/AvatarMenu.tsx`
- [ ] hard-coded emerald 値の sweep (grep 0 件)

### Tests (Reviewer 担当、Architect は仕様提供)
- [ ] §10 の A-H 全項目に対するテスト生成 (25 項目以上)
- [ ] 既存 v6/v7/v8 のテストが GREEN を維持

### Knowledge (Architect 追加)
- [ ] `Muraki/knowledge/pattern/home-aggregated-context-switcher.md` (TimeTree 風 context chip + mode tab パターン)
- [ ] `Muraki/knowledge/pattern/course-suspension-denominator-reduction.md` (休講日を分母から除外する標準パターン)
- [ ] INDEX 再生成: `python3 Muraki/scripts/gen-knowledge-index.py`

---

## §14 実装順 (Developer 向け推奨)

1. **Prisma schema + migration** (`CourseSuspension`) — 5 分
2. **Shared zod** (`CourseSuspensionDto` / `CourseStatsDto.suspended/teacher` / `AttendanceDaySummary` / `SemesterOverviewDto`) — 10 分
3. **Backend services** (`courseSuspension.service` + `attendanceStats` 改修 + `semesterOverview.service`) — 30 分
4. **Backend routes** (courses suspension CRUD + semesters/:id/overview) — 15 分
5. **Frontend hooks** (`useCourseSuspensions` + `useSemesterOverview` + queryKey) — 15 分
6. **styles.css token 置換** — 10 分
7. **navItems.ts + router.tsx + TopBar.tsx** — 20 分
8. **Home 画面群** (ContextChips/Tabs/SemesterPicker/Body/PersonalCalendar/SelfTimetableView/SelfTodayCTA) — 90 分
9. **SemesterOverview 画面群** (OverallRateCard/AttendanceCalendar/CourseListItem/CourseDetailModal + Suspension Section + OccurrenceHistory + DangerZone) — 90 分
10. **Settings 画面群** (Settings/SettingsSection/SettingsRow + sheet 群移植) — 45 分
11. **FullScreenModal** UI primitive — 15 分
12. **旧ファイル削除** + hard-coded emerald sweep — 10 分
13. **dev サーバで全画面目視** (chrome-devtools MCP screenshot 10 枚) — 10 分

合計 5-6 時間程度を想定 (Codex で実装、Reviewer テスト生成は別 1-2 時間)。

---

## §15 参考: 各 component の責務サマリ

| Component | 責務 | 行数感 |
|---|---|---|
| `Home.tsx` | context/mode/semesterId の state + child の組み立て | ~60 |
| `ContextChips.tsx` | horizontal scroll の chip list + active 表示 | ~70 |
| `HomeViewModeTabs.tsx` | 2-segment tab | ~30 |
| `HomeSemesterPicker.tsx` | 学期選択 BottomSheet trigger | ~50 |
| `HomeBody.tsx` | context×mode の switch (4 branch) | ~30 |
| `PersonalCalendar.tsx` | overview.days を CalendarEvent に変換 + 月/週/日 viewMode | ~120 |
| `SelfTimetableView.tsx` | 旧 Timetable.tsx の移植 | ~150 |
| `SelfTodayCTA.tsx` | useTodayOccurrences + MainAttendanceCTA wrapper | ~50 |
| `SemesterOverview.tsx` | overview fetch + 3 section の組み立て | ~80 |
| `OverallRateCard.tsx` | 全体出席率の大数字表示 | ~30 |
| `AttendanceCalendar.tsx` | 月単位 7x6 grid + マーカー描画 + ‹/› 月送り | ~120 |
| `CourseListItem.tsx` | 科目名 + 先生 + 出席率カード | ~50 |
| `CourseDetailModal.tsx` | FullScreenModal で 4 section を縦に | ~30 |
| `CourseSuspensionSection.tsx` | 休講日 list + 追加フォーム | ~90 |
| `CourseOccurrenceHistory.tsx` | counts grid 表示 | ~50 |
| `Settings.tsx` | 5 section + sheet 開閉 state | ~80 |
| `SettingsSection.tsx` + `SettingsRow.tsx` | wrapper 2 つ | ~30 |
| `FullScreenModal.tsx` | full screen portal modal | ~60 |

合計新規行数: ~1200 行 (移植分を除く)。

---

## §16 design doc の自己チェック

- [x] 目的・主要設計判断・スコープ外を明示
- [x] UI/UX を mobile + PC 両方 ASCII で表現
- [x] Prisma schema delta + migration SQL を 1 ファイル分明示
- [x] API endpoint を method + path + status + body 形式で網羅
- [x] エラー code を明示 (NOT_FOUND / DUPLICATE / VALIDATION_ERROR)
- [x] 挙動仕様 25 項目以上 (Reviewer がテスト生成可能な粒度)
- [x] テスト基盤 (Vitest + jsdom + chrome-devtools MCP)
- [x] 不採用案 10 個 (検討ループ防止)
- [x] MVP スコープ (Phase 1 で全部やる、Phase 2 送りなし)
- [x] 既存機能の非破壊性を明文化 (§10 H)
- [x] 「実装側で判断」「適宜」「必要に応じて」のような曖昧表現を含まない
- [x] 既存 component の再利用方針を明示 (RoomCalendar / RoomTimetable / DayList / TimetableGrid / MainAttendanceCTA / CalendarMonth-Week-Day)
- [x] color トークンの全置換 (emerald → orange) の具体値を提示
- [x] knowledge 追加 2 件を §13 に明記

設計完了。Developer はこの doc のみを根拠に v9 を実装可能。Reviewer は §10 を根拠にテストを生成可能。
